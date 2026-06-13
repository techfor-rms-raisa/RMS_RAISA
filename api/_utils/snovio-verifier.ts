/**
 * SNOV.IO EMAIL VERIFIER — v1.3
 * Fase 2 — Email Recovery Pipeline + Sub-fase 3.A — Camada Gemini
 * Data: 13/06/2026 (v1.3 — correção do parser da resposta v1)
 *
 * v1.3 (13/06/2026) — CORREÇÃO DO PARSER DE RESPOSTA
 *   Diagnóstico via teste direto ao Snov.io revelou o formato REAL da
 *   resposta v1 — diferente do que assumimos na v1.2:
 *
 *   FORMATO REAL (objeto com o email como chave dinâmica):
 *     {
 *       "success": true,
 *       "<email>": {
 *         "status": { "identifier": "in_progress|complete|error", ... },
 *         "data": [] | {
 *           "email": "<email>",
 *           "smtpStatus": "valid|invalid|catch_all|...",
 *           "isCatchall": boolean,
 *           "isDisposable": boolean,
 *           "isGreylist": boolean,
 *           ...
 *         }
 *       }
 *     }
 *
 *   FORMATO ASSUMIDO (errado) na v1.2:
 *     { "data": [{ "email", "result", ... }] }  // não existe
 *
 *   Sem mudanças no shape de retorno do helper para o caller.
 *   Logs v1.1 mantidos integralmente.
 *
 *   ADD response também usa formato com chave dinâmica:
 *     { "success": true, "<email>": { "sent": true } }
 *
 *   Polling típico: 2-3 polls × 2s = 4-6s total por email (medido).
 *
 * v1.2 (13/06/2026) — Endpoint corrigido para API v1 (eram v2 quebrados)
 * v1.1 (13/06/2026) — Logs cirúrgicos em todos os pontos de falha
 * v1.0 (12/06/2026) — Implementação inicial (endpoint v2 estava errado)
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
 *  - Email Verifier consome TOKENS no Snov.io (diferente de Credits/Recipients)
 *  - ~1 token por verificação ($0.004 equivalente)
 *  - Verificação típica: 4-6s total por email
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
    console.error('[snovio-verifier] ❌ ENV VARS AUSENTES — SNOVIO_USER_ID ou SNOVIO_API_SECRET não configurados');
    throw new Error('SNOVIO_USER_ID ou SNOVIO_API_SECRET não configurados');
  }

  // Log defensivo: detectar whitespace ou tamanho anômalo em env vars (sem expor o valor)
  const userIdLen = userId.length;
  const secretLen = apiSecret.length;
  const userIdTrimmed = userId.trim().length === userIdLen;
  const secretTrimmed = apiSecret.trim().length === secretLen;
  console.log(`[snovio-verifier] 🔑 Obtendo token: USER_ID len=${userIdLen} trimmed=${userIdTrimmed}, SECRET len=${secretLen} trimmed=${secretTrimmed}`);

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
    const respText = await res.text();
    console.error(`[snovio-verifier] ❌ AUTH FAIL ${res.status}: ${respText.slice(0, 300)}`);
    throw new Error(`Auth Snov.io falhou: ${res.status} — ${respText}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    console.error(`[snovio-verifier] ❌ AUTH OK mas sem access_token no body: ${JSON.stringify(data).slice(0, 300)}`);
    throw new Error(`Token não retornado: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + 50 * 60 * 1000; // 50min
  console.log(`[snovio-verifier] ✅ Token obtido, válido por 50min`);
  return cachedToken!;
}

// ============================================================================
// VERIFICAÇÃO UNITÁRIA — API v1 do Snov.io
// ============================================================================

/**
 * Verifica um e-mail via Snov.io. Faz 1 chamada add + polling até resultado.
 *
 * Snov.io v1 API (estável, documentada):
 *  1. POST /v1/add-emails-to-verification     body: emails[]=email     → { success, data: [{email, status}] }
 *  2. POST /v1/get-emails-verification-status body: emails[]=email     → { success, data: [{email, result, ...}] }
 *
 * Polling: até 10×2s = 20s máx por verificação.
 * Resultado vazio/ausente = ainda processando → continua polling.
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

    // ════════════════════════════════════════════════════════════════════
    // 1. ADD — POST /v1/add-emails-to-verification
    //    Body: emails[]=email@example.com
    //    Resposta REAL: { success: true, "<email>": { sent: true } }
    // ════════════════════════════════════════════════════════════════════
    const addParams = new URLSearchParams();
    addParams.append('emails[]', emailNormalizado);

    const addRes = await fetch(`${SNOVIO_BASE_URL}/v1/add-emails-to-verification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: addParams.toString(),
    });

    if (!addRes.ok) {
      const errText = await addRes.text();
      console.warn(`[snovio-verifier] ⚠️ ADD_${addRes.status} para ${emailNormalizado}: ${errText.slice(0, 200)}`);
      return {
        email: emailNormalizado,
        valido: false,
        status: 'erro',
        creditos: 0,
        tempo_ms: Date.now() - inicio,
        erro: `ADD_${addRes.status}: ${errText.slice(0, 120)}`,
      };
    }

    const addData = await addRes.json();
    if (addData?.success === false) {
      console.warn(`[snovio-verifier] ⚠️ ADD_API_FAIL para ${emailNormalizado}: ${JSON.stringify(addData).slice(0, 200)}`);
      return {
        email: emailNormalizado,
        valido: false,
        status: 'erro',
        creditos: 0,
        tempo_ms: Date.now() - inicio,
        erro: `ADD_API_FAIL: ${JSON.stringify(addData).slice(0, 120)}`,
      };
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. POLL — POST /v1/get-emails-verification-status
    //    Body: emails[]=email@example.com
    //    Resposta REAL (chave dinâmica = o próprio email):
    //      {
    //        "success": true,
    //        "<email>": {
    //          "status": { "identifier": "in_progress" | "complete" | "error", "description": "..." },
    //          "data": [] | { "email", "smtpStatus", "isCatchall", "isDisposable", "isGreylist", ... }
    //        }
    //      }
    // ════════════════════════════════════════════════════════════════════
    const pollParams = new URLSearchParams();
    pollParams.append('emails[]', emailNormalizado);

    const tInicioPoll = Date.now();
    const intervaloMs = 2000;
    const maxAttempts = Math.ceil(timeoutMs / intervaloMs);

    for (let i = 0; i < maxAttempts; i++) {
      const pollRes = await fetch(`${SNOVIO_BASE_URL}/v1/get-emails-verification-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: pollParams.toString(),
      });

      if (!pollRes.ok) {
        const pollErrText = await pollRes.text();
        console.warn(`[snovio-verifier] ⚠️ POLL_${pollRes.status} para ${emailNormalizado} (tentativa ${i+1}): ${pollErrText.slice(0, 200)}`);
        return {
          email: emailNormalizado,
          valido: false,
          status: 'erro',
          creditos: 0,
          tempo_ms: Date.now() - inicio,
          erro: `POLL_${pollRes.status}: ${pollErrText.slice(0, 120)}`,
        };
      }

      const pollData: any = await pollRes.json();

      // Acessa o item via chave dinâmica = o próprio email
      const item = pollData?.[emailNormalizado];

      if (!item) {
        // Resposta sem o email esperado — pode ser problema no Snov.io
        if (i === 0) {
          // Loga só na primeira tentativa para evitar poluir log
          console.warn(`[snovio-verifier] ⚠️ POLL_SEM_ITEM_EMAIL para ${emailNormalizado}: ${JSON.stringify(pollData).slice(0, 200)}`);
        }
        // continua polling — pode ser delay de propagação
        if (Date.now() - tInicioPoll >= timeoutMs) break;
        await new Promise(r => setTimeout(r, intervaloMs));
        continue;
      }

      const statusIdentifier: string = (item?.status?.identifier || '').toLowerCase();

      // ── Resultado COMPLETO ──
      if (statusIdentifier === 'complete') {
        // data DEVE ser objeto (não array vazio) quando complete
        const verifyData = item?.data;
        if (!verifyData || Array.isArray(verifyData)) {
          console.warn(`[snovio-verifier] ⚠️ COMPLETE_SEM_DATA para ${emailNormalizado}: ${JSON.stringify(item).slice(0, 200)}`);
          return {
            email: emailNormalizado,
            valido: false,
            status: 'erro',
            creditos: 0,
            tempo_ms: Date.now() - inicio,
            erro: 'COMPLETE_SEM_DATA',
          };
        }

        const smtpStatus: string = (verifyData.smtpStatus || '').toString().toLowerCase();
        const isCatchall = verifyData.isCatchall === true;
        const isDisposable = verifyData.isDisposable === true;

        // Mapeamento para o set conhecido
        let statusFinal: VerifierStatus = 'unknown';
        if (isDisposable) {
          statusFinal = 'disposable';
        } else if (isCatchall || smtpStatus === 'catch_all' || smtpStatus === 'accept_all') {
          statusFinal = 'catch_all';
        } else if (smtpStatus === 'valid' || smtpStatus === 'deliverable') {
          statusFinal = 'valid';
        } else if (smtpStatus === 'invalid' || smtpStatus === 'undeliverable') {
          statusFinal = 'invalid';
        } else {
          statusFinal = 'unknown';
        }

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

      // ── Erro definitivo ──
      if (statusIdentifier === 'error' || statusIdentifier === 'failed') {
        console.warn(`[snovio-verifier] ⚠️ TASK_${statusIdentifier} para ${emailNormalizado}: ${JSON.stringify(item).slice(0, 300)}`);
        return {
          email: emailNormalizado,
          valido: false,
          status: 'erro',
          creditos: 0,
          tempo_ms: Date.now() - inicio,
          erro: `TASK_${statusIdentifier}: ${(item?.status?.description || '').slice(0, 80)}`,
        };
      }

      // ── Ainda em progresso (identifier === 'in_progress' | 'pending' | '') ──
      if (Date.now() - tInicioPoll >= timeoutMs) break;
      await new Promise(r => setTimeout(r, intervaloMs));
    }

    // Timeout do polling
    console.warn(`[snovio-verifier] ⚠️ POLL_TIMEOUT para ${emailNormalizado} após ${timeoutMs}ms`);
    return {
      email: emailNormalizado,
      valido: false,
      status: 'erro',
      creditos: 0,
      tempo_ms: Date.now() - inicio,
      erro: 'POLL_TIMEOUT',
    };
  } catch (err: any) {
    console.error(`[snovio-verifier] ❌ EXCEPTION em ${emailNormalizado}: ${err?.message || 'desconhecido'} | stack: ${err?.stack?.slice(0, 300) || 'sem stack'}`);
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
