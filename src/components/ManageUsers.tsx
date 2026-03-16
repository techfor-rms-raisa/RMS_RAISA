/**
 * ManageUsers.tsx - Gerenciamento de Usuários
 * 
 * 🆕 v57.0: Sistema de Permissões Implementado
 * - Filtro de usuários visíveis baseado no perfil logado
 * - Controle de CRUD por perfil
 * - Gestão de R&S não vê Admin nem Gestão Comercial
 * - Perfis básicos só veem/editam próprio cadastro
 * 
 * 🆕 v58.4: Perfil SDR adicionado — acesso exclusivo ao módulo Prospect
 * Data: 15/03/2026
 */

import React, { useState, useMemo } from 'react';
import { User, UserRole } from '@/types';
import { 
    getPerfisPodeVer, 
    getPerfisPodeCriar, 
    podeAdicionarUsuarios,
    podeEditarUsuario,
    podeAlterarTipoUsuario,
    podeAlterarStatusUsuario
} from '../utils/permissions';

// Tipo do resultado da migração
interface MigrationResult {
    success: boolean;
    migrated: number;
    skipped: number;
    errors: string[];
    details: Array<{ nome: string; status: string }>;
}

interface ManageUsersProps {
    users: User[];
    addUser: (user: Omit<User, 'id'>) => void;
    updateUser: (id: number, updates: Partial<User>) => void;
    currentUser: User;
    migrateYearlyData: () => Promise<MigrationResult>;
}

const ManageUsers: React.FC<ManageUsersProps> = ({ users, addUser, updateUser, currentUser, migrateYearlyData }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState<UserRole | 'Todos'>('Todos');
    const [filterStatus, setFilterStatus] = useState<'Todos' | 'Ativo' | 'Inativo'>('Todos');

    // Estados para Migração Anual
    const [isMigrationConfirmOpen, setIsMigrationConfirmOpen] = useState(false);
    const [isMigrationResultOpen, setIsMigrationResultOpen] = useState(false);
    const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        nome_usuario: '',
        email_usuario: '',
        senha_usuario: '',
        tipo_usuario: 'Consulta' as UserRole,
        ativo_usuario: true,
        receber_alertas_email: true,
        analista_rs_id: null as number | null
    });

    // ============================================
    // PERMISSÕES
    // ============================================

    // Perfis que o usuário logado pode VER
    const perfisVisiveis = useMemo(() => getPerfisPodeVer(currentUser.tipo_usuario), [currentUser.tipo_usuario]);
    
    // Perfis que o usuário logado pode CRIAR
    const perfisCriaveis = useMemo(() => getPerfisPodeCriar(currentUser.tipo_usuario), [currentUser.tipo_usuario]);
    
    // Pode adicionar novos usuários?
    const podeAdicionar = useMemo(() => podeAdicionarUsuarios(currentUser.tipo_usuario), [currentUser.tipo_usuario]);

    // Lista completa de roles para exibição
    const allUserRoles: UserRole[] = [
        'Administrador',
        'Gestão de R&S',
        'Gestão Comercial',
        'Gestão de Pessoas',
        'Analista de R&S',
        'Consulta',
        'Cliente',
        'SDR'
    ];

    // Roles visíveis no filtro (apenas as que pode ver)
    const userRolesVisiveis = useMemo(() => 
        allUserRoles.filter(role => perfisVisiveis.includes(role)),
        [perfisVisiveis]
    );

    // Roles disponíveis para criar/editar
    const userRolesCriaveis = useMemo(() => 
        allUserRoles.filter(role => perfisCriaveis.includes(role)),
        [perfisCriaveis]
    );

    const resetForm = () => {
        setFormData({
            nome_usuario: '',
            email_usuario: '',
            senha_usuario: '',
            tipo_usuario: userRolesCriaveis[0] || 'Consulta',
            ativo_usuario: true,
            receber_alertas_email: true,
            analista_rs_id: null
        });
    };

    const handleAddUser = () => {
        if (!formData.nome_usuario || !formData.email_usuario || !formData.senha_usuario) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        // Verificar se o email já existe
        const emailExists = users.some(u => u.email_usuario.toLowerCase() === formData.email_usuario.toLowerCase());
        if (emailExists) {
            alert('Este email já está cadastrado no sistema.');
            return;
        }

        // Verificar se pode criar esse tipo de usuário
        if (!perfisCriaveis.includes(formData.tipo_usuario)) {
            alert('Você não tem permissão para criar usuários deste tipo.');
            return;
        }

        addUser(formData);
        resetForm();
        setIsAddModalOpen(false);
        alert('Usuário adicionado com sucesso!');
    };

    const handleEditUser = () => {
        if (!selectedUser) return;

        if (!formData.nome_usuario || !formData.email_usuario) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        // Verificar se pode editar esse usuário
        if (!podeEditarUsuario(currentUser.tipo_usuario, selectedUser.tipo_usuario, currentUser.id, selectedUser.id)) {
            alert('Você não tem permissão para editar este usuário.');
            return;
        }

        // Verificar se o email já existe (exceto o próprio usuário)
        const emailExists = users.some(u => 
            u.id !== selectedUser.id && 
            u.email_usuario.toLowerCase() === formData.email_usuario.toLowerCase()
        );
        if (emailExists) {
            alert('Este email já está cadastrado no sistema.');
            return;
        }

        const updates: Partial<User> = {
            nome_usuario: formData.nome_usuario,
            email_usuario: formData.email_usuario,
            receber_alertas_email: formData.receber_alertas_email,
            analista_rs_id: formData.analista_rs_id
        };

        // Só pode alterar tipo se tiver permissão E não for o próprio usuário
        if (podeAlterarTipoUsuario(currentUser.tipo_usuario, currentUser.id, selectedUser.id)) {
            updates.tipo_usuario = formData.tipo_usuario;
            updates.ativo_usuario = formData.ativo_usuario;
        }

        // Só atualiza a senha se foi preenchida
        if (formData.senha_usuario) {
            updates.senha_usuario = formData.senha_usuario;
        }

        updateUser(selectedUser.id, updates);
        resetForm();
        setIsEditModalOpen(false);
        setSelectedUser(null);
        alert('Usuário atualizado com sucesso!');
    };

    const openEditModal = (user: User) => {
        // Verificar se pode editar
        if (!podeEditarUsuario(currentUser.tipo_usuario, user.tipo_usuario, currentUser.id, user.id)) {
            alert('Você não tem permissão para editar este usuário.');
            return;
        }

        setSelectedUser(user);
        setFormData({
            nome_usuario: user.nome_usuario,
            email_usuario: user.email_usuario,
            senha_usuario: '',
            tipo_usuario: user.tipo_usuario,
            ativo_usuario: user.ativo_usuario,
            receber_alertas_email: user.receber_alertas_email,
            analista_rs_id: user.analista_rs_id
        });
        setIsEditModalOpen(true);
    };

    const toggleUserStatus = (user: User) => {
        // Verificar se pode alterar status
        if (!podeAlterarStatusUsuario(currentUser.tipo_usuario, user.tipo_usuario, currentUser.id, user.id)) {
            alert('Você não tem permissão para alterar o status deste usuário.');
            return;
        }

        const newStatus = !user.ativo_usuario;
        updateUser(user.id, { ativo_usuario: newStatus });
        alert(`Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso!`);
    };

    // ============================================
    // FILTROS - Aplica permissões de visibilidade
    // ============================================

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            // 🔒 PRIMEIRO: Filtrar por permissão de visibilidade
            // Se não for Admin ou Gestão de R&S, só vê o próprio usuário
            if (!podeAdicionar && user.id !== currentUser.id) {
                return false;
            }

            // Se for Admin ou Gestão de R&S, aplica filtro de perfis visíveis
            if (podeAdicionar && !perfisVisiveis.includes(user.tipo_usuario)) {
                return false;
            }

            // Filtros normais
            const matchesSearch = user.nome_usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                user.email_usuario.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = filterRole === 'Todos' || user.tipo_usuario === filterRole;
            const matchesStatus = filterStatus === 'Todos' || 
                                (filterStatus === 'Ativo' && user.ativo_usuario) ||
                                (filterStatus === 'Inativo' && !user.ativo_usuario);
            
            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [users, currentUser, podeAdicionar, perfisVisiveis, searchTerm, filterRole, filterStatus]);

    // Estatísticas filtradas por permissão
    const usersVisiveis = useMemo(() => {
        if (!podeAdicionar) {
            return users.filter(u => u.id === currentUser.id);
        }
        return users.filter(u => perfisVisiveis.includes(u.tipo_usuario));
    }, [users, currentUser, podeAdicionar, perfisVisiveis]);

    const getRoleColor = (role: UserRole) => {
        const colors: Record<UserRole, string> = {
            'Administrador': 'bg-red-100 text-red-800',
            'Gestão de R&S': 'bg-orange-100 text-orange-800',
            'Gestão Comercial': 'bg-blue-100 text-blue-800',
            'Gestão de Pessoas': 'bg-green-100 text-green-800',
            'Analista de R&S': 'bg-purple-100 text-purple-800',
            'Consulta': 'bg-gray-100 text-gray-800',
            'Cliente': 'bg-yellow-100 text-yellow-800',
            'SDR': 'bg-teal-100 text-teal-800'
        };
        return colors[role] || 'bg-gray-100 text-gray-800';
    };

    // Migração Anual
    const anoAtual = new Date().getFullYear();
    const anoAnterior = anoAtual - 1;

    const handleMigration = async () => {
        setIsMigrating(true);
        setIsMigrationConfirmOpen(false);
        
        try {
            const result = await migrateYearlyData();
            setMigrationResult(result);
            setIsMigrationResultOpen(true);
        } catch (error: any) {
            setMigrationResult({
                success: false,
                migrated: 0,
                skipped: 0,
                errors: [error.message || 'Erro desconhecido'],
                details: []
            });
            setIsMigrationResultOpen(true);
        } finally {
            setIsMigrating(false);
        }
    };

    // Verificar se pode editar tipo de usuário no modal
    const podeEditarTipo = selectedUser 
        ? podeAlterarTipoUsuario(currentUser.tipo_usuario, currentUser.id, selectedUser.id)
        : false;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-[#4D5253]">Gerenciamento de Usuários</h2>
                    {!podeAdicionar && (
                        <p className="text-sm text-gray-500 mt-1">
                            Você pode visualizar e editar apenas seu próprio cadastro.
                        </p>
                    )}
                </div>
                <div className="flex gap-3">
                    {/* Botão Migração Anual - Apenas Administrador */}
                    {currentUser.tipo_usuario === 'Administrador' && (
                        <button
                            onClick={() => setIsMigrationConfirmOpen(true)}
                            disabled={isMigrating}
                            className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={`Migrar consultores ativos de ${anoAnterior} para ${anoAtual}`}
                        >
                            {isMigrating ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span>Migrando...</span>
                                </>
                            ) : (
                                <>
                                    <span>📅</span>
                                    <span>Migração {anoAnterior} → {anoAtual}</span>
                                </>
                            )}
                        </button>
                    )}
                    {/* Botão Novo Usuário - Apenas quem pode adicionar */}
                    {podeAdicionar && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
                        >
                            <span>+</span> Novo Usuário
                        </button>
                    )}
                </div>
            </div>

            {/* Filtros - Ocultos se não pode adicionar (só vê próprio usuário) */}
            {podeAdicionar && (
                <div className="bg-white p-4 rounded-lg shadow mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
                            <input
                                type="text"
                                placeholder="Nome ou email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Usuário</label>
                            <select
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value as UserRole | 'Todos')}
                                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Todos">Todos</option>
                                {userRolesVisiveis.map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value as 'Todos' | 'Ativo' | 'Inativo')}
                                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Todos">Todos</option>
                                <option value="Ativo">Ativos</option>
                                <option value="Inativo">Inativos</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Estatísticas - Ajustadas por permissão */}
            {podeAdicionar && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Total Visível</div>
                        <div className="text-2xl font-bold text-gray-800">{usersVisiveis.length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Usuários Ativos</div>
                        <div className="text-2xl font-bold text-green-600">{usersVisiveis.filter(u => u.ativo_usuario).length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Usuários Inativos</div>
                        <div className="text-2xl font-bold text-red-600">{usersVisiveis.filter(u => !u.ativo_usuario).length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                        <div className="text-sm text-gray-600">Resultados Filtrados</div>
                        <div className="text-2xl font-bold text-blue-600">{filteredUsers.length}</div>
                    </div>
                </div>
            )}

            {/* Tabela de Usuários */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alertas</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                        {!podeAdicionar 
                                            ? 'Seu cadastro será exibido aqui.'
                                            : 'Nenhum usuário encontrado com os filtros aplicados.'
                                        }
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => {
                                    const podeEditar = podeEditarUsuario(currentUser.tipo_usuario, user.tipo_usuario, currentUser.id, user.id);
                                    const podeAlterarStatus = podeAlterarStatusUsuario(currentUser.tipo_usuario, user.tipo_usuario, currentUser.id, user.id);
                                    
                                    return (
                                        <tr key={user.id} className={`hover:bg-gray-50 ${user.id === currentUser.id ? 'bg-blue-50' : ''}`}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {user.id}
                                                {user.id === currentUser.id && <span className="ml-2 text-xs text-blue-600">(você)</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.nome_usuario}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email_usuario}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${getRoleColor(user.tipo_usuario)}`}>
                                                    {user.tipo_usuario}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded ${user.ativo_usuario ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {user.ativo_usuario ? 'Ativo' : 'Inativo'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {user.receber_alertas_email ? '✅ Sim' : '❌ Não'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                                {podeEditar && (
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="text-blue-600 hover:text-blue-900 mr-3"
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                                {podeAlterarStatus && (
                                                    <button
                                                        onClick={() => toggleUserStatus(user)}
                                                        className={`${user.ativo_usuario ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                                                        title={user.ativo_usuario ? 'Desativar' : 'Ativar'}
                                                    >
                                                        {user.ativo_usuario ? '🔒' : '🔓'}
                                                    </button>
                                                )}
                                                {!podeEditar && !podeAlterarStatus && (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Adicionar Usuário */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Adicionar Novo Usuário</h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                                    <input
                                        type="text"
                                        value={formData.nome_usuario}
                                        onChange={(e) => setFormData({...formData, nome_usuario: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Ex: João Silva"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                    <input
                                        type="email"
                                        value={formData.email_usuario}
                                        onChange={(e) => setFormData({...formData, email_usuario: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                        placeholder="joao.silva@empresa.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                                    <input
                                        type="password"
                                        value={formData.senha_usuario}
                                        onChange={(e) => setFormData({...formData, senha_usuario: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Usuário *</label>
                                    <select
                                        value={formData.tipo_usuario}
                                        onChange={(e) => setFormData({...formData, tipo_usuario: e.target.value as UserRole})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                    >
                                        {userRolesCriaveis.map(role => (
                                            <option key={role} value={role}>{role}</option>
                                        ))}
                                    </select>
                                    {currentUser.tipo_usuario === 'Gestão de R&S' && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Você não pode criar perfis Administrador ou Gestão Comercial.
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="add-ativo"
                                        checked={formData.ativo_usuario}
                                        onChange={(e) => setFormData({...formData, ativo_usuario: e.target.checked})}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="add-ativo" className="ml-2 block text-sm text-gray-700">
                                        Usuário Ativo
                                    </label>
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="add-alertas"
                                        checked={formData.receber_alertas_email}
                                        onChange={(e) => setFormData({...formData, receber_alertas_email: e.target.checked})}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="add-alertas" className="ml-2 block text-sm text-gray-700">
                                        Receber Alertas por Email
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleAddUser}
                                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                                >
                                    Adicionar
                                </button>
                                <button
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        resetForm();
                                    }}
                                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Editar Usuário */}
            {isEditModalOpen && selectedUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">
                                {selectedUser.id === currentUser.id ? 'Editar Meu Perfil' : 'Editar Usuário'}
                            </h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                                    <input
                                        type="text"
                                        value={formData.nome_usuario}
                                        onChange={(e) => setFormData({...formData, nome_usuario: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                    <input
                                        type="email"
                                        value={formData.email_usuario}
                                        onChange={(e) => setFormData({...formData, email_usuario: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha (deixe em branco para manter)</label>
                                    <input
                                        type="password"
                                        value={formData.senha_usuario}
                                        onChange={(e) => setFormData({...formData, senha_usuario: e.target.value})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Deixe em branco para não alterar"
                                    />
                                </div>

                                {/* Tipo de Usuário - Apenas se pode alterar */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Usuário *</label>
                                    <select
                                        value={formData.tipo_usuario}
                                        onChange={(e) => setFormData({...formData, tipo_usuario: e.target.value as UserRole})}
                                        className={`w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 ${!podeEditarTipo ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                        disabled={!podeEditarTipo}
                                    >
                                        {podeEditarTipo ? (
                                            userRolesCriaveis.map(role => (
                                                <option key={role} value={role}>{role}</option>
                                            ))
                                        ) : (
                                            <option value={formData.tipo_usuario}>{formData.tipo_usuario}</option>
                                        )}
                                    </select>
                                    {!podeEditarTipo && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Você não pode alterar o tipo de usuário.
                                        </p>
                                    )}
                                </div>

                                {/* Status Ativo - Apenas se pode alterar */}
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="edit-ativo"
                                        checked={formData.ativo_usuario}
                                        onChange={(e) => setFormData({...formData, ativo_usuario: e.target.checked})}
                                        className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${!podeEditarTipo ? 'cursor-not-allowed' : ''}`}
                                        disabled={!podeEditarTipo}
                                    />
                                    <label htmlFor="edit-ativo" className={`ml-2 block text-sm ${!podeEditarTipo ? 'text-gray-400' : 'text-gray-700'}`}>
                                        Usuário Ativo
                                    </label>
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="edit-alertas"
                                        checked={formData.receber_alertas_email}
                                        onChange={(e) => setFormData({...formData, receber_alertas_email: e.target.checked})}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="edit-alertas" className="ml-2 block text-sm text-gray-700">
                                        Receber Alertas por Email
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleEditUser}
                                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                                >
                                    Salvar
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditModalOpen(false);
                                        setSelectedUser(null);
                                        resetForm();
                                    }}
                                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Confirmação de Migração */}
            {isMigrationConfirmOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-4xl">📅</span>
                                <h3 className="text-xl font-bold text-gray-900">Migração Anual de Consultores</h3>
                            </div>
                            
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                                <h4 className="font-semibold text-amber-800 mb-2">O que será feito:</h4>
                                <ul className="text-sm text-amber-700 space-y-1">
                                    <li>• Buscar todos os consultores <strong>ATIVOS</strong> de {anoAnterior}</li>
                                    <li>• Criar novos registros para {anoAtual}</li>
                                    <li>• P1 de {anoAtual} = Parecer Final de {anoAnterior}</li>
                                    <li>• P2 a P12 serão resetados (novo ciclo)</li>
                                    <li>• Histórico de {anoAnterior} será <strong>preservado</strong></li>
                                </ul>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                <p className="text-sm text-blue-700">
                                    <strong>💡 Dica:</strong> Esta operação pode ser executada múltiplas vezes. 
                                    Consultores já migrados serão automaticamente ignorados.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleMigration}
                                    className="flex-1 bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 font-semibold"
                                >
                                    ✅ Confirmar Migração
                                </button>
                                <button
                                    onClick={() => setIsMigrationConfirmOpen(false)}
                                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Resultado da Migração */}
            {isMigrationResultOpen && migrationResult && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-4xl">{migrationResult.success ? '✅' : '⚠️'}</span>
                                <h3 className="text-xl font-bold text-gray-900">
                                    {migrationResult.success ? 'Migração Concluída!' : 'Migração com Alertas'}
                                </h3>
                            </div>

                            {/* Estatísticas */}
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-green-600">{migrationResult.migrated}</p>
                                    <p className="text-sm text-green-700">Migrados</p>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-yellow-600">{migrationResult.skipped}</p>
                                    <p className="text-sm text-yellow-700">Já existiam</p>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-red-600">{migrationResult.errors.length}</p>
                                    <p className="text-sm text-red-700">Erros</p>
                                </div>
                            </div>

                            {/* Lista de Erros */}
                            {migrationResult.errors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                                    <h4 className="font-semibold text-red-800 mb-2">Erros encontrados:</h4>
                                    <ul className="text-sm text-red-700 space-y-1 max-h-24 overflow-y-auto">
                                        {migrationResult.errors.map((error, idx) => (
                                            <li key={idx}>• {error}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Detalhes */}
                            {migrationResult.details.length > 0 && (
                                <div className="border rounded-lg overflow-hidden mb-4">
                                    <div className="bg-gray-100 px-4 py-2 font-semibold text-gray-700">
                                        Detalhes da Migração
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="text-left px-4 py-2">Consultor</th>
                                                    <th className="text-left px-4 py-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {migrationResult.details.map((detail, idx) => (
                                                    <tr key={idx} className="border-t">
                                                        <td className="px-4 py-2">{detail.nome}</td>
                                                        <td className="px-4 py-2">
                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                detail.status.includes('Migrado') 
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : detail.status.includes('Erro')
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                                {detail.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => {
                                    setIsMigrationResultOpen(false);
                                    setMigrationResult(null);
                                }}
                                className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageUsers;
