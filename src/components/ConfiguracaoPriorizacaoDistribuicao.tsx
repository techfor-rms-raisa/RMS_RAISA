/**
 * COMPONENTE: CONFIGURAÇÃO DE PRIORIZAÇÃO E DISTRIBUIÇÃO
 * UI para ajustar pesos e parâmetros do sistema
 */

import React, { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, AlertCircle, CheckCircle2, History } from 'lucide-react';
import {
    buscarConfigPriorizacaoAtiva,
    buscarConfigDistribuicaoAtiva,
    atualizarConfigPriorizacao,
    atualizarConfigDistribuicao,
    validarConfigPriorizacao,
    validarConfigDistribuicao,
    buscarHistoricoConfigPriorizacao,
    buscarHistoricoConfigDistribuicao,
    ConfigPriorizacao,
    ConfigDistribuicao
} from '../services/configuracaoService';

export function ConfiguracaoPriorizacaoDistribuicao() {
    const [abaSelecionada, setAbaSelecionada] = useState<'priorizacao' | 'distribuicao'>('priorizacao');
    const [mostrarHistorico, setMostrarHistorico] = useState(false);
    
    // Configuração de Priorização
    const [configPriorizacao, setConfigPriorizacao] = useState<ConfigPriorizacao | null>(null);
    const [historicoPriorizacao, setHistoricoPriorizacao] = useState<any[]>([]);
    
    // Configuração de Distribuição
    const [configDistribuicao, setConfigDistribuicao] = useState<ConfigDistribuicao | null>(null);
    const [historicoDistribuicao, setHistoricoDistribuicao] = useState<any[]>([]);
    
    // Estados UI
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

    useEffect(() => {
        carregarConfiguracoes();
    }, []);

    async function carregarConfiguracoes() {
        try {
            setLoading(true);
            const [priorizacao, distribuicao, histPriorizacao, histDistribuicao] = await Promise.all([
                buscarConfigPriorizacaoAtiva(),
                buscarConfigDistribuicaoAtiva(),
                buscarHistoricoConfigPriorizacao(20),
                buscarHistoricoConfigDistribuicao(20)
            ]);
            
            setConfigPriorizacao(priorizacao);
            setConfigDistribuicao(distribuicao);
            setHistoricoPriorizacao(histPriorizacao);
            setHistoricoDistribuicao(histDistribuicao);
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            setMensagem({ tipo: 'erro', texto: 'Erro ao carregar configurações' });
        } finally {
            setLoading(false);
        }
    }

    async function salvarConfigPriorizacao() {
        if (!configPriorizacao) return;

        try {
            setSalvando(true);
            
            // Validar
            const validacao = validarConfigPriorizacao(configPriorizacao);
            if (!validacao.valido) {
                setMensagem({ tipo: 'erro', texto: validacao.erros.join(', ') });
                return;
            }

            // Salvar
            const usuarioId = 1; // TODO: Pegar do contexto
            await atualizarConfigPriorizacao(configPriorizacao, usuarioId);
            
            setMensagem({ tipo: 'sucesso', texto: 'Configuração salva com sucesso!' });
            await carregarConfiguracoes();
        } catch (error: any) {
            setMensagem({ tipo: 'erro', texto: error.message || 'Erro ao salvar configuração' });
        } finally {
            setSalvando(false);
        }
    }

    async function salvarConfigDistribuicao() {
        if (!configDistribuicao) return;

        try {
            setSalvando(true);
            
            // Validar
            const validacao = validarConfigDistribuicao(configDistribuicao);
            if (!validacao.valido) {
                setMensagem({ tipo: 'erro', texto: validacao.erros.join(', ') });
                return;
            }

            // Salvar
            const usuarioId = 1; // TODO: Pegar do contexto
            await atualizarConfigDistribuicao(configDistribuicao, usuarioId);
            
            setMensagem({ tipo: 'sucesso', texto: 'Configuração salva com sucesso!' });
            await carregarConfiguracoes();
        } catch (error: any) {
            setMensagem({ tipo: 'erro', texto: error.message || 'Erro ao salvar configuração' });
        } finally {
            setSalvando(false);
        }
    }

    function calcularSomaPesosPriorizacao(): number {
        if (!configPriorizacao) return 0;
        return (
            configPriorizacao.peso_urgencia_prazo +
            configPriorizacao.peso_faturamento +
            configPriorizacao.peso_tempo_aberto +
            configPriorizacao.peso_complexidade
        );
    }

    function calcularSomaPesosDistribuicao(): number {
        if (!configDistribuicao) return 0;
        return (
            configDistribuicao.peso_fit_stack +
            configDistribuicao.peso_fit_cliente +
            configDistribuicao.peso_disponibilidade +
            configDistribuicao.peso_taxa_sucesso
        );
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
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Settings className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Configuração de Priorização e Distribuição
                        </h2>
                        <p className="text-sm text-gray-600">
                            Ajuste os pesos e parâmetros do sistema de IA
                        </p>
                    </div>
                </div>

                {/* Mensagem */}
                {mensagem && (
                    <div className={`flex items-center gap-2 p-4 rounded-lg ${
                        mensagem.tipo === 'sucesso' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}>
                        {mensagem.tipo === 'sucesso' ? (
                            <CheckCircle2 className="w-5 h-5" />
                        ) : (
                            <AlertCircle className="w-5 h-5" />
                        )}
                        <span className="text-sm">{mensagem.texto}</span>
                    </div>
                )}
            </div>

            {/* Abas */}
            <div className="bg-white rounded-lg shadow-sm">
                <div className="border-b border-gray-200">
                    <div className="flex gap-4 px-6">
                        <button
                            onClick={() => setAbaSelecionada('priorizacao')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                                abaSelecionada === 'priorizacao'
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Priorização de Vagas
                        </button>
                        <button
                            onClick={() => setAbaSelecionada('distribuicao')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                                abaSelecionada === 'distribuicao'
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Distribuição de Analistas
                        </button>
                        <button
                            onClick={() => setMostrarHistorico(!mostrarHistorico)}
                            className="py-4 px-2 ml-auto flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                        >
                            <History className="w-4 h-4" />
                            Histórico
                        </button>
                    </div>
                </div>

                {/* Conteúdo */}
                <div className="p-6">
                    {abaSelecionada === 'priorizacao' && configPriorizacao && (
                        <div className="space-y-6">
                            {/* Pesos dos Critérios */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Pesos dos Critérios
                                </h3>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-blue-800">
                                        <strong>Soma dos pesos: {calcularSomaPesosPriorizacao()}%</strong> (deve ser 100%)
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Urgência do Prazo */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Urgência do Prazo
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configPriorizacao.peso_urgencia_prazo}
                                            onChange={(e) => setConfigPriorizacao({
                                                ...configPriorizacao,
                                                peso_urgencia_prazo: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configPriorizacao.peso_urgencia_prazo}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configPriorizacao.peso_urgencia_prazo}
                                                onChange={(e) => setConfigPriorizacao({
                                                    ...configPriorizacao,
                                                    peso_urgencia_prazo: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>

                                    {/* Faturamento */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Valor de Faturamento
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configPriorizacao.peso_faturamento}
                                            onChange={(e) => setConfigPriorizacao({
                                                ...configPriorizacao,
                                                peso_faturamento: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configPriorizacao.peso_faturamento}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configPriorizacao.peso_faturamento}
                                                onChange={(e) => setConfigPriorizacao({
                                                    ...configPriorizacao,
                                                    peso_faturamento: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>

                                    {/* Tempo em Aberto */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Tempo em Aberto
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configPriorizacao.peso_tempo_aberto}
                                            onChange={(e) => setConfigPriorizacao({
                                                ...configPriorizacao,
                                                peso_tempo_aberto: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configPriorizacao.peso_tempo_aberto}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configPriorizacao.peso_tempo_aberto}
                                                onChange={(e) => setConfigPriorizacao({
                                                    ...configPriorizacao,
                                                    peso_tempo_aberto: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>

                                    {/* Complexidade da Stack */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Complexidade da Stack
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configPriorizacao.peso_complexidade}
                                            onChange={(e) => setConfigPriorizacao({
                                                ...configPriorizacao,
                                                peso_complexidade: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configPriorizacao.peso_complexidade}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configPriorizacao.peso_complexidade}
                                                onChange={(e) => setConfigPriorizacao({
                                                    ...configPriorizacao,
                                                    peso_complexidade: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bônus e Multiplicadores */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Bônus e Multiplicadores
                                </h3>
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Bônus Cliente VIP */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Bônus Cliente VIP (pontos fixos)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="50"
                                            value={configPriorizacao.bonus_cliente_vip}
                                            onChange={(e) => setConfigPriorizacao({
                                                ...configPriorizacao,
                                                bonus_cliente_vip: parseInt(e.target.value) || 0
                                            })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                        />
                                    </div>

                                    {/* Multiplicadores de Urgência */}
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Multiplicadores de Urgência
                                        </label>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Baixa</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="2"
                                                    value={configPriorizacao.multiplicador_urgencia_baixa}
                                                    onChange={(e) => setConfigPriorizacao({
                                                        ...configPriorizacao,
                                                        multiplicador_urgencia_baixa: parseFloat(e.target.value) || 0
                                                    })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Normal</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="2"
                                                    value={configPriorizacao.multiplicador_urgencia_normal}
                                                    onChange={(e) => setConfigPriorizacao({
                                                        ...configPriorizacao,
                                                        multiplicador_urgencia_normal: parseFloat(e.target.value) || 0
                                                    })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Altíssima</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="2"
                                                    value={configPriorizacao.multiplicador_urgencia_altissima}
                                                    onChange={(e) => setConfigPriorizacao({
                                                        ...configPriorizacao,
                                                        multiplicador_urgencia_altissima: parseFloat(e.target.value) || 0
                                                    })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex justify-end gap-4">
                                <button
                                    onClick={() => carregarConfiguracoes()}
                                    className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Resetar
                                </button>
                                <button
                                    onClick={salvarConfigPriorizacao}
                                    disabled={salvando || calcularSomaPesosPriorizacao() !== 100}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-4 h-4" />
                                    {salvando ? 'Salvando...' : 'Salvar Configuração'}
                                </button>
                            </div>
                        </div>
                    )}

                    {abaSelecionada === 'distribuicao' && configDistribuicao && (
                        <div className="space-y-6">
                            {/* Similar ao de priorização, mas com os campos de distribuição */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Pesos dos Critérios
                                </h3>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-blue-800">
                                        <strong>Soma dos pesos: {calcularSomaPesosDistribuicao()}%</strong> (deve ser 100%)
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Fit de Stack */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Fit de Stack Tecnológica
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configDistribuicao.peso_fit_stack}
                                            onChange={(e) => setConfigDistribuicao({
                                                ...configDistribuicao,
                                                peso_fit_stack: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configDistribuicao.peso_fit_stack}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configDistribuicao.peso_fit_stack}
                                                onChange={(e) => setConfigDistribuicao({
                                                    ...configDistribuicao,
                                                    peso_fit_stack: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>

                                    {/* Fit com Cliente */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Fit com Cliente
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configDistribuicao.peso_fit_cliente}
                                            onChange={(e) => setConfigDistribuicao({
                                                ...configDistribuicao,
                                                peso_fit_cliente: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configDistribuicao.peso_fit_cliente}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configDistribuicao.peso_fit_cliente}
                                                onChange={(e) => setConfigDistribuicao({
                                                    ...configDistribuicao,
                                                    peso_fit_cliente: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>

                                    {/* Disponibilidade */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Disponibilidade
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configDistribuicao.peso_disponibilidade}
                                            onChange={(e) => setConfigDistribuicao({
                                                ...configDistribuicao,
                                                peso_disponibilidade: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configDistribuicao.peso_disponibilidade}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configDistribuicao.peso_disponibilidade}
                                                onChange={(e) => setConfigDistribuicao({
                                                    ...configDistribuicao,
                                                    peso_disponibilidade: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>

                                    {/* Taxa de Sucesso */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Taxa de Sucesso Histórica
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={configDistribuicao.peso_taxa_sucesso}
                                            onChange={(e) => setConfigDistribuicao({
                                                ...configDistribuicao,
                                                peso_taxa_sucesso: parseInt(e.target.value)
                                            })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-2xl font-bold text-blue-600">
                                                {configDistribuicao.peso_taxa_sucesso}%
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={configDistribuicao.peso_taxa_sucesso}
                                                onChange={(e) => setConfigDistribuicao({
                                                    ...configDistribuicao,
                                                    peso_taxa_sucesso: parseInt(e.target.value) || 0
                                                })}
                                                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-right"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Capacidade Máxima */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Parâmetros de Capacidade
                                </h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Capacidade Máxima Padrão (vagas simultâneas)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={configDistribuicao.capacidade_maxima_default}
                                            onChange={(e) => setConfigDistribuicao({
                                                ...configDistribuicao,
                                                capacidade_maxima_default: parseInt(e.target.value) || 1
                                            })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex justify-end gap-4">
                                <button
                                    onClick={() => carregarConfiguracoes()}
                                    className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Resetar
                                </button>
                                <button
                                    onClick={salvarConfigDistribuicao}
                                    disabled={salvando || calcularSomaPesosDistribuicao() !== 100}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-4 h-4" />
                                    {salvando ? 'Salvando...' : 'Salvar Configuração'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Histórico */}
            {mostrarHistorico && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Histórico de Mudanças
                    </h3>
                    <div className="space-y-2">
                        {(abaSelecionada === 'priorizacao' ? historicoPriorizacao : historicoDistribuicao).map((item) => (
                            <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">
                                        {item.campo_alterado}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {item.valor_anterior} → {item.valor_novo}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-600">
                                        {item.app_users?.nome_usuario || 'Sistema'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(item.alterado_em).toLocaleString('pt-BR')}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
