/**
 * COMPONENTE: MODAL DE FEEDBACK DO CLIENTE
 * Registra feedback do cliente sobre candidato (fecha ciclo de aprendizado)
 */

import React, { useState } from 'react';
import { MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { registrarFeedbackCliente } from '../services/recomendacaoAnalistaService';

interface Props {
    candidaturaId: number;
    candidatoNome: string;
    analistaId: number;
    onClose: () => void;
    onFeedbackRegistrado?: () => void;
}

export function FeedbackClienteModal({ 
    candidaturaId, 
    candidatoNome, 
    analistaId, 
    onClose, 
    onFeedbackRegistrado 
}: Props) {
    const [aprovado, setAprovado] = useState<boolean | null>(null);
    const [feedbackTexto, setFeedbackTexto] = useState('');
    const [categoria, setCategoria] = useState<'tecnico' | 'comportamental' | 'cultural' | 'salario' | 'outro'>('tecnico');
    const [processando, setProcessando] = useState(false);

    async function handleSubmit() {
        if (aprovado === null) {
            alert('Selecione se o candidato foi aprovado ou reprovado');
            return;
        }

        if (!feedbackTexto.trim()) {
            alert('Digite o feedback do cliente');
            return;
        }

        try {
            setProcessando(true);

            await registrarFeedbackCliente(
                candidaturaId,
                {
                    feedback_texto: feedbackTexto,
                    categoria: categoria,
                    aprovado: aprovado
                },
                analistaId
            );

            alert(`Feedback registrado! Candidato ${aprovado ? 'APROVADO' : 'REPROVADO'}`);
            onFeedbackRegistrado?.();
            onClose();

        } catch (error) {
            console.error('Erro ao registrar feedback:', error);
            alert('Erro ao registrar feedback.');
        } finally {
            setProcessando(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <MessageSquare className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                            Feedback do Cliente
                        </h3>
                        <p className="text-sm text-gray-600">
                            Candidato: {candidatoNome}
                        </p>
                    </div>
                </div>

                {/* Resultado */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                        Resultado da Entrevista *
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setAprovado(true)}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                                aprovado === true
                                    ? 'border-green-500 bg-green-50 text-green-700'
                                    : 'border-gray-300 hover:border-green-300'
                            }`}
                        >
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-medium">APROVADO</span>
                        </button>

                        <button
                            onClick={() => setAprovado(false)}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                                aprovado === false
                                    ? 'border-red-500 bg-red-50 text-red-700'
                                    : 'border-gray-300 hover:border-red-300'
                            }`}
                        >
                            <XCircle className="w-5 h-5" />
                            <span className="font-medium">REPROVADO</span>
                        </button>
                    </div>
                </div>

                {/* Categoria (só se reprovado) */}
                {aprovado === false && (
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Categoria da Reprovação *
                        </label>
                        <select
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value as any)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="tecnico">Técnico - Falta de conhecimento/experiência</option>
                            <option value="comportamental">Comportamental - Soft skills, atitude, proatividade</option>
                            <option value="cultural">Cultural - Fit cultural, valores, motivações</option>
                            <option value="salario">Salário - Expectativa salarial incompatível</option>
                            <option value="outro">Outro</option>
                        </select>
                    </div>
                )}

                {/* Feedback Detalhado */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Feedback Detalhado do Cliente *
                    </label>
                    <textarea
                        value={feedbackTexto}
                        onChange={(e) => setFeedbackTexto(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder={aprovado === true 
                            ? "Ex: Candidato demonstrou excelente conhecimento técnico e ótima comunicação. Fit cultural perfeito com a equipe. Cliente ficou muito satisfeito."
                            : "Ex: Candidato tem bom conhecimento técnico, mas falta experiência com metodologias ágeis. Comunicação foi confusa durante a entrevista. Não se encaixa na cultura da equipe."
                        }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        💡 Seja específico! Este feedback será usado pela IA para aprender e melhorar futuras recomendações.
                    </p>
                </div>

                {/* Alerta de Aprendizado */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-800">
                        <strong>🤖 Aprendizado da IA:</strong> Este feedback será analisado pela IA para:
                    </p>
                    <ul className="text-sm text-blue-700 mt-2 space-y-1 ml-4">
                        <li>• Identificar padrões de aprovação/reprovação</li>
                        <li>• Melhorar questões recomendadas</li>
                        <li>• Aumentar acurácia das próximas recomendações</li>
                        <li>• Prever riscos em candidatos futuros</li>
                    </ul>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        disabled={processando}
                        className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={processando || aprovado === null || !feedbackTexto.trim()}
                        className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                        {processando ? 'Registrando...' : 'Registrar Feedback'}
                    </button>
                </div>
            </div>
        </div>
    );
}
