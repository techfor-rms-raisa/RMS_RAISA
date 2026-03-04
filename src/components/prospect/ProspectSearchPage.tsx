/**
 * src/components/prospect/ProspectSearchPage.tsx
 *
 * Prospect — Dual Engine v2.0
 * Motor duplo: Apollo + Snov.io com fallback cruzado
 *
 * NOVO v2.0 (04/03/2026):
 * - Aba "Nova Busca"  → busca + salvar selecionados no Supabase
 * - Aba "Leads Salvos" → filtros: usuário, empresa/domínio (match parcial), status, motor
 * - Atualização inline de status na aba de consulta
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useProspectLeads, ProspectLead } from '../../hooks/supabase/useProspectLeads';
import { supabase } from '../../config/supabase';

// ============================================
// TIPOS
// ============================================
interface ProspectResult {
    apollo_id?:        string;
    snovio_id?:        string;
    nome_completo:     string;
    primeiro_nome:     string;
    ultimo_nome:       string;
    cargo:             string;
    email:             string | null;
    email_status:      string | null;
    linkedin_url:      string | null;
    foto_url:          string | null;
    empresa_nome:      string;
    empresa_dominio?:  string;
    empresa_setor:     string | null;
    empresa_porte:     number | null;
    empresa_linkedin:  string | null;
    empresa_website:   string | null;
    cidade:            string | null;
    estado:            string | null;
    pais:              string | null;
    senioridade:       string | null;
    departamentos:     string[];
    fonte:             'apollo' | 'snovio' | 'ambos';
    enriquecido:       boolean;
    selecionado?:      boolean;
}

interface SearchState {
    loading: boolean;
    motor:   'apollo' | 'snovio' | null;
    error:   string | null;
}

interface AppUser { id: number; nome_usuario: string; }

// ============================================
// CONSTANTES
// ============================================
const DEPARTAMENTOS = [
    { id: 'ti_tecnologia',         label: 'TI / Tecnologia',        icon: 'fa-solid fa-microchip' },
    { id: 'compras_procurement',   label: 'Compras / Procurement',  icon: 'fa-solid fa-cart-shopping' },
    { id: 'infraestrutura',        label: 'Infraestrutura',         icon: 'fa-solid fa-server' },
    { id: 'governanca_compliance', label: 'Governança / Compliance',icon: 'fa-solid fa-shield-halved' },
    { id: 'rh_recursos_humanos',   label: 'RH / Recursos Humanos',  icon: 'fa-solid fa-people-group' },
    { id: 'comercial_vendas',      label: 'Comercial / Vendas',     icon: 'fa-solid fa-handshake' },
    { id: 'financeiro',            label: 'Financeiro',             icon: 'fa-solid fa-coins' },
    { id: 'diretoria_clevel',      label: 'Diretoria / C-Level',    icon: 'fa-solid fa-crown' },
];

const SENIORIDADES = [
    { id: 'c_level',        label: 'C-Level (CEO, CTO, CIO...)' },
    { id: 'vp',             label: 'VP / Vice-Presidente' },
    { id: 'diretor',        label: 'Diretor' },
    { id: 'gerente',        label: 'Gerente' },
    { id: 'coordenador',    label: 'Coordenador' },
    { id: 'superintendente',label: 'Superintendente' },
];

const STATUS_LEAD = [
    { id: 'novo',          label: 'Novo',          cor: 'bg-gray-100 text-gray-700' },
    { id: 'contatado',     label: 'Contatado',     cor: 'bg-blue-100 text-blue-700' },
    { id: 'em_negociacao', label: 'Em Negociação', cor: 'bg-yellow-100 text-yellow-700' },
    { id: 'convertido',    label: 'Convertido',    cor: 'bg-green-100 text-green-700' },
    { id: 'descartado',    label: 'Descartado',    cor: 'bg-red-100 text-red-700' },
];

const POR_PAGINA = 50;

// ============================================
// HELPERS
// ============================================
function BadgeFonte({ fonte }: { fonte: string }) {
    const map: Record<string, string> = {
        apollo: 'bg-purple-100 text-purple-700',
        snovio: 'bg-green-100 text-green-700',
        ambos:  'bg-blue-100 text-blue-700',
    };
    const label = fonte === 'apollo' ? 'Apollo' : fonte === 'snovio' ? 'Snov.io' : 'Ambos';
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${map[fonte] || 'bg-gray-100 text-gray-500'}`}>
            {label}
        </span>
    );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const ProspectSearchPage: React.FC = () => {
    const { currentUser } = useAuth();
    const {
        leads, total,
        loading: loadingLeads,
        saving,
        buscarLeads, salvarLeads, atualizarStatus,
    } = useProspectLeads();

    // ── ABA ATIVA ─────────────────────────────────────────
    const [aba, setAba] = useState<'busca' | 'consulta'>('busca');

    // ── ESTADOS BUSCA ─────────────────────────────────────
    const [domain,                    setDomain]                    = useState('');
    const [departamentosSelecionados, setDepartamentosSelecionados] = useState<string[]>([]);
    const [senioridadesSelecionadas,  setSenioridadesSelecionadas]  = useState<string[]>([]);
    const [enriquecerApollo,          setEnriquecerApollo]          = useState(true);
    const [buscarEmailsSnovio,        setBuscarEmailsSnovio]        = useState(true);
    const [filtrarBrasil,             setFiltrarBrasil]             = useState(true);
    const [resultados,                setResultados]                = useState<ProspectResult[]>([]);
    const [searchState,               setSearchState]               = useState<SearchState>({ loading: false, motor: null, error: null });
    const [creditosConsumidos,        setCreditosConsumidos]        = useState({ apollo: 0, snovio: 0 });
    const [empresaInfo,               setEmpresaInfo]               = useState<any>(null);
    const [todosSelecionados,         setTodosSelecionados]         = useState(false);
    const [toastSave,                 setToastSave]                 = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

    // ── ESTADOS CONSULTA ──────────────────────────────────
    const [filtroUsuario, setFiltroUsuario] = useState<string>('todos');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroStatus,  setFiltroStatus]  = useState('');
    const [filtroMotor,   setFiltroMotor]   = useState('');
    const [filtroPagina,  setFiltroPagina]  = useState(1);
    const [listaUsuarios, setListaUsuarios] = useState<AppUser[]>([]);

    // ── CARREGAR USUÁRIOS para o select ───────────────────
    useEffect(() => {
        supabase
            .from('app_users')
            .select('id, nome_usuario')
            .eq('ativo_usuario', true)
            .order('nome_usuario')
            .then(({ data }) => setListaUsuarios(data || []));
    }, []);

    // ── CARREGAR LEADS ao entrar na aba Consulta ──────────
    useEffect(() => {
        if (aba === 'consulta') executarConsulta();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aba]);

    const executarConsulta = useCallback(() => {
        buscarLeads({
            user_id:         filtroUsuario === 'todos' ? 'todos' : Number(filtroUsuario),
            empresa_dominio: filtroEmpresa.trim() || undefined,
            empresa_nome:    filtroEmpresa.trim() || undefined,
            status:          filtroStatus  || undefined,
            motor:           filtroMotor   || undefined,
            pagina:          filtroPagina,
            por_pagina:      POR_PAGINA,
        });
    }, [buscarLeads, filtroUsuario, filtroEmpresa, filtroStatus, filtroMotor, filtroPagina]);

    // ── HANDLERS SELEÇÃO BUSCA ────────────────────────────
    const toggleDepartamento = (id: string) =>
        setDepartamentosSelecionados(prev =>
            prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

    const toggleSenioridade = (id: string) =>
        setSenioridadesSelecionadas(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

    const toggleSelecionado = (index: number) =>
        setResultados(prev => {
            const u = [...prev];
            u[index] = { ...u[index], selecionado: !u[index].selecionado };
            return u;
        });

    const toggleTodos = () => {
        const novo = !todosSelecionados;
        setTodosSelecionados(novo);
        setResultados(prev => prev.map(r => ({ ...r, selecionado: novo })));
    };

    const selecionadosCount = resultados.filter(r => r.selecionado).length;

    // ── BUSCAR APOLLO ─────────────────────────────────────
    const buscarApollo = useCallback(async () => {
        if (!domain.trim()) return;
        setSearchState({ loading: true, motor: 'apollo', error: null });
        setResultados([]);
        try {
            const res  = await fetch('/api/prospect-apollo-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain:          domain.trim(),
                    departamentos:   departamentosSelecionados,
                    senioridades:    senioridadesSelecionadas,
                    enriquecer:      enriquecerApollo,
                    filtrar_brasil:  filtrarBrasil,
                    max_resultados:  25,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setResultados(data.resultados.map((r: ProspectResult) => ({ ...r, selecionado: false })));
                setCreditosConsumidos(prev => ({ ...prev, apollo: prev.apollo + (data.creditos_consumidos || 0) }));
                setSearchState({ loading: false, motor: 'apollo', error: null });
            } else {
                setSearchState({ loading: false, motor: 'apollo', error: data.error || 'Erro Apollo' });
            }
        } catch (err: any) {
            setSearchState({ loading: false, motor: 'apollo', error: err.message });
        }
    }, [domain, departamentosSelecionados, senioridadesSelecionadas, enriquecerApollo, filtrarBrasil]);

    // ── BUSCAR SNOV.IO ────────────────────────────────────
    const buscarSnovio = useCallback(async () => {
        if (!domain.trim()) return;
        setSearchState({ loading: true, motor: 'snovio', error: null });
        setResultados([]);
        try {
            const res  = await fetch('/api/prospect-snovio-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain:          domain.trim(),
                    departamentos:   departamentosSelecionados,
                    senioridades:    senioridadesSelecionadas,
                    buscar_emails:   buscarEmailsSnovio,
                    filtrar_brasil:  filtrarBrasil,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setResultados(data.resultados.map((r: ProspectResult) => ({ ...r, selecionado: false })));
                setCreditosConsumidos(prev => ({ ...prev, snovio: prev.snovio + (data.creditos_consumidos || 0) }));
                setEmpresaInfo(data.empresa);
                setSearchState({ loading: false, motor: 'snovio', error: null });
            } else {
                setSearchState({ loading: false, motor: 'snovio', error: data.error || 'Erro Snov.io' });
            }
        } catch (err: any) {
            setSearchState({ loading: false, motor: 'snovio', error: err.message });
        }
    }, [domain, departamentosSelecionados, senioridadesSelecionadas, buscarEmailsSnovio, filtrarBrasil]);

    // ── FALLBACK EMAIL ────────────────────────────────────
    const buscarEmailFallback = useCallback(async (index: number) => {
        const prospect = resultados[index];
        if (!prospect || prospect.email) return;
        const motorAlt = prospect.fonte === 'apollo' ? 'snovio' : 'apollo';

        setResultados(prev => {
            const u = [...prev];
            u[index] = { ...u[index], email_status: 'buscando...' };
            return u;
        });

        try {
            let match: any = null;

            if (motorAlt === 'snovio') {
                const res  = await fetch('/api/prospect-snovio-search', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: domain.trim(), buscar_emails: true, departamentos: [] }),
                });
                const data = await res.json();
                match = data.success && (data.resultados || []).find((r: any) =>
                    r.primeiro_nome?.toLowerCase() === prospect.primeiro_nome?.toLowerCase() && r.email);
                if (match) setCreditosConsumidos(prev => ({ ...prev, snovio: prev.snovio + 1 }));
            } else {
                const res  = await fetch('/api/prospect-apollo-search', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: domain.trim(), departamentos: [], enriquecer: true, max_resultados: 5 }),
                });
                const data = await res.json();
                match = data.success && (data.resultados || []).find((r: any) =>
                    r.primeiro_nome?.toLowerCase() === prospect.primeiro_nome?.toLowerCase() && r.email);
                if (match) setCreditosConsumidos(prev => ({ ...prev, apollo: prev.apollo + 1 }));
            }

            setResultados(prev => {
                const u = [...prev];
                u[index] = match
                    ? { ...u[index], email: match.email, email_status: match.email_status || 'found', fonte: 'ambos' }
                    : { ...u[index], email_status: 'not_found' };
                return u;
            });
        } catch {
            setResultados(prev => {
                const u = [...prev];
                u[index] = { ...u[index], email_status: 'error' };
                return u;
            });
        }
    }, [resultados, domain]);

    // ── SALVAR SELECIONADOS ───────────────────────────────
    const handleSalvar = useCallback(async () => {
        if (!currentUser?.id) return;
        const selecionados = resultados.filter(r => r.selecionado);
        if (!selecionados.length) return;

        const filtrosBusca = {
            departamentos:   departamentosSelecionados,
            senioridades:    senioridadesSelecionadas,
            filtrar_brasil:  filtrarBrasil,
            dominio_buscado: domain.trim(),
        };

        const { salvos } = await salvarLeads(selecionados, currentUser.id, filtrosBusca);

        if (salvos > 0) {
            setToastSave({ tipo: 'ok', msg: `${salvos} lead${salvos > 1 ? 's' : ''} salvo${salvos > 1 ? 's' : ''} com sucesso!` });
        } else {
            setToastSave({ tipo: 'erro', msg: 'Erro ao salvar. Verifique o console.' });
        }
        setTimeout(() => setToastSave(null), 4500);
    }, [resultados, currentUser, departamentosSelecionados, senioridadesSelecionadas, filtrarBrasil, domain, salvarLeads]);

    // ── PAGINAÇÃO ─────────────────────────────────────────
    const totalPaginas = Math.ceil(total / POR_PAGINA);
    const irParaPagina = (p: number) => {
        setFiltroPagina(p);
        buscarLeads({
            user_id:         filtroUsuario === 'todos' ? 'todos' : Number(filtroUsuario),
            empresa_dominio: filtroEmpresa.trim() || undefined,
            empresa_nome:    filtroEmpresa.trim() || undefined,
            status:          filtroStatus  || undefined,
            motor:           filtroMotor   || undefined,
            pagina:          p,
            por_pagina:      POR_PAGINA,
        });
    };

    // ============================================
    // RENDER ABA BUSCA — tabela de resultados
    // ============================================
    const renderTabelaBusca = () => (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Barra de ações */}
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-700">
                        {resultados.length} lead{resultados.length !== 1 ? 's' : ''} encontrado{resultados.length !== 1 ? 's' : ''}
                    </span>
                    {selecionadosCount > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                            {selecionadosCount} selecionado{selecionadosCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <button
                    onClick={handleSalvar}
                    disabled={selecionadosCount === 0 || saving}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                >
                    {saving
                        ? <><i className="fa-solid fa-spinner fa-spin"></i> Salvando...</>
                        : <><i className="fa-solid fa-floppy-disk"></i> Salvar Selecionados ({selecionadosCount})</>
                    }
                </button>
            </div>

            {/* Toast */}
            {toastSave && (
                <div className={`mx-4 mt-3 text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                    toastSave.tipo === 'ok'
                        ? 'bg-green-50 border border-green-300 text-green-800'
                        : 'bg-red-50 border border-red-300 text-red-800'
                }`}>
                    <i className={`fa-solid ${toastSave.tipo === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
                    {toastSave.msg}
                </div>
            )}

            {/* Tabela */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-100 text-left">
                            <th className="px-3 py-2 w-8">
                                <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} className="w-4 h-4 rounded" />
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600">NOME</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600">CARGO</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600">SETOR</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">PORTE</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMAIL</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">LINKEDIN</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">FONTE</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">AÇÕES</th>
                        </tr>
                    </thead>
                    <tbody>
                        {resultados.map((p, idx) => (
                            <tr key={`${p.apollo_id || p.snovio_id || idx}`} className="border-b hover:bg-gray-50">
                                <td className="px-3 py-2">
                                    <input type="checkbox" checked={p.selecionado || false} onChange={() => toggleSelecionado(idx)} className="w-4 h-4 rounded" />
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        {p.foto_url
                                            ? <img src={p.foto_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                                            : <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">{p.primeiro_nome?.[0] || '?'}</div>
                                        }
                                        <span className="font-medium text-gray-800">{p.nome_completo}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={p.cargo}>{p.cargo}</td>
                                <td className="px-3 py-2 text-gray-600">{p.empresa_nome}</td>
                                <td className="px-3 py-2 text-gray-500 text-xs">{p.empresa_setor || '—'}</td>
                                <td className="px-3 py-2 text-center text-gray-500 text-xs">
                                    {p.empresa_porte ? p.empresa_porte.toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-2">
                                    {p.email ? (
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-gray-700">{p.email}</span>
                                            {p.email_status === 'verified' && <i className="fa-solid fa-circle-check text-green-500 text-xs" title="Verificado"></i>}
                                        </div>
                                    ) : p.email_status === 'buscando...' ? (
                                        <span className="text-xs text-yellow-600"><i className="fa-solid fa-spinner fa-spin mr-1"></i>Buscando...</span>
                                    ) : p.email_status === 'not_found' ? (
                                        <span className="text-xs text-red-400">Não encontrado</span>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                    {p.linkedin_url ? (
                                        <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                                            <i className="fa-brands fa-linkedin text-lg"></i>
                                        </a>
                                    ) : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <BadgeFonte fonte={p.fonte} />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    {!p.email && p.email_status !== 'buscando...' && p.email_status !== 'not_found' && (
                                        <button
                                            onClick={() => buscarEmailFallback(idx)}
                                            className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                                            title={`Buscar email via ${p.fonte === 'apollo' ? 'Snov.io' : 'Apollo'}`}
                                        >
                                            <i className="fa-solid fa-magnifying-glass mr-1"></i>Email
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // ============================================
    // RENDER ABA LEADS SALVOS
    // ============================================
    const renderLeadsSalvos = () => (
        <div>
            {/* Painel de filtros */}
            <div className="bg-white rounded-lg shadow-md p-5 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                    <i className="fa-solid fa-filter mr-2 text-blue-500"></i>Filtros
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Usuário */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Usuário / Analista</label>
                        <select
                            value={filtroUsuario}
                            onChange={e => setFiltroUsuario(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="todos">— Todos os usuários —</option>
                            {listaUsuarios.map(u => (
                                <option key={u.id} value={String(u.id)}>{u.nome_usuario}</option>
                            ))}
                        </select>
                    </div>

                    {/* Empresa / Domínio (match parcial — busca em ambos os campos) */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Empresa ou Domínio
                            <span className="text-gray-400 font-normal ml-1">(match parcial)</span>
                        </label>
                        <input
                            type="text"
                            value={filtroEmpresa}
                            onChange={e => setFiltroEmpresa(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && executarConsulta()}
                            placeholder="Ex: carrefour, totvs.com.br"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                        <select
                            value={filtroStatus}
                            onChange={e => setFiltroStatus(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">— Todos os status —</option>
                            {STATUS_LEAD.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Motor */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Motor de Busca</label>
                        <select
                            value={filtroMotor}
                            onChange={e => setFiltroMotor(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">— Todos —</option>
                            <option value="apollo">Apollo</option>
                            <option value="snovio">Snov.io</option>
                            <option value="ambos">Ambos</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => { setFiltroPagina(1); executarConsulta(); }}
                        disabled={loadingLeads}
                        className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                    >
                        {loadingLeads
                            ? <><i className="fa-solid fa-spinner fa-spin"></i> Consultando...</>
                            : <><i className="fa-solid fa-magnifying-glass"></i> Consultar</>
                        }
                    </button>
                    <button
                        onClick={() => {
                            setFiltroUsuario('todos');
                            setFiltroEmpresa('');
                            setFiltroStatus('');
                            setFiltroMotor('');
                            setFiltroPagina(1);
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                        <i className="fa-solid fa-rotate-left mr-1.5"></i>Limpar filtros
                    </button>
                </div>
            </div>

            {/* Tabela de leads salvos */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Cabeçalho da tabela */}
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">
                        {loadingLeads
                            ? 'Carregando...'
                            : `${total} lead${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`
                        }
                    </span>

                    {/* Paginação */}
                    {totalPaginas > 1 && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>Página {filtroPagina} de {totalPaginas}</span>
                            <button
                                onClick={() => irParaPagina(filtroPagina - 1)}
                                disabled={filtroPagina <= 1 || loadingLeads}
                                className="w-7 h-7 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40 flex items-center justify-center font-bold"
                            >‹</button>
                            <button
                                onClick={() => irParaPagina(filtroPagina + 1)}
                                disabled={filtroPagina >= totalPaginas || loadingLeads}
                                className="w-7 h-7 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40 flex items-center justify-center font-bold"
                            >›</button>
                        </div>
                    )}
                </div>

                {/* Estado de carregamento */}
                {loadingLeads ? (
                    <div className="p-14 text-center text-gray-400">
                        <i className="fa-solid fa-spinner fa-spin text-3xl mb-3 block"></i>
                        <p className="text-sm">Carregando leads...</p>
                    </div>
                ) : leads.length === 0 ? (
                    <div className="p-14 text-center text-gray-400">
                        <i className="fa-solid fa-database text-4xl mb-3 block opacity-40"></i>
                        <p className="text-sm font-medium">Nenhum lead encontrado com estes filtros.</p>
                        <p className="text-xs mt-1">Tente ajustar os filtros ou realize uma nova busca.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">NOME</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">CARGO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA / DOMÍNIO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMAIL</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">FONTE</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">STATUS</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">BUSCADO POR</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">DATA</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">LI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map((lead: ProspectLead) => (
                                    <tr key={lead.id} className="border-b hover:bg-gray-50 transition-colors">
                                        {/* NOME */}
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                                {lead.foto_url
                                                    ? <img src={lead.foto_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                                    : <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px] font-bold flex-shrink-0">
                                                        {lead.nome_completo?.[0] || '?'}
                                                      </div>
                                                }
                                                <span className="font-medium text-gray-800 text-xs leading-tight">{lead.nome_completo}</span>
                                            </div>
                                        </td>

                                        {/* CARGO */}
                                        <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[160px]">
                                            <span className="block truncate" title={lead.cargo || ''}>{lead.cargo || '—'}</span>
                                        </td>

                                        {/* EMPRESA / DOMÍNIO */}
                                        <td className="px-3 py-2.5 text-xs">
                                            <div className="font-medium text-gray-700">{lead.empresa_nome || '—'}</div>
                                            {lead.empresa_dominio && (
                                                <div className="text-gray-400 text-[10px] mt-0.5">{lead.empresa_dominio}</div>
                                            )}
                                        </td>

                                        {/* EMAIL */}
                                        <td className="px-3 py-2.5 text-xs">
                                            {lead.email ? (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-gray-700">{lead.email}</span>
                                                    {(lead.email_status === 'verified' || lead.email_status === 'valid') && (
                                                        <i className="fa-solid fa-circle-check text-green-500 text-[10px]" title="Verificado"></i>
                                                    )}
                                                </div>
                                            ) : <span className="text-gray-400">—</span>}
                                        </td>

                                        {/* FONTE */}
                                        <td className="px-3 py-2.5 text-center">
                                            <BadgeFonte fonte={lead.motor} />
                                        </td>

                                        {/* STATUS — editável inline */}
                                        <td className="px-3 py-2.5 text-center">
                                            <select
                                                value={lead.status}
                                                onChange={e => atualizarStatus(lead.id, e.target.value as ProspectLead['status'])}
                                                className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white cursor-pointer hover:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                                            >
                                                {STATUS_LEAD.map(s => (
                                                    <option key={s.id} value={s.id}>{s.label}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* BUSCADO POR */}
                                        <td className="px-3 py-2.5 text-xs text-gray-500">
                                            {lead.buscado_por_nome || `#${lead.buscado_por}`}
                                        </td>

                                        {/* DATA */}
                                        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                                            {new Date(lead.criado_em).toLocaleDateString('pt-BR')}
                                        </td>

                                        {/* LINKEDIN */}
                                        <td className="px-3 py-2.5 text-center">
                                            {lead.linkedin_url ? (
                                                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                   className="text-blue-600 hover:text-blue-800" title="Abrir LinkedIn">
                                                    <i className="fa-brands fa-linkedin text-base"></i>
                                                </a>
                                            ) : <span className="text-gray-300 text-xs">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // ============================================
    // RENDER PRINCIPAL
    // ============================================
    return (
        <div className="p-6 max-w-full">
            {/* Header */}
            <div className="mb-5">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <i className="fa-solid fa-magnifying-glass-dollar text-blue-600"></i>
                    Prospect — Dual Engine
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Busca inteligente de decisores B2B com Apollo + Snov.io
                </p>
            </div>

            {/* Abas */}
            <div className="flex border-b border-gray-200 mb-6 gap-1">
                <button
                    onClick={() => setAba('busca')}
                    className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        aba === 'busca'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <i className="fa-solid fa-search mr-2"></i>Nova Busca
                </button>
                <button
                    onClick={() => setAba('consulta')}
                    className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                        aba === 'consulta'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    <i className="fa-solid fa-database"></i>
                    Leads Salvos
                    {aba === 'consulta' && total > 0 && (
                        <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                            {total}
                        </span>
                    )}
                </button>
            </div>

            {/* ── ABA: NOVA BUSCA ── */}
            {aba === 'busca' && (
                <>
                    {/* Créditos consumidos na sessão */}
                    {(creditosConsumidos.apollo > 0 || creditosConsumidos.snovio > 0) && (
                        <div className="mb-4 flex gap-3 flex-wrap">
                            {creditosConsumidos.apollo > 0 && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
                                    <i className="fa-solid fa-bolt mr-1"></i>
                                    Apollo: {creditosConsumidos.apollo} crédito{creditosConsumidos.apollo > 1 ? 's' : ''} nesta sessão
                                </span>
                            )}
                            {creditosConsumidos.snovio > 0 && (
                                <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                                    <i className="fa-solid fa-bolt mr-1"></i>
                                    Snov.io: {creditosConsumidos.snovio} crédito{creditosConsumidos.snovio > 1 ? 's' : ''} nesta sessão
                                </span>
                            )}
                        </div>
                    )}

                    {/* Formulário */}
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                        {/* Domínio */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <i className="fa-solid fa-globe mr-2 text-blue-500"></i>
                                Domínio da Empresa
                            </label>
                            <input
                                type="text"
                                value={domain}
                                onChange={e => setDomain(e.target.value)}
                                placeholder="Ex: totvs.com.br, ambev.com.br, magazineluiza.com.br"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                onKeyDown={e => e.key === 'Enter' && buscarApollo()}
                            />
                        </div>

                        {/* Departamentos */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <i className="fa-solid fa-sitemap mr-2 text-blue-500"></i>
                                Departamentos-alvo
                                <span className="text-gray-400 font-normal ml-1">(opcional — se vazio, busca todos)</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {DEPARTAMENTOS.map(dep => (
                                    <button
                                        key={dep.id}
                                        onClick={() => toggleDepartamento(dep.id)}
                                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                            departamentosSelecionados.includes(dep.id)
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        <i className={`${dep.icon} mr-1`}></i>{dep.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Senioridades */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <i className="fa-solid fa-user-tie mr-2 text-blue-500"></i>
                                Senioridade
                                <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {SENIORIDADES.map(sen => (
                                    <button
                                        key={sen.id}
                                        onClick={() => toggleSenioridade(sen.id)}
                                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                            senioridadesSelecionadas.includes(sen.id)
                                                ? 'bg-indigo-600 text-white shadow-md'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {sen.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Opções */}
                        <div className="mb-5 flex flex-wrap gap-6">
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                <input type="checkbox" checked={enriquecerApollo} onChange={e => setEnriquecerApollo(e.target.checked)} className="w-4 h-4 text-purple-600 rounded" />
                                Enriquecer Apollo (1 crédito/pessoa)
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                <input type="checkbox" checked={buscarEmailsSnovio} onChange={e => setBuscarEmailsSnovio(e.target.checked)} className="w-4 h-4 text-green-600 rounded" />
                                Buscar emails Snov.io (1 crédito/email)
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                <input type="checkbox" checked={filtrarBrasil} onChange={e => setFiltrarBrasil(e.target.checked)} className="w-4 h-4 text-yellow-600 rounded" />
                                🇧🇷 Apenas Brasil
                            </label>
                        </div>

                        {/* Botões de busca */}
                        <div className="flex gap-3 flex-wrap">
                            <button
                                onClick={buscarApollo}
                                disabled={!domain.trim() || searchState.loading}
                                className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                            >
                                {searchState.loading && searchState.motor === 'apollo'
                                    ? <><i className="fa-solid fa-spinner fa-spin"></i> Buscando Apollo...</>
                                    : <><i className="fa-solid fa-rocket"></i> Buscar via Apollo</>
                                }
                            </button>
                            <button
                                onClick={buscarSnovio}
                                disabled={!domain.trim() || searchState.loading}
                                className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                            >
                                {searchState.loading && searchState.motor === 'snovio'
                                    ? <><i className="fa-solid fa-spinner fa-spin"></i> Buscando Snov.io...</>
                                    : <><i className="fa-solid fa-envelope-open-text"></i> Buscar via Snov.io</>
                                }
                            </button>
                        </div>
                    </div>

                    {/* Erro */}
                    {searchState.error && (
                        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                            <i className="fa-solid fa-circle-exclamation flex-shrink-0"></i>
                            {searchState.error}
                        </div>
                    )}

                    {/* Info empresa (Snov.io) */}
                    {empresaInfo?.nome && (
                        <div className="mb-4 bg-blue-50 border border-blue-200 px-4 py-3 rounded-lg text-sm">
                            <span className="font-semibold text-blue-800">{empresaInfo.nome}</span>
                            {empresaInfo.setor  && <span className="text-blue-600 ml-3">• {empresaInfo.setor}</span>}
                            {empresaInfo.porte  && <span className="text-blue-600 ml-3">• ~{empresaInfo.porte.toLocaleString()} funcionários</span>}
                        </div>
                    )}

                    {/* Tabela de resultados */}
                    {resultados.length > 0 && renderTabelaBusca()}

                    {/* Estado vazio */}
                    {!searchState.loading && resultados.length === 0 && !searchState.error && (
                        <div className="text-center py-16 text-gray-400">
                            <i className="fa-solid fa-magnifying-glass-dollar text-6xl mb-4 block opacity-30"></i>
                            <p className="text-lg font-medium">Informe o domínio da empresa para começar</p>
                            <p className="text-sm mt-1">Ex: totvs.com.br, ambev.com.br, magazineluiza.com.br</p>
                        </div>
                    )}
                </>
            )}

            {/* ── ABA: LEADS SALVOS ── */}
            {aba === 'consulta' && renderLeadsSalvos()}
        </div>
    );
};

export default ProspectSearchPage;
