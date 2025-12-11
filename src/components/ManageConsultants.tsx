import React, { useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantStatus, TerminationReason } from '../components/types';
import InclusionImport from './InclusionImport';

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

const TERMINATION_REASONS: { value: TerminationReason; description: string }[] = [
    { value: 'Baixa Performance Técnica', description: 'Consultor não apresentou a qualidade técnica...' },
    { value: 'Problemas Comportamentais', description: 'Questões comportamentais...' },
    { value: 'Excesso de Faltas e Atrasos', description: 'Faltas e atrasos recorrentes...' },
    { value: 'Baixa Produtividade', description: 'Baixo rendimento...' },
    { value: 'Não Cumprimento de Atividades', description: 'Não execução das atividades...' },
    { value: 'Performance Técnica e Comportamental', description: 'Combinação de problemas...' },
    { value: 'Abandono de Função', description: 'Abandono do posto...' },
    { value: 'Internalizado pelo Cliente', description: 'Cliente contratou...' },
    { value: 'Oportunidade Financeira', description: 'Proposta melhor...' },
    { value: 'Oportunidade de Carreira', description: 'Desenvolvimento...' },
    { value: 'Outros', description: 'Outros motivos...' }
];

const ManageConsultants: React.FC<ManageConsultantsProps> = ({ consultants, usuariosCliente, clients, coordenadoresCliente, users, addConsultant, updateConsultant, currentUser, onNavigateToAtividades }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);

    const [formData, setFormData] = useState({
        ano_vigencia: new Date().getFullYear(),
        nome_consultores: '',
        email_consultor: '',
        celular: '',
        cargo_consultores: '',
        data_inclusao_consultores: '',
        data_saida: '',
        gestor_imediato_id: '',
        coordenador_id: '',
        status: 'Ativo' as ConsultantStatus,
        motivo_desligamento: '' as TerminationReason | '',
        gestor_rs_id: '' as string | number,
        id_gestao_de_pessoas: '' as string | number,
        valor_faturamento: '',
    });

    const isReadOnly = currentUser.tipo_usuario === 'Consulta';
    
    useEffect(() => {
        if (editingConsultant) {
            setFormData({
                ano_vigencia: editingConsultant.ano_vigencia,
                nome_consultores: editingConsultant.nome_consultores,
                email_consultor: editingConsultant.email_consultor || '',
                celular: editingConsultant.celular || '',
                cargo_consultores: editingConsultant.cargo_consultores,
                data_inclusao_consultores: editingConsultant.data_inclusao_consultores,
                data_saida: editingConsultant.data_saida || '',
                gestor_imediato_id: String(editingConsultant.gestor_imediato_id),
                coordenador_id: editingConsultant.coordenador_id ? String(editingConsultant.coordenador_id) : '',
                status: editingConsultant.status,
                motivo_desligamento: editingConsultant.motivo_desligamento || '',
                gestor_rs_id: editingConsultant.gestor_rs_id ? String(editingConsultant.gestor_rs_id) : '',
                id_gestao_de_pessoas: editingConsultant.id_gestao_de_pessoas ? String(editingConsultant.id_gestao_de_pessoas) : '',
                valor_faturamento: editingConsultant.valor_faturamento ? editingConsultant.valor_faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
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
        const dataToSave = {
            ...formData,
            gestor_imediato_id: parseInt(formData.gestor_imediato_id),
            coordenador_id: formData.coordenador_id ? parseInt(formData.coordenador_id) : null,
            motivo_desligamento: formData.motivo_desligamento || undefined,
            data_saida: formData.data_saida || undefined,
            valor_faturamento: formData.valor_faturamento ? parseFloat(formData.valor_faturamento.replace(/[R$\s.]/g, '').replace(',', '.')) : undefined
        };
        
        if (editingConsultant) updateConsultant({ ...editingConsultant, ...dataToSave });
        else addConsultant(dataToSave);
        setIsFormOpen(false);
        setEditingConsultant(null);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingConsultant(null);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {!isReadOnly && <InclusionImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} onImport={addConsultant} />}
            
            <div className="flex justify-between items-center mb-8">
                <h2 className="section-title">Gerenciar Consultores</h2>
                <div className="flex gap-3">
                    {!isReadOnly && (
                        <button 
                            onClick={() => { setEditingConsultant(null); setIsFormOpen(true); }} 
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
                        >
                            + Novo Consultor
                        </button>
                    )}
                </div>
            </div>

            {/* MODAL COM DESIGN PROFISSIONAL */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        {/* HEADER DO MODAL */}
                        <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 px-8 py-6 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900">
                                    {editingConsultant ? '✏️ Editar Consultor' : '➕ Novo Consultor'}
                                </h3>
                                <p className="text-sm text-gray-600 mt-1">Preencha os dados abaixo para {editingConsultant ? 'atualizar' : 'registrar'} o consultor</p>
                            </div>
                            <button 
                                onClick={handleCloseForm}
                                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl font-light"
                            >
                                ✕
                            </button>
                        </div>

                        {/* CONTEÚDO DO FORMULÁRIO */}
                        <div className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                {/* SEÇÃO 1: DADOS PESSOAIS */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-200">
                                        📋 Dados Pessoais
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* Nome */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                Nome <span className="text-red-500">*</span>
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="Nome completo" 
                                                value={formData.nome_consultores} 
                                                onChange={e => setFormData({...formData, nome_consultores: e.target.value})} 
                                                required
                                            />
                                        </div>

                                        {/* Email */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                Email
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="email@exemplo.com" 
                                                type="email" 
                                                value={formData.email_consultor} 
                                                onChange={e => setFormData({...formData, email_consultor: e.target.value})}
                                            />
                                        </div>

                                        {/* Celular */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                📱 Celular
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="(XX) XXXXX-XXXX" 
                                                value={formData.celular} 
                                                onChange={e => setFormData({...formData, celular: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 2: DADOS PROFISSIONAIS */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-200">
                                        💼 Dados Profissionais
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* Cargo */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                Cargo <span className="text-red-500">*</span>
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="Ex: Desenvolvedor, Analista..." 
                                                value={formData.cargo_consultores} 
                                                onChange={e => setFormData({...formData, cargo_consultores: e.target.value})} 
                                                required
                                            />
                                        </div>

                                        {/* Data de Inclusão */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                📅 Data de Inclusão <span className="text-red-500">*</span>
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                type="date" 
                                                value={formData.data_inclusao_consultores} 
                                                onChange={e => setFormData({...formData, data_inclusao_consultores: e.target.value})} 
                                                required
                                            />
                                        </div>

                                        {/* Faturamento */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                💰 Faturamento (R$)
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="Ex: 15.000,00" 
                                                value={formData.valor_faturamento} 
                                                onChange={e => setFormData({...formData, valor_faturamento: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 3: GESTÃO E CLIENTE */}
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-200">
                                        👥 Gestão e Cliente
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* Gestor */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                Gestor <span className="text-red-500">*</span>
                                            </label>
                                            <select 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                                                value={formData.gestor_imediato_id} 
                                                onChange={e => setFormData({...formData, gestor_imediato_id: e.target.value})} 
                                                required
                                            >
                                                <option value="">Selecione um gestor...</option>
                                                {usuariosCliente.filter(u => u.ativo).map(u => <option key={u.id} value={u.id}>{u.nome_gestor_cliente}</option>)}
                                            </select>
                                        </div>

                                        {/* Cliente (Auto-preenchido) */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                Cliente
                                            </label>
                                            <input 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                                                value={(() => {
                                                    const gestor = usuariosCliente.find(u => u.id === parseInt(formData.gestor_imediato_id));
                                                    const cliente = gestor ? clients.find(cl => cl.id === gestor.id_cliente) : null;
                                                    return cliente?.razao_social_cliente || 'Selecionado automaticamente';
                                                })()} 
                                                readOnly 
                                            />
                                        </div>

                                        {/* Status */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-semibold text-gray-700 mb-2">
                                                Status
                                            </label>
                                            <select 
                                                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                                                value={formData.status} 
                                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                                            >
                                                <option value="Ativo">✅ Ativo</option>
                                                <option value="Perdido">⚠️ Perdido</option>
                                                <option value="Encerrado">❌ Encerrado</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 4: DESLIGAMENTO (Condicional) */}
                                {(formData.status === 'Perdido' || formData.status === 'Encerrado') && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                                        <h4 className="text-lg font-semibold text-red-800 mb-4">
                                            ⚠️ Informações de Desligamento
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Data de Saída */}
                                            <div className="flex flex-col">
                                                <label className="text-sm font-semibold text-gray-700 mb-2">
                                                    📅 Data de Saída <span className="text-red-500">*</span>
                                                </label>
                                                <input 
                                                    className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                                                    type="date" 
                                                    value={formData.data_saida} 
                                                    onChange={e => setFormData({...formData, data_saida: e.target.value})} 
                                                    required
                                                />
                                            </div>

                                            {/* Motivo de Desligamento */}
                                            <div className="flex flex-col">
                                                <label className="text-sm font-semibold text-gray-700 mb-2">
                                                    Motivo <span className="text-red-500">*</span>
                                                </label>
                                                <select 
                                                    className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all bg-white"
                                                    value={formData.motivo_desligamento} 
                                                    onChange={e => setFormData({...formData, motivo_desligamento: e.target.value as any})}
                                                    required
                                                >
                                                    <option value="">Selecione um motivo...</option>
                                                    {TERMINATION_REASONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* BOTÕES DE AÇÃO */}
                                <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                                    <button 
                                        type="button" 
                                        onClick={handleCloseForm}
                                        className="px-6 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-all duration-200 font-medium"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        className="px-8 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
                                    >
                                        {editingConsultant ? '💾 Atualizar' : '➕ Criar Consultor'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* TABELA DE CONSULTORES */}
            <div className="mt-8 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                        <tr>
                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Nome</th>
                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Cargo</th>
                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Cliente</th>
                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                            <th className="px-6 py-3 text-center font-semibold text-gray-700">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consultants.map((consultant, idx) => (
                            <tr key={idx} className="border-b border-gray-200 hover:bg-blue-50 transition-colors">
                                <td className="px-6 py-3 text-gray-800">{consultant.nome_consultores}</td>
                                <td className="px-6 py-3 text-gray-600">{consultant.cargo_consultores}</td>
                                <td className="px-6 py-3 text-gray-600">
                                    {clients.find(c => c.id === usuariosCliente.find(u => u.id === consultant.gestor_imediato_id)?.id_cliente)?.razao_social_cliente || '-'}
                                </td>
                                <td className="px-6 py-3">
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                        consultant.status === 'Ativo' ? 'bg-green-100 text-green-800' :
                                        consultant.status === 'Perdido' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                    }`}>
                                        {consultant.status}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                    {!isReadOnly && (
                                        <button 
                                            onClick={() => setEditingConsultant(consultant)}
                                            className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                                        >
                                            Editar
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
};

export default ManageConsultants;
