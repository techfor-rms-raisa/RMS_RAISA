/**
 * api/linkedin/importar.ts
 * 
 * Endpoint para receber dados do LinkedIn (via extensão Chrome)
 * e salvar diretamente na tabela PESSOAS (Banco de Talentos)
 * 
 * 🆕 v57.11: CORREÇÃO COMPLETA DE EXPERIÊNCIAS
 * - Agora recebe data_inicio e data_fim parseados da extensão
 * - Salva descrição das experiências
 * - Fallback: parseia período se datas não vierem
 * 
 * Histórico:
 * - v57.0: Removida validação obrigatória de analista_id
 * - v57.4: Padronização de skills
 * - v57.5: Extração de Skills via IA (Gemini)
 * - v57.6: Correção do SDK Gemini
 * - v57.8: Limitar campos a 200 chars
 * - v57.9: Filtrar skills inválidas
 * - v57.10: Truncar TODOS os campos texto
 * - v57.11: Processar datas e descrição de experiências
 * 
 * Data: 27/01/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// ============================================
// CONFIGURAÇÃO GEMINI - Lazy Initialization
// ============================================

const GEMINI_MODEL = 'gemini-2.0-flash';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    
    if (!apiKey) {
      console.error('❌ API_KEY (Gemini) não encontrada!');
      throw new Error('API_KEY não configurada.');
    }
    
    console.log('✅ API_KEY carregada para LinkedIn Import v57.11');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ============================================
// SUPABASE ADMIN CLIENT
// ============================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// ============================================
// 🆕 v57.11: Interface atualizada com datas
// ============================================

interface LinkedInData {
  nome: string;
  headline?: string;
  localizacao?: string;
  linkedin_url?: string;
  email?: string;
  telefone?: string;
  resumo?: string;
  experiencias?: Array<{
    empresa: string;
    cargo: string;
    periodo: string;
    data_inicio?: string | null;  // 🆕 v57.11
    data_fim?: string | null;     // 🆕 v57.11
    descricao?: string;
    atual?: boolean;
  }>;
  formacoes?: Array<{
    instituicao: string;
    curso: string;
    grau?: string;
    periodo?: string;
  }>;
  skills?: string[];
  certificacoes?: string[];
  idiomas?: Array<{ idioma: string; nivel: string }>;
  analista_id?: number;
}

// ============================================
// 🆕 v57.11: PARSER DE PERÍODO (FALLBACK)
// ============================================

/**
 * Parseia período do LinkedIn para extrair datas
 * Usado como fallback quando a extensão não envia datas parseadas
 */
function parsePeriodo(periodo: string | undefined): { 
  data_inicio: string | null; 
  data_fim: string | null; 
  atual: boolean; 
} {
  if (!periodo) return { data_inicio: null, data_fim: null, atual: false };
  
  const meses: Record<string, string> = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
    'feb': '02', 'apr': '04', 'may': '05', 'aug': '08', 'sep': '09', 'oct': '10', 'dec': '12'
  };
  
  // Limpar período - remover duração (depois do ·)
  const periodoLimpo = periodo.split('·')[0].trim();
  
  // Verificar se é atual
  const atual = /atual|present|momento|current/i.test(periodo);
  
  // Regex para extrair datas
  const regex = /(\w{3})\.?\s*(?:de\s+)?(\d{4})\s*[-–]\s*(?:(\w{3})\.?\s*(?:de\s+)?(\d{4})|o momento|presente|atual|present|current)?/i;
  const match = periodoLimpo.match(regex);
  
  let data_inicio: string | null = null;
  let data_fim: string | null = null;
  
  if (match) {
    const mesInicio = meses[match[1].toLowerCase().substring(0, 3)] || '01';
    const anoInicio = match[2];
    data_inicio = `${anoInicio}-${mesInicio}-01`;
    
    if (match[3] && match[4]) {
      const mesFim = meses[match[3].toLowerCase().substring(0, 3)] || '12';
      const anoFim = match[4];
      data_fim = `${anoFim}-${mesFim}-01`;
    }
  } else {
    // Tentar formato apenas anos: "2020 - 2022"
    const regexAnos = /(\d{4})\s*[-–]\s*(\d{4}|atual|presente|present)?/i;
    const matchAnos = periodoLimpo.match(regexAnos);
    
    if (matchAnos) {
      data_inicio = `${matchAnos[1]}-01-01`;
      if (matchAnos[2] && /\d{4}/.test(matchAnos[2])) {
        data_fim = `${matchAnos[2]}-12-01`;
      }
    }
  }
  
  console.log(`   📅 Período parseado: "${periodo}" → inicio: ${data_inicio}, fim: ${data_fim}, atual: ${atual}`);
  
  return { data_inicio, data_fim, atual };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function calcularAnosExperiencia(experiencias?: LinkedInData['experiencias']): number {
  if (!experiencias || experiencias.length === 0) return 0;
  
  let totalMeses = 0;
  const hoje = new Date();
  
  for (const exp of experiencias) {
    // Usar datas parseadas se disponíveis
    if (exp.data_inicio) {
      const inicio = new Date(exp.data_inicio);
      const fim = exp.data_fim ? new Date(exp.data_fim) : hoje;
      totalMeses += Math.max(0, (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()));
    } else if (exp.periodo) {
      // Fallback: extrair do texto do período
      const match = exp.periodo.match(/(\d+)\s*anos?/i);
      if (match) totalMeses += parseInt(match[1]) * 12;
      
      const matchMeses = exp.periodo.match(/(\d+)\s*mes(?:es)?/i);
      if (matchMeses) totalMeses += parseInt(matchMeses[1]);
    }
  }
  
  return Math.round(totalMeses / 12);
}

function estimarSenioridade(anosExperiencia: number): string {
  if (anosExperiencia >= 10) return 'especialista';
  if (anosExperiencia >= 6) return 'senior';
  if (anosExperiencia >= 3) return 'pleno';
  return 'junior';
}

function parseLocalizacao(localizacao: string): { cidade: string; estado: string } {
  if (!localizacao) return { cidade: '', estado: '' };
  
  const parts = localizacao.split(',').map(p => p.trim());
  
  if (parts.length >= 2) {
    return { cidade: parts[0], estado: parts[1] };
  }
  
  return { cidade: parts[0] || '', estado: '' };
}

function categorizarSkill(skill: string): string {
  const skillLower = skill.toLowerCase();
  
  // SAP
  if (/sap|abap|fiori|hana|s\/4|ecc|bw|bi|bpc|ariba|successfactor/i.test(skillLower)) {
    return 'sap';
  }
  
  // Frontend
  if (/react|angular|vue|javascript|typescript|html|css|sass|tailwind|next|nuxt|svelte|jquery/i.test(skillLower)) {
    return 'frontend';
  }
  
  // Backend
  if (/node|python|java|c#|\.net|php|ruby|go|rust|spring|django|fastapi|express|nest/i.test(skillLower)) {
    return 'backend';
  }
  
  // Database
  if (/sql|postgres|mysql|mongodb|redis|oracle|firebase|dynamo|cassandra|elastic/i.test(skillLower)) {
    return 'database';
  }
  
  // DevOps/Cloud
  if (/docker|kubernetes|aws|azure|gcp|ci\/cd|jenkins|terraform|ansible|linux|devops/i.test(skillLower)) {
    return 'devops';
  }
  
  // Cloud específico
  if (/cloud|multicloud|aws|azure|gcp/i.test(skillLower)) {
    return 'cloud';
  }
  
  // Mobile
  if (/android|ios|swift|kotlin|flutter|react native|mobile/i.test(skillLower)) {
    return 'mobile';
  }
  
  // Data
  if (/machine learning|ml|data science|pandas|tensorflow|pytorch|ia|ai|llm|rag|big data/i.test(skillLower)) {
    return 'data';
  }
  
  // Soft Skills
  if (/scrum|kanban|agile|gestão|liderança|comunicação|negociação|teamwork|management/i.test(skillLower)) {
    return 'soft_skill';
  }
  
  // Tools
  if (/git|jira|confluence|figma|postman|vscode|slack|teams/i.test(skillLower)) {
    return 'tool';
  }
  
  // Methodology
  if (/tdd|ddd|solid|clean|design pattern|microservice|rest|graphql/i.test(skillLower)) {
    return 'methodology';
  }
  
  return 'outro';
}

// ============================================
// FUNÇÃO: Extrair Skills do Headline
// ============================================

function extrairSkillsDoHeadline(headline: string): string[] {
  if (!headline) return [];
  
  const skillsConhecidas = [
    'PHP', 'Java', 'Python', 'C#', '.NET', 'Node', 'Node.js', 'NodeJS',
    'Ruby', 'Go', 'Golang', 'Rust', 'Spring', 'Laravel', 'Django', 'FastAPI',
    'Express', 'NestJS',
    'React', 'React.js', 'ReactJS', 'Vue', 'Vue.js', 'VueJS',
    'Angular', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Tailwind',
    'Next.js', 'NextJS', 'Nuxt', 'Nuxt.js',
    'React Native', 'Flutter', 'Swift', 'Kotlin', 'Android', 'iOS',
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Oracle', 'Firebase',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'Jenkins', 'Git',
    'Linux', 'Terraform',
    'Scrum', 'Kanban', 'Agile', 'Clean Code', 'Clean Architecture', 'SOLID',
    'TDD', 'DDD', 'Design Patterns',
    'SAP', 'ABAP', 'Fiori', 'HANA', 'S/4HANA', 'BW', 'BI', 'BPC'
  ];
  
  const skillsEncontradas: string[] = [];
  
  for (const skill of skillsConhecidas) {
    const regex = new RegExp(`(^|[\\s|,./\\-])${skill.replace(/[.+]/g, '\\$&')}([\\s|,./\\-]|$)`, 'i');
    if (regex.test(headline)) {
      skillsEncontradas.push(skill);
    }
  }
  
  return skillsEncontradas;
}

// ============================================
// FUNÇÃO: Extrair Skills via IA (Gemini)
// ============================================

async function extrairSkillsComIA(
  resumo?: string,
  experiencias?: LinkedInData['experiencias'],
  headline?: string
): Promise<string[]> {
  try {
    // Montar texto para análise
    let textoParaAnalise = '';
    
    if (headline) {
      textoParaAnalise += `Título: ${headline}\n\n`;
    }
    
    if (resumo) {
      textoParaAnalise += `Resumo: ${resumo}\n\n`;
    }
    
    if (experiencias && experiencias.length > 0) {
      textoParaAnalise += 'Experiências:\n';
      for (const exp of experiencias.slice(0, 5)) {
        textoParaAnalise += `- ${exp.cargo} na ${exp.empresa}`;
        if (exp.descricao) {
          textoParaAnalise += `: ${exp.descricao.substring(0, 500)}`;
        }
        textoParaAnalise += '\n';
      }
    }
    
    if (textoParaAnalise.length < 50) {
      console.log('⚠️ Texto muito curto para análise de IA');
      return [];
    }
    
    const ai = getAI();
    
    const prompt = `Analise o perfil profissional abaixo e extraia APENAS as skills técnicas e de negócio mencionadas ou claramente implícitas.

REGRAS:
- Liste entre 5 e 20 skills
- Skills devem ser termos técnicos específicos (tecnologias, ferramentas, metodologias)
- NÃO inclua descrições ou frases
- Cada skill deve ter no máximo 40 caracteres
- Retorne um JSON array de strings

PERFIL:
${textoParaAnalise}

RESPOSTA (apenas JSON array):`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });
    
    const textoResposta = response.text || '';
    
    // Tentar parsear JSON
    let skills: string[] = [];
    
    // Buscar array JSON na resposta
    const jsonMatch = textoResposta.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        skills = JSON.parse(jsonMatch[0]);
      } catch {
        // Se falhar, tentar extrair skills por regex
        const skillMatches = textoResposta.match(/"([^"]+)"/g);
        if (skillMatches) {
          skills = skillMatches.map(s => s.replace(/"/g, ''));
        }
      }
    } else {
      // Fallback: tentar extrair skills por regex
      const skillMatches = textoResposta.match(/"([^"]+)"/g);
      if (skillMatches) {
        skills = skillMatches.map(s => s.replace(/"/g, ''));
      }
    }
    
    // Filtrar e limpar skills
    skills = skills
      .filter(s => typeof s === 'string' && s.length > 1 && s.length < 80)
      .map(s => s.trim())
      .filter(s => !s.match(/^(e|ou|de|da|do|para|com|em|o|a|os|as)$/i));
    
    console.log(`✅ Gemini extraiu ${skills.length} skills:`, skills.slice(0, 10));
    
    return skills;
    
  } catch (error: any) {
    console.error('❌ Erro ao extrair skills via IA:', error.message);
    return [];
  }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const data: LinkedInData = req.body;

    console.log('📥 Recebendo dados do LinkedIn v57.11:', data.nome);

    if (!data.nome) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nome é obrigatório' 
      });
    }

    const analistaId = data.analista_id || null;

    // Buscar configuração de exclusividade
    const { data: configExclusividade } = await supabase
      .from('config_exclusividade')
      .select('*')
      .eq('ativa', true)
      .single();

    const periodoExclusividade = configExclusividade?.periodo_exclusividade_default || 60;
    const maxRenovacoes = configExclusividade?.max_renovacoes || 2;

    // Calcular dados derivados
    const anosExperiencia = calcularAnosExperiencia(data.experiencias);
    const senioridade = estimarSenioridade(anosExperiencia);
    const { cidade, estado } = parseLocalizacao(data.localizacao || '');
    
    const ultimaExp = data.experiencias?.[0];
    const ultimoCargo = ultimaExp?.cargo || data.headline || '';

    const dataInicio = analistaId ? new Date() : null;
    const dataFinal = analistaId 
      ? new Date(new Date().getTime() + periodoExclusividade * 24 * 60 * 60 * 1000)
      : null;

    // ============================================
    // VERIFICAR SE JÁ EXISTE
    // ============================================
    
    let pessoaExistente = null;
    
    if (data.linkedin_url) {
      const { data: byLinkedIn } = await supabase
        .from('pessoas')
        .select('id')
        .eq('linkedin_url', data.linkedin_url)
        .single();
      
      pessoaExistente = byLinkedIn;
    }
    
    if (!pessoaExistente && data.email) {
      const { data: byEmail } = await supabase
        .from('pessoas')
        .select('id')
        .eq('email', data.email)
        .single();
      
      pessoaExistente = byEmail;
    }

    // ============================================
    // INSERIR OU ATUALIZAR PESSOA
    // ============================================
    
    const tituloProfissional = (data.headline || ultimoCargo || 'Profissional de TI').substring(0, 200);
    const linkedinUrl = (data.linkedin_url || '').substring(0, 500);
    const nomeCompleto = (data.nome || '').substring(0, 255);
    const resumoProfissional = data.resumo || null;
    
    console.log(`📏 Tamanhos dos campos:`);
    console.log(`   nome: ${nomeCompleto.length} chars`);
    console.log(`   titulo_profissional: ${tituloProfissional.length} chars`);
    console.log(`   linkedin_url: ${linkedinUrl.length} chars`);
    
    const pessoaData: any = {
      nome: nomeCompleto,
      email: data.email || null,
      telefone: data.telefone || null,
      titulo_profissional: tituloProfissional,
      senioridade: senioridade,
      resumo_profissional: resumoProfissional,
      linkedin_url: linkedinUrl || null,
      cidade: (cidade || '').substring(0, 100),
      estado: (estado || '').substring(0, 50),
      disponibilidade: 'A combinar',
      modalidade_preferida: 'Remoto',
      ativo: true,
      origem: 'linkedin',
      importado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      periodo_exclusividade: periodoExclusividade,
      max_renovacoes: maxRenovacoes,
      qtd_renovacoes: 0
    };

    if (analistaId) {
      pessoaData.id_analista_rs = analistaId;
      pessoaData.data_inicio_exclusividade = dataInicio?.toISOString();
      pessoaData.data_final_exclusividade = dataFinal?.toISOString();
    }

    let pessoa_id: number;
    let atualizado = false;

    if (pessoaExistente) {
      const { data: updated, error } = await supabase
        .from('pessoas')
        .update(pessoaData)
        .eq('id', pessoaExistente.id)
        .select()
        .single();

      if (error) throw error;
      pessoa_id = updated.id;
      atualizado = true;
      console.log(`✅ Pessoa ATUALIZADA: ${data.nome} (ID: ${pessoa_id})`);

    } else {
      const { data: inserted, error } = await supabase
        .from('pessoas')
        .insert({
          ...pessoaData,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      pessoa_id = inserted.id;
      console.log(`✅ Pessoa INSERIDA: ${data.nome} (ID: ${pessoa_id})`);
    }

    if (analistaId) {
      await supabase.from('log_exclusividade').insert({
        pessoa_id: pessoa_id,
        acao: 'atribuicao',
        analista_novo_id: analistaId,
        realizado_por: analistaId,
        motivo: atualizado 
          ? 'Atualização via importação LinkedIn' 
          : 'Cadastro inicial via importação LinkedIn',
        data_exclusividade_nova: dataFinal?.toISOString(),
        qtd_renovacoes_nova: 0
      });
    }

    // ============================================
    // SALVAR SKILLS
    // ============================================
    
    const skillsDoLinkedIn = data.skills || [];
    const skillsDoHeadline = extrairSkillsDoHeadline(data.headline || '');
    
    // Extrair skills via Gemini das experiências
    const skillsDaIA = await extrairSkillsComIA(data.resumo, data.experiencias, data.headline);
    
    // Combinar e remover duplicatas
    const todasSkills: string[] = [];
    const skillsNormalizadas = new Set<string>();
    
    for (const skill of [...skillsDoLinkedIn, ...skillsDoHeadline, ...skillsDaIA]) {
      const skillLower = skill.toLowerCase().trim();
      if (skillLower && skillLower.length > 1 && !skillsNormalizadas.has(skillLower)) {
        skillsNormalizadas.add(skillLower);
        todasSkills.push(skill);
      }
    }
    
    console.log(`📊 Skills: ${skillsDoLinkedIn.length} LinkedIn + ${skillsDoHeadline.length} headline + ${skillsDaIA.length} IA = ${todasSkills.length} únicas`);
    
    let skillsSalvas = 0;
    
    if (todasSkills.length > 0) {
      if (atualizado) {
        await supabase
          .from('pessoa_skills')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      const categoriasValidas = ['frontend', 'backend', 'database', 'devops', 'cloud', 'mobile', 'sap', 'soft_skill', 'tool', 'methodology', 'other', 'data', 'outro', 'finance'];
      
      // Filtrar skills inválidas
      const skillsFiltradas = todasSkills.filter(skill => {
        const s = String(skill).trim();
        if (s.length > 80) return false;
        if (s.startsWith('http') || s.includes('://')) return false;
        if (s.includes(' tem como objetivo') || s.includes('Programa de') || s.includes('Tive o privilégio')) return false;
        return s.length >= 2;
      });
      
      const skillsData = skillsFiltradas.map(skill => {
        const categoria = categorizarSkill(skill);
        const skillNome = String(skill).trim().substring(0, 100);
        return {
          pessoa_id,
          skill_nome: skillNome,
          skill_categoria: categoriasValidas.includes(categoria) ? categoria : 'outro',
          nivel: 'intermediario',
          anos_experiencia: 0,
          certificado: false
        };
      });

      const { error } = await supabase
        .from('pessoa_skills')
        .insert(skillsData);

      if (error) {
        console.warn('⚠️ Erro ao salvar skills em lote:', error.message);
        
        for (const skill of skillsData.slice(0, 100)) {
          const { error: errIndividual } = await supabase.from('pessoa_skills').insert(skill);
          if (!errIndividual) {
            skillsSalvas++;
          }
        }
        console.log(`✅ Skills salvas individualmente: ${skillsSalvas}/${skillsData.length}`);
      } else {
        skillsSalvas = skillsFiltradas.length;
        console.log(`✅ ${skillsFiltradas.length} skills salvas`);
      }
    }

    // ============================================
    // 🆕 v57.11: SALVAR EXPERIÊNCIAS COM DATAS
    // ============================================
    
    if (data.experiencias && data.experiencias.length > 0) {
      if (atualizado) {
        await supabase
          .from('pessoa_experiencias')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      const expData = data.experiencias.map((exp, index) => {
        // 🆕 v57.11: Usar datas da extensão, ou parsear como fallback
        let dataInicio = exp.data_inicio || null;
        let dataFim = exp.data_fim || null;
        let atual = exp.atual || false;
        
        // Fallback: se não veio data_inicio, tentar parsear do período
        if (!dataInicio && exp.periodo) {
          const parsed = parsePeriodo(exp.periodo);
          dataInicio = parsed.data_inicio;
          dataFim = parsed.data_fim;
          atual = parsed.atual || atual;
        }
        
        console.log(`   💼 Exp ${index + 1}: ${(exp.cargo || '').substring(0, 30)}...`);
        console.log(`      └─ inicio: ${dataInicio}, fim: ${dataFim}, atual: ${atual}`);
        console.log(`      └─ descrição: ${exp.descricao ? exp.descricao.substring(0, 50) + '...' : 'N/A'}`);
        
        return {
          pessoa_id,
          empresa: (exp.empresa || '').substring(0, 200),
          cargo: (exp.cargo || '').substring(0, 200),
          data_inicio: dataInicio,
          data_fim: dataFim,
          atual: atual,
          descricao: exp.descricao || null,
          tecnologias_usadas: [],
          ordem: index
        };
      });

      const { error } = await supabase
        .from('pessoa_experiencias')
        .insert(expData);

      if (error) {
        console.warn('Aviso ao salvar experiências:', error.message);
      } else {
        console.log(`✅ ${data.experiencias.length} experiências salvas com datas`);
      }
    }

    // ============================================
    // SALVAR FORMAÇÕES
    // ============================================
    
    if (data.formacoes && data.formacoes.length > 0) {
      if (atualizado) {
        await supabase
          .from('pessoa_formacao')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      const formData = data.formacoes.map(form => ({
        pessoa_id,
        tipo: 'graduacao',
        instituicao: (form.instituicao || '').substring(0, 200),
        curso: (form.curso || '').substring(0, 200),
        ano_conclusao: null,
        em_andamento: false
      }));

      const { error } = await supabase
        .from('pessoa_formacao')
        .insert(formData);

      if (error) {
        console.warn('Aviso ao salvar formações:', error.message);
      } else {
        console.log(`✅ ${data.formacoes.length} formações salvas`);
      }
    }

    // ============================================
    // RESPOSTA DE SUCESSO
    // ============================================
    
    const mensagemExtra = !analistaId 
      ? ' ⚠️ Abra o cadastro e atribua um Analista de R&S para ativar exclusividade.'
      : '';
    
    return res.status(200).json({
      success: true,
      pessoa_id,
      atualizado,
      message: atualizado 
        ? `Perfil de ${data.nome} atualizado com sucesso!${mensagemExtra}`
        : `${data.nome} adicionado ao Banco de Talentos!${mensagemExtra}`,
      dados: {
        nome: data.nome,
        senioridade,
        skills_count: skillsSalvas,
        skills_linkedin: skillsDoLinkedIn.length,
        skills_headline: skillsDoHeadline.length,
        skills_ia: skillsDaIA.length,
        experiencias_count: data.experiencias?.length || 0
      },
      exclusividade: {
        analista_id: analistaId,
        atribuido: !!analistaId,
        periodo_dias: periodoExclusividade,
        data_inicio: dataInicio?.toISOString() || null,
        data_final: dataFinal?.toISOString() || null,
        max_renovacoes: maxRenovacoes
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao importar do LinkedIn:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
}

