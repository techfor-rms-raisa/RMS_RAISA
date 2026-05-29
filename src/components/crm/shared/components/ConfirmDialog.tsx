/**
 * ConfirmDialog.tsx — Modal de confirmação reutilizável
 *
 * Caminho: src/components/crm/shared/components/ConfirmDialog.tsx
 * Versão: 1.0 (Fase 1B — 29/05/2026)
 *
 * Modal padrão para confirmação de ações destrutivas ou que
 * exigem confirmação explícita (excluir lead, ativar campanha,
 * marcar opt-out, etc).
 *
 * Suporta 3 variantes: 'danger' (vermelho, default para exclusões),
 * 'warning' (amarelo, ações reversíveis com cuidado), 'info' (azul,
 * confirmações neutras).
 */

import React, { useEffect, useRef } from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export type ConfirmVariante = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  open: boolean;
  titulo: string;
  mensagem: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variante?: ConfirmVariante;
  /** Quando true, exibe spinner no botão de confirmar. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

const VARIANTE_ICONE: Record<ConfirmVariante, string> = {
  danger: 'fa-solid fa-triangle-exclamation',
  warning: 'fa-solid fa-circle-exclamation',
  info: 'fa-solid fa-circle-info',
};

const VARIANTE_COR_ICONE: Record<ConfirmVariante, string> = {
  danger: 'bg-red-100 text-red-600',
  warning: 'bg-amber-100 text-amber-600',
  info: 'bg-blue-100 text-blue-600',
};

const VARIANTE_COR_BTN: Record<ConfirmVariante, string> = {
  danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
};

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  titulo,
  mensagem,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variante = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // ESC fecha o modal
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', handler);
    // Focus inicial no botão Cancelar (evita confirmação acidental por Enter)
    setTimeout(() => cancelBtnRef.current?.focus(), 50);
    return () => window.removeEventListener('keydown', handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-titulo"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !loading && onCancel()}
      />

      {/* Painel */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4">
          {/* Ícone */}
          <div
            className={`
              flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0
              ${VARIANTE_COR_ICONE[variante]}
            `}
          >
            <i className={`${VARIANTE_ICONE[variante]} text-xl`}></i>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <h3
              id="confirm-titulo"
              className="text-base font-semibold text-gray-900 mb-1"
            >
              {titulo}
            </h3>
            <div className="text-sm text-gray-600">{mensagem}</div>
          </div>
        </div>

        {/* Ações */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="
              px-4 py-2 rounded-md text-sm font-medium
              bg-white border border-gray-300 text-gray-700
              hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`
              px-4 py-2 rounded-md text-sm font-medium text-white
              focus:outline-none focus:ring-2 focus:ring-offset-2
              disabled:opacity-60 disabled:cursor-not-allowed
              transition-colors flex items-center gap-2
              ${VARIANTE_COR_BTN[variante]}
            `}
          >
            {loading && (
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
