import React, { useState } from 'react';
import { Consultant, UsuarioCliente } from '@/types';

interface ReportActivityModalProps {
    isOpen: boolean;
    onClose: () => void;
    consultant?: Consultant;
    manager?: UsuarioCliente;
    onSubmit: (text: string) => Promise<void>;
}

const ReportActivityModal: React.FC<ReportActivityModalProps> = ({ 
    isOpen, 
    onClose, 
    consultant, 
    manager, 
    onSubmit 
}) => {
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
    const [activities, setActivities] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!activities.trim()) {
            alert('Por favor, descreva as atividades do consultor.');
            return;
        }

        setIsSubmitting(true);

        try {
            // Formato: CONSULTOR | GESTOR | MÊS | ATIVIDADES
            const consultantName = consultant?.nome_consultores || 'Não especificado';
            const managerName = manager?.nome_gestor_cliente || 'Não especificado';
            const reportText = `${consultantName} | ${managerName} | ${month} | ${activities}`;

            await onSubmit(reportText);
            
            // Limpar form e fechar
            setActivities('');
            setMonth(new Date().getMonth() + 1);
            onClose();
            
            alert('✅ Relatório de atividades processado com sucesso!');
        } catch (error) {
            console.error('Erro ao enviar relatório:', error);
            alert('❌ Erro ao processar relatório. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const months = [
        { value: 1, label: 'Janeiro' },
        { value: 2, label: 'Fevereiro' },
        { value: 3, label: 'Março' },
        { value: 4, label: 'Abril' },
        { value: 5, label: 'Maio' },
        { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' },
        { value: 8, label: 'Agosto' },
        { value: 9, label: 'Setembro' },
        { value: 10, label: 'Outubro' },
        { value: 11, label: 'Novembro' },
        { value: 12, label: 'Dezembro' }
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800">
                        📝 Adicionar Relatório de Atividades
                    </h2>
                    <button 
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-3xl font-bold"
                    >
                        &times;
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Informações do Consultor */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 mb-2">Informações:</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-600">Consultor:</span>
                                <p className="font-medium">{consultant?.nome_consultores || 'Não selecionado'}</p>
                            </div>
                            <div>
                                <span className="text-gray-600">Gestor:</span>
                                <p className="font-medium">{manager?.nome_gestor_cliente || 'Não selecionado'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Seleção de Mês */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Mês de Referência *
                        </label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                        >
                            {months.map(m => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Campo de Atividades */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Descrição das Atividades *
                        </label>
                        <textarea
                            value={activities}
                            onChange={(e) => setActivities(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={10}
                            placeholder="Descreva as atividades, entregas, problemas, sucessos, feedbacks do cliente, etc.

Exemplo:
- Entregou todas as tarefas dentro do prazo
- Recebeu elogio do cliente pela qualidade do trabalho
- Apresentou dificuldade em comunicação com a equipe
- Participou de treinamento técnico
- 2 faltas não justificadas no mês"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            💡 A IA analisará o texto e identificará automaticamente o nível de risco (1-4)
                        </p>
                    </div>

                    {/* Legenda de Risco */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-800 mb-3">📊 Níveis de Risco:</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-red-500"></div>
                                <span><strong>1 - Crítico:</strong> Problemas graves</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                                <span><strong>2 - Alto:</strong> Atenção necessária</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                                <span><strong>3 - Médio:</strong> Pontos de melhoria</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                                <span><strong>4 - Baixo:</strong> Performance positiva</span>
                            </div>
                        </div>
                    </div>

                    {/* Botões */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? '⏳ Processando...' : '✅ Processar Relatório'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReportActivityModal;
