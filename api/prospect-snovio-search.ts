/**
 * api/prospect-snovio-search.ts
 * 
 * PROSPECT DUAL ENGINE — Motor Snov.io
 * Busca prospects por domínio via Domain Search API
 * 
 * Fluxo (API assíncrona do Snov.io):
 * 1. Autenticação → access_token (válido 1h) — POST urlencoded
 * 2. Domain Search Start → task_hash         — POST form-data
 * 3. Domain Search Result → info empresa     — GET com task_hash
 * 4. Prospects Start → task_hash prospects   — POST form-data (endpoint separado)
 * 5. Prospects Result → lista de prospects   — GET com task_hash
 * 6. Email Finder (opcional) → email verificado por prospect
 * 
 * CORREÇÕES v1.1 (04/03/2026):
 * - Bug #1: Autenticação corrigida para application/x-www-form-urlencoded
 * - Bug #2: Todos os POSTs de domain-search agora usam form-data (URLSearchParams)
 * - Bug #3: Endpoint de prospects separado /v2/domain-search/prospects/start
 * 
 * Versão: 1.1
 * Data: 04/03/2026
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
 * CORREÇÃO: Content-Type deve ser application/x-www-form-urlencoded, não JSON
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

    // CORREÇÃO BUG #3: autenticação exige x-www-form-urlencoded
    const authParams = new URLSearchParams();
    authParams.append('grant_type', 'client_credentials');
    authParams.append('client_id', userId);
    authParams.append('client_secret', apiSecret);

    const response = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: authParams.toString()
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Snov.io auth failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    if (!data.access_token) {
        throw new Error(`Snov.io auth: token não retornado. Resposta: ${JSON.stringify(data)}`);
    }

    cachedToken = data.access_token;
    // Token dura 3600s, renovar com 10min de antecedência (50min cache)
    tokenExpiresAt = now + (50 * 60 * 1000);

    console.log('🔑 [Snov.io] Token obtido com sucesso');
    return cachedToken!;
}

/**
 * Aguardar resultado assíncrono do Snov.io (polling GET)
 */
async function waitForResult(url: string, token: string, maxAttempts: number = 10): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Snov.io result failed: ${response.status} - ${errText}`);
        }

        const data = await response.json();

        if (data.status === 'completed') {
            return data;
        }

        if (data.status === 'failed') {
            throw new Error(`Snov.io task failed: ${JSON.stringify(data)}`);
        }

        console.log(`⏳ [Snov.io] Aguardando resultado (tentativa ${i + 1}/${maxAttempts})...`);
        // Aguardar 2s antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Snov.io timeout: resultado não ficou pronto em tempo hábil');
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
        // ETAPA 2: DOMAIN SEARCH — START (info empresa)
        // CORREÇÃO BUG #1 e #2: usar form-data (URLSearchParams)
        // ============================================
        console.log(`🔍 [Snov.io] Iniciando Domain Search para ${domain}`);

        const companyStartParams = new URLSearchParams();
        companyStartParams.append('domain', domain);

        const companyStartResponse = await fetch(`${SNOVIO_BASE_URL}/v2/domain-search/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: companyStartParams.toString()
        });

        if (!companyStartResponse.ok) {
            const errText = await companyStartResponse.text();
            console.error(`❌ [Snov.io] Erro Company Search Start: ${companyStartResponse.status} - ${errText}`);
            return res.status(200).json({ 
                success: false, 
                error: `Snov.io Domain Search erro: ${companyStartResponse.status}`,
                detalhes: errText
            });
        }

        const companyStartData = await companyStartResponse.json();
        console.log(`✅ [Snov.io] Company Start response:`, JSON.stringify(companyStartData).substring(0, 300));

        const companyTaskHash = companyStartData.meta?.task_hash;

        if (!companyTaskHash) {
            return res.status(200).json({ 
                success: false, 
                error: 'Snov.io não retornou task_hash para empresa',
                raw: companyStartData
            });
        }

        // ============================================
        // ETAPA 3: DOMAIN SEARCH — RESULTADO EMPRESA
        // ============================================
        const companyResultUrl = companyStartData.links?.result || 
            `${SNOVIO_BASE_URL}/v2/domain-search/result/${companyTaskHash}`;
        
        const companyResult = await waitForResult(companyResultUrl, token);
        console.log(`✅ [Snov.io] Empresa encontrada: ${companyResult.data?.company_name || domain}`);

        // ============================================
        // ETAPA 4: BUSCAR PROSPECTS — START
        // CORREÇÃO BUG #2: endpoint separado + form-data com positions[]
        // ============================================
        
        // Montar posições de filtro
        const posicoes: string[] = [];
        for (const dep of departamentos) {
            const depPosicoes = DEPARTAMENTO_POSICOES[dep];
            if (depPosicoes) {
                posicoes.push(...depPosicoes);
            }
        }

        // Usar a URL de prospects fornecida pela API ou construir manualmente
        const prospectsStartUrl = companyResult.links?.prospects || 
            `${SNOVIO_BASE_URL}/v2/domain-search/prospects/start`;

        // CORREÇÃO BUG #2: form-data com positions[] como array separado
        const prospectsParams = new URLSearchParams();
        prospectsParams.append('domain', domain);
        prospectsParams.append('page', '1');
        
        // Snov.io aceita positions[] como múltiplos campos — máximo 10
        const posicoesLimitadas = posicoes.slice(0, 10);
        for (const pos of posicoesLimitadas) {
            prospectsParams.append('positions[]', pos);
        }

        const prospectsStartResponse = await fetch(prospectsStartUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: prospectsParams.toString()
        });

        if (!prospectsStartResponse.ok) {
            const errText = await prospectsStartResponse.text();
            console.error(`❌ [Snov.io] Erro Prospects Start: ${prospectsStartResponse.status} - ${errText}`);
            return res.status(200).json({ 
                success: false, 
                error: `Snov.io Prospects Start erro: ${prospectsStartResponse.status}`,
                detalhes: errText
            });
        }

        const prospectsStartData = await prospectsStartResponse.json();
        console.log(`✅ [Snov.io] Prospects Start response:`, JSON.stringify(prospectsStartData).substring(0, 300));

        // ============================================
        // ETAPA 5: PROSPECTS — RESULTADO
        // ============================================
        let prospectsData: any;

        if (prospectsStartData.status === 'completed') {
            prospectsData = prospectsStartData;
        } else {
            const prospectsTaskHash = prospectsStartData.meta?.task_hash;
            if (!prospectsTaskHash) {
                return res.status(200).json({ 
                    success: false, 
                    error: 'Snov.io não retornou task_hash para prospects',
                    raw: prospectsStartData
                });
            }

            const prospectsResultUrl = prospectsStartData.links?.result || 
                `${SNOVIO_BASE_URL}/v2/domain-search/prospects/result/${prospectsTaskHash}`;
            
            prospectsData = await waitForResult(prospectsResultUrl, token);
        }

        // A resposta de prospects pode vir em data[] ou data.prospects[]
        const prospects: any[] = prospectsData.data || prospectsData.data?.prospects || [];
        const totalCount: number = prospectsData.meta?.total_count || prospects.length;

        console.log(`✅ [Snov.io] ${prospects.length} prospects encontrados em ${domain} (total disponível: ${totalCount})`);

        // ============================================
        // ETAPA 6: MAPEAR RESULTADOS
        // ============================================
        const resultados = prospects.map((p: any) => ({
            snovio_id: p.id || null,
            nome_completo: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            primeiro_nome: p.first_name || '',
            ultimo_nome: p.last_name || '',
            cargo: p.position || p.title || '',
            email: p.email || null,
            email_status: p.email_status || null,
            linkedin_url: p.source_page || p.linkedin || null,
            foto_url: p.photo || null,
            empresa_nome: companyResult.data?.company_name || domain,
            empresa_dominio: domain,
            empresa_setor: companyResult.data?.industry || null,
            empresa_porte: companyResult.data?.size || null,
            empresa_linkedin: companyResult.data?.linkedin || null,
            empresa_website: companyResult.data?.website || domain,
            cidade: p.locality || null,
            estado: null,
            pais: p.country || null,
            senioridade: null,
            departamentos: [],
            fonte: 'snovio',
            enriquecido: false,
            // Link interno para buscar email por prospect (etapa 7)
            _search_emails_url: p.search_emails_start || null
        }));

        // ============================================
        // ETAPA 7 (OPCIONAL): BUSCAR EMAILS
        // POST form-data para cada prospect
        // ============================================
        let creditosEmails = 0;

        if (buscar_emails && resultados.length > 0) {
            for (const prospect of resultados) {
                if (!prospect._search_emails_url && !prospect.primeiro_nome) continue;

                try {
                    // Usar URL específica do prospect se disponível, ou Email Finder genérico
                    const emailUrl = prospect._search_emails_url || 
                        `${SNOVIO_BASE_URL}/v2/domain-search/prospects/search-emails/start`;

                    const emailParams = new URLSearchParams();
                    emailParams.append('domain', domain);
                    if (prospect.primeiro_nome) emailParams.append('first_name', prospect.primeiro_nome);
                    if (prospect.ultimo_nome) emailParams.append('last_name', prospect.ultimo_nome);

                    const emailStartResponse = await fetch(emailUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: emailParams.toString()
                    });

                    if (emailStartResponse.ok) {
                        const emailStartData = await emailStartResponse.json();
                        
                        let emailResult: any;
                        if (emailStartData.status === 'completed') {
                            emailResult = emailStartData;
                        } else {
                            const emailTaskHash = emailStartData.meta?.task_hash;
                            if (emailTaskHash) {
                                const emailResultUrl = emailStartData.links?.result ||
                                    `${SNOVIO_BASE_URL}/v2/domain-search/prospects/search-emails/result/${emailTaskHash}`;
                                emailResult = await waitForResult(emailResultUrl, token, 5);
                            }
                        }

                        if (emailResult?.data?.emails?.[0]) {
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
            console.log(`📧 [Snov.io] Emails encontrados: ${creditosEmails}/${resultados.length}`);
        }

        // Remover campo interno _search_emails_url do retorno
        const resultadosLimpos = resultados.map(({ _search_emails_url, ...rest }: any) => rest);

        return res.status(200).json({
            success: true,
            motor: 'snovio',
            dominio: domain,
            empresa: {
                nome: companyResult.data?.company_name || null,
                setor: companyResult.data?.industry || null,
                porte: companyResult.data?.size || null,
                website: companyResult.data?.website || null,
                linkedin: companyResult.data?.linkedin || null,
                telefone: companyResult.data?.hq_phone || null,
                cidade: companyResult.data?.city || null,
                fundacao: companyResult.data?.founded || null
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
