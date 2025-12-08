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
        <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            {!isReadOnly && <InclusionImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} onImport={addConsultant} />}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h2 className="section-title">Gerenciar Consultores</h2>
                {!isReadOnly && (
                    <button 
                        onClick={() => { setEditingConsultant(null); setIsFormOpen(true); }} 
                        className="btn"
                        style={{ backgroundColor: '#533738', color: '#ffffff', padding: '12px 24px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                    >
                        + Novo Consultor
                    </button>
                )}
            </div>

            {isFormOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(75, 85, 99, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px', maxWidth: '900px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 className="card-title" style={{ marginBottom: '24px' }}>
                            {editingConsultant ? 'Editar' : 'Novo'} Consultor
                        </h3>
                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label className="label">Nome</label>
                                <input 
                                    className="input"
                                    placeholder="Nome" 
                                    value={formData.nome_consultores} 
                                    onChange={e => setFormData({...formData, nome_consultores: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Email</label>
                                <input 
                                    className="input"
                                    placeholder="Email" 
                                    type="email" 
                                    value={formData.email_consultor} 
                                    onChange={e => setFormData({...formData, email_consultor: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="label">Cargo</label>
                                <input 
                                    className="input"
                                    placeholder="Cargo" 
                                    value={formData.cargo_consultores} 
                                    onChange={e => setFormData({...formData, cargo_consultores: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Data de Inclusão</label>
                                <input 
                                    className="input"
                                    type="date" 
                                    value={formData.data_inclusao_consultores} 
                                    onChange={e => setFormData({...formData, data_inclusao_consultores: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Gestor</label>
                                <select 
                                    className="input"
                                    value={formData.gestor_imediato_id} 
                                    onChange={e => setFormData({...formData, gestor_imediato_id: e.target.value})} 
                                    required
                                >
                                    <option value="">Selecione...</option>
                                    {usuariosCliente.filter(u => u.ativo).map(u => <option key={u.id} value={u.id}>{u.nome_gestor_cliente}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Cliente</label>
                                <input 
                                    className="input"
                                    style={{ backgroundColor: '#f3f4f6' }}
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
                                <label className="label">Faturamento</label>
                                <input 
                                    className="input"
                                    placeholder="R$ 0,00" 
                                    value={formData.valor_faturamento} 
                                    onChange={e => setFormData({...formData, valor_faturamento: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="label">Status</label>
                                <select 
                                    className="input"
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
                                        <label className="label">Data de Saída</label>
                                        <input 
                                            className="input"
                                            type="date" 
                                            value={formData.data_saida} 
                                            onChange={e => setFormData({...formData, data_saida: e.target.value})} 
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="label">Motivo de Desligamento</label>
                                        <select 
                                            className="input"
                                            value={formData.motivo_desligamento} 
                                            onChange={e => setFormData({...formData, motivo_desligamento: e.target.value as any})}
                                        >
                                            <option value="">Selecione...</option>
                                            {TERMINATION_REASONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                            
                            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '16px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                                <button 
                                    type="button" 
                                    onClick={() => { setIsFormOpen(false); setEditingConsultant(null); }} 
                                    className="btn"
                                    style={{ padding: '8px 16px', backgroundColor: '#d1d5db', color: '#1f2937', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="btn"
                                    style={{ padding: '8px 16px', backgroundColor: '#533738', color: '#ffffff', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                            <th style={{ border: '1px solid #e5e7eb', padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Nome</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Cliente</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Cargo</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Data Inclusão</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Status</th>
                            <th style={{ border: '1px solid #e5e7eb', padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consultants.map((c) => {
                            const gestor = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                            const cliente = gestor ? clients.find(cl => cl.id === gestor.id_cliente) : null;
                            const dataInclusao = new Date(c.data_inclusao_consultores).toLocaleDateString('pt-BR');
                            return (
                                <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937', fontFamily: "'Roboto', sans-serif" }}>{c.nome_consultores}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937', fontFamily: "'Roboto', sans-serif" }}>{cliente?.razao_social_cliente || '-'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937', fontFamily: "'Roboto', sans-serif" }}>{c.cargo_consultores}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1f2937', fontFamily: "'Roboto', sans-serif" }}>{dataInclusao}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span className="status-badge" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, backgroundColor: c.status === 'Ativo' ? '#dcfce7' : '#fee2e2', color: c.status === 'Ativo' ? '#166534' : '#991b1b' }}>
                                            {c.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => setEditingConsultant(c)} 
                                                style={{ color: '#2563eb', cursor: 'pointer', border: 'none', backgroundColor: 'transparent', fontSize: '14px', fontWeight: 500, fontFamily: "'Roboto', sans-serif" }}
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
