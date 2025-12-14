import React, { useState } from 'react';
import { AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Consultant } from '../components/types';
import { IntelligentAnalysis } from '../services/recommendationService';

interface RecommendationCardProps {
  consultant: Consultant;
  analysis: IntelligentAnalysis;
  clientName?: string;
  managerName?: string;
  onNavigateToAtividades?: (clientName?: string, consultantName?: string) => void;
  onOpenHistory?: () => void;

}

const RecommendationCard: React.FC<RecommendationCardProps> = ({
  consultant,
  analysis,
  clientName,
  managerName,
  onNavigateToAtividades,
  onOpenHistory
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determinar cor e label baseado no score
  const riskScore = consultant.parecer_final_consultor || 3;
  
  const riskConfig = {
    1: { label: 'EXCELENTE', color: 'bg-green-50', border: 'border-green-500', icon: '🟢', textColor: 'text-green-900' },
    2: { label: 'BOM', color: 'bg-blue-50', border: 'border-blue-500', icon: '🔵', textColor: 'text-blue-900' },
    3: { label: 'MÉDIO', color: 'bg-yellow-50', border: 'border-yellow-500', icon: '🟡', textColor: 'text-yellow-900' },
    4: { label: 'ALTO', color: 'bg-orange-50', border: 'border-orange-600', icon: '🟠', textColor: 'text-orange-900' },
    5: { label: 'CRÍTICO', color: 'bg-red-50', border: 'border-red-700', icon: '🔴', textColor: 'text-red-900' }
  };

  const config = riskConfig[riskScore as keyof typeof riskConfig] || riskConfig[3];

  // Determinar ícone de tendência
  const getTrendIcon = () => {
    const padroes = analysis.padroes || [];
    const melhorando = padroes.some(p => p.includes('melhorou'));
    const piorando = padroes.some(p => p.includes('piorou'));
    
    if (melhorando) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (piorando) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-600" />;
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg border-l-4 ${config.border} overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <div className={`${config.color} px-6 py-4 border-b border-gray-200`}>
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">{consultant.nome_consultores}</h3>
              <button
                onClick={() => onNavigateToAtividades?.(clientName, consultant.nome_consultores)}
                className="px-2 py-1 text-xs bg-white text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition whitespace-nowrap"
                title="Registrar nova atividade para este consultor"
              >
                + Atividade
              </button>
            </div>
            <p className="text-sm text-gray-600 uppercase tracking-wide">{consultant.cargo_consultores}</p>
            {clientName && (
              <p className="text-xs text-gray-500 mt-1">👥 Cliente: {clientName}</p>
            )}
            {managerName && (
              <p className="text-xs text-gray-500">👤 Gestor: {managerName}</p>
            )}
          </div>

          {/* Score Badge */}
          <button
            onClick={onOpenHistory}
            className={`px-4 py-3 rounded-lg ${config.color} border ${config.border} flex flex-col items-center justify-center min-w-[100px] cursor-pointer hover:shadow-md transition`}
            title="Clique para ver histórico de atividades"
          >
            <div className="text-2xl mb-1">{config.icon}</div>
            <div className={`text-xs font-bold ${config.textColor} uppercase`}>{config.label}</div>
            <div className={`text-sm font-bold ${config.textColor}`}>Score {riskScore}</div>
          </button>
        </div>
      </div>

      {/* Resumo de Análise */}
      <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-blue-900 mb-2">📊 Resumo da Análise:</h4>
            <p className="text-sm text-blue-800 leading-relaxed">{analysis.resumo}</p>
          </div>
        </div>
      </div>

      {/* Padrões e Alertas */}
      {(analysis.padroes?.length || 0 > 0 || analysis.alertas?.length || 0 > 0) && (
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1">
            {getTrendIcon()}
            <div className="text-xs">
              {analysis.padroes?.length ? (
                <span className="text-gray-700">
                  <strong>Padrões:</strong> {analysis.padroes.join(', ')}
                </span>
              ) : null}
            </div>
          </div>
          {analysis.alertas?.length ? (
            <div className="text-xs text-red-600 font-semibold">
              {analysis.alertas[0]}
            </div>
          ) : null}
        </div>
      )}

      {/* Recomendações em 3 Colunas */}
      <div className="px-6 py-6">
        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>💡 Recomendações de Ação</span>
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
            {analysis.recomendacoes.length}
          </span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {analysis.recomendacoes.map((rec, idx) => {
            // Determinar cor baseado no tipo
            const typeColors: Record<string, { bg: string; border: string; text: string }> = {
              'AÇÃO IMEDIATA': { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-900' },
              'PREVENTIVO': { bg: 'bg-yellow-50', border: 'border-yellow-500', text: 'text-yellow-900' },
              'DESENVOLVIMENTO': { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-900' },
              'RECONHECIMENTO': { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-900' },
              'SUPORTE': { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-900' },
              'OBSERVAÇÃO': { bg: 'bg-gray-50', border: 'border-gray-500', text: 'text-gray-900' }
            };

            const typeColor = typeColors[rec.tipo] || typeColors['OBSERVAÇÃO'];

            return (
              <div
                key={idx}
                className={`${typeColor.bg} border-l-4 ${typeColor.border} p-4 rounded-r-lg hover:shadow-md transition-shadow`}
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className={`font-bold text-xs uppercase ${typeColor.text}`}>
                    {rec.tipo}
                  </span>
                  <span className="text-xs bg-white px-2 py-1 rounded border border-gray-200 text-gray-700 font-semibold whitespace-nowrap">
                    ⏱️ {rec.prazo}
                  </span>
                </div>

                <p className="text-sm text-gray-700 mb-3 leading-relaxed">
                  {rec.descricao}
                </p>

                <div className="flex items-center gap-2 text-xs text-gray-600 bg-white px-2 py-1.5 rounded border border-gray-200">
                  <span>👤</span>
                  <span>
                    <strong>Responsável:</strong> {rec.responsavel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer com ações */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center gap-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition"
        >
          {isExpanded ? '▼ Menos detalhes' : '▶ Mais detalhes'}
        </button>

        <div className="flex gap-2">
          <button
            onClick={onOpenHistory}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm rounded-lg hover:from-purple-700 hover:to-indigo-700 transition font-semibold"
          >
            📋 Ver Histórico
          </button>
        </div>
      </div>

      {/* Detalhes Expandidos */}
      {isExpanded && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-3">
          <div>
            <h5 className="font-bold text-gray-900 text-sm mb-2">📌 Informações do Consultor:</h5>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
              <div>
                <span className="font-semibold">Cargo:</span> {consultant.cargo_consultores}
              </div>
              <div>
                <span className="font-semibold">Status:</span> {consultant.status}
              </div>
              <div>
                <span className="font-semibold">Inclusão:</span> {new Date(consultant.data_inclusao_consultores).toLocaleDateString('pt-BR')}
              </div>
              {consultant.valor_faturamento && (
                <div>
                  <span className="font-semibold">Faturamento:</span> R$ {consultant.valor_faturamento.toLocaleString('pt-BR')}
                </div>
              )}
            </div>
          </div>

          {analysis.alertas && analysis.alertas.length > 0 && (
            <div>
              <h5 className="font-bold text-red-900 text-sm mb-2">⚠️ Alertas:</h5>
              <ul className="text-xs text-red-800 space-y-1">
                {analysis.alertas.map((alerta, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span>•</span>
                    <span>{alerta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecommendationCard;
