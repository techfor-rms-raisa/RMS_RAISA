/**
 * Vagas.tsx - RMS RAISA v58.2
 * Componente de Gestão de Vagas
 * 
 * 🆕 v58.2: Botão "Minhas Vagas"
 *        - Botão azul ao lado de "+ Nova Vaga"
 *        - Filtra vagas onde o analista logado está associado
 *        - Contador de vagas no botão
 *        - Indicador visual quando filtro ativo
 * 
 * v58.1: Exibição de Analistas R&S
 *        - Corrigido: busca analista_id da candidatura (não da pessoa)
 *        - Exibe analistas R&S associados no card da vaga
 *        - Exibe analistas R&S no footer do modal de visualização
 * 
 * v58.0: Melhorias de UX
 *        - Campo de busca por nome/descrição da vaga
 *        - Ícone "olho" para visualizar vaga completa em popup
 *        - Ícone de candidaturas com contador
 *        - Modal de candidaturas com lista detalhada
 *        - Botão "Limpar filtros" quando filtros ativos
 *        - Layout limpo e responsivo
 * 
 * v57.0: Controle de permissões
 *        - Botão "Nova Vaga" condicionado por permissão
 *        - Modo read-only para Gestão Comercial
 * 
 * v56.3: Fix erro "Cannot read properties of undefined (reading 'titulo')"
 *        - Corrigido: updateVaga(editingVaga.id, vagaData) 
 *        - Antes estava: updateVaga({ ...editingVaga, ...vagaData })
 * 
 * v56.2: Novo campo Tipo de Remuneração
 *        - Dropdown: Hora Aberta / Hora Fechada / Valor Fechado
 *        - Labels alteradas: "Valor Hora Min/Máx R$", "Valor/H Faturamento R$"
 *        - CRUD completo do novo campo tipo_remuneracao
 * 
 * v56.1: Correções de bugs
 *        - Removido "IA" e "AI" da lista de stacks (termos genéricos)
 *        - Select de "Gestão Comercial" com usuários filtrados
 * 
 * v56.0: Extração de Requisitos e Stack via Backend/Gemini
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Vaga, Client, UsuarioCliente, User } from '../../types/types_index';
import VagaPriorizacaoManager from './VagaPriorizacaoManager';
import CVMatchingPanel from './CVMatchingPanel';
import VagaSugestoesIA from './VagaSugestoesIA';
import { Wand2, Loader2, Plus, X, ChevronDown, ChevronUp, Eye, Users, Calendar, User as UserIcon, Briefcase, MapPin, DollarSign, Clock, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { podeInserirVagas, isReadOnly } from '../../utils/permissions';
import { supabase } from '../../config/supabase';

// Interface para candidatura com dados expandidos
interface CandidaturaExpandida {
  id: number;
  pessoa_id: number;
  vaga_id: number;
  status: string;
  created_at: string;
  pessoa?: {
    id: number;
    nome: string;
    email: string;
    telefone: string;
    titulo_profissional: string;
    senioridade: string;
    id_analista_rs: number | null;
  };
  analista?: {
    id: number;
    nome_usuario: string;
  };
}

interface VagasProps {
    vagas: Vaga[];
    clients?: Client[];
    usuariosCliente?: UsuarioCliente[];
    users?: User[];  // ✅ NOVO: Lista de usuários do sistema (app_users)
    addVaga: (v: any) => void;
    updateVaga: (id: string, updates: Partial<Vaga>) => void;  // ✅ CORRIGIDO: assinatura correta
    deleteVaga: (id: string) => void;
    currentUserId?: number;
}

/**
 * Função auxiliar para garantir que stack_tecnologica seja sempre um array
 */
const ensureStackArray = (stack: any): string[] => {
    if (Array.isArray(stack)) return stack;
    if (stack === null || stack === undefined) return [];
    if (typeof stack === 'string') {
        try {
            const parsed = JSON.parse(stack);
            if (Array.isArray(parsed)) return parsed;
            return [String(parsed)];
        } catch {
            return stack.trim() ? [stack.trim()] : [];
        }
    }
    return [];
};

// Stacks conhecidas para extração automática
// NOTA: Removido "IA" e "AI" pois são termos genéricos, não tecnologias específicas
const STACKS_CONHECIDAS = [
    // Frontend
    'React', 'Angular', 'Vue', 'Vue.js', 'Next.js', 'Node.js', 'Express',
    // Backend
    'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring', 'Spring Boot',
    'C#', '.NET', '.NET Core', 'PHP', 'Laravel', 'Symfony',
    // Linguagens
    'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Tailwind',
    // Banco de dados
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL Server', 'Oracle',
    // Cloud & DevOps
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'K8s',
    'Git', 'GitHub', 'GitLab', 'CI/CD', 'Jenkins',
    'REST', 'API', 'GraphQL', 'Microservices',
    'Agile', 'Scrum', 'Kanban', 'DevOps',
    'Linux', 'Terraform', 'Ansible',
    // Testes
    'Selenium', 'Cypress', 'Jest', 'JUnit',
    // BI & Analytics
    'Power BI', 'Tableau', 'Salesforce',
    'Machine Learning', 'Data Science', 'TensorFlow', 'PyTorch',
    // ✅ SAP - Módulos principais
    'SAP', 'SAP PP', 'SAP SD', 'SAP MM', 'SAP FI', 'SAP CO', 'SAP WM', 'SAP EWM',
    'SAP QM', 'SAP PM', 'SAP PS', 'SAP HR', 'SAP HCM', 'SAP LE', 'SAP CS', 'SAP TR',
    // ✅ SAP - Técnicos
    'SAP ABAP', 'SAP BASIS', 'SAP BC', 'SAP PI', 'SAP PO', 'SAP XI', 'SAP BTP', 'SAP CPI', 'SAP FIORI',
    // ✅ SAP - Analytics & Data
    'SAP BW', 'SAP BI', 'SAP BPC', 'SAP BOBJ', 'SAP SAC', 'SAP HANA', 'SAP BW/4HANA',
    // ✅ SAP - Cloud & Específicos
    'SAP CRM', 'SAP SRM', 'SAP APO', 'SAP SCM', 'SAP TM', 'SAP GTS', 'SAP EHS', 'SAP PLM', 'SAP MES',
    'SAP Ariba', 'SuccessFactors', 'SAP SuccessFactors', 'SAP Concur', 'SAP Fieldglass',
    // ✅ SAP - Plataformas
    'S/4HANA', 'SAP S/4HANA', 'SAP ECC', 'SAP R/3', 'SAP ACTIVATE'
];

const Vagas: React.FC<VagasProps> = ({ 
    vagas = [], 
    clients = [], 
    usuariosCliente = [],
    users = [],  // ✅ NOVO: Lista de usuários do sistema
    addVaga, 
    updateVaga, 
    deleteVaga,
    currentUserId = 1
}) => {
    // 🆕 v57.0: Verificar permissões
    const { user } = useAuth();
    const podeInserir = user ? podeInserirVagas(user.tipo_usuario) : false;
    const apenasLeitura = user ? isReadOnly(user.tipo_usuario, 'raisa') : true;

    // Estados do modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVaga, setEditingVaga] = useState<Vaga | null>(null);
    const [priorizacaoVagaId, setPriorizacaoVagaId] = useState<string | null>(null);
    const [priorizacaoVagaTitulo, setPriorizacaoVagaTitulo] = useState<string>('');
    
    // Estado para Busca de CVs
    const [buscaCVVaga, setBuscaCVVaga] = useState<Vaga | null>(null);
    
    // Estado para Sugestões IA
    const [sugestoesIAVaga, setSugestoesIAVaga] = useState<Vaga | null>(null);
    
    // 🆕 v58.0: Estado para visualização de vaga (popup read-only)
    const [vagaVisualizacao, setVagaVisualizacao] = useState<Vaga | null>(null);
    
    // 🆕 v58.0: Estado para modal de candidaturas
    const [candidaturasVaga, setCandidaturasVaga] = useState<Vaga | null>(null);
    const [candidaturas, setCandidaturas] = useState<CandidaturaExpandida[]>([]);
    const [loadingCandidaturas, setLoadingCandidaturas] = useState(false);
    
    // 🆕 v58.0: Contagem de candidaturas por vaga
    const [contagemCandidaturas, setContagemCandidaturas] = useState<Record<string, number>>({});
    
    // 🆕 v58.1: Analistas por vaga (para exibir nos cards)
    const [analistasPorVaga, setAnalistasPorVaga] = useState<Record<string, string[]>>({});
    
    // 🆕 v58.2: Filtro "Minhas Vagas" - vagas onde o analista logado está associado
    const [filtroMinhasVagas, setFiltroMinhasVagas] = useState<boolean>(false);
    const [minhasVagasIds, setMinhasVagasIds] = useState<Set<string>>(new Set());
    
    // Estados dos filtros de header
    const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
    const [selectedGestorId, setSelectedGestorId] = useState<number | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string>(''); // 🆕 Filtro por status
    const [searchTerm, setSearchTerm] = useState<string>(''); // 🆕 v58.0: Filtro por nome da vaga
    
    // Estado para expandir/colapsar seções do modal
    const [expandedSections, setExpandedSections] = useState({
        requisitos: false,
        contratacao: false,
        config: false
    });
    
    // Estado para extração de stacks
    const [extractingStacks, setExtractingStacks] = useState(false);
    
    // ✅ NOVO: Estado para extração completa via IA (requisitos + stacks)
    const [extractingRequisitos, setExtractingRequisitos] = useState(false);
    const [iaExtractionSuccess, setIaExtractionSuccess] = useState(false);
    
    // Estado do formulário COMPLETO
    const [formData, setFormData] = useState<Partial<Vaga> & { gestor_cliente_id?: number | null }>({
        titulo: '', 
        descricao: '', 
        senioridade: 'Pleno', 
        stack_tecnologica: [], 
        status: 'aberta',
        status_posicao: 'triagem', // 🆕 Posição no funil de recrutamento
        cliente_id: null,
        gestor_cliente_id: null,
        // ✅ NOVOS CAMPOS
        tipo_de_vaga: 'Nova Posição',
        ocorrencia: null,
        vaga_faturavel: true,
        requisitos_obrigatorios: '',
        requisitos_desejaveis: '',
        regime_contratacao: 'PJ',
        modalidade: 'Remoto',
        tipo_remuneracao: 'Hora Aberta',  // ✅ NOVO CAMPO
        salario_min: null,
        salario_max: null,
        faturamento_mensal: null,
        beneficios: '',
        prazo_fechamento: null,
        urgente: false,
        analista_id: null
    });
    const [techInput, setTechInput] = useState('');

    // Garantir que clients e usuariosCliente sejam sempre arrays
    const safeClients = Array.isArray(clients) ? clients : [];
    const safeUsuariosCliente = Array.isArray(usuariosCliente) ? usuariosCliente : [];
    const safeVagas = Array.isArray(vagas) ? vagas : [];
    const safeUsers = Array.isArray(users) ? users : [];

    // ✅ NOVO: Filtrar usuários do tipo "Gestão Comercial"
    const gestoresComerciais = useMemo(() => {
        return safeUsers.filter(u => 
            u.tipo_usuario === 'Gestão Comercial' && 
            u.ativo_usuario !== false
        );
    }, [safeUsers]);

    // Filtrar gestores pelo cliente selecionado (header)
    const gestoresDoCliente = useMemo(() => {
        if (!selectedClientId) return [];
        return safeUsuariosCliente.filter(g => g.id_cliente === selectedClientId && g.ativo !== false);
    }, [selectedClientId, safeUsuariosCliente]);

    // Filtrar gestores pelo cliente do formulário (modal)
    const gestoresDoClienteForm = useMemo(() => {
        if (!formData.cliente_id) return [];
        return safeUsuariosCliente.filter(g => g.id_cliente === formData.cliente_id && g.ativo !== false);
    }, [formData.cliente_id, safeUsuariosCliente]);

    // Filtrar vagas pelo cliente, status e nome
    const vagasFiltradas = useMemo(() => {
        let filtered = safeVagas;
        
        // 🆕 v58.0: Filtro por nome da vaga
        if (searchTerm.trim()) {
            const termo = searchTerm.toLowerCase().trim();
            filtered = filtered.filter(v => 
                v.titulo?.toLowerCase().includes(termo) ||
                v.descricao?.toLowerCase().includes(termo)
            );
        }
        
        if (selectedClientId) {
            filtered = filtered.filter(v => v.cliente_id === selectedClientId);
        }
        if (selectedStatus) {
            filtered = filtered.filter(v => v.status === selectedStatus);
        }
        
        // 🆕 v58.2: Filtro "Minhas Vagas"
        if (filtroMinhasVagas && minhasVagasIds.size > 0) {
            filtered = filtered.filter(v => minhasVagasIds.has(String(v.id)));
        }
        
        return filtered;
    }, [safeVagas, selectedClientId, selectedStatus, searchTerm, filtroMinhasVagas, minhasVagasIds]);

    // Ordenar clientes alfabeticamente
    const sortedClients = useMemo(() => {
        return [...safeClients]
            .filter(c => c.ativo_cliente !== false)
            .sort((a, b) => (a.razao_social_cliente || '').localeCompare(b.razao_social_cliente || ''));
    }, [safeClients]);

    // 🆕 v58.0: Buscar contagem de candidaturas e analistas por vaga
    useEffect(() => {
        const buscarDadosCandidaturas = async () => {
            if (safeVagas.length === 0) return;
            
            try {
                const vagaIds = safeVagas.map(v => v.id);
                
                // Buscar candidaturas com analista_id
                const { data, error } = await supabase
                    .from('candidaturas')
                    .select('vaga_id, analista_id')
                    .in('vaga_id', vagaIds);
                
                if (error) throw error;
                
                // Contar candidaturas por vaga e coletar analistas únicos
                const contagem: Record<string, number> = {};
                const analistaIdsPorVaga: Record<string, Set<number>> = {};
                const todosAnalistaIds = new Set<number>();
                
                // 🆕 v58.2: Identificar vagas do analista logado
                const vagasDoAnalistaLogado = new Set<string>();
                
                (data || []).forEach((c: any) => {
                    const vagaId = String(c.vaga_id);
                    contagem[vagaId] = (contagem[vagaId] || 0) + 1;
                    
                    if (c.analista_id) {
                        if (!analistaIdsPorVaga[vagaId]) {
                            analistaIdsPorVaga[vagaId] = new Set();
                        }
                        analistaIdsPorVaga[vagaId].add(c.analista_id);
                        todosAnalistaIds.add(c.analista_id);
                        
                        // 🆕 v58.2: Marcar vaga como "minha" se o analista logado está associado
                        if (user?.id && c.analista_id === user.id) {
                            vagasDoAnalistaLogado.add(vagaId);
                        }
                    }
                });
                
                setContagemCandidaturas(contagem);
                setMinhasVagasIds(vagasDoAnalistaLogado);
                
                // Buscar nomes dos analistas
                if (todosAnalistaIds.size > 0) {
                    const { data: analistasData } = await supabase
                        .from('app_users')
                        .select('id, nome_usuario')
                        .in('id', Array.from(todosAnalistaIds));
                    
                    const analistasMap: Record<number, string> = {};
                    (analistasData || []).forEach((a: any) => {
                        analistasMap[a.id] = a.nome_usuario;
                    });
                    
                    // Mapear nomes para cada vaga
                    const analistasNomesPorVaga: Record<string, string[]> = {};
                    Object.entries(analistaIdsPorVaga).forEach(([vagaId, ids]) => {
                        analistasNomesPorVaga[vagaId] = Array.from(ids)
                            .map(id => analistasMap[id])
                            .filter(Boolean);
                    });
                    
                    setAnalistasPorVaga(analistasNomesPorVaga);
                }
            } catch (err) {
                console.error('Erro ao buscar dados de candidaturas:', err);
            }
            }
        };
        
        buscarDadosCandidaturas();
    }, [safeVagas, user?.id]);

    // 🆕 v58.0: Buscar candidaturas de uma vaga específica
    const buscarCandidaturasVaga = async (vaga: Vaga) => {
        setCandidaturasVaga(vaga);
        setLoadingCandidaturas(true);
        setCandidaturas([]);
        
        try {
            // Buscar candidaturas com dados da pessoa
            const { data: candidaturasData, error } = await supabase
                .from('candidaturas')
                .select(`
                    id,
                    pessoa_id,
                    vaga_id,
                    status,
                    created_at,
                    analista_id,
                    pessoas:pessoa_id (
                        id,
                        nome,
                        email,
                        telefone,
                        titulo_profissional,
                        senioridade,
                        id_analista_rs
                    )
                `)
                .eq('vaga_id', vaga.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // 🆕 v58.1: Buscar nomes dos analistas - priorizar analista_id da candidatura
            const analistaIds = [...new Set((candidaturasData || [])
                .map((c: any) => c.analista_id || c.pessoas?.id_analista_rs)
                .filter(Boolean))];
            
            let analistas: Record<number, string> = {};
            if (analistaIds.length > 0) {
                const { data: analistasData } = await supabase
                    .from('app_users')
                    .select('id, nome_usuario')
                    .in('id', analistaIds);
                
                (analistasData || []).forEach((a: any) => {
                    analistas[a.id] = a.nome_usuario;
                });
            }
            
            // Formatar dados - usar analista_id da candidatura OU id_analista_rs da pessoa
            const candidaturasFormatadas: CandidaturaExpandida[] = (candidaturasData || []).map((c: any) => {
                const analistaId = c.analista_id || c.pessoas?.id_analista_rs;
                return {
                    id: c.id,
                    pessoa_id: c.pessoa_id,
                    vaga_id: c.vaga_id,
                    status: c.status,
                    created_at: c.created_at,
                    pessoa: c.pessoas,
                    analista: analistaId 
                        ? { id: analistaId, nome_usuario: analistas[analistaId] || 'N/A' }
                        : undefined
                };
            });
            
            setCandidaturas(candidaturasFormatadas);
        } catch (err) {
            console.error('Erro ao buscar candidaturas:', err);
        } finally {
            setLoadingCandidaturas(false);
        }
    };

    // 🆕 v58.0: Formatar status da candidatura
    const formatarStatusCandidatura = (status: string) => {
        const statusMap: Record<string, { label: string; color: string; icon: string }> = {
            'pendente': { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
            'em_analise': { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: '🔍' },
            'aprovado': { label: 'Aprovado', color: 'bg-green-100 text-green-800', icon: '✅' },
            'reprovado': { label: 'Reprovado', color: 'bg-red-100 text-red-800', icon: '❌' },
            'entrevista': { label: 'Entrevista', color: 'bg-purple-100 text-purple-800', icon: '🎯' },
            'contratado': { label: 'Contratado', color: 'bg-emerald-100 text-emerald-800', icon: '🎉' },
            'desistiu': { label: 'Desistiu', color: 'bg-gray-100 text-gray-800', icon: '🚫' }
        };
        return statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-600', icon: '📋' };
    };

    // 🆕 Verificar se a vaga pode ser excluída (apenas no dia da criação)
    const podeExcluirVaga = (vaga: Vaga): boolean => {
        if (!vaga.criado_em) return false;
        
        const dataCriacao = new Date(vaga.criado_em);
        const hoje = new Date();
        
        // Comparar apenas ano, mês e dia (ignorar hora)
        return (
            dataCriacao.getFullYear() === hoje.getFullYear() &&
            dataCriacao.getMonth() === hoje.getMonth() &&
            dataCriacao.getDate() === hoje.getDate()
        );
    };

    // Obter nome do cliente
    const getClientName = (clientId: number | null): string => {
        if (!clientId) return 'Sem cliente';
        const client = safeClients.find(c => c.id === clientId);
        return client?.razao_social_cliente || 'Cliente não encontrado';
    };

    // Abrir modal (criar ou editar)
    const openModal = (vaga?: Vaga) => {
        if (vaga) {
            setEditingVaga(vaga);
            setFormData({
                titulo: vaga.titulo || '',
                descricao: vaga.descricao || '',
                senioridade: vaga.senioridade || 'Pleno',
                stack_tecnologica: ensureStackArray(vaga.stack_tecnologica),
                status: vaga.status || 'aberta',
                status_posicao: vaga.status_posicao || 'triagem', // 🆕 Posição no funil
                cliente_id: vaga.cliente_id,
                gestor_cliente_id: null,
                // Campos adicionais
                tipo_de_vaga: vaga.tipo_de_vaga || 'Nova Posição',
                ocorrencia: vaga.ocorrencia || null,
                vaga_faturavel: vaga.vaga_faturavel !== false,
                requisitos_obrigatorios: vaga.requisitos_obrigatorios || '',
                requisitos_desejaveis: vaga.requisitos_desejaveis || '',
                regime_contratacao: vaga.regime_contratacao || 'PJ',
                modalidade: vaga.modalidade || 'Remoto',
                tipo_remuneracao: (vaga as any).tipo_remuneracao || 'Hora Aberta',  // ✅ NOVO CAMPO
                salario_min: vaga.salario_min || null,
                salario_max: vaga.salario_max || null,
                faturamento_mensal: vaga.faturamento_mensal || null,
                beneficios: vaga.beneficios || '',
                prazo_fechamento: vaga.prazo_fechamento || null,
                urgente: vaga.urgente || false,
                analista_id: vaga.analista_id || null
            });
        } else {
            setEditingVaga(null);
            setFormData({
                titulo: '',
                descricao: '',
                senioridade: 'Pleno',
                stack_tecnologica: [],
                status: 'aberta',
                status_posicao: 'triagem', // 🆕 Posição no funil
                cliente_id: selectedClientId,
                gestor_cliente_id: null,
                tipo_de_vaga: 'Nova Posição',
                ocorrencia: null,
                vaga_faturavel: true,
                requisitos_obrigatorios: '',
                requisitos_desejaveis: '',
                regime_contratacao: 'PJ',
                modalidade: 'Remoto',
                tipo_remuneracao: 'Hora Aberta',  // ✅ NOVO CAMPO
                salario_min: null,
                salario_max: null,
                faturamento_mensal: null,
                beneficios: '',
                prazo_fechamento: null,
                urgente: false,
                analista_id: null
            });
        }
        setTechInput('');
        setIsModalOpen(true);
    };

    // Handler para mudança de cliente no formulário
    // ✅ MODIFICADO: Auto-preenche gestor comercial associado ao cliente
    const handleFormClientChange = (clientId: number | null) => {
        let analistaId = formData.analista_id;
        let gestorNome = '';
        
        // Auto-preencher gestor comercial se cliente tiver associação
        if (clientId) {
            const clienteSelecionado = safeClients.find(c => c.id === clientId);
            if (clienteSelecionado?.id_gestao_comercial) {
                analistaId = clienteSelecionado.id_gestao_comercial;
                // Buscar nome do gestor
                const gestor = safeUsers.find(u => u.id === analistaId);
                gestorNome = gestor?.nome_usuario || '';
                console.log(`✅ Gestão Comercial auto-preenchida: ${gestorNome} (ID: ${analistaId})`);
                
                // Expandir seção de configurações para mostrar o preenchimento
                setExpandedSections(prev => ({
                    ...prev,
                    config: true
                }));
            }
        }
        
        setFormData({
            ...formData,
            cliente_id: clientId,
            gestor_cliente_id: null,
            analista_id: analistaId
        });
        
        // Reset do estado de extração IA ao mudar cliente
        setIaExtractionSuccess(false);
        
        // Mostrar alerta se gestor foi preenchido
        if (gestorNome) {
            setTimeout(() => {
                alert(`✅ Gestão Comercial preenchida automaticamente:\n\n${gestorNome}`);
            }, 100);
        }
    };

    // Validar e salvar
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.cliente_id) {
            alert('Por favor, selecione um cliente.');
            return;
        }

        if (!formData.titulo?.trim()) {
            alert('Por favor, preencha o título da vaga.');
            return;
        }

        const vagaData = {
            titulo: formData.titulo,
            descricao: formData.descricao,
            senioridade: formData.senioridade,
            stack_tecnologica: formData.stack_tecnologica,
            status: formData.status,
            status_posicao: formData.status_posicao || 'triagem', // 🆕 Posição no funil
            cliente_id: formData.cliente_id,
            // Campos adicionais
            tipo_de_vaga: formData.tipo_de_vaga,
            ocorrencia: formData.ocorrencia,
            vaga_faturavel: formData.vaga_faturavel,
            requisitos_obrigatorios: formData.requisitos_obrigatorios || null,
            requisitos_desejaveis: formData.requisitos_desejaveis || null,
            regime_contratacao: formData.regime_contratacao,
            modalidade: formData.modalidade,
            tipo_remuneracao: (formData as any).tipo_remuneracao || 'Hora Aberta',  // ✅ NOVO CAMPO
            salario_min: formData.salario_min,
            salario_max: formData.salario_max,
            faturamento_mensal: formData.faturamento_mensal,
            beneficios: formData.beneficios || null,
            prazo_fechamento: formData.prazo_fechamento,
            urgente: formData.urgente,
            analista_id: formData.analista_id
        };

        if (editingVaga) {
            updateVaga(editingVaga.id, vagaData);
        } else {
            addVaga(vagaData);
        }

        setIsModalOpen(false);
    };

    // Adicionar tecnologia
    const addTech = () => {
        if (techInput && !formData.stack_tecnologica?.includes(techInput)) {
            setFormData({ ...formData, stack_tecnologica: [...(formData.stack_tecnologica || []), techInput] });
            setTechInput('');
        }
    };

    // Remover tecnologia
    const removeTech = (techToRemove: string) => {
        setFormData({
            ...formData,
            stack_tecnologica: (formData.stack_tecnologica || []).filter(t => t !== techToRemove)
        });
    };

    // ✅ MODIFICADO: Extrair requisitos e stacks via Backend/Gemini
    const extrairRequisitosComIA = async () => {
        const descricao = formData.descricao || '';
        
        if (!descricao.trim() || descricao.length < 50) {
            alert('⚠️ Preencha a descrição da vaga com pelo menos 50 caracteres para a IA analisar.');
            return;
        }

        setExtractingRequisitos(true);
        setIaExtractionSuccess(false);

        try {
            console.log('🤖 Chamando API para extrair requisitos...');
            
            const response = await fetch('/api/gemini-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'extrair_requisitos_vaga',
                    payload: {
                        descricao: descricao,
                        titulo: formData.titulo
                    }
                })
            });

            const result = await response.json();

            if (!result.success || !result.data?.sucesso) {
                throw new Error(result.data?.erro || result.error || 'Erro na extração');
            }

            const dados = result.data;
            
            // Filtrar termos genéricos que não são tecnologias reais
            const termosGenericos = ['IA', 'AI', 'ia', 'ai', 'Ia', 'Ai'];
            const stacksFiltradas = (dados.stack_tecnologica || []).filter(
                (s: string) => !termosGenericos.includes(s)
            );
            
            // Atualizar campos do formulário com dados extraídos
            setFormData(prev => ({
                ...prev,
                // Requisitos
                requisitos_obrigatorios: dados.requisitos_obrigatorios || prev.requisitos_obrigatorios,
                requisitos_desejaveis: dados.requisitos_desejaveis || prev.requisitos_desejaveis,
                // Stacks (merge com existentes, filtradas)
                stack_tecnologica: [...new Set([...(prev.stack_tecnologica || []), ...stacksFiltradas])],
                // Informações adicionais (se não preenchidas)
                modalidade: dados.informacoes_extraidas?.modalidade || prev.modalidade,
                regime_contratacao: dados.informacoes_extraidas?.regime_contratacao || prev.regime_contratacao,
                senioridade: dados.informacoes_extraidas?.senioridade_detectada || prev.senioridade,
                prazo_fechamento: dados.informacoes_extraidas?.prazo_fechamento || prev.prazo_fechamento,
                salario_min: dados.informacoes_extraidas?.valor_hora || prev.salario_min,
            }));

            // Expandir seção de requisitos para revisão
            setExpandedSections(prev => ({
                ...prev,
                requisitos: true
            }));

            setIaExtractionSuccess(true);
            const totalStacks = stacksFiltradas.length;
            alert(`✅ IA extraiu com sucesso!\n\n• ${totalStacks} tecnologias\n• Requisitos obrigatórios\n• Requisitos desejáveis\n\nConfiança: ${dados.confianca}%\n\nRevise os dados na seção "Requisitos".`);

        } catch (err: any) {
            console.error('❌ Erro na extração:', err);
            alert('❌ Erro ao extrair requisitos: ' + err.message);
        } finally {
            setExtractingRequisitos(false);
        }
    };

    // Função legacy para extração local de stacks (fallback)
    const extrairStacksAutomaticamente = () => {
        setExtractingStacks(true);
        
        const textoCompleto = `${formData.descricao || ''} ${formData.requisitos_obrigatorios || ''} ${formData.requisitos_desejaveis || ''}`.toLowerCase();
        
        const stacksEncontradas: string[] = [];
        
        STACKS_CONHECIDAS.forEach(stack => {
            if (textoCompleto.includes(stack.toLowerCase())) {
                if (!stacksEncontradas.some(s => s.toLowerCase() === stack.toLowerCase())) {
                    stacksEncontradas.push(stack);
                }
            }
        });

        // Adicionar às stacks existentes sem duplicar
        const stacksAtuais = formData.stack_tecnologica || [];
        const novasStacks = stacksEncontradas.filter(s => 
            !stacksAtuais.some(atual => atual.toLowerCase() === s.toLowerCase())
        );

        if (novasStacks.length > 0) {
            setFormData({
                ...formData,
                stack_tecnologica: [...stacksAtuais, ...novasStacks]
            });
            alert(`✅ ${novasStacks.length} tecnologias identificadas!`);
        } else {
            alert('Nenhuma nova tecnologia identificada. Adicione manualmente.');
        }

        setExtractingStacks(false);
    };

    // Buscar CVs
    const handleBuscarCVs = (vaga: Vaga) => {
        setBuscaCVVaga(vaga);
    };

    // Callback quando candidatura é criada
    const handleCandidaturaCriada = () => {
        console.log('✅ Candidatura criada com sucesso');
    };

    // Toggle seção do modal
    const toggleSection = (section: 'requisitos' | 'contratacao' | 'config') => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            {/* Header com Filtros */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-4">Gestão de Vagas</h1>
                
                <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-lg shadow-sm">
                    {/* 🆕 v58.0: Busca por Nome da Vaga */}
                    <div className="flex-1 min-w-[250px]">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Buscar Vaga</label>
                        <div className="relative mt-1">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Digite o nome ou descrição da vaga..."
                                className="w-full border p-2 pl-9 rounded focus:ring-2 focus:ring-orange-500"
                            />
                            <svg 
                                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" 
                                width="16" height="16" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filtro por Cliente */}
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Filtrar por Cliente</label>
                        <select
                            value={selectedClientId || ''}
                            onChange={(e) => {
                                setSelectedClientId(e.target.value ? Number(e.target.value) : null);
                                setSelectedGestorId(null);
                            }}
                            className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500"
                        >
                            <option value="">Todos os Clientes</option>
                            {sortedClients.map(client => (
                                <option key={client.id} value={client.id}>
                                    {client.razao_social_cliente}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 🆕 Filtro por Status */}
                    <div className="min-w-[180px]">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Status da Vaga</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500"
                        >
                            <option value="">Todas</option>
                            <option value="aberta">📂 Aberta</option>
                            <option value="em_andamento">🔄 Em Andamento</option>
                            <option value="em_selecao">👥 Em Seleção</option>
                            <option value="finalizada">✅ Finalizada</option>
                            <option value="cancelada">❌ Cancelada</option>
                        </select>
                    </div>

                    {/* Filtro por Gestor (apenas se cliente selecionado) */}
                    {selectedClientId && (
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Gestor do Cliente</label>
                            <select
                                value={selectedGestorId || ''}
                                onChange={(e) => setSelectedGestorId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500"
                            >
                                <option value="">Todos os Gestores</option>
                                {gestoresDoCliente.map(gestor => (
                                    <option key={gestor.id} value={gestor.id}>
                                        {gestor.nome_gestor_cliente}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 🆕 v58.2: Botão Minhas Vagas */}
                    <button 
                        onClick={() => setFiltroMinhasVagas(!filtroMinhasVagas)}
                        className={`px-5 py-2 rounded-lg font-semibold flex items-center gap-2 shadow-md transition-all ${
                            filtroMinhasVagas 
                                ? 'bg-blue-700 text-white ring-2 ring-blue-300' 
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        title={`Filtrar vagas onde você está associado (${minhasVagasIds.size} vagas)`}
                    >
                        <UserIcon size={18} />
                        Minhas Vagas
                        {minhasVagasIds.size > 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                filtroMinhasVagas ? 'bg-white text-blue-700' : 'bg-blue-800 text-white'
                            }`}>
                                {minhasVagasIds.size}
                            </span>
                        )}
                    </button>

                    {/* Botão Nova Vaga - 🆕 v57.0: Condicionado por permissão */}
                    {podeInserir ? (
                        <button 
                            onClick={() => openModal()} 
                            className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 font-semibold flex items-center gap-2 shadow-md"
                        >
                            <Plus size={18} /> Nova Vaga
                        </button>
                    ) : apenasLeitura ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">
                            <Eye size={16} />
                            Modo Visualização
                        </div>
                    ) : null}
                </div>

                {/* Info do filtro */}
                {(selectedClientId || searchTerm || selectedStatus || filtroMinhasVagas) && (
                    <div className="mt-2 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                        <span>
                            Mostrando <strong>{vagasFiltradas.length}</strong> vaga(s)
                        </span>
                        {filtroMinhasVagas && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">
                                👤 Minhas Vagas
                            </span>
                        )}
                        {searchTerm && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                                🔍 "{searchTerm}"
                            </span>
                        )}
                        {selectedClientId && (
                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">
                                📍 {getClientName(selectedClientId)}
                            </span>
                        )}
                        {selectedStatus && (
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">
                                📋 {selectedStatus}
                            </span>
                        )}
                        <button 
                            onClick={() => {
                                setSearchTerm('');
                                setSelectedClientId(null);
                                setSelectedStatus('');
                                setFiltroMinhasVagas(false);
                            }}
                            className="text-gray-400 hover:text-red-500 text-xs underline ml-2"
                        >
                            Limpar filtros
                        </button>
                    </div>
                )}
            </div>

            {/* Grid de Vagas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vagasFiltradas.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm">
                        <p className="text-gray-500 text-lg">
                            {filtroMinhasVagas 
                                ? 'Você não possui vagas associadas.'
                                : selectedClientId 
                                ? 'Nenhuma vaga encontrada para este cliente.' 
                                : 'Nenhuma vaga cadastrada. Clique em "+ Nova Vaga" para criar.'}
                        </p>
                    </div>
                ) : (
                    vagasFiltradas.map(vaga => {
                        const stackArray = ensureStackArray(vaga.stack_tecnologica);
                        
                        return (
                            <div key={vaga.id} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow border border-gray-100">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-gray-800">{vaga.titulo}</h3>
                                    <div className="flex gap-1">
                                        {vaga.urgente && (
                                            <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 font-semibold">
                                                🚨 URGENTE
                                            </span>
                                        )}
                                        <span className={`px-2 py-1 rounded text-xs uppercase font-semibold ${
                                            vaga.status === 'aberta' ? 'bg-green-100 text-green-800' : 
                                            vaga.status === 'pausada' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>
                                            {vaga.status}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Cliente e Tipo */}
                                <div className="mb-2 flex flex-wrap gap-1">
                                    {vaga.cliente_id && (
                                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                            📍 {getClientName(vaga.cliente_id)}
                                        </span>
                                    )}
                                    {vaga.tipo_de_vaga && (
                                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                                            {vaga.tipo_de_vaga}
                                        </span>
                                    )}
                                    {vaga.modalidade && (
                                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                                            {vaga.modalidade}
                                        </span>
                                    )}
                                </div>
                                
                                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{vaga.descricao}</p>
                                
                                <div className="mb-4">
                                    <span className="text-xs font-semibold text-gray-500">Stack:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {stackArray.length > 0 ? (
                                            stackArray.slice(0, 5).map(t => (
                                                <span key={t} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{t}</span>
                                            ))
                                        ) : (
                                            <span className="text-gray-400 text-xs italic">Não definida</span>
                                        )}
                                        {stackArray.length > 5 && (
                                            <span className="text-xs text-gray-500">+{stackArray.length - 5}</span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* 🆕 v58.1: Analistas R&S associados à vaga */}
                                {analistasPorVaga[vaga.id] && analistasPorVaga[vaga.id].length > 0 && (
                                    <div className="mb-3">
                                        <span className="text-xs font-semibold text-gray-500">Analistas R&S:</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {analistasPorVaga[vaga.id].slice(0, 3).map((nome, idx) => (
                                                <span key={idx} className="bg-pink-50 text-pink-700 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                                    <UserIcon size={10} />
                                                    {nome}
                                                </span>
                                            ))}
                                            {analistasPorVaga[vaga.id].length > 3 && (
                                                <span className="text-xs text-gray-500">+{analistasPorVaga[vaga.id].length - 3}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-center pt-4 border-t">
                                    <span className="text-sm font-medium text-gray-500">{vaga.senioridade}</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* 🆕 v58.0: Ícone de Visualização */}
                                        <button 
                                            onClick={() => setVagaVisualizacao(vaga)} 
                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                            title="Visualizar vaga completa"
                                        >
                                            <Eye size={16} />
                                        </button>
                                        
                                        {/* 🆕 v58.0: Ícone de Candidaturas */}
                                        <button 
                                            onClick={() => buscarCandidaturasVaga(vaga)} 
                                            className="relative p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                                            title="Ver candidaturas"
                                        >
                                            <Users size={16} />
                                            {contagemCandidaturas[vaga.id] > 0 && (
                                                <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                                    {contagemCandidaturas[vaga.id]}
                                                </span>
                                            )}
                                        </button>
                                        
                                        <span className="text-gray-300">|</span>
                                        
                                        <button 
                                            onClick={() => setSugestoesIAVaga(vaga)} 
                                            className="text-purple-600 hover:text-purple-800 hover:underline text-sm font-semibold"
                                            title="Analisar e melhorar vaga com IA"
                                        >
                                            🤖 IA
                                        </button>
                                        <button 
                                            onClick={() => { setPriorizacaoVagaId(vaga.id); setPriorizacaoVagaTitulo(vaga.titulo); }} 
                                            className="text-orange-600 hover:underline text-sm font-semibold"
                                        >
                                            🎯 Priorizar
                                        </button>
                                        {/* 🆕 v57.0: Botões de edição apenas para quem pode */}
                                        {!apenasLeitura && (
                                            <>
                                                <button onClick={() => openModal(vaga)} className="text-blue-600 hover:underline text-sm">Editar</button>
                                                {/* 🆕 Excluir apenas no dia da criação */}
                                                {podeExcluirVaga(vaga) && (
                                                    <button onClick={() => deleteVaga(vaga.id)} className="text-red-600 hover:underline text-sm">Excluir</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ==================== MODAL COMPLETO ==================== */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
                        {/* Header do Modal */}
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-5">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold">
                                    {editingVaga ? '✏️ Editar Vaga' : '➕ Nova Vaga'}
                                </h3>
                                <button 
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-white hover:text-gray-200 text-2xl"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Corpo do Modal com Scroll */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <form id="vagaForm" onSubmit={handleSave} className="space-y-6">
                                
                                {/* ===== SEÇÃO 1: INFORMAÇÕES BÁSICAS ===== */}
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h4 className="font-bold text-gray-700 mb-4">📋 Informações Básicas</h4>
                                    
                                    {/* Cliente e Gestor */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-sm font-bold text-gray-700">Cliente *</label>
                                            <select
                                                value={formData.cliente_id || ''}
                                                onChange={(e) => handleFormClientChange(e.target.value ? Number(e.target.value) : null)}
                                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500"
                                                required
                                            >
                                                <option value="">Selecione o Cliente</option>
                                                {sortedClients.map(client => (
                                                    <option key={client.id} value={client.id}>
                                                        {client.razao_social_cliente}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="text-sm font-bold text-gray-700">Gestor do Cliente</label>
                                            <select
                                                value={formData.gestor_cliente_id || ''}
                                                onChange={(e) => setFormData({...formData, gestor_cliente_id: e.target.value ? Number(e.target.value) : null})}
                                                disabled={!formData.cliente_id}
                                                className={`w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500 ${!formData.cliente_id ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                            >
                                                <option value="">
                                                    {formData.cliente_id 
                                                        ? (gestoresDoClienteForm.length > 0 ? 'Selecione o Gestor (opcional)' : 'Nenhum gestor cadastrado')
                                                        : 'Selecione um cliente primeiro'
                                                    }
                                                </option>
                                                {gestoresDoClienteForm.map(gestor => (
                                                    <option key={gestor.id} value={gestor.id}>
                                                        {gestor.nome_gestor_cliente} - {gestor.cargo_gestor || 'Gestor'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Título */}
                                    <div className="mb-4">
                                        <label className="text-sm font-bold text-gray-700">Título da Vaga *</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500" 
                                            placeholder="Ex: VTI-225 Desenvolvedor React Sênior" 
                                            value={formData.titulo} 
                                            onChange={e => setFormData({...formData, titulo: e.target.value})} 
                                            required 
                                        />
                                    </div>

                                    {/* Tipo, Senioridade, Status */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="text-sm font-bold text-gray-700">Tipo de Vaga</label>
                                            <select 
                                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500" 
                                                value={formData.tipo_de_vaga || ''} 
                                                onChange={e => setFormData({...formData, tipo_de_vaga: e.target.value})}
                                            >
                                                <option value="Nova Posição">Nova Posição</option>
                                                <option value="Substituição">Substituição</option>
                                                <option value="Expansão">Expansão</option>
                                                <option value="Backfill">Backfill</option>
                                                <option value="Projeto">Projeto</option>
                                                <option value="Temporária">Temporária</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-gray-700">Senioridade</label>
                                            <select 
                                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500" 
                                                value={formData.senioridade} 
                                                onChange={e => setFormData({...formData, senioridade: e.target.value as any})}
                                            >
                                                <option>Junior</option>
                                                <option>Pleno</option>
                                                <option>Senior</option>
                                                <option>Especialista</option>
                                                <option>Gerente</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-gray-700">Status</label>
                                            <select 
                                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500" 
                                                value={formData.status} 
                                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                                            >
                                                <option value="aberta">Aberta</option>
                                                <option value="em_andamento">Em Andamento</option>
                                                <option value="pausada">Pausada</option>
                                                <option value="fechada">Fechada</option>
                                                <option value="cancelada">Cancelada</option>
                                            </select>
                                        </div>
                                        {/* 🆕 NOVO: Status Posição no Funil */}
                                        <div>
                                            <label className="text-sm font-bold text-gray-700">
                                                Posição no Funil
                                                <span className="ml-2 text-xs font-normal text-gray-500">(Status R&S)</span>
                                            </label>
                                            <select 
                                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-blue-500" 
                                                value={formData.status_posicao || 'triagem'} 
                                                onChange={e => setFormData({...formData, status_posicao: e.target.value as any})}
                                            >
                                                <option value="triagem">📋 Triagem</option>
                                                <option value="entrevista">🎯 Entrevista</option>
                                                <option value="enviado_cliente">📤 Enviado ao Cliente</option>
                                                <option value="aguardando_cliente">⏳ Aguardando Cliente</option>
                                                <option value="entrevista_cliente">🏢 Entrevista Cliente</option>
                                                <option value="aprovado_cliente">✅ Aprovado pelo Cliente</option>
                                                <option value="contratado">🎉 Contratado</option>
                                                <option value="reprovado">❌ Reprovado</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Nº OC e Urgente */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-sm font-bold text-gray-700">Nº Ocorrência (OC)</label>
                                            <input 
                                                type="number"
                                                className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500" 
                                                placeholder="Ex: 7330" 
                                                value={formData.ocorrencia || ''} 
                                                onChange={e => setFormData({...formData, ocorrencia: e.target.value ? parseInt(e.target.value) : null})} 
                                            />
                                        </div>
                                        <div className="flex items-center pt-6">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={formData.urgente || false}
                                                    onChange={e => setFormData({...formData, urgente: e.target.checked})}
                                                    className="w-5 h-5 text-red-600 rounded"
                                                />
                                                <span className="font-medium text-gray-700">🚨 Vaga Urgente</span>
                                            </label>
                                        </div>
                                        <div className="flex items-center pt-6">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={formData.vaga_faturavel !== false}
                                                    onChange={e => setFormData({...formData, vaga_faturavel: e.target.checked})}
                                                    className="w-5 h-5 text-green-600 rounded"
                                                />
                                                <span className="font-medium text-gray-700">💰 Vaga Faturável</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* ===== SEÇÃO 2: DESCRIÇÃO ===== */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-sm font-bold text-gray-700">Descrição da Vaga</label>
                                        <button
                                            type="button"
                                            onClick={extrairRequisitosComIA}
                                            disabled={extractingRequisitos || !formData.descricao || formData.descricao.length < 50}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-sm font-medium shadow-sm transition-all"
                                            title="A IA irá extrair: Requisitos Obrigatórios, Desejáveis e Stack Tecnológica"
                                        >
                                            {extractingRequisitos ? (
                                                <>
                                                    <Loader2 className="animate-spin" size={16} />
                                                    Analisando...
                                                </>
                                            ) : (
                                                <>
                                                    <Wand2 size={16} />
                                                    🤖 Extrair Requisitos com IA
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <textarea 
                                        className="w-full border p-3 rounded mt-1 h-32 focus:ring-2 focus:ring-orange-500 font-mono text-sm" 
                                        placeholder="Cole aqui a descrição completa da vaga. Após colar, clique em '🤖 Extrair Requisitos com IA' para preencher automaticamente os requisitos e a stack tecnológica..." 
                                        value={formData.descricao} 
                                        onChange={e => {
                                            setFormData({...formData, descricao: e.target.value});
                                            setIaExtractionSuccess(false);
                                        }} 
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        💡 Dica: Cole a descrição completa e clique em "🤖 Extrair Requisitos com IA" para preenchimento automático
                                    </p>
                                    {iaExtractionSuccess && (
                                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                                            <span>✅</span>
                                            <span>Requisitos e Stack extraídos com sucesso! Revise na seção "Requisitos" abaixo.</span>
                                        </div>
                                    )}
                                </div>

                                {/* ===== SEÇÃO 3: REQUISITOS (Expandível) ===== */}
                                <div className="border rounded-lg overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleSection('requisitos')}
                                        className={`w-full flex justify-between items-center p-4 hover:bg-gray-100 ${
                                            iaExtractionSuccess ? 'bg-green-50' : 'bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-700">📝 Requisitos</span>
                                            {iaExtractionSuccess && (
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                                    ✓ Extraído pela IA
                                                </span>
                                            )}
                                        </div>
                                        {expandedSections.requisitos ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </button>
                                    {expandedSections.requisitos && (
                                        <div className="p-4 space-y-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <label className="text-sm font-bold text-gray-700">Requisitos Obrigatórios</label>
                                                    {formData.requisitos_obrigatorios && iaExtractionSuccess && (
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ IA</span>
                                                    )}
                                                </div>
                                                <textarea 
                                                    className={`w-full border p-2 rounded mt-1 h-28 ${
                                                        formData.requisitos_obrigatorios && iaExtractionSuccess 
                                                            ? 'border-green-300 bg-green-50/30' 
                                                            : ''
                                                    }`}
                                                    placeholder="Liste os requisitos obrigatórios..." 
                                                    value={formData.requisitos_obrigatorios || ''} 
                                                    onChange={e => setFormData({...formData, requisitos_obrigatorios: e.target.value})} 
                                                />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <label className="text-sm font-bold text-gray-700">Requisitos Desejáveis</label>
                                                    {formData.requisitos_desejaveis && iaExtractionSuccess && (
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ IA</span>
                                                    )}
                                                </div>
                                                <textarea 
                                                    className={`w-full border p-2 rounded mt-1 h-28 ${
                                                        formData.requisitos_desejaveis && iaExtractionSuccess 
                                                            ? 'border-green-300 bg-green-50/30' 
                                                            : ''
                                                    }`}
                                                    placeholder="Liste os requisitos desejáveis..." 
                                                    value={formData.requisitos_desejaveis || ''} 
                                                    onChange={e => setFormData({...formData, requisitos_desejaveis: e.target.value})} 
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ===== SEÇÃO 4: STACK TECNOLÓGICA ===== */}
                                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-sm font-bold text-purple-800">🔧 Stack Tecnológica</label>
                                        <button
                                            type="button"
                                            onClick={extrairStacksAutomaticamente}
                                            disabled={extractingStacks}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
                                        >
                                            {extractingStacks ? (
                                                <Loader2 className="animate-spin" size={16} />
                                            ) : (
                                                <Wand2 size={16} />
                                            )}
                                            Extrair com IA
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            className="border p-2 rounded flex-1" 
                                            value={techInput} 
                                            onChange={e => setTechInput(e.target.value)} 
                                            placeholder="Digite tecnologias separadas por vírgula"
                                            onKeyPress={e => { if (e.key === 'Enter') { e.preventDefault(); addTech(); } }}
                                        />
                                        <button type="button" onClick={addTech} className="bg-purple-600 text-white px-4 rounded hover:bg-purple-700">
                                            Adicionar
                                        </button>
                                    </div>
                                    <div className="flex gap-1 mt-3 flex-wrap">
                                        {(formData.stack_tecnologica || []).map(t => (
                                            <span 
                                                key={t} 
                                                className="bg-white text-purple-800 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-purple-200"
                                            >
                                                {t}
                                                <button 
                                                    type="button" 
                                                    onClick={() => removeTech(t)}
                                                    className="text-red-500 hover:text-red-700 font-bold ml-1"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                        {(formData.stack_tecnologica || []).length === 0 && (
                                            <span className="text-purple-400 text-sm italic">Nenhuma tecnologia adicionada</span>
                                        )}
                                    </div>
                                </div>

                                {/* ===== SEÇÃO 5: CONTRATAÇÃO (Expandível) ===== */}
                                <div className="border rounded-lg overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleSection('contratacao')}
                                        className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                                    >
                                        <span className="font-bold text-gray-700">💰 Contratação & Valores</span>
                                        {expandedSections.contratacao ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </button>
                                    {expandedSections.contratacao && (
                                        <div className="p-4 space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Regime de Contratação</label>
                                                    <select 
                                                        className="w-full border p-2 rounded mt-1" 
                                                        value={formData.regime_contratacao || ''} 
                                                        onChange={e => setFormData({...formData, regime_contratacao: e.target.value})}
                                                    >
                                                        <option value="">Selecione</option>
                                                        <option value="PJ">PJ</option>
                                                        <option value="CLT">CLT</option>
                                                        <option value="CLT Flex">CLT Flex</option>
                                                        <option value="Cooperado">Cooperado</option>
                                                        <option value="Estágio">Estágio</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Modalidade</label>
                                                    <select 
                                                        className="w-full border p-2 rounded mt-1" 
                                                        value={formData.modalidade || ''} 
                                                        onChange={e => setFormData({...formData, modalidade: e.target.value})}
                                                    >
                                                        <option value="">Selecione</option>
                                                        <option value="Remoto">Remoto</option>
                                                        <option value="Híbrido">Híbrido</option>
                                                        <option value="Presencial">Presencial</option>
                                                    </select>
                                                </div>
                                            </div>
                                            
                                            {/* ✅ NOVO: Tipo de Remuneração */}
                                            <div>
                                                <label className="text-sm font-bold text-gray-700">Tipo de Remuneração</label>
                                                <select 
                                                    className="w-full border p-2 rounded mt-1" 
                                                    value={(formData as any).tipo_remuneracao || 'Hora Aberta'} 
                                                    onChange={e => setFormData({...formData, tipo_remuneracao: e.target.value} as any)}
                                                >
                                                    <option value="Hora Aberta">Hora Aberta</option>
                                                    <option value="Hora Fechada">Hora Fechada</option>
                                                    <option value="Valor Fechado">Valor Fechado</option>
                                                </select>
                                            </div>

                                            {/* ✅ ALTERADO: Labels de valores */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Valor Hora Min R$</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        placeholder="0.00" 
                                                        step="0.01"
                                                        value={formData.salario_min || ''} 
                                                        onChange={e => setFormData({...formData, salario_min: e.target.value ? parseFloat(e.target.value) : null})} 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Valor Hora Máx R$</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        placeholder="0.00" 
                                                        step="0.01"
                                                        value={formData.salario_max || ''} 
                                                        onChange={e => setFormData({...formData, salario_max: e.target.value ? parseFloat(e.target.value) : null})} 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Valor/H Faturamento R$</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        placeholder="0.00" 
                                                        step="0.01"
                                                        value={formData.faturamento_mensal || ''} 
                                                        onChange={e => setFormData({...formData, faturamento_mensal: e.target.value ? parseFloat(e.target.value) : null})} 
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-gray-700">Benefícios</label>
                                                <textarea 
                                                    className="w-full border p-2 rounded mt-1 h-20" 
                                                    placeholder="Liste os benefícios oferecidos..." 
                                                    value={formData.beneficios || ''} 
                                                    onChange={e => setFormData({...formData, beneficios: e.target.value})} 
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ===== SEÇÃO 6: CONFIGURAÇÕES (Expandível) ===== */}
                                <div className="border rounded-lg overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleSection('config')}
                                        className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100"
                                    >
                                        <span className="font-bold text-gray-700">⚙️ Configurações</span>
                                        {expandedSections.config ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </button>
                                    {expandedSections.config && (
                                        <div className="p-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Prazo de Fechamento</label>
                                                    <input 
                                                        type="date"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        value={formData.prazo_fechamento || ''} 
                                                        onChange={e => setFormData({...formData, prazo_fechamento: e.target.value || null})} 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Gestão Comercial</label>
                                                    <select
                                                        className={`w-full border p-2 rounded mt-1 ${
                                                            formData.analista_id ? 'border-green-300 bg-green-50' : ''
                                                        }`}
                                                        value={formData.analista_id || ''}
                                                        onChange={e => setFormData({...formData, analista_id: e.target.value ? parseInt(e.target.value) : null})}
                                                    >
                                                        <option value="">Selecione</option>
                                                        {gestoresComerciais.map(user => (
                                                            <option key={user.id} value={user.id}>
                                                                {user.nome_usuario}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {formData.analista_id && (
                                                        <p className="text-xs text-green-600 mt-1">
                                                            ✓ {gestoresComerciais.find(u => u.id === formData.analista_id)?.nome_usuario || 'Selecionado'}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Footer do Modal */}
                        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
                            <div className="text-sm text-gray-500">
                                {(formData.stack_tecnologica || []).length > 0 && (
                                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                        {(formData.stack_tecnologica || []).length} tecnologias
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="px-5 py-2 border rounded-lg hover:bg-gray-100"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    form="vagaForm"
                                    className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold"
                                >
                                    {editingVaga ? 'Atualizar' : 'Criar'} Vaga
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Priorização */}
            {priorizacaoVagaId && (
                <VagaPriorizacaoManager
                    vagaId={priorizacaoVagaId}
                    vagaTitulo={priorizacaoVagaTitulo}
                    onClose={() => setPriorizacaoVagaId(null)}
                />
            )}

            {/* Modal de Busca de CVs */}
            {buscaCVVaga && (
                <CVMatchingPanel
                    vaga={buscaCVVaga}
                    onClose={() => setBuscaCVVaga(null)}
                    onCandidaturaCriada={handleCandidaturaCriada}
                    currentUserId={currentUserId}
                />
            )}

            {/* Modal de Sugestões IA */}
            {sugestoesIAVaga && (
                <VagaSugestoesIA
                    vaga={sugestoesIAVaga}
                    onClose={() => setSugestoesIAVaga(null)}
                    onAplicarSugestoes={(vagaAtualizada) => {
                        updateVaga(sugestoesIAVaga.id, vagaAtualizada);
                        setSugestoesIAVaga(null);
                    }}
                    currentUserId={currentUserId}
                />
            )}

            {/* ==================== 🆕 v58.0: MODAL VISUALIZAÇÃO DA VAGA ==================== */}
            {vagaVisualizacao && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        {vagaVisualizacao.urgente && (
                                            <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded font-bold">
                                                🚨 URGENTE
                                            </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold ${
                                            vagaVisualizacao.status === 'aberta' ? 'bg-green-500' : 
                                            vagaVisualizacao.status === 'pausada' ? 'bg-yellow-500' :
                                            'bg-gray-500'
                                        }`}>
                                            {vagaVisualizacao.status}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-bold">{vagaVisualizacao.titulo}</h3>
                                    <p className="text-blue-100 text-sm mt-1">
                                        {getClientName(vagaVisualizacao.cliente_id)} • {vagaVisualizacao.senioridade}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setVagaVisualizacao(null)}
                                    className="text-white hover:text-gray-200 text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Corpo com scroll */}
                        <div className="overflow-y-auto p-6 space-y-6">
                            {/* Info Pills */}
                            <div className="flex flex-wrap gap-2">
                                {vagaVisualizacao.tipo_de_vaga && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                                        <Briefcase size={14} />
                                        {vagaVisualizacao.tipo_de_vaga}
                                    </span>
                                )}
                                {vagaVisualizacao.modalidade && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                        <MapPin size={14} />
                                        {vagaVisualizacao.modalidade}
                                    </span>
                                )}
                                {vagaVisualizacao.regime_contratacao && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                        <FileText size={14} />
                                        {vagaVisualizacao.regime_contratacao}
                                    </span>
                                )}
                                {vagaVisualizacao.vaga_faturavel && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
                                        <DollarSign size={14} />
                                        Faturável
                                    </span>
                                )}
                                {vagaVisualizacao.ocorrencia && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                                        OC: {vagaVisualizacao.ocorrencia}
                                    </span>
                                )}
                            </div>

                            {/* Descrição */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                    <FileText size={16} />
                                    Descrição da Vaga
                                </h4>
                                <div className="bg-gray-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap">
                                    {vagaVisualizacao.descricao || 'Não informada'}
                                </div>
                            </div>

                            {/* Stack Tecnológica */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Stack Tecnológica</h4>
                                <div className="flex flex-wrap gap-2">
                                    {ensureStackArray(vagaVisualizacao.stack_tecnologica).length > 0 ? (
                                        ensureStackArray(vagaVisualizacao.stack_tecnologica).map(tech => (
                                            <span key={tech} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                                {tech}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-400 italic">Não definida</span>
                                    )}
                                </div>
                            </div>

                            {/* Requisitos */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                        <CheckCircle size={16} className="text-green-500" />
                                        Requisitos Obrigatórios
                                    </h4>
                                    <div className="bg-green-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap text-sm min-h-[100px]">
                                        {vagaVisualizacao.requisitos_obrigatorios || 'Não informado'}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                        <AlertCircle size={16} className="text-amber-500" />
                                        Requisitos Desejáveis
                                    </h4>
                                    <div className="bg-amber-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap text-sm min-h-[100px]">
                                        {vagaVisualizacao.requisitos_desejaveis || 'Não informado'}
                                    </div>
                                </div>
                            </div>

                            {/* Informações de Contratação */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                    <DollarSign size={16} />
                                    Informações de Contratação
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-500 uppercase">Valor Hora Mín</p>
                                        <p className="text-lg font-semibold text-gray-800">
                                            {vagaVisualizacao.salario_min ? `R$ ${vagaVisualizacao.salario_min}` : '-'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-500 uppercase">Valor Hora Máx</p>
                                        <p className="text-lg font-semibold text-gray-800">
                                            {vagaVisualizacao.salario_max ? `R$ ${vagaVisualizacao.salario_max}` : '-'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-500 uppercase">Faturamento</p>
                                        <p className="text-lg font-semibold text-gray-800">
                                            {vagaVisualizacao.faturamento_mensal ? `R$ ${vagaVisualizacao.faturamento_mensal}` : '-'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-500 uppercase">Prazo</p>
                                        <p className="text-lg font-semibold text-gray-800">
                                            {vagaVisualizacao.prazo_fechamento 
                                                ? new Date(vagaVisualizacao.prazo_fechamento).toLocaleDateString('pt-BR')
                                                : '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Benefícios */}
                            {vagaVisualizacao.beneficios && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Benefícios</h4>
                                    <div className="bg-gray-50 rounded-lg p-4 text-gray-700 whitespace-pre-wrap text-sm">
                                        {vagaVisualizacao.beneficios}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="border-t p-4 bg-gray-50">
                            {/* 🆕 v58.1: Analistas R&S associados */}
                            {analistasPorVaga[vagaVisualizacao.id] && analistasPorVaga[vagaVisualizacao.id].length > 0 && (
                                <div className="mb-3 pb-3 border-b border-gray-200">
                                    <span className="text-xs font-semibold text-gray-500 uppercase">Analistas R&S Associados:</span>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {analistasPorVaga[vagaVisualizacao.id].map((nome, idx) => (
                                            <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm">
                                                <UserIcon size={14} />
                                                {nome}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex justify-between items-center">
                                <div className="text-xs text-gray-500">
                                    {vagaVisualizacao.criado_em && (
                                        <span>Criada em: {new Date(vagaVisualizacao.criado_em).toLocaleDateString('pt-BR')}</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {!apenasLeitura && (
                                        <button
                                            onClick={() => {
                                                setVagaVisualizacao(null);
                                                openModal(vagaVisualizacao);
                                            }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                                        >
                                            ✏️ Editar Vaga
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setVagaVisualizacao(null)}
                                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== 🆕 v58.0: MODAL CANDIDATURAS ==================== */}
            {candidaturasVaga && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-5">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <Users size={24} />
                                        Candidaturas
                                    </h3>
                                    <p className="text-purple-100 text-sm mt-1">
                                        {candidaturasVaga.titulo} • {getClientName(candidaturasVaga.cliente_id)}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setCandidaturasVaga(null);
                                        setCandidaturas([]);
                                    }}
                                    className="text-white hover:text-gray-200 text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Corpo com scroll */}
                        <div className="overflow-y-auto flex-1 p-4">
                            {loadingCandidaturas ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="animate-spin text-purple-600" size={32} />
                                    <span className="ml-3 text-gray-600">Carregando candidaturas...</span>
                                </div>
                            ) : candidaturas.length === 0 ? (
                                <div className="text-center py-12">
                                    <Users size={48} className="mx-auto text-gray-300 mb-4" />
                                    <p className="text-gray-500 text-lg">Nenhuma candidatura encontrada</p>
                                    <p className="text-gray-400 text-sm mt-1">Esta vaga ainda não possui candidatos associados</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Header da tabela */}
                                    <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-gray-100 rounded-lg text-xs font-semibold text-gray-500 uppercase">
                                        <div className="col-span-4">Candidato</div>
                                        <div className="col-span-2">Status</div>
                                        <div className="col-span-2">Data Envio</div>
                                        <div className="col-span-2">Analista R&S</div>
                                        <div className="col-span-2">Senioridade</div>
                                    </div>
                                    
                                    {/* Lista de candidaturas */}
                                    {candidaturas.map((candidatura) => {
                                        const statusInfo = formatarStatusCandidatura(candidatura.status);
                                        return (
                                            <div 
                                                key={candidatura.id} 
                                                className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-white border rounded-lg hover:shadow-md transition-shadow items-center"
                                            >
                                                {/* Candidato */}
                                                <div className="col-span-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold">
                                                            {candidatura.pessoa?.nome?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">
                                                                {candidatura.pessoa?.nome || 'Nome não disponível'}
                                                            </p>
                                                            <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                                                {candidatura.pessoa?.titulo_profissional || candidatura.pessoa?.email || '-'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Status */}
                                                <div className="col-span-2">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                                        {statusInfo.icon} {statusInfo.label}
                                                    </span>
                                                </div>
                                                
                                                {/* Data Envio */}
                                                <div className="col-span-2">
                                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                                        <Calendar size={14} />
                                                        {candidatura.created_at 
                                                            ? new Date(candidatura.created_at).toLocaleDateString('pt-BR')
                                                            : '-'}
                                                    </div>
                                                </div>
                                                
                                                {/* Analista */}
                                                <div className="col-span-2">
                                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                                        <UserIcon size={14} />
                                                        {candidatura.analista?.nome_usuario || (
                                                            <span className="text-gray-400 italic">Não atribuído</span>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Senioridade */}
                                                <div className="col-span-2">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                        candidatura.pessoa?.senioridade === 'senior' ? 'bg-purple-100 text-purple-700' :
                                                        candidatura.pessoa?.senioridade === 'pleno' ? 'bg-blue-100 text-blue-700' :
                                                        candidatura.pessoa?.senioridade === 'junior' ? 'bg-green-100 text-green-700' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {candidatura.pessoa?.senioridade || '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
                            <div className="text-sm text-gray-600">
                                <span className="font-semibold">{candidaturas.length}</span> candidatura(s) encontrada(s)
                            </div>
                            <button
                                onClick={() => {
                                    setCandidaturasVaga(null);
                                    setCandidaturas([]);
                                }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Vagas;
