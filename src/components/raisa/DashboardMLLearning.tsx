/**
 * DashboardMLLearning.tsx - Dashboard de Machine Learning
 * 
 * Funcionalidades:
 * - Visualizar modelo ativo e pesos
 * - Ver histórico de feedbacks
 * - Treinar novo modelo
 * - Métricas de performance
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { useMLLearning, ModeloML, FeedbackML, PerformanceModelo } from '@/hooks/supabase/useMLLearning';

const DashboardMLLearning: React.FC = () => {
  const {
    loading,
    buscarModelos,
    buscarFeedbacks,
    buscarPerformanceModelos,
    buscarEstatisticas,
    treinarModelo
  } = useMLLearning();

  const [modelos, setModelos] = useState<ModeloML[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackML[]>([]);
  const [performance, setPerformance] = useState<PerformanceModelo[]>([]);
  const [estatisticas, setEstatisticas] = useState<any>(null);
  const [tab, setTab] = useState<'visao_geral' | 'feedbacks' | 'treinamento'>('visao_geral');
  const [treinando, setTreinando] = useState(false);
  const [mensagemTreino, setMensagemTreino] = useState<string | null>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    const [modelosData, feedbacksData, performanceData, statsData] = await Promise.all([
      buscarModelos(),
      buscarFeedbacks({ limite: 50 }),
      buscarPerformanceModelos(),
      buscarEstatisticas()
    ]);

    setModelos(modelosData);
    setFeedbacks(feedbacksData);
    setPerformance(performanceData);
    setEstatisticas(statsData);
  };

  const handleTreinar = async () => {
    setTreinando(true);
    setMensagemTreino(null);
    
    const resultado = await treinarModelo();
    setMensagemTreino(resultado.mensagem);
    
    if (resultado.sucesso) {
      await carregarDados();
    }
    
    setTreinando(false);
  };

  const modeloAtivo = modelos.find(m => m.ativo);

  // ============================================
  // RENDER CARD
  // ============================================

  const renderCard = (titulo: string, valor: string | number, icone: string, cor: string) => (
    <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${cor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{titulo}</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{valor}</p>
        </div>
        <span className="text-3xl">{icone}</span>
      </div>
    </div>
  );

  // ============================================
  // RENDER BARRA DE PESO
  // ============================================

  const renderBarraPeso = (label: string, peso: number, cor: string) => (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{peso}%</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${cor} transition-all duration-500`}
          style={{ width: `${peso}%` }}
        />
      </div>
    </div>
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🧠 Machine Learning RAISA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sistema de aprendizado contínuo baseado em aprovações e reprovações
          </p>
        </div>
        <button
          onClick={carregarDados}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <span className="animate-spin">⚙️</span> : <span>🔄</span>}
          Atualizar
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderCard('Total Feedbacks', estatisticas?.totalFeedbacks || 0, '📊', 'border-blue-500')}
        {renderCard('Aprovados', estatisticas?.aprovados || 0, '✅', 'border-green-500')}
        {renderCard('Reprovados', estatisticas?.reprovados || 0, '❌', 'border-red-500')}
        {renderCard('Taxa Aprovação', `${(estatisticas?.taxaAprovacao || 0).toFixed(1)}%`, '📈', 'border-purple-500')}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'visao_geral', label: '📊 Visão Geral' },
          { id: 'feedbacks', label: '📋 Feedbacks' },
          { id: 'treinamento', label: '🎯 Treinamento' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das Tabs */}

      {/* Tab Visão Geral */}
      {tab === 'visao_geral' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Modelo Ativo */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="text-green-500">●</span>
              Modelo Ativo
            </h3>
            
            {modeloAtivo ? (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Nome:</span>
                  <span className="font-medium">{modeloAtivo.modelo_nome}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Versão:</span>
                  <span className="font-medium">v{modeloAtivo.versao}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Treinado em:</span>
                  <span className="font-medium">
                    {new Date(modeloAtivo.treinado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Amostras:</span>
                  <span className="font-medium">{modeloAtivo.metricas?.total_amostras || 0}</span>
                </div>

                <hr className="my-4" />

                <h4 className="text-sm font-medium text-gray-700 mb-3">Pesos das Features</h4>
                {modeloAtivo.pesos && (
                  <>
                    {renderBarraPeso('Skills Match', modeloAtivo.pesos.skills_match_percent || 0, 'bg-blue-500')}
                    {renderBarraPeso('Senioridade', modeloAtivo.pesos.senioridade_match || 0, 'bg-green-500')}
                    {renderBarraPeso('Experiência', modeloAtivo.pesos.anos_experiencia || 0, 'bg-purple-500')}
                    {renderBarraPeso('Salário', modeloAtivo.pesos.salario_dentro_faixa || 0, 'bg-yellow-500')}
                    {renderBarraPeso('Localização', modeloAtivo.pesos.localizacao_match || 0, 'bg-orange-500')}
                    {renderBarraPeso('Formação', modeloAtivo.pesos.formacao_relevante || 0, 'bg-pink-500')}
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl">🤖</span>
                <p className="mt-2">Nenhum modelo ativo</p>
                <p className="text-sm">Treine o primeiro modelo!</p>
              </div>
            )}
          </div>

          {/* Gráfico de Distribuição */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">📊 Distribuição de Resultados</h3>
            
            {estatisticas && estatisticas.totalFeedbacks > 0 ? (
              <div className="space-y-6">
                {/* Gráfico de barras horizontal */}
                <div className="relative h-16">
                  <div className="absolute inset-0 flex rounded-lg overflow-hidden">
                    <div 
                      className="bg-green-500 flex items-center justify-center text-white text-sm font-medium"
                      style={{ width: `${estatisticas.taxaAprovacao}%` }}
                    >
                      {estatisticas.taxaAprovacao > 15 && `${estatisticas.taxaAprovacao.toFixed(0)}%`}
                    </div>
                    <div 
                      className="bg-red-500 flex items-center justify-center text-white text-sm font-medium"
                      style={{ width: `${100 - estatisticas.taxaAprovacao}%` }}
                    >
                      {(100 - estatisticas.taxaAprovacao) > 15 && `${(100 - estatisticas.taxaAprovacao).toFixed(0)}%`}
                    </div>
                  </div>
                </div>

                {/* Legenda */}
                <div className="flex justify-center gap-8">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-green-500" />
                    <span className="text-sm text-gray-600">Aprovados ({estatisticas.aprovados})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-red-500" />
                    <span className="text-sm text-gray-600">Reprovados ({estatisticas.reprovados})</span>
                  </div>
                </div>

                {/* Insight */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Insight:</strong> {estatisticas.taxaAprovacao >= 70 
                      ? 'Excelente taxa de aprovação! O modelo está bem calibrado.'
                      : estatisticas.taxaAprovacao >= 50
                      ? 'Taxa de aprovação moderada. Considere treinar um novo modelo.'
                      : 'Taxa de aprovação baixa. Recomendado retreinar o modelo com mais amostras.'
                    }
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl">📊</span>
                <p className="mt-2">Sem dados suficientes</p>
                <p className="text-sm">Registre feedbacks para ver estatísticas</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Feedbacks */}
      {tab === 'feedbacks' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800">📋 Histórico de Feedbacks</h3>
            <p className="text-sm text-gray-500">Últimos 50 registros</p>
          </div>
          
          {feedbacks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Data</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Candidatura</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Score IA</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Resultado</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {feedbacks.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(f.data_feedback).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        #{f.candidatura_id}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          f.score_ia_pre_decisao >= 70 ? 'bg-green-100 text-green-700' :
                          f.score_ia_pre_decisao >= 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {f.score_ia_pre_decisao?.toFixed(0) || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          f.resultado === 'aprovado' ? 'bg-green-100 text-green-700' :
                          f.resultado === 'reprovado' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {f.resultado === 'aprovado' ? '✅ Aprovado' :
                           f.resultado === 'reprovado' ? '❌ Reprovado' :
                           '🚪 Desistência'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                        {f.motivo_reprovacao || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <span className="text-4xl">📋</span>
              <p className="mt-2">Nenhum feedback registrado</p>
              <p className="text-sm">Os feedbacks são registrados automaticamente quando candidatos são aprovados ou reprovados</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Treinamento */}
      {tab === 'treinamento' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Treinar Modelo */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">🎯 Treinar Novo Modelo</h3>
            
            <div className="space-y-4">
              <div className="bg-yellow-50 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Requisitos:</strong> Mínimo de 10 feedbacks necessários para treinar.
                </p>
              </div>

              <div className="text-sm text-gray-600 space-y-2">
                <p>✓ Total de feedbacks: <strong>{estatisticas?.totalFeedbacks || 0}</strong></p>
                <p>✓ Modelo atual: <strong>{modeloAtivo?.modelo_nome || 'Nenhum'}</strong> v{modeloAtivo?.versao || 0}</p>
              </div>

              {mensagemTreino && (
                <div className={`rounded-lg p-4 ${
                  mensagemTreino.includes('sucesso') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  <p className="text-sm">{mensagemTreino}</p>
                </div>
              )}

              <button
                onClick={handleTreinar}
                disabled={treinando || (estatisticas?.totalFeedbacks || 0) < 10}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {treinando ? (
                  <>
                    <span className="animate-spin">⚙️</span>
                    Treinando...
                  </>
                ) : (
                  <>
                    <span>🧠</span>
                    Treinar Novo Modelo
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Histórico de Versões */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">📜 Histórico de Modelos</h3>
            
            {modelos.length > 0 ? (
              <div className="space-y-3">
                {modelos.map(m => (
                  <div 
                    key={m.id}
                    className={`p-4 rounded-lg border ${
                      m.ativo ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {m.ativo && <span className="text-green-500">●</span>}
                        <span className="font-medium">{m.modelo_nome}</span>
                        <span className="text-xs text-gray-500">v{m.versao}</span>
                      </div>
                      {m.ativo && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          ATIVO
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Treinado em: {new Date(m.treinado_em).toLocaleDateString('pt-BR')}
                      {' • '}
                      {m.metricas?.total_amostras || 0} amostras
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl">📜</span>
                <p className="mt-2">Nenhum modelo criado</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rodapé Explicativo */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6">
        <h3 className="font-bold text-gray-800 mb-3">💡 Como funciona o Machine Learning?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="text-xl">1️⃣</span>
            <div>
              <strong>Coleta de Dados</strong>
              <p>Cada aprovação/reprovação é registrada com as características do candidato.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xl">2️⃣</span>
            <div>
              <strong>Treinamento</strong>
              <p>O sistema analisa padrões e ajusta os pesos das features importantes.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xl">3️⃣</span>
            <div>
              <strong>Predição</strong>
              <p>Novos candidatos recebem um score baseado no modelo treinado.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardMLLearning;
