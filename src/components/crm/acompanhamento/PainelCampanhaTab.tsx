/**
 * PainelCampanhaTab.tsx — Sub-aba "Painel Campanha" do Acompanhamento
 *
 * Caminho: src/components/crm/acompanhamento/PainelCampanhaTab.tsx
 * Versão: 1.1 (21/06/2026)
 *
 * v1.1 (21/06/2026): 2 ajustes para alinhar com a Visão Geral.
 *
 *     1) Seção de KPIs macro entre os filtros e a tabela. 5 cards
 *        (Total enviado | Taxa abertura | Taxa resposta | Taxa bounce |
 *        Opt-Outs) calculados a partir de `stepsMetricas` — sem chamada
 *        extra ao backend. Taxas usam média ponderada por enviados (mesma
 *        lógica da linha "Total"). Aparecem só quando uma campanha está
 *        selecionada E tem pelo menos 1 envio (caso contrário, fica
 *        apenas o empty state da tabela).
 *
 *     2) Coluna OPT-OUT na tabela, após Taxa Bounce. Implementação
 *        Opção B (decisão de produto 21/06/2026): conta envios em
 *        `email_fila` cancelados por opt-out (`motivo_cancelamento LIKE
 *        'opt_out_%'`).
 *
 *        ⚠️ NOTA SOBRE INTERPRETAÇÃO: como o opt-out cancela TODOS os
 *        steps pendentes do lead, 1 lead que opta após o step 1 conta
 *        1× nos steps 2, 3 e 4 (não no step 1, que já foi enviado).
 *        A soma dos steps NÃO equivale a leads distintos em opt-out.
 *        Rodapé da tabela documenta isso explicitamente.
 *
 *   Backend correspondente: api/crm-analytics.ts v2.3 (mesma sessão) —
 *   action `metricas_por_step` agora retorna `opt_outs` por step.
 *
 * v1.0 (21/06/2026): drill-down de performance por step (e-mail
 *   individual) de UMA campanha selecionada. 3 filtros cascateados:
 *     F1 — Responsável (GC/SDR): RBAC aplicado pelo backend
 *     F2 — Status: Todas / Ativas / Pausadas / Finalizadas
 *     F3 — Campanha: lista filtrada por F1+F2; força seleção (sem
 *          agregação cross-campanha — cada campanha tem sua própria
 *          sequência de steps, somar steps de N campanhas não faria
 *          sentido analítico).
 *
 *   Backend: 3 actions em api/crm-analytics.ts v2.2:
 *     - listar_responsaveis        → popula F1
 *     - listar_campanhas_dropdown  → popula F3 (cascateado em F1+F2)
 *     - metricas_por_step          → popula a tabela quando F3 selecionada
 *
 *   Período: herdado do parent (AcompanhamentoPage). Mudar o período no
 *     cabeçalho re-dispara `metricas_por_step` automaticamente via
 *     dependência do useCallback.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';
import KpiCard from '../shared/components/KpiCard';

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

const STATUS_FILTROS = [
  { id: 'todas', label: 'Todas' },
  { id: 'ativas', label: 'Ativas' },
  { id: 'pausadas', label: 'Pausadas' },
  { id: 'finalizadas', label: 'Finalizadas' },
] as const;

type StatusFiltroId = (typeof STATUS_FILTROS)[number]['id'];

// ════════════════════════════════════════════════════════════
// TIPOS DA API
// ════════════════════════════════════════════════════════════

interface ResponsavelOpt {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string;
}

interface CampanhaOpt {
  id: number;
  nome: string;
  status: string;
  tipo: string;
  responsavel_id: number;
  total_destinatarios: number;
  inicio_envio: string | null;
}

// 🆕 v1.1 — `opt_outs` adicionado pelo backend v2.3
interface StepMetricas {
  step_id: number;
  ordem: number;
  assunto: string;
  enviados: number;
  taxa_abertura: number;
  taxa_resposta: number;
  taxa_bounce: number;
  opt_outs: number;
}

interface ListarResponsaveisResp {
  success: boolean;
  responsaveis: ResponsavelOpt[];
  travado_no_proprio: boolean;
  error?: string;
}

interface ListarCampanhasResp {
  success: boolean;
  campanhas: CampanhaOpt[];
  error?: string;
}

interface MetricasPorStepResp {
  success: boolean;
  campanha: { id: number; nome: string; status: string };
  steps: StepMetricas[];
  error?: string;
}

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

interface PainelCampanhaTabProps {
  /** E-mail do usuário atual (resolvido no parent). */
  atorEmail: string;
  /** Período selecionado no cabeçalho do AcompanhamentoPage. */
  periodo: 'semana' | 'mes' | 'trimestre' | 'total';
  /** URL base do endpoint (default `/api/crm-analytics`). */
  apiUrl: string;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const PainelCampanhaTab: React.FC<PainelCampanhaTabProps> = ({
  atorEmail,
  periodo,
  apiUrl,
}) => {
  const { get } = useCrmApi(apiUrl);

  // ── Estado dos filtros ────────────────────────────────────────
  const [responsaveis, setResponsaveis] = useState<ResponsavelOpt[]>([]);
  const [travadoNoProprio, setTravadoNoProprio] = useState(false);
  const [filtroResponsavel, setFiltroResponsavel] = useState<'todos' | number>('todos');
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltroId>('todas');
  const [campanhas, setCampanhas] = useState<CampanhaOpt[]>([]);
  const [filtroCampanhaId, setFiltroCampanhaId] = useState<number | null>(null);

  // ── Estado da tabela ──────────────────────────────────────────
  const [stepsMetricas, setStepsMetricas] = useState<StepMetricas[]>([]);
  const [nomeCampanha, setNomeCampanha] = useState<string>('');
  const [loadingResponsaveis, setLoadingResponsaveis] = useState(false);
  const [loadingCampanhas, setLoadingCampanhas] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [toast, setToast] = useState<ToastMensagem | null>(null);

  // ── Carregar responsáveis (mount) ─────────────────────────────
  useEffect(() => {
    if (!atorEmail) return;
    let cancelado = false;

    (async () => {
      setLoadingResponsaveis(true);
      const resp = await get<ListarResponsaveisResp>('listar_responsaveis', {
        user_email: atorEmail,
      });
      if (cancelado) return;

      if (resp.ok && resp.data?.success) {
        setResponsaveis(resp.data.responsaveis);
        setTravadoNoProprio(resp.data.travado_no_proprio);
        if (resp.data.travado_no_proprio && resp.data.responsaveis[0]) {
          setFiltroResponsavel(resp.data.responsaveis[0].id);
        }
      } else {
        setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar responsáveis' });
      }
      setLoadingResponsaveis(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [get, atorEmail]);

  // ── Carregar campanhas (cascateado em F1 + F2) ────────────────
  const carregarCampanhas = useCallback(async () => {
    if (!atorEmail) return;
    setLoadingCampanhas(true);
    setFiltroCampanhaId(null);
    setStepsMetricas([]);
    setNomeCampanha('');

    const params: Record<string, string | number> = {
      user_email: atorEmail,
      status_filtro: filtroStatus,
    };
    if (filtroResponsavel !== 'todos') {
      params.responsavel_id = filtroResponsavel;
    }

    const resp = await get<ListarCampanhasResp>('listar_campanhas_dropdown', params);
    if (resp.ok && resp.data?.success) {
      setCampanhas(resp.data.campanhas);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar campanhas' });
      setCampanhas([]);
    }
    setLoadingCampanhas(false);
  }, [get, atorEmail, filtroResponsavel, filtroStatus]);

  useEffect(() => {
    carregarCampanhas();
  }, [carregarCampanhas]);

  // ── Carregar métricas por step ────────────────────────────────
  const carregarMetricasStep = useCallback(async () => {
    if (!atorEmail || filtroCampanhaId === null) {
      setStepsMetricas([]);
      setNomeCampanha('');
      return;
    }
    setLoadingSteps(true);
    const resp = await get<MetricasPorStepResp>('metricas_por_step', {
      user_email: atorEmail,
      campanha_id: filtroCampanhaId,
      periodo,
    });
    if (resp.ok && resp.data?.success) {
      setStepsMetricas(resp.data.steps);
      setNomeCampanha(resp.data.campanha.nome);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar métricas' });
      setStepsMetricas([]);
    }
    setLoadingSteps(false);
  }, [get, atorEmail, filtroCampanhaId, periodo]);

  useEffect(() => {
    carregarMetricasStep();
  }, [carregarMetricasStep]);

  // ── Totais agregados (KPIs macro + rodapé da tabela) ──────────
  // Taxas: média ponderada pelo número de enviados de cada step (acomoda
  // steps com volumes diferentes — step 1 sempre tem mais envios que o
  // step 3 porque cancelamentos ocorrem ao longo do funil).
  // Opt-outs: SOMA DIRETA (contagem discreta, não taxa). Vide nota da v1.1
  // no header — soma pode contar 1 lead várias vezes pela natureza da
  // Opção B (cancelamentos da fila).
  const totais = (() => {
    const totalEnv = stepsMetricas.reduce((a, s) => a + s.enviados, 0);
    const totalOpt = stepsMetricas.reduce((a, s) => a + s.opt_outs, 0);
    if (totalEnv === 0) {
      return { enviados: 0, taxa_abertura: 0, taxa_resposta: 0, taxa_bounce: 0, opt_outs: totalOpt };
    }
    const ponderada = (campo: 'taxa_abertura' | 'taxa_resposta' | 'taxa_bounce') =>
      stepsMetricas.reduce((a, s) => a + s.enviados * s[campo], 0) / totalEnv;
    return {
      enviados: totalEnv,
      taxa_abertura: ponderada('taxa_abertura'),
      taxa_resposta: ponderada('taxa_resposta'),
      taxa_bounce: ponderada('taxa_bounce'),
      opt_outs: totalOpt,
    };
  })();

  // 🆕 v1.1 — Flag para mostrar KPIs macro: campanha selecionada E tem dados
  const mostrarKpisMacro = filtroCampanhaId !== null && stepsMetricas.length > 0 && !loadingSteps;

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Toast mensagem={toast} onDismiss={() => setToast(null)} />

      {/* ──────────── Linha de filtros cascateados ──────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <i className="fa-solid fa-filter text-gray-400"></i> Filtros
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Filtro 1 — Responsável */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Responsável
              {travadoNoProprio && (
                <span className="ml-2 text-gray-400 font-normal">(travado no perfil)</span>
              )}
            </label>
            <select
              value={filtroResponsavel}
              onChange={(e) =>
                setFiltroResponsavel(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
              }
              disabled={travadoNoProprio || loadingResponsaveis}
              className={`w-full px-3 py-2 border rounded-md text-sm transition ${
                travadoNoProprio
                  ? 'bg-gray-50 text-gray-500 cursor-not-allowed border-gray-200'
                  : 'border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
              }`}
            >
              {!travadoNoProprio && <option value="todos">Todos (GC + SDR)</option>}
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome_usuario} · {r.tipo_usuario}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro 2 — Status da campanha */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Status da campanha
            </label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as StatusFiltroId)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_FILTROS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro 3 — Campanha */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-2">
              <span>Campanha</span>
              {loadingCampanhas && (
                <i className="fa-solid fa-spinner fa-spin text-gray-400"></i>
              )}
              {!loadingCampanhas && campanhas.length > 0 && (
                <span className="text-gray-400 font-normal">
                  ({campanhas.length} {campanhas.length === 1 ? 'campanha' : 'campanhas'})
                </span>
              )}
            </label>
            <select
              value={filtroCampanhaId ?? ''}
              onChange={(e) =>
                setFiltroCampanhaId(e.target.value ? Number(e.target.value) : null)
              }
              disabled={loadingCampanhas || campanhas.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-400 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— selecionar —</option>
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {!loadingCampanhas && campanhas.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Nenhuma campanha encontrada para esses filtros.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ──────────── 🆕 v1.1 — KPIs macro da campanha ──────────── */}
      {mostrarKpisMacro && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <i className="fa-solid fa-envelope-open-text text-gray-400"></i>
            Engajamento & Entregabilidade
            <span className="text-xs text-gray-500 font-normal">— {nomeCampanha}</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              label="Total enviado"
              valor={totais.enviados.toLocaleString('pt-BR')}
              icon="fa-solid fa-paper-plane"
              cor="gray"
              detalhe="no período selecionado"
            />
            <KpiCard
              label="Taxa abertura"
              valor={totais.taxa_abertura.toFixed(1)}
              icon="fa-solid fa-eye"
              cor={
                totais.taxa_abertura >= 20 ? 'green' :
                totais.taxa_abertura >= 10 ? 'amber' :
                'gray'
              }
              sufixo="%"
              detalhe="aberturas / enviados"
            />
            <KpiCard
              label="Taxa resposta"
              valor={totais.taxa_resposta.toFixed(1)}
              icon="fa-solid fa-reply"
              cor={
                totais.taxa_resposta >= 5 ? 'green' :
                totais.taxa_resposta >= 2 ? 'amber' :
                'gray'
              }
              sufixo="%"
              detalhe="respondidos / enviados"
            />
            <KpiCard
              label="Taxa bounce"
              valor={totais.taxa_bounce.toFixed(1)}
              icon="fa-solid fa-triangle-exclamation"
              cor={
                totais.taxa_bounce >= 5 ? 'red' :
                totais.taxa_bounce >= 2 ? 'amber' :
                'green'
              }
              sufixo="%"
              detalhe="bounces / enviados"
            />
            <KpiCard
              label="Opt-Outs"
              valor={totais.opt_outs.toLocaleString('pt-BR')}
              icon="fa-solid fa-ban"
              cor={totais.opt_outs > 0 ? 'red' : 'gray'}
              detalhe="envios cancelados"
            />
          </div>
        </section>
      )}

      {/* ──────────── Tabela de performance por step ──────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <i className="fa-solid fa-list-check text-gray-400"></i>
          <span>Performance por e-mail</span>
          {nomeCampanha && !mostrarKpisMacro && (
            <span className="text-xs text-gray-500 font-normal">— {nomeCampanha}</span>
          )}
        </h2>

        {filtroCampanhaId === null ? (
          <EmptyState
            icon="fa-solid fa-arrow-up"
            titulo="Selecione uma campanha"
            descricao="Use os filtros acima para escolher uma campanha e ver o desempenho de cada e-mail da sequência."
          />
        ) : loadingSteps ? (
          <div className="text-center py-12 text-gray-400">
            <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
            <p className="text-sm mt-3">Carregando performance…</p>
          </div>
        ) : stepsMetricas.length === 0 ? (
          <EmptyState
            icon="fa-solid fa-envelope-open"
            titulo="Sem dados no período"
            descricao="Esta campanha ainda não tem steps cadastrados ou nenhum envio foi disparado dentro do período selecionado."
            compacto
          />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium text-right">Enviados</th>
                  <th className="px-4 py-3 font-medium text-right">Taxa Abertura</th>
                  <th className="px-4 py-3 font-medium text-right">Taxa Resposta</th>
                  <th className="px-4 py-3 font-medium text-right">Taxa Bounce</th>
                  {/* 🆕 v1.1 — Coluna OPT-OUT */}
                  <th className="px-4 py-3 font-medium text-right">Opt-Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stepsMetricas.map((s) => (
                  <tr key={s.step_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex-shrink-0">
                          {s.ordem}
                        </span>
                        <span className="text-gray-700 truncate" title={s.assunto}>
                          {s.assunto || <span className="text-gray-400 italic">(sem assunto)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      {s.enviados.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.enviados === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={
                          s.taxa_abertura >= 20 ? 'text-emerald-700 font-medium' :
                          s.taxa_abertura >= 10 ? 'text-amber-600' :
                          'text-gray-600'
                        }>
                          {s.taxa_abertura.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.enviados === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={
                          s.taxa_resposta >= 5 ? 'text-emerald-700 font-medium' :
                          s.taxa_resposta >= 2 ? 'text-amber-600' :
                          'text-gray-600'
                        }>
                          {s.taxa_resposta.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.enviados === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={
                          s.taxa_bounce >= 5 ? 'text-red-600 font-medium' :
                          s.taxa_bounce >= 2 ? 'text-amber-600' :
                          'text-gray-600'
                        }>
                          {s.taxa_bounce.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    {/* 🆕 v1.1 — Coluna OPT-OUT (contagem absoluta) */}
                    <td className="px-4 py-3 text-right">
                      {s.opt_outs === 0 ? (
                        <span className="text-gray-400">0</span>
                      ) : (
                        <span className="text-red-600 font-medium inline-flex items-center gap-1">
                          <i className="fa-solid fa-ban text-xs"></i>
                          {s.opt_outs.toLocaleString('pt-BR')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Linha de Totais (média ponderada por enviados + soma direta de opt_outs) */}
                {stepsMetricas.length > 1 && (
                  <tr className="bg-gray-50 font-medium border-t-2 border-gray-200">
                    <td className="px-4 py-3 text-gray-900">
                      <span className="inline-flex items-center gap-2">
                        <i className="fa-solid fa-calculator text-gray-400 text-xs"></i>
                        Total
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {totais.enviados.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {totais.enviados === 0 ? '—' : `${totais.taxa_abertura.toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {totais.enviados === 0 ? '—' : `${totais.taxa_resposta.toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {totais.enviados === 0 ? '—' : `${totais.taxa_bounce.toFixed(2)}%`}
                    </td>
                    {/* 🆕 v1.1 — Total Opt-Outs (soma direta) */}
                    <td className="px-4 py-3 text-right">
                      {totais.opt_outs === 0 ? (
                        <span className="text-gray-400">0</span>
                      ) : (
                        <span className="text-red-600 font-medium">
                          {totais.opt_outs.toLocaleString('pt-BR')}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Nota de rodapé sobre período + Opção B */}
            {stepsMetricas.length > 0 && (
              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                <div className="flex items-start gap-2">
                  <i className="fa-solid fa-circle-info text-gray-400 mt-0.5"></i>
                  <span>
                    Envios/aberturas/respostas/bounces filtrados pelo período
                    selecionado no cabeçalho — cada evento é contado apenas se
                    ocorreu dentro da janela.
                  </span>
                </div>
                {/* 🆕 v1.1 — Nota explicando a Opção B */}
                <div className="flex items-start gap-2">
                  <i className="fa-solid fa-ban text-gray-400 mt-0.5"></i>
                  <span>
                    <strong>Opt-Out:</strong> conta envios cancelados por
                    descadastramento (cumulativo, sem filtro de período). 1 lead
                    que opta após o step 1 conta 1× em cada step subsequente
                    cancelado — a soma da coluna pode superar o número de leads
                    distintos em opt-out.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default PainelCampanhaTab;
