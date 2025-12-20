import React from 'react';
import { Consultant, ConsultantReport } from '@/types';
import './MonthlyReportsModal.css';

interface MonthlyReportsModalProps {
  consultant: Consultant;
  month: number;
  reports: ConsultantReport[];
  onClose: () => void;
}

const MonthlyReportsModal: React.FC<MonthlyReportsModalProps> = ({
  consultant,
  month,
  reports,
  onClose
}) => {
  
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Data não disponível';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Data inválida';
    }
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
    if (score === null || score === undefined) return 'N/A';
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
    <div className="monthly-reports-modal-overlay" onClick={onClose}>
      <div className="monthly-reports-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="monthly-reports-modal-header">
          <div className="modal-header-content">
            <h3 className="modal-title">
              Histórico de Atividades - {monthNames[month - 1]}
            </h3>
            <p className="modal-subtitle">
              {consultant.nome_consultores}
            </p>
            <p className="modal-info">
              {consultant.cargo_consultores || 'Cargo não informado'}
            </p>
          </div>
          <button 
            className="monthly-reports-modal-close" 
            onClick={onClose}
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="monthly-reports-modal-body">
          {reports.length > 0 ? (
            <div className="reports-list">
              <div className="reports-count">
                <span className="count-badge">{reports.length}</span>
                <span className="count-text">
                  {reports.length === 1 ? 'relatório encontrado' : 'relatórios encontrados'}
                </span>
              </div>

              {reports.map((report, idx) => (
                <div key={idx} className="report-card">
                  {/* Header do Card */}
                  <div className="report-card-header">
                    <div className="report-date-info">
                      <span className="report-date-label">Data do Relatório:</span>
                      <span className="report-date-value">
                        {formatDate(report.data_relatorio || report.created_at)}
                      </span>
                    </div>
                    
                    {report.score !== null && report.score !== undefined && (
                      <div 
                        className="report-score-badge"
                        style={{ backgroundColor: getScoreColor(report.score) }}
                      >
                        <span className="score-label">RISCO</span>
                        <span className="score-value">{getScoreLabel(report.score)}</span>
                        <span className="score-number">Score {report.score}</span>
                      </div>
                    )}
                  </div>

                  {/* Conteúdo do Relatório */}
                  <div className="report-content">
                    <h4 className="report-content-title">Relatório de Atividade</h4>
                    <div className="report-content-text">
                      {report.relatorio_atividade || report.content || 'Conteúdo não disponível'}
                    </div>
                  </div>

                  {/* Análise de Risco (se existir) */}
                  {report.analise_risco && (
                    <div className="report-analysis">
                      <h4 className="report-analysis-title">⚠️ Análise de Risco</h4>
                      <div className="report-analysis-text">
                        {report.analise_risco}
                      </div>
                    </div>
                  )}

                  {/* Recomendações (se existirem) */}
                  {report.recomendacoes && (
                    <div className="report-recommendations">
                      <h4 className="report-recommendations-title">💡 Recomendações</h4>
                      <div className="report-recommendations-text">
                        {report.recomendacoes}
                      </div>
                    </div>
                  )}

                  {/* Metadados Adicionais */}
                  <div className="report-metadata">
                    {report.created_by && (
                      <div className="metadata-item">
                        <span className="metadata-label">Criado por:</span>
                        <span className="metadata-value">{report.created_by}</span>
                      </div>
                    )}
                    {report.updated_at && (
                      <div className="metadata-item">
                        <span className="metadata-label">Última atualização:</span>
                        <span className="metadata-value">{formatDate(report.updated_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p className="empty-state-text">
                Nenhum relatório encontrado para {monthNames[month - 1]}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="monthly-reports-modal-footer">
          <button className="modal-close-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonthlyReportsModal;
