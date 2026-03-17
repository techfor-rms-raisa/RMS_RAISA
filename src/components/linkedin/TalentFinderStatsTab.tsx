/**
 * src/components/linkedin/TalentFinderStatsTab.tsx
 *
 * Dashboard de Estatísticas do Talent Finder
 * Lê os logs da tabela talent_finder_logs e exibe:
 * - KPIs: buscas, queries abertas, leads capturados, taxa de abertura
 * - Top tecnologias mais buscadas
 * - Top localizações
 * - Top senioridades
 * - Tabela de desempenho por usuário
 * - Histórico das últimas buscas
 *
 * Versão: 1.0
 * Data: 17/03/2026
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface LogEntry {
    id:               number;
    usuario_id:       number;
    nome_usuario:     string;
    requisitos:       string;
    total_queries:    number;
    queries_abertas:  number;
    queries_copiadas: number;
    leads_capturados: number;
    tecnologias:      string[] | null;
    localizacao:      string | null;
    senioridade:      string | null;
    criado_em:        string;
    ultima_acao_em:   string;
}

interface StatsData {
    logs:        LogEntry[];
    gerado_em:   string;
}

type Periodo = 'hoje' | 'semana' | 'mes' | 'total';

const PERIODO_LABELS: Record<Periodo, string> = {
    hoje:   'Hoje',
    semana: 'Esta Semana',
    mes:    'Este Mês',
    total:  'Total Geral',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function filtrarPorPeriodo(logs: LogEntry[], periodo: Periodo): LogEntry[] {
    const agora  = new Date();
    const hoje   = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const semana = new Date(hoje); semana.setDate(hoje.getDate() - 7);
    const mes    = new Date(agora.getFullYear(), agora.getMonth(), 1);

    return logs.filter(l => {
        const d = new Date(l.criado_em);
        if (periodo === 'hoje')   return d >= hoje;
        if (periodo === 'semana') return d >= semana;
        if (periodo === 'mes')    return d >= mes;
        return true;
    });
}

function contarOcorrencias(items: (string | null)[]): { label: string; count: number }[] {
    const map: Record<string, number> = {};
    items.forEach(item => {
        if (!item) return;
        map[item] = (map[item] || 0) + 1;
    });
    return Object.entries(map)
        .sort(([, a], [, b]) => b - a)
        .map(([label, count]) => ({ label, count }));
}

function contarTecnologias(logs: LogEntry[]): { label: string; count: number }[] {
    const map: Record<string, number> = {};
    logs.forEach(l => {
        (l.tecnologias || []).forEach(t => {
            map[t] = (map[t] || 0) + 1;
        });
    });
    return Object.entries(map)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([label, count]) => ({ label, count }));
}

const CORES_BARRA = [
    'bg-indigo-500', 'bg-blue-500', 'bg-purple-500', 'bg-teal-500',
    'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-red-500',
];

// ── Sub-componente: KPI Card ──────────────────────────────────────────────────

const KpiCard: React.FC<{
    icon: string; label: string; value: number | string;
    sub?: string; color?: string;
}> = ({ icon, label, value, sub, color = 'text-indigo-600' }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start gap-3">
            <span className={`text-2xl ${color}`}>{icon}</span>
            <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    </div>
);

// ── Sub-componente: Barra horizontal ─────────────────────────────────────────

const BarraH: React.FC<{ label: string; count: number; max: number; idx: number }> = (
    { label, count, max, idx }
) => {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0;
    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${CORES_BARRA[idx % CORES_BARRA.length]}`}/>
                <span className="text-xs text-gray-700 truncate" title={label}>{label}</span>
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all duration-500 ${CORES_BARRA[idx % CORES_BARRA.length]}`}
                    style={{ width: `${pct}%` }}/>
            </div>
            <span className="text-xs font-semibold text-gray-600 w-6 text-right">{count}</span>
        </div>
    );
};

// ── Componente principal ──────────────────────────────────────────────────────

const TalentFinderStatsTab: React.FC = () => {
    const [stats, setStats]     = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [periodo, setPeriodo] = useState<Periodo>('mes');

    const carregar = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch('/api/talent-finder-stats');
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar estatísticas');
            setStats(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin"/>
            <p className="text-sm">Carregando estatísticas...</p>
        </div>
    );

    if (error) return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-red-700 font-medium">⚠️ {error}</p>
            <button onClick={carregar} className="mt-3 text-sm text-red-600 underline">Tentar novamente</button>
        </div>
    );

    if (!stats) return null;

    const logsFiltrados  = filtrarPorPeriodo(stats.logs, periodo);
    const totalBuscas    = logsFiltrados.length;
    const totalAbertos   = logsFiltrados.reduce((s, l) => s + (l.queries_abertas  || 0), 0);
    const totalCopiados  = logsFiltrados.reduce((s, l) => s + (l.queries_copiadas || 0), 0);
    const totalCapturados = logsFiltrados.reduce((s, l) => s + (l.leads_capturados || 0), 0);
    const taxaAbertura   = totalBuscas > 0 ? Math.round((logsFiltrados.filter(l => l.queries_abertas > 0).length / totalBuscas) * 100) : 0;

    const tecnologias  = contarTecnologias(logsFiltrados);
    const localizacoes = contarOcorrencias(logsFiltrados.map(l => l.localizacao)).slice(0, 6);
    const senioridades = contarOcorrencias(logsFiltrados.map(l => l.senioridade)).slice(0, 6);
    const maxTech      = tecnologias[0]?.count || 1;
    const maxLocal     = localizacoes[0]?.count || 1;
    const maxSenior    = senioridades[0]?.count || 1;

    // Agregação por usuário
    const usuariosMap = new Map<string, { nome: string; buscas: number; abertos: number; capturados: number }>();
    logsFiltrados.forEach(l => {
        const nome = l.nome_usuario || `Usuário ${l.usuario_id}`;
        if (!usuariosMap.has(nome)) usuariosMap.set(nome, { nome, buscas: 0, abertos: 0, capturados: 0 });
        const u = usuariosMap.get(nome)!;
        u.buscas++;
        u.abertos    += l.queries_abertas  || 0;
        u.capturados += l.leads_capturados || 0;
    });
    const porUsuario = Array.from(usuariosMap.values()).sort((a, b) => b.buscas - a.buscas);

    // Últimas 10 buscas
    const ultimasBuscas = [...stats.logs]
        .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
        .slice(0, 10);

    return (
        <div className="space-y-5 pt-2">

            {/* ── Cabeçalho ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        <i className="fa-solid fa-chart-line text-indigo-600"></i>
                        Estatísticas do Talent Finder
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Atualizado em {new Date(stats.gerado_em).toLocaleString('pt-BR')}
                        <button onClick={carregar} className="ml-2 text-indigo-500 hover:text-indigo-700" title="Recarregar">
                            <i className="fa-solid fa-rotate-right text-xs"/>
                        </button>
                    </p>
                </div>

                {/* Seletor de período */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    {(Object.keys(PERIODO_LABELS) as Periodo[]).map(p => (
                        <button key={p} onClick={() => setPeriodo(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                periodo === p
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}>
                            {PERIODO_LABELS[p]}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── KPIs ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon="🔍" label="Buscas Realizadas"  value={totalBuscas}
                    sub={`${stats.logs.length} total histórico`} color="text-indigo-600"/>
                <KpiCard icon="🌐" label="Queries Abertas"    value={totalAbertos}
                    sub={`${taxaAbertura}% das buscas converteram`} color="text-blue-600"/>
                <KpiCard icon="📋" label="Queries Copiadas"   value={totalCopiados}
                    sub="para edição manual" color="text-purple-600"/>
                <KpiCard icon="👤" label="Leads Capturados"   value={totalCapturados}
                    sub="via Prospect Engine" color="text-green-600"/>
            </div>

            {/* ── Linha: Tecnologias + Localização/Senioridade ──────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Top Tecnologias */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-microchip text-indigo-500"></i>
                        Tecnologias Mais Buscadas
                    </h3>
                    {tecnologias.length > 0 ? (
                        <div className="space-y-2.5">
                            {tecnologias.map((t, i) => (
                                <BarraH key={t.label} label={t.label} count={t.count} max={maxTech} idx={i}/>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 text-center py-6">
                            Sem dados para o período selecionado
                        </p>
                    )}
                </div>

                {/* Localização + Senioridade */}
                <div className="space-y-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fa-solid fa-location-dot text-blue-500"></i>
                            Localizações
                        </h3>
                        {localizacoes.length > 0 ? (
                            <div className="space-y-2">
                                {localizacoes.map((l, i) => (
                                    <BarraH key={l.label} label={l.label} count={l.count} max={maxLocal} idx={i}/>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 text-center py-3">Sem dados</p>
                        )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fa-solid fa-ranking-star text-purple-500"></i>
                            Senioridades Buscadas
                        </h3>
                        {senioridades.length > 0 ? (
                            <div className="space-y-2">
                                {senioridades.map((s, i) => (
                                    <BarraH key={s.label} label={s.label} count={s.count} max={maxSenior} idx={i}/>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 text-center py-3">Sem dados</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Desempenho por Usuário ────────────────────────────────── */}
            {porUsuario.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <i className="fa-solid fa-users text-indigo-500"></i>
                            Desempenho por Usuário — {PERIODO_LABELS[periodo]}
                        </h3>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-left border-b border-gray-200">
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">USUÁRIO</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">BUSCAS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">QUERIES ABERTAS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">LEADS CAPTURADOS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">CONVERSÃO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {porUsuario.map((u, i) => {
                                const conv = u.buscas > 0 ? Math.round((u.abertos / u.buscas) * 100) : 0;
                                return (
                                    <tr key={u.nome} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                                                    {u.nome[0]}
                                                </div>
                                                <span className="text-xs font-medium text-gray-800">{u.nome}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-semibold text-indigo-700">{u.buscas}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-semibold text-blue-700">{u.abertos}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-semibold text-green-700">{u.capturados}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                conv >= 70 ? 'bg-green-100 text-green-700' :
                                                conv >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-gray-100 text-gray-500'
                                            }`}>{conv}%</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Histórico das Últimas Buscas ──────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <i className="fa-solid fa-clock-rotate-left text-blue-500"></i>
                        Últimas 10 Buscas
                    </h3>
                </div>
                {ultimasBuscas.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-left border-b border-gray-200">
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">REQUISITOS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">USUÁRIO</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">ABERTAS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">LEADS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">TECNOLOGIAS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">DATA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ultimasBuscas.map(l => (
                                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2.5 max-w-[220px]">
                                        <p className="text-xs text-gray-800 truncate font-medium" title={l.requisitos}>
                                            {l.requisitos}
                                        </p>
                                        {l.localizacao && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                                <i className="fa-solid fa-location-dot mr-1"/>
                                                {l.localizacao}
                                                {l.senioridade && ` · ${l.senioridade}`}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-600">
                                        {l.nome_usuario || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span className={`text-xs font-semibold ${l.queries_abertas > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                                            {l.queries_abertas || 0}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span className={`text-xs font-semibold ${l.leads_capturados > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                            {l.leads_capturados || 0}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex flex-wrap gap-1">
                                            {(l.tecnologias || []).slice(0, 3).map(t => (
                                                <span key={t} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-medium">
                                                    {t}
                                                </span>
                                            ))}
                                            {(l.tecnologias || []).length > 3 && (
                                                <span className="text-[10px] text-gray-400">
                                                    +{(l.tecnologias || []).length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-xs text-gray-400 whitespace-nowrap">
                                        {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="py-12 text-center text-gray-400">
                        <i className="fa-solid fa-magnifying-glass text-3xl mb-3 block text-gray-200"></i>
                        <p className="text-sm">Nenhuma busca registrada ainda</p>
                        <p className="text-xs mt-1">Use o Talent Finder para começar a gerar estatísticas</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TalentFinderStatsTab;
