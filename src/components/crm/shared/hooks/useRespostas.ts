/**
 * useRespostas.ts — Hook de gestão da aba "CRM E-mail"
 *
 * Caminho: src/components/crm/shared/hooks/useRespostas.ts
 * Versão: 2.2 (Marcar como lido — restrito ao dono da campanha — 06/07/2026)
 *
 * v2.2 (06/07/2026 — Marcar como lido restrito ao dono):
 *   Motivação: até a v2.1, nenhum endpoint gravava `email_respostas.lido=
 *   true`. Consequência: badge "Nova" na inbox permanecia para toda
 *   mensagem indefinidamente (bug conceitual). Fix arquitetural com
 *   Opção B (Messias — 06/07/2026):
 *
 *     • Novo método `marcarLida(leadId, campanhaId)` — POST na nova
 *       action `marcar_thread_lida` do backend (crm-leads v1.26).
 *
 *     • Backend valida server-side:
 *         - Admin → retorna sucesso silencioso (NÃO altera `lido`).
 *         - Não-responsável → 403.
 *         - Responsável → UPDATE lido=true, lido_por=<email>, lido_em=NOW()
 *           (idempotente via filtro `lido=false`).
 *
 *     • Integração automática no `abrirThread`: após o backend retornar
 *       `pode_responder=true` (que já significa server-side "é o dono
 *       e não é admin"), disparamos `marcarLida` em background —
 *       operador não precisa fazer nada explícito.
 *
 *     • Após marcar, chamamos `carregar()` em background para atualizar
 *       `tem_nao_lido` na lista do Inbox — quando o operador voltar,
 *       o badge "Nova" já sumiu do card que ele acabou de ler.
 *
 *     • `marcarLida` também exposto no retorno para uso futuro (ex.:
 *       botão "Marcar como lida" explícito na v2.3+).
 *
 *   Fluxo end-to-end (dono lê):
 *     Inbox → clica card → abrirThread → backend confirma pode_responder=true
 *     → marcarLida (background, silencioso) → recarrega inbox (background)
 *     → dono navega de volta → card sem badge "Nova" ✅
 *
 *   Fluxo end-to-end (admin lê):
 *     Inbox → clica card → abrirThread → backend confirma pode_responder=false
 *     → marcarLida NÃO é chamado → `lido` continua false
 *     → dono abre depois → badge "Nova" ainda visível para ele ✅
 *
 * v2.1 (30/06/2026 — Pacote P2 "CRM E-mail" Outbound):
 *   Adiciona o método `responder(corpoTexto, corpoHtml)` que dispara
 *   a action `responder_thread` do crm-leads v1.25. Refresh automático
 *   da thread após envio bem-sucedido para o operador ver sua própria
 *   mensagem aparecer na timeline.
 *
 *   Novidades no payload de listar_msgs_thread (v1.25):
 *     - threadAtiva.campanha.responsavel_id
 *     - podeResponder (boolean — calculado server-side)
 *     - motivoBloqueio (string — quando podeResponder=false)
 *
 *   Estados adicionados:
 *     - enviando (boolean) — true enquanto request à Resend acontece
 *     - erroEnvio (string|null) — última falha de envio
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
    // 🆕 v2.1 (30/06/2026 — Pacote P2) — Para frontend espelhar a regra
    //   RBAC do backend (somente responsavel_id pode responder).
    responsavel_id: number | null;
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
  // 🆕 v2.1 (30/06/2026 — Pacote P2)
  pode_responder: boolean;
  motivo_bloqueio: string | null;
  error?: string;
}

interface ResponderThreadResponse {
  success: boolean;
  mensagem_id: number | null;
  message_id_resend: string | null;
  fila_id_sintetico: number | null;
  bcc_corporativo: string | null;
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
  // 🆕 v2.1 (30/06/2026 — Pacote P2) — RBAC + envio outbound
  const [podeResponder, setPodeResponder] = useState<boolean>(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

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
  // 🆕 v2.2 (06/07/2026) — MARCAR THREAD COMO LIDA
  //   POST marcar_thread_lida (crm-leads v1.26). Idempotente.
  //
  //   Declarados ANTES de abrirThread para evitar TS2448
  //   (used before declaration) — abrirThread referencia
  //   marcarLidaBackground no bloco de sucesso.
  // ════════════════════════════════════════════════════════════

  /**
   * Marca todas as mensagens inbound de uma thread como lidas —
   * server-side aplica RBAC estrito:
   *   • Admin → no-op silencioso (retorna success sem alterar).
   *   • Não-responsável → 403.
   *   • Responsável → UPDATE lido=true, lido_por=<email>, lido_em=NOW()
   *                   apenas em registros com lido=false.
   *
   * Retorna quantas mensagens foram efetivamente marcadas (0 se admin
   * ou se já estavam todas lidas). Não expõe erro no state — chamada
   * é considerada complementar ao fluxo principal de leitura.
   */
  const marcarLida = useCallback(
    async (leadId: number, campanhaId: number): Promise<number> => {
      if (!currentUser) return 0;
      try {
        const body: Record<string, any> = {
          lead_id: leadId,
          campanha_id: campanhaId,
          current_user_id: currentUser.id,
          current_user_tipo: currentUser.tipo_usuario,
        };
        const resp = await api.post<{
          success: boolean;
          total_marcadas: number;
          error?: string;
        }>('marcar_thread_lida', body);
        if (resp.ok && resp.data?.success) {
          return resp.data.total_marcadas || 0;
        }
        // Silent-fail: log e retorna 0. Não interrompe leitura.
        console.warn(
          '[useRespostas] marcarLida falhou (silent):',
          resp.data?.error || resp.error
        );
        return 0;
      } catch (e: any) {
        console.warn('[useRespostas] marcarLida exception (silent):', e?.message);
        return 0;
      }
    },
    [api, currentUser?.id, currentUser?.tipo_usuario]
  );

  /**
   * Wrapper interno chamado pelo `abrirThread`. Executa marcarLida em
   * background e, se houver mudança (total_marcadas > 0), recarrega a
   * inbox para atualizar `tem_nao_lido` — quando o operador voltar,
   * o badge "Nova" já sumiu do card que ele acabou de ler.
   */
  const marcarLidaBackground = useCallback(
    (leadId: number, campanhaId: number): void => {
      // Dispara sem await — não bloqueia a UI. Fire-and-forget.
      (async () => {
        const totalMarcadas = await marcarLida(leadId, campanhaId);
        if (totalMarcadas > 0) {
          // Refresh silencioso da inbox para tirar o badge "Nova"
          try {
            await carregar();
          } catch {
            /* silent */
          }
        }
      })();
    },
    [marcarLida, carregar]
  );

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
      // 🆕 v2.1 — Reset dos estados de envio quando abre nova thread
      setPodeResponder(false);
      setMotivoBloqueio(null);
      setErroEnvio(null);
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
          // 🆕 v2.1 — Aplica RBAC server-side ao state
          setPodeResponder(!!resp.data.pode_responder);
          setMotivoBloqueio(resp.data.motivo_bloqueio || null);

          // 🆕 v2.2 (06/07/2026) — Marca thread como lida em background
          //   SOMENTE se o operador atual é o RESPONSÁVEL da campanha
          //   (server já validou isso ao setar pode_responder=true).
          //   Admin acessa em modo leitura e NÃO altera `lido`, então
          //   o dono verá o badge "Nova" quando abrir depois.
          //   Silent-fail intencional — falha no marcar não bloqueia a
          //   experiência de leitura, apenas deixa o badge "Nova" ativo
          //   até a próxima tentativa (ex.: reabrir a thread).
          if (resp.data.pode_responder === true) {
            marcarLidaBackground(leadId, campanhaId);
          }
        } else {
          setErroThread(resp.data?.error || resp.error || 'Falha ao abrir thread');
        }
      } catch (e: any) {
        setErroThread(e?.message || 'Erro inesperado ao abrir thread');
      } finally {
        setLoadingThread(false);
      }
    },
    [api, currentUser?.id, currentUser?.tipo_usuario, marcarLidaBackground]
  );

  // ════════════════════════════════════════════════════════════
  // RESPONDER (envio outbound) — POST responder_thread (Pacote P2)
  // ════════════════════════════════════════════════════════════

  /**
   * Envia uma resposta pelo CRM E-mail dentro da thread aberta.
   * Após sucesso, recarrega a thread para refletir a nova mensagem
   * outbound na timeline.
   *
   * Retorna o id da nova mensagem em email_respostas (ou null em falha).
   */
  const responder = useCallback(
    async (
      corpoTexto: string,
      corpoHtml: string,
      inReplyToMessageId?: string | null
    ): Promise<number | null> => {
      if (!threadAtiva) {
        setErroEnvio('Não há thread aberta.');
        return null;
      }
      if (!corpoHtml || corpoHtml.trim().length === 0) {
        setErroEnvio('Corpo da mensagem não pode ser vazio.');
        return null;
      }
      setEnviando(true);
      setErroEnvio(null);
      try {
        const body: Record<string, any> = {
          lead_id: threadAtiva.lead.id,
          campanha_id: threadAtiva.campanha.id,
          corpo_texto: corpoTexto,
          corpo_html: corpoHtml,
        };
        if (inReplyToMessageId) {
          body.in_reply_to_message_id = inReplyToMessageId;
        }
        if (currentUser) {
          body.current_user_id = currentUser.id;
          body.current_user_tipo = currentUser.tipo_usuario;
        }
        const resp = await api.post<ResponderThreadResponse>(
          'responder_thread',
          body
        );
        if (!resp.ok || !resp.data?.success) {
          const errMsg =
            resp.data?.error || resp.error || 'Falha ao enviar resposta.';
          setErroEnvio(errMsg);
          return null;
        }
        // Sucesso: recarrega a thread para refletir o outbound na timeline
        await abrirThread(threadAtiva.lead.id, threadAtiva.campanha.id);
        return resp.data.mensagem_id;
      } catch (e: any) {
        setErroEnvio(e?.message || 'Erro inesperado ao enviar resposta.');
        return null;
      } finally {
        setEnviando(false);
      }
    },
    [api, threadAtiva, currentUser?.id, currentUser?.tipo_usuario, abrirThread]
  );

  // ════════════════════════════════════════════════════════════
  // VOLTAR PARA INBOX — Estado B → A
  // ════════════════════════════════════════════════════════════

  const voltarParaInbox = useCallback(() => {
    setThreadAtiva(null);
    setMensagens([]);
    setErroThread(null);
    // 🆕 v2.1 — Reset também dos estados de envio
    setPodeResponder(false);
    setMotivoBloqueio(null);
    setEnviando(false);
    setErroEnvio(null);
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
    // 🆕 v2.1 (30/06/2026 — Pacote P2) — RBAC + envio outbound
    podeResponder,
    motivoBloqueio,
    enviando,
    erroEnvio,
    responder,
    // 🆕 v2.2 (06/07/2026) — Marcar como lida (dono only)
    // Exposto para uso explícito futuro (ex.: botão "Marcar como lida").
    // Chamado automaticamente em background pelo `abrirThread` quando
    // pode_responder=true.
    marcarLida,
  };
}

export default useRespostas;
