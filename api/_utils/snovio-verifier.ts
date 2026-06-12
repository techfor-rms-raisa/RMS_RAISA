/**
 * SNOV.IO EMAIL VERIFIER — v1.0
 * Fase 2 — Email Recovery Pipeline
 * Data: 12/06/2026
 *
 * Helper para verificar se um endereço de e-mail é válido via Snov.io
 * Email Verifier API. Diferente do prospect-snovio-search.ts (que busca
 * prospects POR DOMÍNIO), este helper valida UM endereço específico.
 *
 * Reutiliza:
 *  - Mesmas env vars: SNOVIO_USER_ID + SNOVIO_API_SECRET
 *  - Mesmo padrão OAuth client_credentials
 *  - Cache de token (50min)
 *
 * USO:
 *   import { verificarEmail } from './_utils/snovio-verifier';
 *   const r = await verificarEmail('luis.cavanha@riachuelo.com.br');
 *   // → { valido: true, status: 'valid', creditos: 1, tempo_ms: 1234 }
 *
 *   import { verificarLote } from './_utils/snovio-verifier';
 *   const lote = await verificarLote(['e1@x.com', 'e2@x.com'], 3);
 *
 * CUSTO:
 *  - 1 crédito Snov.io (~$0.004) por verificação
 *  - Tarefa em background no Snov.io: 1-3s típicos por verificação
 *
 * INTERPRETAÇÃO DOS STATUS:
 *  - 'valid'      → entregável (alta confiança)
 *  - 'invalid'    → não existe (rejeição definitiva)
 *  - 'catch_all'  → domínio aceita TUDO (não confirma o e-mail específico)
 *  - 'unknown'    → não foi possível verificar (servidor lento, etc.)
 *  - 'disposable' → e-mail temporário (mailinator, etc.)
 *
 * NO RECOVERY:
 *  - 'valid'                → aceita
 *  - 'catch_all'            → aceita com WARNING (configurável via flag)
 *  - 'invalid' / 'unknown' / 'disposable' → rejeita
 */

const SNOVIO_BASE_URL = 'https://api.snov.io';

// ============================================================================
// TIPOS
// ============================================================================

export type VerifierStatus = 'valid' | 'invalid' | 'catch_all' | 'unknown' | 'disposable';

export interface VerifierResult {
  email: string;
  valido: boolean;
  status: VerifierStatus | 'erro';
  creditos: number; // 0 em caso de erro, 1 caso contrário
  tempo_ms: number;
  erro?: string;
}

export interface VerifierOptions {
  /** Aceitar catch_all como "válido" (default: false — mais conservador) */
  aceitarCatchAll?: boolean;
  /** Timeout total de polling (ms). Default: 30000 (30s) */
  timeout_ms?: number;
}

// ============================================================================
// CACHE DE TOKEN OAUTH (independente do prospect-snovio-search)
// ============================================================================

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function obterToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const userId = process.env.SNOVIO_USER_ID;
  const apiSecret = process.env.SNOVIO_API_SECRET;
  if (!userId || !apiSecret) {
    throw new Error('SNOVIO_USER_ID ou SNOVIO_API_SECRET não configurados');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', userId);
  params.append('client_secret', apiSecret);

  const res = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Auth Snov.io falhou: ${res.status} — ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token não retornado: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + 50 * 60 * 1000; // 50min
  return cachedToken!;
}

// ============================================================================
// VERIFICAÇÃO UNITÁRIA — POST /v2/email-verifier
// ============================================================================

/**
 * Verifica um e-mail via Snov.io. Faz 1 chamada start + polling até resultado.
 *
 * Snov.io v2 API:
 *  1. POST /v2/emails-verifier/start  body: { email }      → { task_hash }
 *  2. GET  /v2/emails-verifier/result/:task_hash           → { status, data: { result, ... } }
 *
 * Polling: até 10×2s = 20s máx por verificação.
 */
export async function verificarEmail(
  email: string,
  options: VerifierOptions = {}
): Promise<VerifierResult> {
  const inicio = Date.now();
  const emailNormalizado = (email || '').toLowerCase().trim();

  // Sanitização básica
  if (!emailNormalizado || !emailNormalizado.includes('@') || emailNormalizado.length > 254) {
    return {
      email: emailNormalizado,
      valido: false,
      status: 'erro',
      creditos: 0,
      tempo_ms: Date.now() - inicio,
      erro: 'EMAIL_FORMATO_INVALIDO',
    };
  }

  const aceitarCatchAll = options.aceitarCatchAll ?? false;
  const timeoutMs = options.timeout_ms ?? 30000;

  try {
    const token = await obterToken();

    // 1. START — POST com body urlencoded
    const params = new URLSearchParams();
    params.append('email', emailNormalizado);

    const startRes = await fetch(`${SNOVIO_BASE_URL}/v2/emails-verifier/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      return {
        email: emailNormalizado,
        valido: false,
        status: 'erro',
        creditos: 0,
        tempo_ms: Date.now() - inicio,
        erro: `START_${startRes.status}: ${errText.slice(0, 120)}`,
      };
    }

    const startData = await startRes.json();
    const taskHash = startData?.meta?.task_hash || startData?.data?.task_hash;
    if (!taskHash) {
      return {
        email: emailNormalizado,
        valido: false,
        status: 'erro',
        creditos: 0,
        tempo_ms: Date.now() - inicio,
        erro: `SEM_TASK_HASH: ${JSON.stringify(startData).slice(0, 120)}`,
      };
    }

    // 2. POLL — GET result até concluído ou timeout
    const resultUrl =
      startData?.links?.result || `${SNOVIO_BASE_URL}/v2/emails-verifier/result/${taskHash}`;
    const tInicioPoll = Date.now();
    const intervaloMs = 2000;
    const maxAttempts = Math.ceil(timeoutMs / intervaloMs);

    for (let i = 0; i < maxAttempts; i++) {
      const pollRes = await fetch(resultUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!pollRes.ok) {
        return {
          email: emailNormalizado,
          valido: false,
          status: 'erro',
          creditos: 0,
          tempo_ms: Date.now() - inicio,
          erro: `POLL_${pollRes.status}: ${(await pollRes.text()).slice(0, 120)}`,
        };
      }

      const pollData = await pollRes.json();
      const taskStatus = pollData?.status || pollData?.data?.status;

      if (taskStatus === 'completed') {
        // Resultado consolidado em data.result
        const result: string = (
          pollData?.data?.result ||
          pollData?.data?.verification_status ||
          pollData?.data?.smtp_status ||
          'unknown'
        ).toLowerCase();

        // Normalizar para o set conhecido
        let statusFinal: VerifierStatus = 'unknown';
        if (result === 'valid' || result === 'deliverable') statusFinal = 'valid';
        else if (result === 'invalid' || result === 'undeliverable') statusFinal = 'invalid';
        else if (result === 'catch_all' || result === 'accept_all' || result === 'catchall') {
          statusFinal = 'catch_all';
        } else if (result === 'disposable') statusFinal = 'disposable';
        else statusFinal = 'unknown';

        const valido =
          statusFinal === 'valid' || (aceitarCatchAll && statusFinal === 'catch_all');

        return {
          email: emailNormalizado,
          valido,
          status: statusFinal,
          creditos: 1,
          tempo_ms: Date.now() - inicio,
        };
      }

      if (taskStatus === 'failed' || taskStatus === 'error') {
        return {
          email: emailNormalizado,
          valido: false,
          status: 'erro',
          creditos: 0,
          tempo_ms: Date.now() - inicio,
          erro: `TASK_${taskStatus}`,
        };
      }

      // Ainda em progresso (status === 'in_progress' | 'started')
      if (Date.now() - tInicioPoll >= timeoutMs) break;
      await new Promise(r => setTimeout(r, intervaloMs));
    }

    // Timeout do polling
    return {
      email: emailNormalizado,
      valido: false,
      status: 'erro',
      creditos: 0,
      tempo_ms: Date.now() - inicio,
      erro: 'POLL_TIMEOUT',
    };
  } catch (err: any) {
    return {
      email: emailNormalizado,
      valido: false,
      status: 'erro',
      creditos: 0,
      tempo_ms: Date.now() - inicio,
      erro: err?.message?.slice(0, 200) || 'ERRO_DESCONHECIDO',
    };
  }
}

// ============================================================================
// VERIFICAÇÃO EM LOTE (early-exit ao encontrar primeiro válido)
// ============================================================================

/**
 * Verifica múltiplos e-mails em paralelo (concorrência controlada) e PARA
 * assim que encontra o primeiro válido. Otimização chave do Recovery:
 * economiza créditos Snov.io.
 *
 * NÃO usa Promise.all clássico — usa um worker pool manual para conseguir
 * early-exit (Promise.all não permite cancelar irmãos em flight).
 *
 * Default: concorrência 3 (Snov.io tem rate limit razoável; mais alto pode
 * causar 429 e desperdiçar créditos em retries).
 */
export async function verificarLoteAteValido(
  emails: string[],
  options: VerifierOptions & { concorrencia?: number } = {}
): Promise<{
  encontrado: VerifierResult | null;
  todos: VerifierResult[];
  creditos_totais: number;
}> {
  const concorrencia = options.concorrencia ?? 3;
  const todos: VerifierResult[] = [];
  let encontrado: VerifierResult | null = null;
  let creditosTotais = 0;

  let i = 0;
  const inFlight = new Set<Promise<void>>();

  const lancarUm = (idx: number) => {
    const email = emails[idx];
    const p = verificarEmail(email, options).then(r => {
      todos.push(r);
      creditosTotais += r.creditos;
      if (r.valido && !encontrado) {
        encontrado = r;
      }
    });
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
  };

  // Iniciar até `concorrencia` workers
  while (i < emails.length && inFlight.size < concorrencia && !encontrado) {
    lancarUm(i++);
  }

  // Drain enquanto não encontrou e ainda há trabalho
  while (inFlight.size > 0 && !encontrado) {
    await Promise.race(inFlight);
    while (i < emails.length && inFlight.size < concorrencia && !encontrado) {
      lancarUm(i++);
    }
  }

  // Drain final do que está em flight (mesmo que já achou, esperar finalizar
  // para não deixar promises órfãs em background)
  if (inFlight.size > 0) {
    await Promise.allSettled(Array.from(inFlight));
  }

  return { encontrado, todos, creditos_totais: creditosTotais };
}

/**
 * Modo "exaustivo": verifica TODOS os e-mails da lista (não para no primeiro).
 * Usado pela Validação em Lote pré-campanha (F7) onde queremos o resultado
 * completo da base, não apenas o primeiro válido.
 */
export async function verificarLoteCompleto(
  emails: string[],
  options: VerifierOptions & { concorrencia?: number } = {}
): Promise<{ todos: VerifierResult[]; creditos_totais: number }> {
  const concorrencia = options.concorrencia ?? 3;
  const todos: VerifierResult[] = [];
  let creditosTotais = 0;

  for (let i = 0; i < emails.length; i += concorrencia) {
    const batch = emails.slice(i, i + concorrencia);
    const resultados = await Promise.all(batch.map(e => verificarEmail(e, options)));
    todos.push(...resultados);
    creditosTotais += resultados.reduce((s, r) => s + r.creditos, 0);
  }

  return { todos, creditos_totais: creditosTotais };
}
