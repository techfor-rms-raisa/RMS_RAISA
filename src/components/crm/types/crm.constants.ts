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

// ════════════════════════════════════════════════════════════
// CONSTANTES DE CAMPANHA (Fase 1D — 30/05/2026)
// ════════════════════════════════════════════════════════════

// URL base do endpoint de Campanhas (renomeado na Fase 1E — antes /api/campaign-builder)
export const CAMPANHA_API_URL = '/api/crm-campanhas';

// Domínios de envio disponíveis (alinhado ao Resend verificado em 28/05)
// Domínios de envio verificados no Resend (sa-east-1) — atualizado em 30/05/2026
// Ambos já processam ~200 e-mails/dia via Leads2b+Nerus. Mantidos em ordem
// alfabética para consistência no dropdown do StepInfo.
//
// ⚠️ Adicionar novo domínio: requer verificação prévia DNS (TXT+DKIM+MX) no
//    Hostinger + ativação no Resend antes de listar aqui.
export const DOMINIOS_ENVIO: ReadonlyArray<string> = [
  'techfor.com.br',
  'techforti.inf.br',
];

// Status de campanha — labels para STATUS BADGE
export const STATUS_CAMPANHA_LABELS: Record<
  string,
  { label: string; bgClass: string; icon: string }
> = {
  rascunho:  { label: 'Rascunho',  bgClass: 'bg-gray-100 text-gray-700',     icon: 'fa-solid fa-pen-to-square' },
  agendada:  { label: 'Agendada',  bgClass: 'bg-blue-100 text-blue-700',     icon: 'fa-solid fa-clock' },
  ativa:     { label: 'Ativa',     bgClass: 'bg-green-100 text-green-700',   icon: 'fa-solid fa-circle-play' },
  pausada:   { label: 'Pausada',   bgClass: 'bg-yellow-100 text-yellow-700', icon: 'fa-solid fa-circle-pause' },
  concluida: { label: 'Concluída', bgClass: 'bg-purple-100 text-purple-700', icon: 'fa-solid fa-circle-check' },
};

// Condições de envio do step
export const LABEL_CONDICAO_STEP: Record<string, string> = {
  sempre:           'Sempre enviar',
  se_nao_abriu:     'Se não abriu o anterior',
  se_nao_respondeu: 'Se não respondeu',
  se_abriu:         'Se abriu o anterior',
};

// Limites do wizard
export const MAX_STEPS_POR_CAMPANHA = 5;
export const DELAY_PADRAO_STEP_SUBSEQUENTE = 3; // dias
