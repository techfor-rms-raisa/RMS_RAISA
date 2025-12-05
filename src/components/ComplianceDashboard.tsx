import React from 'react';
import { RHAction, FeedbackResponse } from '../components/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CompDashProps {
    rhActions: RHAction[];
    feedbackResponses: FeedbackResponse[];
}

const ComplianceDashboard: React.FC<CompDashProps> = ({ rhActions, feedbackResponses }) => {
    const pendingActions = rhActions.filter(a => a.status === 'pendente');
    
    const sentimentData = [
        { name: 'Positivo', value: feedbackResponses.filter(f => f.sentiment === 'Positivo').length },
        { name: 'Neutro', value: feedbackResponses.filter(f => f.sentiment === 'Neutro').length },
        { name: 'Negativo', value: feedbackResponses.filter(f => f.sentiment === 'Negativo').length },
    ];

    return (
        <div className="p-6 space-y-6">
            <h2 className="text-3xl font-bold text-[#4D5253]">Compliance & Retenção</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm uppercase">Ações Pendentes</h3>
                    <p className="text-3xl font-bold text-blue-800">{pendingActions.length}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                    <h3 className="text-gray-500 text-sm uppercase">Feedbacks</h3>
                    <p className="text-3xl font-bold text-green-800">{feedbackResponses.length}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
                    <h3 className="text-gray-500 text-sm uppercase">Risco Alto</h3>
                    <p className="text-3xl font-bold text-red-800">{feedbackResponses.filter(f => f.riskLevel === 'Alto').length}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="font-bold mb-4">Sentimento</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sentimentData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#533738" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow overflow-y-auto max-h-80">
                    <h3 className="font-bold mb-4 text-red-700">Tarefas Críticas</h3>
                    <ul className="space-y-3">
                        {pendingActions.map(a => (
                            <li key={a.id} className="border-b pb-2">
                                <p className="text-sm font-medium">{a.description}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase ${a.priority === 'alta' ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>{a.priority}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ComplianceDashboard;