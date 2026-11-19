/**
 * EmpresasTab.tsx — Aba Empresas
 *
 * Caminho: src/components/crm/base-leads/EmpresasTab.tsx
 * Versão: 1.2 (19/11/2026)
 *
 * Histórico:
 *   v1.2 — 19/11/2026: filtro "Datas recentes" (mockup aprovado por Messias).
 *          Seletor "Datas" ao lado de setor: todas A–Z (padrão, igual a antes)
 *          | todas mais recentes primeiro | hoje | 7 dias | 30 dias.
 *          Com filtro ativo: faixa com o total + "limpar filtro de datas" e
 *          mensagem própria quando o período está vazio. Nova coluna
 *          "Incluída em" (criado_em + origem + criado_por), sempre visível.
 *          Pareado com useEmpresas v1.1 e api/crm-leads.ts v1.32.
 *   v1.1 — 19/11/2026: coluna "LinkedIn" (mockup aprovado por Messias).
 *          Com email_empresas.linkedin_url → botão "Perfil" (abre a página
 *          da empresa em nova aba). Sem perfil → botão "Buscar" (busca de
 *          empresas do LinkedIn com o nome). Clique no botão não abre o
 *          painel lateral. Coluna visível em qualquer largura de tela.
 *   v1.0 — 29/05/2026 (Fase 1C): decomposto de EmpresasLeadsCRM.tsx
 *          (linhas 524-610). Toolbar de busca/filtro + tabela + paginação + ações.
 */

import React from 'react';
import { SETORES } from '../types/crm.constants';
import EmptyState from '../shared/components/EmptyState';
import type { Empresa } from '../types/crm.types';
// 🆕 v1.1 (19/11/2026) — link do LinkedIn da empresa
import { hrefLinkedinEmpresa, urlBuscaLinkedinEmpresa } from '../shared/utils/linkedinEmpresa';
// 🆕 v1.2 (19/11/2026) — coluna "Incluída em"
import { formatarDataInclusao, rotuloOrigemEmpresa } from '../shared/utils/dataInclusao';

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

// 🆕 v1.2 (19/11/2026) — Opções do seletor "Datas".
//   Whitelist alinhada com o backend (crm-leads v1.32, listar_empresas `datas`).
const OPCOES_DATAS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '',         label: 'todas (A–Z)' },
  { value: 'recentes', label: 'todas — mais recentes primeiro' },
  { value: 'hoje',     label: 'incluídas hoje' },
  { value: '7d',       label: 'últimos 7 dias' },
  { value: '30d',      label: 'últimos 30 dias' },
];

// 🆕 v1.2 — Texto da faixa e do estado vazio por período.
const DESCRICAO_PERIODO: Record<string, { faixa: string; vazio: string }> = {
  recentes: { faixa: 'Todas as empresas',                      vazio: 'Nenhuma empresa encontrada' },
  hoje:     { faixa: 'Empresas incluídas hoje',                vazio: 'Nenhuma empresa incluída hoje' },
  '7d':     { faixa: 'Empresas incluídas nos últimos 7 dias',  vazio: 'Nenhuma empresa incluída nos últimos 7 dias' },
  '30d':    { faixa: 'Empresas incluídas nos últimos 30 dias', vazio: 'Nenhuma empresa incluída nos últimos 30 dias' },
};

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
  /** 🆕 v1.2 — '' (A–Z) | recentes | hoje | 7d | 30d */
  filtroDatas: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onFiltroSetorChange: (v: string) => void;
  /** 🆕 v1.2 */
  onFiltroDatasChange: (v: string) => void;
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
  filtroDatas,
  loading,
  onBuscaChange,
  onFiltroSetorChange,
  onFiltroDatasChange,
  onBuscar,
  onPaginaChange,
  onAbrirDetalhe,
  onEditar,
}) => {
  // 🆕 v1.2 — undefined quando o filtro de datas está desligado (A–Z)
  const periodo = filtroDatas ? DESCRICAO_PERIODO[filtroDatas] : undefined;

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
        {/* 🆕 v1.2 (19/11/2026) — Seletor "Datas" */}
        <div className="relative">
          <i
            className={`fa-regular fa-calendar absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${
              filtroDatas ? 'text-indigo-600' : 'text-gray-400'
            }`}
          ></i>
          <select
            value={filtroDatas}
            onChange={(e) => onFiltroDatasChange(e.target.value)}
            title="Filtrar e ordenar pela data de inclusão da empresa"
            className={`pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              filtroDatas
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 font-medium'
                : 'border-gray-300 bg-gray-50'
            }`}
          >
            {OPCOES_DATAS.map((opc) => (
              <option key={opc.value} value={opc.value}>
                Datas: {opc.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onBuscar}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <i className="fa-solid fa-search"></i> Buscar
        </button>
      </div>

      {/* 🆕 v1.2 (19/11/2026) — Faixa do filtro de datas ativo */}
      {periodo && !loading && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
          <i className="fa-regular fa-calendar"></i>
          <span>
            {periodo.faixa} — <b>{total} empresa{total !== 1 ? 's' : ''}</b>, mais recentes primeiro
          </span>
          <button
            type="button"
            onClick={() => onFiltroDatasChange('')}
            className="ml-auto text-xs text-indigo-700 underline hover:text-indigo-900"
          >
            ✕ limpar filtro de datas
          </button>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando...
        </div>
      ) : empresas.length === 0 && periodo && filtroDatas !== 'recentes' ? (
        // 🆕 v1.2 — período sem empresas
        <EmptyState
          icon="fa-regular fa-calendar"
          titulo={periodo.vazio}
          descricao="Escolha um período maior ou limpe o filtro de datas."
        />
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
                {/* 🆕 v1.1 (19/11/2026) — coluna LinkedIn */}
                <th className="px-3 py-2.5 text-left font-semibold">LinkedIn</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Setor
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Leads</th>
                <th className="px-3 py-2.5 text-center font-semibold">Prospects</th>
                <th className="px-3 py-2.5 text-center font-semibold">Clientes</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Local
                </th>
                {/* 🆕 v1.2 (19/11/2026) — coluna "Incluída em" (seta quando ordenada por data) */}
                <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                  Incluída em
                  {filtroDatas && <i className="fa-solid fa-arrow-down ml-1 text-indigo-500"></i>}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map((emp) => {
                // 🆕 v1.1 (19/11/2026) — null quando vazio ou não é página de empresa
                const linkedinHref = hrefLinkedinEmpresa(emp.linkedin_url);
                // 🆕 v1.2 (19/11/2026) — coluna "Incluída em"
                const inclusao = formatarDataInclusao(emp.criado_em);
                const origemLabel = rotuloOrigemEmpresa(emp.origem);
                return (
                <tr
                  key={emp.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onAbrirDetalhe(emp.id)}
                >
                  <td className="px-3 py-2.5 font-medium text-gray-800">{emp.nome}</td>
                  <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell">
                    {emp.dominio || '—'}
                  </td>
                  {/* 🆕 v1.1 (19/11/2026) — LinkedIn: "Perfil" ou "Buscar" */}
                  <td
                    className="px-3 py-2.5 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {linkedinHref ? (
                      <a
                        href={linkedinHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={linkedinHref}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors"
                      >
                        <i className="fa-brands fa-linkedin"></i> Perfil
                      </a>
                    ) : (
                      <a
                        href={urlBuscaLinkedinEmpresa(emp.nome)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Perfil ainda não cadastrado — abre a busca de empresas do LinkedIn com este nome"
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-400 hover:text-blue-700 hover:border-blue-700 px-2 py-1 rounded-md transition-colors"
                      >
                        <i className="fa-brands fa-linkedin"></i> Buscar
                      </a>
                    )}
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
                  {/* 🆕 v1.2 (19/11/2026) — data + relativo · origem · quem incluiu */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {inclusao ? (
                      <>
                        <div className="text-gray-800">{inclusao.data}</div>
                        <div className="text-xs text-gray-500">
                          <span className={inclusao.ehHoje ? 'text-emerald-600' : ''}>
                            {inclusao.relativo}
                          </span>
                          {origemLabel && <> · {origemLabel}</>}
                          {emp.criado_por && <> · <span className="italic">por {emp.criado_por}</span></>}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
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
                );
              })}
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
