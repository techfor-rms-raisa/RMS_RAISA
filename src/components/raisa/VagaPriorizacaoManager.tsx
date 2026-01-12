import React, { useState, useEffect } from 'react';
import { 
    buscarPrioridadeVaga,
    buscarRecomendacoesAnalistas,
    atribuirAnalistaVaga
} from '../../services/vagaPriorizacaoService';
import { VagaPriorizacaoScore, AnalistaFitScore } from '@/types';

interface VagaPriorizacaoManagerProps {
    vagaId: string;
    vagaTitulo: string;
    onClose: () => void;
}

const VagaPriorizacaoManager: React.FC<VagaPriorizacaoManagerProps> = ({ vagaId, vagaTitulo, onClose }) => {
    const [prioridade, setPrioridade] = useState<VagaPriorizacaoScore | null>(null);
    const [recomendacoes, setRecomendacoes] = useState<AnalistaFitScore[]>([]);
    const [loading, setLoading] = useState(false);
    const [calculando, setCalculando] = useState(false);
    const [analistaSelecionado, setAnalistaSelecionado] = useState<number | null>(null);

    useEffect(() => {
        carregarDados();
    }, [vagaId]);

    const carregarDados = async () => {
        setLoading(true);
        try {
            const prioridadeData = await buscarPrioridadeVaga(vagaId);
            setPrioridade(prioridadeData);

            if (prioridadeData) {
                const recomendacoesData = await buscarRecomendacoesAnalistas(vagaId);
                setRecomendacoes(recomendacoesData);
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    // ============================================
    // CALCULAR PRIORIDADE VIA API (BACKEND)
    // ============================================
    const handleCalcularPrioridade = async () => {
        setCalculando(true);
        try {
            // Chamar API no backend (onde a API_KEY está disponível)
            const response = await fetch('/api/vaga-prioridade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vagaId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro ao calcular prioridade');
            }

            const { prioridade: novaPrioridade } = await response.json();
            setPrioridade(novaPrioridade);

            // Buscar recomendações de analistas via API
            const responseAnalistas = await fetch('/api/vaga-analistas-recomendados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vagaId })
            });

            if (responseAnalistas.ok) {
                const { recomendacoes: novasRecomendacoes } = await responseAnalistas.json();
                setRecomendacoes(novasRecomendacoes || []);
            }
        } catch (error: any) {
            console.error('Erro ao calcular prioridade:', error);
            alert(`Erro ao calcular prioridade: ${error.message}`);
        } finally {
            setCalculando(false);
        }
    };

    const handleAtribuirAnalista = async (analistaId: number) => {
        if (!confirm('Confirma a atribuição deste analista para esta vaga?')) {
            return;
        }

        try {
            const sucesso = await atribuirAnalistaVaga(vagaId, analistaId);
            if (sucesso) {
                alert('Analista atribuído com sucesso!');
                onClose();
            } else {
                alert('Erro ao atribuir analista.');
            }
        } catch (error) {
            console.error('Erro ao atribuir analista:', error);
            alert('Erro ao atribuir analista.');
        }
    };

    const getPrioridadeColor = (nivel: string) => {
        switch (nivel) {
            case 'Alta': return 'bg-red-100 text-red-800 border-red-300';
            case 'Média': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case 'Baixa': return 'bg-green-100 text-green-800 border-green-300';
            default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getAdequacaoColor = (nivel: string) => {
        switch (nivel) {
            case 'Excelente': return 'bg-green-100 text-green-800';
            case 'Bom': return 'bg-blue-100 text-blue-800';
            case 'Regular': return 'bg-yellow-100 text-yellow-800';
            case 'Baixo': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 sticky top-0 z-10">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold">Priorização e Distribuição Inteligente</h2>
                            <p className="text-orange-100 mt-1">{vagaTitulo}</p>
                        </div>
                        <button onClick={onClose} className="text-white hover:text-gray-200 text-3xl">&times;</button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
                            <p className="mt-4 text-gray-600">Carregando dados...</p>
                        </div>
                    ) : (
                        <>
                            {/* Seção de Prioridade */}
                            <div className="mb-8">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-gray-800">Score de Prioridade</h3>
                                    <button
                                        onClick={handleCalcularPrioridade}
                                        disabled={calculando}
                                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {calculando ? 'Calculando...' : prioridade ? 'Recalcular' : 'Calcular Prioridade'}
                                    </button>
                                </div>

                                {prioridade ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Card Principal */}
                                        <div className={`border-2 rounded-lg p-4 ${getPrioridadeColor(prioridade.nivel_prioridade)}`}>
                                            <div className="text-center">
                                                <div className="text-4xl font-bold mb-2">{prioridade.score_prioridade}</div>
                                                <div className="text-sm font-semibold uppercase">{prioridade.nivel_prioridade} Prioridade</div>
                                                <div className="mt-2 text-xs">SLA: {prioridade.sla_dias} dias</div>
                                            </div>
                                        </div>

                                        {/* Fatores Considerados */}
                                        <div className="col-span-2 border rounded-lg p-4">
                                            <h4 className="font-bold text-gray-700 mb-3">Fatores Considerados</h4>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span className="text-gray-600">Urgência do Prazo:</span>
                                                    <span className="ml-2 font-semibold">{prioridade.fatores_considerados.urgencia_prazo}/100</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-600">Valor Faturamento:</span>
                                                    <span className="ml-2 font-semibold">{prioridade.fatores_considerados.valor_faturamento}/100</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-600">Cliente VIP:</span>
                                                    <span className="ml-2 font-semibold">{prioridade.fatores_considerados.cliente_vip ? 'Sim' : 'Não'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-600">Tempo em Aberto:</span>
                                                    <span className="ml-2 font-semibold">{prioridade.fatores_considerados.tempo_vaga_aberta} dias</span>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-gray-600">Complexidade Stack:</span>
                                                    <span className="ml-2 font-semibold">{prioridade.fatores_considerados.complexidade_stack}/100</span>
                                                </div>
                                            </div>
                                            <div className="mt-3 pt-3 border-t">
                                                <p className="text-sm text-gray-700"><strong>Justificativa IA:</strong> {prioridade.justificativa}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                        <p className="text-gray-600">Nenhuma prioridade calculada ainda.</p>
                                        <p className="text-sm text-gray-500 mt-2">Clique em "Calcular Prioridade" para começar.</p>
                                    </div>
                                )}
                            </div>

                            {/* Seção de Recomendações de Analistas */}
                            {recomendacoes.length > 0 && (
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-4">Analistas Recomendados</h3>
                                    <div className="space-y-4">
                                        {recomendacoes.map((rec, index) => (
                                            <div key={rec.analista_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <div className="bg-orange-100 text-orange-800 rounded-full w-8 h-8 flex items-center justify-center font-bold">
                                                                {index + 1}
                                                            </div>
                                                            <h4 className="text-lg font-bold text-gray-800">{rec.analista_nome}</h4>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getAdequacaoColor(rec.nivel_adequacao)}`}>
                                                                {rec.nivel_adequacao}
                                                            </span>
                                                            <span className="text-2xl font-bold text-orange-600">{rec.score_match}/100</span>
                                                        </div>

                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                                                            <div>
                                                                <span className="text-gray-600">Fit Stack:</span>
                                                                <span className="ml-1 font-semibold">{rec.fatores_match.fit_stack_tecnologica}%</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-600">Fit Cliente:</span>
                                                                <span className="ml-1 font-semibold">{rec.fatores_match.fit_cliente}%</span>
                                                            </div>
                                            <div>
                                                                <span className="text-gray-600">Disponibilidade:</span>
                                                                <span className="ml-1 font-semibold">{rec.fatores_match.disponibilidade}%</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-600">Taxa Sucesso:</span>
                                                                <span className="ml-1 font-semibold">{rec.fatores_match.taxa_sucesso_historica}%</span>
                                                            </div>
                                                        </div>

                                                        <p className="text-sm text-gray-700 mb-2">
                                                            <strong>Justificativa:</strong> {rec.justificativa_match}
                                                        </p>

                                                        <p className="text-xs text-gray-600">
                                                            <strong>Tempo Estimado de Fechamento:</strong> {rec.tempo_estimado_fechamento_dias} dias
                                                        </p>
                                                    </div>

                                                    <button
                                                        onClick={() => handleAtribuirAnalista(rec.analista_id)}
                                                        className="ml-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold whitespace-nowrap"
                                                    >
                                                        Atribuir
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VagaPriorizacaoManager;
