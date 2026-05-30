/**
 * LeadsTab.tsx — Aba Leads
 *
 * Caminho: src/components/crm/base-leads/LeadsTab.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 612-712).
 */

import React from 'react';
import FunilBadge, { FUNIL_LABELS } from '../shared/components/FunilBadge';
import EmptyState from '../shared/components/EmptyState';
import type { Lead } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface LeadsTabProps {
  leads: Lead[];
  total: number;
  pagina: number;
  pageSize: number;
  busca: string;
  filtroFunil: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onFiltroFunilChange: (v: string) => void;
  onBuscar: () => void;
  onPaginaChange: (p: number) => void;
  onAbrirDetalhe: (id: number) => void;
  onEditar: (lead: Lead) => void;
  onNovoLead: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const LeadsTab: React.FC<LeadsTabProps> = ({
  leads,
  total,
  pagina,
  pageSize,
  busca,
  filtroFunil,
  loading,
  onBuscaChange,
  onFiltroFunilChange,
  onBuscar,
  onPaginaChange,
  onAbrirDetalhe,
  onEditar,
  onNovoLead,
}) => {
  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onBuscar()}
          placeholder="Buscar por nome, email ou cargo..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select
          value={filtroFunil}
          onChange={(e) => onFiltroFunilChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">Todos os status</option>
          {Object.entries(FUNIL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button
          onClick={onBuscar}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <i className="fa-solid fa-search"></i> Buscar
        </button>
        <button
          onClick={onNovoLead}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5"
        >
          <i className="fa-solid fa-plus"></i> Novo Lead
        </button>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando...
        </div>
      ) : leads.length === 0 ? (
        <EmptyState icon="fa-solid fa-users" titulo="Nenhum lead encontrado" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden md:table-cell">
                  Email
                </th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Cargo
                </th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Empresa
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Funil</th>
                <th className="px-3 py-2.5 text-center font-semibold hidden md:table-cell">
                  Emails
                </th>
                <th className="px-3 py-2.5 text-center font-semibold hidden md:table-cell">
                  Abertos
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onAbrirDetalhe(lead.id)}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800">{lead.nome}</div>
                    {lead.opt_out && (
                      <span className="text-xs text-red-500 flex items-center gap-0.5">
                        <i className="fa-solid fa-ban"></i> Opt-out
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell text-xs">
                    {lead.email}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">
                    {lead.cargo || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">
                    {lead.email_empresas?.nome || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <FunilBadge status={lead.funil_status} />
                  </td>
                  <td className="px-3 py-2.5 text-center hidden md:table-cell">
                    {lead.total_emails_recebidos}
                  </td>
                  <td className="px-3 py-2.5 text-center hidden md:table-cell">
                    {lead.total_emails_abertos}
                  </td>
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onEditar(lead)}
                      className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                      title="Editar"
                    >
                      <i className="fa-solid fa-pen-to-square"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            {total} lead{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPaginaChange(Math.max(1, pagina - 1))}
              disabled={pagina === 1}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
            >
              Anterior
            </button>
            <span className="px-3 py-1">Pág. {pagina}</span>
            <button
              onClick={() => onPaginaChange(pagina + 1)}
              disabled={leads.length < pageSize}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsTab;
