import React from 'react';
import { Consultant, ConsultantReport } from '@/types';

interface MonthlyReportsModalProps {
  consultant: Consultant;
  month: number;
  reports: ConsultantReport[];
  onClose: () => void;
}

const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MonthlyReportsModal: React.FC<MonthlyReportsModalProps> = ({ consultant, month, reports, onClose }) => {

    // ✅ CORREÇÃO: Formatar data de criação do registro
    const formatCreatedDate = (dateString: string | undefined) => {
        if (!dateString) return null;
        try {
            return new Date(dateString).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return null;
        }
    };

    // ✅ NOVO: Formatar o período de referência do relatório (mês/ano)
    const formatReportPeriod = (reportMonth: number | undefined, reportYear: number | undefined) => {
        if (reportMonth && reportYear) {
            return `${months[reportMonth - 1]} de ${reportYear}`;
        }
        if (reportMonth) {
            return months[reportMonth - 1];
        }
        return null;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Cabeçalho */}
                <div className="bg-indigo-600 text-white p-4 rounded-t-lg">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Histórico de Atividades - {months[month - 1]}</h2>
                        <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl">&times;</button>
                    </div>
                    <div className="mt-2">
                        <p className="font-semibold">{consultant.nome_consultores}</p>
                        <p className="text-sm opacity-90">{consultant.cargo_consultores || 'Cargo não informado'}</p>
                    </div>
                </div>

                {/* Corpo */}
                <div className="p-6 overflow-y-auto flex-grow">
                    <div className="bg-indigo-500 text-white p-3 rounded-md mb-6">
                        <p>{reports.length} relatório(s) encontrado(s)</p>
                    </div>

                    {reports.length > 0 ? (
                        <div className="space-y-4">
                            {reports.map(report => {
                                const reportPeriod = formatReportPeriod(report.month, report.year);
                                const createdDate = formatCreatedDate(report.created_at);
                                
                                return (
                                    <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                                        {/* ✅ CORREÇÃO: Exibir período de referência e data de registro */}
                                        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                                            {reportPeriod && (
                                                <p className="flex items-center gap-1">
                                                    <span className="font-medium text-indigo-600">📅 PERÍODO:</span> 
                                                    <span className="text-gray-700 font-semibold">{reportPeriod}</span>
                                                </p>
                                            )}
                                            {createdDate && (
                                                <p className="flex items-center gap-1">
                                                    <span className="text-gray-400">Registrado em:</span> 
                                                    <span>{createdDate}</span>
                                                </p>
                                            )}
                                        </div>
                                        
                                        {/* Score de Risco */}
                                        {report.risk_score && (
                                            <div className="mb-3">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    report.risk_score === 1 ? 'bg-green-100 text-green-800' :
                                                    report.risk_score === 2 ? 'bg-blue-100 text-blue-800' :
                                                    report.risk_score === 3 ? 'bg-yellow-100 text-yellow-800' :
                                                    report.risk_score === 4 ? 'bg-orange-100 text-orange-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                    Risco: {report.risk_score} - {
                                                        report.risk_score === 1 ? 'Excelente' :
                                                        report.risk_score === 2 ? 'Bom' :
                                                        report.risk_score === 3 ? 'Médio' :
                                                        report.risk_score === 4 ? 'Alto' :
                                                        'Crítico'
                                                    }
                                                </span>
                                            </div>
                                        )}
                                        
                                        <h3 className="font-bold text-gray-800 mb-2">Relatório de Atividade</h3>
                                        <div 
                                            className="prose prose-sm max-w-none text-gray-700"
                                            dangerouslySetInnerHTML={{ __html: report.summary || report.content || '<p>Nenhum conteúdo disponível.</p>' }}
                                        ></div>
                                        
                                        {/* Padrão Negativo */}
                                        {report.negative_pattern && report.negative_pattern !== 'Nenhum' && (
                                            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                                                <span className="font-medium text-amber-700">⚠️ Padrão Identificado:</span>
                                                <p className="text-amber-600 mt-1">{report.negative_pattern}</p>
                                            </div>
                                        )}
                                        
                                        {/* Alerta Preditivo */}
                                        {report.predictive_alert && report.predictive_alert !== 'Nenhum' && (
                                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
                                                <span className="font-medium text-red-700">🔮 Alerta Preditivo:</span>
                                                <p className="text-red-600 mt-1">{report.predictive_alert}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-gray-500">Nenhum relatório detalhado encontrado para este mês.</p>
                        </div>
                    )}
                </div>

                {/* Rodapé */}
                <div className="p-4 bg-gray-50 rounded-b-lg border-t border-gray-200 flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MonthlyReportsModal;
