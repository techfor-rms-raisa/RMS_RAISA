/**
 * AcompanhamentoPage.tsx — Página de Acompanhamento (Dashboard CRM)
 *
 * Caminho: src/components/crm/acompanhamento/AcompanhamentoPage.tsx
 * Versão: 3.1 (21/06/2026)
 *
 * v3.1 (21/06/2026): dropdown de campanha específica no frame Engajamento
 *   da aba "Visão Geral".
 *
 *   Mudanças cirúrgicas (layout das demais seções intocado):
 *
 *     1) Novo state `campanhaIdEngajamento: number | null`. null = "Todas
 *        as campanhas" (default). Quando definido, é passado para o
 *        backend como `campanha_id_engajamento` e os 4 KPIs do frame
 *        passam a refletir SOMENTE a campanha escolhida.
 *
 *     2) Novo state `campanhasDropdown` populado pelo
 *        `listar_campanhas_dropdown` (action já existente desde v2.2 —
 *        respeita RBAC; GC/SDR vêem só as próprias).
 *
 *     3) Quando uma campanha específica está selecionada, o pill-group
 *        de status (Todas/Ativas/Pausadas/Finalizadas) é VISUALMENTE
 *        desabilitado (opacity-40 + pointer-events-none + tooltip).
 *        O state interno é preservado para que o usuário recupere o
 *        filtro ao voltar para "Todas as campanhas". O backend ignora
 *        o status_filtro quando recebe campanha_id_engajamento (vide
 *        api/crm-analytics.ts v2.3 `calcularEngajamento`).
 *
 *     4) Layout: dropdown + pill-group na mesma linha do título do
 *        frame, com flex-wrap para mobile.
 *
 *   Backend correspondente: api/crm-analytics.ts v2.3.
 *   Banco: sem mudança.
 *
 * v3.0 (21/06/2026): introdução de sub-tabs "Visão Geral" / "Painel
 *   Campanha" + filtro de status no frame Engajamento da aba Visão Geral.
 *
 * v2.1 (12/06/2026): substituição do KPI "Taxa clique" por "Taxa resposta"
 *   conforme decisão de produto (12/06/2026).
 *
 * v2.0 (04/06/2026 — Fase 8-fix2): cards de Engajamento & Entregabilidade
 *   foram CONECTADOS aos dados reais.
 *
 * v1.0 (Fase 8 — 01/06/2026): primeira versão.
 *
 * RBAC vem PRONTO do backend (api/crm-analytics.ts): a página apenas
 * mostra o que recebeu. Admin/Gestão de R&S enxergam tudo; demais perfis
 * só veem campanhas onde são responsáveis.
 *
 * Componentes reusados:
 *  - KpiCard (../shared/components/KpiCard)
 *  - EmptyState, Toast (../shared/components/...)
 *  - PainelCampanhaTab (./PainelCampanhaTab — novo na v3.0)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import type { CurrentUserLite } from '../types/crm.types';
import KpiCard from '../shared/components/KpiCard';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';
import PainelCampanhaTab from './PainelCampanhaTab';

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

const ANALYTICS_API_URL = '/api/crm-analytics';

const PERIODOS = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'total', label: 'Total' },
] as const;

type PeriodoId = (typeof PERIODOS)[number]['id'];

const ABAS = [
  { id: 'visao-geral', label: 'Visão Geral', icon: 'fa-solid fa-chart-line' },
  { id: 'painel-campanha', label: 'Painel Campanha', icon: 'fa-solid fa-bullseye' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

const STATUS_FILTRO_ENGAJAMENTO = [
  { id: 'todas', label: 'Todas' },
  { id: 'ativas', label: 'Ativas' },
  { id: 'pausadas', label: 'Pausadas' },
  { id: 'finalizadas', label: 'Finalizadas' },
] as const;

type StatusFiltroEngajamentoId = (typeof STATUS_FILTRO_ENGAJAMENTO)[number]['id'];

// ════════════════════════════════════════════════════════════
// TIPOS DA RESPOSTA DO BACKEND
// ════════════════════════════════════════════════════════════

interface DistribuicaoItem {
  rotulo: string;
  campanhas: number;
  destinatarios: number;
}

interface DistribuicaoBloco {
  _label: string;
  itens: DistribuicaoItem[];
}

interface CampanhaAtiva {
  id: number;
  nome: string;
  vertical: string;
  dominio: string;
  total_destinatarios: number;
  responsavel: string;
  dias_rodando: number | null;
  taxa_abertura: number | null;
  taxa_resposta: number | null;
  aguardando_motor: boolean;
}

interface DashboardStats {
  ator: { id: number; nome: string; tipo: string; ve_tudo: boolean } | null;
  periodo: PeriodoId;
  inicio_periodo: string;
  status_filtro_engajamento?: StatusFiltroEngajamentoId;
  campanha_id_engajamento?: number | null; // 🆕 v3.1 (echo do backend)
  status_campanhas: {
    rascunho: number;
    agendada: number;
    ativa: number;
    pausada: number;
    concluida: number;
    total: number;
  };
  engajamento: {
    total_enviado: number;
    taxa_abertura: number;
    taxa_resposta: number;
    taxa_bounce: number;
    aguardando_motor: boolean;
  };
  distribuicao: {
    por_responsavel: DistribuicaoBloco;
    por_vertical: DistribuicaoBloco;
    por_dominio: DistribuicaoBloco;
  };
  campanhas_ativas: CampanhaAtiva[];
  saude_base: {
    optouts: number;
    leads_aptos: number;
    leads_sem_vertical: number;
  };
  nao_autorizado?: boolean;
}

interface DashboardResponse {
  success: boolean;
  stats: DashboardStats;
  error?: string;
}

// 🆕 v3.1 — Item simplificado do dropdown (não precisamos de todos os campos)
interface CampanhaDropdownItem {
  id: number;
  nome: string;
  status: string;
}

interface ListarCampanhasDropdownResp {
  success: boolean;
  campanhas: CampanhaDropdownItem[];
  error?: string;
}

interface AcompanhamentoPageProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const AcompanhamentoPage: React.FC<AcompanhamentoPageProps> = ({ currentUser }) => {
  const { get } = useCrmApi(ANALYTICS_API_URL);

  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const [periodo, setPeriodo] = useState<PeriodoId>('mes');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMensagem | null>(null);

  const [abaAtiva, setAbaAtiva] = useState<AbaId>('visao-geral');

  const [statusFiltroEngajamento, setStatusFiltroEngajamento] =
    useState<StatusFiltroEngajamentoId>('todas');

  // 🆕 v3.1 — Filtro de campanha específica do frame Engajamento
  const [campanhaIdEngajamento, setCampanhaIdEngajamento] = useState<number | null>(null);
  const [campanhasDropdown, setCampanhasDropdown] = useState<CampanhaDropdownItem[]>([]);
  const [loadingCampanhasDropdown, setLoadingCampanhasDropdown] = useState(false);

  // ── Carregar dashboard ────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!atorEmail) return;
    setLoading(true);

    // Monta params dinamicamente — só envia campanha_id_engajamento se selecionada
    const params: Record<string, string | number> = {
      user_email: atorEmail,
      periodo,
      status_filtro_engajamento: statusFiltroEngajamento,
    };
    if (campanhaIdEngajamento !== null) {
      params.campanha_id_engajamento = campanhaIdEngajamento;
    }

    const resp = await get<DashboardResponse>('dashboard_stats', params);
    if (resp.ok && resp.data?.success) {
      setStats(resp.data.stats);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar dashboard' });
    }
    setLoading(false);
  }, [get, atorEmail, periodo, statusFiltroEngajamento, campanhaIdEngajamento]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // 🆕 v3.1 — Carregar lista de campanhas para o dropdown do frame Engajamento
  //   Chama sem `responsavel_id` — o backend respeita RBAC do ator
  //   (GC/SDR só vê as próprias; Admin vê todas).
  const carregarCampanhasDropdown = useCallback(async () => {
    if (!atorEmail) return;
    let cancelado = false;

    setLoadingCampanhasDropdown(true);
    const resp = await get<ListarCampanhasDropdownResp>('listar_campanhas_dropdown', {
      user_email: atorEmail,
      status_filtro: 'todas',
    });

    if (cancelado) return;

    if (resp.ok && resp.data?.success) {
      setCampanhasDropdown(resp.data.campanhas);
    }
    setLoadingCampanhasDropdown(false);

    return () => {
      cancelado = true;
    };
  }, [get, atorEmail]);

  useEffect(() => {
    carregarCampanhasDropdown();
  }, [carregarCampanhasDropdown]);

  // 🆕 v3.1 — Flag derivada: campanha específica está selecionada
  const campanhaEspecificaSelecionada = campanhaIdEngajamento !== null;

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Toast mensagem={toast} onDismiss={() => setToast(null)} />

      {/* Cabeçalho do módulo */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <i className="fa-solid fa-chart-line text-blue-600 text-xl"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Acompanhamento</h1>
            <p className="text-sm text-gray-500">
              Dashboard analítico de campanhas
              {stats?.ator && !stats.ator.ve_tudo && (
                <span className="ml-2 text-xs text-blue-600">
                  (mostrando suas campanhas — {stats.ator.tipo})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Seletor de período */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                periodo === p.id
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {loading && !stats ? (
        <div className="text-center py-16 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-3xl"></i>
          <p className="text-sm mt-3">Carregando dashboard…</p>
        </div>
      ) : !stats || stats.nao_autorizado ? (
        <EmptyState
          icon="fa-solid fa-lock"
          titulo="Sem acesso ao dashboard"
          descricao="Seu perfil não tem permissão para visualizar o acompanhamento de campanhas."
        />
      ) : (
        <>
          {/* Sub-tabs internas */}
          <div className="bg-white rounded-lg border border-gray-200 p-1 inline-flex gap-1">
            {ABAS.map((aba) => (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                  abaAtiva === aba.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <i className={aba.icon}></i>
                {aba.label}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════════════════
              ABA: VISÃO GERAL
              ════════════════════════════════════════════════════════ */}
          {abaAtiva === 'visao-geral' && (
            <>
              {/* ──────────── Seção 1: Visão das Campanhas ──────────── */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-rocket text-gray-400"></i> Visão das Campanhas
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard label="Total" valor={stats.status_campanhas.total} icon="fa-solid fa-layer-group" cor="gray" />
                  <KpiCard label="Ativas" valor={stats.status_campanhas.ativa} icon="fa-solid fa-rocket" cor="green" />
                  <KpiCard label="Agendadas" valor={stats.status_campanhas.agendada} icon="fa-solid fa-clock" cor="blue" />
                  <KpiCard label="Em rascunho" valor={stats.status_campanhas.rascunho} icon="fa-solid fa-pen-ruler" cor="amber" />
                  <KpiCard label="Pausadas" valor={stats.status_campanhas.pausada} icon="fa-solid fa-pause" cor="purple" />
                  <KpiCard label="Concluídas" valor={stats.status_campanhas.concluida} icon="fa-solid fa-flag-checkered" cor="gray" />
                </div>
              </section>

              {/* ──────────── Seção 2: Engajamento & Entregabilidade ──────────── */}
              {/* 🆕 v3.1 — dropdown de campanha específica + pill-group de status
                  na mesma linha do título. Quando campanha específica selecionada,
                  pill-group fica visualmente desabilitado. */}
              <section>
                <div className="mb-1 flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <i className="fa-solid fa-envelope-open-text text-gray-400"></i>
                    Engajamento & Entregabilidade
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 🆕 v3.1 — Dropdown de campanha específica */}
                    <select
                      value={campanhaIdEngajamento ?? 'todas'}
                      onChange={(e) =>
                        setCampanhaIdEngajamento(
                          e.target.value === 'todas' ? null : Number(e.target.value)
                        )
                      }
                      disabled={loadingCampanhasDropdown}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white max-w-[240px] hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                      title="Filtrar por campanha específica"
                    >
                      <option value="todas">Todas as campanhas</option>
                      {campanhasDropdown.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>

                    {/* Pill-group de status (desabilitado se campanha específica) */}
                    <div
                      className={`flex items-center gap-1 bg-gray-100 rounded-lg p-1 transition-opacity ${
                        campanhaEspecificaSelecionada ? 'opacity-40 pointer-events-none' : ''
                      }`}
                      title={
                        campanhaEspecificaSelecionada
                          ? 'Desabilitado: campanha específica selecionada'
                          : ''
                      }
                    >
                      {STATUS_FILTRO_ENGAJAMENTO.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setStatusFiltroEngajamento(f.id)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                            statusFiltroEngajamento === f.id
                              ? 'bg-white text-blue-700 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {stats.engajamento.aguardando_motor ? (
                  <p className="text-xs text-gray-500 mb-3">
                    <i className="fa-solid fa-clock mr-1 text-amber-500"></i>
                    {campanhaEspecificaSelecionada
                      ? 'Sem envios para esta campanha no período — selecione outra campanha ou volte para "Todas as campanhas".'
                      : 'Sem envios no período — os números abaixo aparecem quando as campanhas começarem a disparar.'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mb-3">
                    <i className="fa-solid fa-circle-check mr-1 text-emerald-500"></i>
                    Dados consolidados pelos webhooks do Resend
                    {stats.engajamento.total_enviado > 0 && (
                      <span className="ml-1 text-gray-400">
                        ({stats.engajamento.total_enviado.toLocaleString('pt-BR')} envios no período)
                      </span>
                    )}
                    {campanhaEspecificaSelecionada && (
                      <span className="ml-1 text-blue-600 font-medium">
                        • filtrado por 1 campanha
                      </span>
                    )}
                  </p>
                )}
                <div
                  className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${
                    stats.engajamento.aguardando_motor ? 'opacity-60' : ''
                  }`}
                >
                  <KpiCard
                    label="Total enviado"
                    valor={
                      stats.engajamento.aguardando_motor
                        ? '—'
                        : stats.engajamento.total_enviado.toLocaleString('pt-BR')
                    }
                    icon="fa-solid fa-paper-plane"
                    cor="gray"
                    sufixo=""
                    detalhe={
                      stats.engajamento.aguardando_motor
                        ? 'aguardando motor'
                        : 'no período selecionado'
                    }
                  />
                  <KpiCard
                    label="Taxa abertura"
                    valor={
                      stats.engajamento.aguardando_motor
                        ? '—'
                        : stats.engajamento.taxa_abertura.toFixed(1)
                    }
                    icon="fa-solid fa-eye"
                    cor={
                      stats.engajamento.aguardando_motor
                        ? 'gray'
                        : stats.engajamento.taxa_abertura >= 20
                        ? 'green'
                        : stats.engajamento.taxa_abertura >= 10
                        ? 'amber'
                        : 'gray'
                    }
                    sufixo="%"
                    detalhe={
                      stats.engajamento.aguardando_motor ? 'aguardando motor' : 'aberturas / enviados'
                    }
                  />
                  <KpiCard
                    label="Taxa resposta"
                    valor={
                      stats.engajamento.aguardando_motor
                        ? '—'
                        : stats.engajamento.taxa_resposta.toFixed(1)
                    }
                    icon="fa-solid fa-reply"
                    cor={
                      stats.engajamento.aguardando_motor
                        ? 'gray'
                        : stats.engajamento.taxa_resposta >= 5
                        ? 'green'
                        : stats.engajamento.taxa_resposta >= 2
                        ? 'amber'
                        : 'gray'
                    }
                    sufixo="%"
                    detalhe={
                      stats.engajamento.aguardando_motor ? 'aguardando motor' : 'respondidos / enviados'
                    }
                  />
                  <KpiCard
                    label="Taxa bounce"
                    valor={
                      stats.engajamento.aguardando_motor
                        ? '—'
                        : stats.engajamento.taxa_bounce.toFixed(1)
                    }
                    icon="fa-solid fa-triangle-exclamation"
                    cor={
                      stats.engajamento.aguardando_motor
                        ? 'gray'
                        : stats.engajamento.taxa_bounce >= 5
                        ? 'red'
                        : stats.engajamento.taxa_bounce >= 2
                        ? 'amber'
                        : 'green'
                    }
                    sufixo="%"
                    detalhe={
                      stats.engajamento.aguardando_motor ? 'aguardando motor' : 'bounces / enviados'
                    }
                  />
                </div>
              </section>

              {/* ──────────── Seção 3: Distribuição ──────────── */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-chart-pie text-gray-400"></i> Distribuição
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <TabelaDistribuicao bloco={stats.distribuicao.por_responsavel} />
                  <TabelaDistribuicao bloco={stats.distribuicao.por_vertical} />
                  <TabelaDistribuicao bloco={stats.distribuicao.por_dominio} />
                </div>
              </section>

              {/* ──────────── Seção 4: Campanhas em andamento ──────────── */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-list-check text-gray-400"></i> Campanhas em andamento
                  <span className="text-xs text-gray-400 font-normal">
                    ({stats.campanhas_ativas.length} {stats.campanhas_ativas.length === 1 ? 'campanha' : 'campanhas'})
                  </span>
                </h2>
                {stats.campanhas_ativas.length === 0 ? (
                  <EmptyState
                    icon="fa-solid fa-rocket"
                    titulo="Nenhuma campanha em andamento"
                    descricao="Quando alguma campanha entrar em status ativa, agendada ou pausada, ela aparece aqui."
                    compacto
                  />
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 font-medium">Campanha</th>
                          <th className="px-4 py-3 font-medium">Responsável</th>
                          <th className="px-4 py-3 font-medium">Vertical</th>
                          <th className="px-4 py-3 font-medium">Domínio</th>
                          <th className="px-4 py-3 font-medium text-right">Destinatários</th>
                          <th className="px-4 py-3 font-medium text-right">Rodando há</th>
                          <th className="px-4 py-3 font-medium text-right">Taxas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.campanhas_ativas.map((c) => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                            <td className="px-4 py-3 text-gray-700">{c.responsavel}</td>
                            <td className="px-4 py-3 text-gray-700">{c.vertical || '—'}</td>
                            <td className="px-4 py-3 text-gray-500">{c.dominio || '—'}</td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {c.total_destinatarios.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {c.dias_rodando === null
                                ? '—'
                                : c.dias_rodando === 0
                                ? 'hoje'
                                : `${c.dias_rodando} dia${c.dias_rodando === 1 ? '' : 's'}`}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {c.aguardando_motor ? (
                                <span className="text-xs text-amber-600 inline-flex items-center gap-1" title="Aguardando motor de disparo">
                                  <i className="fa-solid fa-clock"></i> —
                                </span>
                              ) : (
                                <span className="text-xs text-gray-700">
                                  {(c.taxa_abertura ?? 0).toFixed(1)}% / {(c.taxa_resposta ?? 0).toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ──────────── Seção 5: Saúde da base ──────────── */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-heart-pulse text-gray-400"></i> Saúde da base
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <KpiCard
                    label="Leads aptos a campanha"
                    valor={stats.saude_base.leads_aptos}
                    icon="fa-solid fa-circle-check"
                    cor="green"
                  />
                  <KpiCard
                    label="Opt-outs"
                    valor={stats.saude_base.optouts}
                    icon="fa-solid fa-ban"
                    cor="red"
                  />
                  <KpiCard
                    label="Leads sem vertical"
                    valor={stats.saude_base.leads_sem_vertical}
                    icon="fa-solid fa-triangle-exclamation"
                    cor={stats.saude_base.leads_sem_vertical > 0 ? 'amber' : 'gray'}
                    detalhe={
                      stats.saude_base.leads_sem_vertical > 0
                        ? 'não entram em campanha'
                        : 'todos OK'
                    }
                  />
                </div>
              </section>

              {/* Rodapé com botão de export (desabilitado por enquanto) */}
              <div className="flex justify-end pt-2">
                <button
                  disabled
                  title="Exportação CSV — disponível na Fase 8 completa"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-400 cursor-not-allowed flex items-center gap-2"
                >
                  <i className="fa-solid fa-file-csv"></i>
                  Exportar CSV
                </button>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════
              ABA: PAINEL CAMPANHA
              ════════════════════════════════════════════════════════ */}
          {abaAtiva === 'painel-campanha' && (
            <PainelCampanhaTab
              atorEmail={atorEmail}
              periodo={periodo}
              apiUrl={ANALYTICS_API_URL}
            />
          )}
        </>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTE: TabelaDistribuicao
// ════════════════════════════════════════════════════════════

const TabelaDistribuicao: React.FC<{ bloco: DistribuicaoBloco }> = ({ bloco }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{bloco._label}</h3>
      </div>
      {bloco.itens.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          Sem dados
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium text-right">Campanhas</th>
              <th className="px-4 py-2 font-medium text-right">Leads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bloco.itens.map((it) => (
              <tr key={it.rotulo} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">{it.rotulo}</td>
                <td className="px-4 py-2 text-right text-gray-700">{it.campanhas}</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {it.destinatarios.toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AcompanhamentoPage;
