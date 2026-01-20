/**
 * api/linkedin/importar.ts
 * 
 * Endpoint para receber dados do LinkedIn (via extensão Chrome)
 * e salvar diretamente na tabela PESSOAS (Banco de Talentos)
 * 
 * 🆕 v57.0: PLANO B - Removida validação obrigatória de analista_id
 * O analista será atribuído posteriormente via CRUD do Banco de Talentos
 * 
 * 🔧 v57.4: Padronização de skills
 * - Campo nivel: 'intermediario' (sem acento, minúsculo) - igual ao CVImportIA
 * - Fallback de inserção individual em caso de erro em lote
 * - Validação de categorias contra lista
 * 
 * 🆕 v57.5: Extração de Skills via IA (Gemini)
 * - Analisa texto das experiências com Gemini
 * - Extrai skills técnicas e de negócio automaticamente
 * - Combina com skills do LinkedIn e headline
 * - Corrigido: criado_em → created_at
 * 
 * 🔧 v57.6: Correção do SDK Gemini
 * - Usa @google/genai igual ao resto do sistema
 * - Modelo: gemini-2.0-flash
 * - Padrão getAI() lazy initialization
 * 
 * Data: 20/01/2026
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
    
    console.log('✅ API_KEY carregada para LinkedIn Import');
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

// Interface dos dados recebidos do LinkedIn
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

// Calcular anos de experiência baseado nas experiências
function calcularAnosExperiencia(experiencias: LinkedInData['experiencias']): number {
  if (!experiencias || experiencias.length === 0) return 0;
  
  let totalMeses = 0;
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  
  const meses: Record<string, number> = {
    'jan': 1, 'janeiro': 1, 'january': 1,
    'fev': 2, 'fevereiro': 2, 'february': 2, 'feb': 2,
    'mar': 3, 'março': 3, 'march': 3,
    'abr': 4, 'abril': 4, 'april': 4, 'apr': 4,
    'mai': 5, 'maio': 5, 'may': 5,
    'jun': 6, 'junho': 6, 'june': 6,
    'jul': 7, 'julho': 7, 'july': 7,
    'ago': 8, 'agosto': 8, 'august': 8, 'aug': 8,
    'set': 9, 'setembro': 9, 'september': 9, 'sep': 9,
    'out': 10, 'outubro': 10, 'october': 10, 'oct': 10,
    'nov': 11, 'novembro': 11, 'november': 11,
    'dez': 12, 'dezembro': 12, 'december': 12, 'dec': 12
  };
  
  for (const exp of experiencias) {
    if (!exp.periodo) continue;
    
    const periodoLower = exp.periodo.toLowerCase();
    const anosMatch = periodoLower.match(/(\d{4})/g);
    const mesAnoRegex = /(\w+)\s*(\d{4})/g;
    const matches = [...periodoLower.matchAll(mesAnoRegex)];
    
    let mesInicio = 1, anoInicio = 0;
    let mesFim = mesAtual, anoFim = anoAtual;
    
    if (matches.length >= 1) {
      const mesNome = matches[0][1];
      mesInicio = meses[mesNome] || 1;
      anoInicio = parseInt(matches[0][2]);
      
      if (matches.length >= 2) {
        const mesFimNome = matches[1][1];
        mesFim = meses[mesFimNome] || mesAtual;
        anoFim = parseInt(matches[1][2]);
      } else if (periodoLower.includes('presente') || periodoLower.includes('atual') || periodoLower.includes('present') || exp.atual) {
        mesFim = mesAtual;
        anoFim = anoAtual;
      }
    } else if (anosMatch && anosMatch.length >= 1) {
      anoInicio = parseInt(anosMatch[0]);
      anoFim = anosMatch.length > 1 ? parseInt(anosMatch[1]) : anoAtual;
    }
    
    if (anoInicio > 0) {
      const mesesExp = (anoFim - anoInicio) * 12 + (mesFim - mesInicio);
      totalMeses += Math.max(0, mesesExp);
    }
  }
  
  const totalAnos = Math.round(totalMeses / 12);
  console.log(`📊 Total experiência calculada: ${totalMeses} meses = ${totalAnos} anos`);
  
  return totalAnos;
}

function estimarSenioridade(anos: number): string {
  if (anos >= 10) return 'Especialista';
  if (anos >= 6) return 'Senior';
  if (anos >= 3) return 'Pleno';
  return 'Junior';
}

function parseLocalizacao(localizacao: string): { cidade: string; estado: string } {
  if (!localizacao) return { cidade: '', estado: '' };
  
  const partes = localizacao.split(',').map(p => p.trim());
  
  const estadosParaSigla: Record<string, string> = {
    'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
    'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
    'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
    'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
    'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
    'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
    'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
  };
  
  let cidade = '';
  let estado = '';
  
  if (partes.length >= 2) {
    cidade = partes[0];
    const estadoRaw = partes[1].toLowerCase();
    if (estadosParaSigla[estadoRaw]) {
      estado = estadosParaSigla[estadoRaw];
    } else if (partes[1].length === 2) {
      estado = partes[1].toUpperCase();
    } else {
      estado = '';
    }
  } else if (partes.length === 1) {
    cidade = partes[0];
  }
  
  return { cidade: cidade.substring(0, 100), estado };
}

// ============================================
// 🆕 v57.6: EXTRAIR SKILLS VIA GEMINI (SDK)
// ============================================

async function extrairSkillsComIA(
  resumo: string | undefined,
  experiencias: LinkedInData['experiencias'],
  headline: string | undefined
): Promise<string[]> {
  
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
    for (const exp of experiencias) {
      textoParaAnalise += `- ${exp.cargo} na ${exp.empresa}`;
      if (exp.descricao) {
        textoParaAnalise += `: ${exp.descricao}`;
      }
      textoParaAnalise += '\n';
    }
  }
  
  // Se não tem texto suficiente, retornar vazio
  if (textoParaAnalise.length < 50) {
    console.log('⚠️ Texto insuficiente para extração de skills via IA');
    return [];
  }
  
  console.log(`🤖 Enviando ${textoParaAnalise.length} caracteres para Gemini extrair skills...`);
  
  try {
    const prompt = `Analise o seguinte perfil profissional e extraia TODAS as skills, competências e tecnologias mencionadas ou implícitas.

PERFIL:
${textoParaAnalise}

INSTRUÇÕES:
1. Extraia skills técnicas (tecnologias, ferramentas, linguagens)
2. Extraia skills de negócio (metodologias, áreas de conhecimento, certificações)
3. Extraia skills do mercado financeiro se houver (CVM, Anbima, BACEN, tipos de fundos, etc.)
4. NÃO invente skills que não estejam no texto
5. Retorne APENAS um JSON array de strings, sem explicações

EXEMPLO DE RESPOSTA:
["Python", "React", "Scrum", "Gestão de Projetos", "CVM 175", "Fundos de Investimento"]

RESPOSTA (apenas o JSON array):`;

    // 🔧 v57.6: Usar SDK @google/genai igual ao resto do sistema
    const result = await getAI().models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });
    
    const textoResposta = result.text || '';
    
    console.log('📝 Resposta Gemini (raw):', textoResposta.substring(0, 200));
    
    // Extrair JSON da resposta
    let skills: string[] = [];
    
    try {
      // Limpar a resposta (remover markdown code blocks se houver)
      let jsonStr = textoResposta.trim();
      jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      
      // Encontrar o array JSON na resposta
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        skills = JSON.parse(arrayMatch[0]);
      }
    } catch (parseError) {
      console.warn('⚠️ Erro ao parsear resposta Gemini:', parseError);
      
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

    console.log('📥 Recebendo dados do LinkedIn:', data.nome);

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
    
    // 🔧 v57.10: Truncar TODOS os campos de texto para evitar erro varchar(200)
    const tituloProfissional = (data.headline || ultimoCargo || 'Profissional de TI').substring(0, 200);
    const linkedinUrl = (data.linkedin_url || '').substring(0, 500); // URL pode ser maior
    const nomeCompleto = (data.nome || '').substring(0, 255);
    const resumoProfissional = data.resumo || null; // TEXT, sem limite
    
    console.log(`📏 Tamanhos dos campos:`);
    console.log(`   nome: ${nomeCompleto.length} chars`);
    console.log(`   titulo_profissional: ${tituloProfissional.length} chars`);
    console.log(`   linkedin_url: ${linkedinUrl.length} chars`);
    console.log(`   cidade: ${(cidade || '').length} chars`);
    
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
    
    // 🆕 v57.6: Extrair skills via Gemini das experiências
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
      
      // 🔧 v57.9: Filtrar skills inválidas ANTES de processar
      const skillsFiltradas = todasSkills.filter(skill => {
        const s = String(skill).trim();
        // Rejeitar skills muito longas (provavelmente descrições)
        if (s.length > 80) {
          console.log(`⚠️ Skill rejeitada (muito longa ${s.length} chars): ${s.substring(0, 50)}...`);
          return false;
        }
        // Rejeitar URLs
        if (s.startsWith('http') || s.includes('://')) {
          console.log(`⚠️ Skill rejeitada (URL): ${s.substring(0, 50)}`);
          return false;
        }
        // Rejeitar textos que parecem descrições
        if (s.includes(' tem como objetivo') || s.includes('Programa de') || s.includes('Tive o privilégio')) {
          console.log(`⚠️ Skill rejeitada (descrição): ${s.substring(0, 50)}...`);
          return false;
        }
        return s.length >= 2;
      });
      
      console.log(`📊 Skills após filtro: ${skillsFiltradas.length} (de ${todasSkills.length})`);
      
      const skillsData = skillsFiltradas.map(skill => {
        const categoria = categorizarSkill(skill);
        const skillNome = String(skill).trim().substring(0, 100);
        console.log(`   💾 Skill: "${skillNome}" (${skillNome.length} chars) → ${categoria}`);
        return {
          pessoa_id,
          skill_nome: skillNome,
          skill_categoria: categoriasValidas.includes(categoria) ? categoria : 'other',
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
        console.log('🔄 Tentando inserir skills individualmente...');
        
        for (const skill of skillsData.slice(0, 100)) {
          const { error: errIndividual } = await supabase.from('pessoa_skills').insert(skill);
          if (!errIndividual) {
            skillsSalvas++;
          } else {
            console.warn(`⚠️ Falha ao salvar skill "${skill.skill_nome}":`, errIndividual.message);
          }
        }
        console.log(`✅ Skills salvas individualmente: ${skillsSalvas}/${skillsData.length}`);
      } else {
        skillsSalvas = todasSkills.length;
        console.log(`✅ ${todasSkills.length} skills salvas`);
      }
    }

    // ============================================
    // SALVAR EXPERIÊNCIAS
    // ============================================
    
    if (data.experiencias && data.experiencias.length > 0) {
      if (atualizado) {
        await supabase
          .from('pessoa_experiencias')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      const expData = data.experiencias.map((exp, index) => ({
        pessoa_id,
        empresa: (exp.empresa || '').substring(0, 200), // 🔧 v57.8: Limitar a 200 chars
        cargo: (exp.cargo || '').substring(0, 200),     // 🔧 v57.8: Limitar a 200 chars
        data_inicio: null, // LinkedIn não envia data formatada
        data_fim: null,
        atual: exp.atual || false,
        descricao: exp.descricao || null,
        tecnologias_usadas: [],
        ordem: index
      }));

      const { error } = await supabase
        .from('pessoa_experiencias')
        .insert(expData);

      if (error) {
        console.warn('Aviso ao salvar experiências:', error.message);
      } else {
        console.log(`✅ ${data.experiencias.length} experiências salvas`);
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
        tipo: 'graduacao', // Campo obrigatório - default para LinkedIn
        instituicao: (form.instituicao || '').substring(0, 200), // 🔧 v57.10: Truncar
        curso: (form.curso || '').substring(0, 200),              // 🔧 v57.10: Truncar
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

// ============================================
// FUNÇÃO AUXILIAR: Extrair Skills do Headline
// ============================================

function extrairSkillsDoHeadline(headline: string): string[] {
  if (!headline) return [];
  
  const skillsConhecidas = [
    'PHP', 'Java', 'Python', 'C#', '.NET', 'Node', 'Node.js', 'Node JS', 'NodeJS',
    'Ruby', 'Go', 'Golang', 'Rust', 'Spring', 'Laravel', 'Django', 'FastAPI',
    'Express', 'NestJS', 'Nest.js',
    'React', 'React.js', 'ReactJS', 'React JS', 'Vue', 'Vue.js', 'VueJS', 'Vue JS',
    'Angular', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Tailwind',
    'Next.js', 'NextJS', 'Nuxt', 'Nuxt.js',
    'React Native', 'Flutter', 'Swift', 'Kotlin', 'Android', 'iOS',
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Oracle', 'Firebase',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'Jenkins', 'Git',
    'Linux', 'Terraform',
    'Scrum', 'Kanban', 'Agile', 'Clean Code', 'Clean Architecture', 'SOLID',
    'TDD', 'DDD', 'Design Patterns'
  ];
  
  const skillsEncontradas: string[] = [];
  
  for (const skill of skillsConhecidas) {
    const skillUpper = skill.toUpperCase();
    const regex = new RegExp(`(^|[\\s|,./\\-])${skillUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s|,./\\-])`, 'i');
    
    if (regex.test(headline)) {
      let skillNormalizada = skill;
      
      if (['Node', 'Node.js', 'Node JS', 'NodeJS'].includes(skill)) skillNormalizada = 'Node.js';
      if (['Vue', 'Vue.js', 'Vue JS', 'VueJS'].includes(skill)) skillNormalizada = 'Vue.js';
      if (['React.js', 'ReactJS', 'React JS'].includes(skill)) skillNormalizada = 'React';
      if (['Next.js', 'NextJS'].includes(skill)) skillNormalizada = 'Next.js';
      if (['Nuxt.js'].includes(skill)) skillNormalizada = 'Nuxt.js';
      
      if (!skillsEncontradas.includes(skillNormalizada)) {
        skillsEncontradas.push(skillNormalizada);
      }
    }
  }
  
  console.log(`🔍 Skills extraídas do headline: ${skillsEncontradas.join(', ')}`);
  return skillsEncontradas;
}

// ============================================
// FUNÇÃO AUXILIAR: Categorizar Skill
// ============================================

function categorizarSkill(skill: string): string {
  const skillLower = skill.toLowerCase();
  
  if (['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'sass', 'tailwind', 'next.js', 'nuxt'].some(s => skillLower.includes(s))) {
    return 'frontend';
  }
  
  if (['node', 'python', 'java', 'c#', '.net', 'php', 'ruby', 'go', 'rust', 'spring', 'django', 'fastapi', 'express'].some(s => skillLower.includes(s))) {
    return 'backend';
  }
  
  if (['sql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'oracle', 'firebase'].some(s => skillLower.includes(s))) {
    return 'database';
  }
  
  if (['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins', 'terraform', 'ansible', 'linux'].some(s => skillLower.includes(s))) {
    return 'devops';
  }
  
  if (['android', 'ios', 'swift', 'kotlin', 'flutter', 'react native', 'xamarin'].some(s => skillLower.includes(s))) {
    return 'mobile';
  }
  
  if (['machine learning', 'data science', 'pandas', 'numpy', 'tensorflow', 'pytorch', 'spark', 'hadoop', 'power bi', 'tableau'].some(s => skillLower.includes(s))) {
    return 'data';
  }
  
  if (['cvm', 'anbima', 'bacen', 'fundo', 'fidc', 'fip', 'fii', 'fiagro', 'renda fixa', 'renda variável', 'derivativo', 'câmbio', 'tesouraria', 'custódia', 'b3', 'bovespa'].some(s => skillLower.includes(s))) {
    return 'finance';
  }
  
  if (['comunicação', 'liderança', 'agile', 'scrum', 'kanban', 'gestão', 'management', 'análise de negócio', 'product owner', 'po'].some(s => skillLower.includes(s))) {
    return 'soft_skill';
  }
  
  return 'outro';
}
