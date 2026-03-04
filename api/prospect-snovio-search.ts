/**
 * api/prospect-snovio-search.ts
 *
 * PROSPECT DUAL ENGINE — Motor Snov.io
 * Busca prospects por domínio via Domain Search API
 *
 * Versão: 1.5
 * Data: 04/03/2026
 *
 * CORREÇÕES v1.5:
 * - Filtro de departamentos aplicado NO BACKEND após retorno da API
 *   (Snov.io ignora positions[] em domínios grandes)
 * - Email bulk finder: até 10 por request em paralelo via
 *   /v2/emails-by-domain-by-name/start (mais eficiente e dentro do timeout)
 * - maxDuration: 60 explícito
 * - Polling otimizado: 8×2s por ciclo
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const SNOVIO_BASE_URL = 'https://api.snov.io';

// ============================================
// CACHE DE TOKEN
// ============================================
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

// ============================================
// PALAVRAS-CHAVE POR DEPARTAMENTO para filtro backend
// Busca case-insensitive no campo "position/title" do prospect
// ============================================
const DEPARTAMENTO_KEYWORDS: Record<string, string[]> = {
    'ti_tecnologia':         ['ti ', 'tecnologia', 'technology', 'tech', 'cto', 'cio', 'it ', 'software', 'sistemas', 'dados', 'data', 'digital', 'cyber', 'infosec', 'devops', 'desenvolvimento', 'developer', 'engenheiro de software', 'head of it', 'head of tech'],
    'compras_procurement':   ['compras', 'procurement', 'purchasing', 'suprimentos', 'supply', 'cpo', 'sourcing', 'licitação', 'contratação'],
    'infraestrutura':        ['infraestrutura', 'infrastructure', 'facilities', 'operações', 'operations', 'datacenter', 'redes', 'network'],
    'governanca_compliance': ['governança', 'governance', 'compliance', 'regulatório', 'regulatory', 'auditoria', 'audit', 'riscos', 'risk', 'lgpd', 'sgsi'],
    'rh_recursos_humanos':   ['rh', 'recursos humanos', 'human resources', 'hr ', 'pessoas', 'people', 'chro', 'talent', 'talentos', 'dp ', 'dhp', 'cultura', 'treinamento'],
    'comercial_vendas':      ['comercial', 'vendas', 'sales', 'cso', 'negócios', 'business', 'receita', 'revenue', 'account', 'cliente'],
    'financeiro':            ['financeiro', 'finance', 'cfo', 'controladoria', 'controller', 'fiscal', 'contábil', 'contabilidade', 'tesouraria', 'treasury', 'orçamento'],
    'diretoria_clevel':      ['ceo', 'coo', 'cto', 'cfo', 'cio', 'chro', 'cso', 'cpo', 'diretor', 'director', 'presidente', 'president', 'vp ', 'vice-presidente', 'vice president', 'managing director', 'diretor geral', 'head of', 'gerente geral', 'general manager']
};

// Posições para enviar à API (limite de 10 por request)
const DEPARTAMENTO_POSICOES: Record<string, string[]> = {
    'ti_tecnologia':         ['CTO', 'CIO', 'IT Director', 'IT Manager', 'Gerente de TI', 'Diretor de TI', 'Head of Technology'],
    'compras_procurement':   ['CPO', 'Procurement Director', 'Purchasing Manager', 'Diretor de Compras', 'Gerente de Compras'],
    'infraestrutura':        ['Infrastructure Director', 'Infrastructure Manager', 'Diretor de Infraestrutura', 'Gerente de Infraestrutura'],
    'governanca_compliance': ['Compliance Officer', 'Governance Director', 'Diretor de Governança', 'Gerente de Governança'],
    'rh_recursos_humanos':   ['CHRO', 'HR Director', 'HR Manager', 'Diretor de RH', 'Gerente de RH', 'Head of People'],
    'comercial_vendas':      ['CSO', 'Sales Director', 'Sales Manager', 'Diretor Comercial', 'Gerente Comercial'],
    'financeiro':            ['CFO', 'Finance Director', 'Finance Manager', 'Diretor Financeiro', 'Gerente Financeiro'],
    'diretoria_clevel':      ['CEO', 'COO', 'CTO', 'CFO', 'CIO', 'President', 'Presidente', 'Vice President', 'VP', 'Diretor Geral']
};

// ============================================
// FILTRO DE CARGO NO BACKEND
// Retorna true se o cargo do prospect bate com algum departamento selecionado
// ============================================
function cargoCorrespondeDepartamentos(cargo: string, departamentos: string[]): boolean {
    if (!cargo || departamentos.length === 0) return true; // sem filtro = todos passam
    const cargoLower = cargo.toLowerCase();
    return departamentos.some(dep => {
        const keywords = DEPARTAMENTO_KEYWORDS[dep] || [];
        return keywords.some(kw => cargoLower.includes(kw.toLowerCase()));
    });
}

// ============================================
// AUTENTICAÇÃO
// ============================================
async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) return cachedToken;

    const userId    = process.env.SNOVIO_USER_ID;
    const apiSecret = process.env.SNOVIO_API_SECRET;
    if (!userId || !apiSecret) throw new Error('SNOVIO_USER_ID ou SNOVIO_API_SECRET não configurados');

    const params = new URLSearchParams();
    params.append('grant_type',    'client_credentials');
    params.append('client_id',     userId);
    params.append('client_secret', apiSecret);

    const res = await fetch(`${SNOVIO_BASE_URL}/v1/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });
    if (!res.ok) throw new Error(`Auth failed: ${res.status} — ${await res.text()}`);

    const data = await res.json();
    if (!data.access_token) throw new Error(`Token não retornado: ${JSON.stringify(data)}`);

    cachedToken    = data.access_token;
    tokenExpiresAt = now + (50 * 60 * 1000);
    console.log('🔑 [Snov.io] Token obtido');
    return cachedToken!;
}

// ============================================
// POLLING ROBUSTO — 8×2s = 16s máx por ciclo
// ============================================
async function pollForResult(url: string, token: string, maxAttempts = 8, intervalMs = 2000): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Poll ${res.status}: ${await res.text()}`);

        const data = await res.json();
        console.log(`⏳ [Snov.io] Poll ${i + 1}/${maxAttempts} — status: "${data.status}"`);

        if (data.status === 'completed') return data;
        if (data.status === 'failed')    throw new Error(`Task failed: ${JSON.stringify(data)}`);

        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout após ${maxAttempts} tentativas`);
}

// ============================================
// EXTRAÇÃO ROBUSTA DE PROSPECTS
// ============================================
function extrairProspects(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data.data) && data.data.length > 0) return data.data;
    if (data.data?.prospects && Array.isArray(data.data.prospects)) return data.data.prospects;
    if (Array.isArray(data.prospects) && data.prospects.length > 0) return data.prospects;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        for (const key of Object.keys(data.data)) {
            if (Array.isArray(data.data[key]) && data.data[key].length > 0) {
                console.log(`✅ Estrutura data.data.${key}[] (${data.data[key].length})`);
                return data.data[key];
            }
        }
    }
    console.warn('⚠️ Nenhum array de prospects. Keys:', Object.keys(data));
    return [];
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

    const buscar = async (semFiltro = false) => {
        const params = new URLSearchParams();
        params.append('domain', domain);
        params.append('page', '1');
        if (!semFiltro) {
            for (const pos of posicoes.slice(0, 10)) params.append('positions[]', pos);
        }

        console.log(`🔍 [Snov.io] POST prospects${semFiltro ? ' (sem filtro)' : ''}: ${params.toString().substring(0, 200)}`);

        const startRes = await fetch(prospectsStartUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        if (!startRes.ok) throw new Error(`Prospects Start ${startRes.status}: ${await startRes.text()}`);

        const startData = await startRes.json();
        console.log(`📦 [Snov.io] Prospects Start:`, JSON.stringify(startData).substring(0, 400));

        const taskHash = startData.meta?.task_hash;
        if (!taskHash) throw new Error(`Sem task_hash. RAW: ${JSON.stringify(startData)}`);

        const resultUrl = startData.links?.result ||
            `${SNOVIO_BASE_URL}/v2/domain-search/prospects/result/${taskHash}`;

        const resultData = await pollForResult(resultUrl, token);
        console.log(`📦 [Snov.io] Prospects Result:`, JSON.stringify(resultData).substring(0, 600));

        return resultData;
    };

    // Tentativa 1: com filtro de posições
    const resultData = await buscar(false);
    let prospects = extrairProspects(resultData);
    let totalCount = resultData.meta?.total_count || resultData.meta?.count || prospects.length;

    // Fallback: sem filtro se retornou 0
    if (prospects.length === 0 && posicoes.length > 0) {
        console.log('⚠️ [Snov.io] 0 com filtro, tentando sem filtro...');
        const resultData2 = await buscar(true);
        prospects  = extrairProspects(resultData2);
        totalCount = resultData2.meta?.total_count || resultData2.meta?.count || prospects.length;
    }

    return { prospects, totalCount };
}

// ============================================
// EMAIL BULK FINDER via /v2/emails-by-domain-by-name/start
// Até 10 prospects por request (muito mais eficiente que 1 a 1)
// ============================================
async function buscarEmailsBulk(
    token: string,
    prospects: any[],
    domain: string
): Promise<Map<string, { email: string; status: string }>> {
    const emailMap = new Map<string, { email: string; status: string }>();
    const BATCH_SIZE = 10;

    for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
        const batch = prospects.slice(i, i + BATCH_SIZE);

        const params = new URLSearchParams();
        batch.forEach((p, idx) => {
            params.append(`rows[${idx}][first_name]`, p.primeiro_nome || '');
            params.append(`rows[${idx}][last_name]`,  p.ultimo_nome || '');
            params.append(`rows[${idx}][domain]`,     domain);
        });

        console.log(`📧 [Snov.io] Email bulk batch ${Math.floor(i/BATCH_SIZE)+1}: ${batch.length} prospects`);

        try {
            const startRes = await fetch(`${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            if (!startRes.ok) {
                console.warn(`⚠️ [Snov.io] Email bulk start ${startRes.status}`);
                continue;
            }

            const startData = await startRes.json();
            console.log(`📦 [Snov.io] Email Bulk Start:`, JSON.stringify(startData).substring(0, 400));

            // Pode já retornar completado
            let resultData: any;
            if (startData.status === 'completed') {
                resultData = startData;
            } else {
                const taskHash = startData.meta?.task_hash;
                if (!taskHash) continue;

                const resultUrl = startData.links?.result ||
                    `${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/result/${taskHash}`;
                resultData = await pollForResult(resultUrl, token, 6, 2000);
            }

            console.log(`📦 [Snov.io] Email Bulk Result:`, JSON.stringify(resultData).substring(0, 600));

            // Mapear resultados por nome
            const rows: any[] = resultData.data || [];
            rows.forEach((row: any) => {
                const firstName = (row.first_name || '').toLowerCase();
                const lastName  = (row.last_name  || '').toLowerCase();
                const key = `${firstName}|${lastName}`;
                const email = row.emails?.[0]?.email || row.email;
                if (email) {
                    emailMap.set(key, {
                        email,
                        status: row.emails?.[0]?.smtp_status || row.smtp_status || 'unknown'
                    });
                }
            });

        } catch (err: any) {
            console.warn(`⚠️ [Snov.io] Erro batch emails: ${err.message}`);
        }
    }

    console.log(`📧 [Snov.io] Emails encontrados: ${emailMap.size}/${prospects.length}`);
    return emailMap;
}

// ============================================
// HANDLER PRINCIPAL
// ============================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const { domain, departamentos = [], buscar_emails = false } = req.body;
    if (!domain) return res.status(400).json({ error: 'Campo "domain" é obrigatório' });

    try {
        console.log(`\n🚀 [Snov.io] === INÍCIO: ${domain} | depts: ${departamentos.join(',')} ===`);

        // ETAPA 1: TOKEN
        const token = await getAccessToken();

        // ETAPA 2: COMPANY INFO START
        const companyParams = new URLSearchParams();
        companyParams.append('domain', domain);

        const companyStartRes = await fetch(`${SNOVIO_BASE_URL}/v2/domain-search/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: companyParams.toString()
        });
        if (!companyStartRes.ok) {
            const err = await companyStartRes.text();
            return res.status(200).json({ success: false, error: `Company Start ${companyStartRes.status}`, detalhes: err });
        }

        const companyStartData = await companyStartRes.json();
        console.log(`📦 [Snov.io] Company Start:`, JSON.stringify(companyStartData));

        const companyTaskHash = companyStartData.meta?.task_hash;
        if (!companyTaskHash) return res.status(200).json({ success: false, error: 'Sem task_hash empresa', raw: companyStartData });

        // ETAPA 3: COMPANY INFO RESULT
        const companyResultUrl = companyStartData.links?.result ||
            `${SNOVIO_BASE_URL}/v2/domain-search/result/${companyTaskHash}`;

        const companyResult = await pollForResult(companyResultUrl, token);
        console.log(`✅ [Snov.io] Empresa: ${companyResult.data?.company_name || domain}`);
        console.log(`🔗 [Snov.io] Links empresa:`, JSON.stringify(companyResult.links || {}));

        // ETAPA 4+5: PROSPECTS
        const posicoes: string[] = [];
        for (const dep of departamentos) {
            const p = DEPARTAMENTO_POSICOES[dep];
            if (p) posicoes.push(...p);
        }

        const prospectsStartUrl = companyResult.links?.prospects?.includes('/start')
            ? companyResult.links.prospects
            : `${SNOVIO_BASE_URL}/v2/domain-search/prospects/start`;

        const { prospects: rawProspects, totalCount } = await buscarProspects(token, domain, posicoes, prospectsStartUrl);

        console.log(`✅ [Snov.io] Raw prospects: ${rawProspects.length} | total disponível: ${totalCount}`);

        // ETAPA 6: MAPEAR
        const resultadosBrutos = rawProspects.map((p: any) => ({
            snovio_id:        p.id || null,
            nome_completo:    `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            primeiro_nome:    p.first_name || '',
            ultimo_nome:      p.last_name || '',
            cargo:            p.position || p.title || '',
            email:            p.email || null,
            email_status:     p.email_status || null,
            linkedin_url:     p.source_page || p.linkedin || p.linkedin_url || null,
            foto_url:         p.photo || p.photo_url || null,
            empresa_nome:     companyResult.data?.company_name || domain,
            empresa_dominio:  domain,
            empresa_setor:    companyResult.data?.industry || null,
            empresa_porte:    companyResult.data?.size || null,
            empresa_linkedin: companyResult.data?.linkedin || null,
            empresa_website:  companyResult.data?.website || domain,
            cidade:           p.locality || p.city || null,
            estado:           p.region || null,
            pais:             p.country || null,
            senioridade:      null,
            departamentos:    [],
            fonte:            'snovio' as const,
            enriquecido:      false
        }));

        // ============================================
        // ETAPA 7: FILTRO DE CARGO NO BACKEND
        // Necessário porque Snov.io ignora positions[] em domínios grandes
        // ============================================
        const resultadosFiltrados = departamentos.length > 0
            ? resultadosBrutos.filter(r => cargoCorrespondeDepartamentos(r.cargo, departamentos))
            : resultadosBrutos;

        console.log(`🔽 [Snov.io] Após filtro de cargo: ${resultadosFiltrados.length}/${resultadosBrutos.length}`);

        // Se filtro zerou os resultados, retornar todos (sem filtro) com aviso
        const resultadosFinais = resultadosFiltrados.length > 0 ? resultadosFiltrados : resultadosBrutos;
        const filtroAplicado   = resultadosFiltrados.length > 0;

        // ============================================
        // ETAPA 8 (OPCIONAL): EMAIL BULK FINDER
        // Usa /v2/emails-by-domain-by-name em batches de 10
        // Muito mais eficiente que buscar 1 a 1
        // ============================================
        let creditosEmails = 0;

        if (buscar_emails && resultadosFinais.length > 0) {
            // Limitar a 20 buscas de email por chamada para controle de tempo e créditos
            const prospectsParaEmail = resultadosFinais.slice(0, 20);
            const emailMap = await buscarEmailsBulk(token, prospectsParaEmail, domain);

            for (const prospect of prospectsParaEmail) {
                const key = `${prospect.primeiro_nome.toLowerCase()}|${prospect.ultimo_nome.toLowerCase()}`;
                const found = emailMap.get(key);
                if (found) {
                    prospect.email        = found.email;
                    prospect.email_status = found.status;
                    prospect.enriquecido  = true;
                    creditosEmails++;
                }
            }
        }

        console.log(`\n✅ [Snov.io] === FIM: ${resultadosFinais.length} prospects | ${creditosEmails} emails | filtrado: ${filtroAplicado} ===\n`);

        return res.status(200).json({
            success: true,
            motor:   'snovio',
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
            total:              resultadosFinais.length,
            total_disponivel:   totalCount,
            filtro_aplicado:    filtroAplicado,
            creditos_consumidos: 1 + creditosEmails,
            resultados:         resultadosFinais
        });

    } catch (error: any) {
        console.error('❌ [Snov.io] Erro geral:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
