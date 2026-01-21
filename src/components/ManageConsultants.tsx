import React, { useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantStatus, TerminationReason } from '@/types';
import { Mail, Phone, Search, Building2, Calendar, CreditCard, User as UserIcon, Briefcase, DollarSign, AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Lock } from 'lucide-react';
import InclusionImport from './InclusionImport';

// ✅ NOVO: Ano atual e anos disponíveis para filtro
const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = [2024, 2025, 2026]; // Anos disponíveis no dropdown

interface ManageConsultantsProps {
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    clients: Client[];
    coordenadoresCliente: CoordenadorCliente[];
    users: User[];
    addConsultant: (c: any) => void;
    updateConsultant: (c: Consultant) => void;
    currentUser: User;
    onNavigateToAtividades: () => void;
}

// ✅ NOVO: Tipos de modalidade de contrato
type ModalidadeContrato = 'PJ' | 'CLT' | 'Temporário' | 'Outros';

const TERMINATION_REASONS: { value: TerminationReason; description: string }[] = [
    { value: 'Baixa Performance Técnica', description: 'Consultor não apresentou a qualidade técnica esperada' },
    { value: 'Problemas Comportamentais', description: 'Questões comportamentais no ambiente de trabalho' },
    { value: 'Excesso de Faltas e Atrasos', description: 'Faltas e atrasos recorrentes' },
    { value: 'Baixa Produtividade', description: 'Baixo rendimento nas entregas' },
    { value: 'Não Cumprimento de Atividades', description: 'Não execução das atividades designadas' },
    { value: 'Performance Técnica e Comportamental', description: 'Combinação de problemas técnicos e comportamentais' },
    { value: 'Abandono de Função', description: 'Abandono do posto de trabalho' },
    { value: 'Internalizado pelo Cliente', description: 'Cliente contratou diretamente' },
    { value: 'Oportunidade Financeira', description: 'Proposta financeira melhor' },
    { value: 'Oportunidade de Carreira', description: 'Desenvolvimento de carreira' },
    { value: 'Outros', description: 'Outros motivos' }
];

// ✅ NOVO: Opções de modalidade de contrato
const MODALIDADE_OPTIONS: { value: ModalidadeContrato; label: string }[] = [
    { value: 'PJ', label: 'PJ - Pessoa Jurídica' },
    { value: 'CLT', label: 'CLT - Carteira Assinada' },
    { value: 'Temporário', label: 'Temporário' },
    { value: 'Outros', label: 'Outros' }
];

// ===== COMPONENTE DE SCORE BADGE =====
const ScoreBadge: React.FC<{ score: number | null | undefined; label: string }> = ({ score, label }) => {
    const getScoreColor = (s: number | null | undefined) => {
        if (s === null || s === undefined) return 'bg-gray-100 text-gray-400 border-gray-200';
        if (s >= 8) return 'bg-green-100 text-green-700 border-green-300';
        if (s >= 6) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
        if (s >= 4) return 'bg-orange-100 text-orange-700 border-orange-300';
        return 'bg-red-100 text-red-700 border-red-300';
    };

    return (
        <div className={`flex flex-col items-center justify-center w-10 h-12 rounded-lg border ${getScoreColor(score)}`}>
            <span className="text-[10px] font-medium opacity-70">{label}</span>
            <span className="text-sm font-bold">{score ?? '-'}</span>
        </div>
    );
};

// ===== COMPONENTE PRINCIPAL =====
const ManageConsultants: React.FC<ManageConsultantsProps> = ({ 
    consultants, usuariosCliente, clients, coordenadoresCliente, users, 
    addConsultant, updateConsultant, currentUser, onNavigateToAtividades 
}) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
    const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
    
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
    const [selectedConsultantFilter, setSelectedConsultantFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    
    // ✅ NOVO: Filtro de ano de vigência (padrão: ano atual)
    const [selectedYearFilter, setSelectedYearFilter] = useState<number>(ANO_ATUAL);
    
    // ✅ NOVO: Verificar se o ano selecionado permite edição (apenas ano atual)
    const isYearReadOnly = selectedYearFilter < ANO_ATUAL;
    
    const [formData, setFormData] = useState({
        ano_vigencia: new Date().getFullYear(),
        nome_consultores: '',
        email_consultor: '',
        celular: '',
        cpf: '',
        cargo_consultores: '',
        especialidade: '',
        data_inclusao_consultores: '',
        data_saida: '',
        dt_aniversario: '',
        id_cliente: '',
        gestor_imediato_id: '',
        coordenador_id: '',
        status: 'Ativo' as ConsultantStatus,
        motivo_desligamento: '' as TerminationReason | '',
        ativo_consultor: true,
        analista_rs_id: '' as string | number,
        id_gestao_de_pessoas: '' as string | number,
        valor_faturamento: '',
        valor_pagamento: '',
        cnpj_consultor: '',
        empresa_consultor: '',
        // ✅ NOVOS CAMPOS
        modalidade_contrato: 'PJ' as ModalidadeContrato,
        substituicao: false,
        nome_substituido: '',
        faturavel: true,
        observacoes: '',
    });

    const isReadOnly = currentUser.tipo_usuario === 'Consulta';

    // ✅ CORREÇÃO v3.0: Função para formatar datas para input type="date"
    // O banco retorna "2026-01-19 00:00:00" mas o input espera "2026-01-19"
    const formatDateForInput = (dateStr: string | undefined | null): string => {
        if (!dateStr) return '';
        // Se já está no formato correto (YYYY-MM-DD), retornar
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        // Se tem timestamp (2026-01-19 00:00:00), extrair apenas a data
        if (dateStr.includes(' ')) return dateStr.split(' ')[0];
        // Se tem T (ISO format), extrair apenas a data
        if (dateStr.includes('T')) return dateStr.split('T')[0];
        return dateStr;
    };

    const toggleCardExpanded = (consultantId: number) => {
        setExpandedCards(prev => {
            const newSet = new Set(prev);
            if (newSet.has(consultantId)) {
                newSet.delete(consultantId);
            } else {
                newSet.add(consultantId);
            }
            return newSet;
        });
    };

    useEffect(() => {
        if (editingConsultant) {
            const gestor = usuariosCliente.find(u => u.id === editingConsultant.gestor_imediato_id);
            const clientId = gestor ? String(gestor.id_cliente) : '';
            
            setFormData({
                ano_vigencia: editingConsultant.ano_vigencia || new Date().getFullYear(),
                nome_consultores: editingConsultant.nome_consultores || '',
                email_consultor: editingConsultant.email_consultor || '',
                celular: editingConsultant.celular || '',
                cpf: editingConsultant.cpf || '',
                cargo_consultores: editingConsultant.cargo_consultores || '',
                especialidade: (editingConsultant as any).especialidade || '',
                // ✅ CORREÇÃO v3.0: Formatar datas para input type="date"
                data_inclusao_consultores: formatDateForInput(editingConsultant.data_inclusao_consultores),
                data_saida: formatDateForInput(editingConsultant.data_saida),
                dt_aniversario: formatDateForInput((editingConsultant as any).dt_aniversario),
                id_cliente: clientId,
                gestor_imediato_id: String(editingConsultant.gestor_imediato_id || ''),
                coordenador_id: editingConsultant.coordenador_id ? String(editingConsultant.coordenador_id) : '',
                status: editingConsultant.status || 'Ativo',
                motivo_desligamento: editingConsultant.motivo_desligamento || '',
                ativo_consultor: editingConsultant.ativo_consultor ?? true,
                analista_rs_id: editingConsultant.analista_rs_id || '',
                id_gestao_de_pessoas: editingConsultant.id_gestao_de_pessoas || '',
                valor_faturamento: editingConsultant.valor_faturamento?.toString() || '',
                valor_pagamento: editingConsultant.valor_pagamento?.toString() || '',
                cnpj_consultor: (editingConsultant as any).cnpj_consultor || '',
                empresa_consultor: (editingConsultant as any).empresa_consultor || '',
                // ✅ NOVOS CAMPOS
                modalidade_contrato: (editingConsultant as any).modalidade_contrato || 'PJ',
                substituicao: (editingConsultant as any).substituicao || false,
                nome_substituido: (editingConsultant as any).nome_substituido || '',
                faturavel: (editingConsultant as any).faturavel ?? true,
                observacoes: (editingConsultant as any).observacoes || '',
            });
        }
    }, [editingConsultant]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validação: se status é Perdido/Encerrado, motivo é obrigatório
        if ((formData.status === 'Perdido' || formData.status === 'Encerrado') && !formData.motivo_desligamento) {
            alert("Selecione um Motivo de Desligamento.");
            return;
        }
        
        // ✅ NOVO: Validação - se substituição E consultor ATIVO, nome_substituido é obrigatório
        // Se consultor está sendo INATIVADO, não exige nome (ele está saindo, não substituindo)
        if (formData.substituicao && formData.ativo_consultor && !formData.nome_substituido.trim()) {
            alert("Informe o nome do consultor que está sendo substituído.");
            return;
        }

        const parseMoneyBR = (value: string): number | null => {
            if (!value) return null;
            const cleaned = value.replace(/[^\d,.-]/g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        };

        // Buscar cliente_id baseado no gestor selecionado
        const selectedGestor = usuariosCliente.find(u => u.id === parseInt(formData.gestor_imediato_id));
        const clienteId = selectedGestor?.id_cliente || null;
        
        // ✅ CORREÇÃO: Buscar id_gestao_de_pessoas do Cliente (não do formulário)
        const clienteSelecionadoParaSave = clienteId 
            ? clients.find(c => c.id === clienteId) 
            : null;
        const gestaoPessoasCorreta = clienteSelecionadoParaSave?.id_gestao_de_pessoas || null;

        const dataToSave = {
            ...formData,
            id_cliente: undefined, // Remover do spread
            cliente_id: clienteId, // ✅ CORREÇÃO: Adicionar cliente_id
            gestor_imediato_id: parseInt(formData.gestor_imediato_id),
            coordenador_id: formData.coordenador_id ? parseInt(formData.coordenador_id) : null,
            analista_rs_id: formData.analista_rs_id ? parseInt(String(formData.analista_rs_id)) : null,
            id_gestao_de_pessoas: gestaoPessoasCorreta, // ✅ CORREÇÃO: Usar valor do Cliente, não do formulário
            valor_faturamento: parseMoneyBR(formData.valor_faturamento),
            valor_pagamento: parseMoneyBR(formData.valor_pagamento),
            data_saida: formData.data_saida || null,
            dt_aniversario: formData.dt_aniversario || null,
            cnpj_consultor: formData.cnpj_consultor || null,
            empresa_consultor: formData.empresa_consultor || null,
            especialidade: formData.especialidade || null,
            // ✅ NOVOS CAMPOS
            modalidade_contrato: formData.modalidade_contrato,
            substituicao: formData.substituicao,
            nome_substituido: formData.substituicao ? formData.nome_substituido : null,
            faturavel: formData.faturavel,
            observacoes: formData.observacoes || null,
        };

        if (editingConsultant) {
            updateConsultant({ ...editingConsultant, ...dataToSave });
        } else {
            addConsultant(dataToSave);
        }
        resetForm();
    };

    const resetForm = () => {
        setIsFormOpen(false);
        setEditingConsultant(null);
        setFormData({
            ano_vigencia: new Date().getFullYear(),
            nome_consultores: '', email_consultor: '', celular: '', cpf: '',
            cargo_consultores: '', especialidade: '', data_inclusao_consultores: '',
            data_saida: '', dt_aniversario: '', id_cliente: '', gestor_imediato_id: '',
            coordenador_id: '', status: 'Ativo', motivo_desligamento: '',
            ativo_consultor: true, analista_rs_id: '', id_gestao_de_pessoas: '',
            valor_faturamento: '', valor_pagamento: '', cnpj_consultor: '', empresa_consultor: '',
            // ✅ NOVOS CAMPOS
            modalidade_contrato: 'PJ',
            substituicao: false,
            nome_substituido: '',
            faturavel: true,
            observacoes: '',
        });
    };

    const filteredGestores = formData.id_cliente 
        ? usuariosCliente.filter(u => String(u.id_cliente) === formData.id_cliente && u.ativo !== false) : [];
    const filteredCoordenadores = formData.gestor_imediato_id 
        ? coordenadoresCliente.filter(c => String(c.id_gestor_cliente) === formData.gestor_imediato_id && c.ativo !== false) : [];
    
    // ✅ CORREÇÃO: Buscar Gestão de Pessoas do Cliente selecionado
    const clienteSelecionado = formData.id_cliente 
        ? clients.find(c => String(c.id) === formData.id_cliente) 
        : null;
    const gestaoPessoasDoCliente = clienteSelecionado?.id_gestao_de_pessoas || null;

    const getClientName = (consultant: Consultant) => {
        const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
        const client = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;
        return client?.razao_social_cliente || '-';
    };
    const getManagerName = (consultant: Consultant) => {
        const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
        return gestor?.nome_gestor_cliente || '-';
    };
    const getCoordinatorName = (consultant: Consultant) => {
        if (!consultant.coordenador_id) return null;
        const coord = coordenadoresCliente.find(c => c.id === consultant.coordenador_id);
        return coord?.nome_coordenador_cliente || null;
    };
    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR');
    };
    const formatCurrency = (value: number | null | undefined) => {
        if (value === null || value === undefined) return '-';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Filtros - COM filtro de ano de vigência
    const filteredConsultants = consultants.filter(c => {
        // ✅ NOVO: Filtrar pelo ano de vigência
        const matchesYear = c.ano_vigencia === selectedYearFilter;
        
        const clientName = getClientName(c);
        const matchesClient = selectedClientFilter === 'all' || clientName === selectedClientFilter;
        const matchesConsultant = selectedConsultantFilter === 'all' || c.nome_consultores === selectedConsultantFilter;
        const matchesSearch = !searchQuery || 
            c.nome_consultores?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.cargo_consultores?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            clientName?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesYear && matchesClient && matchesConsultant && matchesSearch;
    });

    const uniqueClients = [...new Set(consultants.map(c => getClientName(c)))].filter(Boolean).sort();

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {!isReadOnly && <InclusionImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} users={users} onImport={addConsultant} />}

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900">Gerenciar Consultores</h2>
                {!isReadOnly && !isYearReadOnly && (
                    <button
                        onClick={() => { setEditingConsultant(null); setIsFormOpen(true); }}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
                    >
                        <UserIcon className="w-5 h-5" />
                        Novo Consultor
                    </button>
                )}
            </div>

            {/* Filtros */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* ✅ NOVO: Dropdown de Ano de Vigência */}
                <select
                    value={selectedYearFilter}
                    onChange={(e) => setSelectedYearFilter(Number(e.target.value))}
                    className={`px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium ${
                        isYearReadOnly 
                            ? 'bg-amber-50 border-amber-300 text-amber-700' 
                            : 'border-gray-300'
                    }`}
                >
                    {ANOS_DISPONIVEIS.map(ano => (
                        <option key={ano} value={ano}>
                            {ano} {ano === ANO_ATUAL ? '(Atual)' : ano < ANO_ATUAL ? '(Histórico)' : ''}
                        </option>
                    ))}
                </select>
                
                <select
                    value={selectedClientFilter}
                    onChange={(e) => setSelectedClientFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value="all">Todos os Clientes</option>
                    {uniqueClients.map(client => (
                        <option key={client} value={client}>{client}</option>
                    ))}
                </select>
                
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Buscar consultor..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                
                <div className="text-sm text-gray-500 flex items-center">
                    {filteredConsultants.length} consultor(es) encontrado(s)
                    {isYearReadOnly && (
                        <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Modo Histórico
                        </span>
                    )}
                </div>
            </div>

            {/* Modal Formulário */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-xl">
                            <h3 className="text-2xl font-bold">
                                {editingConsultant ? 'Editar Consultor' : 'Novo Consultor'}
                            </h3>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* Seção: Dados Básicos */}
                            <div className="border-b pb-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <UserIcon className="w-5 h-5 text-indigo-600" />
                                    Dados Básicos
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.nome_consultores}
                                            onChange={(e) => setFormData({...formData, nome_consultores: e.target.value})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                                        <input
                                            type="text"
                                            value={formData.cpf}
                                            onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                                            placeholder="000.000.000-00"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                        <input
                                            type="email"
                                            value={formData.email_consultor}
                                            onChange={(e) => setFormData({...formData, email_consultor: e.target.value})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                                        <input
                                            type="text"
                                            value={formData.celular}
                                            onChange={(e) => setFormData({...formData, celular: e.target.value})}
                                            placeholder="(00) 00000-0000"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cargo *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.cargo_consultores}
                                            onChange={(e) => setFormData({...formData, cargo_consultores: e.target.value})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Especialidade</label>
                                        <input
                                            type="text"
                                            value={formData.especialidade}
                                            onChange={(e) => setFormData({...formData, especialidade: e.target.value})}
                                            placeholder="Ex: Java, Python, SAP..."
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento</label>
                                        <input
                                            type="date"
                                            value={formData.dt_aniversario}
                                            onChange={(e) => setFormData({...formData, dt_aniversario: e.target.value})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* ✅ NOVA Seção: Contrato */}
                            <div className="border-b pb-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <Briefcase className="w-5 h-5 text-indigo-600" />
                                    Contrato
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Modalidade de Contrato *</label>
                                        <select
                                            required
                                            value={formData.modalidade_contrato}
                                            onChange={(e) => setFormData({...formData, modalidade_contrato: e.target.value as ModalidadeContrato})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        >
                                            {MODALIDADE_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Faturável?</label>
                                        <div className="flex items-center gap-4 mt-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="faturavel"
                                                    checked={formData.faturavel === true}
                                                    onChange={() => setFormData({...formData, faturavel: true})}
                                                    className="w-4 h-4 text-indigo-600"
                                                />
                                                <span className="text-sm">Sim</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="faturavel"
                                                    checked={formData.faturavel === false}
                                                    onChange={() => setFormData({...formData, faturavel: false})}
                                                    className="w-4 h-4 text-indigo-600"
                                                />
                                                <span className="text-sm">Não</span>
                                            </label>
                                        </div>
                                    </div>
                                    {/* ✅ CORREÇÃO 1: Label alterado de "É Substituição?" para "Substituição?" */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Substituição?</label>
                                        <div className="flex items-center gap-4 mt-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="substituicao"
                                                    checked={formData.substituicao === false}
                                                    // ✅ CORREÇÃO 2: Removido "nome_substituido: ''" para preservar o valor
                                                    onChange={() => setFormData({...formData, substituicao: false})}
                                                    className="w-4 h-4 text-indigo-600"
                                                />
                                                <span className="text-sm">Não</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="substituicao"
                                                    checked={formData.substituicao === true}
                                                    onChange={() => setFormData({...formData, substituicao: true})}
                                                    className="w-4 h-4 text-indigo-600"
                                                />
                                                <span className="text-sm">Sim</span>
                                            </label>
                                        </div>
                                    </div>
                                    {/* ✅ CORREÇÃO: Só exibe se substituição=true E consultor ATIVO (não faz sentido pedir substituto de quem está saindo) */}
                                    {formData.substituicao && formData.ativo_consultor && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Nome do Substituído *
                                                <RefreshCw className="w-3 h-3 inline ml-1 text-orange-500" />
                                            </label>
                                            <input
                                                type="text"
                                                required={formData.substituicao}
                                                value={formData.nome_substituido}
                                                onChange={(e) => setFormData({...formData, nome_substituido: e.target.value})}
                                                placeholder="Nome do consultor que está saindo"
                                                className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-orange-50"
                                            />
                                        </div>
                                    )}
                                </div>
                                
                                {/* Dados PJ - Exibe se modalidade for PJ */}
                                {formData.modalidade_contrato === 'PJ' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-blue-50 rounded-lg">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                                            <input
                                                type="text"
                                                value={formData.cnpj_consultor}
                                                onChange={(e) => setFormData({...formData, cnpj_consultor: e.target.value})}
                                                placeholder="00.000.000/0000-00"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa (Razão Social PJ)</label>
                                            <input
                                                type="text"
                                                value={formData.empresa_consultor}
                                                onChange={(e) => setFormData({...formData, empresa_consultor: e.target.value})}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                )}
                                
                                {/* Campo de Observações */}
                                <div className="col-span-full mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                                    <textarea
                                        value={formData.observacoes}
                                        onChange={(e) => setFormData({...formData, observacoes: e.target.value})}
                                        rows={3}
                                        placeholder="Observações gerais sobre o consultor..."
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Seção: Alocação */}
                            <div className="border-b pb-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-indigo-600" />
                                    Alocação
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                                        <select
                                            required
                                            value={formData.id_cliente}
                                            onChange={(e) => setFormData({...formData, id_cliente: e.target.value, gestor_imediato_id: '', coordenador_id: ''})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">Selecione um cliente...</option>
                                            {clients.filter(c => c.ativo_cliente).map(c => (
                                                <option key={c.id} value={c.id}>{c.razao_social_cliente}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Gestor Imediato *</label>
                                        <select
                                            required
                                            value={formData.gestor_imediato_id}
                                            onChange={(e) => setFormData({...formData, gestor_imediato_id: e.target.value, coordenador_id: ''})}
                                            disabled={!formData.id_cliente}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                                        >
                                            <option value="">Selecione o cliente primeiro...</option>
                                            {filteredGestores.map(g => (
                                                <option key={g.id} value={g.id}>{g.nome_gestor_cliente}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Coordenador</label>
                                        <select
                                            value={formData.coordenador_id}
                                            onChange={(e) => setFormData({...formData, coordenador_id: e.target.value})}
                                            disabled={!formData.gestor_imediato_id}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                                        >
                                            <option value="">Selecione o gestor primeiro...</option>
                                            {filteredCoordenadores.map(c => (
                                                <option key={c.id} value={c.id}>{c.nome_coordenador_cliente}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Seção: Datas e Status */}
                            <div className="border-b pb-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-indigo-600" />
                                    Datas e Status
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Inclusão *</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.data_inclusao_consultores}
                                            onChange={(e) => setFormData({...formData, data_inclusao_consultores: e.target.value})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ano Vigência</label>
                                        <input
                                            type="number"
                                            value={formData.ano_vigencia}
                                            onChange={(e) => setFormData({...formData, ano_vigencia: parseInt(e.target.value)})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => {
                                                const newStatus = e.target.value as ConsultantStatus;
                                                setFormData({
                                                    ...formData, 
                                                    status: newStatus,
                                                    ativo_consultor: newStatus === 'Ativo'
                                                });
                                            }}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="Ativo">Ativo</option>
                                            <option value="Perdido">Perdido</option>
                                            <option value="Encerrado">Encerrado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ativo?</label>
                                        <select
                                            value={formData.ativo_consultor ? 'true' : 'false'}
                                            onChange={(e) => setFormData({...formData, ativo_consultor: e.target.value === 'true'})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="true">Sim</option>
                                            <option value="false">Não</option>
                                        </select>
                                    </div>
                                </div>
                                
                                {/* Campos de Desligamento - Exibe se não ativo */}
                                {(formData.status !== 'Ativo' || !formData.ativo_consultor) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                                        <div>
                                            <label className="block text-sm font-medium text-red-700 mb-1">
                                                <AlertTriangle className="w-4 h-4 inline mr-1" />
                                                Data de Saída
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.data_saida}
                                                onChange={(e) => setFormData({...formData, data_saida: e.target.value})}
                                                className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-red-700 mb-1">
                                                <AlertTriangle className="w-4 h-4 inline mr-1" />
                                                Motivo do Desligamento *
                                            </label>
                                            <select
                                                required={(formData.status !== 'Ativo' || !formData.ativo_consultor)}
                                                value={formData.motivo_desligamento}
                                                onChange={(e) => setFormData({...formData, motivo_desligamento: e.target.value as TerminationReason})}
                                                className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500"
                                            >
                                                <option value="">Selecione um motivo...</option>
                                                {TERMINATION_REASONS.map(reason => (
                                                    <option key={reason.value} value={reason.value}>{reason.value}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Seção: Valores Financeiros */}
                            <div className="border-b pb-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-indigo-600" />
                                    Valores Financeiros
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor Faturamento/h</label>
                                        <input
                                            type="text"
                                            value={formData.valor_faturamento}
                                            onChange={(e) => setFormData({...formData, valor_faturamento: e.target.value})}
                                            placeholder="R$ 0,00"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor Pagamento/h</label>
                                        <input
                                            type="text"
                                            value={formData.valor_pagamento}
                                            onChange={(e) => setFormData({...formData, valor_pagamento: e.target.value})}
                                            placeholder="R$ 0,00"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Seção: Responsáveis Internos */}
                            <div className="border-b pb-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <UserIcon className="w-5 h-5 text-indigo-600" />
                                    Responsáveis Internos
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Analista R&S</label>
                                        <select
                                            value={formData.analista_rs_id}
                                            onChange={(e) => setFormData({...formData, analista_rs_id: e.target.value})}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">Selecione...</option>
                                            {users.filter(u => u.ativo_usuario).map(u => (
                                                <option key={u.id} value={u.id}>{u.nome_usuario}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Gestão de Pessoas</label>
                                        {/* ✅ CORREÇÃO: Mostrar Gestão de Pessoas do Cliente (read-only) */}
                                        <div className="relative">
                                            <select
                                                value={gestaoPessoasDoCliente || ''}
                                                disabled={true}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                                                title="Definido automaticamente pelo Cliente"
                                            >
                                                <option value="">Selecione um cliente primeiro...</option>
                                                {users.filter(u => u.ativo_usuario).map(u => (
                                                    <option key={u.id} value={u.id}>{u.nome_usuario}</option>
                                                ))}
                                            </select>
                                            {gestaoPessoasDoCliente && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    ℹ️ Definido automaticamente pelo cadastro do Cliente
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex justify-end gap-4 pt-6 border-t">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    {editingConsultant ? 'Salvar Alterações' : 'Cadastrar Consultor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Lista de Consultores */}
            <div className="space-y-4">
                {filteredConsultants.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">Nenhum consultor encontrado.</p>
                    </div>
                ) : (
                    filteredConsultants.map(consultant => (
                        <div 
                            key={consultant.id} 
                            className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${!consultant.ativo_consultor ? 'bg-gray-50 border-gray-300' : 'bg-white'}`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-semibold text-gray-900">{consultant.nome_consultores}</h3>
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                                            consultant.ativo_consultor 
                                                ? 'bg-green-100 text-green-700' 
                                                : 'bg-red-100 text-red-700'
                                        }`}>
                                            {consultant.ativo_consultor ? 'Ativo' : 'Inativo'}
                                        </span>
                                        {/* ✅ NOVO: Badge de modalidade */}
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                                            (consultant as any).modalidade_contrato === 'CLT' 
                                                ? 'bg-blue-100 text-blue-700' 
                                                : (consultant as any).modalidade_contrato === 'Temporário'
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-purple-100 text-purple-700'
                                        }`}>
                                            {(consultant as any).modalidade_contrato || 'PJ'}
                                        </span>
                                    </div>
                                    <p className="text-gray-600 mb-2">{consultant.cargo_consultores}</p>
                                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Building2 className="w-4 h-4" />
                                            {getClientName(consultant)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <UserIcon className="w-4 h-4" />
                                            {getManagerName(consultant)}
                                        </span>
                                        {consultant.email_consultor && (
                                            <span className="flex items-center gap-1">
                                                <Mail className="w-4 h-4" />
                                                {consultant.email_consultor}
                                            </span>
                                        )}
                                    </div>
                                    {/* ✅ NOVO: Info de substituição */}
                                    {(consultant as any).nome_substituido && (
                                        <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                                            <RefreshCw className="w-3 h-3" />
                                            Substituindo: {(consultant as any).nome_substituido}
                                        </p>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    {!isReadOnly && !isYearReadOnly && (
                                        <button
                                            onClick={() => { setEditingConsultant(consultant); setIsFormOpen(true); }}
                                            className="px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                                        >
                                            Editar
                                        </button>
                                    )}
                                    {isYearReadOnly && (
                                        <span className="px-3 py-1.5 text-sm bg-gray-100 text-gray-500 rounded-lg flex items-center gap-1">
                                            <Lock className="w-3 h-3" />
                                            Histórico
                                        </span>
                                    )}
                                    <button
                                        onClick={() => toggleCardExpanded(consultant.id)}
                                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        {expandedCards.has(consultant.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            
                            {/* Detalhes Expandidos */}
                            {expandedCards.has(consultant.id) && (
                                <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-500">Data Inclusão</p>
                                        <p className="font-medium">{formatDate(consultant.data_inclusao_consultores)}</p>
                                    </div>
                                    {!consultant.ativo_consultor && consultant.data_saida && (
                                        <div>
                                            <p className="text-gray-500">Data Saída</p>
                                            <p className="font-medium text-red-600">{formatDate(consultant.data_saida)}</p>
                                        </div>
                                    )}
                                    {!consultant.ativo_consultor && consultant.motivo_desligamento && (
                                        <div>
                                            <p className="text-gray-500">Motivo Desligamento</p>
                                            <p className="font-medium text-red-600">{consultant.motivo_desligamento}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-gray-500">Faturamento/h</p>
                                        <p className="font-medium">{formatCurrency(consultant.valor_faturamento)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500">Pagamento/h</p>
                                        <p className="font-medium">{formatCurrency(consultant.valor_pagamento)}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ManageConsultants;
