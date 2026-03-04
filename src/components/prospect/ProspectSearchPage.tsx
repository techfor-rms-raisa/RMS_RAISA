/**
 * ProspectSearchPage.tsx — Prospect Dual Engine
 * 
 * Página principal do módulo de prospecção B2B
 * Motor duplo: Apollo + Snov.io com fallback cruzado
 * 
 * Versão: 3.0
 * Data: 04/03/2026
 *
 * v3.0:
 * - Aba "Leads Salvos": lista do Supabase com filtros status/empresa
 * - Exportar XLS: gera planilha local sem dependência externa
 * - Exportar XLS também disponível na aba Leads Salvos
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

// ============================================
// TIPOS
// ============================================
interface ProspectResult {
    apollo_id?: string;
    snovio_id?: string;
    nome_completo: string;
    primeiro_nome: string;
    ultimo_nome: string;
    cargo: string;
    email: string | null;
    email_status: string | null;
    linkedin_url: string | null;
    foto_url: string | null;
    empresa_nome: string;
    empresa_dominio?: string;
    empresa_setor: string | null;
    empresa_porte: number | null;
    empresa_linkedin: string | null;
    empresa_website: string | null;
    cidade: string | null;
    estado: string | null;
    pais: string | null;
    senioridade: string | null;
    departamentos: string[];
    fonte: 'apollo' | 'snovio' | 'ambos';
    enriquecido: boolean;
    selecionado?: boolean;
}

interface SearchState {
    loading: boolean;
    motor: 'apollo' | 'snovio' | null;
    error: string | null;
}

interface ProspectLead {
    id: number;
    nome_completo: string;
    cargo: string | null;
    email: string | null;
    empresa_nome: string | null;
    empresa_dominio: string | null;
    empresa_setor: string | null;
    linkedin_url: string | null;
    motor: string;
    status: string;
    criado_em: string;
    senioridade: string | null;
    departamentos: string[];
}

// ============================================
// CONSTANTES
// ============================================
const DEPARTAMENTOS = [
    { id: 'ti_tecnologia', label: 'TI / Tecnologia', icon: 'fa-solid fa-microchip' },
    { id: 'compras_procurement', label: 'Compras / Procurement', icon: 'fa-solid fa-cart-shopping' },
    { id: 'infraestrutura', label: 'Infraestrutura', icon: 'fa-solid fa-server' },
    { id: 'governanca_compliance', label: 'Governança / Compliance', icon: 'fa-solid fa-shield-halved' },
    { id: 'rh_recursos_humanos', label: 'RH / Recursos Humanos', icon: 'fa-solid fa-people-group' },
    { id: 'comercial_vendas', label: 'Comercial / Vendas', icon: 'fa-solid fa-handshake' },
    { id: 'financeiro', label: 'Financeiro', icon: 'fa-solid fa-coins' },
    { id: 'diretoria_clevel', label: 'Diretoria / C-Level', icon: 'fa-solid fa-crown' },
];

const SENIORIDADES = [
    { id: 'c_level', label: 'C-Level (CEO, CTO, CIO...)' },
    { id: 'vp', label: 'VP / Vice-Presidente' },
    { id: 'diretor', label: 'Diretor' },
    { id: 'gerente', label: 'Gerente' },
    { id: 'coordenador', label: 'Coordenador' },
    { id: 'superintendente', label: 'Superintendente' },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const ProspectSearchPage: React.FC = () => {
    const { user: currentUser } = useAuth(); // useAuth expõe 'user', renomeado para currentUser

    // Form state
    const [domain, setDomain] = useState('');
    const [departamentosSelecionados, setDepartamentosSelecionados] = useState<string[]>([]);
    const [senioridadesSelecionadas, setSenioridadesSelecionadas] = useState<string[]>([]);
    const [enriquecerApollo, setEnriquecerApollo] = useState(true);
    const [buscarEmailsSnovio, setBuscarEmailsSnovio] = useState(true);

    // Results state
    const [resultados, setResultados] = useState<ProspectResult[]>([]);
    const [searchState, setSearchState] = useState<SearchState>({ loading: false, motor: null, error: null });
    const [creditosConsumidos, setCreditosConsumidos] = useState({ apollo: 0, snovio: 0 });
    const [saving, setSaving]           = useState(false);
    const [toastMsg, setToastMsg]       = useState<{tipo: 'ok'|'erro'; msg: string} | null>(null);
    // Aba ativa
    const [abaAtiva, setAbaAtiva]       = useState<'busca'|'salvos'>('busca');
    // Leads Salvos
    const [leadsSalvos, setLeadsSalvos] = useState<ProspectLead[]>([]);
    const [loadingSalvos, setLoadingSalvos] = useState(false);
    const [filtroStatus, setFiltroStatus]   = useState('');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [empresaInfo, setEmpresaInfo] = useState<any>(null);

    // Seleção
    const [todosSelecionados, setTodosSelecionados] = useState(false);

    // ============================================
    // TOGGLE DEPARTAMENTO
    // ============================================
    const toggleDepartamento = (id: string) => {
        setDepartamentosSelecionados(prev => 
            prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
        );
    };

    const toggleSenioridade = (id: string) => {
        setSenioridadesSelecionadas(prev => 
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    // ============================================
    // BUSCAR VIA APOLLO
    // ============================================
    const buscarApollo = useCallback(async () => {
        if (!domain.trim()) return;

        setSearchState({ loading: true, motor: 'apollo', error: null });
        setResultados([]);

        try {
            const response = await fetch('/api/prospect-apollo-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: domain.trim(),
                    departamentos: departamentosSelecionados,
                    senioridades: senioridadesSelecionadas,
                    enriquecer: enriquecerApollo,
                    max_resultados: 25
                })
            });

            const data = await response.json();

            if (data.success) {
                setResultados(data.resultados.map((r: ProspectResult) => ({ ...r, selecionado: false })));
                setCreditosConsumidos(prev => ({ ...prev, apollo: prev.apollo + data.creditos_consumidos }));
                setSearchState({ loading: false, motor: 'apollo', error: null });
            } else {
                setSearchState({ loading: false, motor: 'apollo', error: data.error || 'Erro na busca Apollo' });
            }
        } catch (err: any) {
            setSearchState({ loading: false, motor: 'apollo', error: err.message });
        }
    }, [domain, departamentosSelecionados, senioridadesSelecionadas, enriquecerApollo]);

    // ============================================
    // BUSCAR VIA SNOV.IO
    // ============================================
    const buscarSnovio = useCallback(async () => {
        if (!domain.trim()) return;

        setSearchState({ loading: true, motor: 'snovio', error: null });
        setResultados([]);

        try {
            const response = await fetch('/api/prospect-snovio-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: domain.trim(),
                    departamentos: departamentosSelecionados,
                    buscar_emails: buscarEmailsSnovio
                })
            });

            const data = await response.json();

            if (data.success) {
                setResultados(data.resultados.map((r: ProspectResult) => ({ ...r, selecionado: false })));
                setCreditosConsumidos(prev => ({ ...prev, snovio: prev.snovio + data.creditos_consumidos }));
                setEmpresaInfo(data.empresa);
                setSearchState({ loading: false, motor: 'snovio', error: null });
            } else {
                setSearchState({ loading: false, motor: 'snovio', error: data.error || 'Erro na busca Snov.io' });
            }
        } catch (err: any) {
            setSearchState({ loading: false, motor: 'snovio', error: err.message });
        }
    }, [domain, departamentosSelecionados, buscarEmailsSnovio]);

    // ============================================
    // FALLBACK: BUSCAR EMAIL NO MOTOR ALTERNATIVO
    // ============================================
    const buscarEmailFallback = useCallback(async (index: number) => {
        const prospect = resultados[index];
        if (!prospect || prospect.email) return;

        const motorAlternativo = prospect.fonte === 'apollo' ? 'snovio' : 'apollo';

        // Marcar como buscando
        setResultados(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], email_status: 'buscando...' };
            return updated;
        });

        try {
            if (motorAlternativo === 'snovio') {
                // Buscar email via Snov.io Email Finder (nome + domínio)
                const response = await fetch('/api/prospect-snovio-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: domain.trim(),
                        buscar_emails: true,
                        departamentos: []
                    })
                });
                const data = await response.json();
                // Tentar encontrar pelo nome
                if (data.success && data.resultados) {
                    const match = data.resultados.find((r: any) => 
                        r.primeiro_nome?.toLowerCase() === prospect.primeiro_nome?.toLowerCase() &&
                        r.email
                    );
                    if (match) {
                        setResultados(prev => {
                            const updated = [...prev];
                            updated[index] = { 
                                ...updated[index], 
                                email: match.email, 
                                email_status: match.email_status || 'found_via_snovio',
                                fonte: 'ambos'
                            };
                            return updated;
                        });
                        setCreditosConsumidos(prev => ({ ...prev, snovio: prev.snovio + 1 }));
                        return;
                    }
                }
            } else {
                // Buscar via Apollo People Match
                const response = await fetch('/api/prospect-apollo-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: domain.trim(),
                        departamentos: [],
                        enriquecer: true,
                        max_resultados: 5
                    })
                });
                const data = await response.json();
                if (data.success && data.resultados) {
                    const match = data.resultados.find((r: any) => 
                        r.primeiro_nome?.toLowerCase() === prospect.primeiro_nome?.toLowerCase() &&
                        r.email
                    );
                    if (match) {
                        setResultados(prev => {
                            const updated = [...prev];
                            updated[index] = { 
                                ...updated[index], 
                                email: match.email,
                                email_status: match.email_status || 'found_via_apollo',
                                linkedin_url: updated[index].linkedin_url || match.linkedin_url,
                                fonte: 'ambos'
                            };
                            return updated;
                        });
                        setCreditosConsumidos(prev => ({ ...prev, apollo: prev.apollo + 1 }));
                        return;
                    }
                }
            }

            // Não encontrou
            setResultados(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], email_status: 'not_found' };
                return updated;
            });
        } catch (err: any) {
            setResultados(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], email_status: 'error' };
                return updated;
            });
        }
    }, [resultados, domain]);

    // ============================================
    // SELEÇÃO
    // ============================================
    const toggleSelecionado = (index: number) => {
        setResultados(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], selecionado: !updated[index].selecionado };
            return updated;
        });
    };

    const toggleTodos = () => {
        const novoValor = !todosSelecionados;
        setTodosSelecionados(novoValor);
        setResultados(prev => prev.map(r => ({ ...r, selecionado: novoValor })));
    };

    const selecionadosCount = resultados.filter(r => r.selecionado).length;

    // ============================================
    // RENDER
    // ============================================
    // ── CARREGAR LEADS SALVOS ────────────────────────────
    const carregarLeadsSalvos = useCallback(async () => {
        setLoadingSalvos(true);
        try {
            const params = new URLSearchParams();
            if (filtroStatus)  params.set('status',  filtroStatus);
            if (filtroEmpresa) params.set('empresa', filtroEmpresa);
            const res = await fetch(`/api/prospect-leads?${params}`);
            const data = await res.json();
            if (data.success) setLeadsSalvos(data.leads || []);
        } catch (e) {
            console.error('Erro ao carregar leads salvos:', e);
        } finally {
            setLoadingSalvos(false);
        }
    }, [filtroStatus, filtroEmpresa]);

    useEffect(() => {
        if (abaAtiva === 'salvos') carregarLeadsSalvos();
    }, [abaAtiva, carregarLeadsSalvos]);

    // ── EXPORTAR XLS ─────────────────────────────────────
    const exportarXLS = useCallback((dados: any[], nomeArquivo: string) => {
        if (!dados.length) return;

        // Cabeçalhos
        const headers = ['Nome', 'Cargo', 'Email', 'Empresa', 'Setor', 'Porte', 'LinkedIn', 'Fonte', 'Status', 'Data'];
        const rows = dados.map(p => [
            p.nome_completo || '',
            p.cargo         || '',
            p.email         || '',
            p.empresa_nome  || '',
            p.empresa_setor || '',
            p.empresa_porte || '',
            p.linkedin_url  || '',
            p.motor || p.fonte || '',
            p.status        || 'novo',
            p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '',
        ]);

        // Gerar CSV com separador ponto-e-vírgula (compatível com Excel BR)
        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
            .join('\n');

        const BOM = '﻿'; // BOM para Excel reconhecer UTF-8
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${nomeArquivo}_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setToastMsg({ tipo: 'ok', msg: `${dados.length} leads exportados!` });
        setTimeout(() => setToastMsg(null), 3000);
    }, []);

    // ── SALVAR SELECIONADOS ──────────────────────────────
    const handleSalvar = useCallback(async () => {
        if (!currentUser?.id) {
            console.warn('⚠️ [ProspectSearch] currentUser não disponível');
            return;
        }
        const selecionados = resultados.filter(r => r.selecionado);
        if (!selecionados.length) return;

        setSaving(true);
        try {
            const response = await fetch('/api/prospect-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prospects:    selecionados,
                    user_id:      currentUser.id,
                    filtros_busca: {
                        departamentos:   departamentosSelecionados,
                        senioridades:    senioridadesSelecionadas,
                        dominio_buscado: domain.trim(),
                    },
                }),
            });
            const result = await response.json();
            if (result.success) {
                setToastMsg({ tipo: 'ok', msg: `${result.salvos} lead${result.salvos > 1 ? 's' : ''} salvo${result.salvos > 1 ? 's' : ''} com sucesso!` });
                console.log(`✅ [ProspectSearch] ${result.salvos} leads salvos`);
            } else {
                setToastMsg({ tipo: 'erro', msg: `Erro ao salvar: ${result.error || 'desconhecido'}` });
                console.error('❌ [ProspectSearch] Erro save:', result.error);
            }
        } catch (err: any) {
            setToastMsg({ tipo: 'erro', msg: `Erro: ${err.message}` });
            console.error('❌ [ProspectSearch] Erro save:', err);
        } finally {
            setSaving(false);
            setTimeout(() => setToastMsg(null), 4000);
        }
    }, [resultados, currentUser, departamentosSelecionados, senioridadesSelecionadas, domain]);

        return (
        <div className="p-6 max-w-full">
            {/* Toast */}
            {toastMsg && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-2
                    ${toastMsg.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
                    <i className={`fa-solid ${toastMsg.tipo === 'ok' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                    {toastMsg.msg}
                </div>
            )}
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <i className="fa-solid fa-magnifying-glass-dollar text-blue-600"></i>
                    Prospect — Dual Engine
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    Busca inteligente de leads B2B com Apollo + Snov.io
                </p>
            </div>

            {/* Créditos Consumidos (sessão) */}
            {(creditosConsumidos.apollo > 0 || creditosConsumidos.snovio > 0) && (
                <div className="mb-4 flex gap-4">
                    {creditosConsumidos.apollo > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                            <i className="fa-solid fa-bolt mr-1"></i>
                            Apollo: {creditosConsumidos.apollo} créditos nesta sessão
                        </span>
                    )}
                    {creditosConsumidos.snovio > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full">
                            <i className="fa-solid fa-bolt mr-1"></i>
                            Snov.io: {creditosConsumidos.snovio} créditos nesta sessão
                        </span>
                    )}
                </div>
            )}

            {/* Abas */}
            <div className="flex gap-1 mb-6 border-b border-gray-200">
                <button
                    onClick={() => setAbaAtiva('busca')}
                    className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors
                        ${abaAtiva === 'busca'
                            ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                            : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <i className="fa-solid fa-magnifying-glass mr-2"></i>Nova Busca
                </button>
                <button
                    onClick={() => setAbaAtiva('salvos')}
                    className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors
                        ${abaAtiva === 'salvos'
                            ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                            : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <i className="fa-solid fa-database mr-2"></i>Leads Salvos
                    {leadsSalvos.length > 0 && (
                        <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                            {leadsSalvos.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ── ABA LEADS SALVOS ── */}
            {abaAtiva === 'salvos' && (
                <div className="bg-white rounded-lg shadow-md">
                    {/* Filtros */}
                    <div className="p-4 border-b flex flex-wrap gap-3 items-center">
                        <input
                            type="text"
                            placeholder="Filtrar por empresa..."
                            value={filtroEmpresa}
                            onChange={e => setFiltroEmpresa(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52 focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                            value={filtroStatus}
                            onChange={e => setFiltroStatus(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Todos os status</option>
                            <option value="novo">Novo</option>
                            <option value="contatado">Contatado</option>
                            <option value="em_negociacao">Em Negociação</option>
                            <option value="convertido">Convertido</option>
                            <option value="descartado">Descartado</option>
                        </select>
                        <button
                            onClick={carregarLeadsSalvos}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
                        >
                            <i className="fa-solid fa-rotate-right mr-1"></i>Atualizar
                        </button>
                        <button
                            onClick={() => exportarXLS(leadsSalvos, 'leads_salvos')}
                            disabled={leadsSalvos.length === 0}
                            className="ml-auto px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                            <i className="fa-solid fa-file-excel mr-1"></i>Exportar XLS ({leadsSalvos.length})
                        </button>
                    </div>

                    {/* Tabela */}
                    {loadingSalvos ? (
                        <div className="text-center py-16 text-gray-400">
                            <i className="fa-solid fa-spinner fa-spin text-4xl mb-3 block"></i>
                            <p>Carregando leads...</p>
                        </div>
                    ) : leadsSalvos.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <i className="fa-solid fa-database text-5xl mb-3 block"></i>
                            <p className="font-medium">Nenhum lead salvo encontrado</p>
                            <p className="text-sm mt-1">Faça uma busca e salve os resultados</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Nome</th>
                                        <th className="px-4 py-3 text-left">Cargo</th>
                                        <th className="px-4 py-3 text-left">Empresa</th>
                                        <th className="px-4 py-3 text-left">Email</th>
                                        <th className="px-4 py-3 text-left">Fonte</th>
                                        <th className="px-4 py-3 text-left">Status</th>
                                        <th className="px-4 py-3 text-left">Data</th>
                                        <th className="px-4 py-3 text-left">LinkedIn</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {leadsSalvos.map(lead => (
                                        <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">{lead.nome_completo}</td>
                                            <td className="px-4 py-3 text-gray-600">{lead.cargo || '—'}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{lead.empresa_nome || '—'}</div>
                                                {lead.empresa_setor && <div className="text-xs text-gray-400">{lead.empresa_setor}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                {lead.email
                                                    ? <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                                                    : <span className="text-gray-400">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-1 rounded-full font-medium
                                                    ${lead.motor === 'apollo' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                                    {lead.motor}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-1 rounded-full
                                                    ${lead.status === 'novo'           ? 'bg-blue-100 text-blue-700'
                                                    : lead.status === 'contatado'      ? 'bg-yellow-100 text-yellow-700'
                                                    : lead.status === 'em_negociacao'  ? 'bg-orange-100 text-orange-700'
                                                    : lead.status === 'convertido'     ? 'bg-green-100 text-green-700'
                                                    : 'bg-gray-100 text-gray-600'}`}>
                                                    {lead.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">
                                                {new Date(lead.criado_em).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {lead.linkedin_url
                                                    ? <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                         className="text-blue-600 hover:text-blue-800">
                                                        <i className="fa-brands fa-linkedin text-lg"></i>
                                                      </a>
                                                    : <span className="text-gray-300">—</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── ABA NOVA BUSCA ── */}
            {abaAtiva === 'busca' && (
            <>
            {/* Formulário de Busca */}
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
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="Ex: totvs.com.br, ambev.com.br, magazineluiza.com.br"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && buscarApollo()}
                    />
                </div>

                {/* Departamentos */}
                <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        <i className="fa-solid fa-sitemap mr-2 text-blue-500"></i>
                        Departamentos-alvo (opcional — se vazio, busca todos)
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
                                <i className={`${dep.icon} mr-1`}></i>
                                {dep.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Senioridades */}
                <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        <i className="fa-solid fa-user-tie mr-2 text-blue-500"></i>
                        Senioridade (opcional — se vazio, busca todas)
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

                {/* Opções de Enriquecimento */}
                <div className="mb-4 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={enriquecerApollo}
                            onChange={(e) => setEnriquecerApollo(e.target.checked)}
                            className="w-4 h-4 text-purple-600 rounded"
                        />
                        <span>Enriquecer Apollo (1 crédito/pessoa)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={buscarEmailsSnovio}
                            onChange={(e) => setBuscarEmailsSnovio(e.target.checked)}
                            className="w-4 h-4 text-green-600 rounded"
                        />
                        <span>Buscar emails Snov.io (1 crédito/email)</span>
                    </label>
                </div>

                {/* Botões de Busca */}
                <div className="flex gap-3">
                    <button
                        onClick={buscarApollo}
                        disabled={!domain.trim() || searchState.loading}
                        className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        {searchState.loading && searchState.motor === 'apollo' ? (
                            <><i className="fa-solid fa-spinner fa-spin"></i> Buscando Apollo...</>
                        ) : (
                            <><i className="fa-solid fa-rocket"></i> Buscar via Apollo</>
                        )}
                    </button>
                    <button
                        onClick={buscarSnovio}
                        disabled={!domain.trim() || searchState.loading}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        {searchState.loading && searchState.motor === 'snovio' ? (
                            <><i className="fa-solid fa-spinner fa-spin"></i> Buscando Snov.io...</>
                        ) : (
                            <><i className="fa-solid fa-envelope-open-text"></i> Buscar via Snov.io</>
                        )}
                    </button>
                </div>
            </div>

            {/* Erro */}
            {searchState.error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    <i className="fa-solid fa-circle-exclamation mr-2"></i>
                    {searchState.error}
                </div>
            )}

            {/* Info da Empresa (Snov.io) */}
            {empresaInfo && empresaInfo.nome && (
                <div className="mb-4 bg-blue-50 border border-blue-200 px-4 py-3 rounded-lg text-sm">
                    <span className="font-semibold text-blue-800">{empresaInfo.nome}</span>
                    {empresaInfo.setor && <span className="text-blue-600 ml-3">• {empresaInfo.setor}</span>}
                    {empresaInfo.porte && <span className="text-blue-600 ml-3">• ~{empresaInfo.porte.toLocaleString()} funcionários</span>}
                    {empresaInfo.localizacao && <span className="text-blue-600 ml-3">• {empresaInfo.localizacao}</span>}
                </div>
            )}

            {/* Tabela de Resultados */}
            {resultados.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    {/* Barra de ações */}
                    <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-gray-700">
                                {resultados.length} leads encontrados
                            </span>
                            {selecionadosCount > 0 && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                    {selecionadosCount} selecionados
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSalvar}
                                disabled={selecionadosCount === 0 || saving}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving
                                    ? <><i className="fa-solid fa-spinner fa-spin mr-1"></i>Salvando...</>
                                    : <><i className="fa-solid fa-floppy-disk mr-1"></i>Salvar Selecionados ({selecionadosCount})</>
                                }
                            </button>
                            <button
                                onClick={() => exportarXLS(resultados, `prospects_${domain || 'busca'}`)}
                                disabled={resultados.length === 0}
                                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-file-excel mr-1"></i>
                                Exportar XLS ({resultados.length})
                            </button>
                        </div>
                    </div>

                    {/* Tabela */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="px-3 py-2 w-8">
                                        <input
                                            type="checkbox"
                                            checked={todosSelecionados}
                                            onChange={toggleTodos}
                                            className="w-4 h-4 rounded"
                                        />
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
                                {resultados.map((prospect, idx) => (
                                    <tr key={`${prospect.apollo_id || prospect.snovio_id || idx}`} className="border-b hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={prospect.selecionado || false}
                                                onChange={() => toggleSelecionado(idx)}
                                                className="w-4 h-4 rounded"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                {prospect.foto_url ? (
                                                    <img src={prospect.foto_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                                                ) : (
                                                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                                                        {prospect.primeiro_nome?.[0] || '?'}
                                                    </div>
                                                )}
                                                <span className="font-medium text-gray-800">{prospect.nome_completo}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate" title={prospect.cargo}>
                                            {prospect.cargo}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">{prospect.empresa_nome}</td>
                                        <td className="px-3 py-2 text-gray-500 text-xs">{prospect.empresa_setor || '—'}</td>
                                        <td className="px-3 py-2 text-center text-gray-500 text-xs">
                                            {prospect.empresa_porte ? prospect.empresa_porte.toLocaleString() : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            {prospect.email ? (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-gray-700">{prospect.email}</span>
                                                    {prospect.email_status === 'verified' && (
                                                        <i className="fa-solid fa-circle-check text-green-500 text-xs" title="Verificado"></i>
                                                    )}
                                                </div>
                                            ) : prospect.email_status === 'buscando...' ? (
                                                <span className="text-xs text-yellow-600">
                                                    <i className="fa-solid fa-spinner fa-spin mr-1"></i>Buscando...
                                                </span>
                                            ) : prospect.email_status === 'not_found' ? (
                                                <span className="text-xs text-red-400">Não encontrado</span>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {prospect.linkedin_url ? (
                                                <a 
                                                    href={prospect.linkedin_url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title={prospect.linkedin_url}
                                                >
                                                    <i className="fa-brands fa-linkedin text-lg"></i>
                                                </a>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                                prospect.fonte === 'apollo' ? 'bg-purple-100 text-purple-700' :
                                                prospect.fonte === 'snovio' ? 'bg-green-100 text-green-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {prospect.fonte === 'apollo' ? 'Apollo' : 
                                                 prospect.fonte === 'snovio' ? 'Snov.io' : 'Ambos'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {!prospect.email && prospect.email_status !== 'buscando...' && prospect.email_status !== 'not_found' && (
                                                <button
                                                    onClick={() => buscarEmailFallback(idx)}
                                                    className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                                                    title={`Buscar email via ${prospect.fonte === 'apollo' ? 'Snov.io' : 'Apollo'}`}
                                                >
                                                    <i className="fa-solid fa-magnifying-glass mr-1"></i>
                                                    Email
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Estado vazio */}
            {!searchState.loading && resultados.length === 0 && !searchState.error && (
                <div className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-magnifying-glass-dollar text-6xl mb-4 block"></i>
                    <p className="text-lg font-medium">Informe o domínio da empresa para começar</p>
                    <p className="text-sm mt-1">Ex: totvs.com.br, ambev.com.br, magazineluiza.com.br</p>
                </div>
            )}
        </>
        )}
    </div>
    );
};

export default ProspectSearchPage;

