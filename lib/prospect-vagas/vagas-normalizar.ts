/**
 * lib/prospect-vagas/vagas-normalizar.ts
 *
 * Normalização de EMPRESA, LOCAL e DATA para o módulo Vagas Publicadas.
 *
 * `normalizarNomeEmpresa()` produz a chave `empresa_nome_norm` usada em:
 *   • prospect_vagas.empresa_nome_norm
 *   • prospect_vagas_empresas_salvas.empresa_nome_norm (UNIQUE)
 *   • entrada do RPC rpc_vagas_match_empresas (que aplica lower+unaccent
 *     do lado do banco sobre email_empresas.nome / prospect_leads.empresa_nome)
 *
 * As regras de sufixo legal ESPELHAM api/prospect-empresa-normalize.ts v1.0
 * (Ltda, SA, ME, EPP, EIRELI, Inc, Corp, Ltd, LLC, Cia) para que uma empresa
 * normalizada lá e aqui gere a mesma chave. Não importamos daquele arquivo
 * porque é um endpoint (api/), não uma lib.
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Modalidade } from './vagas-types.js';

// ─── EMPRESA ────────────────────────────────────────────────────────────────

const SUFIXOS_LEGAIS: RegExp[] = [
  /\s+ltda\.?$/i,
  /\s+s\.?\s*\/?\s*a\.?$/i,     // SA, S.A., S/A, S A
  /\s+m\.?\s*e\.?$/i,           // ME
  /\s+epp\.?$/i,
  /\s+eireli\.?$/i,
  /\s+inc\.?$/i,
  /\s+corp\.?$/i,
  /\s+ltd\.?$/i,
  /\s+llc\.?$/i,
  /\s+cia\.?$/i,
  /\s+jobs$/i,                  // "Zenvia Jobs" (nome de career page Gupy)
  /\s+carreiras?$/i,
];

/** Remove acentos (NFD + strip de diacríticos). Equivale ao unaccent() do banco. */
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Chave de match: minúsculas, sem acento, sem pontuação final, sem sufixo
 * legal, espaços colapsados. Retorna null para vazio.
 */
export function normalizarNomeEmpresa(nome: string | null | undefined): string | null {
  if (!nome) return null;
  let s = semAcento(nome).toLowerCase().trim();
  s = s.replace(/[.,;:]+$/g, '').trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const re of SUFIXOS_LEGAIS) {
      const n = s.replace(re, '');
      if (n !== s) { s = n.trim(); mudou = true; }
    }
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.length >= 2 ? s : null;
}

/** Marcadores que indicam vaga confidencial / sem empresa. */
const CONFIDENCIAL = /^(confidencial|empresa\s+confidencial|n[ãa]o\s+divulgad[ao]|sigilos[ao])$/i;

export function isConfidencial(nome: string | null | undefined): boolean {
  if (!nome || !nome.trim()) return true;
  return CONFIDENCIAL.test(nome.trim());
}

/**
 * Gupy: `careerPageName` às vezes é slogan ("VENHA SER #SANGUELARANJA",
 * "Conecte seu talento a projetos..."). Heurística: se tem > 4 palavras,
 * emoji/hashtag, ou termina com "!" → usa o slug do subdomínio como nome.
 */
export function nomeEmpresaGupy(careerPageName: string, jobUrl: string): { nome: string; slug: string | null } {
  const slug = (jobUrl.match(/^https?:\/\/([a-z0-9-]+)\.gupy\.io/i)?.[1] || '').toLowerCase() || null;
  const nome = (careerPageName || '').trim();
  // Slogan: hashtag/emoji/exclamação, frase de convite ("Venha ser", "Vem pra", "Junte-se",
  // "Conecte seu talento") ou texto longo (> 6 palavras). Nome jurídico com 5 palavras
  // ("AZZAS 2154 FASHION & LIFESTYLE") NÃO é slogan.
  const pareceSlogan =
    !nome ||
    nome.split(/\s+/).length > 6 ||
    /[#!]|[\u{1F300}-\u{1FAFF}]/u.test(nome) ||
    /^(venha|vem|seja|junte-se|conecte|faça parte|trabalhe|carreiras?\s+na)\b/i.test(nome);
  if (pareceSlogan && slug) {
    return { nome: slug.charAt(0).toUpperCase() + slug.slice(1), slug };
  }
  return { nome, slug };
}

// ─── LOCAL / MODALIDADE ─────────────────────────────────────────────────────

const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

const ESTADO_PARA_UF: Record<string, string> = {
  'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE',
  'distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT',
  'mato grosso do sul':'MS','minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR',
  'pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN',
  'rio grande do sul':'RS','rondonia':'RO','roraima':'RR','santa catarina':'SC',
  'sao paulo':'SP','sergipe':'SE','tocantins':'TO',
};

/** Aceita "SP", "São Paulo", "Rio de Janeiro" → 'SP' | 'RJ' | null */
export function paraUF(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (UFS.has(v.toUpperCase()) && v.length === 2) return v.toUpperCase();
  return ESTADO_PARA_UF[semAcento(v).toLowerCase()] ?? null;
}

/**
 * "São Paulo / SP", "São Caetano do Sul/SP (Híbrido)", "Rio de Janeiro, Rio de Janeiro, Brazil",
 * "Remoto", "100% Home Office" → { cidade, uf, modalidade? }
 */
export function parsearLocal(texto: string | null | undefined): { cidade: string | null; uf: string | null; modalidade: Modalidade | null } {
  if (!texto) return { cidade: null, uf: null, modalidade: null };
  let t = texto.replace(/\s+/g, ' ').trim();
  let modalidade: Modalidade | null = null;

  if (/remoto|home\s*office|remote/i.test(t)) modalidade = 'remoto';
  if (/h[íi]brido|hybrid/i.test(t))          modalidade = 'hibrido';
  if (/presencial|on-?site/i.test(t))        modalidade = 'presencial';

  // remove parênteses "(Híbrido)" e sufixos de país
  t = t.replace(/\(.*?\)/g, '').replace(/,?\s*(brasil|brazil)$/i, '').trim();
  if (/^(remoto|remote|100% home office|home office)$/i.test(t)) {
    return { cidade: null, uf: null, modalidade: modalidade ?? 'remoto' };
  }

  const partes = t.split(/\s*[\/,|-]\s*/).map(p => p.trim()).filter(Boolean);
  let uf: string | null = null;
  let cidade: string | null = null;

  if (partes.length >= 2) {
    uf = paraUF(partes[partes.length - 1]);
    // LinkedIn: "Osasco, São Paulo" → cidade=Osasco, uf=SP
    cidade = partes[0] || null;
    if (!uf && partes.length >= 3) uf = paraUF(partes[1]);
  } else if (partes.length === 1) {
    uf = paraUF(partes[0]);
    cidade = uf ? null : partes[0];
  }
  return { cidade: cidade || null, uf, modalidade };
}

export function modalidadeGupy(workplaceType: string | null | undefined): Modalidade | null {
  switch ((workplaceType || '').toLowerCase()) {
    case 'remote':  return 'remoto';
    case 'hybrid':  return 'hibrido';
    case 'on-site': return 'presencial';
    default:        return null;
  }
}

// ─── DATAS ──────────────────────────────────────────────────────────────────

/** ISO ("2026-10-16T21:41:53.471Z"), "16/10/2026", "Há 5 dias", "Hoje", "Ontem" → "2026-10-16" | null */
export function paraDataISO(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim();
  const rel = v.match(/^h[áa]\s+(\d+)\s+dias?$/i);
  const diasAtras = rel ? Number(rel[1]) : (/^hoje$/i.test(v) ? 0 : (/^ontem$/i.test(v) ? 1 : null));
  if (diasAtras !== null) return new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

export function diasDesde(dataISO: string | null): number | null {
  if (!dataISO) return null;
  const d = new Date(dataISO + 'T00:00:00Z').getTime();
  if (Number.isNaN(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

// ─── HTML ───────────────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'",
  '&nbsp;': ' ', '&#8211;': '–', '&#8212;': '—', '&ndash;': '–', '&mdash;': '—',
};

/** Remove tags, decodifica entidades comuns e colapsa espaços. */
export function limparHtml(s: string | null | undefined): string {
  if (!s) return '';
  let t = s.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  t = t.replace(/&[a-z#0-9]+;/gi, m => ENTIDADES[m] ?? m);
  return t.replace(/\s+/g, ' ').trim();
}

/** Senioridade inferida do título quando a fonte não informa. */
export function inferirSenioridade(titulo: string): string | null {
  const t = titulo.toLowerCase();
  if (/\b(s[êe]nior|sr\b|senior|especialista|lead|principal|staff)/.test(t)) return 'Sênior';
  if (/\b(pleno|pl\b|mid|middle|ii\b)/.test(t))                               return 'Pleno';
  if (/\b(j[úu]nior|jr\b|junior|trainee|est[áa]gi|i\b)/.test(t))              return 'Júnior';
  return null;
}
