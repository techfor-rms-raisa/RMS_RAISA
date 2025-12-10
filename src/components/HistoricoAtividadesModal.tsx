import React, { useMemo } from 'react';
import { X, Calendar, FileText, AlertCircle } from 'lucide-react';
import { Consultant, ConsultantReport } from '../components/types';

interface HistoricoAtividadesModalProps {
  consultant: Consultant;
  allReports: ConsultantReport[];
  onClose: () => void;
}

const HistoricoAtividadesModal: React.FC<HistoricoAtividadesModalProps> = ({
  consultant,
  allReports,
  onClose
}) => {
  
  // Filtrar relatórios dos últimos 90 dias
  const reportsLast90Days = useMemo(() => {
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    return allReports
      .filter(report => {
        const reportDate = new Date(report.createdAt);
        return reportDate >= ninetyDaysAgo && reportDate <= today;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allReports]);

  const formatDate = (dateString: string): string => {
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

  const getScoreColor = (score: number): string => {
    const colors: { [key: number]: string } = {
      5: '#d32f2f',
      4: '#f57c00',
      3: '#fbc02d',
      2: '#388e3c',
      1: '#1976d2'
    };
    return colors[score] || '#757575';
  };

  const getScoreLabel = (score: number): string => {
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO'
    };
    return labels[score] || 'N/A';
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="monthly-reports-modal-overlay" onClick={onClose}>
      <div className="monthly-reports-modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="monthly-reports-modal-header">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-6 h-6" />
              Histórico de Atividades - Últimos 90 Dias
            </h2>
            <p className="text-white/90 mt-1">{consultant.nome_consultores}</p>
            <p className="text-white/80 text-sm uppercase">{consultant.cargo_consultores}</p>
          </div>
          <button
            onClick={onClose}
            className="monthly-reports-modal-close"
            aria-label="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="monthly-reports-modal-body">
          
          {/* Summary Badge */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-purple-900">{reportsLast90Days.length}</p>
                  <p className="text-sm text-purple-700">
                    {reportsLast90Days.length === 1 ? 'relatório encontrado' : 'relatórios encontrados'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Período</p>
                <p className="text-sm font-semibold text-gray-800">Últimos 90 dias</p>
              </div>
            </div>
          </div>

          {/* Reports List */}
          {reportsLast90Days.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium">Nenhum relatório encontrado</p>
              <p className="text-gray-500 text-sm mt-2">
                Não há relatórios de atividades nos últimos 90 dias para este consultor.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportsLast90Days.map((report, index) => (
                <div 
                  key={report.id || index}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  {/* Report Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-semibold text-gray-700">
                          {monthNames[report.month - 1]} {report.year}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        DATA DO RELATÓRIO: {formatDate(report.createdAt)}
                      </p>
                    </div>
                    <div 
                      className="px-3 py-1 rounded-full text-white text-xs font-bold"
                      style={{ backgroundColor: getScoreColor(report.riskScore) }}
                    >
                      {getScoreLabel(report.riskScore)} - Score {report.riskScore}
                    </div>
                  </div>

                  {/* Report Content */}
                  <div className="border-t border-gray-100 pt-3">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-600" />
                      Relatório de Atividade
                    </h4>
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {report.content || report.summary || 'Conteúdo não disponível'}
                    </div>
                  </div>

                  {/* Recommendations (if any) */}
                  {report.recommendations && report.recommendations.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">
                        Recomendações
                      </h4>
                      <div className="space-y-2">
                        {report.recommendations.map((rec, idx) => (
                          <div key={idx} className="text-xs bg-blue-50 border-l-4 border-blue-400 p-2 rounded">
                            <span className="font-semibold text-blue-800">{rec.tipo}:</span>
                            <span className="text-gray-700 ml-1">{rec.descricao}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="monthly-reports-modal-footer">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoricoAtividadesModal;
