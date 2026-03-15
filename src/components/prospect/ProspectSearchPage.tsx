/**
 * ProspectSearchPage.tsx — Prospect Engine v2.1
 *
 * Motor: Gemini AI (Search Grounding) + Hunter.io
 * Substitui: Apollo + Snov.io
 *
 * Fluxo:
 * 1. Gemini descobre executivos via Google Search público
 * 2. Hunter.io enriquece com email verificado
 * 3. Salvar selecionados no Supabase
 *
 * Versão: 4.1
 * Data: 15/03/2026
 *
 * v4.0:
 * - Motor principal: Gemini + Google Search Grounding
 * - Enriquecimento: Hunter.io (substitui Apollo)
 * - Remove dependência Apollo + Snov.io
 * - Mantém: Leads Salvos, Exportar XLS, Salvar Selecionados
 *
 * v4.1:
 * - Coluna "ORIGEM E-MAIL" na tabela de resultados (Hunter Finder / Hunter Domain / Snov.io)
 * - motor_email propagado no buscarEmailIndividual (botão por linha)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

// ============================================
// TIPOS
// ============================================
interface ProspectResult {
    gemini_id?:     string;
    nome_completo:  string;
    primeiro_nome:  string;
    ultimo_nome:    string;
    cargo:          string;
    nivel:          string;
    departamento:   string;
    email:          string | null;
    email_status:   string | null;
    email_score?:   number;
    linkedin_url:   string | null;
    foto_url:       null;
    empresa_nome:   string;
    empresa_dominio?: string;
    empresa_setor:  string | null;
    empresa_porte:  null;
    empresa_linkedin: null;
    empresa_website:  null;
    cidade:         string | null;
    estado:         string | null;
    pais:           string | null;
    senioridade:    string | null;
    departamentos:  string[];
    fonte:          'gemini' | 'extension';
    enriquecido:    boolean;
    motor_email?:   string | null;
    selecionado?:   boolean;
}

interface SearchState {
    loading:        boolean;
    fase:           'idle' | 'descobrindo' | 'enriquecendo' | 'concluido' | 'erro';
    error:          string | null;
}

interface ProspectLead {
    id:             number;
    nome_completo:  string;
    cargo:          string | null;
    email:          string | null;
    empresa_nome:   string | null;
    empresa_dominio: string | null;
    empresa_setor:  string | null;
    linkedin_url:   string | null;
    motor:          string;
    status:         string;
    criado_em:      string;
    senioridade:    string | null;
    departamentos:  string[];
}

// ============================================
// CONSTANTES
// ============================================
const DEPARTAMENTOS = [
    { id: 'ti_tecnologia',         label: 'TI / Tecnologia',          icon: 'fa-solid fa-microchip' },
    { id: 'compras_procurement',   label: 'Compras / Procurement',     icon: 'fa-solid fa-cart-shopping' },
    { id: 'infraestrutura',        label: 'Infraestrutura',            icon: 'fa-solid fa-server' },
    { id: 'governanca_compliance', label: 'Governança / Compliance',   icon: 'fa-solid fa-shield-halved' },
    { id: 'rh_recursos_humanos',   label: 'RH / Recursos Humanos',     icon: 'fa-solid fa-people-group' },
    { id: 'comercial_vendas',      label: 'Comercial / Vendas',        icon: 'fa-solid fa-handshake' },
    { id: 'financeiro',            label: 'Financeiro',                icon: 'fa-solid fa-coins' },
    { id: 'diretoria_clevel',      label: 'Diretoria / C-Level',       icon: 'fa-solid fa-crown' },
];

const SENIORIDADES = [
    { id: 'c_level',        label: 'C-Level (CEO, CTO, CIO...)' },
    { id: 'vp',             label: 'VP / Vice-Presidente' },
    { id: 'diretor',        label: 'Diretor' },
    { id: 'gerente',        label: 'Gerente' },
    { id: 'coordenador',    label: 'Coordenador' },
    { id: 'superintendente',label: 'Superintendente' },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
interface ProspectSearchPageProps {
    initialTab?: 'busca' | 'salvos';
}

const ProspectSearchPage: React.FC<ProspectSearchPageProps> = ({ initialTab = 'busca' }) => {
    const { user: currentUser } = useAuth();

    // Form
    const [domain, setDomain]                           = useState('');
    const [empresaNome, setEmpresaNome]                 = useState('');
    const [departamentosSelecionados, setDepts]         = useState<string[]>([]);
    const [senioridadesSelecionadas, setSeniors]        = useState<string[]>([]);
    const [enriquecerHunter, setEnriquecerHunter]       = useState(false);

    // Results
    const [resultados, setResultados]                   = useState<ProspectResult[]>([]);
    const [searchState, setSearchState]                 = useState<SearchState>({ loading: false, fase: 'idle', error: null });
    const [empresaInfo, setEmpresaInfo]                 = useState<any>(null);
    const [queriesGoogle, setQueriesGoogle]             = useState<string[]>([]);
    const [saving, setSaving]                           = useState(false);
    const [toastMsg, setToastMsg]                       = useState<{tipo: 'ok'|'erro'; msg: string} | null>(null);

    // Abas
    const [abaAtiva, setAbaAtiva]                       = useState<'busca'|'salvos'>(initialTab ?? 'busca');

    // Sincronizar abaAtiva quando initialTab mudar
    // (ex: usuário navega de "Buscar Leads" → "Meus Prospects" sem desmontar o componente)
    useEffect(() => {
        if (initialTab) setAbaAtiva(initialTab);
    }, [initialTab]);

    // Leads Salvos
    const [leadsSalvos, setLeadsSalvos]                 = useState<ProspectLead[]>([]);
    const [loadingSalvos, setLoadingSalvos]             = useState(false);
    const [filtroStatus, setFiltroStatus]               = useState('');
    const [filtroEmpresa, setFiltroEmpresa]             = useState('');

    // Seleção
    const [todosSelecionados, setTodosSelecionados]     = useState(false);

    // BUG 3 FIX: controle de quantidade máxima de resultados (configurável)
    const [maxResultados, setMaxResultados]             = useState(25);

    // Controle de queries já executadas — para marcação visual
    const [queriesExecutadas, setQueriesExecutadas]     = useState<Set<string>>(new Set());

    // ============================================
    // TOGGLES
    // ============================================
    const toggleDept = (id: string) =>
        setDepts(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

    const toggleSenior = (id: string) =>
        setSeniors(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

    const toggleSelecionado = (index: number) =>
        setResultados(prev => {
            const u = [...prev];
            u[index] = { ...u[index], selecionado: !u[index].selecionado };
            return u;
        });

    const toggleTodos = () => {
        const novoValor = !todosSelecionados;
        setTodosSelecionados(novoValor);
        setResultados(prev => prev.map(r => ({ ...r, selecionado: novoValor })));
    };

    const selecionadosCount = resultados.filter(r => r.selecionado).length;

    // Reset completo — limpa todos os campos e resultados para nova pesquisa
    const handleReset = useCallback(() => {
        setDomain('');
        setEmpresaNome('');
        setDepts([]);
        setSeniors([]);
        setEnriquecerHunter(false);
        setResultados([]);
        setEmpresaInfo(null);
        setQueriesGoogle([]);
        setMaxResultados(25);
        setSearchState({ loading: false, fase: 'idle', error: null });
        setAbaAtiva('busca');
        setQueriesExecutadas(new Set());
    }, []);

    // ============================================
    // RECEBER LEADS DA PROSPECT EXTENSION
    // A Extension envia via /api/prospect-capture → frontend
    // atualiza a lista de resultados automaticamente
    // ============================================
    useEffect(() => {
        const handleExtensionMessage = (event: MessageEvent) => {
            if (event.data?.type !== 'PROSPECT_EXTENSION_LEADS') return;

            const leads: ProspectResult[] = (event.data.leads || []).map((r: ProspectResult) => ({
                ...r, selecionado: false
            }));

            if (leads.length === 0) return;

            setResultados(prev => {
                // Deduplicar por linkedin_url — evita duplicatas se o analista capturar a mesma página duas vezes
                const urlsExistentes = new Set(prev.map(l => l.linkedin_url).filter(Boolean));
                const novos = leads.filter(l => !l.linkedin_url || !urlsExistentes.has(l.linkedin_url));
                return [...prev, ...novos];
            });

            setSearchState({ loading: false, fase: 'concluido', error: null });
            setAbaAtiva('busca');

            // Mostrar toast informativo
            setToastMsg({ tipo: 'ok', msg: `${leads.length} lead${leads.length > 1 ? 's' : ''} capturado${leads.length > 1 ? 's' : ''} pela Extension!` });
            setTimeout(() => setToastMsg(null), 4000);

            // Auto-refresh: recarregar Leads Salvos para exibir os novos leads
            setTimeout(() => carregarLeadsSalvos(), 1500);
        };

        window.addEventListener('message', handleExtensionMessage);
        return () => window.removeEventListener('message', handleExtensionMessage);
    }, []);


    const buscarGemini = useCallback(async () => {
        if (!domain.trim()) return;

        setSearchState({ loading: true, fase: 'descobrindo', error: null });
        setResultados([]);
        setEmpresaInfo(null);
        setQueriesGoogle([]);

        try {
            // ── FASE 1: Gemini descobre leads ────────────────────────
            const respGemini = await fetch('/api/prospect-gemini-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain:         domain.trim(),
                    empresa_nome:   empresaNome.trim() || undefined,
                    departamentos:  departamentosSelecionados,
                    senioridades:   senioridadesSelecionadas,
                    max_resultados: maxResultados,
                }),
            });

            // Parse seguro — 504/502 retornam HTML/texto, não JSON
            let dataGemini: any;
            try {
                dataGemini = await respGemini.json();
            } catch {
                const statusMsg = respGemini.status === 504
                    ? 'A busca demorou mais que o esperado (timeout). Tente com menos filtros ou aguarde alguns segundos.'
                    : `Erro de comunicação com o servidor (${respGemini.status}). Tente novamente.`;
                setSearchState({ loading: false, fase: 'erro', error: statusMsg });
                return;
            }

            if (!dataGemini.success) {
                setSearchState({ loading: false, fase: 'erro', error: dataGemini.error || 'Erro na busca Gemini' });
                return;
            }

            const leadsGemini: ProspectResult[] = (dataGemini.resultados || []).map((r: ProspectResult) => ({
                ...r, selecionado: false
            }));

            setEmpresaInfo(dataGemini.empresa);
            setQueriesGoogle(dataGemini.queries_google || []);

            // Exibe resultados Gemini imediatamente — Hunter só roda se usuário ativar o checkbox
            setResultados(leadsGemini);
            setSearchState({ loading: false, fase: 'concluido', error: null });

        } catch (err: any) {
            setSearchState({ loading: false, fase: 'erro', error: err.message });
        }
    }, [domain, departamentosSelecionados, senioridadesSelecionadas, enriquecerHunter, maxResultados]);

    // ============================================
    // EMAIL FINDER INDIVIDUAL (botão por linha)
    // ============================================
    const buscarEmailIndividual = useCallback(async (index: number) => {
        const prospect = resultados[index];
        if (!prospect || prospect.email) return;

        // Leads da Extension podem não ter domínio no form — usar o do próprio lead
        const dominioEmail = domain.trim() || prospect.empresa_dominio || '';
        if (!dominioEmail) {
            setResultados(prev => {
                const u = [...prev];
                u[index] = { ...u[index], email_status: 'sem domínio' };
                return u;
            });
            return;
        }

        setResultados(prev => {
            const u = [...prev];
            u[index] = { ...u[index], email_status: 'buscando...' };
            return u;
        });

        try {
            const res = await fetch('/api/prospect-hunter-enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode:          'email_finder',
                    domain:        dominioEmail,
                    primeiro_nome: prospect.primeiro_nome,
                    ultimo_nome:   prospect.ultimo_nome,
                    supabase_id:   (prospect as any).supabase_id || null,
                }),
            });
            const data = await res.json();

            setResultados(prev => {
                const u = [...prev];
                u[index] = {
                    ...u[index],
                    email:        data.email        || null,
                    email_status: data.email_status || 'not_found',
                    email_score:  data.score        || 0,
                    linkedin_url: u[index].linkedin_url || data.linkedin_url || null,
                    enriquecido:  !!data.email,
                    motor_email:  data.email ? (data.motor || 'hunter_finder') : null,
                };
                return u;
            });
        } catch (err: any) {
            setResultados(prev => {
                const u = [...prev];
                u[index] = { ...u[index], email_status: 'error' };
                return u;
            });
        }
    }, [resultados, domain]);

    // ============================================
    // SALVAR SELECIONADOS
    // ============================================
    const handleSalvar = useCallback(async () => {
        if (!currentUser?.id) return;
        const selecionados = resultados.filter(r => r.selecionado);
        if (!selecionados.length) return;

        setSaving(true);
        try {
            // Normaliza payload para prospect-save.ts (mantém formato existente)
            const prospectsPayload = selecionados.map(p => ({
                gemini_id:        p.gemini_id || null,
                apollo_id:        null,
                snovio_id:        null,
                nome_completo:    p.nome_completo,
                primeiro_nome:    p.primeiro_nome,
                ultimo_nome:      p.ultimo_nome,
                cargo:            p.cargo,
                email:            p.email,
                email_status:     p.email_status,
                linkedin_url:     p.linkedin_url,
                foto_url:         null,
                empresa_nome:     p.empresa_nome,
                empresa_dominio:  p.empresa_dominio || domain.trim(),
                empresa_setor:    p.empresa_setor,
                empresa_porte:    null,
                empresa_linkedin: null,
                empresa_website:  null,
                cidade:           p.cidade,
                estado:           p.estado,
                pais:             p.pais,
                senioridade:      p.senioridade || p.nivel,
                departamentos:    p.departamentos,
                fonte:            (p.fonte || 'gemini') as 'gemini' | 'extension',
                enriquecido:      p.enriquecido,
            }));

            const response = await fetch('/api/prospect-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prospects:    prospectsPayload,
                    user_id:      currentUser.id,
                    filtros_busca: {
                        departamentos:   departamentosSelecionados,
                        senioridades:    senioridadesSelecionadas,
                        dominio_buscado: domain.trim(),
                        motor:           'gemini+hunter',
                    },
                }),
            });

            const result = await response.json();
            if (result.success) {
                setToastMsg({ tipo: 'ok', msg: `${result.salvos} lead${result.salvos > 1 ? 's' : ''} salvo${result.salvos > 1 ? 's' : ''} com sucesso!` });
            } else {
                setToastMsg({ tipo: 'erro', msg: `Erro ao salvar: ${result.error || 'desconhecido'}` });
            }
        } catch (err: any) {
            setToastMsg({ tipo: 'erro', msg: `Erro: ${err.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setToastMsg(null), 4000);
        }
    }, [resultados, currentUser, departamentosSelecionados, senioridadesSelecionadas, domain]);

    // ============================================
    // LEADS SALVOS
    // ============================================
    const carregarLeadsSalvos = useCallback(async () => {
        setLoadingSalvos(true);
        try {
            const params = new URLSearchParams();
            if (filtroStatus)  params.set('status',  filtroStatus);
            if (filtroEmpresa) params.set('empresa', filtroEmpresa);
            const res  = await fetch(`/api/prospect-leads?${params}`);
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

    // ============================================
    // EXPORTAR XLS
    // ============================================
    const exportarXLS = useCallback((dados: any[], nomeArquivo: string) => {
        if (!dados.length) return;
        const headers = ['Nome', 'Cargo', 'Nível', 'Email', 'Score Email', 'Empresa', 'Setor', 'LinkedIn', 'Fonte Email', 'Status', 'Data'];
        const rows = dados.map(p => [
            p.nome_completo   || '',
            p.cargo           || '',
            p.nivel || p.senioridade || '',
            p.email           || '',
            p.email_score     || '',
            p.empresa_nome    || '',
            p.empresa_setor   || '',
            p.linkedin_url    || '',
            p.motor_email || p.motor || 'gemini+hunter',
            p.status          || 'novo',
            p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '',
        ]);
        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
            .join('\n');
        const BOM  = '\uFEFF';
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

    // ============================================
    // HUNTER — dispara quando usuário ATIVA o checkbox (após ver os leads)
    // Só roda se: checkbox ligado + há leads sem email + não está carregando
    // ============================================
    useEffect(() => {
        if (!enriquecerHunter) return;
        if (searchState.loading) return;
        if (resultados.length === 0) return;
        // Só dispara se houver leads sem email (evita rodar múltiplas vezes)
        const semEmail = resultados.filter(r => !r.email);
        if (semEmail.length === 0) return;

        const runHunter = async () => {
            setSearchState({ loading: true, fase: 'enriquecendo', error: null });
            try {
                const resp = await fetch('/api/prospect-hunter-enrich', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode:      'enrich_list',
                        domain:    domain.trim(),
                        prospects: resultados,
                    }),
                });
                const data = await resp.json();
                if (data.success) {
                    setResultados((data.resultados || []).map((r: ProspectResult) => ({
                        ...r, selecionado: false
                    })));
                } else {
                    console.warn('⚠️ Hunter falhou:', data.error);
                }
            } catch (err: any) {
                console.warn('⚠️ Hunter erro:', err.message);
            } finally {
                setSearchState({ loading: false, fase: 'concluido', error: null });
            }
        };

        runHunter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enriquecerHunter]);

    // ============================================
    // HELPERS DE STATUS
    // ============================================
    const faseLabel: Record<string, string> = {
        idle:          '',
        descobrindo:   'Buscando executivos com Gemini AI...',
        enriquecendo:  'Enriquecendo emails via Hunter.io...',
        concluido:     '',
        erro:          '',
    };

    const emailStatusColor = (status: string | null) => {
        if (!status || status === 'not_found') return 'text-gray-400';
        if (status === 'valid')     return 'text-green-600';
        if (status === 'invalid')   return 'text-red-400';
        if (status === 'buscando...' || status === 'aguardando...') return 'text-yellow-500';
        return 'text-gray-500';
    };

    const nivelBadgeColor = (nivel: string) => {
        const n = nivel?.toLowerCase() || '';
        if (n.includes('c-level') || n.includes('c_level')) return 'bg-red-100 text-red-700';
        if (n.includes('vp') || n.includes('vice'))         return 'bg-orange-100 text-orange-700';
        if (n.includes('diretor'))                          return 'bg-purple-100 text-purple-700';
        if (n.includes('gerente'))                          return 'bg-blue-100 text-blue-700';
        return 'bg-gray-100 text-gray-600';
    };

    // ============================================
    // RENDER
    // ============================================
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
                Prospect Engine v2.1
            </h1>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                    <i className="fa-brands fa-google text-xs"></i> Gemini AI
                </span>
                <span className="text-gray-400">+</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs font-medium">
                    <i className="fa-solid fa-envelope text-xs"></i> Hunter.io
                </span>
                <span className="text-gray-400 text-xs">— Busca de leads B2B via dados públicos</span>
            </p>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
            {(['busca', 'salvos'] as const).map(aba => (
                <button key={aba} onClick={() => setAbaAtiva(aba)}
                    className={`px-4 py-2 text-sm font-medium rounded-t transition-colors
                        ${abaAtiva === aba
                            ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                            : 'text-gray-500 hover:text-gray-700'}`}>
                    {aba === 'busca'  ? <><i className="fa-solid fa-magnifying-glass mr-2"></i>Nova Busca</>
                                      : <><i className="fa-solid fa-database mr-2"></i>Leads Salvos</>}
                </button>
            ))}
            {/* Botão Reset — limpa tudo para nova pesquisa */}
            <button
                onClick={handleReset}
                title="Limpar tudo e iniciar nova pesquisa"
                className="ml-2 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
                <i className="fa-solid fa-rotate-right"></i>
                Nova Pesquisa
            </button>
        </div>

        {/* ══════════════════════════════════════════ */}
        {/* ABA: NOVA BUSCA                            */}
        {/* ══════════════════════════════════════════ */}
        {abaAtiva === 'busca' && (
        <>
            {/* Painel de filtros */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Domínio + Nome da Empresa */}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            <i className="fa-solid fa-globe mr-2 text-blue-500"></i>
                            Domínio da Empresa
                        </label>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={domain}
                                onChange={e => { setDomain(e.target.value); setEmpresaNome(''); setResultados([]); setEmpresaInfo(null); setQueriesGoogle([]); }}
                                onKeyDown={e => e.key === 'Enter' && buscarGemini()}
                                placeholder="Ex: totvs.com.br, ambev.com, carrefour.com.br"
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            <button
                                onClick={buscarGemini}
                                disabled={searchState.loading || !domain.trim()}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {searchState.loading
                                    ? <><i className="fa-solid fa-spinner fa-spin"></i>{faseLabel[searchState.fase] ? 'Aguarde...' : '...'}</>
                                    : <><i className="fa-solid fa-magnifying-glass"></i>Buscar</>
                                }
                            </button>
                        </div>

                        {/* Nome específico da empresa — desambiguação */}
                        <div className="mt-3">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                                <i className="fa-solid fa-building-flag text-amber-500"></i>
                                Nome específico da unidade
                                <span className="text-gray-400 font-normal">(opcional — use quando o domínio for genérico)</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={empresaNome}
                                    onChange={e => { setEmpresaNome(e.target.value); setResultados([]); setEmpresaInfo(null); setQueriesGoogle([]); }}
                                    placeholder='Ex: "Banco Carrefour", "Carrefour Soluções Financeiras"'
                                    className="flex-1 px-3 py-2 border border-amber-200 bg-amber-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 placeholder-gray-400"
                                />
                                {empresaNome && (
                                    <button onClick={() => setEmpresaNome('')}
                                        className="text-gray-400 hover:text-gray-600 text-xs px-2"
                                        title="Limpar">
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </div>
                            {empresaNome && (
                                <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                                    <i className="fa-solid fa-circle-info"></i>
                                    O Gemini vai buscar especificamente por <strong>"{empresaNome}"</strong>, filtrando outras unidades do grupo
                                </p>
                            )}
                        </div>

                        {/* Progress feedback */}
                        {searchState.loading && (
                            <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                                <i className="fa-solid fa-spinner fa-spin text-2xl text-blue-600 flex-shrink-0"></i>
                                <div>
                                    <p className="text-sm font-semibold text-blue-700">
                                        {searchState.fase === 'descobrindo' ? '🤖 Gemini AI está pesquisando...' : '📧 Enriquecendo emails via Hunter.io...'}
                                    </p>
                                    <p className="text-xs text-blue-500 mt-0.5">
                                        {searchState.fase === 'descobrindo'
                                            ? 'Consultando o Google Search — pode levar até 30 segundos'
                                            : 'Buscando emails corporativos — 1 crédito por lead'}
                                    </p>
                                </div>
                            </div>
                        )}
                        {searchState.error && (
                            <p className="mt-2 text-xs text-red-500">
                                <i className="fa-solid fa-circle-exclamation mr-1"></i>
                                {searchState.error}
                            </p>
                        )}
                    </div>

                    {/* Departamentos */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            <i className="fa-solid fa-building mr-2 text-blue-500"></i>
                            Departamentos
                            <span className="text-xs font-normal text-gray-400 ml-1">(todos se vazio)</span>
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {DEPARTAMENTOS.map(d => (
                                <button key={d.id} onClick={() => toggleDept(d.id)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors text-left
                                        ${departamentosSelecionados.includes(d.id)
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                                    <i className={`${d.icon} text-xs`}></i>
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Senioridades */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            <i className="fa-solid fa-user-tie mr-2 text-blue-500"></i>
                            Nível Hierárquico
                            <span className="text-xs font-normal text-gray-400 ml-1">(todos se vazio)</span>
                        </label>
                        <div className="flex flex-col gap-1.5">
                            {SENIORIDADES.map(s => (
                                <button key={s.id} onClick={() => toggleSenior(s.id)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors text-left
                                        ${senioridadesSelecionadas.includes(s.id)
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Máximo de resultados ── */}
                    <div className="md:col-span-2 pt-4 border-t border-gray-100">
                        <label className="block text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                            <i className="fa-solid fa-list-ol text-blue-400"></i>
                            Máximo de resultados por busca:
                            <span className="ml-1 font-bold text-blue-700">{maxResultados}</span>
                            <span className="text-gray-400 font-normal ml-1">(mais resultados = busca mais lenta)</span>
                        </label>
                        <input
                            type="range"
                            min={10}
                            max={50}
                            step={5}
                            value={maxResultados}
                            onChange={e => setMaxResultados(Number(e.target.value))}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                            <span>10 (rápido)</span>
                            <span>25 (padrão)</span>
                            <span>50 (completo)</span>
                        </div>
                    </div>

                </div>
            </div>

            {/* Info empresa + queries Google */}
            {empresaInfo && (
                <div className="mb-4 flex flex-col gap-3">
                    {/* Badge empresa */}
                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg text-sm w-fit">
                        <i className="fa-solid fa-building text-blue-600"></i>
                        <span className="font-medium text-blue-800">{empresaInfo.nome}</span>
                    </div>

                    {/* Queries — dica para Extension P */}
                    {queriesGoogle.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="w-5 h-5 rounded bg-[#0A66C2] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">P</span>
                                <p className="text-xs font-semibold text-amber-800">
                                    Quer mais leads? Execute as queries abaixo no Google — o botão <strong>"Capturar Leads"</strong> da Extension aparece automaticamente.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2">
                                {queriesGoogle.map((q, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <code className={`flex-1 text-[11px] rounded-lg px-3 py-1.5 truncate font-mono select-all cursor-text border ${
                                            queriesExecutadas.has(q)
                                                ? 'bg-green-50 border-green-300 text-green-800'
                                                : 'bg-white border-amber-200 text-gray-700'
                                        }`}>
                                            {queriesExecutadas.has(q) && <i className="fa-solid fa-check mr-1.5 text-green-600"></i>}
                                            {q}
                                        </code>
                                        <button
                                            onClick={() => {
                                                window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
                                                setQueriesExecutadas(prev => new Set([...prev, q]));
                                            }}
                                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                queriesExecutadas.has(q)
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-[#0A66C2] text-white hover:bg-[#004182]'
                                            }`}
                                            title={queriesExecutadas.has(q) ? 'Já executada' : 'Abrir no Google'}
                                        >
                                            {queriesExecutadas.has(q)
                                                ? <><i className="fa-solid fa-check text-xs"></i> Executada</>
                                                : <><i className="fa-brands fa-google text-xs"></i> Abrir</>
                                            }
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tabela de resultados */}
            {resultados.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {/* Barra de ações */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 font-medium">
                                <i className="fa-solid fa-users mr-2 text-blue-500"></i>
                                {resultados.length} leads encontrados
                                {resultados.filter(r => r.email).length > 0 && (
                                    <span className="ml-2 text-xs text-green-600">
                                        ({resultados.filter(r => r.email).length} com email)
                                    </span>
                                )}
                            </span>

                            {/* Badge de origem dos leads */}
                            {resultados.some(r => r.fonte === 'extension') && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                    <span className="w-4 h-4 rounded bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">P</span>
                                    Extension
                                </span>
                            )}
                            {!searchState.loading && (
                                <label className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
                                    title="Ative somente após validar os contatos — cada email consome 1 crédito Hunter.io">
                                    <input
                                        type="checkbox"
                                        checked={enriquecerHunter}
                                        onChange={e => setEnriquecerHunter(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded accent-orange-500"
                                    />
                                    <span className="text-xs font-medium text-orange-700 flex items-center gap-1">
                                        <i className="fa-solid fa-envelope text-orange-500"></i>
                                        Buscar emails via Hunter.io
                                        <span className="text-orange-400 font-normal">(consome créditos)</span>
                                    </span>
                                </label>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSalvar}
                                disabled={saving || selecionadosCount === 0}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving
                                    ? <><i className="fa-solid fa-spinner fa-spin mr-1"></i>Salvando...</>
                                    : <><i className="fa-solid fa-floppy-disk mr-1"></i>Salvar ({selecionadosCount})</>
                                }
                            </button>
                            <button
                                onClick={() => exportarXLS(resultados, `prospects_${domain || 'busca'}`)}
                                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
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
                                        <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} className="w-4 h-4 rounded" />
                                    </th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">NOME</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">CARGO / NÍVEL</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMAIL</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">ORIGEM E-MAIL</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">LINKEDIN</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resultados.map((prospect, idx) => (
                                    <tr key={prospect.gemini_id || idx} className="border-b hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                            <input type="checkbox" checked={prospect.selecionado || false} onChange={() => toggleSelecionado(idx)} className="w-4 h-4 rounded" />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                                    {prospect.primeiro_nome?.[0] || '?'}
                                                </div>
                                                <span className="font-medium text-gray-800">{prospect.nome_completo}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="text-gray-700 text-xs">{prospect.cargo}</div>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${nivelBadgeColor(prospect.nivel)}`}>
                                                {prospect.nivel}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="text-gray-700 text-xs font-medium">{prospect.empresa_nome}</div>
                                            {prospect.empresa_setor && (
                                                <div className="text-[10px] text-gray-400">{prospect.empresa_setor}</div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {prospect.email ? (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-gray-700">{prospect.email}</span>
                                                    {prospect.email_status === 'valid' && (
                                                        <i className="fa-solid fa-circle-check text-green-500 text-xs" title="Verificado"></i>
                                                    )}
                                                    {prospect.email_score && (
                                                        <span className="text-[10px] text-gray-400" title="Score Hunter">{prospect.email_score}%</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className={`text-xs ${emailStatusColor(prospect.email_status)}`}>
                                                    {prospect.email_status === 'buscando...' && <i className="fa-solid fa-spinner fa-spin mr-1"></i>}
                                                    {prospect.email_status === 'aguardando...' && <i className="fa-solid fa-clock mr-1"></i>}
                                                    {prospect.email_status || '—'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {prospect.motor_email ? (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                                                    prospect.motor_email === 'hunter_finder' ? 'bg-orange-100 text-orange-700' :
                                                    prospect.motor_email === 'hunter_domain' ? 'bg-yellow-100 text-yellow-700' :
                                                    prospect.motor_email === 'snovio'        ? 'bg-purple-100 text-purple-700' :
                                                    'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {prospect.motor_email === 'hunter_finder' ? '🎯 Hunter Finder' :
                                                     prospect.motor_email === 'hunter_domain' ? '🔵 Hunter Domain' :
                                                     prospect.motor_email === 'snovio'        ? '🟣 Snov.io' :
                                                     prospect.motor_email}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {prospect.linkedin_url ? (
                                                <a href={prospect.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800" title={prospect.linkedin_url}>
                                                    <i className="fa-brands fa-linkedin text-lg"></i>
                                                </a>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {!prospect.email &&
                                             prospect.email_status !== 'buscando...' &&
                                             prospect.email_status !== 'not_found' &&
                                             prospect.email_status !== 'aguardando...' && (
                                                <button
                                                    onClick={() => buscarEmailIndividual(idx)}
                                                    className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                                                    title="Buscar email via Hunter.io"
                                                >
                                                    <i className="fa-solid fa-envelope mr-1"></i>
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
            {!searchState.loading && resultados.length === 0 && !searchState.error && searchState.fase === 'concluido' && (
                <div className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-user-slash text-5xl mb-4 block text-gray-200"></i>
                    <p className="text-lg font-medium text-gray-500">Nenhum executivo encontrado</p>
                    <p className="text-sm mt-2 text-gray-400 max-w-md mx-auto">
                        A empresa pode ter baixa visibilidade pública no LinkedIn ou Google.
                    </p>
                    <div className="mt-4 text-xs text-gray-400 space-y-1">
                        <p>💡 Tente sem filtros de departamento ou nível hierárquico</p>
                        <p>💡 Verifique se o nome da unidade está correto</p>
                        <p>💡 Empresas menores podem não ter perfis indexados</p>
                    </div>
                </div>
            )}
            {!searchState.loading && resultados.length === 0 && !searchState.error && searchState.fase !== 'concluido' && (
                <div className="text-center py-16 text-gray-400">
                    <i className="fa-brands fa-google text-6xl mb-4 block text-blue-200"></i>
                    <p className="text-lg font-medium">Informe o domínio da empresa para começar</p>
                    <p className="text-sm mt-1">Ex: totvs.com.br, ambev.com.br, claranet.com</p>
                    <p className="text-xs mt-3 text-gray-300">
                        <i className="fa-solid fa-shield-halved mr-1"></i>
                        Busca apenas dados públicos — sem login no LinkedIn
                    </p>
                </div>
            )}
        </>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* ABA: LEADS SALVOS                          */}
        {/* ══════════════════════════════════════════ */}
        {abaAtiva === 'salvos' && (
        <>
            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4">
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Todos os status</option>
                    <option value="novo">Novo</option>
                    <option value="contactado">Contactado</option>
                    <option value="qualificado">Qualificado</option>
                    <option value="descartado">Descartado</option>
                </select>
                <input
                    type="text"
                    value={filtroEmpresa}
                    onChange={e => setFiltroEmpresa(e.target.value)}
                    placeholder="Filtrar por empresa..."
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button onClick={carregarLeadsSalvos}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1">
                    <i className="fa-solid fa-filter"></i>
                    Filtrar
                </button>
                <button onClick={() => exportarXLS(leadsSalvos, 'leads_salvos')} disabled={leadsSalvos.length === 0}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                    <i className="fa-solid fa-file-excel"></i>
                    Exportar XLS ({leadsSalvos.length})
                </button>
            </div>

            {loadingSalvos ? (
                <div className="text-center py-10 text-gray-400">
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>
                    Carregando leads salvos...
                </div>
            ) : leadsSalvos.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-database text-5xl mb-3 block"></i>
                    <p>Nenhum lead salvo ainda</p>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">NOME</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">CARGO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMAIL</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">LINKEDIN</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">MOTOR</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">STATUS</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">DATA</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leadsSalvos.map(lead => (
                                    <tr key={lead.id} className="border-b hover:bg-gray-50">
                                        <td className="px-3 py-2 font-medium text-gray-800">{lead.nome_completo}</td>
                                        <td className="px-3 py-2 text-gray-600 text-xs max-w-[180px] truncate" title={lead.cargo || ''}>{lead.cargo || '—'}</td>
                                        <td className="px-3 py-2 text-gray-600 text-xs">{lead.empresa_nome || '—'}</td>
                                        <td className="px-3 py-2 text-xs text-gray-700">{lead.email || <span className="text-gray-300">—</span>}</td>
                                        <td className="px-3 py-2 text-center">
                                            {lead.linkedin_url ? (
                                                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                                                    <i className="fa-brands fa-linkedin"></i>
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                                {lead.motor || 'gemini'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                                lead.status === 'novo'        ? 'bg-gray-100 text-gray-600' :
                                                lead.status === 'contactado'  ? 'bg-blue-100 text-blue-700' :
                                                lead.status === 'qualificado' ? 'bg-green-100 text-green-700' :
                                                'bg-red-100 text-red-600'
                                            }`}>{lead.status}</span>
                                        </td>
                                        <td className="px-3 py-2 text-center text-xs text-gray-400">
                                            {new Date(lead.criado_em).toLocaleDateString('pt-BR')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
        )}
    </div>
    );
};

export default ProspectSearchPage;
