/**
 * useInvalidos.ts — Hook de gestão de E-mails Inválidos
 *
 * Caminho: src/components/crm/shared/hooks/useInvalidos.ts
 * Versão: 1.3 (Recuperação de inválidos para campanha — 23/06/2026)
 *
 * v1.3 (23/06/2026 — Recuperação de inválidos para campanha):
 *   Novo método `recuperarParaCampanha(leadId, campanhaId, criadoPor)`
 *   que delega à action POST `recuperar_invalido_para_campanha` do
 *   crm-leads v1.22. Usado pelo BaseLeadsPage v1.15 ao confirmar o
 *   RecuperarParaCampanhaModal.
 *
 *   O método retorna { success, vinculo?, error? } sem lançar exceções —
 *   o caller decide como mostrar feedback (alert/toast). Após sucesso,
 *   o caller deve invocar `carregar()` para atualizar a aba (lead saiu).
 *
 *   Extensão de TIPO local InvalidoItemExt (intersection com InvalidoItem
 *   de crm.types.ts v1.7 + novo campo opcional `bounced: boolean`).
 *   Decisão arquitetural: não tocar em crm.types.ts num refinamento
 *   pontual — quando outro driver justificar mexer naquele arquivo,
 *   migramos a propriedade para o tipo central. Backend v1.22 já
 *   retorna o campo; frontend já o consome a partir desta versão.
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
import type { InvalidoItem as InvalidoItemBase } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

/**
 * 🆕 v1.3 (23/06/2026) — Extensão local do InvalidoItem.
 *
 * O backend crm-leads v1.22 (action listar_invalidos) passou a retornar
 * 2 novos campos em cada item:
 *
 *   - `bounced` (boolean): usado pelo InvalidosTab v1.3 para decidir se
 *      mostra o botão "Promover" (regra: só aparece quando bounced=false).
 *
 *   - `vertical` (string | null): contexto da vertical do lead, exibido
 *      no RecuperarParaCampanhaModal como informação para o usuário.
 *
 * Não atualizamos crm.types.ts agora para evitar mudança ampla por
 * refino pontual. Quando outro driver justificar mexer naquele arquivo,
 * migrar estes campos para o tipo central InvalidoItem.
 *
 * Os campos são OPCIONAIS (`?`) por segurança: callers que ainda consomem
 * o formato pré-v1.22 continuam compilando (bounced=undefined → não
 * mostra o botão Promover, que é o comportamento conservador correto).
 */
export type InvalidoItem = InvalidoItemBase & {
  bounced?: boolean;
  vertical?: string | null;
};

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

/** 🆕 v1.3 — resposta de recuperar_invalido_para_campanha. */
interface RecuperarParaCampanhaResponse {
  success: boolean;
  lead?: {
    id: number;
    nome: string;
    email: string;
  };
  vinculo?: {
    campanha_id: number;
    campanha_nome: string;
    campanha_status: string;
    enfileirados: number;
  };
  mensagem?: string;
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

  // ════════════════════════════════════════════════════════════
  // 🆕 v1.3 (23/06/2026) — RECUPERAR INVÁLIDO PARA CAMPANHA
  // ════════════════════════════════════════════════════════════
  //
  // Chama a action POST `recuperar_invalido_para_campanha` (crm-leads
  // v1.22) que vincula o lead a uma campanha e limpa o motivo de
  // invalidação. Lead sai da aba Inválidos pelo critério D2 após
  // o próximo carregar().
  //
  // Retorna sempre objeto estruturado — não lança. Caller decide
  // como mostrar feedback (alert/toast).
  //
  // Após sucesso, o caller deve invocar `carregar()` (lista da aba)
  // e idealmente também o `carregarStats()` do useLeads (badge da aba).
  const recuperarParaCampanha = useCallback(
    async (
      leadId: number,
      campanhaId: number,
      criadoPor: string,
    ): Promise<RecuperarParaCampanhaResponse> => {
      try {
        const resp = await api.post<RecuperarParaCampanhaResponse>('recuperar_invalido_para_campanha', {
          lead_id: leadId,
          campanha_id: campanhaId,
          criado_por: criadoPor,
        });

        if (resp.ok && resp.data?.success) {
          return resp.data;
        }
        // Erro estruturado do backend OU erro de rede — propaga mensagem
        // mais útil disponível.
        return {
          success: false,
          error: resp.data?.error || resp.error || 'Falha ao recuperar lead para campanha.',
        };
      } catch (err: any) {
        console.error('[useInvalidos] recuperarParaCampanha erro:', err);
        return {
          success: false,
          error: err?.message || 'Erro inesperado ao recuperar lead.',
        };
      }
    },
    [api],
  );

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
    // 🆕 v1.3 (23/06/2026 — Recuperação de inválidos para campanha)
    recuperarParaCampanha,
  };
}

export default useInvalidos;
