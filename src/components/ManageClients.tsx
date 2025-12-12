import React, { useState, useEffect } from 'react';
import { Client, User, UsuarioCliente, CoordenadorCliente, Consultant } from '../components/types';
import { Mail, Phone, Briefcase } from 'lucide-react';
import InclusionImport from './InclusionImport';

interface ManageClientsProps {
    clients: Client[];
    users: User[];
    usuariosCliente: UsuarioCliente[];
    coordenadoresCliente: CoordenadorCliente[];
    consultants: Consultant[];
    addClient: (c: any) => void;
    updateClient: (c: Client) => void;
    addUsuarioCliente: (u: any) => void;
    updateUsuarioCliente: (u: UsuarioCliente) => void;
    addCoordenadorCliente: (c: any) => void;
    updateCoordenadorCliente: (c: CoordenadorCliente) => void;
    currentUser: User;
}

const ManageClients: React.FC<ManageClientsProps> = ({ 
    clients, users, usuariosCliente, coordenadoresCliente, consultants,
    addClient, updateClient, addUsuarioCliente, updateUsuarioCliente,
    addCoordenadorCliente, updateCoordenadorCliente, currentUser
}) => {
    // States for Modals
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
    const [isCoordModalOpen, setIsCoordModalOpen] = useState(false);

    // States for Editing
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [editingManager, setEditingManager] = useState<UsuarioCliente | null>(null);
    const [editingCoord, setEditingCoord] = useState<CoordenadorCliente | null>(null);

    // States for Context (Adding Manager to which Client?)
    const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
    const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);

    // Form Data
    const [clientForm, setClientForm] = useState({ razao_social_cliente: '', id_gestao_comercial: '', id_gestao_de_pessoas: '', id_gestor_rs: '' });
    const [managerForm, setManagerForm] = useState({ nome_gestor_cliente: '', cargo_gestor: '', email_gestor: '', celular_gestor: '' });
    const [coordForm, setCoordForm] = useState({ nome_coordenador_cliente: '', cargo_coordenador_cliente: '', email_coordenador: '', celular_coordenador: '' });

    // --- CLIENTS ---
    const openClientModal = (client?: Client) => {
        if (client) {
            setEditingClient(client);
            setClientForm({
                razao_social_cliente: client.razao_social_cliente,
                id_gestao_comercial: String(client.id_gestao_comercial),
                id_gestao_de_pessoas: String(client.id_gestao_de_pessoas),
                id_gestor_rs: String(client.id_gestor_rs)
            });
        } else {
            setEditingClient(null);
            setClientForm({ razao_social_cliente: '', id_gestao_comercial: '', id_gestao_de_pessoas: '', id_gestor_rs: '' });
        }
        setIsClientModalOpen(true);
    };

    const handleClientSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = {
            ...clientForm,
            id_gestao_comercial: parseInt(clientForm.id_gestao_comercial),
            id_gestao_de_pessoas: parseInt(clientForm.id_gestao_de_pessoas),
            id_gestor_rs: parseInt(clientForm.id_gestor_rs),
            ativo_cliente: true
        };
        if (editingClient) updateClient({ ...editingClient, ...data });
        else addClient(data);
        setIsClientModalOpen(false);
    };

    // --- MANAGERS ---
    const openManagerModal = (clientId: number, manager?: UsuarioCliente) => {
        setSelectedClientId(clientId);
        if (manager && manager.nome_gestor_cliente) {
            setEditingManager(manager);
            setManagerForm({ 
                nome_gestor_cliente: manager.nome_gestor_cliente || '', 
                cargo_gestor: manager.cargo_gestor || '',
                email_gestor: manager.email_gestor || '',
                celular_gestor: manager.celular || ''
            });
        } else {
            setEditingManager(null);
            setManagerForm({ nome_gestor_cliente: '', cargo_gestor: '', email_gestor: '', celular_gestor: '' });
        }
        setIsManagerModalOpen(true);
    };

    const handleManagerSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = { 
            nome_gestor_cliente: managerForm.nome_gestor_cliente,
            cargo_gestor: managerForm.cargo_gestor,
            email_gestor: managerForm.email_gestor,
            celular: managerForm.celular_gestor,
            id_cliente: selectedClientId!, 
            ativo: true, 
            gestor_rs_id: null 
        };
        if (editingManager) updateUsuarioCliente({ ...editingManager, ...data });
        else addUsuarioCliente(data);
        setIsManagerModalOpen(false);
    };

    // --- COORDINATORS ---
    const openCoordModal = (managerId: number, coord?: CoordenadorCliente) => {
        setSelectedManagerId(managerId);
        if (coord && coord.nome_coordenador_cliente) {
            setEditingCoord(coord);
            setCoordForm({ 
                nome_coordenador_cliente: coord.nome_coordenador_cliente || '', 
                cargo_coordenador_cliente: coord.cargo_coordenador_cliente || '',
                email_coordenador: coord.email_coordenador || '',
                celular_coordenador: coord.celular || ''
            });
        } else {
            setEditingCoord(null);
            setCoordForm({ nome_coordenador_cliente: '', cargo_coordenador_cliente: '', email_coordenador: '', celular_coordenador: '' });
        }
        setIsCoordModalOpen(true);
    };

    const handleCoordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = { 
            nome_coordenador_cliente: coordForm.nome_coordenador_cliente,
            cargo_coordenador_cliente: coordForm.cargo_coordenador_cliente,
            email_coordenador: coordForm.email_coordenador,
            celular: coordForm.celular_coordenador,
            id_gestor_cliente: selectedManagerId!, 
            ativo: true 
        };
        if (editingCoord) updateCoordenadorCliente({ ...editingCoord, ...data });
        else addCoordenadorCliente(data);
        setIsCoordModalOpen(false);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#4D5253]">Gestão de Clientes</h2>
                <button onClick={() => openClientModal()} className="bg-[#533738] text-white px-4 py-2 rounded">+ Novo Cliente</button>
            </div>

            <div className="space-y-6">
                {clients.map(client => (
                    <div key={client.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-blue-900">{client.razao_social_cliente}</h3>
                                <p className="text-xs text-gray-500">ID: {client.id}</p>
                                
                                {/* Linha de Gestores */}
                                <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
                                    <div className="flex items-center gap-1">
                                        <Briefcase className="w-4 h-4 text-green-600" />
                                        <span className="font-medium">Gestão Comercial:</span>
                                        <span>{users.find(u => u.id === client.id_gestao_comercial)?.nome_usuario || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Briefcase className="w-4 h-4 text-purple-600" />
                                        <span className="font-medium">Gestão Pessoas:</span>
                                        <span>{users.find(u => u.id === client.id_gestao_de_pessoas)?.nome_usuario || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Briefcase className="w-4 h-4 text-blue-600" />
                                        <span className="font-medium">Focal R&S:</span>
                                        <span>{users.find(u => u.id === client.id_gestor_rs)?.nome_usuario || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-x-2">
                                <button onClick={() => openManagerModal(client.id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm">+ Gestor</button>
                                <button onClick={() => openClientModal(client)} className="text-blue-600 underline text-sm">Editar</button>
                            </div>
                        </div>

                        {/* Managers List */}
                        <div className="pl-4 border-l-2 border-blue-200 space-y-4">
                            {usuariosCliente.filter(u => u.id_cliente === client.id).map(manager => (
                                <div key={manager.id} className="bg-white p-3 rounded shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="font-semibold text-gray-800">{manager.nome_gestor_cliente} <span className="text-xs text-gray-500 font-normal">({manager.cargo_gestor})</span></div>
                                            
                                            {/* Contact Info for Manager */}
                                            <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                                {manager.celular && (
                                                    <a 
                                                        href={`https://wa.me/55${manager.celular.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-gray-700 hover:text-green-600 transition"
                                                    >
                                                        <Phone className="w-4 h-4" />
                                                        <span>{manager.celular}</span>
                                                    </a>
                                                )}
                                                {manager.email_gestor && (
                                                    <a 
                                                        href={`mailto:${manager.email_gestor}`}
                                                        className="flex items-center gap-1 text-gray-700 hover:text-blue-600 transition"
                                                    >
                                                        <Mail className="w-4 h-4" />
                                                        <span>{manager.email_gestor}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-x-2">
                                            <button onClick={() => openCoordModal(manager.id)} className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs">+ Coord</button>
                                            <button onClick={() => openManagerModal(client.id, manager)} className="text-blue-600 text-xs">Editar</button>
                                        </div>
                                    </div>

                                    {/* Coordinators List */}
                                    <div className="mt-2 pl-4 border-l-2 border-purple-200 space-y-2">
                                        {coordenadoresCliente.filter(c => c.id_gestor_cliente === manager.id).map(coord => (
                                            <div key={coord.id} className="flex justify-between items-start text-sm py-1">
                                                <div className="flex-1">
                                                    <span className="font-medium">{coord.nome_coordenador_cliente}</span>
                                                    <span className="text-xs text-gray-500"> ({coord.cargo_coordenador_cliente})</span>
                                                    
                                                    {/* Contact Info for Coordinator */}
                                                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                                        {coord.celular && (
                                                            <a 
                                                                href={`https://wa.me/55${coord.celular.replace(/\D/g, '')}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1 text-gray-700 hover:text-green-600 transition"
                                                            >
                                                                <Phone className="w-3 h-3" />
                                                                <span>{coord.celular}</span>
                                                            </a>
                                                        )}
                                                        {coord.email_coordenador && (
                                                            <a 
                                                                href={`mailto:${coord.email_coordenador}`}
                                                                className="flex items-center gap-1 text-gray-700 hover:text-blue-600 transition"
                                                            >
                                                                <Mail className="w-3 h-3" />
                                                                <span>{coord.email_coordenador}</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                                <button onClick={() => openCoordModal(manager.id, coord)} className="text-blue-600 text-xs whitespace-nowrap">Editar</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* MODAL CLIENT */}
            {isClientModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md">
                        <h3 className="font-bold text-lg mb-4">{editingClient ? 'Editar' : 'Novo'} Cliente</h3>
                        <form onSubmit={handleClientSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
                                <input className="w-full border p-2 rounded" placeholder="Razão Social" value={clientForm.razao_social_cliente} onChange={e => setClientForm({...clientForm, razao_social_cliente: e.target.value})} required />
                            </div>

                            {/* Linha de Gestores com Ícones - Tarefa 2 */}
                            {editingClient && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center gap-3 text-xs">
                                        <div className="flex items-center gap-1">
                                            <Briefcase className="w-4 h-4 text-green-600" />
                                            <span className="font-medium text-gray-700">Gestão Comercial:</span>
                                            <span className="text-gray-600">{users.find(u => u.id === editingClient.id_gestao_comercial)?.nome_usuario || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                        <div className="flex items-center gap-1">
                                            <Briefcase className="w-4 h-4 text-purple-600" />
                                            <span className="font-medium text-gray-700">Gestão Pessoas:</span>
                                            <span className="text-gray-600">{users.find(u => u.id === editingClient.id_gestao_de_pessoas)?.nome_usuario || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                        <div className="flex items-center gap-1">
                                            <Briefcase className="w-4 h-4 text-blue-600" />
                                            <span className="font-medium text-gray-700">Focal R&S:</span>
                                            <span className="text-gray-600">{users.find(u => u.id === editingClient.id_gestor_rs)?.nome_usuario || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">👔 Gestão Comercial</label>
                                <select className="w-full border p-2 rounded" value={clientForm.id_gestao_comercial} onChange={e => setClientForm({...clientForm, id_gestao_comercial: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {users.filter(u => u.tipo_usuario === 'Gestão Comercial' || u.tipo_usuario === 'Administrador').map(u => <option key={u.id} value={u.id}>{u.nome_usuario}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">👥 Gestão de Pessoas</label>
                                <select className="w-full border p-2 rounded" value={clientForm.id_gestao_de_pessoas} onChange={e => setClientForm({...clientForm, id_gestao_de_pessoas: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {users.filter(u => u.tipo_usuario === 'Gestão de Pessoas' || u.tipo_usuario === 'Administrador').map(u => <option key={u.id} value={u.id}>{u.nome_usuario}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">🔍 Focal R&S</label>
                                <select className="w-full border p-2 rounded" value={clientForm.id_gestor_rs} onChange={e => setClientForm({...clientForm, id_gestor_rs: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {users.filter(u => u.tipo_usuario === 'Analista de R&S' || u.tipo_usuario === 'Administrador').map(u => <option key={u.id} value={u.id}>{u.nome_usuario}</option>)}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setIsClientModalOpen(false)} className="bg-gray-300 px-4 py-2 rounded">Cancelar</button>
                                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL MANAGER */}
            {isManagerModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md max-h-96 overflow-y-auto">
                        <h3 className="font-bold text-lg mb-4">{editingManager ? 'Editar' : 'Novo'} Gestor</h3>
                        <form onSubmit={handleManagerSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Gestor</label>
                                <input className="w-full border p-2 rounded" placeholder="Nome" value={managerForm.nome_gestor_cliente} onChange={e => setManagerForm({...managerForm, nome_gestor_cliente: e.target.value})} required />
                                {/* Contatos do Gestor - Tarefa 3 */}
                                {(managerForm.email_gestor || managerForm.celular_gestor) && (
                                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                                        {managerForm.email_gestor && (
                                            <a href={`mailto:${managerForm.email_gestor}`} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition" title="Enviar email">
                                                <Mail className="w-3 h-3" />
                                                <span>{managerForm.email_gestor}</span>
                                            </a>
                                        )}
                                        {managerForm.celular_gestor && (
                                            <a href={`https://wa.me/55${managerForm.celular_gestor.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:text-green-800 transition" title="Abrir WhatsApp">
                                                <Phone className="w-3 h-3" />
                                                <span>{managerForm.celular_gestor}</span>
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                                <input className="w-full border p-2 rounded" placeholder="Cargo" value={managerForm.cargo_gestor} onChange={e => setManagerForm({...managerForm, cargo_gestor: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                <input className="w-full border p-2 rounded" placeholder="E-mail" type="email" value={managerForm.email_gestor} onChange={e => setManagerForm({...managerForm, email_gestor: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                                <input className="w-full border p-2 rounded" placeholder="DDD-99999-9999" value={managerForm.celular_gestor} onChange={e => setManagerForm({...managerForm, celular_gestor: e.target.value})} />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setIsManagerModalOpen(false)} className="bg-gray-300 px-4 py-2 rounded">Cancelar</button>
                                <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL COORDINATOR */}
            {isCoordModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md max-h-96 overflow-y-auto">
                        <h3 className="font-bold text-lg mb-4">{editingCoord ? 'Editar' : 'Novo'} Coordenador</h3>
                        <form onSubmit={handleCoordSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Coordenador</label>
                                <input className="w-full border p-2 rounded" placeholder="Nome" value={coordForm.nome_coordenador_cliente} onChange={e => setCoordForm({...coordForm, nome_coordenador_cliente: e.target.value})} required />
                                {/* Contatos do Coordenador - Tarefa 4 */}
                                {(coordForm.email_coordenador || coordForm.celular_coordenador) && (
                                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                                        {coordForm.email_coordenador && (
                                            <a href={`mailto:${coordForm.email_coordenador}`} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition" title="Enviar email">
                                                <Mail className="w-3 h-3" />
                                                <span>{coordForm.email_coordenador}</span>
                                            </a>
                                        )}
                                        {coordForm.celular_coordenador && (
                                            <a href={`https://wa.me/55${coordForm.celular_coordenador.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:text-green-800 transition" title="Abrir WhatsApp">
                                                <Phone className="w-3 h-3" />
                                                <span>{coordForm.celular_coordenador}</span>
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                                <input className="w-full border p-2 rounded" placeholder="Cargo" value={coordForm.cargo_coordenador_cliente} onChange={e => setCoordForm({...coordForm, cargo_coordenador_cliente: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                <input className="w-full border p-2 rounded" placeholder="E-mail" type="email" value={coordForm.email_coordenador} onChange={e => setCoordForm({...coordForm, email_coordenador: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                                <input className="w-full border p-2 rounded" placeholder="DDD-99999-9999" value={coordForm.celular_coordenador} onChange={e => setCoordForm({...coordForm, celular_coordenador: e.target.value})} />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setIsCoordModalOpen(false)} className="bg-gray-300 px-4 py-2 rounded">Cancelar</button>
                                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageClients;
