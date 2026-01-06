/**
 * Exportação centralizada de todos os hooks do Supabase
 * Permite imports mais limpos: import { useUsers, useClients } from '@/hooks/supabase'
 * 
 * Atualizado v2.0: Adicionados hooks RAISA (26/12/2024)
 * Atualizado v2.1: Adicionados hooks de Distribuição e ML (28/12/2024)
 * Atualizado v2.2: Adicionado useAnaliseCandidato (30/12/2025)
 */

// Hooks base
export { useUsers } from './useUsers';
export { useClients } from './useClients';
export { useGestoresCliente } from './useGestoresCliente';
export { useCoordenadoresCliente } from './useCoordenadoresCliente';
export { useConsultants } from './useConsultants';
export { useTemplates } from './useTemplates';
export { useCampaigns } from './useCampaigns';
export { useVagas } from './useVagas';
export { usePessoas } from './usePessoas';
export { useCandidaturas } from './useCandidaturas';
export { useReportAnalysis } from './useReportAnalysis';

// Hooks RAISA
export { useRaisaInterview } from './useRaisaInterview';
export { useRaisaEnvios } from './useRaisaEnvios';
export { useVagaAnaliseIA } from './useVagaAnaliseIA';
export { useRaisaCVSearch } from './useRaisaCVSearch';

// Hooks CV (Sprint 1 - Integração 27/12/2024)
export { useCVTemplates } from './useCVTemplates';
export { useCVGenerator } from './useCVGenerator';

// Hooks Recomendação de Candidatos (Sprint 2 - Integração 27/12/2024)
export { useRecomendacaoCandidato } from './useRecomendacaoCandidato';

// Hooks Dashboards (Sprint 3 - Integração 27/12/2024)
export { useDashboardRAISA } from './useDashboardRAISA';
export { useRaisaMetrics } from './useRaisaMetrics';

// ============================================
// HOOKS ADICIONADOS EM 28/12/2024
// ============================================

// Hooks de Distribuição e Priorização
export { useDistribuicaoIA } from './useDistribuicaoIA';
export { useDistribuicaoVagas } from './useDistribuicaoVagas';
export { usePriorizacaoDistribuicao } from './usePriorizacaoDistribuicao';

// Hooks de Integração Externa
export { useLinkedInIntegration } from './useLinkedInIntegration';

// Hooks de ML e Aprendizado
export { useMLLearning } from './useMLLearning';

// Hooks de Movimentações e Posição Comercial
export { useMovimentacoes } from './useMovimentacoes';
export { usePosicaoComercial } from './usePosicaoComercial';

// Hooks de Áudio
export { useAudioEntrevista } from './useAudioEntrevista';

// ============================================
// HOOKS ADICIONADOS EM 30/12/2025
// ============================================

// Hook de Análise de Candidatos (Nova Candidatura)
export { useAnaliseCandidato } from './useAnaliseCandidato';

// ============================================
// HOOKS ADICIONADOS EM 06/01/2026
// ============================================

// Hook de Análise de CV com IA (Integração RAISA)
export { useCandidaturaAnaliseIA } from './useCandidaturaAnaliseIA';
export type { AnaliseCV, FatorRisco, SkillsMatch } from './useCandidaturaAnaliseIA';
