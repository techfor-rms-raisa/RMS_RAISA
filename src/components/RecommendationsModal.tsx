import React, { useEffect, useState } from 'react';
import { ConsultantReport } from '../components/types';
import './RecommendationsModal.css';

interface RecommendationsModalProps {
  consultant: any;
  analysis: any;
  onClose: () => void;
  onOpenHistory?: () => void;
}

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  consultant,
  analysis,
  onClose,
  onOpenHistory
}) => {
  const [historicalRecommendations, setHistoricalRecommendations] = useState<any[]>([]);

  // ✅ NOVO: useEffect para fechar modal ao pressionar ESC
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [onClose]);

  // ✅ NOVO: Prevenir scroll do body quando modal está aberto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // ✅ NOVO: Extrair recomendações mais recentes
  useEffect(() => {
    if (analysis?.recomendacoes && Array.isArray(analysis.recomendacoes)) {
      // Pegar apenas as 3 recomendações mais recentes
      const recent = analysis.recomendacoes.slice(0, 3);
      setHistoricalRecommendations(recent);
    }
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

  return (
    <div className="recommendations-modal-overlay" onClick={onClose}>
      <div className="recommendations-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="recommendations-modal-header">
          <div className="recommendations-modal-title-section">
            <h2 className="recommendations-modal-title">📋 Recomendações</h2>
            <p className="recommendations-modal-consultant">{consultant?.nome_consultores}</p>
          </div>
          <div className="recommendations-modal-score">
            <div 
              className="recommendations-modal-score-circle"
              style={{ backgroundColor: getScoreColor(consultant?.parecer_final_consultor) }}
            >
              <span className="recommendations-modal-score-number">{consultant?.parecer_final_consultor}</span>
              <span className="recommendations-modal-score-label">{getScoreLabel(consultant?.parecer_final_consultor).substring(0, 3)}</span>
            </div>
          </div>
          <button className="recommendations-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Body - Histórico Recente */}
        <div className="recommendations-modal-body">
          {historicalRecommendations.length > 0 ? (
            <div className="space-y-4">
              {historicalRecommendations.map((rec, idx) => {
                const typeColor = getTypeColor(rec.tipo);
                return (
                  <div
                    key={idx}
                    className={`${typeColor.bg} border-l-4 ${typeColor.border} p-4 rounded-r-lg hover:shadow-md transition-shadow`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className={`font-bold text-sm uppercase ${typeColor.text}`}>
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
          ) : (
            <div className="recommendations-empty">
              <p>Nenhuma recomendação disponível para este consultor.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="recommendations-modal-footer">
          <button 
            onClick={onOpenHistory}
            className="recommendations-modal-button-secondary"
            title="Ver histórico completo de até 90 dias"
          >
            📊 Ver Histórico Completo
          </button>
          <button 
            className="recommendations-modal-button" 
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;
