import React from 'react';
import { ConsultantReport, Recommendation } from './types';
import { AlertTriangle, CheckCircle, MessageSquare, BookOpen } from 'lucide-react'; // Re-import para forçar resolução no Vercel

interface ReportDetailsModalProps {
    report: ConsultantReport | null;
    onClose: () => void;
    isQuarantineView: boolean;
}

const ReportDetailsModal: React.FC<ReportDetailsModalProps> = ({ report, onClose, isQuarantineView }) => {
    if (!report) return null;

    const { month, year, summary, negativePattern, recommendations, content } = report;

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
                <div className="flex justify-between items-start mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-[#4D5253]">
                        Detalhes do Relatório ({month}/{year})
                    </h3>
                    <button onClick={onClose} className="text-2xl text-gray-500 hover:text-gray-800 transition-colors">&times;</button>
                </div>
                
                <div className="space-y-6">
                    
                    {/* Requisito A: Resumo do Problema (Summary) */}
                    <div className="p-4 bg-blue-50 rounded border-l-4 border-blue-500">
                        <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-1">
                            <MessageSquare className="w-5 h-5" /> Resumo do Problema
                        </h4>
                        <p className="text-sm text-gray-700">{summary}</p>
                    </div>

                    {/* Requisito A: Padrão Negativo */}
                    {negativePattern && (
                        <div className="p-4 bg-red-50 rounded border-l-4 border-red-500">
                            <h4 className="font-bold text-red-800 flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-5 h-5" /> Padrão Negativo Identificado
                            </h4>
                            <p className="text-sm text-gray-700">{negativePattern}</p>
                        </div>
                    )}

                    {/* Requisito A: Recomendação Estratégica */}
                    {recommendations && recommendations.length > 0 && (
                        <div className="p-4 bg-green-50 rounded border-l-4 border-green-500">
                            <h4 className="font-bold text-green-800 flex items-center gap-2 mb-2">
                                <CheckCircle className="w-5 h-5" /> Recomendações Estratégicas
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {recommendations.map((rec: Recommendation, i: number) => (
                                    <div key={i} className="p-3 border border-green-200 rounded shadow-sm bg-white">
                                        <span className="text-xs font-bold uppercase bg-green-100 text-green-800 px-2 py-1 rounded-full">{rec.tipo}</span>
                                        <p className="mt-2 text-sm text-gray-700">{rec.descricao}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Requisito B: Relatório de Atividades (Activity Report) - Exibido apenas no Dashboard */}
                    {!isQuarantineView && content && (
                        <div className="p-4 bg-gray-100 rounded border-l-4 border-gray-400">
                            <h4 className="font-bold text-gray-700 flex items-center gap-2 mb-2">
                                <BookOpen className="w-5 h-5" /> Relatório de Atividades Completo
                            </h4>
                            <div className="bg-white p-4 rounded border border-gray-200 max-h-60 overflow-y-auto text-sm whitespace-pre-wrap">
                                {content}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                * Este é o relatório de atividades que gerou o indicador de risco.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportDetailsModal;
