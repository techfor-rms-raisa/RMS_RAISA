/**
 * VincularEmLoteTab.tsx — Aba "Vincular em Lote" do form Empresas & Leads
 *
 * Caminho: src/components/crm/base-leads/VincularEmLoteTab.tsx
 * Versão: 1.1 (CRECI condicional — 10/06/2026)
 *
 * v1.1 (10/06/2026 — CRECI condicional): refinamento da regra CRECI para
 *   resolver o caso de uso "pessoal CRECI vinculando leads CRECI a outra
 *   campanha CRECI" (que a v1.0 inviabilizava ao excluir indiscriminadamente
 *   leads CRECI). Mudanças:
 *    - CRECI volta a aparecer no dropdown de "Vertical de destino"
 *    - Listagem de leads tem filtro dinâmico baseado em vertical_destino:
 *        • Se destino === 'CRECI': mostra APENAS leads CRECI
 *        • Se destino ≠ 'CRECI': exclui leads CRECI
 *    - Coluna "Ação" sempre mostra "Manter" quando destino === 'CRECI'
 *      (lead CRECI vincula à campanha CRECI sem mudar vertical)
 *    - Backend (crm-leads.ts v1.10) recebe `vertical_destino` na query
 *      e aplica o filtro condicional correspondente.
 *
 * v1.0 (10/06/2026 — Vinculação em Lote): primeira versão.
 *   Permite ao Gestor Comercial / SDR vincular MÚLTIPLOS leads a uma campanha
 *   existente (status ativa/pausada/agendada) em uma única operação, com
 *   possibilidade de alteração de vertical em lote.
 *
 * Substitui o fluxo arriscado de "Editar Campanha → adicionar leads", que dava
 * acesso TOTAL à configuração da campanha (steps, copys, datas). Separação
 * clara entre CONFIGURAÇÃO (Editar Campanha) e OPERAÇÃO (Vincular em Lote).
 *
 * 🛡️ REGRA PERMANENTE — CRECI BIDIRECIONALMENTE BLINDADA quanto a MUDANÇA:
 *   (1) Lead com vertical='CRECI' NUNCA tem sua vertical ALTERADA;
 *   (2) NENHUM lead de outra vertical pode VIRAR CRECI.
 *   PORÉM, vincular lead CRECI a campanha CRECI (mesma vertical, sem
 *   alteração) é permitido — esse é o caso de uso do pessoal CRECI.
 *   Validação reforçada no backend em listar_leads_para_vinculo_em_lote
 *   (v1.10) e vincular_em_lote_a_campanha (v1.10) — defesa em profundidade.
 *
 * Fluxo do usuário (3 passos):
 *   PASSO 1: Escolher Vertical de destino + Campanha de destino
 *   PASSO 2: Selecionar leads (lista filtrada conforme destino — CRECI/não-CRECI)
 *   PASSO 3: Confirmar vinculação (modal de confirmação)
 *
 * Reusa o helper `vincularLeadACampanha` da Fase A (crm-leads.ts v1.8) que
 * garante 7 validações + enfileiramento condicional em email_fila.
 *
 * Backend chamado:
 *   • GET  /api/crm-campanhas?action=listar_campanhas_para_vinculo_em_lote
 *   • GET  /api/crm-leads?action=listar_leads_para_vinculo_em_lote
 *          &vertical_destino={X}  ← v1.1: passa vertical para filtro condicional
 *   • POST /api/crm-leads (action=vincular_em_lote_a_campanha)
 *
 * Hook reusado:
 *   • useTiposCampanha — lista oficial de verticais (CRECI agora INCLUÍDA)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import type { CurrentUserLite } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

interface LeadDisponivel {
  id: number;
  nome: string;
  email: string;
  cargo: string | null;
  vertical: string | null;
  reservado_por: number;
  funil_status: string;
  apto_campanha: boolean;
  opt_out: boolean | null;
  telefone: string | null;
  linkedin_url: string | null;
  email_empresas?: { id: number; nome: string } | null;
}

interface CampanhaDisponivel {
  id: number;
  nome: string;
  status: string;
  tipo: string;
  unidade: string | null;
  inicio_envio: string | null;
  data_encerramento: string | null;
  total_destinatarios: number;
  responsavel_id: number | null;
}

interface ResultadoVinculacao {
  success: boolean;
  campanha_nome?: string;
  campanha_status?: string;
  total?: number;
  sucessos?: number;
  verticais_alteradas?: number;
  falhas?: Array<{ lead_id: number; lead_nome: string; error: string }>;
  error?: string;
}

export interface VincularEmLoteTabProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const VincularEmLoteTab: React.FC<VincularEmLoteTabProps> = ({ currentUser }) => {
  // ── PASSO 1: destinos ─────────────────────────────────────
  const [verticalDestino, setVerticalDestino] = useState<string>('');
  const [campanhaDestino, setCampanhaDestino] = useState<number | null>(null);
  const [campanhas, setCampanhas] = useState<CampanhaDisponivel[]>([]);
  const [loadingCampanhas, setLoadingCampanhas] = useState(false);

  // ── PASSO 2: leads ────────────────────────────────────────
  const [leads, setLeads] = useState<LeadDisponivel[]>([]);
  const [busca, setBusca] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // ── PASSO 3: confirmação ──────────────────────────────────
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultadoVinculacao, setResultadoVinculacao] = useState<ResultadoVinculacao | null>(null);

  // ── Hook externo: verticais ───────────────────────────────
  // 🔄 v1.1 — CRECI volta a ser listada no dropdown. A regra "CRECI não
  //   muda de vertical" é aplicada por filtro CONDICIONAL na listagem
  //   de leads (vertical_destino → backend) — não mais pela ausência
  //   da opção. Veja docstring deste arquivo.
  // useTiposCampanha retorna objetos TipoCampanha { id, nome, ativo, descricao }
  // (não strings) — vide src/components/crm/shared/hooks/useTiposCampanha.ts.
  const tiposCampanhaH = useTiposCampanha();
  const verticaisDisponiveis = tiposCampanhaH.tipos.filter(
    (t: any) => t.ativo !== false
  );

  // 🔄 v1.1 — Flag para a UI saber quando o destino é CRECI
  const destinoEhCreci = verticalDestino === 'CRECI';

  const isAdmin = currentUser.tipo_usuario === 'Administrador';

  // ── Computeds ─────────────────────────────────────────────
  const totalSelecionados = selecionados.size;
  // 🔄 v1.1 — Quando destino é CRECI, nenhum lead muda de vertical
  //   (a listagem só traz leads CRECI). Forçamos 0 explicitamente.
  const leadsParaAlterar = verticalDestino === 'CRECI'
    ? 0
    : leads.filter(
        (l) => selecionados.has(l.id) && l.vertical !== verticalDestino
      ).length;
  const campanhaEscolhida = campanhas.find((c) => c.id === campanhaDestino) || null;

  // ════════════════════════════════════════════════════════════
  // CARREGAMENTO
  // ════════════════════════════════════════════════════════════

  // Carregar verticais no mount
  useEffect(() => {
    tiposCampanhaH.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carregar campanhas quando vertical mudar
  const carregarCampanhas = useCallback(async () => {
    if (!verticalDestino) {
      setCampanhas([]);
      setCampanhaDestino(null);
      return;
    }
    setLoadingCampanhas(true);
    try {
      const responsavelParam = !isAdmin ? `&responsavel_id=${currentUser.id}` : '';
      const url =
        `/api/crm-campanhas?action=listar_campanhas_para_vinculo_em_lote` +
        `&vertical=${encodeURIComponent(verticalDestino)}` +
        `&criado_por=${encodeURIComponent(currentUser.nome_usuario || '')}` +
        responsavelParam;

      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.success) {
        setCampanhas(data.campanhas || []);
        // Se a campanha selecionada não está mais disponível, limpar
        if (campanhaDestino && !data.campanhas?.find((c: any) => c.id === campanhaDestino)) {
          setCampanhaDestino(null);
        }
      } else {
        alert('Erro ao carregar campanhas: ' + (data?.error || 'desconhecido'));
        setCampanhas([]);
      }
    } catch (err: any) {
      alert('Erro de rede ao carregar campanhas: ' + (err?.message || 'desconhecido'));
      setCampanhas([]);
    } finally {
      setLoadingCampanhas(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalDestino, currentUser, isAdmin]);

  useEffect(() => {
    if (verticalDestino) {
      carregarCampanhas();
    } else {
      setCampanhas([]);
      setCampanhaDestino(null);
      setLeads([]);
      setSelecionados(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalDestino]);

  // Carregar leads quando vertical+campanha forem escolhidos
  const carregarLeads = useCallback(async () => {
    if (!verticalDestino || !campanhaDestino) {
      setLeads([]);
      setSelecionados(new Set());
      return;
    }
    setLoadingLeads(true);
    try {
      const responsavelParam = !isAdmin ? `&responsavel_id=${currentUser.id}` : '';
      const buscaParam = busca ? `&busca=${encodeURIComponent(busca)}` : '';
      // 🔄 v1.1 — Passa vertical_destino para o backend aplicar filtro
      //   condicional: CRECI→CRECI only, ou não-CRECI exclui CRECI.
      const verticalDestinoParam = `&vertical_destino=${encodeURIComponent(verticalDestino)}`;
      const url =
        `/api/crm-leads?action=listar_leads_para_vinculo_em_lote` +
        responsavelParam +
        buscaParam +
        verticalDestinoParam +
        `&limit=200`;

      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.success) {
        setLeads(data.leads || []);
        setSelecionados(new Set()); // limpa seleção ao recarregar
      } else {
        alert('Erro ao carregar leads: ' + (data?.error || 'desconhecido'));
        setLeads([]);
      }
    } catch (err: any) {
      alert('Erro de rede ao carregar leads: ' + (err?.message || 'desconhecido'));
      setLeads([]);
    } finally {
      setLoadingLeads(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalDestino, campanhaDestino, busca, currentUser, isAdmin]);

  useEffect(() => {
    if (verticalDestino && campanhaDestino) {
      carregarLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalDestino, campanhaDestino]);

  // ════════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════════

  const toggleLead = (id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === leads.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(leads.map((l) => l.id)));
    }
  };

  const limparTudo = () => {
    setVerticalDestino('');
    setCampanhaDestino(null);
    setCampanhas([]);
    setLeads([]);
    setBusca('');
    setSelecionados(new Set());
    setResultadoVinculacao(null);
  };

  const handleVincular = () => {
    if (totalSelecionados === 0) {
      alert('Selecione pelo menos um lead para vincular.');
      return;
    }
    if (!campanhaDestino) {
      alert('Escolha uma campanha de destino.');
      return;
    }
    setResultadoVinculacao(null);
    setConfirmacaoAberta(true);
  };

  const confirmarVinculacao = async () => {
    setSubmitting(true);
    setResultadoVinculacao(null);
    try {
      const lead_ids = Array.from(selecionados);
      const resp = await fetch('/api/crm-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vincular_em_lote_a_campanha',
          lead_ids,
          campanha_id: campanhaDestino,
          vertical_destino: verticalDestino,
          criado_por: currentUser.nome_usuario || '',
        }),
      });
      const data: ResultadoVinculacao = await resp.json();
      setResultadoVinculacao(data);

      if (data?.success) {
        // Recarrega lista de leads — vinculados devem desaparecer
        await carregarLeads();
      }
    } catch (err: any) {
      setResultadoVinculacao({
        success: false,
        error: 'Erro de rede: ' + (err?.message || 'desconhecido'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fecharConfirmacao = () => {
    setConfirmacaoAberta(false);
    setResultadoVinculacao(null);
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4 p-4">
      {/* ── Cabeçalho informativo ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-start gap-2 text-sm text-amber-900">
          <i className="fa-solid fa-circle-info text-amber-600 mt-0.5"></i>
          <div className="flex-1">
            <p className="font-medium">Vincule leads em lote a uma campanha existente</p>
            <p className="text-xs text-amber-700 mt-1">
              Use esta aba para adicionar leads a uma campanha sem precisar editá-la —
              evita risco de alterar a configuração (steps, copys, datas). Se a vertical
              do lead for diferente da campanha, ela será atualizada automaticamente.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              <i className="fa-solid fa-shield-halved mr-1"></i>
              <strong>Regra CRECI:</strong> leads CRECI só podem ser vinculados a campanhas
              CRECI (sem alteração de vertical); leads de outras verticais não podem virar
              CRECI. Base CRECI é exclusiva de corretores (PF) — condição imutável.
            </p>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* PASSO 1 — Destinos                                       */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
          <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
            1
          </span>
          Defina o destino
        </h3>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Vertical de destino */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Vertical de destino <span className="text-red-500">*</span>
            </label>
            <select
              value={verticalDestino}
              onChange={(e) => setVerticalDestino(e.target.value)}
              disabled={tiposCampanhaH.loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">
                {tiposCampanhaH.loading ? '— carregando verticais... —' : '— Selecione —'}
              </option>
              {verticaisDisponiveis.map((v: any) => (
                <option key={v.id ?? v.nome} value={v.nome}>
                  {v.nome}
                </option>
              ))}
            </select>
            {/* 🔄 v1.1 — Aviso contextual da regra CRECI */}
            {destinoEhCreci ? (
              <p className="text-xs text-indigo-700 mt-1">
                <i className="fa-solid fa-shield-halved mr-1"></i>
                Destino CRECI: serão listados apenas leads que JÁ são CRECI (sem alteração de vertical).
              </p>
            ) : verticalDestino ? (
              <p className="text-xs text-gray-500 mt-1">
                <i className="fa-solid fa-shield-halved text-amber-600 mr-1"></i>
                Leads CRECI são ocultos (regra permanente — CRECI não muda de vertical).
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                <i className="fa-solid fa-circle-info text-gray-400 mr-1"></i>
                Selecione uma vertical para listar campanhas disponíveis.
              </p>
            )}
          </div>

          {/* Campanha de destino */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Campanha de destino <span className="text-red-500">*</span>
            </label>
            <select
              value={campanhaDestino ?? ''}
              onChange={(e) =>
                setCampanhaDestino(e.target.value ? parseInt(e.target.value) : null)
              }
              disabled={!verticalDestino || loadingCampanhas}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">
                {!verticalDestino
                  ? '— escolha a vertical primeiro —'
                  : loadingCampanhas
                  ? '— carregando campanhas... —'
                  : campanhas.length === 0
                  ? '— nenhuma campanha disponível —'
                  : '— Selecione uma campanha —'}
              </option>
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} • {c.status} • {c.total_destinatarios} dest.
                </option>
              ))}
            </select>
            {!loadingCampanhas && verticalDestino && campanhas.length === 0 && (
              <p className="text-xs text-orange-600 mt-1">
                <i className="fa-solid fa-triangle-exclamation"></i> Nenhuma campanha{' '}
                <strong>{verticalDestino}</strong> em status ativa/pausada/agendada
                disponível {!isAdmin ? 'para você' : ''}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* PASSO 2 — Leads                                          */}
      {/* ════════════════════════════════════════════════════════ */}
      {verticalDestino && campanhaDestino && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
            <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              2
            </span>
            Selecione os leads
          </h3>

          {/* Busca */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregarLeads()}
              placeholder="Buscar por nome, email ou cargo..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              onClick={carregarLeads}
              disabled={loadingLeads}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              <i className="fa-solid fa-magnifying-glass"></i> Buscar
            </button>
          </div>

          {/* Tabela */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-xs">
                    <th className="px-3 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && selecionados.size === leads.length}
                        onChange={toggleTodos}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-gray-700 font-medium">Nome</th>
                    <th className="px-3 py-2 text-left text-gray-700 font-medium">Email</th>
                    <th className="px-3 py-2 text-left text-gray-700 font-medium">Empresa</th>
                    <th className="px-3 py-2 text-left text-gray-700 font-medium">
                      Vertical Atual
                    </th>
                    <th className="px-3 py-2 text-left text-gray-700 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {loadingLeads ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                        Carregando leads...
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        <p>Nenhum lead disponível.</p>
                        <p className="text-xs mt-2">
                          {destinoEhCreci
                            ? 'Não há leads CRECI elegíveis (sem opt-out, não vinculados a campanhas em andamento).'
                            : 'Leads CRECI e leads já vinculados a outras campanhas ativas/pausadas/agendadas não aparecem aqui.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => {
                      const checked = selecionados.has(lead.id);
                      const verticalDiferente = lead.vertical !== verticalDestino;
                      return (
                        <tr
                          key={lead.id}
                          className={
                            checked
                              ? 'bg-indigo-50 hover:bg-indigo-100'
                              : 'hover:bg-gray-50'
                          }
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLead(lead.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {lead.nome}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{lead.email}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {lead.email_empresas?.nome || '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                              {lead.vertical || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {/* 🔄 v1.1 — Quando destino é CRECI, lead é CRECI (filtro
                              backend) → sempre "Manter" (sem alteração de vertical) */}
                            {destinoEhCreci ? (
                              <span className="text-xs text-green-700 inline-flex items-center gap-1">
                                <i className="fa-solid fa-check"></i> Manter (CRECI → CRECI)
                              </span>
                            ) : verticalDiferente ? (
                              <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                                <i className="fa-solid fa-arrow-right"></i> Alterar p/{' '}
                                <strong>{verticalDestino}</strong>
                              </span>
                            ) : (
                              <span className="text-xs text-green-700 inline-flex items-center gap-1">
                                <i className="fa-solid fa-check"></i> Manter
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
          </div>

          {/* Rodapé de seleção + ação */}
          <div className="mt-3 flex items-center justify-between text-sm flex-wrap gap-2">
            <div className="text-gray-600">
              {totalSelecionados > 0 ? (
                <>
                  <strong className="text-indigo-700">{totalSelecionados}</strong> de{' '}
                  {leads.length} leads selecionados
                  {leadsParaAlterar > 0 && (
                    <span className="ml-2 text-amber-700 text-xs">
                      <i className="fa-solid fa-circle-info"></i> {leadsParaAlterar}{' '}
                      terão vertical alterada
                    </span>
                  )}
                </>
              ) : (
                <span>{leads.length} leads disponíveis</span>
              )}
            </div>

            <button
              onClick={handleVincular}
              disabled={totalSelecionados === 0}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <i className="fa-solid fa-link"></i>
              Vincular {totalSelecionados > 0 ? `${totalSelecionados} ` : ''}leads à
              campanha
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* MODAL DE CONFIRMAÇÃO + RESULTADO                         */}
      {/* ════════════════════════════════════════════════════════ */}
      {confirmacaoAberta && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && !submitting && fecharConfirmacao()}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            {/* Sem resultado ainda → modal de confirmação */}
            {!resultadoVinculacao && (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-circle-question text-indigo-600"></i>
                  Confirmar vinculação
                </h3>
                <div className="space-y-3 text-sm text-gray-700 mb-4">
                  <p>
                    Você está prestes a vincular{' '}
                    <strong className="text-indigo-700">{totalSelecionados} lead(s)</strong>{' '}
                    à campanha:
                  </p>
                  <div className="pl-3 border-l-4 border-indigo-400 bg-indigo-50 py-2 px-3 rounded">
                    <p className="font-semibold text-gray-800">
                      {campanhaEscolhida?.nome}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Vertical: <strong>{verticalDestino}</strong> • Status:{' '}
                      <strong>{campanhaEscolhida?.status}</strong>
                    </p>
                  </div>

                  {leadsParaAlterar > 0 && (
                    <div className="pl-3 border-l-4 border-amber-400 bg-amber-50 py-2 px-3 rounded">
                      <p className="text-amber-800">
                        <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                        <strong>{leadsParaAlterar} lead(s)</strong> terão sua vertical
                        alterada para <strong>{verticalDestino}</strong>.
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    {campanhaEscolhida?.status === 'agendada'
                      ? '📅 A campanha está agendada — os envios serão programados quando ela for ativada.'
                      : '📨 A campanha está em andamento — os emails serão enfileirados imediatamente seguindo a régua de cadência configurada.'}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={fecharConfirmacao}
                    disabled={submitting}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarVinculacao}
                    disabled={submitting}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> Vinculando...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-check"></i> Confirmar vinculação
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Com resultado → mostra outcome */}
            {resultadoVinculacao && (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  {resultadoVinculacao.success && (resultadoVinculacao.sucessos ?? 0) > 0 ? (
                    <>
                      <i className="fa-solid fa-circle-check text-emerald-600"></i>
                      Vinculação concluída
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-circle-exclamation text-red-600"></i>
                      Vinculação com problemas
                    </>
                  )}
                </h3>

                <div className="space-y-2 text-sm mb-4">
                  {resultadoVinculacao.error && (
                    <div className="pl-3 border-l-4 border-red-400 bg-red-50 py-2 px-3 rounded text-red-800">
                      <p className="font-medium">{resultadoVinculacao.error}</p>
                    </div>
                  )}

                  {resultadoVinculacao.success && (
                    <div className="pl-3 border-l-4 border-emerald-400 bg-emerald-50 py-2 px-3 rounded">
                      <p className="text-emerald-900">
                        <strong>{resultadoVinculacao.sucessos}</strong> de{' '}
                        <strong>{resultadoVinculacao.total}</strong> lead(s) vinculado(s)
                        à campanha <strong>"{resultadoVinculacao.campanha_nome}"</strong>.
                      </p>
                      {(resultadoVinculacao.verticais_alteradas ?? 0) > 0 && (
                        <p className="text-emerald-800 text-xs mt-1">
                          📝 {resultadoVinculacao.verticais_alteradas} lead(s) tiveram a
                          vertical alterada.
                        </p>
                      )}
                    </div>
                  )}

                  {(resultadoVinculacao.falhas?.length ?? 0) > 0 && (
                    <div className="pl-3 border-l-4 border-amber-400 bg-amber-50 py-2 px-3 rounded">
                      <p className="text-amber-900 font-medium mb-2">
                        <i className="fa-solid fa-triangle-exclamation"></i>{' '}
                        {resultadoVinculacao.falhas?.length} falha(s):
                      </p>
                      <ul className="text-xs text-amber-800 space-y-1 max-h-48 overflow-y-auto">
                        {resultadoVinculacao.falhas?.map((f, i) => (
                          <li key={i} className="pl-3 border-l border-amber-300">
                            <strong>{f.lead_nome}</strong>: {f.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={fecharConfirmacao}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VincularEmLoteTab;
