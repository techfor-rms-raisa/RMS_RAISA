/**
 * COMPONENTE: DASHBOARD DE IMPACTO DE PERFORMANCE
 * Visualiza impacto dos ajustes manuais na performance
 */

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Users, Target, Clock, CheckCircle2, XCircle } from 'lucide-react';
import {
    buscarPerformanceAnalistas,
    buscarImpactoAjustes,
    buscarExperimentosAtivos
} from '../services/ajustesPerformanceService';

export function DashboardImpactoPerformance() {
    const [performanceAnalistas, setPerformanceAnalistas] = useState<any[]>([]);
    const [impactoAjustes, setImpactoAjustes] = useState<any[]>([]);
    const [experimentos, setExperimentos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [abaSelecionada, setAbaSelecionada] = useState<'performance' | 'impacto' | 'experimentos'>('performance');

    useEffect(() => {
        carregarDados();
    }, []);

    async function carregarDados() {
        try {
            setLoading(true);
            const [perfData, impactoData, expData] = await Promise.all([
                buscarPerformanceAnalistas(),
                buscarImpactoAjustes(20),
                buscarExperimentosAtivos()
            ]);

            setPerformanceAnalistas(perfData);
            setImpactoAjustes(impactoData);
            setExperimentos(expData);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-100 rounded-lg">
                        <Target className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Dashboard de Impacto de Performance
                        </h2>
                        <p className="text-sm text-gray-600">
                            Análise do impacto dos ajustes manuais na distribuição
                        </p>
                    </div>
                </div>

                {/* Métricas Gerais */}
                <div className="grid grid-cols-4 gap-4 mt-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="w-5 h-5 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">Analistas Ativos</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-600">
                            {performanceAnalistas.filter(a => a.ativo_para_distribuicao).length}
                        </p>
                    </div>

                    <div className="bg-green-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <span className="text-sm font-medium text-green-900">Taxa Média Aprovação</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600">
                            {performanceAnalistas.length > 0
                                ? (performanceAnalistas.reduce((acc, a) => acc + (a.taxa_aprovacao || 0), 0) / performanceAnalistas.length).toFixed(1)
                                : 0}%
                        </p>
                    </div>

                    <div className="bg-orange-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-5 h-5 text-orange-600" />
                            <span className="text-sm font-medium text-orange-900">Tempo Médio</span>
                        </div>
                        <p className="text-2xl font-bold text-orange-600">
                            {performanceAnalistas.length > 0
                                ? (performanceAnalistas.reduce((acc, a) => acc + (a.tempo_medio_fechamento || 0), 0) / performanceAnalistas.length).toFixed(0)
                                : 0} dias
                        </p>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="w-5 h-5 text-purple-600" />
                            <span className="text-sm font-medium text-purple-900">Ajustes Ativos</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-600">
                            {performanceAnalistas.filter(a => 
                                a.multiplicador_performance !== 1.00 || 
                                a.bonus_experiencia > 0 ||
                                a.prioridade_distribuicao !== 'Normal'
                            ).length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Abas */}
            <div className="bg-white rounded-lg shadow-sm">
                <div className="border-b border-gray-200">
                    <div className="flex gap-4 px-6">
                        <button
                            onClick={() => setAbaSelecionada('performance')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                                abaSelecionada === 'performance'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Performance por Analista
                        </button>
                        <button
                            onClick={() => setAbaSelecionada('impacto')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                                abaSelecionada === 'impacto'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Impacto de Ajustes
                        </button>
                        <button
                            onClick={() => setAbaSelecionada('experimentos')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                                abaSelecionada === 'experimentos'
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Experimentos A/B
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {/* Aba: Performance por Analista */}
                    {abaSelecionada === 'performance' && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                Performance por Analista
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                                                Analista
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Prioridade
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Multiplicador
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Bônus
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Vagas Recebidas
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Score Médio
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Taxa Aprovação
                                            </th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                                                Tempo Médio
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {performanceAnalistas.map((analista) => (
                                            <tr key={analista.analista_id} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="py-3 px-4">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">
                                                            {analista.analista_nome}
                                                        </p>
                                                        <p className="text-xs text-gray-600">
                                                            Cap: {analista.capacidade_maxima_vagas} vagas
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                        analista.prioridade_distribuicao === 'Alta'
                                                            ? 'bg-red-100 text-red-800'
                                                            : analista.prioridade_distribuicao === 'Baixa'
                                                            ? 'bg-gray-100 text-gray-800'
                                                            : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {analista.prioridade_distribuicao}
                                                    </span>
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    <span className={`font-bold ${
                                                        analista.multiplicador_performance > 1
                                                            ? 'text-green-600'
                                                            : analista.multiplicador_performance < 1
                                                            ? 'text-red-600'
                                                            : 'text-gray-600'
                                                    }`}>
                                                        {analista.multiplicador_performance?.toFixed(2)}x
                                                    </span>
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    <span className={`font-bold ${
                                                        analista.bonus_experiencia > 0 ? 'text-green-600' : 'text-gray-600'
                                                    }`}>
                                                        +{analista.bonus_experiencia}
                                                    </span>
                                                </td>
                                                <td className="text-center py-3 px-4 text-sm text-gray-900">
                                                    {analista.total_vagas_distribuidas || 0}
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    <span className="font-bold text-blue-600">
                                                        {analista.score_medio?.toFixed(0) || '-'}
                                                    </span>
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    <span className={`font-bold ${
                                                        analista.taxa_aprovacao >= 80
                                                            ? 'text-green-600'
                                                            : analista.taxa_aprovacao >= 60
                                                            ? 'text-orange-600'
                                                            : 'text-red-600'
                                                    }`}>
                                                        {analista.taxa_aprovacao?.toFixed(1) || 0}%
                                                    </span>
                                                </td>
                                                <td className="text-center py-3 px-4 text-sm text-gray-900">
                                                    {analista.tempo_medio_fechamento?.toFixed(0) || '-'} dias
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Aba: Impacto de Ajustes */}
                    {abaSelecionada === 'impacto' && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                Impacto de Ajustes Recentes
                            </h3>
                            <div className="space-y-4">
                                {impactoAjustes.map((ajuste) => (
                                    <div key={ajuste.id} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {ajuste.tipo_entidade === 'analista' ? 'Analista' : 'Vaga'} #{ajuste.entidade_id}
                                                </p>
                                                <p className="text-xs text-gray-600">
                                                    Campo: {ajuste.campo_alterado}
                                                </p>
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {new Date(ajuste.alterado_em).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                            <div>
                                                <p className="text-xs text-gray-600 mb-1">Valor Anterior</p>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {ajuste.valor_anterior || 'N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-600 mb-1">Valor Novo</p>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {ajuste.valor_novo || 'N/A'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 rounded p-3 mb-3">
                                            <p className="text-xs text-gray-600 mb-1">Motivo</p>
                                            <p className="text-sm text-gray-900">
                                                {ajuste.motivo || 'Não informado'}
                                            </p>
                                        </div>

                                        {ajuste.tempo_medio_antes && ajuste.tempo_medio_depois && (
                                            <div className="grid grid-cols-3 gap-4 mb-3">
                                                <div>
                                                    <p className="text-xs text-gray-600 mb-1">Antes</p>
                                                    <p className="text-sm font-bold text-gray-900">
                                                        {ajuste.tempo_medio_antes?.toFixed(1)} dias
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-600 mb-1">Depois</p>
                                                    <p className="text-sm font-bold text-gray-900">
                                                        {ajuste.tempo_medio_depois?.toFixed(1)} dias
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-600 mb-1">Variação</p>
                                                    <div className="flex items-center gap-1">
                                                        {ajuste.tempo_medio_depois < ajuste.tempo_medio_antes ? (
                                                            <>
                                                                <TrendingDown className="w-4 h-4 text-green-600" />
                                                                <span className="text-sm font-bold text-green-600">
                                                                    {((ajuste.tempo_medio_antes - ajuste.tempo_medio_depois) / ajuste.tempo_medio_antes * 100).toFixed(1)}%
                                                                </span>
                                                            </>
                                                        ) : ajuste.tempo_medio_depois > ajuste.tempo_medio_antes ? (
                                                            <>
                                                                <TrendingUp className="w-4 h-4 text-red-600" />
                                                                <span className="text-sm font-bold text-red-600">
                                                                    +{((ajuste.tempo_medio_depois - ajuste.tempo_medio_antes) / ajuste.tempo_medio_antes * 100).toFixed(1)}%
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Minus className="w-4 h-4 text-gray-600" />
                                                                <span className="text-sm font-bold text-gray-600">0%</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {ajuste.impacto_real && (
                                            <div className={`flex items-center gap-2 p-2 rounded ${
                                                ajuste.impacto_real.includes('Positivo')
                                                    ? 'bg-green-50 text-green-800'
                                                    : ajuste.impacto_real.includes('Negativo')
                                                    ? 'bg-red-50 text-red-800'
                                                    : 'bg-gray-50 text-gray-800'
                                            }`}>
                                                {ajuste.impacto_real.includes('Positivo') ? (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                ) : ajuste.impacto_real.includes('Negativo') ? (
                                                    <XCircle className="w-4 h-4" />
                                                ) : (
                                                    <Minus className="w-4 h-4" />
                                                )}
                                                <span className="text-xs font-medium">
                                                    {ajuste.impacto_real}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {impactoAjustes.length === 0 && (
                                    <p className="text-sm text-gray-600 text-center py-8">
                                        Nenhum ajuste registrado ainda
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Aba: Experimentos A/B */}
                    {abaSelecionada === 'experimentos' && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                Experimentos A/B Ativos
                            </h3>
                            <div className="space-y-4">
                                {experimentos.map((exp) => (
                                    <div key={exp.id} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {exp.nome_experimento}
                                                </p>
                                                <p className="text-xs text-gray-600">
                                                    {exp.descricao}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                exp.resultado === 'sucesso'
                                                    ? 'bg-green-100 text-green-800'
                                                    : exp.resultado === 'fracasso'
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {exp.resultado}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-xs text-gray-600 mb-1">Vagas Testadas</p>
                                                <p className="text-sm font-bold text-gray-900">
                                                    {exp.vagas_no_experimento || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-600 mb-1">Tempo Médio</p>
                                                <p className="text-sm font-bold text-gray-900">
                                                    {exp.tempo_medio_atual?.toFixed(1) || '-'} dias
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-600 mb-1">Taxa Aprovação</p>
                                                <p className="text-sm font-bold text-gray-900">
                                                    {exp.taxa_aprovacao_atual?.toFixed(1) || 0}%
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {experimentos.length === 0 && (
                                    <p className="text-sm text-gray-600 text-center py-8">
                                        Nenhum experimento ativo
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
