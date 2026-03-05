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
 * Versão: 1.1
 * Data: 05/03/2026
 * v1.1: + Company Enrichment (/companies/find) + Email Verifier (/email-verifier)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    if (!d?.email) {
        console.log(`ℹ️ [Hunter/Finder] Email não encontrado para ${firstName} ${lastName}`);
        return null;
    }

    console.log(`✅ [Hunter/Finder] ${d.email} (score: ${d.score}, status: ${d.status})`);

    return {
        email:       d.email,
        score:       d.score       || 0,
        status:      d.status      || 'unknown',
        first_name:  d.first_name  || null,
        last_name:   d.last_name   || null,
        position:    d.position    || null,
        linkedin_url: d.linkedin   || null,
    };
}

// ─── Domain Search: todos os emails conhecidos de um domínio ──────────
async function hunterDomainSearch(
    domain:  string,
    apiKey:  string,
    limit:   number = 20
): Promise<HunterDomainEmail[]> {

    const params = new URLSearchParams({
        domain,
        limit:   String(limit),
        type:    'personal',  // ignora info@, suporte@, etc.
        api_key: apiKey,
    });

    console.log(`🔍 [Hunter/Domain] Domínio: ${domain} (limit: ${limit})`);

    const res = await fetch(`${HUNTER_BASE_URL}/domain-search?${params.toString()}`);

    if (res.status === 429) {
        console.warn('⚠️ [Hunter/Domain] Rate limit atingido');
        return [];
    }
    if (!res.ok) {
        const body = await res.text();
        console.error(`❌ [Hunter/Domain] ${res.status}: ${body.substring(0, 200)}`);
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

    // Converter size range "1001-5000" → número (maior valor do range)
    let sizeNumber: number | null = null;
    if (d.size) {
        const nums = String(d.size).match(/\d+/g);
        sizeNumber = nums ? parseInt(nums[nums.length - 1]) : null;
    }

    console.log(`✅ [Hunter/Company] ${d.name} | ${d.industry} | porte: ${d.size}`);

    return {
        name:         d.name         || null,
        domain:       d.domain       || domain,
        industry:     d.industry     || null,
        size:         d.size         || null,
        size_number:  sizeNumber,
        country:      d.country      || null,
        state:        d.state        || null,
        city:         d.city         || null,
        linkedin_url: d.linkedin_url || null,
        website:      d.website      || null,
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

        // ── MODE 2: Email Finder Individual ───────────────────────────
        if (mode === 'email_finder') {
            if (!primeiro_nome) {
                return res.status(400).json({ error: 'primeiro_nome obrigatório para email_finder.' });
            }
            const result = await hunterEmailFinder(primeiro_nome, ultimo_nome || '', domain, apiKey);
            if (result) {
                return res.status(200).json({
                    success:      true,
                    email:        result.email,
                    email_status: result.status,
                    score:        result.score,
                    linkedin_url: result.linkedin_url,
                    motor:        'hunter',
                });
            }
            return res.status(200).json({ success: false, email: null, email_status: 'not_found', motor: 'hunter' });
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

        // ETAPA 2: Domain Search — 1 crédito, retorna até 50 emails conhecidos
        const domainEmails = await hunterDomainSearch(domain, apiKey, 50);
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
                            linkedin_url: prospect.linkedin_url || found.linkedin_url || null,
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

            // Sem email — mantém dados da empresa enriquecidos
            enriched.push({
                ...prospect,
                ...empresaEnriquecida,
                email:        null,
                email_status: 'not_found',
                email_score:  0,
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
