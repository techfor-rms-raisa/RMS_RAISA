/**
 * EntrevistaTecnica.tsx - RMS RAISA v2.0
 * Componente de Entrevista Técnica Inteligente
 * 
 * INTEGRAÇÃO SUPABASE v2.0:
 * - Usa useRaisaInterview hook (Supabase real)
 * - Tabelas: vaga_perguntas_tecnicas, candidatura_respostas, 
 *            candidatura_matriz_qualificacoes, candidatura_avaliacao_ia
 * 
 * Data: 25/12/2024
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Candidatura, Vaga } from '@/types';
import { useRaisaInterview, PerguntaTecnicaDB, AvaliacaoIADB } from '../../hooks/supabase/useRaisaInterview';

interface EntrevistaTecnicaProps {
    candidaturas: Candidatura[];
    vagas: Vaga[];
    currentUserId?: number;
    onClose?: () => void;
    onEntrevistaCompleta?: (candidaturaId: number, resultado: 'aprovado' | 'reprovado') => void;
}

const EntrevistaTecnica: React.FC<EntrevistaTecnicaProps> = ({ 
    candidaturas = [], 
    vagas = [], 
    currentUserId = 1,
    onClose,
    onEntrevistaCompleta
}) => {
    // Hook Supabase
    const {
        perguntasTecnicas,
        avaliacoesIA,
        loading,
        error,
        loadPerguntasVaga,
        generateAndSaveQuestions,
        saveCandidateAnswers,
        saveQualificationMatrix,
        runAIAssessment,
        loadAvaliacaoCandidatura,
        saveFinalDecision
    } = useRaisaInterview();

    // Estados do fluxo
    const [selectedCandidaturaId, setSelectedCandidaturaId] = useState<number | null>(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Estados para respostas
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [impressions, setImpressions] = useState<Record<number, 'excelente' | 'boa' | 'regular' | 'fraca'>>({});
    
    // Estados para matriz
    const [matrixItems, setMatrixItems] = useState<Array<{ tecnologia: string; tempo: number; nivel: string }>>([]);
    const [newTech, setNewTech] = useState({ tecnologia: '', tempo: 0, nivel: 'pleno' });

    // Dados derivados
    const candidatura = useMemo(() => 
        candidaturas.find(c => c.id === String(selectedCandidaturaId)),
        [candidaturas, selectedCandidaturaId]
    );
    
    const vaga = useMemo(() => 
        vagas.find(v => v.id === candidatura?.vaga_id),
        [vagas, candidatura]
    );

    const avaliacao = useMemo(() => 
        avaliacoesIA.find(a => a.candidatura_id === selectedCandidaturaId),
        [avaliacoesIA, selectedCandidaturaId]
    );

    // Candidaturas elegíveis para entrevista
    const candidaturasElegiveis = useMemo(() => 
        candidaturas.filter(c => 
            c.status === 'entrevista' || 
            c.status === 'triagem' || 
            c.status === 'teste_tecnico'
        ),
        [candidaturas]
    );

    // Iniciar entrevista
    const handleStart = async () => {
        if (!vaga || !selectedCandidaturaId) return;
        
        setIsProcessing(true);
        try {
            // Carregar ou gerar perguntas
            let perguntas = await loadPerguntasVaga(parseInt(vaga.id));
            
            if (perguntas.length === 0) {
                console.log('🤖 Gerando perguntas para a vaga...');
                perguntas = await generateAndSaveQuestions(vaga);
            }

            if (perguntas.length > 0) {
                setCurrentStep(2);
            } else {
                alert('Não foi possível carregar ou gerar perguntas. Tente novamente.');
            }
        } catch (err) {
            console.error('Erro ao iniciar:', err);
            alert('Erro ao iniciar entrevista. Verifique o console.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Salvar respostas e ir para matriz
    const handleSaveAnswers = async () => {
        if (!selectedCandidaturaId || !vaga) return;
        
        setIsProcessing(true);
        try {
            const respostasFormatadas = perguntasTecnicas.map(p => ({
                pergunta_id: p.id,
                resposta_texto: answers[p.id] || '',
                impressao_analista: impressions[p.id],
                observacoes_analista: ''
            }));

            const sucesso = await saveCandidateAnswers(
                selectedCandidaturaId,
                parseInt(vaga.id),
                currentUserId,
                respostasFormatadas
            );

            if (sucesso) {
                setCurrentStep(3);
            } else {
                alert('Erro ao salvar respostas. Tente novamente.');
            }
        } catch (err) {
            console.error('Erro ao salvar respostas:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    // Adicionar item na matriz
    const handleAddMatrixItem = () => {
        if (newTech.tecnologia.trim()) {
            setMatrixItems([...matrixItems, { ...newTech }]);
            setNewTech({ tecnologia: '', tempo: 0, nivel: 'pleno' });
        }
    };

    // Remover item da matriz
    const handleRemoveMatrixItem = (index: number) => {
        setMatrixItems(matrixItems.filter((_, i) => i !== index));
    };

    // Executar avaliação IA
    const handleAssess = async () => {
        if (!selectedCandidaturaId || !vaga || !candidatura) return;
        
        setIsProcessing(true);
        try {
            // Salvar matriz
            await saveQualificationMatrix(
                selectedCandidaturaId,
                parseInt(vaga.id),
                currentUserId,
                matrixItems
            );

            // Executar avaliação IA
            const resultado = await runAIAssessment(
                selectedCandidaturaId,
                parseInt(vaga.id),
                currentUserId,
                vaga,
                candidatura.candidato_nome || 'Candidato'
            );

            if (resultado) {
                setCurrentStep(4);
            } else {
                alert('Erro na avaliação IA. Tente novamente.');
            }
        } catch (err) {
            console.error('Erro na avaliação:', err);
            alert('Erro ao processar avaliação. Verifique o console.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Decisão final
    const handleFinalDecision = async (decisao: 'aprovado' | 'reprovado') => {
        if (!selectedCandidaturaId) return;
        
        setIsProcessing(true);
        try {
            const sucesso = await saveFinalDecision(
                selectedCandidaturaId,
                decisao,
                `Decisão baseada na análise técnica e comportamental. Score: ${avaliacao?.score_geral || 'N/A'}`,
                currentUserId
            );

            if (sucesso) {
                alert(`✅ Candidatura ${decisao === 'aprovado' ? 'Aprovada' : 'Reprovada'} com sucesso!`);
                
                if (onEntrevistaCompleta) {
                    onEntrevistaCompleta(selectedCandidaturaId, decisao);
                }
                
                // Reset
                if (onClose) {
                    onClose();
                } else {
                    setSelectedCandidaturaId(null);
                    setCurrentStep(1);
                    setAnswers({});
                    setImpressions({});
                    setMatrixItems([]);
                }
            }
        } catch (err) {
            console.error('Erro ao salvar decisão:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    // Cores do resultado
    const getResultColor = (recomendacao: string) => {
        if (recomendacao === 'aprovado') return 'bg-green-100 text-green-900';
        if (recomendacao === 'condicional') return 'bg-yellow-100 text-yellow-900';
        return 'bg-red-100 text-red-900';
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md min-h-[600px]">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-[#1E3A8A]">
                        Entrevista Técnica Inteligente
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Integrado com Supabase • Powered by Gemini AI
                    </p>
                </div>
                {onClose && (
                    <button 
                        onClick={onClose} 
                        className="text-gray-500 hover:text-gray-700 text-2xl"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Erro global */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-red-800">❌ {error}</p>
                </div>
            )}

            {/* Step 1: Selecionar Candidatura */}
            {currentStep === 1 && (
                <div className="space-y-4 max-w-xl mx-auto mt-10">
                    <div className="bg-blue-50 rounded-lg p-4 mb-6">
                        <h3 className="font-bold text-blue-800 mb-2">📋 Como funciona:</h3>
                        <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
                            <li>Selecione a candidatura para entrevista</li>
                            <li>A IA gera perguntas técnicas personalizadas</li>
                            <li>Registre as respostas e suas impressões</li>
                            <li>Preencha a matriz de qualificações</li>
                            <li>A IA avalia e recomenda aprovação/reprovação</li>
                        </ol>
                    </div>

                    <label className="block font-bold text-gray-700">
                        Selecione a Candidatura para Entrevista:
                    </label>
                    
                    <select 
                        className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-purple-500"
                        value={selectedCandidaturaId || ''}
                        onChange={e => setSelectedCandidaturaId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">-- Selecione uma candidatura --</option>
                        {candidaturasElegiveis.map(c => {
                            const v = vagas.find(vg => vg.id === c.vaga_id);
                            return (
                                <option key={c.id} value={c.id}>
                                    {c.candidato_nome} - {v?.titulo || 'Vaga não encontrada'} ({c.status})
                                </option>
                            );
                        })}
                    </select>

                    {candidaturasElegiveis.length === 0 && (
                        <p className="text-amber-600 text-sm">
                            ⚠️ Nenhuma candidatura elegível encontrada. 
                            As candidaturas devem estar com status "triagem", "entrevista" ou "teste_tecnico".
                        </p>
                    )}

                    <button 
                        disabled={!selectedCandidaturaId || isProcessing}
                        onClick={handleStart}
                        className="w-full bg-[#7C3AED] text-white py-3 rounded-lg font-bold hover:bg-opacity-90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                        {isProcessing ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="animate-spin">⏳</span> Preparando Entrevista...
                            </span>
                        ) : (
                            'Iniciar Entrevista 🚀'
                        )}
                    </button>
                </div>
            )}

            {/* Step 2: Perguntas e Respostas */}
            {currentStep === 2 && vaga && (
                <div className="space-y-6">
                    <div className="bg-blue-50 p-4 rounded-lg mb-4">
                        <h3 className="font-bold text-blue-800">Vaga: {vaga.titulo}</h3>
                        <p className="text-sm text-blue-600">Candidato: {candidatura?.candidato_nome}</p>
                        <p className="text-xs text-blue-500 mt-1">
                            {perguntasTecnicas.length} pergunta(s) técnica(s) gerada(s)
                        </p>
                    </div>

                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                            <p className="mt-2 text-gray-600">Carregando perguntas...</p>
                        </div>
                    ) : (
                        perguntasTecnicas.map((q, idx) => (
                            <div key={q.id} className="border p-4 rounded-lg hover:shadow-md transition-shadow">
                                <div className="flex justify-between mb-2">
                                    <span className="font-bold text-gray-700">
                                        Questão {idx + 1} 
                                        <span className="text-purple-600 ml-2">({q.categoria})</span>
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                                        q.nivel_dificuldade === 'senior' ? 'bg-red-100 text-red-800' :
                                        q.nivel_dificuldade === 'pleno' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-green-100 text-green-800'
                                    }`}>
                                        {q.nivel_dificuldade}
                                    </span>
                                </div>
                                
                                <p className="mb-4 text-lg font-medium">{q.pergunta_texto}</p>
                                
                                {q.resposta_esperada && (
                                    <div className="bg-yellow-50 p-3 rounded mb-3 text-sm text-yellow-800">
                                        <strong>💡 Resposta Esperada:</strong> {q.resposta_esperada}
                                    </div>
                                )}
                                
                                <textarea 
                                    className="w-full border p-2 rounded mb-2 focus:ring-2 focus:ring-purple-500" 
                                    placeholder="Resumo da resposta do candidato..."
                                    rows={3}
                                    value={answers[q.id] || ''}
                                    onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                                />
                                
                                <select 
                                    className="border p-2 rounded text-sm focus:ring-2 focus:ring-purple-500"
                                    value={impressions[q.id] || ''}
                                    onChange={e => setImpressions({
                                        ...impressions, 
                                        [q.id]: e.target.value as any
                                    })}
                                >
                                    <option value="">Avaliação da Resposta...</option>
                                    <option value="excelente">⭐ Excelente</option>
                                    <option value="boa">👍 Boa</option>
                                    <option value="regular">😐 Regular</option>
                                    <option value="fraca">👎 Fraca</option>
                                </select>
                            </div>
                        ))
                    )}

                    <div className="flex justify-between pt-4 border-t">
                        <button 
                            onClick={() => setCurrentStep(1)}
                            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                        >
                            ← Voltar
                        </button>
                        <button 
                            onClick={handleSaveAnswers}
                            disabled={isProcessing}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isProcessing ? 'Salvando...' : 'Próximo: Matriz →'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Matriz de Qualificações */}
            {currentStep === 3 && (
                <div className="space-y-6">
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <h3 className="text-xl font-bold text-purple-800">Matriz de Qualificações</h3>
                        <p className="text-sm text-purple-600">
                            Registre as tecnologias e experiências declaradas pelo candidato
                        </p>
                    </div>

                    <div className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
                        <div className="flex-1">
                            <label className="block text-sm font-bold mb-1">Tecnologia / Competência</label>
                            <input 
                                className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500" 
                                value={newTech.tecnologia} 
                                onChange={e => setNewTech({...newTech, tecnologia: e.target.value})} 
                                placeholder="Ex: React, Python, Gestão de Projetos" 
                            />
                        </div>
                        <div className="w-32">
                            <label className="block text-sm font-bold mb-1">Exp. (Meses)</label>
                            <input 
                                type="number" 
                                className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500" 
                                value={newTech.tempo} 
                                onChange={e => setNewTech({...newTech, tempo: parseInt(e.target.value) || 0})} 
                                min="0"
                            />
                        </div>
                        <div className="w-36">
                            <label className="block text-sm font-bold mb-1">Nível</label>
                            <select 
                                className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500" 
                                value={newTech.nivel} 
                                onChange={e => setNewTech({...newTech, nivel: e.target.value})}
                            >
                                <option value="junior">Junior</option>
                                <option value="pleno">Pleno</option>
                                <option value="senior">Senior</option>
                            </select>
                        </div>
                        <button 
                            onClick={handleAddMatrixItem} 
                            className="bg-green-600 text-white px-4 py-2 rounded h-10 hover:bg-green-700"
                        >
                            + Adicionar
                        </button>
                    </div>

                    {matrixItems.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>Nenhuma qualificação adicionada ainda.</p>
                            <p className="text-sm">Adicione as tecnologias e competências do candidato acima.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {matrixItems.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    className="bg-white border p-3 rounded-lg shadow-sm flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-bold text-gray-800">{item.tecnologia}</p>
                                        <p className="text-xs text-gray-500">
                                            {item.tempo} meses • <span className="capitalize">{item.nivel}</span>
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveMatrixItem(idx)} 
                                        className="text-red-500 hover:text-red-700 text-lg"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between pt-4 border-t mt-8">
                        <button 
                            onClick={() => setCurrentStep(2)}
                            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                        >
                            ← Voltar
                        </button>
                        <button 
                            onClick={handleAssess} 
                            disabled={isProcessing || matrixItems.length === 0}
                            className="bg-[#7C3AED] text-white px-8 py-3 rounded-lg font-bold hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin">⏳</span> Avaliando com IA...
                                </span>
                            ) : (
                                '🤖 Finalizar e Avaliar com IA'
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 4: Resultado da Avaliação */}
            {currentStep === 4 && avaliacao && (
                <div className="space-y-6">
                    {/* Score Principal */}
                    <div className={`p-6 rounded-xl text-center ${getResultColor(avaliacao.recomendacao)}`}>
                        <h3 className="text-4xl font-bold mb-2">{avaliacao.score_geral} / 100</h3>
                        <p className="text-xl font-semibold uppercase tracking-wide">
                            {avaliacao.recomendacao === 'aprovado' ? '✅ Recomendado' :
                             avaliacao.recomendacao === 'condicional' ? '⚠️ Condicional' :
                             '❌ Não Recomendado'}
                        </p>
                        {avaliacao.taxa_atendimento && (
                            <p className="text-sm mt-2 opacity-80">
                                Taxa de Aderência: {avaliacao.taxa_atendimento}%
                            </p>
                        )}
                    </div>

                    {/* Scores Detalhados */}
                    {(avaliacao.score_tecnico || avaliacao.score_experiencia || avaliacao.score_fit_cultural) && (
                        <div className="grid grid-cols-3 gap-4">
                            {avaliacao.score_tecnico && (
                                <div className="bg-blue-50 p-4 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-blue-600">{avaliacao.score_tecnico}</p>
                                    <p className="text-xs text-blue-800">Técnico</p>
                                </div>
                            )}
                            {avaliacao.score_experiencia && (
                                <div className="bg-purple-50 p-4 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-purple-600">{avaliacao.score_experiencia}</p>
                                    <p className="text-xs text-purple-800">Experiência</p>
                                </div>
                            )}
                            {avaliacao.score_fit_cultural && (
                                <div className="bg-orange-50 p-4 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-orange-600">{avaliacao.score_fit_cultural}</p>
                                    <p className="text-xs text-orange-800">Fit Cultural</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pontos Fortes e GAPs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {avaliacao.pontos_fortes && Array.isArray(avaliacao.pontos_fortes) && avaliacao.pontos_fortes.length > 0 && (
                            <div className="bg-white border p-4 rounded-lg">
                                <h4 className="font-bold text-green-700 mb-3 flex items-center gap-2">
                                    ✅ Pontos Fortes
                                </h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    {avaliacao.pontos_fortes.map((p: any, i: number) => (
                                        <li key={i} className="text-sm text-gray-700">
                                            {typeof p === 'string' ? p : p.aspecto || p}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {avaliacao.gaps_identificados && Array.isArray(avaliacao.gaps_identificados) && avaliacao.gaps_identificados.length > 0 && (
                            <div className="bg-white border p-4 rounded-lg">
                                <h4 className="font-bold text-red-700 mb-3 flex items-center gap-2">
                                    ⚠️ GAPs Identificados
                                </h4>
                                <ul className="list-disc pl-5 space-y-1">
                                    {avaliacao.gaps_identificados.map((g: any, i: number) => (
                                        <li key={i} className="text-sm text-gray-700">
                                            {typeof g === 'string' ? g : `${g.gap} (${g.impacto || 'N/A'})`}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Justificativa */}
                    {avaliacao.justificativa && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="font-bold mb-2 text-gray-800">📝 Justificativa da IA</h4>
                            <p className="text-sm text-gray-700">{avaliacao.justificativa}</p>
                        </div>
                    )}

                    {/* Botões de Decisão */}
                    <div className="flex gap-4 pt-6 border-t">
                        <button 
                            onClick={() => handleFinalDecision('reprovado')} 
                            disabled={isProcessing}
                            className="flex-1 border-2 border-red-500 text-red-600 py-3 rounded-lg font-bold hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                            ❌ Reprovar Candidato
                        </button>
                        <button 
                            onClick={() => handleFinalDecision('aprovado')} 
                            disabled={isProcessing}
                            className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                            ✅ Aprovar Candidato
                        </button>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        A decisão final é sua! A IA apenas recomenda baseada nos dados coletados.
                    </p>
                </div>
            )}
        </div>
    );
};

export default EntrevistaTecnica;
