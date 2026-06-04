/**
 * useInvalidos.ts — Hook de gestão de E-mails Inválidos
 *
 * Caminho: src/components/crm/shared/hooks/useInvalidos.ts
 * Versão: 1.0 (Fase 8-Inbox — 04/06/2026)
 *
 * Responsabilidade:
 *  - Consumir `GET /api/crm-leads?action=listar_invalidos` (e-mails que
 *    falharam tecnicamente: email_fila WHERE status IN ('bounce','erro')).
 *  - Manter estado de busca, paginação e loading.
 *  - Expor recarregamento para uso reativo dentro do BaseLeadsPage.
 *
 * Padrão idêntico aos hooks useLeads / useRespostas.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { InvalidoItem } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarInvalidosResponse {
  success: boolean;
  itens: InvalidoItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  error?: string;
}

interface UseInvalidosOptions {
  apiUrl?: string;
  pageSize?: number;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useInvalidos(options: UseInvalidosOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 30;

  const api = useCrmApi(apiUrl);

  // Estado de listagem
  const [itens, setItens] = useState<InvalidoItem[]>([]);
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

      const resp = await api.get<ListarInvalidosResponse>('listar_invalidos', params);
      if (resp.ok && resp.data?.success) {
        setItens(resp.data.itens);
        setTotal(resp.data.total);
      } else {
        console.warn('[useInvalidos] Falha ao listar:', resp.error);
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

export default useInvalidos;
