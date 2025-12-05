import React, { useState, useEffect, useMemo } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantStatus, TerminationReason } from '../src/components/types';
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
    onManualReport?: (text: string) => Promise<void>;
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

const ManageConsultants: React.FC<ManageConsultantsProps> = ({ consultants, usuariosCliente, clients, coordenadoresCliente, users, addConsultant, updateConsultant, currentUser }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
    const [formData, setFormData] = useState({
        ano_vigencia: new Date().getFullYear(),
        nome_consultores: '',
        email_consultor: '',
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

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            {!isReadOnly && <InclusionImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} onImport={addConsultant} />}
            
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Gerenciar Consultores</h2>
                {!isReadOnly && (
                    <button onClick={() => { setEditingConsultant(null); setIsFormOpen(true); }} className="bg-[#533738] text-white px-6 py-3 rounded shadow">+ Novo Consultor</button>
                )}
            </div>

            {isFormOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-3xl w-full">
                        <h3 className="text-xl font-bold mb-4">{editingConsultant ? 'Editar' : 'Novo'} Consultor</h3>
                        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input className="border p-2 rounded w-full" placeholder="Nome" value={formData.nome_consultores} onChange={e => setFormData({...formData, nome_consultores: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input className="border p-2 rounded w-full" placeholder="Email" type="email" value={formData.email_consultor} onChange={e => setFormData({...formData, email_consultor: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                                <input className="border p-2 rounded w-full" placeholder="Cargo" value={formData.cargo_consultores} onChange={e => setFormData({...formData, cargo_consultores: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Data de Inclusão</label>
                                <input className="border p-2 rounded w-full" type="date" value={formData.data_inclusao_consultores} onChange={e => setFormData({...formData, data_inclusao_consultores: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gestor</label>
                                <select className="border p-2 rounded w-full" value={formData.gestor_imediato_id} onChange={e => setFormData({...formData, gestor_imediato_id: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {usuariosCliente.filter(u => u.ativo).map(u => <option key={u.id} value={u.id}>{u.nome_gestor_cliente}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                                <input 
                                    className="border p-2 rounded w-full bg-gray-100" 
                                    value={(() => {
                                        const gestor = usuariosCliente.find(u => u.id === formData.gestor_imediato_id);
                                        const cliente = gestor ? clients.find(cl => cl.id === gestor.id_cliente) : null;
                                        return cliente?.razao_social_cliente || '';
                                    })()} 
                                    readOnly 
                                    placeholder="Selecionado automaticamente pelo Gestor"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Faturamento</label>
                                <input className="border p-2 rounded w-full" placeholder="R$ 0,00" value={formData.valor_faturamento} onChange={e => setFormData({...formData, valor_faturamento: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select className="border p-2 rounded w-full" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                                    <option value="Ativo">Ativo</option>
                                    <option value="Perdido">Perdido</option>
                                    <option value="Encerrado">Encerrado</option>
                                </select>
                            </div>
                            {(formData.status === 'Perdido' || formData.status === 'Encerrado') && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Saída</label>
                                        <input className="border p-2 rounded w-full" type="date" value={formData.data_saida} onChange={e => setFormData({...formData, data_saida: e.target.value})} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de Desligamento</label>
                                        <select className="border p-2 rounded w-full" value={formData.motivo_desligamento} onChange={e => setFormData({...formData, motivo_desligamento: e.target.value as any})}>
                                            <option value="">Selecione...</option>
                                            {TERMINATION_REASONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                            
                            {/* Campo de CV */}
                            <div className="col-span-2 border-t pt-4 mt-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    📎 Currículo (CV)
                                </label>
                                {editingConsultant?.curriculo_url ? (
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded border">
                                        <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/>
                                        </svg>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">
                                                {editingConsultant.curriculo_filename || 'Currículo.pdf'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {editingConsultant.curriculo_uploaded_at 
                                                    ? `Enviado em ${new Date(editingConsultant.curriculo_uploaded_at).toLocaleDateString('pt-BR')}`
                                                    : 'Recuperado do banco de talentos'
                                                }
                                            </p>
                                        </div>
                                        <a 
                                            href={editingConsultant.curriculo_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                                        >
                                            👁️ Ver CV
                                        </a>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-gray-50 rounded border border-dashed border-gray-300 text-center">
                                        <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p className="text-sm text-gray-600 mb-2">Nenhum CV vinculado</p>
                                        <p className="text-xs text-gray-500">
                                            O CV será recuperado automaticamente se o consultor foi aprovado como candidato
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="col-span-2 flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setIsFormOpen(false)} className="bg-gray-300 px-4 py-2 rounded">Cancelar</button>
                                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data de Inclusão</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {consultants.map(c => {
                            const gestor = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                            const cliente = gestor ? clients.find(cl => cl.id === gestor.id_cliente) : null;
                            const dataInclusao = c.data_inclusao_consultores ? new Date(c.data_inclusao_consultores).toLocaleDateString('pt-BR') : '-';
                            
                            return (
                                <tr key={c.id}>
                                    <td className="px-4 py-3">{c.nome_consultores}</td>
                                    <td className="px-4 py-3">{cliente?.razao_social_cliente || '-'}</td>
                                    <td className="px-4 py-3">{c.cargo_consultores}</td>
                                    <td className="px-4 py-3">{dataInclusao}</td>
                                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${c.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{c.status}</span></td>
                                    <td className="px-4 py-3"><button onClick={() => setEditingConsultant(c)} className="text-blue-600">Editar</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ManageConsultants;