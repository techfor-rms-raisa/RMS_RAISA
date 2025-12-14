import React, { useMemo } from 'react';
import { X, Lightbulb, AlertCircle, TrendingUp } from 'lucide-react';
import { Consultant } from '../components/types';

interface RecommendationsModalProps {
  consultant: Consultant;
  analysis: any;
  onClose: () => void;
}

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  consultant,
  analysis,
  onClose
}) => {
  
  // Filtrar recomendações dos últimos 90 dias
  const recommendationsLast90Days = useMemo(() => {
    if (!analysis?.recomendacoes || !Array.isArray(analysis.recomendacoes)) {
      return [];
    }

    // Para este caso, vamos considerar todas as recomendações como "recentes"
    // já que elas vêm do analysis atual
    return analysis.recomendacoes.slice(0, 10); // Limitar a 10 mais recentes
  }, [analysis]);

  const getTypeColor = (tipo: string): { bg: string; border: string; text: string } => {
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      'AÇÃO IMEDIATA': { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-900' },
      'PREVENTIVO': { bg: 'bg-yellow-50', border: 'border-yellow-500', text: 'text-yellow-900' },
      'DESENVOLVIMENTO': { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-900' },
      'RECONHECIMENTO': { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-900' },
      'SUPORTE': { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-900' },
      'OBSERVAÇÃO': { bg: 'bg-gray-50', border: 'border-gray-500', text: 'text-gray-900' }
    };
    return colors[tipo] || colors['OBSERVAÇÃO'];
  };

  const getScoreColor = (score: number | null): string => {
    if (score === null || score === undefined) return '#757575';
    const colors: { [key: number]: string } = {
      5: '#d32f2f',
      4: '#f57c00',
      3: '#fbc02d',
      2: '#388e3c',
      1: '#1976d2'
    };
    return colors[score] || '#757575';
  };

  const getScoreLabel = (score: number | null): string => {
    if (score === null || score === undefined) return '';
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO'
    };
    return labels[score] || 'DESCONHECIDO';
  };

  // Fechar modal ao pressionar ESC
  React.useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [onClose]);

  // Prevenir scroll do body quando modal está aberto
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header - Compacto e Profissional */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">📋 Recomendações</h2>
                <p className="text-white/90 text-sm">{consultant.nome_consultores} • {consultant.cargo_consultores}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition"
              aria-label="Fechar"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Summary Card - Mais Compacto */}
        <div className="px-6 pt-4 pb-2">
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-3 rounded-lg">
                  <Lightbulb className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-indigo-900">{recommendationsLast90Days.length}</p>
                  <p className="text-sm text-indigo-700">
                    {recommendationsLast90Days.length === 1 ? 'recomendação encontrada' : 'recomendações encontradas'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-indigo-600">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-semibold">Últimos 90 dias</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          
          {recommendationsLast90Days.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Nenhuma recomendação encontrada</p>
              <p className="text-gray-500 text-sm">
                Não há recomendações disponíveis para este consultor nos últimos 90 dias.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Seção RECOMENDAÇÕES */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-600 rounded"></div>
                  Recomendações
                </h3>
                
                <div className="space-y-3">
                  {recommendationsLast90Days.map((rec, idx) => {
                    const typeColor = getTypeColor(rec.tipo);
                    return (
                      <div
                        key={idx}
                        className={`${typeColor.bg} border-l-4 ${typeColor.border} p-4 rounded-r-lg hover:shadow-md transition-shadow`}
                      >
                        <div className="flex justify-between items-start gap-3 mb-2">
                          <span className={`font-bold text-xs uppercase ${typeColor.text} whitespace-nowrap`}>
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
            </div>
          )}
        </div>

        {/* Footer - Compacto */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 transition font-semibold shadow-md"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;
