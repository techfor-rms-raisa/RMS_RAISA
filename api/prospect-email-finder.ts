/**
 * api/prospect-email-finder.ts
 *
 * PROSPECT DUAL ENGINE — Email Finder Individual
 * Busca email de um prospect específico via nome + domínio
 *
 * Estratégia:
 * 1. Tenta Snov.io Email Finder (/v2/emails-by-domain-by-name/start)
 * 2. Se não encontrar, tenta Apollo People Match como fallback
 *
 * Custo: 1 crédito Snov.io por email encontrado
 *
 * Versão: 1.0
 * Data: 04/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SNOVIO_BASE_URL = 'https://api.snov.io';
const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Cache de token Snov.io
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getSnovioToken(): Promise<string | null> {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) return cachedToken;

    const userId    = process.env.SNOVIO_USER_ID;
    const apiSecret = process.env.SNOVIO_API_SECRET;
    if (!userId || !apiSecret) return null;

    const params = new URLSearchParams();
    params.append('grant_type',    'client_credentials');
    params.append('client_id',     userId);
    params.append('client_secret', apiSecret);

    const res = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;

    cachedToken    = data.access_token;
    tokenExpiresAt = now + (50 * 60 * 1000);
    return cachedToken!;
}

async function pollResult(url: string, token: string, maxAttempts = 8, intervalMs = 2500): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Poll ${res.status}`);

        const data = await res.json();
        console.log(`⏳ [EmailFinder] Poll ${i + 1}/${maxAttempts} — status: ${data.status}`);

        if (data.status === 'completed') return data;
        if (data.status === 'failed')    throw new Error('Task failed');

        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Timeout');
}

/**
 * Snov.io Email Finder: nome + domínio → email verificado
 * Endpoint: POST /v2/emails-by-domain-by-name/start
 * Custo: 1 crédito por email encontrado
 */
async function buscarEmailSnovio(
    firstName: string,
    lastName: string,
    domain: string
): Promise<{ email: string; status: string } | null> {
    const token = await getSnovioToken();
    if (!token) return null;

    const params = new URLSearchParams();
    params.append('rows[0][first_name]', firstName);
    params.append('rows[0][last_name]',  lastName);
    params.append('rows[0][domain]',     domain);

    console.log(`📧 [EmailFinder/Snov.io] Buscando: ${firstName} ${lastName} @ ${domain}`);

    const startRes = await fetch(`${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/start`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });

    if (!startRes.ok) {
        const err = await startRes.text();
        console.error(`❌ [EmailFinder/Snov.io] Start ${startRes.status}: ${err}`);
        return null;
    }

    const startData = await startRes.json();
    console.log(`📦 [EmailFinder/Snov.io] Start RAW:`, JSON.stringify(startData).substring(0, 400));

    const taskHash = startData.meta?.task_hash || startData.data?.[0]?.task_hash;
    if (!taskHash) {
        // Às vezes retorna direto com status completed
        if (startData.status === 'completed' || startData.data?.[0]?.email) {
            const email = startData.data?.[0]?.email;
            const status = startData.data?.[0]?.smtp_status || 'unknown';
            if (email) return { email, status };
        }
        return null;
    }

    const resultUrl = startData.links?.result ||
        `${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/result/${taskHash}`;

    const resultData = await pollResult(resultUrl, token);
    console.log(`📦 [EmailFinder/Snov.io] Result RAW:`, JSON.stringify(resultData).substring(0, 400));

    // Estrutura: data[0].emails[0].email
    const prospect = resultData.data?.[0];
    if (!prospect) return null;

    const emailEntry = prospect.emails?.[0] || prospect;
    const email = emailEntry.email || prospect.email;
    if (!email) return null;

    return {
        email,
        status: emailEntry.smtp_status || emailEntry.email_status || 'unknown'
    };
}

/**
 * Apollo People Match: nome + domínio → email
 * Custo: 1 crédito Apollo
 */
async function buscarEmailApollo(
    firstName: string,
    lastName: string,
    domain: string,
    organizationName?: string
): Promise<{ email: string; status: string } | null> {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return null;

    const params = new URLSearchParams();
    params.append('first_name', firstName);
    params.append('last_name',  lastName);
    params.append('domain',     domain);
    if (organizationName) params.append('organization_name', organizationName);
    params.append('reveal_personal_emails', 'false');

    console.log(`📧 [EmailFinder/Apollo] Buscando: ${firstName} ${lastName} @ ${domain}`);

    const res = await fetch(`${APOLLO_BASE_URL}/people/match?${params.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'accept': 'application/json',
            'x-api-key': apiKey
        }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const person = data.person;
    if (!person?.email) return null;

    return {
        email:  person.email,
        status: person.email_status || 'unknown'
    };
}

// ============================================
// HANDLER
// ============================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const {
        primeiro_nome,
        ultimo_nome,
        domain,
        empresa_nome,
        fonte_original   // 'apollo' | 'snovio' — para escolher motor alternativo
    } = req.body;

    if (!primeiro_nome || !domain) {
        return res.status(400).json({ error: 'primeiro_nome e domain são obrigatórios' });
    }

    try {
        let resultado: { email: string; status: string; motor: string } | null = null;

        // Estratégia: sempre tenta Snov.io primeiro (mais preciso para emails B2B),
        // depois Apollo como fallback
        if (fonte_original !== 'snovio') {
            // Prospect veio do Apollo → tentar Snov.io primeiro
            const snovioResult = await buscarEmailSnovio(primeiro_nome, ultimo_nome || '', domain);
            if (snovioResult) {
                resultado = { ...snovioResult, motor: 'snovio' };
            }
        }

        if (!resultado) {
            // Tentar Apollo (funciona para prospects do Snov.io ou fallback)
            const apolloResult = await buscarEmailApollo(primeiro_nome, ultimo_nome || '', domain, empresa_nome);
            if (apolloResult) {
                resultado = { ...apolloResult, motor: 'apollo' };
            }
        }

        if (!resultado && fonte_original === 'apollo') {
            // Última tentativa: Snov.io para prospect que veio do Apollo
            const snovioResult = await buscarEmailSnovio(primeiro_nome, ultimo_nome || '', domain);
            if (snovioResult) {
                resultado = { ...snovioResult, motor: 'snovio' };
            }
        }

        if (resultado) {
            console.log(`✅ [EmailFinder] Email encontrado via ${resultado.motor}: ${resultado.email}`);
            return res.status(200).json({
                success: true,
                email:        resultado.email,
                email_status: resultado.status,
                motor:        resultado.motor
            });
        }

        return res.status(200).json({
            success: false,
            email:        null,
            email_status: 'not_found',
            motor:        null
        });

    } catch (error: any) {
        console.error('❌ [EmailFinder] Erro:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
