import React, { useState } from 'react';
import { Client, User, UsuarioCliente, CoordenadorCliente, Consultant } from '../components/types';
import { Mail, Phone, Briefcase } from 'lucide-react';
import { GestaoPessoasIcon } from './icons/GestaoPessoasIcon';
import { FocalRSIcon } from './icons/FocalRSIcon';
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

// ============================================
// TIPOS AUXILIARES PARA PAYLOADS
// ============================================

/**
 * Payload para criar um novo Gestor de Cliente
 * Contém apenas os campos necessários para INSERT
 */
interface CreateManagerPayload {
    id_cliente: number;
    nome_gestor_cliente: string;
    cargo_gestor: string;
    email_gestor?: string;
    celular?: string;
    ativo: boolean;
    analista_rs_id: null;
}

/**
 * Payload para atualizar um Gestor existente
 * Contém apenas os campos editáveis (partial update)
 */
interface UpdateManagerPayload {
    id: number; // Identificador obrigatório para UPDATE
    nome_gestor_cliente: string;
    cargo_gestor: string;
    email_gestor?: string;
    celular?: string;
}

/**
 * Payload para criar um novo Coordenador
 */
interface CreateCoordinatorPayload {
    id_gestor_cliente: number;
    nome_coordenador_cliente: string;
    cargo_coordenador_cliente: string;
    email_coordenador?: string;
    celular?: string;
    ativo: boolean;
}

/**
 * Payload para atualizar um Coordenador existente
 */
interface UpdateCoordinatorPayload {
    id: number; // Identificador obrigatório para UPDATE
    nome_coordenador_cliente: string;
    cargo_coordenador_cliente: string;
    email_coordenador?: string;
    celular?: string;
}

// ============================================
// FUNÇÕES AUXILIARES PARA CRIAR PAYLOADS
// ============================================

/**
 * Cria payload para INSERT de novo Gestor
 * Garante que apenas campos necessários sejam enviados
 */
const createManagerPayload = (
    clientId: number,
    formData: { nome_gestor_cliente: string; cargo_gestor: string; email_gestor: string; celular_gestor: string }
): CreateManagerPayload => ({
    id_cliente: clientId,
    nome_gestor_cliente: formData.nome_gestor_cliente.trim(),
    cargo_gestor: formData.cargo_gestor.trim(),
    email_gestor: formData.email_gestor.trim() || undefined,
    celular: formData.celular_gestor.trim() || undefined,
    ativo: true,
    analista_rs_id: null
});

/**
 * Cria payload para UPDATE de Gestor existente (partial update)
 * Envia apenas campos editáveis, preservando dados não editáveis
 */
const updateManagerPayload = (
    managerId: number,
    formData: { nome_gestor_cliente: string; cargo_gestor: string; email_gestor: string; celular_gestor: string }
): UpdateManagerPayload => ({
    id: managerId,
    nome_gestor_cliente: formData.nome_gestor_cliente.trim(),
    cargo_gestor: formData.cargo_gestor.trim(),
    email_gestor: formData.email_gestor.trim() || undefined,
    celular: formData.celular_gestor.trim() || undefined
});

/**
 * Cria payload para INSERT de novo Coordenador
 */
const createCoordinatorPayload = (
    managerId: number,
    formData: { nome_coordenador_cliente: string; cargo_coordenador_cliente: string; email_coordenador: string; celular_coordenador: string }
): CreateCoordinatorPayload => ({
    id_gestor_cliente: managerId,
    nome_coordenador_cliente: formData.nome_coordenador_cliente.trim(),
    cargo_coordenador_cliente: formData.cargo_coordenador_cliente.trim(),
    email_coordenador: formData.email_coordenador.trim() || undefined,
    celular: formData.celular_coordenador.trim() || undefined,
    ativo: true
});

/**
 * Cria payload para UPDATE de Coordenador existente (partial update)
 */
const updateCoordinatorPayload = (
    coordinatorId: number,
    formData: { nome_coordenador_cliente: string; cargo_coordenador_cliente: string; email_coordenador: string; celular_coordenador: string }
): UpdateCoordinatorPayload => ({
    id: coordinatorId,
    nome_coordenador_cliente: formData.nome_coordenador_cliente.trim(),
    cargo_coordenador_cliente: formData.cargo_coordenador_cliente.trim(),
    email_coordenador: formData.email_coordenador.trim() || undefined,
    celular: formData.celular_coordenador.trim() || undefined
});

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

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
            razao_social_cliente: clientForm.razao_social_cliente,
            id_gestao_comercial: parseInt(clientForm.id_gestao_comercial),
            id_gestao_de_pessoas: parseInt(clientForm.id_gestao_de_pessoas),
            id_gestor_rs: parseInt(clientForm.id_gestor_rs),
            ativo_cliente: true
        };
        
        if (editingClient) {
            // PARTIAL UPDATE: Mescla dados antigos com novos (apenas campos editáveis)
            updateClient({ ...editingClient, ...data });
        } else {
            // CREATE: Envia dados completos
            addClient(data);
        }
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
        
        if (!selectedClientId) {
            console.error('Erro: ID do cliente não foi definido');
            return;
        }

        if (editingManager) {
            // PARTIAL UPDATE: Envia apenas campos editáveis + ID
            const payload = updateManagerPayload(editingManager.id, managerForm);
            // Mescla com dados originais para preservar campos não editáveis
            const updatedManager: UsuarioCliente = {
                ...editingManager,
                ...payload
            };
            updateUsuarioCliente(updatedManager);
        } else {
            // CREATE: Envia dados completos para novo gestor
            const payload = createManagerPayload(selectedClientId, managerForm);
            addUsuarioCliente(payload);
        }
        
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
        
        if (!selectedManagerId) {
            console.error('Erro: ID do gestor não foi definido');
            return;
        }

        if (editingCoord) {
            // PARTIAL UPDATE: Envia apenas campos editáveis + ID
            const payload = updateCoordinatorPayload(editingCoord.id, coordForm);
            // Mescla com dados originais para preservar campos não editáveis
            const updatedCoord: CoordenadorCliente = {
                ...editingCoord,
                ...payload
            };
            updateCoordenadorCliente(updatedCoord);
        } else {
            // CREATE: Envia dados completos para novo coordenador
            const payload = createCoordinatorPayload(selectedManagerId, coordForm);
            addCoordenadorCliente(payload);
        }
        
        setIsCoordModalOpen(false);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#4D5253]">Gestão de Clientes</h2>
                <button onClick={() => openClientModal()} className="bg-[#533738] text-white px-4 py-2 rounded">+ Novo Cliente</button>
            </div>

            {/* CLIENTS LIST */}
            <div className="space-y-6">
                {clients.map(client => {
                    const commercialManager = users.find(u => u.id === client.id_gestao_comercial);
                    const peopleManager = users.find(u => u.id === client.id_gestao_de_pessoas);
                    const rsAnalyst = users.find(u => u.id === client.id_gestor_rs);

                    return (
                        <div key={client.id} className="border-t border-blue-300 pt-6">
                            {/* ✅ NOVO: Cabeçalho do Cliente com melhor hierarquia */}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-2xl font-bold text-blue-600">{client.razao_social_cliente}</h3>
                                    <p className="text-sm text-gray-500 mt-1">ID: {client.id}</p>
                                </div>
                                <button 
                                    onClick={() => openClientModal(client)} 
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
                                >
                                    Editar
                                </button>
                            </div>

                            {/* ✅ NOVO: Managers Row com ícones - Design melhorado */}
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg mb-6 border border-blue-200">
                                <div className="flex flex-wrap gap-6">
                                    {commercialManager && (
                                        <div className="flex items-center gap-2">
                                            <Briefcase className="w-5 h-5 text-green-600" />
                                            <div>
                                                <div className="text-xs text-gray-600 font-semibold">Gestão Comercial:</div>
                                                <div className="text-sm font-medium text-gray-900">{commercialManager.nome_usuario}</div>
                                            </div>
                                        </div>
                                    )}
                                    {peopleManager && (
                                        <div className="flex items-center gap-2">
                                            <GestaoPessoasIcon className="w-5 h-5 text-purple-600" size={20} />
                                            <div>
                                                <div className="text-xs text-gray-600 font-semibold">Gestão Pessoas:</div>
                                                <div className="text-sm font-medium text-gray-900">{peopleManager.nome_usuario}</div>
                                            </div>
                                        </div>
                                    )}
                                    {rsAnalyst && (
                                        <div className="flex items-center gap-2">
                                            <FocalRSIcon className="w-5 h-5 text-blue-600" size={20} />
                                            <div>
                                                <div className="text-xs text-gray-600 font-semibold">Focal R&S:</div>
                                                <div className="text-sm font-medium text-gray-900">{rsAnalyst.nome_usuario}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ✅ NOVO: Managers List - Design melhorado inspirado em Consultores */}
                            <div className="space-y-4">
                                <button 
                                    onClick={() => openManagerModal(client.id)} 
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition w-full"
                                >
                                    + Novo Gestor
                                </button>

                                {usuariosCliente.filter(u => u.id_cliente === client.id).map(manager => (
                                    <div key={manager.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition">
                                        {/* Cabeçalho do Gestor */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-gray-900 text-lg">{manager.nome_gestor_cliente}</h4>
                                                    {manager.ativo && (
                                                        <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-semibold">Ativo</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600">Cargo: {manager.cargo_gestor || 'N/A'}</p>
                                                <p className="text-xs text-gray-500">Cliente: {client.razao_social_cliente}</p>
                                            </div>
                                            <button 
                                                onClick={() => openManagerModal(client.id, manager)} 
                                                className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 transition"
                                            >
                                                Editar
                                            </button>
                                        </div>
                                                
                                        {/* ✅ NOVO: Contact Info for Manager - Design melhorado */}
                                        <div className="flex flex-wrap gap-3 mb-3">
                                            {manager.email_gestor && (
                                                <a 
                                                    href={`mailto:${manager.email_gestor}`}
                                                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition bg-blue-50 px-3 py-1.5 rounded-lg"
                                                >
                                                    <Mail className="w-4 h-4" />
                                                    <span>{manager.email_gestor}</span>
                                                </a>
                                            )}
                                            {manager.celular && (
                                                <a 
                                                    href={`https://wa.me/55${manager.celular.replace(/\D/g, '')}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-green-600 transition bg-green-50 px-3 py-1.5 rounded-lg"
                                                >
                                                    <Phone className="w-4 h-4" />
                                                    <span>{manager.celular}</span>
                                                </a>
                                            )}
                                        </div>

                                        {/* ✅ NOVO: Coordinators List - Design melhorado */}
                                        <div className="mt-4 space-y-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <h5 className="text-sm font-semibold text-purple-900">Coordenadores</h5>
                                                <button 
                                                    onClick={() => openCoordModal(manager.id)} 
                                                    className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 transition"
                                                >
                                                    + Coord
                                                </button>
                                            </div>

                                            {coordenadoresCliente.filter(c => c.id_gestor_cliente === manager.id).map(coord => (
                                                <div key={coord.id} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-gray-900">{coord.nome_coordenador_cliente}</span>
                                                                {coord.ativo && (
                                                                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-semibold">Ativo</span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-600">Cargo: {coord.cargo_coordenador_cliente || 'N/A'}</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => openCoordModal(manager.id, coord)} 
                                                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition"
                                                        >
                                                            Editar
                                                        </button>
                                                    </div>
                                                    
                                                    {/* ✅ NOVO: Contact Info for Coordinator - Design melhorado */}
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {coord.email_coordenador && (
                                                            <a 
                                                                href={`mailto:${coord.email_coordenador}`}
                                                                className="flex items-center gap-1 text-xs text-gray-700 hover:text-blue-600 transition bg-white px-2 py-1 rounded"
                                                            >
                                                                <Mail className="w-3 h-3" />
                                                                <span>{coord.email_coordenador}</span>
                                                            </a>
                                                        )}
                                                        {coord.celular && (
                                                            <a 
                                                                href={`https://wa.me/55${coord.celular.replace(/\D/g, '')}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1 text-xs text-gray-700 hover:text-green-600 transition bg-white px-2 py-1 rounded"
                                                            >
                                                                <Phone className="w-3 h-3" />
                                                                <span>{coord.celular}</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODAL CLIENT */}
            {isClientModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg w-full max-w-md max-h-96 overflow-y-auto">
                        <h3 className="font-bold text-lg mb-4">{editingClient ? 'Editar' : 'Novo'} Cliente</h3>
                        <form onSubmit={handleClientSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
                                <input className="w-full border p-2 rounded" placeholder="Razão Social" value={clientForm.razao_social_cliente} onChange={e => setClientForm({...clientForm, razao_social_cliente: e.target.value})} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gestão Comercial</label>
                                <select className="w-full border p-2 rounded" value={clientForm.id_gestao_comercial} onChange={e => setClientForm({...clientForm, id_gestao_comercial: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.nome_usuario}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gestão de Pessoas</label>
                                <select className="w-full border p-2 rounded" value={clientForm.id_gestao_de_pessoas} onChange={e => setClientForm({...clientForm, id_gestao_de_pessoas: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.nome_usuario}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Focal R&S</label>
                                <select className="w-full border p-2 rounded" value={clientForm.id_gestor_rs} onChange={e => setClientForm({...clientForm, id_gestor_rs: e.target.value})} required>
                                    <option value="">Selecione...</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.nome_usuario}</option>)}
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

            <InclusionImport />
        </div>
    );
};

export default ManageClients;
