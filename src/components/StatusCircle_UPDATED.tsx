import React, { useState } from 'react';
import { RiskScore } from '../components/types';
import { RISK_COLORS, RISK_MEANING } from '../constants';

interface StatusCircleProps {
  score: RiskScore | null;
  onClick?: () => void;
  isFinal?: boolean;
}

const StatusCircle: React.FC<StatusCircleProps> = ({ score, onClick, isFinal = false }) => {
  const [isClicked, setIsClicked] = useState(false);
  
  // Se não tem score: branco para mensal, azul para final
  const colorClass = score ? RISK_COLORS[score] : (isFinal ? 'bg-blue-500' : 'bg-white border border-gray-300');
  const meaning = score ? RISK_MEANING[score] : (isFinal ? 'Sem avaliação (padrão azul)' : 'Sem avaliação');
  const isClickable = !!score && !!onClick;

  const handleClick = () => {
    if (isClickable && onClick) {
      setIsClicked(true);
      onClick();
      
      // Resetar o estado após 300ms para permitir novo clique
      setTimeout(() => {
        setIsClicked(false);
      }, 300);
    }
  };

  return (
    <div className="relative group flex justify-center">
      <div 
        onClick={handleClick}
        className={`
          w-5 h-5 rounded-full ${colorClass} shadow-md 
          ${isClickable ? 'cursor-pointer hover:scale-125 active:scale-110 transition-all duration-200' : ''} 
          ${isClicked ? 'opacity-60 scale-110' : 'opacity-100'}
        `}
        title={isClickable ? "Clique para ver o histórico completo" : ""}
        style={{
          transition: 'all 0.2s ease-in-out'
        }}
      ></div>
      <div className="absolute bottom-full mb-2 hidden group-hover:block w-max bg-gray-800 text-white text-xs rounded py-1 px-2 z-10">
        {meaning}
      </div>
    </div>
  );
};

export default StatusCircle;
