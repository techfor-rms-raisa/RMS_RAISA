/**
 * DashboardRaisaMetrics.tsx - Dashboard Principal de KPIs RAISA
 * 
 * Funcionalidades:
 * - Cards de resumo
 * - Gráfico de evolução mensal
 * - Alertas e vagas na sombra
 * - Performance por analista
 * - Performance por cliente
 * - Funil de conversão
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { useRaisaMetrics, VagaSombra, PerformanceAnalista, PerformanceCliente, EtapaFunil, Alerta } from '@/hooks/Supabase/useRaisaMetrics';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const DashboardRaisaMetrics: React.FC = () => {
  const {
    loading,
    resumo,
    vagasSombra,
    performanceAnalistas,
    performanceClientes,
    funil,
    evolucao,
    alertas,
    carregarTudo
  } = useRaisaMetrics();

  const [tab, setTab] = useState<'geral' | 'analistas' | 'clientes' | 'alertas'>('geral');

  useEffect(() => {
    carregarTudo();
  }, []);

  // ============================================
  // RENDERIZAR CARD DE MÉTRICA
  // ============================================

  const renderCard = (
    titulo: string,
    valor: number | string,
    icone: string,
    cor: string,
    subtitulo?: string
  ) => (
    <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${cor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{titulo}</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{valor}</p>
          {subtitulo && <p className="text-xs text-gray-400 mt-1">{subtitulo}</p>}
        </div>
        <span className="text-3xl">{icone}</span>
      </div>
    </div>
  );

  // ============================================
  // RENDERIZAR GRÁFICO SVG
  // ============================================

  const renderGraficoEvolucao = () => {
    if (!evolucao || evolucao.length === 0) return null;

    const width = 800;
    const height = 250;
    const padding = { top: 20, right: 30, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(
      ...evolucao.map(e => Math.max(e.vagas_abertas, e.vagas_fechadas, e.aprovacoes))
    ) || 10;

    const xScale = (index: number) => padding.left + (index * chartWidth) / (evolucao.length - 1 || 1);
    const yScale = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;

    const createPath = (data: number[]) => {
      return data.map((value, index) => {
        const x = xScale(index);
        const y = yScale(value);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');
    };

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Grid horizontal */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = padding.top + (chartHeight * (100 - pct)) / 100;
          return (
            <g key={pct}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="text-xs fill-gray-400">
                {Math.round(maxValue * pct / 100)}
              </text>
            </g>
          );
        })}

        {/* Linha de vagas abertas */}
        <path
          d={createPath(evolucao.map(e => e.vagas_abertas))}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
        />

        {/* Linha de vagas fechadas */}
        <path
          d={createPath(evolucao.map(e => e.vagas_fechadas))}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
        />

        {/* Linha de aprovações */}
        <path
          d={createPath(evolucao.map(e => e.aprovacoes))}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
        />

        {/* Pontos e labels do eixo X */}
        {evolucao.map((e, index) => (
          <g key={e.mes}>
            {/* Pontos */}
            <circle cx={xScale(index)} cy={yScale(e.vagas_abertas)} r="4" fill="#3b82f6" />
            <circle cx={xScale(index)} cy={yScale(e.vagas_fechadas)} r="4" fill="#10b981" />
            <circle cx={xScale(index)} cy={yScale(e.aprovacoes)} r="4" fill="#f59e0b" />
            
            {/* Label mês */}
            <text
              x={xScale(index)}
              y={height - 10}
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              {e.mes_label}
            </text>
          </g>
        ))}

        {/* Legenda */}
        <g transform={`translate(${padding.left}, ${height - 5})`}>
          <circle cx="0" cy="-5" r="4" fill="#3b82f6" />
          <text x="10" y="0" className="text-xs fill-gray-600">Abertas</text>
          
          <circle cx="80" cy="-5" r="4" fill="#10b981" />
          <text x="90" y="0" className="text-xs fill-gray-600">Fechadas</text>
          
          <circle cx="170" cy="-5" r="4" fill="#f59e0b" />
          <text x="180" y="0" className="text-xs fill-gray-600">Aprovações</text>
        </g>
      </svg>
    );
  };

  // ============================================
  // RENDERIZAR FUNIL
  // ============================================

  const renderFunil = () => {
    const etapasLabels: Record<string, string> = {
      triagem: '📋 Triagem',
      qualificacao: '🔍 Qualificação',
      enviado_cliente: '📤 Enviado ao Cliente',
      entrevista_cliente: '🎤 Entrevista Cliente',
      aprovado: '✅ Aprovado'
    };

    const cores = ['bg-blue-500', 'bg-blue-400', 'bg-green-400', 'bg-green-500', 'bg-emerald-600'];

    return (
      <div className="space-y-2">
        {funil.map((etapa, index) => (
          <div key={etapa.etapa} className="relative">
            <div className="flex items-center gap-3">
              <div className="w-32 text-sm text-gray-600 text-right">
                {etapasLabels[etapa.etapa] || etapa.etapa}
              </div>
              <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                <div 
                  className={`h-full ${cores[index]} transition-all duration-500 flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(etapa.percentual, 5)}%` }}
                >
                  <span className="text-white text-sm font-medium">
                    {etapa.quantidade}
                  </span>
                </div>
              </div>
              <div className="w-16 text-sm text-gray-500 text-right">
                {etapa.percentual}%
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ============================================
  // RENDERIZAR ALERTA
  // ============================================

  const renderAlerta = (alerta: Alerta, index: number) => {
    const corSeveridade = {
      critical: 'bg-red-50 border-red-300 text-red-800',
      warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
      info: 'bg-blue-50 border-blue-300 text-blue-800'
    };

    const iconeSeveridade = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    };

    return (
      <div 
        key={`${alerta.tipo_alerta}-${alerta.referencia_id}-${index}`}
        className={`p-3 rounded-lg border ${corSeveridade[alerta.severidade]}`}
      >
        <div className="flex items-start gap-2">
          <span className="text-lg">{iconeSeveridade[alerta.severidade]}</span>
          <div className="flex-1">
            <p className="text-sm font-medium">{alerta.mensagem}</p>
            <p className="text-xs opacity-70 mt-1">
              Analista: {alerta.analista_nome || 'Não atribuído'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDERIZAR VAGA NA SOMBRA
  // ============================================

  const renderVagaSombra = (vaga: VagaSombra) => {
    const corCriticidade = {
      critico: 'border-red-400 bg-red-50',
      alto: 'border-orange-400 bg-orange-50',
      medio: 'border-yellow-400 bg-yellow-50',
      baixo: 'border-gray-300 bg-gray-50'
    };

    const iconeCriticidade = {
      critico: '🔴',
      alto: '🟠',
      medio: '🟡',
      baixo: '⚪'
    };

    return (
      <div 
        key={vaga.id}
        className={`p-4 rounded-lg border-l-4 ${corCriticidade[vaga.nivel_criticidade]}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span>{iconeCriticidade[vaga.nivel_criticidade]}</span>
              <h4 className="font-medium text-gray-800">{vaga.titulo}</h4>
              {vaga.urgente && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                  URGENTE
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{vaga.nome_cliente}</p>
            <p className="text-sm text-gray-600 mt-2">{vaga.motivo_alerta}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-700">{vaga.dias_sem_movimentacao}</div>
            <div className="text-xs text-gray-400">dias parada</div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>👤 {vaga.analista_nome || 'Sem analista'}</span>
          <span>📋 {vaga.total_candidatos} candidatos</span>
          <span>📤 {vaga.enviados_cliente} enviados</span>
          {vaga.prazo_fechamento && (
            <span>📅 Prazo: {new Date(vaga.prazo_fechamento).toLocaleDateString('pt-BR')}</span>
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // RENDERIZAR TABELA PERFORMANCE ANALISTA
  // ============================================

  const renderTabelaAnalistas = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Analista</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Vagas Ativas</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Candidaturas</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Enviados</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Aprovados</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Taxa Aprov.</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Tempo Médio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {performanceAnalistas.map(analista => (
            <tr key={analista.analista_id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{analista.analista_nome}</td>
              <td className="px-4 py-3 text-center">{analista.vagas_ativas}</td>
              <td className="px-4 py-3 text-center">{analista.candidaturas_mes}</td>
              <td className="px-4 py-3 text-center">{analista.enviados_cliente_mes}</td>
              <td className="px-4 py-3 text-center text-green-600 font-medium">{analista.aprovados_mes}</td>
              <td className="px-4 py-3 text-center">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  analista.taxa_aprovacao >= 70 ? 'bg-green-100 text-green-700' :
                  analista.taxa_aprovacao >= 50 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {analista.taxa_aprovacao}%
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-600">{analista.tempo_medio_dias} dias</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ============================================
  // RENDERIZAR TABELA PERFORMANCE CLIENTE
  // ============================================

  const renderTabelaClientes = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Vagas Ativas</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Total Histórico</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Enviados (Mês)</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Aprovados (Mês)</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Taxa Aprov.</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Tempo Resposta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {performanceClientes.map(cliente => (
            <tr key={cliente.cliente_id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{cliente.nome_cliente}</td>
              <td className="px-4 py-3 text-center">{cliente.vagas_ativas}</td>
              <td className="px-4 py-3 text-center text-gray-500">{cliente.total_vagas}</td>
              <td className="px-4 py-3 text-center">{cliente.enviados_mes}</td>
              <td className="px-4 py-3 text-center text-green-600 font-medium">{cliente.aprovados_mes}</td>
              <td className="px-4 py-3 text-center">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  cliente.taxa_aprovacao >= 70 ? 'bg-green-100 text-green-700' :
                  cliente.taxa_aprovacao >= 50 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {cliente.taxa_aprovacao}%
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-600">{cliente.tempo_medio_resposta_dias} dias</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ============================================
  // LOADING
  // ============================================

  if (loading && !resumo) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-500">Carregando métricas...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📊 Dashboard RAISA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Métricas e KPIs do módulo de Recrutamento
          </p>
        </div>
        <button
          onClick={carregarTudo}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <span className="animate-spin">⚙️</span>
          ) : (
            <span>🔄</span>
          )}
          Atualizar
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {renderCard('Vagas Abertas', resumo?.vagas_abertas || 0, '📋', 'border-blue-500')}
        {renderCard('Vagas Urgentes', resumo?.vagas_urgentes || 0, '🚨', 'border-red-500', 
          resumo?.vagas_urgentes ? 'Requer atenção!' : '')}
        {renderCard('Candidaturas (Mês)', resumo?.candidaturas_mes || 0, '👥', 'border-purple-500')}
        {renderCard('Taxa Aprovação', `${resumo?.taxa_aprovacao_mes || 0}%`, '✅', 'border-green-500', 
          `${resumo?.aprovados_mes || 0} aprovados`)}
        {renderCard('Tempo Médio', `${resumo?.tempo_medio_fechamento_dias || 0}d`, '⏱️', 'border-orange-500',
          'para fechar vaga')}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'geral', label: '📈 Visão Geral', count: null },
          { id: 'analistas', label: '👤 Analistas', count: performanceAnalistas.length },
          { id: 'clientes', label: '🏢 Clientes', count: performanceClientes.length },
          { id: 'alertas', label: '🚨 Alertas', count: alertas.length }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              tab === t.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                t.id === 'alertas' && t.count > 0 
                  ? 'bg-red-100 text-red-700' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo das Tabs */}
      
      {/* Tab Geral */}
      {tab === 'geral' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Evolução */}
          <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-2">
            <h3 className="font-bold text-gray-800 mb-4">📈 Evolução Mensal (12 meses)</h3>
            {evolucao.length > 0 ? renderGraficoEvolucao() : (
              <div className="text-center py-8 text-gray-400">Sem dados de evolução</div>
            )}
          </div>

          {/* Funil de Conversão */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">🔻 Funil de Conversão</h3>
            {funil.length > 0 ? renderFunil() : (
              <div className="text-center py-8 text-gray-400">Sem dados do funil</div>
            )}
          </div>

          {/* Vagas na Sombra */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">
              👻 Vagas na Sombra 
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({vagasSombra.length} vagas)
              </span>
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {vagasSombra.length > 0 ? (
                vagasSombra.slice(0, 5).map(renderVagaSombra)
              ) : (
                <div className="text-center py-8 text-gray-400">
                  ✅ Nenhuma vaga esquecida!
                </div>
              )}
            </div>
            {vagasSombra.length > 5 && (
              <button 
                onClick={() => setTab('alertas')}
                className="w-full mt-3 text-sm text-blue-600 hover:underline"
              >
                Ver todas ({vagasSombra.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab Analistas */}
      {tab === 'analistas' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800">👤 Performance por Analista</h3>
            <p className="text-sm text-gray-500">Métricas do mês atual</p>
          </div>
          {performanceAnalistas.length > 0 ? renderTabelaAnalistas() : (
            <div className="text-center py-8 text-gray-400">Sem dados de analistas</div>
          )}
        </div>
      )}

      {/* Tab Clientes */}
      {tab === 'clientes' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800">🏢 Performance por Cliente</h3>
            <p className="text-sm text-gray-500">Métricas de aprovação e tempo de resposta</p>
          </div>
          {performanceClientes.length > 0 ? renderTabelaClientes() : (
            <div className="text-center py-8 text-gray-400">Sem dados de clientes</div>
          )}
        </div>
      )}

      {/* Tab Alertas */}
      {tab === 'alertas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertas */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">
              🚨 Alertas Ativos ({alertas.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {alertas.length > 0 ? (
                alertas.map((alerta, index) => renderAlerta(alerta, index))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  ✅ Nenhum alerta ativo!
                </div>
              )}
            </div>
          </div>

          {/* Todas as Vagas na Sombra */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">
              👻 Todas as Vagas na Sombra ({vagasSombra.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {vagasSombra.length > 0 ? (
                vagasSombra.map(renderVagaSombra)
              ) : (
                <div className="text-center py-8 text-gray-400">
                  ✅ Nenhuma vaga esquecida!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className="text-center text-xs text-gray-400 pt-4">
        Última atualização: {resumo?.atualizado_em 
          ? new Date(resumo.atualizado_em).toLocaleString('pt-BR') 
          : 'Aguardando...'}
      </div>
    </div>
  );
};

export default DashboardRaisaMetrics;
