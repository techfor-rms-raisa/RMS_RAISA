/**
 * useCrmApi.ts — Hook fetcher base do módulo CRM
 *
 * Caminho: src/components/crm/shared/hooks/useCrmApi.ts
 * Versão: 1.0 (Fase 1B — 29/05/2026)
 *
 * Responsabilidade:
 *  - Encapsular as chamadas HTTP do módulo CRM com tratamento
 *    uniforme de erro, loading e parsing.
 *  - Usar o padrão "action-router" já adotado nos endpoints
 *    crm-leads.ts e crm-campanhas.ts (§6.3 do Pre_Projeto v3.1).
 *
 * NÃO chama frontend diretamente — toda lógica de negócio fica
 * nos hooks específicos (useEmpresas, useLeads, useCampanhas...)
 * que serão construídos nas Fases 1C e 1D.
 *
 * Convenção de chamada:
 *   const { get, post } = useCrmApi('/api/crm-leads');
 *   const empresas = await get('listar_empresas', { q: 'foo' });
 *   const nova    = await post('criar_empresa', { nome: 'Acme' });
 *
 * Regra (instrução #12 do projeto): NUNCA chamar Gemini direto
 * do frontend; este hook serve apenas para endpoints internos.
 */

import { useCallback, useState } from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export interface ApiResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  status: number;
}

interface QueryParams {
  [key: string]: string | number | boolean | undefined | null;
}

interface UseCrmApiReturn {
  /** Loading global do último request (não é por ação). */
  loading: boolean;
  /** GET via query string. Action vai como `?action=...`. */
  get: <T = unknown>(action: string, params?: QueryParams) => Promise<ApiResult<T>>;
  /** POST com body JSON. Action vai como `?action=...`. */
  post: <T = unknown>(action: string, body?: unknown) => Promise<ApiResult<T>>;
  /** PATCH com body JSON. */
  patch: <T = unknown>(action: string, body?: unknown) => Promise<ApiResult<T>>;
  /** DELETE com query string. */
  del: <T = unknown>(action: string, params?: QueryParams) => Promise<ApiResult<T>>;
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function buildUrl(base: string, action: string, params?: QueryParams): string {
  const qs = new URLSearchParams();
  qs.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
  }
  return `${base}?${qs.toString()}`;
}

async function parseResponse<T>(resp: Response): Promise<ApiResult<T>> {
  let body: any = null;
  try {
    body = await resp.json();
  } catch {
    // resposta vazia ou não-JSON
  }

  if (!resp.ok) {
    const error =
      (body && (body.error || body.message)) ||
      `Erro ${resp.status} ${resp.statusText}`;
    return { ok: false, data: null, error, status: resp.status };
  }

  return { ok: true, data: body as T, error: null, status: resp.status };
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

/**
 * @param baseUrl URL do endpoint (ex.: '/api/crm-leads').
 *                Pode ser trocado por endpoint, mantendo o mesmo hook.
 */
export function useCrmApi(baseUrl: string): UseCrmApiReturn {
  const [loading, setLoading] = useState(false);

  const request = useCallback(
    async <T,>(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      action: string,
      opts: { params?: QueryParams; body?: unknown } = {}
    ): Promise<ApiResult<T>> => {
      setLoading(true);
      try {
        const url = buildUrl(baseUrl, action, opts.params);
        const init: RequestInit = { method };
        if (opts.body !== undefined && method !== 'GET' && method !== 'DELETE') {
          init.headers = { 'Content-Type': 'application/json' };
          init.body = JSON.stringify(opts.body);
        }
        const resp = await fetch(url, init);
        return await parseResponse<T>(resp);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro de rede';
        return { ok: false, data: null, error: msg, status: 0 };
      } finally {
        setLoading(false);
      }
    },
    [baseUrl]
  );

  const get = useCallback(
    <T,>(action: string, params?: QueryParams) =>
      request<T>('GET', action, { params }),
    [request]
  );

  const post = useCallback(
    <T,>(action: string, body?: unknown) =>
      request<T>('POST', action, { body }),
    [request]
  );

  const patch = useCallback(
    <T,>(action: string, body?: unknown) =>
      request<T>('PATCH', action, { body }),
    [request]
  );

  const del = useCallback(
    <T,>(action: string, params?: QueryParams) =>
      request<T>('DELETE', action, { params }),
    [request]
  );

  return { loading, get, post, patch, del };
}

export default useCrmApi;
