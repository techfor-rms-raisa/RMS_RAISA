/**
 * EmpresasLeadsCRM.tsx — CRM de Empresas + Leads
 * 
 * Módulo integrado ao Prospect Engine para gestão do funil de conversão:
 * Lead → Prospect → Cliente
 * 
 * Features:
 * - KPI cards (empresas, leads, prospects, clientes)
 * - Busca global por nome/domínio/email
 * - Abas: Empresas (com expandir leads aptos + campanhas) | Leads (apto_campanha=true)
 * - CRUD de empresas e leads
 * - Importação do Prospect Engine
 * - Detalhe do lead com timeline
 * - Mudança de funil com histórico
 * 
 * Escopo (RBAC):
 * - Administrador  → vê TODAS as empresas/leads
 * - Gestão Comercial / SDR → vê apenas as suas (filtro reservado_por = currentUser.id)
 * 
 * Caminho: src/components/campanhas/EmpresasLeadsCRM.tsx
 * Versão: 1.1
 * Data: 28/05/2026
 * 
 * Changelog 1.1:
 *  - Filtro por reservado_por (analista logado) em todas as queries.
 *  - Aba Empresas: expandir empresa → mostra leads aptos + campanhas vinculadas.
 *  - Aba Leads: lista apenas leads com apto_campanha=true (promovidos via botão "Campanhas" no Prospect Engine).
 *  - criar_empresa/criar_lead passam reservado_por do currentUser.
 */

import React, { useState, useEffect, useCallback } from 'react';

// ════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════
interface CRMProps {
  currentUser: {
    id: number;
    nome_usuario: string;
    tipo_usuario: string;
  };
}

interface Empresa {
  id: number;
  nome: string;
  dominio: string | null;
  cnpj: string | null;
  setor: string | null;
  porte: string | null;
  cidade: string | null;
  uf: string | null;
  website: string | null;
  linkedin_url: string | null;
  telefone_comercial: string | null;
  observacoes: string | null;
  origem: string | null;
  total_leads: number;
  total_prospects: number;
  total_clientes: number;
  criado_em: string;
}

interface Lead {
  id: number;
  empresa_id: number | null;
  nome: string;
  email: string;
  cargo: string | null;
  telefone: string | null;
  linkedin_url: string | null;
  funil_status: string;
  funil_atualizado_em: string;
  score_engajamento: number;
  opt_out: boolean;
  total_emails_recebidos: number;
  total_emails_abertos: number;
  total_emails_clicados: number;
  total_respostas: number;
  tags: string[] | null;
  notas: string | null;
  origem: string | null;
  criado_em: string;
  reservado_por?: number | null;
  apto_campanha?: boolean;
  apto_campanha_em?: string | null;
  email_empresas?: { id: number; nome: string; dominio: string | null; setor: string | null } | null;
}

interface LeadComCampanhas extends Lead {
  campanhas: Array<{
    lead_id: number;
    campanha_id: number;
    status: string;
    step_atual: number;
    adicionado_em: string;
    email_campanhas?: { id: number; nome: string; status: string; tipo: string; criado_em: string } | null;
  }>;
  total_campanhas: number;
}

interface HistoricoItem {
  id: number;
  tipo: string;
  descricao: string;
  dados: any;
  assunto_email: string | null;
  criado_por: string | null;
  criado_em: string;
  email_campanhas?: { nome: string } | null;
}

interface Stats {
  total_empresas: number;
  total_leads: number;
  total_prospects: number;
  total_clientes: number;
  total_optout: number;
  total_campanhas: number;
}

// ════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════
const API_URL = '/api/campaign-leads';

const FUNIL_LABELS: Record<string, { label: string; cor: string; icon: string }> = {
  lead:     { label: 'Lead',     cor: 'bg-gray-100 text-gray-700',     icon: 'fa-solid fa-user' },
  prospect: { label: 'Prospect', cor: 'bg-blue-100 text-blue-700',     icon: 'fa-solid fa-user-check' },
  cliente:  { label: 'Cliente',  cor: 'bg-green-100 text-green-700',   icon: 'fa-solid fa-handshake' },
  inativo:  { label: 'Inativo',  cor: 'bg-yellow-100 text-yellow-700', icon: 'fa-solid fa-clock' },
  perdido:  { label: 'Perdido',  cor: 'bg-red-100 text-red-700',       icon: 'fa-solid fa-user-xmark' },
};

const SETORES = [
  'Tecnologia', 'Financeiro', 'Saúde', 'Varejo', 'Indústria',
  'Educação', 'Telecomunicações', 'Energia', 'Logística',
  'Agronegócio', 'Construção', 'Governo', 'Consultoria', 'Outro',
];

const PORTES = ['Micro', 'Pequena', 'Média', 'Grande'];

const HISTORICO_ICONS: Record<string, string> = {
  lead_criado:       'fa-solid fa-plus-circle text-green-500',
  email_enviado:     'fa-solid fa-paper-plane text-blue-500',
  email_aberto:      'fa-solid fa-envelope-open text-indigo-500',
  email_clicado:     'fa-solid fa-mouse-pointer text-purple-500',
  email_respondido:  'fa-solid fa-reply text-teal-500',
  bounce:            'fa-solid fa-triangle-exclamation text-red-500',
  opt_out:           'fa-solid fa-ban text-red-600',
  funil_mudou:       'fa-solid fa-arrows-rotate text-amber-500',
  nota_manual:       'fa-solid fa-sticky-note text-gray-500',
  campanha_adicionado: 'fa-solid fa-bullhorn text-indigo-400',
};

// ════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════
const EmpresasLeadsCRM: React.FC<CRMProps> = ({ currentUser }) => {
  // ── Estado geral ──
  const [abaAtiva, setAbaAtiva] = useState<'empresas' | 'leads'>('empresas');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  // ── Empresas ──
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [totalEmpresas, setTotalEmpresas] = useState(0);
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [paginaEmpresas, setPaginaEmpresas] = useState(1);

  // ── Leads ──
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [buscaLead, setBuscaLead] = useState('');
  const [filtroFunil, setFiltroFunil] = useState('');
  const [paginaLeads, setPaginaLeads] = useState(1);

  // ── Modais ──
  const [modalEmpresa, setModalEmpresa] = useState<'criar' | 'editar' | null>(null);
  const [modalLead, setModalLead] = useState<'criar' | 'editar' | null>(null);
  const [modalDetalhe, setModalDetalhe] = useState<'empresa' | 'lead' | null>(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<any>(null);
  const [leadSelecionado, setLeadSelecionado] = useState<any>(null);
  const [leadTimeline, setLeadTimeline] = useState<HistoricoItem[]>([]);
  const [leadCampanhas, setLeadCampanhas] = useState<any[]>([]);
  const [leadRespostas, setLeadRespostas] = useState<any[]>([]);

  // ── Formulários ──
  const [formEmpresa, setFormEmpresa] = useState<Partial<Empresa>>({});
  const [formLead, setFormLead] = useState<Partial<Lead>>({});

  // ── Expandir empresa (v1.1) ──
  const [empresasExpandidas, setEmpresasExpandidas] = useState<Set<number>>(new Set());
  const [leadsAptosPorEmpresa, setLeadsAptosPorEmpresa] = useState<Record<number, LeadComCampanhas[]>>({});
  const [loadingEmpresaId, setLoadingEmpresaId] = useState<number | null>(null);

  // ── Importação ──
  const [modalImportar, setModalImportar] = useState(false);
  const [prospectsDispo, setProspectsDispo] = useState<any[]>([]);
  const [prospectsSelec, setProspectsSelec] = useState<Set<number>>(new Set());
  const [loadingImportar, setLoadingImportar] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<any>(null);

  // ── Modal Funil ──
  const [modalFunil, setModalFunil] = useState(false);
  const [novoFunil, setNovoFunil] = useState('');
  const [motivoPerda, setMotivoPerda] = useState('');

  // ════════════════════════════════════════════
  // DATA FETCHING
  // ════════════════════════════════════════════

  // (v1.1) RBAC: Admin vê tudo; Gestão Comercial e SDR veem só os seus.
  const podeVerTodos = currentUser?.tipo_usuario === 'Administrador';

  const carregarStats = useCallback(async () => {
    try {
      const params = new URLSearchParams({ action: 'stats' });
      if (!podeVerTodos && currentUser?.id) {
        params.set('reservado_por', String(currentUser.id));
      }
      const resp = await fetch(`${API_URL}?${params}`);
      const data = await resp.json();
      if (data.success) setStats(data.stats);
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }, [podeVerTodos, currentUser]);

  const carregarEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'listar_empresas',
        page: String(paginaEmpresas),
        limit: '20',
      });
      if (buscaEmpresa) params.set('busca', buscaEmpresa);
      if (filtroSetor) params.set('setor', filtroSetor);
      if (!podeVerTodos && currentUser?.id) {
        params.set('reservado_por', String(currentUser.id));
      }

      const resp = await fetch(`${API_URL}?${params}`);
      const data = await resp.json();
      if (data.success) {
        setEmpresas(data.empresas);
        setTotalEmpresas(data.total);
        // Resetar expansão ao recarregar lista
        setEmpresasExpandidas(new Set());
        setLeadsAptosPorEmpresa({});
      }
    } catch (err) {
      console.error('Erro ao carregar empresas:', err);
    } finally {
      setLoading(false);
    }
  }, [paginaEmpresas, buscaEmpresa, filtroSetor, podeVerTodos, currentUser]);

  const carregarLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'listar_leads',
        page: String(paginaLeads),
        limit: '30',
      });
      if (buscaLead) params.set('busca', buscaLead);
      if (filtroFunil) params.set('funil', filtroFunil);
      if (!podeVerTodos && currentUser?.id) {
        params.set('reservado_por', String(currentUser.id));
      }

      const resp = await fetch(`${API_URL}?${params}`);
      const data = await resp.json();
      if (data.success) {
        setLeads(data.leads);
        setTotalLeads(data.total);
      }
    } catch (err) {
      console.error('Erro ao carregar leads:', err);
    } finally {
      setLoading(false);
    }
  }, [paginaLeads, buscaLead, filtroFunil, podeVerTodos, currentUser]);

  // (v1.1) Carrega leads aptos + campanhas de uma empresa específica (para o expandir)
  const carregarLeadsAptosEmpresa = useCallback(async (empresaId: number) => {
    setLoadingEmpresaId(empresaId);
    try {
      const params = new URLSearchParams({
        action: 'empresa_leads_aptos',
        empresa_id: String(empresaId),
      });
      if (!podeVerTodos && currentUser?.id) {
        params.set('reservado_por', String(currentUser.id));
      }
      const resp = await fetch(`${API_URL}?${params}`);
      const data = await resp.json();
      if (data.success) {
        setLeadsAptosPorEmpresa(prev => ({ ...prev, [empresaId]: data.leads || [] }));
      }
    } catch (err) {
      console.error('Erro ao carregar leads aptos da empresa:', err);
    } finally {
      setLoadingEmpresaId(null);
    }
  }, [podeVerTodos, currentUser]);

  // (v1.1) Toggle de expansão da linha da empresa
  const alternarExpansaoEmpresa = useCallback((empresaId: number) => {
    setEmpresasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(empresaId)) {
        next.delete(empresaId);
      } else {
        next.add(empresaId);
        // Carregar sob demanda (1x apenas)
        if (!leadsAptosPorEmpresa[empresaId]) {
          carregarLeadsAptosEmpresa(empresaId);
        }
      }
      return next;
    });
  }, [leadsAptosPorEmpresa, carregarLeadsAptosEmpresa]);

  useEffect(() => { carregarStats(); }, [carregarStats]);
  useEffect(() => { if (abaAtiva === 'empresas') carregarEmpresas(); }, [abaAtiva, carregarEmpresas]);
  useEffect(() => { if (abaAtiva === 'leads') carregarLeads(); }, [abaAtiva, carregarLeads]);

  // ════════════════════════════════════════════
  // AÇÕES: EMPRESA
  // ════════════════════════════════════════════

  const salvarEmpresa = async () => {
    const isEdit = modalEmpresa === 'editar';
    const method = isEdit ? 'PATCH' : 'POST';
    const action = isEdit ? 'atualizar_empresa' : 'criar_empresa';

    try {
      setLoading(true);
      // (v1.1) Ao criar manualmente, o dono é o usuário logado
      const payload: any = {
        ...formEmpresa,
        action,
        criado_por: currentUser.nome_usuario,
      };
      if (!isEdit) payload.reservado_por = currentUser.id;

      const resp = await fetch(API_URL, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!data.success) {
        alert(data.error || 'Erro ao salvar empresa');
        return;
      }
      setModalEmpresa(null);
      setFormEmpresa({});
      carregarEmpresas();
      carregarStats();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalheEmpresa = async (id: number) => {
    try {
      setLoading(true);
      const resp = await fetch(`${API_URL}?action=detalhe_empresa&id=${id}`);
      const data = await resp.json();
      if (data.success) {
        setEmpresaSelecionada(data);
        setModalDetalhe('empresa');
      }
    } catch (err) {
      console.error('Erro ao abrir detalhe:', err);
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════
  // AÇÕES: LEAD
  // ════════════════════════════════════════════

  const salvarLead = async () => {
    const isEdit = modalLead === 'editar';
    const method = isEdit ? 'PATCH' : 'POST';
    const action = isEdit ? 'atualizar_lead' : 'criar_lead';

    try {
      setLoading(true);
      // (v1.1) Ao criar manualmente, o dono é o usuário logado
      const payload: any = {
        ...formLead,
        action,
        criado_por: currentUser.nome_usuario,
      };
      if (!isEdit) payload.reservado_por = currentUser.id;

      const resp = await fetch(API_URL, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!data.success) {
        alert(data.error || 'Erro ao salvar lead');
        return;
      }
      if (data.opt_out_warning) {
        alert('⚠️ Este email está na lista de opt-out global. O lead foi criado mas não receberá campanhas.');
      }
      setModalLead(null);
      setFormLead({});
      carregarLeads();
      carregarStats();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalheLead = async (id: number) => {
    try {
      setLoading(true);
      const resp = await fetch(`${API_URL}?action=detalhe_lead&id=${id}`);
      const data = await resp.json();
      if (data.success) {
        setLeadSelecionado(data.lead);
        setLeadTimeline(data.historico || []);
        setLeadCampanhas(data.campanhas || []);
        setLeadRespostas(data.respostas || []);
        setModalDetalhe('lead');
      }
    } catch (err) {
      console.error('Erro ao abrir detalhe:', err);
    } finally {
      setLoading(false);
    }
  };

  const mudarFunil = async () => {
    if (!leadSelecionado || !novoFunil) return;
    try {
      setLoading(true);
      const resp = await fetch(API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mudar_funil',
          id: leadSelecionado.id,
          novo_status: novoFunil,
          motivo_perda: novoFunil === 'perdido' ? motivoPerda : null,
          criado_por: currentUser.nome_usuario,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setModalFunil(false);
        setNovoFunil('');
        setMotivoPerda('');
        // Recarregar detalhe
        await abrirDetalheLead(leadSelecionado.id);
        carregarLeads();
        carregarStats();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════
  // AÇÕES: IMPORTAÇÃO
  // ════════════════════════════════════════════

  const abrirImportacao = async () => {
    setModalImportar(true);
    setResultadoImport(null);
    setLoadingImportar(true);
    try {
      // Buscar prospects que têm email e ainda não foram importados
      const resp = await fetch('/api/prospect-leads?status=novo&limit=200');
      const data = await resp.json();
      // Filtrar apenas os que têm email
      const comEmail = (data.leads || data.data || []).filter((p: any) => p.email);
      setProspectsDispo(comEmail);
      setProspectsSelec(new Set());
    } catch (err) {
      console.error('Erro ao carregar prospects:', err);
    } finally {
      setLoadingImportar(false);
    }
  };

  const executarImportacao = async () => {
    if (prospectsSelec.size === 0) return;
    setLoadingImportar(true);
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'importar_prospects',
          prospect_ids: Array.from(prospectsSelec),
          criado_por: currentUser.nome_usuario,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setResultadoImport(data.resultados);
        carregarEmpresas();
        carregarLeads();
        carregarStats();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setLoadingImportar(false);
    }
  };

  // ════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════
  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fa-solid fa-building text-indigo-600"></i>
            CRM — Empresas & Leads
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestão do funil de prospecção e campanhas de email</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={abrirImportacao}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-download"></i> Importar Prospects
          </button>
          <button
            onClick={() => { setFormEmpresa({}); setModalEmpresa('criar'); }}
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-plus"></i> Nova Empresa
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Empresas', valor: stats.total_empresas, icon: 'fa-solid fa-building', cor: 'text-indigo-600 bg-indigo-50' },
            { label: 'Leads', valor: stats.total_leads, icon: 'fa-solid fa-users', cor: 'text-gray-600 bg-gray-100' },
            { label: 'Prospects', valor: stats.total_prospects, icon: 'fa-solid fa-user-check', cor: 'text-blue-600 bg-blue-50' },
            { label: 'Clientes', valor: stats.total_clientes, icon: 'fa-solid fa-handshake', cor: 'text-green-600 bg-green-50' },
            { label: 'Opt-Out', valor: stats.total_optout, icon: 'fa-solid fa-ban', cor: 'text-red-600 bg-red-50' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.cor}`}>
                <i className={`${kpi.icon} text-lg`}></i>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800">{kpi.valor.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-gray-500">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Abas ── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b">
          {[
            { key: 'empresas' as const, label: 'Empresas', icon: 'fa-solid fa-building', count: totalEmpresas },
            { key: 'leads' as const, label: 'Leads', icon: 'fa-solid fa-users', count: totalLeads },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setAbaAtiva(tab.key); tab.key === 'empresas' ? setPaginaEmpresas(1) : setPaginaLeads(1); }}
              className={`flex-1 md:flex-none px-6 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                abaAtiva === tab.key
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ════════════════════════ ABA EMPRESAS ════════════════════════ */}
        {abaAtiva === 'empresas' && (
          <div className="p-4">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                value={buscaEmpresa}
                onChange={e => setBuscaEmpresa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && carregarEmpresas()}
                placeholder="Buscar por nome ou domínio..."
                className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <select value={filtroSetor} onChange={e => { setFiltroSetor(e.target.value); setPaginaEmpresas(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">Todos os setores</option>
                {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => { setPaginaEmpresas(1); carregarEmpresas(); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1.5">
                <i className="fa-solid fa-search"></i> Buscar
              </button>
            </div>

            {/* Tabela */}
            {loading ? (
              <div className="text-center py-12 text-gray-400"><i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando...</div>
            ) : empresas.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <i className="fa-solid fa-building text-4xl mb-3 block opacity-30"></i>
                <p>Nenhuma empresa encontrada</p>
                <p className="text-xs mt-1">Crie uma empresa ou importe do Prospect Engine</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                      <th className="px-2 py-2.5 w-8"></th>
                      <th className="px-3 py-2.5 text-left font-semibold">Empresa</th>
                      <th className="px-3 py-2.5 text-left font-semibold hidden md:table-cell">Domínio</th>
                      <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">Setor</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Leads</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Prospects</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Clientes</th>
                      <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">Local</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {empresas.map(emp => {
                      const expandida = empresasExpandidas.has(emp.id);
                      const leadsAptos = leadsAptosPorEmpresa[emp.id];
                      const carregandoLeads = loadingEmpresaId === emp.id;
                      return (
                        <React.Fragment key={emp.id}>
                          <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => abrirDetalheEmpresa(emp.id)}>
                            <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => alternarExpansaoEmpresa(emp.id)}
                                className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                                title={expandida ? 'Recolher leads aptos' : 'Expandir leads aptos a campanhas'}
                              >
                                <i className={`fa-solid ${expandida ? 'fa-chevron-down' : 'fa-chevron-right'} text-xs`}></i>
                              </button>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-800">{emp.nome}</td>
                            <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell">{emp.dominio || '—'}</td>
                            <td className="px-3 py-2.5 hidden lg:table-cell">
                              {emp.setor ? <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">{emp.setor}</span> : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center">{emp.total_leads}</td>
                            <td className="px-3 py-2.5 text-center">{emp.total_prospects}</td>
                            <td className="px-3 py-2.5 text-center">{emp.total_clientes}</td>
                            <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{emp.cidade ? `${emp.cidade}/${emp.uf}` : '—'}</td>
                            <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setFormEmpresa(emp); setModalEmpresa('editar'); }}
                                className="text-gray-400 hover:text-indigo-600 transition-colors p-1" title="Editar">
                                <i className="fa-solid fa-pen-to-square"></i>
                              </button>
                            </td>
                          </tr>

                          {/* (v1.1) Sub-linha: leads aptos + campanhas vinculadas */}
                          {expandida && (
                            <tr className="bg-indigo-50/20">
                              <td></td>
                              <td colSpan={8} className="px-3 py-3">
                                {carregandoLeads ? (
                                  <div className="text-xs text-gray-400 py-2 flex items-center gap-2">
                                    <i className="fa-solid fa-spinner fa-spin"></i> Carregando leads aptos...
                                  </div>
                                ) : !leadsAptos || leadsAptos.length === 0 ? (
                                  <div className="text-xs text-gray-400 py-2 flex items-center gap-2">
                                    <i className="fa-solid fa-info-circle"></i>
                                    Nenhum lead apto a campanhas para esta empresa.
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] uppercase font-semibold text-indigo-600 tracking-wide mb-2 flex items-center gap-2">
                                      <i className="fa-solid fa-bullhorn"></i>
                                      Leads aptos a campanhas ({leadsAptos.length})
                                    </div>
                                    <table className="w-full text-xs bg-white rounded-lg border border-indigo-100 overflow-hidden">
                                      <thead className="bg-indigo-50/60 text-gray-600 text-[10px] uppercase">
                                        <tr>
                                          <th className="px-3 py-1.5 text-left font-semibold">Nome</th>
                                          <th className="px-3 py-1.5 text-left font-semibold">Email</th>
                                          <th className="px-3 py-1.5 text-left font-semibold">Cargo</th>
                                          <th className="px-3 py-1.5 text-left font-semibold">Funil</th>
                                          <th className="px-3 py-1.5 text-left font-semibold">Campanhas</th>
                                          <th className="px-3 py-1.5 text-center font-semibold">Ações</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-indigo-50">
                                        {leadsAptos.map(l => {
                                          const funil = FUNIL_LABELS[l.funil_status] || FUNIL_LABELS.lead;
                                          return (
                                            <tr key={l.id} className="hover:bg-indigo-50/30">
                                              <td className="px-3 py-1.5 font-medium text-gray-800">
                                                {l.nome}
                                                {l.opt_out && <span className="ml-1 text-[10px] text-red-500"><i className="fa-solid fa-ban"></i></span>}
                                              </td>
                                              <td className="px-3 py-1.5 text-gray-500">{l.email}</td>
                                              <td className="px-3 py-1.5 text-gray-500">{l.cargo || '—'}</td>
                                              <td className="px-3 py-1.5">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${funil.cor}`}>
                                                  <i className={funil.icon}></i> {funil.label}
                                                </span>
                                              </td>
                                              <td className="px-3 py-1.5">
                                                {l.total_campanhas === 0 ? (
                                                  <span className="text-gray-300 italic">Sem campanha ainda</span>
                                                ) : (
                                                  <div className="flex flex-wrap gap-1">
                                                    {l.campanhas.map((c, i) => (
                                                      <span key={i}
                                                        className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-medium"
                                                        title={`Status: ${c.status} • Step ${c.step_atual}`}>
                                                        <i className="fa-solid fa-bullhorn mr-1"></i>
                                                        {c.email_campanhas?.nome || `Campanha #${c.campanha_id}`}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="px-3 py-1.5 text-center">
                                                <button onClick={() => abrirDetalheLead(l.id)}
                                                  className="text-gray-400 hover:text-indigo-600 transition-colors p-1" title="Ver detalhes do lead">
                                                  <i className="fa-solid fa-up-right-from-square"></i>
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {totalEmpresas > 20 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>{totalEmpresas} empresa{totalEmpresas !== 1 ? 's' : ''}</span>
                <div className="flex gap-1">
                  <button onClick={() => setPaginaEmpresas(p => Math.max(1, p - 1))} disabled={paginaEmpresas === 1}
                    className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30">Anterior</button>
                  <span className="px-3 py-1">Pág. {paginaEmpresas}</span>
                  <button onClick={() => setPaginaEmpresas(p => p + 1)} disabled={empresas.length < 20}
                    className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30">Próxima</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ ABA LEADS ════════════════════════ */}
        {abaAtiva === 'leads' && (
          <div className="p-4">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                value={buscaLead}
                onChange={e => setBuscaLead(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && carregarLeads()}
                placeholder="Buscar por nome, email ou cargo..."
                className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <select value={filtroFunil} onChange={e => { setFiltroFunil(e.target.value); setPaginaLeads(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">Todos os status</option>
                {Object.entries(FUNIL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button onClick={() => { setPaginaLeads(1); carregarLeads(); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1.5">
                <i className="fa-solid fa-search"></i> Buscar
              </button>
              <button onClick={() => { setFormLead({}); setModalLead('criar'); }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5">
                <i className="fa-solid fa-plus"></i> Novo Lead
              </button>
            </div>

            {/* Tabela */}
            {loading ? (
              <div className="text-center py-12 text-gray-400"><i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando...</div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <i className="fa-solid fa-users text-4xl mb-3 block opacity-30"></i>
                <p>Nenhum lead encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                      <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                      <th className="px-3 py-2.5 text-left font-semibold hidden md:table-cell">Email</th>
                      <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">Cargo</th>
                      <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">Empresa</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Funil</th>
                      <th className="px-3 py-2.5 text-center font-semibold hidden md:table-cell">Emails</th>
                      <th className="px-3 py-2.5 text-center font-semibold hidden md:table-cell">Abertos</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map(lead => {
                      const funil = FUNIL_LABELS[lead.funil_status] || FUNIL_LABELS.lead;
                      return (
                        <tr key={lead.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => abrirDetalheLead(lead.id)}>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-gray-800">{lead.nome}</div>
                            {lead.opt_out && <span className="text-xs text-red-500 flex items-center gap-0.5"><i className="fa-solid fa-ban"></i> Opt-out</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell text-xs">{lead.email}</td>
                          <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{lead.cargo || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{lead.email_empresas?.nome || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${funil.cor}`}>
                              <i className={funil.icon}></i> {funil.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">{lead.total_emails_recebidos}</td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">{lead.total_emails_abertos}</td>
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setFormLead(lead); setModalLead('editar'); }}
                              className="text-gray-400 hover:text-indigo-600 transition-colors p-1" title="Editar">
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {totalLeads > 30 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>{totalLeads} lead{totalLeads !== 1 ? 's' : ''}</span>
                <div className="flex gap-1">
                  <button onClick={() => setPaginaLeads(p => Math.max(1, p - 1))} disabled={paginaLeads === 1}
                    className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30">Anterior</button>
                  <span className="px-3 py-1">Pág. {paginaLeads}</span>
                  <button onClick={() => setPaginaLeads(p => p + 1)} disabled={leads.length < 30}
                    className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30">Próxima</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL: CRIAR/EDITAR EMPRESA                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {modalEmpresa && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">
                {modalEmpresa === 'criar' ? 'Nova Empresa' : 'Editar Empresa'}
              </h2>
              <button onClick={() => setModalEmpresa(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={formEmpresa.nome || ''} onChange={e => setFormEmpresa(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domínio</label>
                  <input value={formEmpresa.dominio || ''} onChange={e => setFormEmpresa(f => ({ ...f, dominio: e.target.value }))}
                    placeholder="empresa.com.br" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input value={formEmpresa.cnpj || ''} onChange={e => setFormEmpresa(f => ({ ...f, cnpj: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
                  <select value={formEmpresa.setor || ''} onChange={e => setFormEmpresa(f => ({ ...f, setor: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                    <option value="">Selecionar</option>
                    {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Porte</label>
                  <select value={formEmpresa.porte || ''} onChange={e => setFormEmpresa(f => ({ ...f, porte: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                    <option value="">Selecionar</option>
                    {PORTES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input value={formEmpresa.cidade || ''} onChange={e => setFormEmpresa(f => ({ ...f, cidade: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                  <input value={formEmpresa.uf || ''} onChange={e => setFormEmpresa(f => ({ ...f, uf: e.target.value }))}
                    maxLength={2} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input value={formEmpresa.website || ''} onChange={e => setFormEmpresa(f => ({ ...f, website: e.target.value }))}
                  placeholder="https://" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={formEmpresa.observacoes || ''} onChange={e => setFormEmpresa(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setModalEmpresa(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={salvarEmpresa} disabled={!formEmpresa.nome || loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL: CRIAR/EDITAR LEAD                                       */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {modalLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">
                {modalLead === 'criar' ? 'Novo Lead' : 'Editar Lead'}
              </h2>
              <button onClick={() => setModalLead(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={formLead.nome || ''} onChange={e => setFormLead(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={formLead.email || ''} onChange={e => setFormLead(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input value={formLead.cargo || ''} onChange={e => setFormLead(f => ({ ...f, cargo: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={formLead.telefone || ''} onChange={e => setFormLead(f => ({ ...f, telefone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select value={formLead.empresa_id || ''} onChange={e => setFormLead(f => ({ ...f, empresa_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                  <option value="">Sem empresa</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
                <input value={formLead.linkedin_url || ''} onChange={e => setFormLead(f => ({ ...f, linkedin_url: e.target.value }))}
                  placeholder="https://linkedin.com/in/..." className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={formLead.notas || ''} onChange={e => setFormLead(f => ({ ...f, notas: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setModalLead(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={salvarLead} disabled={!formLead.nome || !formLead.email || loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL: DETALHE DA EMPRESA                                      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {modalDetalhe === 'empresa' && empresaSelecionada && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{empresaSelecionada.empresa.nome}</h2>
                <p className="text-sm text-gray-500">{empresaSelecionada.empresa.dominio || 'Sem domínio'} — {empresaSelecionada.empresa.setor || 'Sem setor'}</p>
              </div>
              <button onClick={() => setModalDetalhe(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            {/* Info da empresa */}
            <div className="p-6 border-b">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {empresaSelecionada.empresa.cidade && <div><span className="text-gray-500">Local:</span> {empresaSelecionada.empresa.cidade}/{empresaSelecionada.empresa.uf}</div>}
                {empresaSelecionada.empresa.porte && <div><span className="text-gray-500">Porte:</span> {empresaSelecionada.empresa.porte}</div>}
                {empresaSelecionada.empresa.cnpj && <div><span className="text-gray-500">CNPJ:</span> {empresaSelecionada.empresa.cnpj}</div>}
                {empresaSelecionada.empresa.website && (
                  <div><span className="text-gray-500">Site:</span> <a href={empresaSelecionada.empresa.website} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{empresaSelecionada.empresa.website}</a></div>
                )}
              </div>
              {empresaSelecionada.empresa.observacoes && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-2 rounded">{empresaSelecionada.empresa.observacoes}</p>
              )}
            </div>

            {/* Leads da empresa */}
            <div className="p-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-users text-indigo-500"></i>
                Leads ({empresaSelecionada.total_leads})
              </h3>
              {(empresaSelecionada.leads || []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Nenhum lead nesta empresa</p>
              ) : (
                <div className="space-y-2">
                  {empresaSelecionada.leads.map((lead: any) => {
                    const funil = FUNIL_LABELS[lead.funil_status] || FUNIL_LABELS.lead;
                    return (
                      <div key={lead.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => abrirDetalheLead(lead.id)}>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{lead.nome}</p>
                          <p className="text-xs text-gray-500">{lead.cargo || '—'} — {lead.email}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${funil.cor}`}>
                          <i className={funil.icon}></i> {funil.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL: DETALHE DO LEAD (com timeline)                          */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {modalDetalhe === 'lead' && leadSelecionado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-800">{leadSelecionado.nome}</h2>
                <p className="text-sm text-gray-500">{leadSelecionado.cargo || '—'} — {leadSelecionado.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Badge funil */}
                {(() => {
                  const funil = FUNIL_LABELS[leadSelecionado.funil_status] || FUNIL_LABELS.lead;
                  return (
                    <button onClick={() => { setNovoFunil(''); setMotivoPerda(''); setModalFunil(true); }}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${funil.cor} hover:opacity-80 transition-opacity cursor-pointer`}
                      title="Clique para alterar o funil">
                      <i className={funil.icon}></i> {funil.label}
                      <i className="fa-solid fa-chevron-down text-[10px] ml-1"></i>
                    </button>
                  );
                })()}
                <button onClick={() => setModalDetalhe(null)} className="text-gray-400 hover:text-gray-600 text-2xl ml-3">&times;</button>
              </div>
            </div>

            {/* Dados do lead */}
            <div className="p-6 border-b">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Empresa:</span> {leadSelecionado.email_empresas?.nome || '—'}</div>
                <div><span className="text-gray-500">Setor:</span> {leadSelecionado.email_empresas?.setor || '—'}</div>
                <div><span className="text-gray-500">Telefone:</span> {leadSelecionado.telefone || '—'}</div>
                <div><span className="text-gray-500">Score:</span> {leadSelecionado.score_engajamento}/100</div>
                <div><span className="text-gray-500">Emails recebidos:</span> {leadSelecionado.total_emails_recebidos}</div>
                <div><span className="text-gray-500">Emails abertos:</span> {leadSelecionado.total_emails_abertos}</div>
                <div><span className="text-gray-500">Clicados:</span> {leadSelecionado.total_emails_clicados}</div>
                <div><span className="text-gray-500">Respostas:</span> {leadSelecionado.total_respostas}</div>
              </div>
              {leadSelecionado.linkedin_url && (
                <a href={leadSelecionado.linkedin_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-600 hover:underline">
                  <i className="fa-brands fa-linkedin"></i> Ver LinkedIn
                </a>
              )}
              {leadSelecionado.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {leadSelecionado.tags.map((tag: string) => (
                    <span key={tag} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">{tag}</span>
                  ))}
                </div>
              )}
              {leadSelecionado.notas && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-2 rounded">{leadSelecionado.notas}</p>
              )}
              {leadSelecionado.opt_out && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <i className="fa-solid fa-ban"></i> Este lead está na lista de opt-out e não receberá campanhas.
                </div>
              )}
            </div>

            {/* Campanhas do lead */}
            {leadCampanhas.length > 0 && (
              <div className="p-6 border-b">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-bullhorn text-indigo-500"></i> Campanhas ({leadCampanhas.length})
                </h3>
                <div className="space-y-2">
                  {leadCampanhas.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <span className="font-medium">{c.email_campanhas?.nome || 'Campanha'}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Step {c.step_atual}</span>
                        <span className={`px-2 py-0.5 rounded ${c.status === 'ativa' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Respostas do lead */}
            {leadRespostas.length > 0 && (
              <div className="p-6 border-b">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-reply text-teal-500"></i> Respostas ({leadRespostas.length})
                </h3>
                <div className="space-y-2">
                  {leadRespostas.map((r: any) => (
                    <div key={r.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{r.assunto || '(sem assunto)'}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(r.recebido_em)}</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-3">{r.corpo_texto || '—'}</p>
                      {r.classificacao !== 'pendente' && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{r.classificacao}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="p-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-amber-500"></i> Timeline
              </h3>
              {leadTimeline.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Nenhum evento registrado</p>
              ) : (
                <div className="relative">
                  {/* Linha vertical */}
                  <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200"></div>

                  <div className="space-y-3">
                    {leadTimeline.map(item => (
                      <div key={item.id} className="flex items-start gap-3 pl-1">
                        <div className="relative z-10 w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
                          <i className={`text-xs ${HISTORICO_ICONS[item.tipo] || 'fa-solid fa-circle text-gray-400'}`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">{item.descricao || item.tipo}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <span>{formatDateTime(item.criado_em)}</span>
                            {item.criado_por && <span>— {item.criado_por}</span>}
                            {item.email_campanhas?.nome && <span className="text-indigo-500">({item.email_campanhas.nome})</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL: MUDAR FUNIL                                             */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {modalFunil && leadSelecionado && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Alterar Funil</h2>
              <p className="text-sm text-gray-500">{leadSelecionado.nome}</p>
            </div>
            <div className="p-6 space-y-3">
              {Object.entries(FUNIL_LABELS).map(([key, val]) => (
                <button key={key}
                  onClick={() => setNovoFunil(key)}
                  disabled={key === leadSelecionado.funil_status}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    novoFunil === key ? 'bg-indigo-50 border-2 border-indigo-500' :
                    key === leadSelecionado.funil_status ? 'bg-gray-100 opacity-50 cursor-not-allowed' :
                    'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}>
                  <i className={`${val.icon} w-5`}></i>
                  <span className="font-medium">{val.label}</span>
                  {key === leadSelecionado.funil_status && <span className="text-xs text-gray-400 ml-auto">(atual)</span>}
                </button>
              ))}
              {novoFunil === 'perdido' && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da perda</label>
                  <input value={motivoPerda} onChange={e => setMotivoPerda(e.target.value)}
                    placeholder="Ex: Não tem interesse, concorrente, etc."
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setModalFunil(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={mudarFunil} disabled={!novoFunil || loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {loading ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL: IMPORTAR DO PROSPECT ENGINE                             */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {modalImportar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Importar do Prospect Engine</h2>
                <p className="text-sm text-gray-500">Selecione os prospects com email para importar como leads</p>
              </div>
              <button onClick={() => setModalImportar(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            {resultadoImport ? (
              /* Resultado da importação */
              <div className="p-6 text-center">
                <i className="fa-solid fa-circle-check text-4xl text-green-500 mb-3"></i>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Importação Concluída</h3>
                <div className="grid grid-cols-2 gap-3 text-sm max-w-xs mx-auto">
                  <div className="bg-green-50 p-3 rounded-lg"><span className="text-2xl font-bold text-green-700">{resultadoImport.importados}</span><p className="text-green-600">Importados</p></div>
                  <div className="bg-yellow-50 p-3 rounded-lg"><span className="text-2xl font-bold text-yellow-700">{resultadoImport.duplicados}</span><p className="text-yellow-600">Duplicados</p></div>
                  <div className="bg-gray-50 p-3 rounded-lg"><span className="text-2xl font-bold text-gray-700">{resultadoImport.sem_email}</span><p className="text-gray-600">Sem email</p></div>
                  <div className="bg-indigo-50 p-3 rounded-lg"><span className="text-2xl font-bold text-indigo-700">{resultadoImport.empresas_criadas}</span><p className="text-indigo-600">Empresas criadas</p></div>
                </div>
                <button onClick={() => setModalImportar(false)} className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Fechar</button>
              </div>
            ) : (
              /* Lista de prospects para selecionar */
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingImportar ? (
                    <div className="text-center py-12 text-gray-400"><i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando prospects...</div>
                  ) : prospectsDispo.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p>Nenhum prospect com email disponível para importação</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox"
                            checked={prospectsSelec.size === prospectsDispo.length}
                            onChange={() => {
                              if (prospectsSelec.size === prospectsDispo.length) {
                                setProspectsSelec(new Set());
                              } else {
                                setProspectsSelec(new Set(prospectsDispo.map((p: any) => p.id)));
                              }
                            }}
                            className="rounded" />
                          Selecionar todos ({prospectsDispo.length})
                        </label>
                        <span className="text-sm text-indigo-600 font-medium">{prospectsSelec.size} selecionados</span>
                      </div>
                      <div className="space-y-1">
                        {prospectsDispo.map((p: any) => (
                          <label key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer text-sm">
                            <input type="checkbox"
                              checked={prospectsSelec.has(p.id)}
                              onChange={() => {
                                const next = new Set(prospectsSelec);
                                next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                                setProspectsSelec(next);
                              }}
                              className="rounded" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 truncate">{p.nome_completo}</p>
                              <p className="text-xs text-gray-500 truncate">{p.cargo || '—'} — {p.empresa_nome || '—'} — {p.email}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
                  <button onClick={() => setModalImportar(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                  <button onClick={executarImportacao} disabled={prospectsSelec.size === 0 || loadingImportar}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                    <i className="fa-solid fa-download"></i>
                    {loadingImportar ? 'Importando...' : `Importar ${prospectsSelec.size} prospect${prospectsSelec.size !== 1 ? 's' : ''}`}
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

export default EmpresasLeadsCRM;
