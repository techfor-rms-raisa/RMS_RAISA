import React from 'react';

interface ScoreBadgeProps {
    score?: number | string | null;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
    if (score === null || score === undefined || score === '' || score === '#FFFF') {
        return null;
    }

    // Converter para número se for string
    let numScore: number;
    if (typeof score === 'string') {
        numScore = parseInt(score, 10);
    } else {
        numScore = score;
    }

    // Validar se é um número válido (1-5)
    if (isNaN(numScore) || numScore < 1 || numScore > 5) {
        return null;
    }

    // Mapear número para cor e label
    const scoreMap: Record<number, { color: string; label: string; emoji: string }> = {
        5: { color: 'bg-red-600', label: 'Crítico', emoji: '🔴' },
        4: { color: 'bg-orange-500', label: 'Alto', emoji: '🟠' },
        3: { color: 'bg-yellow-500', label: 'Médio', emoji: '🟡' },
        2: { color: 'bg-green-500', label: 'Bom', emoji: '🟢' },
        1: { color: 'bg-blue-500', label: 'Excelente', emoji: '🔵' }
    };

    const { color, label, emoji } = scoreMap[numScore];

    return (
        <div 
            className={`${color} w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-default hover:shadow-lg transition-shadow`}
            title={label}
        >
            {numScore}
        </div>
    );
};

export default ScoreBadge;
