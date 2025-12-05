/**
 * Dashboard de Performance Geral RAISA
 * Visão 360° com todos os KPIs principais
 */

import React, { useState, useEffect } from 'react';
import { buscarKPIsPrincipais, buscarTopClientes, buscarTopAnalistas, buscarMotivosReprovacao, DadosKPIPrincipais, DadosTopClientes, DadosTopAnalistas, DadosMotivosReprovacao } from '../../services/dashboardRaisaService';
import FiltroTemporal from './FiltroTemporal';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardPerformanceGeral: React.FC = () => {
  const [filtroTemporal, setFiltroTemporal] = useState('mes');
  const [kpis, setKpis] = useState<DadosKPIPrincipais | null>(null);
  const [topClientes, setTopClientes] = useState<DadosTopClientes[]>([]);
  const [topAnalistas, setTopAnalistas] = useState<DadosTopAnalistas[]>([]);
  const [motivos, setMotivos] = useState<DadosMotivosReprovacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [filtroTemporal]);

  const carregarDados = async () => {
    setLoading(true);
    const [resultadoKPIs, resultadoClientes, resultadoAnalistas, resultadoMotivos] = await Promise.all([
      buscarKPIsPrincipais(),
      buscarTopClientes(),
      buscarTopAnalistas(),
      buscarMotivosReprovacao()
    ]);
    setKpis(resultadoKPIs);
    setTopClientes(resultadoClientes);
    setTopAnalistas(resultadoAnalistas);
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

  if (!kpis) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500 text-lg">📊 Nenhum dado disponível</div>
      </div>
    );
  }

  // Preparar dados para o gráfico de pizza de motivos
  const dadosPizzaMotivos = motivos.slice(0, 5).map(m => ({
    name: m.motivo,
    value: m.quantidade
  }));

  const COLORS = ['#EA580C', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800">📈 Performance Geral (Visão 360°)</h2>
        <FiltroTemporal filtroAtual={filtroTemporal} onFiltroChange={setFiltroTemporal} />
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Vagas Abertas</div>
          <div className="text-3xl font-bold text-orange-600">{kpis.total_vagas_abertas}</div>
          <div className="text-xs text-gray-500 mt-1">Total no período</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">CVs Enviados</div>
          <div className="text-3xl font-bold text-blue-600">{kpis.total_cvs_enviados}</div>
          <div className="text-xs text-gray-500 mt-1">Candidaturas enviadas</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Taxa de Conversão</div>
          <div className="text-3xl font-bold text-green-600">{kpis.taxa_conversao_geral.toFixed(1)}%</div>
          <div className="text-xs text-gray-500 mt-1">Aprovações / Vagas</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Taxa de Aprovação</div>
          <div className="text-3xl font-bold text-purple-600">{kpis.taxa_aprovacao_geral.toFixed(1)}%</div>
          <div className="text-xs text-gray-500 mt-1">Aprovações / Respostas</div>
        </div>
      </div>

      {/* Segunda Linha de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Aprovações</div>
          <div className="text-3xl font-bold text-green-600">{kpis.total_aprovacoes}</div>
          <div className="text-xs text-gray-500 mt-1">Candidatos aprovados</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Reprovações</div>
          <div className="text-3xl font-bold text-red-600">{kpis.total_reprovacoes}</div>
          <div className="text-xs text-gray-500 mt-1">Candidatos reprovados</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">Tempo Médio</div>
          <div className="text-3xl font-bold text-indigo-600">{kpis.tempo_medio_resposta_dias.toFixed(1)}</div>
          <div className="text-xs text-gray-500 mt-1">Dias para resposta</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-2">No Prazo</div>
          <div className="text-3xl font-bold text-teal-600">{kpis.percentual_no_prazo.toFixed(1)}%</div>
          <div className="text-xs text-gray-500 mt-1">Respostas no prazo</div>
        </div>
      </div>

      {/* Grid de Tabelas e Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Clientes */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">🏢 Top 5 Clientes</h3>
          <div className="space-y-3">
            {topClientes.map((cliente, index) => (
              <div key={cliente.cliente_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-orange-600">#{index + 1}</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{cliente.cliente_nome}</div>
                    <div className="text-xs text-gray-500">{cliente.total_vagas} vagas • {cliente.total_envios} envios</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">{cliente.taxa_aprovacao.toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">{cliente.total_aprovacoes} aprovações</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Analistas */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">🏆 Top 5 Analistas</h3>
          <div className="space-y-3">
            {topAnalistas.map((analista, index) => (
              <div key={analista.analista_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-orange-600">#{analista.ranking}</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{analista.analista_nome}</div>
                    <div className="text-xs text-gray-500">{analista.total_envios} envios</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">{analista.taxa_aprovacao.toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">{analista.total_aprovacoes} aprovações</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico de Pizza - Motivos de Reprovação */}
      {motivos.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">🥧 Top 5 Motivos de Reprovação</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dadosPizzaMotivos}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {dadosPizzaMotivos.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default DashboardPerformanceGeral;
