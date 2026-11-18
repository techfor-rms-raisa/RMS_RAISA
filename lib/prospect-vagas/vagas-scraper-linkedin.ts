/**
 * lib/prospect-vagas/vagas-scraper-linkedin.ts
 *
 * FONTE: LinkedIn Jobs — endpoint PÚBLICO de convidado (sem login, sem cookie).
 *   GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 *       ?keywords=<kw>&geoId=106057199&f_TPR=r<segundos>&start=<0|10|20>
 *   (geoId 106057199 = Brasil. `location=Brasil` em texto NÃO filtra — devolve EUA.)
 *   → fragmento HTML com <li> por vaga:
 *       data-entity-urn="urn:li:jobPosting:<id>"
 *       .base-search-card__title     → título
 *       .base-search-card__subtitle  → <a href="https://www.linkedin.com/company/<slug>">Empresa</a>
 *       .job-search-card__location   → "São Paulo, São Paulo, Brazil"
 *       <time datetime="2026-10-16">
 *       href="https://br.linkedin.com/jobs/view/<slug>-<id>"
 *
 * ⚠️ CLAUDE RISCOS (documentado para Messias em 18/10/2026):
 *   • O LinkedIn bloqueia IPs de datacenter com 429/999 após dezenas de
 *     requests — CONFIRMADO no teste de 18/10/2026: 429 após 4 requests
 *     seguidos de um IP cloud. Mitigações: requests SEQUENCIAIS com pausa
 *     de 2,5s, 1 página por keyword, teto de 6 requests por busca, cache
 *     24h e falha isolada (a fonte cai sozinha, as outras continuam).
 *   • Recomendação: fonte DESMARCADA por padrão na UI; o analista liga
 *     quando quiser o complemento LinkedIn.
 *   • Página pública, sem autenticação — compatível com a regra "sem login".
 *     Não conflita com `podeUsarLinkedIn` negado para GC: o sistema consulta,
 *     o analista não navega.
 *
 * Confiabilidade: MÉDIA (HTML pode mudar). Health check: 0 vagas para
 * "desenvolvedor" com HTTP 200 ⇒ `degradada: true`.
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Area, SaudeFonte, VagaNormalizada } from './vagas-types.js';
import { AREAS, classificarArea } from './vagas-areas.js';
import { buscarTexto, pausa } from './vagas-http.js';
import {
  inferirSenioridade, isConfidencial, limparHtml, normalizarNomeEmpresa,
  paraDataISO, parsearLocal,
} from './vagas-normalizar.js';

const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const GEO_ID_BRASIL = '106057199';   // location=Brasil (texto) devolve vagas dos EUA — geoId é o filtro real
const PAGINAS_POR_KEYWORD = 1;        // 10 vagas/página — 1 página por keyword protege o IP
const MAX_REQUESTS = 6;               // teto absoluto por busca
const PAUSA_MS = 2_500;

/** periodo_dias → filtro f_TPR (segundos). null = sem filtro. */
function filtroPeriodo(periodoDias: number | null): string {
  if (!periodoDias) return '';
  return `&f_TPR=r${periodoDias * 86_400}`;
}

function parsearCards(html: string): Array<{
  id: string; titulo: string; empresa: string; empresaUrl: string | null; local: string; data: string | null; url: string;
}> {
  const cards: ReturnType<typeof parsearCards> = [];
  const lis = html.split(/<li\b[^>]*>/i).slice(1);
  for (const li of lis) {
    const id = li.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/)?.[1];
    if (!id) continue;
    const titulo = limparHtml(li.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    const subtitulo = li.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '';
    const empresa = limparHtml(subtitulo);
    const empresaUrl = subtitulo.match(/href="(https:\/\/[a-z.]*linkedin\.com\/company\/[^"?]+)/i)?.[1] || null;
    const local = limparHtml(li.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const data = li.match(/<time[^>]*datetime="([^"]+)"/i)?.[1] || null;
    const url = li.match(/href="(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"?]+)/i)?.[1] || '';
    if (!titulo || !url) continue;
    cards.push({ id, titulo, empresa, empresaUrl, local, data, url });
  }
  return cards;
}

export async function rasparLinkedIn(areas: Area[], keywordExtra: string | null, periodoDias: number | null): Promise<{ vagas: VagaNormalizada[]; saude: SaudeFonte }> {
  const t0 = Date.now();
  const vagas: VagaNormalizada[] = [];
  const vistos = new Set<string>();
  let requests = 0;
  let falhas = 0;
  let bloqueado = false;
  let ultimoErro: string | undefined;

  loopKeywords:
  for (const area of areas) {
    for (const kw of AREAS[area].keywords) {
      const termo = keywordExtra ? `${kw} ${keywordExtra}` : kw;
      for (let pagina = 0; pagina < PAGINAS_POR_KEYWORD; pagina++) {
        if (requests >= MAX_REQUESTS) break loopKeywords;
        if (requests > 0) await pausa(PAUSA_MS);
        const url = `${BASE}?keywords=${encodeURIComponent(termo)}&geoId=${GEO_ID_BRASIL}${filtroPeriodo(periodoDias)}&start=${pagina * 10}`;
        requests++;
        const r = await buscarTexto(url);
        if (r.status === 429 || r.status === 999 || r.status === 403) {
          bloqueado = true; ultimoErro = `HTTP ${r.status} (bloqueio anti-bot)`;
          break loopKeywords;                       // não insistir: protege o IP
        }
        if (!r.ok) { falhas++; ultimoErro = `HTTP ${r.status}`; continue; }

        const cards = parsearCards(r.body);
        if (cards.length === 0) break;              // fim da paginação desta keyword

        for (const c of cards) {
          if (vistos.has(c.id)) continue;
          vistos.add(c.id);
          const areaReal = classificarArea(c.titulo, [area]) ?? classificarArea(c.titulo, areas);
          if (!areaReal) continue;
          const confidencial = isConfidencial(c.empresa);
          const { cidade, uf, modalidade } = parsearLocal(c.local);
          const slug = c.empresaUrl?.match(/\/company\/([^/?]+)/)?.[1] || null;
          vagas.push({
            fonte:             'linkedin',
            fonte_vaga_id:     c.id,
            vaga_url:          c.url,
            titulo:            c.titulo,
            area:              areaReal,
            keyword_busca:     termo,
            senioridade:       inferirSenioridade(c.titulo),
            regime:            null,
            stack:             null,
            cidade, uf,
            modalidade:        modalidade ?? (/remoto|remote/i.test(c.titulo) ? 'remoto' : null),
            publicado_em:      paraDataISO(c.data),
            empresa_nome:      confidencial ? null : c.empresa,
            empresa_nome_norm: confidencial ? null : normalizarNomeEmpresa(c.empresa),
            empresa_slug:      slug,
            empresa_url:       c.empresaUrl,
            empresa_dominio:   null,
            confidencial,
          });
        }
      }
    }
  }

  return {
    vagas,
    saude: {
      fonte: 'linkedin', ok: !bloqueado && falhas < requests, qtd: vagas.length, ms: Date.now() - t0, requests,
      erro: bloqueado ? ultimoErro : (falhas ? `${falhas}/${requests} requests falharam (${ultimoErro})` : undefined),
      degradada: !bloqueado && falhas === 0 && vagas.length === 0 && areas.includes('tecnologia'),
    },
  };
}
