/**
 * lib/prospect-vagas/vagas-orquestrador.ts
 *
 * Dispara os scrapers selecionados EM PARALELO (Promise.allSettled) e
 * consolida vagas + saúde por fonte. Uma fonte que estoura timeout, cai
 * ou é bloqueada NÃO derruba a busca — ela aparece como `ok: false` na
 * faixa de saúde da UI e as demais seguem.
 *
 * Não toca no banco: persistência é responsabilidade de vagas-persistencia.ts.
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Fonte, FiltrosBusca, SaudeFonte, VagaNormalizada } from './vagas-types.js';
import { rasparGupy } from './vagas-scraper-gupy.js';
import { rasparLinkedIn } from './vagas-scraper-linkedin.js';
import { rasparVagasCom } from './vagas-scraper-vagascom.js';
import { rasparProgramathor } from './vagas-scraper-programathor.js';

export const FONTES_DISPONIVEIS: Fonte[] = ['gupy', 'linkedin', 'vagascom', 'programathor'];

export const FONTE_LABEL: Record<Fonte, string> = {
  gupy: 'Gupy', linkedin: 'LinkedIn Jobs', vagascom: 'Vagas.com', programathor: 'Programathor',
};

export function isFonte(v: string): v is Fonte {
  return (FONTES_DISPONIVEIS as string[]).includes(v);
}

type Raspagem = { vagas: VagaNormalizada[]; saude: SaudeFonte };

function executar(fonte: Fonte, f: FiltrosBusca): Promise<Raspagem> {
  switch (fonte) {
    case 'gupy':         return rasparGupy(f.areas, f.keyword_extra);
    case 'linkedin':     return rasparLinkedIn(f.areas, f.keyword_extra, f.periodo_dias);
    case 'vagascom':     return rasparVagasCom(f.areas, f.keyword_extra);
    case 'programathor': return rasparProgramathor(f.areas, f.keyword_extra);
  }
}

export async function rasparTodasFontes(f: FiltrosBusca): Promise<{ vagas: VagaNormalizada[]; saude: SaudeFonte[] }> {
  const fontes = f.fontes.length ? f.fontes : FONTES_DISPONIVEIS;
  const t0 = Date.now();

  const resultados = await Promise.allSettled(fontes.map(fonte => executar(fonte, f)));

  const vagas: VagaNormalizada[] = [];
  const saude: SaudeFonte[] = [];

  resultados.forEach((r, i) => {
    const fonte = fontes[i];
    if (r.status === 'fulfilled') {
      vagas.push(...r.value.vagas);
      saude.push(r.value.saude);
    } else {
      // exceção não tratada dentro do scraper — registra e segue
      saude.push({ fonte, ok: false, qtd: 0, ms: Date.now() - t0, requests: 0, erro: String(r.reason?.message || r.reason) });
    }
  });

  console.log(`🔎 [vagas-orquestrador] ${vagas.length} vagas em ${Date.now() - t0}ms — ` +
    saude.map(s => `${s.fonte}:${s.ok ? s.qtd : 'ERRO'}`).join(' '));

  return { vagas, saude };
}
