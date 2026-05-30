/**
 * useLeads.ts — Hook de gestão de Leads
 *
 * Caminho: src/components/crm/shared/hooks/useLeads.ts
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Responsabilidade:
 *  - Listagem, filtros, paginação, CRUD, detalhe e mudança de funil.
 *  - Comportamento idêntico ao EmpresasLeadsCRM.tsx original
 *    (linhas 218-240 + 298-380).
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { Lead, LeadInput, HistoricoItem, CRMStats } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarLeadsResponse {
  success: boolean;
  leads: Lead[];
  total: number;
  error?: string;
}

export interface DetalheLeadResponse {
  success: boolean;
  lead: Lead;
  historico: HistoricoItem[];
  campanhas: any[];
  respostas: any[];
  error?: string;
}

interface SalvarLeadResponse {
  success: boolean;
  lead?: Lead;
  opt_out_warning?: boolean;
  error?: string;
}

interface StatsResponse {
  success: boolean;
  stats: CRMStats;
  error?: string;
}

interface UseLeadsOptions {
  apiUrl?: string;
  pageSize?: number;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useLeads(options: UseLeadsOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 30;

  const api = useCrmApi(apiUrl);

  // Estado de listagem
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [filtroFunil, setFiltroFunil] = useState('');
  const [loading, setLoading] = useState(false);

  // Estado de detalhe
  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<HistoricoItem[]>([]);
  const [campanhasDoLead, setCampanhasDoLead] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<any[]>([]);

  // Stats (KPIs do topo da página)
  const [stats, setStats] = useState<CRMStats | null>(null);

  // ════════════════════════════════════════════════════════════
  // LISTAR
  // ════════════════════════════════════════════════════════════

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagina,
        limit: pageSize,
      };
      if (busca) params.busca = busca;
      if (filtroFunil) params.funil = filtroFunil;

      const resp = await api.get<ListarLeadsResponse>('listar_leads', params);
      if (resp.ok && resp.data?.success) {
        setLeads(resp.data.leads);
        setTotal(resp.data.total);
      } else {
        console.error('Erro ao carregar leads:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api, pagina, pageSize, busca, filtroFunil]);

  // ════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════

  const carregarStats = useCallback(async () => {
    try {
      const resp = await api.get<StatsResponse>('stats');
      if (resp.ok && resp.data?.success) {
        setStats(resp.data.stats);
      }
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }, [api]);

  // ════════════════════════════════════════════════════════════
  // SALVAR (criar ou atualizar)
  // ════════════════════════════════════════════════════════════

  const salvar = useCallback(
    async (
      form: Partial<LeadInput> & { id?: number },
      criadoPor: string
    ): Promise<boolean> => {
      const isEdit = typeof form.id === 'number';
      const action = isEdit ? 'atualizar_lead' : 'criar_lead';
      const method = isEdit ? api.patch : api.post;

      setLoading(true);
      try {
        const resp = await method<SalvarLeadResponse>(action, {
          ...form,
          criado_por: criadoPor,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao salvar lead');
          return false;
        }
        if (resp.data.opt_out_warning) {
          alert(
            '⚠️ Este email está na lista de opt-out global. ' +
              'O lead foi criado mas não receberá campanhas.'
          );
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // DETALHE
  // ════════════════════════════════════════════════════════════

  const abrirDetalhe = useCallback(
    async (id: number): Promise<DetalheLeadResponse | null> => {
      setLoading(true);
      try {
        const resp = await api.get<DetalheLeadResponse>('detalhe_lead', { id });
        if (resp.ok && resp.data?.success) {
          setLeadSelecionado(resp.data.lead);
          setTimeline(resp.data.historico || []);
          setCampanhasDoLead(resp.data.campanhas || []);
          setRespostas(resp.data.respostas || []);
          return resp.data;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const fecharDetalhe = useCallback(() => {
    setLeadSelecionado(null);
    setTimeline([]);
    setCampanhasDoLead([]);
    setRespostas([]);
  }, []);

  // ════════════════════════════════════════════════════════════
  // MUDAR FUNIL
  // ════════════════════════════════════════════════════════════

  const mudarFunil = useCallback(
    async (
      leadId: number,
      novoStatus: string,
      motivoPerda: string | null,
      criadoPor: string
    ): Promise<boolean> => {
      setLoading(true);
      try {
        const resp = await api.patch<{ success: boolean; error?: string }>('mudar_funil', {
          id: leadId,
          novo_status: novoStatus,
          motivo_perda: novoStatus === 'perdido' ? motivoPerda : null,
          criado_por: criadoPor,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao mudar funil');
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    // Listagem
    leads,
    total,
    pagina,
    setPagina,
    busca,
    setBusca,
    filtroFunil,
    setFiltroFunil,
    loading,
    carregar,
    pageSize,
    // Stats
    stats,
    carregarStats,
    // CRUD
    salvar,
    // Detalhe
    leadSelecionado,
    timeline,
    campanhasDoLead,
    respostas,
    abrirDetalhe,
    fecharDetalhe,
    // Funil
    mudarFunil,
  };
}

export default useLeads;
