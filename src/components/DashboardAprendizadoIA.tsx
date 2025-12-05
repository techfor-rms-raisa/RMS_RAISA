/**
 * COMPONENTE: DASHBOARD DE APRENDIZADO IA
 * Exibe análise mensal de decisões IA vs Humano
 */

import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Download
} from 'lucide-react';
import { 
  priorizacaoAprendizadoService, 
  RelatorioAprendizado 
} from '../services/priorizacaoAprendizadoService';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

export function DashboardAprendizadoIA() {
  const [relatorio, setRelatorio] = useState<RelatorioAprendizado | null>(null);
  const [loading, setLoading] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

  useEffect(() => {
    carregarRelatorio();
  }, [mesSelecionado, anoSelecionado]);

  const carregarRelatorio = async () => {
    setLoading(true);
    try {
      const relatorioMensal = await priorizacaoAprendizadoService.gerarRelatorioMensal(
        mesSelecionado,
        anoSelecionado
      );
      setRelatorio(relatorioMensal);
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportarRelatorio = () => {
    if (!relatorio) return;
    
    const json = JSON.stringify(relatorio, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-aprendizado-ia-${relatorio.periodo}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Gerando relatório de aprendizado...</p>
        </div>
      </div>
    );
  }

  if (!relatorio) {
    return (
      <div className="text-center py-12">
        <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Nenhum dado disponível para o período selecionado.</p>
      </div>
    );
  }

  // Dados para gráficos
  const dadosComparacao = [
    {
      nome: 'IA',
      'Taxa de Sucesso': relatorio.taxa_sucesso_ia,
      'Decisões': relatorio.total_vagas_analisadas - relatorio.total_decisoes_humanas
    },
    {
      nome: 'Humano',
      'Taxa de Sucesso': relatorio.taxa_sucesso_humano,
      'Decisões': relatorio.total_decisoes_humanas
    }
  ];

  const dadosConcordancia = [
    { name: 'Concordou com IA', value: relatorio.total_vagas_analisadas - relatorio.total_decisoes_humanas },
    { name: 'Alterou Priorização', value: relatorio.total_decisoes_humanas }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Dashboard de Aprendizado IA
            </h2>
            <p className="text-sm text-gray-500">
              Análise comparativa: Decisões da IA vs Decisões Humanas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de Período */}
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <select
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => (
                <option key={mes} value={mes}>
                  {new Date(2024, mes - 1).toLocaleDateString('pt-BR', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[2024, 2025, 2026].map(ano => (
                <option key={ano} value={ano}>{ano}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportarRelatorio}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Vagas Analisadas */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Vagas Analisadas</span>
            <Target className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {relatorio.total_vagas_analisadas}
          </div>
        </div>

        {/* Taxa de Concordância */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Taxa de Concordância</span>
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {relatorio.taxa_concordancia.toFixed(1)}%
          </div>
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
            {relatorio.taxa_concordancia >= 80 ? (
              <TrendingUp className="w-4 h-4 text-green-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-600" />
            )}
            <span>
              {relatorio.total_vagas_analisadas - relatorio.total_decisoes_humanas} de {relatorio.total_vagas_analisadas}
            </span>
          </div>
        </div>

        {/* Taxa de Sucesso IA */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">Taxa de Sucesso IA</span>
            <Brain className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-blue-600">
            {relatorio.taxa_sucesso_ia.toFixed(1)}%
          </div>
          <div className="mt-2 text-sm text-blue-700">
            {relatorio.total_vagas_fechadas - relatorio.total_decisoes_humanas} vagas
          </div>
        </div>

        {/* Taxa de Sucesso Humano */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-900">Taxa de Sucesso Humano</span>
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-3xl font-bold text-purple-600">
            {relatorio.taxa_sucesso_humano.toFixed(1)}%
          </div>
          <div className="mt-2 text-sm text-purple-700">
            {relatorio.total_decisoes_humanas} decisões manuais
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Comparação */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Comparação: IA vs Humano
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosComparacao}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Taxa de Sucesso" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Concordância */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Distribuição de Decisões
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dadosConcordancia}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {dadosConcordancia.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600" />
          Insights e Recomendações
        </h3>
        <div className="space-y-3">
          {relatorio.insights.map((insight, index) => (
            <div 
              key={index}
              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <p className="text-sm text-gray-700">{insight}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela de Decisões Humanas */}
      {relatorio.decisoes_humanas.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Decisões Manuais (Alterações de Priorização)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Vaga</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">IA Sugeriu</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Humano Decidiu</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Data</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.decisoes_humanas
                  .filter(d => d.foi_alterado)
                  .slice(0, 10)
                  .map((decisao, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {decisao.vaga_titulo}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                          decisao.nivel_ia === 'Alta' ? 'bg-red-100 text-red-700' :
                          decisao.nivel_ia === 'Média' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {decisao.nivel_ia} ({decisao.score_ia})
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                          decisao.nivel_humano === 'Alta' ? 'bg-red-100 text-red-700' :
                          decisao.nivel_humano === 'Média' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {decisao.nivel_humano} ({decisao.score_humano})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {new Date(decisao.data_decisao).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
