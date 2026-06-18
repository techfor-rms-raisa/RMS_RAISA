/**
 * lib/validate-emails.ts — Cascade de validação de email
 *
 * v1.0 (18/06/2026)
 *
 *   Extrai a lógica de cascade do api/prospect-validate-emails.ts para
 *   permitir uso in-process (sem fetch HTTP) no orquestrador
 *   prospect-revalidate.ts. Elimina o sintoma de HTTP 401 em Preview
 *   causado por Vercel Deployment Protection bloqueando chamadas
 *   cross-function entre endpoints do mesmo deploy.
 *
 *   Cascade preserva comportamento original do endpoint v1.0:
 *     1. Cache local (Supabase prospect_leads.email_status) — custo 0
 *     2. Hunter Email Verifier (1 crédito por chamada)
 *     3. Snov.io Email Verifier (1 token Snov.io, fallback)
 *
 *   Para cada etapa: encerra ao primeiro resultado definitivo (verified,
 *   invalid ou probable). Resultados inconclusivos descem para próxima
 *   etapa. Se nada decidiu, retorna score='risky' e fonte='none'.
 *
 *   MUDANÇAS vs. endpoint v1.0:
 *     - Snov.io agora usa lib/snovio.ts (cache de token compartilhado
 *       entre todos os consumidores Snov.io do projeto)
 *     - Hunter continua inline (lib/hunter.ts é pendência futura — fora
 *       do escopo desta entrega)
 *     - Supabase usa padrão lazy-init (padrão de lib/gemini-confirma-emprego.ts)
 *     - HUNTER_API_KEY com .trim() defensivo (proteção contra \r\n no env)
 *
 *   NÃO LANÇA exceções. Sempre retorna ValidateResult — em pior caso,
 *   score='risky' fonte='none'.
 *
 * Caminho: lib/validate-emails.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { snovioVerifyEmail } from './snovio.js';

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

// ──────────────────────────────────────────────────────────────────────
// SUPABASE — lazy init (padrão de lib/gemini-confirma-emprego.ts)
// ──────────────────────────────────────────────────────────────────────

let supabaseInstance: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return supabaseInstance;
}

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ──────────────────────────────────────────────────────────────────────

export type ValidateScore = 'verified' | 'probable' | 'risky' | 'invalid';
export type ValidateFonte = 'local' | 'hunter' | 'snovio' | 'none';

export interface ValidateInput {
  email:    string;
  /** Nome completo (atualmente não usado no cascade — reservado para uso futuro). */
  nome?:    string | null;
  /** Domínio (atualmente não usado no cascade — reservado para uso futuro). */
  dominio?: string | null;
}

export interface ValidateResult {
  email: string;
  score: ValidateScore;
  fonte: ValidateFonte;
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ──────────────────────────────────────────────────────────────────────

/**
 * ETAPA 1 — Verifica na base local (Supabase prospect_leads.email_status).
 *   Retorna ValidateScore se cache hit definitivo, null se cache miss.
 *   Query preserva comportamento exato do endpoint v1.0.
 */
async function verificarLocal(email: string): Promise<ValidateScore | null> {
  try {
    const { data } = await getSupabase()
      .from('prospect_leads')
      .select('email_status')
      .eq('email', email)
      .not('email_status', 'is', null)
      .limit(1);

    if (data && data.length > 0) {
      const status = String(data[0].email_status || '').toLowerCase();
      if (status === 'valid'      || status === 'deliverable')   return 'verified';
      if (status === 'invalid'    || status === 'undeliverable') return 'invalid';
      if (status === 'accept_all' || status === 'webmail')       return 'probable';
    }
    return null;
  } catch (err: any) {
    console.warn(`⚠️ [validate/local] erro: ${err?.message}`);
    return null;
  }
}

/**
 * ETAPA 2 — Hunter Email Verifier.
 *   Custo: 1 crédito Hunter por chamada.
 *   Retorna ValidateScore se decisão definitiva, null se inconclusivo
 *   (para tentar Snov.io na próxima etapa).
 *
 *   🛡️ HUNTER_API_KEY com .trim() defensivo — protege contra \r\n trailing
 *   no env Vercel (padrão histórico do projeto após `echo "..." | vercel env add`).
 */
async function verificarHunter(email: string): Promise<ValidateScore | null> {
  const apiKey = (process.env.HUNTER_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({ email, api_key: apiKey });
    const res    = await fetch(`${HUNTER_BASE_URL}/email-verifier?${params.toString()}`);

    if (!res.ok) {
      console.warn(`⚠️ [validate/hunter] HTTP ${res.status} para ${email}`);
      return null;
    }

    const json   = await res.json();
    const result = json.data?.result;
    const status = json.data?.status;

    if (result === 'deliverable')                      return 'verified';
    if (result === 'undeliverable')                    return 'invalid';
    if (result === 'risky' || status === 'accept_all') return 'probable';

    return null; // inconclusivo → próxima etapa
  } catch (err: any) {
    console.warn(`⚠️ [validate/hunter] erro: ${err?.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — validarEmailCascade
// ──────────────────────────────────────────────────────────────────────

/**
 * Roda a cascade local → Hunter → Snov.io para validar entregabilidade
 * de um email. Encerra ao primeiro resultado definitivo.
 *
 * Sempre retorna ValidateResult — nunca lança. Em pior caso, score='risky'
 * fonte='none' (nenhum motor conseguiu decidir).
 *
 * Email vazio → retorna risky/none imediatamente, sem consumir nada.
 */
export async function validarEmailCascade(input: ValidateInput): Promise<ValidateResult> {
  const email = input.email;
  if (!email) {
    return { email: '', score: 'risky', fonte: 'none' };
  }

  console.log(`🔍 [validate] ${email}`);

  // ETAPA 1 — cache local
  const local = await verificarLocal(email);
  if (local) {
    console.log(`  📦 Cache local: ${local}`);
    return { email, score: local, fonte: 'local' };
  }

  // ETAPA 2 — Hunter
  const hunter = await verificarHunter(email);
  if (hunter) {
    console.log(`  🎯 Hunter: ${hunter}`);
    return { email, score: hunter, fonte: 'hunter' };
  }

  // ETAPA 3 — Snov.io
  const snovio = await snovioVerifyEmail(email);
  if (snovio) {
    console.log(`  🟣 Snov.io: ${snovio.score} (raw: ${snovio.raw})`);
    return { email, score: snovio.score, fonte: 'snovio' };
  }

  // Sem validação possível
  console.log(`  ⚠️ Sem validação: risky/none`);
  return { email, score: 'risky', fonte: 'none' };
}
