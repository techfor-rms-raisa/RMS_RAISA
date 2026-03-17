/**
 * src/components/prospect/CreditosTab.tsx
 *
 * Dashboard de Estatísticas do Prospect Engine
 * Exibe métricas de uso por usuário: pesquisas, perfis, emails,
 * créditos Hunter, cargos mais prospectados e distribuição de motores.
 *
 * Períodos: Diário / Mensal / Anual / Total
 *
 * Versão: 1.0
 * Data: 17/03/2026
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PeriodoStats {
    pesquisas: number;
    perfis:    number;
    emails:    number;
    creditos:  number;
}

interface CargoStat   { cargo: string; count: number; }
interface MotorStat   { motor: string; count: number; }

interface UsuarioStats {
    usuario_id:   number;
    nome_usuario: string;
    diario:       PeriodoStats;
    mensal:       PeriodoStats;
    anual:        PeriodoStats;
    total:        PeriodoStats;
    top_cargos:   CargoStat[];
    motores:      MotorStat[];
}

interface GlobalStats {
    total:      { perfis: number; emails: number; creditos: number; usuarios: number };
    diario:     { perfis: number; emails: number };
    mensal:     { perfis: number; emails: number };
    top_cargos: CargoStat[];
    motores:    MotorStat[];
}

interface StatsData {
    global:      GlobalStats;
    por_usuario: UsuarioStats[];
    gerado_em:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Periodo = 'diario' | 'mensal' | 'anual' | 'total';

const PERIODO_LABELS: Record<Periodo, string> = {
    diario:  'Hoje',
    mensal:  'Este Mês',
    anual:   'Este Ano',
    total:   'Total Geral',
};

const MOTOR_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    'gemini':        { label: 'Gemini AI',      color: 'text-blue-700',   bg: 'bg-blue-100'   },
    'hunter':        { label: 'Hunter.io',       color: 'text-orange-700', bg: 'bg-orange-100' },
    'gemini+hunter': { label: 'Gemini+Hunter',   color: 'text-purple-700', bg: 'bg-purple-100' },
    'extension':     { label: 'Chrome Ext.',     color: 'text-teal-700',   bg: 'bg-teal-100'   },
    'snovio':        { label: 'Snov.io',         color: 'text-pink-700',   bg: 'bg-pink-100'   },
};

const CARGO_COLORS = [
    'bg-red-500', 'bg-purple-500', 'bg-blue-500',
    'bg-green-500', 'bg-orange-500', 'bg-teal-500',
];

// ── Sub-componentes ───────────────────────────────────────────────────────────

const KpiCard: React.FC<{
    icon: string; label: string; value: number | string;
    sub?: string; color?: string;
}> = ({ icon, label, value, sub, color = 'text-blue-600' }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
        <div className={`text-2xl mt-0.5 ${color}`}>{icon}</div>
        <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold ${color} mt-0.5`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

const BarraProgresso: React.FC<{ label: string; value: number; max: number; color: string; idx: number }> = (
    { label, value, max, color, idx }
) => {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-32 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${CARGO_COLORS[idx % CARGO_COLORS.length]}`}/>
                <span className="text-xs text-gray-700 truncate" title={label}>{label}</span>
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }}/>
            </div>
            <span className="text-xs font-semibold text-gray-600 w-8 text-right">{value}</span>
        </div>
    );
};

// ── Componente principal ──────────────────────────────────────────────────────

const CreditosTab: React.FC = () => {
    const [stats, setStats]         = useState<StatsData | null>(null);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [periodo, setPeriodo]     = useState<Periodo>('mensal');
    const [expanded, setExpanded]   = useState<number | null>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch('/api/prospect-stats');
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

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>
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

    const { global, por_usuario } = stats;
    const maxPerfis = Math.max(...por_usuario.map(u => u[periodo].perfis), 1);
    const maxCargo  = Math.max(...global.top_cargos.map(c => c.count), 1);

    return (
        <div className="space-y-6">

            {/* ── Cabeçalho ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <i className="fa-solid fa-chart-column text-blue-600"></i>
                        Dashboard de Uso — Prospect Engine
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Atualizado em {new Date(stats.gerado_em).toLocaleString('pt-BR')}
                        <button onClick={carregar} className="ml-2 text-blue-500 hover:text-blue-700">
                            <i className="fa-solid fa-rotate-right"/>
                        </button>
                    </p>
                </div>

                {/* Seletor de período */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    {(Object.keys(PERIODO_LABELS) as Periodo[]).map(p => (
                        <button key={p} onClick={() => setPeriodo(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                periodo === p
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}>
                            {PERIODO_LABELS[p]}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── KPIs Globais ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon="👥" label="Total de Usuários"   value={global.total.usuarios}  color="text-blue-600" />
                <KpiCard icon="🔍" label="Perfis Prospectados" value={global.total.perfis}
                    sub={`${global.diario.perfis} hoje · ${global.mensal.perfis} este mês`}
                    color="text-indigo-600" />
                <KpiCard icon="📧" label="Emails Encontrados"  value={global.total.emails}
                    sub={`${global.total.perfis > 0 ? Math.round((global.total.emails/global.total.perfis)*100) : 0}% de conversão`}
                    color="text-green-600" />
                <KpiCard icon="🎯" label="Créditos Hunter"     value={global.total.creditos}
                    sub="Total consumido"
                    color="text-orange-600" />
            </div>

            {/* ── Linha: Cargos + Motores ───────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Top Cargos */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-ranking-star text-purple-500"></i>
                        Cargos Mais Prospectados
                    </h3>
                    <div className="space-y-3">
                        {global.top_cargos.map((c, i) => (
                            <BarraProgresso key={c.cargo} idx={i}
                                label={c.cargo} value={c.count} max={maxCargo}
                                color={CARGO_COLORS[i % CARGO_COLORS.length]}
                            />
                        ))}
                        {global.top_cargos.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-4">Sem dados</p>
                        )}
                    </div>
                </div>

                {/* Distribuição de Motores */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-gear text-blue-500"></i>
                        Distribuição por Motor de Busca
                    </h3>
                    <div className="space-y-2.5">
                        {global.motores.map(m => {
                            const cfg = MOTOR_CONFIG[m.motor] || { label: m.motor, color: 'text-gray-700', bg: 'bg-gray-100' };
                            const pct = global.total.perfis > 0 ? Math.round((m.count / global.total.perfis) * 100) : 0;
                            return (
                                <div key={m.motor} className="flex items-center gap-3">
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color} w-28 text-center flex-shrink-0`}>
                                        {cfg.label}
                                    </span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                                        <div className={`h-2 rounded-full ${cfg.bg.replace('100', '500')}`} style={{ width: `${pct}%` }}/>
                                    </div>
                                    <span className="text-xs text-gray-500 w-16 text-right">{m.count} ({pct}%)</span>
                                </div>
                            );
                        })}
                        {global.motores.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-4">Sem dados</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Tabela por Usuário ────────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <i className="fa-solid fa-users text-blue-500"></i>
                        Desempenho por Usuário — {PERIODO_LABELS[periodo]}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-left border-b border-gray-200">
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">USUÁRIO</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">PESQUISAS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">PERFIS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">EMAILS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">CONVERSÃO</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">CRÉDITOS</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">VOLUME</th>
                                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">DETALHES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {por_usuario.map(u => {
                                const p         = u[periodo];
                                const conversao = p.perfis > 0 ? Math.round((p.emails / p.perfis) * 100) : 0;
                                const pct       = Math.round((p.perfis / maxPerfis) * 100);
                                const isOpen    = expanded === u.usuario_id;

                                return (
                                    <React.Fragment key={u.usuario_id}>
                                        <tr className="border-b border-gray-100 hover:bg-gray-50">
                                            {/* Usuário */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold flex-shrink-0">
                                                        {u.nome_usuario?.[0] || '?'}
                                                    </div>
                                                    <span className="font-medium text-gray-800 text-xs">{u.nome_usuario}</span>
                                                </div>
                                            </td>
                                            {/* Pesquisas */}
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm font-semibold text-gray-700">{p.pesquisas}</span>
                                            </td>
                                            {/* Perfis */}
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm font-semibold text-indigo-700">{p.perfis}</span>
                                            </td>
                                            {/* Emails */}
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm font-semibold text-green-700">{p.emails}</span>
                                            </td>
                                            {/* Conversão */}
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                    conversao >= 50 ? 'bg-green-100 text-green-700' :
                                                    conversao >= 25 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-gray-100 text-gray-500'
                                                }`}>{conversao}%</span>
                                            </td>
                                            {/* Créditos */}
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm font-semibold text-orange-600">{p.creditos}</span>
                                            </td>
                                            {/* Barra de volume */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 bg-gray-100 rounded-full h-1.5">
                                                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }}/>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400">{pct}%</span>
                                                </div>
                                            </td>
                                            {/* Expandir */}
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setExpanded(isOpen ? null : u.usuario_id)}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                                                    {isOpen ? '▲ Fechar' : '▼ Ver mais'}
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Linha expandida: top cargos + motores do usuário */}
                                        {isOpen && (
                                            <tr className="border-b border-gray-100 bg-indigo-50/30">
                                                <td colSpan={8} className="px-6 py-4">
                                                    <div className="grid grid-cols-2 gap-6">
                                                        {/* Top cargos do usuário */}
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-600 mb-2">
                                                                <i className="fa-solid fa-ranking-star mr-1 text-purple-500"></i>
                                                                Cargos mais prospectados
                                                            </p>
                                                            <div className="space-y-1.5">
                                                                {u.top_cargos.length > 0 ? u.top_cargos.map((c, i) => (
                                                                    <div key={c.cargo} className="flex items-center gap-2">
                                                                        <span className={`w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center ${CARGO_COLORS[i % CARGO_COLORS.length]}`}>
                                                                            {i + 1}
                                                                        </span>
                                                                        <span className="text-xs text-gray-700 flex-1">{c.cargo}</span>
                                                                        <span className="text-xs font-semibold text-gray-500">{c.count}</span>
                                                                    </div>
                                                                )) : <p className="text-xs text-gray-400">Sem dados</p>}
                                                            </div>
                                                        </div>
                                                        {/* Motores do usuário */}
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-600 mb-2">
                                                                <i className="fa-solid fa-gear mr-1 text-blue-500"></i>
                                                                Motores utilizados
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {u.motores.length > 0 ? u.motores.map(m => {
                                                                    const cfg = MOTOR_CONFIG[m.motor] || { label: m.motor, color: 'text-gray-700', bg: 'bg-gray-100' };
                                                                    return (
                                                                        <span key={m.motor} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                                                                            {cfg.label}: {m.count}
                                                                        </span>
                                                                    );
                                                                }) : <p className="text-xs text-gray-400">Sem dados</p>}
                                                            </div>
                                                            {/* Totais acumulados */}
                                                            <div className="mt-3 grid grid-cols-2 gap-2">
                                                                {(['diario','mensal','anual','total'] as Periodo[]).map(pp => (
                                                                    <div key={pp} className={`rounded-lg px-3 py-2 text-center border ${pp === periodo ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                                                                        <p className="text-[10px] text-gray-400 font-medium">{PERIODO_LABELS[pp]}</p>
                                                                        <p className="text-sm font-bold text-gray-700">{u[pp].perfis} perfis</p>
                                                                        <p className="text-[10px] text-gray-400">{u[pp].emails} emails · {u[pp].creditos} créditos</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {por_usuario.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                                        <i className="fa-solid fa-database text-3xl mb-3 block text-gray-200"></i>
                                        Nenhuma prospecção registrada ainda
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CreditosTab;
