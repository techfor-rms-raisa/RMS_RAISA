import React, { useState, useMemo } from 'react';
import { Vaga, Cliente, User } from '@/types';

interface DashboardVagasProps {
    vagas: Vaga[];
    clientes: Cliente[];
    users: User[];
}

const DashboardVagas: React.FC<DashboardVagasProps> = ({ vagas, clientes, users }) => {
    const [filtroCliente, setFiltroCliente] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    const vagasFiltradas = useMemo(() => {
        return vagas.filter(vaga => {
            const matchCliente = filtroCliente ? vaga.cliente_id?.toString() === filtroCliente : true;
            const matchStatus = filtroStatus ? vaga.status === filtroStatus : true;
            return matchCliente && matchStatus;
        });
    }, [vagas, filtroCliente, filtroStatus]);

    const totalVagas = vagas.length;
    const vagasAbertas = vagas.filter(v => v.status === 'aberta').length;
    const vagasFechadas = vagas.filter(v => v.status === 'fechada').length;

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard de Vagas</h1>

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
                {/* Outros filtros podem ser adicionados aqui */}
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-4 rounded-lg shadow text-center">
                    <h3 className="text-4xl font-bold text-blue-600">{totalVagas}</h3>
                    <p className="text-gray-500">Total de Vagas</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow text-center">
                    <h3 className="text-4xl font-bold text-green-600">{vagasAbertas}</h3>
                    <p className="text-gray-500">Vagas Abertas</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow text-center">
                    <h3 className="text-4xl font-bold text-red-600">{vagasFechadas}</h3>
                    <p className="text-gray-500">Vagas Fechadas</p>
                </div>
            </div>

            {/* Lista de Vagas */}
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">Lista de Vagas</h2>
                {/* A lista de vagas será adicionada aqui */}
                <p>{vagasFiltradas.length} vagas encontradas.</p>
            </div>
        </div>
    );
};

export default DashboardVagas;
