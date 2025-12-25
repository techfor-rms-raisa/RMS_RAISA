/**
 * Exportação centralizada de todos os hooks do Supabase
 * Permite imports mais limpos: import { useUsers, useClients } from '@/hooks/supabase'
 */

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

// RAISA - Novos hooks de integração (v2.0)
export { useRaisaInterview } from './useRaisaInterview';
export { useRaisaEnvios } from './useRaisaEnvios';
export { useVagaAnaliseIA } from './useVagaAnaliseIA';
