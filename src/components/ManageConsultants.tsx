import React, { useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantStatus, TerminationReason } from '@/types';
import { Mail, Phone, Search, Building2, Calendar, CreditCard, User as UserIcon, Briefcase, DollarSign, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import InclusionImport from './InclusionImport';
import ConsultantCSVImport from './ConsultantCSVImport';

interface ManageConsultantsProps {
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    clients: Client[];
    coordenadoresCliente: CoordenadorCliente[];
    users: User[];
    addConsultant: (c: any) => void;
    batchAddConsultants?: (consultants: any[]) => void;
    updateConsultant: (c: Consultant) => void;
    currentUser: User;
    onNavigateToAtividades: () => void;
}

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
    addConsultant, batchAddConsultants, updateConsultant, currentUser, onNavigateToAtividades 
}) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
    const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
    
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
    const [selectedConsultantFilter, setSelectedConsultantFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

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
    });

    const isReadOnly = currentUser.tipo_usuario === 'Consulta';

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
            setFormData({
                ano_vigencia: editingConsultant.ano_vigencia,
                nome_consultores: editingConsultant.nome_consultores,
                email_consultor: editingConsultant.email_consultor || '',
                celular: editingConsultant.celular || '',
                cpf: editingConsultant.cpf || '',
                cargo_consultores: editingConsultant.cargo_consultores,
                especialidade: editingConsultant.especialidade || '',
                data_inclusao_consultores: editingConsultant.data_inclusao_consultores ? editingConsultant.data_inclusao_consultores.split('T')[0] : '',
                data_saida: editingConsultant.data_saida ? editingConsultant.data_saida.split('T')[0] : '',
                dt_aniversario: editingConsultant.dt_aniversario ? editingConsultant.dt_aniversario.split('T')[0] : '',
                id_cliente: gestor ? String(gestor.id_cliente) : '',
                gestor_imediato_id: String(editingConsultant.gestor_imediato_id),
                coordenador_id: editingConsultant.coordenador_id ? String(editingConsultant.coordenador_id) : '',
                status: editingConsultant.status,
                motivo_desligamento: editingConsultant.motivo_desligamento || '',
                ativo_consultor: editingConsultant.ativo_consultor !== false,
                analista_rs_id: editingConsultant.analista_rs_id ? String(editingConsultant.analista_rs_id) : '',
                id_gestao_de_pessoas: editingConsultant.id_gestao_de_pessoas ? String(editingConsultant.id_gestao_de_pessoas) : '',
                valor_faturamento: editingConsultant.valor_faturamento ? String(editingConsultant.valor_faturamento) : '',
                valor_pagamento: editingConsultant.valor_pagamento ? String(editingConsultant.valor_pagamento) : '',
                cnpj_consultor: editingConsultant.cnpj_consultor || '',
                empresa_consultor: editingConsultant.empresa_consultor || '',
            });
            setIsFormOpen(true);
        }
    }, [editingConsultant]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((formData.status === 'Perdido' || formData.status === 'Encerrado') && !formData.motivo_desligamento) {
            alert("Selecione um Motivo de Desligamento.");
            return;
        }

        const parseMoneyBR = (value: string): number | null => {
            if (!value) return null;
            const cleaned = value.replace(/[^\d,.-]/g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        };

        const dataToSave = {
            ...formData,
            id_cliente: undefined,
            gestor_imediato_id: parseInt(formData.gestor_imediato_id),
            coordenador_id: formData.coordenador_id ? parseInt(formData.coordenador_id) : null,
            analista_rs_id: formData.analista_rs_id ? parseInt(String(formData.analista_rs_id)) : null,
            id_gestao_de_pessoas: formData.id_gestao_de_pessoas ? parseInt(String(formData.id_gestao_de_pessoas)) : null,
            valor_faturamento: parseMoneyBR(formData.valor_faturamento),
            valor_pagamento: parseMoneyBR(formData.valor_pagamento),
            data_saida: formData.data_saida || null,
            dt_aniversario: formData.dt_aniversario || null,
            cnpj_consultor: formData.cnpj_consultor || null,
            empresa_consultor: formData.empresa_consultor || null,
            especialidade: formData.especialidade || null,
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
        });
    };

    const filteredGestores = formData.id_cliente 
        ? usuariosCliente.filter(u => String(u.id_cliente) === formData.id_cliente && u.ativo !== false) : [];
    const filteredCoordenadores = formData.gestor_imediato_id 
        ? coordenadoresCliente.filter(c => String(c.id_gestor_cliente) === formData.gestor_imediato_id && c.ativo !== false) : [];

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

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {!isReadOnly && <InclusionImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} onImport={addConsultant} />}
            {!isReadOnly && batchAddConsultants && (
                <ConsultantCSVImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} users={users} onImportBatch={batchAddConsultants} />
            )}

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900">Gerenciar Consultores</h2>
                {!isReadOnly && (
                    <button onClick={() => { setEditingConsultant(null); resetForm(); setIsFormOpen(true); }}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-md">
                        + Novo Consultor
                    </button>
                )}
            </div>

            {/* MODAL DO FORMULÁRIO */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative bg-white rounded-2xl shadow-2xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden">
                        <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">➕</span>
                                <div>
                                    <h3 className="text-xl font-bold text-white">{editingConsultant ? 'Editar Consultor' : 'Novo Consultor'}</h3>
                                    <p className="text-blue-100 text-sm">Preencha os dados abaixo para registrar o consultor</p>
                                </div>
                            </div>
                            <button onClick={resetForm} className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition-all">✕</button>
                        </div>

                        <div className="p-8 overflow-y-auto max-h-[calc(90vh-120px)]">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                {/* SEÇÃO 1: DADOS PESSOAIS */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-200 flex items-center gap-2">
                                        <UserIcon className="w-5 h-5 text-blue-600" /> Dados Pessoais
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Nome <span className="text-red-500">*</span></label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nome completo" value={formData.nome_consultores} onChange={e => setFormData({...formData, nome_consultores: e.target.value})} required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Email</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="email@exemplo.com" type="email" value={formData.email_consultor} onChange={e => setFormData({...formData, email_consultor: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">📱 Celular</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="(XX) XXXXX-XXXX" value={formData.celular} onChange={e => setFormData({...formData, celular: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">🆔 C.P.F.</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="000.000.000-00" value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">🎂 Data de Nascimento</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" type="date" value={formData.dt_aniversario} onChange={e => setFormData({...formData, dt_aniversario: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 2: DADOS PJ */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-purple-200 flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-purple-600" /> Dados PJ (Pessoa Jurídica)
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">CNPJ</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="00.000.000/0001-00" value={formData.cnpj_consultor} onChange={e => setFormData({...formData, cnpj_consultor: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Razão Social / Empresa</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Nome da empresa PJ" value={formData.empresa_consultor} onChange={e => setFormData({...formData, empresa_consultor: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 3: DADOS PROFISSIONAIS */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-green-200 flex items-center gap-2">
                                        <Briefcase className="w-5 h-5 text-green-600" /> Dados Profissionais
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Cargo <span className="text-red-500">*</span></label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: Desenvolvedor, Analista..." value={formData.cargo_consultores} onChange={e => setFormData({...formData, cargo_consultores: e.target.value})} required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Especialidade</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: React, Node.js, SAP..." value={formData.especialidade} onChange={e => setFormData({...formData, especialidade: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">📅 Data de Inclusão <span className="text-red-500">*</span></label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" type="date" value={formData.data_inclusao_consultores} onChange={e => setFormData({...formData, data_inclusao_consultores: e.target.value})} required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Ano Vigência</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" type="number" min="2020" max="2030" value={formData.ano_vigencia} onChange={e => setFormData({...formData, ano_vigencia: parseInt(e.target.value)})} />
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 4: VALORES FINANCEIROS */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-yellow-200 flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-yellow-600" /> Valores Financeiros
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">💰 Valor Faturamento (R$)</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" placeholder="Ex: 15000.00" value={formData.valor_faturamento} onChange={e => setFormData({...formData, valor_faturamento: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">💵 Valor Pagamento (R$)</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" placeholder="Ex: 11694.48" value={formData.valor_pagamento} onChange={e => setFormData({...formData, valor_pagamento: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 5: CLIENTE E GESTÃO */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-indigo-200 flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-indigo-600" /> Cliente e Gestão
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Cliente <span className="text-red-500">*</span></label>
                                            <select className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" value={formData.id_cliente} onChange={e => {
                                                const selectedClient = clients.find(c => String(c.id) === e.target.value);
                                                setFormData({...formData, id_cliente: e.target.value, gestor_imediato_id: '', coordenador_id: '',
                                                    analista_rs_id: selectedClient?.id_gestor_rs ? String(selectedClient.id_gestor_rs) : '',
                                                    id_gestao_de_pessoas: selectedClient?.id_gestao_de_pessoas ? String(selectedClient.id_gestao_de_pessoas) : '',
                                                });
                                            }} required>
                                                <option value="">Selecione o Cliente...</option>
                                                {clients.filter(c => c.ativo_cliente).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente)).map(client => (
                                                    <option key={client.id} value={String(client.id)}>{client.razao_social_cliente}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Gestor Imediato <span className="text-red-500">*</span></label>
                                            <select className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-gray-100" value={formData.gestor_imediato_id} onChange={e => setFormData({...formData, gestor_imediato_id: e.target.value, coordenador_id: ''})} required disabled={!formData.id_cliente}>
                                                <option value="">Selecione o Gestor...</option>
                                                {filteredGestores.map(gestor => (<option key={gestor.id} value={String(gestor.id)}>{gestor.nome_gestor_cliente}</option>))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Coordenador</label>
                                            <select className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-gray-100" value={formData.coordenador_id} onChange={e => setFormData({...formData, coordenador_id: e.target.value})} disabled={!formData.gestor_imediato_id}>
                                                <option value="">Nenhum / Não aplicável</option>
                                                {filteredCoordenadores.map(coord => (<option key={coord.id} value={String(coord.id)}>{coord.nome_coordenador_cliente}</option>))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 6: STATUS E DESLIGAMENTO */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-red-200 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-600" /> Status e Desligamento
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Status</label>
                                            <select className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as ConsultantStatus})}>
                                                <option value="Ativo">Ativo</option>
                                                <option value="Perdido">Perdido</option>
                                                <option value="Encerrado">Encerrado</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={formData.ativo_consultor} onChange={e => setFormData({...formData, ativo_consultor: e.target.checked})} className="w-5 h-5 text-green-600 rounded focus:ring-green-500" />
                                                <span className="text-sm font-medium text-gray-700">Consultor Ativo</span>
                                            </label>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Data de Saída</label>
                                            <input className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" type="date" value={formData.data_saida} onChange={e => setFormData({...formData, data_saida: e.target.value})} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">Motivo Desligamento {(formData.status === 'Perdido' || formData.status === 'Encerrado') && <span className="text-red-500">*</span>}</label>
                                            <select className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" value={formData.motivo_desligamento} onChange={e => setFormData({...formData, motivo_desligamento: e.target.value as TerminationReason})}>
                                                <option value="">Selecione...</option>
                                                {TERMINATION_REASONS.map(reason => (<option key={reason.value} value={reason.value}>{reason.value}</option>))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                                    <button type="button" onClick={resetForm} className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">Cancelar</button>
                                    <button type="submit" className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md">
                                        {editingConsultant ? 'Salvar Alterações' : 'Cadastrar Consultor'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* FILTROS */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar Cliente:</label>
                        <select value={selectedClientFilter} onChange={e => { setSelectedClientFilter(e.target.value); setSelectedConsultantFilter('all'); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                            <option value="all">Todos os Clientes</option>
                            {clients.filter(c => c.ativo_cliente).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente)).map(client => (
                                <option key={client.id} value={String(client.id)}>{client.razao_social_cliente}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Consultor:</label>
                        <select value={selectedConsultantFilter} onChange={e => setSelectedConsultantFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                            <option value="all">Todos os Consultores</option>
                            {consultants.filter(c => c.status === 'Ativo').filter(c => {
                                if (selectedClientFilter !== 'all') {
                                    const gestor = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                                    return gestor && String(gestor.id_cliente) === selectedClientFilter;
                                }
                                return true;
                            }).sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores)).map((consultant, idx) => (
                                <option key={idx} value={consultant.nome_consultores}>{consultant.nome_consultores}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Pesquisar:</label>
                        <div className="relative">
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Digite o nome do consultor..." className="w-full border border-gray-300 rounded-lg px-3 py-2 pl-10 focus:ring-2 focus:ring-blue-500" />
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                </div>
            </div>

            {/* LISTA DE CONSULTORES - CARDS */}
            <div className="mt-8 space-y-4">
                {consultants.filter(consultant => {
                    if (selectedClientFilter !== 'all') {
                        const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
                        if (!gestor || String(gestor.id_cliente) !== selectedClientFilter) return false;
                    }
                    if (selectedConsultantFilter !== 'all') { if (consultant.nome_consultores !== selectedConsultantFilter) return false; }
                    if (searchQuery.trim() !== '') { return consultant.nome_consultores.toLowerCase().includes(searchQuery.toLowerCase()); }
                    return true;
                }).map((consultant) => {
                    const isExpanded = expandedCards.has(consultant.id);
                    const coordName = getCoordinatorName(consultant);
                    
                    return (
                        <div key={consultant.id} className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                            <div className="p-4 cursor-pointer flex justify-between items-start bg-gradient-to-r from-gray-50 to-white" onClick={() => toggleCardExpanded(consultant.id)}>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-gray-800">{consultant.nome_consultores}</h3>
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${consultant.status === 'Ativo' ? 'bg-green-100 text-green-800' : consultant.status === 'Perdido' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{consultant.status}</span>
                                        {consultant.ativo_consultor === false && (<span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">Inativo</span>)}
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm text-gray-600">
                                        <p><span className="font-medium">Cargo:</span> {consultant.cargo_consultores}</p>
                                        <p><span className="font-medium">Cliente:</span> {getClientName(consultant)}</p>
                                        <p><span className="font-medium">Gestor:</span> {getManagerName(consultant)}</p>
                                        {coordName && <p><span className="font-medium">Coord:</span> {coordName}</p>}
                                    </div>
                                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                                        {consultant.email_consultor && (<a href={`mailto:${consultant.email_consultor}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:text-blue-800"><Mail className="w-4 h-4" /><span>{consultant.email_consultor}</span></a>)}
                                        {consultant.celular && (<a href={`https://wa.me/55${consultant.celular.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-green-600 hover:text-green-800"><Phone className="w-4 h-4" /><span>{consultant.celular}</span></a>)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    {!isReadOnly && (<button onClick={(e) => { e.stopPropagation(); setEditingConsultant(consultant); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">Editar</button>)}
                                    <button className="p-2 text-gray-500 hover:text-gray-700">{isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t bg-gray-50 p-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="bg-white p-4 rounded-lg border">
                                                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><UserIcon className="w-4 h-4 text-blue-600" /> Dados Pessoais</h4>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div><span className="text-gray-500">CPF:</span> <span className="font-medium">{consultant.cpf || '-'}</span></div>
                                                    <div><span className="text-gray-500">Aniversário:</span> <span className="font-medium">{formatDate(consultant.dt_aniversario)}</span></div>
                                                    <div><span className="text-gray-500">Email:</span> <span className="font-medium">{consultant.email_consultor || '-'}</span></div>
                                                    <div><span className="text-gray-500">Celular:</span> <span className="font-medium">{consultant.celular || '-'}</span></div>
                                                </div>
                                            </div>
                                            {(consultant.cnpj_consultor || consultant.empresa_consultor) && (
                                                <div className="bg-white p-4 rounded-lg border">
                                                    <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-purple-600" /> Dados PJ</h4>
                                                    <div className="grid grid-cols-1 gap-3 text-sm">
                                                        <div><span className="text-gray-500">CNPJ:</span> <span className="font-medium">{consultant.cnpj_consultor || '-'}</span></div>
                                                        <div><span className="text-gray-500">Empresa:</span> <span className="font-medium">{consultant.empresa_consultor || '-'}</span></div>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="bg-white p-4 rounded-lg border">
                                                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Briefcase className="w-4 h-4 text-green-600" /> Dados Profissionais</h4>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div><span className="text-gray-500">Cargo:</span> <span className="font-medium">{consultant.cargo_consultores}</span></div>
                                                    <div><span className="text-gray-500">Especialidade:</span> <span className="font-medium">{consultant.especialidade || '-'}</span></div>
                                                    <div><span className="text-gray-500">Data Inclusão:</span> <span className="font-medium">{formatDate(consultant.data_inclusao_consultores)}</span></div>
                                                    <div><span className="text-gray-500">Ano Vigência:</span> <span className="font-medium">{consultant.ano_vigencia}</span></div>
                                                    {consultant.data_saida && (<div><span className="text-gray-500">Data Saída:</span> <span className="font-medium text-red-600">{formatDate(consultant.data_saida)}</span></div>)}
                                                    {consultant.motivo_desligamento && (<div className="col-span-2"><span className="text-gray-500">Motivo:</span> <span className="font-medium text-red-600">{consultant.motivo_desligamento}</span></div>)}
                                                </div>
                                            </div>
                                            <div className="bg-white p-4 rounded-lg border">
                                                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-yellow-600" /> Valores Financeiros</h4>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div><span className="text-gray-500">Faturamento:</span> <span className="font-medium text-green-600">{formatCurrency(consultant.valor_faturamento)}</span></div>
                                                    <div><span className="text-gray-500">Pagamento:</span> <span className="font-medium text-blue-600">{formatCurrency(consultant.valor_pagamento)}</span></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white p-4 rounded-lg border">
                                            <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-600" /> Score de Risco - Pareceres Mensais</h4>
                                            <div className="flex flex-wrap gap-2 justify-center mb-4">
                                                <ScoreBadge score={consultant.parecer_1_consultor} label="P1" />
                                                <ScoreBadge score={consultant.parecer_2_consultor} label="P2" />
                                                <ScoreBadge score={consultant.parecer_3_consultor} label="P3" />
                                                <ScoreBadge score={consultant.parecer_4_consultor} label="P4" />
                                                <ScoreBadge score={consultant.parecer_5_consultor} label="P5" />
                                                <ScoreBadge score={consultant.parecer_6_consultor} label="P6" />
                                                <ScoreBadge score={consultant.parecer_7_consultor} label="P7" />
                                                <ScoreBadge score={consultant.parecer_8_consultor} label="P8" />
                                                <ScoreBadge score={consultant.parecer_9_consultor} label="P9" />
                                                <ScoreBadge score={consultant.parecer_10_consultor} label="P10" />
                                                <ScoreBadge score={consultant.parecer_11_consultor} label="P11" />
                                                <ScoreBadge score={consultant.parecer_12_consultor} label="P12" />
                                            </div>
                                            <div className="flex justify-center">
                                                <div className={`px-6 py-3 rounded-xl border-2 ${consultant.parecer_final_consultor === null || consultant.parecer_final_consultor === undefined ? 'bg-gray-100 border-gray-300 text-gray-500' : consultant.parecer_final_consultor >= 8 ? 'bg-green-100 border-green-400 text-green-700' : consultant.parecer_final_consultor >= 6 ? 'bg-yellow-100 border-yellow-400 text-yellow-700' : consultant.parecer_final_consultor >= 4 ? 'bg-orange-100 border-orange-400 text-orange-700' : 'bg-red-100 border-red-400 text-red-700'}`}>
                                                    <div className="text-xs font-medium opacity-70 text-center">SCORE FINAL</div>
                                                    <div className="text-3xl font-bold text-center">{consultant.parecer_final_consultor ?? '-'}</div>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex justify-center gap-4 text-xs">
                                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500"></div><span>8-10 Ótimo</span></div>
                                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500"></div><span>6-7 Bom</span></div>
                                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500"></div><span>4-5 Atenção</span></div>
                                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500"></div><span>0-3 Crítico</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ManageConsultants;
