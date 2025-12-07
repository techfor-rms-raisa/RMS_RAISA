/**
 * COMPONENTE: CARD DE RECOMENDAÇÃO DA IA
 * Exibe recomendação da IA sobre candidato com opção de acatar ou divergir
 */

import React, { useState, useEffect } from 'react';
import { Brain, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { 
    buscarRecomendacaoIA,
    registrarEnvioCVAoCliente,
    registrarDivergenciaAnalista,
    RecomendacaoIA
} from '../services/recomendacaoAnalistaService';

interface Props {
    candidaturaId: number;
    analistaId: number;
    onAcaoRealizada?: () => void;
}

export function RecomendacaoIACard({ candidaturaId, analistaId, onAcaoRealizada }: Props) {
    const [recomendacao, setRecomendacao] = useState<RecomendacaoIA | null>(null);
    const [loading, setLoading] = useState(true);
    const [mostrarModalDivergencia, setMostrarModalDivergencia] = useState(false);
    const [motivoDivergencia, setMotivoDivergencia] = useState('');
    const [processando, setProcessando] = useState(false);

    useEffect(() => {
        carregarRecomendacao();
    }, [candidaturaId]);

    async function carregarRecomendacao() {
        try {
            setLoading(true);
            const data = await buscarRecomendacaoIA(candidaturaId);
            setRecomendacao(data);
        } catch (error) {
            console.error('Erro ao carregar recomendação:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleEnviarCV() {
        try {
            setProcessando(true);

            // Se IA recomendou rejeitar, mostrar modal de divergência
            if (recomendacao?.recomendacao === 'rejeitar') {
                setMostrarModalDivergencia(true);
                setProcessando(false);
                return;
            }

            // Se IA recomendou aprovar, enviar direto
            await registrarEnvioCVAoCliente(candidaturaId, analistaId);
            alert('CV enviado ao cliente!');
            onAcaoRealizada?.();

        } catch (error) {
            console.error('Erro ao enviar CV:', error);
            alert('Erro ao enviar CV.');
        } finally {
            setProcessando(false);
        }
    }

    async function handleConfirmarDivergencia() {
        if (!motivoDivergencia.trim()) {
            alert('Por favor, informe o motivo da divergência');
            return;
        }

        try {
            setProcessando(true);

            // Registrar envio do CV
            await registrarEnvioCVAoCliente(candidaturaId, analistaId);

            // Registrar motivo da divergência
            await registrarDivergenciaAnalista(candidaturaId, motivoDivergencia);

            alert('CV enviado e divergência registrada!');
            setMostrarModalDivergencia(false);
            onAcaoRealizada?.();

        } catch (error) {
            console.error('Erro ao registrar divergência:', error);
            alert('Erro ao processar.');
        } finally {
            setProcessando(false);
        }
    }

    function getRecomendacaoColor(rec: string) {
        switch (rec) {
            case 'aprovar': return 'bg-green-100 text-green-800 border-green-300';
            case 'rejeitar': return 'bg-red-100 text-red-800 border-red-300';
            case 'reavaliar': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    }

    function getRecomendacaoIcon(rec: string) {
        switch (rec) {
            case 'aprovar': return <ThumbsUp className="w-5 h-5" />;
            case 'rejeitar': return <ThumbsDown className="w-5 h-5" />;
            case 'reavaliar': return <AlertTriangle className="w-5 h-5" />;
            default: return <Brain className="w-5 h-5" />;
        }
    }

    function getRecomendacaoTexto(rec: string) {
        switch (rec) {
            case 'aprovar': return 'APROVAR - Enviar ao Cliente';
            case 'rejeitar': return 'REJEITAR - Não Enviar';
            case 'reavaliar': return 'REAVALIAR - Segunda Entrevista';
            default: return 'Analisando...';
        }
    }

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    if (!recomendacao) {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-800">
                    <Brain className="w-5 h-5" />
                    <span className="text-sm font-medium">
                        Recomendação da IA será gerada após a entrevista
                    </span>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="bg-white rounded-lg shadow-lg border-2 border-blue-200 p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Brain className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            Recomendação da IA
                        </h3>
                        <p className="text-sm text-gray-600">
                            Confiança: {recomendacao.score_confianca}%
                        </p>
                    </div>
                </div>

                {/* Recomendação */}
                <div className={`border-2 rounded-lg p-4 mb-4 ${getRecomendacaoColor(recomendacao.recomendacao)}`}>
                    <div className="flex items-center gap-2 mb-2">
                        {getRecomendacaoIcon(recomendacao.recomendacao)}
                        <span className="font-bold text-lg">
                            {getRecomendacaoTexto(recomendacao.recomendacao)}
                        </span>
                    </div>
                    <p className="text-sm">
                        {recomendacao.justificativa}
                    </p>
                </div>

                {/* Probabilidade de Aprovação */}
                {recomendacao.analise_detalhada?.probabilidade_aprovacao_cliente && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">
                                Probabilidade de Aprovação pelo Cliente
                            </span>
                            <span className="text-lg font-bold text-blue-600">
                                {recomendacao.analise_detalhada.probabilidade_aprovacao_cliente}%
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${recomendacao.analise_detalhada.probabilidade_aprovacao_cliente}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Red Flags */}
                {recomendacao.red_flags && recomendacao.red_flags.length > 0 && (
                    <div className="mb-4">
<h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
		                            <AlertTriangle className="w-4 h-4 text-red-600" />
		                            Red Flags
		                        </h4>
		                        <div className="flex flex-wrap gap-2">
		                            {recomendacao.red_flags.map((flag: any, index: number) => (
		                                <span key={index} className="flex items-center gap-1 text-xs px-3 py-1 bg-red-100 text-red-800 rounded-full border border-red-300">
		                                    <AlertTriangle className="w-3 h-3" />
		                                    {flag.tipo} ({flag.severidade}/5)
		                                </span>
		                            ))}
		                        </div>
                    </div>
                )}

                {/* Pontos Fortes */}
                {recomendacao.pontos_fortes && recomendacao.pontos_fortes.length > 0 && (
                    <div className="mb-4">
<h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
		                            <CheckCircle className="w-4 h-4 text-green-600" />
		                            Pontos Fortes
		                        </h4>
		                        <div className="flex flex-wrap gap-2">
		                            {recomendacao.pontos_fortes.map((ponto: string, index: number) => (
		                                <span key={index} className="flex items-center gap-1 text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full border border-green-300">
		                                    <CheckCircle className="w-3 h-3" />
		                                    {ponto}
		                                </span>
		                            ))}
		                        </div>
                    </div>
                )}

	                {/* Ações - Layout Horizontal */}
	                <div className="flex items-center gap-3 pt-4 border-t">
	                    {/* Botão Principal: Enviar CV ao Cliente */}
	                    <button
	                        onClick={handleEnviarCV}
	                        disabled={processando}
	                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
	                    >
	                        <TrendingUp className="w-5 h-5" />
	                        {processando ? 'Processando...' : 'Enviar CV ao Cliente'}
	                    </button>
	                    
	                    {/* Botão Secundário (Exemplo de Divergência/Rejeição) - Adicionar aqui se necessário */}
	                    {/* Exemplo: <button className="p-3 border rounded-lg hover:bg-gray-100 disabled:opacity-50"><ThumbsDown className="w-5 h-5 text-red-500" /></button> */}
	                </div>

                {/* Nota */}
                <p className="text-xs text-gray-500 mt-3 text-center">
                    💡 A decisão final é sempre sua. A IA apenas recomenda baseada em dados históricos.
                </p>
            </div>

            {/* Modal de Divergência */}
            {mostrarModalDivergencia && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Por que você discorda da IA?
                        </h3>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-yellow-800">
                                A IA recomendou <strong>REJEITAR</strong> este candidato, mas você decidiu enviar o CV.
                                Por favor, explique o motivo para que a IA possa aprender.
                            </p>
                        </div>

                        <textarea
                            value={motivoDivergencia}
                            onChange={(e) => setMotivoDivergencia(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"
                            placeholder="Ex: Candidato tem soft skills excepcionais que compensam gap técnico. Cliente valoriza muito comunicação e este candidato se destaca nisso."
                        />

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setMostrarModalDivergencia(false);
                                    setMotivoDivergencia('');
                                }}
                                className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmarDivergencia}
                                disabled={processando || !motivoDivergencia.trim()}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {processando ? 'Enviando...' : 'Confirmar Envio'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
