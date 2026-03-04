/**
 * api/prospect-snovio-search.ts
 *
 * PROSPECT DUAL ENGINE — Motor Snov.io
 * Busca prospects por domínio via Domain Search API
 *
 * Versão: 2.0
 * Data: 04/03/2026
 *
 * FIX v2.0 (sobre v1.9):
 * - Email: reescrito com Promise.all CONCURRENCY=5 (era serial batch → timeout)
 * - Email: 1 prospect por request (mais confiável que bulk de 10)
 * - Filtro Brasil: novo parâmetro filtrar_brasil no req.body
 * - Localização: se dados insuficientes, filtro de país não é aplicado
 *
 * FIX v1.9 (sobre v1.8):
 * - CRÍTICO: parsing email bulk corrigido — API retorna {people, result[]} não {first_name, emails[]}
 * - Threshold proteção filtro: 5 → 3 (respeita seleção do usuário)
 * - Fallback páginas: 3 → 5 (100 prospects para filtro trabalhar)
 *
 * FIX v1.8:
 * - Filtro de cargo usa regex word boundary (era substring simples)
 *   Bug: 'cto' batia em 'dire-cto-r' → falso positivo em todos os Directors
 * - Keywords limpas: 'ti ', ' ti,' → 'ti' (boundary resolve)
 * - Polling email bulk: 8×2s → 12×3s (mais tempo para Snov.io processar)
 *
 * MELHORIAS v1.6 + CORREÇÕES v1.7:
 * - Paginação automática: busca até 3 páginas para maximizar resultados
 * - Keywords de departamento expandidas (mais variações PT/EN)
 * - Filtro de senioridade como segunda camada (quando selecionado)
 * - Filtro de cargo mais permissivo: basta UMA palavra-chave no cargo
 * - Se após filtro restar menos de 5, retorna todos sem filtro
 *   (evita resultados muito escassos por filtro excessivo)
 * CORREÇÕES v1.7:
 * - BUG CRÍTICO: task_hash do Email Bulk estava em data.task_hash, não meta.task_hash
 *   Polling de email nunca executava → 0 emails sempre
 * - Fallback sem filtro agora também pagina (3 páginas)
 *   Garante até 60 prospects mesmo quando API ignora filtros
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
// PALAVRAS-CHAVE POR DEPARTAMENTO
// Expandidas para cobrir variações reais de cargos no LinkedIn Brasil
// ============================================
const DEPARTAMENTO_KEYWORDS: Record<string, string[]> = {
    'ti_tecnologia': [
        'tecnologia', 'technology', 'tech', 'ti', 'cto', 'cio',
        'it', 'it manager', 'it director',
        'software', 'sistemas', 'system', 'dados', 'data',
        'digital', 'cyber', 'infosec', 'segurança da informação',
        'devops', 'desenvolvimento', 'developer', 'engenheiro de software',
        'head of it', 'head of tech', 'head of technology',
        'infraestrutura de ti', 'arquitetura', 'architect',
        'cloud', 'erp', 'sap', 'oracle', 'totvs', 'microservices',
        'inteligência artificial', 'machine learning', 'ia'
    ],
    'compras_procurement': [
        'compras', 'procurement', 'purchasing', 'suprimentos',
        'supply chain', 'supply', 'cpo', 'sourcing',
        'licitação', 'contratação', 'fornecedores', 'vendor',
        'categoria', 'category', 'strategic sourcing', 'abastecimento',
        'logística de suprimentos', 'gestão de fornecedores'
    ],
    'infraestrutura': [
        'infraestrutura', 'infrastructure', 'facilities',
        'operações de ti', 'it operations', 'datacenter', 'data center',
        'redes', 'network', 'telecom', 'noc', 'service desk',
        'suporte', 'support', 'field service', 'helpdesk',
        'cloud infrastructure', 'servidor', 'server'
    ],
    'governanca_compliance': [
        'governança', 'governance', 'compliance', 'regulatório', 'regulatory',
        'auditoria', 'audit', 'riscos', 'risk', 'lgpd', 'sgsi',
        'controles internos', 'internal controls', 'sox',
        'privacidade', 'privacy', 'dpO', 'data protection',
        'segurança corporativa', 'gestão de riscos'
    ],
    'rh_recursos_humanos': [
        'recursos humanos', 'human resources', 'rh',
        'hr', 'pessoas', 'people', 'chro',
        'talent', 'talentos', 'cultura', 'treinamento',
        'desenvolvimento humano', 'aprendizagem', 'learning',
        'remuneração', 'compensation', 'benefícios', 'benefits',
        'recrutamento', 'recruitment', 'seleção', 'dhp',
        'gente e gestão', 'gestão de pessoas', 'people & culture'
    ],
    'comercial_vendas': [
        'comercial', 'vendas', 'sales', 'cso', 'negócios', 'business',
        'receita', 'revenue', 'account', 'cliente', 'customer',
        'key account', 'national account', 'trade', 'channel',
        'b2b', 'b2c', 'marketplace', 'expansão', 'growth',
        'desenvolvimento de negócios', 'business development',
        'parcerias', 'partnership'
    ],
    'financeiro': [
        'financeiro', 'finance', 'cfo', 'controladoria', 'controller',
        'fiscal', 'contábil', 'contabilidade', 'tesouraria', 'treasury',
        'orçamento', 'budget', 'planejamento financeiro', 'fp&a',
        'contabilidade', 'tax', 'tributos', 'custos', 'cost',
        'faturamento', 'billing', 'contas a pagar', 'contas a receber',
        'shared services', 'gbs', 'csc'
    ],
    'diretoria_clevel': [
        'ceo', 'coo', 'cto', 'cfo', 'cio', 'chro', 'cso', 'cpo',
        'diretor', 'director', 'diretora',
        'presidente', 'president', 'presidenta',
        'vp', 'vice-presidente', 'vice presidente', 'vice president',
        'managing director', 'diretor geral', 'general manager',
        'head of', 'gerente geral', 'country manager',
        'superintendente', 'superintendent',
        'executive', 'executivo', 'board', 'conselho',
        'sócio', 'partner', 'principal'
    ]
};

// Palavras-chave por senioridade para filtro backend
const SENIORIDADE_KEYWORDS: Record<string, string[]> = {
    'c_level':       ['ceo', 'coo', 'cto', 'cfo', 'cio', 'chro', 'cso', 'cpo', 'presidente', 'president'],
    'vp':            ['vp', 'vice-presidente', 'vice president', 'vice presidente'],
    'diretor':       ['diretor', 'director', 'diretora'],
    'gerente':       ['gerente', 'manager', 'gerência'],
    'coordenador':   ['coordenador', 'coordinator', 'coordenação', 'lead ', 'líder'],
    'superintendente':['superintendente', 'superintendent']
};

// Posições para enviar à API Snov.io
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
// FILTROS DE CARGO E SENIORIDADE NO BACKEND
// ============================================
// Testa se uma keyword bate em um cargo usando word boundary (evita falsos positivos)
// Ex: 'cto' NÃO bate em 'director' mas bate em 'cto of operations'
function kwMatchesCargo(keyword: string, cargoLower: string): boolean {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return false;
    try {
        // \b = word boundary: garante que 'cto' não bate dentro de 'director'
        const pattern = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        return pattern.test(cargoLower);
    } catch {
        return cargoLower.includes(kw);
    }
}

function cargoCorrespondeDepartamentos(cargo: string, departamentos: string[]): boolean {
    if (!cargo || departamentos.length === 0) return true;
    const cargoLower = cargo.toLowerCase();
    return departamentos.some(dep => {
        const keywords = DEPARTAMENTO_KEYWORDS[dep] || [];
        return keywords.some(kw => kwMatchesCargo(kw, cargoLower));
    });
}

function cargoCorrespondeSenioridade(cargo: string, senioridades: string[]): boolean {
    if (!cargo || senioridades.length === 0) return true;
    const cargoLower = cargo.toLowerCase();
    return senioridades.some(sen => {
        const keywords = SENIORIDADE_KEYWORDS[sen] || [];
        return keywords.some(kw => kwMatchesCargo(kw, cargoLower));
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
// POLLING — 8×2s = 16s máx por ciclo
// ============================================
async function pollForResult(url: string, token: string, maxAttempts = 8, intervalMs = 2000): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Poll ${res.status}: ${await res.text()}`);

        const data = await res.json();
        console.log(`⏳ [Snov.io] Poll ${i + 1}/${maxAttempts} — status: "${data.status}"`);

        if (data.status === 'completed') return data;
        if (data.status === 'failed')    throw new Error(`Task failed`);

        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout após ${maxAttempts} tentativas`);
}

// ============================================
// EXTRAÇÃO ROBUSTA
// ============================================
function extrairProspects(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data.data) && data.data.length > 0) return data.data;
    if (data.data?.prospects && Array.isArray(data.data.prospects)) return data.data.prospects;
    if (Array.isArray(data.prospects) && data.prospects.length > 0) return data.prospects;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        for (const key of Object.keys(data.data)) {
            if (Array.isArray(data.data[key]) && data.data[key].length > 0) {
                return data.data[key];
            }
        }
    }
    return [];
}

// ============================================
// BUSCA COM PAGINAÇÃO AUTOMÁTICA
// Busca até MAX_PAGES páginas para maximizar resultados
// Budget: 3 páginas × (1s start + 8×2s poll) = ~51s máx
// ============================================
async function buscarProspectsComPaginacao(
    token: string,
    domain: string,
    posicoes: string[],
    prospectsStartUrl: string,
    maxPages: number = 3
): Promise<{ prospects: any[]; totalCount: number }> {

    const buscarPagina = async (page: number, semFiltro = false): Promise<any> => {
        const params = new URLSearchParams();
        params.append('domain', domain);
        params.append('page',   String(page));
        if (!semFiltro) {
            for (const pos of posicoes.slice(0, 10)) params.append('positions[]', pos);
        }

        console.log(`🔍 [Snov.io] Página ${page}${semFiltro ? ' (sem filtro)' : ''}`);

        const startRes = await fetch(prospectsStartUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        if (!startRes.ok) {
            console.warn(`⚠️ [Snov.io] Página ${page} falhou: ${startRes.status}`);
            return null;
        }

        const startData = await startRes.json();
        const taskHash  = startData.meta?.task_hash;
        if (!taskHash) {
            console.warn(`⚠️ [Snov.io] Sem task_hash na página ${page}`);
            return null;
        }

        const resultUrl = startData.links?.result ||
            `${SNOVIO_BASE_URL}/v2/domain-search/prospects/result/${taskHash}`;

        try {
            return await pollForResult(resultUrl, token);
        } catch (e) {
            console.warn(`⚠️ [Snov.io] Timeout página ${page}`);
            return null;
        }
    };

    let todosProspects: any[] = [];
    let totalCount = 0;

    // Buscar páginas em sequência (não paralelo — evita rate limit)
    for (let page = 1; page <= maxPages; page++) {
        const resultData = await buscarPagina(page, false);
        if (!resultData) break;

        const pageProspects = extrairProspects(resultData);
        totalCount = resultData.meta?.total_count || resultData.meta?.count || totalCount;

        console.log(`✅ [Snov.io] Página ${page}: ${pageProspects.length} prospects`);

        if (pageProspects.length === 0) break; // sem mais páginas

        // Deduplicar por ID
        const idsExistentes = new Set(todosProspects.map(p => p.id || `${p.first_name}|${p.last_name}`));
        const novos = pageProspects.filter(p => {
            const key = p.id || `${p.first_name}|${p.last_name}`;
            return !idsExistentes.has(key);
        });

        todosProspects.push(...novos);
        console.log(`📊 [Snov.io] Acumulado: ${todosProspects.length} prospects únicos`);

        // Se a página retornou menos de 10, provavelmente é a última
        if (pageProspects.length < 10) break;
    }

    // Fallback: se ainda está vazio, buscar sem filtro com paginação
    if (todosProspects.length === 0) {
        console.log('⚠️ [Snov.io] 0 prospects com filtro, buscando sem filtro (3 páginas)...');
        for (let page = 1; page <= maxPages; page++) {
            const resultData = await buscarPagina(page, true);
            if (!resultData) break;
            const pageProspects = extrairProspects(resultData);
            totalCount = resultData.meta?.total_count || resultData.meta?.count || totalCount;
            console.log(`✅ [Snov.io] Fallback página ${page}: ${pageProspects.length} prospects`);
            if (pageProspects.length === 0) break;
            const idsExistentes = new Set(todosProspects.map(p => p.id || `${p.first_name}|${p.last_name}`));
            const novos = pageProspects.filter(p => {
                const key = p.id || `${p.first_name}|${p.last_name}`;
                return !idsExistentes.has(key);
            });
            todosProspects.push(...novos);
            console.log(`📊 [Snov.io] Fallback acumulado: ${todosProspects.length}`);
            if (pageProspects.length < 10) break;
        }
    }

    return { prospects: todosProspects, totalCount };
}

// ============================================
// EMAIL FINDER VIA PROSPECT HASH — paralelo
// Usa search_emails_start individual por prospect (endpoint correto da documentação)
// Paralelo com Promise.all — muito mais rápido que bulk serial
// Máximo CONCURRENCY simultâneo para não sobrecarregar rate limit (60 req/min)
// ============================================
async function buscarEmailsBulk(
    token: string,
    prospects: any[],
    domain: string
): Promise<Map<string, { email: string; status: string }>> {
    const emailMap = new Map<string, { email: string; status: string }>();
    const CONCURRENCY = 5; // máx simultâneos para respeitar rate limit Snov.io

    // Função que busca email de 1 prospect via bulk finder (mais eficiente)
    const buscarEmailUm = async (p: any): Promise<void> => {
        try {
            const params = new URLSearchParams();
            params.append('rows[0][first_name]', p.primeiro_nome || '');
            params.append('rows[0][last_name]',  p.ultimo_nome || '');
            params.append('rows[0][domain]',     domain);

            const startRes = await fetch(`${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/start`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            if (!startRes.ok) return;

            const startData = await startRes.json();

            // Resposta imediata (já completed)
            if (startData.status === 'completed' && Array.isArray(startData.data)) {
                const row = startData.data[0];
                const email = row?.result?.[0]?.email || row?.email;
                if (email) {
                    const key = `${p.primeiro_nome.toLowerCase()}|${p.ultimo_nome.toLowerCase()}`;
                    emailMap.set(key, { email, status: row?.result?.[0]?.smtp_status || 'unknown' });
                    console.log(`✉️ [Snov.io] ${p.primeiro_nome} → ${email}`);
                }
                return;
            }

            const taskHash = startData.data?.task_hash || startData.meta?.task_hash;
            if (!taskHash) return;

            const resultUrl = startData.links?.result ||
                `${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/result?task_hash=${taskHash}`;

            // Poll individual: 6×3s = 18s máx por prospect
            const resultData = await pollForResult(resultUrl, token, 6, 3000);
            if (resultData.status !== 'completed' || !Array.isArray(resultData.data)) return;

            const row = resultData.data[0];
            if (!row) return;

            // Estrutura: {people: "Nome", result: [{email, smtp_status}]}
            const email = row?.result?.[0]?.email || row?.email;
            if (!email) return;

            const key = `${p.primeiro_nome.toLowerCase()}|${p.ultimo_nome.toLowerCase()}`;
            emailMap.set(key, {
                email,
                status: row?.result?.[0]?.smtp_status || 'unknown'
            });
            console.log(`✉️ [Snov.io] ${p.primeiro_nome} → ${email}`);

        } catch (err: any) {
            // Silencioso por prospect — não abortar os demais
        }
    };

    console.log(`📧 [Snov.io] Buscando emails: ${prospects.length} prospects (${CONCURRENCY} simultâneos)`);

    // Processar em lotes de CONCURRENCY simultâneos
    for (let i = 0; i < prospects.length; i += CONCURRENCY) {
        const lote = prospects.slice(i, i + CONCURRENCY);
        await Promise.all(lote.map(buscarEmailUm));
        console.log(`📧 [Snov.io] Lote ${Math.floor(i/CONCURRENCY)+1}: processado`);
    }

    console.log(`📧 [Snov.io] Total emails encontrados: ${emailMap.size}`);
    return emailMap;
}

// ============================================
// HANDLER PRINCIPAL
// ============================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const {
        domain,
        departamentos   = [],
        senioridades    = [],
        buscar_emails   = false,
        filtrar_brasil  = false   // novo: filtrar somente prospects do Brasil
    } = req.body;

    if (!domain) return res.status(400).json({ error: 'Campo "domain" é obrigatório' });

    try {
        console.log(`\n🚀 [Snov.io] === INÍCIO: ${domain} | depts: [${departamentos.join(',')}] | sen: [${senioridades.join(',')}] ===`);

        const token = await getAccessToken();

        // ETAPA 2: COMPANY INFO
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
        const companyTaskHash  = companyStartData.meta?.task_hash;
        if (!companyTaskHash) return res.status(200).json({ success: false, error: 'Sem task_hash empresa', raw: companyStartData });

        const companyResultUrl = companyStartData.links?.result ||
            `${SNOVIO_BASE_URL}/v2/domain-search/result/${companyTaskHash}`;
        const companyResult = await pollForResult(companyResultUrl, token);

        console.log(`✅ [Snov.io] Empresa: ${companyResult.data?.company_name || domain}`);

        // ETAPA 4: PROSPECTS COM PAGINAÇÃO
        const posicoes: string[] = [];
        for (const dep of departamentos) {
            const p = DEPARTAMENTO_POSICOES[dep];
            if (p) posicoes.push(...p);
        }

        const prospectsStartUrl = companyResult.links?.prospects?.includes('/start')
            ? companyResult.links.prospects
            : `${SNOVIO_BASE_URL}/v2/domain-search/prospects/start`;

        const { prospects: rawProspects, totalCount } = await buscarProspectsComPaginacao(
            token, domain, posicoes, prospectsStartUrl,
            5 // até 5 páginas (mais dados para o filtro trabalhar)
        );

        console.log(`✅ [Snov.io] Total bruto: ${rawProspects.length} | total disponível: ${totalCount}`);

        // ETAPA 5: MAPEAR
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

        // ETAPA 6: FILTRO BACKEND — país + departamento + senioridade
        let resultadosFiltrados = resultadosBrutos;

        // Filtro de país (Brasil) — se solicitado
        if (filtrar_brasil) {
            const BRASIL_KEYWORDS = ['brazil', 'brasil', 'br', 'são paulo', 'sao paulo', 'rio de janeiro',
                'belo horizonte', 'brasilia', 'brasília', 'curitiba', 'porto alegre', 'salvador',
                'recife', 'fortaleza', 'manaus', 'goiania', 'goiânia', 'campinas', 'guarulhos'];
            const antesBrasil = resultadosFiltrados.length;
            resultadosFiltrados = resultadosFiltrados.filter(r => {
                const pais   = (r.pais   || '').toLowerCase();
                const cidade = (r.cidade || '').toLowerCase();
                // Se o campo está vazio, não filtrar (Snov.io nem sempre retorna localização)
                if (!pais && !cidade) return true;
                return BRASIL_KEYWORDS.some(kw => pais.includes(kw) || cidade.includes(kw));
            });
            console.log(`🌎 [Snov.io] Após filtro Brasil: ${resultadosFiltrados.length}/${antesBrasil}`);
            // Se filtrou demais (menos que 20% do total), não aplicar — localização não confiável
            if (resultadosFiltrados.length < antesBrasil * 0.2 && antesBrasil > 5) {
                console.log(`⚠️ [Snov.io] Filtro Brasil muito restritivo (${resultadosFiltrados.length}/${antesBrasil}), dados de localização insuficientes`);
                resultadosFiltrados = resultadosBrutos;
            }
        }

        if (departamentos.length > 0) {
            resultadosFiltrados = resultadosFiltrados.filter(r =>
                cargoCorrespondeDepartamentos(r.cargo, departamentos)
            );
            console.log(`🔽 [Snov.io] Após filtro departamento: ${resultadosFiltrados.length}/${resultadosBrutos.length}`);
        }

        if (senioridades.length > 0) {
            const comSenioridade = resultadosFiltrados.filter(r =>
                cargoCorrespondeSenioridade(r.cargo, senioridades)
            );
            // Só aplica filtro de senioridade se não zerar demais
            if (comSenioridade.length >= 3) {
                resultadosFiltrados = comSenioridade;
                console.log(`🔽 [Snov.io] Após filtro senioridade: ${resultadosFiltrados.length}`);
            } else {
                console.log(`⚠️ [Snov.io] Filtro senioridade zerou (<3), mantendo filtro só de departamento`);
            }
        }

        // Proteção: se filtro deixou menos de 3, usa bruto sem filtro
        // (threshold reduzido para respeitar seleção do usuário mesmo com poucos resultados)
        const resultadosFinais = resultadosFiltrados.length >= 3
            ? resultadosFiltrados
            : resultadosBrutos;

        const filtroAplicado = resultadosFiltrados.length >= 3;

        console.log(`✅ [Snov.io] Resultados finais: ${resultadosFinais.length} | filtro aplicado: ${filtroAplicado}`);

        // ETAPA 7 (OPCIONAL): EMAIL BULK FINDER
        let creditosEmails = 0;

        if (buscar_emails && resultadosFinais.length > 0) {
            const prospectsParaEmail = resultadosFinais.slice(0, 20);
            const emailMap = await buscarEmailsBulk(token, prospectsParaEmail, domain);

            for (const prospect of prospectsParaEmail) {
                const key   = `${prospect.primeiro_nome.toLowerCase()}|${prospect.ultimo_nome.toLowerCase()}`;
                const found = emailMap.get(key);
                if (found) {
                    prospect.email        = found.email;
                    prospect.email_status = found.status;
                    prospect.enriquecido  = true;
                    creditosEmails++;
                }
            }
        }

        console.log(`\n✅ [Snov.io] === FIM: ${resultadosFinais.length} prospects | ${creditosEmails} emails ===\n`);

        return res.status(200).json({
            success:            true,
            motor:              'snovio',
            dominio:            domain,
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
