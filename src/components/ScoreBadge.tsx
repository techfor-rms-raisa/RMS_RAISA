import React from 'react';
import { RiskScore } from './types';

interface ScoreBadgeProps {
    score: RiskScore | null | undefined;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
    if (!score) return null;

    const colorMap: Record<RiskScore, string> = {
        'Crítico': 'bg-red-600',
        'Alto': 'bg-orange-500',
        'Médio': 'bg-yellow-500',
        'Bom': 'bg-blue-500',
        'Excelente': 'bg-green-500'
    };

    const color = colorMap[score] || 'bg-gray-400';

    return (
        <div className={`${color} w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold`} title={score}>
            {score.charAt(0).toUpperCase()}
        </div>
    );
};

export default ScoreBadge;
