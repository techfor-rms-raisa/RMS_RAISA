/**
 * api/prospect-validate-emails.ts
 * 
 * Validação de email em cascata (para de gastar ao confirmar):
 * 1. Base local: prospect_leads com email já verificado (custo 0)
 * 2. Hunter Email Verifier (1 crédito)
 * 3. Snov.io Email Verifier (fallback)
 * 
 * Retorna score: verified | probable | risky | invalid
 * 
 * Versão: 1.0
 * Data: 18/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 15 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

type EmailScore = 'verified' | 'probable' | 'risky' | 'invalid';

// ─── ETAPA 1: Verificar na base local ───
async function verificarLocal(email: string): Promise<EmailScore | null> {
  const { data } = await supabase
    .from('prospect_leads')
    .select('email_status')
    .eq('email', email)
    .not('email_status', 'is', null)
    .limit(1);

  if (data && data.length > 0) {
    const status = data[0].email_status?.toLowerCase();
    if (status === 'valid' || status === 'deliverable') return 'verified';
    if (status === 'invalid' || status === 'undeliverable') return 'invalid';
    if (status === 'accept_all' || status === 'webmail') return 'probable';
  }
  return null; // não encontrado no cache
}

// ─── ETAPA 2: Hunter Email Verifier ───
async function verificarHunter(email: string): Promise<{ score: EmailScore | null; result?: string }> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { score: null };

  try {
    const params = new URLSearchParams({ email, api_key: apiKey });
    const resp = await fetch(`${HUNTER_BASE_URL}/email-verifier?${params.toString()}`);
    
    if (!resp.ok) {
      console.warn(`⚠️ [validate] Hunter retornou ${resp.status} para ${email}`);
      return { score: null };
    }

    const json = await resp.json();
    const result = json.data?.result;
    const status = json.data?.status;

    if (result === 'deliverable') return { score: 'verified', result };
    if (result === 'undeliverable') return { score: 'invalid', result };
    if (result === 'risky' || status === 'accept_all') return { score: 'probable', result };
    
    return { score: null, result }; // inconclusivo → tentar Snov.io
  } catch (err: any) {
    console.warn(`⚠️ [validate] Hunter erro para ${email}:`, err.message);
    return { score: null };
  }
}

// ─── ETAPA 3: Snov.io Email Verifier ───
async function verificarSnovio(email: string): Promise<EmailScore | null> {
  const userId = process.env.SNOVIO_USER_ID;
  const apiSecret = process.env.SNOVIO_API_SECRET;
  if (!userId || !apiSecret) return null;

  try {
    // Obter token
    const tokenResp = await fetch('https://api.snov.io/v1/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: userId, client_secret: apiSecret })
    });
    if (!tokenResp.ok) return null;
    const tokenData = await tokenResp.json();
    const token = tokenData.access_token;
    if (!token) return null;

    // Verificar email
    const verifyResp = await fetch('https://api.snov.io/v1/prospect-list/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, emails: [email] })
    });

    if (!verifyResp.ok) return null;
    const verifyData = await verifyResp.json();
    
    // Snov.io retorna status no array
    const emailResult = verifyData.data?.[0] || verifyData.result?.[0];
    if (!emailResult) return null;

    const snovStatus = (emailResult.status || emailResult.email_status || '').toLowerCase();
    if (snovStatus === 'valid' || snovStatus === 'deliverable') return 'verified';
    if (snovStatus === 'invalid' || snovStatus === 'undeliverable') return 'invalid';
    if (snovStatus === 'catch-all' || snovStatus === 'unknown') return 'probable';

    return null;
  } catch (err: any) {
    console.warn(`⚠️ [validate] Snov.io erro para ${email}:`, err.message);
    return null;
  }
}

// ─── HANDLER ───
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, nome, dominio } = req.body;
    if (!email) return res.status(400).json({ error: 'email é obrigatório' });

    console.log(`🔍 [validate] Validando: ${email}`);

    // Cascata: para ao primeiro resultado definitivo
    // 1. Base local
    const localScore = await verificarLocal(email);
    if (localScore) {
      console.log(`  📦 Cache local: ${localScore}`);
      return res.status(200).json({ email, score: localScore, fonte: 'local' });
    }

    // 2. Hunter
    const { score: hunterScore } = await verificarHunter(email);
    if (hunterScore) {
      console.log(`  🎯 Hunter: ${hunterScore}`);
      return res.status(200).json({ email, score: hunterScore, fonte: 'hunter' });
    }

    // 3. Snov.io
    const snovScore = await verificarSnovio(email);
    if (snovScore) {
      console.log(`  🟣 Snov.io: ${snovScore}`);
      return res.status(200).json({ email, score: snovScore, fonte: 'snovio' });
    }

    // Nenhuma API conseguiu validar → marcar como arriscado
    console.log(`  ⚠️ Sem validação: risky`);
    return res.status(200).json({ email, score: 'risky' as EmailScore, fonte: 'none' });

  } catch (error: any) {
    console.error('❌ [validate]:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro interno' });
  }
}
