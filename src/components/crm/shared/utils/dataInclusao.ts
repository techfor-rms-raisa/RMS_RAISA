/**
 * dataInclusao.ts — Formatação da data de inclusão de registros do CRM
 *
 * Caminho: src/components/crm/shared/utils/dataInclusao.ts
 * Versão: 1.0 — 19/11/2026
 *
 * Usado pela coluna "Incluída em" da EmpresasTab v1.2 (filtro "Datas
 * recentes"). Datas sempre no horário de São Paulo — o mesmo "hoje" que o
 * backend usa no filtro (api/crm-leads.ts v1.32, inicioPeriodoSaoPaulo).
 */

const FUSO = 'America/Sao_Paulo';

const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
}); // → 2026-11-19

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric',
}); // → 19/11/2026

const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, hour: '2-digit', minute: '2-digit',
}); // → 09:40

/** Dias civis (São Paulo) entre duas datas: 0 = mesmo dia. */
function diasEntre(de: Date, ate: Date): number {
  const [a1, m1, d1] = fmtDia.format(de).split('-').map(Number);
  const [a2, m2, d2] = fmtDia.format(ate).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

export interface DataInclusaoFormatada {
  /** 19/11/2026 */
  data: string;
  /** "hoje, 09:40" | "ontem, 17:02" | "há 5 dias" */
  relativo: string;
  /** true quando foi incluída hoje (a UI destaca em verde) */
  ehHoje: boolean;
}

/** null quando a data é vazia ou inválida (a UI mostra "—"). */
export function formatarDataInclusao(
  iso: string | null | undefined,
  agora: Date = new Date()
): DataInclusaoFormatada | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;

  const dias = diasEntre(dt, agora);
  let relativo: string;
  if (dias <= 0) relativo = `hoje, ${fmtHora.format(dt)}`;       // <0 = relógio adiantado
  else if (dias === 1) relativo = `ontem, ${fmtHora.format(dt)}`;
  else relativo = `há ${dias} dias`;

  return { data: fmtData.format(dt), relativo, ehHoje: dias <= 0 };
}

const ROTULOS_ORIGEM: Record<string, string> = {
  vagas_publicadas: 'Vagas Publicadas',
  prospect_engine: 'Prospect Engine',
  manual: 'Manual',
};

/** Rótulo legível de email_empresas.origem; valor desconhecido sai legível ("importacao_lista" → "Importacao lista"). */
export function rotuloOrigemEmpresa(origem: string | null | undefined): string | null {
  const o = (origem || '').trim();
  if (!o) return null;
  if (ROTULOS_ORIGEM[o]) return ROTULOS_ORIGEM[o];
  const texto = o.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
