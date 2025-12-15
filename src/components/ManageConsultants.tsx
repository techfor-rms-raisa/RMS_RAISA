import React, { useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantStatus, TerminationReason, RiskScore } from '../components/types';
import { Mail, Phone, Search } from 'lucide-react';
import InclusionImport from './InclusionImport';
import ScoreBadge from './ScoreBadge';

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

const TERMINATION_REASONS: TerminationReason[] = [
    { id: 1, motivo: 'Pedido de Demissão' },
    { id: 2, motivo: 'Desempenho Insatisfatório' },
    { id: 3, motivo: 'Redução de Quadro' },
    { id: 4, motivo: 'Encerramento de Projeto' },
    { id: 5, motivo: 'Outros' }
];

const ManageConsultants: React.FC<ManageConsultantsProps> = ({ 
    consultants, 
    usuariosCliente, 
    clients, 
    coordenadoresCliente, 
    users, 
    addConsultant, 
    updateConsultant, 
    currentUser, 
    onNavigateToAtividades 
}) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
    const [selectedConsultantFilter, setSelectedConsultantFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [formData, setFormData] = useState({
        nome_consultores: '',
        email_consultor: '',
        celular: '',
        cargo_consultores: '',
        status: 'Ativo' as ConsultantStatus,
        gestor_imediato_id: 0,
        coordenador_id: 0,
        id_cliente: 0,
        motivo_encerramento: '',
        data_encerramento: ''
    });

    const isReadOnly = currentUser.tipo_usuario === 'Consulta';

    useEffect(() => {
        if (editingConsultant) {
            const gestor = usuariosCliente.find(u => u.id === editingConsultant.gestor_imediato_id);
            setFormData({
                nome_consultores: editingConsultant.nome_consultores,
                email_consultor: editingConsultant.email_consultor || '',
                celular: editingConsultant.celular || '',
                cargo_consultores: editingConsultant.cargo_consultores,
                status: editingConsultant.status,
                gestor_imediato_id: editingConsultant.gestor_imediato_id || 0,
                coordenador_id: editingConsultant.coordenador_id || 0,
                id_cliente: gestor?.id_cliente || 0,
                motivo_encerramento: editingConsultant.motivo_encerramento || '',
                data_encerramento: editingConsultant.data_encerramento || ''
            });
            setIsFormOpen(true);
        }
    }, [editingConsultant, usuariosCliente]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingConsultant) {
            updateConsultant({
                ...editingConsultant,
                ...formData
            });
        } else {
            addConsultant(formData);
        }
        handleCloseForm();
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingConsultant(null);
        setFormData({
            nome_consultores: '',
            email_consultor: '',
            celular: '',
            cargo_consultores: '',
            status: 'Ativo',
            gestor_imediato_id: 0,
            coordenador_id: 0,
            id_cliente: 0,
            motivo_encerramento: '',
            data_encerramento: ''
        });
    };

    const getGestoresPorCliente = (clienteId: string): UsuarioCliente[] => {
        if (!clienteId) return [];
        return usuariosCliente.filter(u => u.id_cliente === parseInt(clienteId) && u.ativo);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {!isReadOnly && <InclusionImport clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} onImport={addConsultant} />}
            
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900">Gerenciar Consultores</h2>
                {!isReadOnly && (
                    <button 
                        onClick={() => { setEditingConsultant(null); setIsFormOpen(true); }}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                    >
                        + Novo Consultor
                    </button>
                )}
            </div>

            {isFormOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-96 overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">{editingConsultant ? 'Editar Consultor' : 'Novo Consultor'}</h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input 
                                    type="text" 
                                    value={formData.nome_consultores} 
                                    onChange={(e) => setFormData({...formData, nome_consultores: e.target.value})} 
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input 
                                    type="email" 
                                    value={formData.email_consultor} 
                                    onChange={(e) => setFormData({...formData, email_consultor: e.target.value})} 
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                                <input 
                                    type="tel" 
                                    value={formData.celular} 
                                    onChange={(e) => setFormData({...formData, celular: e.target.value})} 
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                                <input 
                                    type="text" 
                                    value={formData.cargo_consultores} 
                                    onChange={(e) => setFormData({...formData, cargo_consultores: e.target.value})} 
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                                <select 
                                    value={formData.id_cliente} 
                                    onChange={(e) => setFormData({...formData, id_cliente: parseInt(e.target.value), gestor_imediato_id: 0})} 
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                    required
                                >
                                    <option value="">Selecione um cliente...</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.razao_social_cliente}</option>)}
                                </select>
                            </div>
                            {formData.id_cliente > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gestor</label>
                                    <select 
                                        value={formData.gestor_imediato_id} 
                                        onChange={(e) => setFormData({...formData, gestor_imediato_id: parseInt(e.target.value)})} 
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                        required
                                    >
                                        <option value="">Selecione um gestor...</option>
                                        {getGestoresPorCliente(String(formData.id_cliente)).map(g => <option key={g.id} value={g.id}>{g.nome_gestor_cliente}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select 
                                    value={formData.status} 
                                    onChange={(e) => setFormData({...formData, status: e.target.value as ConsultantStatus})} 
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                >
                                    <option value="Ativo">Ativo</option>
                                    <option value="Perdido">Perdido</option>
                                    <option value="Encerrado">Encerrado</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button 
                                    type="button" 
                                    onClick={handleCloseForm} 
                                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar Cliente:</label>
                    <select 
                        value={selectedClientFilter} 
                        onChange={(e) => setSelectedClientFilter(e.target.value)} 
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    >
                        <option value="all">Todos os Clientes</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.razao_social_cliente}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Consultor:</label>
                    <select 
                        value={selectedConsultantFilter} 
                        onChange={(e) => setSelectedConsultantFilter(e.target.value)} 
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    >
                        <option value="all">Todos os Consultores</option>
                        {consultants.map(c => <option key={c.id} value={c.nome_consultores}>{c.nome_consultores}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pesquisar:</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Digite o nome do consultor..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="w-full border border-gray-300 rounded px-3 py-2 pl-10 text-sm"
                        />
                    </div>
                </div>
            </div>

            <div className="mt-8 space-y-4">
                {consultants
                    .filter(consultant => {
                        if (selectedClientFilter !== 'all') {
                            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
                            if (!gestor || String(gestor.id_cliente) !== selectedClientFilter) return false;
                        }
                        if (selectedConsultantFilter !== 'all' && consultant.nome_consultores !== selectedConsultantFilter) return false;
                        if (searchQuery.trim() !== '' && !consultant.nome_consultores.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                        return true;
                    })
                    .map((consultant, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-gray-50 hover:bg-blue-50 transition-colors">
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-semibold text-gray-800">{consultant.nome_consultores}</h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                        consultant.status === 'Ativo' ? 'bg-green-100 text-green-800' :
                                        consultant.status === 'Perdido' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                    }`}>
                                        {consultant.status}
                                    </span>
                                    <ScoreBadge score={consultant.parecer_final_consultor as RiskScore | null} />
                                </div>
                                <p className="text-sm text-gray-600 mb-1"><span className="font-medium">Cargo:</span> {consultant.cargo_consultores}</p>
                                <p className="text-sm text-gray-600 mb-3"><span className="font-medium">Cliente:</span> {clients.find(c => c.id === usuariosCliente.find(u => u.id === consultant.gestor_imediato_id)?.id_cliente)?.razao_social_cliente || '-'}</p>
                                
                                <div className="flex flex-wrap gap-4 text-sm">
                                    {consultant.email_consultor && (
                                        <a href={`mailto:${consultant.email_consultor}`} className="flex items-center gap-1 text-gray-700 hover:text-blue-600 transition">
                                            <Mail className="w-4 h-4" />
                                            <span>{consultant.email_consultor}</span>
                                        </a>
                                    )}
                                    {consultant.celular && (
                                        <a href={`https://wa.me/55${consultant.celular.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-gray-700 hover:text-green-600 transition">
                                            <Phone className="w-4 h-4" />
                                            <span>{consultant.celular}</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                            <div className="ml-4">
                                {!isReadOnly && (
                                    <button 
                                        onClick={() => setEditingConsultant(consultant)}
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium text-sm"
                                    >
                                        Editar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ManageConsultants;
