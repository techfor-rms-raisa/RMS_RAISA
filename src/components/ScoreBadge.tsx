import React from 'react';

type RiskScore = 1 | 2 | 3 | 4 | 5;

interface ScoreBadgeProps {
  score: RiskScore | null | undefined;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
  const getScoreDetails = (s: RiskScore | null | undefined) => {
    if (s === null || s === undefined) {
      return { color: 'bg-gray-300', label: 'N/A', textColor: 'text-gray-800' };
    }
    switch (s) {
      case 1: return { color: 'bg-green-500', label: 'Excelente', textColor: 'text-white' };
      case 2: return { color: 'bg-blue-500', label: 'Bom', textColor: 'text-white' };
      case 3: return { color: 'bg-yellow-500', label: 'Médio', textColor: 'text-white' };
      case 4: return { color: 'bg-orange-500', label: 'Alto', textColor: 'text-white' };
      case 5: return { color: 'bg-red-500', label: 'Crítico', textColor: 'text-white' };
      default: return { color: 'bg-gray-300', label: 'N/A', textColor: 'text-gray-800' };
    }
  };

  const { color, label, textColor } = getScoreDetails(score);

  return (
    <div className={`relative group flex items-center justify-center w-5 h-5 rounded-full ${color} ${textColor} font-bold text-xs shadow-sm`}>
      {score ?? '-'}
      <div className="absolute bottom-full mb-2 hidden group-hover:block w-max bg-gray-800 text-white text-xs rounded py-1 px-2 z-10">
        Score: {label}
      </div>
    </div>
  );
};

export default ScoreBadge;
