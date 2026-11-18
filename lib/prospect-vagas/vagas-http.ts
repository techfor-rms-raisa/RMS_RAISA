/**
 * lib/prospect-vagas/vagas-http.ts
 *
 * Cliente HTTP mínimo e defensivo para os scrapers:
 *   • timeout por request (AbortController) — uma fonte lenta não trava a busca
 *   • User-Agent de navegador (sem isso Gupy/LinkedIn devolvem 403/HTML vazio)
 *   • NUNCA envia cookie/credencial — regra "sem login" do módulo
 *   • `pausa()` para espaçar requests ao LinkedIn (mitiga 429)
 *
 * Versão: 1.0 — 18/10/2026
 */

export const TIMEOUT_FONTE_MS = 8_000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface RespostaHttp {
  ok:      boolean;
  status:  number;
  body:    string;
  ms:      number;
}

export async function buscarTexto(url: string, extraHeaders: Record<string, string> = {}, timeoutMs = TIMEOUT_FONTE_MS): Promise<RespostaHttp> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...extraHeaders,
      },
    });
    const body = await resp.text();
    return { ok: resp.ok, status: resp.status, body, ms: Date.now() - t0 };
  } catch (err: any) {
    const timeout = err?.name === 'AbortError';
    return { ok: false, status: timeout ? 408 : 0, body: '', ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function buscarJson<T = any>(url: string, timeoutMs = TIMEOUT_FONTE_MS): Promise<{ ok: boolean; status: number; data: T | null; ms: number }> {
  const r = await buscarTexto(url, { 'Accept': 'application/json' }, timeoutMs);
  if (!r.ok) return { ok: false, status: r.status, data: null, ms: r.ms };
  try {
    return { ok: true, status: r.status, data: JSON.parse(r.body) as T, ms: r.ms };
  } catch {
    return { ok: false, status: r.status, data: null, ms: r.ms };
  }
}

export const pausa = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
