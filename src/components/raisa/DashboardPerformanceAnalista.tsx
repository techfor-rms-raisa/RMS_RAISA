/**
 * Dashboard de Performance por Analista RAISA
 * Mostra ranking e métricas individuais dos analistas
 */

import React, { useState, useEffect } from 'react';
import { buscarPerformanceAnalista, buscarTopAnalistas, DadosPerformanceAnalista, DadosTopAnalistas } from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardPerformanceAnalista: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [dados, setDados] = useState<DadosPerformanceAnalista[]>([]);
  const [topAnalistas, setTopAnalistas] = useState<DadosTopAnalistas[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    const [resultadoDados, resultadoTop] = await Promise.all([
      buscarPerformanceAnalista(),
      buscarTopAnalistas()
    ]);
    setDados(resultadoDados);
    setTopAnalistas(resultadoTop);
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
    nome: d.analista_nome,
    aprovacoes: d.total_aprovacoes,
    reprovacoes: d.total_reprovacoes,
    taxa: d.taxa_aprovacao
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">🏆 Performance por Analista</h2>
        <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
      </div>

      {/* Top 5 Analistas - Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {topAnalistas.map((analista, index) => (
          <div key={analista.analista_id} className="bg-white rounded-lg shadow p-4">
            <div className="text-xs text-gray-500 mb-1">#{analista.ranking}</div>
            <div className="text-sm font-semibold text-gray-800 mb-2 truncate">{analista.analista_nome}</div>
            <div className="text-2xl font-bold text-orange-600">{analista.taxa_aprovacao.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-1">{analista.total_aprovacoes} aprovações</div>
          </div>
        ))}
      </div>

      {/* Gráfico de Barras Horizontais */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📊 Top 10 Analistas - Aprovações vs Reprovações</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={dadosGrafico} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="nome" type="category" width={150} />
            <Tooltip />
            <Legend />
            <Bar dataKey="aprovacoes" fill="#10B981" name="Aprovações" />
            <Bar dataKey="reprovacoes" fill="#EF4444" name="Reprovações" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela Completa de Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📋 Ranking Completo de Analistas</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analista</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Envios</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aprovações</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reprovações</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxa Aprovação</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempo Médio (dias)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dados.map((analista, index) => (
                <tr key={analista.analista_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">{analista.analista_nome}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{analista.total_envios}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{analista.total_aprovacoes}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">{analista.total_reprovacoes}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      analista.taxa_aprovacao >= 70 ? 'bg-green-100 text-green-800' :
                      analista.taxa_aprovacao >= 50 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {analista.taxa_aprovacao.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{analista.tempo_medio_resposta.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPerformanceAnalista;
