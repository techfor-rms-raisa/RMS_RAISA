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
            
            <div className="flex justify-between items-center mb-8">
                <h2 className="section-title">Gerenciar Consultores</h2>
                {!isReadOnly && (
                    <button 
                        onClick={() => { setEditingConsultant(null); setIsFormOpen(true); }} 
                        className="bg-[#533738] text-white px-6 py-3 rounded shadow hover:bg-[#6b4546] transition-colors btn"
                    >
                        + Novo Consultor
                    </button>
                )}
            </div>

            {isFormOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="card-title mb-6">
                            {editingConsultant ? 'Editar' : 'Novo'} Consultor
                        </h3>
                        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block mb-1">Nome</label>
                                <input 
                                    className="border p-2 rounded w-full" 
                                    placeholder="Nome" 
                                    value={formData.nome_consultores} 
                                    onChange={e => setFormData({...formData, nome_consultores: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="block mb-1">Email</label>
                                <input 
                                    className="border p-2 rounded w-full" 
                                    placeholder="Email" 
                                    type="email" 
                                    value={formData.email_consultor} 
                                    onChange={e => setFormData({...formData, email_consultor: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block mb-1">Cargo</label>
                                <input 
                                    className="border p-2 rounded w-full" 
                                    placeholder="Cargo" 
                                    value={formData.cargo_consultores} 
                                    onChange={e => setFormData({...formData, cargo_consultores: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="block mb-1">Data de Inclusão</label>
                                <input 
                                    className="border p-2 rounded w-full" 
                                    type="date" 
                                    value={formData.data_inclusao_consultores} 
                                    onChange={e => setFormData({...formData, data_inclusao_consultores: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="block mb-1">Gestor</label>
                                <select 
                                    className="border p-2 rounded w-full" 
                                    value={formData.gestor_imediato_id} 
                                    onChange={e => setFormData({...formData, gestor_imediato_id: e.target.value})} 
                                    required
                                >
                                    <option value="">Selecione...</option>
                                    {usuariosCliente.filter(u => u.ativo).map(u => <option key={u.id} value={u.id}>{u.nome_gestor_cliente}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block mb-1">Cliente</label>
                                <input 
                                    className="border p-2 rounded w-full bg-gray-100" 
                                    value={(() => {
                                        const gestor = usuariosCliente.find(u => u.id === parseInt(formData.gestor_imediato_id));
                                        const cliente = gestor ? clients.find(cl => cl.id === gestor.id_cliente) : null;
                                        return cliente?.razao_social_cliente || '';
                                    })()} 
                                    readOnly 
                                    placeholder="Selecionado automaticamente pelo Gestor"
                                />
                            </div>
                            <div>
                                <label className="block mb-1">Faturamento</label>
                                <input 
                                    className="border p-2 rounded w-full" 
                                    placeholder="R$ 0,00" 
                                    value={formData.valor_faturamento} 
                                    onChange={e => setFormData({...formData, valor_faturamento: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block mb-1">Status</label>
                                <select 
                                    className="border p-2 rounded w-full" 
                                    value={formData.status} 
                                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                                >
                                    <option value="Ativo">Ativo</option>
                                    <option value="Perdido">Perdido</option>
                                    <option value="Encerrado">Encerrado</option>
                                </select>
                            </div>
                            {(formData.status === 'Perdido' || formData.status === 'Encerrado') && (
                                <>
                                    <div>
                                        <label className="block mb-1">Data de Saída</label>
                                        <input 
                                            className="border p-2 rounded w-full" 
                                            type="date" 
                                            value={formData.data_saida} 
                                            onChange={e => setFormData({...formData, data_saida: e.target.value})} 
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block mb-1">Motivo de Desligamento</label>
                                        <select 
                                            className="border p-2 rounded w-full" 
                                            value={formData.motivo_desligamento} 
                                            onChange={e => setFormData({...formData, motivo_desligamento: e.target.value as any})}
                                        >
                                            <option value="">Selecione...</option>
                                            {TERMINATION_REASONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                            
                            <div className="col-span-2 flex gap-4 justify-end pt-4 border-t">
                                <button 
                                    type="button" 
                                    onClick={() => { setIsFormOpen(false); setEditingConsultant(null); }} 
                                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition-colors btn"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-[#533738] text-white rounded hover:bg-[#6b4546] transition-colors btn"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border px-4 py-3 text-left">Nome</th>
                            <th className="border px-4 py-3 text-left">Cliente</th>
                            <th className="border px-4 py-3 text-left">Cargo</th>
                            <th className="border px-4 py-3 text-left">Data Inclusão</th>
                            <th className="border px-4 py-3 text-left">Status</th>
                            <th className="border px-4 py-3 text-left">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consultants.map((c) => {
                            const gestor = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                            const cliente = gestor ? clients.find(cl => cl.id === gestor.id_cliente) : null;
                            const dataInclusao = new Date(c.data_inclusao_consultores).toLocaleDateString('pt-BR');
                            return (
                                <tr key={c.id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-3">{c.nome_consultores}</td>
                                    <td className="px-4 py-3">{cliente?.razao_social_cliente || '-'}</td>
                                    <td className="px-4 py-3">{c.cargo_consultores}</td>
                                    <td className="px-4 py-3">{dataInclusao}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs status-badge ${c.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {c.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setEditingConsultant(c)} 
                                                className="text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                Editar
                                            </button>
                                        </div>
                                    </td>
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
