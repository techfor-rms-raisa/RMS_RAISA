import React, { useMemo } from 'react';
import { X, Calendar, FileText, AlertCircle, TrendingUp } from 'lucide-react';
import { Consultant, ConsultantReport } from '@/types';

interface HistoricoAtividadesModalProps {
  consultant: Consultant;
  reports?: ConsultantReport[];  // Agora aceita 'reports' (como está sendo passado)
  allReports?: ConsultantReport[];  // Também aceita 'allReports' (para compatibilidade)
  onClose: () => void;
}

const HistoricoAtividadesModal: React.FC<HistoricoAtividadesModalProps> = ({
  consultant,
  reports,
  allReports,
  onClose
}) => {
  
  // Usar reports ou allReports, com fallback para array vazio
  const reportsData = reports || allReports || [];
  
  // Filtrar relatórios dos últimos 90 dias
  const reportsLast90Days = useMemo(() => {
    // Validação: garantir que reportsData é um array
    if (!Array.isArray(reportsData)) {
      console.warn('⚠️ HistoricoAtividadesModal: reports não é um array válido', reportsData);
      return [];
    }

    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    return reportsData
      .filter(report => {
        try {
          const reportDate = new Date(report.createdAt);
          return reportDate >= ninetyDaysAgo && reportDate <= today;
        } catch (error) {
          console.warn('⚠️ Erro ao processar data do relatório:', error);
          return false;
        }
      })
      .sort((a, b) => {
        try {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } catch {
          return 0;
        }
      });
  }, [reportsData]);

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
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
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Histórico de Atividades</h2>
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
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-purple-900">{reportsLast90Days.length}</p>
                  <p className="text-sm text-purple-700">
                    {reportsLast90Days.length === 1 ? 'relatório encontrado' : 'relatórios encontrados'}
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
          
          {reportsLast90Days.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-700 text-lg font-semibold mb-2">Nenhum relatório encontrado</p>
              <p className="text-gray-500 text-sm">
                Não há relatórios de atividades nos últimos 90 dias para este consultor.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportsLast90Days.map((report, index) => (
                <div 
                  key={report.id || index}
                  className="bg-white border-2 border-gray-100 rounded-xl p-5 hover:border-purple-200 hover:shadow-lg transition-all duration-200"
                >
                  {/* Report Header - Linha Única */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-100 p-2 rounded-lg">
                        <Calendar className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-gray-800">
                          {monthNames[report.month - 1]} {report.year}
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(report.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div 
                      className="px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-md"
                      style={{ backgroundColor: getScoreColor(report.riskScore) }}
                    >
                      {getScoreLabel(report.riskScore)} • {report.riskScore}
                    </div>
                  </div>

                  {/* Report Content - Melhor Formatação */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        Relatório de Atividade
                      </h4>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
                        {report.content || report.summary || 'Conteúdo não disponível'}
                      </div>
                    </div>

                    {/* Recommendations - Mais Compactas */}
                    {report.recommendations && Array.isArray(report.recommendations) && report.recommendations.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Recomendações
                        </h4>
                        <div className="space-y-2">
                          {report.recommendations.map((rec, idx) => (
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
                    )}
                  </div>
                </div>
              ))}
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

export default HistoricoAtividadesModal;
