/**
 * Ícone de Focal R&S (Recrutamento e Seleção)
 * Representa um recrutador com lupa (busca de talentos)
 * Cor: Azul (#3B82F6)
 */

import React from 'react';

interface FocalRSIconProps {
  className?: string;
  size?: number;
}

export const FocalRSIcon: React.FC<FocalRSIconProps> = ({ 
  className = '', 
  size = 24 
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Cabeça da pessoa */}
      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      
      {/* Corpo */}
      <path 
        d="M 4 13 Q 4 11, 6 10 L 10 10 Q 12 11, 12 13 L 12 18" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Lupa - Círculo */}
      <circle 
        cx="17" 
        cy="13" 
        r="4" 
        stroke="currentColor" 
        strokeWidth="1.5"
        fill="none"
      />
      
      {/* Lupa - Cabo */}
      <line 
        x1="20" 
        y1="16" 
        x2="22" 
        y2="18" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
      />
      
      {/* Pessoa dentro da lupa (opcional - representa busca de talentos) */}
      <circle 
        cx="17" 
        cy="12" 
        r="1" 
        fill="currentColor"
      />
      <path 
        d="M 15.5 14.5 Q 15.5 13.5, 16 13.5 L 18 13.5 Q 18.5 13.5, 18.5 14.5" 
        stroke="currentColor" 
        strokeWidth="1" 
        fill="none"
      />
    </svg>
  );
};

export default FocalRSIcon;
