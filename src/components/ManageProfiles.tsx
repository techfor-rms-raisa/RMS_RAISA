import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { usePermissions, Can } from '../hooks/usePermissions';

interface Perfil {
    id: number;
    nome_perfil: string;
    descricao: string | null;
    cor_badge: string;
    icone: string | null;
    nivel_acesso: number;
    ativo: boolean;
    sistema: boolean;
}

export const ManageProfiles: React.FC = () => {
    const { pode } = usePermissions();
    const [perfis, setPerfis] = useState<Perfil[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingPerfil, setEditingPerfil] = useState<Perfil | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAtivo, setFilterAtivo] = useState<'todos' | 'ativo' | 'inativo'>('todos');

    // Form state
    const [formData, setFormData] = useState({
        nome_perfil: '',
        descricao: '',
        cor_badge: '#6B7280',
        nivel_acesso: 1
    });

    // Carregar perfis
    const loadPerfis = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('perfis_usuario')
                .select('*')
                .order('nivel_acesso', { ascending: false });

            if (error) throw error;
            setPerfis(data || []);
        } catch (error) {
            console.error('Erro ao carregar perfis:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPerfis();
    }, []);

    // Filtrar perfis
    const perfisFiltrados = perfis.filter(p => {
        const matchSearch = p.nome_perfil.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.descricao?.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchAtivo = filterAtivo === 'todos' || 
                          (filterAtivo === 'ativo' && p.ativo) ||
                          (filterAtivo === 'inativo' && !p.ativo);
        return matchSearch && matchAtivo;
    });

    // Abrir modal para criar
    const handleNovoPerfil = () => {
        setEditingPerfil(null);
        setFormData({
            nome_perfil: '',
            descricao: '',
            cor_badge: '#6B7280',
            nivel_acesso: 1
        });
        setShowModal(true);
    };

    // Abrir modal para editar
    const handleEditarPerfil = (perfil: Perfil) => {
        setEditingPerfil(perfil);
        setFormData({
            nome_perfil: perfil.nome_perfil,
            descricao: perfil.descricao || '',
            cor_badge: perfil.cor_badge,
            nivel_acesso: perfil.nivel_acesso
        });
        setShowModal(true);
    };

    // Salvar perfil
    const handleSalvar = async () => {
        try {
            if (editingPerfil) {
                // Atualizar
                const { error } = await supabase
                    .from('perfis_usuario')
                    .update({
                        nome_perfil: formData.nome_perfil,
                        descricao: formData.descricao,
                        cor_badge: formData.cor_badge,
                        nivel_acesso: formData.nivel_acesso,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingPerfil.id);

                if (error) throw error;
            } else {
                // Criar
                const { error } = await supabase
                    .from('perfis_usuario')
                    .insert([{
                        nome_perfil: formData.nome_perfil,
                        descricao: formData.descricao,
                        cor_badge: formData.cor_badge,
                        nivel_acesso: formData.nivel_acesso,
                        ativo: true,
                        sistema: false
                    }]);

                if (error) throw error;
            }

            setShowModal(false);
            loadPerfis();
        } catch (error: any) {
            console.error('Erro ao salvar perfil:', error);
            alert(`Erro: ${error.message}`);
        }
    };

    // Ativar/Desativar perfil
    const handleToggleAtivo = async (perfil: Perfil) => {
        try {
            const { error } = await supabase
                .from('perfis_usuario')
                .update({ ativo: !perfil.ativo })
                .eq('id', perfil.id);

            if (error) throw error;
            loadPerfis();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
        }
    };

    // Cores disponíveis
    const coresDisponiveis = [
        { nome: 'Vermelho', valor: '#EF4444' },
        { nome: 'Azul', valor: '#3B82F6' },
        { nome: 'Verde', valor: '#10B981' },
        { nome: 'Roxo', valor: '#8B5CF6' },
        { nome: 'Amarelo', valor: '#F59E0B' },
        { nome: 'Rosa', valor: '#EC4899' },
        { nome: 'Laranja', valor: '#F97316' },
        { nome: 'Cinza', valor: '#6B7280' }
    ];

    // Estatísticas
    const stats = {
        total: perfis.length,
        ativos: perfis.filter(p => p.ativo).length,
        inativos: perfis.filter(p => !p.ativo).length,
        sistema: perfis.filter(p => p.sistema).length
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gerenciamento de Perfis</h1>
                    <p className="text-gray-600 mt-1">Crie e gerencie perfis de usuários do sistema</p>
                </div>
                <Can do="perfis.criar">
                    <button
                        onClick={handleNovoPerfil}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                    >
                        <span>+</span> Novo Perfil
                    </button>
                </Can>
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                    <div className="text-sm text-gray-600">Total de Perfis</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <div className="text-sm text-gray-600">Perfis Ativos</div>
                    <div className="text-2xl font-bold text-green-600">{stats.ativos}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                    <div className="text-sm text-gray-600">Perfis Inativos</div>
                    <div className="text-2xl font-bold text-red-600">{stats.inativos}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                    <div className="text-sm text-gray-600">Perfis do Sistema</div>
                    <div className="text-2xl font-bold text-purple-600">{stats.sistema}</div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Nome ou descrição..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                        <select
                            value={filterAtivo}
                            onChange={(e) => setFilterAtivo(e.target.value as any)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="todos">Todos</option>
                            <option value="ativo">Apenas Ativos</option>
                            <option value="inativo">Apenas Inativos</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Lista de Perfis */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Perfil
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Descrição
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Nível de Acesso
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tipo
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {perfisFiltrados.map((perfil) => (
                            <tr key={perfil.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: perfil.cor_badge }}
                                        ></div>
                                        <span
                                            className="px-3 py-1 text-sm font-medium rounded-full"
                                            style={{
                                                backgroundColor: `${perfil.cor_badge}20`,
                                                color: perfil.cor_badge
                                            }}
                                        >
                                            {perfil.nome_perfil}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-900">{perfil.descricao || '-'}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <div className="w-full bg-gray-200 rounded-full h-2 max-w-[100px]">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full"
                                                style={{ width: `${perfil.nivel_acesso * 10}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700">{perfil.nivel_acesso}/10</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        perfil.ativo 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-red-100 text-red-800'
                                    }`}>
                                        {perfil.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {perfil.sistema && (
                                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                            Sistema
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        <Can do="perfis.editar">
                                            <button
                                                onClick={() => handleEditarPerfil(perfil)}
                                                className="text-blue-600 hover:text-blue-900"
                                                title="Editar"
                                            >
                                                ✏️
                                            </button>
                                        </Can>
                                        <Can do="permissoes.gerenciar">
                                            <button
                                                onClick={() => window.location.href = `/perfis/${perfil.id}/permissoes`}
                                                className="text-purple-600 hover:text-purple-900"
                                                title="Gerenciar Permissões"
                                            >
                                                🔐
                                            </button>
                                        </Can>
                                        {!perfil.sistema && (
                                            <Can do="perfis.editar">
                                                <button
                                                    onClick={() => handleToggleAtivo(perfil)}
                                                    className={perfil.ativo ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                                                    title={perfil.ativo ? 'Desativar' : 'Ativar'}
                                                >
                                                    {perfil.ativo ? '🔒' : '🔓'}
                                                </button>
                                            </Can>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {perfisFiltrados.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        Nenhum perfil encontrado
                    </div>
                )}
            </div>

            {/* Modal de Criação/Edição */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">
                            {editingPerfil ? 'Editar Perfil' : 'Novo Perfil'}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nome do Perfil *
                                </label>
                                <input
                                    type="text"
                                    value={formData.nome_perfil}
                                    onChange={(e) => setFormData({ ...formData, nome_perfil: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ex: Coordenador de Projetos"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Descrição
                                </label>
                                <textarea
                                    value={formData.descricao}
                                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    rows={3}
                                    placeholder="Descreva as responsabilidades deste perfil"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Cor do Badge
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {coresDisponiveis.map((cor) => (
                                        <button
                                            key={cor.valor}
                                            onClick={() => setFormData({ ...formData, cor_badge: cor.valor })}
                                            className={`h-10 rounded-lg border-2 ${
                                                formData.cor_badge === cor.valor 
                                                    ? 'border-gray-900 scale-110' 
                                                    : 'border-gray-300'
                                            } transition-transform`}
                                            style={{ backgroundColor: cor.valor }}
                                            title={cor.nome}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nível de Acesso (1-10) *
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={formData.nivel_acesso}
                                    onChange={(e) => setFormData({ ...formData, nivel_acesso: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    1 = Acesso básico, 10 = Acesso total
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSalvar}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                disabled={!formData.nome_perfil}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
