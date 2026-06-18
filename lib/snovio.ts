/**
 * lib/snovio.ts — Cliente Snov.io centralizado
 *
 * v1.0 (18/06/2026)
 *
 *   Extrai e centraliza 3 padrões espalhados em 3 endpoints distintos:
 *     - api/prospect-hunter-enrich.ts   (getSnovioToken + snovioEmailFinder)
 *     - api/prospect-validate-emails.ts (token inline + check-email)
 *     - api/prospect-email-finder.ts    (getSnovioToken + buscarEmailSnovio)
 *
 *   Cada um tinha sua própria cópia de getSnovioToken() com cache local,
 *   resultando em 3 caches separados e 3× mais chamadas OAuth que o
 *   necessário. Esta lib unifica:
 *
 *     - Cache de token único (50min TTL, igual ao original)
 *     - snovioVerifyEmail()      — POST /v1/prospect-list/check-email
 *     - snovioFindEmailByName()  — POST /v2/emails-by-domain-by-name/start + poll
 *
 *   Padrão fail-soft: funções retornam null em qualquer falha (sem token,
 *   HTTP erro, sem dados). Caller decide fallback. Não lança exceções.
 *
 *   Backwards-compat: assinaturas espelham os helpers atuais para que a
 *   migração nos endpoints seja drop-in.
 *
 * Caminho: lib/snovio.ts
 */

const SNOVIO_BASE_URL = 'https://api.snov.io';

// Token cached globalmente no módulo (TTL 50min, igual ao original)
let cachedToken:    string | null = null;
let tokenExpiresAt: number        = 0;

const TOKEN_TTL_MS      = 50 * 60 * 1000;
const POLL_MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS  = 2500;

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ──────────────────────────────────────────────────────────────────────

/** Score normalizado do verificador Snov.io na escala unificada com Hunter/local. */
export type SnovioVerifyScore = 'verified' | 'probable' | 'risky' | 'invalid';

export interface SnovioVerifyResult {
  /** Score normalizado em escala unificada (verified/probable/risky/invalid). */
  score: SnovioVerifyScore;
  /** Status bruto do Snov.io (valid/invalid/catch-all/etc.) — para auditoria. */
  raw:   string;
}

export interface SnovioFindResult {
  email:  string;
  /** smtp_status / status do email retornado pelo Finder. */
  status: string;
}

// ──────────────────────────────────────────────────────────────────────
// OAUTH — token cached
// ──────────────────────────────────────────────────────────────────────

/**
 * Obtém token OAuth do Snov.io (cached por 50min).
 * Retorna null se credenciais ausentes ou falha de auth (fail-soft).
 *
 * Exportado para permitir reuso em testes ou endpoints customizados,
 * mas a maioria dos consumidores deve usar snovioVerifyEmail() ou
 * snovioFindEmailByName() que já cuidam do token internamente.
 */
export async function getSnovioToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now) return cachedToken;

  // 🛡️ v1.0 — .trim() defensivo (proteção contra \r\n trailing no env)
  const userId    = (process.env.SNOVIO_USER_ID    || '').trim();
  const apiSecret = (process.env.SNOVIO_API_SECRET || '').trim();
  if (!userId || !apiSecret) {
    console.warn('⚠️ [snovio] SNOVIO_USER_ID ou SNOVIO_API_SECRET ausentes');
    return null;
  }

  const params = new URLSearchParams();
  params.append('grant_type',    'client_credentials');
  params.append('client_id',     userId);
  params.append('client_secret', apiSecret);

  try {
    const res = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });

    if (!res.ok) {
      console.warn(`⚠️ [snovio] OAuth falhou: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data.access_token) {
      console.warn('⚠️ [snovio] OAuth response sem access_token');
      return null;
    }

    cachedToken    = data.access_token;
    tokenExpiresAt = now + TOKEN_TTL_MS;
    return cachedToken;
  } catch (err: any) {
    console.warn(`⚠️ [snovio] OAuth erro: ${err?.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// VERIFY EMAIL — /v1/prospect-list/check-email
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica um email via Snov.io Email Verifier.
 * Retorna SnovioVerifyResult com score normalizado, ou null em qualquer falha.
 *
 * Normalização (raw → score):
 *   valid|deliverable       → 'verified'
 *   invalid|undeliverable   → 'invalid'
 *   catch-all|unknown|risky → 'probable'
 *   outros                  → 'risky'
 */
export async function snovioVerifyEmail(email: string): Promise<SnovioVerifyResult | null> {
  const token = await getSnovioToken();
  if (!token) return null;

  try {
    const res = await fetch(`${SNOVIO_BASE_URL}/v1/prospect-list/check-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ access_token: token, emails: [email] }),
    });

    if (!res.ok) {
      console.warn(`⚠️ [snovio/verify] HTTP ${res.status} para ${email}`);
      return null;
    }

    const data   = await res.json();
    const result = data.data?.[0] || data.result?.[0];
    if (!result) return null;

    const raw = String(result.status || result.email_status || '').toLowerCase();

    let score: SnovioVerifyScore;
    if (raw === 'valid'    || raw === 'deliverable')   score = 'verified';
    else if (raw === 'invalid'  || raw === 'undeliverable') score = 'invalid';
    else if (raw === 'catch-all' || raw === 'unknown' || raw === 'risky') score = 'probable';
    else                                                                   score = 'risky';

    return { score, raw };
  } catch (err: any) {
    console.warn(`⚠️ [snovio/verify] erro para ${email}: ${err?.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// FIND EMAIL BY NAME — /v2/emails-by-domain-by-name (start + poll)
// ──────────────────────────────────────────────────────────────────────

/**
 * Polling helper interno para /v2/emails-by-domain-by-name/result.
 * Lança Error em falha — quem chama deve capturar.
 */
async function pollResult(url: string, token: string): Promise<any> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`⚠️ [snovio/find] Poll ${i + 1} HTTP ${res.status}`);
      throw new Error(`Poll HTTP ${res.status}`);
    }

    const data   = await res.json();
    const status = data.status || data.meta?.status || data.data?.status;
    console.log(`⏳ [snovio/find] Poll ${i + 1}/${POLL_MAX_ATTEMPTS} — status: "${status}"`);

    const isCompleted = status === 'completed'
                     || (Array.isArray(data.data) && data.data.length > 0);
    if (isCompleted)        return data;
    if (status === 'failed') throw new Error('Task failed');
  }
  throw new Error('Polling timeout');
}

/**
 * Busca email por nome + domínio via Snov.io Email Finder (v2 endpoint).
 * Retorna SnovioFindResult com email + status, ou null em qualquer falha.
 *
 * Custo: 1 crédito Snov.io por email retornado.
 */
export async function snovioFindEmailByName(
  firstName: string,
  lastName:  string,
  domain:    string,
): Promise<SnovioFindResult | null> {
  const token = await getSnovioToken();
  if (!token) return null;

  const params = new URLSearchParams();
  params.append('rows[0][first_name]', firstName);
  params.append('rows[0][last_name]',  lastName);
  params.append('rows[0][domain]',     domain);

  console.log(`📧 [snovio/find] ${firstName} ${lastName} @ ${domain}`);

  try {
    const startRes = await fetch(`${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/start`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!startRes.ok) {
      console.warn(`⚠️ [snovio/find] Start HTTP ${startRes.status}`);
      return null;
    }

    const startData = await startRes.json();

    // Às vezes Snov.io retorna direto com email pronto (sem polling)
    if (startData.data?.[0]?.email) {
      const direct = startData.data[0];
      return {
        email:  direct.email,
        status: direct.smtp_status || direct.status || 'unknown',
      };
    }

    // Extrai taskHash — Snov.io v2 é inconsistente entre versões
    const taskHash = startData.data?.task_hash
                  || startData.meta?.task_hash
                  || startData.data?.[0]?.task_hash
                  || startData.task_hash;

    if (!taskHash) {
      console.warn(`⚠️ [snovio/find] taskHash não encontrado`);
      return null;
    }

    const resultUrl = startData.links?.result
                   || `${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/result?task_hash=${taskHash}`;

    const resultData = await pollResult(resultUrl, token);

    // Estrutura: data[0].emails[0] OU data[0].email_data[0] OU data[0] direto
    const prospect = resultData.data?.[0];
    if (!prospect) return null;

    const emailEntry = prospect.emails?.[0] || prospect.email_data?.[0] || prospect;
    const email      = emailEntry?.email || prospect.email;
    if (!email) {
      console.log(`ℹ️ [snovio/find] Sem email para ${firstName} ${lastName}`);
      return null;
    }

    return {
      email,
      status: emailEntry.smtp_status || emailEntry.email_status || emailEntry.status || 'unknown',
    };
  } catch (err: any) {
    console.warn(`⚠️ [snovio/find] erro: ${err?.message}`);
    return null;
  }
}
