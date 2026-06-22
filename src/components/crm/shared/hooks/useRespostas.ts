/**
 * useRespostas.ts — Hook de gestão do Inbox de Respostas
 *
 * Caminho: src/components/crm/shared/hooks/useRespostas.ts
 * Versão: 1.1 (RBAC de visibilidade — 22/06/2026)
 *
 * v1.1 (22/06/2026 — RBAC na aba "Respostas Campanhas"):
 *   Adicionado `currentUser` em UseRespostasOptions para propagação ao
 *   backend v1.21 na action `listar_respostas`. Sem isso, o backend
 *   retorna 400 (validação defensiva).
 *
 *   Regra implementada no backend (diferente do useLeads/useInvalidos):
 *     - Admin → vê todas as respostas
 *     - SDR / GC → vê apenas respostas de campanhas onde
 *                  email_campanhas.responsavel_id = ele
 *
 *   Diferença em relação aos outros hooks: a regra é por dono da
 *   CAMPANHA, não do lead. Isso porque a resposta é evento da campanha
 *   — quem está conduzindo é quem responde ao reply. Decisão de produto
 *   (Messias, 22/06/2026): "Cada Campanha é criada para um determinado
 *   GC/SDR".
 *
 *   Operador sem campanhas → lista vazia direta (early-return no backend).
 *
 *   Mudança aditiva e retrocompatível: `currentUser` é opcional na
 *   assinatura mas, se omitido, backend responde 400.
 *
 * v1.0 (Fase 8-Inbox — 04/06/2026):
 *   Responsabilidade:
 *    - Consumir `GET /api/crm-leads?action=listar_respostas` (UNION de
 *      email_respostas + email_optout, ordenado por data desc).
 *    - Manter estado de busca, paginação e loading.
 *    - Expor recarregamento para uso reativo dentro do BaseLeadsPage.
 *
 *   Padrão idêntico aos hooks useLeads / useEmpresas (Fase 1C).
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
  // 🆕 v1.1 — Identificação do usuário corrente para RBAC backend.
  //   Propagado para listar_respostas (filtro por dono da CAMPANHA).
  //   Sem isso, listar_respostas retorna 400 (defesa em camadas).
  currentUser?: {
    id: number;
    tipo_usuario: string;
  };
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useRespostas(options: UseRespostasOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 30;
  // 🆕 v1.1 — currentUser para RBAC backend
  const currentUser = options.currentUser;

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
      // 🆕 v1.1 — propagar currentUser para RBAC (crm-leads.ts v1.21).
      //   Sem esses 2 params, o backend retorna 400 — defesa em camadas.
      if (currentUser) {
        params.current_user_id = currentUser.id;
        params.current_user_tipo = currentUser.tipo_usuario;
      }

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

export default useRespostas;
