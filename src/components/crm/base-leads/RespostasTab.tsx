/**
 * RespostasTab.tsx — Aba "CRM E-mail" (antes "Respostas Campanhas")
 *
 * Caminho: src/components/crm/base-leads/RespostasTab.tsx
 * Versão: 2.3 (POLISH P2 — visual respostas + ordem reversa — 30/06/2026)
 *
 * v2.3 (30/06/2026 — POLISH P2):
 *   3 ajustes finos de UX pedidos por Messias em smoke real:
 *
 *     1. Identidade visual da MENSAGEM RECEBIDA (resposta do lead):
 *        - Avatar muda de `gray-200` para `teal-100` + texto teal-700
 *        - Borda esquerda muda de `gray-300` para `teal-400`
 *        - Adicionado ícone `fa-reply` ao lado do nome do remetente
 *          (identifica visualmente "é uma resposta")
 *
 *     2. SEPARADOR ADAPTATIVO entre mensagens:
 *        - Mesma direção: `border-t border-gray-100` (fino, sutil)
 *        - Mudança de direção: `border-t-2 border-gray-300` (mais
 *          espesso, transição visual clara entre Enviada e Recebida)
 *
 *     3. ORDEM CRONOLÓGICA DESCENDENTE (mais recente no topo):
 *        - Frontend só precisa renderizar o que o backend (v1.25.5)
 *          já entrega ordenado descendente. Lógica de
 *          `mudouDirecao` adaptada para comparar com o item anterior
 *          no array (que agora é mais novo, não mais antigo).
 *
 * v2.2 (30/06/2026 — Redesign timeline estilo Outlook clássico):
 *   Refeitura do componente `Bolha` → `MensagemCaixa`. Solicitação UX
 *   do Messias (30/06/2026 — sessão final):
 *
 *     "Manter o padrão Outlook, {Caixa de Msgs} alinhada à esquerda,
 *      igual a resposta recebida que atualizei ao final. Incluindo um
 *      separador entre a msg Recebida e a Respondida."
 *
 *   Decisões de design (Claude Design):
 *     • Todas as mensagens 100% width, sem deslocamento horizontal
 *     • Header em uma linha: avatar pequeno + identidade + timestamp à dir
 *     • Borda esquerda colorida (border-l-4) sinaliza origem SEM mover:
 *         - indigo-300 para envio da campanha (automatic step)
 *         - indigo-500 para envio do CRM (operador respondeu)
 *         - gray-300 para resposta do lead
 *     • Separador horizontal (border-t border-gray-200) entre mensagens
 *       — fica mais elegante que `mb-4` espaço vazio
 *     • Fundo branco para todas — limpa e profissional
 *     • Status badges (entregue/aberto/clicado/respondido) preservados
 *       no rodapé do envio da campanha
 *
 *   Comportamento intencional preservado:
 *     • Sanitização HTML via DOMPurify continua aplicada
 *     • Iniciais do avatar inalteradas
 *     • Editor de resposta (Pacote P2) inalterado — refatoração só
 *       em como cada mensagem é exibida na timeline
 *
 * v2.1 (30/06/2026 — Pacote P2 "CRM E-mail" Outbound):
 *   Adiciona o EDITOR DE RESPOSTA no footer da Thread (Estado B). UX
 *   minimalista para entrega rápida + iteração futura:
 *
 *     - <textarea> com altura auto-ajustável (até 12 linhas visíveis)
 *     - Conversão simples de Markdown leve (negrito **, itálico *, link
 *       autodetectado) → HTML no momento do envio
 *     - Sanitização do HTML resultante via `sanitizarHtmlRespostas`
 *       (defesa em camadas — mesmo o operador interno passa pelo filtro)
 *     - Footer com indicação clara:
 *         "Assinatura: <nome do GC/SDR> (campanha)"
 *         "Cópia para seu Outlook: <email>@techfor.com.br"
 *     - Botão [Cancelar] + [Enviar resposta]
 *     - Estado de envio com spinner + mensagem de erro inline
 *
 *   Regra RBAC visual (decisão Messias 30/06/2026):
 *     - Se `podeResponder=true` → editor renderiza normalmente
 *     - Se `podeResponder=false` → editor é SUBSTITUÍDO por banner
 *       informativo com o `motivoBloqueio` retornado pelo backend.
 *       O Admin vê: "Apenas o responsável da campanha pode responder.
 *       Administrador acessa em modo leitura."
 *
 *   Pós-envio bem-sucedido: o hook (v2.1) chama abrirThread() para
 *   recarregar a timeline — a nova bolha outbound aparece automatica-
 *   mente sem ação adicional do componente.
 *
 *   Out-of-scope nesta versão (entram em P3+):
 *     - Anexos
 *     - Templates rápidos
 *     - Botão "Marcar como lida"
 *     - Inserção de variáveis ({nome_lead}, {empresa_lead})
 *
 * v2.0 (30/06/2026 — Pacote P1 "CRM E-mail"):
 *   Refatoração estrutural do componente para suportar a nova UX do
 *   Caminho C (decisão de 30/06/2026 — Messias):
 *
 *     • Estado A — INBOX: lista de THREADS (1 thread = 1 lead × 1 campanha),
 *       cada card mostrando a última mensagem + contadores + badges.
 *
 *     • Estado B — THREAD em TELA CHEIA: substitui apenas a área interna
 *       da Base de Leads (mantém KPIs e tabs no topo — decisão UX 1a).
 *       Timeline cronológica ascendente com bolhas alternadas:
 *         • Bolha à direita (azul-violeta) = enviada pelo time
 *           (tipo='enviado_campanha' em P1, 'enviado_crm' em P2+)
 *         • Bolha à esquerda (cinza) = resposta do lead (tipo='recebido_lead')
 *
 *   Decisões de produto consolidadas (sessão 30/06/2026):
 *     (1a) Tela cheia substitui só a área interna (não esconde tabs/KPIs)
 *     (2a) 1 thread = 1 lead × 1 campanha (espelha Outlook por assunto)
 *     (3a) Sanitização HTML via `sanitizarHtmlRespostas` utilitário
 *          (DOMPurify whitelist conservadora — XSS-safe mesmo com
 *          conteúdo corporativo, defesa em camadas)
 *
 *   Mudanças vs v1.1:
 *     - Props: `itens` → `threads`; novas props `threadAtiva`, `mensagens`,
 *       `loadingThread`, `erroThread`, `onAbrirThread`, `onVoltarParaInbox`
 *     - `onAbrirLead` legado MANTIDO — ainda permite abrir o LeadDetailDrawer
 *       a partir do header da thread (botão "Abrir detalhe completo")
 *     - Defesa-em-camadas legacy de opt-outs REMOVIDA — fluxo de threads
 *       não passa por opt_out (que vive em sua aba dedicada desde v1.1).
 *
 *   Out-of-scope nesta versão (entram em P2+):
 *     - Editor de resposta (envio outbound)
 *     - Botão "Marcar como lida"
 *     - Filtro por campanha/status no toolbar do Inbox
 *
 * v1.1 (13/06/2026 — Reorganização Prospect/Lead):
 *   Removia opt-outs do feed; mantinha cards flat de respostas.
 *
 * v1.0 (Fase 8-Inbox — 04/06/2026):
 *   Versão inicial — feed flat de respostas + opt-outs.
 */

import React, { useMemo, useState } from 'react';
import EmptyState from '../shared/components/EmptyState';
import { formatDateTime } from '../types/crm.constants';
import type {
  ThreadResumo,
  MensagemThread,
  ThreadHeader,
} from '../shared/hooks/useRespostas';
import { sanitizarHtmlRespostas } from '../shared/utils/sanitizarHtmlRespostas';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface RespostasTabProps {
  // ── Estado A — Inbox ──
  threads: ThreadResumo[];
  total: number;
  pagina: number;
  pageSize: number;
  busca: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onBuscar: () => void;
  onPaginaChange: (p: number) => void;
  onAbrirThread: (leadId: number, campanhaId: number) => void;

  // ── Estado B — Thread aberta ──
  threadAtiva: ThreadHeader | null;
  mensagens: MensagemThread[];
  loadingThread: boolean;
  erroThread: string | null;
  onVoltarParaInbox: () => void;

  // 🆕 v2.1 (30/06/2026 — Pacote P2) — Editor + envio outbound
  /** Quando false, esconde o editor e mostra o `motivoBloqueio`. */
  podeResponder: boolean;
  /** Mensagem amigável a exibir quando podeResponder=false. */
  motivoBloqueio: string | null;
  /** Loading do envio (POST responder_thread). */
  enviando: boolean;
  /** Mensagem de erro da última tentativa de envio. */
  erroEnvio: string | null;
  /**
   * Handler de envio. Recebe corpoTexto, corpoHtml e opcionalmente
   * o Message-ID a referenciar para threading. Retorna o id da nova
   * mensagem (ou null em falha).
   */
  onResponder: (
    corpoTexto: string,
    corpoHtml: string,
    inReplyToMessageId?: string | null
  ) => Promise<number | null>;
  /** Nome amigável do operador logado, para o footer do editor. */
  currentUserNome?: string;
  /** Email corporativo do operador (será mostrado como destino do BCC). */
  currentUserEmail?: string;

  /**
   * Click em "Abrir detalhe completo" no header da thread → abre o
   * LeadDetailDrawer já existente no BaseLeadsPage.
   */
  onAbrirLead: (leadId: number) => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS DE RENDERIZAÇÃO
// ════════════════════════════════════════════════════════════

function badgeClassificacao(classificacao: string | null | undefined) {
  if (!classificacao || classificacao === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
        <i className="fa-regular fa-circle-dot"></i>
        Pendente
      </span>
    );
  }
  const mapa: Record<string, { bg: string; text: string; icon: string; label: string }> = {
    interessado:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'fa-solid fa-thumbs-up',     label: 'Interessado' },
    nao_interessado:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: 'fa-solid fa-thumbs-down',   label: 'Não interessado' },
    pediu_mais_info:    { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: 'fa-solid fa-circle-info',   label: 'Pediu mais info' },
    agendou_reuniao:    { bg: 'bg-indigo-50',  text: 'text-indigo-700',  icon: 'fa-solid fa-calendar-check', label: 'Agendou reunião' },
    fora_do_escritorio: { bg: 'bg-gray-100',   text: 'text-gray-700',    icon: 'fa-solid fa-plane',         label: 'Fora do escritório' },
  };
  const cfg = mapa[classificacao] || { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'fa-solid fa-tag', label: classificacao };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${cfg.bg} ${cfg.text}`}>
      <i className={cfg.icon}></i>
      {cfg.label}
    </span>
  );
}

/** Status do envio da campanha (P1). */
function badgeStatusEnvio(status: string | null | undefined) {
  if (!status) return null;
  const mapa: Record<string, { bg: string; text: string; icon: string; label: string }> = {
    enviado:    { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: 'fa-solid fa-paper-plane',     label: 'Enviado' },
    entregue:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'fa-solid fa-check',           label: 'Entregue' },
    aberto:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: 'fa-regular fa-envelope-open', label: 'Aberto' },
    clicado:    { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: 'fa-solid fa-arrow-pointer',   label: 'Clicado' },
    respondido: { bg: 'bg-teal-50',    text: 'text-teal-700',    icon: 'fa-solid fa-reply',           label: 'Respondido' },
  };
  const cfg = mapa[status] || { bg: 'bg-gray-100', text: 'text-gray-600', icon: 'fa-solid fa-circle', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${cfg.bg} ${cfg.text}`}>
      <i className={cfg.icon}></i>
      {cfg.label}
    </span>
  );
}

/** Iniciais para avatar (max 2 chars). */
function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// 🆕 v2.1 (30/06/2026 — Pacote P2) — Conversão texto→HTML minimalista
// para o editor. Suporta apenas:
//   - **negrito** → <strong>
//   - *itálico*  → <em>
//   - URLs detectadas → <a href>
//   - parágrafos separados por linha em branco
//   - quebras de linha simples → <br>
// Após gerar, passamos por sanitizarHtmlRespostas (defesa em camadas).

/** Escapa HTML especial para evitar injeção via input do operador. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Converte texto editado em HTML básico. */
function textoParaHtml(texto: string): string {
  if (!texto || texto.trim().length === 0) return '';

  // Trabalha sobre o texto escapado
  let html = escapeHtml(texto);

  // URLs autodetectadas (não-greedy, simples)
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );

  // **negrito**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // *itálico* — após **negrito** para não conflitar
  html = html.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, '$1<em>$2</em>$3');

  // Parágrafos: blocos separados por linha(s) em branco
  const blocos = html.split(/\n\s*\n/);
  const blocosHtml = blocos
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => `<p>${b.replace(/\n/g, '<br>')}</p>`);

  return blocosHtml.join('\n');
}

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTE: EDITOR DE RESPOSTA (Pacote P2)
// ════════════════════════════════════════════════════════════

interface EditorRespostaProps {
  enviando: boolean;
  erroEnvio: string | null;
  currentUserNome?: string;
  currentUserEmail?: string;
  campanhaNome?: string | null;
  /** Message-ID da última mensagem (para In-Reply-To). */
  ultimoMessageId?: string | null;
  onEnviar: (
    texto: string,
    html: string,
    inReplyToMessageId?: string | null
  ) => Promise<number | null>;
}

const EditorResposta: React.FC<EditorRespostaProps> = ({
  enviando,
  erroEnvio,
  currentUserNome,
  currentUserEmail,
  campanhaNome,
  ultimoMessageId,
  onEnviar,
}) => {
  const [texto, setTexto] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<boolean>(false);

  // HTML preview (sanitizado para defesa em camadas)
  const htmlPreview = useMemo(() => {
    const raw = textoParaHtml(texto);
    return sanitizarHtmlRespostas(raw);
  }, [texto]);

  const podeEnviar = texto.trim().length > 0 && !enviando;

  const handleEnviar = async () => {
    if (!podeEnviar) return;
    const html = textoParaHtml(texto);
    const htmlSanitizado = sanitizarHtmlRespostas(html);
    if (!htmlSanitizado || htmlSanitizado.trim().length === 0) return;
    const novoId = await onEnviar(texto, htmlSanitizado, ultimoMessageId);
    if (novoId !== null) {
      // Sucesso: limpa o editor (a thread já foi recarregada pelo hook)
      setTexto('');
      setPreviewMode(false);
    }
  };

  return (
    <div className="mt-4 bg-white border border-indigo-200 rounded-lg shadow-sm">
      {/* Header do editor */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <i className="fa-solid fa-pen-to-square text-indigo-500"></i>
          <span>
            Respondendo como{' '}
            <strong className="text-gray-800">{currentUserNome || 'Operador'}</strong>
            {campanhaNome && (
              <>
                {' '}
                · campanha <em className="text-indigo-700">{campanhaNome}</em>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewMode(!previewMode)}
            disabled={enviando || texto.trim().length === 0}
            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline disabled:text-gray-300 disabled:no-underline"
          >
            {previewMode ? (
              <>
                <i className="fa-regular fa-pen-to-square"></i> Voltar a editar
              </>
            ) : (
              <>
                <i className="fa-regular fa-eye"></i> Preview
              </>
            )}
          </button>
        </div>
      </div>

      {/* Corpo do editor (textarea ou preview) */}
      {previewMode ? (
        <div
          className="p-4 min-h-[140px] prose prose-sm max-w-none text-sm text-gray-800 [&_p]:my-2 [&_a]:text-indigo-600"
          dangerouslySetInnerHTML={{ __html: htmlPreview }}
        />
      ) : (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={enviando}
          placeholder="Digite sua resposta... Suporta **negrito**, *itálico* e links são detectados automaticamente."
          rows={6}
          className="w-full p-4 text-sm text-gray-800 border-0 rounded-none focus:outline-none focus:ring-0 resize-y min-h-[140px] max-h-[400px] font-sans"
        />
      )}

      {/* Erro de envio */}
      {erroEnvio && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-red-700 text-sm flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i>
          {erroEnvio}
        </div>
      )}

      {/* Footer com infos e ações */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
          {currentUserEmail && (
            <span title="Será enviada cópia oculta para seu email corporativo">
              <i className="fa-regular fa-envelope text-gray-400"></i>{' '}
              Cópia para <strong className="text-gray-700">{currentUserEmail}</strong>
            </span>
          )}
          <span title="A assinatura corporativa da campanha será adicionada automaticamente">
            <i className="fa-solid fa-signature text-gray-400"></i> Assinatura: automática
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTexto('')}
            disabled={enviando || texto.length === 0}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={handleEnviar}
            disabled={!podeEnviar}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {enviando ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Enviando...
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane"></i> Enviar resposta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTE: MENSAGEM CAIXA (estilo Outlook clássico)
// ════════════════════════════════════════════════════════════
// v2.2 (30/06/2026) — Substitui o componente Bolha (v2.0/v2.1).
//   Layout vertical, alinhado à esquerda, separador horizontal entre
//   mensagens. Identidade da origem indicada por borda esquerda
//   colorida (border-l-4) — não há deslocamento horizontal.
// v2.3 (30/06/2026) — Visual da resposta recebida em teal + ícone
//   fa-reply, separador adaptativo (mais espesso quando muda direção).

const MensagemCaixa: React.FC<{
  msg: MensagemThread;
  primeira: boolean;
  /** 🆕 v2.3 — Direção da msg imediatamente anterior no array (ou null
   * se for a primeira). Permite separador adaptativo: linha mais espessa
   * quando a direção muda (Enviada ↔ Recebida). */
  direcaoAnterior?: string | null;
}> = ({ msg, primeira, direcaoAnterior = null }) => {
  const isOutbound = msg.direcao === 'outbound';
  const isEnvioCampanha = msg.tipo === 'enviado_campanha';
  const isRecebidoLead = msg.tipo === 'recebido_lead';

  // 🆕 v2.3 — Detecta se a direção da msg anterior é diferente para
  //   destacar a transição visual entre conversação enviada e recebida.
  //   Para campanha e CRM (ambos outbound), tratamos como "mesma direção"
  //   apesar do tipo diferente — visualmente são todas saídas do time.
  const mudouDirecao =
    direcaoAnterior !== null && direcaoAnterior !== msg.direcao;

  // Identidade visual da origem (border-l-4 + avatar bg)
  const cfgOrigem = isEnvioCampanha
    ? {
        bordaCor: 'border-l-indigo-300',
        avatarBg: 'bg-indigo-100',
        avatarText: 'text-indigo-700',
        avatarIcone: 'fa-solid fa-bullhorn',
        identidadeLabel: `Step ${msg.step_ordem ?? '?'} · Campanha`,
        identidadeColor: 'text-indigo-700',
        iconePrefixo: '',
      }
    : isOutbound
      ? {
          bordaCor: 'border-l-indigo-500',
          avatarBg: 'bg-indigo-500',
          avatarText: 'text-white',
          avatarIcone: 'fa-solid fa-paper-plane',
          identidadeLabel: msg.de_nome || msg.de_email || 'Operador',
          identidadeColor: 'text-indigo-700',
          iconePrefixo: '',
        }
      : {
          // 🆕 v2.3 — Recebido_lead em TEAL (em vez de gray) para destacar
          //   "veio de fora" + ícone fa-reply ao lado do nome.
          bordaCor: 'border-l-teal-400',
          avatarBg: 'bg-teal-100',
          avatarText: 'text-teal-700',
          avatarIcone: '',
          identidadeLabel: msg.de_nome || msg.de_email || 'Lead',
          identidadeColor: 'text-teal-700',
          iconePrefixo: 'fa-solid fa-reply',
        };

  const exibirCorpoHtml = msg.corpo_html && msg.corpo_html.trim().length > 0;
  const exibirCorpoTexto =
    !exibirCorpoHtml && msg.corpo_texto && msg.corpo_texto.trim().length > 0;

  // 🆕 v2.3 — Classe do separador: linha mais espessa quando muda de
  //   direção (Enviada ↔ Recebida), criando uma transição visual nítida.
  const classeSeparador = primeira
    ? ''
    : mudouDirecao
      ? 'border-t-2 border-gray-300'
      : 'border-t border-gray-100';

  return (
    <div
      className={[
        'bg-white px-5 py-4 border-l-4',
        cfgOrigem.bordaCor,
        classeSeparador,
      ].join(' ')}
    >
      {/* ── Cabeçalho da mensagem (uma linha) ── */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Avatar/Ícone */}
          <div
            className={[
              'w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0',
              cfgOrigem.avatarBg,
              cfgOrigem.avatarText,
            ].join(' ')}
          >
            {isEnvioCampanha || isOutbound ? (
              <i className={`${cfgOrigem.avatarIcone} text-[11px]`}></i>
            ) : (
              iniciais(msg.de_nome || msg.de_email)
            )}
          </div>
          {/* 🆕 v2.3 — Ícone fa-reply antes do nome quando é recebido_lead */}
          {cfgOrigem.iconePrefixo && (
            <i
              className={`${cfgOrigem.iconePrefixo} text-teal-500 text-sm shrink-0`}
              title="Resposta recebida do lead"
            ></i>
          )}
          {/* Identidade + email */}
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${cfgOrigem.identidadeColor}`}>
              {cfgOrigem.identidadeLabel}
            </span>
            {(isOutbound || isRecebidoLead) && msg.de_email && (
              <span className="text-xs text-gray-500 truncate">
                {`<${msg.de_email}>`}
              </span>
            )}
          </div>
        </div>
        {/* Timestamp */}
        <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
          {msg.data ? formatDateTime(msg.data) : '—'}
        </span>
      </div>

      {/* ── Assunto ── */}
      {msg.assunto && (
        <div className="text-sm font-semibold text-gray-800 mb-2">
          {msg.assunto}
        </div>
      )}

      {/* ── Corpo ── */}
      <div className="text-sm text-gray-700">
        {exibirCorpoHtml ? (
          <div
            className="prose prose-sm max-w-none [&_p]:my-1.5 [&_a]:text-indigo-600"
            dangerouslySetInnerHTML={{
              __html: sanitizarHtmlRespostas(msg.corpo_html || ''),
            }}
          />
        ) : exibirCorpoTexto ? (
          <p className="whitespace-pre-line">{msg.corpo_texto}</p>
        ) : isEnvioCampanha ? (
          <p className="text-gray-500 italic">
            (Conteúdo enviado segundo template do Step {msg.step_ordem ?? '?'} da campanha)
          </p>
        ) : (
          <p className="text-gray-400 italic">(sem corpo extraído)</p>
        )}
      </div>

      {/* ── Rodapé: badges contextuais ── */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {isEnvioCampanha && badgeStatusEnvio(msg.status)}
        {isEnvioCampanha && msg.aberto_em && (
          <span className="text-gray-500" title={`Aberto em ${formatDateTime(msg.aberto_em)}`}>
            <i className="fa-regular fa-eye"></i> Aberto
          </span>
        )}
        {isEnvioCampanha && msg.clicado_em && (
          <span className="text-gray-500" title={`Clicado em ${formatDateTime(msg.clicado_em)}`}>
            <i className="fa-solid fa-arrow-pointer"></i> Clicado
          </span>
        )}
        {isRecebidoLead && msg.classificacao && badgeClassificacao(msg.classificacao)}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTE: BOLHA DE MENSAGEM (LEGACY — não usado mais em v2.2)
// ════════════════════════════════════════════════════════════
// Mantido para compatibilidade durante a transição. Componente principal
// (RespostasTab) usa `MensagemCaixa`. Remover na próxima major.

const Bolha: React.FC<{ msg: MensagemThread }> = ({ msg }) => {
  const isOutbound = msg.direcao === 'outbound';
  const isEnvioCampanha = msg.tipo === 'enviado_campanha';

  // P1: 'enviado_campanha' não tem corpo renderizado (template não é
  //     materializado por envio). Mostramos só o assunto + status.
  //     P2+ pode adicionar render do template com placeholders preenchidos.
  const exibirCorpoHtml = msg.corpo_html && msg.corpo_html.trim().length > 0;
  const exibirCorpoTexto = !exibirCorpoHtml && msg.corpo_texto && msg.corpo_texto.trim().length > 0;

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isOutbound ? 'order-1' : ''}`}>
        {/* Header da bolha: identidade + timestamp */}
        <div
          className={`flex items-center gap-2 mb-1 text-xs text-gray-500 ${
            isOutbound ? 'justify-end' : 'justify-start'
          }`}
        >
          {!isOutbound && (
            <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-700 text-[10px] font-semibold flex items-center justify-center">
              {iniciais(msg.de_nome || msg.de_email)}
            </div>
          )}
          <span className="font-medium text-gray-700">
            {isEnvioCampanha
              ? `Step ${msg.step_ordem ?? '?'} · Campanha`
              : msg.de_nome || msg.de_email || 'Lead'}
          </span>
          <span className="text-gray-400">·</span>
          <span>{msg.data ? formatDateTime(msg.data) : '—'}</span>
          {isOutbound && (
            <div className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[10px] font-semibold flex items-center justify-center">
              <i className="fa-solid fa-paper-plane text-[10px]"></i>
            </div>
          )}
        </div>

        {/* Corpo da bolha */}
        <div
          className={`rounded-lg px-4 py-3 ${
            isOutbound
              ? 'bg-indigo-50 border border-indigo-100 text-gray-800'
              : 'bg-white border border-gray-200 text-gray-800'
          }`}
        >
          {/* Assunto */}
          {msg.assunto && (
            <div className="text-sm font-semibold text-gray-700 mb-2 pb-2 border-b border-dashed border-gray-200">
              {msg.assunto}
            </div>
          )}

          {/* Corpo (P1) */}
          {exibirCorpoHtml ? (
            <div
              className="text-sm prose prose-sm max-w-none [&_p]:my-1 [&_a]:text-indigo-600"
              dangerouslySetInnerHTML={{
                __html: sanitizarHtmlRespostas(msg.corpo_html || ''),
              }}
            />
          ) : exibirCorpoTexto ? (
            <p className="text-sm text-gray-700 whitespace-pre-line">{msg.corpo_texto}</p>
          ) : isEnvioCampanha ? (
            <p className="text-sm text-gray-500 italic">
              (Conteúdo enviado segundo template do Step {msg.step_ordem ?? '?'} da campanha)
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">(sem corpo extraído)</p>
          )}

          {/* Rodapé: badges contextuais */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {isEnvioCampanha && badgeStatusEnvio(msg.status)}
            {!isEnvioCampanha && msg.classificacao && badgeClassificacao(msg.classificacao)}
            {isEnvioCampanha && msg.aberto_em && (
              <span className="text-gray-400" title={`Aberto em ${formatDateTime(msg.aberto_em)}`}>
                <i className="fa-regular fa-eye"></i> Aberto
              </span>
            )}
            {isEnvioCampanha && msg.clicado_em && (
              <span className="text-gray-400" title={`Clicado em ${formatDateTime(msg.clicado_em)}`}>
                <i className="fa-solid fa-arrow-pointer"></i> Clicado
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — switch entre Inbox e Thread
// ════════════════════════════════════════════════════════════

const RespostasTab: React.FC<RespostasTabProps> = ({
  threads,
  total,
  pagina,
  pageSize,
  busca,
  loading,
  onBuscaChange,
  onBuscar,
  onPaginaChange,
  onAbrirThread,
  threadAtiva,
  mensagens,
  loadingThread,
  erroThread,
  onVoltarParaInbox,
  // 🆕 v2.1 (30/06/2026 — Pacote P2)
  podeResponder,
  motivoBloqueio,
  enviando,
  erroEnvio,
  onResponder,
  currentUserNome,
  currentUserEmail,
  onAbrirLead,
}) => {
  // ── Estado B — Thread aberta em tela cheia ──
  if (threadAtiva) {
    return (
      <div className="p-4">
        {/* Header sticky */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={onVoltarParaInbox}
                className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-gray-50 shrink-0"
                title="Voltar para o inbox"
              >
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center shrink-0">
                {iniciais(threadAtiva.lead.nome)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 truncate">
                    {threadAtiva.lead.nome || '(sem nome)'}
                  </span>
                  {threadAtiva.lead.cargo && (
                    <span className="text-xs text-gray-500">· {threadAtiva.lead.cargo}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {threadAtiva.lead.email}
                  {threadAtiva.lead.empresa_nome && (
                    <span className="ml-2 text-gray-400">· {threadAtiva.lead.empresa_nome}</span>
                  )}
                </div>
                <div className="text-xs text-indigo-600 mt-0.5">
                  <i className="fa-solid fa-bullhorn text-[10px] mr-1"></i>
                  {threadAtiva.campanha.nome || `Campanha #${threadAtiva.campanha.id}`}
                </div>
              </div>
            </div>
            <button
              onClick={() => onAbrirLead(threadAtiva.lead.id)}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
            >
              Abrir detalhe completo <i className="fa-solid fa-arrow-up-right-from-square ml-0.5 text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* Erro de carga */}
        {erroThread && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i>
            {erroThread}
          </div>
        )}

        {/* Timeline */}
        {loadingThread ? (
          <div className="py-12 text-center text-gray-400">
            <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
            <p className="mt-2 text-sm">Carregando conversa...</p>
          </div>
        ) : mensagens.length === 0 ? (
          <EmptyState
            icon="fa-regular fa-comment"
            titulo="Sem mensagens nesta thread"
            descricao="Esta thread ainda não tem envios da campanha nem respostas registradas."
          />
        ) : (
          /* 🆕 v2.2 (30/06/2026) — Container da timeline estilo Outlook:
             • Borda externa única englobando todas as mensagens
             • Separação entre msgs por border-top (dentro de MensagemCaixa)
             • Sem fundo cinza diferenciado — visual limpo profissional
             🆕 v2.3 — Passa direcaoAnterior para separador adaptativo. */
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            {mensagens.map((msg, idx) => (
              <MensagemCaixa
                key={msg.id}
                msg={msg}
                primeira={idx === 0}
                direcaoAnterior={idx > 0 ? mensagens[idx - 1].direcao : null}
              />
            ))}
          </div>
        )}

        {/* 🆕 v2.1 (30/06/2026 — Pacote P2) — Editor ou banner de bloqueio RBAC.
            Quando podeResponder=true: renderiza o editor.
            Quando podeResponder=false: exibe o motivo retornado pelo backend
              (ex: "Apenas o responsável da campanha pode responder. 
              Administrador acessa em modo leitura."). */}
        {podeResponder ? (
          <EditorResposta
            enviando={enviando}
            erroEnvio={erroEnvio}
            currentUserNome={currentUserNome}
            currentUserEmail={currentUserEmail}
            campanhaNome={threadAtiva.campanha.nome}
            ultimoMessageId={(() => {
              // Pega o Message-ID da última msg inbound da timeline para o
              // header In-Reply-To (continuidade visual no cliente do lead).
              const inbounds = mensagens.filter((m) => m.direcao === 'inbound');
              if (inbounds.length === 0) return null;
              // mensagens já vem ordenada ascendente; última inbound = mais recente
              const ultima = inbounds[inbounds.length - 1];
              // P1 não retorna message_id no payload de timeline, então pode
              // ser undefined — o backend faz fallback para email_respostas
              // mais recente. Mantém o param opcional para evolução futura.
              return (ultima as any).message_id || null;
            })()}
            onEnviar={onResponder}
          />
        ) : (
          <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg text-sm flex items-start gap-3">
            <i className="fa-solid fa-lock text-amber-600 text-lg mt-0.5"></i>
            <div>
              <p className="font-semibold mb-0.5">Você está em modo leitura</p>
              <p className="text-amber-800">
                {motivoBloqueio ||
                  'Apenas o responsável da campanha pode enviar respostas.'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Estado A — Inbox de threads ──
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onBuscar()}
          placeholder="Buscar lead por nome, email, empresa, assunto..."
          className="flex-1 min-w-[260px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={onBuscar}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <i className="fa-solid fa-magnifying-glass"></i>
          Buscar
        </button>
      </div>

      {/* Loading / Empty / Lista */}
      {loading && threads.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="mt-2 text-sm">Carregando inbox...</p>
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon="fa-regular fa-envelope-open"
          titulo="Nenhuma conversa ainda"
          descricao="Quando seus leads responderem aos e-mails das campanhas, as threads aparecem aqui. Descadastros estão na aba Opt-Out."
        />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const naoLido = t.tem_nao_lido;
            return (
              <div
                key={`${t.lead_id}_${t.campanha_id}`}
                onClick={() => onAbrirThread(t.lead_id, t.campanha_id)}
                className={[
                  'border rounded-lg p-3 transition-all cursor-pointer',
                  naoLido
                    ? 'bg-indigo-50/30 border-indigo-200 hover:bg-indigo-50'
                    : 'bg-white border-gray-200 hover:bg-gray-50',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div
                      className={[
                        'w-10 h-10 rounded-full text-sm font-semibold flex items-center justify-center shrink-0',
                        naoLido ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600',
                      ].join(' ')}
                    >
                      {iniciais(t.lead_nome)}
                    </div>
                    {/* Identidade + snippet */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={[
                            'text-sm truncate',
                            naoLido ? 'font-bold text-gray-900' : 'font-semibold text-gray-800',
                          ].join(' ')}
                        >
                          {t.lead_nome || '(sem nome)'}
                        </span>
                        {t.empresa_nome && (
                          <span className="text-xs text-gray-500 truncate">· {t.empresa_nome}</span>
                        )}
                        {t.total_msgs > 1 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
                            <i className="fa-regular fa-comments text-[9px]"></i>
                            {t.total_msgs}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {t.lead_email}
                        {t.campanha_nome && (
                          <span className="ml-2 text-indigo-600">· {t.campanha_nome}</span>
                        )}
                      </div>
                      {/* Assunto + snippet */}
                      {t.ultima_msg_assunto && (
                        <p className="text-sm font-medium text-gray-700 mt-1 line-clamp-1">
                          {t.ultima_msg_assunto}
                        </p>
                      )}
                      {t.ultima_msg_snippet && (
                        <p className="text-sm text-gray-600 line-clamp-1 whitespace-pre-line">
                          {t.ultima_msg_snippet}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Direita: data + badge */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDateTime(t.ultima_msg_em)}
                    </span>
                    {badgeClassificacao(t.ultima_classificacao)}
                    {naoLido && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-medium">
                        Nova
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {total > 0 && totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">
            {(pagina - 1) * pageSize + 1}–{Math.min(pagina * pageSize, total)} de {total}
          </span>
          <div className="flex gap-1">
            <button
              disabled={pagina <= 1}
              onClick={() => onPaginaChange(pagina - 1)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              <i className="fa-solid fa-chevron-left"></i> Anterior
            </button>
            <span className="px-3 py-1.5 text-gray-600">
              {pagina} / {totalPaginas}
            </span>
            <button
              disabled={pagina >= totalPaginas}
              onClick={() => onPaginaChange(pagina + 1)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Próxima <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RespostasTab;
