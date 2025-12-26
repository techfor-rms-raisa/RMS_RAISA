/**
 * DashboardPerformanceIA.tsx - Dashboard Performance IA vs Manual
 * 
 * Padrão visual idêntico ao Analytics existente no sistema
 * 
 * Funcionalidades:
 * - Gráfico de linha: Taxa de Sucesso IA vs Manual (12 meses)
 * - Toggle: Visão Geral / Por Analista
 * - Cards de resumo
 * - Tabela detalhada por analista
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

interface EvolucaoMensal {
  mes: string;
  mes_nome: string;
  ano: number;
  mes_numero: number;
  taxa_sucesso_ia: number;
  taxa_sucesso_manual: number;
  decisoes_ia: number;
  decisoes_manual: number;
  dias_medio_ia: number;
  dias_medio_manual: number;
}

interface PerformanceAnalista {
  analista_id: number;
  analista_nome: string;
  total_vagas_trabalhadas: number;
  vagas_ia_aceita: number;
  vagas_manual: number;
  taxa_sucesso_ia: number;
  taxa_sucesso_manual: number;
  taxa_sucesso_geral: number;
  media_dias_fechamento: number;
  media_candidatos_aprovados: number;
  ia_performa_melhor: boolean;
}

interface EvolucaoAnalista {
  mes: string;
  mes_nome: string;
  analista_id: number;
  analista_nome: string;
  taxa_sucesso: number;
  total_vagas: number;
  vagas_ia: number;
  vagas_manual: number;
}

// ============================================
// COMPONENTE
// ============================================

const DashboardPerformanceIA: React.FC = () => {
  // Estados
  const [evolucaoGeral, setEvolucaoGeral] = useState<EvolucaoMensal[]>([]);
  const [evolucaoAnalistas, setEvolucaoAnalistas] = useState<EvolucaoAnalista[]>([]);
  const [resumoAnalistas, setResumoAnalistas] = useState<PerformanceAnalista[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'geral' | 'analista'>('geral');
  const [analistaFiltro, setAnalistaFiltro] = useState<number | null>(null);

  // Carregar dados
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Evolução geral
      const { data: evolucao } = await supabase
        .from('vw_evolucao_performance_mensal')
        .select('*')
        .order('mes', { ascending: true });
      
      setEvolucaoGeral(evolucao || []);

      // Evolução por analista
      const { data: evolAnalista } = await supabase
        .from('vw_evolucao_por_analista')
        .select('*')
        .order('mes', { ascending: true });
      
      setEvolucaoAnalistas(evolAnalista || []);

      // Resumo por analista
      const { data: resumo } = await supabase
        .from('vw_resumo_performance_analista')
        .select('*')
        .order('total_vagas_trabalhadas', { ascending: false });
      
      setResumoAnalistas(resumo || []);

    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calcular totais
  const totais = {
    decisoesIA: evolucaoGeral.reduce((sum, e) => sum + (e.decisoes_ia || 0), 0),
    decisoesManual: evolucaoGeral.reduce((sum, e) => sum + (e.decisoes_manual || 0), 0),
    taxaMediaIA: evolucaoGeral.filter(e => e.taxa_sucesso_ia > 0).length > 0
      ? Math.round(evolucaoGeral.filter(e => e.taxa_sucesso_ia > 0).reduce((sum, e) => sum + e.taxa_sucesso_ia, 0) / evolucaoGeral.filter(e => e.taxa_sucesso_ia > 0).length)
      : 0,
    taxaMediaManual: evolucaoGeral.filter(e => e.taxa_sucesso_manual > 0).length > 0
      ? Math.round(evolucaoGeral.filter(e => e.taxa_sucesso_manual > 0).reduce((sum, e) => sum + e.taxa_sucesso_manual, 0) / evolucaoGeral.filter(e => e.taxa_sucesso_manual > 0).length)
      : 0
  };

  const iaPerformaMelhor = totais.taxaMediaIA > totais.taxaMediaManual;

  // Dados filtrados para gráfico de analista
  const dadosAnalista = analistaFiltro
    ? evolucaoAnalistas.filter(e => e.analista_id === analistaFiltro)
    : [];

  // Lista única de analistas
  const analistas = [...new Map(evolucaoAnalistas.map(e => [e.analista_id, { id: e.analista_id, nome: e.analista_nome }])).values()];

  // Função para renderizar gráfico de linha
  const renderGraficoLinha = (dados: any[], linhas: { key: string; cor: string; label: string }[]) => {
    if (dados.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-gray-400">
          Dados insuficientes para exibir gráfico
        </div>
      );
    }

    const maxValue = Math.max(
      ...dados.flatMap(d => linhas.map(l => d[l.key] || 0)),
      5
    );
    const yScale = 240 / maxValue;
    const xStep = 800 / Math.max(dados.length - 1, 1);

    return (
      <div className="relative">
        {/* SVG do Gráfico */}
        <svg viewBox="0 0 900 300" className="w-full h-64">
          {/* Grid Horizontal */}
          {[0, 1, 2, 3, 4, 5].map(i => {
            const y = 260 - (i * (maxValue / 5) * yScale);
            return (
              <g key={i}>
                <line x1="50" y1={y} x2="850" y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x="40" y={y + 4} textAnchor="end" className="text-xs fill-gray-400">
                  {Math.round(i * (maxValue / 5))}
                </text>
              </g>
            );
          })}

          {/* Linhas dos Dados */}
          {linhas.map(linha => {
            const pontos = dados.map((d, i) => ({
              x: 50 + i * xStep,
              y: 260 - ((d[linha.key] || 0) * yScale)
            }));

            const pathD = pontos.map((p, i) => 
              (i === 0 ? 'M' : 'L') + ` ${p.x} ${p.y}`
            ).join(' ');

            return (
              <g key={linha.key}>
                {/* Linha */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={linha.cor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Pontos */}
                {pontos.map((p, i) => (
                  <g key={i}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="6"
                      fill="white"
                      stroke={linha.cor}
                      strokeWidth="3"
                    />
                    {/* Tooltip hover area */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="12"
                      fill="transparent"
                      className="cursor-pointer"
                    >
                      <title>{`${linha.label}: ${dados[i][linha.key] || 0}%`}</title>
                    </circle>
                  </g>
                ))}
              </g>
            );
          })}

          {/* Labels do Eixo X */}
          {dados.map((d, i) => (
            <text
              key={i}
              x={50 + i * xStep}
              y="285"
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              {d.mes_nome}
            </text>
          ))}
        </svg>

        {/* Legenda */}
        <div className="flex justify-center gap-8 mt-4">
          {linhas.map(linha => (
            <div key={linha.key} className="flex items-center gap-2">
              <div 
                className="w-4 h-1 rounded"
                style={{ backgroundColor: linha.cor }}
              />
              <span className="text-sm text-gray-600">{linha.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-500">Carregando métricas de performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            📊 Performance: IA vs Decisões Manuais
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Compare os resultados das sugestões da IA com as escolhas manuais da gestora
          </p>
        </div>
        <button
          onClick={carregarDados}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-4 gap-4">
        {/* Card IA */}
        <div className={`rounded-xl p-5 text-white ${
          iaPerformaMelhor 
            ? 'bg-gradient-to-br from-green-500 to-emerald-600' 
            : 'bg-gradient-to-br from-blue-500 to-blue-600'
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-80">🤖 Seguiu IA</div>
            {iaPerformaMelhor && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">🏆</span>}
          </div>
          <div className="text-3xl font-bold mt-2">{totais.taxaMediaIA}%</div>
          <div className="text-sm opacity-80">taxa de sucesso média</div>
          <div className="mt-3 pt-3 border-t border-white/20 text-sm">
            {totais.decisoesIA} decisões
          </div>
        </div>

        {/* Card Manual */}
        <div className={`rounded-xl p-5 text-white ${
          !iaPerformaMelhor 
            ? 'bg-gradient-to-br from-green-500 to-emerald-600' 
            : 'bg-gradient-to-br from-orange-500 to-orange-600'
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-80">✏️ Manual Override</div>
            {!iaPerformaMelhor && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">🏆</span>}
          </div>
          <div className="text-3xl font-bold mt-2">{totais.taxaMediaManual}%</div>
          <div className="text-sm opacity-80">taxa de sucesso média</div>
          <div className="mt-3 pt-3 border-t border-white/20 text-sm">
            {totais.decisoesManual} decisões
          </div>
        </div>

        {/* Card Diferença */}
        <div className="rounded-xl p-5 bg-gray-100">
          <div className="text-sm text-gray-500">📈 Diferença</div>
          <div className={`text-3xl font-bold mt-2 ${
            iaPerformaMelhor ? 'text-green-600' : 'text-orange-600'
          }`}>
            {iaPerformaMelhor ? '+' : ''}{totais.taxaMediaIA - totais.taxaMediaManual}%
          </div>
          <div className="text-sm text-gray-500">
            {iaPerformaMelhor ? 'IA superior' : 'Manual superior'}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
            {totais.decisoesIA + totais.decisoesManual} total
          </div>
        </div>

        {/* Card Insight */}
        <div className={`rounded-xl p-5 ${
          iaPerformaMelhor ? 'bg-green-50' : 'bg-orange-50'
        }`}>
          <div className={`text-sm ${iaPerformaMelhor ? 'text-green-600' : 'text-orange-600'}`}>
            💡 Recomendação
          </div>
          <div className={`text-sm mt-2 font-medium ${
            iaPerformaMelhor ? 'text-green-700' : 'text-orange-700'
          }`}>
            {iaPerformaMelhor 
              ? 'Seguir as sugestões da IA está trazendo melhores resultados'
              : 'As decisões manuais estão superando a IA - sistema está aprendendo'
            }
          </div>
        </div>
      </div>

      {/* Toggle Visão */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setViewMode('geral'); setAnalistaFiltro(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'geral' 
              ? 'bg-white text-blue-600 shadow' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          📊 Visão Geral
        </button>
        <button
          onClick={() => setViewMode('analista')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'analista' 
              ? 'bg-white text-blue-600 shadow' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          👤 Por Analista
        </button>
      </div>

      {/* Gráfico Principal */}
      <div className="bg-white rounded-xl shadow p-6">
        {viewMode === 'geral' ? (
          <>
            <h3 className="text-lg font-bold text-blue-600 mb-2">
              Evolução da Taxa de Sucesso (IA vs Manual)
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Compare os resultados ao longo dos últimos 12 meses. Valores mais altos indicam melhor performance.
            </p>
            
            {renderGraficoLinha(evolucaoGeral, [
              { key: 'taxa_sucesso_ia', cor: '#3b82f6', label: '🤖 Seguiu IA' },
              { key: 'taxa_sucesso_manual', cor: '#f97316', label: '✏️ Manual Override' }
            ])}

            {/* Info */}
            <div className="mt-4 flex justify-between text-xs text-gray-500">
              <span>— 🤖 Azul: Decisões seguindo sugestão da IA</span>
              <span>— 🟠 Laranja: Decisões manuais (override)</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-blue-600">
                  Performance por Analista
                </h3>
                <p className="text-sm text-gray-500">
                  Selecione um analista para ver a evolução individual
                </p>
              </div>
              <select
                value={analistaFiltro || ''}
                onChange={e => setAnalistaFiltro(Number(e.target.value) || null)}
                className="border rounded-lg p-2 text-sm"
              >
                <option value="">Selecione um analista...</option>
                {analistas.map(a => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
            </div>

            {analistaFiltro ? (
              renderGraficoLinha(dadosAnalista, [
                { key: 'taxa_sucesso', cor: '#8b5cf6', label: `Taxa de Sucesso - ${analistas.find(a => a.id === analistaFiltro)?.nome}` }
              ])
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">
                Selecione um analista para visualizar o gráfico
              </div>
            )}
          </>
        )}
      </div>

      {/* Tabela de Analistas */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          📋 Resumo por Analista
        </h3>
        
        {resumoAnalistas.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            Nenhum dado de performance disponível ainda
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3">Analista</th>
                  <th className="text-center p-3">Vagas</th>
                  <th className="text-center p-3">
                    <span className="text-blue-600">🤖 Seguiu IA</span>
                  </th>
                  <th className="text-center p-3">
                    <span className="text-orange-600">✏️ Manual</span>
                  </th>
                  <th className="text-center p-3">Taxa Geral</th>
                  <th className="text-center p-3">Dias Médio</th>
                  <th className="text-center p-3">Melhor com</th>
                </tr>
              </thead>
              <tbody>
                {resumoAnalistas.map(analista => (
                  <tr key={analista.analista_id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{analista.analista_nome}</td>
                    <td className="p-3 text-center">{analista.total_vagas_trabalhadas}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        (analista.taxa_sucesso_ia || 0) >= 70 
                          ? 'bg-green-100 text-green-700' 
                          : (analista.taxa_sucesso_ia || 0) >= 50 
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {analista.taxa_sucesso_ia || 0}%
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({analista.vagas_ia_aceita})
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        (analista.taxa_sucesso_manual || 0) >= 70 
                          ? 'bg-green-100 text-green-700' 
                          : (analista.taxa_sucesso_manual || 0) >= 50 
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {analista.taxa_sucesso_manual || 0}%
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({analista.vagas_manual})
                      </span>
                    </td>
                    <td className="p-3 text-center font-bold">
                      {analista.taxa_sucesso_geral || 0}%
                    </td>
                    <td className="p-3 text-center">
                      {analista.media_dias_fechamento || '-'} dias
                    </td>
                    <td className="p-3 text-center">
                      {analista.ia_performa_melhor ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          🤖 IA
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                          ✏️ Manual
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legenda e Info */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="font-bold text-blue-800 mb-2">📌 Como interpretar</h4>
        <div className="grid grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <strong>🤖 Seguiu IA:</strong> Vagas onde a gestora aceitou a sugestão da IA
          </div>
          <div>
            <strong>✏️ Manual Override:</strong> Vagas onde a gestora escolheu diferente da IA
          </div>
          <div>
            <strong>Taxa de Sucesso:</strong> % de vagas preenchidas com sucesso
          </div>
          <div>
            <strong>Melhor com:</strong> Indica se o analista performa melhor seguindo IA ou manual
          </div>
        </div>
        <p className="text-xs text-blue-600 mt-3">
          💡 Scores mais altos indicam melhor performance. A IA aprende com os overrides para melhorar sugestões futuras.
        </p>
      </div>
    </div>
  );
};

export default DashboardPerformanceIA;
