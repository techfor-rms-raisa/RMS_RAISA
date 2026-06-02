/**
 * useCampanhaLeads.ts — Hook de gestão dos Leads vinculados à campanha
 *
 * Caminho: src/components/crm/shared/hooks/useCampanhaLeads.ts
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Responsabilidade:
 *  - Listar leads disponíveis para vincular (busca)
 *  - Listar leads já vinculados à campanha
 *  - Vincular (em lote) e desvincular
 *  - Manter estado da seleção atual
 *
 * Comportamento idêntico a CampaignBuilder.tsx linhas 238-250 + 427-457.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import { CAMPANHA_API_URL } from '../../types/crm.constants';
import type { LeadCampanha, LeadDisponivel } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA
// ════════════════════════════════════════════════════════════

interface ListarLeadsCampanhaResponse {
  success: boolean;
  leads: LeadCampanha[];
  error?: string;
}

interface LeadsDisponiveisResponse {
  success: boolean;
  leads: LeadDisponivel[];
  error?: string;
}

interface VincularResponse {
  success: boolean;
  vinculados?: number;
  optout_ignorados?: number;
  error?: string;
}

interface DesvincularResponse {
  success: boolean;
  desvinculados?: number;
  error?: string;
}

interface UseCampanhaLeadsOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useCampanhaLeads(options: UseCampanhaLeadsOptions = {}) {
  const apiUrl = options.apiUrl ?? CAMPANHA_API_URL;
  const api = useCrmApi(apiUrl);

  // Estado
  const [vinculados, setVinculados] = useState<LeadCampanha[]>([]);
  const [disponiveis, setDisponiveis] = useState<LeadDisponivel[]>([]);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ════════════════════════════════════════════════════════════
  // LISTAR VINCULADOS
  // ════════════════════════════════════════════════════════════

  const carregarVinculados = useCallback(
    async (campanhaId: number) => {
      setLoading(true);
      try {
        const resp = await api.get<ListarLeadsCampanhaResponse>(
          'listar_leads_campanha',
          { campanha_id: String(campanhaId) }
        );
        if (resp.ok && resp.data?.success) {
          setVinculados(resp.data.leads || []);
        }
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // LISTAR DISPONÍVEIS
  // ════════════════════════════════════════════════════════════

  const carregarDisponiveis = useCallback(
    async (campanhaId: number, buscaTermo?: string) => {
      const params: Record<string, string> = {
        campanha_id: String(campanhaId),
        limit: '100',
      };
      if (buscaTermo) params.busca = buscaTermo;

      const resp = await api.get<LeadsDisponiveisResponse>(
        'leads_disponiveis',
        params
      );
      if (resp.ok && resp.data?.success) {
        setDisponiveis(resp.data.leads || []);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // SELEÇÃO (local)
  // ════════════════════════════════════════════════════════════

  const toggleSelecionado = useCallback((leadId: number) => {
    setSelecionados((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    );
  }, []);

  const limparSelecao = useCallback(() => {
    setSelecionados([]);
  }, []);

  // ════════════════════════════════════════════════════════════
  // VINCULAR (lote)
  // ════════════════════════════════════════════════════════════

  /**
   * @returns objeto com qtd vinculados e qtd ignorados (opt-out),
   *          ou null em caso de erro.
   */
  const vincular = useCallback(
    async (
      campanhaId: number
    ): Promise<{ vinculados: number; optout_ignorados: number } | null> => {
      if (selecionados.length === 0) return null;
      setSaving(true);
      try {
        const resp = await api.post<VincularResponse>('vincular_leads', {
          campanha_id: campanhaId,
          lead_ids: selecionados,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao vincular leads');
          return null;
        }
        setSelecionados([]);
        return {
          vinculados: resp.data.vinculados ?? 0,
          optout_ignorados: resp.data.optout_ignorados ?? 0,
        };
      } finally {
        setSaving(false);
      }
    },
    [api, selecionados]
  );

  // ════════════════════════════════════════════════════════════
  // DESVINCULAR
  // ════════════════════════════════════════════════════════════

  const desvincular = useCallback(
    async (campanhaId: number, leadIds: number[]): Promise<number | null> => {
      const resp = await api.del<DesvincularResponse>('desvincular_leads', {
        campanha_id: String(campanhaId),
        lead_ids: leadIds.join(','),
      });
      if (!resp.ok || !resp.data?.success) {
        alert(resp.data?.error || resp.error || 'Erro ao desvincular leads');
        return null;
      }
      return resp.data.desvinculados ?? 0;
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // RESET (quando troca de campanha ou sai do wizard)
  // ════════════════════════════════════════════════════════════

  const reset = useCallback(() => {
    setVinculados([]);
    setDisponiveis([]);
    setSelecionados([]);
    setBusca('');
  }, []);

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    vinculados,
    disponiveis,
    selecionados,
    busca,
    setBusca,
    loading,
    saving,
    carregarVinculados,
    carregarDisponiveis,
    toggleSelecionado,
    limparSelecao,
    vincular,
    desvincular,
    reset,
  };
}

export default useCampanhaLeads;
