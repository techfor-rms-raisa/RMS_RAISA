/**
 * lib/prospect-vagas/vagas-scraper-programathor.ts
 *
 * FONTE: Programathor — listagem pública de vagas de TI (sem login).
 *   GET https://programathor.com.br/jobs?page=<1..3>
 *   → 15 cards <a href="/jobs/<id>-<slug>"> por página:
 *       h3.text-24                       → título
 *       i.fa-briefcase + texto           → empresa (nome jurídico, ex. "... LTDA")
 *       i.fa-map-marker-alt + texto      → "Remoto" | "São Caetano do Sul/SP (Híbrido)"
 *       i.fa-chart-bar + texto           → senioridade
 *       i.fa-file-alt + texto            → "PJ" | "CLT"
 *       span.tag-list                    → stack (Python, Kafka, ...)
 *
 * Particularidades (validado 18/10/2026):
 *   • `?search=` é ignorado pelo site → raspamos a lista geral (páginas 1–3,
 *     45 vagas mais recentes) e classificamos por área via regex do título.
 *   • A listagem NÃO traz data de publicação → publicado_em = null ("—" na UI).
 *   • É 100% TI: área "administrativo" nunca vem daqui.
 *
 * Confiabilidade: MÉDIA (HTML). Health check: 0 cards com HTTP 200 ⇒ degradada.
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Area, SaudeFonte, VagaNormalizada } from './vagas-types.js';
import { classificarArea } from './vagas-areas.js';
import { buscarTexto } from './vagas-http.js';
import {
  isConfidencial, limparHtml, normalizarNomeEmpresa, parsearLocal, inferirSenioridade,
} from './vagas-normalizar.js';

const BASE = 'https://programathor.com.br';
const PAGINAS = 3;

function parsearCards(html: string) {
  const cards: Array<{ id: string; url: string; titulo: string; empresa: string; local: string; senioridade: string | null; regime: string | null; stack: string[] }> = [];
  const re = /<a href="(\/jobs\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const inner = m[3];
    const titulo = limparHtml(inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    if (!titulo) continue;
    const campo = (icone: string) => limparHtml(inner.match(new RegExp(`<i class='[^']*${icone}[^']*'><\\/i>([^<]*)`, 'i'))?.[1]) || '';
    const stack = [...inner.matchAll(/class='tag-list[^']*'>([^<]+)</gi)].map(x => limparHtml(x[1])).filter(Boolean);
    cards.push({
      id: m[2],
      url: BASE + m[1],
      titulo,
      empresa: campo('fa-briefcase'),
      local: campo('fa-map-marker-alt'),
      senioridade: campo('fa-chart-bar') || null,
      regime: campo('fa-file-alt') || null,
      stack,
    });
  }
  return cards;
}

export async function rasparProgramathor(areas: Area[], keywordExtra: string | null): Promise<{ vagas: VagaNormalizada[]; saude: SaudeFonte }> {
  const t0 = Date.now();
  const vagas: VagaNormalizada[] = [];
  let requests = 0, falhas = 0;
  let ultimoErro: string | undefined;
  const extraRe = keywordExtra ? new RegExp(keywordExtra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

  for (let p = 1; p <= PAGINAS; p++) {
    requests++;
    const r = await buscarTexto(`${BASE}/jobs?page=${p}`);
    if (!r.ok) { falhas++; ultimoErro = `HTTP ${r.status}`; continue; }
    const cards = parsearCards(r.body);
    if (cards.length === 0) break;

    for (const c of cards) {
      const areaReal = classificarArea(c.titulo, areas);
      if (!areaReal) continue;
      if (extraRe && !extraRe.test(c.titulo) && !c.stack.some(s => extraRe.test(s))) continue;
      const confidencial = isConfidencial(c.empresa);
      const { cidade, uf, modalidade } = parsearLocal(c.local);
      vagas.push({
        fonte:             'programathor',
        fonte_vaga_id:     c.id,
        vaga_url:          c.url,
        titulo:            c.titulo,
        area:              areaReal,
        keyword_busca:     keywordExtra ? `lista geral + ${keywordExtra}` : 'lista geral',
        senioridade:       c.senioridade ?? inferirSenioridade(c.titulo),
        regime:            c.regime,
        stack:             c.stack.length ? c.stack : null,
        cidade, uf, modalidade,
        publicado_em:      null,
        empresa_nome:      confidencial ? null : c.empresa,
        empresa_nome_norm: confidencial ? null : normalizarNomeEmpresa(c.empresa),
        empresa_slug:      null,
        empresa_url:       null,
        empresa_dominio:   null,
        confidencial,
      });
    }
  }

  return {
    vagas,
    saude: {
      fonte: 'programathor', ok: falhas < requests, qtd: vagas.length, ms: Date.now() - t0, requests,
      erro: falhas ? `${falhas}/${requests} requests falharam (${ultimoErro})` : undefined,
      degradada: falhas === 0 && vagas.length === 0 && areas.includes('tecnologia'),
    },
  };
}
