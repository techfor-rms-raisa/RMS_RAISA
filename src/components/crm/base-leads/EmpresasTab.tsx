/**
 * EmpresasTab.tsx — Aba Empresas
 *
 * Caminho: src/components/crm/base-leads/EmpresasTab.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 524-610).
 * Toolbar de busca/filtro + tabela + paginação + ações.
 */

import React from 'react';
import { SETORES } from '../types/crm.constants';
import EmptyState from '../shared/components/EmptyState';
import type { Empresa } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface EmpresasTabProps {
  empresas: Empresa[];
  total: number;
  pagina: number;
  pageSize: number;
  busca: string;
  filtroSetor: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onFiltroSetorChange: (v: string) => void;
  onBuscar: () => void;
  onPaginaChange: (p: number) => void;
  onAbrirDetalhe: (id: number) => void;
  onEditar: (empresa: Empresa) => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const EmpresasTab: React.FC<EmpresasTabProps> = ({
  empresas,
  total,
  pagina,
  pageSize,
  busca,
  filtroSetor,
  loading,
  onBuscaChange,
  onFiltroSetorChange,
  onBuscar,
  onPaginaChange,
  onAbrirDetalhe,
  onEditar,
}) => {
  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => onBuscaChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onBuscar()}
          placeholder="Buscar por nome ou domínio..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select
          value={filtroSetor}
          onChange={(e) => onFiltroSetorChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">Todos os setores</option>
          {SETORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={onBuscar}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <i className="fa-solid fa-search"></i> Buscar
        </button>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando...
        </div>
      ) : empresas.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-building"
          titulo="Nenhuma empresa encontrada"
          descricao="Crie uma empresa ou importe do Prospect Engine"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="px-3 py-2.5 text-left font-semibold">Empresa</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden md:table-cell">
                  Domínio
                </th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Setor
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Leads</th>
                <th className="px-3 py-2.5 text-center font-semibold">Prospects</th>
                <th className="px-3 py-2.5 text-center font-semibold">Clientes</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Local
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onAbrirDetalhe(emp.id)}
                >
                  <td className="px-3 py-2.5 font-medium text-gray-800">{emp.nome}</td>
                  <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell">
                    {emp.dominio || '—'}
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    {emp.setor ? (
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">
                        {emp.setor}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">{emp.total_leads}</td>
                  <td className="px-3 py-2.5 text-center">{emp.total_prospects}</td>
                  <td className="px-3 py-2.5 text-center">{emp.total_clientes}</td>
                  <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">
                    {emp.cidade ? `${emp.cidade}/${emp.uf}` : '—'}
                  </td>
                  <td
                    className="px-3 py-2.5 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onEditar(emp)}
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
            {total} empresa{total !== 1 ? 's' : ''}
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
              disabled={empresas.length < pageSize}
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

export default EmpresasTab;
