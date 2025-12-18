/**
 * Vagas.tsx - RMS RAISA v52.6
 * Componente de Gestão de Vagas
 * 
 * CORREÇÃO v52.2: Tratamento seguro do campo stack_tecnologica
 * NOVA FUNCIONALIDADE v52.3: Dropdowns de Cliente e Gestor do Cliente no header
 * CORREÇÃO v52.4: Verificações de segurança para clients e usuariosCliente undefined
 * CORREÇÃO v52.6: Usa razao_social_cliente e adiciona dropdown de Gestor no modal
 */

import React, { useState, useMemo } from 'react';
import { Vaga, Client, UsuarioCliente } from '../types';
import VagaPriorizacaoManager from './VagaPriorizacaoManager';

interface VagasProps {
    vagas: Vaga[];
    clients?: Client[];
    usuariosCliente?: UsuarioCliente[];
    addVaga: (v: any) => void;
    updateVaga: (v: Vaga) => void;
    deleteVaga: (id: string) => void;
}

/**
 * Função auxiliar para garantir que stack_tecnologica seja sempre um array
 */
const ensureStackArray = (stack: any): string[] => {
    if (Array.isArray(stack)) return stack;
    if (stack === null || stack === undefined) return [];
    if (typeof stack === 'string') {
        try {
            const parsed = JSON.parse(stack);
            if (Array.isArray(parsed)) return parsed;
            return [String(parsed)];
        } catch {
            return stack.trim() ? [stack.trim()] : [];
        }
    }
    return [];
};

const Vagas: React.FC<VagasProps> = ({ 
    vagas = [], 
    clients = [], 
    usuariosCliente = [], 
    addVaga, 
    updateVaga, 
    deleteVaga 
}) => {
    // Estados do modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVaga, setEditingVaga] = useState<Vaga | null>(null);
    const [priorizacaoVagaId, setPriorizacaoVagaId] = useState<string | null>(null);
    const [priorizacaoVagaTitulo, setPriorizacaoVagaTitulo] = useState<string>('');
    
    // Estados dos filtros de header
    const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
    const [selectedGestorId, setSelectedGestorId] = useState<number | null>(null);
    
    // Estado do formulário - agora inclui gestor_cliente_id
    const [formData, setFormData] = useState<Partial<Vaga> & { gestor_cliente_id?: number | null }>({
        titulo: '', 
        descricao: '', 
        senioridade: 'Pleno', 
        stack_tecnologica: [], 
        status: 'aberta',
        cliente_id: null,
        gestor_cliente_id: null
    });
    const [techInput, setTechInput] = useState('');

    // ✅ Garantir que clients e usuariosCliente sejam sempre arrays
    const safeClients = Array.isArray(clients) ? clients : [];
    const safeUsuariosCliente = Array.isArray(usuariosCliente) ? usuariosCliente : [];
    const safeVagas = Array.isArray(vagas) ? vagas : [];

    // Filtrar gestores pelo cliente selecionado (header)
    const gestoresDoCliente = useMemo(() => {
        if (!selectedClientId) return [];
        return safeUsuariosCliente.filter(g => g.id_cliente === selectedClientId && g.ativo !== false);
    }, [selectedClientId, safeUsuariosCliente]);

    // Filtrar gestores pelo cliente do formulário (modal)
    const gestoresDoClienteForm = useMemo(() => {
        if (!formData.cliente_id) return [];
        return safeUsuariosCliente.filter(g => g.id_cliente === formData.cliente_id && g.ativo !== false);
    }, [formData.cliente_id, safeUsuariosCliente]);

    // Filtrar vagas pelo cliente selecionado
    const vagasFiltradas = useMemo(() => {
        if (!selectedClientId) return safeVagas;
        return safeVagas.filter(v => v.cliente_id === selectedClientId);
    }, [selectedClientId, safeVagas]);

    // ✅ Obter nome do cliente pelo ID - usa razao_social_cliente
    const getClientName = (clientId: number | null | undefined): string => {
        if (!clientId) return 'Não definido';
        const client = safeClients.find(c => c.id === clientId);
        return client?.razao_social_cliente || 'Cliente não encontrado';
    };

    // Obter nome do gestor pelo ID
    const getGestorName = (gestorId: number | null | undefined): string => {
        if (!gestorId) return '';
        const gestor = safeUsuariosCliente.find(g => g.id === gestorId);
        return gestor?.nome_gestor_cliente || '';
    };

    // Quando muda o cliente no header, limpa o gestor selecionado
    const handleClientChange = (clientId: number | null) => {
        setSelectedClientId(clientId);
        setSelectedGestorId(null);
    };

    // Quando muda o cliente no formulário, limpa o gestor selecionado no form
    const handleFormClientChange = (clientId: number | null) => {
        setFormData({
            ...formData,
            cliente_id: clientId,
            gestor_cliente_id: null // Limpa o gestor quando muda o cliente
        });
    };

    const openModal = (vaga?: Vaga) => {
        if (vaga) {
            setEditingVaga(vaga);
            setFormData({
                ...vaga,
                stack_tecnologica: ensureStackArray(vaga.stack_tecnologica),
                cliente_id: vaga.cliente_id || selectedClientId,
                gestor_cliente_id: (vaga as any).gestor_cliente_id || null
            });
        } else {
            setEditingVaga(null);
            setFormData({ 
                titulo: '', 
                descricao: '', 
                senioridade: 'Pleno', 
                stack_tecnologica: [], 
                status: 'aberta',
                cliente_id: selectedClientId,
                gestor_cliente_id: selectedGestorId
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validar se cliente foi selecionado
        if (!formData.cliente_id) {
            alert('Por favor, selecione um cliente para a vaga.');
            return;
        }
        
        if (editingVaga) {
            updateVaga({ ...editingVaga, ...formData } as Vaga);
        } else {
            addVaga(formData);
        }
        setIsModalOpen(false);
    };

    const addTech = () => {
        if (techInput && !formData.stack_tecnologica?.includes(techInput)) {
            setFormData({ ...formData, stack_tecnologica: [...(formData.stack_tecnologica || []), techInput] });
            setTechInput('');
        }
    };

    const removeTech = (techToRemove: string) => {
        setFormData({
            ...formData,
            stack_tecnologica: (formData.stack_tecnologica || []).filter(t => t !== techToRemove)
        });
    };

    // ✅ Ordenar clientes de forma segura - usa razao_social_cliente
    const sortedClients = useMemo(() => {
        return safeClients
            .filter(c => c && c.ativo_cliente !== false)
            .sort((a, b) => {
                const nameA = a?.razao_social_cliente || '';
                const nameB = b?.razao_social_cliente || '';
                return nameA.localeCompare(nameB);
            });
    }, [safeClients]);

    return (
        <div className="space-y-6">
            {/* Header com título e filtros */}
            <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Título */}
                    <h2 className="text-2xl font-bold text-gray-800">Gestão de Vagas</h2>
                    
                    {/* Filtros e botão */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        {/* Dropdown Cliente */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Cliente:</label>
                            <select
                                value={selectedClientId || ''}
                                onChange={(e) => handleClientChange(e.target.value ? Number(e.target.value) : null)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-w-[180px]"
                            >
                                <option value="">Todos os Clientes</option>
                                {sortedClients.map(client => (
                                    <option key={client.id} value={client.id}>
                                        {client.razao_social_cliente}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Dropdown Gestor do Cliente */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Gestor:</label>
                            <select
                                value={selectedGestorId || ''}
                                onChange={(e) => setSelectedGestorId(e.target.value ? Number(e.target.value) : null)}
                                disabled={!selectedClientId}
                                className={`border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-w-[180px] ${!selectedClientId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            >
                                <option value="">
                                    {selectedClientId 
                                        ? (gestoresDoCliente.length > 0 ? 'Selecione o Gestor' : 'Nenhum gestor cadastrado')
                                        : 'Selecione um cliente primeiro'
                                    }
                                </option>
                                {gestoresDoCliente.map(gestor => (
                                    <option key={gestor.id} value={gestor.id}>
                                        {gestor.nome_gestor_cliente} - {gestor.cargo_gestor || 'Gestor'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Botão Nova Vaga */}
                        <button 
                            onClick={() => openModal()} 
                            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors font-medium whitespace-nowrap"
                        >
                            + Nova Vaga
                        </button>
                    </div>
                </div>
                
                {/* Informação do filtro ativo */}
                {selectedClientId && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Filtrando por:</span>
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                            {getClientName(selectedClientId)}
                        </span>
                        {selectedGestorId && (
                            <>
                                <span className="text-gray-400">→</span>
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
                                    {getGestorName(selectedGestorId)}
                                </span>
                            </>
                        )}
                        <button 
                            onClick={() => { setSelectedClientId(null); setSelectedGestorId(null); }}
                            className="text-red-500 hover:text-red-700 ml-2"
                            title="Limpar filtros"
                        >
                            ✕ Limpar
                        </button>
                    </div>
                )}
            </div>

            {/* Grid de Vagas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vagasFiltradas.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm">
                        <p className="text-gray-500 text-lg">
                            {selectedClientId 
                                ? 'Nenhuma vaga encontrada para este cliente.' 
                                : 'Nenhuma vaga cadastrada. Clique em "+ Nova Vaga" para criar.'}
                        </p>
                    </div>
                ) : (
                    vagasFiltradas.map(vaga => {
                        const stackArray = ensureStackArray(vaga.stack_tecnologica);
                        
                        return (
                            <div key={vaga.id} className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-gray-800">{vaga.titulo}</h3>
                                    <span className={`px-2 py-1 rounded text-xs uppercase font-semibold ${
                                        vaga.status === 'aberta' ? 'bg-green-100 text-green-800' : 
                                        vaga.status === 'pausada' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                        {vaga.status}
                                    </span>
                                </div>
                                
                                {/* Cliente da Vaga */}
                                {vaga.cliente_id && (
                                    <div className="mb-2">
                                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                            📍 {getClientName(vaga.cliente_id)}
                                        </span>
                                    </div>
                                )}
                                
                                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{vaga.descricao}</p>
                                
                                <div className="mb-4">
                                    <span className="text-xs font-semibold text-gray-500">Stack:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {stackArray.length > 0 ? (
                                            stackArray.map(t => (
                                                <span key={t} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{t}</span>
                                            ))
                                        ) : (
                                            <span className="text-gray-400 text-xs italic">Não definida</span>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center pt-4 border-t">
                                    <span className="text-sm font-medium text-gray-500">{vaga.senioridade}</span>
                                    <div className="space-x-2">
                                        <button 
                                            onClick={() => { setPriorizacaoVagaId(vaga.id); setPriorizacaoVagaTitulo(vaga.titulo); }} 
                                            className="text-orange-600 hover:underline text-sm font-semibold"
                                        >
                                            🎯 Priorizar
                                        </button>
                                        <button onClick={() => openModal(vaga)} className="text-blue-600 hover:underline text-sm">Editar</button>
                                        <button onClick={() => deleteVaga(vaga.id)} className="text-red-600 hover:underline text-sm">Excluir</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal de Criação/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">{editingVaga ? 'Editar' : 'Nova'} Vaga</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            
                            {/* Cliente da Vaga */}
                            <div>
                                <label className="text-sm font-bold text-gray-700">Cliente *</label>
                                <select
                                    value={formData.cliente_id || ''}
                                    onChange={(e) => handleFormClientChange(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500"
                                    required
                                >
                                    <option value="">Selecione o Cliente</option>
                                    {sortedClients.map(client => (
                                        <option key={client.id} value={client.id}>
                                            {client.razao_social_cliente}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* ✅ Gestor do Cliente - NOVO */}
                            <div>
                                <label className="text-sm font-bold text-gray-700">Gestor do Cliente</label>
                                <select
                                    value={formData.gestor_cliente_id || ''}
                                    onChange={(e) => setFormData({...formData, gestor_cliente_id: e.target.value ? Number(e.target.value) : null})}
                                    disabled={!formData.cliente_id}
                                    className={`w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-orange-500 ${!formData.cliente_id ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                >
                                    <option value="">
                                        {formData.cliente_id 
                                            ? (gestoresDoClienteForm.length > 0 ? 'Selecione o Gestor (opcional)' : 'Nenhum gestor cadastrado para este cliente')
                                            : 'Selecione um cliente primeiro'
                                        }
                                    </option>
                                    {gestoresDoClienteForm.map(gestor => (
                                        <option key={gestor.id} value={gestor.id}>
                                            {gestor.nome_gestor_cliente} - {gestor.cargo_gestor || 'Gestor'}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Gestor responsável pela vaga no cliente</p>
                            </div>
                            
                            <input 
                                className="w-full border p-2 rounded" 
                                placeholder="Título da Vaga *" 
                                value={formData.titulo} 
                                onChange={e => setFormData({...formData, titulo: e.target.value})} 
                                required 
                            />
                            
                            <textarea 
                                className="w-full border p-2 rounded h-24" 
                                placeholder="Descrição da Vaga *" 
                                value={formData.descricao} 
                                onChange={e => setFormData({...formData, descricao: e.target.value})} 
                                required 
                            />
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-bold text-gray-700">Senioridade</label>
                                    <select 
                                        className="w-full border p-2 rounded mt-1" 
                                        value={formData.senioridade} 
                                        onChange={e => setFormData({...formData, senioridade: e.target.value as any})}
                                    >
                                        <option>Junior</option>
                                        <option>Pleno</option>
                                        <option>Senior</option>
                                        <option>Especialista</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-bold text-gray-700">Status</label>
                                    <select 
                                        className="w-full border p-2 rounded mt-1" 
                                        value={formData.status} 
                                        onChange={e => setFormData({...formData, status: e.target.value as any})}
                                    >
                                        <option value="aberta">Aberta</option>
                                        <option value="pausada">Pausada</option>
                                        <option value="fechada">Fechada</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-sm font-bold text-gray-700">Stack Tecnológica</label>
                                <div className="flex gap-2 mt-1">
                                    <input 
                                        className="border p-2 rounded flex-1" 
                                        value={techInput} 
                                        onChange={e => setTechInput(e.target.value)} 
                                        placeholder="Ex: React, Node.js, Python"
                                        onKeyPress={e => { if (e.key === 'Enter') { e.preventDefault(); addTech(); } }}
                                    />
                                    <button type="button" onClick={addTech} className="bg-gray-200 px-3 rounded hover:bg-gray-300">
                                        Adicionar
                                    </button>
                                </div>
                                <div className="flex gap-1 mt-2 flex-wrap">
                                    {(formData.stack_tecnologica || []).map(t => (
                                        <span 
                                            key={t} 
                                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm flex items-center gap-1"
                                        >
                                            {t}
                                            <button 
                                                type="button" 
                                                onClick={() => removeTech(t)}
                                                className="text-red-500 hover:text-red-700 font-bold ml-1"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="px-4 py-2 border rounded hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                                >
                                    Salvar Vaga
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Priorização */}
            {priorizacaoVagaId && (
                <VagaPriorizacaoManager
                    vagaId={priorizacaoVagaId}
                    vagaTitulo={priorizacaoVagaTitulo}
                    onClose={() => setPriorizacaoVagaId(null)}
                />
            )}
        </div>
    );
};

export default Vagas;
