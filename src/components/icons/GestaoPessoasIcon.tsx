/**
 * Ícone de Gestão de Pessoas
 * Representa uma gestora de RH com checklist
 * Cor: Violeta (#8B5CF6)
 */

import React from 'react';

interface GestaoPessoasIconProps {
  className?: string;
  size?: number;
}

export const GestaoPessoasIcon: React.FC<GestaoPessoasIconProps> = ({ 
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
      {/* Cabeça da mulher */}
      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      
      {/* Cabelo longo */}
      <path 
        d="M 5 6 Q 4 8, 4 10" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        fill="none"
      />
      <path 
        d="M 11 6 Q 12 8, 12 10" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Corpo */}
      <path 
        d="M 4 13 Q 4 11, 6 10 L 10 10 Q 12 11, 12 13 L 12 18" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Documento/Checklist */}
      <rect 
        x="14" 
        y="10" 
        width="7" 
        height="10" 
        rx="1" 
        stroke="currentColor" 
        strokeWidth="1.5"
        fill="none"
      />
      
      {/* Linhas do checklist */}
      <line x1="16" y1="13" x2="19" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      
      {/* Check mark */}
      <path 
        d="M 16 18 L 17 19 L 19 17" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
};

export default GestaoPessoasIcon;
