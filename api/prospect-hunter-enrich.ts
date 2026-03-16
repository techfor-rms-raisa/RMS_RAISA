/**
 * api/prospect-hunter-enrich.ts
 *
 * PROSPECT ENGINE v2.0 — Enriquecimento de Email via Hunter.io
 * Substitui: prospect-apollo-search.ts (função de enriquecimento de email)
 *
 * Endpoints Hunter.io utilizados:
 * 1. GET /v2/domain-search      — busca emails conhecidos do domínio (1 crédito = até 10 emails)
 * 2. GET /v2/email-finder       — busca email por nome + domínio (1 crédito por tentativa)
 * 3. GET /v2/email-verifier     — verifica se email é válido antes de salvar (1 crédito)
 * 4. GET /v2/companies/find     — enriquece dados da empresa: setor, porte, sede (1 crédito)
 *
 * Plano Starter Hunter.io: 2.000 créditos/mês (~$49)
 * Taxa de enriquecimento: ~32,5% (benchmark 2025)
 * Custo/email válido: ~$0,085
 *
 * Versão: 1.2
 * Data: 15/03/2026
 * v1.1: + Company Enrichment (/companies/find) + Email Verifier (/email-verifier)
 * v1.2: + Snov.io fallback no enrich_list (MODE 5) — Hunter → Snov.io → not_found
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Timeout estendido: Company Enrichment + verificação podem somar ~15s ──
export const config = {
    maxDuration: 30,
};

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

// ─── Tipos Hunter.io ─────────────────────────────────────────────────
interface HunterEmailFinder {
    email:        string | null;
    score:        number;         // 0–100, confiança do email
    status:       'valid' | 'invalid' | 'unknown' | 'accept_all';
    first_name:   string | null;
    last_name:    string | null;
    position:     string | null;
    linkedin_url: string | null;
}

interface HunterDomainEmail {
    value:      string;
    type:       'personal' | 'generic';
    confidence: number;
    first_name: string | null;
    last_name:  string | null;
    position:   string | null;
    linkedin:   string | null;
}

interface HunterCompany {
    name:         string | null;
    domain:       string | null;
    industry:     string | null;    // setor da empresa
    size:         string | null;    // ex: "1001-5000"
    size_number:  number | null;    // valor numérico do tamanho
    country:      string | null;
    state:        string | null;
    city:         string | null;
    linkedin_url: string | null;
    website:      string | null;
    description:  string | null;
}

interface HunterVerification {
    result:  'deliverable' | 'undeliverable' | 'risky' | 'unknown';
    score:   number;
    regexp:  boolean;
    gibberish: boolean;
    disposable: boolean;
    webmail: boolean;
    mx_records: boolean;
    smtp_server: boolean;
    smtp_check:  boolean;
}

// ─── Email Finder: nome + domínio → email específico ─────────────────
async function hunterEmailFinder(
    firstName:  string,
    lastName:   string,
    domain:     string,
    apiKey:     string
): Promise<HunterEmailFinder | null> {

    const params = new URLSearchParams({
        first_name: firstName,
        last_name:  lastName,
        domain,
        api_key:    apiKey,
    });

    console.log(`📧 [Hunter/Finder] ${firstName} ${lastName} @ ${domain}`);

    const res = await fetch(`${HUNTER_BASE_URL}/email-finder?${params.toString()}`);

    if (res.status === 429) {
        console.warn('⚠️ [Hunter/Finder] Rate limit atingido');
        return null;
    }
    if (!res.ok) {
        const body = await res.text();
        console.error(`❌ [Hunter/Finder] ${res.status}: ${body.substring(0, 200)}`);
        return null;
    }

    const data = await res.json();
    const d = data?.data;

    // Log raw para diagnóstico de campos desconhecidos
    console.log(`📦 [Hunter/Finder] Raw keys: ${Object.keys(d || {}).join(', ')}`);

    if (!d?.email) {
        console.log(`ℹ️ [Hunter/Finder] Email não encontrado para ${firstName} ${lastName}`);
        return null;
    }

    // Hunter.io v2: status real está em d.verification.status (confirmado pelo Raw keys)
    // Fallback para campos alternativos por segurança
    const emailStatus = d.verification?.status || d.verification?.result || d.status || d.result || 'unknown';

    console.log(`✅ [Hunter/Finder] ${d.email} (score: ${d.score}, status: ${emailStatus})`);

    return {
        email:        d.email,
        score:        d.score        || 0,
        status:       emailStatus,
        first_name:   d.first_name   || null,
        last_name:    d.last_name    || null,
        position:     d.position     || null,
        linkedin_url: d.linkedin     || d.linkedin_url || null,
    };
}

// ─── Domain Search: todos os emails conhecidos de um domínio ──────────
async function hunterDomainSearch(
    domain:  string,
    apiKey:  string,
    limit:   number = 10   // plano Starter: máximo 10 por requisição
): Promise<HunterDomainEmail[]> {

    // Respeita o limite do plano: máximo 10 no Starter
    const safeLimit = Math.min(limit, 10);

    const params = new URLSearchParams({
        domain,
        limit:   String(safeLimit),
        type:    'personal',  // ignora info@, suporte@, etc.
        api_key: apiKey,
    });

    console.log(`🔍 [Hunter/Domain] Domínio: ${domain} (limit: ${safeLimit})`);

    const res = await fetch(`${HUNTER_BASE_URL}/domain-search?${params.toString()}`);

    if (res.status === 429) {
        console.warn('⚠️ [Hunter/Domain] Rate limit atingido');
        return [];
    }
    if (!res.ok) {
        const body = await res.text();
        console.error(`❌ [Hunter/Domain] ${res.status}: ${body.substring(0, 200)}`);
        // Retorna vazio mas não quebra o pipeline
        return [];
    }

    const data = await res.json();
    const emails: any[] = data?.data?.emails || [];

    console.log(`✅ [Hunter/Domain] ${emails.length} emails encontrados para ${domain}`);

    return emails.map((e: any) => ({
        value:      e.value,
        type:       e.type || 'personal',
        confidence: e.confidence || 0,
        first_name: e.first_name || null,
        last_name:  e.last_name  || null,
        position:   e.position   || null,
        linkedin:   e.linkedin   || null,
    }));
}

// ─── Company Enrichment: setor, porte, sede da empresa ───────────────
async function hunterCompanyEnrich(
    domain: string,
    apiKey: string
): Promise<HunterCompany | null> {

    const params = new URLSearchParams({ domain, api_key: apiKey });
    console.log(`🏢 [Hunter/Company] Enriquecendo empresa: ${domain}`);

    const res = await fetch(`${HUNTER_BASE_URL}/companies/find?${params.toString()}`);

    if (res.status === 429) {
        console.warn('⚠️ [Hunter/Company] Rate limit atingido');
        return null;
    }
    if (!res.ok) {
        const body = await res.text();
        console.error(`❌ [Hunter/Company] ${res.status}: ${body.substring(0, 200)}`);
        return null;
    }

    const data = await res.json();
    const d = data?.data;
    if (!d) return null;

    // Log raw para diagnóstico de estrutura real da API
    console.log(`📦 [Hunter/Company] Raw keys: ${Object.keys(d).join(', ')}`);

    // Hunter API: d.category é objeto {sector, industryGroup, industry, subIndustry}
    // d.metrics contém employeesRange, estimatedAnnualRevenue, etc.
    const categoryObj = d.category || {};
    const industry = (
        categoryObj.industry        ||   // "Internet Software & Services"
        categoryObj.sector          ||   // "Information Technology"
        categoryObj.industryGroup   ||   // "Software & Services"
        d.industry                  ||
        d.sector                    ||
        null
    );

    // size está em d.metrics.employeesRange ex: "10001+"
    const metricsObj = d.metrics || {};
    const sizeRaw = metricsObj.employeesRange || metricsObj.employees || d.size || d.headcount || null;
    // linkedin está em d.linkedin.handle, site em d.site.url
    const linkedinHandle = d.linkedin?.handle || null;
    const linkedinRaw    = linkedinHandle
        ? `https://www.linkedin.com/company/${linkedinHandle}`
        : d.linkedin_url || null;
    const websiteRaw = d.site?.url || d.website || null;

    // Converter size range "1001-5000" → número (maior valor do range)
    let sizeNumber: number | null = null;
    if (sizeRaw) {
        const nums = String(sizeRaw).match(/\d+/g);
        sizeNumber = nums ? parseInt(nums[nums.length - 1]) : null;
    }

    console.log(`✅ [Hunter/Company] ${d.name} | industry: ${industry} | size: ${sizeRaw}`);

    return {
        name:         d.name         || null,
        domain:       d.domain       || domain,
        industry,
        size:         sizeRaw ? String(sizeRaw) : null,
        size_number:  sizeNumber,
        country:      d.country      || null,
        state:        d.state        || null,
        city:         d.city         || null,
        linkedin_url: linkedinRaw,
        website:      websiteRaw,
        description:  d.description  || null,
    };
}

// ─── Email Verifier: confirma entregabilidade antes de salvar ─────────
async function hunterEmailVerifier(
    email:  string,
    apiKey: string
): Promise<HunterVerification | null> {

    const params = new URLSearchParams({ email, api_key: apiKey });
    console.log(`🔍 [Hunter/Verifier] Verificando: ${email}`);

    const res = await fetch(`${HUNTER_BASE_URL}/email-verifier?${params.toString()}`);

    if (res.status === 429) {
        console.warn('⚠️ [Hunter/Verifier] Rate limit atingido');
        return null;
    }
    if (!res.ok) {
        const body = await res.text();
        console.error(`❌ [Hunter/Verifier] ${res.status}: ${body.substring(0, 200)}`);
        return null;
    }

    const data = await res.json();
    const d = data?.data;
    if (!d) return null;

    console.log(`✅ [Hunter/Verifier] ${email} → ${d.result} (score: ${d.score})`);

    return {
        result:      d.result      || 'unknown',
        score:       d.score       || 0,
        regexp:      d.regexp      ?? false,
        gibberish:   d.gibberish   ?? false,
        disposable:  d.disposable  ?? false,
        webmail:     d.webmail     ?? false,
        mx_records:  d.mx_records  ?? false,
        smtp_server: d.smtp_server ?? false,
        smtp_check:  d.smtp_check  ?? false,
    };
}

// ─── Busca LinkedIn no Domain Search por nome (mesmo sem email) ───────
function buscarLinkedinNoDomainSearch(
    firstName:    string,
    lastName:     string,
    domainEmails: HunterDomainEmail[]
): string | null {
    const fnNorm = firstName.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const lnNorm = lastName.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

    // Busca exata primeiro
    const exact = domainEmails.find(e => {
        const eFn = (e.first_name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
        const eLn = (e.last_name  || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
        return eFn === fnNorm && eLn === lnNorm;
    });
    if (exact?.linkedin) return exact.linkedin;

    // Busca por primeiro nome apenas (fallback)
    const partial = domainEmails.find(e => {
        const eFn = (e.first_name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
        return eFn === fnNorm && e.linkedin;
    });
    return partial?.linkedin || null;
}

// ─── Cruzamento: tenta casar prospect Gemini com email do Domain Search ─
function cruzarComDomainSearch(
    firstName:    string,
    lastName:     string,
    domainEmails: HunterDomainEmail[]
): HunterDomainEmail | null {
    const fnNorm = firstName.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const lnNorm = lastName.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

    return domainEmails.find(e => {
        const eFn = (e.first_name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
        const eLn = (e.last_name  || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
        return eFn === fnNorm && eLn === lnNorm;
    }) || null;
}


// ─── Snov.io: fallback quando Hunter não encontra email ──────────────
let snovCachedToken: string | null = null;
let snovTokenExpiresAt = 0;

async function getSnovioToken(): Promise<string | null> {
    const now = Date.now();
    if (snovCachedToken && snovTokenExpiresAt > now) return snovCachedToken;
    const userId    = process.env.SNOVIO_USER_ID;
    const apiSecret = process.env.SNOVIO_API_SECRET;
    if (!userId || !apiSecret) return null;
    const params = new URLSearchParams();
    params.append('grant_type',    'client_credentials');
    params.append('client_id',     userId);
    params.append('client_secret', apiSecret);
    const res = await fetch('https://api.snov.io/v1/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    snovCachedToken    = data.access_token;
    snovTokenExpiresAt = now + 50 * 60 * 1000;
    return snovCachedToken!;
}

async function snovioEmailFinder(
    firstName: string,
    lastName:  string,
    domain:    string
): Promise<{ email: string; status: string } | null> {
    const token = await getSnovioToken();
    if (!token) {
        console.warn(`⚠️ [Snov.io/Finder] Token não obtido — verifique SNOVIO_USER_ID e SNOVIO_API_SECRET`);
        return null;
    }
    const params = new URLSearchParams();
    params.append('rows[0][first_name]', firstName);
    params.append('rows[0][last_name]',  lastName);
    params.append('rows[0][domain]',     domain);
    console.log(`📧 [Snov.io/Finder] Iniciando busca: ${firstName} ${lastName} @ ${domain}`);

    const startRes = await fetch('https://api.snov.io/v2/emails-by-domain-by-name/start', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!startRes.ok) {
        console.error(`❌ [Snov.io/Finder] Start falhou: ${startRes.status} ${await startRes.text()}`);
        return null;
    }

    const startData = await startRes.json();
    console.log(`📦 [Snov.io/Finder] Start response: ${JSON.stringify(startData).substring(0, 300)}`);

    // Às vezes retorna direto sem polling
    if (startData.data?.[0]?.email) {
        console.log(`✅ [Snov.io/Finder] Email direto: ${startData.data[0].email}`);
        return { email: startData.data[0].email, status: startData.data[0].smtp_status || 'unknown' };
    }

    // Extrai taskHash — Snov.io v2 retorna {"data":{"task_hash":"..."},"meta":{...}}
    // data é objeto simples, não array
    const taskHash = startData.data?.task_hash      // ← estrutura real confirmada
                  || startData.meta?.task_hash
                  || startData.data?.[0]?.task_hash  // fallback array (versões antigas)
                  || startData.task_hash;

    if (!taskHash) {
        console.warn(`⚠️ [Snov.io/Finder] taskHash não encontrado. Keys: ${Object.keys(startData).join(', ')} | data: ${JSON.stringify(startData.data)}`);
        return null;
    }

    console.log(`⏳ [Snov.io/Finder] taskHash: ${taskHash} — iniciando polling...`);

    const resultUrl = `https://api.snov.io/v2/emails-by-domain-by-name/result?task_hash=${taskHash}`;

    // Poll até 8x com 2.5s de intervalo (20s total)
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const pollRes = await fetch(resultUrl, { headers: { 'Authorization': `Bearer ${token}` } });

        if (!pollRes.ok) {
            console.warn(`⚠️ [Snov.io/Finder] Poll ${i+1} HTTP ${pollRes.status}`);
            break;
        }

        const pollData = await pollRes.json();
        // Log compacto do poll para diagnóstico
        const pollStatus = pollData.status || pollData.meta?.status || pollData.data?.status || 'unknown';
        console.log(`⏳ [Snov.io/Finder] Poll ${i+1}/8 — status: "${pollStatus}" | raw: ${JSON.stringify(pollData).substring(0, 200)}`);

        // Verificar status em múltiplos locais (Snov.io não é consistente entre versões)
        const isCompleted = pollStatus === 'completed'
                         || pollData.meta?.status === 'completed'
                         || Array.isArray(pollData.data) && pollData.data.length > 0;

        if (isCompleted) {
            // Tentar extrair email de múltiplas estruturas possíveis
            const row       = pollData.data?.[0];
            const emailEntry = row?.emails?.[0] || row?.email_data?.[0] || row;
            const email      = emailEntry?.email || row?.email;

            if (email) {
                console.log(`✅ [Snov.io/Finder] Email encontrado: ${email}`);
                return { email, status: emailEntry?.smtp_status || emailEntry?.status || 'unknown' };
            }

            console.log(`ℹ️ [Snov.io/Finder] Completo mas sem email. Data: ${JSON.stringify(pollData.data).substring(0, 200)}`);
            break;
        }

        if (pollStatus === 'failed') {
            console.warn(`❌ [Snov.io/Finder] Task falhou`);
            break;
        }
    }

    console.log(`ℹ️ [Snov.io/Finder] Email não encontrado para ${firstName} ${lastName}`);
    return null;
}

// ─── HANDLER ─────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const apiKey = process.env.HUNTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'HUNTER_API_KEY não configurada.' });
    }

    const {
        mode,           // 'domain_search' | 'email_finder' | 'email_verifier' | 'company_enrich' | 'enrich_list'
        domain,
        prospects,      // array — usado no mode 'enrich_list'
        primeiro_nome,  // string — usado no mode 'email_finder'
        ultimo_nome,
        email,          // string — usado no mode 'email_verifier'
        verificar_emails = false,  // boolean — no enrich_list, verifica emails encontrados (consome créditos extras)
        supabase_id,    // number — id do registro em prospect_leads para UPDATE após encontrar email
    } = req.body;

    if (!domain && mode !== 'email_verifier') {
        return res.status(400).json({ error: 'domain é obrigatório.' });
    }

    try {
        // ── MODE 1: Domain Search ──────────────────────────────────────
        if (mode === 'domain_search') {
            const emails = await hunterDomainSearch(domain, apiKey, 30);
            return res.status(200).json({ success: true, emails, total: emails.length });
        }

        // ── MODE 2: Email Finder Individual (Hunter → Snov.io fallback) ────
        if (mode === 'email_finder') {
            if (!primeiro_nome) {
                return res.status(400).json({ error: 'primeiro_nome obrigatório para email_finder.' });
            }

            // Tentativa 1: Hunter.io
            let emailResult: { email: string | null; status: string; score?: number; linkedin_url?: string | null; motor: string } | null = null;
            const hunterResult = await hunterEmailFinder(primeiro_nome, ultimo_nome || '', domain, apiKey);
            if (hunterResult?.email) {
                emailResult = {
                    email:        hunterResult.email,
                    status:       hunterResult.status,
                    score:        hunterResult.score,
                    linkedin_url: hunterResult.linkedin_url,
                    motor:        'hunter',
                };
            }

            // Tentativa 2: Snov.io fallback
            if (!emailResult) {
                console.log(`🔄 [EmailFinder] Hunter não encontrou — tentando Snov.io...`);
                const snovResult = await snovioEmailFinder(primeiro_nome, ultimo_nome || '', domain);
                if (snovResult?.email) {
                    emailResult = {
                        email:        snovResult.email,
                        status:       snovResult.status,
                        score:        undefined,
                        linkedin_url: null,
                        motor:        'snovio',
                    };
                }
            }

            if (emailResult?.email) {
                // UPDATE no Supabase se supabase_id foi fornecido
                if (supabase_id) {
                    const { error: upErr } = await supabase
                        .from('prospect_leads')
                        .update({
                            email:       emailResult.email,
                            email_status: emailResult.status,
                            motor:       emailResult.motor === 'snovio' ? 'gemini+hunter' : emailResult.motor,
                            enriquecido: true,
                            atualizado_em: new Date().toISOString(),
                        })
                        .eq('id', supabase_id);
                    if (upErr) console.error('⚠️ [EmailFinder] UPDATE Supabase falhou:', upErr.message);
                    else console.log(`💾 [EmailFinder] Supabase atualizado — id ${supabase_id}`);
                }

                return res.status(200).json({
                    success:      true,
                    email:        emailResult.email,
                    email_status: emailResult.status,
                    score:        emailResult.score || 0,
                    linkedin_url: emailResult.linkedin_url || null,
                    motor:        emailResult.motor,
                });
            }

            return res.status(200).json({ success: false, email: null, email_status: 'not_found', motor: null });
        }

        // ── MODE 3: Email Verifier ─────────────────────────────────────
        if (mode === 'email_verifier') {
            if (!email) {
                return res.status(400).json({ error: 'email obrigatório para email_verifier.' });
            }
            const verification = await hunterEmailVerifier(email, apiKey);
            if (verification) {
                return res.status(200).json({
                    success:        true,
                    result:         verification.result,    // deliverable | undeliverable | risky | unknown
                    score:          verification.score,
                    is_deliverable: verification.result === 'deliverable',
                    details:        verification,
                });
            }
            return res.status(200).json({ success: false, result: 'unknown' });
        }

        // ── MODE 4: Company Enrichment ────────────────────────────────
        if (mode === 'company_enrich') {
            const company = await hunterCompanyEnrich(domain, apiKey);
            if (company) {
                return res.status(200).json({ success: true, company });
            }
            return res.status(200).json({ success: false, company: null });
        }

        // ── MODE 5: Enrich List (padrão) ───────────────────────────────
        // Fluxo completo: Domain Search + Email Finder + Company Enrichment opcional
        if (!Array.isArray(prospects) || prospects.length === 0) {
            return res.status(400).json({ error: 'prospects[] obrigatório para enrich_list.' });
        }

        console.log(`🔄 [Hunter/Enrich] Iniciando pipeline para ${prospects.length} prospects (${domain})`);

        // ETAPA 1: Company Enrichment — 1 crédito, enriquece todos os prospects
        const company = await hunterCompanyEnrich(domain, apiKey);
        let creditosUsados = company ? 1 : 0;

        // ETAPA 2: Domain Search — 1 crédito, retorna até 10 emails (limite do plano Starter)
        const domainEmails = await hunterDomainSearch(domain, apiKey, 10);
        if (domainEmails.length > 0) creditosUsados++;

        // ETAPA 3: Para cada prospect, tenta cruzar ou usar Email Finder
        const enriched = [];

        for (const prospect of prospects) {
            const fn = prospect.primeiro_nome || '';
            const ln = prospect.ultimo_nome   || '';

            // Dados da empresa enriquecidos pelo Company Enrichment
            const empresaEnriquecida = company ? {
                empresa_setor:   company.industry     || prospect.empresa_setor,
                empresa_porte:   company.size_number  || prospect.empresa_porte,
                empresa_linkedin: company.linkedin_url || prospect.empresa_linkedin,
                empresa_website:  company.website      || prospect.empresa_website,
                cidade:  prospect.cidade  || company.city    || null,
                estado:  prospect.estado  || company.state   || null,
                pais:    prospect.pais    || company.country || null,
            } : {};

            // Tentativa 1: cruzamento com Domain Search (sem custo adicional)
            const match = cruzarComDomainSearch(fn, ln, domainEmails);
            if (match && match.value) {
                // Verificação opcional do email encontrado
                let emailStatus = match.confidence >= 70 ? 'valid' : 'unknown';
                if (verificar_emails) {
                    const verification = await hunterEmailVerifier(match.value, apiKey);
                    creditosUsados++;
                    if (verification) {
                        emailStatus = verification.result === 'deliverable' ? 'valid'
                                    : verification.result === 'undeliverable' ? 'invalid'
                                    : 'unknown';
                    }
                }
                enriched.push({
                    ...prospect,
                    ...empresaEnriquecida,
                    email:        match.value,
                    email_status: emailStatus,
                    email_score:  match.confidence,
                    linkedin_url: prospect.linkedin_url || match.linkedin || null,
                    enriquecido:  true,
                    motor_email:  'hunter_domain',
                });
                console.log(`✅ [Hunter/Enrich] Domain match: ${fn} ${ln} → ${match.value}`);
                continue;
            }

            // Tentativa 2: Email Finder (1 crédito por pessoa)
            if (fn && ln) {
                try {
                    const found = await hunterEmailFinder(fn, ln, domain, apiKey);
                    creditosUsados++;

                    if (found?.email) {
                        // Verificação opcional
                        let emailStatus = found.status;
                        if (verificar_emails) {
                            const verification = await hunterEmailVerifier(found.email, apiKey);
                            creditosUsados++;
                            if (verification) {
                                emailStatus = verification.result === 'deliverable' ? 'valid'
                                            : verification.result === 'undeliverable' ? 'invalid'
                                            : found.status;
                            }
                        }
                        enriched.push({
                            ...prospect,
                            ...empresaEnriquecida,
                            email:        found.email,
                            email_status: emailStatus,
                            email_score:  found.score,
                            // Email Finder retorna campo 'linkedin' (não linkedin_url) — normalizar
                            linkedin_url: prospect.linkedin_url
                                       || (found as any).linkedin
                                       || found.linkedin_url
                                       || buscarLinkedinNoDomainSearch(fn, ln, domainEmails)
                                       || null,
                            enriquecido:  true,
                            motor_email:  'hunter_finder',
                        });
                        console.log(`✅ [Hunter/Enrich] Finder: ${fn} ${ln} → ${found.email} (${found.score})`);
                        continue;
                    }
                } catch (e) {
                    console.warn(`⚠️ [Hunter/Enrich] Finder falhou para ${fn} ${ln}:`, e);
                }
            }

            // Tentativa 3: Snov.io fallback (quando Hunter não encontrou)
            if (fn && ln) {
                try {
                    console.log(`🔄 [Hunter/Enrich] Hunter sem resultado — tentando Snov.io para ${fn} ${ln}...`);
                    const snovResult = await snovioEmailFinder(fn, ln, domain);
                    if (snovResult?.email) {
                        enriched.push({
                            ...prospect,
                            ...empresaEnriquecida,
                            email:        snovResult.email,
                            email_status: snovResult.status,
                            email_score:  0,
                            linkedin_url: prospect.linkedin_url
                                       || buscarLinkedinNoDomainSearch(fn, ln, domainEmails)
                                       || null,
                            enriquecido:  true,
                            motor_email:  'snovio',
                        });
                        console.log(`✅ [Snov.io/Enrich] ${fn} ${ln} → ${snovResult.email}`);
                        continue;
                    }
                } catch (e) {
                    console.warn(`⚠️ [Snov.io/Enrich] Falhou para ${fn} ${ln}:`, e);
                }
            }

            // Sem email em nenhum motor — mantém dados da empresa enriquecidos + tenta LinkedIn do domain search
            enriched.push({
                ...prospect,
                ...empresaEnriquecida,
                email:        null,
                email_status: 'not_found',
                email_score:  0,
                linkedin_url: prospect.linkedin_url
                           || buscarLinkedinNoDomainSearch(fn, ln, domainEmails)
                           || null,
                enriquecido:  false,
                motor_email:  null,
            });
        }

        const comEmail = enriched.filter(p => p.email).length;
        const semEmail = enriched.length - comEmail;

        console.log(`✅ [Hunter/Enrich] Pipeline concluído:`);
        console.log(`   ${comEmail} com email | ${semEmail} sem email`);
        console.log(`   Créditos Hunter usados: ${creditosUsados}`);
        console.log(`   Empresa: ${company?.name || domain} | Setor: ${company?.industry || 'N/A'} | Porte: ${company?.size || 'N/A'}`);

        return res.status(200).json({
            success:             true,
            resultados:          enriched,
            total:               enriched.length,
            com_email:           comEmail,
            sem_email:           semEmail,
            creditos_consumidos: creditosUsados,
            motor:               'hunter',
            empresa_enriquecida: company || null,
        });

    } catch (error: any) {
        console.error('❌ [Hunter/Enrich] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao enriquecer via Hunter.io',
        });
    }
}
