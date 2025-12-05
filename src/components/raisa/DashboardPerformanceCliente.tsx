/**
 * Dashboard de Performance por Cliente RAISA
 * Mostra métricas e ranking dos clientes
 */

import React, { useState, useEffect } from 'react';
import { buscarPerformanceCliente, buscarTopClientes, DadosPerformanceCliente, DadosTopClientes } from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardPerformanceCliente: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [dados, setDados] = useState<DadosPerformanceCliente[]>([]);
  const [topClientes, setTopClientes] = useState<DadosTopClientes[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    const [resultadoDados, resultadoTop] = await Promise.all([
      buscarPerformanceCliente(),
      buscarTopClientes()
    ]);
    setDados(resultadoDados);
    setTopClientes(resultadoTop);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600 text-lg">⏳ Carregando dados...</div>
      </div>
    );
  }

  if (dados.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500 text-lg">📊 Nenhum dado disponível</div>
      </div>
    );
  }

  // Preparar dados para o gráfico (top 10)
  const dadosGrafico = dados.slice(0, 10).map(d => ({
    nome: d.cliente_nome.length > 20 ? d.cliente_nome.substring(0, 20) + '...' : d.cliente_nome,
    vagas: d.total_vagas,
    envios: d.total_envios,
    aprovacoes: d.total_aprovacoes,
    taxa: d.taxa_aprovacao
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">🏢 Performance por Cliente</h2>
        <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
      </div>

      {/* Top 5 Clientes - Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {topClientes.map((cliente, index) => (
          <div key={cliente.cliente_id} className="bg-white rounded-lg shadow p-4">
            <div className="text-xs text-gray-500 mb-1">#{index + 1}</div>
            <div className="text-sm font-semibold text-gray-800 mb-2 truncate" title={cliente.cliente_nome}>
              {cliente.cliente_nome}
            </div>
            <div className="text-2xl font-bold text-orange-600">{cliente.taxa_aprovacao.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-1">{cliente.total_vagas} vagas</div>
          </div>
        ))}
      </div>

      {/* Gráfico de Barras */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📊 Top 10 Clientes - Vagas e Aprovações</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nome" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="vagas" fill="#EA580C" name="Vagas Abertas" />
            <Bar dataKey="envios" fill="#3B82F6" name="CVs Enviados" />
            <Bar dataKey="aprovacoes" fill="#10B981" name="Aprovações" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela Completa de Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📋 Ranking Completo de Clientes</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vagas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Envios</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aprovações</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reprovações</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxa Aprovação</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempo Médio (dias)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dados.map((cliente, index) => (
                <tr key={cliente.cliente_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{cliente.cliente_nome}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cliente.total_vagas}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cliente.total_envios}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{cliente.total_aprovacoes}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">{cliente.total_reprovacoes}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      cliente.taxa_aprovacao >= 70 ? 'bg-green-100 text-green-800' :
                      cliente.taxa_aprovacao >= 50 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {cliente.taxa_aprovacao.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cliente.tempo_medio_resposta.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPerformanceCliente;
