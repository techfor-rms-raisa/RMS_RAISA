/**
 * useRespostas.ts — Hook de gestão do Inbox de Respostas
 *
 * Caminho: src/components/crm/shared/hooks/useRespostas.ts
 * Versão: 1.0 (Fase 8-Inbox — 04/06/2026)
 *
 * Responsabilidade:
 *  - Consumir `GET /api/crm-leads?action=listar_respostas` (UNION de
 *    email_respostas + email_optout, ordenado por data desc).
 *  - Manter estado de busca, paginação e loading.
 *  - Expor recarregamento para uso reativo dentro do BaseLeadsPage.
 *
 * Padrão idêntico aos hooks useLeads / useEmpresas (Fase 1C).
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { RespostaInbox } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarRespostasResponse {
  success: boolean;
  itens: RespostaInbox[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  error?: string;
}

interface UseRespostasOptions {
  apiUrl?: string;
  pageSize?: number;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useRespostas(options: UseRespostasOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 30;

  const api = useCrmApi(apiUrl);

  // Estado de listagem
  const [itens, setItens] = useState<RespostaInbox[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  // ════════════════════════════════════════════════════════════
  // CARREGAR
  // ════════════════════════════════════════════════════════════

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagina,
        limit: pageSize,
      };
      if (busca) params.busca = busca;

      const resp = await api.get<ListarRespostasResponse>('listar_respostas', params);
      if (resp.ok && resp.data?.success) {
        setItens(resp.data.itens);
        setTotal(resp.data.total);
      } else {
        // Em caso de erro, mantém o estado anterior para não piscar a UI;
        // o componente decide o que mostrar via `loading`.
        console.warn('[useRespostas] Falha ao listar:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api, pagina, pageSize, busca]);

  return {
    // Listagem
    itens,
    total,
    pagina,
    pageSize,
    busca,
    loading,
    // Setters
    setPagina,
    setBusca,
    // Ações
    carregar,
  };
}

export default useRespostas;
