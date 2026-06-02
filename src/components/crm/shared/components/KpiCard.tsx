/**
 * KpiCard.tsx — Card de KPI reutilizável
 *
 * Caminho: src/components/crm/shared/components/KpiCard.tsx
 * Versão: 1.0 (Fase 1B — 29/05/2026)
 *
 * Card de métrica padrão usado nos topos de página do módulo CRM:
 *  - Base de Leads (empresas, leads, prospects, clientes)
 *  - Campanhas (ativas, total enviado, taxa abertura)
 *  - Dashboard de Acompanhamento (KPIs gerais)
 *
 * Suporta 6 cores semânticas, ícone Font Awesome, valor numérico
 * formatado, e variação opcional (delta vs período anterior).
 */

import React from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export type KpiCor = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'gray';

export interface KpiCardProps {
  label: string;
  /** Valor principal — pode ser número (será formatado) ou string já formatada. */
  valor: number | string;
  /** Classe Font Awesome do ícone (ex.: 'fa-solid fa-building'). */
  icon: string;
  cor?: KpiCor;
  /** Texto auxiliar abaixo do valor (ex.: "+12 esta semana"). */
  detalhe?: string;
  /** Variação percentual vs período anterior. Positivo = verde, negativo = vermelho. */
  delta?: number;
  /** Sufixo opcional do valor (%, etc.). */
  sufixo?: string;
  /** Estado de carregamento — exibe skeleton. */
  loading?: boolean;
  /** Click handler — quando presente, card vira interativo (cursor pointer + hover). */
  onClick?: () => void;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES DE COR
// ════════════════════════════════════════════════════════════

const COR_BG: Record<KpiCor, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
  gray: 'bg-gray-100 text-gray-600',
};

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function formatarValor(v: number | string): string {
  if (typeof v === 'string') return v;
  if (!isFinite(v)) return '0';
  // Sem decimais para inteiros, separador pt-BR
  return v.toLocaleString('pt-BR', {
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
  });
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  valor,
  icon,
  cor = 'blue',
  detalhe,
  delta,
  sufixo,
  loading = false,
  onClick,
}) => {
  const corClasses = COR_BG[cor];
  const interativo = typeof onClick === 'function';

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-lg shadow-sm border border-gray-200 p-4
        ${interativo ? 'cursor-pointer hover:shadow-md hover:border-gray-300 transition' : ''}
      `}
      role={interativo ? 'button' : undefined}
      tabIndex={interativo ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interativo) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {label}
          </p>

          {loading ? (
            <div className="mt-2 h-7 w-20 bg-gray-200 rounded animate-pulse"></div>
          ) : (
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900 tabular-nums">
                {formatarValor(valor)}
              </span>
              {sufixo && (
                <span className="text-sm font-medium text-gray-500">{sufixo}</span>
              )}
            </div>
          )}

          {!loading && detalhe && (
            <p className="mt-1 text-xs text-gray-500 truncate">{detalhe}</p>
          )}

          {!loading && typeof delta === 'number' && (
            <p
              className={`
                mt-1 text-xs font-medium flex items-center gap-1
                ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'}
              `}
            >
              <i
                className={
                  delta > 0
                    ? 'fa-solid fa-arrow-trend-up'
                    : delta < 0
                    ? 'fa-solid fa-arrow-trend-down'
                    : 'fa-solid fa-minus'
                }
              ></i>
              {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              <span className="text-gray-400 font-normal">vs. anterior</span>
            </p>
          )}
        </div>

        <div
          className={`
            flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0
            ${corClasses}
          `}
        >
          <i className={`${icon} text-base`}></i>
        </div>
      </div>
    </div>
  );
};

export default KpiCard;
