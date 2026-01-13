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
  
  let totalAnos = 0;
  const anoAtual = new Date().getFullYear();
  
  for (const exp of experiencias) {
    if (exp.periodo) {
      const anos = exp.periodo.match(/(\d{4})/g);
      if (anos && anos.length >= 1) {
        const anoInicio = parseInt(anos[0]);
        const anoFim = anos.length > 1 ? parseInt(anos[1]) : anoAtual;
        totalAnos += Math.max(0, anoFim - anoInicio);
      }
    }
  }
  
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
    
    if (data.skills && data.skills.length > 0) {
      // Deletar skills antigas se atualizando
      if (atualizado) {
        await supabase
          .from('pessoa_skills')
          .delete()
          .eq('pessoa_id', pessoa_id);
      }

      // Inserir novas skills
      const skillsData = data.skills.map(skill => ({
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
        console.log(`✅ ${data.skills.length} skills salvas`);
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
