/**
 * useInvalidos.ts — Hook de gestão de E-mails Inválidos
 *
 * Caminho: src/components/crm/shared/hooks/useInvalidos.ts
 * Versão: 1.2 (RBAC de visibilidade — 22/06/2026)
 *
 * v1.2 (22/06/2026 — RBAC na aba "E-mails Inválidos"):
 *   Adicionado `currentUser` em UseInvalidosOptions para propagação ao
 *   backend v1.21 na action `listar_invalidos`. Sem isso, o backend
 *   retorna 400 (validação defensiva).
 *
 *   Regra implementada no backend (mesma do useLeads v1.3):
 *     - Admin             → vê todos inválidos
 *     - SDR               → vê CRECI todos + outros onde reservado_por = ele
 *     - Gestão Comercial  → NUNCA vê CRECI + apenas onde reservado_por = ele
 *
 *   Mudança aditiva e retrocompatível: `currentUser` é opcional na
 *   assinatura mas, se omitido, o backend retorna 400 e o hook degrada
 *   gracefully (mantém estado anterior + log de warning).
 *
 *   Dep array atualizada com `currentUser?.id` e `currentUser?.tipo_usuario`
 *   para recarregar automaticamente em troca de usuário.
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
  // 🆕 v1.2 — Identificação do usuário corrente para RBAC backend.
  //   Propagado para listar_invalidos (filtro de visibilidade).
  //   Sem isso, listar_invalidos retorna 400 (defesa em camadas).
  currentUser?: {
    id: number;
    tipo_usuario: string;
  };
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useInvalidos(options: UseInvalidosOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 30;
  // 🆕 v1.2 — currentUser para RBAC backend
  const currentUser = options.currentUser;

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
      // 🆕 v1.2 — propagar currentUser para RBAC (crm-leads.ts v1.21).
      //   Sem esses 2 params, o backend retorna 400 — defesa em camadas.
      if (currentUser) {
        params.current_user_id = currentUser.id;
        params.current_user_tipo = currentUser.tipo_usuario;
      }

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
  }, [api, pagina, pageSize, busca, currentUser?.id, currentUser?.tipo_usuario]);

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
