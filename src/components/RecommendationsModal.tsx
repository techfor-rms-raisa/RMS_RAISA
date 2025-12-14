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
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
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
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Lightbulb className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-purple-900">{recommendationsLast90Days.length}</p>
                  <p className="text-sm text-purple-700">
                    {recommendationsLast90Days.length === 1 ? 'recomendação encontrada' : 'recomendações encontradas'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-purple-600">
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
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                  Recomendações
                </h3>
                
                <div className="space-y-2">
                  {recommendationsLast90Days.map((rec, idx) => (
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
            </div>
          )}
        </div>

        {/* Footer - Compacto */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition font-semibold shadow-md"
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
