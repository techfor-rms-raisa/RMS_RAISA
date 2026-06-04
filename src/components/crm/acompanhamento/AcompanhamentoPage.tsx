/**
 * AcompanhamentoPage.tsx — Página de Acompanhamento (Dashboard CRM)
 *
 * Caminho: src/components/crm/acompanhamento/AcompanhamentoPage.tsx
 * Versão: 2.0 (Fase 8-fix2 — 04/06/2026)
 *
 * v2.0 (04/06/2026 — Fase 8-fix2): cards de Engajamento & Entregabilidade
 *   foram CONECTADOS aos dados reais. Antes (v1.0) eles eram placeholders
 *   cinza hardcoded com "—" e "aguardando motor" — restante da Fase 5C-4
 *   que nunca foi finalizada. Como o motor de disparo, o cron e os
 *   webhooks já estão em produção (Fase 7-MVP — 03/06/2026), os dados
 *   já chegam no backend (`api/crm-analytics.ts → dashboard_stats →
 *   engajamento`). Agora a UI honra:
 *     - `stats.engajamento.total_enviado`     → valor do card "Total enviado"
 *     - `stats.engajamento.taxa_abertura`     → valor do card "Taxa abertura" (%)
 *     - `stats.engajamento.taxa_clique`       → valor do card "Taxa clique"   (%)
 *     - `stats.engajamento.taxa_bounce`       → valor do card "Taxa bounce"   (%)
 *   O badge "aguardando motor" continua respeitando a flag
 *   `stats.engajamento.aguardando_motor` do backend: aparece SÓ quando
 *   não há nenhum envio no período selecionado (zero por zero não tem
 *   taxa fazer sentido) — caso contrário, mostra os números reais.
 *
 * v1.0 (Fase 8 — 01/06/2026): primeira versão.
 *   - 6 KPIs de status (Total, Ativas, Agendadas, Em rascunho, Pausadas,
 *     Concluídas) — DADOS REAIS hoje.
 *   - 4 KPIs de engajamento (Enviado / Abertura / Clique / Bounce) com
 *     badge "aguardando motor de disparo" (placeholder) — populam quando
 *     os webhooks existirem.
 *   - Distribuição por responsável / vertical / domínio (3 tabelas).
 *   - Lista de campanhas em andamento (até 20).
 *   - Saúde da base: opt-outs, leads aptos, e alerta se há leads SEM
 *     vertical.
 *
 * RBAC vem PRONTO do backend (api/crm-analytics.ts): a página apenas
 * mostra o que recebeu. Admin/Gestão de R&S enxergam tudo; demais perfis
 * só veem campanhas onde são responsáveis.
 *
 * Componentes reusados:
 *  - KpiCard (../shared/components/KpiCard)
 *  - EmptyState, Toast (../shared/components/...)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import type { CurrentUserLite } from '../types/crm.types';
import KpiCard from '../shared/components/KpiCard';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';

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
  taxa_clique: number | null;
  aguardando_motor: boolean;
}

interface DashboardStats {
  ator: { id: number; nome: string; tipo: string; ve_tudo: boolean } | null;
  periodo: PeriodoId;
  inicio_periodo: string;
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
    taxa_clique: number;
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

interface AcompanhamentoPageProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const AcompanhamentoPage: React.FC<AcompanhamentoPageProps> = ({ currentUser }) => {
  // get é referência estável (lição da AssinaturasPage v1.1)
  const { get } = useCrmApi(ANALYTICS_API_URL);

  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const [periodo, setPeriodo] = useState<PeriodoId>('mes');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMensagem | null>(null);

  // ── Carregar ──────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!atorEmail) return;
    setLoading(true);
    const resp = await get<DashboardResponse>('dashboard_stats', {
      user_email: atorEmail,
      periodo,
    });
    if (resp.ok && resp.data?.success) {
      setStats(resp.data.stats);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar dashboard' });
    }
    setLoading(false);
  }, [get, atorEmail, periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

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
          {/* 🆕 v2.0 — conectado aos dados reais. A flag `aguardando_motor`
              continua respeitada (do backend): quando não houve nenhum
              envio no período, mostra placeholder. Caso contrário, números
              reais. */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <i className="fa-solid fa-envelope-open-text text-gray-400"></i> Engajamento & Entregabilidade
            </h2>
            {stats.engajamento.aguardando_motor ? (
              <p className="text-xs text-gray-500 mb-3">
                <i className="fa-solid fa-clock mr-1 text-amber-500"></i>
                Sem envios no período — os números abaixo aparecem quando as
                campanhas começarem a disparar.
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
                label="Taxa clique"
                valor={
                  stats.engajamento.aguardando_motor
                    ? '—'
                    : stats.engajamento.taxa_clique.toFixed(1)
                }
                icon="fa-solid fa-arrow-pointer"
                cor={
                  stats.engajamento.aguardando_motor
                    ? 'gray'
                    : stats.engajamento.taxa_clique >= 3
                    ? 'green'
                    : stats.engajamento.taxa_clique >= 1
                    ? 'amber'
                    : 'gray'
                }
                sufixo="%"
                detalhe={
                  stats.engajamento.aguardando_motor ? 'aguardando motor' : 'cliques / enviados'
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
                              {(c.taxa_abertura ?? 0).toFixed(1)}% / {(c.taxa_clique ?? 0).toFixed(1)}%
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
