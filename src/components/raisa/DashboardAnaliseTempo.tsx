/**
 * Dashboard de Análise de Tempo RAISA
 * Mostra métricas de tempo de resposta e SLA
 */

import React, { useState, useEffect } from 'react';
import { buscarAnaliseTempo, DadosAnaliseTempo } from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardAnaliseTempo: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [dados, setDados] = useState<DadosAnaliseTempo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    const resultado = await buscarAnaliseTempo();
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

  // Calcular médias gerais
  const tempoMedioGeral = dados.reduce((sum, d) => sum + d.tempo_medio_resposta_dias, 0) / dados.length;
  const percentualNoPrazoGeral = dados.reduce((sum, d) => sum + d.percentual_no_prazo, 0) / dados.length;
  const totalRespostas = dados.reduce((sum, d) => sum + d.total_respostas, 0);
  
  // Encontrar extremos
  const tempoMinimo = Math.min(...dados.map(d => d.tempo_minimo_dias));
  const tempoMaximo = Math.max(...dados.map(d => d.tempo_maximo_dias));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">⏱️ Análise de Tempo de Resposta</h2>
        <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Tempo Médio</div>
          <div className="text-3xl font-bold text-orange-600">{tempoMedioGeral.toFixed(1)}</div>
          <div className="text-xs text-gray-500 mt-1">Dias para resposta</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Tempo Mínimo</div>
          <div className="text-3xl font-bold text-green-600">{tempoMinimo.toFixed(1)}</div>
          <div className="text-xs text-gray-500 mt-1">Melhor tempo registrado</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Tempo Máximo</div>
          <div className="text-3xl font-bold text-red-600">{tempoMaximo.toFixed(1)}</div>
          <div className="text-xs text-gray-500 mt-1">Pior tempo registrado</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">% No Prazo</div>
          <div className="text-3xl font-bold text-blue-600">{percentualNoPrazoGeral.toFixed(1)}%</div>
          <div className="text-xs text-gray-500 mt-1">Respostas dentro do SLA</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Total Respostas</div>
          <div className="text-3xl font-bold text-purple-600">{totalRespostas}</div>
          <div className="text-xs text-gray-500 mt-1">Período analisado</div>
        </div>
      </div>

      {/* Gráfico de Linha - Evolução do Tempo Médio */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📈 Evolução do Tempo Médio de Resposta</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dados.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo_formatado" />
            <YAxis label={{ value: 'Dias', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="tempo_medio_resposta_dias" stroke="#EA580C" name="Tempo Médio" strokeWidth={2} />
            <Line type="monotone" dataKey="tempo_minimo_dias" stroke="#10B981" name="Tempo Mínimo" strokeWidth={2} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="tempo_maximo_dias" stroke="#EF4444" name="Tempo Máximo" strokeWidth={2} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de Barras - Percentual no Prazo */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">✅ Percentual de Respostas no Prazo</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dados.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo_formatado" />
            <YAxis label={{ value: 'Percentual (%)', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="percentual_no_prazo" fill="#3B82F6" name="% No Prazo" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela Detalhada */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">📋 Detalhamento por Período</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Período</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempo Médio (dias)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempo Mínimo (dias)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tempo Máximo (dias)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% No Prazo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Respostas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dados.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.periodo_formatado}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.tempo_medio_resposta_dias.toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">{item.tempo_minimo_dias.toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">{item.tempo_maximo_dias.toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      item.percentual_no_prazo >= 80 ? 'bg-green-100 text-green-800' :
                      item.percentual_no_prazo >= 60 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {item.percentual_no_prazo.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.total_respostas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnaliseTempo;
