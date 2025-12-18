
import React, { useState, useEffect } from 'react';
import { Candidatura, Vaga, PerguntaTecnica, RespostaCandidato, AvaliacaoIA } from '../types';
import { useMockData } from '../../hooks/useMockData';

interface EntrevistaProps {
    onClose?: () => void;
}

const EntrevistaTecnica: React.FC<EntrevistaProps> = ({ onClose }) => {
    const { candidaturas, vagas, perguntasTecnicas, avaliacoesIA, getQuestionsForVaga, generateAndSaveQuestions, saveCandidateAnswers, saveQualificationMatrix, runAIAssessment, saveFinalDecision } = useMockData();
    
    const [selectedCandidaturaId, setSelectedCandidaturaId] = useState('');
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    
    // State for Answers
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [impressions, setImpressions] = useState<Record<string, string>>({});
    
    // State for Matrix
    const [matrixItems, setMatrixItems] = useState<Array<{ tecnologia: string; tempo: number; nivel: string }>>([]);
    const [newTech, setNewTech] = useState({ tecnologia: '', tempo: 0, nivel: 'junior' });

    // Derived
    const candidatura = candidaturas.find(c => c.id === selectedCandidaturaId);
    const vaga = vagas.find(v => v.id === candidatura?.vaga_id);
    const questions = vaga ? getQuestionsForVaga(vaga.id) : [];
    const avaliacao = avaliacoesIA.find(a => a.candidatura_id === selectedCandidaturaId);

    const handleStart = async () => {
        if (!vaga) return;
        if (questions.length === 0) {
            setIsLoading(true);
            await generateAndSaveQuestions(vaga);
            setIsLoading(false);
        }
        setCurrentStep(2);
    };

    const handleSaveAnswers = () => {
        if (!candidatura) return;
        const formattedAnswers: RespostaCandidato[] = questions.map(q => ({
            id: `ans-${Date.now()}-${q.id}`,
            pergunta_id: q.id,
            resposta_texto: answers[q.id] || '',
            impressao_analista: impressions[q.id] as any
        }));
        saveCandidateAnswers(formattedAnswers);
        setCurrentStep(3);
    };

    const handleAddMatrixItem = () => {
        if (newTech.tecnologia) {
            setMatrixItems([...matrixItems, { ...newTech }]);
            setNewTech({ tecnologia: '', tempo: 0, nivel: 'junior' });
        }
    };

    const handleAssess = async () => {
        if (!candidatura) return;
        setIsLoading(true);
        saveQualificationMatrix(candidatura.id, matrixItems);
        await runAIAssessment(candidatura.id);
        setIsLoading(false);
        setCurrentStep(4);
    };

    const handleFinalDecision = (decision: 'aprovado' | 'reprovado') => {
        if (!candidatura) return;
        saveFinalDecision(candidatura.id, decision, "Decisão baseada na análise técnica e comportamental.");
        alert(`Candidatura ${decision === 'aprovado' ? 'Aprovada' : 'Reprovada'} com sucesso!`);
        if(onClose) onClose();
        else setCurrentStep(1); // Reset
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md min-h-[600px]">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-2xl font-bold text-[#1E3A8A]">Entrevista Técnica Inteligente</h2>
                {onClose && <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>}
            </div>

            {/* Step 1: Select Candidate */}
            {currentStep === 1 && (
                <div className="space-y-4 max-w-xl mx-auto mt-10">
                    <label className="block font-bold text-gray-700">Selecione a Candidatura para Entrevista:</label>
                    <select 
                        className="w-full border p-3 rounded-lg"
                        value={selectedCandidaturaId}
                        onChange={e => setSelectedCandidaturaId(e.target.value)}
                    >
                        <option value="">-- Selecione --</option>
                        {candidaturas.filter(c => c.status === 'entrevista' || c.status === 'triagem').map(c => {
                            const v = vagas.find(vg => vg.id === c.vaga_id);
                            return <option key={c.id} value={c.id}>{c.candidato_nome} - {v?.titulo}</option>;
                        })}
                    </select>
                    <button 
                        disabled={!selectedCandidaturaId || isLoading}
                        onClick={handleStart}
                        className="w-full bg-[#7C3AED] text-white py-3 rounded-lg font-bold hover:bg-opacity-90 disabled:bg-gray-300"
                    >
                        {isLoading ? 'Gerando Perguntas...' : 'Iniciar Entrevista 🚀'}
                    </button>
                </div>
            )}

            {/* Step 2: Questions */}
            {currentStep === 2 && vaga && (
                <div className="space-y-6">
                    <div className="bg-blue-50 p-4 rounded-lg mb-4">
                        <h3 className="font-bold text-blue-800">Vaga: {vaga.titulo}</h3>
                        <p className="text-sm text-blue-600">Candidato: {candidatura?.candidato_nome}</p>
                    </div>
                    {questions.map((q, idx) => (
                        <div key={q.id} className="border p-4 rounded-lg">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-gray-700">Questão {idx + 1} ({q.categoria})</span>
                                <span className="text-xs bg-gray-200 px-2 py-1 rounded uppercase">{q.nivel_dificuldade}</span>
                            </div>
                            <p className="mb-4 text-lg">{q.pergunta_texto}</p>
                            <div className="bg-yellow-50 p-3 rounded mb-3 text-sm text-yellow-800">
                                <strong>Esperado:</strong> {q.resposta_esperada}
                            </div>
                            <textarea 
                                className="w-full border p-2 rounded mb-2" 
                                placeholder="Resumo da resposta do candidato..."
                                value={answers[q.id] || ''}
                                onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                            />
                            <select 
                                className="border p-2 rounded text-sm"
                                value={impressions[q.id] || ''}
                                onChange={e => setImpressions({...impressions, [q.id]: e.target.value})}
                            >
                                <option value="">Avaliação da Resposta...</option>
                                <option value="excelente">Excelente</option>
                                <option value="boa">Boa</option>
                                <option value="regular">Regular</option>
                                <option value="fraca">Fraca</option>
                            </select>
                        </div>
                    ))}
                    <div className="flex justify-end">
                        <button onClick={handleSaveAnswers} className="bg-blue-600 text-white px-6 py-2 rounded">Próximo: Matriz</button>
                    </div>
                </div>
            )}

            {/* Step 3: Matrix */}
            {currentStep === 3 && (
                <div className="space-y-6">
                    <h3 className="text-xl font-bold">Matriz de Qualificações</h3>
                    <div className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
                        <div className="flex-1">
                            <label className="block text-sm font-bold">Tecnologia</label>
                            <input className="w-full border p-2 rounded" value={newTech.tecnologia} onChange={e => setNewTech({...newTech, tecnologia: e.target.value})} placeholder="Ex: React" />
                        </div>
                        <div className="w-32">
                            <label className="block text-sm font-bold">Exp (Meses)</label>
                            <input type="number" className="w-full border p-2 rounded" value={newTech.tempo} onChange={e => setNewTech({...newTech, tempo: parseInt(e.target.value)})} />
                        </div>
                        <div className="w-40">
                            <label className="block text-sm font-bold">Nível</label>
                            <select className="w-full border p-2 rounded" value={newTech.nivel} onChange={e => setNewTech({...newTech, nivel: e.target.value})}>
                                <option value="junior">Junior</option>
                                <option value="pleno">Pleno</option>
                                <option value="senior">Senior</option>
                            </select>
                        </div>
                        <button onClick={handleAddMatrixItem} className="bg-green-600 text-white px-4 py-2 rounded h-10">Adicionar</button>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {matrixItems.map((item, idx) => (
                            <div key={idx} className="bg-white border p-3 rounded shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{item.tecnologia}</p>
                                    <p className="text-xs text-gray-500">{item.tempo} meses • {item.nivel}</p>
                                </div>
                                <button onClick={() => setMatrixItems(matrixItems.filter((_, i) => i !== idx))} className="text-red-500">✕</button>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end mt-8">
                        <button onClick={handleAssess} disabled={isLoading} className="bg-[#7C3AED] text-white px-8 py-3 rounded font-bold">
                            {isLoading ? 'Avaliando com IA...' : 'Finalizar e Avaliar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 4: Result */}
            {currentStep === 4 && avaliacao && (
                <div className="space-y-6">
                    <div className={`p-6 rounded-xl text-center ${avaliacao.recomendacao === 'aprovado' ? 'bg-green-100 text-green-900' : avaliacao.recomendacao === 'condicional' ? 'bg-yellow-100 text-yellow-900' : 'bg-red-100 text-red-900'}`}>
                        <h3 className="text-3xl font-bold mb-2">{avaliacao.score_geral} / 100</h3>
                        <p className="text-xl font-semibold uppercase tracking-wide">{avaliacao.recomendacao}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border p-4 rounded-lg">
                            <h4 className="font-bold text-green-700 mb-2">Pontos Fortes</h4>
                            <ul className="list-disc pl-5 space-y-1">
                                {avaliacao.pontos_fortes.map((p, i) => <li key={i} className="text-sm">{p.aspecto}</li>)}
                            </ul>
                        </div>
                        <div className="bg-white border p-4 rounded-lg">
                            <h4 className="font-bold text-red-700 mb-2">GAPs Identificados</h4>
                            <ul className="list-disc pl-5 space-y-1">
                                {avaliacao.gaps_identificados.map((g, i) => <li key={i} className="text-sm">{g.gap} ({g.impacto})</li>)}
                            </ul>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-bold mb-2">Justificativa da IA</h4>
                        <p className="text-sm text-gray-700">{avaliacao.justificativa}</p>
                    </div>

                    <div className="flex gap-4 pt-6 border-t">
                        <button onClick={() => handleFinalDecision('reprovado')} className="flex-1 border border-red-500 text-red-600 py-3 rounded font-bold hover:bg-red-50">
                            Reprovar Candidato
                        </button>
                        <button onClick={() => handleFinalDecision('aprovado')} className="flex-1 bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700">
                            Aprovar Candidato
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EntrevistaTecnica;
