/**
 * useResponsaveis.ts — Hook de listagem de usuários elegíveis a serem
 *   responsáveis por leads (Gestão Comercial + SDR).
 *
 * Caminho: src/components/crm/shared/hooks/useResponsaveis.ts
 * Versão: 1.0 (Lead RBAC fix — 05/06/2026)
 *
 * Responsabilidade:
 *  - Carregar via GET /api/crm-leads?action=listar_responsaveis_lead
 *    a lista de usuários onde tipo_usuario IN ('Gestão Comercial','SDR').
 *  - Usado pelo BaseLeadsPage para alimentar o seletor "Reservado para"
 *    no LeadFormModal — exclusivo para o perfil Administrador (que
 *    escolhe entre GC/SDR ao criar um lead). Outros perfis travam
 *    em si mesmos e por isso não precisam dessa lista.
 *
 * Comportamento:
 *  - Lazy load: só dispara `carregar()` quando o BaseLeadsPage decide
 *    (no caso, no mount apenas se currentUser for Administrador).
 *  - Em caso de erro, deixa `responsaveis = []` (o form vai mostrar
 *    aviso "Nenhum responsável disponível").
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { ResponsavelLite } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarResponsaveisResponse {
  success: boolean;
  responsaveis: ResponsavelLite[];
  error?: string;
}

interface UseResponsaveisOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useResponsaveis(options: UseResponsaveisOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const api = useCrmApi(apiUrl);

  const [responsaveis, setResponsaveis] = useState<ResponsavelLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get<ListarResponsaveisResponse>('listar_responsaveis_lead');
      if (resp.ok && resp.data?.success) {
        setResponsaveis(resp.data.responsaveis || []);
      } else {
        console.error('[useResponsaveis] Erro:', resp.error || resp.data?.error);
        setResponsaveis([]);
      }
      setCarregado(true);
    } catch (err) {
      console.error('[useResponsaveis] Exceção:', err);
      setResponsaveis([]);
      setCarregado(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  return {
    responsaveis,
    loading,
    carregado,
    carregar,
  };
}

export default useResponsaveis;
