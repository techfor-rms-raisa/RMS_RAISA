import React from 'react';
import { RiskScore } from './types';

interface ScoreBadgeProps {
    score?: RiskScore | null;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
    if (!score || typeof score !== 'string') {
        return null;
    }

    const colorMap: Record<string, string> = {
        'Crítico': 'bg-red-600',
        'Alto': 'bg-orange-500',
        'Médio': 'bg-yellow-500',
        'Bom': 'bg-blue-500',
        'Excelente': 'bg-green-500'
    };

    const color = colorMap[score] || 'bg-gray-400';
    const initial = String(score).charAt(0).toUpperCase();

    return (
        <div 
            className={`${color} w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold`} 
            title={score}
        >
            {initial}
        </div>
    );
};

export default ScoreBadge;
