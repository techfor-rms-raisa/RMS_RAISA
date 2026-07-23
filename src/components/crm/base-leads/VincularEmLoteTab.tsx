/**
 * VincularEmLoteTab.tsx — Aba "Vincular em Lote" do CRM
 *
 * Caminho: src/components/crm/base-leads/VincularEmLoteTab.tsx
 * Versão: 2.2 (Estado de erro distinto do estado vazio — 23/07/2026)
 *
 * v2.2 (23/07/2026 — Incidente "0 leads disponíveis" / HTTP 414):
 *   Fecha o ciclo do incidente de 23/07/2026. Até a v2.1, uma falha do
 *   backend era indistinguível de "não há leads elegíveis": o hook zerava
 *   a lista e esta tela renderizava o empty state normal. Um HTTP 414
 *   (URL de 17.194 bytes com 3.660 ids no filtro not.in) foi apresentado à
 *   SDR como "Não há leads CRECI elegíveis" — com 257 leads íntegros no
 *   banco. O empty state MENTIU.
 *
 *   Mudança cirúrgica em 2 pontos (nenhuma linha removida, nenhuma
 *   estrutura nova de layout):
 *     (1) Contador do PASSO 4 — exibe "falha ao carregar" em vermelho no
 *         lugar de "0 leads disponíveis" quando `h.erroLeads` está setado.
 *     (2) Corpo da tabela — novo ramo de ERRO ANTES do ramo de lista vazia.
 *         Ocupa a MESMA célula colSpan que loading/vazio já usavam.
 *         Padrão visual reaproveitado do modal de "falha total" (v2.0
 *         item g): vermelho + fa-circle-xmark. Exibe a mensagem crua do
 *         backend em monoespaçado para diagnóstico.
 *
 *   Precedência dos estados da tabela: loading → erro → vazio → dados.
 *
 *   Pareada com:
 *     - useVincularEmLote v1.2 (expõe `erroLeads`)
 *     - api/crm-leads v1.27 (500 com mensagem acionável)
 *     - sql/2026-07-23_rpc_listar_leads_vinculo_em_lote.sql
 *
 * v2.1 (B1 — SDR distribuidor CRECI — 22/06/2026)
 *
 * v2.1 (22/06/2026 — B1: SDR pode distribuir Leads CRECI de outros):
 *   Estende a regra do v2.0 que permitia apenas Admin filtrar por
 *   responsável. Agora SDR também consegue, MAS apenas quando
 *   `verticalDestino === 'CRECI'`. Decisão de produto Messias 22/06.
 *
 *   Justificativa: a Campanha CRECI é única e operacionalmente
 *   centralizada pelo SDR responsável (Débora), que precisa vincular
 *   à campanha leads coletados por toda a equipe via Chrome Extension.
 *
 *   Mudança 100% cirúrgica: introduzida derivada `podeVerLeadsDeOutros`
 *   = `isAdmin || (isSDR && destinoEhCreci)`. Aplicada em 4 pontos:
 *     - Filtro "Responsável" no painel de filtros agora aparece quando
 *       podeVerLeadsDeOutros (badge muda: "Admin" vs "CRECI")
 *     - Coluna "Resp." no header da tabela (1 ponto)
 *     - Célula "Resp." na linha do lead (1 ponto)
 *     - colSpans das linhas vazia/loading da tabela (2 pontos)
 *     - Texto "para você" do empty state de campanhas (1 ponto)
 *
 *   Pareado com:
 *     - useVincularEmLote v1.1 (fetch agnóstico a responsavel_id nesse
 *       cenário — caminho real onde o backend recebe ou não o filtro)
 *     - LeadFormModal v1.4 (SDR pode reatribuir reservado_por em Leads CRECI)
 *     - api/crm-leads v1.17 (helper vincularLeadACampanha relaxa trava (d)
 *       de match de responsável quando camp.tipo === 'CRECI')
 *
 *   Métrica de origem preservada: `email_leads.criado_por` (string)
 *   continua registrando quem inseriu o lead originalmente. Apenas o
 *   vínculo da campanha é cross-owner.
 *
 * v2.0 (17/06/2026 — refator V2): refator completo conforme mockup aprovado em
 *   16/06/2026 (CHECKPOINT_2026-06-16.md Frente 6). Mudanças estruturais:
 *
 *   a) TODA a lógica de estado / fetch / filtros / paginação / seleção /
 *      submissão foi extraída para o hook `useVincularEmLote`. Este componente
 *      passa a ser apenas UI declarativa.
 *
 *   b) Adicionados 6 novos filtros (Sessão 1 backend v1.16.1):
 *        • Tipo de busca: Aderentes (default) vs Conversíveis
 *        • Engajamento prévio (qualquer/abriu/clicou/respondeu/virgem)
 *        • Setor da empresa
 *        • UF + Cidade
 *        • Data de cadastro (7d/30d/90d/mais_90d)
 *        • Já em outra campanha (excluir/incluir/só encerradas)
 *
 *   c) Paginação backend (per_page configurável: 30/50/100).
 *
 *   d) Score de engajamento colorido por lead:
 *        ≥60 verde + fire / 30-59 âmbar / <30 cinza
 *
 *   e) Sticky CTA com contador ao vivo (verde → âmbar quando há mudança
 *      de vertical).
 *
 *   f) Modal de confirmação dupla — só dispara quando `temMudancaVertical`.
 *
 *   g) Modal de resultado com 3 estados visuais distintos (corrige bug UX
 *      da memória #9 em que falha total parecia sucesso):
 *        • SUCESSO TOTAL  (verde, check-circle)
 *        • SUCESSO PARCIAL (âmbar, triangle-exclamation)
 *        • FALHA TOTAL    (vermelho, circle-xmark, alerta destacado)
 *
 * v1.1 (10/06/2026): regra CRECI condicional.
 * v1.0 (10/06/2026): primeira versão (vincular múltiplos leads sem editar
 *   configuração da campanha).
 *
 * 🛡️  REGRA PERMANENTE CRECI BIDIRECIONAL:
 *   (1) Lead CRECI nunca tem vertical alterada
 *   (2) Nenhum lead de outra vertical pode virar CRECI
 *   (3) Vincular lead CRECI a campanha CRECI (mesma vertical) é permitido
 *
 *   No v2 isso é aplicado assim:
 *   - Quando vertical de destino === 'CRECI':
 *       toggle "Conversíveis" fica bloqueado/oculto e tipoBusca é forçado
 *       para 'aderentes'. Backend filtra apenas leads CRECI.
 *   - Quando vertical de destino ≠ 'CRECI' e tipoBusca === 'conversiveis':
 *       backend exclui leads CRECI explicitamente.
 *   - Defesa em profundidade no helper vincularLeadACampanha (crm-leads.ts).
 *
 *   Veja CHECKPOINT_2026-06-16.md — auditoria forense confirmou blindagem.
 *
 * Endpoints (consumidos via hook):
 *   • GET  /api/crm-campanhas?action=listar_campanhas_para_vinculo_em_lote
 *   • GET  /api/crm-leads?action=listar_leads_para_vinculo_em_lote
 *   • GET  /api/crm-leads?action=listar_metadados_filtros_vinculo_em_lote
 *   • POST /api/crm-leads (action=vincular_em_lote_a_campanha)
 *
 * Hooks reusados:
 *   • useTiposCampanha — lista oficial de verticais
 *   • useVincularEmLote — orquestrador desta aba (v2)
 */

import React, { useEffect } from 'react';
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import {
  useVincularEmLote,
  type LeadDisponivel,
  type PerPage,
} from '../shared/hooks/useVincularEmLote';
import type { CurrentUserLite } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface VincularEmLoteTabProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// HELPERS DE UI
// ════════════════════════════════════════════════════════════

/**
 * Classifica o score em três tiers visuais.
 * Backend retorna `score_engajamento` = abertos*1 + clicados*3 + respostas*10
 */
function classificarScore(score: number | undefined): {
  cor: string;
  fogo: boolean;
  rotulo: string;
} {
  if (score === undefined || score === null) {
    return { cor: 'text-gray-400', fogo: false, rotulo: '—' };
  }
  if (score >= 60) {
    return { cor: 'text-emerald-600', fogo: true, rotulo: 'engajado' };
  }
  if (score >= 30) {
    return { cor: 'text-amber-600', fogo: false, rotulo: 'morno' };
  }
  return { cor: 'text-gray-500', fogo: false, rotulo: 'frio' };
}

/**
 * Subtítulo do score: "3 abertos / 1 clique" ou "virgem".
 */
function detalheEngajamento(lead: LeadDisponivel): string {
  const a = lead.total_abertos ?? 0;
  const c = lead.total_clicados ?? 0;
  const r = lead.total_respostas ?? 0;
  if (a === 0 && c === 0 && r === 0) return 'virgem';
  const partes: string[] = [];
  if (a > 0) partes.push(`${a} aberto${a !== 1 ? 's' : ''}`);
  if (c > 0) partes.push(`${c} clique${c !== 1 ? 's' : ''}`);
  if (r > 0) partes.push(`${r} resposta${r !== 1 ? 's' : ''}`);
  return partes.join(' / ');
}

function formatarDiasCadastro(dias: number | undefined): string {
  if (dias === undefined || dias === null) return '—';
  if (dias === 0) return 'hoje';
  if (dias === 1) return '1d';
  return `${dias}d`;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const VincularEmLoteTab: React.FC<VincularEmLoteTabProps> = ({
  currentUser,
}) => {
  const tiposCampanhaH = useTiposCampanha();
  const verticaisDisponiveis = tiposCampanhaH.tipos.filter(
    (t: any) => t.ativo !== false
  );

  useEffect(() => {
    tiposCampanhaH.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h = useVincularEmLote(currentUser);
  const isAdmin = currentUser.tipo_usuario === 'Administrador';
  const destinoEhCreci = h.verticalDestino === 'CRECI';

  // 🆕 v2.1 (22/06/2026 — B1) — SDR pode operar Leads de outros responsáveis
  //   quando vertical_destino === 'CRECI'. Decisão de produto Messias 22/06.
  //   Equivale a `isAdmin` em todos os usos onde a permissão de
  //   "ver/operar leads de outros responsáveis" é o discriminante.
  //   Pareado com useVincularEmLote v1.1 (fetch agnóstico ao responsavel_id
  //   nesse caso) e api/crm-leads v1.17 (trava (d) relaxada no helper
  //   `vincularLeadACampanha` para vertical CRECI).
  const isSDR = currentUser.tipo_usuario === 'SDR';
  const podeVerLeadsDeOutros = isAdmin || (isSDR && destinoEhCreci);

  // ── Header do botão (verde quando tudo "manter"; âmbar quando há "alterar")
  const botaoCor = h.temMudancaVertical
    ? 'bg-amber-500 hover:bg-amber-600'
    : 'bg-emerald-600 hover:bg-emerald-700';

  const todosVisiveisMarcados =
    h.leads.length > 0 && h.leads.every((l) => h.selecionados.has(l.id));

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4 p-4 pb-32">
      {/* ────────────────────────────────────────────────────────
          Cabeçalho informativo + regra CRECI
         ──────────────────────────────────────────────────────── */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-start gap-2 text-sm text-amber-900">
          <i className="fa-solid fa-circle-info text-amber-600 mt-0.5"></i>
          <div className="flex-1">
            <p className="font-medium">
              Vincule leads em lote a uma campanha existente
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Use esta aba para adicionar leads a uma campanha sem precisar
              editá-la — evita risco de alterar configuração (steps, copys,
              datas). Filtros progressivos permitem refinar dezenas de
              campanhas simultâneas.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              <i className="fa-solid fa-shield-halved mr-1"></i>
              <strong>Regra CRECI:</strong> leads CRECI só podem ser vinculados
              a campanhas CRECI (sem alteração de vertical); leads de outras
              verticais não podem virar CRECI. Base CRECI é exclusiva de
              corretores (PF) — condição imutável.
            </p>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          PASSO 1 — Destino (vertical + campanha)
         ════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
          <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
            1
          </span>
          Defina o destino
        </h3>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Vertical */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Vertical de destino <span className="text-red-500">*</span>
            </label>
            <select
              value={h.verticalDestino}
              onChange={(e) => h.setVerticalDestino(e.target.value)}
              disabled={tiposCampanhaH.loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">
                {tiposCampanhaH.loading
                  ? '— carregando verticais... —'
                  : '— Selecione —'}
              </option>
              {verticaisDisponiveis.map((v: any) => (
                <option key={v.id ?? v.nome} value={v.nome}>
                  {v.nome}
                </option>
              ))}
            </select>
            {destinoEhCreci ? (
              <p className="text-xs text-indigo-700 mt-1">
                <i className="fa-solid fa-shield-halved mr-1"></i>
                Destino CRECI: serão listados apenas leads que JÁ são CRECI
                (sem alteração de vertical).
              </p>
            ) : h.verticalDestino ? (
              <p className="text-xs text-gray-500 mt-1">
                <i className="fa-solid fa-shield-halved text-amber-600 mr-1"></i>
                Leads CRECI são ocultos (regra permanente — CRECI não muda de
                vertical).
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                <i className="fa-solid fa-circle-info text-gray-400 mr-1"></i>
                Selecione uma vertical para listar campanhas disponíveis.
              </p>
            )}
          </div>

          {/* Campanha */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Campanha de destino <span className="text-red-500">*</span>
            </label>
            <select
              value={h.campanhaDestino ?? ''}
              onChange={(e) =>
                h.setCampanhaDestino(
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              disabled={!h.verticalDestino || h.loadingCampanhas}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">
                {!h.verticalDestino
                  ? '— escolha a vertical primeiro —'
                  : h.loadingCampanhas
                  ? '— carregando campanhas... —'
                  : h.campanhas.length === 0
                  ? '— nenhuma campanha disponível —'
                  : '— Selecione uma campanha —'}
              </option>
              {h.campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} • {c.status} • {c.total_destinatarios} dest.
                </option>
              ))}
            </select>
            {!h.loadingCampanhas &&
              h.verticalDestino &&
              h.campanhas.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  <i className="fa-solid fa-triangle-exclamation"></i> Nenhuma
                  campanha <strong>{h.verticalDestino}</strong> em status
                  ativa/pausada/agendada disponível {!podeVerLeadsDeOutros ? 'para você' : ''}.
                </p>
              )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          PASSO 2 — Tipo de busca (Aderentes / Conversíveis)
         ════════════════════════════════════════════════════════ */}
      {h.verticalDestino && h.campanhaDestino && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
            <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              2
            </span>
            Tipo de busca
            <span className="ml-2 text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
              Default seguro
            </span>
          </h3>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Aderentes (default) */}
            <label
              className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                h.tipoBusca === 'aderentes'
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:border-indigo-300'
              }`}
            >
              <input
                type="radio"
                name="tipo-busca"
                value="aderentes"
                checked={h.tipoBusca === 'aderentes'}
                onChange={() => h.setTipoBusca('aderentes')}
                className="mt-1"
              />
              <div className="flex-1">
                <div
                  className={`text-sm ${
                    h.tipoBusca === 'aderentes'
                      ? 'font-semibold text-indigo-900'
                      : 'font-medium text-gray-800'
                  }`}
                >
                  <i className="fa-solid fa-circle-check text-emerald-600"></i>{' '}
                  Aderentes{' '}
                  <span className="text-xs font-normal text-gray-600">
                    (recomendado)
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Só leads JÁ na vertical da campanha. Zero alteração no
                  cadastro.
                </div>
              </div>
            </label>

            {/* Conversíveis */}
            <label
              className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-colors ${
                h.tipoBuscaBloqueadoEmAderentes
                  ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                  : h.tipoBusca === 'conversiveis'
                  ? 'border-amber-400 bg-amber-50 cursor-pointer'
                  : 'border-gray-200 hover:border-amber-300 cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="tipo-busca"
                value="conversiveis"
                checked={h.tipoBusca === 'conversiveis'}
                disabled={h.tipoBuscaBloqueadoEmAderentes}
                onChange={() => h.setTipoBusca('conversiveis')}
                className="mt-1"
              />
              <div className="flex-1">
                <div
                  className={`text-sm ${
                    h.tipoBusca === 'conversiveis'
                      ? 'font-semibold text-amber-900'
                      : 'font-medium text-gray-800'
                  }`}
                >
                  <i className="fa-solid fa-arrows-rotate text-amber-600"></i>{' '}
                  Conversíveis
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Inclui leads em outras verticais — vincular vai alterar a
                  vertical do lead (com confirmação dupla).
                </div>
                {h.tipoBuscaBloqueadoEmAderentes && (
                  <div className="text-xs text-amber-700 mt-1">
                    <i className="fa-solid fa-shield-halved"></i> Indisponível
                    com destino CRECI (regra bidirecional).
                  </div>
                )}
                {!h.tipoBuscaBloqueadoEmAderentes &&
                  h.tipoBusca === 'conversiveis' && (
                    <div className="text-xs text-amber-700 mt-1">
                      <i className="fa-solid fa-triangle-exclamation"></i> CRECI
                      bidirecionalmente blindada — não entra nem sai.
                    </div>
                  )}
              </div>
            </label>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          PASSO 3 — Filtros refinados (colapsável)
         ════════════════════════════════════════════════════════ */}
      {h.verticalDestino && h.campanhaDestino && (
        <details className="bg-white border border-gray-200 rounded-lg">
          <summary className="p-4 flex items-center justify-between hover:bg-gray-50 list-none cursor-pointer">
            <div className="flex items-center">
              <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2">
                3
              </span>
              <h3 className="font-semibold text-gray-800 text-sm">
                Filtros refinados
              </h3>
              <span className="ml-3 text-xs text-gray-500">
                (opcional — abra para refinar a lista)
              </span>
              {h.rascunhoDirty && (
                <span className="ml-2 text-xs px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded">
                  <i className="fa-solid fa-circle-exclamation"></i> rascunho
                  não aplicado
                </span>
              )}
            </div>
            <i className="fa-solid fa-chevron-down text-gray-400"></i>
          </summary>

          <div className="border-t border-gray-200 p-4">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Engajamento prévio */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  <i className="fa-solid fa-chart-line text-indigo-500"></i>{' '}
                  Engajamento prévio
                </label>
                <select
                  value={h.filtrosRascunho.engajamento}
                  onChange={(e) =>
                    h.setFiltrosRascunho((prev) => ({
                      ...prev,
                      engajamento: e.target.value as any,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="qualquer">Qualquer</option>
                  <option value="abriu">Já abriu emails de campanhas</option>
                  <option value="clicou">Já clicou em links</option>
                  <option value="respondeu">
                    Já respondeu (resposta positiva)
                  </option>
                  <option value="virgem">
                    Nunca recebeu emails (lead virgem)
                  </option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Score = abriu/clicou/respondeu em campanhas anteriores
                </p>
              </div>

              {/* Setor */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  <i className="fa-solid fa-building text-indigo-500"></i> Setor
                  da empresa
                </label>
                <select
                  value={h.filtrosRascunho.setor}
                  onChange={(e) =>
                    h.setFiltrosRascunho((prev) => ({
                      ...prev,
                      setor: e.target.value,
                    }))
                  }
                  disabled={h.loadingMetadados}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                >
                  <option value="">Todos</option>
                  {h.metadados.setores.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* UF + Cidade */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  <i className="fa-solid fa-location-dot text-indigo-500"></i>{' '}
                  Cidade / UF
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={h.filtrosRascunho.uf}
                    onChange={(e) =>
                      h.setFiltrosRascunho((prev) => ({
                        ...prev,
                        uf: e.target.value,
                      }))
                    }
                    disabled={h.loadingMetadados}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                  >
                    <option value="">UF — Todas</option>
                    {h.metadados.ufs.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={h.filtrosRascunho.cidade}
                    onChange={(e) =>
                      h.setFiltrosRascunho((prev) => ({
                        ...prev,
                        cidade: e.target.value,
                      }))
                    }
                    placeholder="Cidade..."
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Data de cadastro */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  <i className="fa-solid fa-calendar text-indigo-500"></i> Data
                  de cadastro
                </label>
                <select
                  value={h.filtrosRascunho.cadastroRange}
                  onChange={(e) =>
                    h.setFiltrosRascunho((prev) => ({
                      ...prev,
                      cadastroRange: e.target.value as any,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="qualquer">Qualquer</option>
                  <option value="7d">Últimos 7 dias (quente)</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="90d">Últimos 90 dias</option>
                  <option value="mais_90d">Mais de 90 dias (frio)</option>
                </select>
              </div>

              {/* Responsável — Admin sempre, SDR apenas em distribuição CRECI (v2.1 — B1) */}
              {podeVerLeadsDeOutros && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    <i className="fa-solid fa-user-tie text-purple-500"></i>{' '}
                    Responsável
                    <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded ml-1">
                      {isAdmin ? 'Admin' : 'CRECI'}
                    </span>
                  </label>
                  <select
                    value={
                      h.filtrosRascunho.responsavelId === null
                        ? ''
                        : String(h.filtrosRascunho.responsavelId)
                    }
                    onChange={(e) =>
                      h.setFiltrosRascunho((prev) => ({
                        ...prev,
                        responsavelId:
                          e.target.value === ''
                            ? null
                            : parseInt(e.target.value),
                      }))
                    }
                    disabled={h.loadingMetadados}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                  >
                    <option value="">Todos da equipe</option>
                    {h.metadados.responsaveis.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {isAdmin
                      ? 'SDR/GC só veem os próprios leads (exceto SDR em CRECI).'
                      : 'Distribuição CRECI: você pode filtrar por quem coletou.'}
                  </p>
                </div>
              )}

              {/* Já em outra campanha */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  <i className="fa-solid fa-shield-halved text-emerald-600"></i>{' '}
                  Já em outra campanha
                </label>
                <select
                  value={h.filtrosRascunho.outrasCampanhas}
                  onChange={(e) =>
                    h.setFiltrosRascunho((prev) => ({
                      ...prev,
                      outrasCampanhas: e.target.value as any,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="excluir">Excluir (defesa anti-spam)</option>
                  <option value="incluir">Incluir todos</option>
                  <option value="so_encerradas">
                    Só campanhas encerradas (ok reativar)
                  </option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  <i className="fa-solid fa-circle-info"></i> Regra de produto
                  09/06: bloquear lead em múltiplas campanhas ativas.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
              <button
                onClick={h.limparFiltros}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <i className="fa-solid fa-xmark"></i> Limpar filtros
              </button>
              <button
                onClick={h.aplicarFiltros}
                disabled={!h.rascunhoDirty}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <i className="fa-solid fa-filter"></i> Aplicar filtros
              </button>
            </div>
          </div>
        </details>
      )}

      {/* ════════════════════════════════════════════════════════
          PASSO 4 — Tabela de leads + paginação
         ════════════════════════════════════════════════════════ */}
      {h.verticalDestino && h.campanhaDestino && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center mb-3 flex-wrap gap-2">
            <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              4
            </span>
            <h3 className="font-semibold text-gray-800 text-sm">
              Selecione os leads
            </h3>
            {/* 🆕 v2.2 (23/07/2026) — o contador não pode mais anunciar
                "0 leads disponíveis" quando a listagem falhou. Era essa frase
                que mascarava o HTTP 414 do incidente de 23/07. */}
            <span
              className={`ml-2 text-sm ${
                h.erroLeads ? 'text-red-600 font-medium' : 'text-gray-500'
              }`}
            >
              {h.loadingLeads
                ? '...'
                : h.erroLeads
                ? 'falha ao carregar'
                : `${h.totalGeral} lead${h.totalGeral !== 1 ? 's' : ''} disponíve${
                    h.totalGeral !== 1 ? 'is' : 'l'
                  }`}
            </span>
          </div>

          {/* Toolbar: busca + perPage */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <input
              type="text"
              value={h.busca}
              onChange={(e) => h.setBusca(e.target.value)}
              placeholder="Buscar por nome, email, cargo ou empresa..."
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <select
              value={h.perPage}
              onChange={(e) =>
                h.setPerPage(parseInt(e.target.value) as PerPage)
              }
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value={30}>30 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={todosVisiveisMarcados}
                      onChange={h.toggleTodosVisiveis}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="p-3">Lead</th>
                  <th className="p-3">Empresa / Setor</th>
                  <th className="p-3">Cidade/UF</th>
                  <th className="p-3">Vertical atual</th>
                  <th className="p-3">
                    Score{' '}
                    <i
                      className="fa-solid fa-info-circle text-gray-400"
                      title="abertos × 1 + cliques × 3 + respostas × 10"
                    ></i>
                  </th>
                  {podeVerLeadsDeOutros && <th className="p-3">Resp.</th>}
                  <th className="p-3">Cadastro</th>
                  <th className="p-3 text-right">Ação no vínculo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {h.loadingLeads ? (
                  <tr>
                    <td
                      colSpan={podeVerLeadsDeOutros ? 9 : 8}
                      className="p-8 text-center text-gray-500"
                    >
                      <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                      Carregando leads...
                    </td>
                  </tr>
                ) : h.erroLeads ? (
                  /* 🆕 v2.2 (23/07/2026) — ESTADO DE ERRO, distinto do estado
                     vazio. Reutiliza o padrão visual de "falha total" já existente
                     no modal de resultado (v2.0 item g): vermelho + fa-circle-xmark.
                     Nenhuma estrutura nova de layout — ocupa a mesma célula
                     colSpan que as linhas de loading/vazio já usavam. */
                  <tr>
                    <td
                      colSpan={podeVerLeadsDeOutros ? 9 : 8}
                      className="p-8 text-center"
                    >
                      <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-red-50 p-4 text-left">
                        <p className="flex items-center gap-2 font-semibold text-red-700">
                          <i className="fa-solid fa-circle-xmark"></i>
                          Não foi possível carregar os leads
                        </p>
                        <p className="mt-2 text-sm text-red-700">
                          A lista está vazia por <strong>falha na consulta</strong>, não
                          por ausência de leads elegíveis. Nenhum lead foi perdido — os
                          dados permanecem íntegros no banco.
                        </p>
                        <p className="mt-2 text-sm text-red-700">
                          Ajuste os filtros para reduzir o resultado ou avise o
                          administrador do sistema com a mensagem abaixo.
                        </p>
                        <p className="mt-3 break-words rounded border border-red-200 bg-white p-2 font-mono text-xs text-red-600">
                          {h.erroLeads}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : h.leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={podeVerLeadsDeOutros ? 9 : 8}
                      className="p-8 text-center text-gray-500"
                    >
                      <p>Nenhum lead disponível com os filtros atuais.</p>
                      <p className="text-xs mt-2">
                        {destinoEhCreci
                          ? 'Não há leads CRECI elegíveis (sem opt-out, sem bounce permanente, não vinculados a campanhas em andamento).'
                          : h.tipoBusca === 'aderentes'
                          ? `Tente "Conversíveis" para buscar leads de outras verticais ou ajuste os filtros.`
                          : 'Ajuste os filtros — leads CRECI permanecem ocultos pela regra bidirecional.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  h.leads.map((lead) => {
                    const checked = h.selecionados.has(lead.id);
                    const verticalDiferente =
                      lead.vertical !== h.verticalDestino;
                    const sc = classificarScore(lead.score_engajamento);
                    return (
                      <tr
                        key={lead.id}
                        className={
                          checked
                            ? 'bg-indigo-50 hover:bg-indigo-100'
                            : 'hover:bg-gray-50'
                        }
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => h.toggleLead(lead.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-800">
                            {lead.nome}
                          </div>
                          <div className="text-xs text-gray-500">
                            {lead.email}
                          </div>
                          {lead.cargo && (
                            <div className="text-xs text-gray-400">
                              {lead.cargo}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="text-gray-700">
                            {lead.email_empresas?.nome || '—'}
                          </div>
                          {lead.email_empresas?.setor && (
                            <div className="text-xs text-gray-500">
                              {lead.email_empresas.setor}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-gray-700 text-xs">
                          {lead.email_empresas?.cidade ||
                          lead.email_empresas?.uf
                            ? `${lead.email_empresas?.cidade || ''}${
                                lead.email_empresas?.cidade &&
                                lead.email_empresas?.uf
                                  ? '/'
                                  : ''
                              }${lead.email_empresas?.uf || ''}`
                            : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 text-xs rounded border ${
                              verticalDiferente
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {lead.vertical || '—'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div
                            className={`flex items-center gap-1 font-semibold ${sc.cor}`}
                          >
                            <span>{lead.score_engajamento ?? '—'}</span>
                            {sc.fogo && (
                              <i className="fa-solid fa-fire text-orange-500 text-xs"></i>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            {detalheEngajamento(lead)}
                          </div>
                        </td>
                        {podeVerLeadsDeOutros && (
                          <td className="p-3 text-xs text-gray-600">
                            {lead.responsavel_nome || '—'}
                          </td>
                        )}
                        <td className="p-3 text-xs text-gray-500">
                          {formatarDiasCadastro(lead.dias_desde_cadastro)}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {destinoEhCreci ? (
                            <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1">
                              <i className="fa-solid fa-check"></i> Manter
                              (CRECI → CRECI)
                            </span>
                          ) : verticalDiferente ? (
                            <span className="text-xs text-amber-700 font-medium inline-flex items-center gap-1">
                              <i className="fa-solid fa-arrows-rotate"></i>{' '}
                              Alterar vertical
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1">
                              <i className="fa-solid fa-check"></i> Manter
                              vertical
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {h.totalGeral > 0 && (
            <div className="flex justify-between items-center mt-3 text-sm flex-wrap gap-2">
              <span className="text-gray-500 text-xs">
                Mostrando {h.offset + 1}–
                {Math.min(h.offset + h.perPage, h.totalGeral)} de{' '}
                {h.totalGeral}
              </span>
              <div className="flex gap-1 items-center">
                <button
                  onClick={h.paginaAnterior}
                  disabled={h.pagina <= 1 || h.loadingLeads}
                  className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                  <i className="fa-solid fa-chevron-left"></i> Anterior
                </button>
                <span className="px-3 py-1.5 text-gray-600 text-xs">
                  Página {h.pagina} de {h.totalPaginas}
                </span>
                <button
                  onClick={h.proximaPagina}
                  disabled={h.pagina >= h.totalPaginas || h.loadingLeads}
                  className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                  Próxima <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          STICKY CTA — Sumário + botão Vincular
         ════════════════════════════════════════════════════════ */}
      {h.verticalDestino && h.campanhaDestino && (
        <div className="bg-white border-2 border-indigo-200 rounded-lg p-4 sticky bottom-4 shadow-lg z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-gray-700">
                <span className="font-bold text-lg text-indigo-700">
                  {h.totalSelecionados}
                </span>{' '}
                lead{h.totalSelecionados !== 1 ? 's' : ''} selecionado
                {h.totalSelecionados !== 1 ? 's' : ''}
                {h.campanhaEscolhida && (
                  <>
                    {' '}
                    para vincular à{' '}
                    <span className="font-semibold">
                      {h.campanhaEscolhida.nome}
                    </span>
                  </>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                <span className="text-emerald-700">
                  <i className="fa-solid fa-check"></i>{' '}
                  {h.totalSelecionados - h.leadsParaAlterar} mantém vertical
                </span>
                {h.leadsParaAlterar > 0 && (
                  <span className="ml-3 text-amber-700">
                    <i className="fa-solid fa-arrows-rotate"></i>{' '}
                    {h.leadsParaAlterar} terão vertical alterada
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={h.abrirConfirmacao}
              disabled={h.totalSelecionados === 0}
              className={`${botaoCor} text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 flex items-center gap-2 transition-colors`}
            >
              <i className="fa-solid fa-link"></i>
              <span>
                Vincular {h.totalSelecionados > 0 ? h.totalSelecionados : ''}{' '}
                lead{h.totalSelecionados !== 1 ? 's' : ''}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL — Confirmação + Resultado
         ════════════════════════════════════════════════════════ */}
      {h.confirmacaoAberta && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) =>
            e.target === e.currentTarget &&
            !h.submitting &&
            (h.resultadoVinculacao ? h.fecharResultado() : h.fecharConfirmacao())
          }
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            {/* ── ETAPA A: CONFIRMAÇÃO ──────────────────────────── */}
            {!h.resultadoVinculacao && (
              <ModalConfirmacao
                totalSelecionados={h.totalSelecionados}
                leadsParaAlterar={h.leadsParaAlterar}
                temMudancaVertical={h.temMudancaVertical}
                verticalDestino={h.verticalDestino}
                campanhaNome={h.campanhaEscolhida?.nome}
                campanhaStatus={h.campanhaEscolhida?.status}
                submitting={h.submitting}
                onCancelar={h.fecharConfirmacao}
                onConfirmar={h.confirmarVinculacao}
              />
            )}

            {/* ── ETAPA B: RESULTADO ────────────────────────────── */}
            {h.resultadoVinculacao && (
              <ModalResultado
                resultado={h.resultadoVinculacao}
                onFechar={h.fecharResultado}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUBCOMPONENTE — Modal de Confirmação
// ════════════════════════════════════════════════════════════

interface ModalConfirmacaoProps {
  totalSelecionados: number;
  leadsParaAlterar: number;
  temMudancaVertical: boolean;
  verticalDestino: string;
  campanhaNome?: string;
  campanhaStatus?: string;
  submitting: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

const ModalConfirmacao: React.FC<ModalConfirmacaoProps> = ({
  totalSelecionados,
  leadsParaAlterar,
  temMudancaVertical,
  verticalDestino,
  campanhaNome,
  campanhaStatus,
  submitting,
  onCancelar,
  onConfirmar,
}) => {
  // Confirmação dupla quando há mudança de vertical (memória #9)
  return (
    <>
      <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
        {temMudancaVertical ? (
          <>
            <i className="fa-solid fa-triangle-exclamation text-amber-600"></i>
            Confirmação dupla — alteração de vertical
          </>
        ) : (
          <>
            <i className="fa-solid fa-circle-question text-indigo-600"></i>
            Confirmar vinculação
          </>
        )}
      </h3>

      <div className="space-y-3 text-sm text-gray-700 mb-4">
        <p>
          Você está prestes a vincular{' '}
          <strong className="text-indigo-700">
            {totalSelecionados} lead{totalSelecionados !== 1 ? 's' : ''}
          </strong>{' '}
          à campanha:
        </p>

        <div className="pl-3 border-l-4 border-indigo-400 bg-indigo-50 py-2 px-3 rounded">
          <p className="font-semibold text-gray-800">{campanhaNome}</p>
          <p className="text-xs text-gray-600 mt-1">
            Vertical: <strong>{verticalDestino}</strong> • Status:{' '}
            <strong>{campanhaStatus}</strong>
          </p>
        </div>

        {temMudancaVertical && (
          <div className="pl-3 border-l-4 border-amber-500 bg-amber-50 py-3 px-3 rounded">
            <p className="text-amber-900 font-semibold">
              <i className="fa-solid fa-arrows-rotate mr-1"></i>
              {leadsParaAlterar} lead{leadsParaAlterar !== 1 ? 's' : ''} terão a
              vertical ALTERADA para <strong>{verticalDestino}</strong>.
            </p>
            <p className="text-amber-800 text-xs mt-2">
              Isso afeta a segmentação futura desses leads. Confira a lista
              antes de confirmar — esta operação não tem desfazer automático.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500">
          {campanhaStatus === 'agendada'
            ? '📅 A campanha está agendada — os envios serão programados quando ela for ativada.'
            : '📨 A campanha está em andamento — os emails serão enfileirados imediatamente seguindo a régua de cadência configurada.'}
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancelar}
          disabled={submitting}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={submitting}
          className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 ${
            temMudancaVertical
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {submitting ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i> Vinculando...
            </>
          ) : (
            <>
              <i className="fa-solid fa-check"></i>
              {temMudancaVertical
                ? 'Sim, alterar vertical e vincular'
                : 'Confirmar vinculação'}
            </>
          )}
        </button>
      </div>
    </>
  );
};

// ════════════════════════════════════════════════════════════
// SUBCOMPONENTE — Modal de Resultado (3 estados visuais)
// ════════════════════════════════════════════════════════════

interface ModalResultadoProps {
  resultado: {
    success: boolean;
    campanha_nome?: string;
    total?: number;
    sucessos?: number;
    verticais_alteradas?: number;
    falhas?: Array<{ lead_id: number; lead_nome: string; error: string }>;
    error?: string;
  };
  onFechar: () => void;
}

const ModalResultado: React.FC<ModalResultadoProps> = ({
  resultado,
  onFechar,
}) => {
  const sucessos = resultado.sucessos ?? 0;
  const total = resultado.total ?? 0;
  const falhas = resultado.falhas ?? [];

  // Três estados distintos — corrige bug UX memória #9
  let estado: 'sucesso_total' | 'parcial' | 'falha_total';
  if (sucessos === 0) {
    estado = 'falha_total';
  } else if (falhas.length > 0) {
    estado = 'parcial';
  } else {
    estado = 'sucesso_total';
  }

  const config = {
    sucesso_total: {
      icone: 'fa-circle-check',
      corIcone: 'text-emerald-600',
      titulo: 'Vinculação concluída com sucesso',
      botaoCor: 'bg-emerald-600 hover:bg-emerald-700',
    },
    parcial: {
      icone: 'fa-triangle-exclamation',
      corIcone: 'text-amber-600',
      titulo: 'Vinculação parcial — alguns leads falharam',
      botaoCor: 'bg-amber-600 hover:bg-amber-700',
    },
    falha_total: {
      icone: 'fa-circle-xmark',
      corIcone: 'text-red-600',
      titulo: 'Falha total — nenhum lead foi vinculado',
      botaoCor: 'bg-red-600 hover:bg-red-700',
    },
  }[estado];

  return (
    <>
      <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
        <i className={`fa-solid ${config.icone} ${config.corIcone}`}></i>
        {config.titulo}
      </h3>

      <div className="space-y-2 text-sm mb-4">
        {/* Erro genérico de rede / servidor */}
        {resultado.error && (
          <div className="pl-3 border-l-4 border-red-400 bg-red-50 py-2 px-3 rounded text-red-800">
            <p className="font-medium">{resultado.error}</p>
          </div>
        )}

        {/* Banner de FALHA TOTAL — destaque visual forte */}
        {estado === 'falha_total' && !resultado.error && (
          <div className="border-2 border-red-300 bg-red-50 py-3 px-4 rounded">
            <p className="text-red-900 font-bold">
              <i className="fa-solid fa-ban mr-1"></i>
              Nenhum lead foi vinculado — operação não persistida no banco.
            </p>
            <p className="text-red-800 text-xs mt-2">
              0 de {total} lead{total !== 1 ? 's' : ''} processados com sucesso.
              Veja os motivos abaixo e corrija antes de tentar novamente.
            </p>
          </div>
        )}

        {/* Banner de SUCESSO */}
        {sucessos > 0 && (
          <div
            className={`pl-3 border-l-4 py-2 px-3 rounded ${
              estado === 'sucesso_total'
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-amber-400 bg-amber-50'
            }`}
          >
            <p
              className={
                estado === 'sucesso_total'
                  ? 'text-emerald-900'
                  : 'text-amber-900'
              }
            >
              <strong>{sucessos}</strong> de <strong>{total}</strong> lead
              {total !== 1 ? 's' : ''} vinculado{sucessos !== 1 ? 's' : ''} à
              campanha{' '}
              <strong>&quot;{resultado.campanha_nome}&quot;</strong>.
            </p>
            {(resultado.verticais_alteradas ?? 0) > 0 && (
              <p
                className={`text-xs mt-1 ${
                  estado === 'sucesso_total'
                    ? 'text-emerald-800'
                    : 'text-amber-800'
                }`}
              >
                📝 {resultado.verticais_alteradas} lead
                {resultado.verticais_alteradas !== 1 ? 's' : ''} tiveram a
                vertical alterada.
              </p>
            )}
          </div>
        )}

        {/* Lista de falhas (parcial OU total) */}
        {falhas.length > 0 && (
          <div
            className={`pl-3 border-l-4 py-2 px-3 rounded ${
              estado === 'falha_total'
                ? 'border-red-400 bg-red-50'
                : 'border-amber-400 bg-amber-50'
            }`}
          >
            <p
              className={`font-medium mb-2 ${
                estado === 'falha_total' ? 'text-red-900' : 'text-amber-900'
              }`}
            >
              <i className="fa-solid fa-triangle-exclamation"></i> {falhas.length}{' '}
              falha{falhas.length !== 1 ? 's' : ''}:
            </p>
            <ul
              className={`text-xs space-y-1 max-h-48 overflow-y-auto ${
                estado === 'falha_total' ? 'text-red-800' : 'text-amber-800'
              }`}
            >
              {falhas.map((f, i) => (
                <li
                  key={i}
                  className={`pl-3 border-l ${
                    estado === 'falha_total'
                      ? 'border-red-300'
                      : 'border-amber-300'
                  }`}
                >
                  <strong>{f.lead_nome}</strong>: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onFechar}
          className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${config.botaoCor}`}
        >
          Fechar
        </button>
      </div>
    </>
  );
};

export default VincularEmLoteTab;
