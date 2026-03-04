/**
 * api/prospect-snovio-search.ts
 * 
 * PROSPECT DUAL ENGINE — Motor Snov.io
 * Busca prospects por domínio via Domain Search API
 * 
 * FLUXO CORRETO (v1.3):
 * ┌─────────────────────────────────────────────────────────┐
 * │ FASE A — Empresa + Contagem                             │
 * │  POST /v2/domain-search/start {domain}                  │
 * │  GET  /v2/domain-search/result/{task_hash}              │
 * │  → Retorna: company_name, industry, size, links{}       │
 * │    links.prospects = URL para FASE B                    │
 * ├─────────────────────────────────────────────────────────┤
 * │ FASE B — Lista de Prospects                             │
 * │  POST /v2/domain-search/prospects/start                 │
 * │       {domain, page, positions[]}                       │
 * │  → Aguardar até status="completed" (polling)            │
 * │  GET  /v2/domain-search/prospects/result/{task_hash}    │
 * │  → Retorna: prospects[] com first_name, last_name,      │
 * │    position, source_page (LinkedIn)                     │
 * ├─────────────────────────────────────────────────────────┤
 * │ FASE C (opcional) — Email por Prospect                  │
 * │  POST /v2/domain-search/prospects/search-emails/start   │
 * │  GET  /v2/domain-search/prospects/search-emails/result/ │
 * └─────────────────────────────────────────────────────────┘
 *
 * PROBLEMA IDENTIFICADO NO LOG (04/03/2026):
 * - Prospects Start retorna data:[] imediatamente com task_hash
 * - O polling pega o resultado ANTES de estar processado
 * - Causa: não aguardamos o status "completed" corretamente
 * - FIX: polling robusto com até 15 tentativas e 3s de intervalo
 *        + fallback para buscar prospects sem filtro de posições
 *        caso o filtro retorne 0 resultados
 *
 * Versão: 1.3
 * Data: 04/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Garante maxDuration mesmo se vercel.json não cobrir este arquivo
export const config = { maxDuration: 60 };


const SNOVIO_BASE_URL = 'https://api.snov.io';

// ============================================
// CACHE DE TOKEN (memória serverless)
// ============================================
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

// ============================================
// MAPEAMENTO DE DEPARTAMENTOS → POSIÇÕES
// ============================================
const DEPARTAMENTO_POSICOES: Record<string, string[]> = {
    'ti_tecnologia':        ['CTO', 'CIO', 'IT Director', 'IT Manager', 'Gerente de TI', 'Diretor de TI', 'Head of Technology'],
    'compras_procurement':  ['CPO', 'Procurement Director', 'Purchasing Manager', 'Diretor de Compras', 'Gerente de Compras'],
    'infraestrutura':       ['Infrastructure Director', 'Infrastructure Manager', 'Diretor de Infraestrutura', 'Gerente de Infraestrutura'],
    'governanca_compliance':['Compliance Officer', 'Governance Director', 'Diretor de Governança', 'Gerente de Governança'],
    'rh_recursos_humanos':  ['CHRO', 'HR Director', 'HR Manager', 'Diretor de RH', 'Gerente de RH', 'Head of People'],
    'comercial_vendas':     ['CSO', 'Sales Director', 'Sales Manager', 'Diretor Comercial', 'Gerente Comercial'],
    'financeiro':           ['CFO', 'Finance Director', 'Finance Manager', 'Diretor Financeiro', 'Gerente Financeiro'],
    'diretoria_clevel':     ['CEO', 'COO', 'CTO', 'CFO', 'CIO', 'President', 'Presidente', 'Vice President', 'VP', 'Diretor Geral']
};

// ============================================
// AUTENTICAÇÃO
// ============================================
async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) {
        console.log('🔑 [Snov.io] Token em cache válido');
        return cachedToken;
    }

    const userId   = process.env.SNOVIO_USER_ID;
    const apiSecret = process.env.SNOVIO_API_SECRET;
    if (!userId || !apiSecret) {
        throw new Error('SNOVIO_USER_ID ou SNOVIO_API_SECRET não configurados');
    }

    const params = new URLSearchParams();
    params.append('grant_type',    'client_credentials');
    params.append('client_id',     userId);
    params.append('client_secret', apiSecret);

    const res = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Snov.io auth failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    if (!data.access_token) {
        throw new Error(`Token não retornado: ${JSON.stringify(data)}`);
    }

    cachedToken    = data.access_token;
    tokenExpiresAt = now + (50 * 60 * 1000); // 50 min cache
    console.log('🔑 [Snov.io] Novo token obtido');
    return cachedToken!;
}

// ============================================
// POLLING ROBUSTO
// Aumentado para 15 tentativas com 3s de intervalo
// para dar tempo ao Snov.io processar domínios grandes
// ============================================
async function pollForResult(
    url: string,
    token: string,
    maxAttempts: number = 8,
    intervalMs: number = 2000
): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Poll falhou ${res.status}: ${err}`);
        }

        const data = await res.json();
        console.log(`⏳ [Snov.io] Poll ${i + 1}/${maxAttempts} — status: "${data.status}" — dados: ${JSON.stringify(data).substring(0, 200)}`);

        if (data.status === 'completed') return data;
        if (data.status === 'failed')    throw new Error(`Task failed: ${JSON.stringify(data)}`);

        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Snov.io timeout após ${maxAttempts} tentativas`);
}

// ============================================
// BUSCA DE PROSPECTS (com fallback sem filtro)
// ============================================
async function buscarProspects(
    token: string,
    domain: string,
    posicoes: string[],
    prospectsStartUrl: string
): Promise<{ prospects: any[]; totalCount: number }> {

    // --- Tentativa 1: com filtro de posições ---
    const params = new URLSearchParams();
    params.append('domain', domain);
    params.append('page', '1');
    for (const pos of posicoes.slice(0, 10)) {
        params.append('positions[]', pos);
    }

    console.log(`🔍 [Snov.io] POST ${prospectsStartUrl} | params: ${params.toString()}`);

    const startRes = await fetch(prospectsStartUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });

    if (!startRes.ok) {
        const err = await startRes.text();
        throw new Error(`Prospects Start ${startRes.status}: ${err}`);
    }

    const startData = await startRes.json();
    console.log(`📦 [Snov.io] Prospects Start RAW:`, JSON.stringify(startData).substring(0, 600));

    // Obter task_hash para polling
    const taskHash = startData.meta?.task_hash;
    if (!taskHash) {
        throw new Error(`Sem task_hash nos prospects. RAW: ${JSON.stringify(startData)}`);
    }

    // Polling no resultado
    const resultUrl = startData.links?.result ||
        `${SNOVIO_BASE_URL}/v2/domain-search/prospects/result/${taskHash}`;
    console.log(`🔗 [Snov.io] Polling prospects em: ${resultUrl}`);

    const resultData = await pollForResult(resultUrl, token);
    console.log(`📦 [Snov.io] Prospects Result RAW:`, JSON.stringify(resultData).substring(0, 1000));

    let prospects = extrairProspects(resultData);
    let totalCount = resultData.meta?.total_count || resultData.meta?.count || prospects.length;

    // --- Fallback: sem filtro de posições se retornou 0 ---
    if (prospects.length === 0 && posicoes.length > 0) {
        console.log(`⚠️ [Snov.io] 0 prospects com filtro de posições. Tentando sem filtro...`);

        const paramsSemFiltro = new URLSearchParams();
        paramsSemFiltro.append('domain', domain);
        paramsSemFiltro.append('page', '1');

        const startRes2 = await fetch(prospectsStartUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: paramsSemFiltro.toString()
        });

        if (startRes2.ok) {
            const startData2 = await startRes2.json();
            console.log(`📦 [Snov.io] Prospects Start (sem filtro) RAW:`, JSON.stringify(startData2).substring(0, 600));

            const taskHash2 = startData2.meta?.task_hash;
            if (taskHash2) {
                const resultUrl2 = startData2.links?.result ||
                    `${SNOVIO_BASE_URL}/v2/domain-search/prospects/result/${taskHash2}`;
                const resultData2 = await pollForResult(resultUrl2, token);
                console.log(`📦 [Snov.io] Prospects Result (sem filtro) RAW:`, JSON.stringify(resultData2).substring(0, 1000));

                prospects  = extrairProspects(resultData2);
                totalCount = resultData2.meta?.total_count || resultData2.meta?.count || prospects.length;
                console.log(`✅ [Snov.io] Fallback sem filtro: ${prospects.length} prospects`);
            }
        }
    }

    return { prospects, totalCount };
}

// ============================================
// EXTRAÇÃO ROBUSTA DE PROSPECTS
// Snov.io muda estrutura entre versões/endpoints
// ============================================
function extrairProspects(data: any): any[] {
    if (!data) return [];

    // Estrutura 1: data.data é array direto
    if (Array.isArray(data.data) && data.data.length > 0) {
        console.log(`✅ [Snov.io] Estrutura data.data[] (${data.data.length})`);
        return data.data;
    }

    // Estrutura 2: data.data.prospects
    if (data.data?.prospects && Array.isArray(data.data.prospects)) {
        console.log(`✅ [Snov.io] Estrutura data.data.prospects[] (${data.data.prospects.length})`);
        return data.data.prospects;
    }

    // Estrutura 3: raiz
    if (Array.isArray(data.prospects) && data.prospects.length > 0) {
        console.log(`✅ [Snov.io] Estrutura data.prospects[] (${data.prospects.length})`);
        return data.prospects;
    }

    // Estrutura 4: varredura de arrays dentro de data.data
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        for (const key of Object.keys(data.data)) {
            if (Array.isArray(data.data[key]) && data.data[key].length > 0) {
                console.log(`✅ [Snov.io] Estrutura data.data.${key}[] (${data.data[key].length})`);
                return data.data[key];
            }
        }
    }

    console.warn(`⚠️ [Snov.io] Nenhum prospect encontrado. Keys disponíveis:`,
        Object.keys(data), '| data.data keys:', data.data ? Object.keys(data.data) : 'null');
    return [];
}

// ============================================
// HANDLER PRINCIPAL
// ============================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const { domain, departamentos = [], buscar_emails = false } = req.body;

    if (!domain) {
        return res.status(400).json({ error: 'Campo "domain" é obrigatório' });
    }

    try {
        // ETAPA 1: TOKEN
        const token = await getAccessToken();

        console.log(`\n🚀 [Snov.io] === INÍCIO: ${domain} ===`);

        // ============================================
        // ETAPA 2: COMPANY INFO START
        // ============================================
        const companyParams = new URLSearchParams();
        companyParams.append('domain', domain);

        const companyStartRes = await fetch(`${SNOVIO_BASE_URL}/v2/domain-search/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: companyParams.toString()
        });

        if (!companyStartRes.ok) {
            const err = await companyStartRes.text();
            return res.status(200).json({ success: false, error: `Company Start ${companyStartRes.status}`, detalhes: err });
        }

        const companyStartData = await companyStartRes.json();
        console.log(`📦 [Snov.io] Company Start:`, JSON.stringify(companyStartData));

        const companyTaskHash = companyStartData.meta?.task_hash;
        if (!companyTaskHash) {
            return res.status(200).json({ success: false, error: 'Sem task_hash empresa', raw: companyStartData });
        }

        // ============================================
        // ETAPA 3: COMPANY INFO RESULT
        // ============================================
        const companyResultUrl = companyStartData.links?.result ||
            `${SNOVIO_BASE_URL}/v2/domain-search/result/${companyTaskHash}`;
        console.log(`🔗 [Snov.io] Company Result URL: ${companyResultUrl}`);

        const companyResult = await pollForResult(companyResultUrl, token);
        console.log(`📦 [Snov.io] Company Result:`, JSON.stringify(companyResult).substring(0, 800));
        console.log(`🔗 [Snov.io] Company links:`, JSON.stringify(companyResult.links || {}));

        // ============================================
        // ETAPA 4+5: PROSPECTS
        // Usar URL fornecida pela API ou construir
        // ============================================
        const posicoes: string[] = [];
        for (const dep of departamentos) {
            const p = DEPARTAMENTO_POSICOES[dep];
            if (p) posicoes.push(...p);
        }

        // URL de prospects — pode vir em links.prospects ou construída
        const prospectsStartUrl = companyResult.links?.prospects?.includes('/start')
            ? companyResult.links.prospects
            : `${SNOVIO_BASE_URL}/v2/domain-search/prospects/start`;

        console.log(`🔗 [Snov.io] Prospects URL: ${prospectsStartUrl}`);

        const { prospects, totalCount } = await buscarProspects(token, domain, posicoes, prospectsStartUrl);

        console.log(`✅ [Snov.io] ${prospects.length} prospects | total: ${totalCount}`);
        if (prospects.length > 0) {
            console.log(`🔬 [Snov.io] Primeiro prospect:`, JSON.stringify(prospects[0]));
        }

        // ============================================
        // ETAPA 6: MAPEAR
        // ============================================
        const resultados = prospects.map((p: any) => ({
            snovio_id:       p.id || null,
            nome_completo:   `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            primeiro_nome:   p.first_name || '',
            ultimo_nome:     p.last_name || '',
            cargo:           p.position || p.title || '',
            email:           p.email || null,
            email_status:    p.email_status || null,
            linkedin_url:    p.source_page || p.linkedin || p.linkedin_url || null,
            foto_url:        p.photo || p.photo_url || null,
            empresa_nome:    companyResult.data?.company_name || domain,
            empresa_dominio: domain,
            empresa_setor:   companyResult.data?.industry || null,
            empresa_porte:   companyResult.data?.size || null,
            empresa_linkedin: companyResult.data?.linkedin || null,
            empresa_website:  companyResult.data?.website || domain,
            cidade:          p.locality || p.city || null,
            estado:          p.region || null,
            pais:            p.country || null,
            senioridade:     null,
            departamentos:   [],
            fonte:           'snovio',
            enriquecido:     false,
            _search_emails_url: p.search_emails_start || null
        }));

        // ============================================
        // ETAPA 7 (OPCIONAL): EMAILS
        // ============================================
        let creditosEmails = 0;

        if (buscar_emails && resultados.length > 0) {
            for (const prospect of resultados) {
                if (!prospect.primeiro_nome && !prospect._search_emails_url) continue;
                try {
                    const emailUrl = prospect._search_emails_url ||
                        `${SNOVIO_BASE_URL}/v2/domain-search/prospects/search-emails/start`;

                    const emailParams = new URLSearchParams();
                    emailParams.append('domain', domain);
                    if (prospect.primeiro_nome) emailParams.append('first_name', prospect.primeiro_nome);
                    if (prospect.ultimo_nome)   emailParams.append('last_name',  prospect.ultimo_nome);

                    const emailStartRes = await fetch(emailUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: emailParams.toString()
                    });

                    if (emailStartRes.ok) {
                        const emailStartData = await emailStartRes.json();
                        let emailResult: any;

                        if (emailStartData.status === 'completed') {
                            emailResult = emailStartData;
                        } else {
                            const emailTaskHash = emailStartData.meta?.task_hash;
                            if (emailTaskHash) {
                                const emailResultUrl = emailStartData.links?.result ||
                                    `${SNOVIO_BASE_URL}/v2/domain-search/prospects/search-emails/result/${emailTaskHash}`;
                                emailResult = await pollForResult(emailResultUrl, token, 5, 2000);
                            }
                        }

                        if (emailResult?.data?.emails?.[0]) {
                            prospect.email        = emailResult.data.emails[0].email;
                            prospect.email_status = emailResult.data.emails[0].smtp_status || 'unknown';
                            prospect.enriquecido  = true;
                            creditosEmails++;
                        }
                    }
                } catch (err: any) {
                    console.warn(`⚠️ [Snov.io] Email ${prospect.primeiro_nome}: ${err.message}`);
                }
            }
            console.log(`📧 [Snov.io] Emails: ${creditosEmails}/${resultados.length}`);
        }

        // Limpar campo interno
        const resultadosLimpos = resultados.map(({ _search_emails_url, ...rest }: any) => rest);

        console.log(`\n✅ [Snov.io] === FIM: ${resultadosLimpos.length} prospects para ${domain} ===\n`);

        return res.status(200).json({
            success: true,
            motor: 'snovio',
            dominio: domain,
            empresa: {
                nome:      companyResult.data?.company_name || null,
                setor:     companyResult.data?.industry || null,
                porte:     companyResult.data?.size || null,
                website:   companyResult.data?.website || null,
                linkedin:  companyResult.data?.linkedin || null,
                telefone:  companyResult.data?.hq_phone || null,
                cidade:    companyResult.data?.city || null,
                fundacao:  companyResult.data?.founded || null
            },
            total: resultadosLimpos.length,
            total_disponivel: totalCount,
            creditos_consumidos: 1 + creditosEmails,
            resultados: resultadosLimpos
        });

    } catch (error: any) {
        console.error('❌ [Snov.io] Erro geral:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
