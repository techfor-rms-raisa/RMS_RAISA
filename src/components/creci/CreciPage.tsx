/**
 * CreciPage.tsx — Módulo CRECI v1.0
 * 
 * Gerenciamento de corretores CRECI extraídos via Chrome Extension.
 * 3 abas: Lista CRECI | Meus Leads Salvos | Dashboard
 * 
 * Caminho: src/components/creci/CreciPage.tsx
 * Data: 09/05/2026
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface CorretorCreci {
  id: number;
  nome: string;
  creci: string | null;
  situacao: string | null;
  email_creci: string | null;
  email_pessoal: string | null;
  celular: string | null;
  cidade: string | null;
  uf: string | null;
  tipo: string | null;
  fonte: string | null;
  capturado_em: string | null;
  atualizado_em: string | null;
  analista: string | null;
  dados_extraido: string | null;
  data_contato: string | null;
  interesse: string | null;
  data_envio_adv: string | null;
  negocio_fechado: string | null;
}

interface DashboardStats {
  total: number;
  sem_email: number;
  com_email: number;
  sem_celular: number;
  com_celular: number;
  sem_nenhum_contato: number;
  por_analista: { analista: string; total: number; com_email: number; com_celular: number; contatados: number; interessados: number; negocios: number }[];
  por_cidade: { cidade: string; total: number }[];
  por_mes: { mes: string; total: number }[];
}

interface CreciPageProps {
  currentUser?: { id: number; nome_usuario: string; tipo_usuario: string };
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

type TabType = 'lista' | 'leads' | 'dashboard';
type StatusFilter = 'todos' | 'novos' | 'extraidos';
type ContatoFilter = 'todos' | 'com_email' | 'sem_email' | 'com_telefone' | 'sem_telefone';
type NegocioFilter = 'todos' | 'sim' | 'nao';

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
const CreciPage: React.FC<CreciPageProps> = ({ currentUser }) => {
  // ── Estado global ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>('lista');
  const [loading, setLoading] = useState(false);
  const [corretores, setCorretores] = useState<CorretorCreci[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [contatoFilter, setContatoFilter] = useState<ContatoFilter>('todos');
  const [negocioFilter, setNegocioFilter] = useState<NegocioFilter>('todos');
  const [analistaFilter, setAnalistaFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashPeriodo, setDashPeriodo] = useState<'hoje' | 'mes' | 'ano' | 'total'>('total');

  // ── Lista de analistas para o filtro ─────────────────────────────────────────
  const [analistas, setAnalistas] = useState<string[]>([]);

  // ── Exportando ──────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // CARREGAR ANALISTAS DISTINTOS
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('corretores_creci')
        .select('analista')
        .not('analista', 'is', null)
        .order('analista');
      if (data) {
        const unique = [...new Set(data.map(d => d.analista).filter(Boolean))] as string[];
        setAnalistas(unique);
      }
    })();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY BUILDER — constrói a query base com todos os filtros
  // ═══════════════════════════════════════════════════════════════════════════
  const buildQuery = useCallback((selectFields: string, forCount = false) => {
    let query = supabase.from('corretores_creci').select(selectFields, forCount ? { count: 'exact', head: true } : undefined);

    // Tab "Meus Leads" → filtrar pelo analista logado
    if (activeTab === 'leads' && currentUser) {
      query = query.eq('analista', currentUser.nome_usuario);
    }

    // Status
    if (statusFilter === 'novos') {
      query = query.is('dados_extraido', null);
    } else if (statusFilter === 'extraidos') {
      query = query.not('dados_extraido', 'is', null);
    }

    // Contato
    if (contatoFilter === 'com_email') {
      query = query.not('email_creci', 'is', null);
    } else if (contatoFilter === 'sem_email') {
      query = query.is('email_creci', null);
    } else if (contatoFilter === 'com_telefone') {
      query = query.not('celular', 'is', null);
    } else if (contatoFilter === 'sem_telefone') {
      query = query.is('celular', null);
    }

    // Negócio fechado
    if (negocioFilter === 'sim') {
      query = query.not('negocio_fechado', 'is', null);
    } else if (negocioFilter === 'nao') {
      query = query.is('negocio_fechado', null);
    }

    // Analista (filtro dropdown)
    if (analistaFilter) {
      query = query.eq('analista', analistaFilter);
    }

    // Busca por texto (nome ou creci)
    if (searchText.trim()) {
      query = query.or(`nome.ilike.%${searchText.trim()}%,creci.ilike.%${searchText.trim()}%`);
    }

    // Datas (capturado_em)
    if (dateFrom) {
      query = query.gte('capturado_em', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('capturado_em', `${dateTo}T23:59:59`);
    }

    return query;
  }, [activeTab, statusFilter, contatoFilter, negocioFilter, analistaFilter, searchText, dateFrom, dateTo, currentUser]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CARREGAR DADOS
  // ═══════════════════════════════════════════════════════════════════════════
  const loadData = useCallback(async () => {
    if (activeTab === 'dashboard') return;
    setLoading(true);

    try {
      // Count total
      const countQuery = buildQuery('id', true);
      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Fetch page
      const dataQuery = buildQuery('*')
        .order('id', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error } = await dataQuery;
      if (error) throw error;
      setCorretores(data || []);
      setLastUpdated(new Date().toLocaleString('pt-BR'));
    } catch (err) {
      console.error('[CreciPage] Erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page, activeTab]);

  // Recarregar quando filtros ou página mudam
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      loadData();
    }
  }, [loadData, activeTab]);

  // Reset page quando filtros mudam
  useEffect(() => {
    setPage(0);
  }, [statusFilter, contatoFilter, negocioFilter, analistaFilter, searchText, dateFrom, dateTo, activeTab]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CARREGAR DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      // Buscar todos os registros (paginado)
      let allData: CorretorCreci[] = [];
      let from = 0;
      const BATCH = 1000;

      while (true) {
        let query = supabase
          .from('corretores_creci')
          .select('*')
          .order('id', { ascending: false })
          .range(from, from + BATCH - 1);

        // Filtro de período
        const now = new Date();
        if (dashPeriodo === 'hoje') {
          const today = now.toISOString().split('T')[0];
          query = query.gte('capturado_em', `${today}T00:00:00`);
        } else if (dashPeriodo === 'mes') {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          query = query.gte('capturado_em', `${firstDay}T00:00:00`);
        } else if (dashPeriodo === 'ano') {
          const firstDayYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
          query = query.gte('capturado_em', `${firstDayYear}T00:00:00`);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < BATCH) break;
        from += BATCH;
      }

      // Calcular estatísticas
      const total = allData.length;
      const sem_email = allData.filter(d => !d.email_creci).length;
      const com_email = allData.filter(d => d.email_creci).length;
      const sem_celular = allData.filter(d => !d.celular).length;
      const com_celular = allData.filter(d => d.celular).length;
      const sem_nenhum_contato = allData.filter(d => !d.email_creci && !d.celular && !d.email_pessoal).length;

      // Por analista
      const analistaMap = new Map<string, { total: number; com_email: number; com_celular: number; contatados: number; interessados: number; negocios: number }>();
      allData.forEach(d => {
        const an = d.analista || 'Não atribuído';
        const cur = analistaMap.get(an) || { total: 0, com_email: 0, com_celular: 0, contatados: 0, interessados: 0, negocios: 0 };
        cur.total++;
        if (d.email_creci) cur.com_email++;
        if (d.celular) cur.com_celular++;
        if (d.data_contato) cur.contatados++;
        if (d.interesse === 'yes') cur.interessados++;
        if (d.negocio_fechado) cur.negocios++;
        analistaMap.set(an, cur);
      });
      const por_analista = Array.from(analistaMap.entries())
        .map(([analista, stats]) => ({ analista, ...stats }))
        .sort((a, b) => b.total - a.total);

      // Por cidade (top 10)
      const cidadeMap = new Map<string, number>();
      allData.forEach(d => {
        const c = d.cidade || 'Não informada';
        cidadeMap.set(c, (cidadeMap.get(c) || 0) + 1);
      });
      const por_cidade = Array.from(cidadeMap.entries())
        .map(([cidade, total]) => ({ cidade, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // Por mês
      const mesMap = new Map<string, number>();
      allData.forEach(d => {
        if (d.capturado_em) {
          const date = new Date(d.capturado_em);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          mesMap.set(key, (mesMap.get(key) || 0) + 1);
        }
      });
      const por_mes = Array.from(mesMap.entries())
        .map(([mes, total]) => ({ mes, total }))
        .sort((a, b) => a.mes.localeCompare(b.mes));

      setDashStats({ total, sem_email, com_email, sem_celular, com_celular, sem_nenhum_contato, por_analista, por_cidade, por_mes });
    } catch (err) {
      console.error('[CreciPage] Erro no dashboard:', err);
    } finally {
      setDashLoading(false);
    }
  }, [dashPeriodo]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboard();
    }
  }, [activeTab, loadDashboard]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTAR XLSX
  // ═══════════════════════════════════════════════════════════════════════════
  const handleExport = async () => {
    setExporting(true);
    try {
      // Buscar TODOS os registros com os filtros atuais (sem paginação)
      let allData: CorretorCreci[] = [];
      let from = 0;
      const BATCH = 1000;

      while (true) {
        const query = buildQuery('*')
          .order('id', { ascending: false })
          .range(from, from + BATCH - 1);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < BATCH) break;
        from += BATCH;
      }

      if (allData.length === 0) {
        alert('Nenhum registro para exportar.');
        return;
      }

      // Preparar dados para XLSX
      const rows = allData.map(d => ({
        'Nome': d.nome || '',
        'CRECI': d.creci || '',
        'Situação': d.situacao || '',
        'Email CRECI': d.email_creci || '',
        'Email Pessoal': d.email_pessoal || '',
        'Celular': d.celular || '',
        'Cidade': d.cidade || '',
        'UF': d.uf || '',
        'Tipo': d.tipo || '',
        'Analista': d.analista || '',
        'Capturado Em': d.capturado_em ? new Date(d.capturado_em).toLocaleDateString('pt-BR') : '',
        'Data Contato': d.data_contato ? new Date(d.data_contato).toLocaleDateString('pt-BR') : '',
        'Interesse': d.interesse === 'yes' ? 'Sim' : d.interesse === 'not' ? 'Não' : '',
        'Envio ADV': d.data_envio_adv ? new Date(d.data_envio_adv).toLocaleDateString('pt-BR') : '',
        'Negócio Fechado': d.negocio_fechado || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      // Ajustar largura das colunas
      ws['!cols'] = [
        { wch: 35 }, // Nome
        { wch: 14 }, // CRECI
        { wch: 10 }, // Situação
        { wch: 30 }, // Email CRECI
        { wch: 30 }, // Email Pessoal
        { wch: 18 }, // Celular
        { wch: 20 }, // Cidade
        { wch: 5 },  // UF
        { wch: 5 },  // Tipo
        { wch: 15 }, // Analista
        { wch: 14 }, // Capturado Em
        { wch: 14 }, // Data Contato
        { wch: 10 }, // Interesse
        { wch: 14 }, // Envio ADV
        { wch: 16 }, // Negócio Fechado
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Corretores CRECI');
      const fileName = `CRECI_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      // Marcar dados_extraido nos registros exportados
      const ids = allData.map(d => d.id);
      const agora = new Date().toISOString();

      // Atualizar em batches de 200
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        await supabase
          .from('corretores_creci')
          .update({ dados_extraido: agora })
          .in('id', batch);
      }

      // Recarregar dados
      loadData();
    } catch (err) {
      console.error('[CreciPage] Erro ao exportar:', err);
      alert('Erro ao exportar: ' + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE INLINE — contato, interesse, envio ADV, negócio fechado
  // ═══════════════════════════════════════════════════════════════════════════
  const updateField = async (id: number, field: string, value: string | null) => {
    try {
      const updateData: Record<string, string | null> = { [field]: value, atualizado_em: new Date().toISOString() };
      const { error } = await supabase
        .from('corretores_creci')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;

      // Atualizar estado local
      setCorretores(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    } catch (err) {
      console.error('[CreciPage] Erro ao atualizar:', err);
    }
  };

  const marcarContato = (id: number) => {
    updateField(id, 'data_contato', new Date().toISOString());
  };

  const toggleInteresse = (id: number, atual: string | null) => {
    const novo = atual === 'yes' ? 'not' : 'yes';
    updateField(id, 'interesse', novo);
  };

  const marcarEnvioADV = (id: number) => {
    updateField(id, 'data_envio_adv', new Date().toISOString());
  };

  const toggleNegocio = (id: number, atual: string | null) => {
    const novo = atual ? null : new Date().toISOString();
    updateField(id, 'negocio_fechado', novo);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGINAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-4 md:p-6">
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">🏠</span>
          <h1 className="text-2xl font-bold text-gray-800">CRECI — Corretores de Imóveis</h1>
        </div>
        <p className="text-sm text-gray-500 ml-12">
          Gestão de corretores extraídos do portal CRECISP via Chrome Extension
        </p>
        {lastUpdated && (
          <p className="text-xs text-gray-400 ml-12 mt-1">
            Atualizado em {lastUpdated}
            <button onClick={loadData} className="ml-2 text-blue-500 hover:text-blue-700" title="Atualizar">
              🔄
            </button>
          </p>
        )}
      </div>

      {/* TABS */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <TabButton
          active={activeTab === 'lista'}
          onClick={() => setActiveTab('lista')}
          icon="📋"
          label="Lista CRECI"
        />
        <TabButton
          active={activeTab === 'leads'}
          onClick={() => setActiveTab('leads')}
          icon="👤"
          label="Meus Leads Salvos"
        />
        <TabButton
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          icon="📊"
          label="Dashboard"
        />
      </div>

      {/* CONTEÚDO DAS TABS */}
      {activeTab === 'dashboard' ? (
        <DashboardTab
          stats={dashStats}
          loading={dashLoading}
          periodo={dashPeriodo}
          setPeriodo={setDashPeriodo}
        />
      ) : (
        <>
          {/* FILTROS */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Busca */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
                <input
                  type="text"
                  placeholder="Nome ou CRECI..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>

              {/* Status */}
              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="novos">Novos</option>
                  <option value="extraidos">Extraídos</option>
                </select>
              </div>

              {/* Contato */}
              <div className="min-w-[160px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Contato</label>
                <select
                  value={contatoFilter}
                  onChange={e => setContatoFilter(e.target.value as ContatoFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="com_email">Com e-mail</option>
                  <option value="sem_email">Sem e-mail</option>
                  <option value="com_telefone">Com telefone</option>
                  <option value="sem_telefone">Sem telefone</option>
                </select>
              </div>

              {/* Analista — oculto na aba Meus Leads */}
              {activeTab === 'lista' && (
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Analista</label>
                  <select
                    value={analistaFilter}
                    onChange={e => setAnalistaFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                  >
                    <option value="">Todos</option>
                    {analistas.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Negócio Fechado */}
              <div className="min-w-[150px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Negócio Fechado</label>
                <select
                  value={negocioFilter}
                  onChange={e => setNegocioFilter(e.target.value as NegocioFilter)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>

              {/* Data De */}
              <div className="min-w-[130px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">De</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>

              {/* Data Até */}
              <div className="min-w-[130px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Até</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>

              {/* Botões */}
              <div className="flex gap-2">
                <button
                  onClick={loadData}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-800 transition flex items-center gap-2"
                >
                  🔍 Filtrar
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting || totalCount === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? (
                    <><span className="animate-spin">⏳</span> Exportando...</>
                  ) : (
                    <>📥 Exportar XLSX</>
                  )}
                </button>
              </div>
            </div>

            {/* Info de resultados */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                {totalCount.toLocaleString('pt-BR')} corretor{totalCount !== 1 ? 'es' : ''} encontrado{totalCount !== 1 ? 's' : ''}
                {activeTab === 'leads' && currentUser && (
                  <span className="ml-2 text-red-600 font-medium">— filtrado por {currentUser.nome_usuario}</span>
                )}
              </span>
              <button
                onClick={() => {
                  setStatusFilter('todos');
                  setContatoFilter('todos');
                  setNegocioFilter('todos');
                  setAnalistaFilter('');
                  setSearchText('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-xs text-gray-400 hover:text-gray-600 transition"
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {/* TABELA */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">NOME</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">CRECI</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">EMAIL</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">CELULAR</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">CIDADE</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">UF</th>
                    {activeTab === 'lista' && (
                      <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">ANALISTA</th>
                    )}
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">CONTATADO</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">INTERESSE</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">ENVIO ADV</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">NEGÓCIO</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">DATA</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={12} className="text-center py-12 text-gray-400">
                        <span className="animate-spin inline-block mr-2">⏳</span>
                        Carregando...
                      </td>
                    </tr>
                  ) : corretores.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-12 text-gray-400">
                        Nenhum corretor encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    corretores.map(c => (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        {/* Nome */}
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-gray-800 max-w-[220px] truncate" title={c.nome}>
                            {c.nome}
                          </div>
                        </td>

                        {/* CRECI */}
                        <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">
                          {c.creci || '—'}
                        </td>

                        {/* Email */}
                        <td className="px-3 py-2.5">
                          {c.email_creci ? (
                            <a href={`mailto:${c.email_creci}`} className="text-blue-600 hover:underline text-xs max-w-[200px] truncate block" title={c.email_creci}>
                              {c.email_creci}
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">sem email</span>
                          )}
                        </td>

                        {/* Celular */}
                        <td className="px-3 py-2.5">
                          {c.celular ? (
                            <a href={`tel:${c.celular}`} className="text-green-600 hover:underline text-xs whitespace-nowrap">
                              {c.celular}
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">sem tel</span>
                          )}
                        </td>

                        {/* Cidade */}
                        <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[120px] truncate">
                          {c.cidade || '—'}
                        </td>

                        {/* UF */}
                        <td className="px-3 py-2.5 text-center text-gray-600 text-xs">
                          {c.uf || '—'}
                        </td>

                        {/* Analista (só na aba Lista) */}
                        {activeTab === 'lista' && (
                          <td className="px-3 py-2.5 text-gray-600 text-xs">
                            {c.analista || '—'}
                          </td>
                        )}

                        {/* Contatado */}
                        <td className="px-3 py-2.5 text-center">
                          {c.data_contato ? (
                            <span className="text-xs text-green-600 font-medium" title={new Date(c.data_contato).toLocaleString('pt-BR')}>
                              ✅ {new Date(c.data_contato).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <button
                              onClick={() => marcarContato(c.id)}
                              className="text-xs text-gray-400 hover:text-blue-600 transition px-2 py-1 rounded hover:bg-blue-50"
                              title="Marcar como contatado"
                            >
                              📞 Contatar
                            </button>
                          )}
                        </td>

                        {/* Interesse */}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggleInteresse(c.id, c.interesse)}
                            className={`text-xs font-medium px-2 py-1 rounded transition ${
                              c.interesse === 'yes'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : c.interesse === 'not'
                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            }`}
                          >
                            {c.interesse === 'yes' ? '👍 Sim' : c.interesse === 'not' ? '👎 Não' : '—'}
                          </button>
                        </td>

                        {/* Envio ADV */}
                        <td className="px-3 py-2.5 text-center">
                          {c.data_envio_adv ? (
                            <span className="text-xs text-purple-600 font-medium" title={new Date(c.data_envio_adv).toLocaleString('pt-BR')}>
                              📩 {new Date(c.data_envio_adv).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <button
                              onClick={() => marcarEnvioADV(c.id)}
                              className="text-xs text-gray-400 hover:text-purple-600 transition px-2 py-1 rounded hover:bg-purple-50"
                              title="Marcar envio ADV"
                            >
                              📩 Enviar
                            </button>
                          )}
                        </td>

                        {/* Negócio Fechado */}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggleNegocio(c.id, c.negocio_fechado)}
                            className={`text-xs font-medium px-2 py-1 rounded transition ${
                              c.negocio_fechado
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            }`}
                          >
                            {c.negocio_fechado ? '🤝 Fechado' : '—'}
                          </button>
                        </td>

                        {/* Data Captura */}
                        <td className="px-3 py-2.5 text-center text-gray-400 text-xs whitespace-nowrap">
                          {c.capturado_em ? new Date(c.capturado_em).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINAÇÃO */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-500">
                  Página {page + 1} de {totalPages} ({totalCount.toLocaleString('pt-BR')} registros)
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(0)}
                    disabled={page === 0}
                    className="px-2 py-1 rounded text-xs border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ⏮
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 rounded text-xs border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ◀ Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 rounded text-xs border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Próximo ▶
                  </button>
                  <button
                    onClick={() => setPage(totalPages - 1)}
                    disabled={page >= totalPages - 1}
                    className="px-2 py-1 rounded text-xs border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ⏭
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Tab Button ────────────────────────────────────────────────────────────────
const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({
  active, onClick, icon, label
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
      active
        ? 'border-red-700 text-red-700 bg-red-50/50'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`}
  >
    <span>{icon}</span>
    {label}
  </button>
);

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
const DashboardTab: React.FC<{
  stats: DashboardStats | null;
  loading: boolean;
  periodo: 'hoje' | 'mes' | 'ano' | 'total';
  setPeriodo: (p: 'hoje' | 'mes' | 'ano' | 'total') => void;
}> = ({ stats, loading, periodo, setPeriodo }) => {
  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">
        <span className="animate-spin inline-block text-2xl mb-2">⏳</span>
        <p>Carregando dashboard...</p>
      </div>
    );
  }

  if (!stats) return null;

  const periodos: { key: typeof periodo; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: 'mes', label: 'Este Mês' },
    { key: 'ano', label: 'Este Ano' },
    { key: 'total', label: 'Total Geral' },
  ];

  return (
    <div className="space-y-6">
      {/* Seletor de período */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
          📊 Dashboard CRECI
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {periodos.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                periodo === p.key
                  ? 'bg-white text-red-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon="👥" label="Total" value={stats.total} color="blue" />
        <KpiCard icon="📧" label="Com Email" value={stats.com_email} color="green" />
        <KpiCard icon="🚫" label="Sem Email" value={stats.sem_email} color="red" />
        <KpiCard icon="📞" label="Com Celular" value={stats.com_celular} color="teal" />
        <KpiCard icon="📵" label="Sem Celular" value={stats.sem_celular} color="orange" />
        <KpiCard icon="⚠️" label="Sem Contato" value={stats.sem_nenhum_contato} color="gray" />
      </div>

      {/* Gráficos: Por Analista + Por Cidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Desempenho por Analista */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            👤 Desempenho por Analista
          </h3>
          {stats.por_analista.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum dado disponível.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-500">ANALISTA</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500">TOTAL</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500">EMAIL</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500">CELULAR</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500">CONTATOS</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500">INTERESSE</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500">NEGÓCIOS</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.por_analista.map(a => (
                    <tr key={a.analista} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-700">{a.analista}</td>
                      <td className="py-2 px-2 text-center font-bold text-gray-800">{a.total}</td>
                      <td className="py-2 px-2 text-center text-blue-600">{a.com_email}</td>
                      <td className="py-2 px-2 text-center text-green-600">{a.com_celular}</td>
                      <td className="py-2 px-2 text-center text-purple-600">{a.contatados}</td>
                      <td className="py-2 px-2 text-center text-amber-600">{a.interessados}</td>
                      <td className="py-2 px-2 text-center">
                        {a.negocios > 0 ? (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{a.negocios}</span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top 10 Cidades */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            📍 Top 10 Cidades
          </h3>
          {stats.por_cidade.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-2">
              {stats.por_cidade.map((c, i) => {
                const maxVal = stats.por_cidade[0]?.total || 1;
                const pct = Math.round((c.total / maxVal) * 100);
                return (
                  <div key={c.cidade} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                    <span className="text-xs text-gray-700 w-32 truncate" title={c.cidade}>{c.cidade}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-red-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-600 w-10 text-right">{c.total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Evolução mensal */}
      {stats.por_mes.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            📈 Capturas por Mês
          </h3>
          <div className="flex items-end gap-1 h-32">
            {stats.por_mes.map(m => {
              const maxVal = Math.max(...stats.por_mes.map(x => x.total), 1);
              const heightPct = Math.max(5, Math.round((m.total / maxVal) * 100));
              const [ano, mes] = m.mes.split('-');
              const label = `${mes}/${ano.slice(2)}`;
              return (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-gray-600">{m.total}</span>
                  <div
                    className="w-full bg-red-500 rounded-t-sm transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] text-gray-400">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ icon: string; label: string; value: number; color: string }> = ({
  icon, label, value, color
}) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    teal: 'bg-teal-50 border-teal-200 text-teal-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || colorMap.gray}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString('pt-BR')}</div>
    </div>
  );
};

export default CreciPage;
