/**
 * cvExtractionService.ts - Extração de Dados de CV com IA
 * 
 * Responsabilidades:
 * - Extrair dados estruturados do texto do CV
 * - Identificar skills, experiências e formação
 * - Calcular score de compatibilidade com vaga
 * - Salvar automaticamente no Banco de Talentos
 * 
 * Versão: 1.0
 * Data: 30/12/2025
 */

import { supabase } from '../config/supabase';
import { Vaga } from '@/types';
import { AI_MODEL_NAME } from '../constants';

// ============================================
// TIPOS
// ============================================

export interface DadosExtraidosCV {
  nome: string;
  email: string;
  telefone?: string;
  cpf?: string;
  titulo_profissional: string;
  senioridade: 'Junior' | 'Pleno' | 'Senior' | 'Especialista';
  skills: SkillExtraida[];
  experiencias: ExperienciaExtraida[];
  formacoes: FormacaoExtraida[];
  idiomas: IdiomaExtraido[];
  resumo_profissional: string;
  disponibilidade: string;
  pretensao_salarial?: number;
  modalidade_preferida?: string;
  cidade?: string;
  estado?: string;
}

export interface SkillExtraida {
  nome: string;
  categoria: 'frontend' | 'backend' | 'database' | 'devops' | 'mobile' | 'data' | 'soft_skill' | 'outro';
  nivel: 'basico' | 'intermediario' | 'avancado' | 'especialista';
  anos_experiencia?: number;
}

export interface ExperienciaExtraida {
  empresa: string;
  cargo: string;
  periodo: string;
  data_inicio?: string;
  data_fim?: string;
  atual: boolean;
  descricao: string;
  tecnologias: string[];
}

export interface FormacaoExtraida {
  instituicao: string;
  curso: string;
  grau: string;
  ano_conclusao?: string;
  em_andamento: boolean;
}

export interface IdiomaExtraido {
  idioma: string;
  nivel: 'basico' | 'intermediario' | 'avancado' | 'fluente' | 'nativo';
}

export interface ScoreCompatibilidade {
  score_total: number;
  score_skills: number;
  score_experiencia: number;
  score_senioridade: number;
  score_salario: number;
  skills_match: string[];
  skills_faltantes: string[];
  skills_extras: string[];
  justificativa: string;
  recomendacao: 'MUITO_COMPATIVEL' | 'COMPATIVEL' | 'PARCIALMENTE_COMPATIVEL' | 'INCOMPATIVEL';
}

export interface ResultadoAnaliseCV {
  dados_extraidos: DadosExtraidosCV;
  score_compatibilidade?: ScoreCompatibilidade;
  pessoa_id?: number;
  cpf_existente: boolean;
  pessoa_atualizada: boolean;
}

// ============================================
// CONFIGURAÇÃO DA API
// ============================================

const getApiKey = (): string => {
  return (typeof process !== 'undefined' && process.env?.API_KEY) ||
         (typeof import.meta !== 'undefined' && import.meta.env?.API_KEY) ||
         "";
};

// ============================================
// FUNÇÃO PRINCIPAL: EXTRAIR DADOS DO CV
// ============================================

export async function extrairDadosCV(textoCV: string): Promise<DadosExtraidosCV> {
  console.log('🔍 Iniciando extração de dados do CV...');
  
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key não configurada');
  }

  const prompt = `
Você é um especialista em análise de currículos para recrutamento de TI.
Analise o currículo abaixo e extraia TODOS os dados estruturados.

CURRÍCULO:
${textoCV}

Retorne APENAS um JSON válido (sem markdown, sem explicações) com a seguinte estrutura:
{
  "nome": "Nome completo do candidato",
  "email": "email@exemplo.com",
  "telefone": "(11) 99999-9999",
  "cpf": "000.000.000-00 ou null se não encontrado",
  "titulo_profissional": "Ex: Desenvolvedor Full Stack",
  "senioridade": "Junior|Pleno|Senior|Especialista (baseado na experiência total)",
  "skills": [
    {
      "nome": "React",
      "categoria": "frontend|backend|database|devops|mobile|data|soft_skill|outro",
      "nivel": "basico|intermediario|avancado|especialista",
      "anos_experiencia": 3
    }
  ],
  "experiencias": [
    {
      "empresa": "Nome da Empresa",
      "cargo": "Cargo ocupado",
      "periodo": "Jan/2020 - Atual",
      "data_inicio": "2020-01-01",
      "data_fim": null,
      "atual": true,
      "descricao": "Descrição das atividades",
      "tecnologias": ["React", "Node.js", "PostgreSQL"]
    }
  ],
  "formacoes": [
    {
      "instituicao": "Nome da Universidade",
      "curso": "Ciência da Computação",
      "grau": "Bacharelado",
      "ano_conclusao": "2018",
      "em_andamento": false
    }
  ],
  "idiomas": [
    {
      "idioma": "Inglês",
      "nivel": "basico|intermediario|avancado|fluente|nativo"
    }
  ],
  "resumo_profissional": "Resumo em 2-3 frases do perfil profissional",
  "disponibilidade": "Imediata|15 dias|30 dias|A combinar",
  "pretensao_salarial": 8000,
  "modalidade_preferida": "Remoto|Híbrido|Presencial",
  "cidade": "São Paulo",
  "estado": "SP"
}

REGRAS:
1. Infira a senioridade baseado nos anos de experiência total
2. Se não encontrar algum dado, use null
3. Extraia TODAS as tecnologias mencionadas como skills
4. Categorize as skills corretamente
5. Retorne APENAS o JSON, sem nenhum texto adicional
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erro na API Gemini: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Limpar possíveis marcadores de código
    const jsonText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const dadosExtraidos: DadosExtraidosCV = JSON.parse(jsonText);
    
    console.log('✅ Dados extraídos com sucesso:', dadosExtraidos.nome);
    return dadosExtraidos;

  } catch (error: any) {
    console.error('❌ Erro ao extrair dados do CV:', error);
    throw new Error(`Falha na extração de dados: ${error.message}`);
  }
}

// ============================================
// CALCULAR SCORE DE COMPATIBILIDADE COM VAGA
// ============================================

export async function calcularCompatibilidade(
  dadosCV: DadosExtraidosCV,
  vaga: Vaga
): Promise<ScoreCompatibilidade> {
  console.log('📊 Calculando compatibilidade com vaga:', vaga.titulo);

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key não configurada');
  }

  const prompt = `
Você é um especialista em matching de candidatos para vagas de TI.
Compare o candidato com a vaga e calcule o score de compatibilidade.

CANDIDATO:
- Nome: ${dadosCV.nome}
- Senioridade: ${dadosCV.senioridade}
- Skills: ${dadosCV.skills.map(s => s.nome).join(', ')}
- Experiência Total: ${calcularAnosExperiencia(dadosCV.experiencias)} anos
- Pretensão Salarial: R$ ${dadosCV.pretensao_salarial || 'Não informado'}

VAGA:
- Título: ${vaga.titulo}
- Senioridade exigida: ${vaga.senioridade}
- Stack Tecnológica: ${Array.isArray(vaga.stack_tecnologica) ? vaga.stack_tecnologica.join(', ') : vaga.stack_tecnologica}
- Requisitos Obrigatórios: ${vaga.requisitos_obrigatorios || 'Não especificados'}
- Faixa Salarial: R$ ${vaga.salario_min || '?'} - R$ ${vaga.salario_max || '?'}

Retorne APENAS um JSON válido com a seguinte estrutura:
{
  "score_total": 85,
  "score_skills": 90,
  "score_experiencia": 80,
  "score_senioridade": 100,
  "score_salario": 70,
  "skills_match": ["React", "Node.js", "PostgreSQL"],
  "skills_faltantes": ["Docker", "AWS"],
  "skills_extras": ["Python", "MongoDB"],
  "justificativa": "Candidato com boa aderência técnica...",
  "recomendacao": "MUITO_COMPATIVEL|COMPATIVEL|PARCIALMENTE_COMPATIVEL|INCOMPATIVEL"
}

REGRAS PARA SCORES (0-100):
- score_total: média ponderada (skills 40%, experiência 25%, senioridade 20%, salário 15%)
- MUITO_COMPATIVEL: score >= 80
- COMPATIVEL: score >= 60
- PARCIALMENTE_COMPATIVEL: score >= 40
- INCOMPATIVEL: score < 40
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erro na API Gemini: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const score: ScoreCompatibilidade = JSON.parse(jsonText);
    
    console.log(`✅ Score calculado: ${score.score_total}% - ${score.recomendacao}`);
    return score;

  } catch (error: any) {
    console.error('❌ Erro ao calcular compatibilidade:', error);
    // Retorna score default em caso de erro
    return {
      score_total: 0,
      score_skills: 0,
      score_experiencia: 0,
      score_senioridade: 0,
      score_salario: 0,
      skills_match: [],
      skills_faltantes: [],
      skills_extras: [],
      justificativa: 'Erro ao calcular compatibilidade',
      recomendacao: 'INCOMPATIVEL'
    };
  }
}

// ============================================
// VERIFICAR SE CPF JÁ EXISTE
// ============================================

export async function verificarCPFExistente(cpf: string): Promise<{
  existe: boolean;
  pessoa_id?: number;
  pessoa_dados?: any;
}> {
  if (!cpf) {
    return { existe: false };
  }

  // Normalizar CPF (remover pontos e traços)
  const cpfNormalizado = cpf.replace(/[^\d]/g, '');

  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('*')
      .or(`cpf.eq.${cpf},cpf.eq.${cpfNormalizado}`)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Erro ao verificar CPF:', error);
      return { existe: false };
    }

    if (data) {
      console.log(`📋 CPF encontrado: ${data.nome} (ID: ${data.id})`);
      return {
        existe: true,
        pessoa_id: data.id,
        pessoa_dados: data
      };
    }

    return { existe: false };

  } catch (error) {
    console.error('Erro ao verificar CPF:', error);
    return { existe: false };
  }
}

// ============================================
// SALVAR NO BANCO DE TALENTOS (UPSERT)
// ============================================

export async function salvarNoBancoTalentos(
  dados: DadosExtraidosCV,
  textoCV: string
): Promise<{ pessoa_id: number; atualizado: boolean }> {
  console.log('💾 Salvando no Banco de Talentos:', dados.nome);

  // Verificar se CPF já existe
  const verificacao = await verificarCPFExistente(dados.cpf || '');

  const pessoaData = {
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone,
    cpf: dados.cpf,
    titulo_profissional: dados.titulo_profissional,
    senioridade: dados.senioridade,
    disponibilidade: dados.disponibilidade || 'A combinar',
    modalidade_preferida: dados.modalidade_preferida || 'Remoto',
    pretensao_salarial: dados.pretensao_salarial || 0,
    cidade: dados.cidade,
    estado: dados.estado,
    cv_texto_completo: textoCV,
    cv_processado: true,
    cv_processado_em: new Date().toISOString(),
    resumo_profissional: dados.resumo_profissional,
    ativo: true,
    origem: 'importacao_cv',
    atualizado_em: new Date().toISOString()
  };

  try {
    let pessoa_id: number;
    let atualizado = false;

    if (verificacao.existe && verificacao.pessoa_id) {
      // ATUALIZAR pessoa existente
      const { data, error } = await supabase
        .from('pessoas')
        .update(pessoaData)
        .eq('id', verificacao.pessoa_id)
        .select()
        .single();

      if (error) throw error;
      
      pessoa_id = data.id;
      atualizado = true;
      console.log(`✅ Pessoa ATUALIZADA: ${dados.nome} (ID: ${pessoa_id})`);

    } else {
      // INSERIR nova pessoa
      const { data, error } = await supabase
        .from('pessoas')
        .insert({
          ...pessoaData,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      pessoa_id = data.id;
      console.log(`✅ Pessoa INSERIDA: ${dados.nome} (ID: ${pessoa_id})`);
    }

    // Salvar Skills
    await salvarSkillsPessoa(pessoa_id, dados.skills, atualizado);

    // Salvar Experiências
    await salvarExperienciasPessoa(pessoa_id, dados.experiencias, atualizado);

    // Salvar Formações
    await salvarFormacoesPessoa(pessoa_id, dados.formacoes, atualizado);

    return { pessoa_id, atualizado };

  } catch (error: any) {
    console.error('❌ Erro ao salvar no Banco de Talentos:', error);
    throw new Error(`Falha ao salvar pessoa: ${error.message}`);
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function salvarSkillsPessoa(
  pessoa_id: number, 
  skills: SkillExtraida[],
  atualizar: boolean
): Promise<void> {
  if (!skills || skills.length === 0) return;

  try {
    // Se atualizando, remover skills antigas
    if (atualizar) {
      await supabase
        .from('pessoa_skills')
        .delete()
        .eq('pessoa_id', pessoa_id);
    }

    // Inserir novas skills
    const skillsData = skills.map(s => ({
      pessoa_id,
      skill_nome: s.nome,
      skill_categoria: s.categoria,
      nivel: s.nivel === 'basico' ? 'Básico' : 
             s.nivel === 'intermediario' ? 'Intermediário' :
             s.nivel === 'avancado' ? 'Avançado' : 'Especialista',
      anos_experiencia: s.anos_experiencia || 0,
      certificado: false,
      criado_em: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('pessoa_skills')
      .insert(skillsData);

    if (error) {
      console.warn('Aviso ao salvar skills:', error.message);
    } else {
      console.log(`✅ ${skills.length} skills salvas`);
    }

  } catch (error) {
    console.warn('Aviso ao salvar skills:', error);
  }
}

async function salvarExperienciasPessoa(
  pessoa_id: number,
  experiencias: ExperienciaExtraida[],
  atualizar: boolean
): Promise<void> {
  if (!experiencias || experiencias.length === 0) return;

  try {
    // Se atualizando, remover experiências antigas
    if (atualizar) {
      await supabase
        .from('pessoa_experiencias')
        .delete()
        .eq('pessoa_id', pessoa_id);
    }

    // Inserir novas experiências
    const expData = experiencias.map(e => ({
      pessoa_id,
      empresa: e.empresa,
      cargo: e.cargo,
      data_inicio: e.data_inicio,
      data_fim: e.data_fim,
      atual: e.atual,
      descricao: e.descricao,
      tecnologias_usadas: e.tecnologias,
      criado_em: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('pessoa_experiencias')
      .insert(expData);

    if (error) {
      console.warn('Aviso ao salvar experiências:', error.message);
    } else {
      console.log(`✅ ${experiencias.length} experiências salvas`);
    }

  } catch (error) {
    console.warn('Aviso ao salvar experiências:', error);
  }
}

async function salvarFormacoesPessoa(
  pessoa_id: number,
  formacoes: FormacaoExtraida[],
  atualizar: boolean
): Promise<void> {
  if (!formacoes || formacoes.length === 0) return;

  try {
    // Se atualizando, remover formações antigas
    if (atualizar) {
      await supabase
        .from('pessoa_formacao')
        .delete()
        .eq('pessoa_id', pessoa_id);
    }

    // Inserir novas formações
    const formData = formacoes.map(f => ({
      pessoa_id,
      instituicao: f.instituicao,
      curso: f.curso,
      grau: f.grau,
      data_conclusao: f.ano_conclusao ? `${f.ano_conclusao}-01-01` : null,
      em_andamento: f.em_andamento,
      criado_em: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('pessoa_formacao')
      .insert(formData);

    if (error) {
      console.warn('Aviso ao salvar formações:', error.message);
    } else {
      console.log(`✅ ${formacoes.length} formações salvas`);
    }

  } catch (error) {
    console.warn('Aviso ao salvar formações:', error);
  }
}

function calcularAnosExperiencia(experiencias: ExperienciaExtraida[]): number {
  if (!experiencias || experiencias.length === 0) return 0;

  let totalMeses = 0;
  const hoje = new Date();

  for (const exp of experiencias) {
    const inicio = exp.data_inicio ? new Date(exp.data_inicio) : null;
    const fim = exp.atual ? hoje : (exp.data_fim ? new Date(exp.data_fim) : hoje);

    if (inicio) {
      const meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
      totalMeses += Math.max(0, meses);
    }
  }

  return Math.round(totalMeses / 12);
}

// ============================================
// FUNÇÃO COMPLETA: ANALISAR E SALVAR CV
// ============================================

export async function analisarESalvarCV(
  textoCV: string,
  vaga?: Vaga
): Promise<ResultadoAnaliseCV> {
  console.log('🚀 Iniciando análise completa do CV...');

  // 1. Extrair dados do CV
  const dados_extraidos = await extrairDadosCV(textoCV);

  // 2. Verificar se CPF existe
  const verificacaoCPF = await verificarCPFExistente(dados_extraidos.cpf || '');

  // 3. Salvar no Banco de Talentos (SEMPRE)
  const { pessoa_id, atualizado } = await salvarNoBancoTalentos(dados_extraidos, textoCV);

  // 4. Calcular compatibilidade se vaga foi informada
  let score_compatibilidade: ScoreCompatibilidade | undefined;
  if (vaga) {
    score_compatibilidade = await calcularCompatibilidade(dados_extraidos, vaga);
  }

  console.log('✅ Análise completa finalizada!');

  return {
    dados_extraidos,
    score_compatibilidade,
    pessoa_id,
    cpf_existente: verificacaoCPF.existe,
    pessoa_atualizada: atualizado
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  extrairDadosCV,
  calcularCompatibilidade,
  verificarCPFExistente,
  salvarNoBancoTalentos,
  analisarESalvarCV
};
