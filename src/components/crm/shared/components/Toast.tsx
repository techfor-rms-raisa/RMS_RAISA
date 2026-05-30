/**
 * Toast.tsx — Mensagem flutuante (success/error) reutilizável
 *
 * Caminho: src/components/crm/shared/components/Toast.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Substitui o toast inline do CampaignBuilder.tsx (linhas 1463-1471).
 * Auto-dismiss após 4 segundos (configurável).
 */

import React, { useEffect } from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export type ToastTipo = 'success' | 'error' | 'info' | 'warning';

export interface ToastMensagem {
  tipo: ToastTipo;
  texto: string;
}

export interface ToastProps {
  mensagem: ToastMensagem | null;
  onDismiss: () => void;
  /** Tempo em ms até auto-dismiss. 0 = sem auto-dismiss. */
  duracao?: number;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES VISUAIS
// ════════════════════════════════════════════════════════════

const TIPO_COR: Record<ToastTipo, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
  warning: 'bg-amber-600 text-white',
};

const TIPO_ICONE: Record<ToastTipo, string> = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  info: 'fa-solid fa-circle-info',
  warning: 'fa-solid fa-triangle-exclamation',
};

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const Toast: React.FC<ToastProps> = ({ mensagem, onDismiss, duracao = 4000 }) => {
  useEffect(() => {
    if (!mensagem || duracao === 0) return;
    const timer = setTimeout(onDismiss, duracao);
    return () => clearTimeout(timer);
  }, [mensagem, duracao, onDismiss]);

  if (!mensagem) return null;

  return (
    <div
      role="alert"
      className={`
        fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg
        text-sm flex items-center gap-2 max-w-md
        ${TIPO_COR[mensagem.tipo]}
        animate-fade-in
      `}
    >
      <i className={TIPO_ICONE[mensagem.tipo]} aria-hidden="true"></i>
      <span className="flex-1">{mensagem.texto}</span>
      <button
        onClick={onDismiss}
        className="ml-2 hover:opacity-75 transition-opacity"
        aria-label="Fechar"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

export default Toast;
