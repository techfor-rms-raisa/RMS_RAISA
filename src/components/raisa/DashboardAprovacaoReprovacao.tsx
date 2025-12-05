/**
 * Dashboard de Aprovação vs Reprovação RAISA
 * Mostra taxa de aprovação, reprovação e motivos
 */

import React, { useState, useEffect } from 'react';
import { buscarAprovacaoReprovacao, buscarMotivosReprovacao, DadosAprovacaoReprovacao, DadosMotivosReprovacao } from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardAprovacaoReprovacao: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [dados, setDados] = useState<DadosAprovacaoReprovacao[]>([]);
  const [motivos, setMotivos] = useState<DadosMotivosReprovacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    const [resultadoDados, resultadoMotivos] = await Promise.all([
      buscarAprovacaoReprovacao(),
      buscarMotivosReprovacao()
    ]);
    setDados(resultadoDados);
    setMotivos(resultadoMotivos);
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
  const totalRespostas = dados.reduce((sum, d) => sum + d.total_respostas, 0);
  const totalAprovacoes = dados.reduce((sum, d) => sum + d.aprovacoes, 0);
  const totalReprovacoes = dados.reduce((sum, d) => sum + d.reprovacoes, 0);
  const taxaAprovacaoMedia = totalRespostas > 0 ? ((totalAprovacoes / totalRespostas) * 100).toFixed(1) : '0.0';

  // Dados para o gráfico de pizza
  const dadosPizza = [
    { name: 'Aprovações', value: totalAprovacoes, color: '#10B981' },
    { name: 'Reprovações', value: totalReprovacoes, color: '#EF4444' }
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">✅ Aprovação vs Reprovação</h2>
        <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Total de Respostas</div>
          <div className="text-3xl font-bold text-gray-800">{totalRespostas}</div>
          <div className="text-xs text-gray-500 mt-1">Período selecionado</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Aprovações</div>
          <div className="text-3xl font-bold text-green-600">{totalAprovacoes}</div>
          <div className="text-xs text-gray-500 mt-1">Candidatos aprovados</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Reprovações</div>
          <div className="text-3xl font-bold text-red-600">{totalReprovacoes}</div>
          <div className="text-xs text-gray-500 mt-1">Candidatos reprovados</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Taxa de Aprovação</div>
          <div className="text-3xl font-bold text-orange-600">{taxaAprovacaoMedia}%</div>
          <div className="text-xs text-gray-500 mt-1">Média do período</div>
        </div>
      </div>

      {/* Gráficos em Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Área Empilhada */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">📈 Evolução Temporal</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dados.slice().reverse()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo_formatado" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="aprovacoes" stackId="1" stroke="#10B981" fill="#10B981" name="Aprovações" />
              <Area type="monotone" dataKey="reprovacoes" stackId="1" stroke="#EF4444" fill="#EF4444" name="Reprovações" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Pizza */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">🥧 Distribuição Geral</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dadosPizza}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {dadosPizza.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de Motivos de Reprovação */}
      {motivos.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">📋 Principais Motivos de Reprovação</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantidade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentual</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {motivos.map((motivo, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{motivo.motivo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{motivo.quantidade}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{motivo.percentual.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardAprovacaoReprovacao;
