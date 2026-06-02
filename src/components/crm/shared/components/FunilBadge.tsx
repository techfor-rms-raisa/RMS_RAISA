/**
 * FunilBadge.tsx — Badge da etapa do funil
 *
 * Caminho: src/components/crm/shared/components/FunilBadge.tsx
 * Versão: 1.0 (Fase 1B — 29/05/2026)
 *
 * Badge visual padrão para representar a etapa do funil de um lead.
 * Replica fielmente o mapeamento atual em EmpresasLeadsCRM.tsx
 * (FUNIL_LABELS), agora centralizado para uso em qualquer lugar
 * do módulo: lista de leads, drawer de detalhe, dashboard, etc.
 *
 * Em vez de espalhar o mapa em múltiplos arquivos, o FunilBadge
 * encapsula a lógica visual. Status desconhecido faz fallback
 * seguro para 'lead'.
 */

import React from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export interface FunilBadgeProps {
  status: string;                  // 'lead' | 'prospect' | 'cliente' | 'inativo' | 'perdido' | string
  /** Quando true, exibe somente o ícone (modo compacto p/ tabelas densas). */
  somenteIcone?: boolean;
  /** Quando true, aplica estilo de tamanho maior (uso em headers). */
  grande?: boolean;
}

// ════════════════════════════════════════════════════════════
// MAPA — fonte única (idêntico ao FUNIL_LABELS em uso)
// ════════════════════════════════════════════════════════════

interface FunilStyle {
  label: string;
  cor: string;
  icon: string;
}

export const FUNIL_LABELS: Record<string, FunilStyle> = {
  lead: {
    label: 'Lead',
    cor: 'bg-gray-100 text-gray-700',
    icon: 'fa-solid fa-user',
  },
  prospect: {
    label: 'Prospect',
    cor: 'bg-blue-100 text-blue-700',
    icon: 'fa-solid fa-user-check',
  },
  cliente: {
    label: 'Cliente',
    cor: 'bg-green-100 text-green-700',
    icon: 'fa-solid fa-handshake',
  },
  inativo: {
    label: 'Inativo',
    cor: 'bg-yellow-100 text-yellow-700',
    icon: 'fa-solid fa-clock',
  },
  perdido: {
    label: 'Perdido',
    cor: 'bg-red-100 text-red-700',
    icon: 'fa-solid fa-user-xmark',
  },
};

const FUNIL_DEFAULT: FunilStyle = FUNIL_LABELS.lead;

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const FunilBadge: React.FC<FunilBadgeProps> = ({
  status,
  somenteIcone = false,
  grande = false,
}) => {
  const style = FUNIL_LABELS[status] || FUNIL_DEFAULT;

  const tamanhoTexto = grande ? 'text-sm' : 'text-xs';
  const padding = grande ? 'px-3 py-1' : 'px-2 py-0.5';
  const gap = somenteIcone ? '' : 'gap-1.5';

  return (
    <span
      className={`
        inline-flex items-center ${gap} ${padding} rounded-full
        font-medium ${tamanhoTexto} ${style.cor}
      `}
      title={style.label}
    >
      <i className={style.icon} aria-hidden="true"></i>
      {!somenteIcone && <span>{style.label}</span>}
    </span>
  );
};

export default FunilBadge;
