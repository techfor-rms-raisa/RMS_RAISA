/**
 * useAcompanhamento.ts — Módulo CRECI / Aba Acompanhamento
 *
 * Hooks de acesso ao endpoint api/creci-acompanhamento.ts.
 *
 * Caminho: src/components/creci/acompanhamento/useAcompanhamento.ts
 *
 * Exporta dois hooks com responsabilidades separadas:
 *
 *   useCarteira(currentUser)          → lista mestre, KPIs, filtros, paginação
 *   useFichaCorretor(id, currentUser) → detalhe: ficha, contrato, atividades, e-mails
 *
 * A separação evita que digitar no filtro da lista recarregue a ficha aberta,
 * e que salvar uma atividade force o refetch de toda a carteira sem necessidade.
 * A sincronização entre os dois é feita pelo componente-pai, que chama
 * `recarregar()` da carteira quando uma escrita muda algum agregado.
 *
 * Nenhuma chamada direta ao Supabase: todo acesso passa pelo backend, que
 * aplica o RBAC no servidor.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  CarteiraItem,
  KpisCarteira,
  Contrato,
  Atividade,
  MensagemEmail,
  FiltrosCarteira,
  CurrentUser,
} from './creciAcompanhamento.types';
import { FILTROS_INICIAIS, podeEscreverCarteira } from './creciAcompanhamento.types';

const ENDPOINT = '/api/creci-acompanhamento';

// ─── HELPERS DE REDE ─────────────────────────────────────────────────────────

async function getJson(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });

  const resp = await fetch(`${ENDPOINT}?${qs.toString()}`);
  const json = await resp.json().catch(() => ({}));

  if (!resp.ok || json?.success === false) {
    throw new Error(json?.error || `Falha na requisição (HTTP ${resp.status}).`);
  }
  return json;
}

async function postJson(body: Record<string, unknown>) {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));

  if (!resp.ok || json?.success === false) {
    throw new Error(json?.error || `Falha na requisição (HTTP ${resp.status}).`);
  }
  return json;
}

// ═════════════════════════════════════════════════════════════════════════════
// useCarteira — lista mestre + KPIs
// ═════════════════════════════════════════════════════════════════════════════

export function useCarteira(currentUser?: CurrentUser) {
  const [corretores, setCorretores] = useState<CarteiraItem[]>([]);
  const [kpis, setKpis] = useState<KpisCarteira | null>(null);
  const [responsaveis, setResponsaveis] = useState<{ analista: string; total: number }[]>([]);

  const [filtros, setFiltros] = useState<FiltrosCarteira>(FILTROS_INICIAIS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const limit = 50;

  // Debounce apenas do campo de busca — os selects aplicam na hora.
  const [buscaDebounced, setBuscaDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(filtros.busca), 400);
    return () => clearTimeout(t);
  }, [filtros.busca]);

  const carregar = useCallback(async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    setErro(null);
    try {
      const json = await getJson({
        action: 'listar_carteira',
        user_id: currentUser.id,
        busca: buscaDebounced,
        situacao: filtros.situacao,
        status_contrato: filtros.status_contrato,
        responsavel: filtros.responsavel,
        page,
        limit,
      });

      setCorretores(json.corretores || []);
      setTotal(json.total || 0);
      setTotalPages(json.total_pages || 1);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar a carteira.');
      setCorretores([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    currentUser?.id,
    buscaDebounced,
    filtros.situacao,
    filtros.status_contrato,
    filtros.responsavel,
    page,
  ]);

  const carregarKpis = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const json = await getJson({ action: 'kpis', user_id: currentUser.id });
      setKpis(json.kpis || null);
    } catch {
      setKpis(null); // KPI é informativo — falha aqui não bloqueia a tela
    }
  }, [currentUser?.id]);

  const carregarResponsaveis = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const json = await getJson({ action: 'responsaveis', user_id: currentUser.id });
      setResponsaveis(json.responsaveis || []);
    } catch {
      setResponsaveis([]);
    }
  }, [currentUser?.id]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarKpis(); carregarResponsaveis(); }, [carregarKpis, carregarResponsaveis]);

  // Volta para a página 1 sempre que um filtro muda
  useEffect(() => {
    setPage(1);
  }, [buscaDebounced, filtros.situacao, filtros.status_contrato, filtros.responsavel]);

  const recarregar = useCallback(() => {
    carregar();
    carregarKpis();
  }, [carregar, carregarKpis]);

  return {
    corretores,
    kpis,
    responsaveis,
    filtros,
    setFiltros,
    page,
    setPage,
    total,
    totalPages,
    loading,
    erro,
    recarregar,
    podeEscrever: podeEscreverCarteira(currentUser),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// useFichaCorretor — detalhe do corretor selecionado
// ═════════════════════════════════════════════════════════════════════════════

export function useFichaCorretor(corretorId: number | null, currentUser?: CurrentUser) {
  const [corretor, setCorretor] = useState<any | null>(null);
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [contratosHistorico, setContratosHistorico] = useState<Contrato[]>([]);
  const [lead, setLead] = useState<any | null>(null);

  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [emails, setEmails] = useState<MensagemEmail[]>([]);
  const [avisoEmails, setAvisoEmails] = useState<string | null>(null);
  const [emailsCarregados, setEmailsCarregados] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Evita que uma resposta lenta de um corretor anterior sobrescreva a ficha
  // do corretor que o usuário acabou de selecionar.
  const requisicaoAtual = useRef<number | null>(null);

  const carregarFicha = useCallback(async () => {
    if (!corretorId || !currentUser?.id) {
      setCorretor(null);
      setContrato(null);
      setAtividades([]);
      return;
    }

    requisicaoAtual.current = corretorId;
    setLoading(true);
    setErro(null);

    try {
      const [ficha, ativ] = await Promise.all([
        getJson({ action: 'obter_ficha', user_id: currentUser.id, corretor_id: corretorId }),
        getJson({ action: 'listar_atividades', user_id: currentUser.id, corretor_id: corretorId }),
      ]);

      if (requisicaoAtual.current !== corretorId) return; // seleção mudou no meio

      setCorretor(ficha.corretor || null);
      setContrato(ficha.contrato || null);
      setContratosHistorico(ficha.contratos_historico || []);
      setLead(ficha.lead || null);
      setAtividades(ativ.atividades || []);
    } catch (e: any) {
      if (requisicaoAtual.current !== corretorId) return;
      setErro(e?.message || 'Erro ao carregar a ficha do corretor.');
    } finally {
      if (requisicaoAtual.current === corretorId) setLoading(false);
    }
  }, [corretorId, currentUser?.id]);

  useEffect(() => {
    // Trocar de corretor invalida a thread carregada — força novo fetch
    // quando a sub-aba de e-mails for aberta.
    setEmails([]);
    setEmailsCarregados(false);
    setAvisoEmails(null);
    carregarFicha();
  }, [carregarFicha]);

  /** Lazy: só busca a thread quando a sub-aba de e-mails é aberta. */
  const carregarEmails = useCallback(async () => {
    if (!corretorId || !currentUser?.id || emailsCarregados) return;

    setLoadingEmails(true);
    try {
      const json = await getJson({
        action: 'listar_emails',
        user_id: currentUser.id,
        corretor_id: corretorId,
      });
      setEmails(json.mensagens || []);
      setAvisoEmails(json.aviso || null);
      setEmailsCarregados(true);
    } catch (e: any) {
      setAvisoEmails(e?.message || 'Erro ao carregar o histórico de e-mails.');
    } finally {
      setLoadingEmails(false);
    }
  }, [corretorId, currentUser?.id, emailsCarregados]);

  // ── Escritas ───────────────────────────────────────────────────────────────

  const salvarContrato = useCallback(
    async (dados: Record<string, unknown>) => {
      if (!corretorId || !currentUser?.id) throw new Error('Nenhum corretor selecionado.');
      setSalvando(true);
      try {
        const json = await postJson({
          action: 'salvar_contrato',
          user_id: currentUser.id,
          corretor_id: corretorId,
          contrato_id: contrato?.id ?? null,
          ...dados,
        });
        setContrato(json.contrato);
        return json.contrato as Contrato;
      } finally {
        setSalvando(false);
      }
    },
    [corretorId, currentUser?.id, contrato?.id]
  );

  const criarAtividade = useCallback(
    async (dados: Record<string, unknown>) => {
      if (!corretorId || !currentUser?.id) throw new Error('Nenhum corretor selecionado.');
      setSalvando(true);
      try {
        const json = await postJson({
          action: 'criar_atividade',
          user_id: currentUser.id,
          corretor_id: corretorId,
          ...dados,
        });
        setAtividades(prev =>
          [json.atividade, ...prev].sort(
            (a, b) => new Date(b.data_atividade).getTime() - new Date(a.data_atividade).getTime()
          )
        );
        return json.atividade as Atividade;
      } finally {
        setSalvando(false);
      }
    },
    [corretorId, currentUser?.id]
  );

  const atualizarAtividade = useCallback(
    async (atividadeId: number, dados: Record<string, unknown>) => {
      if (!currentUser?.id) throw new Error('Usuário não identificado.');
      setSalvando(true);
      try {
        const json = await postJson({
          action: 'atualizar_atividade',
          user_id: currentUser.id,
          atividade_id: atividadeId,
          ...dados,
        });
        setAtividades(prev =>
          prev
            .map(a => (a.id === atividadeId ? json.atividade : a))
            .sort(
              (a, b) => new Date(b.data_atividade).getTime() - new Date(a.data_atividade).getTime()
            )
        );
        return json.atividade as Atividade;
      } finally {
        setSalvando(false);
      }
    },
    [currentUser?.id]
  );

  const concluirFup = useCallback(
    async (atividadeId: number) => {
      if (!currentUser?.id) throw new Error('Usuário não identificado.');
      setSalvando(true);
      try {
        const json = await postJson({
          action: 'concluir_fup',
          user_id: currentUser.id,
          atividade_id: atividadeId,
        });
        setAtividades(prev => prev.map(a => (a.id === atividadeId ? json.atividade : a)));
        return json.atividade as Atividade;
      } finally {
        setSalvando(false);
      }
    },
    [currentUser?.id]
  );

  return {
    corretor,
    contrato,
    contratosHistorico,
    lead,
    atividades,
    emails,
    avisoEmails,
    loading,
    loadingEmails,
    salvando,
    erro,
    carregarEmails,
    recarregarFicha: carregarFicha,
    salvarContrato,
    criarAtividade,
    atualizarAtividade,
    concluirFup,
  };
}
