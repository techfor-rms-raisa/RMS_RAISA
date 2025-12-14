
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

const TERMINATION_REASONS = [ /* ...reasons */ ];

const ManageConsultants: React.FC<ManageConsultantsProps> = ({ consultants, usuariosCliente, clients, coordenadoresCliente, users, addConsultant, updateConsultant, currentUser, onNavigateToAtividades }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
    const [selectedConsultantFilter, setSelectedConsultantFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [formData, setFormData] = useState({ /* ...initial state */ });

    const isReadOnly = currentUser.tipo_usuario === 'Consulta';

    useEffect(() => {
        if (editingConsultant) {
            const gestor = usuariosCliente.find(u => u.id === editingConsultant.gestor_imediato_id);
            setFormData({
                // ...form data population
            });
            setIsFormOpen(true);
        }
    }, [editingConsultant]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // ...submit logic
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingConsultant(null);
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
                {/* ...novo consultor button */}
            </div>

            {isFormOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    {/* ...modal content */}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                {/* ...filtros */}
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
