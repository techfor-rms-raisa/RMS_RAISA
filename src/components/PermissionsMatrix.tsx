import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

interface Permissao {
    id: number;
    codigo_permissao: string;
    nome_permissao: string;
    descricao: string | null;
    modulo: string;
    acao: string;
    ativo: boolean;
}

interface PerfilPermissao {
    permissao_id: number;
}

interface Perfil {
    id: number;
    nome_perfil: string;
    cor_badge: string;
}

interface PermissionsMatrixProps {
    perfilId?: string;
    onNavigate?: (path: string) => void;
}

export const PermissionsMatrix: React.FC<PermissionsMatrixProps> = ({ perfilId, onNavigate }) => {
    const [perfil, setPerfil] = useState<Perfil | null>(null);
    const [permissoes, setPermissoes] = useState<Permissao[]>([]);
    const [permissoesAtivas, setPermissoesAtivas] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModulo, setFilterModulo] = useState('todos');

    // Carregar dados
    useEffect(() => {
        if (perfilId) {
            loadData();
        }
    }, [perfilId]);

    const loadData = async () => {
        try {
            setLoading(true);

            // Carregar perfil
            const { data: perfilData, error: perfilError } = await supabase
                .from('perfis_usuario')
                .select('id, nome_perfil, cor_badge')
                .eq('id', perfilId)
                .single();

            if (perfilError) throw perfilError;
            setPerfil(perfilData);

            // Carregar todas as permissões
            const { data: permsData, error: permsError } = await supabase
                .from('permissoes')
                .select('*')
                .eq('ativo', true)
                .order('modulo, acao');

            if (permsError) throw permsError;
            setPermissoes(permsData || []);

            // Carregar permissões ativas do perfil
            const { data: ativasData, error: ativasError } = await supabase
                .from('perfil_permissoes')
                .select('permissao_id')
                .eq('perfil_id', perfilId);

            if (ativasError) throw ativasError;
            
            const ativasSet = new Set(ativasData?.map(p => p.permissao_id) || []);
            setPermissoesAtivas(ativasSet);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            alert('Erro ao carregar permissões');
        } finally {
            setLoading(false);
        }
    };

    // Agrupar permissões por módulo
    const permissoesPorModulo = permissoes.reduce((acc, perm) => {
        if (!acc[perm.modulo]) {
            acc[perm.modulo] = [];
        }
        acc[perm.modulo].push(perm);
        return acc;
    }, {} as Record<string, Permissao[]>);

    // Filtrar módulos
    const modulosFiltrados = Object.keys(permissoesPorModulo).filter(modulo => {
        if (filterModulo !== 'todos' && modulo !== filterModulo) return false;
        if (!searchTerm) return true;
        
        const permsDoModulo = permissoesPorModulo[modulo];
        return permsDoModulo.some(p => 
            p.nome_permissao.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.codigo_permissao.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    // Toggle permissão
    const handleTogglePermissao = (permissaoId: number) => {
        const novasAtivas = new Set(permissoesAtivas);
        if (novasAtivas.has(permissaoId)) {
            novasAtivas.delete(permissaoId);
        } else {
            novasAtivas.add(permissaoId);
        }
        setPermissoesAtivas(novasAtivas);
    };

    // Toggle todas do módulo
    const handleToggleModulo = (modulo: string) => {
        const permsDoModulo = permissoesPorModulo[modulo];
        const todasAtivas = permsDoModulo.every(p => permissoesAtivas.has(p.id));
        
        const novasAtivas = new Set(permissoesAtivas);
        permsDoModulo.forEach(p => {
            if (todasAtivas) {
                novasAtivas.delete(p.id);
            } else {
                novasAtivas.add(p.id);
            }
        });
        setPermissoesAtivas(novasAtivas);
    };

    // Salvar alterações
    const handleSalvar = async () => {
        try {
            setSaving(true);

            // Deletar todas as permissões atuais
            await supabase
                .from('perfil_permissoes')
                .delete()
                .eq('perfil_id', perfilId);

            // Inserir novas permissões
            if (permissoesAtivas.size > 0) {
                const inserts = Array.from(permissoesAtivas).map(permissaoId => ({
                    perfil_id: parseInt(perfilId!),
                    permissao_id: permissaoId
                }));

                const { error } = await supabase
                    .from('perfil_permissoes')
                    .insert(inserts);

                if (error) throw error;
            }

            alert('Permissões salvas com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar permissões:', error);
            alert('Erro ao salvar permissões');
        } finally {
            setSaving(false);
        }
    };

    // Ícones de ação
    const getIconeAcao = (acao: string) => {
        switch (acao) {
            case 'criar': return '➕';
            case 'ler': return '👁️';
            case 'editar': return '✏️';
            case 'excluir': return '🗑️';
            case 'executar': return '⚡';
            default: return '📋';
        }
    };

    // Cor da ação
    const getCorAcao = (acao: string) => {
        switch (acao) {
            case 'criar': return 'text-green-600';
            case 'ler': return 'text-blue-600';
            case 'editar': return 'text-yellow-600';
            case 'excluir': return 'text-red-600';
            case 'executar': return 'text-purple-600';
            default: return 'text-gray-600';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!perfil) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                    Perfil não encontrado
                </div>
            </div>
        );
    }

    const totalPermissoes = permissoes.length;
    const permissoesAtribuidas = permissoesAtivas.size;
    const percentual = totalPermissoes > 0 ? Math.round((permissoesAtribuidas / totalPermissoes) * 100) : 0;

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onNavigate?.('/perfis')}
                        className="text-gray-600 hover:text-gray-900"
                    >
                        ← Voltar
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <span
                                className="px-4 py-1 text-lg font-medium rounded-full"
                                style={{
                                    backgroundColor: `${perfil.cor_badge}20`,
                                    color: perfil.cor_badge
                                }}
                            >
                                {perfil.nome_perfil}
                            </span>
                        </h1>
                        <p className="text-gray-600 mt-1">Gerencie as permissões deste perfil</p>
                    </div>
                </div>
                <button
                    onClick={handleSalvar}
                    disabled={saving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                    {saving ? 'Salvando...' : '💾 Salvar Alterações'}
                </button>
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Total de Permissões</div>
                    <div className="text-2xl font-bold text-gray-900">{totalPermissoes}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Permissões Atribuídas</div>
                    <div className="text-2xl font-bold text-blue-600">{permissoesAtribuidas}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Percentual de Cobertura</div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${percentual}%` }}
                            ></div>
                        </div>
                        <span className="text-lg font-bold text-gray-900">{percentual}%</span>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Buscar Permissão</label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Nome ou código da permissão..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Módulo</label>
                        <select
                            value={filterModulo}
                            onChange={(e) => setFilterModulo(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="todos">Todos os Módulos</option>
                            {Object.keys(permissoesPorModulo).sort().map(modulo => (
                                <option key={modulo} value={modulo}>{modulo}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Lista de Permissões por Módulo */}
            <div className="space-y-4">
                {modulosFiltrados.sort().map(modulo => {
                    const permsDoModulo = permissoesPorModulo[modulo].filter(p => {
                        if (!searchTerm) return true;
                        return p.nome_permissao.toLowerCase().includes(searchTerm.toLowerCase()) ||
                               p.codigo_permissao.toLowerCase().includes(searchTerm.toLowerCase());
                    });

                    const todasAtivas = permsDoModulo.every(p => permissoesAtivas.has(p.id));
                    const algumasAtivas = permsDoModulo.some(p => permissoesAtivas.has(p.id));

                    return (
                        <div key={modulo} className="bg-white rounded-lg shadow overflow-hidden">
                            {/* Header do Módulo */}
                            <div 
                                className="flex items-center justify-between p-4 bg-gray-50 border-b cursor-pointer hover:bg-gray-100"
                                onClick={() => handleToggleModulo(modulo)}
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={todasAtivas}
                                        ref={input => {
                                            if (input) {
                                                input.indeterminate = algumasAtivas && !todasAtivas;
                                            }
                                        }}
                                        onChange={() => handleToggleModulo(modulo)}
                                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                    />
                                    <h3 className="text-lg font-semibold text-gray-900">{modulo}</h3>
                                    <span className="text-sm text-gray-500">
                                        ({permsDoModulo.filter(p => permissoesAtivas.has(p.id)).length}/{permsDoModulo.length})
                                    </span>
                                </div>
                            </div>

                            {/* Lista de Permissões */}
                            <div className="divide-y divide-gray-100">
                                {permsDoModulo.map(perm => (
                                    <div 
                                        key={perm.id}
                                        className="flex items-center justify-between p-4 hover:bg-gray-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={permissoesAtivas.has(perm.id)}
                                                onChange={() => handleTogglePermissao(perm.id)}
                                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                            />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={getCorAcao(perm.acao)}>
                                                        {getIconeAcao(perm.acao)}
                                                    </span>
                                                    <span className="font-medium text-gray-900">
                                                        {perm.nome_permissao}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {perm.codigo_permissao}
                                                    {perm.descricao && ` - ${perm.descricao}`}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${getCorAcao(perm.acao)} bg-opacity-10`}>
                                            {perm.acao}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
