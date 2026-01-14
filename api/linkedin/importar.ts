/**
 * api/linkedin/importar.ts
 * 
 * Endpoint para receber dados do LinkedIn (via extensão Chrome)
 * e salvar diretamente na tabela PESSOAS (Banco de Talentos)
 * 
 * 🆕 v57.0: PLANO B - Removida validação obrigatória de analista_id
 * O analista será atribuído posteriormente via CRUD do Banco de Talentos
 * 
 * Data: 13/01/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Supabase Admin Client
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
  // 🆕 v57.0: analista_id agora é OPCIONAL
  analista_id?: number;
}

// Calcular anos de experiência baseado nas experiências
function calcularAnosExperiencia(experiencias: LinkedInData['experiencias']): number {
  if (!experiencias || experiencias.length === 0) return 0;
  
  let totalMeses = 0;
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  
  // Mapa de meses em português e inglês
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
    
    // Tentar extrair anos (formato: 2020 - 2024 ou 2020 - Presente)
    const anosMatch = periodoLower.match(/(\d{4})/g);
    
    // Tentar extrair mês/ano (formato: jan 2020 - dez 2024 ou set 2025 - presente)
    const mesAnoRegex = /(\w+)\s*(\d{4})/g;
    const matches = [...periodoLower.matchAll(mesAnoRegex)];
    
    let mesInicio = 1, anoInicio = 0;
    let mesFim = mesAtual, anoFim = anoAtual;
    
    if (matches.length >= 1) {
      // Primeiro match = início
      const mesNome = matches[0][1];
      mesInicio = meses[mesNome] || 1;
      anoInicio = parseInt(matches[0][2]);
      
      if (matches.length >= 2) {
        // Segundo match = fim
        const mesFimNome = matches[1][1];
        mesFim = meses[mesFimNome] || mesAtual;
        anoFim = parseInt(matches[1][2]);
      } else if (periodoLower.includes('presente') || periodoLower.includes('atual') || periodoLower.includes('present') || exp.atual) {
        // Se for emprego atual
        mesFim = mesAtual;
        anoFim = anoAtual;
      }
    } else if (anosMatch && anosMatch.length >= 1) {
      // Fallback: só anos sem meses
      anoInicio = parseInt(anosMatch[0]);
      anoFim = anosMatch.length > 1 ? parseInt(anosMatch[1]) : anoAtual;
    }
    
    if (anoInicio > 0) {
      // Calcular diferença em meses
      const mesesExp = (anoFim - anoInicio) * 12 + (mesFim - mesInicio);
      totalMeses += Math.max(0, mesesExp);
    }
  }
  
  // Converter para anos (arredondando)
  const totalAnos = Math.round(totalMeses / 12);
  console.log(`📊 Total experiência calculada: ${totalMeses} meses = ${totalAnos} anos`);
  
  return totalAnos;
}

// Estimar senioridade baseado em anos de experiência
function estimarSenioridade(anos: number): string {
  if (anos >= 10) return 'Especialista';
  if (anos >= 6) return 'Senior';
  if (anos >= 3) return 'Pleno';
  return 'Junior';
}

// Extrair cidade e estado da localização
function parseLocalizacao(localizacao: string): { cidade: string; estado: string } {
  if (!localizacao) return { cidade: '', estado: '' };
  
  const partes = localizacao.split(',').map(p => p.trim());
  
  // Mapa de estados brasileiros para siglas
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
    
    // Tentar converter nome do estado para sigla
    const estadoRaw = partes[1].toLowerCase();
    if (estadosParaSigla[estadoRaw]) {
      estado = estadosParaSigla[estadoRaw];
    } else if (partes[1].length === 2) {
      // Já é uma sigla
      estado = partes[1].toUpperCase();
    } else {
      // Não reconhecido, deixar vazio para evitar erro
      estado = '';
    }
  } else if (partes.length === 1) {
    cidade = partes[0];
  }
  
  return { cidade: cidade.substring(0, 100), estado };
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

    // Validar dados mínimos
    if (!data.nome) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nome é obrigatório' 
      });
    }

    // 🆕 v57.0: REMOVIDA validação obrigatória de analista_id
    // Se tiver analista_id, usa. Se não tiver, deixa null (será atribuído depois via CRUD)
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
    
    // Extrair último cargo e empresa
    const ultimaExp = data.experiencias?.[0];
    const ultimoCargo = ultimaExp?.cargo || data.headline || '';
    const ultimaEmpresa = ultimaExp?.empresa || '';

    // 🆕 v57.0: Só calcula datas de exclusividade se tiver analista_id
    const dataInicio = analistaId ? new Date() : null;
    const dataFinal = analistaId 
      ? new Date(new Date().getTime() + periodoExclusividade * 24 * 60 * 60 * 1000)
      : null;

    // ============================================
    // VERIFICAR SE JÁ EXISTE (por LinkedIn URL ou email)
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
    
    const pessoaData: any = {
      nome: data.nome,
      email: data.email || null,
      telefone: data.telefone || null,
      titulo_profissional: data.headline || ultimoCargo || 'Profissional de TI',
      senioridade: senioridade,
      resumo_profissional: data.resumo || null,
      linkedin_url: data.linkedin_url || null,
      cidade: cidade || null,
      estado: estado || null,
      disponibilidade: 'A combinar',
      modalidade_preferida: 'Remoto',
      ativo: true,
      origem: 'linkedin',
      importado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      // 🆕 v57.0: Campos de Exclusividade - só seta se tiver analista_id
      periodo_exclusividade: periodoExclusividade,
      max_renovacoes: maxRenovacoes,
      qtd_renovacoes: 0
    };

    // 🆕 v57.0: Só adiciona campos de exclusividade se tiver analista_id
    if (analistaId) {
      pessoaData.id_analista_rs = analistaId;
      pessoaData.data_inicio_exclusividade = dataInicio?.toISOString();
      pessoaData.data_final_exclusividade = dataFinal?.toISOString();
    }

    let pessoa_id: number;
    let atualizado = false;

    if (pessoaExistente) {
      // ATUALIZAR pessoa existente
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
      // INSERIR nova pessoa
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

    // 🆕 v57.0: Só registra log de exclusividade se tiver analista_id
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
    
    // 🆕 Combinar skills do LinkedIn + skills extraídas do headline
    const skillsDoLinkedIn = data.skills || [];
    const skillsDoHeadline = extrairSkillsDoHeadline(data.headline || '');
    
    // Combinar e remover duplicatas (case-insensitive)
    const todasSkills: string[] = [];
    const skillsNormalizadas = new Set<string>();
    
    for (const skill of [...skillsDoLinkedIn, ...skillsDoHeadline]) {
      const skillLower = skill.toLowerCase().trim();
      if (skillLower && !skillsNormalizadas.has(skillLower)) {
        skillsNormalizadas.add(skillLower);
        todasSkills.push(skill);
      }
    }
    
    console.log(`📊 Skills: ${skillsDoLinkedIn.length} do LinkedIn + ${skillsDoHeadline.length} do headline = ${todasSkills.length} únicas`);
    
    if (todasSkills.length > 0) {
      // Deletar skills antigas se atualizando
      if (atualizado) {
        await supabase
          .from('pessoa_skills')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      // Inserir novas skills
      const skillsData = todasSkills.map(skill => ({
        pessoa_id,
        skill_nome: skill,
        skill_categoria: categorizarSkill(skill),
        nivel: 'Intermediário',
        anos_experiencia: 0,
        certificado: false,
        criado_em: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('pessoa_skills')
        .insert(skillsData);

      if (error) {
        console.warn('Aviso ao salvar skills:', error.message);
      } else {
        console.log(`✅ ${todasSkills.length} skills salvas`);
      }
    }

    // ============================================
    // SALVAR EXPERIÊNCIAS
    // ============================================
    
    if (data.experiencias && data.experiencias.length > 0) {
      // Deletar experiências antigas se atualizando
      if (atualizado) {
        await supabase
          .from('pessoa_experiencias')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      // Inserir novas experiências
      const expData = data.experiencias.map(exp => ({
        pessoa_id,
        empresa: exp.empresa,
        cargo: exp.cargo,
        atual: exp.atual || false,
        descricao: exp.descricao || null,
        criado_em: new Date().toISOString()
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
      // Deletar formações antigas se atualizando
      if (atualizado) {
        await supabase
          .from('pessoa_formacoes')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      // Inserir novas formações
      const formData = data.formacoes.map(form => ({
        pessoa_id,
        instituicao: form.instituicao,
        curso: form.curso || '',
        grau: form.grau || '',
        em_andamento: false,
        criado_em: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('pessoa_formacoes')
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
    
    // 🆕 v57.0: Mensagem diferente se não tiver analista
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
        skills_count: data.skills?.length || 0,
        experiencias_count: data.experiencias?.length || 0
      },
      // Info de Exclusividade
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
  
  // Lista de skills conhecidas para extrair do headline
  const skillsConhecidas = [
    // Backend
    'PHP', 'Java', 'Python', 'C#', '.NET', 'Node', 'Node.js', 'Node JS', 'NodeJS',
    'Ruby', 'Go', 'Golang', 'Rust', 'Spring', 'Laravel', 'Django', 'FastAPI',
    'Express', 'NestJS', 'Nest.js',
    // Frontend
    'React', 'React.js', 'ReactJS', 'React JS', 'Vue', 'Vue.js', 'VueJS', 'Vue JS',
    'Angular', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Tailwind',
    'Next.js', 'NextJS', 'Nuxt', 'Nuxt.js',
    // Mobile
    'React Native', 'Flutter', 'Swift', 'Kotlin', 'Android', 'iOS',
    // Database
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Oracle', 'Firebase',
    // DevOps
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'Jenkins', 'Git',
    'Linux', 'Terraform',
    // Metodologias
    'Scrum', 'Kanban', 'Agile', 'Clean Code', 'Clean Architecture', 'SOLID',
    'TDD', 'DDD', 'Design Patterns'
  ];
  
  const skillsEncontradas: string[] = [];
  const headlineUpper = headline.toUpperCase();
  
  for (const skill of skillsConhecidas) {
    // Verificar se a skill está presente no headline
    const skillUpper = skill.toUpperCase();
    
    // Criar regex para match de palavra completa ou separada por delimitadores
    const regex = new RegExp(`(^|[\\s|,./\\-])${skillUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s|,./\\-])`, 'i');
    
    if (regex.test(headline)) {
      // Normalizar nome da skill
      let skillNormalizada = skill;
      
      // Normalizar variações
      if (['Node', 'Node.js', 'Node JS', 'NodeJS'].includes(skill)) skillNormalizada = 'Node.js';
      if (['Vue', 'Vue.js', 'Vue JS', 'VueJS'].includes(skill)) skillNormalizada = 'Vue.js';
      if (['React.js', 'ReactJS', 'React JS'].includes(skill)) skillNormalizada = 'React';
      if (['Next.js', 'NextJS'].includes(skill)) skillNormalizada = 'Next.js';
      if (['Nuxt.js'].includes(skill)) skillNormalizada = 'Nuxt.js';
      
      // Evitar duplicatas
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
  
  // Frontend
  if (['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'sass', 'tailwind', 'next.js', 'nuxt'].some(s => skillLower.includes(s))) {
    return 'frontend';
  }
  
  // Backend
  if (['node', 'python', 'java', 'c#', '.net', 'php', 'ruby', 'go', 'rust', 'spring', 'django', 'fastapi', 'express'].some(s => skillLower.includes(s))) {
    return 'backend';
  }
  
  // Database
  if (['sql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'oracle', 'firebase'].some(s => skillLower.includes(s))) {
    return 'database';
  }
  
  // DevOps
  if (['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins', 'terraform', 'ansible', 'linux'].some(s => skillLower.includes(s))) {
    return 'devops';
  }
  
  // Mobile
  if (['android', 'ios', 'swift', 'kotlin', 'flutter', 'react native', 'xamarin'].some(s => skillLower.includes(s))) {
    return 'mobile';
  }
  
  // Data
  if (['machine learning', 'data science', 'pandas', 'numpy', 'tensorflow', 'pytorch', 'spark', 'hadoop', 'power bi', 'tableau'].some(s => skillLower.includes(s))) {
    return 'data';
  }
  
  // Soft Skills
  if (['comunicação', 'liderança', 'agile', 'scrum', 'kanban', 'gestão', 'management'].some(s => skillLower.includes(s))) {
    return 'soft_skill';
  }
  
  return 'outro';
}
