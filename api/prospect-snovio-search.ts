/**
 * api/prospect-snovio-search.ts
 * 
 * PROSPECT DUAL ENGINE — Motor Snov.io
 * Busca prospects por domínio via Domain Search API
 * 
 * Fluxo (API assíncrona do Snov.io):
 * 1. Autenticação → access_token (válido 1h)
 * 2. Domain Search Start → task_hash
 * 3. Domain Search Result → lista de prospects com LinkedIn (source_page)
 * 4. Email Finder (opcional) → email verificado por prospect
 * 
 * Versão: 1.0
 * Data: 03/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SNOVIO_BASE_URL = 'https://api.snov.io';

// ============================================
// CACHE SIMPLES DE TOKEN (em memória do serverless)
// ============================================
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

// ============================================
// MAPEAMENTO DE DEPARTAMENTOS → POSIÇÕES SNOV.IO
// ============================================
const DEPARTAMENTO_POSICOES: Record<string, string[]> = {
    'ti_tecnologia': ['CTO', 'CIO', 'IT Director', 'IT Manager', 'Gerente de TI', 'Diretor de TI', 'Head of Technology'],
    'compras_procurement': ['CPO', 'Procurement Director', 'Purchasing Manager', 'Diretor de Compras', 'Gerente de Compras'],
    'infraestrutura': ['Infrastructure Director', 'Infrastructure Manager', 'Diretor de Infraestrutura', 'Gerente de Infraestrutura'],
    'governanca_compliance': ['Compliance Officer', 'Governance Director', 'Diretor de Governança', 'Gerente de Governança'],
    'rh_recursos_humanos': ['CHRO', 'HR Director', 'HR Manager', 'Diretor de RH', 'Gerente de RH', 'Head of People'],
    'comercial_vendas': ['CSO', 'Sales Director', 'Sales Manager', 'Diretor Comercial', 'Gerente Comercial'],
    'financeiro': ['CFO', 'Finance Director', 'Finance Manager', 'Diretor Financeiro', 'Gerente Financeiro'],
    'diretoria_clevel': ['CEO', 'COO', 'CTO', 'CFO', 'CIO', 'President', 'Presidente', 'Vice President', 'VP', 'Diretor Geral']
};

/**
 * Obtém access_token do Snov.io (cache de 50min)
 */
async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) {
        return cachedToken;
    }

    const userId = process.env.SNOVIO_USER_ID;
    const apiSecret = process.env.SNOVIO_API_SECRET;

    if (!userId || !apiSecret) {
        throw new Error('SNOVIO_USER_ID ou SNOVIO_API_SECRET não configurados');
    }

    const response = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: userId,
            client_secret: apiSecret
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Snov.io auth failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Token dura 3600s, renovar com 10min de antecedência
    tokenExpiresAt = now + (50 * 60 * 1000);

    console.log('🔑 [Snov.io] Token obtido com sucesso');
    return cachedToken!;
}

/**
 * Aguardar resultado assíncrono do Snov.io (polling)
 */
async function waitForResult(url: string, token: string, maxAttempts: number = 10): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Snov.io result failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'completed') {
            return data;
        }

        if (data.status === 'failed') {
            throw new Error('Snov.io task failed');
        }

        // Aguardar 2s antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Snov.io timeout: resultado não ficou pronto');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    const { 
        domain,
        departamentos = [],
        buscar_emails = false
    } = req.body;

    if (!domain) {
        return res.status(400).json({ error: 'Campo "domain" é obrigatório' });
    }

    try {
        // ============================================
        // ETAPA 1: AUTENTICAÇÃO
        // ============================================
        const token = await getAccessToken();

        // ============================================
        // ETAPA 2: DOMAIN SEARCH — START
        // ============================================
        console.log(`🔍 [Snov.io] Iniciando Domain Search para ${domain}`);

        // Montar posições de filtro
        const posicoes: string[] = [];
        for (const dep of departamentos) {
            const depPosicoes = DEPARTAMENTO_POSICOES[dep];
            if (depPosicoes) {
                posicoes.push(...depPosicoes);
            }
        }

        const searchBody: any = { domain };
        // Snov.io aceita filtro de positions como array
        if (posicoes.length > 0) {
            searchBody.positions = posicoes;
        }

        const startResponse = await fetch(`${SNOVIO_BASE_URL}/v2/domain-search/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchBody)
        });

        if (!startResponse.ok) {
            const errText = await startResponse.text();
            console.error(`❌ [Snov.io] Erro Domain Search Start: ${startResponse.status} - ${errText}`);
            return res.status(200).json({ 
                success: false, 
                error: `Snov.io Domain Search erro: ${startResponse.status}`,
                detalhes: errText
            });
        }

        const startData = await startResponse.json();
        const companyTaskHash = startData.meta?.task_hash || startData.data?.task_hash;

        if (!companyTaskHash) {
            return res.status(200).json({ 
                success: false, 
                error: 'Snov.io não retornou task_hash',
                raw: startData
            });
        }

        // ============================================
        // ETAPA 3: DOMAIN SEARCH — RESULTADO EMPRESA
        // ============================================
        const resultUrl = startData.links?.result || `${SNOVIO_BASE_URL}/v2/domain-search/result/${companyTaskHash}`;
        const companyResult = await waitForResult(resultUrl, token);

        // Extrair link para prospects
        const prospectsUrl = companyResult.links?.prospects;
        if (!prospectsUrl) {
            return res.status(200).json({
                success: true,
                motor: 'snovio',
                dominio: domain,
                empresa: companyResult.data || {},
                total: 0,
                creditos_consumidos: 1,
                resultados: [],
                mensagem: 'Empresa encontrada mas sem prospects disponíveis'
            });
        }

        // ============================================
        // ETAPA 4: BUSCAR PROSPECTS
        // ============================================
        const prospectsStartResponse = await fetch(prospectsUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain, positions: posicoes.length > 0 ? posicoes : undefined })
        });

        if (!prospectsStartResponse.ok) {
            const errText = await prospectsStartResponse.text();
            return res.status(200).json({ 
                success: false, 
                error: `Snov.io Prospects erro: ${prospectsStartResponse.status}`,
                detalhes: errText
            });
        }

        const prospectsStartData = await prospectsStartResponse.json();
        const prospectsTaskHash = prospectsStartData.meta?.task_hash;

        let prospectsData;
        if (prospectsStartData.status === 'completed') {
            prospectsData = prospectsStartData;
        } else {
            const prospectsResultUrl = prospectsStartData.links?.result || 
                `${SNOVIO_BASE_URL}/v2/domain-search/prospects/result/${prospectsTaskHash}`;
            prospectsData = await waitForResult(prospectsResultUrl, token);
        }

        const prospects = prospectsData.data || [];
        const totalCount = prospectsData.meta?.total_count || prospects.length;

        console.log(`✅ [Snov.io] ${prospects.length} prospects encontrados em ${domain} (total: ${totalCount})`);

        // ============================================
        // ETAPA 5: MAPEAR RESULTADOS
        // ============================================
        const resultados = prospects.map((p: any) => ({
            snovio_id: p.id || null,
            nome_completo: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            primeiro_nome: p.first_name || '',
            ultimo_nome: p.last_name || '',
            cargo: p.position || '',
            email: null, // Email requer etapa adicional no Snov.io
            email_status: null,
            linkedin_url: p.source_page || null,
            foto_url: null,
            empresa_nome: companyResult.data?.name || domain,
            empresa_dominio: domain,
            empresa_setor: companyResult.data?.industry || null,
            empresa_porte: companyResult.data?.size || null,
            empresa_linkedin: companyResult.data?.linkedin || null,
            empresa_website: companyResult.data?.website || domain,
            cidade: null,
            estado: null,
            pais: null,
            senioridade: null,
            departamentos: [],
            fonte: 'snovio',
            enriquecido: false,
            // Guardar link para buscar email depois (fallback)
            _search_emails_url: p.search_emails_start || null
        }));

        // ============================================
        // ETAPA 6 (OPCIONAL): BUSCAR EMAILS
        // ============================================
        let creditosEmails = 0;

        if (buscar_emails && resultados.length > 0) {
            for (const prospect of resultados) {
                if (prospect._search_emails_url) {
                    try {
                        const emailStartResponse = await fetch(prospect._search_emails_url, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (emailStartResponse.ok) {
                            const emailStartData = await emailStartResponse.json();
                            
                            let emailResult;
                            if (emailStartData.status === 'completed') {
                                emailResult = emailStartData;
                            } else {
                                const emailResultUrl = emailStartData.links?.result ||
                                    `${SNOVIO_BASE_URL}/v2/domain-search/prospects/search-emails/result/${emailStartData.meta?.task_hash}`;
                                emailResult = await waitForResult(emailResultUrl, token, 5);
                            }

                            if (emailResult.data?.emails?.[0]) {
                                prospect.email = emailResult.data.emails[0].email;
                                prospect.email_status = emailResult.data.emails[0].smtp_status || 'unknown';
                                prospect.enriquecido = true;
                                creditosEmails++;
                            }
                        }
                    } catch (emailErr: any) {
                        console.warn(`⚠️ [Snov.io] Erro buscando email de ${prospect.primeiro_nome}: ${emailErr.message}`);
                    }
                }
            }
            console.log(`📧 [Snov.io] Emails encontrados: ${creditosEmails}/${resultados.length}`);
        }

        // Remover campo interno _search_emails_url do retorno
        const resultadosLimpos = resultados.map(({ _search_emails_url, ...rest }: any) => rest);

        return res.status(200).json({
            success: true,
            motor: 'snovio',
            dominio: domain,
            empresa: {
                nome: companyResult.data?.name || null,
                setor: companyResult.data?.industry || null,
                porte: companyResult.data?.size || null,
                website: companyResult.data?.website || null,
                linkedin: companyResult.data?.linkedin || null,
                telefone: companyResult.data?.phone || null,
                localizacao: companyResult.data?.location || null
            },
            total: resultadosLimpos.length,
            total_disponivel: totalCount,
            creditos_consumidos: 1 + creditosEmails,
            resultados: resultadosLimpos
        });

    } catch (error: any) {
        console.error('❌ [Snov.io] Erro:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}
