/**
 * api/linkedin/importar.ts
 * 
 * Endpoint para receber dados do LinkedIn (via extensão Chrome)
 * e salvar diretamente na tabela PESSOAS (Banco de Talentos)
 * 
 * 🔧 v57.16: Busca dedup robusta por username do LinkedIn
 * - ilike('%/in/username%') cobre TODAS as variações de URL
 * - Fallbacks em cascata: username → email → nome
 * - Elimina definitivamente qualquer duplicação por variação de URL
 * 
 * 🔧 v57.15: Normalização de URL do LinkedIn
 * - normalizarLinkedInUrl(): converte qualquer variação para https://www.linkedin.com/in/username
 * - Busca dedup usa URL normalizada + fallback para URL original (registros antigos)
 * - .single() substituído por .maybeSingle() para evitar erros em queries opcionais
 * - Elimina duplicação por variações: com/sem https, com/sem www, com/sem barra final
 * 
 * 🆕 v57.14: GARANTIA estado VARCHAR(2)
 * - Adicionado .substring(0, 2) no momento do insert
 * - Garante que NUNCA exceda 2 caracteres
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
 * - v57.12: Normalização de estado para UF (2 chars)
 * - v57.13: Correção nomes de colunas pessoa_skills
 * - v57.14: Garantia absoluta estado max 2 chars
 * 
 * Data: 30/01/2026
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
    
    console.log('✅ API_KEY carregada para LinkedIn Import v57.14');
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
// INTERFACE DE DADOS
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
    data_inicio?: string | null;
    data_fim?: string | null;
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
// 🆕 v57.12: MAPEAMENTO DE ESTADOS BRASILEIROS
// ============================================

const ESTADOS_BR: Record<string, string> = {
  // Nomes completos
  'acre': 'AC',
  'alagoas': 'AL',
  'amapá': 'AP', 'amapa': 'AP',
  'amazonas': 'AM',
  'bahia': 'BA',
  'ceará': 'CE', 'ceara': 'CE',
  'distrito federal': 'DF',
  'espírito santo': 'ES', 'espirito santo': 'ES',
  'goiás': 'GO', 'goias': 'GO',
  'maranhão': 'MA', 'maranhao': 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  'pará': 'PA', 'para': 'PA',
  'paraíba': 'PB', 'paraiba': 'PB',
  'paraná': 'PR', 'parana': 'PR',
  'pernambuco': 'PE',
  'piauí': 'PI', 'piaui': 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  'rondônia': 'RO', 'rondonia': 'RO',
  'roraima': 'RR',
  'santa catarina': 'SC',
  'são paulo': 'SP', 'sao paulo': 'SP',
  'sergipe': 'SE',
  'tocantins': 'TO',
  // Siglas (lowercase)
  'ac': 'AC', 'al': 'AL', 'ap': 'AP', 'am': 'AM', 'ba': 'BA',
  'ce': 'CE', 'df': 'DF', 'es': 'ES', 'go': 'GO', 'ma': 'MA',
  'mt': 'MT', 'ms': 'MS', 'mg': 'MG', 'pa': 'PA', 'pb': 'PB',
  'pr': 'PR', 'pe': 'PE', 'pi': 'PI', 'rj': 'RJ', 'rn': 'RN',
  'rs': 'RS', 'ro': 'RO', 'rr': 'RR', 'sc': 'SC', 'sp': 'SP',
  'se': 'SE', 'to': 'TO'
};

/**
 * 🆕 v57.12: Normaliza estado para sigla de 2 caracteres
 */
function normalizarEstado(estado: string): string {
  if (!estado) return '';
  
  const estadoLimpo = estado.toLowerCase().trim();
  
  // Se já é uma sigla válida de 2 chars
  if (estadoLimpo.length === 2 && ESTADOS_BR[estadoLimpo]) {
    return ESTADOS_BR[estadoLimpo];
  }
  
  // Buscar no mapeamento
  if (ESTADOS_BR[estadoLimpo]) {
    return ESTADOS_BR[estadoLimpo];
  }
  
  // Tentar encontrar parcialmente (ex: "São Paulo, Brasil" -> "SP")
  for (const [nome, sigla] of Object.entries(ESTADOS_BR)) {
    if (estadoLimpo.includes(nome) || nome.includes(estadoLimpo)) {
      return sigla;
    }
  }
  
  // Último recurso: pegar primeiras 2 letras
  console.warn(`⚠️ Estado não reconhecido: "${estado}" - truncando para 2 chars`);
  return estado.substring(0, 2).toUpperCase();
}

// ============================================
// 🔧 v57.15: NORMALIZAÇÃO DE URL DO LINKEDIN
// Garante formato canônico: https://www.linkedin.com/in/username
// Evita duplicação por variações de URL (com/sem https, com/sem www, com/sem barra final)
// ============================================

function normalizarLinkedInUrl(url: string | undefined): string {
  if (!url) return '';

  let u = url.trim().toLowerCase();

  // Remover protocolo existente
  u = u.replace(/^https?:\/\//i, '');

  // Remover www. se existir
  u = u.replace(/^www\./i, '');

  // Remover barra final
  u = u.replace(/\/$/, '');

  // Remover parâmetros de query
  u = u.split('?')[0];

  // Montar URL canônica
  return `https://www.linkedin.com/in/${u.split('/in/')[1] || u}`;
}

// ============================================
// PARSER DE PERÍODO
// ============================================

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
  
  const periodoLimpo = periodo.split('·')[0].trim();
  const atual = /atual|present|momento|current/i.test(periodo);
  
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
    const regexAnos = /(\d{4})\s*[-–]\s*(\d{4}|atual|presente|present)?/i;
    const matchAnos = periodoLimpo.match(regexAnos);
    
    if (matchAnos) {
      data_inicio = `${matchAnos[1]}-01-01`;
      if (matchAnos[2] && /\d{4}/.test(matchAnos[2])) {
        data_fim = `${matchAnos[2]}-12-01`;
      }
    }
  }
  
  console.log(`   📅 Período: "${periodo}" → inicio: ${data_inicio}, fim: ${data_fim}, atual: ${atual}`);
  
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
    if (exp.data_inicio) {
      const inicio = new Date(exp.data_inicio);
      const fim = exp.data_fim ? new Date(exp.data_fim) : hoje;
      totalMeses += Math.max(0, (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()));
    } else if (exp.periodo) {
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

/**
 * 🆕 v57.12: Função aprimorada para extrair cidade e UF
 */
function parseLocalizacao(localizacao: string): { cidade: string; estado: string } {
  if (!localizacao) return { cidade: '', estado: '' };
  
  // Limpar localização (remover Brasil, Brazil, etc.)
  let locLimpa = localizacao
    .replace(/,?\s*(brasil|brazil|br)$/i, '')
    .trim();
  
  const parts = locLimpa.split(',').map(p => p.trim());
  
  let cidade = '';
  let estado = '';
  
  if (parts.length >= 2) {
    cidade = parts[0];
    estado = parts[1];
  } else if (parts.length === 1) {
    // Pode ser só a cidade ou "São Paulo" que é cidade e estado
    cidade = parts[0];
    
    // Verificar se é um estado conhecido
    const possibleEstado = normalizarEstado(parts[0]);
    if (possibleEstado && ESTADOS_BR[parts[0].toLowerCase()]) {
      // É um estado, não uma cidade
      estado = possibleEstado;
      cidade = '';
    }
  }
  
  // 🆕 v57.12: Normalizar estado para sigla de 2 chars
  const estadoNormalizado = normalizarEstado(estado);
  
  console.log(`📍 Localização: "${localizacao}" → cidade: "${cidade}", estado: "${estadoNormalizado}"`);
  
  return { 
    cidade: cidade.substring(0, 100), 
    estado: estadoNormalizado  // Agora sempre 2 chars
  };
}

function categorizarSkill(skill: string): string {
  const skillLower = skill.toLowerCase();
  
  if (/sap|abap|fiori|hana|s\/4|ecc|bw|bi|bpc|ariba|successfactor/i.test(skillLower)) {
    return 'sap';
  }
  
  if (/react|angular|vue|javascript|typescript|html|css|sass|tailwind|next|nuxt|svelte|jquery/i.test(skillLower)) {
    return 'frontend';
  }
  
  if (/node|python|java|c#|\.net|php|ruby|go|rust|spring|django|fastapi|express|nest|kotlin/i.test(skillLower)) {
    return 'backend';
  }
  
  if (/sql|postgres|mysql|mongodb|redis|oracle|firebase|dynamodb|supabase|sqlite/i.test(skillLower)) {
    return 'database';
  }
  
  if (/aws|azure|gcp|cloud|docker|kubernetes|k8s|terraform|jenkins|ci\/cd|devops/i.test(skillLower)) {
    return 'devops';
  }
  
  if (/machine learning|ml|ia|ai|deep learning|nlp|pytorch|tensorflow|data science/i.test(skillLower)) {
    return 'data_science';
  }
  
  if (/scrum|agile|kanban|pmp|prince2|gestão|gerenciamento|management/i.test(skillLower)) {
    return 'metodologia';
  }
  
  return 'outro';
}

// ============================================
// EXTRAÇÃO DE SKILLS VIA IA
// ============================================

async function extrairSkillsViaIA(experiencias: LinkedInData['experiencias'], headline?: string): Promise<string[]> {
  if (!experiencias || experiencias.length === 0) return [];
  
  try {
    const ai = getAI();
    
    const textoExperiencias = experiencias
      .slice(0, 5)
      .map(e => `${e.cargo} na ${e.empresa}: ${(e.descricao || '').substring(0, 300)}`)
      .join('\n');
    
    const prompt = `Analise estas experiências profissionais e extraia as principais tecnologias e skills técnicas mencionadas ou implícitas:

${headline ? `Título: ${headline}\n` : ''}
Experiências:
${textoExperiencias}

Retorne APENAS uma lista JSON de skills técnicas (tecnologias, frameworks, linguagens, ferramentas).
Formato: ["skill1", "skill2", "skill3"]

Foque em: linguagens de programação, frameworks, bancos de dados, cloud, DevOps, metodologias.
NÃO inclua: soft skills, descrições genéricas, frases longas.
Máximo 20 skills. Seja específico.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });
    
    const textResponse = response.text || '';
    
    let skills: string[] = [];
    
    const jsonMatch = textResponse.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        skills = JSON.parse(jsonMatch[0]);
      } catch {
        const skillMatches = textResponse.match(/"([^"]+)"/g);
        if (skillMatches) {
          skills = skillMatches.map(s => s.replace(/"/g, ''));
        }
      }
    } else {
      const skillMatches = textResponse.match(/"([^"]+)"/g);
      if (skillMatches) {
        skills = skillMatches.map(s => s.replace(/"/g, ''));
      }
    }
    
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

    console.log('📥 Recebendo dados do LinkedIn v57.12:', data.nome);

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
    
    // 🆕 v57.12: Usar função aprimorada que normaliza estado
    const { cidade, estado } = parseLocalizacao(data.localizacao || '');
    
    const ultimaExp = data.experiencias?.[0];
    const ultimoCargo = ultimaExp?.cargo || data.headline || '';

    const dataInicio = analistaId ? new Date() : null;
    const dataFinal = analistaId 
      ? new Date(new Date().getTime() + periodoExclusividade * 24 * 60 * 60 * 1000)
      : null;

    // ============================================
    // VERIFICAR SE JÁ EXISTE
    // 🔧 v57.16: Busca robusta por username do LinkedIn
    // Cobre TODAS as variações: com/sem https, com/sem www, com/sem barra final
    // ============================================
    
    // Normalizar URL recebida da extensão
    const linkedinUrlNormalizada = normalizarLinkedInUrl(data.linkedin_url);

    let pessoaExistente = null;

    if (linkedinUrlNormalizada) {
      // Extrair username canônico (ex: "thiagomonteiro03")
      const usernameMatch = linkedinUrlNormalizada.match(/linkedin\.com\/in\/([^\/\?#]+)/i);
      const username = usernameMatch ? usernameMatch[1] : null;

      if (username) {
        // Busca por ILIKE cobrindo todas as variações de URL com esse username
        const { data: byLinkedIn } = await supabase
          .from('pessoas')
          .select('id')
          .ilike('linkedin_url', `%/in/${username}%`)
          .maybeSingle();

        pessoaExistente = byLinkedIn;
        if (pessoaExistente) {
          console.log(`✅ Pessoa encontrada via username LinkedIn: ${username} → ID ${pessoaExistente.id}`);
        }
      }
    }
    
    // Fallback por email
    if (!pessoaExistente && data.email) {
      const { data: byEmail } = await supabase
        .from('pessoas')
        .select('id')
        .eq('email', data.email)
        .maybeSingle();
      
      pessoaExistente = byEmail;
      if (pessoaExistente) {
        console.log(`✅ Pessoa encontrada via email → ID ${pessoaExistente.id}`);
      }
    }

    // Fallback por nome exato (último recurso)
    if (!pessoaExistente && data.nome) {
      const { data: byNome } = await supabase
        .from('pessoas')
        .select('id')
        .ilike('nome', data.nome.trim())
        .maybeSingle();
      
      pessoaExistente = byNome;
      if (pessoaExistente) {
        console.log(`✅ Pessoa encontrada via nome → ID ${pessoaExistente.id}`);
      }
    }

    // ============================================
    // INSERIR OU ATUALIZAR PESSOA
    // ============================================
    
    const tituloProfissional = (data.headline || ultimoCargo || 'Profissional de TI').substring(0, 200);
    const linkedinUrl = linkedinUrlNormalizada.substring(0, 500); // 🔧 v57.15: sempre normalizada
    const nomeCompleto = (data.nome || '').substring(0, 255);
    const resumoProfissional = data.resumo || null;
    
    console.log(`📏 Tamanhos dos campos:`);
    console.log(`   nome: ${nomeCompleto.length} chars`);
    console.log(`   titulo_profissional: ${tituloProfissional.length} chars`);
    console.log(`   linkedin_url: ${linkedinUrl.length} chars`);
    console.log(`   cidade: ${cidade.length} chars`);
    console.log(`   estado: ${estado.length} chars (UF normalizado)`);
    
    const pessoaData: any = {
      nome: nomeCompleto,
      email: data.email || null,
      telefone: data.telefone || null,
      titulo_profissional: tituloProfissional,
      senioridade: senioridade,
      resumo_profissional: resumoProfissional,
      linkedin_url: linkedinUrl || null,
      cidade: cidade,
      estado: estado.substring(0, 2),  // 🆕 v57.14: GARANTIDO max 2 chars
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
      const { error } = await supabase
        .from('pessoas')
        .update(pessoaData)
        .eq('id', pessoaExistente.id);

      if (error) throw error;
      
      pessoa_id = pessoaExistente.id;
      atualizado = true;
      console.log(`✅ Pessoa atualizada: ID ${pessoa_id}`);
    } else {
      const { data: novaPessoa, error } = await supabase
        .from('pessoas')
        .insert(pessoaData)
        .select('id')
        .single();

      if (error) throw error;
      
      pessoa_id = novaPessoa.id;
      console.log(`✅ Nova pessoa criada: ID ${pessoa_id}`);
    }

    // ============================================
    // PROCESSAR E SALVAR SKILLS
    // ============================================
    
    if (atualizado) {
      await supabase
        .from('pessoa_skills')
        .delete()
        .eq('pessoa_id', pessoa_id);
    }

    // Coletar skills de diferentes fontes
    const skillsDoLinkedIn = (data.skills || []).filter(s => s && s.length > 1 && s.length < 100);
    
    const skillsDoHeadline: string[] = [];
    if (data.headline) {
      const techKeywords = [
        'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue', 'Node',
        'Django', 'FastAPI', 'Flask', 'Spring', 'PHP', 'C#', '.NET', 'SQL', 'PostgreSQL',
        'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
        'SAP', 'ABAP', 'Fiori', 'HANA', 'S/4HANA', 'Kotlin', 'Swift', 'Go', 'Rust'
      ];
      
      for (const tech of techKeywords) {
        if (data.headline.toLowerCase().includes(tech.toLowerCase())) {
          skillsDoHeadline.push(tech);
        }
      }
    }
    
    // Extrair skills via IA
    let skillsDaIA: string[] = [];
    try {
      skillsDaIA = await extrairSkillsViaIA(data.experiencias, data.headline);
    } catch (err) {
      console.warn('⚠️ Falha ao extrair skills via IA:', err);
    }

    // Combinar todas as skills (sem duplicatas)
    const todasSkillsSet = new Set<string>();
    
    function addSkillNormalized(skill: string) {
      const skillLower = skill.toLowerCase().trim();
      if (skillLower.length > 1 && skillLower.length < 100) {
        // Verificar se já existe (case insensitive)
        const existe = Array.from(todasSkillsSet).some(s => s.toLowerCase() === skillLower);
        if (!existe) {
          todasSkillsSet.add(skill.trim());
        }
      }
    }
    
    skillsDoLinkedIn.forEach(addSkillNormalized);
    skillsDoHeadline.forEach(addSkillNormalized);
    skillsDaIA.forEach(addSkillNormalized);
    
    const todasSkills = Array.from(todasSkillsSet);
    
    console.log(`🛠️ Skills combinadas: ${todasSkills.length}`);
    console.log(`   - LinkedIn: ${skillsDoLinkedIn.length}`);
    console.log(`   - Headline: ${skillsDoHeadline.length}`);
    console.log(`   - IA: ${skillsDaIA.length}`);
    
    // Filtrar skills inválidas
    const skillsInvalidas = [
      'o', 'a', 'os', 'as', 'e', 'ou', 'de', 'da', 'do', 'das', 'dos',
      'para', 'com', 'em', 'no', 'na', 'nos', 'nas', 'por', 'como',
      'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
      'competência', 'skill', 'habilidade', 'experiência', 'anos',
      'tempo integral', 'full time', 'part time', 'remoto', 'presencial'
    ];
    
    const skillsFiltradas = todasSkills.filter(skill => {
      const skillLower = skill.toLowerCase().trim();
      if (skillLower.length < 2 || skillLower.length > 80) return false;
      if (skillsInvalidas.includes(skillLower)) return false;
      if (/^\d+$/.test(skillLower)) return false;
      if (/^(http|www\.|\.com|\.br)/.test(skillLower)) return false;
      return true;
    });

    let skillsSalvas = 0;
    
    if (skillsFiltradas.length > 0) {
      const skillsData = skillsFiltradas.slice(0, 100).map(skill => ({
        pessoa_id,
        skill_nome: skill.substring(0, 100),
        skill_categoria: categorizarSkill(skill),
        nivel: 'intermediario',
        anos_experiencia: 0
      }));

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
    // SALVAR EXPERIÊNCIAS COM DATAS
    // ============================================
    
    if (data.experiencias && data.experiencias.length > 0) {
      if (atualizado) {
        await supabase
          .from('pessoa_experiencias')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      const expData = data.experiencias.map((exp, index) => {
        let dataInicioExp = exp.data_inicio || null;
        let dataFimExp = exp.data_fim || null;
        let atualExp = exp.atual || false;
        
        // Fallback: se não veio data_inicio, tentar parsear do período
        if (!dataInicioExp && exp.periodo) {
          const parsed = parsePeriodo(exp.periodo);
          dataInicioExp = parsed.data_inicio;
          dataFimExp = parsed.data_fim;
          atualExp = parsed.atual || atualExp;
        }
        
        console.log(`   💼 Exp ${index + 1}: ${(exp.cargo || '').substring(0, 30)}...`);
        console.log(`      └─ inicio: ${dataInicioExp}, fim: ${dataFimExp}, atual: ${atualExp}`);
        
        return {
          pessoa_id,
          empresa: (exp.empresa || '').substring(0, 200),
          cargo: (exp.cargo || '').substring(0, 200),
          data_inicio: dataInicioExp,
          data_fim: dataFimExp,
          atual: atualExp,
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
        cidade,
        estado,  // Agora sempre sigla de 2 chars
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

