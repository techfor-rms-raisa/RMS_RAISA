/**
 * lib/prospect-vagas/vagas-scraper-gupy.ts
 *
 * FONTE: Gupy — API JSON pública do portal (sem login).
 *   GET https://portal.gupy.io/api/job-search/jobs?jobName=<kw>&limit=100&offset=0
 *   → { data: [{ id, name, careerPageName, careerPageUrl, jobUrl, city, state,
 *                workplaceType ('remote'|'hybrid'|'on-site'), publishedDate,
 *                applicationDeadline, type, ... }], pagination: { total, limit, offset } }
 *
 * Descoberta validada em 18/10/2026 (o endpoint antigo portal.api.gupy.io/api/v1/jobs
 * retorna 404 — foi substituído por este, que é o mesmo que a página usa).
 *
 * Particularidade: `careerPageName` pode ser slogan → nomeEmpresaGupy() usa o
 * subdomínio de jobUrl como identificador canônico (fcamara.gupy.io → "Fcamara").
 *
 * Confiabilidade: ALTA (JSON contratual, não HTML). 1 request por keyword.
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Area, SaudeFonte, VagaNormalizada } from './vagas-types.js';
import { AREAS, classificarArea } from './vagas-areas.js';
import { buscarJson } from './vagas-http.js';
import {
  inferirSenioridade, isConfidencial, modalidadeGupy, nomeEmpresaGupy,
  normalizarNomeEmpresa, paraDataISO, paraUF,
} from './vagas-normalizar.js';

const BASE = 'https://portal.gupy.io/api/job-search/jobs';
const LIMIT = 100;

interface GupyJob {
  id: number;
  name: string;
  careerPageName: string;
  careerPageUrl?: string;
  jobUrl: string;
  city?: string;
  state?: string;
  workplaceType?: string;
  publishedDate?: string;
  type?: string;
}

export async function rasparGupy(areas: Area[], keywordExtra: string | null): Promise<{ vagas: VagaNormalizada[]; saude: SaudeFonte }> {
  const t0 = Date.now();
  const vagas: VagaNormalizada[] = [];
  const vistos = new Set<string>();     // a mesma vaga volta em várias keywords
  let requests = 0;
  let falhas = 0;
  let ultimoErro: string | undefined;

  // keyword extra (ex.: "Java") refina: busca "java" dentro de cada área? Não —
  // Gupy busca por jobName livre; combinamos "<keyword da área> <extra>".
  for (const area of areas) {
    for (const kw of AREAS[area].keywords) {
      const termo = keywordExtra ? `${kw} ${keywordExtra}` : kw;
      const url = `${BASE}?jobName=${encodeURIComponent(termo)}&limit=${LIMIT}&offset=0`;
      requests++;
      const r = await buscarJson<{ data: GupyJob[] }>(url);
      if (!r.ok || !r.data?.data) { falhas++; ultimoErro = `HTTP ${r.status}`; continue; }

      for (const j of r.data.data) {
        if (!j?.id || !j?.name || !j?.jobUrl) continue;
        if (vistos.has(String(j.id))) continue;
        vistos.add(String(j.id));
        // revalida área pelo título (Gupy devolve ruído, ex.: "Governanta")
        const areaReal = classificarArea(j.name, [area]) ?? classificarArea(j.name, areas);
        if (!areaReal) continue;

        const { nome, slug } = nomeEmpresaGupy(j.careerPageName, j.jobUrl);
        const confidencial = isConfidencial(nome);
        vagas.push({
          fonte:             'gupy',
          fonte_vaga_id:     String(j.id),
          vaga_url:          j.jobUrl.split('?')[0],
          titulo:            j.name.trim(),
          area:              areaReal,
          keyword_busca:     termo,
          senioridade:       inferirSenioridade(j.name),
          regime:            j.type === 'vacancy_type_effective' ? 'CLT' : null,
          stack:             null,
          cidade:            j.city?.trim() || null,
          uf:                paraUF(j.state) ,
          modalidade:        modalidadeGupy(j.workplaceType),
          publicado_em:      paraDataISO(j.publishedDate),
          empresa_nome:      confidencial ? null : nome,
          empresa_nome_norm: confidencial ? null : normalizarNomeEmpresa(nome),
          empresa_slug:      slug,
          empresa_url:       slug ? `https://${slug}.gupy.io` : (j.careerPageUrl || null),
          empresa_dominio:   null,
          confidencial,
        });
      }
    }
  }

  return {
    vagas,
    saude: {
      fonte: 'gupy', ok: falhas < requests, qtd: vagas.length, ms: Date.now() - t0, requests,
      erro: falhas ? `${falhas}/${requests} requests falharam (${ultimoErro})` : undefined,
      degradada: falhas === 0 && vagas.length === 0 && areas.includes('tecnologia'),
    },
  };
}
