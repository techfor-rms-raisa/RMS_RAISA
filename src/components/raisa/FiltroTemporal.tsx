/**
 * Componente de Filtro Temporal para Dashboards RAISA
 * Permite selecionar períodos: Ano, Trimestre, Mês, Últimos 12 Meses
 */

import React from 'react';

interface FiltroTemporalProps {
  filtroAtual: string;
  onFiltroChange: (filtro: string) => void;
}

const FiltroTemporal: React.FC<FiltroTemporalProps> = ({ filtroAtual, onFiltroChange }) => {
  const opcoes = [
    { valor: 'ano', label: 'Ano Corrente' },
    { valor: 'trimestre', label: 'Trimestre Corrente' },
    { valor: 'mes', label: 'Mês Corrente' },
    { valor: 'ultimos12', label: 'Últimos 12 Meses' },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {opcoes.map((opcao) => (
        <button
          key={opcao.valor}
          onClick={() => onFiltroChange(opcao.valor)}
          className={`
            px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200
            ${
              filtroAtual === opcao.valor
                ? 'bg-orange-600 text-white shadow-md hover:bg-orange-700'
                : 'bg-white text-gray-700 border border-gray-300 hover:border-orange-600 hover:text-orange-600'
            }
          `}
        >
          {opcao.label}
        </button>
      ))}
    </div>
  );
};

export default FiltroTemporal;
