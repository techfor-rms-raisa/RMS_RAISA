/**
 * DashboardIndicacoes.tsx - RMS RAISA
 * Dashboard exclusivo para candidatos indicados pelo cliente
 * 
 * Mostra métricas e análises de indicações separadas das aquisições
 * para garantir métricas de performance justas para os analistas.
 * 
 * Data: 12/01/2026
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, TrendingUp, Building2, CheckCircle, XCircle, Clock,
  UserPlus, Award, BarChart3, RefreshCw
} from 'lucide-react';
import { 
  buscarIndicacoesResumo, 
  buscarIndicacoesPorCliente, 
  buscarKPIsIndicacoes,
  DadosIndicacoesResumo,
  DadosIndicacoesPorCliente,
  DadosKPIsIndicacoes
} from '../../services/dashboardRaisaService';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import FiltroTemporal from './FiltroTemporal';

// Cores para gráficos
const COLORS = ['#F59E0B', '#10B981', '#EF4444', '#6366F1', '#8B5CF6'];

const DashboardIndicacoes: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [kpis, setKpis] = useState<DadosKPIsIndicacoes | null>(null);
  const [resumoMensal, setResumoMensal] = useState<DadosIndicacoesResumo[]>([]);
  const [porCliente, setPorCliente] = useState<DadosIndicacoesPorCliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [kpisData, resumoData, clienteData] = await Promise.all([
        buscarKPIsIndicacoes(),
        buscarIndicacoesResumo(),
        buscarIndicacoesPorCliente()
      ]);
      
      setKpis(kpisData);
      setResumoMensal(resumoData);
      setPorCliente(clienteData);
    } catch (error) {
      console.error('Erro ao carregar dados de indicações:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
        <span className="ml-3 text-gray-600 text-lg">Carregando dados de indicações...</span>
      </div>
    );
  }

  // Preparar dados para gráfico de pizza
  const dadosPizza = kpis ? [
    { name: 'Contratadas', value: kpis.indicacoes_contratadas, color: '#10B981' },
    { name: 'Em Andamento', value: kpis.indicacoes_em_andamento, color: '#F59E0B' },
    { name: 'Reprovadas', value: kpis.indicacoes_reprovadas, color: '#EF4444' }
  ].filter(d => d.value > 0) : [];

  // Preparar dados para gráfico de linha (evolução mensal)
  const dadosEvolucao = [...resumoMensal].reverse().map(r => ({
    periodo: r.periodo_formatado,
    indicacoes: r.total_indicacoes,
    aprovadas: r.indicacoes_aprovadas,
    taxa: r.taxa_conversao_indicacao
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UserPlus className="w-7 h-7 text-amber-600" />
            Dashboard de Indicações
          </h2>
          <p className="text-gray-500 mt-1">
            Candidatos indicados pelo cliente (não contam na performance do analista)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
          <button 
            onClick={carregarDados}
            className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Indicações */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Indicações</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">
                {kpis?.total_indicacoes || 0}
              </p>
            </div>
            <div className="p-3 bg-amber-100 rounded-xl">
              <Users className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {kpis?.clientes_que_indicaram || 0} clientes indicaram
          </p>
        </div>

        {/* Contratadas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Contratadas</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {kpis?.indicacoes_contratadas || 0}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Indicações que viraram contratações
          </p>
        </div>

        {/* Em Andamento */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Em Andamento</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                {kpis?.indicacoes_em_andamento || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Aguardando decisão
          </p>
        </div>

        {/* Taxa de Conversão */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Taxa Conversão</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">
                {kpis?.taxa_conversao_indicacoes?.toFixed(1) || 0}%
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-xl">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Indicações → Contratações
          </p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição de Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            Distribuição de Indicações
          </h3>
          {dadosPizza.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={dadosPizza}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                >
                  {dadosPizza.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              Nenhuma indicação registrada
            </div>
          )}
        </div>

        {/* Evolução Mensal */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-600" />
            Evolução Mensal
          </h3>
          {dadosEvolucao.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dadosEvolucao}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="indicacoes" 
                  stroke="#F59E0B" 
                  strokeWidth={2}
                  name="Total Indicações"
                  dot={{ fill: '#F59E0B' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="aprovadas" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  name="Aprovadas"
                  dot={{ fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>

      {/* Top Clientes que Indicam */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-amber-600" />
          Top Clientes que Indicam
        </h3>
        
        {porCliente.length > 0 ? (
          <>
            {/* Gráfico de Barras */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porCliente.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis 
                  dataKey="cliente_nome" 
                  type="category" 
                  width={180} 
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_indicacoes" fill="#F59E0B" name="Total Indicações" />
                <Bar dataKey="indicacoes_contratadas" fill="#10B981" name="Contratadas" />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabela Detalhada */}
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Indicações
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contratadas
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reprovadas
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Taxa Sucesso
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {porCliente.map((cliente) => (
                    <tr key={cliente.cliente_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {cliente.cliente_nome}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="text-sm font-semibold text-amber-600">
                          {cliente.total_indicacoes}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="text-sm font-semibold text-green-600">
                          {cliente.indicacoes_contratadas}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="text-sm font-semibold text-red-600">
                          {cliente.indicacoes_reprovadas}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          cliente.taxa_sucesso_indicacao >= 80 ? 'bg-green-100 text-green-800' :
                          cliente.taxa_sucesso_indicacao >= 50 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {cliente.taxa_sucesso_indicacao?.toFixed(1) || 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Building2 className="w-12 h-12 mb-3 opacity-50" />
            <p>Nenhuma indicação de cliente registrada</p>
            <p className="text-sm mt-1">As indicações aparecerão aqui quando forem cadastradas</p>
          </div>
        )}
      </div>

      {/* Alerta Informativo */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Award className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-amber-800">Sobre Indicações</h4>
            <p className="text-sm text-amber-700 mt-1">
              Candidatos indicados pelo cliente <strong>não são contabilizados</strong> na performance 
              dos analistas, pois não houve esforço de aquisição. Para ver a performance real dos 
              analistas, utilize o Dashboard de Performance com o filtro "Apenas Aquisições".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardIndicacoes;
