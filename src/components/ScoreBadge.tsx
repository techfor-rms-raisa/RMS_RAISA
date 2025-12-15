import React from 'react';
import { RiskScore } from './types';

interface ScoreBadgeProps {
    score: RiskScore | null | undefined;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
    if (!score) return null;

    const getScoreColor = (score: RiskScore): string => {
        switch (score) {
            case 'Crítico':
                return 'bg-red-500';
            case 'Alto':
                return 'bg-orange-500';
            case 'Médio':
                return 'bg-yellow-500';
            case 'Bom':
                return 'bg-blue-500';
            case 'Excelente':
                return 'bg-green-500';
            default:
                return 'bg-gray-400';
        }
    };

    const getScoreLabel = (score: RiskScore): string => {
        const labels: Record<RiskScore, string> = {
            'Crítico': 'Crítico',
            'Alto': 'Alto',
            'Médio': 'Médio',
            'Bom': 'Bom',
            'Excelente': 'Excelente'
        };
        return labels[score] || score;
    };

    return (
        <div 
            className={`${getScoreColor(score)} w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs cursor-default hover:shadow-lg transition-shadow`}
            title={`Score: ${getScoreLabel(score)}`}
        >
            {score === 'Crítico' ? '🔴' : 
             score === 'Alto' ? '🟠' : 
             score === 'Médio' ? '🟡' : 
             score === 'Bom' ? '🔵' : 
             score === 'Excelente' ? '🟢' : '⚪'}
        </div>
    );
};

export default ScoreBadge;
