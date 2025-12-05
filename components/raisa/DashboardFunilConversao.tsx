/**
 * Dashboard de Funil de Conversão RAISA
 * Mostra vagas abertas, CVs enviados e taxa de conversão
 */

import React, { useState, useEffect } from 'react';
import { buscarFunilConversao, DadosFunilConversao } from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardFunilConversao: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [dados, setDados] = useState<DadosFunilConversao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    const resultado = await buscarFunilConversao();
    setDados(resultado);
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

  // Calcular totais
  const totalVagas = dados.reduce((sum, d) => sum + d.vagas_abertas, 0);
  const totalCVs = dados.reduce((sum, d) => sum + d.cvs_enviados, 0);
  const totalAprovacoes = dados.reduce((sum, d) => sum + d.aprovacoes, 0);
  const taxaConversaoMedia = totalVagas > 0 ? ((totalAprovacoes / totalVagas) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">📊 Funil de Conversão</h2>
        <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Vagas Abertas</div>
          <div className="text-3xl font-bold text-orange-600">{totalVagas}</div>
          <div className="text-xs text-gray-500 mt-1">Total no período</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">CVs Enviados</div>
          <div className="text-3xl font-bold text-blue-600">{totalCVs}</div>
          <div className="text-xs text-gray-500 mt-1">Total de candidaturas</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Taxa de Conversão</div>
          <div className="text-3xl font-bold text-green-600">{taxaConversaoMedia}%</div>
          <div className="text-xs text-gray-500 mt-1">Aprovações / Vagas</div>
        </div>
      </div>

      {/* Gráfico de Linha - Evolução Temporal */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📈 Evolução Temporal</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dados.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo_formatado" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="vagas_abertas" stroke="#EA580C" name="Vagas Abertas" strokeWidth={2} />
            <Line type="monotone" dataKey="cvs_enviados" stroke="#3B82F6" name="CVs Enviados" strokeWidth={2} />
            <Line type="monotone" dataKey="aprovacoes" stroke="#10B981" name="Aprovações" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de Barras - Comparativo */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📊 Comparativo por Período</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dados.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo_formatado" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="vagas_abertas" fill="#EA580C" name="Vagas Abertas" />
            <Bar dataKey="cvs_enviados" fill="#3B82F6" name="CVs Enviados" />
            <Bar dataKey="aprovacoes" fill="#10B981" name="Aprovações" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DashboardFunilConversao;
