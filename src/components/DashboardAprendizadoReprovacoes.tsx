/**
 * COMPONENTE: DASHBOARD DE APRENDIZADO COM REPROVAÇÕES
 * Exibe análise mensal de padrões e insights da IA
 */

import React, { useState, useEffect } from 'react';
import { Brain, TrendingDown, AlertTriangle, Lightbulb, Calendar, Download } from 'lucide-react';
import { 
    buscarAnalises, 
    buscarAnalisePeriodo,
    identificarPadroesRecorrentes,
    gerarRelatorioAprendizado,
    AnaliseReprovacao
} from '../services/aprendizadoReprovacaoService';

export function DashboardAprendizadoReprovacoes() {
    const [analises, setAnalises] = useState<AnaliseReprovacao[]>([]);
    const [periodoSelecionado, setPeriodoSelecionado] = useState('');
    const [analiseDetalhada, setAnaliseDetalhada] = useState<any>(null);
    const [padroesRecorrentes, setPadroesRecorrentes] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        carregarDados();
    }, []);

    useEffect(() => {
        if (periodoSelecionado) {
            carregarAnaliseDetalhada();
        }
    }, [periodoSelecionado]);

    async function carregarDados() {
        try {
            setLoading(true);
            const data = await buscarAnalises(12);
            setAnalises(data);
            
            if (data.length > 0) {
                setPeriodoSelecionado(data[0].periodo);
            }

            const padroes = await identificarPadroesRecorrentes();
            setPadroesRecorrentes(padroes);

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    }

    async function carregarAnaliseDetalhada() {
        try {
            const relatorio = await gerarRelatorioAprendizado(periodoSelecionado);
            setAnaliseDetalhada(relatorio);
        } catch (error) {
            console.error('Erro ao carregar análise:', error);
        }
    }

    async function handleExportarRelatorio() {
        if (!analiseDetalhada) return;

        const conteudo = JSON.stringify(analiseDetalhada, null, 2);
        const blob = new Blob([conteudo], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-aprendizado-${periodoSelecionado}.json`;
        a.click();
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (analises.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                    Nenhuma análise disponível ainda. A primeira análise será gerada automaticamente no início do próximo mês.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Brain className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Aprendizado com Reprovações
                            </h2>
                            <p className="text-sm text-gray-600">
                                Análise mensal de padrões e insights da IA
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <select
                            value={periodoSelecionado}
                            onChange={(e) => setPeriodoSelecionado(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            {analises.map((analise) => (
                                <option key={analise.periodo} value={analise.periodo}>
                                    {new Date(analise.periodo + '-01').toLocaleDateString('pt-BR', { 
                                        month: 'long', 
                                        year: 'numeric' 
                                    })}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={handleExportarRelatorio}
                            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                            <Download className="w-4 h-4" />
                            Exportar
                        </button>
                    </div>
                </div>
            </div>

            {analiseDetalhada && (
                <>
                    {/* Métricas Principais */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Total Candidaturas</span>
                                <Calendar className="w-4 h-4 text-gray-400" />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">
                                {analiseDetalhada.resumo.total_candidaturas}
                            </p>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Reprovações</span>
                                <TrendingDown className="w-4 h-4 text-red-600" />
                            </div>
                            <p className="text-2xl font-bold text-red-600">
                                {analiseDetalhada.resumo.total_reprovacoes}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                {analiseDetalhada.resumo.taxa_reprovacao.toFixed(1)}% do total
                            </p>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Acurácia da IA</span>
                                <Brain className="w-4 h-4 text-blue-600" />
                            </div>
                            <p className="text-2xl font-bold text-blue-600">
                                {analiseDetalhada.resumo.taxa_acuracia_ia?.toFixed(1) || 0}%
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                Recomendações corretas
                            </p>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Insights Gerados</span>
                                <Lightbulb className="w-4 h-4 text-yellow-600" />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">
                                {analiseDetalhada.insights.length}
                            </p>
                        </div>
                    </div>

                    {/* Padrões Técnicos */}
                    {analiseDetalhada.padroes.tecnicos.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                Padrões Técnicos de Reprovação
                            </h3>
                            <div className="space-y-3">
                                {analiseDetalhada.padroes.tecnicos.map((padrao: any, index: number) => (
                                    <div key={index} className="border-l-4 border-red-500 pl-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="font-medium text-gray-900">{padrao.padrao}</p>
                                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                                                {padrao.frequencia}x
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            Exemplos: {padrao.exemplos.join(', ')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Padrões Comportamentais */}
                    {analiseDetalhada.padroes.comportamentais.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                                Padrões Comportamentais de Reprovação
                            </h3>
                            <div className="space-y-3">
                                {analiseDetalhada.padroes.comportamentais.map((padrao: any, index: number) => (
                                    <div key={index} className="border-l-4 border-orange-500 pl-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="font-medium text-gray-900">{padrao.padrao}</p>
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                                                {padrao.frequencia}x
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            Exemplos: {padrao.exemplos.join(', ')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Questões Ineficazes */}
                    {analiseDetalhada.questoes.ineficazes.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                ❌ Questões Ineficazes (Desativadas)
                            </h3>
                            <div className="space-y-2">
                                {analiseDetalhada.questoes.ineficazes.map((questao: any, index: number) => (
                                    <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                                        <p className="text-sm text-gray-900 mb-1">{questao.questao}</p>
                                        <p className="text-xs text-red-700">
                                            <strong>Motivo:</strong> {questao.motivo}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Questões Novas Sugeridas */}
                    {analiseDetalhada.questoes.novas_sugeridas.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                ✨ Novas Questões Sugeridas pela IA
                            </h3>
                            <div className="space-y-2">
                                {analiseDetalhada.questoes.novas_sugeridas.map((questao: any, index: number) => (
                                    <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                                        <div className="flex items-start justify-between mb-1">
                                            <p className="text-sm text-gray-900 flex-1">{questao.questao}</p>
                                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs ml-2">
                                                {questao.categoria}
                                            </span>
                                        </div>
                                        <p className="text-xs text-green-700">
                                            <strong>Motivo:</strong> {questao.motivo}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recomendações de Melhoria */}
                    {analiseDetalhada.recomendacoes.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                                <Lightbulb className="w-5 h-5" />
                                Recomendações de Melhoria
                            </h3>
                            <ul className="space-y-2">
                                {analiseDetalhada.recomendacoes.map((rec: string, index: number) => (
                                    <li key={index} className="flex items-start gap-2 text-blue-900">
                                        <span className="font-bold">•</span>
                                        <span className="text-sm">{rec}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Insights */}
                    {analiseDetalhada.insights.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-purple-900 mb-4 flex items-center gap-2">
                                <Brain className="w-5 h-5" />
                                Insights da IA
                            </h3>
                            <ul className="space-y-2">
                                {analiseDetalhada.insights.map((insight: string, index: number) => (
                                    <li key={index} className="flex items-start gap-2 text-purple-900">
                                        <span className="font-bold">💡</span>
                                        <span className="text-sm">{insight}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Padrões Recorrentes */}
                    {padroesRecorrentes && (
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                🔄 Padrões Recorrentes (Últimos 3 Meses)
                            </h3>
                            
                            {padroesRecorrentes.padroes_tecnicos_recorrentes.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="font-medium text-gray-900 mb-2">Técnicos:</h4>
                                    <div className="space-y-1">
                                        {padroesRecorrentes.padroes_tecnicos_recorrentes.map((p: any, i: number) => (
                                            <div key={i} className="text-sm text-gray-700">
                                                • {p.padrao} <span className="text-gray-500">({p.frequencia} meses)</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {padroesRecorrentes.tendencias.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Tendências:</h4>
                                    <div className="space-y-1">
                                        {padroesRecorrentes.tendencias.map((t: string, i: number) => (
                                            <div key={i} className="text-sm text-blue-700">
                                                📈 {t}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
