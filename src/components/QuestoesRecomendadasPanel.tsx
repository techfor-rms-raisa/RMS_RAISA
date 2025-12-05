/**
 * COMPONENTE: PAINEL DE QUESTÕES RECOMENDADAS
 * Exibe questões recomendadas pela IA para uma vaga
 */

import React, { useState, useEffect } from 'react';
import { Brain, CheckCircle, XCircle, Plus, Sparkles, AlertTriangle } from 'lucide-react';
import { 
    gerarQuestoesParaVaga, 
    buscarQuestoesVaga, 
    aprovarQuestoes,
    adicionarQuestaoCustomizada,
    Questao
} from '../services/questoesInteligentesService';

interface Props {
    vagaId: number;
    vaga: any;
    onQuestoesAprovadas?: () => void;
}

export function QuestoesRecomendadasPanel({ vagaId, vaga, onQuestoesAprovadas }: Props) {
    const [questoes, setQuestoes] = useState<Questao[]>([]);
    const [loading, setLoading] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
    const [mostrarFormCustomizada, setMostrarFormCustomizada] = useState(false);
    const [novaQuestao, setNovaQuestao] = useState({
        questao: '',
        categoria: 'tecnica' as 'tecnica' | 'comportamental' | 'cultural',
        subcategoria: ''
    });

    useEffect(() => {
        carregarQuestoes();
    }, [vagaId]);

    async function carregarQuestoes() {
        try {
            setLoading(true);
            const data = await buscarQuestoesVaga(vagaId);
            setQuestoes(data);
        } catch (error) {
            console.error('Erro ao carregar questões:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleGerarQuestoes() {
        try {
            setGerando(true);
            const novasQuestoes = await gerarQuestoesParaVaga(vagaId, vaga);
            setQuestoes(novasQuestoes);
        } catch (error) {
            console.error('Erro ao gerar questões:', error);
            alert('Erro ao gerar questões. Tente novamente.');
        } finally {
            setGerando(false);
        }
    }

    async function handleAprovarSelecionadas() {
        if (selecionadas.size === 0) {
            alert('Selecione ao menos uma questão');
            return;
        }

        try {
            await aprovarQuestoes(Array.from(selecionadas), true);
            await carregarQuestoes();
            setSelecionadas(new Set());
            onQuestoesAprovadas?.();
            alert(`${selecionadas.size} questões aprovadas!`);
        } catch (error) {
            console.error('Erro ao aprovar questões:', error);
            alert('Erro ao aprovar questões.');
        }
    }

    async function handleRejeitarSelecionadas() {
        if (selecionadas.size === 0) {
            alert('Selecione ao menos uma questão');
            return;
        }

        try {
            await aprovarQuestoes(Array.from(selecionadas), false);
            await carregarQuestoes();
            setSelecionadas(new Set());
            alert(`${selecionadas.size} questões rejeitadas.`);
        } catch (error) {
            console.error('Erro ao rejeitar questões:', error);
            alert('Erro ao rejeitar questões.');
        }
    }

    async function handleAdicionarCustomizada() {
        if (!novaQuestao.questao.trim()) {
            alert('Digite a questão');
            return;
        }

        try {
            await adicionarQuestaoCustomizada(vagaId, novaQuestao);
            await carregarQuestoes();
            setNovaQuestao({ questao: '', categoria: 'tecnica', subcategoria: '' });
            setMostrarFormCustomizada(false);
            alert('Questão customizada adicionada!');
        } catch (error) {
            console.error('Erro ao adicionar questão:', error);
            alert('Erro ao adicionar questão.');
        }
    }

    function toggleSelecao(id: number) {
        const novaSelecao = new Set(selecionadas);
        if (novaSelecao.has(id)) {
            novaSelecao.delete(id);
        } else {
            novaSelecao.add(id);
        }
        setSelecionadas(novaSelecao);
    }

    function getCategoriaColor(categoria: string) {
        switch (categoria) {
            case 'tecnica': return 'bg-blue-100 text-blue-800';
            case 'comportamental': return 'bg-green-100 text-green-800';
            case 'cultural': return 'bg-purple-100 text-purple-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function getRelevanciaColor(score: number) {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Brain className="w-6 h-6 text-blue-600" />
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            Questões Recomendadas pela IA
                        </h3>
                        <p className="text-sm text-gray-600">
                            {questoes.length} questões personalizadas para esta vaga
                        </p>
                    </div>
                </div>

                {questoes.length === 0 && (
                    <button
                        onClick={handleGerarQuestoes}
                        disabled={gerando}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Sparkles className="w-4 h-4" />
                        {gerando ? 'Gerando...' : 'Gerar Questões'}
                    </button>
                )}
            </div>

            {/* Lista de Questões */}
            {questoes.length > 0 && (
                <>
                    <div className="space-y-4 mb-6">
                        {questoes.map((questao) => (
                            <div
                                key={questao.id}
                                className={`border rounded-lg p-4 transition-all ${
                                    selecionadas.has(questao.id!)
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                } ${questao.aprovada_por_analista ? 'opacity-60' : ''}`}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Checkbox */}
                                    {!questao.aprovada_por_analista && (
                                        <input
                                            type="checkbox"
                                            checked={selecionadas.has(questao.id!)}
                                            onChange={() => toggleSelecao(questao.id!)}
                                            className="mt-1 w-4 h-4 text-blue-600"
                                        />
                                    )}

                                    <div className="flex-1">
                                        {/* Questão */}
                                        <p className="text-gray-900 font-medium mb-2">
                                            {questao.questao}
                                        </p>

                                        {/* Metadados */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoriaColor(questao.categoria)}`}>
                                                {questao.categoria}
                                            </span>

                                            <span className="text-xs text-gray-600">
                                                {questao.subcategoria}
                                            </span>

                                            <span className={`text-xs font-semibold ${getRelevanciaColor(questao.relevancia_score)}`}>
                                                Relevância: {questao.relevancia_score}%
                                            </span>

                                            {questao.baseado_em_reprovacoes && (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Baseado em reprovações
                                                </span>
                                            )}

                                            {questao.aprovada_por_analista && (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Aprovada
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center justify-between pt-4 border-t">
                        <button
                            onClick={() => setMostrarFormCustomizada(!mostrarFormCustomizada)}
                            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                            <Plus className="w-4 h-4" />
                            Adicionar Questão Customizada
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRejeitarSelecionadas}
                                disabled={selecionadas.size === 0}
                                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                            >
                                <XCircle className="w-4 h-4" />
                                Rejeitar ({selecionadas.size})
                            </button>

                            <button
                                onClick={handleAprovarSelecionadas}
                                disabled={selecionadas.size === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Aprovar ({selecionadas.size})
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Form de Questão Customizada */}
            {mostrarFormCustomizada && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-4">Nova Questão Customizada</h4>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Questão
                            </label>
                            <textarea
                                value={novaQuestao.questao}
                                onChange={(e) => setNovaQuestao({ ...novaQuestao, questao: e.target.value })}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: Descreva uma situação onde você teve que resolver um problema complexo..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Categoria
                                </label>
                                <select
                                    value={novaQuestao.categoria}
                                    onChange={(e) => setNovaQuestao({ ...novaQuestao, categoria: e.target.value as any })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="tecnica">Técnica</option>
                                    <option value="comportamental">Comportamental</option>
                                    <option value="cultural">Cultural</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Subcategoria
                                </label>
                                <input
                                    type="text"
                                    value={novaQuestao.subcategoria}
                                    onChange={(e) => setNovaQuestao({ ...novaQuestao, subcategoria: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ex: React, Comunicação, etc."
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMostrarFormCustomizada(false)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAdicionarCustomizada}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Estado Vazio */}
            {questoes.length === 0 && !gerando && (
                <div className="text-center py-12">
                    <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">
                        Nenhuma questão gerada ainda para esta vaga.
                    </p>
                    <button
                        onClick={handleGerarQuestoes}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Gerar Questões com IA
                    </button>
                </div>
            )}
        </div>
    );
}
