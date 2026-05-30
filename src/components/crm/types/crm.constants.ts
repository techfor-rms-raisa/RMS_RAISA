/**
 * crm.constants.ts — Constantes do módulo CRM
 *
 * Caminho: src/components/crm/types/crm.constants.ts
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Constantes que eram inline em EmpresasLeadsCRM.tsx,
 * agora centralizadas para reúso.
 */

// ════════════════════════════════════════════════════════════
// SETORES (filtros e select de empresa)
// ════════════════════════════════════════════════════════════
export const SETORES: ReadonlyArray<string> = [
  'Tecnologia',
  'Financeiro',
  'Saúde',
  'Varejo',
  'Indústria',
  'Educação',
  'Telecomunicações',
  'Energia',
  'Logística',
  'Agronegócio',
  'Construção',
  'Governo',
  'Consultoria',
  'Outro',
];

// ════════════════════════════════════════════════════════════
// PORTES de empresa
// ════════════════════════════════════════════════════════════
export const PORTES: ReadonlyArray<string> = ['Micro', 'Pequena', 'Média', 'Grande'];

// ════════════════════════════════════════════════════════════
// ÍCONES para tipos do timeline (HistoricoItem.tipo)
// ════════════════════════════════════════════════════════════
export const HISTORICO_ICONS: Record<string, string> = {
  lead_criado:        'fa-solid fa-plus-circle text-green-500',
  email_enviado:      'fa-solid fa-paper-plane text-blue-500',
  email_aberto:       'fa-solid fa-envelope-open text-indigo-500',
  email_clicado:      'fa-solid fa-mouse-pointer text-purple-500',
  email_respondido:   'fa-solid fa-reply text-teal-500',
  bounce:             'fa-solid fa-triangle-exclamation text-red-500',
  opt_out:            'fa-solid fa-ban text-red-600',
  funil_mudou:        'fa-solid fa-arrows-rotate text-amber-500',
  nota_manual:        'fa-solid fa-sticky-note text-gray-500',
  campanha_adicionado: 'fa-solid fa-bullhorn text-indigo-400',
};

// ════════════════════════════════════════════════════════════
// HELPERS de formatação (eram inline)
// ════════════════════════════════════════════════════════════

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
