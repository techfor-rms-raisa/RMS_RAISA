import React, { useState, useMemo } from 'react';
import { Vaga, Cliente, User } from '@/types';

interface VagasConsultarProps {
    vagas: Vaga[];
    clientes: Cliente[];
    users: User[];
    updateVaga: (v: Vaga) => void;
    deleteVaga: (id: string) => void;
}

const VagasConsultar: React.FC<VagasConsultarProps> = ({ vagas, clientes, users, updateVaga, deleteVaga }) => {
    const [filtroCliente, setFiltroCliente] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    const vagasFiltradas = useMemo(() => {
        return vagas.filter(vaga => {
            const matchCliente = filtroCliente ? vaga.cliente_id?.toString() === filtroCliente : true;
            const matchStatus = filtroStatus ? vaga.status === filtroStatus : true;
            return matchCliente && matchStatus;
        });
    }, [vagas, filtroCliente, filtroStatus]);

    const parseStackTecnologica = (stack: any): string[] => {
        if (Array.isArray(stack)) return stack;
        if (typeof stack === 'string') {
            if (stack.startsWith('{') && stack.endsWith('}')) {
                return stack.substring(1, stack.length - 1).split(',').filter(t => t.trim() !== '');
            }
            return stack.split(',').filter(t => t.trim() !== '');
        }
        return [];
    };

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Consultar Vagas</h1>
            
            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-white rounded-lg shadow">
                <select 
                    className="p-2 border rounded bg-white"
                    value={filtroCliente}
                    onChange={e => setFiltroCliente(e.target.value)}
                >
                    <option value="">Todos os Clientes</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_cliente}</option>)}
                </select>
                <select 
                    className="p-2 border rounded bg-white"
                    value={filtroStatus}
                    onChange={e => setFiltroStatus(e.target.value)}
                >
                    <option value="">Todos os Status</option>
                    <option value="aberta">Aberta</option>
                    <option value="fechada">Fechada</option>
                    <option value="pausada">Pausada</option>
                    <option value="cancelada">Cancelada</option>
                </select>
            </div>

            {/* Lista de Vagas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vagasFiltradas.map(vaga => (
                    <div key={vaga.id} className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800">{vaga.titulo}</h3>
                            <span className={`px-2 py-1 rounded text-xs uppercase ${vaga.status === 'aberta' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                                {vaga.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{vaga.descricao}</p>
                        <div className="mb-4">
                            <span className="text-xs font-semibold text-gray-500">Stack:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {parseStackTecnologica(vaga.stack_tecnologica).map(t => (
                                    <span key={t} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{t}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t">
                            <span className="text-sm font-medium text-gray-500">{vaga.senioridade}</span>
                            <div className="space-x-2">
                                <button onClick={() => { /* Lógica para editar */ }} className="text-blue-600 hover:underline text-sm">Editar</button>
                                <button onClick={() => deleteVaga(vaga.id)} className="text-red-600 hover:underline text-sm">Excluir</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VagasConsultar;
