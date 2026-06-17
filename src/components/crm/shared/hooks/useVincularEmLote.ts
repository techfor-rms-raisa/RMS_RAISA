/**
 * useVincularEmLote.ts — Hook orquestrador da aba "Vincular em Lote"
 *
 * Caminho: src/components/crm/shared/hooks/useVincularEmLote.ts
 * Versão: 1.0 (Sessão 2 do "Vincular em Lote v2" — 17/06/2026)
 *
 * Encapsula TODA a lógica de estado / fetch / filtros / paginação / seleção
 * / submissão da aba VincularEmLoteTab, deixando o componente focado apenas
 * em UI. Foi extraído na Sessão 2 do refator v2 para escalar a aba a 50
 * leads × 20 campanhas ativas sem inflar o componente acima de 1.500 linhas.
 *
 * Endpoints backend consumidos (Sessão 1 do v2 — crm-leads.ts v1.16.1):
 *
 *   • GET  /api/crm-campanhas?action=listar_campanhas_para_vinculo_em_lote
 *          &vertical={X}&criado_por={user}[&responsavel_id={n}]
 *
 *   • GET  /api/crm-leads?action=listar_leads_para_vinculo_em_lote
 *          &vertical_destino={X}
 *          &tipo_busca={aderentes|conversiveis}
 *          [&engajamento={qualquer|abriu|clicou|respondeu|virgem}]
 *          [&setor={X}]
 *          [&uf={X}]
 *          [&cidade={X}]
 *          [&cadastro_range={qualquer|7d|30d|90d|mais_90d}]
 *          [&outras_campanhas={excluir|incluir|so_encerradas}]
 *          [&busca={texto}]
 *          [&responsavel_id={n}]
 *          [&per_page={30|50|100}&offset={n}]
 *
 *   • GET  /api/crm-leads?action=listar_metadados_filtros_vinculo_em_lote
 *          [&responsavel_id={n}]
 *          → retorna { setores, ufs, cidades, responsaveis }
 *
 *   • POST /api/crm-leads (action=vincular_em_lote_a_campanha)
 *          { lead_ids, campanha_id, vertical_destino, criado_por }
 *
 * 🛡️  REGRA CRECI BIDIRECIONAL (preservada do v1.1):
 *   • Lead CRECI nunca tem vertical alterada
 *   • Nenhum lead de outra vertical pode virar CRECI
 *   • Vincular lead CRECI a campanha CRECI (mesma vertical) é permitido
 *
 *   A regra é aplicada como:
 *   1. Quando verticalDestino === 'CRECI': forçamos tipoBusca='aderentes'
 *      e ocultamos o toggle conversíveis (UI no componente)
 *   2. Quando tipoBusca === 'conversiveis' e verticalDestino !== 'CRECI':
 *      backend exclui leads CRECI explicitamente
 *   3. Defesa em profundidade no helper vincularLeadACampanha (crm-leads.ts)
 *
 *   Veja CHECKPOINT_2026-06-16.md frente 1 — auditoria forense confirmou
 *   blindagem nos 5 caminhos de INSERT em email_lead_campanhas.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CurrentUserLite } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS PÚBLICOS
// ════════════════════════════════════════════════════════════

export type TipoBusca = 'aderentes' | 'conversiveis';

export type FiltroEngajamento =
  | 'qualquer'
  | 'abriu'
  | 'clicou'
  | 'respondeu'
  | 'virgem';

export type FiltroCadastroRange =
  | 'qualquer'
  | '7d'
  | '30d'
  | '90d'
  | 'mais_90d';

export type FiltroOutrasCampanhas = 'excluir' | 'incluir' | 'so_encerradas';

export type PerPage = 30 | 50 | 100;

/**
 * Lead retornado pelo backend Sessão 1 v1.16.1.
 *
 * Campos opcionais (score_engajamento, dias_desde_cadastro,
 * responsavel_nome, email_empresas.setor/cidade/uf) seguem o contrato
 * do checkpoint 17/06; se o backend não trouxer, a UI exibe '—'.
 */
export interface LeadDisponivel {
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
  // 🆕 Sessão 1 v2
  score_engajamento?: number;
  total_abertos?: number;
  total_clicados?: number;
  total_respostas?: number;
  dias_desde_cadastro?: number;
  responsavel_nome?: string | null;
  email_empresas?: {
    id: number;
    nome: string;
    setor?: string | null;
    cidade?: string | null;
    uf?: string | null;
  } | null;
}

export interface CampanhaDisponivel {
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

/**
 * Metadados dinâmicos para popular dropdowns dos filtros refinados
 * (action listar_metadados_filtros_vinculo_em_lote).
 */
export interface MetadadosFiltros {
  setores: string[];
  ufs: string[];
  cidades: string[];
  responsaveis: Array<{ id: number; nome: string }>;
}

export interface ResultadoVinculacao {
  success: boolean;
  campanha_nome?: string;
  campanha_status?: string;
  total?: number;
  sucessos?: number;
  verticais_alteradas?: number;
  falhas?: Array<{ lead_id: number; lead_nome: string; error: string }>;
  error?: string;
}

/**
 * Tipo da resposta do hook (interface estável para o componente).
 */
export interface UseVincularEmLoteAPI {
  // ── Destinos (PASSO 1)
  verticalDestino: string;
  setVerticalDestino: (v: string) => void;
  campanhaDestino: number | null;
  setCampanhaDestino: (id: number | null) => void;
  campanhas: CampanhaDisponivel[];
  loadingCampanhas: boolean;
  campanhaEscolhida: CampanhaDisponivel | null;

  // ── Tipo de busca (PASSO 2)
  tipoBusca: TipoBusca;
  setTipoBusca: (t: TipoBusca) => void;
  /** Quando true, o toggle Conversíveis fica indisponível (vertical CRECI) */
  tipoBuscaBloqueadoEmAderentes: boolean;

  // ── Filtros refinados (PASSO 3) — rascunho controlado
  filtrosRascunho: FiltrosRascunho;
  setFiltrosRascunho: React.Dispatch<React.SetStateAction<FiltrosRascunho>>;
  /** Aplica o rascunho à query e dispara recarga (reset offset = 0) */
  aplicarFiltros: () => void;
  /** Limpa todos os filtros refinados e dispara recarga */
  limparFiltros: () => void;
  /** True quando o rascunho difere dos filtros atualmente aplicados */
  rascunhoDirty: boolean;

  // ── Metadados para dropdowns
  metadados: MetadadosFiltros;
  loadingMetadados: boolean;

  // ── Busca textual
  busca: string;
  setBusca: (s: string) => void;

  // ── Leads + paginação (PASSO 4)
  leads: LeadDisponivel[];
  loadingLeads: boolean;
  perPage: PerPage;
  setPerPage: (n: PerPage) => void;
  offset: number;
  totalGeral: number;
  pagina: number;
  totalPaginas: number;
  irParaPagina: (p: number) => void;
  proximaPagina: () => void;
  paginaAnterior: () => void;
  recarregar: () => void;

  // ── Seleção
  selecionados: Set<number>;
  toggleLead: (id: number) => void;
  toggleTodosVisiveis: () => void;
  limparSelecao: () => void;

  // ── Computeds
  totalSelecionados: number;
  /**
   * Quantidade de leads selecionados cuja vertical é diferente do destino
   * (i.e. que TERÃO vertical alterada). Sempre 0 quando destino==='CRECI'
   * (pois listagem só traz leads CRECI).
   */
  leadsParaAlterar: number;
  /** Conveniência: leadsParaAlterar > 0 */
  temMudancaVertical: boolean;

  // ── Submissão
  confirmacaoAberta: boolean;
  abrirConfirmacao: () => void;
  fecharConfirmacao: () => void;
  submitting: boolean;
  resultadoVinculacao: ResultadoVinculacao | null;
  confirmarVinculacao: () => Promise<void>;
  fecharResultado: () => void;

  // ── Limpeza geral
  limparTudo: () => void;
}

/**
 * Rascunho dos filtros (o que o usuário está editando no painel colapsável,
 * antes de clicar "Aplicar filtros").
 */
export interface FiltrosRascunho {
  engajamento: FiltroEngajamento;
  setor: string; // '' = todos
  uf: string; // '' = todas
  cidade: string; // '' = todas
  cadastroRange: FiltroCadastroRange;
  outrasCampanhas: FiltroOutrasCampanhas;
  responsavelId: number | null; // null = padrão (próprios para SDR/GC; todos para Admin)
}

// ════════════════════════════════════════════════════════════
// DEFAULTS
// ════════════════════════════════════════════════════════════

const FILTROS_DEFAULT: FiltrosRascunho = {
  engajamento: 'qualquer',
  setor: '',
  uf: '',
  cidade: '',
  cadastroRange: 'qualquer',
  outrasCampanhas: 'excluir', // 🛡️ Regra de produto 09/06/2026
  responsavelId: null,
};

const PER_PAGE_DEFAULT: PerPage = 30;

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useVincularEmLote(
  currentUser: CurrentUserLite
): UseVincularEmLoteAPI {
  const isAdmin = currentUser.tipo_usuario === 'Administrador';

  // ── PASSO 1: destinos ───────────────────────────────────────
  const [verticalDestino, setVerticalDestinoState] = useState<string>('');
  const [campanhaDestino, setCampanhaDestino] = useState<number | null>(null);
  const [campanhas, setCampanhas] = useState<CampanhaDisponivel[]>([]);
  const [loadingCampanhas, setLoadingCampanhas] = useState(false);

  // ── PASSO 2: tipo de busca ──────────────────────────────────
  const [tipoBusca, setTipoBuscaState] = useState<TipoBusca>('aderentes');

  // ── PASSO 3: filtros refinados ──────────────────────────────
  // "rascunho" = o que está nos inputs; "aplicado" = o que está na query.
  // O usuário precisa clicar "Aplicar filtros" para que rascunho vire aplicado.
  const [filtrosRascunho, setFiltrosRascunho] = useState<FiltrosRascunho>(
    FILTROS_DEFAULT
  );
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosRascunho>(
    FILTROS_DEFAULT
  );

  // ── Busca textual (com debounce na ref) ─────────────────────
  const [busca, setBuscaState] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');

  // ── Metadados (dropdowns dinâmicos) ─────────────────────────
  const [metadados, setMetadados] = useState<MetadadosFiltros>({
    setores: [],
    ufs: [],
    cidades: [],
    responsaveis: [],
  });
  const [loadingMetadados, setLoadingMetadados] = useState(false);

  // ── Leads ───────────────────────────────────────────────────
  const [leads, setLeads] = useState<LeadDisponivel[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [totalGeral, setTotalGeral] = useState(0);
  const [perPage, setPerPageState] = useState<PerPage>(PER_PAGE_DEFAULT);
  const [offset, setOffset] = useState(0);

  // ── Seleção ─────────────────────────────────────────────────
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // ── Submissão ───────────────────────────────────────────────
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultadoVinculacao, setResultadoVinculacao] =
    useState<ResultadoVinculacao | null>(null);

  // ── Refs auxiliares para evitar race conditions em requests ──
  const fetchLeadsSeqRef = useRef(0);

  // ════════════════════════════════════════════════════════════
  // REGRA CRECI
  // ════════════════════════════════════════════════════════════

  const tipoBuscaBloqueadoEmAderentes = verticalDestino === 'CRECI';

  // Setter de vertical com side-effects encapsulados
  const setVerticalDestino = useCallback((v: string) => {
    setVerticalDestinoState(v);
    // Limpa downstream
    setCampanhaDestino(null);
    setCampanhas([]);
    setLeads([]);
    setSelecionados(new Set());
    setOffset(0);
    setTotalGeral(0);
    setResultadoVinculacao(null);
    setBuscaState('');
    setBuscaDebounced('');
    // Se destino é CRECI, força aderentes (regra bidirecional)
    if (v === 'CRECI') {
      setTipoBuscaState('aderentes');
    }
  }, []);

  // Setter de tipoBusca com guard CRECI
  const setTipoBusca = useCallback(
    (t: TipoBusca) => {
      if (verticalDestino === 'CRECI' && t === 'conversiveis') {
        // bloqueado pela regra CRECI — ignora silenciosamente
        return;
      }
      setTipoBuscaState(t);
      setOffset(0); // muda tipo → volta para página 1
      setSelecionados(new Set());
    },
    [verticalDestino]
  );

  // ════════════════════════════════════════════════════════════
  // DEBOUNCE DE BUSCA TEXTUAL (400ms)
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    const id = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(id);
  }, [busca]);

  // Toda mudança em busca debounced volta para página 1
  useEffect(() => {
    setOffset(0);
  }, [buscaDebounced]);

  const setBusca = useCallback((s: string) => {
    setBuscaState(s);
  }, []);

  // ════════════════════════════════════════════════════════════
  // CARREGAR METADADOS (uma vez por sessão / ao mudar responsável)
  // ════════════════════════════════════════════════════════════

  const carregarMetadados = useCallback(async () => {
    setLoadingMetadados(true);
    try {
      const responsavelParam = !isAdmin
        ? `&responsavel_id=${currentUser.id}`
        : '';
      const url =
        `/api/crm-leads?action=listar_metadados_filtros_vinculo_em_lote` +
        responsavelParam;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.success) {
        setMetadados({
          setores: data.setores || [],
          ufs: data.ufs || [],
          cidades: data.cidades || [],
          responsaveis: data.responsaveis || [],
        });
      }
    } catch (err) {
      // Falha em metadados não bloqueia a UX — dropdowns ficam vazios e
      // o usuário ainda consegue usar filtros sem refinamento por setor/UF.
      // eslint-disable-next-line no-console
      console.warn('[useVincularEmLote] metadados falhou:', err);
    } finally {
      setLoadingMetadados(false);
    }
  }, [currentUser.id, isAdmin]);

  useEffect(() => {
    carregarMetadados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ════════════════════════════════════════════════════════════
  // CARREGAR CAMPANHAS quando vertical mudar
  // ════════════════════════════════════════════════════════════

  const carregarCampanhas = useCallback(async () => {
    if (!verticalDestino) {
      setCampanhas([]);
      return;
    }
    setLoadingCampanhas(true);
    try {
      const responsavelParam = !isAdmin
        ? `&responsavel_id=${currentUser.id}`
        : '';
      const url =
        `/api/crm-campanhas?action=listar_campanhas_para_vinculo_em_lote` +
        `&vertical=${encodeURIComponent(verticalDestino)}` +
        `&criado_por=${encodeURIComponent(currentUser.nome_usuario || '')}` +
        responsavelParam;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.success) {
        setCampanhas(data.campanhas || []);
      } else {
        setCampanhas([]);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useVincularEmLote] carregarCampanhas falhou:', err);
      setCampanhas([]);
    } finally {
      setLoadingCampanhas(false);
    }
  }, [verticalDestino, isAdmin, currentUser.id, currentUser.nome_usuario]);

  useEffect(() => {
    carregarCampanhas();
  }, [carregarCampanhas]);

  // ════════════════════════════════════════════════════════════
  // CARREGAR LEADS — sempre que filtrosAplicados / busca / paginação / etc mudarem
  // ════════════════════════════════════════════════════════════

  const carregarLeads = useCallback(async () => {
    if (!verticalDestino || !campanhaDestino) {
      setLeads([]);
      setTotalGeral(0);
      return;
    }
    const seq = ++fetchLeadsSeqRef.current;
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams();
      params.set('action', 'listar_leads_para_vinculo_em_lote');
      params.set('vertical_destino', verticalDestino);
      params.set('tipo_busca', tipoBusca);
      if (filtrosAplicados.engajamento !== 'qualquer') {
        params.set('engajamento', filtrosAplicados.engajamento);
      }
      if (filtrosAplicados.setor) params.set('setor', filtrosAplicados.setor);
      if (filtrosAplicados.uf) params.set('uf', filtrosAplicados.uf);
      if (filtrosAplicados.cidade) params.set('cidade', filtrosAplicados.cidade);
      if (filtrosAplicados.cadastroRange !== 'qualquer') {
        params.set('cadastro_range', filtrosAplicados.cadastroRange);
      }
      if (filtrosAplicados.outrasCampanhas !== 'excluir') {
        params.set('outras_campanhas', filtrosAplicados.outrasCampanhas);
      }
      if (buscaDebounced) params.set('busca', buscaDebounced);
      // Para admin: usa o filtro "responsavelId" (null = todos);
      // Para SDR/GC: forçado em currentUser.id (já no backend, mas reforça).
      if (isAdmin) {
        if (filtrosAplicados.responsavelId !== null) {
          params.set(
            'responsavel_id',
            String(filtrosAplicados.responsavelId)
          );
        }
      } else {
        params.set('responsavel_id', String(currentUser.id));
      }
      params.set('per_page', String(perPage));
      params.set('offset', String(offset));

      const resp = await fetch(`/api/crm-leads?${params.toString()}`);
      const data = await resp.json();

      // Descarta resposta se outra request mais nova foi disparada
      if (seq !== fetchLeadsSeqRef.current) return;

      if (data?.success) {
        setLeads(data.leads || []);
        setTotalGeral(
          typeof data.total_geral === 'number'
            ? data.total_geral
            : data.leads?.length || 0
        );
      } else {
        setLeads([]);
        setTotalGeral(0);
      }
    } catch (err) {
      if (seq !== fetchLeadsSeqRef.current) return;
      // eslint-disable-next-line no-console
      console.error('[useVincularEmLote] carregarLeads falhou:', err);
      setLeads([]);
      setTotalGeral(0);
    } finally {
      if (seq === fetchLeadsSeqRef.current) {
        setLoadingLeads(false);
      }
    }
  }, [
    verticalDestino,
    campanhaDestino,
    tipoBusca,
    filtrosAplicados,
    buscaDebounced,
    isAdmin,
    currentUser.id,
    perPage,
    offset,
  ]);

  useEffect(() => {
    carregarLeads();
  }, [carregarLeads]);

  // Quando paginação ou perPage mudam, ao trocar perPage volta pra página 1
  const setPerPage = useCallback((n: PerPage) => {
    setPerPageState(n);
    setOffset(0);
  }, []);

  // ════════════════════════════════════════════════════════════
  // FILTROS — aplicar / limpar / dirty
  // ════════════════════════════════════════════════════════════

  const rascunhoDirty = useMemo(() => {
    return (
      filtrosRascunho.engajamento !== filtrosAplicados.engajamento ||
      filtrosRascunho.setor !== filtrosAplicados.setor ||
      filtrosRascunho.uf !== filtrosAplicados.uf ||
      filtrosRascunho.cidade !== filtrosAplicados.cidade ||
      filtrosRascunho.cadastroRange !== filtrosAplicados.cadastroRange ||
      filtrosRascunho.outrasCampanhas !== filtrosAplicados.outrasCampanhas ||
      filtrosRascunho.responsavelId !== filtrosAplicados.responsavelId
    );
  }, [filtrosRascunho, filtrosAplicados]);

  const aplicarFiltros = useCallback(() => {
    setFiltrosAplicados(filtrosRascunho);
    setOffset(0);
    setSelecionados(new Set());
  }, [filtrosRascunho]);

  const limparFiltros = useCallback(() => {
    setFiltrosRascunho(FILTROS_DEFAULT);
    setFiltrosAplicados(FILTROS_DEFAULT);
    setOffset(0);
    setSelecionados(new Set());
  }, []);

  // ════════════════════════════════════════════════════════════
  // PAGINAÇÃO — derivados
  // ════════════════════════════════════════════════════════════

  const pagina = Math.floor(offset / perPage) + 1;
  const totalPaginas = Math.max(1, Math.ceil(totalGeral / perPage));

  const irParaPagina = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(p, totalPaginas));
      setOffset((clamped - 1) * perPage);
      setSelecionados(new Set()); // seleção é por página visível
    },
    [perPage, totalPaginas]
  );

  const proximaPagina = useCallback(() => {
    if (pagina < totalPaginas) irParaPagina(pagina + 1);
  }, [pagina, totalPaginas, irParaPagina]);

  const paginaAnterior = useCallback(() => {
    if (pagina > 1) irParaPagina(pagina - 1);
  }, [pagina, irParaPagina]);

  const recarregar = useCallback(() => {
    carregarLeads();
  }, [carregarLeads]);

  // ════════════════════════════════════════════════════════════
  // SELEÇÃO
  // ════════════════════════════════════════════════════════════

  const toggleLead = useCallback((id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTodosVisiveis = useCallback(() => {
    setSelecionados((prev) => {
      // Se todos os leads visíveis estão selecionados, deseleciona todos eles;
      // senão, seleciona todos os visíveis (preservando seleção de outras páginas
      // só se já existia — mas como zeramos seleção ao paginar, vai zerar).
      const visIds = leads.map((l) => l.id);
      const todosMarcados = visIds.every((id) => prev.has(id));
      if (todosMarcados) {
        const next = new Set(prev);
        visIds.forEach((id) => next.delete(id));
        return next;
      } else {
        const next = new Set(prev);
        visIds.forEach((id) => next.add(id));
        return next;
      }
    });
  }, [leads]);

  const limparSelecao = useCallback(() => {
    setSelecionados(new Set());
  }, []);

  // ════════════════════════════════════════════════════════════
  // COMPUTEDS
  // ════════════════════════════════════════════════════════════

  const campanhaEscolhida = useMemo(
    () => campanhas.find((c) => c.id === campanhaDestino) || null,
    [campanhas, campanhaDestino]
  );

  const totalSelecionados = selecionados.size;

  // Quando destino === 'CRECI', leads visíveis são CRECI (filtro backend),
  // logo nenhum lead muda de vertical.
  const leadsParaAlterar = useMemo(() => {
    if (verticalDestino === 'CRECI') return 0;
    return leads.filter(
      (l) => selecionados.has(l.id) && l.vertical !== verticalDestino
    ).length;
  }, [verticalDestino, leads, selecionados]);

  const temMudancaVertical = leadsParaAlterar > 0;

  // ════════════════════════════════════════════════════════════
  // SUBMISSÃO
  // ════════════════════════════════════════════════════════════

  const abrirConfirmacao = useCallback(() => {
    if (totalSelecionados === 0) return;
    if (!campanhaDestino) return;
    setResultadoVinculacao(null);
    setConfirmacaoAberta(true);
  }, [totalSelecionados, campanhaDestino]);

  const fecharConfirmacao = useCallback(() => {
    setConfirmacaoAberta(false);
  }, []);

  const fecharResultado = useCallback(() => {
    setConfirmacaoAberta(false);
    setResultadoVinculacao(null);
  }, []);

  const confirmarVinculacao = useCallback(async () => {
    if (!campanhaDestino || totalSelecionados === 0) return;
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
        // Recarrega lista — vinculados saem do retorno
        await carregarLeads();
        setSelecionados(new Set());
      }
    } catch (err: any) {
      setResultadoVinculacao({
        success: false,
        error: 'Erro de rede: ' + (err?.message || 'desconhecido'),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    campanhaDestino,
    totalSelecionados,
    selecionados,
    verticalDestino,
    currentUser.nome_usuario,
    carregarLeads,
  ]);

  // ════════════════════════════════════════════════════════════
  // RESET GERAL
  // ════════════════════════════════════════════════════════════

  const limparTudo = useCallback(() => {
    setVerticalDestinoState('');
    setCampanhaDestino(null);
    setCampanhas([]);
    setTipoBuscaState('aderentes');
    setFiltrosRascunho(FILTROS_DEFAULT);
    setFiltrosAplicados(FILTROS_DEFAULT);
    setBuscaState('');
    setBuscaDebounced('');
    setLeads([]);
    setSelecionados(new Set());
    setOffset(0);
    setTotalGeral(0);
    setResultadoVinculacao(null);
  }, []);

  // ════════════════════════════════════════════════════════════
  // RETORNO
  // ════════════════════════════════════════════════════════════

  return {
    // Destinos
    verticalDestino,
    setVerticalDestino,
    campanhaDestino,
    setCampanhaDestino,
    campanhas,
    loadingCampanhas,
    campanhaEscolhida,

    // Tipo de busca
    tipoBusca,
    setTipoBusca,
    tipoBuscaBloqueadoEmAderentes,

    // Filtros
    filtrosRascunho,
    setFiltrosRascunho,
    aplicarFiltros,
    limparFiltros,
    rascunhoDirty,

    // Metadados
    metadados,
    loadingMetadados,

    // Busca
    busca,
    setBusca,

    // Leads
    leads,
    loadingLeads,
    perPage,
    setPerPage,
    offset,
    totalGeral,
    pagina,
    totalPaginas,
    irParaPagina,
    proximaPagina,
    paginaAnterior,
    recarregar,

    // Seleção
    selecionados,
    toggleLead,
    toggleTodosVisiveis,
    limparSelecao,

    // Computeds
    totalSelecionados,
    leadsParaAlterar,
    temMudancaVertical,

    // Submissão
    confirmacaoAberta,
    abrirConfirmacao,
    fecharConfirmacao,
    submitting,
    resultadoVinculacao,
    confirmarVinculacao,
    fecharResultado,

    // Limpeza
    limparTudo,
  };
}

export default useVincularEmLote;
