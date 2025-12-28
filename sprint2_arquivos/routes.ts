/**
 * CONSTANTES DE ROTAS - RMS-RAISA
 * Centraliza todas as views para evitar erros de digitação
 * 
 * Uso: import { ROUTES } from '@/constants/routes';
 * 
 * Versão: 1.0
 * Data: 28/12/2024
 */

export const ROUTES = {
  // ============================================
  // RMS - Risk Management System
  // ============================================
  DASHBOARD: 'dashboard',
  QUARANTINE: 'quarantine',
  RECOMMENDATIONS: 'recommendations',
  USERS: 'users',
  CLIENTS: 'clients',
  CONSULTANTS: 'consultants',
  ANALYTICS: 'analytics',
  IMPORT: 'import',
  EXPORT: 'export',
  TEMPLATES: 'templates',
  CAMPAIGNS: 'campaigns',
  COMPLIANCE_DASHBOARD: 'compliance_dashboard',
  FEEDBACK_PORTAL: 'feedback_portal',
  PROFILES: 'profiles',
  
  // ============================================
  // ATIVIDADES
  // ============================================
  ATIVIDADES_INSERIR: 'atividades_inserir',
  ATIVIDADES_CONSULTAR: 'atividades_consultar',
  ATIVIDADES_EXPORTAR: 'atividades_exportar',
  
  // ============================================
  // MOVIMENTAÇÕES
  // ============================================
  MOVIMENTACOES: 'movimentacoes',
  POSICAO_COMERCIAL: 'posicao_comercial',
  
  // ============================================
  // RAISA - Recruitment AI System Assistant
  // ============================================
  VAGAS: 'vagas',
  CANDIDATURAS: 'candidaturas',
  ANALISE_RISCO: 'analise_risco',
  PIPELINE: 'pipeline',
  TALENTOS: 'talentos',
  CONTROLE_ENVIOS: 'controle_envios',
  ENTREVISTA_TECNICA: 'entrevista_tecnica',
  
  // ============================================
  // RAISA - IMPORTAÇÃO E DISTRIBUIÇÃO
  // ============================================
  LINKEDIN_IMPORT: 'linkedin_import',
  DISTRIBUICAO_IA: 'distribuicao_ia',
  CONFIGURACAO_PRIORIZACAO: 'configuracao_priorizacao',
  
  // ============================================
  // RAISA - DASHBOARDS
  // ============================================
  DASHBOARD_FUNIL: 'dashboard_funil',
  DASHBOARD_APROVACAO: 'dashboard_aprovacao',
  DASHBOARD_ANALISTAS: 'dashboard_analistas',
  DASHBOARD_GERAL: 'dashboard_geral',
  DASHBOARD_CLIENTES: 'dashboard_clientes',
  DASHBOARD_TEMPO: 'dashboard_tempo',
  DASHBOARD_ML: 'dashboard_ml',
  DASHBOARD_PERFORMANCE_IA: 'dashboard_performance_ia',
  DASHBOARD_RAISA_METRICS: 'dashboard_raisa_metrics',
} as const;

// Tipo derivado das constantes
export type Route = typeof ROUTES[keyof typeof ROUTES];

// ============================================
// AGRUPAMENTOS POR MÓDULO
// ============================================

export const RMS_ROUTES = [
  ROUTES.DASHBOARD,
  ROUTES.QUARANTINE,
  ROUTES.RECOMMENDATIONS,
  ROUTES.USERS,
  ROUTES.CLIENTS,
  ROUTES.CONSULTANTS,
  ROUTES.ANALYTICS,
  ROUTES.IMPORT,
  ROUTES.EXPORT,
  ROUTES.TEMPLATES,
  ROUTES.CAMPAIGNS,
  ROUTES.COMPLIANCE_DASHBOARD,
  ROUTES.FEEDBACK_PORTAL,
  ROUTES.PROFILES,
  ROUTES.MOVIMENTACOES,
  ROUTES.POSICAO_COMERCIAL,
] as const;

export const ATIVIDADES_ROUTES = [
  ROUTES.ATIVIDADES_INSERIR,
  ROUTES.ATIVIDADES_CONSULTAR,
  ROUTES.ATIVIDADES_EXPORTAR,
] as const;

export const RAISA_ROUTES = [
  ROUTES.VAGAS,
  ROUTES.CANDIDATURAS,
  ROUTES.ANALISE_RISCO,
  ROUTES.PIPELINE,
  ROUTES.TALENTOS,
  ROUTES.CONTROLE_ENVIOS,
  ROUTES.ENTREVISTA_TECNICA,
  ROUTES.LINKEDIN_IMPORT,
  ROUTES.DISTRIBUICAO_IA,
  ROUTES.CONFIGURACAO_PRIORIZACAO,
] as const;

export const RAISA_DASHBOARD_ROUTES = [
  ROUTES.DASHBOARD_FUNIL,
  ROUTES.DASHBOARD_APROVACAO,
  ROUTES.DASHBOARD_ANALISTAS,
  ROUTES.DASHBOARD_GERAL,
  ROUTES.DASHBOARD_CLIENTES,
  ROUTES.DASHBOARD_TEMPO,
  ROUTES.DASHBOARD_ML,
  ROUTES.DASHBOARD_PERFORMANCE_IA,
  ROUTES.DASHBOARD_RAISA_METRICS,
] as const;

// ============================================
// LABELS PARA UI
// ============================================

export const ROUTE_LABELS: Record<Route, string> = {
  // RMS
  [ROUTES.DASHBOARD]: 'Dashboard',
  [ROUTES.QUARANTINE]: 'Quarentena',
  [ROUTES.RECOMMENDATIONS]: 'Recomendações',
  [ROUTES.USERS]: 'Usuários',
  [ROUTES.CLIENTS]: 'Clientes',
  [ROUTES.CONSULTANTS]: 'Consultores',
  [ROUTES.ANALYTICS]: 'Analytics',
  [ROUTES.IMPORT]: 'Importação',
  [ROUTES.EXPORT]: 'Exportação',
  [ROUTES.TEMPLATES]: 'Templates',
  [ROUTES.CAMPAIGNS]: 'Campanhas',
  [ROUTES.COMPLIANCE_DASHBOARD]: 'Compliance',
  [ROUTES.FEEDBACK_PORTAL]: 'Portal Feedback',
  [ROUTES.PROFILES]: 'Perfis',
  [ROUTES.MOVIMENTACOES]: 'Movimentações',
  [ROUTES.POSICAO_COMERCIAL]: 'Posição Comercial',
  
  // Atividades
  [ROUTES.ATIVIDADES_INSERIR]: 'Inserir Atividade',
  [ROUTES.ATIVIDADES_CONSULTAR]: 'Consultar Atividades',
  [ROUTES.ATIVIDADES_EXPORTAR]: 'Exportar Atividades',
  
  // RAISA
  [ROUTES.VAGAS]: 'Vagas',
  [ROUTES.CANDIDATURAS]: 'Candidaturas',
  [ROUTES.ANALISE_RISCO]: 'Análise de Risco',
  [ROUTES.PIPELINE]: 'Pipeline',
  [ROUTES.TALENTOS]: 'Banco de Talentos',
  [ROUTES.CONTROLE_ENVIOS]: 'Controle de Envios',
  [ROUTES.ENTREVISTA_TECNICA]: 'Entrevista Técnica',
  [ROUTES.LINKEDIN_IMPORT]: 'Importar LinkedIn',
  [ROUTES.DISTRIBUICAO_IA]: 'Distribuição IA',
  [ROUTES.CONFIGURACAO_PRIORIZACAO]: 'Config. Priorização',
  
  // RAISA Dashboards
  [ROUTES.DASHBOARD_FUNIL]: 'Funil de Conversão',
  [ROUTES.DASHBOARD_APROVACAO]: 'Aprovação/Reprovação',
  [ROUTES.DASHBOARD_ANALISTAS]: 'Performance Analistas',
  [ROUTES.DASHBOARD_GERAL]: 'Performance Geral',
  [ROUTES.DASHBOARD_CLIENTES]: 'Performance Clientes',
  [ROUTES.DASHBOARD_TEMPO]: 'Análise de Tempo',
  [ROUTES.DASHBOARD_ML]: 'Aprendizado IA',
  [ROUTES.DASHBOARD_PERFORMANCE_IA]: 'Performance IA',
  [ROUTES.DASHBOARD_RAISA_METRICS]: 'Métricas RAISA',
};
