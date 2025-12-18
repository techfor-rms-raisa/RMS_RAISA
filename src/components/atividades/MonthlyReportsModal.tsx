import React from 'react';
import { Consultant, ConsultantReport } from '../types';

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

    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return 'Data não disponível';
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
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
                            {reports.map(report => (
                                <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                                    <p className="text-sm text-gray-500 mb-2">DATA DO RELATÓRIO: {formatDate(report.created_at)}</p>
                                    <h3 className="font-bold text-gray-800 mb-2">Relatório de Atividade</h3>
                                    <div 
                                        className="prose prose-sm max-w-none text-gray-700"
                                        dangerouslySetInnerHTML={{ __html: report.summary || report.content || '<p>Nenhum conteúdo disponível.</p>' }}
                                    ></div>
                                </div>
                            ))}
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
