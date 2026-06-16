/**
 * InvalidosTab.tsx — Aba "Inválidos" (LEADS com email inválido)
 *
 * Caminho: src/components/crm/base-leads/InvalidosTab.tsx
 * Versão: 1.2 (F8 — Spinner no botão Recovery — 16/06/2026)
 *
 * v1.2 (16/06/2026 — F8 release final): adiciona prop opcional
 *   `recoveringLeadIds?: number[]` para mostrar feedback visual durante
 *   a chamada do motor Recovery (gerenciada pelo BaseLeadsPage v1.10).
 *
 *   Quando o lead está no array `recoveringLeadIds`:
 *     • Botão "Recovery" mostra spinner azul no lugar do ícone normal
 *     • Botão fica disabled (impede cliques duplos durante os ~60s
 *       que o motor Recovery pode levar)
 *     • Botão "Editar" também fica disabled (evita corrida — usuário
 *       não deveria editar email enquanto Recovery está rodando, ou
 *       a sobrescrita pode anular o resultado)
 *
 *   Prop continua opcional — quando ausente, comportamento idêntico
 *   à v1.1 (sem spinner, sem disable durante Recovery).
 *
 * v1.1 (16/06/2026 — F8: schema lead-centric): REESCRITA para o schema
 *   lead-centric introduzido em crm-leads.ts v1.15 (action
 *   `listar_invalidos`) e crm.types.ts v1.7 (interface InvalidoItem).
 *   Cada linha agora representa 1 LEAD com email inválido (não mais 1
 *   evento de fila bounceado). Mudanças visíveis:
 *
 *     • Colunas reorganizadas: Lead/Empresa · Email · Motivo · Recovery ·
 *       Quando · Ações.
 *     • Coluna "Campanha" REMOVIDA (não faz mais sentido — lead pode estar
 *       bouncedo em N campanhas, e o estado é consolidado).
 *     • Nova coluna "Recovery" — mostra tentativas (X/3) com badge colorido:
 *         cinza  (0/3)        = nunca tentou
 *         azul   (1–2/3)      = tentativas em andamento
 *         âmbar  (3/3)        = esgotado
 *     • Tooltip no motivo passa a mostrar o raw do Resend
 *       (motivo_raw — bounced_motivo preservado pelo webhook v1.15).
 *     • Nova ação "Tentar Recovery" (ao lado de "Editar cadastro").
 *       Quando o lead ainda tem tentativas disponíveis (< 3) e não está
 *       em "recovery em andamento", o botão fica habilitado. Hoje delega
 *       ao container (BaseLeadsPage) via prop `onTentarRecovery` — o
 *       backend Recovery (api/campaign-email-recovery) já está em
 *       Production desde 13/06/2026 (Sub-fase 3.A).
 *
 *   A prop `onTentarRecovery` é OPCIONAL para não quebrar callers
 *   antigos — quando ausente, o botão Recovery não aparece (degradação
 *   graciosa). Container deve passá-la quando quiser habilitar o fluxo.
 *
 * v1.0 (Fase 8-Inbox — 04/06/2026):
 *   Primeira versão fila-centric. Substituída pela v1.1.
 *
 * Estrutura visual:
 *   • Tabela responsiva com 6 colunas (era 7 na v1.0).
 *   • Badge "Inválido" único (não há mais distinção bounce/erro).
 *   • Empty state amigável — quando ninguém aparece, o cenário é positivo
 *     ("nenhum lead inválido" = base saudável).
 */

import React from 'react';
import EmptyState from '../shared/components/EmptyState';
import { formatDateTime } from '../types/crm.constants';
import type { InvalidoItem } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface InvalidosTabProps {
  itens: InvalidoItem[];
  total: number;
  pagina: number;
  pageSize: number;
  busca: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onBuscar: () => void;
  onPaginaChange: (p: number) => void;
  /**
   * Clique no botão "Editar cadastro" — recebe o lead_id. O container
   * (BaseLeadsPage) é responsável por carregar o lead completo e abrir
   * o LeadFormModal em modo 'editar' para o analista corrigir o email.
   */
  onEditarLead: (leadId: number) => void;
  /**
   * 🆕 v1.1 — Clique no botão "Tentar Recovery" (opcional). Recebe o
   * lead_id. Quando ausente, o botão de Recovery não aparece — útil
   * enquanto o container ainda não conectou o handler do motor 3.A.
   */
  onTentarRecovery?: (leadId: number) => void;
  /**
   * 🆕 v1.2 — Lista de lead_ids atualmente em Recovery (chamada em
   * andamento). Quando o lead está no array:
   *   • Botão "Recovery" mostra spinner + fica disabled
   *   • Botão "Editar" também fica disabled (evita corrida)
   * Prop opcional — quando ausente, comportamento da v1.1 (sem feedback).
   */
  recoveringLeadIds?: number[];
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** Badge único de "Inválido" — substitui os badges bounce/erro da v1.0. */
function badgeInvalido() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-medium">
      <i className="fa-solid fa-circle-exclamation"></i>
      Inválido
    </span>
  );
}

/** Badge de progresso de Recovery (0/3, 1/3, 2/3, 3/3). */
function badgeRecovery(tentativas: number) {
  const total = 3;
  let classes = 'bg-gray-50 text-gray-600 border-gray-200';
  let icone = 'fa-solid fa-circle-minus';
  if (tentativas >= total) {
    classes = 'bg-amber-50 text-amber-700 border-amber-200';
    icone = 'fa-solid fa-circle-xmark';
  } else if (tentativas > 0) {
    classes = 'bg-blue-50 text-blue-700 border-blue-200';
    icone = 'fa-solid fa-arrows-rotate';
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs font-medium ${classes}`}>
      <i className={icone}></i>
      {tentativas}/{total}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const InvalidosTab: React.FC<InvalidosTabProps> = ({
  itens,
  total,
  pagina,
  pageSize,
  busca,
  loading,
  onBuscaChange,
  onBuscar,
  onPaginaChange,
  onEditarLead,
  onTentarRecovery,
  recoveringLeadIds,
}) => {
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  // 🆕 v1.2 — Set para lookup O(1) ao decidir se um lead está em loading
  const recoveringSet = React.useMemo(
    () => new Set(recoveringLeadIds || []),
    [recoveringLeadIds],
  );

  return (
    <div className="p-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onBuscar()}
          placeholder="Buscar por nome, e-mail ou motivo de invalidação..."
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

      {/* ── Loading / Empty / Tabela ── */}
      {loading && itens.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="mt-2 text-sm">Carregando lista de inválidos...</p>
        </div>
      ) : itens.length === 0 ? (
        <EmptyState
          icon="fa-regular fa-circle-check"
          titulo="Nenhum lead inválido"
          descricao="Quando um lead receber hard bounce em uma campanha, ele aparecerá aqui com o motivo e o progresso de Recovery."
        />
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2.5">Empresa / Lead</th>
                <th className="px-3 py-2.5">E-mail</th>
                <th className="px-3 py-2.5">Motivo</th>
                <th className="px-3 py-2.5">Recovery</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Quando</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {itens.map((item) => {
                // Recovery: habilitado quando ainda há tentativas disponíveis (< 3)
                // e o callback foi provido pelo container.
                const tentativas = item.tentativas_recovery ?? 0;
                const recoveryEsgotado = tentativas >= 3;
                // 🆕 v1.2 — lead em Recovery em andamento (chamada ativa)
                const recoveryEmAndamento = recoveringSet.has(item.lead_id);
                const podeRecovery = !!onTentarRecovery && !recoveryEsgotado && !recoveryEmAndamento;

                return (
                  <tr key={item.lead_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800 truncate max-w-[200px]">
                        {item.empresa_nome || '(sem empresa)'}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">
                        {item.lead_nome}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 font-mono text-xs">
                      {item.lead_email}
                    </td>
                    <td
                      className="px-3 py-2.5 text-gray-600 truncate max-w-[220px]"
                      title={item.motivo_raw || item.motivo}
                    >
                      {item.motivo}
                    </td>
                    <td className="px-3 py-2.5">
                      {badgeRecovery(tentativas)}
                      {item.recovery_em && (
                        <div className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                          última: {formatDateTime(item.recovery_em)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{badgeInvalido()}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(item.bounced_em)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1.5">
                        {/* Editar cadastro — disabled durante Recovery (v1.2 — evita corrida) */}
                        <button
                          disabled={recoveryEmAndamento}
                          onClick={() => !recoveryEmAndamento && onEditarLead(item.lead_id)}
                          className={[
                            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            recoveryEmAndamento
                              ? 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200',
                          ].join(' ')}
                          title={
                            recoveryEmAndamento
                              ? 'Aguarde — Recovery em andamento'
                              : 'Abrir cadastro do lead para corrigir o e-mail'
                          }
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                          Editar
                        </button>

                        {/* Tentar Recovery — opcional (degradação graciosa) */}
                        {onTentarRecovery && (
                          <button
                            disabled={!podeRecovery}
                            onClick={() => podeRecovery && onTentarRecovery(item.lead_id)}
                            className={[
                              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                              podeRecovery
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                : recoveryEmAndamento
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200 cursor-wait'
                                  : 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200',
                            ].join(' ')}
                            title={
                              recoveryEmAndamento
                                ? 'Recovery em andamento (pode levar até ~60s)'
                                : recoveryEsgotado
                                  ? 'Tentativas de Recovery esgotadas (3/3) — corrija o e-mail manualmente'
                                  : 'Tentar encontrar o e-mail correto via motor de Recovery'
                            }
                          >
                            {recoveryEmAndamento ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                Processando...
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-magic-wand-sparkles"></i>
                                Recovery
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

export default InvalidosTab;
