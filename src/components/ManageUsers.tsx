import React, { useState } from 'react';
import { User, UserRole } from '../components/types';

interface ManageUsersProps {
    users: User[];
    addUser: (user: Omit<User, 'id'>) => void;
    updateUser: (id: number, updates: Partial<User>) => void;
    currentUser: User;
    migrateYearlyData: () => void;
}

const ManageUsers: React.FC<ManageUsersProps> = ({ users, addUser, updateUser, currentUser, migrateYearlyData }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState<UserRole | 'Todos'>('Todos');
    const [filterStatus, setFilterStatus] = useState<'Todos' | 'Ativo' | 'Inativo'>('Todos');

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

    const userRoles: UserRole[] = [
        'Administrador',
        'Gestão Comercial',
        'Gestão de Pessoas',
        'Analista de R&S',
        'Consulta',
        'Cliente'
    ];

    const resetForm = () => {
        setFormData({
            nome_usuario: '',
            email_usuario: '',
            senha_usuario: '',
            tipo_usuario: 'Consulta',
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
            tipo_usuario: formData.tipo_usuario,
            ativo_usuario: formData.ativo_usuario,
            receber_alertas_email: formData.receber_alertas_email,
            analista_rs_id: formData.analista_rs_id
        };

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
        setSelectedUser(user);
        setFormData({
            nome_usuario: user.nome_usuario,
            email_usuario: user.email_usuario,
            senha_usuario: '', // Não preenche a senha por segurança
            tipo_usuario: user.tipo_usuario,
            ativo_usuario: user.ativo_usuario,
            receber_alertas_email: user.receber_alertas_email,
            analista_rs_id: user.analista_rs_id
        });
        setIsEditModalOpen(true);
    };

    const toggleUserStatus = (user: User) => {
        const newStatus = !user.ativo_usuario;
        updateUser(user.id, { ativo_usuario: newStatus });
        alert(`Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso!`);
    };

    // Filtros
    const filteredUsers = users.filter(user => {
        const matchesSearch = user.nome_usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            user.email_usuario.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = filterRole === 'Todos' || user.tipo_usuario === filterRole;
        const matchesStatus = filterStatus === 'Todos' || 
                            (filterStatus === 'Ativo' && user.ativo_usuario) ||
                            (filterStatus === 'Inativo' && !user.ativo_usuario);
        
        return matchesSearch && matchesRole && matchesStatus;
    });

    const getRoleColor = (role: UserRole) => {
        const colors: Record<UserRole, string> = {
            'Administrador': 'bg-red-100 text-red-800',
            'Gestão Comercial': 'bg-blue-100 text-blue-800',
            'Gestão de Pessoas': 'bg-green-100 text-green-800',
            'Analista de R&S': 'bg-purple-100 text-purple-800',
            'Consulta': 'bg-gray-100 text-gray-800',
            'Cliente': 'bg-yellow-100 text-yellow-800'
        };
        return colors[role] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#4D5253]">Gerenciamento de Usuários</h2>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
                >
                    <span>+</span> Novo Usuário
                </button>
            </div>

            {/* Filtros */}
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
                            {userRoles.map(role => (
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

            {/* Estatísticas */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Total de Usuários</div>
                    <div className="text-2xl font-bold text-gray-800">{users.length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Usuários Ativos</div>
                    <div className="text-2xl font-bold text-green-600">{users.filter(u => u.ativo_usuario).length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Usuários Inativos</div>
                    <div className="text-2xl font-bold text-red-600">{users.filter(u => !u.ativo_usuario).length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="text-sm text-gray-600">Resultados Filtrados</div>
                    <div className="text-2xl font-bold text-blue-600">{filteredUsers.length}</div>
                </div>
            </div>

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
                                        Nenhum usuário encontrado com os filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.id}</td>
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
                                            <button
                                                onClick={() => openEditModal(user)}
                                                className="text-blue-600 hover:text-blue-900 mr-3"
                                                title="Editar"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => toggleUserStatus(user)}
                                                className={`${user.ativo_usuario ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                                                title={user.ativo_usuario ? 'Desativar' : 'Ativar'}
                                            >
                                                {user.ativo_usuario ? '🔒' : '🔓'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
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
                                        {userRoles.map(role => (
                                            <option key={role} value={role}>{role}</option>
                                        ))}
                                    </select>
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
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Editar Usuário</h3>
                            
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

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Usuário *</label>
                                    <select
                                        value={formData.tipo_usuario}
                                        onChange={(e) => setFormData({...formData, tipo_usuario: e.target.value as UserRole})}
                                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                                    >
                                        {userRoles.map(role => (
                                            <option key={role} value={role}>{role}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="edit-ativo"
                                        checked={formData.ativo_usuario}
                                        onChange={(e) => setFormData({...formData, ativo_usuario: e.target.checked})}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="edit-ativo" className="ml-2 block text-sm text-gray-700">
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
        </div>
    );
};

export default ManageUsers;