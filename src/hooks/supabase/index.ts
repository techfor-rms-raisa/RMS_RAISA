/**
 * Exportação centralizada de todos os hooks do Supabase
 * Permite imports mais limpos: import { useUsers, useClients } from '@/hooks/supabase'
 * 
 * Atualizado v2.0: Adicionados hooks RAISA (26/12/2024)
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
