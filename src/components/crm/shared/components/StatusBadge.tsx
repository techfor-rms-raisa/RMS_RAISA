/**
 * StatusBadge.tsx — Badge de status da campanha
 *
 * Caminho: src/components/crm/shared/components/StatusBadge.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Substitui o helper statusBadge() do CampaignBuilder.tsx (linhas 482-498).
 * Centraliza a lógica visual de cor + ícone do status.
 */

import React from 'react';
import { STATUS_CAMPANHA_LABELS } from '../../types/crm.constants';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface StatusBadgeProps {
  status: string;
  /** Quando true, exibe label maior. */
  grande?: boolean;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, grande = false }) => {
  const style = STATUS_CAMPANHA_LABELS[status] || STATUS_CAMPANHA_LABELS.rascunho;

  const padding = grande ? 'px-3 py-1' : 'px-2 py-0.5';
  const text = grande ? 'text-sm' : 'text-xs';

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 ${padding} ${text}
        rounded-full font-medium ${style.bgClass}
      `}
      title={style.label}
    >
      <i className={style.icon} aria-hidden="true"></i>
      <span>{style.label}</span>
    </span>
  );
};

export default StatusBadge;
