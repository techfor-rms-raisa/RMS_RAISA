/**
 * useInvalidos.ts — Hook de gestão de E-mails Inválidos
 *
 * Caminho: src/components/crm/shared/hooks/useInvalidos.ts
 * Versão: 1.1 (F8 — Aba Inválidos lead-centric — 16/06/2026)
 *
 * v1.1 (16/06/2026 — F8): O formato de resposta da API permanece idêntico
 *   ({ success, itens, total, page, limit, total_pages }), por isso a
 *   única mudança real é o TIPO `InvalidoItem` (atualizado em crm.types.ts
 *   v1.7 para schema lead-centric). Nenhuma mudança funcional aqui — o
 *   hook continua funcionando como agnóstico do schema dos itens.
 *
 *   Mudança colateral: o backend (crm-leads.ts v1.15 — listar_invalidos)
 *   agora retorna 1 linha por LEAD inválido (não mais 1 por evento de
 *   fila). Volume tende a cair (deduplicação natural). Nada a fazer aqui.
 *
 * v1.0 (Fase 8-Inbox — 04/06/2026):
 *   Responsabilidade:
 *    - Consumir `GET /api/crm-leads?action=listar_invalidos`.
 *    - Manter estado de busca, paginação e loading.
 *    - Expor recarregamento para uso reativo dentro do BaseLeadsPage.
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
