// ============================================================
// AI ROUTER - Roteador Híbrido Gemini + Claude
// Distribui requisições: 70% Gemini | 30% Claude
// ============================================================
// Caminho: src/services/aiRouter.ts
// ============================================================

import * as claudeService from './claudeService';
import type { 
  DadosCandidato, 
  DadosVaga, 
  DadosEmpresa,
  RecomendacaoFinal,
  AnaliseRisco,
  AvaliacaoEntrevista,
  PerguntaTecnica,
  JustificativaCliente,
  AnaliseFitCultural,
  AnaliseGapsCompleta,
  GapAnalise
} from './claudeService';

// ============================================================
// TIPOS DO ROTEADOR
// ============================================================

export type AIProvider = 'gemini' | 'claude';

export interface RouteConfig {
  provider: AIProvider;
  fallback?: AIProvider;
  descricao: string;
  custoEstimado: string; // Por requisição em R$
}

export interface AIRequestResult<T> {
  success: boolean;
  provider: AIProvider;
  data?: T;
  error?: string;
  tempoMs?: number;
}

export interface TriagemResult {
  aprovado: boolean;
  score: number;
  motivo: string;
  categoria?: string;
}

export interface ClassificacaoResult {
  senioridade: 'JUNIOR' | 'PLENO' | 'SENIOR' | 'ESPECIALISTA';
  areas: string[];
  tags: string[];
  disponibilidade_estimada: 'IMEDIATA' | '15_DIAS' | '30_DIAS' | 'NEGOCIAR';
}

export interface ExtrairCVResult {
  nome: string;
  email?: string;
  telefone?: string;
  linkedin_url?: string;
  titulo_profissional?: string;
  senioridade?: string;
  resumo_profissional?: string;
  skills: string[];
  experiencias: {
    empresa: string;
    cargo: string;
    periodo: string;
    descricao?: string;
  }[];
  formacao: {
    instituicao: string;
    curso: string;
    nivel: string;
    conclusao?: string;
  }[];
  idiomas: {
    idioma: string;
    nivel: string;
  }[];
  cidade?: string;
  estado?: string;
  pretensao_salarial?: number;
}

export interface RequisitosEstruturados {
  skills_obrigatorias: string[];
  skills_desejaveis: string[];
  experiencia_minima: string;
  formacao: string;
  idiomas: string[];
  beneficios: string[];
  modalidade?: string;
  local?: string;
}

// ============================================================
// CONFIGURAÇÃO DE ROTEAMENTO
// ============================================================

const ROUTING_CONFIG: Record<string, RouteConfig> = {
  // ========================================
  // GEMINI FLASH (Alto Volume - 70%)
  // ========================================
  'extrair_cv': { 
    provider: 'gemini',
    descricao: 'Extração de dados de CV/PDF',
    custoEstimado: 'R$ 0,003'
  },
  'triagem_inicial': { 
    provider: 'gemini',
    descricao: 'Triagem básica aprovado/reprovado',
    custoEstimado: 'R$ 0,002'
  },
  'classificar_candidato': { 
    provider: 'gemini',
    descricao: 'Classificação de senioridade e área',
    custoEstimado: 'R$ 0,002'
  },
  'parsear_requisitos': { 
    provider: 'gemini',
    descricao: 'Estruturar requisitos de vaga',
    custoEstimado: 'R$ 0,002'
  },
  'gerar_tags': { 
    provider: 'gemini',
    descricao: 'Gerar tags/keywords',
    custoEstimado: 'R$ 0,001'
  },
  'resumir_cv': { 
    provider: 'gemini',
    descricao: 'Resumo executivo do CV',
    custoEstimado: 'R$ 0,002'
  },
  'normalizar_dados': { 
    provider: 'gemini',
    descricao: 'Padronização de dados',
    custoEstimado: 'R$ 0,001'
  },
  
  // ========================================
  // CLAUDE HAIKU (Decisões Críticas - 30%)
  // ========================================
  'recomendar_decisao_final': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Recomendação final com análise de GAPs',
    custoEstimado: 'R$ 0,037'
  },
  'analisar_risco': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Análise de riscos detalhada',
    custoEstimado: 'R$ 0,030'
  },
  'avaliar_entrevista': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Avaliação completa de entrevista',
    custoEstimado: 'R$ 0,050'
  },
  'gerar_perguntas_tecnicas': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Perguntas técnicas personalizadas',
    custoEstimado: 'R$ 0,025'
  },
  'match_detalhado': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Match vaga×candidato com GAPs',
    custoEstimado: 'R$ 0,037'
  },
  'justificativa_cliente': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Justificativa profissional para cliente',
    custoEstimado: 'R$ 0,025'
  },
  'analisar_fit_cultural': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Análise de fit cultural',
    custoEstimado: 'R$ 0,028'
  },
  'analisar_gaps': { 
    provider: 'claude',
    fallback: 'gemini',
    descricao: 'Análise específica de GAPs',
    custoEstimado: 'R$ 0,030'
  }
};

// ============================================================
// URL da API Gemini existente
// ============================================================

const GEMINI_API_URL = '/api/gemini-analyze';

// ============================================================
// FUNÇÃO AUXILIAR - Chamada Gemini
// ============================================================

async function callGeminiAPI(action: string, payload: any): Promise<any> {
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error(`❌ Erro Gemini API [${action}]:`, error.message);
    throw error;
  }
}

// ============================================================
// ROTEADOR PRINCIPAL
// ============================================================

export async function routeAIRequest<T>(
  action: string,
  payload: any
): Promise<AIRequestResult<T>> {
  const startTime = Date.now();
  const config = ROUTING_CONFIG[action];
  
  if (!config) {
    console.warn(`⚠️ Ação não configurada: ${action}, usando Gemini como padrão`);
    try {
      const data = await callGeminiAPI(action, payload);
      return {
        success: true,
        provider: 'gemini',
        data,
        tempoMs: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        provider: 'gemini',
        error: error.message,
        tempoMs: Date.now() - startTime
      };
    }
  }

  // Log para monitoramento
  console.log(`🤖 AI Router: ${action} → ${config.provider.toUpperCase()} (${config.custoEstimado})`);

  try {
    let data: T;
    
    if (config.provider === 'claude') {
      data = await executeClaude<T>(action, payload);
    } else {
      data = await executeGemini<T>(action, payload);
    }

    return {
      success: true,
      provider: config.provider,
      data,
      tempoMs: Date.now() - startTime
    };

  } catch (error: any) {
    console.error(`❌ Falha em ${config.provider}: ${error.message}`);

    // Tentar fallback se configurado
    if (config.fallback) {
      console.log(`🔄 Tentando fallback: ${config.fallback}`);
      try {
        let data: T;
        
        if (config.fallback === 'claude') {
          data = await executeClaude<T>(action, payload);
        } else {
          data = await executeGemini<T>(action, payload);
        }

        return {
          success: true,
          provider: config.fallback,
          data,
          tempoMs: Date.now() - startTime
        };
      } catch (fallbackError: any) {
        return {
          success: false,
          provider: config.provider,
          error: `Falha principal e fallback: ${error.message} | ${fallbackError.message}`,
          tempoMs: Date.now() - startTime
        };
      }
    }

    return {
      success: false,
      provider: config.provider,
      error: error.message,
      tempoMs: Date.now() - startTime
    };
  }
}

// ============================================================
// EXECUTOR CLAUDE
// ============================================================

async function executeClaude<T>(action: string, payload: any): Promise<T> {
  switch (action) {
    case 'recomendar_decisao_final':
      return claudeService.recomendarDecisaoFinal(
        payload.candidato,
        payload.vaga,
        payload.scoreInicial
      ) as Promise<T>;

    case 'analisar_risco':
      return claudeService.analisarRiscoDetalhado(
        payload.candidato,
        payload.vaga
      ) as Promise<T>;

    case 'avaliar_entrevista':
      return claudeService.avaliarEntrevista(
        payload.transcricao,
        payload.perguntas,
        payload.vaga,
        payload.candidato
      ) as Promise<T>;

    case 'gerar_perguntas_tecnicas':
      return claudeService.gerarPerguntasTecnicas(
        payload.vaga,
        payload.candidato,
        payload.quantidade || 10,
        payload.focalizarGaps !== false
      ) as Promise<T>;

    case 'match_detalhado':
      return claudeService.matchDetalhadoVagaCandidato(
        payload.candidato,
        payload.vaga
      ) as Promise<T>;

    case 'justificativa_cliente':
      return claudeService.gerarJustificativaCliente(
        payload.candidato,
        payload.vaga,
        payload.decisao,
        payload.motivos,
        payload.gapsRelevantes
      ) as Promise<T>;

    case 'analisar_fit_cultural':
      return claudeService.analisarFitCultural(
        payload.candidato,
        payload.empresa
      ) as Promise<T>;

    case 'analisar_gaps':
      return claudeService.analisarGapsApenas(
        payload.candidato,
        payload.vaga
      ) as Promise<T>;

    default:
      throw new Error(`Ação Claude não implementada: ${action}`);
  }
}

// ============================================================
// EXECUTOR GEMINI
// ============================================================

async function executeGemini<T>(action: string, payload: any): Promise<T> {
  // Mapeamento de actions para o formato esperado pelo geminiService existente
  const geminiAction = mapActionToGemini(action);
  return callGeminiAPI(geminiAction, payload) as Promise<T>;
}

function mapActionToGemini(action: string): string {
  const mapping: Record<string, string> = {
    'extrair_cv': 'extrair_cv',
    'triagem_inicial': 'triagem_inicial',
    'classificar_candidato': 'classificar_candidato',
    'parsear_requisitos': 'parsear_requisitos',
    'gerar_tags': 'gerar_tags',
    'resumir_cv': 'resumir_cv',
    'normalizar_dados': 'normalizar_dados',
    // Fallbacks do Claude para Gemini
    'recomendar_decisao_final': 'analisar_candidato',
    'analisar_risco': 'analisar_risco',
    'avaliar_entrevista': 'analisar_entrevista',
    'gerar_perguntas_tecnicas': 'gerar_perguntas',
    'match_detalhado': 'analisar_candidato',
    'justificativa_cliente': 'gerar_justificativa',
    'analisar_fit_cultural': 'analisar_fit',
    'analisar_gaps': 'analisar_candidato'
  };
  
  return mapping[action] || action;
}

// ============================================================
// FUNÇÕES DE CONVENIÊNCIA - Alto Nível
// ============================================================

/**
 * Extrai dados de um CV (Gemini)
 */
export async function extrairCV(
  textoOuBase64: string,
  isPDF: boolean = false
): Promise<AIRequestResult<ExtrairCVResult>> {
  return routeAIRequest<ExtrairCVResult>('extrair_cv', {
    [isPDF ? 'base64PDF' : 'textoCV']: textoOuBase64
  });
}

/**
 * Triagem inicial de candidato (Gemini)
 */
export async function triagemInicial(
  dadosCV: DadosCandidato,
  requisitos: RequisitosEstruturados
): Promise<AIRequestResult<TriagemResult>> {
  return routeAIRequest<TriagemResult>('triagem_inicial', {
    dadosCV,
    requisitos
  });
}

/**
 * Classificar candidato (Gemini)
 */
export async function classificarCandidato(
  dadosCV: DadosCandidato
): Promise<AIRequestResult<ClassificacaoResult>> {
  return routeAIRequest<ClassificacaoResult>('classificar_candidato', {
    dadosCV
  });
}

/**
 * Recomendação final com análise de GAPs (Claude)
 */
export async function recomendarComGaps(
  candidato: DadosCandidato,
  vaga: DadosVaga,
  scoreTriagem?: number
): Promise<AIRequestResult<RecomendacaoFinal>> {
  return routeAIRequest<RecomendacaoFinal>('recomendar_decisao_final', {
    candidato,
    vaga,
    scoreInicial: scoreTriagem || 0
  });
}

/**
 * Análise de risco detalhada (Claude)
 */
export async function analisarRisco(
  candidato: DadosCandidato,
  vaga: DadosVaga
): Promise<AIRequestResult<AnaliseRisco>> {
  return routeAIRequest<AnaliseRisco>('analisar_risco', {
    candidato,
    vaga
  });
}

/**
 * Análise específica de GAPs (Claude)
 */
export async function analisarGaps(
  candidato: DadosCandidato,
  vaga: DadosVaga
): Promise<AIRequestResult<AnaliseGapsCompleta>> {
  return routeAIRequest<AnaliseGapsCompleta>('analisar_gaps', {
    candidato,
    vaga
  });
}

/**
 * Avaliar entrevista (Claude)
 */
export async function avaliarEntrevista(
  transcricao: string,
  perguntas: PerguntaTecnica[],
  vaga: DadosVaga,
  candidato?: DadosCandidato
): Promise<AIRequestResult<AvaliacaoEntrevista>> {
  return routeAIRequest<AvaliacaoEntrevista>('avaliar_entrevista', {
    transcricao,
    perguntas,
    vaga,
    candidato
  });
}

/**
 * Gerar perguntas técnicas (Claude)
 */
export async function gerarPerguntas(
  vaga: DadosVaga,
  candidato: DadosCandidato,
  quantidade: number = 10
): Promise<AIRequestResult<PerguntaTecnica[]>> {
  return routeAIRequest<PerguntaTecnica[]>('gerar_perguntas_tecnicas', {
    vaga,
    candidato,
    quantidade,
    focalizarGaps: true
  });
}

// ============================================================
// FLUXO COMPLETO DE ANÁLISE DE CANDIDATO
// ============================================================

export interface FluxoAnaliseCompleto {
  extracao: ExtrairCVResult;
  classificacao: ClassificacaoResult;
  triagem: TriagemResult;
  recomendacao?: RecomendacaoFinal;
  risco?: AnaliseRisco;
  custoTotal: string;
  tempoTotal: number;
}

/**
 * Executa o fluxo completo de análise de candidato
 * Gemini → Triagem → (se aprovado) → Claude → Decisão
 */
export async function fluxoAnaliseCompleto(
  cvTextoOuBase64: string,
  vaga: DadosVaga,
  isPDF: boolean = false
): Promise<AIRequestResult<FluxoAnaliseCompleto>> {
  const startTime = Date.now();
  let custoAcumulado = 0;

  try {
    // 1. Extração de CV (Gemini)
    console.log('📄 Etapa 1: Extraindo CV...');
    const extracaoResult = await extrairCV(cvTextoOuBase64, isPDF);
    if (!extracaoResult.success || !extracaoResult.data) {
      throw new Error(`Falha na extração: ${extracaoResult.error}`);
    }
    custoAcumulado += 0.003;

    // 2. Classificação (Gemini)
    console.log('🏷️ Etapa 2: Classificando candidato...');
    const classificacaoResult = await classificarCandidato(extracaoResult.data);
    if (!classificacaoResult.success || !classificacaoResult.data) {
      throw new Error(`Falha na classificação: ${classificacaoResult.error}`);
    }
    custoAcumulado += 0.002;

    // 3. Parsear requisitos da vaga se necessário
    const requisitos: RequisitosEstruturados = {
      skills_obrigatorias: vaga.requisitos_obrigatorios || vaga.skills_requeridas || [],
      skills_desejaveis: vaga.requisitos_desejaveis || [],
      experiencia_minima: vaga.senioridade || '',
      formacao: '',
      idiomas: [],
      beneficios: []
    };

    // 4. Triagem inicial (Gemini)
    console.log('🔍 Etapa 3: Triagem inicial...');
    const triagemResult = await triagemInicial(extracaoResult.data, requisitos);
    if (!triagemResult.success || !triagemResult.data) {
      throw new Error(`Falha na triagem: ${triagemResult.error}`);
    }
    custoAcumulado += 0.002;

    const resultado: FluxoAnaliseCompleto = {
      extracao: extracaoResult.data,
      classificacao: classificacaoResult.data,
      triagem: triagemResult.data,
      custoTotal: `R$ ${custoAcumulado.toFixed(3)}`,
      tempoTotal: Date.now() - startTime
    };

    // 5. Se passou na triagem (score > 60), fazer análise profunda com Claude
    if (triagemResult.data.score >= 60) {
      console.log('✅ Etapa 4: Análise profunda com Claude...');
      
      // Recomendação com GAPs
      const recomendacaoResult = await recomendarComGaps(
        extracaoResult.data,
        vaga,
        triagemResult.data.score
      );
      if (recomendacaoResult.success && recomendacaoResult.data) {
        resultado.recomendacao = recomendacaoResult.data;
        custoAcumulado += 0.037;
      }

      // Análise de risco
      const riscoResult = await analisarRisco(extracaoResult.data, vaga);
      if (riscoResult.success && riscoResult.data) {
        resultado.risco = riscoResult.data;
        custoAcumulado += 0.030;
      }

      resultado.custoTotal = `R$ ${custoAcumulado.toFixed(3)}`;
    } else {
      console.log('⏭️ Candidato não passou na triagem - pulando análise profunda');
    }

    resultado.tempoTotal = Date.now() - startTime;

    return {
      success: true,
      provider: 'gemini', // Provider principal do fluxo
      data: resultado,
      tempoMs: resultado.tempoTotal
    };

  } catch (error: any) {
    return {
      success: false,
      provider: 'gemini',
      error: error.message,
      tempoMs: Date.now() - startTime
    };
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Retorna qual provider será usado para uma ação
 */
export function getProviderForAction(action: string): AIProvider {
  return ROUTING_CONFIG[action]?.provider || 'gemini';
}

/**
 * Retorna estatísticas de roteamento
 */
export function getRoutingStats(): {
  gemini: { actions: string[]; percentual: number };
  claude: { actions: string[]; percentual: number };
} {
  const geminiActions: string[] = [];
  const claudeActions: string[] = [];

  for (const [action, config] of Object.entries(ROUTING_CONFIG)) {
    if (config.provider === 'gemini') {
      geminiActions.push(action);
    } else {
      claudeActions.push(action);
    }
  }

  const total = geminiActions.length + claudeActions.length;

  return {
    gemini: {
      actions: geminiActions,
      percentual: Math.round((geminiActions.length / total) * 100)
    },
    claude: {
      actions: claudeActions,
      percentual: Math.round((claudeActions.length / total) * 100)
    }
  };
}

/**
 * Retorna configuração de todas as rotas
 */
export function getAllRoutes(): Record<string, RouteConfig> {
  return { ...ROUTING_CONFIG };
}

// ============================================================
// EXPORT
// ============================================================

const aiRouter = {
  routeAIRequest,
  extrairCV,
  triagemInicial,
  classificarCandidato,
  recomendarComGaps,
  analisarRisco,
  analisarGaps,
  avaliarEntrevista,
  gerarPerguntas,
  fluxoAnaliseCompleto,
  getProviderForAction,
  getRoutingStats,
  getAllRoutes
};

export default aiRouter;
