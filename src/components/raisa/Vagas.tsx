/**
 * Vagas.tsx - RMS RAISA v56.1
 * Componente de Gestão de Vagas
 * 
 * v56.1: Correções de bugs
 *        - Removido "IA" e "AI" da lista de stacks (termos genéricos)
 *        - Filtro de termos genéricos na extração via IA
 *        - Select de "Gestão Comercial" com usuários filtrados
 *        - Label corrigido: "Gestão Comercial" (antes era "Gestor Comercial (Analista)")
 *        - Auto-preenchimento com feedback visual e alerta
 *        - Adicionadas stacks SAP (WM, MM, SD, FI, CO, ABAP, HANA)
 * 
 * v56.0: Extração de Requisitos e Stack via Backend/Gemini
 *        - Botão "🤖 Extrair Requisitos com IA" na descrição
 *        - Chamada ao backend /api/gemini-analyze (action: extrair_requisitos_vaga)
 *        - Auto-preenchimento do Gestor Comercial ao selecionar Cliente
 *        - Indicadores visuais de campos extraídos pela IA
 * 
 * v55.0: Modal COMPLETO com todos os campos da tabela vagas
 */

import React, { useState, useMemo } from 'react';
import { Vaga, Client, UsuarioCliente, User } from '../../types/types_index';
import VagaPriorizacaoManager from './VagaPriorizacaoManager';
import CVMatchingPanel from './CVMatchingPanel';
import VagaSugestoesIA from './VagaSugestoesIA';
import { Wand2, Loader2, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

interface VagasProps {
    vagas: Vaga[];
    clients?: Client[];
    usuariosCliente?: UsuarioCliente[];
    users?: User[];  // ✅ NOVO: Lista de usuários do sistema (app_users)
    addVaga: (v: any) => void;
    updateVaga: (v: Vaga) => void;
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
    'React', 'Angular', 'Vue', 'Vue.js', 'Next.js', 'Node.js', 'Express',
    'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring', 'Spring Boot',
    'C#', '.NET', '.NET Core', 'PHP', 'Laravel', 'Symfony',
    'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Tailwind',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL Server', 'Oracle',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'K8s',
    'Git', 'GitHub', 'GitLab', 'CI/CD', 'Jenkins',
    'REST', 'API', 'GraphQL', 'Microservices',
    'Agile', 'Scrum', 'Kanban', 'DevOps',
    'Linux', 'Terraform', 'Ansible',
    'Selenium', 'Cypress', 'Jest', 'JUnit',
    'Power BI', 'Tableau', 'SAP', 'SAP WM', 'SAP MM', 'SAP SD', 'SAP FI', 'SAP CO', 'SAP ABAP', 'SAP HANA', 'Salesforce',
    'Machine Learning', 'Data Science', 'TensorFlow', 'PyTorch'
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
    // Estados do modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVaga, setEditingVaga] = useState<Vaga | null>(null);
    const [priorizacaoVagaId, setPriorizacaoVagaId] = useState<string | null>(null);
    const [priorizacaoVagaTitulo, setPriorizacaoVagaTitulo] = useState<string>('');
    
    // Estado para Busca de CVs
    const [buscaCVVaga, setBuscaCVVaga] = useState<Vaga | null>(null);
    
    // Estado para Sugestões IA
    const [sugestoesIAVaga, setSugestoesIAVaga] = useState<Vaga | null>(null);
    
    // Estados dos filtros de header
    const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
    const [selectedGestorId, setSelectedGestorId] = useState<number | null>(null);
    
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

    // Filtrar vagas pelo cliente selecionado
    const vagasFiltradas = useMemo(() => {
        let filtered = safeVagas;
        if (selectedClientId) {
            filtered = filtered.filter(v => v.cliente_id === selectedClientId);
        }
        return filtered;
    }, [safeVagas, selectedClientId]);

    // Ordenar clientes alfabeticamente
    const sortedClients = useMemo(() => {
        return [...safeClients]
            .filter(c => c.ativo_cliente !== false)
            .sort((a, b) => (a.razao_social_cliente || '').localeCompare(b.razao_social_cliente || ''));
    }, [safeClients]);

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
                cliente_id: selectedClientId,
                gestor_cliente_id: null,
                tipo_de_vaga: 'Nova Posição',
                ocorrencia: null,
                vaga_faturavel: true,
                requisitos_obrigatorios: '',
                requisitos_desejaveis: '',
                regime_contratacao: 'PJ',
                modalidade: 'Remoto',
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
            cliente_id: formData.cliente_id,
            // Campos adicionais
            tipo_de_vaga: formData.tipo_de_vaga,
            ocorrencia: formData.ocorrencia,
            vaga_faturavel: formData.vaga_faturavel,
            requisitos_obrigatorios: formData.requisitos_obrigatorios || null,
            requisitos_desejaveis: formData.requisitos_desejaveis || null,
            regime_contratacao: formData.regime_contratacao,
            modalidade: formData.modalidade,
            salario_min: formData.salario_min,
            salario_max: formData.salario_max,
            faturamento_mensal: formData.faturamento_mensal,
            beneficios: formData.beneficios || null,
            prazo_fechamento: formData.prazo_fechamento,
            urgente: formData.urgente,
            analista_id: formData.analista_id
        };

        if (editingVaga) {
            updateVaga({ ...editingVaga, ...vagaData });
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

                    {/* Botão Nova Vaga */}
                    <button 
                        onClick={() => openModal()} 
                        className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 font-semibold flex items-center gap-2 shadow-md"
                    >
                        <Plus size={18} /> Nova Vaga
                    </button>
                </div>

                {/* Info do filtro */}
                {selectedClientId && (
                    <div className="mt-2 text-sm text-gray-600">
                        Mostrando <strong>{vagasFiltradas.length}</strong> vagas de <strong>{getClientName(selectedClientId)}</strong>
                    </div>
                )}
            </div>

            {/* Grid de Vagas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vagasFiltradas.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm">
                        <p className="text-gray-500 text-lg">
                            {selectedClientId 
                                ? 'Nenhuma vaga encontrada para este cliente.' 
                                : 'Nenhuma vaga cadastrada. Clique em "+ Nova Vaga" para criar.'}
                        </p>
                    </div>
                ) : (
                    vagasFiltradas.map(vaga => {
                        const stackArray = ensureStackArray(vaga.stack_tecnologica);
                        
                        return (
                            <div key={vaga.id} className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
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
                                
                                <div className="flex justify-between items-center pt-4 border-t">
                                    <span className="text-sm font-medium text-gray-500">{vaga.senioridade}</span>
                                    <div className="flex flex-wrap gap-2">
                                        <button 
                                            onClick={() => setSugestoesIAVaga(vaga)} 
                                            className="text-purple-600 hover:text-purple-800 hover:underline text-sm font-semibold"
                                            title="Analisar e melhorar vaga com IA"
                                        >
                                            🤖 IA
                                        </button>
                                        <button 
                                            onClick={() => handleBuscarCVs(vaga)} 
                                            className="text-green-600 hover:text-green-800 hover:underline text-sm font-semibold"
                                            title="Buscar candidatos aderentes"
                                        >
                                            🔍 CVs
                                        </button>
                                        <button 
                                            onClick={() => { setPriorizacaoVagaId(vaga.id); setPriorizacaoVagaTitulo(vaga.titulo); }} 
                                            className="text-orange-600 hover:underline text-sm font-semibold"
                                        >
                                            🎯 Priorizar
                                        </button>
                                        <button onClick={() => openModal(vaga)} className="text-blue-600 hover:underline text-sm">Editar</button>
                                        <button onClick={() => deleteVaga(vaga.id)} className="text-red-600 hover:underline text-sm">Excluir</button>
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
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Salário Mín (R$)</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        placeholder="0.00" 
                                                        value={formData.salario_min || ''} 
                                                        onChange={e => setFormData({...formData, salario_min: e.target.value ? parseFloat(e.target.value) : null})} 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Salário Máx (R$)</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        placeholder="0.00" 
                                                        value={formData.salario_max || ''} 
                                                        onChange={e => setFormData({...formData, salario_max: e.target.value ? parseFloat(e.target.value) : null})} 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-bold text-gray-700">Faturamento Mensal (R$)</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full border p-2 rounded mt-1" 
                                                        placeholder="0.00" 
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
                        updateVaga({ ...sugestoesIAVaga, ...vagaAtualizada } as Vaga);
                        setSugestoesIAVaga(null);
                    }}
                    currentUserId={currentUserId}
                />
            )}
        </div>
    );
};

export default Vagas;
