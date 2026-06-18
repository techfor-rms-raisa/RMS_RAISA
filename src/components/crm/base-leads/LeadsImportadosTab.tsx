/**
 * LeadsImportadosTab.tsx — Aba "Leads Importados" do BaseLeadsPage
 *
 * Caminho: src/components/crm/base-leads/LeadsImportadosTab.tsx
 * Versão: 1.3 (Sub-fase 3.D refino — 18/06/2026 — Promover libera TTL ativo)
 *
 * 🆕 v1.3 (Sub-fase 3.D refino — 18/06/2026):
 *   Botão "Promover" agora aparece TAMBÉM para leads com
 *   `status_atualizacao='ttl_nao_atingido'` (badge "TTL ativo"), além de
 *   `nao_localizado`. Motivação: leads em TTL ficam travados na aba sem
 *   ação prática (só podem ser editados), o que cria UX dead-lock —
 *   especialmente após segunda tentativa de validar bloqueada pela Etapa 0.
 *   Liberar Promover dá ao GC/SDR a opção de assumir o risco e seguir
 *   adiante; se der bounce, fluxo natural (crm-webhook v1.15.1) move
 *   automaticamente para a aba E-mails Inválidos.
 *
 * v1.2 (Sub-fase 3.D refino — 18/06/2026):
 *   • Nova prop `onPromover` (callback chamado quando usuário clica no
 *     botão "Promover" purple de uma linha).
 *   • Novo botão "Promover" (ícone fa-rocket, cor purple-600) ao lado de
 *     "Editar" e antes de "Validar" na coluna Ações. Aparece APENAS para
 *     leads com `status_atualizacao === 'nao_localizado'` — caso de uso
 *     em que todos os providers do cascade falharam e o usuário decide
 *     promover manualmente para o CRM assumindo o risco de bounce.
 *
 * v1.1 (Sub-fase 3.D — 17/06/2026):
 *   • Nova prop `onEditar` (callback chamado quando usuário clica
 *     no botão Editar de uma linha).
 *   • Novo botão "Editar" (ícone lápis) ao lado do "Validar" na
 *     coluna Ações de cada linha.
 *
 * v1.0 (Sub-fase 3.C — 17/06/2026): primeira versão.
 *
 * Mostra os leads em `prospect_leads` com motor='importacao_lista'
 * filtrados pelo `reservado_por` do GC/SDR logado (toggle "Apenas meus").
 *
 * Ações:
 *  • Linha: botão "Validar" individual → POST /api/prospect-revalidate
 *    em modo individual, atualiza a linha quando termina.
 *  • Linha: botão "Editar" → callback `onEditar(lead)` (modal externo).
 *
 * Filtros:
 *  • Apenas meus (default ativo)
 *  • Status (atualizado / promovido / trocou_empresa / ...)
 *  • Ordenação (recente / antigo / proxima_validacao)
 *  • Busca (nome / email / empresa)
 *  • Paginação (30 / 50 / 100 por página)
 *
 * Componente puramente UI — toda a lógica de estado e fetch vem
 * do hook useLeadsImportados (passado via prop `hook`).
 */

import React, { useCallback } from 'react';
import type {
  LeadImportado,
  OrdenacaoImportados,
  PerPageImportados,
  StatusAtualizacao,
  useLeadsImportados,
} from '../shared/hooks/useLeadsImportados';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface LeadsImportadosTabProps {
  hook: ReturnType<typeof useLeadsImportados>;
  /** 🆕 v1.1 — Callback chamado quando usuário clica no botão Editar de uma linha. */
  onEditar: (lead: LeadImportado) => void;
  /** 🆕 v1.2 — Callback chamado quando usuário clica no botão Promover de uma linha. */
  onPromover: (lead: LeadImportado) => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS DE EXIBIÇÃO
// ════════════════════════════════════════════════════════════

function formatarData(s: string | null): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function formatarDataCurta(s: string | null): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  } catch { return '—'; }
}

interface BadgeStatusProps { status: StatusAtualizacao | null; }
const BadgeStatus: React.FC<BadgeStatusProps> = ({ status }) => {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
        <i className="fa-solid fa-hourglass-half"></i> Pendente
      </span>
    );
  }
  const map: Record<StatusAtualizacao, { cor: string; icone: string; label: string }> = {
    atualizado:       { cor: 'bg-emerald-100 text-emerald-700', icone: 'fa-circle-check',  label: 'Atualizado' },
    promovido:        { cor: 'bg-indigo-100 text-indigo-700',   icone: 'fa-arrow-up',      label: 'Promovido' },
    trocou_empresa:   { cor: 'bg-amber-100 text-amber-700',     icone: 'fa-arrows-rotate', label: 'Trocou empresa' },
    nao_localizado:   { cor: 'bg-gray-200 text-gray-700',       icone: 'fa-circle-question', label: 'Não localizado' },
    dominio_invalido: { cor: 'bg-red-100 text-red-700',         icone: 'fa-ban',           label: 'Domínio inválido' },
    opt_out:          { cor: 'bg-rose-100 text-rose-700',       icone: 'fa-ban',           label: 'Opt-out' },
    ttl_nao_atingido: { cor: 'bg-blue-100 text-blue-700',       icone: 'fa-clock',         label: 'TTL ativo' },
    pendente:         { cor: 'bg-gray-100 text-gray-600',       icone: 'fa-hourglass-half', label: 'Pendente' },
  };
  const m = map[status] ?? map.pendente;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${m.cor}`}>
      <i className={`fa-solid ${m.icone}`}></i> {m.label}
    </span>
  );
};

interface BadgeEmailProps { score: string | null; }
const BadgeEmail: React.FC<BadgeEmailProps> = ({ score }) => {
  if (!score) return <i className="fa-solid fa-circle-question text-gray-400 text-xs" title="Pendente"></i>;
  const s = score.toLowerCase();
  if (s === 'verified')  return <i className="fa-solid fa-circle-check text-emerald-500 text-xs" title="Verificado"></i>;
  if (s === 'probable')  return <i className="fa-solid fa-circle-half-stroke text-amber-500 text-xs" title="Provável"></i>;
  if (s === 'risky')     return <i className="fa-solid fa-circle-exclamation text-amber-500 text-xs" title="Arriscado"></i>;
  if (s === 'invalid')   return <i className="fa-solid fa-circle-xmark text-red-500 text-xs" title="Inválido"></i>;
  return <i className="fa-solid fa-circle-question text-gray-400 text-xs" title={score}></i>;
};

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const LeadsImportadosTab: React.FC<LeadsImportadosTabProps> = ({ hook, onEditar, onPromover }) => {
  const {
    leads, total, page, perPage, apenasMeus, filtroStatus,
    ordenacao, busca, loading, cotaConsumidaHoje, cotaResidual,
    validandoLeadIds,
    setPage, setPerPage, setApenasMeus, setFiltroStatus,
    setOrdenacao, setBusca,
    carregar, validarLead,
  } = hook;

  const totalPaginas = Math.max(1, Math.ceil(total / perPage));

  // Validação individual de 1 lead (botão da coluna Ações)
  const onValidar = useCallback(async (lead: LeadImportado) => {
    const r = await validarLead(lead);
    if (r.ok) {
      // Recarrega a página atual para refletir o novo status_atualizacao
      carregar();
    } else {
      alert(`Falha na validação: ${r.mensagem || 'erro desconhecido'}`);
    }
  }, [validarLead, carregar]);

  // ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">

      {/* ── Cabeçalho da aba ─────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <i className="fa-solid fa-info-circle text-indigo-500"></i>
          Mostrando <strong className="text-gray-900">{total} leads importados</strong>
          {apenasMeus && ' reservados para você'}
          <span className="text-gray-400">·</span>
          Cota Revalidação hoje: <strong className="text-gray-900">{cotaConsumidaHoje} / 50</strong>
          {cotaResidual > 0 && cotaResidual <= 10 && (
            <span className="text-amber-600 text-xs font-medium">
              <i className="fa-solid fa-triangle-exclamation"></i> {cotaResidual} restantes
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Apenas meus */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={apenasMeus}
              onChange={e => { setApenasMeus(e.target.checked); setPage(1); }}
              className="accent-indigo-600"
            />
            <span className="text-indigo-700 font-medium">Apenas meus</span>
          </label>

          {/* Status */}
          <select
            value={filtroStatus}
            onChange={e => { setFiltroStatus(e.target.value as StatusAtualizacao | ''); setPage(1); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todos os status</option>
            <option value="atualizado">Atualizado</option>
            <option value="promovido">Promovido</option>
            <option value="trocou_empresa">Trocou empresa</option>
            <option value="nao_localizado">Não localizado</option>
            <option value="dominio_invalido">Domínio inválido</option>
            <option value="pendente">Pendente (nunca validado)</option>
          </select>

          {/* Ordenação */}
          <select
            value={ordenacao}
            onChange={e => { setOrdenacao(e.target.value as OrdenacaoImportados); setPage(1); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium"
          >
            <option value="recente">Mais recente</option>
            <option value="antigo">Mais antigo</option>
            <option value="proxima_validacao">Próxima validação ↑</option>
          </select>

          {/* per_page */}
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value) as PerPageImportados); setPage(1); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value={30}>30/pg</option>
            <option value={50}>50/pg</option>
            <option value={100}>100/pg</option>
          </select>

          {/* Busca */}
          <div className="relative">
            <i className="fa-solid fa-search absolute left-2.5 top-2 text-gray-400 text-sm"></i>
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); carregar(); } }}
              placeholder="Buscar nome / email / empresa..."
              className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-64"
            />
          </div>
        </div>
      </div>

      {/* ── Tabela ─────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-4 py-2.5 text-left font-semibold">E-mail</th>
                <th className="px-4 py-2.5 text-left font-semibold">Empresa</th>
                <th className="px-4 py-2.5 text-left font-semibold">Vertical</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">Validado em</th>
                <th className="px-4 py-2.5 text-left font-semibold">Próx. validação</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    <i className="fa-solid fa-spinner fa-spin text-xl"></i>
                    <p className="mt-2 text-sm">Carregando…</p>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    <i className="fa-solid fa-inbox text-3xl"></i>
                    <p className="mt-2 text-sm">Nenhum lead importado encontrado.</p>
                    <p className="text-xs mt-1">
                      Use o botão <strong>Importar Lista de Leads</strong> no topo da página.
                    </p>
                  </td>
                </tr>
              ) : (
                leads.map(l => {
                  const validando = validandoLeadIds.has(l.id);
                  const linhaCls = l.status_atualizacao === 'trocou_empresa'
                    ? 'hover:bg-gray-50 bg-amber-50/30'
                    : 'hover:bg-gray-50';
                  return (
                    <tr key={l.id} className={linhaCls}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{l.nome_completo}</div>
                        {l.cargo && (
                          <div className="text-xs text-gray-500">{l.cargo}</div>
                        )}
                        {l.review_manual && (
                          <div className="text-xs text-amber-700">
                            <i className="fa-solid fa-triangle-exclamation"></i> Revisão manual
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700 flex items-center gap-1">
                          <BadgeEmail score={l.email_status} />
                          <span className="truncate max-w-[14rem]" title={l.email ?? ''}>
                            {l.email || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{l.empresa_nome || '—'}</td>
                      <td className="px-4 py-3">
                        {l.vertical ? (
                          <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                            {l.vertical}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3"><BadgeStatus status={l.status_atualizacao} /></td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatarData(l.validado_em)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatarDataCurta(l.proxima_validacao)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          {/* 🆕 v1.1 — botão Editar (lápis) */}
                          <button
                            onClick={() => onEditar(l)}
                            title="Editar dados do lead"
                            className="px-2.5 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 inline-flex items-center gap-1"
                          >
                            <i className="fa-solid fa-pen-to-square"></i> Editar
                          </button>
                          {/* 🆕 v1.2 — botão Promover (foguete)
                              🔧 v1.3 — também libera para 'ttl_nao_atingido' (TTL ativo)
                              para evitar UX dead-lock: lead em TTL fica travado sem
                              ação prática. Promover permite ao usuário assumir o risco
                              de bounce e seguir adiante. */}
                          {(l.status_atualizacao === 'nao_localizado' ||
                            l.status_atualizacao === 'ttl_nao_atingido') && (
                            <button
                              onClick={() => onPromover(l)}
                              title="Promover manualmente para o CRM (assume risco de bounce)"
                              className="px-2.5 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-50 inline-flex items-center gap-1"
                            >
                              <i className="fa-solid fa-rocket"></i> Promover
                            </button>
                          )}
                          <button
                            onClick={() => onValidar(l)}
                            disabled={validando || cotaResidual <= 0}
                            title={cotaResidual <= 0 ? 'Cota diária esgotada' : 'Re-validar e-mail'}
                            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            {validando ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i> Validando…
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-envelope-circle-check"></i> Validar
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Paginação ───────────────────────────────────── */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-500">
            Página <strong>{page}</strong> de {totalPaginas} · Mostrando{' '}
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => {
              const n = i + 1;
              return (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-3 py-1.5 rounded ${
                    n === page
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPaginas, page + 1))}
              disabled={page >= totalPaginas}
              className="px-3 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsImportadosTab;
