// ============================================
// CENTRAL DE EXPORTS - TYPES
// ============================================
// Todos os tipos do projeto organizados e centralizados
// 
// COMO USAR:
// import { User, Vaga, Client } from '@/types';
// ou
// import { User, Vaga, Client } from '../types';
// ============================================

// Models (Vagas, Candidaturas, etc)
export * from './models';

// Users (User, Consultant, Client)
export * from './users';

// Reports (IA, Análises, Priorização)
export * from './reports';

// Compliance (Templates, Campaigns, Feedback)
export * from './compliance';

// ============================================
// RE-EXPORTS PARA COMPATIBILIDADE
// ============================================
// Mantém compatibilidade com código existente

export type {
  // Models
  RiskScore,
  ConsultantStatus,
  TerminationReason,
  View,
  Vaga,
  Pessoa,
  Candidatura,
  RiskFactor,
  CandidaturaEnvio,
  CandidaturaAprovacao,
  VagaAnaliseIA
} from './models';

export type {
  // Users
  UserRole,
  User,
  Client,
  Cliente,
  UsuarioCliente,
  CoordenadorCliente,
  Consultant,
  ConsultantReport,
  Recommendation
} from './users';

export type {
  // Reports
  AIAnalysisResult,
  FlagType,
  BehavioralFlag,
  LearningFeedbackLoop,
  PerguntaTecnica,
  RespostaCandidato,
  ItemQualificacao,
  MatrizQualificacao,
  AvaliacaoIA,
  Analista,
  VagaPriorizacaoScore,
  AnalistaFitScore,
  DadosVagaPrioridade,
  DadosRecomendacaoAnalista
} from './reports';

export type {
  // Compliance
  TemplateStatus,
  EmailTemplate,
  ComplianceCampaign,
  FeedbackRequest,
  FeedbackResponse,
  RHAction,
  RecommendationCategory,
  SupabaseRecommendation
} from './compliance';