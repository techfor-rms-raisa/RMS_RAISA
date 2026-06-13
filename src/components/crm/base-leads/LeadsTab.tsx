/**
 * LeadsTab.tsx — Aba "Meus Leads" da Base de Leads
 *
 * Caminho: src/components/crm/base-leads/LeadsTab.tsx
 * Versão: 1.1 (Reorganização Prospect/Lead — 13/06/2026)
 *
 * v1.1 (13/06/2026 — Reorganização Prospect/Lead):
 *   Reorganização visual e funcional da tabela "Meus Leads" para refletir
 *   a hierarquia operacional do funil:
 *
 *   NOVA ORDEM DE COLUNAS (10 colunas):
 *     1. EMPRESA   — do join email_empresas
 *     2. NOME      — do email_leads
 *     3. CARGO     — do email_leads
 *     4. E-MAIL    — do email_leads
 *     5. ANALISTA  — 🆕 reservado_por_nome (computado no backend v1.14)
 *     6. VERTICAL  — 🆕 vertical do email_leads
 *     7. FUNIL     — funil_status (badge)
 *     8. E-MAILS   — total_emails_recebidos
 *     9. ABERTOS   — total_emails_abertos
 *    10. AÇÕES     — botão Editar
 *
 *   NOVO CONTROLE: dropdown "Ordenar por" ao lado do filtro de status.
 *     • + Recentes  (default — criado_em desc)
 *     • Empresa     (email_empresas.nome asc)
 *     • Nome        (email_leads.nome asc)
 *     • Cargo       (cargo asc — NULLs no final)
 *
 *   Responsividade: como agora há 10 colunas, aplicamos breakpoints
 *   para preservar usabilidade em telas menores:
 *     • md (≥768px): mostra E-MAIL, E-MAILS, ABERTOS
 *     • lg (≥1024px): mostra CARGO, ANALISTA, VERTICAL
 *     • base: EMPRESA, NOME, FUNIL, AÇÕES sempre visíveis
 *
 *   Badge "Opt-out" do v1.0 PERMANECE como defesa em camadas (mesmo
 *   que o backend v1.13 já filtre opt-outs do payload, se algum vier
 *   por cache antigo, o usuário vê a marcação).
 *
 * v1.0 (Fase 1C — 29/05/2026):
 *   Decomposto de EmpresasLeadsCRM.tsx (linhas 612-712).
 */

import React from 'react';
import FunilBadge, { FUNIL_LABELS } from '../shared/components/FunilBadge';
import EmptyState from '../shared/components/EmptyState';
import type { Lead } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

// 🆕 v1.1 — Opções do dropdown "Ordenar por".
//   Whitelist alinhada com o backend (crm-leads v1.14, action listar_leads).
const OPCOES_ORDENACAO: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'recentes', label: '+ Recentes' },
  { value: 'empresa',  label: 'Empresa' },
  { value: 'nome',     label: 'Nome' },
  { value: 'cargo',    label: 'Cargo' },
];

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
  /** 🆕 v1.1 — Ordenação atual (whitelist: recentes/empresa/nome/cargo). */
  ordenarPor: string;
  loading: boolean;
  onBuscaChange: (v: string) => void;
  onFiltroFunilChange: (v: string) => void;
  /** 🆕 v1.1 — Handler de mudança da ordenação. */
  onOrdenarPorChange: (v: string) => void;
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
  ordenarPor,
  loading,
  onBuscaChange,
  onFiltroFunilChange,
  onOrdenarPorChange,
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
          title="Filtrar por status do funil"
        >
          <option value="">Todos os status</option>
          {Object.entries(FUNIL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>

        {/* 🆕 v1.1 — Dropdown "Ordenar por" */}
        <select
          value={ordenarPor}
          onChange={(e) => onOrdenarPorChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
          title="Ordenar a lista por"
        >
          {OPCOES_ORDENACAO.map((opc) => (
            <option key={opc.value} value={opc.value}>
              Ordenar: {opc.label}
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
                {/* 🆕 v1.1 — Nova ordem: EMPRESA, NOME, CARGO, EMAIL, ANALISTA,
                              VERTICAL, FUNIL, EMAILS, ABERTOS, AÇÕES */}
                <th className="px-3 py-2.5 text-left font-semibold">Empresa</th>
                <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                  Cargo
                </th>
                <th className="px-3 py-2.5 text-left font-semibold hidden md:table-cell">
                  E-mail
                </th>
                <th className="px-3 py-2.5 text-center font-semibold hidden lg:table-cell">
                  Analista
                </th>
                <th className="px-3 py-2.5 text-center font-semibold hidden lg:table-cell">
                  Vertical
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">Funil</th>
                <th className="px-3 py-2.5 text-center font-semibold hidden md:table-cell">
                  E-mails
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
                  {/* 1. EMPRESA */}
                  <td className="px-3 py-2.5 text-gray-700">
                    {lead.email_empresas?.nome || '—'}
                  </td>

                  {/* 2. NOME (+ badge Opt-out defensivo) */}
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800">{lead.nome}</div>
                    {lead.opt_out && (
                      <span className="text-xs text-red-500 flex items-center gap-0.5">
                        <i className="fa-solid fa-ban"></i> Opt-out
                      </span>
                    )}
                  </td>

                  {/* 3. CARGO */}
                  <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">
                    {lead.cargo || '—'}
                  </td>

                  {/* 4. E-MAIL */}
                  <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell text-xs">
                    {lead.email}
                  </td>

                  {/* 5. ANALISTA — badge com primeiro nome do reservado_por_nome.
                       Padrão visual idêntico ao Prospect Engine (sky-100/sky-700). */}
                  <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                    {lead.reservado_por_nome ? (
                      <span
                        className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium whitespace-nowrap"
                        title={lead.reservado_por_nome}
                      >
                        {lead.reservado_por_nome.split(' ')[0]}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* 6. VERTICAL — badge indigo consistente com a paleta da página. */}
                  <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                    {lead.vertical ? (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium whitespace-nowrap">
                        {lead.vertical}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* 7. FUNIL */}
                  <td className="px-3 py-2.5 text-center">
                    <FunilBadge status={lead.funil_status} />
                  </td>

                  {/* 8. E-MAILS */}
                  <td className="px-3 py-2.5 text-center hidden md:table-cell">
                    {lead.total_emails_recebidos}
                  </td>

                  {/* 9. ABERTOS */}
                  <td className="px-3 py-2.5 text-center hidden md:table-cell">
                    {lead.total_emails_abertos}
                  </td>

                  {/* 10. AÇÕES */}
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
