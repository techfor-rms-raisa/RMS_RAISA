import React, { useState } from 'react';
import { AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Consultant } from '@/types';
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

  // ✅ CORRIGIDO: Determinar cor e label baseado no score (tratar nulo)
  const rawScore = consultant.parecer_final_consultor;
  const riskScore = (rawScore !== null && rawScore !== undefined && !isNaN(Number(rawScore))) 
    ? Number(rawScore) 
    : null;
  
  const riskConfig = {
    1: { label: 'EXCELENTE', color: 'bg-green-50', border: 'border-green-500', icon: '🟢', textColor: 'text-green-900', badgeColor: 'bg-green-500' },
    2: { label: 'BOM', color: 'bg-blue-50', border: 'border-blue-500', icon: '🔵', textColor: 'text-blue-900', badgeColor: 'bg-blue-500' },
    3: { label: 'MÉDIO', color: 'bg-yellow-50', border: 'border-yellow-500', icon: '🟡', textColor: 'text-yellow-900', badgeColor: 'bg-yellow-500' },
    4: { label: 'ALTO', color: 'bg-orange-50', border: 'border-orange-600', icon: '🟠', textColor: 'text-orange-900', badgeColor: 'bg-orange-500' },
    5: { label: 'CRÍTICO', color: 'bg-red-50', border: 'border-red-700', icon: '🔴', textColor: 'text-red-900', badgeColor: 'bg-red-500' }
  };

  // ✅ NOVO: Config para score indefinido
  const defaultConfig = { 
    label: 'INDEFINIDO', 
    color: 'bg-gray-50', 
    border: 'border-gray-400', 
    icon: '⚪', 
    textColor: 'text-gray-700',
    badgeColor: 'bg-gray-400'
  };

  const config = riskScore !== null 
    ? (riskConfig[riskScore as keyof typeof riskConfig] || defaultConfig)
    : defaultConfig;

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
            <div className={`text-sm font-bold ${config.textColor}`}>
              {riskScore !== null ? `Score ${riskScore}` : 'Sem Score'}
            </div>
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

      {/* Recomendações em Lista Vertical */}
      <div className="px-6 py-6">
        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>💡 Recomendações</span>
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
            {analysis.recomendacoes.length}
          </span>
        </h4>

        <div className="space-y-2">
          {analysis.recomendacoes.map((rec, idx) => (
            <div
              key={idx}
              className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg"
            >
              <span className="font-bold text-blue-900 text-xs uppercase">{rec.tipo}</span>
              <p className="text-gray-700 text-sm mt-1">{rec.descricao}</p>
            </div>
          ))}
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
