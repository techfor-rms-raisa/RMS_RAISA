// ============================================
// ANÁLISES DE IA
// ============================================

import type { RiskScore } from './models';
import type { Recommendation } from './users';

export interface AIAnalysisResult {
  consultantName: string;
  managerName?: string;
  reportMonth: number;
  riskScore: RiskScore;
  summary: string;
  negativePattern: string;
  predictiveAlert: string;
  recommendations: Recommendation[];
  details: string;
}

// ============================================
// BEHAVIORAL FLAGS & LEARNING
// ============================================

export type FlagType = 'ATTENDANCE' | 'COMMUNICATION' | 'QUALITY' | 'ENGAGEMENT' | 'OTHER';

export interface BehavioralFlag {
  id: string;
  reportId?: string;
  consultantId: number;
  flagType: FlagType;
  description: string;
  flagDate: string;
}

export interface LearningFeedbackLoop {
  id: string;
  personId: number; 
  terminationReason: string;
  candidacyRisks: any;
  behavioralHistory: BehavioralFlag[]; 
  createdAt: string;
}

// ============================================
// ENTREVISTA TÉCNICA & AVALIAÇÃO
// ============================================

export interface PerguntaTecnica {
  id: string;
  vaga_id: string;
  pergunta_texto: string;
  categoria: 'tecnica' | 'comportamental' | 'experiencia';
  tecnologia_relacionada?: string;
  nivel_dificuldade: 'junior' | 'pleno' | 'senior';
  resposta_esperada: string;
  pontos_chave: { ponto: string; importancia: 'alta' | 'media' | 'baixa' }[];
  ordem: number;
}

export interface RespostaCandidato {
  id: string;
  pergunta_id: string;
  resposta_texto: string;
  impressao_analista?: 'excelente' | 'boa' | 'regular' | 'fraca';
  observacoes_analista?: string;
}

export interface ItemQualificacao {
  tecnologia: string;
  tempo_experiencia_meses: number;
  nivel: 'junior' | 'pleno' | 'senior';
}

export interface MatrizQualificacao {
  candidatura_id: string;
  qualificacoes: ItemQualificacao[];
}

export interface AvaliacaoIA {
  candidatura_id: string;
  score_geral: number;
  recomendacao: 'aprovado' | 'reprovado' | 'condicional';
  pontos_fortes: { aspecto: string; justificativa: string }[];
  gaps_identificados: { gap: string; severidade: string; impacto: string }[];
  requisitos_atendidos: { requisito: string; atendido: boolean; justificativa: string }[];
  justificativa: string;
  avaliado_em: string;
  decisao_final?: 'aprovado' | 'reprovado' | 'em_duvida';
}

// ============================================
// PRIORIZAÇÃO INTELIGENTE DE VAGAS
// ============================================

export interface Analista {
  id: number;
  nome: string;
  email: string;
  stack_experiencia: string[];
  carga_trabalho_atual: number;
  historico_aprovacao_cliente: {
    cliente_id: number;
    taxa_aprovacao: number;
    vagas_fechadas: number;
  }[];
  taxa_aprovacao_geral: number;
  tempo_medio_fechamento_dias: number;
}

export interface VagaPriorizacaoScore {
  vaga_id: string;
  score_prioridade: number; // 0-100
  nivel_prioridade: 'Alta' | 'Média' | 'Baixa';
  sla_dias: number;
  justificativa: string;
  fatores_considerados: {
    urgencia_prazo: number;
    valor_faturamento: number;
    cliente_vip: boolean;
    tempo_vaga_aberta: number;
    complexidade_stack: number;
  };
  calculado_em: string;
}

export interface AnalistaFitScore {
  vaga_id: string;
  analista_id: number;
  analista_nome: string;
  score_match: number; // 0-100
  nivel_adequacao: 'Excelente' | 'Bom' | 'Regular' | 'Baixo';
  justificativa_match: string;
  fatores_match: {
    fit_stack_tecnologica: number;
    fit_cliente: number;
    disponibilidade: number;
    taxa_sucesso_historica: number;
  };
  tempo_estimado_fechamento_dias: number;
  recomendacao: 'Altamente Recomendado' | 'Recomendado' | 'Adequado' | 'Não Recomendado';
  calculado_em: string;
}

export interface DadosVagaPrioridade {
  vaga_id: string;
  titulo_vaga: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_vip: boolean;
  prazo_fechamento?: string;
  faturamento_estimado?: number;
  stack_tecnologica: string[];
  senioridade: string;
  dias_vaga_aberta: number;
  media_dias_vagas_similares?: number;
  flag_urgencia?: string;
  data_limite?: string;
  dias_ate_data_limite?: number | null;
  qtde_maxima_distribuicao?: number;
}

export interface DadosRecomendacaoAnalista {
  vaga: DadosVagaPrioridade;
  analistas_disponiveis: Analista[];
  prioridade_vaga: VagaPriorizacaoScore;
}