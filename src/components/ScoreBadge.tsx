import React from 'react';

// Definindo os tipos diretamente no arquivo para simplicidade
type RiskScore = 1 | 2 | 3 | 4 | 5;

interface ScoreBadgeProps {
  score: RiskScore | null | undefined;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
  const getScoreDetails = (s: RiskScore | null | undefined) => {
    if (s === null || s === undefined) {
      return { color: 'bg-gray-400', label: 'N/A' };
    }
    switch (s) {
      case 1: return { color: 'bg-green-500', label: 'Excelente' };
      case 2: return { color: 'bg-blue-500', label: 'Bom' };
      case 3: return { color: 'bg-yellow-500', label: 'Médio' };
      case 4: return { color: 'bg-orange-500', label: 'Alto' };
      case 5: return { color: 'bg-red-500', label: 'Crítico' };
      default: return { color: 'bg-gray-400', label: 'N/A' };
    }
  };

  const { color, label } = getScoreDetails(score);

  return (
    <div className={`relative group flex items-center justify-center w-6 h-6 rounded-full ${color} text-white font-bold text-xs shadow-md`}>
      {score}
      <div className="absolute bottom-full mb-2 hidden group-hover:block w-max bg-gray-800 text-white text-xs rounded py-1 px-2 z-10">
        Score: {label}
      </div>
    </div>
  );
};

export default ScoreBadge;
export default ScoreBadge;
