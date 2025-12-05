import React, { useState } from 'react';
import { analyzeFeedback } from '../services/geminiService';
import { FeedbackResponse, RHAction } from '../components/types';

interface PortalProps {
    token: string;
    onSubmit: (res: FeedbackResponse, action?: RHAction) => void;
    onClose: () => void;
}

const FeedbackPortal: React.FC<PortalProps> = ({ token, onSubmit, onClose }) => {
    const [score, setScore] = useState<number>(10);
    const [comment, setComment] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAnalyzing(true);
        const analysis = await analyzeFeedback(comment, score);
        
        const response: FeedbackResponse = {
            id: `res-${Date.now()}`,
            requestId: 'req-simulated',
            consultantId: 1, 
            score,
            comment,
            answeredAt: new Date().toISOString(),
            sentiment: analysis.sentiment,
            riskLevel: analysis.riskLevel,
            keyPoints: analysis.keyPoints,
            suggestedAction: analysis.suggestedAction
        };

        let action: RHAction | undefined;
        if (analysis.riskLevel === 'Alto' || analysis.riskLevel === 'Médio') {
            action = {
                id: `act-${Date.now()}`,
                consultantId: 1,
                description: `Feedback ${analysis.riskLevel}: ${analysis.suggestedAction}`,
                status: 'pendente',
                priority: 'alta',
                origin: 'ai_feedback',
                createdAt: new Date().toISOString()
            };
        }

        onSubmit(response, action);
        setAnalyzing(false);
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
                    <h2 className="text-2xl font-bold text-green-700 mb-2">Obrigado!</h2>
                    <p className="text-gray-600">Feedback recebido.</p>
                    <button onClick={onClose} className="mt-6 text-sm text-gray-400 underline">Voltar</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg p-8 rounded-xl shadow-2xl border-t-8 border-[#533738]">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Pesquisa de Satisfação</h1>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block font-bold text-gray-700 mb-2">Nota (0-10)</label>
                        <input type="range" min="0" max="10" value={score} onChange={e => setScore(parseInt(e.target.value))} className="w-full" />
                        <div className="text-center font-bold text-2xl text-[#533738]">{score}</div>
                    </div>
                    <div>
                        <label className="block font-bold text-gray-700 mb-2">Comentários</label>
                        <textarea required className="w-full border p-3 rounded-lg h-32" value={comment} onChange={e => setComment(e.target.value)}></textarea>
                    </div>
                    <button type="submit" disabled={analyzing} className="w-full bg-[#533738] text-white font-bold py-3 rounded-lg hover:bg-opacity-90">
                        {analyzing ? 'Processando...' : 'Enviar'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default FeedbackPortal;