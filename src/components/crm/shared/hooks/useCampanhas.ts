/**
 * useCampanhas.ts — Hook de gestão de Campanhas
 *
 * Caminho: src/components/crm/shared/hooks/useCampanhas.ts
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Responsabilidade:
 *  - Listagem com filtros (status + busca) e paginação local
 *  - Stats (total, ativas, rascunhos, concluídas)
 *  - Tipos de campanha (lista dinâmica)
 *  - CRUD da campanha (criar, atualizar, excluir)
 *  - Mudança de status (rascunho → agendada → ativa → pausada → concluída)
 *  - Carregar detalhe (campanha + steps)
 *
 * Comportamento idêntico a CampaignBuilder.tsx (linhas 196-385) — refatorado.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import { CAMPANHA_API_URL } from '../../types/crm.constants';
import type { Campanha, Step } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarCampanhasResponse {
  success: boolean;
  campanhas: Campanha[];
  total: number;
  error?: string;
}

interface CampanhaStats {
  total: number;
  ativas: number;
  rascunhos: number;
  concluidas: number;
}

interface StatsResponse {
  success: boolean;
  stats: CampanhaStats;
  error?: string;
}

interface TiposResponse {
  success: boolean;
  tipos: string[];
  error?: string;
}

interface DetalheCampanhaResponse {
  success: boolean;
  campanha: Campanha;
  steps: Step[];
  error?: string;
}

interface SalvarCampanhaResponse {
  success: boolean;
  campanha?: Campanha;
  error?: string;
}

interface UseCampanhasOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useCampanhas(options: UseCampanhasOptions = {}) {
  const apiUrl = options.apiUrl ?? CAMPANHA_API_URL;
  const api = useCrmApi(apiUrl);

  // Listagem
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Stats e tipos
  const [stats, setStats] = useState<CampanhaStats>({
    total: 0,
    ativas: 0,
    rascunhos: 0,
    concluidas: 0,
  });
  const [tipos, setTipos] = useState<string[]>([]);

  // Detalhe (campanha sendo editada no wizard)
  const [campanhaAtual, setCampanhaAtual] = useState<Partial<Campanha>>({});

  // ════════════════════════════════════════════════════════════
  // LISTAR
  // ════════════════════════════════════════════════════════════

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtroStatus) params.status = filtroStatus;
      if (busca) params.busca = busca;

      const resp = await api.get<ListarCampanhasResponse>('listar_campanhas', params);
      if (resp.ok && resp.data?.success) {
        setCampanhas(resp.data.campanhas || []);
        setTotal(resp.data.total || 0);
      } else {
        console.error('Erro ao carregar campanhas:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api, filtroStatus, busca]);

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
  // TIPOS DE CAMPANHA
  // ════════════════════════════════════════════════════════════

  const carregarTipos = useCallback(async () => {
    try {
      const resp = await api.get<TiposResponse>('listar_tipos');
      if (resp.ok && resp.data?.success) {
        setTipos(resp.data.tipos || []);
      }
    } catch (err) {
      console.error('Erro ao carregar tipos:', err);
    }
  }, [api]);

  // ════════════════════════════════════════════════════════════
  // DETALHE (carrega campanha + steps no wizard)
  // ════════════════════════════════════════════════════════════

  const carregarDetalhe = useCallback(
    async (id: number): Promise<DetalheCampanhaResponse | null> => {
      setLoading(true);
      try {
        const resp = await api.get<DetalheCampanhaResponse>('detalhe_campanha', {
          id: String(id),
        });
        if (resp.ok && resp.data?.success) {
          setCampanhaAtual(resp.data.campanha);
          return resp.data;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // SALVAR (criar OU atualizar)
  // ════════════════════════════════════════════════════════════

  /**
   * Salva a campanha (cria ou atualiza). Retorna o ID da campanha após salvar
   * ou null em caso de erro (alerta já é exibido).
   */
  const salvar = useCallback(
    async (form: Partial<Campanha>, criadoPor: string): Promise<number | null> => {
      const isEdit = typeof form.id === 'number';
      const action = isEdit ? 'atualizar_campanha' : 'criar_campanha';
      const method = isEdit ? api.patch : api.post;

      setLoading(true);
      try {
        const body: any = { ...form };
        if (!isEdit) {
          body.criado_por = criadoPor;
        }
        const resp = await method<SalvarCampanhaResponse>(action, body);
        if (!resp.ok || !resp.data?.success) {
          throw new Error(resp.data?.error || resp.error || 'Erro ao salvar campanha');
        }
        if (resp.data.campanha) {
          setCampanhaAtual(resp.data.campanha);
        }
        return resp.data.campanha?.id ?? null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao salvar';
        alert(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // EXCLUIR
  // ════════════════════════════════════════════════════════════

  const excluir = useCallback(
    async (id: number): Promise<boolean> => {
      const resp = await api.del<{ success: boolean; error?: string }>(
        'excluir_campanha',
        { id: String(id) }
      );
      if (!resp.ok || !resp.data?.success) {
        alert(resp.data?.error || resp.error || 'Erro ao excluir campanha');
        return false;
      }
      return true;
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // MUDAR STATUS
  // ════════════════════════════════════════════════════════════

  const mudarStatus = useCallback(
    async (id: number, novoStatus: string): Promise<boolean> => {
      const resp = await api.patch<SalvarCampanhaResponse>('mudar_status', {
        id,
        status: novoStatus,
      });
      if (!resp.ok || !resp.data?.success) {
        alert(resp.data?.error || resp.error || 'Erro ao mudar status');
        return false;
      }
      if (resp.data.campanha) {
        setCampanhaAtual(resp.data.campanha);
      }
      return true;
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    // Listagem
    campanhas,
    total,
    busca,
    setBusca,
    filtroStatus,
    setFiltroStatus,
    loading,
    carregar,
    // Stats & Tipos
    stats,
    carregarStats,
    tipos,
    carregarTipos,
    // Detalhe (wizard)
    campanhaAtual,
    setCampanhaAtual,
    carregarDetalhe,
    // CRUD
    salvar,
    excluir,
    mudarStatus,
  };
}

export default useCampanhas;
