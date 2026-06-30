/**
 * useRespostas.ts — Hook de gestão da aba "CRM E-mail"
 *
 * Caminho: src/components/crm/shared/hooks/useRespostas.ts
 * Versão: 2.0 (Pacote P1 — CRM E-mail Inbox + Thread — 30/06/2026)
 *
 * v2.0 (30/06/2026 — Pacote P1 "CRM E-mail"):
 *   Refatoração estrutural alinhada à decisão de produto de 30/06/2026
 *   (Caminho C aprovado): a aba antiga "Respostas Campanhas" vira
 *   "CRM E-mail" e passa a operar em DOIS estados:
 *
 *     • Estado A — INBOX: lista de THREADS agrupadas por (lead × campanha),
 *       consumida via nova action `listar_threads` (crm-leads v1.24).
 *
 *     • Estado B — THREAD: conversa cronológica completa entre o operador
 *       e o lead dentro de uma campanha específica, consumida via nova
 *       action `listar_msgs_thread` (crm-leads v1.24). P1 mostra envios
 *       da campanha + replies do lead. Outbound do RAISA entra em P2.
 *
 *   Mudanças em relação à v1.1:
 *     - `itens: RespostaInbox[]` → `threads: ThreadResumo[]`
 *     - Mantém: `total`, `pagina`, `pageSize`, `busca`, `loading`, setters
 *     - Novo state: `threadAtiva`, `mensagens`, `loadingThread`, `erroThread`
 *     - Novos métodos: `abrirThread(lead_id, campanha_id)`, `voltarParaInbox()`
 *     - `carregar()` agora dispara `listar_threads` (não mais `listar_respostas`)
 *
 *   Compatibilidade:
 *     - A action legada `listar_respostas` continua viva no backend para
 *       eventuais callers externos (auditorias, integrações). Apenas este
 *       hook deixou de consumi-la.
 *     - Tipos `RespostaInbox` (legacy) saem do retorno deste hook —
 *       o componente RespostasTab v2.0 passa a usar `ThreadResumo` e
 *       `MensagemThread` definidos localmente abaixo. Quando estabilizado,
 *       migrar para crm.types.ts.
 *
 * v1.1 (22/06/2026 — RBAC na aba "Respostas Campanhas"):
 *   Adicionado `currentUser` em UseRespostasOptions para propagação ao
 *   backend v1.21 na action `listar_respostas`.
 *
 *   Regra implementada no backend (preservada em v2.0):
 *     - Admin → vê todas as threads / mensagens
 *     - SDR / GC → vê apenas onde `email_campanhas.responsavel_id` = ele
 *
 * v1.0 (Fase 8-Inbox — 04/06/2026):
 *   Versão inicial flat de respostas, consumindo `listar_respostas`.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';

// ════════════════════════════════════════════════════════════
// TIPOS LOCAIS (P1 — quando estabilizados, mover para crm.types.ts)
// ════════════════════════════════════════════════════════════

/**
 * Resumo de uma thread (1 par lead × campanha) listada no Inbox.
 * Espelha o payload de `listar_threads` (crm-leads v1.24).
 */
export interface ThreadResumo {
  lead_id: number;
  campanha_id: number;
  lead_nome: string | null;
  lead_email: string | null;
  lead_cargo: string | null;
  empresa_id: number | null;
  empresa_nome: string | null;
  campanha_nome: string | null;
  ultima_msg_em: string;             // ISO
  ultima_msg_assunto: string;
  ultima_msg_snippet: string;        // até 200 chars
  ultima_msg_corpo_html: string | null;
  ultima_classificacao: string | null;
  total_msgs: number;
  tem_nao_lido: boolean;
}

/**
 * Uma mensagem dentro de uma thread, na timeline cronológica.
 * Espelha o payload de `listar_msgs_thread` (crm-leads v1.24).
 *
 * `tipo` discrimina a origem:
 *   - 'enviado_campanha' → email_fila + email_campanha_steps (P1)
 *   - 'recebido_lead'    → email_respostas, direcao='inbound' (P1)
 *   - 'enviado_crm'      → email_respostas, direcao='outbound' (P2+)
 */
export interface MensagemThread {
  id: string;                                   // composite (env_X | rep_X | out_X)
  tipo: 'enviado_campanha' | 'recebido_lead' | 'enviado_crm';
  direcao: 'inbound' | 'outbound';
  data: string | null;                          // ISO
  assunto: string;
  corpo_texto: string | null;
  corpo_html: string | null;
  de_email: string | null;
  de_nome: string | null;
  // Específicos de 'enviado_campanha':
  step_ordem?: number | null;
  step_id?: number | null;
  status?: string | null;
  aberto_em?: string | null;
  clicado_em?: string | null;
  respondido_em?: string | null;
  entregue_em?: string | null;
  // Específicos de 'recebido_lead':
  classificacao?: string | null;
  lido?: boolean;
}

/** Header da thread aberta (Estado B). */
export interface ThreadHeader {
  lead: {
    id: number;
    nome: string | null;
    email: string | null;
    cargo: string | null;
    empresa_nome: string | null;
  };
  campanha: {
    id: number;
    nome: string | null;
  };
}

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarThreadsResponse {
  success: boolean;
  threads: ThreadResumo[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  error?: string;
}

interface ListarMsgsThreadResponse {
  success: boolean;
  lead: ThreadHeader['lead'];
  campanha: ThreadHeader['campanha'];
  mensagens: MensagemThread[];
  error?: string;
}

interface UseRespostasOptions {
  apiUrl?: string;
  pageSize?: number;
  /**
   * Identificação do usuário corrente para RBAC backend.
   * Propagado para `listar_threads` (filtro por dono da CAMPANHA)
   * e `listar_msgs_thread` (validação 403). Sem isso, ambos
   * retornam 400 (defesa em camadas).
   */
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
  const currentUser = options.currentUser;

  const api = useCrmApi(apiUrl);

  // ── Estado A — Inbox de threads ────────────────────────────
  const [threads, setThreads] = useState<ThreadResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Estado B — Thread aberta em tela cheia ─────────────────
  const [threadAtiva, setThreadAtiva] = useState<ThreadHeader | null>(null);
  const [mensagens, setMensagens] = useState<MensagemThread[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [erroThread, setErroThread] = useState<string | null>(null);

  // ════════════════════════════════════════════════════════════
  // CARREGAR INBOX (listar_threads)
  // ════════════════════════════════════════════════════════════

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagina,
        limit: pageSize,
      };
      if (busca) params.busca = busca;
      if (currentUser) {
        params.current_user_id = currentUser.id;
        params.current_user_tipo = currentUser.tipo_usuario;
      }

      const resp = await api.get<ListarThreadsResponse>('listar_threads', params);
      if (resp.ok && resp.data?.success) {
        setThreads(resp.data.threads);
        setTotal(resp.data.total);
      } else {
        console.warn('[useRespostas] Falha ao listar threads:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api, pagina, pageSize, busca, currentUser?.id, currentUser?.tipo_usuario]);

  // ════════════════════════════════════════════════════════════
  // ABRIR THREAD (listar_msgs_thread) — Estado A → B
  // ════════════════════════════════════════════════════════════

  /**
   * Carrega a conversa completa de uma thread específica e ativa
   * o Estado B (tela cheia). O componente decide quando renderizar
   * a thread aberta a partir de `threadAtiva !== null`.
   */
  const abrirThread = useCallback(
    async (leadId: number, campanhaId: number): Promise<void> => {
      setLoadingThread(true);
      setErroThread(null);
      setMensagens([]);
      try {
        const params: Record<string, string | number> = {
          lead_id: leadId,
          campanha_id: campanhaId,
        };
        if (currentUser) {
          params.current_user_id = currentUser.id;
          params.current_user_tipo = currentUser.tipo_usuario;
        }
        const resp = await api.get<ListarMsgsThreadResponse>(
          'listar_msgs_thread',
          params
        );
        if (resp.ok && resp.data?.success) {
          setThreadAtiva({
            lead: resp.data.lead,
            campanha: resp.data.campanha,
          });
          setMensagens(resp.data.mensagens || []);
        } else {
          setErroThread(resp.data?.error || resp.error || 'Falha ao abrir thread');
        }
      } catch (e: any) {
        setErroThread(e?.message || 'Erro inesperado ao abrir thread');
      } finally {
        setLoadingThread(false);
      }
    },
    [api, currentUser?.id, currentUser?.tipo_usuario]
  );

  // ════════════════════════════════════════════════════════════
  // VOLTAR PARA INBOX — Estado B → A
  // ════════════════════════════════════════════════════════════

  const voltarParaInbox = useCallback(() => {
    setThreadAtiva(null);
    setMensagens([]);
    setErroThread(null);
  }, []);

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    // ── Estado A (Inbox) ──
    threads,
    total,
    pagina,
    pageSize,
    busca,
    loading,
    setPagina,
    setBusca,
    carregar,
    // ── Estado B (Thread aberta) ──
    threadAtiva,
    mensagens,
    loadingThread,
    erroThread,
    abrirThread,
    voltarParaInbox,
  };
}

export default useRespostas;
