/**
 * ComplianceDashboard.tsx - Dashboard de Compliance & Retenção
 * 
 * ✅ v3.0 - REFORMULAÇÃO COMPLETA
 * - Evolução do Sentimento com comparação Ano Atual vs Ano Anterior
 * - KPIs estratégicos de retenção
 * - Tarefas Críticas abaixo do gráfico de sentimento
 * - Campanhas suspensas (não exibidas)
 */

import React, { useMemo, useState } from 'react';
import { RHAction, FeedbackResponse, Consultant } from '@/types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, AreaChart, Area 
} from 'recharts';

// ============================================================================
// INTERFACES
// ============================================================================

interface FeedbackWithTemporal extends FeedbackResponse {
  month?: number;
  year?: number;
  source?: 'ai_analysis' | 'manual' | 'campaign';
}

interface CompDashProps {
  rhActions: RHAction[];
  feedbackResponses: FeedbackWithTemporal[];
  consultants?: Consultant[];
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

const ComplianceDashboard: React.FC<CompDashProps> = ({ 
  rhActions, 
  feedbackResponses,
  consultants = []
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // ============================================================================
  // CÁLCULOS DE SENTIMENT
  // ============================================================================

  /**
   * Deriva sentiment do score se não estiver definido
   */
  const deriveSentiment = (score: number): 'Positivo' | 'Neutro' | 'Negativo' => {
    if (score >= 7) return 'Positivo';
    if (score >= 4) return 'Neutro';
    return 'Negativo';
  };

  /**
   * Processa feedbacks garantindo que tenham sentiment
   */
  const processedFeedbacks = useMemo(() => {
    return feedbackResponses.map(fb => {
      const answeredDate = new Date(fb.answeredAt);
      return {
        ...fb,
        sentiment: fb.sentiment || deriveSentiment(fb.score),
        month: fb.month || (answeredDate.getMonth() + 1),
        year: fb.year || answeredDate.getFullYear()
      };
    });
  }, [feedbackResponses]);

  // ============================================================================
  // DADOS PARA GRÁFICOS
  // ============================================================================

  /**
   * Dados de sentimento por mês para um ano específico
   */
  const getSentimentByMonth = (year: number) => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const monthFeedbacks = processedFeedbacks.filter(
        fb => fb.year === year && fb.month === month
      );

      const positivo = monthFeedbacks.filter(fb => fb.sentiment === 'Positivo').length;
      const total = monthFeedbacks.length;
      const percentPositivo = total > 0 ? Math.round((positivo / total) * 100) : null;

      return {
        month,
        monthName: MONTH_NAMES[i],
        positivo,
        total,
        percentPositivo
      };
    });
  };

  /**
   * ✅ Dados para gráfico comparativo Ano Atual vs Ano Anterior
   */
  const yearComparisonData = useMemo(() => {
    const currentYearData = getSentimentByMonth(selectedYear);
    const previousYearData = getSentimentByMonth(selectedYear - 1);

    return Array.from({ length: 12 }, (_, i) => {
      return {
        month: `Mês ${i + 1}`,
        monthName: MONTH_NAMES[i],
        [`${selectedYear}`]: currentYearData[i].percentPositivo,
        [`${selectedYear - 1}`]: previousYearData[i].percentPositivo,
        currentYearTotal: currentYearData[i].total,
        previousYearTotal: previousYearData[i].total
      };
    });
  }, [processedFeedbacks, selectedYear]);

  // ============================================================================
  // KPIs
  // ============================================================================

  const kpis = useMemo(() => {
    const yearFeedbacks = processedFeedbacks.filter(fb => fb.year === selectedYear);
    const totalFeedbacks = yearFeedbacks.length;
    
    const positivos = yearFeedbacks.filter(fb => fb.sentiment === 'Positivo').length;
    const neutros = yearFeedbacks.filter(fb => fb.sentiment === 'Neutro').length;
    const negativos = yearFeedbacks.filter(fb => fb.sentiment === 'Negativo').length;
    
    const riscoAlto = yearFeedbacks.filter(fb => fb.riskLevel === 'Alto').length;
    const pendingActions = rhActions.filter(a => a.status === 'pendente').length;
    const highPriorityActions = rhActions.filter(a => a.status === 'pendente' && a.priority === 'alta').length;

    // Taxa de retenção (consultores ativos vs total)
    const totalConsultants = consultants.length;
    const activeConsultants = consultants.filter(c => c.status === 'Ativo').length;
    const retentionRate = totalConsultants > 0 
      ? Math.round((activeConsultants / totalConsultants) * 100) 
      : 0;

    // Tendência (comparando com mês anterior)
    const currentMonth = new Date().getMonth() + 1;
    const currentMonthFeedbacks = yearFeedbacks.filter(fb => fb.month === currentMonth);
    const prevMonthFeedbacks = yearFeedbacks.filter(fb => fb.month === currentMonth - 1);
    
    const currentPositiveRate = currentMonthFeedbacks.length > 0 
      ? currentMonthFeedbacks.filter(fb => fb.sentiment === 'Positivo').length / currentMonthFeedbacks.length 
      : 0;
    const prevPositiveRate = prevMonthFeedbacks.length > 0 
      ? prevMonthFeedbacks.filter(fb => fb.sentiment === 'Positivo').length / prevMonthFeedbacks.length 
      : 0;

    const trend = currentPositiveRate > prevPositiveRate ? 'up' 
                : currentPositiveRate < prevPositiveRate ? 'down' 
                : 'stable';

    return {
      totalFeedbacks,
      positivos,
      neutros,
      negativos,
      riscoAlto,
      pendingActions,
      highPriorityActions,
      retentionRate,
      percentPositivo: totalFeedbacks > 0 ? Math.round((positivos / totalFeedbacks) * 100) : 0,
      percentNegativo: totalFeedbacks > 0 ? Math.round((negativos / totalFeedbacks) * 100) : 0,
      trend
    };
  }, [processedFeedbacks, rhActions, consultants, selectedYear]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Compliance & Retenção</h2>
          <p className="text-gray-500 text-sm mt-1">
            Análise de sentimento e evolução dos consultores ao longo do tempo
          </p>
        </div>
        
        {/* Seletor de Ano */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Ano:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs - 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taxa de Retenção */}
        <div className="bg-white p-5 rounded-xl shadow-sm border-t-4 border-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Taxa de Retenção</p>
              <h3 className="text-3xl font-black text-blue-600 mt-1">{kpis.retentionRate}%</h3>
              <p className="text-xs text-gray-500 mt-1">Consultores ativos</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>

        {/* Feedbacks Positivos */}
        <div className="bg-white p-5 rounded-xl shadow-sm border-t-4 border-green-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Feedbacks Positivos</p>
              <h3 className="text-3xl font-black text-green-600 mt-1">{kpis.percentPositivo}%</h3>
              <p className="text-xs text-gray-500 mt-1">{kpis.positivos} de {kpis.totalFeedbacks} análises</p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <span className="text-2xl">😊</span>
            </div>
          </div>
        </div>

        {/* Risco Alto */}
        <div className="bg-white p-5 rounded-xl shadow-sm border-t-4 border-red-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Risco Alto</p>
              <h3 className="text-3xl font-black text-red-600 mt-1">{kpis.negativos}</h3>
              <p className="text-xs text-gray-500 mt-1">Feedbacks negativos</p>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <span className="text-2xl">⚠️</span>
            </div>
          </div>
        </div>

        {/* Ações Pendentes */}
        <div className="bg-white p-5 rounded-xl shadow-sm border-t-4 border-yellow-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ações Pendentes</p>
              <h3 className="text-3xl font-black text-yellow-600 mt-1">{kpis.pendingActions}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {kpis.highPriorityActions > 0 && (
                  <span className="text-red-500 font-semibold">{kpis.highPriorityActions} urgentes</span>
                )}
              </p>
            </div>
            <div className="p-2 bg-yellow-50 rounded-lg">
              <span className="text-2xl">📋</span>
            </div>
          </div>
        </div>
      </div>

      {/* GRÁFICO: Evolução do Sentimento - Ano Atual vs Ano Anterior */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-blue-600">
            Evolução do Sentimento (Ano Atual vs Ano Anterior)
          </h3>
          <p className="text-sm text-gray-500">
            % de feedbacks positivos ao longo dos meses. Compare {selectedYear} com {selectedYear - 1}.
          </p>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yearComparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="monthName" 
                tick={{ fontSize: 11, fill: '#6B7280' }}
                axisLine={{ stroke: '#D1D5DB' }}
              />
              <YAxis 
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 11, fill: '#6B7280' }}
                axisLine={{ stroke: '#D1D5DB' }}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  value !== null ? `${value}%` : 'Sem dados',
                  name
                ]}
                contentStyle={{ 
                  borderRadius: '8px', 
                  border: 'none', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)' 
                }}
              />
              <Legend />
              
              {/* Linha Ano Atual */}
              <Line 
                type="monotone" 
                dataKey={`${selectedYear}`}
                name={`${selectedYear} (Atual)`}
                stroke="#3B82F6" 
                strokeWidth={3}
                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 5 }}
                activeDot={{ r: 7 }}
                connectNulls={false}
              />
              
              {/* Linha Ano Anterior */}
              <Line 
                type="monotone" 
                dataKey={`${selectedYear - 1}`}
                name={`${selectedYear - 1} (Anterior)`}
                stroke="#F97316" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#F97316', strokeWidth: 2, r: 4 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda de Interpretação */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500"></div>
            <span><strong className="text-blue-600">{selectedYear}</strong>: Ano atual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-orange-500 border-dashed"></div>
            <span><strong className="text-orange-500">{selectedYear - 1}</strong>: Ano anterior (referência)</span>
          </div>
          <div className="ml-auto text-gray-400">
            💡 Quando a linha azul está acima da laranja, o desempenho está melhor que o ano anterior
          </div>
        </div>
      </div>

      {/* TAREFAS CRÍTICAS */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
            🔥 Tarefas Críticas
          </h3>
          <span className="text-xs font-medium bg-red-100 text-red-600 px-3 py-1 rounded-full">
            {rhActions.filter(a => a.status === 'pendente').length} pendentes
          </span>
        </div>
        
        <div className="overflow-x-auto max-h-80">
          {rhActions.filter(a => a.status === 'pendente').length > 0 ? (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Prioridade
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Origem
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rhActions
                  .filter(a => a.status === 'pendente')
                  .sort((a, b) => {
                    const priorityOrder = { alta: 0, media: 1, baixa: 2 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                  })
                  .map(action => (
                    <tr key={action.id} className="hover:bg-red-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-800">{action.description}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Criado em: {new Date(action.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-xs px-3 py-1 rounded-full font-semibold uppercase ${
                          action.priority === 'alta' 
                            ? 'bg-red-100 text-red-700' 
                            : action.priority === 'media'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {action.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded ${
                          action.origin === 'ai_feedback' 
                            ? 'bg-purple-100 text-purple-700'
                            : action.origin === 'ai_quarantine'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {action.origin === 'ai_feedback' ? '🤖 IA Feedback' 
                           : action.origin === 'ai_quarantine' ? '🔒 IA Quarentena'
                           : '✏️ Manual'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 font-medium">
                          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                          Pendente
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-12 text-center">
              <span className="text-4xl mb-3 block">✅</span>
              <p className="text-gray-500 font-medium">Nenhuma tarefa crítica pendente</p>
              <p className="text-gray-400 text-sm mt-1">Excelente! Todas as ações foram concluídas.</p>
            </div>
          )}
        </div>
      </div>

      {/* RESUMO DE SENTIMENTO - Cards menores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 p-4 rounded-lg border border-green-100">
          <div className="flex items-center gap-3">
            <span className="text-3xl">😊</span>
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase">Positivos</p>
              <p className="text-2xl font-bold text-green-700">{kpis.positivos}</p>
            </div>
          </div>
          <p className="text-xs text-green-600 mt-2">Score 1-2 (Excelente/Bom)</p>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
          <div className="flex items-center gap-3">
            <span className="text-3xl">😐</span>
            <div>
              <p className="text-xs font-semibold text-yellow-600 uppercase">Neutros</p>
              <p className="text-2xl font-bold text-yellow-700">{kpis.neutros}</p>
            </div>
          </div>
          <p className="text-xs text-yellow-600 mt-2">Score 3 (Atenção)</p>
        </div>

        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
          <div className="flex items-center gap-3">
            <span className="text-3xl">😟</span>
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase">Negativos</p>
              <p className="text-2xl font-bold text-red-700">{kpis.negativos}</p>
            </div>
          </div>
          <p className="text-xs text-red-600 mt-2">Score 4-5 (Alto Risco)</p>
        </div>
      </div>
    </div>
  );
};

export default ComplianceDashboard;
