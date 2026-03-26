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
    gravado_por_nome: string | null;
    // Campos CV Extract
    pessoa_id:      number | null;
    candidato_nome: string | null;
    exportado_por:  number | null;
    exportado_em:   string | null;
    exportado_por_nome?: string | null;
    // Reserva de empresa para prospecção
    reservado_por:      number | null;
    reservado_em:       string | null;
    reservado_por_nome: string | null;
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
    initialTab?: 'busca' | 'empresas' | 'leads' | 'exclusoes';
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
    const [abaAtiva, setAbaAtiva]                       = useState<'busca'|'empresas'|'leads'|'exclusoes'>(initialTab ?? 'busca');

    // Sincronizar abaAtiva quando initialTab mudar
    // (ex: usuário navega de "Buscar Leads" → "Meus Prospects" sem desmontar o componente)
    useEffect(() => {
        if (initialTab) setAbaAtiva(initialTab);
    }, [initialTab]);

    // Leads Salvos
    const [leadsSalvos, setLeadsSalvos]                 = useState<ProspectLead[]>([]);
    const [loadingSalvos, setLoadingSalvos]             = useState(false);
    const [filtroStatus, setFiltroStatus]               = useState('');

    // Meus Leads Salvos (leads pesquisados via Gemini/Hunter/Extension)
    const [meusLeads, setMeusLeads]                     = useState<ProspectLead[]>([]);
    const [loadingMeusLeads, setLoadingMeusLeads]       = useState(false);
    const [filtroLeadsEmpresa, setFiltroLeadsEmpresa]   = useState('');
    const [filtroLeadsStatus, setFiltroLeadsStatus]     = useState('');
    const [paginaMeusLeads, setPaginaMeusLeads]         = useState(1);
    const [filtroEmpresa, setFiltroEmpresa]             = useState('');
    const [filtroOrigem, setFiltroOrigem]               = useState(''); // NOVO: filtro por origem CV
    const [marcandoExportado, setMarcandoExportado]     = useState<number | null>(null);
    const [marcandoExclusao, setMarcandoExclusao]       = useState<number | null>(null); // NOVO
    const [resolvendoDominio, setResolvendoDominio]     = useState<number | null>(null); // id do lead sendo resolvido

    // Seleção de leads salvos (para reserva e exportação)
    const [leadsSelecionados, setLeadsSelecionados]     = useState<Set<number>>(new Set());
    const [reservando, setReservando]                   = useState(false);

    // ── VIEW TERRITÓRIO ──────────────────────────────────────────────────────
    const [viewTerritorio, setViewTerritorio]           = useState(false);
    const [usuariosDisponiveis, setUsuariosDisponiveis] = useState<{id: number; nome_usuario: string; tipo_usuario: string}[]>([]);
    const [redistribuindoEmpresa, setRedistribuindoEmpresa] = useState<string | null>(null);
    const [novoResponsavel, setNovoResponsavel]         = useState<string>('');
    const [paginaTerritorio, setPaginaTerritorio]       = useState(1);
    const ITENS_TERRITORIO = 25;
    // ────────────────────────────────────────────────────────────────────────

    // Paginação Leads Salvos
    const [paginaAtual, setPaginaAtual]                 = useState(1);
    const ITENS_POR_PAGINA = 25;

    // Exclusões
    const [exclusoes, setExclusoes]                     = useState<any[]>([]);
    const [loadingExclusoes, setLoadingExclusoes]       = useState(false);
    const [buscaExclusao, setBuscaExclusao]             = useState('');

    // Seleção
    const [todosSelecionados, setTodosSelecionados]     = useState(false);

    // BUG 3 FIX: controle de quantidade máxima de resultados (configurável)
    const [maxResultados, setMaxResultados]             = useState(25);

    // Modal de leads da empresa (View Território → botão Prospectar)
    const [modalEmpresa, setModalEmpresa]               = useState<{ nome: string; leads: ProspectLead[] } | null>(null);
    const [modalSelecionados, setModalSelecionados]     = useState<Set<number>>(new Set());
    const [enriquecendoModal, setEnriquecendoModal]     = useState(false);

    // Progresso do Hunter.io — exibido durante enriquecimento
    const [hunterProgresso, setHunterProgresso]         = useState<{ processados: number; total: number; atual: string } | null>(null);

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
            setResultados(leadsGemini);

            // Empresa não encontrada — resultado vazio com aviso amigável + queries para busca manual
            if (dataGemini.sem_resultados || leadsGemini.length === 0) {
                setSearchState({
                    loading: false,
                    fase: 'concluido',
                    error: dataGemini.aviso ||
                        `Nenhum executivo encontrado para o domínio "${domain}". O domínio pode ter poucos dados públicos indexados. Use as queries abaixo para buscar manualmente no Google.`,
                });
                return;
            }

            // Exibe resultados Gemini imediatamente — Hunter só roda se usuário ativar o checkbox
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

            // Parse seguro — 504/502 retornam HTML, não JSON
            let data: any = {};
            try {
                data = await res.json();
            } catch {
                throw new Error(res.status === 504 ? 'Timeout ao buscar email. Tente novamente.' : `Erro ${res.status} ao buscar email.`);
            }

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
    // PERMISSÕES DE VISIBILIDADE
    // ============================================
    const podeVerTodosLeads     = currentUser?.tipo_usuario === 'Administrador';
    const podeVerTodoTerritorio = ['Administrador', 'Gestão Comercial'].includes(currentUser?.tipo_usuario || '');

    // ============================================
    // LEADS SALVOS
    // ============================================
    const carregarLeadsSalvos = useCallback(async () => {
        setLoadingSalvos(true);
        try {
            const params = new URLSearchParams();
            // Lista Empresas → sempre filtrar por motores de CV Extract
            params.set('origem', 'empresas');
            // SDR vê apenas empresas reservadas para ele
            if (!podeVerTodoTerritorio && currentUser?.id) {
                params.set('reservado_por', String(currentUser.id));
            }
            // Excluir descartados por padrão — só aparecem com filtro explícito
            if (filtroStatus !== 'descartado') {
                params.set('excluir_status', 'descartado');
            }
            if (filtroStatus) params.set('status', filtroStatus);
            if (filtroEmpresa) params.set('empresa', filtroEmpresa);
            if (filtroOrigem)  params.set('motor',   filtroOrigem);
            const res  = await fetch(`/api/prospect-leads?${params}`);
            const data = await res.json();
            if (data.success) { setLeadsSalvos(data.leads || []); setPaginaAtual(1); }
        } catch (e) {
            console.error('Erro ao carregar empresas:', e);
        } finally {
            setLoadingSalvos(false);
        }
    }, [filtroStatus, filtroEmpresa, filtroOrigem, currentUser, podeVerTodoTerritorio]);

    // ============================================
    // MEUS LEADS SALVOS — leads pesquisados via Gemini/Hunter/Extension
    // Admin vê todos; Gestão Comercial e SDR veem apenas os seus (reservado_por)
    // ============================================
    const carregarMeusLeads = useCallback(async () => {
        setLoadingMeusLeads(true);
        try {
            const params = new URLSearchParams();
            // Filtrar apenas leads de pesquisa (não CV Extract)
            params.set('origem', 'leads');
            if (!podeVerTodosLeads && currentUser?.id) {
                params.set('reservado_por', String(currentUser.id));
            }
            // Excluir descartados por padrão — só aparecem com filtro explícito
            if (filtroLeadsStatus !== 'descartado') {
                params.set('excluir_status', 'descartado');
            }
            if (filtroLeadsEmpresa) params.set('empresa', filtroLeadsEmpresa);
            if (filtroLeadsStatus)  params.set('status',  filtroLeadsStatus);
            const res  = await fetch(`/api/prospect-leads?${params}`);
            const data = await res.json();
            if (data.success) { setMeusLeads(data.leads || []); setPaginaMeusLeads(1); }
        } catch (e) {
            console.error('Erro ao carregar meus leads:', e);
        } finally {
            setLoadingMeusLeads(false);
        }
    }, [filtroLeadsEmpresa, filtroLeadsStatus, currentUser, podeVerTodosLeads]);
    // Chamado: ao clicar Prospectar OU ao exportar XLS com seleção
    // ============================================
    const reservarEmpresas = useCallback(async (ids: number[]) => {
        if (!currentUser?.id || ids.length === 0) return;
        try {
            await fetch('/api/prospect-leads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids,
                    reservado_por: currentUser.id,
                }),
            });
            // Atualiza lista local imediatamente
            const nomeAnalista = currentUser.nome_usuario || 'Você';
            setLeadsSalvos(prev => prev.map(l =>
                ids.includes(l.id)
                    ? { ...l, reservado_por: currentUser.id, reservado_em: new Date().toISOString(), reservado_por_nome: nomeAnalista }
                    : l
            ));
        } catch (e) {
            console.error('Erro ao reservar empresa:', e);
        }
    }, [currentUser]);

    // ============================================
    // TERRITÓRIO — carregar usuários para dropdown de redistribuição
    // ============================================
    const carregarUsuarios = useCallback(async () => {
        if (usuariosDisponiveis.length > 0) return; // cache — só carrega uma vez
        try {
            const res  = await fetch('/api/prospect-leads?usuarios=true');
            const data = await res.json();
            if (data.success) setUsuariosDisponiveis(data.usuarios || []);
        } catch (e) {
            console.error('Erro ao carregar usuários:', e);
        }
    }, [usuariosDisponiveis]);

    // Redistribuir todos os leads de uma empresa para outro analista
    const redistribuirEmpresa = useCallback(async (empresaNome: string, novoUserId: number, novoNome: string) => {
        const idsEmpresa = leadsSalvos
            .filter(l => l.empresa_nome === empresaNome)
            .map(l => l.id);
        if (!idsEmpresa.length) return;

        try {
            await fetch('/api/prospect-leads', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsEmpresa, reservado_por: novoUserId, redistribuir: true }),
            });
            // Atualiza lista local
            setLeadsSalvos(prev => prev.map(l =>
                idsEmpresa.includes(l.id)
                    ? { ...l, reservado_por: novoUserId, reservado_em: new Date().toISOString(), reservado_por_nome: novoNome }
                    : l
            ));
            setToastMsg({ tipo: 'ok', msg: `${idsEmpresa.length} leads de "${empresaNome}" redistribuídos para ${novoNome}` });
            setTimeout(() => setToastMsg(null), 4000);
        } catch (e) {
            console.error('Erro ao redistribuir:', e);
            setToastMsg({ tipo: 'erro', msg: 'Erro ao redistribuir empresa.' });
            setTimeout(() => setToastMsg(null), 3000);
        }
        setRedistribuindoEmpresa(null);
        setNovoResponsavel('');
    }, [leadsSalvos]);

    // Liberar empresa — remove reserva (reservado_por → null)
    const liberarEmpresa = useCallback(async (empresaNome: string) => {
        if (!confirm(`Liberar "${empresaNome}" para que outro analista possa prospectar?

A empresa ficará disponível para a equipe.`)) return;
        const idsEmpresa = leadsSalvos
            .filter(l => l.empresa_nome === empresaNome)
            .map(l => l.id);
        if (!idsEmpresa.length) return;

        try {
            await fetch('/api/prospect-leads', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsEmpresa, reservado_por: null }),
            });
            setLeadsSalvos(prev => prev.map(l =>
                idsEmpresa.includes(l.id)
                    ? { ...l, reservado_por: null, reservado_em: null, reservado_por_nome: null }
                    : l
            ));
            setToastMsg({ tipo: 'ok', msg: `"${empresaNome}" liberada para a equipe.` });
            setTimeout(() => setToastMsg(null), 3000);
        } catch (e) {
            console.error('Erro ao liberar empresa:', e);
        }
    }, [leadsSalvos]);

    // ============================================
    // PROSPECTAR — leva empresa do CV para Nova Busca + reserva para o analista
    // ============================================
    const prospectar = useCallback((lead: ProspectLead) => {
        // Registrar analista responsável pela prospecção
        reservarEmpresas([lead.id]);

        // FIX: 'pendente.cadastro' é placeholder de leads de CV sem domínio real — tratar como vazio
        const DOMINIOS_INVALIDOS = ['pendente.cadastro', 'pendente', ''];
        const dominioRaw = lead.empresa_dominio?.trim() || '';
        const dominio = DOMINIOS_INVALIDOS.includes(dominioRaw.toLowerCase()) ? '' : dominioRaw;

        // Limpar estado da busca atual
        setResultados([]);
        setEmpresaInfo(null);
        setQueriesGoogle([]);
        setQueriesExecutadas(new Set());

        // Preencher: se tiver domínio válido → campo Domínio; senão → campo Nome Específico
        if (dominio) {
            setDomain(dominio);
            setEmpresaNome('');
        } else {
            setDomain('');
            setEmpresaNome(lead.empresa_nome || '');
        }

        // Navegar para aba Nova Busca
        setAbaAtiva('busca');

        // Toast orientativo
        const msg = dominio
            ? `Domínio "${dominio}" carregado — configure os filtros e clique em Buscar`
            : `Nome "${lead.empresa_nome}" carregado — informe o domínio e clique em Buscar`;
        setToastMsg({ tipo: 'ok', msg });
        setTimeout(() => setToastMsg(null), 5000);
    }, [reservarEmpresas]);

    // ============================================
    // MARCAR COMO EXPORTADO (leads de CV)
    // ============================================
    const marcarExportado = useCallback(async (leadId: number) => {
        if (!currentUser?.id) return;
        setMarcandoExportado(leadId);
        try {
            const res = await fetch('/api/prospect-cv-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modo:    'marcar_exportado',
                    lead_id: leadId,
                    user_id: currentUser.id,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setLeadsSalvos(prev => prev.map(l =>
                    l.id === leadId
                        ? { ...l, exportado_por: currentUser.id, exportado_em: new Date().toISOString(), exportado_por_nome: currentUser.nome_usuario || 'Você' }
                        : l
                ));
                setToastMsg({ tipo: 'ok', msg: 'Lead marcado como exportado!' });
                setTimeout(() => setToastMsg(null), 3000);
            }
        } catch (e) {
            console.error('Erro ao marcar exportado:', e);
        } finally {
            setMarcandoExportado(null);
        }
    }, [currentUser]);

    // ============================================
    // MARCAR COMO CONSULTORIA — adiciona exclusão + remove leads
    // ============================================
    const marcarComoConsultoria = useCallback(async (lead: ProspectLead) => {
        if (!currentUser?.id) return;
        if (!confirm(`Marcar "${lead.empresa_nome}" como Consultoria de TI?\n\nTodos os leads desta empresa serão removidos da base.`)) return;

        setMarcandoExclusao(lead.id);
        try {
            const res = await fetch('/api/prospect-exclusoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao:         'adicionar',
                    empresa_nome: lead.empresa_nome,
                    dominio:      lead.empresa_dominio || null,
                    motivo:       'consultoria_ti',
                    user_id:      currentUser.id,
                }),
            });
            const data = await res.json();
            if (data.success) {
                // Remove leads da empresa da lista local
                setLeadsSalvos(prev => prev.filter(l =>
                    l.empresa_nome?.toLowerCase() !== lead.empresa_nome?.toLowerCase()
                ));
                setToastMsg({ tipo: 'ok', msg: data.mensagem });
                setTimeout(() => setToastMsg(null), 5000);
            }
        } catch (e) {
            console.error('Erro ao marcar consultoria:', e);
        } finally {
            setMarcandoExclusao(null);
        }
    }, [currentUser]);

    // ============================================
    // RESOLVER DOMÍNIO VIA IA — botão por linha nos Leads Salvos
    // ============================================
    const resolverDominioLead = useCallback(async (lead: ProspectLead) => {
        if (!lead.empresa_nome) return;
        setResolvendoDominio(lead.id);
        try {
            const res = await fetch('/api/prospect-resolve-domain', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ empresa_nome: lead.empresa_nome }),
            });
            const data = await res.json();
            if (data.dominio) {
                // Atualizar no Supabase e na lista local
                await fetch('/api/prospect-leads', {
                    method:  'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        ids:             [lead.id],
                        empresa_dominio: data.dominio,
                    }),
                });
                setLeadsSalvos(prev => prev.map(l =>
                    l.id === lead.id ? { ...l, empresa_dominio: data.dominio } : l
                ));
                setToastMsg({ tipo: 'ok', msg: `Domínio encontrado: ${data.dominio}` });
            } else {
                setToastMsg({ tipo: 'erro', msg: `Domínio não encontrado para "${lead.empresa_nome}"` });
            }
        } catch (e) {
            console.error('Erro ao resolver domínio:', e);
            setToastMsg({ tipo: 'erro', msg: 'Erro ao buscar domínio.' });
        } finally {
            setResolvendoDominio(null);
            setTimeout(() => setToastMsg(null), 3000);
        }
    }, []);

    const carregarExclusoes = useCallback(async () => {
        setLoadingExclusoes(true);
        try {
            const params = new URLSearchParams();
            if (buscaExclusao) params.set('busca', buscaExclusao);
            const res  = await fetch(`/api/prospect-exclusoes?${params}`);
            const data = await res.json();
            if (data.success) setExclusoes(data.exclusoes || []);
        } catch (e) {
            console.error('Erro ao carregar exclusões:', e);
        } finally {
            setLoadingExclusoes(false);
        }
    }, [buscaExclusao]);

    const removerExclusao = useCallback(async (id: number, nome: string) => {
        if (!confirm(`Remover "${nome}" da lista de exclusões?\n\nA empresa voltará a aparecer em futuras extrações de CV.`)) return;
        const res  = await fetch('/api/prospect-exclusoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'remover', exclusao_id: id }),
        });
        const data = await res.json();
        if (data.success) {
            setExclusoes(prev => prev.filter(e => e.id !== id));
            setToastMsg({ tipo: 'ok', msg: `"${nome}" removida das exclusões.` });
            setTimeout(() => setToastMsg(null), 3000);
        }
    }, []);

    useEffect(() => {
        if (abaAtiva === 'exclusoes') carregarExclusoes();
    }, [abaAtiva, carregarExclusoes]);

    useEffect(() => {
        if (abaAtiva === 'empresas') carregarLeadsSalvos();
        if (abaAtiva === 'leads') carregarMeusLeads();
    }, [abaAtiva, carregarLeadsSalvos, carregarMeusLeads]);

    // ============================================
    // INFERIR EMAIL — detecta padrão e aplica aos sem email da mesma empresa
    // ============================================
    const inferirEmailPorPadrao = useCallback((prospects: any[]): any[] => {
        // Normaliza nome para formato de email (remove acentos, caracteres especiais)
        const normalizar = (s: string) =>
            s.normalize('NFD')
             .replace(/\p{M}/gu, '')
             .toLowerCase()
             .replace(/[^a-z0-9]/g, '');

        // Detectar padrão de email por empresa
        // Agrupa por empresa_dominio → encontra emails presentes → infere padrão
        const padroesPorDominio: Record<string, {
            dominio: string;
            padrao: 'nome.sobrenome' | 'nome' | 'n.sobrenome' | 'nsobrenome' | null;
            exemplos: { nome: string; sobrenome: string; email: string }[];
        }> = {};

        // Domínios que NÃO são corporativos — nunca inferir email por eles
        const DOMINIOS_INVALIDOS_INFERENCIA = [
            'pendente.cadastro', 'pendente',
            'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
            'live.com', 'msn.com', 'icloud.com', 'bol.com.br', 'uol.com.br',
            'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
        ];

        // Passo 1: coletar emails reais e derivar o padrão
        prospects.forEach(p => {
            if (!p.email || !p.empresa_dominio) return;
            const [localPart, dominio] = p.email.split('@');
            if (!localPart || !dominio) return;
            // Ignorar domínios pessoais e placeholders
            if (DOMINIOS_INVALIDOS_INFERENCIA.includes(dominio.toLowerCase())) return;

            const partesNome = (p.nome_completo || '').trim().split(/\s+/);
            const primeiro   = normalizar(partesNome[0] || '');
            const sobrenome  = normalizar(partesNome[partesNome.length - 1] || '');
            const inicial    = primeiro[0] || '';

            if (!padroesPorDominio[dominio]) {
                padroesPorDominio[dominio] = { dominio, padrao: null, exemplos: [] };
            }

            // Detectar padrão comparando local part com nome/sobrenome
            let padrao: typeof padroesPorDominio[string]['padrao'] = null;
            if (localPart === `${primeiro}.${sobrenome}`)   padrao = 'nome.sobrenome';
            else if (localPart === `${inicial}.${sobrenome}`) padrao = 'n.sobrenome';
            else if (localPart === primeiro)                 padrao = 'nome';
            else if (localPart === `${primeiro}${sobrenome}`) padrao = 'nsobrenome';

            if (padrao) {
                padroesPorDominio[dominio].padrao = padrao;
                padroesPorDominio[dominio].exemplos.push({ nome: primeiro, sobrenome, email: p.email });
            }
        });

        // Passo 2: aplicar padrão aos sem email da mesma empresa
        let inferidos = 0;
        const resultado = prospects.map(p => {
            if (p.email) return p; // já tem email — não alterar
            if (!p.empresa_dominio) return p;
            // Nunca inferir email para domínios inválidos ou pessoais
            if (DOMINIOS_INVALIDOS_INFERENCIA.includes(p.empresa_dominio.toLowerCase())) return p;

            const info = padroesPorDominio[p.empresa_dominio];
            if (!info?.padrao) return p; // sem padrão detectado — manter sem email

            const partesNome = (p.nome_completo || '').trim().split(/\s+/);
            const primeiro   = normalizar(partesNome[0] || '');
            const sobrenome  = normalizar(partesNome[partesNome.length - 1] || '');
            const inicial    = primeiro[0] || '';

            if (!primeiro || !sobrenome) return p;

            let localPart = '';
            if (info.padrao === 'nome.sobrenome') localPart = `${primeiro}.${sobrenome}`;
            if (info.padrao === 'n.sobrenome')    localPart = `${inicial}.${sobrenome}`;
            if (info.padrao === 'nome')            localPart = primeiro;
            if (info.padrao === 'nsobrenome')      localPart = `${primeiro}${sobrenome}`;

            if (!localPart) return p;

            inferidos++;
            return {
                ...p,
                email:        `${localPart}@${info.dominio}`,
                email_status: 'inferido',  // marcar como inferido (não verificado)
            };
        });

        if (inferidos > 0) {
            console.log(`[exportarXLS] ${inferidos} emails inferidos por padrão`);
        }
        return resultado;
    }, []);

    // ============================================
    // EXPORTAR XLS — padrão Leads2B (48 colunas)
    // Exporta APENAS selecionados (quando há seleção) ou todos
    // Aplica inferência de email por padrão da empresa
    // Reserva analista logado nos registros exportados
    // ============================================
    const exportarXLS = useCallback(async (dados: any[], nomeArquivo: string) => {
        if (!dados.length) return;

        // ── Apenas selecionados (na aba de busca, sempre exporta os selecionados se houver) ──
        const dadosParaExportar = dados;

        // ── Inferir emails faltantes pelo padrão da empresa ──────────────────
        const dadosComEmail = inferirEmailPorPadrao(dadosParaExportar);

        // ── Contar emails inferidos para toast informativo ───────────────────
        const inferidos = dadosComEmail.filter((p, i) =>
            p.email && !dadosParaExportar[i]?.email
        ).length;

        // 48 colunas exatas do padrão de importação Leads2B
        const headers = [
            'cnpj','razão social','nome fantasia','título do negócio','telefone da empresa',
            'e-mail da empresa','logradouro','número','complemento','bairro','cidade','estado',
            'país','cep','notas da negociação','valor','id externo','funil','etapa','origem',
            'tag 1','tag 2','tag 3','grupo','responsável (e-mail)',
            'status (ativo, perdido, ganho)','motivo de perda','temperatura',
            'nome contato 1','departamento contato 1',
            'nome contato 2','departamento contato 2','telefone contato 2','e-mail contato 2',
            'nome contato 3','departamento contato 3','telefone contato 3','e-mail contato 3',
            'campo customizado 1','campo customizado 2','campo customizado 3','campo customizado 4',
            'campo customizado 5','campo customizado 6','campo customizado 7','campo customizado 8',
            'campo customizado 9','campo customizado 10'
        ];

        const rows = dadosComEmail.map(p => {
            const depto = Array.isArray(p.departamentos) && p.departamentos.length > 0
                ? p.departamentos[0]
                : (p.departamento || '');

            return [
                '',                          //  0: cnpj              (sem dado — requer enriquecimento)
                p.empresa_nome    || '',     //  1: razão social
                '',                          //  2: nome fantasia
                '',                          //  3: título do negócio
                '',                          //  4: telefone da empresa
                '',                          //  5: e-mail da empresa
                '',                          //  6: logradouro
                '',                          //  7: número
                '',                          //  8: complemento
                '',                          //  9: bairro
                p.cidade          || '',     // 10: cidade
                p.estado          || '',     // 11: estado
                'Brasil',                    // 12: país
                '',                          // 13: cep
                '',                          // 14: notas da negociação
                '',                          // 15: valor
                '',                          // 16: id externo
                '',                          // 17: funil             (definido na etapa Preparar Campanha)
                'Novos Leads',               // 18: etapa             (FIXO)
                'Campanha',                  // 19: origem            (FIXO)
                '', '', '', '',              // 20-23: tags + grupo
                p.email           || '',     // 24: responsável (e-mail) ← email real ou inferido
                'ativo',                     // 25: status            (FIXO)
                '',                          // 26: motivo de perda
                'Frio',                      // 27: temperatura       (FIXO)
                p.nome_completo   || '',     // 28: nome contato 1
                depto,                       // 29: departamento contato 1
                '', '', '', '',              // 30-33: contato 2
                '', '', '', '',              // 34-37: contato 3
                '', '', '', '', '', '', '', '', '', '', // 38-47: campos customizados
            ];
        });

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

        const msgEmail = inferidos > 0
            ? ` (${inferidos} email${inferidos > 1 ? 's' : ''} inferido${inferidos > 1 ? 's' : ''} por padrão da empresa)`
            : '';
        setToastMsg({ tipo: 'ok', msg: `${dadosComEmail.length} leads exportados no padrão Leads2B!${msgEmail}` });
        setTimeout(() => setToastMsg(null), 5000);

        // ── Marcar todos os leads exportados como 'exportado' no banco ──────
        if (currentUser?.id) {
            const idsComId = dadosParaExportar
                .filter((l: any) => l.id)
                .map((l: any) => l.id);
            if (idsComId.length > 0) {
                try {
                    await fetch('/api/prospect-leads', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ids:              idsComId,
                            marcar_exportado: true,
                            exportado_por:    currentUser.id,
                        }),
                    });
                    // Atualizar estado local imediatamente (sem reload)
                    const agora = new Date().toISOString();
                    const nome  = currentUser.nome_usuario || 'Você';
                    setLeadsSalvos(prev => prev.map(l =>
                        idsComId.includes(l.id)
                            ? { ...l, exportado_por: currentUser.id, exportado_em: agora, exportado_por_nome: nome }
                            : l
                    ));
                    setMeusLeads(prev => prev.map(l =>
                        idsComId.includes(l.id)
                            ? { ...l, exportado_por: currentUser.id, exportado_em: agora, exportado_por_nome: nome }
                            : l
                    ));
                } catch (e) {
                    console.error('Erro ao marcar leads como exportados:', e);
                }
            }
        }
    }, [inferirEmailPorPadrao, currentUser, setLeadsSalvos, setMeusLeads]);

    // ============================================
    // HUNTER — dispara quando usuário ATIVA o checkbox (após ver os leads)
    // Comportamento:
    //   - Se há prospects SELECIONADOS sem email → enriquece apenas os selecionados
    //   - Se nenhum selecionado sem email → enriquece todos sem email
    // Após retorno: merge cirúrgico — preserva prospects não-enviados intactos
    // ============================================
    useEffect(() => {
        if (!enriquecerHunter) return;
        if (searchState.loading) return;
        if (resultados.length === 0) return;

        // Determinar alvo: selecionados sem email, ou todos sem email
        const selecionadosSemEmail = resultados.filter(r => r.selecionado && !r.email);
        const todosSemEmail        = resultados.filter(r => !r.email);
        const alvo = selecionadosSemEmail.length > 0 ? selecionadosSemEmail : todosSemEmail;

        if (alvo.length === 0) return;

        const runHunter = async () => {
            setSearchState({ loading: true, fase: 'enriquecendo', error: null });
            setHunterProgresso({ processados: 0, total: alvo.length, atual: 'Iniciando...' });

            // Simula progresso em lotes de 4 (tempo médio ~8s por lote)
            let processadosSim = 0;
            const BATCH = 4;
            const intervalo = setInterval(() => {
                processadosSim = Math.min(processadosSim + BATCH, alvo.length);
                const nome = alvo[processadosSim - 1]?.primeiro_nome || '';
                setHunterProgresso(prev => prev
                    ? { ...prev, processados: processadosSim, atual: nome ? `Verificando ${nome}...` : 'Finalizando...' }
                    : null
                );
                if (processadosSim >= alvo.length) clearInterval(intervalo);
            }, 8000);

            try {
                const resp = await fetch('/api/prospect-hunter-enrich', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode:      'enrich_list',
                        domain:    domain.trim(),
                        prospects: alvo,
                    }),
                });

                // Parse seguro — 504/502 retornam HTML, não JSON
                let data: any = {};
                try {
                    data = await resp.json();
                } catch {
                    clearInterval(intervalo);
                    const statusMsg = resp.status === 504
                        ? 'Timeout no enriquecimento de email (muitos prospects). Tente com menos selecionados.'
                        : `Erro ${resp.status} no enriquecimento de email.`;
                    console.warn('⚠️ Hunter erro:', statusMsg);
                    setSearchState({ loading: false, fase: 'concluido', error: null });
                    setHunterProgresso(null);
                    return;
                }

                clearInterval(intervalo);

                if (data.success) {
                    const enriquecidos: ProspectResult[] = data.resultados || [];
                    setHunterProgresso({ processados: alvo.length, total: alvo.length, atual: '✅ Concluído!' });

                    // Merge cirúrgico: atualiza apenas os prospects enviados,
                    // preservando todos os outros (seleção, dados, ordem) intactos
                    setResultados(prev => prev.map(original => {
                        const atualizado = enriquecidos.find(
                            e => e.gemini_id
                                ? e.gemini_id === original.gemini_id
                                : e.nome_completo === original.nome_completo
                        );
                        if (!atualizado) return original;
                        return { ...atualizado, selecionado: original.selecionado };
                    }));
                } else {
                    clearInterval(intervalo);
                    console.warn('⚠️ Hunter falhou:', data.error);
                }
            } catch (err: any) {
                clearInterval(intervalo);
                console.warn('⚠️ Hunter erro:', err.message);
            } finally {
                setSearchState({ loading: false, fase: 'concluido', error: null });
                setTimeout(() => setHunterProgresso(null), 2500);
            }
        };

        runHunter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enriquecerHunter]);

    // ============================================
    // HELPERS DE PERMISSÃO
    // ============================================
    const podeGerenciarProspects = () => {
        const perfis = ['Administrador', 'Gestão Comercial', 'SDR'];
        return perfis.includes(currentUser?.tipo_usuario || '');
    };

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
    // PAGINAÇÃO — Leads Salvos
    // ============================================
    const totalPaginas = Math.ceil(leadsSalvos.length / ITENS_POR_PAGINA);
    const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const fimPagina    = inicioPagina + ITENS_POR_PAGINA;
    const leadsPagina  = leadsSalvos.slice(inicioPagina, fimPagina);

    const irParaPagina = (pagina: number) => {
        setPaginaAtual(pagina);
        document.getElementById('leads-salvos-topo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ============================================
    // RENDER
    // ============================================
    return (
    <>
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
            {(['busca', 'empresas', 'leads', 'exclusoes'] as const).map(aba => (
                <button key={aba} onClick={() => setAbaAtiva(aba)}
                    className={`px-4 py-2 text-sm font-medium rounded-t transition-colors
                        ${abaAtiva === aba
                            ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                            : 'text-gray-500 hover:text-gray-700'}`}>
                    {aba === 'busca'     ? <><i className="fa-solid fa-magnifying-glass mr-2"></i>Nova Busca</>
                     : aba === 'empresas' ? <><i className="fa-solid fa-building mr-2"></i>Lista Empresas</>
                     : aba === 'leads'   ? <><i className="fa-solid fa-users mr-2"></i>Meus Leads Salvos</>
                                        : <><i className="fa-solid fa-ban mr-2 text-red-400"></i>Exclusões</>}
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
                            <p className={`mt-2 text-xs flex items-start gap-1.5 ${
                                searchState.fase === 'concluido'
                                    ? 'text-amber-600'   // aviso: empresa não encontrada
                                    : 'text-red-500'     // erro real de sistema
                            }`}>
                                <i className={`fa-solid mt-0.5 flex-shrink-0 ${
                                    searchState.fase === 'concluido'
                                        ? 'fa-triangle-exclamation'
                                        : 'fa-circle-exclamation'
                                }`}></i>
                                <span>{searchState.error}</span>
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
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative">

                    {/* ── Banner de progresso Hunter.io ────────────────── */}
                    {hunterProgresso && (
                        <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 rounded-xl">
                            <div className="flex flex-col items-center gap-3 px-8 py-6 bg-white border border-orange-200 rounded-2xl shadow-lg max-w-sm w-full mx-4">
                                {/* Ícone animado */}
                                <div className="relative">
                                    <div className="w-14 h-14 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin"/>
                                    <span className="absolute inset-0 flex items-center justify-center text-xl">📧</span>
                                </div>
                                {/* Título */}
                                <div className="text-center">
                                    <p className="font-bold text-gray-800 text-sm">Buscando emails via Hunter.io</p>
                                    <p className="text-xs text-orange-600 mt-0.5">{hunterProgresso.atual}</p>
                                </div>
                                {/* Barra de progresso */}
                                <div className="w-full">
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>{hunterProgresso.processados} de {hunterProgresso.total} prospects</span>
                                        <span>{Math.round((hunterProgresso.processados / hunterProgresso.total) * 100)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="bg-orange-500 h-2 rounded-full transition-all duration-700 ease-out"
                                            style={{ width: `${Math.round((hunterProgresso.processados / hunterProgresso.total) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-400 text-center">
                                    Cada prospect consome 1 crédito Hunter.io · Aguarde sem fechar a aba
                                </p>
                            </div>
                        </div>
                    )}
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
                                onClick={() => {
                                    // Exportar apenas selecionados; se nenhum selecionado, exportar todos
                                    const paraExportar = selecionadosCount > 0
                                        ? resultados.filter(r => r.selecionado)
                                        : resultados;
                                    exportarXLS(paraExportar, `prospects_${domain || 'busca'}`);
                                }}
                                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                            >
                                <i className="fa-solid fa-file-excel mr-1"></i>
                                {selecionadosCount > 0
                                    ? `Exportar XLS (${selecionadosCount})`
                                    : `Exportar XLS (${resultados.length})`
                                }
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

            {/* Estado vazio — empresa não encontrada com queries para busca manual */}
            {!searchState.loading && resultados.length === 0 && searchState.fase === 'concluido' && (
                <div className="py-8">
                    {/* Card de aviso */}
                    <div className="flex flex-col items-center text-center mb-6">
                        <i className="fa-solid fa-building-circle-exclamation text-5xl mb-3 text-amber-300"></i>
                        <p className="text-lg font-semibold text-gray-600">Empresa não encontrada automaticamente</p>
                        <p className="text-sm mt-1 text-gray-400 max-w-lg mx-auto">
                            O domínio <strong className="text-gray-600">{domain}</strong> tem poucos dados públicos indexados pelo Google.
                            Use as queries abaixo para buscar manualmente e capturar os leads via Extensão Chrome.
                        </p>
                    </div>

                    {/* Queries para busca manual */}
                    {queriesGoogle.length > 0 && (
                        <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-amber-700 mb-3 flex items-center gap-2">
                                <i className="fa-brands fa-google"></i>
                                Pesquise no Google e use a Extensão Chrome para capturar os leads:
                            </p>
                            <div className="space-y-2">
                                {queriesGoogle.map((q, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <a
                                            href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                                        >
                                            <i className="fa-brands fa-google text-blue-500 flex-shrink-0"></i>
                                            <span className="font-mono truncate">{q}</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-gray-300 group-hover:text-blue-500 flex-shrink-0 ml-auto text-[10px]"></i>
                                        </a>
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(q); setToastMsg({ tipo: 'ok', msg: 'Query copiada!' }); setTimeout(() => setToastMsg(null), 2000); }}
                                            className="px-2 py-2 text-xs bg-white border border-amber-200 rounded-lg text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors flex-shrink-0"
                                            title="Copiar query"
                                        >
                                            <i className="fa-solid fa-copy"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-amber-500 mt-3 flex items-center gap-1">
                                <i className="fa-solid fa-circle-info"></i>
                                Abra cada link no Google, a Extensão detectará automaticamente os perfis LinkedIn nos resultados.
                            </p>
                        </div>
                    )}

                    {/* Dicas adicionais */}
                    <div className="mt-4 text-center text-xs text-gray-400 space-y-1">
                        <p>💡 Tente sem filtros de departamento ou nível hierárquico</p>
                        <p>💡 Verifique se o nome da unidade está correto no campo "Nome específico"</p>
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
        {abaAtiva === 'empresas' && (
        <>
            {/* Filtros + Toggle Lista/Território */}
            <div id="leads-salvos-topo" className="flex flex-wrap gap-3 mb-4">
                {/* Toggle Lista / Território */}
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
                    <button
                        onClick={() => setViewTerritorio(false)}
                        className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                            !viewTerritorio ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <i className="fa-solid fa-list"></i> Lista
                    </button>
                    <button
                        onClick={() => { setViewTerritorio(true); setPaginaTerritorio(1); carregarUsuarios(); }}
                        className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                            viewTerritorio ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <i className="fa-solid fa-map-location-dot"></i> Território
                    </button>
                </div>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Todos (exceto descartados)</option>
                    <option value="novo">Novo</option>
                    <option value="exportado">Exportado</option>
                    <option value="descartado">Ver descartados</option>
                </select>
                {/* NOVO: filtro por origem */}
                <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Todas as origens</option>
                    <option value="gemini">🤖 Gemini AI</option>
                    <option value="hunter">🎯 Hunter.io</option>
                    <option value="gemini+hunter">🤖+🎯 Gemini+Hunter</option>
                    <option value="extension">🔌 Extensão Chrome</option>
                    <option value="cv_alocacao">👨‍💻 CV Origem Alocação</option>
                    <option value="cv_infra">🖥️ CV Origem Infra</option>
                    <option value="cv_ia_ml">🧠 CV Origem IA/ML</option>
                    <option value="cv_sap">⚙️ CV Origem SAP</option>
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
                {/* Exportar — visível APENAS no filtro "Meus Prospects" e apenas para Administrador */}
                {abaAtiva === 'empresas' && currentUser?.tipo_usuario === 'Administrador' && (
                <button onClick={async () => {
                        const dadosParaExportar = leadsSelecionados.size > 0
                            ? leadsSalvos.filter(l => leadsSelecionados.has(l.id))
                            : leadsSalvos;
                        if (dadosParaExportar.length === 0) return;
                        // Reservar empresas selecionadas para o analista
                        if (leadsSelecionados.size > 0) {
                            setReservando(true);
                            await reservarEmpresas(Array.from(leadsSelecionados));
                            setReservando(false);
                        }
                        exportarXLS(dadosParaExportar, 'meus_prospects');
                    }}
                    disabled={leadsSalvos.length === 0 || reservando}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                    title="Exportar Meus Prospects para Leads2B">
                    <i className={`fa-solid ${reservando ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
                    {leadsSelecionados.size > 0
                        ? `Exportar Selecionados (${leadsSelecionados.size})`
                        : `Exportar Lista Empresas (${leadsSalvos.length})`
                    }
                </button>
                )}
                {/* Botão carga bulk CV — apenas Administrador */}
                {currentUser?.tipo_usuario === 'Administrador' && (
                <button
                    onClick={async () => {
                        if (!currentUser?.id) return;
                        if (!confirm('Iniciar carga de empresas dos CVs dos candidatos para a base de Prospects?\n\nEste processo pode levar alguns minutos.')) return;
                        setToastMsg({ tipo: 'ok', msg: '⏳ Carga iniciada — aguarde...' });
                        const res = await fetch('/api/prospect-cv-extract', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ modo: 'bulk', user_id: currentUser.id }),
                        });
                        const data = await res.json();
                        if (data.success) {
                            setToastMsg({ tipo: 'ok', msg: `✅ Carga concluída: ${data.leads_inseridos} leads inseridos de ${data.processados} candidatos.` });
                            setTimeout(() => { setToastMsg(null); carregarLeadsSalvos(); }, 5000);
                        } else {
                            setToastMsg({ tipo: 'erro', msg: `Erro na carga: ${data.error}` });
                            setTimeout(() => setToastMsg(null), 4000);
                        }
                    }}
                    className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 flex items-center gap-1"
                    title="Extrair empresas dos CVs dos candidatos para a base de Prospects"
                >
                    <i className="fa-solid fa-file-import"></i>
                    Importar CVs
                </button>
                )}
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

            ) : viewTerritorio ? (
                /* ══════════════════════════════════════════════════════════
                   VIEW TERRITÓRIO — agrupado por empresa
                   ══════════════════════════════════════════════════════════ */
                (() => {
                    // Agrupar leads por empresa_nome
                    const grupos: Record<string, typeof leadsSalvos> = {};
                    leadsSalvos.forEach(l => {
                        const key = l.empresa_nome || '(sem empresa)';
                        if (!grupos[key]) grupos[key] = [];
                        grupos[key].push(l);
                    });

                    // Derivar status da empresa a partir dos dados existentes
                    const statusEmpresa = (leads: typeof leadsSalvos): { label: string; cls: string; icon: string } => {
                        const exportados  = leads.filter(l => l.exportado_em).length;
                        const reservado   = leads.some(l => l.reservado_por_nome);
                        if (exportados === leads.length && leads.length > 0)
                            return { label: 'Exportada',       cls: 'bg-green-100 text-green-700',   icon: 'fa-check-double' };
                        if (exportados > 0)
                            return { label: 'Em Prospecção',   cls: 'bg-blue-100 text-blue-700',     icon: 'fa-magnifying-glass-chart' };
                        if (reservado)
                            return { label: 'Reservada',       cls: 'bg-amber-100 text-amber-700',   icon: 'fa-lock' };
                        return { label: 'Disponível',          cls: 'bg-gray-100 text-gray-500',     icon: 'fa-circle-dot' };
                    };

                    const empresasOrdenadas = Object.entries(grupos).sort(([, a], [, b]) => {
                        // Ordenar: Em Prospecção > Reservada > Disponível > Exportada
                        const prioridade = (leads: typeof leadsSalvos) => {
                            const st = statusEmpresa(leads).label;
                            if (st === 'Em Prospecção') return 0;
                            if (st === 'Reservada')     return 1;
                            if (st === 'Disponível')    return 2;
                            return 3;
                        };
                        return prioridade(a) - prioridade(b);
                    });

                    const totalPaginasTerritorio = Math.ceil(empresasOrdenadas.length / ITENS_TERRITORIO);
                    const inicioTerritorio = (paginaTerritorio - 1) * ITENS_TERRITORIO;
                    const empresasPagina   = empresasOrdenadas.slice(inicioTerritorio, inicioTerritorio + ITENS_TERRITORIO);

                    return (
                        <div className="space-y-2">
                            {/* Legenda de status */}
                            <div className="flex flex-wrap gap-3 mb-4 px-1">
                                {[
                                    { label: 'Em Prospecção', cls: 'bg-blue-100 text-blue-700',   icon: 'fa-magnifying-glass-chart' },
                                    { label: 'Reservada',     cls: 'bg-amber-100 text-amber-700', icon: 'fa-lock' },
                                    { label: 'Disponível',    cls: 'bg-gray-100 text-gray-500',   icon: 'fa-circle-dot' },
                                    { label: 'Exportada',     cls: 'bg-green-100 text-green-700', icon: 'fa-check-double' },
                                ].map(s => (
                                    <span key={s.label} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${s.cls}`}>
                                        <i className={`fa-solid ${s.icon} text-[10px]`}></i>
                                        {s.label}
                                    </span>
                                ))}
                                <span className="text-xs text-gray-400 ml-auto self-center">
                                    {Object.keys(grupos).length} empresa{Object.keys(grupos).length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Tabela de empresas */}
                            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-100 text-left">
                                            <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">EMPRESA</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">LEADS</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">E-MAILS</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">EXPORTADO</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">STATUS</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">ANALISTA</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">DESDE</th>
                                            <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">AÇÕES</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {empresasPagina.map(([empresaNome, leads]) => {
                                            const st         = statusEmpresa(leads);
                                            const responsavel = leads.find(l => l.reservado_por_nome)?.reservado_por_nome || null;
                                            const responsavelId = leads.find(l => l.reservado_por)?.reservado_por || null;
                                            const comEmail   = leads.filter(l => l.email).length;
                                            const exportados = leads.filter(l => l.exportado_em).length;
                                            const maisAntigo = leads.reduce((min, l) =>
                                                l.criado_em < min ? l.criado_em : min, leads[0].criado_em);
                                            const isRedistribuindo = redistribuindoEmpresa === empresaNome;
                                            const ehMinha = responsavelId === currentUser?.id;

                                            return (
                                                <tr key={empresaNome} className="border-b hover:bg-indigo-50/30 transition-colors">
                                                    {/* EMPRESA */}
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-800 text-sm">{empresaNome}</div>
                                                        {leads[0]?.empresa_dominio && (
                                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                                {leads[0].empresa_dominio}
                                                            </div>
                                                        )}
                                                    </td>
                                                    {/* LEADS */}
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                                                            {leads.length}
                                                        </span>
                                                    </td>
                                                    {/* E-MAILS */}
                                                    <td className="px-3 py-3 text-center">
                                                        {comEmail > 0 ? (
                                                            <span className="text-xs text-green-600 font-medium">
                                                                {comEmail}/{leads.length}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    {/* EXPORTADO */}
                                                    <td className="px-3 py-3 text-center">
                                                        {exportados > 0 ? (
                                                            <span className="text-xs font-medium text-green-600">
                                                                ✅ {exportados}/{leads.length}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    {/* STATUS */}
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium ${st.cls}`}>
                                                            <i className={`fa-solid ${st.icon} text-[9px]`}></i>
                                                            {st.label}
                                                        </span>
                                                    </td>
                                                    {/* ANALISTA */}
                                                    <td className="px-3 py-3 text-center min-w-[160px]">
                                                        {isRedistribuindo ? (
                                                            /* Dropdown de redistribuição */
                                                            <div className="flex items-center gap-1.5">
                                                                <select
                                                                    value={novoResponsavel}
                                                                    onChange={e => setNovoResponsavel(e.target.value)}
                                                                    className="flex-1 text-xs px-2 py-1 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                                    autoFocus
                                                                >
                                                                    <option value="">Selecionar...</option>
                                                                    {usuariosDisponiveis.map(u => (
                                                                        <option key={u.id} value={String(u.id)}>
                                                                            {u.nome_usuario.split(' ')[0]}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <button
                                                                    onClick={() => {
                                                                        if (!novoResponsavel) return;
                                                                        const user = usuariosDisponiveis.find(u => u.id === Number(novoResponsavel));
                                                                        if (user) redistribuirEmpresa(empresaNome, user.id, user.nome_usuario);
                                                                    }}
                                                                    disabled={!novoResponsavel}
                                                                    className="px-1.5 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-40"
                                                                    title="Confirmar redistribuição"
                                                                >
                                                                    <i className="fa-solid fa-check"></i>
                                                                </button>
                                                                <button
                                                                    onClick={() => { setRedistribuindoEmpresa(null); setNovoResponsavel(''); }}
                                                                    className="px-1.5 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                                                                    title="Cancelar"
                                                                >
                                                                    <i className="fa-solid fa-xmark"></i>
                                                                </button>
                                                            </div>
                                                        ) : responsavel ? (
                                                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                                                                ehMinha ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
                                                            }`}>
                                                                <i className="fa-solid fa-user text-[9px]"></i>
                                                                {responsavel.split(' ')[0]}
                                                                {ehMinha && <span className="text-[9px] opacity-70">(você)</span>}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    {/* DESDE */}
                                                    <td className="px-3 py-3 text-center text-xs text-gray-400 whitespace-nowrap">
                                                        {new Date(maisAntigo).toLocaleDateString('pt-BR')}
                                                    </td>
                                                    {/* AÇÕES */}
                                                    <td className="px-3 py-3 text-center">
                                                        {!isRedistribuindo && (
                                                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                                {/* Ver Leads — abre modal com leads salvos da empresa */}
                                                                {(!responsavel || ehMinha) && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setModalEmpresa({ nome: empresaNome, leads });
                                                                            setModalSelecionados(new Set());
                                                                        }}
                                                                        className="text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white transition-colors whitespace-nowrap font-medium"
                                                                        title="Ver leads salvos desta empresa"
                                                                    >
                                                                        <i className="fa-solid fa-users mr-1 text-[9px]"></i>
                                                                        Ver Leads ({leads.length})
                                                                    </button>
                                                                )}
                                                                {/* Buscar Mais — nova busca na empresa (comportamento original) */}
                                                                {(!responsavel || ehMinha) && (
                                                                    <button
                                                                        onClick={() => prospectar(leads[0])}
                                                                        className="text-[10px] px-2 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-600 hover:text-white transition-colors whitespace-nowrap font-medium"
                                                                        title="Buscar mais contatos nesta empresa"
                                                                    >
                                                                        <i className="fa-solid fa-magnifying-glass mr-1 text-[9px]"></i>
                                                                        Buscar Mais
                                                                    </button>
                                                                )}
                                                                {/* Redistribuir — Admin/Comercial/SDR redistribuem qualquer; outros só as suas */}
                                                                {(podeGerenciarProspects() || ehMinha) && responsavel && (
                                                                    <button
                                                                        onClick={() => { setRedistribuindoEmpresa(empresaNome); setNovoResponsavel(''); carregarUsuarios(); }}
                                                                        className="text-[10px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-colors whitespace-nowrap font-medium"
                                                                        title="Redistribuir para outro analista"
                                                                    >
                                                                        <i className="fa-solid fa-arrows-rotate mr-1 text-[9px]"></i>
                                                                        Redistribuir
                                                                    </button>
                                                                )}
                                                                {/* Liberar — Admin/Comercial/SDR liberam qualquer; outros só as suas */}
                                                                {(podeGerenciarProspects() || ehMinha) && responsavel && (
                                                                    <button
                                                                        onClick={() => liberarEmpresa(empresaNome)}
                                                                        className="text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-500 border border-red-200 hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap font-medium"
                                                                        title="Liberar empresa para a equipe"
                                                                    >
                                                                        <i className="fa-solid fa-lock-open mr-1 text-[9px]"></i>
                                                                        Liberar
                                                                    </button>
                                                                )}
                                                                {/* Reservar — empresa disponível */}
                                                                {!responsavel && (
                                                                    <button
                                                                        onClick={() => reservarEmpresas(leads.map(l => l.id))}
                                                                        className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-500 hover:text-white transition-colors whitespace-nowrap font-medium"
                                                                        title="Reservar empresa para você"
                                                                    >
                                                                        <i className="fa-solid fa-lock mr-1 text-[9px]"></i>
                                                                        Reservar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Paginação Território */}
                            {totalPaginasTerritorio > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                                    <span className="text-xs text-gray-500">
                                        {inicioTerritorio + 1}–{Math.min(inicioTerritorio + ITENS_TERRITORIO, empresasOrdenadas.length)} de <strong>{empresasOrdenadas.length}</strong> empresas
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setPaginaTerritorio(1)} disabled={paginaTerritorio === 1}
                                            className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            <i className="fa-solid fa-angles-left"></i>
                                        </button>
                                        <button onClick={() => setPaginaTerritorio(p => Math.max(1, p - 1))} disabled={paginaTerritorio === 1}
                                            className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            <i className="fa-solid fa-angle-left"></i>
                                        </button>
                                        {Array.from({ length: totalPaginasTerritorio }, (_, i) => i + 1)
                                            .filter(p => p === 1 || p === totalPaginasTerritorio || Math.abs(p - paginaTerritorio) <= 1)
                                            .reduce((acc: (number|string)[], p, i, arr) => {
                                                if (i > 0 && (p as number) - (arr[i-1] as number) > 1) acc.push('...');
                                                acc.push(p);
                                                return acc;
                                            }, [])
                                            .map((p, idx) => p === '...'
                                                ? <span key={`ell-${idx}`} className="px-1 text-xs text-gray-400">…</span>
                                                : (
                                                    <button key={p} onClick={() => setPaginaTerritorio(p as number)}
                                                        className={`px-2.5 py-1 text-xs rounded border transition-colors font-medium ${
                                                            paginaTerritorio === p
                                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                                : 'border-gray-200 text-gray-600 hover:bg-white hover:border-indigo-300 hover:text-indigo-600'
                                                        }`}>
                                                        {p}
                                                    </button>
                                                )
                                            )
                                        }
                                        <button onClick={() => setPaginaTerritorio(p => Math.min(totalPaginasTerritorio, p + 1))} disabled={paginaTerritorio === totalPaginasTerritorio}
                                            className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            <i className="fa-solid fa-angle-right"></i>
                                        </button>
                                        <button onClick={() => setPaginaTerritorio(totalPaginasTerritorio)} disabled={paginaTerritorio === totalPaginasTerritorio}
                                            className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            <i className="fa-solid fa-angles-right"></i>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()

            ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center w-8">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded"
                                            checked={leadsSalvos.length > 0 && leadsSalvos.every(l => leadsSelecionados.has(l.id))}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    setLeadsSelecionados(new Set(leadsSalvos.map(l => l.id)));
                                                } else {
                                                    setLeadsSelecionados(new Set());
                                                }
                                            }}
                                            title="Selecionar todos"
                                        />
                                    </th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">RESERVADO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">ORIGEM</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">GRAVADO POR</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">EXPORTADO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">AÇÃO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">STATUS</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">DATA</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leadsPagina.map(lead => (
                                    <tr key={lead.id} className={`border-b hover:bg-gray-50 ${leadsSelecionados.has(lead.id) ? 'bg-blue-50' : ''}`}>
                                        {/* ── Checkbox seleção ── */}
                                        <td className="px-3 py-2 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded"
                                                checked={leadsSelecionados.has(lead.id)}
                                                onChange={() => {
                                                    setLeadsSelecionados(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(lead.id)) next.delete(lead.id);
                                                        else next.add(lead.id);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </td>
                                        {/* EMPRESA — nome + cargo como subtítulo */}
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-gray-800 text-sm">{lead.empresa_nome || '—'}</div>
                                            {lead.nome_completo && (
                                                <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[200px]" title={`${lead.nome_completo}${lead.cargo ? ` · ${lead.cargo}` : ''}`}>
                                                    {lead.nome_completo}
                                                    {lead.cargo ? <span className="text-gray-300"> · {lead.cargo.substring(0, 30)}{lead.cargo.length > 30 ? '…' : ''}</span> : ''}
                                                </div>
                                            )}
                                            {lead.linkedin_url && (
                                                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                    className="text-[10px] text-blue-400 hover:text-blue-600 mt-0.5 inline-flex items-center gap-0.5">
                                                    <i className="fa-brands fa-linkedin text-[9px]"></i> LinkedIn
                                                </a>
                                            )}
                                        </td>
                                        {/* ── RESERVADO — analista que reservou a empresa ── */}
                                        <td className="px-3 py-2 text-center">
                                            {lead.reservado_por_nome ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium whitespace-nowrap" title={`Reservado por ${lead.reservado_por_nome}`}>
                                                    🔒 {lead.reservado_por_nome.split(' ')[0]}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </td>
                                        {/* ORIGEM — motor com badges distintos para CV */}
                                        <td className="px-3 py-2 text-center">
                                            {(() => {
                                                const m = lead.motor || 'gemini';
                                                const badges: Record<string, { label: string; cls: string }> = {
                                                    'gemini':        { label: '🤖 Gemini',       cls: 'bg-blue-100 text-blue-700' },
                                                    'hunter':        { label: '🎯 Hunter',        cls: 'bg-orange-100 text-orange-700' },
                                                    'gemini+hunter': { label: '🤖+🎯 G+H',        cls: 'bg-amber-100 text-amber-700' },
                                                    'extension':     { label: '🔌 Extensão',      cls: 'bg-gray-100 text-gray-600' },
                                                    'cv_alocacao':   { label: '👨‍💻 CV Alocação',   cls: 'bg-indigo-100 text-indigo-700' },
                                                    'cv_infra':      { label: '🖥️ CV Infra',       cls: 'bg-teal-100 text-teal-700' },
                                                    'cv_ia_ml':      { label: '🧠 CV IA/ML',       cls: 'bg-purple-100 text-purple-700' },
                                                    'cv_sap':        { label: '⚙️ CV SAP',          cls: 'bg-yellow-100 text-yellow-700' },
                                                };
                                                const b = badges[m] || { label: m, cls: 'bg-gray-100 text-gray-500' };
                                                return (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${b.cls}`}>
                                                        {b.label}
                                                    </span>
                                                );
                                            })()}
                                            {/* Candidato de origem (só para leads de CV) */}
                                            {lead.candidato_nome && (
                                                <div className="text-[9px] text-gray-400 mt-0.5 truncate max-w-[100px]" title={lead.candidato_nome}>
                                                    {lead.candidato_nome.split(' ').slice(0, 2).join(' ')}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {lead.gravado_por_nome ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium whitespace-nowrap">
                                                    {lead.gravado_por_nome.split(' ').slice(0, 2).join(' ')}
                                                </span>
                                            ) : lead.motor?.startsWith('cv_') ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium whitespace-nowrap" title="Importado automaticamente pelo sistema RAISA">
                                                    🤖 RAISA
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </td>
                                        {/* EXPORTADO — botão ou badge */}
                                        <td className="px-3 py-2 text-center">
                                            {lead.exportado_em ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium whitespace-nowrap">
                                                        ✅ Exportado
                                                    </span>
                                                    {lead.exportado_por_nome && (
                                                        <span className="text-[9px] text-gray-400">
                                                            {lead.exportado_por_nome.split(' ')[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => marcarExportado(lead.id)}
                                                    disabled={marcandoExportado === lead.id}
                                                    className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                                                    title="Marcar como exportado para Leads2B"
                                                >
                                                    {marcandoExportado === lead.id
                                                        ? <i className="fa-solid fa-spinner fa-spin"></i>
                                                        : '↗ Marcar exportado'
                                                    }
                                                </button>
                                            )}
                                        </td>
                                        {/* AÇÃO — botão Prospectar + É Consultoria */}
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                {(['cv_alocacao','cv_infra','cv_ia_ml','cv_sap'].includes(lead.motor) || !lead.email) && (
                                                    <button
                                                        onClick={() => prospectar(lead)}
                                                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white transition-colors whitespace-nowrap font-medium w-full justify-center"
                                                        title={lead.empresa_dominio ? `Buscar contatos em ${lead.empresa_dominio}` : `Buscar contatos em ${lead.empresa_nome}`}
                                                    >
                                                        <i className="fa-solid fa-magnifying-glass text-[9px]"></i>
                                                        Prospectar
                                                    </button>
                                                )}
                                                {/* Resolver Domínio via IA — só para leads sem domínio ou com placeholder */}
                                                {(!lead.empresa_dominio || lead.empresa_dominio === 'pendente.cadastro') && (
                                                    <button
                                                        onClick={() => resolverDominioLead(lead)}
                                                        disabled={resolvendoDominio === lead.id}
                                                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-600 hover:text-white transition-colors whitespace-nowrap font-medium w-full justify-center disabled:opacity-50"
                                                        title={`Buscar domínio de "${lead.empresa_nome}" via IA`}
                                                    >
                                                        {resolvendoDominio === lead.id
                                                            ? <><i className="fa-solid fa-spinner fa-spin text-[9px]"></i> Buscando...</>
                                                            : <><i className="fa-brands fa-google text-[9px]"></i> Resolver domínio</>
                                                        }
                                                    </button>
                                                )}
                                                {/* É Consultoria — Administrador, Gestão Comercial e SDR */}
                                                {lead.empresa_nome && podeGerenciarProspects() && (
                                                    <button
                                                        onClick={() => marcarComoConsultoria(lead)}
                                                        disabled={marcandoExclusao === lead.id}
                                                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-500 border border-red-200 hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap font-medium w-full justify-center disabled:opacity-50"
                                                        title="Marcar como Consultoria de TI e remover da base"
                                                    >
                                                        {marcandoExclusao === lead.id
                                                            ? <i className="fa-solid fa-spinner fa-spin text-[9px]"></i>
                                                            : <i className="fa-solid fa-ban text-[9px]"></i>
                                                        }
                                                        É Consultoria
                                                    </button>
                                                )}
                                            </div>
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

                    {/* ── Rodapé de Paginação ── */}
                    {totalPaginas > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                            {/* Info */}
                            <span className="text-xs text-gray-500">
                                {inicioPagina + 1}–{Math.min(fimPagina, leadsSalvos.length)} de <strong>{leadsSalvos.length}</strong> leads
                            </span>

                            {/* Navegação */}
                            <div className="flex items-center gap-1">
                                {/* Início */}
                                <button
                                    onClick={() => irParaPagina(1)}
                                    disabled={paginaAtual === 1}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Primeira página"
                                >
                                    <i className="fa-solid fa-angles-left"></i>
                                </button>
                                {/* Anterior */}
                                <button
                                    onClick={() => irParaPagina(paginaAtual - 1)}
                                    disabled={paginaAtual === 1}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Página anterior"
                                >
                                    <i className="fa-solid fa-angle-left"></i>
                                </button>

                                {/* Números de página */}
                                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                                    .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaAtual) <= 2)
                                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                                        acc.push(p);
                                        return acc;
                                    }, [])
                                    .map((p, idx) => p === '...'
                                        ? <span key={`ellipsis-${idx}`} className="px-1 text-xs text-gray-400">…</span>
                                        : (
                                            <button
                                                key={p}
                                                onClick={() => irParaPagina(p as number)}
                                                className={`px-2.5 py-1 text-xs rounded border transition-colors font-medium ${
                                                    paginaAtual === p
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'border-gray-200 text-gray-600 hover:bg-white hover:border-blue-300 hover:text-blue-600'
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        )
                                    )
                                }

                                {/* Próxima */}
                                <button
                                    onClick={() => irParaPagina(paginaAtual + 1)}
                                    disabled={paginaAtual === totalPaginas}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Próxima página"
                                >
                                    <i className="fa-solid fa-angle-right"></i>
                                </button>
                                {/* Final */}
                                <button
                                    onClick={() => irParaPagina(totalPaginas)}
                                    disabled={paginaAtual === totalPaginas}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white hover:border-blue-300 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Última página"
                                >
                                    <i className="fa-solid fa-angles-right"></i>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
        )}
        {/* ══════════════════════════════════════════ */}
        {/* ABA: MEUS LEADS SALVOS                     */}
        {/* ══════════════════════════════════════════ */}
        {abaAtiva === 'leads' && (
        <>
            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 mb-4">
                <input
                    type="text"
                    value={filtroLeadsEmpresa}
                    onChange={e => setFiltroLeadsEmpresa(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && carregarMeusLeads()}
                    placeholder="Filtrar por empresa..."
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <select value={filtroLeadsStatus} onChange={e => setFiltroLeadsStatus(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">Todos (exceto descartados)</option>
                    <option value="novo">Novo</option>
                    <option value="exportado">Exportado</option>
                    <option value="descartado">Ver descartados</option>
                </select>
                <button onClick={carregarMeusLeads}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1">
                    <i className="fa-solid fa-filter"></i> Filtrar
                </button>
                <span className="ml-auto self-center text-xs text-gray-400">
                    {meusLeads.length} lead{meusLeads.length !== 1 ? 's' : ''}
                    {podeVerTodosLeads ? ' — toda a equipe' : ' — meus leads'}
                </span>
            </div>

            {loadingMeusLeads ? (
                <div className="text-center py-10 text-gray-400">
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>
                    Carregando leads...
                </div>
            ) : meusLeads.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-users text-5xl mb-3 block text-gray-200"></i>
                    <p className="font-medium">Nenhum lead salvo ainda</p>
                    <p className="text-xs mt-1">Busque executivos em "Nova Busca" e salve os resultados</p>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600">NOME</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600">CARGO</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMAIL</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">ORIGEM</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">ANALISTA</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">EXPORTADO</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">STATUS</th>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">DATA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {meusLeads
                                .slice((paginaMeusLeads - 1) * ITENS_POR_PAGINA, paginaMeusLeads * ITENS_POR_PAGINA)
                                .map(lead => (
                                <tr key={lead.id} className="border-b hover:bg-blue-50/30 transition-colors">
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-gray-800 text-sm">{lead.nome_completo || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500">{lead.cargo || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-gray-700">{lead.empresa_nome || '—'}</td>
                                    <td className="px-3 py-2 text-xs">
                                        {lead.email
                                            ? <span className="text-green-600">{lead.email}</span>
                                            : <span className="text-gray-300">sem email</span>
                                        }
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                                            {lead.motor === 'gemini' || lead.motor === 'gemini+hunter' ? '🤖 Gemini'
                                             : lead.motor === 'extension' ? '🔌 Extension'
                                             : lead.motor === 'hunter' ? '🎯 Hunter'
                                             : lead.motor}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {lead.reservado_por_nome
                                            ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">{lead.reservado_por_nome.split(' ')[0]}</span>
                                            : <span className="text-gray-300 text-xs">—</span>
                                        }
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {lead.exportado_em
                                            ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ Exportado</span>
                                            : <span className="text-gray-300 text-xs">—</span>
                                        }
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                            lead.status === 'qualificado' ? 'bg-green-100 text-green-700'
                                            : lead.status === 'contactado' ? 'bg-blue-100 text-blue-700'
                                            : lead.status === 'descartado' ? 'bg-red-100 text-red-500'
                                            : 'bg-gray-100 text-gray-500'
                                        }`}>{lead.status || 'novo'}</span>
                                    </td>
                                    <td className="px-3 py-2 text-center text-xs text-gray-400 whitespace-nowrap">
                                        {new Date(lead.criado_em).toLocaleDateString('pt-BR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Paginação */}
                    {Math.ceil(meusLeads.length / ITENS_POR_PAGINA) > 1 && (
                        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
                            <span className="text-xs text-gray-400">
                                Página {paginaMeusLeads} de {Math.ceil(meusLeads.length / ITENS_POR_PAGINA)}
                            </span>
                            <div className="flex gap-1">
                                <button onClick={() => setPaginaMeusLeads(p => Math.max(1, p - 1))}
                                    disabled={paginaMeusLeads === 1}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-30">
                                    <i className="fa-solid fa-angle-left"></i>
                                </button>
                                <button onClick={() => setPaginaMeusLeads(p => Math.min(Math.ceil(meusLeads.length / ITENS_POR_PAGINA), p + 1))}
                                    disabled={paginaMeusLeads === Math.ceil(meusLeads.length / ITENS_POR_PAGINA)}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-30">
                                    <i className="fa-solid fa-angle-right"></i>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
        )}
        {/* ══════════════════════════════════════════ */}
        {/* ABA: EXCLUSÕES                             */}
        {/* ══════════════════════════════════════════ */}
        {abaAtiva === 'exclusoes' && (
        <>
            {/* Cabeçalho explicativo */}
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                    <i className="fa-solid fa-ban text-red-400 text-lg mt-0.5"></i>
                    <div>
                        <p className="text-sm font-semibold text-red-700">Lista de Exclusões — Consultorias de TI</p>
                        <p className="text-xs text-red-500 mt-0.5">
                            Empresas nesta lista são ignoradas automaticamente na extração de CVs.
                            Para adicionar, clique em <strong>"É Consultoria"</strong> na aba Leads Salvos.
                        </p>
                    </div>
                </div>
            </div>

            {/* Barra de busca */}
            <div className="flex gap-3 mb-4">
                <input
                    type="text"
                    value={buscaExclusao}
                    onChange={e => setBuscaExclusao(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && carregarExclusoes()}
                    placeholder="Buscar empresa na lista de exclusões..."
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <button onClick={carregarExclusoes}
                    className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 flex items-center gap-1">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    Buscar
                </button>
            </div>

            {loadingExclusoes ? (
                <div className="text-center py-10 text-gray-400">
                    <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>
                    Carregando lista de exclusões...
                </div>
            ) : exclusoes.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-ban text-5xl mb-3 block text-gray-200"></i>
                    <p className="font-medium">Nenhuma empresa na lista de exclusões</p>
                    <p className="text-xs mt-1">Use o botão "É Consultoria" nos Leads Salvos para adicionar</p>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {/* Contador */}
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            <strong>{exclusoes.length}</strong> empresa{exclusoes.length !== 1 ? 's' : ''} na lista de exclusões
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">EMPRESA</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600">DOMÍNIO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">MOTIVO</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">ADICIONADO POR</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">DATA</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-center">AÇÃO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exclusoes.map(exc => (
                                    <tr key={exc.id} className="border-b hover:bg-red-50">
                                        <td className="px-3 py-2 font-medium text-gray-800">{exc.empresa_nome}</td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{exc.dominio || '—'}</td>
                                        <td className="px-3 py-2 text-center">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                                                {exc.motivo === 'consultoria_ti' ? '🏢 Consultoria TI' : exc.motivo}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {exc.adicionado_por_nome ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                                                    {exc.adicionado_por_nome.split(' ').slice(0, 2).join(' ')}
                                                </span>
                                            ) : <span className="text-gray-300 text-xs">—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center text-xs text-gray-400">
                                            {new Date(exc.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => removerExclusao(exc.id, exc.empresa_nome)}
                                                className="text-[10px] px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors whitespace-nowrap"
                                                title="Remover da lista de exclusões"
                                            >
                                                <i className="fa-solid fa-trash-can mr-1"></i>
                                                Remover
                                            </button>
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

    {/* ══════════════════════════════════════════════════════════
        MODAL — LEADS DA EMPRESA (View Território → Ver Leads)
        ══════════════════════════════════════════════════════════ */}
    {modalEmpresa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-800">
                            <i className="fa-solid fa-building mr-2 text-blue-500"></i>
                            {modalEmpresa.nome}
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {modalEmpresa.leads.length} lead{modalEmpresa.leads.length !== 1 ? 's' : ''} salvos • selecione para enviar à campanha
                        </p>
                    </div>
                    <button onClick={() => setModalEmpresa(null)}
                        className="text-gray-400 hover:text-gray-600 transition-colors">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-50 bg-gray-50/50">
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                        <input type="checkbox"
                            checked={modalSelecionados.size === modalEmpresa.leads.length && modalEmpresa.leads.length > 0}
                            onChange={e => setModalSelecionados(e.target.checked
                                ? new Set(modalEmpresa.leads.map(l => l.id))
                                : new Set()
                            )}
                            className="rounded"
                        />
                        Selecionar todos
                    </label>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-gray-400">{modalSelecionados.size} selecionado{modalSelecionados.size !== 1 ? 's' : ''}</span>
                </div>

                {/* Lista de leads */}
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                    {modalEmpresa.leads.map(lead => (
                        <div key={lead.id}
                            onClick={() => setModalSelecionados(prev => {
                                const next = new Set(prev);
                                next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id);
                                return next;
                            })}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                modalSelecionados.has(lead.id)
                                    ? 'border-blue-300 bg-blue-50'
                                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <input type="checkbox" readOnly
                                checked={modalSelecionados.has(lead.id)}
                                className="rounded pointer-events-none"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-gray-800 truncate">{lead.nome_completo || '—'}</div>
                                <div className="text-xs text-gray-400 truncate">{lead.cargo || '—'}</div>
                            </div>
                            <div className="text-right shrink-0">
                                {lead.email ? (
                                    <div className="text-xs text-green-600 font-medium truncate max-w-[180px]">{lead.email}</div>
                                ) : (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">sem email</span>
                                )}
                                {lead.exportado_em && (
                                    <div className="text-[10px] text-green-500 mt-0.5">✓ exportado</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 gap-3">
                    <button
                        onClick={() => prospectar(modalEmpresa.leads[0])}
                        className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                        <i className="fa-solid fa-magnifying-glass text-xs"></i>
                        Buscar Mais Contatos
                    </button>
                    <div className="flex gap-2">
                        <button onClick={() => setModalEmpresa(null)}
                            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                            Fechar
                        </button>
                        <button
                            disabled={modalSelecionados.size === 0 || enriquecendoModal}
                            onClick={async () => {
                                const leadsParaCampanha = modalEmpresa.leads.filter(l => modalSelecionados.has(l.id));
                                // Reservar para o analista logado
                                await reservarEmpresas(leadsParaCampanha.map(l => l.id));
                                // Marcar exportado
                                for (const lead of leadsParaCampanha) {
                                    await fetch('/api/prospect-cv-extract', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ modo: 'marcar_exportado', lead_id: lead.id, user_id: currentUser?.id }),
                                    });
                                }
                                setModalEmpresa(null);
                                setToastMsg({ tipo: 'ok', msg: `${leadsParaCampanha.length} lead${leadsParaCampanha.length !== 1 ? 's' : ''} enviado${leadsParaCampanha.length !== 1 ? 's' : ''} para Preparar Campanha` });
                                setTimeout(() => setToastMsg(null), 4000);
                                carregarLeadsSalvos();
                            }}
                            className="text-sm px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
                        >
                            <i className="fa-solid fa-paper-plane text-xs"></i>
                            Preparar Campanha ({modalSelecionados.size})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )}
    </div>
    </>
    );
};

export default ProspectSearchPage;

