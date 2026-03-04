/**
 * ProspectSearchPage.tsx — Prospect Dual Engine
 * 
 * Página principal do módulo de prospecção B2B
 * Motor duplo: Apollo + Snov.io com fallback cruzado
 * 
 * Versão: 1.2
 * Data: 04/03/2026
 */

import React, { useState, useCallback } from 'react';
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
    const { currentUser } = useAuth();

    // Form state
    const [domain, setDomain] = useState('');
    const [departamentosSelecionados, setDepartamentosSelecionados] = useState<string[]>([]);
    const [senioridadesSelecionadas, setSenioridadesSelecionadas] = useState<string[]>([]);
    const [enriquecerApollo, setEnriquecerApollo] = useState(true);
    const [buscarEmailsSnovio, setBuscarEmailsSnovio] = useState(true);
    const [filtrarBrasil, setFiltrarBrasil] = useState(true);

    // Results state
    const [resultados, setResultados] = useState<ProspectResult[]>([]);
    const [searchState, setSearchState] = useState<SearchState>({ loading: false, motor: null, error: null });
    const [creditosConsumidos, setCreditosConsumidos] = useState({ apollo: 0, snovio: 0 });
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
                    buscar_emails: buscarEmailsSnovio,
                    filtrar_brasil: filtrarBrasil
                })
            });

            // Tratar resposta não-JSON (504 timeout, 502 bad gateway, etc.)
            if (!response.ok) {
                const statusMsg: Record<number, string> = {
                    504: 'Tempo limite excedido (504). Domínios grandes podem demorar mais — tente novamente.',
                    502: 'Servidor temporariamente indisponível (502). Tente novamente em instantes.',
                    500: 'Erro interno do servidor (500). Verifique os logs do Vercel.'
                };
                const msg = statusMsg[response.status] || `Erro HTTP ${response.status}. Tente novamente.`;
                setSearchState({ loading: false, motor: 'snovio', error: msg });
                return;
            }

            let data: any;
            try {
                data = await response.json();
            } catch {
                setSearchState({ loading: false, motor: 'snovio', error: 'Resposta inválida do servidor. Tente novamente.' });
                return;
            }

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
    }, [domain, departamentosSelecionados, buscarEmailsSnovio, filtrarBrasil]);

    // ============================================
    // BUSCAR EMAIL INDIVIDUAL — endpoint dedicado
    // Chama /api/prospect-email-finder com nome+domínio
    // Tenta Snov.io primeiro, Apollo como fallback
    // ============================================
    const buscarEmailFallback = useCallback(async (index: number) => {
        const prospect = resultados[index];
        if (!prospect || prospect.email) return;

        // Marcar como buscando
        setResultados(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], email_status: 'buscando...' };
            return updated;
        });

        try {
            const response = await fetch('/api/prospect-email-finder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    primeiro_nome:  prospect.primeiro_nome,
                    ultimo_nome:    prospect.ultimo_nome,
                    domain:         prospect.empresa_dominio || domain.trim(),
                    empresa_nome:   prospect.empresa_nome,
                    fonte_original: prospect.fonte
                })
            });

            const data = await response.json();

            if (data.success && data.email) {
                if (data.motor === 'snovio') {
                    setCreditosConsumidos(prev => ({ ...prev, snovio: prev.snovio + 1 }));
                } else if (data.motor === 'apollo') {
                    setCreditosConsumidos(prev => ({ ...prev, apollo: prev.apollo + 1 }));
                }
                setResultados(prev => {
                    const updated = [...prev];
                    updated[index] = {
                        ...updated[index],
                        email:        data.email,
                        email_status: data.email_status || 'found',
                        fonte:        (prospect.fonte === data.motor ? prospect.fonte : 'ambos') as 'apollo' | 'snovio' | 'ambos'
                    };
                    return updated;
                });
            } else {
                setResultados(prev => {
                    const updated = [...prev];
                    updated[index] = { ...updated[index], email_status: 'not_found' };
                    return updated;
                });
            }
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
    return (
        <div className="p-6 max-w-full">
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
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer" title="Filtra prospects com localização no Brasil (quando disponível)">
                        <input
                            type="checkbox"
                            checked={filtrarBrasil}
                            onChange={(e) => setFiltrarBrasil(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="flex items-center gap-1">
                            <span>🇧🇷</span>
                            <span>Apenas Brasil</span>
                        </span>
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
                                onClick={() => alert('Fase 3: Salvar no Supabase')}
                                disabled={selecionadosCount === 0}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i className="fa-solid fa-floppy-disk mr-1"></i>
                                Salvar Selecionados
                            </button>
                            <button
                                onClick={() => alert('Fase 3: Exportar XLS')}
                                disabled={resultados.length === 0}
                                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-file-excel mr-1"></i>
                                Exportar XLS
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
        </div>
    );
};

export default ProspectSearchPage;
