/**
 * lib/prospect-vagas/vagas-scraper-vagascom.ts
 *
 * FONTE: Vagas.com — página pública de listagem (sem login).
 *   GET https://www.vagas.com.br/vagas-de-<slug-da-keyword>?ordenar_por=mais_recentes
 *   → 10 cards <li class="vaga ..."> por página:
 *       a.link-detalhes-vaga[data-id-vaga][href]   → id + url + título
 *       span.emprVaga                              → empresa ("Confidencial" quando oculta)
 *       span.nivelVaga                             → "Júnior/Trainee" | "Pleno" | "Sênior" ...
 *       div.vaga-local                             → "Rio de Janeiro / RJ" | "100% Home Office"
 *       span.data-publicacao                       → "11/08/2026"
 *
 * Limitação v1 (validado 18/10/2026): a paginação é AJAX ("Mais vagas") e a
 * URL ?pagina=N não respeita a keyword → raspamos só a 1ª página, ordenada
 * por mais recentes. Fase 2: descobrir o endpoint do "Mais vagas".
 *
 * Confiabilidade: MÉDIA (HTML). Health check: 0 cards com HTTP 200 ⇒ degradada.
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Area, SaudeFonte, VagaNormalizada } from './vagas-types.js';
import { AREAS, classificarArea } from './vagas-areas.js';
import { buscarTexto } from './vagas-http.js';
import {
  inferirSenioridade, isConfidencial, limparHtml, normalizarNomeEmpresa,
  paraDataISO, parsearLocal, semAcento,
} from './vagas-normalizar.js';

const BASE = 'https://www.vagas.com.br';

function slugKeyword(kw: string): string {
  return semAcento(kw).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parsearCards(html: string) {
  const cards: Array<{ id: string; url: string; titulo: string; empresa: string; nivel: string | null; local: string; data: string | null }> = [];
  const blocos = html.split(/<li class="vaga\b/i).slice(1);
  for (const b of blocos) {
    const a = b.match(/<a[^>]*class="link-detalhes-vaga"[^>]*data-id-vaga="(\d+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const empresa = limparHtml(b.match(/class="emprVaga"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const nivel   = limparHtml(b.match(/class="nivelVaga"[^>]*>([\s\S]*?)<\/span>/i)?.[1]) || null;
    // local = texto imediatamente após o ícone de mapa (antes do tooltip ou do fechamento)
    const local   = limparHtml(b.match(/bx-map"><\/i>([^<]*)/i)?.[1]);
    // data: "08/10/2026" | "Há 5 dias" | "Hoje" | "Ontem"
    const data    = limparHtml(b.match(/class="data-publicacao"[^>]*>(?:<i[^>]*><\/i>)?([^<]*)/i)?.[1]) || null;
    cards.push({ id: a[1], url: BASE + a[2].split('?')[0], titulo: limparHtml(a[3]), empresa, nivel, local, data });
  }
  return cards;
}

export async function rasparVagasCom(areas: Area[], keywordExtra: string | null): Promise<{ vagas: VagaNormalizada[]; saude: SaudeFonte }> {
  const t0 = Date.now();
  const vagas: VagaNormalizada[] = [];
  const vistos = new Set<string>();
  let requests = 0, falhas = 0;
  let ultimoErro: string | undefined;

  for (const area of areas) {
    for (const kw of AREAS[area].keywords) {
      const termo = keywordExtra ? `${kw} ${keywordExtra}` : kw;
      const url = `${BASE}/vagas-de-${slugKeyword(termo)}?ordenar_por=mais_recentes`;
      requests++;
      const r = await buscarTexto(url);
      if (!r.ok) { falhas++; ultimoErro = `HTTP ${r.status}`; continue; }

      for (const c of parsearCards(r.body)) {
        if (vistos.has(c.id)) continue;
        vistos.add(c.id);
        const areaReal = classificarArea(c.titulo, [area]) ?? classificarArea(c.titulo, areas);
        if (!areaReal) continue;
        const confidencial = isConfidencial(c.empresa);
        const { cidade, uf, modalidade } = parsearLocal(c.local);
        vagas.push({
          fonte:             'vagascom',
          fonte_vaga_id:     c.id,
          vaga_url:          c.url,
          titulo:            c.titulo,
          area:              areaReal,
          keyword_busca:     termo,
          senioridade:       c.nivel ?? inferirSenioridade(c.titulo),
          regime:            null,
          stack:             null,
          cidade, uf, modalidade,
          publicado_em:      paraDataISO(c.data),
          empresa_nome:      confidencial ? null : c.empresa,
          empresa_nome_norm: confidencial ? null : normalizarNomeEmpresa(c.empresa),
          empresa_slug:      null,
          empresa_url:       null,                    // Vagas.com não expõe página pública da empresa no card
          empresa_dominio:   null,
          confidencial,
        });
      }
    }
  }

  return {
    vagas,
    saude: {
      fonte: 'vagascom', ok: falhas < requests, qtd: vagas.length, ms: Date.now() - t0, requests,
      erro: falhas ? `${falhas}/${requests} requests falharam (${ultimoErro})` : undefined,
      degradada: falhas === 0 && vagas.length === 0 && areas.includes('tecnologia'),
    },
  };
}
