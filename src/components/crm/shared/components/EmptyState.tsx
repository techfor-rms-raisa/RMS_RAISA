/**
 * EmptyState.tsx — Estado vazio reutilizável
 *
 * Caminho: src/components/crm/shared/components/EmptyState.tsx
 * Versão: 1.0 (Fase 1B — 29/05/2026)
 *
 * Componente padrão para exibir quando uma lista/tabela está
 * vazia ou um filtro não retornou resultados. Centralizar isso
 * garante consistência visual no módulo.
 */

import React from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export interface EmptyStateProps {
  icon?: string;                   // Font Awesome (default: fa-inbox)
  titulo: string;
  descricao?: string;
  /** Ação primária (ex.: "Adicionar primeiro lead"). */
  acaoLabel?: string;
  acaoIcon?: string;
  onAcao?: () => void;
  /** Quando true, reduz padding (uso em containers pequenos). */
  compacto?: boolean;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'fa-solid fa-inbox',
  titulo,
  descricao,
  acaoLabel,
  acaoIcon,
  onAcao,
  compacto = false,
}) => {
  return (
    <div
      className={`
        text-center
        ${compacto ? 'py-6 px-3' : 'py-12 px-4'}
      `}
    >
      <div
        className={`
          inline-flex items-center justify-center rounded-full bg-gray-100
          ${compacto ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'}
        `}
      >
        <i
          className={`
            ${icon} text-gray-400
            ${compacto ? 'text-lg' : 'text-2xl'}
          `}
        ></i>
      </div>

      <h3
        className={`
          font-semibold text-gray-700
          ${compacto ? 'text-sm mb-0.5' : 'text-base mb-1'}
        `}
      >
        {titulo}
      </h3>

      {descricao && (
        <p
          className={`
            text-gray-500 max-w-md mx-auto
            ${compacto ? 'text-xs' : 'text-sm mb-4'}
          `}
        >
          {descricao}
        </p>
      )}

      {acaoLabel && onAcao && (
        <button
          type="button"
          onClick={onAcao}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-md
            bg-blue-600 hover:bg-blue-700 text-white font-medium
            text-sm transition-colors
            ${compacto ? 'mt-2' : 'mt-2'}
          `}
        >
          {acaoIcon && <i className={acaoIcon}></i>}
          {acaoLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
