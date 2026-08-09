/**
 * EspionagemPage.tsx — Módulo Espionagem Estratégica
 *
 * Caminho: src/components/espionagem/EspionagemPage.tsx
 * Versão: 2.0 (Sessão 6 — 09/08/2026)
 *
 * v2.0 (09/08/2026 — Sessão 6):
 *  - 🔄 Nova aba "Visão Cliente" (mockup aprovado 09/08): operação inversa —
 *    seleciona uma empresa canônica e mapeia os CONCORRENTES que a possuem
 *    na carteira. Card central = cliente com métricas canônicas (idênticas
 *    em qualquer contexto); cards abaixo = concorrentes. 100% interno.
 *    Actions: listar_empresas + analisar_empresa (backend v2.1).
 *  - ✏️ Edição de concorrente (nome/website/domínio) e 🗄️ arquivamento na
 *    barra do seletor — usa a action já existente `atualizar_concorrente`.
 *
 * v1.0 (Sessão 4 — 07/08/2026):
 *
 * Módulo próprio no Sidebar (decisão Q1-A). Inteligência competitiva:
 * cruza a carteira de clientes de consultorias concorrentes com as 3
 * origens de dados internas (email_leads, email_empresas, prospect_leads)
 * via api/crm-espionagem (v1.1).
 *
 * Estrutura (mockup aprovado em 07/08/2026):
 *  - Seletor/criação de concorrente
 *  - Aba ⚡ Automática: descoberta da carteira via Gemini + confirmação
 *    human-in-the-loop (nada é gravado sem checkbox marcado)
 *  - Aba ✍️ Manual: cadastro individual + colagem em lote "Nome;dominio"
 *  - Aba 📊 Resultado: visão hierárquica (concorrente → cards de clientes
 *    em 3 níveis visuais) + chips de inteligência + barra de totais
 *
 * RBAC (Q2-C): Administrador + Gestão Comercial + SDR — o backend valida
 * em todas as actions; a UI é bloqueada aqui apenas por cortesia.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '@/types';
import { useCrmApi } from '../crm/shared/hooks/useCrmApi';

// ════════════════════════════════════════════════════════════
// TIPOS (espelham api/crm-espionagem.ts v1.1)
// ════════════════════════════════════════════════════════════

interface Concorrente {
  id: number;
  nome: string;
  website: string | null;
  dominio: string | null;
  status: string;
  total_clientes?: number;
  ultima_analise?: AnaliseResumo | null;
}

interface AnaliseResumo {
  id: number;
  executado_em: string;
  executado_por: string | null;
  total_prospectados: number;
  total_leads_crm: number;
  total_campanhas: number;
  total_abordagens: number;
  cobertura_pct: number;
}

interface ClienteCarteira {
  id: number;
  nome: string;
  dominios: string[];
  chave_busca: string | null;
  origem_descoberta: string;
  ativo: boolean;
}

interface ClienteSugerido {
  nome: string;
  dominios: string[];
  fonte: string;
  ja_cadastrado: boolean;
  selecionado?: boolean;
}

interface ClienteResultado {
  cliente_id: number;
  nome: string;
  dominios: string[];
  prospectados: number;
  prospectados_corp: number;
  leads_crm: number;
  leads_em_campanha: number;
  campanhas: number;
  abordagens: number;
  ultima_abordagem_em: string | null;
  respostas: number;
  frio_90d: boolean;
  novo_na_carteira?: boolean;
}

interface ResultadoAnalise {
  clientes: ClienteResultado[];
  totais: {
    clientes: number;
    prospectados: number;
    leads_crm: number;
    campanhas: number;
    abordagens: number;
    respostas: number;
    contas_com_presenca: number;
    cobertura_pct: number;
  };
  delta?: { analise_anterior_em: string | null; novos_na_carteira: number };
}

// 🆕 v2.0 — Visão Cliente × Concorrentes (espelham api v2.1)
interface EmpresaOption {
  id: number;
  nome: string;
  dominios: string[];
  chave_busca: string | null;
  num_concorrentes: number;
}

interface EmpresaMetricas {
  id: number;
  nome: string;
  dominios: string[];
  prospectados: number;
  prospectados_corp: number;
  leads_crm: number;
  leads_em_campanha: number;
  campanhas: number;
  abordagens: number;
  ultima_abordagem_em: string | null;
  respostas: number;
  frio_90d: boolean;
}

interface ConcorrenteDaEmpresa {
  id: number;
  nome: string;
  website: string | null;
  dominio: string | null;
  descoberto_em: string;
  origem_descoberta: string;
  total_clientes: number;
  cobertura_pct: number | null;
  ultima_analise_em: string | null;
}

interface VisaoClienteResultado {
  empresa: EmpresaMetricas;
  concorrentes: ConcorrenteDaEmpresa[];
  total_concorrentes: number;
}

interface EspionagemPageProps {
  currentUser: User;
}

type Aba = 'auto' | 'manual' | 'resultado' | 'visao_cliente';

const PERFIS_AUTORIZADOS = ['Administrador', 'Gestão Comercial', 'SDR'];

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const EspionagemPage: React.FC<EspionagemPageProps> = ({ currentUser }) => {
  const api = useCrmApi('/api/crm-espionagem');
  const atorEmail = currentUser.email_usuario;

  const [concorrentes, setConcorrentes] = useState<Concorrente[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [clientesCarteira, setClientesCarteira] = useState<ClienteCarteira[]>([]);
  const [aba, setAba] = useState<Aba>('resultado');

  // Criação de concorrente
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoSite, setNovoSite] = useState('');

  // 🆕 v2.0 — Edição/arquivamento de concorrente
  const [editandoConc, setEditandoConc] = useState(false);
  const [edNome, setEdNome] = useState('');
  const [edSite, setEdSite] = useState('');
  const [edDominio, setEdDominio] = useState('');

  // 🆕 v2.0 — Visão Cliente × Concorrentes
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [empresaSelId, setEmpresaSelId] = useState<number | null>(null);
  const [visaoResultado, setVisaoResultado] = useState<VisaoClienteResultado | null>(null);
  const [mapeando, setMapeando] = useState(false);

  // Descoberta Gemini
  const [descobrindo, setDescobrindo] = useState(false);
  const [sugeridos, setSugeridos] = useState<ClienteSugerido[]>([]);
  const [queriesManuais, setQueriesManuais] = useState<string[]>([]);
  const [semResultados, setSemResultados] = useState(false);

  // Manual
  const [manNome, setManNome] = useState('');
  const [manDominios, setManDominios] = useState('');
  const [manLote, setManLote] = useState('');

  // Análise
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAnalise | null>(null);
  const [resultadoEm, setResultadoEm] = useState<string | null>(null);

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const autorizado = PERFIS_AUTORIZADOS.includes(currentUser.tipo_usuario);
  const concorrente = useMemo(
    () => concorrentes.find(c => c.id === selecionadoId) || null,
    [concorrentes, selecionadoId]
  );

  const avisar = (tipo: 'ok' | 'erro', texto: string) => {
    setMsg({ tipo, texto });
    window.setTimeout(() => setMsg(null), 6000);
  };

  // ── Carregamento ────────────────────────────────────────────
  const carregarConcorrentes = useCallback(async () => {
    const r = await api.get<{ success: boolean; concorrentes: Concorrente[] }>(
      'listar_concorrentes', { ator_email: atorEmail }
    );
    if (r.ok && r.data?.concorrentes) {
      setConcorrentes(r.data.concorrentes);
      if (r.data.concorrentes.length > 0 && selecionadoId === null) {
        setSelecionadoId(r.data.concorrentes[0].id);
      }
    } else if (!r.ok) {
      avisar('erro', r.error || 'Falha ao listar concorrentes');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, atorEmail, selecionadoId]);

  const carregarDetalhe = useCallback(async (id: number) => {
    const r = await api.get<{
      success: boolean;
      clientes: ClienteCarteira[];
      ultima_analise: { resultado: ResultadoAnalise; executado_em: string } | null;
    }>('detalhe_concorrente', { id, ator_email: atorEmail });
    if (r.ok && r.data) {
      setClientesCarteira(r.data.clientes || []);
      if (r.data.ultima_analise?.resultado) {
        setResultado(r.data.ultima_analise.resultado);
        setResultadoEm(r.data.ultima_analise.executado_em);
      } else {
        setResultado(null);
        setResultadoEm(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, atorEmail]);

  useEffect(() => { if (autorizado) carregarConcorrentes(); }, [autorizado]); // eslint-disable-line
  useEffect(() => {
    if (selecionadoId !== null) {
      setSugeridos([]); setSemResultados(false);
      carregarDetalhe(selecionadoId);
    }
  }, [selecionadoId]); // eslint-disable-line

  // ── Ações ───────────────────────────────────────────────────
  const criarConcorrente = async () => {
    if (!novoNome.trim()) return avisar('erro', 'Informe o nome do concorrente');
    const r = await api.post<{ success: boolean; concorrente: Concorrente }>('criar_concorrente', {
      nome: novoNome.trim(), website: novoSite.trim() || null,
      dominio: novoSite.trim() || null, ator_email: atorEmail,
    });
    if (r.ok && r.data?.concorrente) {
      avisar('ok', `Concorrente "${r.data.concorrente.nome}" criado`);
      setCriando(false); setNovoNome(''); setNovoSite('');
      await carregarConcorrentes();
      setSelecionadoId(r.data.concorrente.id);
    } else avisar('erro', r.error || 'Falha ao criar concorrente');
  };

  const descobrirGemini = async () => {
    if (!selecionadoId) return;
    setDescobrindo(true); setSugeridos([]); setSemResultados(false);
    const r = await api.post<{
      success: boolean; sem_resultados: boolean;
      clientes_sugeridos: ClienteSugerido[]; queries_manuais?: string[];
    }>('descobrir_clientes', { concorrente_id: selecionadoId, ator_email: atorEmail });
    setDescobrindo(false);
    if (!r.ok) return avisar('erro', r.error || 'Falha na descoberta Gemini');
    if (r.data?.sem_resultados) {
      setSemResultados(true);
      setQueriesManuais(r.data.queries_manuais || []);
      return;
    }
    setSugeridos((r.data?.clientes_sugeridos || []).map(s => ({
      ...s, selecionado: !s.ja_cadastrado,
    })));
  };

  const gravarSugeridos = async () => {
    if (!selecionadoId) return;
    const escolhidos = sugeridos.filter(s => s.selecionado);
    if (escolhidos.length === 0) return avisar('erro', 'Nenhum cliente selecionado');
    const r = await api.post<{ success: boolean; inseridos: number; mesclados: number }>(
      'adicionar_clientes', {
        concorrente_id: selecionadoId,
        clientes: escolhidos.map(s => ({
          nome: s.nome, dominios: s.dominios, origem_descoberta: 'gemini',
        })),
        ator_email: atorEmail,
      });
    if (r.ok && r.data) {
      avisar('ok', `Carteira atualizada: ${r.data.inseridos} novos, ${r.data.mesclados} mesclados`);
      setSugeridos([]);
      await carregarDetalhe(selecionadoId);
    } else avisar('erro', r.error || 'Falha ao gravar carteira');
  };

  const adicionarManual = async () => {
    if (!selecionadoId) return;
    const clientes: { nome: string; dominios: string[] }[] = [];

    if (manNome.trim()) {
      clientes.push({
        nome: manNome.trim(),
        dominios: manDominios.split(',').map(d => d.trim()).filter(Boolean),
      });
    }
    // Lote: uma linha "Nome;dominio1,dominio2"
    for (const linha of manLote.split('\n')) {
      const [nome, doms] = linha.split(';');
      if (nome?.trim()) {
        clientes.push({
          nome: nome.trim(),
          dominios: (doms || '').split(',').map(d => d.trim()).filter(Boolean),
        });
      }
    }
    if (clientes.length === 0) return avisar('erro', 'Informe ao menos um cliente');

    const r = await api.post<{ success: boolean; inseridos: number; mesclados: number }>(
      'adicionar_clientes', { concorrente_id: selecionadoId, clientes, ator_email: atorEmail });
    if (r.ok && r.data) {
      avisar('ok', `${r.data.inseridos} inseridos, ${r.data.mesclados} mesclados`);
      setManNome(''); setManDominios(''); setManLote('');
      await carregarDetalhe(selecionadoId);
    } else avisar('erro', r.error || 'Falha ao adicionar clientes');
  };

  const executarAnalise = async () => {
    if (!selecionadoId) return;
    setAnalisando(true);
    const r = await api.post<{ success: boolean; executado_em: string; resultado: ResultadoAnalise }>(
      'executar_analise', { concorrente_id: selecionadoId, ator_email: atorEmail });
    setAnalisando(false);
    if (r.ok && r.data?.resultado) {
      setResultado(r.data.resultado);
      setResultadoEm(r.data.executado_em);
      setAba('resultado');
      avisar('ok', 'Análise concluída e snapshot gravado');
      carregarConcorrentes();
    } else avisar('erro', r.error || 'Falha ao executar análise');
  };

  const removerCliente = async (cliente: ClienteCarteira) => {
    const r = await api.patch('atualizar_cliente', {
      id: cliente.id, ativo: false, ator_email: atorEmail,
    });
    if (r.ok) {
      avisar('ok', `"${cliente.nome}" removido da carteira`);
      if (selecionadoId) carregarDetalhe(selecionadoId);
    } else avisar('erro', r.error || 'Falha ao remover');
  };

  // ── 🆕 v2.0: Edição / arquivamento de concorrente ───────────
  const abrirEdicaoConcorrente = () => {
    if (!concorrente) return;
    setEdNome(concorrente.nome);
    setEdSite(concorrente.website || '');
    setEdDominio(concorrente.dominio || '');
    setEditandoConc(true);
  };

  const salvarEdicaoConcorrente = async () => {
    if (!selecionadoId) return;
    if (!edNome.trim()) return avisar('erro', 'Informe o nome do concorrente');
    const r = await api.patch<{ success: boolean; concorrente: Concorrente }>(
      'atualizar_concorrente', {
        id: selecionadoId,
        nome: edNome.trim(),
        website: edSite.trim() || null,
        dominio: edDominio.trim() || null,
        ator_email: atorEmail,
      });
    if (r.ok) {
      avisar('ok', 'Concorrente atualizado');
      setEditandoConc(false);
      await carregarConcorrentes();
    } else avisar('erro', r.error || 'Falha ao atualizar concorrente');
  };

  const arquivarConcorrente = async () => {
    if (!selecionadoId || !concorrente) return;
    const ok = window.confirm(
      `Arquivar o concorrente "${concorrente.nome}"?\n\n` +
      'Ele sai da lista, mas a carteira e o histórico de análises são preservados ' +
      '(remoção lógica — pode ser revertida via banco).'
    );
    if (!ok) return;
    const r = await api.patch('atualizar_concorrente', {
      id: selecionadoId, status: 'arquivado', ator_email: atorEmail,
    });
    if (r.ok) {
      avisar('ok', `"${concorrente.nome}" arquivado`);
      setEditandoConc(false);
      setSelecionadoId(null);
      setResultado(null); setResultadoEm(null); setClientesCarteira([]);
      await carregarConcorrentes();
    } else avisar('erro', r.error || 'Falha ao arquivar');
  };

  // ── 🆕 v2.0: Visão Cliente × Concorrentes ───────────────────
  const carregarEmpresas = useCallback(async () => {
    const r = await api.get<{ success: boolean; empresas: EmpresaOption[] }>(
      'listar_empresas', { ator_email: atorEmail }
    );
    if (r.ok && r.data?.empresas) {
      setEmpresas(r.data.empresas);
      if (r.data.empresas.length > 0 && empresaSelId === null) {
        setEmpresaSelId(r.data.empresas[0].id);
      }
    } else if (!r.ok) {
      avisar('erro', r.error || 'Falha ao listar empresas');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, atorEmail, empresaSelId]);

  useEffect(() => {
    if (aba === 'visao_cliente' && empresas.length === 0) carregarEmpresas();
  }, [aba]); // eslint-disable-line

  const mapearConcorrentes = async () => {
    if (!empresaSelId) return;
    setMapeando(true);
    const r = await api.get<{ success: boolean; resultado: VisaoClienteResultado }>(
      'analisar_empresa', { empresa_id: empresaSelId, ator_email: atorEmail }
    );
    setMapeando(false);
    if (r.ok && r.data?.resultado) {
      setVisaoResultado(r.data.resultado);
    } else avisar('erro', r.error || 'Falha ao mapear concorrentes');
  };

  // ── Guard de RBAC (cortesia — backend também valida) ────────
  if (!autorizado) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center text-gray-600">
        <i className="fa-solid fa-user-secret text-3xl text-gray-400 mb-3" />
        <p>Seu perfil ({currentUser.tipo_usuario}) não tem acesso ao módulo Espionagem Estratégica.</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            <i className="fa-solid fa-user-secret text-indigo-900 mr-2" />
            Espionagem Estratégica
          </h1>
          <p className="text-sm text-gray-500">
            Inteligência competitiva — carteira dos concorrentes × CRM × Prospect Engine
          </p>
        </div>
        <button
          onClick={() => setCriando(v => !v)}
          className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold hover:bg-indigo-800"
        >
          <i className="fa-solid fa-plus mr-2" />Novo Concorrente
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm ${
          msg.tipo === 'ok' ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {msg.texto}
        </div>
      )}

      {/* Form novo concorrente */}
      {criando && (
        <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1">Nome</label>
            <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-64" placeholder="Ex.: Talentfour" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1">Website</label>
            <input value={novoSite} onChange={e => setNovoSite(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-64" placeholder="concorrente.com.br" />
          </div>
          <button onClick={criarConcorrente} disabled={api.loading}
            className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold disabled:opacity-50">
            Criar
          </button>
        </div>
      )}

      {/* Seletor de concorrente */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-gray-500 uppercase">Concorrente</label>
        <select
          value={selecionadoId ?? ''}
          onChange={e => setSelecionadoId(Number(e.target.value) || null)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[260px]"
        >
          {concorrentes.length === 0 && <option value="">— nenhum cadastrado —</option>}
          {concorrentes.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.total_clientes ?? 0} clientes)
            </option>
          ))}
        </select>
        {/* 🆕 v2.0 — editar / arquivar concorrente */}
        <button onClick={abrirEdicaoConcorrente} disabled={!selecionadoId}
          title="Editar nome, website e domínio"
          className="px-2.5 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-40">
          <i className="fa-solid fa-pen" />
        </button>
        <button onClick={arquivarConcorrente} disabled={!selecionadoId}
          title="Arquivar concorrente (remoção lógica)"
          className="px-2.5 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-40">
          <i className="fa-solid fa-box-archive" />
        </button>
        {concorrente?.ultima_analise && (
          <span className="text-xs text-gray-500">
            Última análise: {new Date(concorrente.ultima_analise.executado_em).toLocaleString('pt-BR')}
            {' · '}cobertura {concorrente.ultima_analise.cobertura_pct}%
          </span>
        )}
        <div className="ml-auto">
          <button onClick={executarAnalise} disabled={!selecionadoId || analisando}
            className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold disabled:opacity-50">
            {analisando
              ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Analisando…</>
              : <><i className="fa-solid fa-crosshairs mr-2" />Analisar penetração</>}
          </button>
        </div>
      </div>

      {/* 🆕 v2.0 — Form de edição do concorrente */}
      {editandoConc && concorrente && (
        <div className="bg-white rounded-xl shadow p-4 border-2 border-indigo-100 flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1">Nome</label>
            <input value={edNome} onChange={e => setEdNome(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-56" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1">Website</label>
            <input value={edSite} onChange={e => setEdSite(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-64" placeholder="https://concorrente.com.br" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 uppercase mb-1">Domínio</label>
            <input value={edDominio} onChange={e => setEdDominio(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-56" placeholder="concorrente.com.br" />
          </div>
          <button onClick={salvarEdicaoConcorrente} disabled={api.loading}
            className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold disabled:opacity-50">
            <i className="fa-solid fa-check mr-2" />Salvar
          </button>
          <button onClick={() => setEditandoConc(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      )}

      {/* Abas */}
      <div className="bg-white rounded-xl shadow">
        <div className="flex gap-1 border-b px-4 pt-3">
          {([
            ['auto', '⚡ Análise Automática'],
            ['manual', '✍️ Análise Manual'],
            ['resultado', '📊 Resultado'],
            ['visao_cliente', '🔄 Visão Cliente'],
          ] as [Aba, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 ${
                aba === k ? 'bg-white text-indigo-900 border-gray-200 -mb-px'
                          : 'bg-gray-50 text-gray-500 border-transparent'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ══ ABA AUTOMÁTICA ══ */}
          {aba === 'auto' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={descobrirGemini} disabled={!selecionadoId || descobrindo}
                  className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 bg-gradient-to-r from-indigo-600 to-purple-600">
                  {descobrindo
                    ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Gemini varrendo fontes públicas… (até 50s)</>
                    : <><i className="fa-solid fa-wand-magic-sparkles mr-2" />Descobrir clientes no site (Gemini)</>}
                </button>
                <p className="text-xs text-gray-500">
                  Nada é gravado sem a sua confirmação abaixo.
                </p>
              </div>

              {semResultados && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold mb-1">Sem dados públicos encontrados para este concorrente.</p>
                  <p className="mb-2">Use estas queries manualmente no Google e cadastre pela aba Manual:</p>
                  <ul className="list-disc ml-5 font-mono text-xs">
                    {queriesManuais.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}

              {sugeridos.length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-indigo-50 px-4 py-2 flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-900">
                      Clientes descobertos — confirme antes de gravar
                    </span>
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                      IA · Gemini Search Grounding
                    </span>
                  </div>
                  {sugeridos.map((s, i) => (
                    <label key={i} className="flex items-center gap-3 px-4 py-2 border-t text-sm cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={!!s.selecionado}
                        onChange={() => setSugeridos(arr =>
                          arr.map((x, j) => j === i ? { ...x, selecionado: !x.selecionado } : x))} />
                      <b className="text-gray-800">{s.nome}</b>
                      <span className="text-gray-500 text-xs">{s.dominios.join(', ') || 'sem domínio'}</span>
                      <span className={`ml-auto text-xs ${s.ja_cadastrado ? 'text-amber-600' : 'text-purple-700'}`}>
                        {s.ja_cadastrado ? '⚠ já cadastrado' : `✨ ${s.fonte}`}
                      </span>
                    </label>
                  ))}
                  <div className="p-3 border-t flex justify-end">
                    <button onClick={gravarSugeridos} disabled={api.loading}
                      className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold disabled:opacity-50">
                      Confirmar e gravar carteira
                    </button>
                  </div>
                </div>
              )}

              <CarteiraAtual clientes={clientesCarteira} onRemover={removerCliente} />
            </div>
          )}

          {/* ══ ABA MANUAL ══ */}
          {aba === 'manual' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1">Cliente (nome)</label>
                  <input value={manNome} onChange={e => setManNome(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-64" placeholder="Ex.: Banco Pine" />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1">Domínios (vírgula)</label>
                  <input value={manDominios} onChange={e => setManDominios(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-72" placeholder="pine.com, pine.com.br" />
                </div>
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-500 uppercase mb-1">
                  Ou cole em lote — uma linha por cliente: <code>Nome;dominio1,dominio2</code>
                </label>
                <textarea value={manLote} onChange={e => setManLote(e.target.value)} rows={5}
                  className="border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder={'CVC Corp;cvccorp.com.br,cvc.com.br\nEdenRed;edenred.com.br,edenred.com'} />
              </div>
              <div className="flex justify-end">
                <button onClick={adicionarManual} disabled={api.loading || !selecionadoId}
                  className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold disabled:opacity-50">
                  <i className="fa-solid fa-plus mr-2" />Adicionar à carteira
                </button>
              </div>

              <CarteiraAtual clientes={clientesCarteira} onRemover={removerCliente} />
            </div>
          )}

          {/* ══ ABA RESULTADO ══ */}
          {aba === 'resultado' && (
            <div>
              {!resultado ? (
                <div className="text-center text-gray-500 py-10">
                  <i className="fa-solid fa-chart-network text-3xl mb-3 text-gray-300" />
                  <p>Nenhuma análise ainda. Monte a carteira e clique em <b>Analisar penetração</b>.</p>
                </div>
              ) : (
                <ResultadoHierarquico
                  nomeConcorrente={concorrente?.nome || ''}
                  resultado={resultado}
                  executadoEm={resultadoEm}
                />
              )}
            </div>
          )}

          {/* ══ ABA VISÃO CLIENTE (🆕 v2.0) ══ */}
          {aba === 'visao_cliente' && (
            <div className="space-y-5">
              {/* Seletor de cliente (espelho invertido da barra de concorrente) */}
              <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <label className="text-xs font-bold text-gray-500 uppercase">Cliente</label>
                <select
                  value={empresaSelId ?? ''}
                  onChange={e => { setEmpresaSelId(Number(e.target.value) || null); setVisaoResultado(null); }}
                  className="border rounded-lg px-3 py-2 text-sm min-w-[260px]"
                >
                  {empresas.length === 0 && <option value="">— nenhuma empresa na base —</option>}
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nome} ({e.num_concorrentes} concorrente{e.num_concorrentes > 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">
                  <i className="fa-solid fa-database mr-1" />
                  100% interno — sem Gemini
                </span>
                <div className="ml-auto">
                  <button onClick={mapearConcorrentes} disabled={!empresaSelId || mapeando}
                    className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-sm font-semibold disabled:opacity-50">
                    {mapeando
                      ? <><i className="fa-solid fa-spinner fa-spin mr-2" />Mapeando…</>
                      : <><i className="fa-solid fa-map-location-dot mr-2" />Mapear concorrentes</>}
                  </button>
                </div>
              </div>

              {!visaoResultado ? (
                <div className="text-center text-gray-500 py-10">
                  <i className="fa-solid fa-arrows-rotate text-3xl mb-3 text-gray-300" />
                  <p>Selecione um cliente e clique em <b>Mapear concorrentes</b> para ver
                     quem disputa esta conta.</p>
                </div>
              ) : (
                <VisaoClienteHierarquica resultado={visaoResultado} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ════════════════════════════════════════════════════════════

const CarteiraAtual: React.FC<{
  clientes: ClienteCarteira[];
  onRemover: (c: ClienteCarteira) => void;
}> = ({ clientes, onRemover }) => (
  <div>
    <h3 className="text-sm font-bold text-gray-600 mb-2">
      Carteira atual ({clientes.length} clientes)
    </h3>
    {clientes.length === 0 ? (
      <p className="text-sm text-gray-400">Nenhum cliente cadastrado ainda.</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {clientes.map(c => (
          <span key={c.id}
            className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-700">
            <b>{c.nome}</b>
            <span className="text-gray-400">{c.dominios.join(', ') || '—'}</span>
            {c.origem_descoberta === 'gemini' && <span title="Descoberto via Gemini">✨</span>}
            <button onClick={() => onRemover(c)} title="Remover (lógico)"
              className="text-gray-400 hover:text-red-600">✕</button>
          </span>
        ))}
      </div>
    )}
  </div>
);

const ResultadoHierarquico: React.FC<{
  nomeConcorrente: string;
  resultado: ResultadoAnalise;
  executadoEm: string | null;
}> = ({ nomeConcorrente, resultado, executadoEm }) => {
  const t = resultado.totais;
  return (
    <div>
      {/* Raiz */}
      <div className="mx-auto w-72 rounded-xl bg-indigo-950 text-white text-center py-3 shadow-lg">
        <div className="font-bold tracking-wider">{nomeConcorrente.toUpperCase()}</div>
        <div className="text-[11px] text-indigo-200">
          {t.clientes} contas-cliente
          {executadoEm && <> · analisado em {new Date(executadoEm).toLocaleDateString('pt-BR')}</>}
          {resultado.delta && resultado.delta.novos_na_carteira > 0 &&
            <> · Δ +{resultado.delta.novos_na_carteira} novo(s)</>}
        </div>
      </div>
      <div className="w-0.5 h-4 bg-indigo-950 mx-auto" />
      <div className="h-0.5 bg-indigo-950 mx-10 mb-4" />

      {/* Grid de clientes */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {resultado.clientes.map(c => {
          const zero = c.prospectados === 0 && c.leads_crm === 0;
          const crm = c.campanhas > 0;
          return (
            <div key={c.cliente_id}
              className={`rounded-xl p-3 text-center border ${
                zero ? 'bg-gray-100 border-gray-200'
                     : crm ? 'bg-indigo-50 border-2 border-indigo-900'
                           : 'bg-white border-indigo-200'}`}>
              <div className={`text-[11px] font-bold ${zero ? 'text-gray-400' : 'text-indigo-950'}`}>
                {c.nome}
              </div>
              <div className={`text-2xl font-extrabold ${zero ? 'text-gray-300' : 'text-indigo-950'}`}>
                {c.prospectados}
              </div>
              <div className="text-[9px] text-gray-500">prospectados</div>
              <div className={`text-[9px] mt-1 ${zero ? 'italic text-gray-400' : 'text-gray-700'}`}>
                {zero ? 'oportunidade' : `Camp ${c.campanhas} · Abord ${c.abordagens}`}
              </div>
              <div className="flex flex-wrap justify-center gap-1 mt-1">
                {c.novo_na_carteira &&
                  <Chip cor="bg-pink-100 text-pink-800">novo na carteira</Chip>}
                {c.respostas > 0 &&
                  <Chip cor="bg-green-100 text-green-800">{c.respostas} resposta(s)</Chip>}
                {c.prospectados_corp > 0 &&
                  <Chip cor="bg-indigo-100 text-indigo-800">{c.prospectados_corp} corp.</Chip>}
                {c.frio_90d &&
                  <Chip cor="bg-amber-100 text-amber-800">frio +90d</Chip>}
                {!zero && c.prospectados > 0 && c.prospectados_corp === 0 &&
                  <Chip cor="bg-amber-100 text-amber-800">só e-mail pessoal</Chip>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totais */}
      <div className="mt-4 rounded-xl bg-indigo-950 text-white flex flex-wrap justify-around py-3 px-2 gap-y-2">
        <Total v={t.prospectados} l="prospectados" />
        <Total v={t.leads_crm} l="leads no CRM" />
        <Total v={t.campanhas} l="campanhas" />
        <Total v={t.abordagens} l="abordagens" />
        <Total v={t.respostas} l="respostas" />
        <Total v={`${t.cobertura_pct}%`} l="cobertura" />
        <Total v={`${t.contas_com_presenca}/${t.clientes}`} l="contas c/ presença" />
      </div>

      <p className="text-[10px] text-gray-400 mt-2">
        Legenda: borda escura = campanhas ativas no CRM · cinza = conta intocada (oportunidade) ·
        Fontes: email_leads · email_empresas · prospect_leads
      </p>
    </div>
  );
};

// 🆕 v2.0 — Visão Cliente × Concorrentes (mockup aprovado 09/08/2026)
const VisaoClienteHierarquica: React.FC<{
  resultado: VisaoClienteResultado;
}> = ({ resultado }) => {
  const e = resultado.empresa;
  const presenca = e.leads_crm > 0 || e.abordagens > 0 || e.prospectados > 0;
  const disputada = resultado.total_concorrentes >= 2;
  const diasDesde = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div>
      {/* Card central — o CLIENTE com métricas canônicas */}
      <div className="mx-auto w-fit min-w-[380px] rounded-xl bg-indigo-950 text-white text-center py-3 px-8 shadow-lg">
        <div className="font-bold tracking-wider">{e.nome.toUpperCase()}</div>
        <div className="text-[11px] text-indigo-200">
          {e.dominios.join(' · ') || 'sem domínio'}
          {' — '}disputado por {resultado.total_concorrentes} concorrente(s)
        </div>
        <div className="flex justify-center gap-5 mt-2 pt-2 border-t border-indigo-800">
          <Total v={e.prospectados} l="prospectados" />
          <Total v={e.leads_crm} l="leads CRM" />
          <Total v={e.campanhas} l="campanhas" />
          <Total v={e.abordagens} l="abordagens" />
          <Total v={e.respostas} l="respostas" />
        </div>
        <div className="flex justify-center gap-1.5 mt-2">
          {disputada &&
            <Chip cor="bg-amber-300 text-amber-900">⚔️ conta disputada</Chip>}
          {presenca
            ? <Chip cor="bg-green-300 text-green-900">✅ presença TechFor</Chip>
            : <Chip cor="bg-gray-200 text-gray-600">oportunidade intocada</Chip>}
          {e.frio_90d &&
            <Chip cor="bg-amber-100 text-amber-800">frio +90d</Chip>}
          {e.prospectados > 0 && e.prospectados_corp === 0 &&
            <Chip cor="bg-amber-100 text-amber-800">só e-mail pessoal</Chip>}
        </div>
      </div>
      <div className="w-0.5 h-4 bg-indigo-950 mx-auto" />
      <div className="h-0.5 bg-indigo-950 mx-10 mb-4" />

      {/* Grid de concorrentes que possuem este cliente na carteira */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {resultado.concorrentes.map(c => (
          <div key={c.id}
            className="rounded-xl p-3 text-center border-[1.5px] bg-indigo-50 border-indigo-200">
            <div className="text-[12px] font-bold text-indigo-950">{c.nome}</div>
            <div className="text-2xl font-extrabold text-indigo-950">{c.total_clientes}</div>
            <div className="text-[9px] text-gray-500">contas na carteira</div>
            <div className="text-[9px] mt-1 text-gray-700">
              na carteira desde {new Date(c.descoberto_em).toLocaleDateString('pt-BR')}
            </div>
            <div className="flex flex-wrap justify-center gap-1 mt-1.5">
              <Chip cor={c.origem_descoberta === 'gemini'
                ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'}>
                origem: {c.origem_descoberta}
              </Chip>
              {diasDesde(c.descoberto_em) <= 7 &&
                <Chip cor="bg-red-100 text-red-700">🔥 descoberto há {diasDesde(c.descoberto_em)}d</Chip>}
              {c.cobertura_pct !== null &&
                <Chip cor="bg-blue-100 text-blue-800">cobertura {c.cobertura_pct}%</Chip>}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-400 mt-3">
        Métricas do card central são canônicas — idênticas em qualquer concorrente que
        possua este cliente · Concorrentes arquivados e vínculos inativos não aparecem no mapa
      </p>
    </div>
  );
};

const Chip: React.FC<{ cor: string; children: React.ReactNode }> = ({ cor, children }) => (
  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${cor}`}>{children}</span>
);

const Total: React.FC<{ v: number | string; l: string }> = ({ v, l }) => (
  <div className="text-center px-2">
    <div className="text-lg font-extrabold leading-tight">{v}</div>
    <div className="text-[9px] text-indigo-200">{l}</div>
  </div>
);

export default EspionagemPage;
