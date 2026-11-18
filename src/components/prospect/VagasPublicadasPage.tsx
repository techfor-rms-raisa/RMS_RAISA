/**
 * src/components/prospect/VagasPublicadasPage.tsx
 *
 * PROSPECT ENGINE › "Vagas Publicadas" (item de menu, view 'prospect_vagas')
 *
 * Empresas que estão CONTRATANDO agora em Tecnologia / Dados / Segurança /
 * Infra (e Administrativo, baixa prioridade) — sinal de intenção para a
 * prospecção B2B. Fontes públicas SEM LOGIN: Gupy (API), LinkedIn Jobs
 * (página pública), Vagas.com e Programathor.
 *
 * Fluxo:
 *   1. Painel de busca (área, keyword, UF, modalidade, período, fontes)
 *   2. GET /api/prospect-vagas?action=buscar → vagas + match de território + saúde
 *   3. Tabela ordenável (Por vaga | Por empresa), badges 🟢 Nova / 🟡 Outro /
 *      🔵 Você / ⚪ Confidencial
 *   4. "Salvar p/ prospectar" → POST action=salvar_empresa (bloqueio de
 *      território é revalidado no servidor; UI mostra o dono)
 *   5. Aba "Minhas empresas salvas" → GET action=salvas
 *
 * Mockup aprovado por Messias em 18/10/2026 (mockup_prospect_vagas_abertas.html).
 * Segue o padrão visual de ProspectSearchPage (Tailwind + Font Awesome).
 *
 * Versão: 1.0
 * Data:   18/10/2026
 * Autor:  Messias + Claude DEV / Claude Design
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

// ─── TIPOS (espelho de lib/prospect-vagas/vagas-types.ts) ───────────────────

type Area = 'tecnologia' | 'dados' | 'seguranca' | 'infra' | 'administrativo';
type Fonte = 'gupy' | 'linkedin' | 'vagascom' | 'programathor';
type Modalidade = 'remoto' | 'hibrido' | 'presencial';
type StatusTerritorio = 'nova' | 'livre' | 'voce' | 'outro' | 'confidencial';

interface MatchEmpresa {
    status: StatusTerritorio;
    email_empresa_id: number | null;
    dono_user_id: number | null;
    dono_nome: string | null;
    detalhe: string | null;
    score: number | null;
    match_por: 'dominio' | 'nome' | 'salva' | 'prospect' | null;
    salva_id: number | null;
    pode_salvar: boolean;
}

interface Vaga {
    id: number;
    fonte: Fonte;
    vaga_url: string;
    titulo: string;
    area: Area;
    senioridade: string | null;
    regime: string | null;
    stack: string[] | null;
    cidade: string | null;
    uf: string | null;
    modalidade: Modalidade | null;
    publicado_em: string | null;
    dias_publicada: number | null;
    envelhecendo: boolean;
    empresa_nome: string | null;
    empresa_nome_norm: string | null;
    empresa_url: string | null;
    empresa_dominio: string | null;
    confidencial: boolean;
    match: MatchEmpresa;
}

interface SaudeFonte { fonte: Fonte; ok: boolean; qtd: number; ms: number; requests: number; erro?: string; degradada?: boolean; }

interface ResultadoBusca {
    success: boolean;
    vagas: Vaga[];
    total_vagas: number;
    total_empresas: number;
    saude: SaudeFonte[];
    cache_hit: boolean;
    capturado_em: string;
    duracao_ms: number;
    error?: string;
}

interface EmpresaSalva {
    id: number;
    empresa_nome: string;
    empresa_dominio: string | null;
    empresa_url: string | null;
    email_empresa_id: number | null;
    salvo_por: number;
    salvo_por_nome: string | null;
    salvo_em: string;
    observacao: string | null;
    status: 'salva' | 'prospectando' | 'descartada';
    vaga?: { titulo: string; fonte: Fonte; vaga_url: string; publicado_em: string | null } | null;
}

// ─── CONSTANTES ─────────────────────────────────────────────────────────────

const AREAS: Array<{ id: Area; label: string; icon: string; prioridade: boolean }> = [
    { id: 'tecnologia',     label: 'Tecnologia / Desenvolvimento',   icon: 'fa-solid fa-code',          prioridade: true },
    { id: 'dados',          label: 'Ciência de Dados / IA',          icon: 'fa-solid fa-chart-simple',  prioridade: true },
    { id: 'seguranca',      label: 'Segurança da Informação',        icon: 'fa-solid fa-shield-halved', prioridade: true },
    { id: 'infra',          label: 'Infraestrutura / Cloud / DevOps', icon: 'fa-solid fa-server',       prioridade: true },
    { id: 'administrativo', label: 'Administrativo',                 icon: 'fa-solid fa-folder',        prioridade: false },
];

const FONTES: Array<{ id: Fonte; label: string; nota: string; padrao: boolean }> = [
    { id: 'gupy',         label: 'Gupy',          nota: 'API pública',        padrao: true },
    { id: 'vagascom',     label: 'Vagas.com',     nota: 'página pública',     padrao: true },
    { id: 'programathor', label: 'Programathor',  nota: 'página pública',     padrao: true },
    { id: 'linkedin',     label: 'LinkedIn Jobs', nota: 'público · sujeito a bloqueio temporário', padrao: false },
];

const FONTE_BADGE: Record<Fonte, string> = {
    gupy:         'bg-cyan-50 text-cyan-700 border-cyan-200',
    linkedin:     'bg-sky-50 text-sky-700 border-sky-200',
    vagascom:     'bg-teal-50 text-teal-700 border-teal-200',
    programathor: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};
const FONTE_LABEL: Record<Fonte, string> = { gupy: 'Gupy', linkedin: 'LinkedIn', vagascom: 'Vagas.com', programathor: 'Programathor' };

const UFS = ['SP','RJ','MG','PR','RS','SC','DF','BA','CE','PE','GO','ES','AM','PA','MT','MS','PB','RN','AL','SE','PI','MA','TO','RO','AC','AP','RR'];

const PAGE_SIZE = 25;

type SortKey = 'empresa' | 'titulo' | 'local' | 'data' | 'fonte' | 'status';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const fmtData = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '—';
const fmtDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function modalidadeBadge(m: Modalidade | null) {
    if (!m) return null;
    const cls = m === 'remoto' ? 'bg-violet-50 text-violet-700 border-violet-200'
              : m === 'hibrido' ? 'bg-orange-50 text-orange-700 border-orange-200'
              : 'bg-gray-100 text-gray-600 border-gray-200';
    const label = m === 'remoto' ? 'Remoto' : m === 'hibrido' ? 'Híbrido' : 'Presencial';
    return <span className={`ml-1 text-[11px] px-1.5 py-0.5 border rounded ${cls}`}>{label}</span>;
}

function StatusBadge({ m, admin }: { m: MatchEmpresa; admin: boolean }) {
    switch (m.status) {
        case 'nova':
            return <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"><i className="fa-solid fa-circle-plus mr-1"></i>Nova</span>;
        case 'livre':
            return <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title="Já cadastrada na Base de Leads, sem dono — salvar reserva para você"><i className="fa-solid fa-unlock mr-1"></i>Na base · livre</span>;
        case 'voce':
            return <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"><i className="fa-solid fa-user-check mr-1"></i>Você</span>;
        case 'outro':
            return <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"><i className="fa-solid fa-lock mr-1"></i>{admin || m.dono_nome ? (m.dono_nome ?? 'Outro analista') : 'Outro analista'}</span>;
        default:
            return <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200"><i className="fa-solid fa-eye-slash mr-1"></i>Confidencial</span>;
    }
}

// ─── COMPONENTE ─────────────────────────────────────────────────────────────

const VagasPublicadasPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const isAdmin = currentUser?.tipo_usuario === 'Administrador';

    // Filtros
    const [areas, setAreas]             = useState<Area[]>(['tecnologia', 'dados']);
    const [keyword, setKeyword]         = useState('');
    const [uf, setUf]                   = useState('');
    const [modalidade, setModalidade]   = useState<'' | Modalidade>('');
    const [periodo, setPeriodo]         = useState<'7' | '30' | '0'>('7');
    const [fontes, setFontes]           = useState<Fonte[]>(FONTES.filter(f => f.padrao).map(f => f.id));

    // Resultado
    const [loading, setLoading]         = useState(false);
    const [resultado, setResultado]     = useState<ResultadoBusca | null>(null);
    const [erro, setErro]               = useState<string | null>(null);

    // Tabela
    const [aba, setAba]                 = useState<'busca' | 'salvas'>('busca');
    const [view, setView]               = useState<'vagas' | 'empresas'>('vagas');
    const [filtroTexto, setFiltroTexto] = useState('');
    const [ocultarNaBase, setOcultar]   = useState(false);
    const [soEnvelhecendo, setSoEnv]    = useState(false);
    const [sort, setSort]               = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'data', dir: 'desc' });
    const [pagina, setPagina]           = useState(1);

    // Salvar
    const [modalSalvar, setModalSalvar] = useState<Vaga | null>(null);
    const [modalBloqueio, setBloqueio]  = useState<{ empresa: string; dono: string | null; detalhe: string | null } | null>(null);
    const [dominioInput, setDominio]    = useState('');
    const [obsInput, setObs]            = useState('');
    const [resolverDom, setResolverDom] = useState(true);
    const [salvando, setSalvando]       = useState(false);
    const [toast, setToast]             = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

    // Salvas
    const [salvas, setSalvas]           = useState<EmpresaSalva[]>([]);
    const [loadingSalvas, setLoadingS]  = useState(false);

    const mostrarToast = (tipo: 'ok' | 'erro', msg: string) => { setToast({ tipo, msg }); setTimeout(() => setToast(null), 4000); };

    // ── Busca ───────────────────────────────────────────────────────────
    const buscar = useCallback(async (forcar = false) => {
        if (!currentUser) return;
        if (!areas.length) { mostrarToast('erro', 'Selecione ao menos uma área.'); return; }
        if (!fontes.length) { mostrarToast('erro', 'Selecione ao menos uma fonte.'); return; }
        setLoading(true); setErro(null); setPagina(1);
        try {
            const p = new URLSearchParams({
                action: 'buscar',
                user_id: String(currentUser.id),
                areas: areas.join(','),
                fontes: fontes.join(','),
            });
            if (keyword.trim()) p.set('keyword', keyword.trim());
            if (uf)             p.set('uf', uf);
            if (modalidade)     p.set('modalidade', modalidade);
            if (periodo !== '0') p.set('periodo_dias', periodo);
            if (forcar)         p.set('forcar', '1');

            const resp = await fetch(`/api/prospect-vagas?${p.toString()}`);
            const data: ResultadoBusca = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.error || `Erro ${resp.status}`);
            setResultado(data);
        } catch (e: any) {
            setErro(e.message || 'Falha na busca');
            setResultado(null);
        } finally {
            setLoading(false);
        }
    }, [currentUser, areas, fontes, keyword, uf, modalidade, periodo]);

    // ── Salvas ──────────────────────────────────────────────────────────
    const carregarSalvas = useCallback(async () => {
        if (!currentUser) return;
        setLoadingS(true);
        try {
            const resp = await fetch(`/api/prospect-vagas?action=salvas&user_id=${currentUser.id}`);
            const data = await resp.json();
            if (data.success) setSalvas(data.salvas);
        } finally { setLoadingS(false); }
    }, [currentUser]);

    useEffect(() => { if (aba === 'salvas') carregarSalvas(); }, [aba, carregarSalvas]);

    const atualizarSalva = async (id: number, status: EmpresaSalva['status']) => {
        if (!currentUser) return;
        const resp = await fetch('/api/prospect-vagas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'atualizar_salva', user_id: currentUser.id, id, status }),
        });
        const data = await resp.json();
        if (data.success) { setSalvas(s => s.map(x => x.id === id ? { ...x, status } : x)); }
        else mostrarToast('erro', data.error || 'Não foi possível atualizar');
    };

    // ── Salvar empresa ──────────────────────────────────────────────────
    const abrirSalvar = (v: Vaga) => {
        if (v.match.status === 'outro' && !v.match.pode_salvar) {
            setBloqueio({ empresa: v.empresa_nome || '', dono: v.match.dono_nome, detalhe: v.match.detalhe });
            return;
        }
        setDominio(v.empresa_dominio || '');
        setObs('');
        setResolverDom(!v.empresa_dominio);
        setModalSalvar(v);
    };

    const confirmarSalvar = async () => {
        if (!modalSalvar || !currentUser) return;
        setSalvando(true);
        try {
            const resp = await fetch('/api/prospect-vagas', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'salvar_empresa',
                    user_id: currentUser.id,
                    vaga_id: modalSalvar.id,
                    empresa_nome: modalSalvar.empresa_nome,
                    empresa_dominio: dominioInput.trim() || null,
                    empresa_url: modalSalvar.empresa_url,
                    observacao: obsInput.trim() || null,
                    resolver_dominio: resolverDom && !dominioInput.trim(),
                }),
            });
            const data = await resp.json();
            if (data.success) {
                mostrarToast('ok', `${modalSalvar.empresa_nome} salva e reservada para você${data.empresa_dominio ? ` (${data.empresa_dominio})` : ''}.`);
                // atualiza o match de todas as vagas dessa empresa na tabela
                setResultado(r => r ? {
                    ...r,
                    vagas: r.vagas.map(v => v.empresa_nome_norm === modalSalvar.empresa_nome_norm
                        ? { ...v, empresa_dominio: data.empresa_dominio ?? v.empresa_dominio, match: { ...v.match, status: 'voce', dono_user_id: currentUser.id, dono_nome: currentUser.nome_usuario, match_por: 'salva', salva_id: data.salva_id, pode_salvar: false, detalhe: 'salva em Vagas Publicadas · salva' } }
                        : v),
                } : r);
                setModalSalvar(null);
            } else if (data.motivo === 'territorio' || data.motivo === 'ja_salva') {
                setModalSalvar(null);
                setBloqueio({ empresa: modalSalvar.empresa_nome || '', dono: data.dono_nome ?? null, detalhe: data.mensagem });
            } else {
                mostrarToast('erro', data.mensagem || data.error || 'Falha ao salvar');
            }
        } catch (e: any) {
            mostrarToast('erro', e.message);
        } finally { setSalvando(false); }
    };

    // ── Derivados da tabela ─────────────────────────────────────────────
    const vagasFiltradas = useMemo(() => {
        if (!resultado) return [];
        const t = filtroTexto.trim().toLowerCase();
        let lista = resultado.vagas;
        if (t) lista = lista.filter(v => (v.empresa_nome || '').toLowerCase().includes(t) || v.titulo.toLowerCase().includes(t));
        if (ocultarNaBase) lista = lista.filter(v => v.match.status === 'nova' || v.match.status === 'confidencial');
        if (soEnvelhecendo) lista = lista.filter(v => v.envelhecendo);
        const dir = sort.dir === 'asc' ? 1 : -1;
        const ordemStatus: Record<StatusTerritorio, number> = { nova: 0, livre: 1, voce: 2, outro: 3, confidencial: 4 };
        return [...lista].sort((a, b) => {
            let va: string | number = '', vb: string | number = '';
            switch (sort.key) {
                case 'empresa': va = a.empresa_nome || 'zzz'; vb = b.empresa_nome || 'zzz'; break;
                case 'titulo':  va = a.titulo; vb = b.titulo; break;
                case 'local':   va = `${a.uf || 'zz'} ${a.cidade || ''}`; vb = `${b.uf || 'zz'} ${b.cidade || ''}`; break;
                case 'data':    va = a.publicado_em || '0000'; vb = b.publicado_em || '0000'; break;
                case 'fonte':   va = a.fonte; vb = b.fonte; break;
                case 'status':  va = ordemStatus[a.match.status]; vb = ordemStatus[b.match.status]; break;
            }
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb), 'pt') * dir;
        });
    }, [resultado, filtroTexto, ocultarNaBase, soEnvelhecendo, sort]);

    const empresasAgrupadas = useMemo(() => {
        const mapa = new Map<string, { nome: string; url: string | null; vagas: Vaga[]; areas: Set<Area>; fontes: Set<Fonte>; maisAntiga: number | null; match: MatchEmpresa; exemplo: Vaga }>();
        for (const v of vagasFiltradas) {
            if (v.confidencial || !v.empresa_nome_norm) continue;
            const g = mapa.get(v.empresa_nome_norm);
            if (g) {
                g.vagas.push(v); g.areas.add(v.area); g.fontes.add(v.fonte);
                if (v.dias_publicada != null && (g.maisAntiga == null || v.dias_publicada > g.maisAntiga)) g.maisAntiga = v.dias_publicada;
                if (!g.url && v.empresa_url) g.url = v.empresa_url;
            } else {
                mapa.set(v.empresa_nome_norm, { nome: v.empresa_nome!, url: v.empresa_url, vagas: [v], areas: new Set([v.area]), fontes: new Set([v.fonte]), maisAntiga: v.dias_publicada, match: v.match, exemplo: v });
            }
        }
        return [...mapa.values()].sort((a, b) => b.vagas.length - a.vagas.length || a.nome.localeCompare(b.nome, 'pt'));
    }, [vagasFiltradas]);

    const totalPaginas = Math.max(1, Math.ceil((view === 'vagas' ? vagasFiltradas.length : empresasAgrupadas.length) / PAGE_SIZE));
    const paginaVagas = vagasFiltradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);
    const paginaEmpresas = empresasAgrupadas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

    const toggleSort = (key: SortKey) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
    const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
        <th className="p-3 cursor-pointer select-none whitespace-nowrap hover:text-blue-600" onClick={() => toggleSort(k)}>
            {children} <i className={`fa-solid ${sort.key === k ? (sort.dir === 'asc' ? 'fa-sort-up text-blue-600' : 'fa-sort-down text-blue-600') : 'fa-sort opacity-30'} ml-1`}></i>
        </th>
    );

    const botaoAcao = (v: Vaga) => {
        const m = v.match;
        if (m.status === 'confidencial') return <span className="text-xs text-gray-400">—</span>;
        if (m.status === 'voce') return <span className="text-xs px-3 py-1.5 border border-blue-200 text-blue-700 rounded-lg inline-flex items-center gap-1"><i className="fa-solid fa-user-check"></i>Sua</span>;
        if (m.status === 'outro' && !m.pode_salvar) return <button onClick={() => abrirSalvar(v)} className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"><i className="fa-solid fa-lock mr-1"></i>Território de outro</button>;
        return <button onClick={() => abrirSalvar(v)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"><i className="fa-solid fa-bookmark mr-1"></i>Salvar p/ prospectar</button>;
    };

    // ── Render ──────────────────────────────────────────────────────────
    return (
        <div className="flex-1 overflow-auto bg-gray-50 p-4 md:p-6">
            {/* HEADER */}
            <div className="mb-4">
                <div className="text-sm text-gray-500 mb-1"><i className="fa-solid fa-rocket text-blue-600 mr-1"></i>Prospect Engine &raquo; Vagas Publicadas</div>
                <h1 className="text-2xl font-bold text-gray-800">Empresas contratando agora</h1>
                <p className="text-sm text-gray-600 mt-1">Sinal de intenção: quem anuncia vaga de tecnologia está com demanda aberta — e é candidata a alocação TechFor.</p>
            </div>

            {/* ABAS INTERNAS */}
            <div className="flex items-center border-b border-gray-200 mb-5 text-sm">
                <button onClick={() => setAba('busca')} className={`px-4 py-2 ${aba === 'busca' ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px rounded-t-lg font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fa-solid fa-magnifying-glass mr-2"></i>Buscar vagas
                </button>
                <button onClick={() => setAba('salvas')} className={`px-4 py-2 ${aba === 'salvas' ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px rounded-t-lg font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fa-solid fa-bookmark mr-2"></i>{isAdmin ? 'Empresas salvas (equipe)' : 'Minhas empresas salvas'}
                </button>
            </div>

            {aba === 'busca' && (
            <>
                {/* PAINEL DE BUSCA */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        <i className="fa-solid fa-layer-group mr-2 text-blue-500"></i>Área de busca
                        <span className="text-xs font-normal text-gray-400 ml-2">(cada área expande para um conjunto de palavras-chave nas fontes)</span>
                    </label>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {AREAS.map(a => {
                            const on = areas.includes(a.id);
                            return (
                                <button key={a.id} onClick={() => setAreas(s => on ? s.filter(x => x !== a.id) : [...s, a.id])}
                                    className={`px-3 py-1.5 text-xs border rounded-full transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : a.prioridade ? 'border-gray-300 text-gray-700 hover:border-blue-400' : 'border-gray-300 text-gray-400 hover:border-blue-400'}`}>
                                    <i className={`${a.icon} mr-1`}></i>{a.label}{!a.prioridade && <span className="opacity-70"> (baixa prioridade)</span>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1"><i className="fa-solid fa-font text-blue-500 mr-1"></i>Palavra-chave extra <span className="text-gray-400">(opcional)</span></label>
                            <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="Ex: Java, SAP, Flutter, SOC…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1"><i className="fa-solid fa-location-dot text-blue-500 mr-1"></i>UF</label>
                            <select value={uf} onChange={e => setUf(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">Todas + Remoto</option>
                                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1"><i className="fa-solid fa-house-laptop text-blue-500 mr-1"></i>Modalidade</label>
                            <select value={modalidade} onChange={e => setModalidade(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">Todas</option><option value="remoto">Remoto</option><option value="hibrido">Híbrido</option><option value="presencial">Presencial</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1"><i className="fa-solid fa-calendar text-blue-500 mr-1"></i>Publicada em</label>
                            <select value={periodo} onChange={e => setPeriodo(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="0">Qualquer data</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-4">
                        <span className="text-xs font-medium text-gray-600"><i className="fa-solid fa-plug text-blue-500 mr-1"></i>Fontes (sem login):</span>
                        {FONTES.map(f => (
                            <label key={f.id} className="text-xs flex items-center gap-1.5 cursor-pointer" title={f.nota}>
                                <input type="checkbox" checked={fontes.includes(f.id)} onChange={() => setFontes(s => s.includes(f.id) ? s.filter(x => x !== f.id) : [...s, f.id])} />
                                {f.label} <span className="text-gray-400">({f.nota})</span>
                            </label>
                        ))}
                        {resultado && (
                            <span className="ml-auto text-[11px] text-gray-400">
                                <i className="fa-solid fa-database mr-1"></i>
                                {resultado.cache_hit ? `cache 24h — captura de ${fmtDataHora(resultado.capturado_em)}` : `captura nova — ${fmtDataHora(resultado.capturado_em)}`}
                            </span>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2 items-center">
                        <button onClick={() => buscar(false)} disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                            {loading ? <><i className="fa-solid fa-spinner fa-spin"></i> Buscando…</> : <><i className="fa-solid fa-magnifying-glass"></i> Buscar vagas</>}
                        </button>
                        <button onClick={() => buscar(true)} disabled={loading} title="Ignora o cache de 24h e raspa as fontes agora" className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                            <i className="fa-solid fa-rotate mr-1"></i>Forçar nova captura
                        </button>
                        <span className="text-xs text-gray-400 ml-2"><i className="fa-solid fa-shield-halved mr-1"></i>Apenas dados públicos de empresa e vaga — nenhum dado pessoal coletado (LGPD).</span>
                    </div>
                </div>

                {/* ERRO */}
                {erro && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"><i className="fa-solid fa-triangle-exclamation mr-2"></i>{erro}</div>}

                {/* SAÚDE DAS FONTES */}
                {resultado && resultado.saude.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
                        {resultado.saude.map(s => (
                            <div key={s.fonte} className={`bg-white border rounded-lg px-3 py-2 flex items-center justify-between ${s.ok ? 'border-gray-200' : 'border-red-200 bg-red-50'}`} title={s.erro || (s.degradada ? 'Respondeu 200 mas 0 vagas — parser possivelmente desatualizado' : '')}>
                                <span><span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.ok ? (s.degradada ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-red-500'}`}></span>{FONTE_LABEL[s.fonte]}</span>
                                <span className="text-gray-600">{s.ok ? <><b>{s.qtd}</b> vagas · {(s.ms / 1000).toFixed(1)}s</> : <span className="text-red-600 font-medium">indisponível</span>}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* RESULTADOS */}
                {resultado && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white text-xs">
                                <button onClick={() => { setView('vagas'); setPagina(1); }} className={`px-3 py-1.5 font-medium ${view === 'vagas' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><i className="fa-solid fa-list mr-1"></i>Por vaga</button>
                                <button onClick={() => { setView('empresas'); setPagina(1); }} className={`px-3 py-1.5 font-medium ${view === 'empresas' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}><i className="fa-solid fa-building mr-1"></i>Por empresa</button>
                            </div>
                            <input type="text" value={filtroTexto} onChange={e => { setFiltroTexto(e.target.value); setPagina(1); }} placeholder="Filtrar na lista (empresa ou título)…" className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                            <label className="text-xs flex items-center gap-1.5 text-gray-600 cursor-pointer"><input type="checkbox" checked={ocultarNaBase} onChange={e => { setOcultar(e.target.checked); setPagina(1); }} /> Ocultar empresas já na base</label>
                            <label className="text-xs flex items-center gap-1.5 text-gray-600 cursor-pointer"><input type="checkbox" checked={soEnvelhecendo} onChange={e => { setSoEnv(e.target.checked); setPagina(1); }} /> <i className="fa-solid fa-fire text-red-500"></i> Só vagas há 30+ dias</label>
                            <span className="ml-auto text-xs text-gray-400">{vagasFiltradas.length} vagas · {empresasAgrupadas.length} empresas únicas</span>
                        </div>

                        <div className="flex flex-wrap gap-3 mb-3 text-[11px]">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"><i className="fa-solid fa-circle-plus mr-1"></i>Nova / livre — pode salvar</span>
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"><i className="fa-solid fa-lock mr-1"></i>Território de outro analista</span>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"><i className="fa-solid fa-user-check mr-1"></i>Reservada por você</span>
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200"><i className="fa-solid fa-eye-slash mr-1"></i>Confidencial</span>
                        </div>

                        {vagasFiltradas.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <i className="fa-solid fa-briefcase text-4xl mb-3 block text-gray-200"></i>
                                Nenhuma vaga com esses filtros. Tente outra área, período maior ou "Forçar nova captura".
                            </div>
                        ) : view === 'vagas' ? (
                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                                            <Th k="empresa">Empresa</Th><Th k="titulo">Vaga</Th><Th k="local">Local / Modalidade</Th><Th k="data">Publicada</Th><Th k="fonte">Fonte</Th><Th k="status">Na base?</Th>
                                            <th className="p-3 text-right">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {paginaVagas.map(v => (
                                            <tr key={v.id} className={`hover:bg-gray-50 ${v.match.status === 'outro' ? 'bg-amber-50/30' : ''} ${v.confidencial ? 'text-gray-400' : ''}`}>
                                                <td className="p-3">
                                                    <div className={`font-medium ${v.confidencial ? 'italic' : 'text-gray-800'}`}>{v.empresa_nome || 'Confidencial'}</div>
                                                    {v.empresa_url
                                                        ? <a href={v.empresa_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline"><i className={`${v.fonte === 'linkedin' ? 'fa-brands fa-linkedin' : 'fa-solid fa-arrow-up-right-from-square'} mr-1`}></i>{v.empresa_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
                                                        : v.empresa_dominio ? <span className="text-xs text-gray-500"><i className="fa-solid fa-globe mr-1"></i>{v.empresa_dominio}</span>
                                                        : !v.confidencial && <span className="text-xs text-gray-400"><i className="fa-solid fa-globe mr-1"></i>domínio: resolver ao salvar</span>}
                                                </td>
                                                <td className="p-3">
                                                    <a href={v.vaga_url} target="_blank" rel="noreferrer" className="text-gray-800 hover:text-blue-600 hover:underline">{v.titulo}</a>
                                                    <div className="text-[11px] text-gray-400">
                                                        {[v.senioridade, v.regime, ...(v.stack?.slice(0, 4) || [])].filter(Boolean).join(' · ')}
                                                        {v.area !== 'tecnologia' && <span className="ml-1">· área: {AREAS.find(a => a.id === v.area)?.label}</span>}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-gray-700 whitespace-nowrap">{v.cidade ? `${v.cidade}${v.uf ? '/' + v.uf : ''}` : (v.uf || '—')}{modalidadeBadge(v.modalidade)}</td>
                                                <td className="p-3 text-gray-700 whitespace-nowrap">
                                                    {fmtData(v.publicado_em)}
                                                    {v.dias_publicada != null && (
                                                        v.envelhecendo
                                                            ? <div className="text-[11px] text-red-600 font-medium"><i className="fa-solid fa-fire mr-1"></i>há {v.dias_publicada} dias — envelhecendo</div>
                                                            : <div className="text-[11px] text-gray-400">{v.dias_publicada === 0 ? 'hoje' : `há ${v.dias_publicada} dia${v.dias_publicada === 1 ? '' : 's'}`}</div>
                                                    )}
                                                </td>
                                                <td className="p-3"><span className={`text-[11px] px-2 py-0.5 rounded border ${FONTE_BADGE[v.fonte]}`}>{FONTE_LABEL[v.fonte]}</span></td>
                                                <td className="p-3">
                                                    <StatusBadge m={v.match} admin={isAdmin} />
                                                    {v.match.detalhe && <div className="text-[10px] text-gray-400 mt-0.5 max-w-[160px]">{v.match.detalhe}</div>}
                                                </td>
                                                <td className="p-3 text-right">{botaoAcao(v)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                                            <th className="p-3">Empresa</th><th className="p-3">Vagas abertas</th><th className="p-3">Áreas</th><th className="p-3">Fontes</th><th className="p-3">Mais antiga</th><th className="p-3">Na base?</th><th className="p-3 text-right">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {paginaEmpresas.map(g => (
                                            <tr key={g.exemplo.empresa_nome_norm} className={`hover:bg-gray-50 ${g.match.status === 'outro' ? 'bg-amber-50/30' : ''}`}>
                                                <td className="p-3">
                                                    <div className="font-medium text-gray-800">{g.nome}</div>
                                                    {g.url && <a href={g.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{g.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>}
                                                </td>
                                                <td className="p-3"><span className="font-semibold text-gray-800">{g.vagas.length}</span> <span className="text-xs text-gray-400">({g.vagas.slice(0, 3).map(v => v.titulo).join(', ').slice(0, 80)}{g.vagas.length > 3 ? '…' : ''})</span></td>
                                                <td className="p-3 text-xs">{[...g.areas].map(a => AREAS.find(x => x.id === a)?.label.split(' /')[0]).join(' · ')}</td>
                                                <td className="p-3 text-xs flex flex-wrap gap-1">{[...g.fontes].map(f => <span key={f} className={`px-1.5 py-0.5 rounded border ${FONTE_BADGE[f]}`}>{FONTE_LABEL[f]}</span>)}</td>
                                                <td className="p-3 text-xs text-gray-600 whitespace-nowrap">{g.maisAntiga == null ? '—' : <span className={g.maisAntiga >= 30 ? 'text-red-600 font-medium' : ''}>{g.maisAntiga >= 30 && <i className="fa-solid fa-fire mr-1"></i>}há {g.maisAntiga} dias</span>}</td>
                                                <td className="p-3"><StatusBadge m={g.match} admin={isAdmin} /></td>
                                                <td className="p-3 text-right">{botaoAcao(g.exemplo)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* PAGINAÇÃO */}
                        {totalPaginas > 1 && (
                            <div className="flex justify-between items-center mt-3 text-sm">
                                <span className="text-gray-500">Página {pagina} de {totalPaginas}</span>
                                <div className="flex gap-1">
                                    <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"><i className="fa-solid fa-chevron-left"></i> Anterior</button>
                                    <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">Próxima <i className="fa-solid fa-chevron-right"></i></button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!resultado && !loading && !erro && (
                    <div className="text-center py-16 text-gray-400">
                        <i className="fa-solid fa-briefcase text-6xl mb-4 block text-blue-200"></i>
                        <p className="text-lg font-medium">Escolha as áreas e clique em "Buscar vagas"</p>
                        <p className="text-sm mt-1">A primeira busca do dia raspa as fontes (~5–15s); as seguintes usam o cache de 24h.</p>
                        <p className="text-xs mt-3 text-gray-300"><i className="fa-solid fa-shield-halved mr-1"></i>Fontes públicas, sem login — nenhum dado pessoal coletado</p>
                    </div>
                )}
            </>
            )}

            {/* ABA: EMPRESAS SALVAS */}
            {aba === 'salvas' && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <button onClick={carregarSalvas} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"><i className="fa-solid fa-rotate mr-1"></i>Atualizar</button>
                        <span className="ml-auto text-xs text-gray-400">{salvas.length} empresa{salvas.length === 1 ? '' : 's'}{isAdmin ? ' — toda a equipe' : ''}</span>
                    </div>
                    {loadingSalvas ? (
                        <div className="text-center py-10 text-gray-400"><i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Carregando…</div>
                    ) : salvas.length === 0 ? (
                        <div className="text-center py-12 text-gray-400"><i className="fa-solid fa-bookmark text-4xl mb-3 block text-gray-200"></i>Nenhuma empresa salva ainda. Use "Salvar p/ prospectar" na aba Buscar vagas.</div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                                        <th className="p-3">Empresa</th><th className="p-3">Vaga-gatilho</th>{isAdmin && <th className="p-3">Analista</th>}<th className="p-3">Salva em</th><th className="p-3">Observação</th><th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {salvas.map(s => (
                                        <tr key={s.id} className={`hover:bg-gray-50 ${s.status === 'descartada' ? 'text-gray-400' : ''}`}>
                                            <td className="p-3">
                                                <div className="font-medium text-gray-800">{s.empresa_nome}</div>
                                                <div className="text-xs text-gray-500">{s.empresa_dominio ? <><i className="fa-solid fa-globe mr-1"></i>{s.empresa_dominio}</> : <span className="text-gray-400">sem domínio</span>}
                                                    {s.email_empresa_id && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">Base de Leads #{s.email_empresa_id}</span>}
                                                </div>
                                            </td>
                                            <td className="p-3 text-xs">{s.vaga ? <a href={s.vaga.vaga_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{s.vaga.titulo}</a> : '—'}{s.vaga && <div className="text-gray-400">{FONTE_LABEL[s.vaga.fonte]} · {fmtData(s.vaga.publicado_em)}</div>}</td>
                                            {isAdmin && <td className="p-3 text-xs text-gray-600">{s.salvo_por_nome}</td>}
                                            <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{fmtDataHora(s.salvo_em)}</td>
                                            <td className="p-3 text-xs text-gray-600 max-w-[220px]">{s.observacao || '—'}</td>
                                            <td className="p-3">
                                                <select value={s.status} onChange={e => atualizarSalva(s.id, e.target.value as EmpresaSalva['status'])} className="text-xs border border-gray-300 rounded px-2 py-1">
                                                    <option value="salva">Salva</option><option value="prospectando">Prospectando</option><option value="descartada">Descartada</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL: SALVAR */}
            {modalSalvar && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => !salvando && setModalSalvar(null)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-gray-800"><i className="fa-solid fa-bookmark text-blue-600 mr-2"></i>Salvar empresa para prospectar</h3>
                            <button onClick={() => setModalSalvar(null)} className="text-gray-400 hover:text-gray-600"><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div className="text-sm text-gray-700 mb-3">Empresa: <b>{modalSalvar.empresa_nome}</b>
                            {modalSalvar.match.status === 'livre' && <div className="text-xs text-emerald-700 mt-1"><i className="fa-solid fa-link mr-1"></i>Já existe na Base de Leads sem dono — será vinculada e reservada para você.</div>}
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-sm">
                            <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Domínio da empresa <span className="text-gray-400">(opcional)</span></label>
                                <input type="text" value={dominioInput} onChange={e => setDominio(e.target.value)} placeholder="ex.: empresa.com.br" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                {!dominioInput.trim() && (
                                    <label className="text-xs text-gray-600 flex items-center gap-1.5 mt-1 cursor-pointer">
                                        <input type="checkbox" checked={resolverDom} onChange={e => setResolverDom(e.target.checked)} /> Descobrir o domínio automaticamente (Gemini + Google, ~5s)
                                    </label>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Observação <span className="text-gray-400">(opcional)</span></label>
                                <input type="text" value={obsInput} onChange={e => setObs(e.target.value)} placeholder="Ex: 14 vagas dev abertas, foco Java/Flutter" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                            </div>
                            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2">
                                <i className="fa-solid fa-user-tag text-blue-500 mr-1"></i>Será reservada para <b>{currentUser?.nome_usuario}</b> e aparecerá na Base de Leads › Empresas com origem <code>vagas_publicadas</code>, com a vaga-gatilho vinculada.
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setModalSalvar(null)} disabled={salvando} className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                            <button onClick={confirmarSalvar} disabled={salvando} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {salvando ? <><i className="fa-solid fa-spinner fa-spin mr-1"></i>Salvando…</> : <><i className="fa-solid fa-check mr-1"></i>Salvar e reservar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: BLOQUEIO DE TERRITÓRIO */}
            {modalBloqueio && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setBloqueio(null)}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 border-t-4 border-amber-400" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-2">
                            <i className="fa-solid fa-lock text-amber-500 text-2xl"></i>
                            <h3 className="font-semibold text-gray-800">Empresa em território de outro analista</h3>
                        </div>
                        <p className="text-sm text-gray-700"><b>{modalBloqueio.empresa}</b> já está na base{modalBloqueio.dono ? <>, reservada por <b>{modalBloqueio.dono}</b></> : ''}.</p>
                        {modalBloqueio.detalhe && <p className="text-xs text-gray-500 mt-1">{modalBloqueio.detalhe}</p>}
                        <p className="text-xs text-gray-500 mt-2">Regra de território: não é possível salvar nem prospectar. Se houver acordo comercial, solicite a redistribuição ao Administrador.</p>
                        <div className="flex justify-end mt-4"><button onClick={() => setBloqueio(null)} className="text-xs px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800">Entendi</button></div>
                    </div>
                </div>
            )}

            {/* TOAST */}
            {toast && (
                <div className={`fixed bottom-6 right-6 text-white text-sm px-4 py-3 rounded-lg shadow-lg z-50 ${toast.tipo === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    <i className={`fa-solid ${toast.tipo === 'ok' ? 'fa-check' : 'fa-triangle-exclamation'} mr-2`}></i>{toast.msg}
                </div>
            )}
        </div>
    );
};

export default VagasPublicadasPage;
