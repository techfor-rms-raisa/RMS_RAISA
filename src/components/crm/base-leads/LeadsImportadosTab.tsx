/**
 * LeadsImportadosTab.tsx — Aba "Leads Importados" do BaseLeadsPage
 *
 * Caminho: src/components/crm/base-leads/LeadsImportadosTab.tsx
 * Versão: 1.6 (Descarte lógico do lead importado — 19/08/2026)
 *
 * 🆕 v1.6 (19/08/2026 — Descarte lógico), mockup aprovado por Messias:
 *   • Botão "Descartar" (lixeira vermelha, somente ícone) na coluna Ações,
 *     último da fila. Dispara `onDescartar(lead)` — o modal de confirmação
 *     mora no BaseLeadsPage, mesmo padrão de Editar e Promover.
 *   • Checkbox "Ver descartados" ao lado de "Apenas meus". Quando ligado,
 *     a listagem traz SOMENTE os leads descartados e a coluna Ações passa
 *     a exibir um único botão "Restaurar" (verde).
 *   • Banner rosé de contexto no modo descartados, deixando explícito que
 *     nada foi apagado do banco.
 *   • Linhas descartadas em bg-rose-50/40, nome riscado e legenda
 *     "Descartado · {data}" derivada de `atualizado_em` (coluna que o
 *     PATCH já grava — sem migration).
 *
 *   O empty state também muda no modo descartados: "Nenhum lead
 *   descartado" com convite a desligar o filtro, em vez de sugerir a
 *   importação de lista (que ali seria instrução errada).
 *
 * v1.5 (Cota parametrizada — 23/06/2026)
 *
 * 🆕 v1.5 (23/06/2026 — Cota parametrizada por usuário):
 *   Remove o hardcode `/ 50` do badge "Cota Revalidação hoje" e passa
 *   a renderizar o total vindo do hook (`cotaTotal`). O hook lê a cota
 *   diária parametrizada do backend (`app_users.cota_revalidacao_diaria`,
 *   via helper lib/cota-diaria.ts).
 *
 *   Decisão Messias 23/06/2026:
 *     - Cada GC/SDR/Admin tem cota individual (range 0–500).
 *     - Aba "Cotas" no menu CRM & Campanhas permite Admin editar.
 *     - Default mantém 50 (compatível com comportamento anterior).
 *
 *   Mudanças cirúrgicas (linhas atingidas):
 *     - Linha ~184: troca o literal `50` por `{cotaTotal}` no badge.
 *     - Linha ~190 (banner "X restantes"): regra de aviso passa a usar
 *       o cotaTotal vindo do hook (10% como threshold genérico, em
 *       vez do absoluto de 10 que assumia 50 fixo). Mantém amber-600.
 *     - Destructure de `hook` ganha `cotaTotal`.
 *
 *   Backwards-compatible: se o hook ainda não tiver `cotaTotal` (em
 *   ambiente em rolling deploy), usa fallback `cotaTotal ?? 50`.
 *
 * v1.4 (UX LinkedIn discreto na tabela — 19/06/2026)
 *
 * v1.4 (19/06/2026 — UX LinkedIn): pequeno ícone azul oficial do LinkedIn
 *   (#0A66C2) ao lado do nome do lead na coluna principal, EXIBIDO APENAS
 *   quando `l.linkedin_url` está preenchido. Click abre o perfil em nova
 *   aba (target=_blank, rel=noreferrer) e usa stopPropagation para não
 *   acionar nenhum handler de linha que exista a futuro. Mudança apenas
 *   visual; não altera dados, hooks ou contratos.
 *
 * v1.3 (Sub-fase 3.D refino — 18/06/2026 — Promover libera TTL ativo)
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
  /** 🆕 v1.6 — Callback chamado quando usuário clica no botão Descartar (lixeira). */
  onDescartar: (lead: LeadImportado) => void;
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

const LeadsImportadosTab: React.FC<LeadsImportadosTabProps> = ({
  hook, onEditar, onPromover, onDescartar,
}) => {
  const {
    leads, total, page, perPage, apenasMeus, filtroStatus,
    ordenacao, busca, loading, cotaConsumidaHoje, cotaResidual,
    // 🆕 v1.5 (23/06/2026) — cota total parametrizada (substitui o /50 hardcoded)
    cotaTotal,
    // 🆕 v1.6 (19/08/2026) — modo "Ver descartados"
    verDescartados, setVerDescartados, restaurandoLeadIds, restaurar,
    validandoLeadIds,
    setPage, setPerPage, setApenasMeus, setFiltroStatus,
    setOrdenacao, setBusca,
    carregar, validarLead,
  } = hook;

  const totalPaginas = Math.max(1, Math.ceil(total / perPage));

  // 🆕 v1.5 — fallback defensivo. Se cotaTotal não vier do hook (ex: durante
  //   rolling deploy do backend), usa 50 (mesmo default histórico do sistema).
  const cotaTotalSafe = cotaTotal ?? 50;

  // 🆕 v1.5 — threshold relativo de aviso (10% da cota), em vez do absoluto
  //   de 10 que assumia 50 fixo. Para cotaTotal=50 segue avisando em ≤5;
  //   para cotaTotal=200, avisa em ≤20; etc. Mínimo 5 para evitar avisar
  //   tarde demais em cotas muito altas.
  const limiteAvisoRestante = Math.max(5, Math.floor(cotaTotalSafe * 0.1));

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

  // 🆕 v1.6 — Restaurar 1 lead descartado (botão da coluna Ações no modo
  //   "Ver descartados"). Sem modal de confirmação: a ação é construtiva
  //   e reversível pelo próprio botão Descartar.
  const onRestaurar = useCallback(async (lead: LeadImportado) => {
    const r = await restaurar(lead.id);
    if (!r.ok) {
      alert(`Não foi possível restaurar o lead: ${r.error || 'erro desconhecido'}`);
    }
  }, [restaurar]);

  // ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">

      {/* ── Cabeçalho da aba ─────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <i className="fa-solid fa-info-circle text-indigo-500"></i>
          {/* 🆕 v1.6 — o rótulo muda no modo "Ver descartados" para não
              induzir o operador a achar que perdeu leads da base ativa. */}
          Mostrando{' '}
          <strong className="text-gray-900">
            {total} {verDescartados ? 'leads descartados' : 'leads importados'}
          </strong>
          {apenasMeus && !verDescartados && ' reservados para você'}
          <span className="text-gray-400">·</span>
          Cota Revalidação hoje: <strong className="text-gray-900">{cotaConsumidaHoje} / {cotaTotalSafe}</strong>
          {cotaResidual > 0 && cotaResidual <= limiteAvisoRestante && (
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

          {/* 🆕 v1.6 — Ver descartados.
              Vive fora do dropdown de status porque filtra a coluna
              `status` (novo / no_crm / descartado), enquanto o dropdown
              filtra `status_atualizacao` (atualizado / promovido / ...).
              São eixos independentes; misturá-los no mesmo controle
              produziria combinações sem sentido. */}
          <label
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm cursor-pointer ${
              verDescartados
                ? 'bg-rose-50 border-rose-200'
                : 'bg-white border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={verDescartados}
              onChange={e => { setVerDescartados(e.target.checked); setPage(1); }}
              className="accent-rose-600"
            />
            <span className={`font-medium ${verDescartados ? 'text-rose-700' : 'text-gray-700'}`}>
              Ver descartados
            </span>
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

      {/* 🆕 v1.6 — Banner de contexto do modo "Ver descartados" */}
      {verDescartados && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5 text-sm text-rose-800 flex items-center gap-2">
          <i className="fa-solid fa-trash-can"></i>
          Exibindo apenas leads <strong>descartados</strong>. Nenhum registro foi apagado do
          banco — use <strong>Restaurar</strong> para devolver o lead à listagem ativa.
        </div>
      )}

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
                    {/* 🆕 v1.6 — o vazio de "descartados" pede instrução
                        diferente: sugerir importar lista ali seria orientação
                        errada para quem só ligou o filtro. */}
                    {verDescartados ? (
                      <>
                        <i className="fa-solid fa-trash-can text-3xl"></i>
                        <p className="mt-2 text-sm">Nenhum lead descartado.</p>
                        <p className="text-xs mt-1">
                          Desligue <strong>Ver descartados</strong> para voltar à listagem ativa.
                        </p>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-inbox text-3xl"></i>
                        <p className="mt-2 text-sm">Nenhum lead importado encontrado.</p>
                        <p className="text-xs mt-1">
                          Use o botão <strong>Importar Lista de Leads</strong> no topo da página.
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                leads.map(l => {
                  const validando = validandoLeadIds.has(l.id);
                  // 🆕 v1.6 — no modo descartados a linha inteira ganha tom
                  //   rosé; o destaque âmbar de 'trocou_empresa' perde
                  //   utilidade ali (o lead saiu do fluxo de trabalho).
                  const restaurando = restaurandoLeadIds.has(l.id);
                  const linhaCls = verDescartados
                    ? 'bg-rose-50/40 hover:bg-rose-50'
                    : l.status_atualizacao === 'trocou_empresa'
                      ? 'hover:bg-gray-50 bg-amber-50/30'
                      : 'hover:bg-gray-50';
                  return (
                    <tr key={l.id} className={linhaCls}>
                      <td className="px-4 py-3">
                        <div className={`font-medium flex items-center gap-2 ${
                          verDescartados ? 'text-gray-500 line-through' : 'text-gray-900'
                        }`}>
                          <span>{l.nome_completo}</span>
                          {/* v1.4 (19/06/2026): ícone LinkedIn discreto inline */}
                          {l.linkedin_url && (
                            <a
                              href={l.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir perfil no LinkedIn em nova aba"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#0A66C2] hover:text-[#004182] inline-flex items-center"
                            >
                              <i className="fa-brands fa-linkedin"></i>
                            </a>
                          )}
                        </div>
                        {l.cargo && (
                          <div className="text-xs text-gray-500">{l.cargo}</div>
                        )}
                        {l.review_manual && !verDescartados && (
                          <div className="text-xs text-amber-700">
                            <i className="fa-solid fa-triangle-exclamation"></i> Revisão manual
                          </div>
                        )}
                        {/* 🆕 v1.6 — data do descarte via `atualizado_em`,
                            gravado pelo PATCH excluir_logico. Sem migration. */}
                        {verDescartados && (
                          <div className="text-xs text-rose-700 mt-0.5">
                            <i className="fa-solid fa-trash-can"></i> Descartado ·{' '}
                            {formatarData(l.atualizado_em)}
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
                      <td className="px-4 py-3">
                        {/* 🆕 v1.6 — no modo descartados o status relevante é
                            `status='descartado'`, não o `status_atualizacao`
                            congelado no momento do descarte. */}
                        {verDescartados ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700">
                            <i className="fa-solid fa-trash-can"></i> Descartado
                          </span>
                        ) : (
                          <BadgeStatus status={l.status_atualizacao} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatarData(l.validado_em)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatarDataCurta(l.proxima_validacao)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {/* 🆕 v1.6 — no modo descartados a única ação possível
                            é Restaurar. Editar/Validar/Promover em um lead
                            descartado consumiria cota e produziria estado
                            inconsistente (lead fora do fluxo sendo validado). */}
                        {verDescartados ? (
                          <button
                            onClick={() => onRestaurar(l)}
                            disabled={restaurando}
                            title="Restaurar lead para a listagem ativa"
                            className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            {restaurando ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i> Restaurando…
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-rotate-left"></i> Restaurar
                              </>
                            )}
                          </button>
                        ) : (
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
                          {/* 🆕 v1.6 — botão Descartar (lixeira).
                              Exclusão LÓGICA: o backend (prospect-leads v1.2)
                              marca status='descartado' e devolve 409 se o lead
                              já estiver promovido ao CRM (status='no_crm'). */}
                          <button
                            onClick={() => onDescartar(l)}
                            title="Descartar lead importado (exclusão lógica — reversível)"
                            className="px-2.5 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 inline-flex items-center"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                        )}
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
