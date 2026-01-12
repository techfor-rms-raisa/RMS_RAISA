/**
 * Dashboard de Performance por Analista RAISA
 * Mostra ranking e métricas individuais dos analistas
 * 
 * v2.0 - Atualizado para separar performance REAL (aquisições) de indicações
 */

import React, { useState, useEffect } from 'react';
import { 
  buscarPerformanceAnalista, 
  buscarTopAnalistas, 
  buscarPerformanceAnalistaReal,
  buscarPerformanceComparativo,
  DadosPerformanceAnalista, 
  DadosTopAnalistas,
  DadosPerformanceComparativo
} from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Info, RefreshCw } from 'lucide-react';

type TipoVisao = 'completa' | 'real' | 'comparativo';

const DashboardPerformanceAnalista: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [tipoVisao, setTipoVisao] = useState<TipoVisao>('real');
  const [dados, setDados] = useState<DadosPerformanceAnalista[]>([]);
  const [dadosReal, setDadosReal] = useState<DadosPerformanceAnalista[]>([]);
  const [dadosComparativo, setDadosComparativo] = useState<DadosPerformanceComparativo[]>([]);
  const [topAnalistas, setTopAnalistas] = useState<DadosTopAnalistas[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [resultadoDados, resultadoTop, resultadoReal, resultadoComparativo] = await Promise.all([
        buscarPerformanceAnalista(),
        buscarTopAnalistas(),
        buscarPerformanceAnalistaReal(),
        buscarPerformanceComparativo()
      ]);
      setDados(resultadoDados);
      setTopAnalistas(resultadoTop);
      setDadosReal(resultadoReal);
      setDadosComparativo(resultadoComparativo);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-6 h-6 text-orange-600 animate-spin" />
        <span className="ml-3 text-gray-600 text-lg">Carregando dados...</span>
      </div>
    );
  }

  // Selecionar dados conforme tipo de visão
  const dadosExibir = tipoVisao === 'real' ? dadosReal : dados;

  // Preparar dados para o gráfico (top 10)
  const dadosGrafico = dadosExibir.slice(0, 10).map(d => ({
    nome: d.analista_nome,
    aprovacoes: d.total_aprovacoes,
    reprovacoes: d.total_reprovacoes,
    taxa: d.taxa_aprovacao
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🏆 Performance por Analista</h2>
          <p className="text-sm text-gray-500 mt-1">
            {tipoVisao === 'real' && '📊 Exibindo apenas aquisições próprias (sem indicações)'}
            {tipoVisao === 'completa' && '📊 Exibindo todos os candidatos (com indicações)'}
            {tipoVisao === 'comparativo' && '📊 Comparando performance Real vs Com Indicações'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
          <button 
            onClick={carregarDados}
            className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
            title="Atualizar"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Toggle de Tipo de Visão */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700">Tipo de Visualização</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTipoVisao('real')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tipoVisao === 'real'
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🎯 Performance Real
            <span className="block text-xs opacity-75">Apenas aquisições</span>
          </button>
          <button
            onClick={() => setTipoVisao('completa')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tipoVisao === 'completa'
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📊 Visão Completa
            <span className="block text-xs opacity-75">Com indicações</span>
          </button>
          <button
            onClick={() => setTipoVisao('comparativo')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tipoVisao === 'comparativo'
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ⚖️ Comparativo
            <span className="block text-xs opacity-75">Real vs Indicações</span>
          </button>
        </div>
      </div>

      {/* Conteúdo baseado no tipo de visão */}
      {tipoVisao === 'comparativo' ? (
        /* Tabela Comparativa */
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">
            ⚖️ Comparativo: Performance Real vs Com Indicações
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Analista</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aquisições</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Taxa Real</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Indicações</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Taxa c/ Indic.</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Diferença</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dadosComparativo.map((analista) => (
                  <tr key={analista.analista_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{analista.analista_nome}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-600">
                        {analista.aprovacoes_aquisicao}/{analista.total_aquisicao}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        analista.taxa_real >= 70 ? 'bg-green-100 text-green-800' :
                        analista.taxa_real >= 50 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {analista.taxa_real?.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className="text-sm text-amber-600 font-medium">
                        {analista.total_indicacoes > 0 ? `+${analista.total_indicacoes}` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-600">
                        {analista.taxa_com_indicacoes?.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        {analista.diferenca_taxa > 0 ? (
                          <>
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-600">+{analista.diferenca_taxa?.toFixed(1)}%</span>
                          </>
                        ) : analista.diferenca_taxa < 0 ? (
                          <>
                            <TrendingDown className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-red-600">{analista.diferenca_taxa?.toFixed(1)}%</span>
                          </>
                        ) : (
                          <>
                            <Minus className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-500">0%</span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Legenda */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>💡 Diferença:</strong> Mostra quanto a taxa do analista aumenta (+) ou diminui (-) 
              quando incluímos candidatos indicados pelo cliente. Uma diferença alta pode indicar que o 
              analista está recebendo muitas indicações que inflam artificialmente seus números.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Top 5 Analistas - Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {topAnalistas.slice(0, 5).map((analista) => (
              <div key={analista.analista_id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-xs text-gray-400 mb-1">#{analista.ranking}</div>
                <div className="text-sm font-semibold text-gray-800 mb-2 truncate" title={analista.analista_nome}>
                  {analista.analista_nome}
                </div>
                <div className="text-2xl font-bold text-orange-600">{analista.taxa_aprovacao?.toFixed(1)}%</div>
                <div className="text-xs text-gray-500 mt-1">{analista.total_aprovacoes} aprovações</div>
              </div>
            ))}
          </div>

          {/* Gráfico de Barras Horizontais */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              📊 Top 10 Analistas - Aprovações vs Reprovações
              {tipoVisao === 'real' && (
                <span className="text-sm font-normal text-amber-600 ml-2">(Apenas Aquisições)</span>
              )}
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={dadosGrafico} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={150} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="aprovacoes" fill="#10B981" name="Aprovações" />
                <Bar dataKey="reprovacoes" fill="#EF4444" name="Reprovações" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela Completa de Performance */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              📋 Ranking Completo de Analistas
              {tipoVisao === 'real' && (
                <span className="text-sm font-normal text-amber-600 ml-2">(Apenas Aquisições)</span>
              )}
            </h3>
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
                  {dadosExibir.map((analista) => (
                    <tr key={analista.analista_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{analista.analista_nome}</div>
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
                          {analista.taxa_aprovacao?.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {analista.tempo_medio_resposta?.toFixed(1) || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPerformanceAnalista;
