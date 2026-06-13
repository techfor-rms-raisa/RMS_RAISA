/**
 * RespostasTab.tsx — Aba "Respostas Campanhas" (Inbox de replies)
 *
 * Caminho: src/components/crm/base-leads/RespostasTab.tsx
 * Versão: 1.1 (13/06/2026)
 *
 * v1.1 (13/06/2026 — Reorganização Prospect/Lead):
 *   Decisão histórica de 04/06/2026 (exibir opt-outs aqui) foi REVERTIDA.
 *   Agora a aba "Respostas Campanhas" mostra APENAS respostas reais
 *   (replies de leads aos disparos), e os opt-outs vivem em sua aba
 *   dedicada — coerente com a regra LGPD permanente:
 *     • Opt-out é eterno (lead NUNCA é deletado).
 *     • Opt-outs (manuais E automáticos) ficam centralizados na aba
 *       "Opt-Out" da Base de Leads.
 *
 *   Mudanças nesta v1.1:
 *     - Header atualizado para refletir o escopo correto.
 *     - EmptyState: removida menção "ou pedirem opt-out".
 *     - Helpers `badgeOptOut` e ramos `isOptOut` permanecem no código
 *       como DEFESA EM CAMADAS (caso o backend volte a enviar `tipo:'opt_out'`
 *       por bug/cache antigo, a UI degrada graciosamente). Backend v1.13
 *       (crm-leads) já não envia mais itens desse tipo.
 *
 * v1.0 (Fase 8-Inbox — 04/06/2026):
 *   Versão inicial. Listava respostas dos leads + opt-outs em um feed
 *   único ordenado por data desc, no estilo inbox de e-mail.
 *
 * Comportamento:
 *   • Card clicável → quando lead_id existe, abre o LeadDetailDrawer.
 *   • Badges de classificação (pendente / interessado / etc.) + preview
 *     do corpo (até 400 chars vindos do backend).
 */

import React from 'react';
import EmptyState from '../shared/components/EmptyState';
import { formatDateTime } from '../types/crm.constants';
import type { RespostaInbox } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface RespostasTabProps {
  itens: RespostaInbox[];
  total: number;
  pagina: number;
  pageSize: number;
  busca: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onBuscar: () => void;
  onPaginaChange: (p: number) => void;
  /** Click em um item com lead_id → abre o LeadDetailDrawer. */
  onAbrirLead: (leadId: number) => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS DE RENDERIZAÇÃO
// ════════════════════════════════════════════════════════════

function badgeOptOut() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-medium">
      <i className="fa-solid fa-ban"></i>
      Remover do mailing
    </span>
  );
}

function badgeClassificacao(classificacao: string | null) {
  if (!classificacao || classificacao === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
        <i className="fa-regular fa-circle-dot"></i>
        Pendente
      </span>
    );
  }
  // Mapas simples — pode ser expandido conforme classificação evolui
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

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const RespostasTab: React.FC<RespostasTabProps> = ({
  itens,
  total,
  pagina,
  pageSize,
  busca,
  loading,
  onBuscaChange,
  onBuscar,
  onPaginaChange,
  onAbrirLead,
}) => {
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onBuscar()}
          placeholder="Buscar por nome do lead, e-mail, empresa ou assunto..."
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

      {/* ── Loading / Empty / Lista ── */}
      {loading && itens.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="mt-2 text-sm">Carregando inbox...</p>
        </div>
      ) : itens.length === 0 ? (
        <EmptyState
          icon="fa-regular fa-envelope-open"
          titulo="Nenhuma resposta ainda"
          descricao="Quando seus leads responderem aos e-mails das campanhas, os itens aparecem aqui. Descadastros são centralizados na aba Opt-Out."
        />
      ) : (
        <div className="space-y-2">
          {itens.map((item) => {
            const isOptOut = item.tipo === 'opt_out';
            const clicavel = item.lead_id != null;

            return (
              <div
                key={`${item.tipo}-${item.id}`}
                onClick={() => clicavel && item.lead_id != null && onAbrirLead(item.lead_id)}
                className={[
                  'border rounded-lg p-3 transition-all',
                  isOptOut
                    ? 'bg-red-50/40 border-red-200 hover:bg-red-50'
                    : item.lido
                      ? 'bg-white border-gray-200 hover:bg-gray-50'
                      : 'bg-indigo-50/30 border-indigo-200 hover:bg-indigo-50',
                  clicavel ? 'cursor-pointer' : 'cursor-default opacity-90',
                ].join(' ')}
              >
                {/* Linha 1: ícone + nome/empresa + badges + data */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <i
                      className={
                        isOptOut
                          ? 'fa-solid fa-ban text-red-500 text-lg'
                          : 'fa-solid fa-reply text-teal-500 text-lg'
                      }
                    ></i>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-800 truncate">
                          {item.lead_nome || '(lead sem cadastro)'}
                        </span>
                        {item.empresa_nome && (
                          <span className="text-xs text-gray-500 truncate">
                            · {item.empresa_nome}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {item.lead_email}
                        {item.campanha_nome && (
                          <span className="ml-2 text-gray-400">· {item.campanha_nome}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDateTime(item.data_evento)}
                    </span>
                    {isOptOut ? badgeOptOut() : badgeClassificacao(item.classificacao)}
                  </div>
                </div>

                {/* Linha 2: assunto + preview do corpo (resposta) OU motivo (opt-out) */}
                <div className="mt-2 pl-7">
                  {isOptOut ? (
                    <p className="text-sm text-red-700">
                      <span className="font-medium">Motivo:</span> {item.motivo_optout || 'Opt-out'}
                    </p>
                  ) : (
                    <>
                      {item.assunto && (
                        <p className="text-sm font-medium text-gray-700 mb-1 line-clamp-1">
                          {item.assunto}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 line-clamp-2 whitespace-pre-line">
                        {item.corpo_texto || '(sem corpo extraído)'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Paginação ── */}
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
