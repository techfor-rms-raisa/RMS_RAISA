import React, { useEffect } from 'react';
import './RecommendationsModal.css';

interface Recommendation {
  category: 'Recomendação de ação' | 'Atenção' | 'Feedback' | 'Treinamento' | 'Acompanhamento';
  description: string;
}

interface RecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultantName: string;
  score: number | null;
  recommendations: Recommendation[];
}

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  isOpen,
  onClose,
  consultantName,
  score,
  recommendations = []
}) => {
  // ✅ NOVO: useEffect para fechar modal ao pressionar ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, onClose]);

  // ✅ NOVO: Prevenir scroll do body quando modal está aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getScoreColor = (s: number | null): string => {
    if (s === null || s === undefined) return '#757575';
    const colors: { [key: number]: string } = {
      5: '#d32f2f',
      4: '#f57c00',
      3: '#fbc02d',
      2: '#388e3c',
      1: '#1976d2'
    };
    return colors[s] || '#757575';
  };

  const getScoreLabel = (s: number | null): string => {
    if (s === null || s === undefined) return '';
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO'
    };
    return labels[s] || 'DESCONHECIDO';
  };

  const getCategoryColor = (category: string): string => {
    const colors: { [key: string]: string } = {
      'Recomendação de ação': '#3b82f6',
      'Atenção': '#f97316',
      'Feedback': '#8b5cf6',
      'Treinamento': '#06b6d4',
      'Acompanhamento': '#10b981'
    };
    return colors[category] || '#6b7280';
  };

  return (
    <div className="recommendations-modal-overlay" onClick={onClose}>
      <div className="recommendations-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="recommendations-modal-header">
          <div className="recommendations-modal-title-section">
            <h2 className="recommendations-modal-title">⚡ Recomendações de Ação</h2>
            <p className="recommendations-modal-consultant">{consultantName}</p>
          </div>
          <div className="recommendations-modal-score">
            <div 
              className="recommendations-modal-score-circle"
              style={{ backgroundColor: getScoreColor(score) }}
            >
              <span className="recommendations-modal-score-number">{score}</span>
              <span className="recommendations-modal-score-label">{getScoreLabel(score).substring(0, 3)}</span>
            </div>
          </div>
          <button className="recommendations-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="recommendations-modal-body">
          {recommendations.length > 0 ? (
            <div className="recommendations-grid">
              {recommendations.map((rec, idx) => (
                <div 
                  key={idx} 
                  className="recommendation-card"
                  style={{ borderLeftColor: getCategoryColor(rec.category) }}
                >
                  <div className="recommendation-category" style={{ color: getCategoryColor(rec.category) }}>
                    {rec.category.toUpperCase()}
                  </div>
                  <div className="recommendation-description">
                    {rec.description}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="recommendations-empty">
              <p>Nenhuma recomendação disponível para este consultor.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="recommendations-modal-footer">
          <button className="recommendations-modal-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;
