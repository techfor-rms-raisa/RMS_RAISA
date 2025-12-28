/**
 * COMPONENTE: AJUSTES DE DISTRIBUIÇÃO POR ANALISTA
 * UI para ajustar parâmetros manualmente e medir impacto
 */

import React, { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import {
    buscarAjustesAnalista,
    atualizarAjustesAnalista,
    resetarAjustesAnalista,
    buscarMetricasAnalista,
    buscarHistoricoAjustes,
    AjusteAnalista
} from '../services/ajustesPerformanceService';
import { useAuth } from '../contexts/AuthContext';

interface Props {
    analistaId: number;
    analistaNome: string;
}

export function AjustesDistribuicaoAnalista({ analistaId, analistaNome }: Props) {
    const { user } = useAuth();
    
    const [ajustes, setAjustes] = useState<AjusteAnalista | null>(null);
    const [metricas, setMetricas] = useState<any[]>([]);
    const [historico, setHistorico] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

    useEffect(() => {
        carregarDados();
    }, [analistaId]);

    async function carregarDados() {
        try {
            setLoading(true);
            const [ajustesData, metricasData, historicoData] = await Promise.all([
                buscarAjustesAnalista(analistaId),
                buscarMetricasAnalista(analistaId, 10),
                buscarHistoricoAjustes('analista', analistaId, 10)
            ]);

            setAjustes(ajustesData);
            setMetricas(metricasData);
            setHistorico(historicoData);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    }

    async function salvar() {
        if (!ajustes || !motivo.trim()) {
            setMensagem({ tipo: 'erro', texto: 'Preencha o motivo do ajuste' });
            return;
        }

        try {
            setSalvando(true);
            const usuarioId = user?.id || 1;
            const sucesso = await atualizarAjustesAnalista(ajustes, usuarioId, motivo);

            if (sucesso) {
                setMensagem({ tipo: 'sucesso', texto: 'Ajustes salvos com sucesso!' });
                setMotivo('');
                await carregarDados();
            } else {
                setMensagem({ tipo: 'erro', texto: 'Erro ao salvar ajustes' });
            }
        } catch (error) {
            setMensagem({ tipo: 'erro', texto: 'Erro ao salvar ajustes' });
        } finally {
            setSalvando(false);
        }
    }

    async function resetar() {
        if (!confirm('Resetar todos os ajustes para o padrão?')) return;

        try {
            setSalvando(true);
            const usuarioId = user?.id || 1;
            const sucesso = await resetarAjustesAnalista(analistaId, usuarioId);

            if (sucesso) {
                setMensagem({ tipo: 'sucesso', texto: 'Ajustes resetados!' });
                await carregarDados();
            } else {
                setMensagem({ tipo: 'erro', texto: 'Erro ao resetar ajustes' });
            }
        } catch (error) {
            setMensagem({ tipo: 'erro', texto: 'Erro ao resetar ajustes' });
        } finally {
            setSalvando(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!ajustes) {
        return <div className="p-4 text-red-600">Erro ao carregar ajustes</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Settings className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Ajustes de Distribuição
                            </h2>
                            <p className="text-sm text-gray-600">
                                {analistaNome}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            ajustes.ativo_para_distribuicao
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                        }`}>
                            {ajustes.ativo_para_distribuicao ? 'Ativo' : 'Inativo'}
                        </span>
                    </div>
                </div>

                {mensagem && (
                    <div className={`p-4 rounded-lg ${
                        mensagem.tipo === 'sucesso' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}>
                        {mensagem.texto}
                    </div>
                )}
            </div>

            {/* Ajustes */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Parâmetros Ajustáveis
                </h3>

                <div className="space-y-6">
                    {/* Ativo para Distribuição */}
                    <div>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={ajustes.ativo_para_distribuicao}
                                onChange={(e) => setAjustes({
                                    ...ajustes,
                                    ativo_para_distribuicao: e.target.checked
                                })}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm font-medium text-gray-700">
                                Ativo para receber novas vagas
                            </span>
                        </label>
                    </div>

                    {/* Prioridade */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Prioridade na Distribuição
                        </label>
                        <select
                            value={ajustes.prioridade_distribuicao}
                            onChange={(e) => setAjustes({
                                ...ajustes,
                                prioridade_distribuicao: e.target.value as any
                            })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="Alta">Alta</option>
                            <option value="Normal">Normal</option>
                            <option value="Baixa">Baixa</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            Alta: Recebe vagas primeiro | Normal: Padrão | Baixa: Recebe apenas se necessário
                        </p>
                    </div>

                    {/* Capacidade Máxima */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Capacidade Máxima de Vagas Simultâneas
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={ajustes.capacidade_maxima_vagas}
                            onChange={(e) => setAjustes({
                                ...ajustes,
                                capacidade_maxima_vagas: parseInt(e.target.value) || 7
                            })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>

                    {/* Multiplicador de Performance */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Multiplicador de Performance
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.05"
                                value={ajustes.multiplicador_performance}
                                onChange={(e) => setAjustes({
                                    ...ajustes,
                                    multiplicador_performance: parseFloat(e.target.value)
                                })}
                                className="flex-1"
                            />
                            <span className="text-2xl font-bold text-blue-600 w-24 text-right">
                                {ajustes.multiplicador_performance?.toFixed(2)}x
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Multiplica o score final. Ex: 1.20 = +20% no score
                        </p>
                    </div>

                    {/* Bônus de Experiência */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Bônus de Experiência (pontos fixos)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="20"
                            value={ajustes.bonus_experiencia}
                            onChange={(e) => setAjustes({
                                ...ajustes,
                                bonus_experiencia: parseInt(e.target.value) || 0
                            })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Adiciona pontos fixos ao score final (0-20)
                        </p>
                    </div>

                    {/* Override de Fit de Stack */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Override: Fit de Stack (0-100)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Deixe vazio para calcular automaticamente"
                            value={ajustes.fit_stack_override || ''}
                            onChange={(e) => setAjustes({
                                ...ajustes,
                                fit_stack_override: e.target.value ? parseInt(e.target.value) : null
                            })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Se definido, substitui o cálculo automático de fit de stack
                        </p>
                    </div>

                    {/* Override de Fit com Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Override: Fit com Cliente (0-100)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Deixe vazio para calcular automaticamente"
                            value={ajustes.fit_cliente_override || ''}
                            onChange={(e) => setAjustes({
                                ...ajustes,
                                fit_cliente_override: e.target.value ? parseInt(e.target.value) : null
                            })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Se definido, substitui o cálculo automático de fit com cliente
                        </p>
                    </div>

                    {/* Observações */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Observações
                        </label>
                        <textarea
                            value={ajustes.observacoes_distribuicao || ''}
                            onChange={(e) => setAjustes({
                                ...ajustes,
                                observacoes_distribuicao: e.target.value
                            })}
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            placeholder="Observações sobre a distribuição deste analista..."
                        />
                    </div>

                    {/* Motivo do Ajuste */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Motivo do Ajuste *
                        </label>
                        <textarea
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={2}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            placeholder="Ex: Analista com expertise excepcional em React, merece bônus..."
                            required
                        />
                    </div>
                </div>

                {/* Botões */}
                <div className="flex justify-end gap-4 mt-6">
                    <button
                        onClick={resetar}
                        disabled={salvando}
                        className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Resetar
                    </button>
                    <button
                        onClick={salvar}
                        disabled={salvando || !motivo.trim()}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {salvando ? 'Salvando...' : 'Salvar Ajustes'}
                    </button>
                </div>
            </div>

            {/* Métricas Recentes */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Métricas Recentes (últimas 10 distribuições)
                </h3>
                {metricas.length > 0 ? (
                    <div className="space-y-2">
                        {metricas.map((m) => (
                            <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">
                                        Vaga #{m.vaga_id}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {new Date(m.calculado_em).toLocaleString('pt-BR')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-xs text-gray-600">Score</p>
                                        <p className="text-sm font-bold text-blue-600">
                                            {m.score_match_calculado} → {m.score_match_ajustado}
                                        </p>
                                    </div>
                                    <div>
                                        {m.foi_distribuido ? (
                                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                                Distribuído
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                                                Não Distribuído
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-600">Nenhuma métrica registrada ainda</p>
                )}
            </div>

            {/* Histórico de Ajustes */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Histórico de Ajustes
                </h3>
                {historico.length > 0 ? (
                    <div className="space-y-2">
                        {historico.map((h) => (
                            <div key={h.id} className="py-2 border-b border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {h.campo_alterado}
                                        </p>
                                        <p className="text-xs text-gray-600">
                                            {h.motivo}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-600">
                                            {h.app_users?.nome_usuario}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {new Date(h.alterado_em).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                </div>
                                {h.impacto_real && (
                                    <div className="mt-2 flex items-center gap-2">
                                        {h.impacto_real.includes('Positivo') ? (
                                            <TrendingUp className="w-4 h-4 text-green-600" />
                                        ) : h.impacto_real.includes('Negativo') ? (
                                            <TrendingDown className="w-4 h-4 text-red-600" />
                                        ) : (
                                            <Minus className="w-4 h-4 text-gray-600" />
                                        )}
                                        <span className="text-xs text-gray-600">
                                            {h.impacto_real}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-600">Nenhum ajuste registrado ainda</p>
                )}
            </div>
        </div>
    );
}
