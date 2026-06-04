/**
 * InvalidosTab.tsx — Aba "Inválidos" (e-mails que falharam tecnicamente)
 *
 * Caminho: src/components/crm/base-leads/InvalidosTab.tsx
 * Versão: 1.0 (Fase 8-Inbox — 04/06/2026)
 *
 * Lista entradas de `email_fila` com `status IN ('bounce', 'erro')` —
 * envios que falharam por motivos técnicos (endereço inexistente,
 * timeout, rejeição do servidor, etc.).
 *
 * Decisão de produto (04/06/2026 — Messias):
 *   • Opt-outs NÃO aparecem aqui — eles vão para a aba Respostas com
 *     destaque de urgência (lead pediu para sair, não é falha técnica).
 *   • Cada linha tem botão "Editar cadastro" que abre o LeadFormModal
 *     em modo edição com o lead pré-carregado, para o Gestor/SDR corrigir
 *     o e-mail e submeter de novo para a campanha.
 *
 * Estrutura visual:
 *   • Tabela responsiva: Empresa · Lead · E-mail tentado · Campanha ·
 *     Motivo · Status · Quando · Ação.
 *   • Badge colorido pelo status (vermelho para bounce, âmbar para erro).
 *   • Motivo com truncamento + tooltip para texto longo.
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
   * Clique no botão "Editar cadastro" — recebe o lead_id. Quando null
   * (e-mail sem lead correspondente em email_leads), o botão fica
   * desabilitado. O container (BaseLeadsPage) é responsável por carregar
   * o lead completo e abrir o LeadFormModal em modo 'editar'.
   */
  onEditarLead: (leadId: number) => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function badgeStatus(status: 'bounce' | 'erro') {
  if (status === 'bounce') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-medium">
        <i className="fa-solid fa-circle-exclamation"></i>
        Bounce
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-medium">
      <i className="fa-solid fa-triangle-exclamation"></i>
      Erro de envio
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
          placeholder="Buscar por e-mail, nome do lead ou motivo da falha..."
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
          titulo="Nenhum e-mail inválido"
          descricao="Quando uma campanha tentar enviar para um endereço e falhar (bounce ou erro técnico), o item aparece aqui para correção."
        />
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2.5">Empresa / Lead</th>
                <th className="px-3 py-2.5">E-mail tentado</th>
                <th className="px-3 py-2.5">Campanha</th>
                <th className="px-3 py-2.5">Motivo</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Quando</th>
                <th className="px-3 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {itens.map((item) => {
                const podeEditar = item.lead_id != null;
                const dataEvento = item.bounce_em || item.enviado_em || item.criado_em;

                return (
                  <tr key={item.fila_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800 truncate max-w-[200px]">
                        {item.empresa_nome || '(sem empresa)'}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">
                        {item.lead_nome || '(lead sem cadastro)'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 font-mono text-xs">
                      {item.destinatario_email}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 truncate max-w-[180px]">
                      {item.campanha_nome || `#${item.campanha_id}`}
                    </td>
                    <td
                      className="px-3 py-2.5 text-gray-600 truncate max-w-[240px]"
                      title={item.motivo || ''}
                    >
                      {item.motivo || '—'}
                    </td>
                    <td className="px-3 py-2.5">{badgeStatus(item.status)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(dataEvento)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        disabled={!podeEditar}
                        onClick={() => podeEditar && item.lead_id != null && onEditarLead(item.lead_id)}
                        className={[
                          'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          podeEditar
                            ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                            : 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200',
                        ].join(' ')}
                        title={podeEditar ? 'Abrir cadastro do lead para corrigir o e-mail' : 'Lead não cadastrado — não é possível editar'}
                      >
                        <i className="fa-solid fa-pen-to-square"></i>
                        Editar cadastro
                      </button>
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
