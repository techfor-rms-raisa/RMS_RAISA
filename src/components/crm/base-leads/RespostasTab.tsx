/**
 * RespostasTab.tsx — Aba "CRM E-mail" (antes "Respostas Campanhas")
 *
 * Caminho: src/components/crm/base-leads/RespostasTab.tsx
 * Versão: 2.0 (Pacote P1 — Inbox + Thread em tela cheia — 30/06/2026)
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

import React from 'react';
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

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTE: BOLHA DE MENSAGEM
// ════════════════════════════════════════════════════════════

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
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
            {mensagens.map((msg) => (
              <Bolha key={msg.id} msg={msg} />
            ))}
          </div>
        )}

        {/* Footer P1: aviso de que responder estará disponível em P2 */}
        <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-sm flex items-center gap-2">
          <i className="fa-solid fa-circle-info"></i>
          <span>
            <strong>Em breve:</strong> responder pelo CRM (sem precisar abrir o Outlook).
            Disponível na próxima entrega (Pacote P2 — editor + envio + assinatura por campanha + BCC corporativo).
          </span>
        </div>
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
