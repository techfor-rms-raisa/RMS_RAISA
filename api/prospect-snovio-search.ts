/**
 * api/prospect-snovio-search.ts
 *
 * PROSPECT DUAL ENGINE — Motor Snov.io
 * Busca prospects por domínio via Domain Search API
 *
 * Versão: 2.2
 * 
 * FIX v2.2 (sobre v2.1):
 * - Email: usa endpoint nativo search_emails_start (prospect_hash já vem na API)
 * - Email: fallback para /v2/emails-by-domain-by-name se sem prospect_hash
 * - Mapeamento: captura _search_emails_start de cada prospect
 * - Resposta: remove _search_emails_start antes de retornar ao frontend
 * - Poll email: reduzido para 8×2s (mais rápido, endpoint nativo é mais veloz)
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
// PALAVRAS-CHAVE POR DEPARTAMENTO — v2.0
// ESTRATÉGIA: keywords ESPECÍFICAS (não genéricas) para evitar falsos positivos
// Ex: "developer" sozinho pega "Supplier Developer" (supply chain) → usar "software developer"
// Ex: "system" sozinho pega "Quality System" → usar "system administrator"
// Cada keyword testada com word boundary (\b) para máxima precisão
// ============================================
const DEPARTAMENTO_KEYWORDS: Record<string, string[]> = {
    ti_tecnologia: [
        // Títulos específicos PT-BR
        'gerente de ti', 'diretor de ti', 'coordenador de ti', 'analista de ti',
        'gerente de tecnologia', 'diretor de tecnologia', 'head of ti',
        'gerente de sistemas', 'diretor de sistemas',
        'gerente de informatica', 'diretor de informatica',
        'transformacao digital', 'transformação digital',
        // Títulos EN específicos
        'it director', 'it manager', 'it coordinator', 'it analyst',
        'head of it', 'head of technology', 'head of tech',
        'director of technology', 'director of it', 'vp of technology',
        // C-Level TI
        'cto', 'cio', 'chief technology officer', 'chief information officer',
        // Especialidades técnicas específicas (não genéricas)
        'software developer', 'software engineer', 'software architect',
        'solutions architect', 'enterprise architect', 'it architect',
        'digital solutions', 'digital transformation',
        'information technology', 'information systems',
        'data analyst', 'data engineer', 'data scientist', 'data manager',
        'system administrator', 'systems administrator',
        'cloud engineer', 'cloud architect', 'devops engineer', 'devops',
        'cybersecurity', 'segurança da informação', 'information security',
        'erp manager', 'sap manager', 'sap basis',
        'tech lead', 'tecnologia da informação',
    ],
    infraestrutura: [
        // PT-BR
        'gerente de infraestrutura', 'diretor de infraestrutura',
        'coordenador de infraestrutura', 'analista de infraestrutura',
        'infraestrutura de ti', 'operações de ti',
        'gerente de datacenter', 'gerente de redes',
        'administrador de sistemas', 'administrador de redes',
        // EN
        'infrastructure manager', 'infrastructure director',
        'it operations manager', 'it operations director',
        'network manager', 'network administrator', 'network engineer',
        'datacenter manager', 'data center manager',
        'system administrator', 'systems administrator', 'sysadmin',
        'cloud infrastructure', 'infrastructure engineer',
        'helpdesk manager', 'service desk manager',
        'noc manager', 'field service manager',
        'telecom manager', 'telecommunications',
        'server administrator', 'storage administrator',
    ],
    compras_procurement: [
        // PT-BR
        'gerente de compras', 'diretor de compras', 'coordenador de compras',
        'gerente de suprimentos', 'diretor de suprimentos',
        'gerente de procurement', 'diretor de procurement',
        'superintendente de compras',
        // EN
        'procurement manager', 'procurement director', 'purchasing manager',
        'purchasing director', 'supply chain manager', 'supply chain director',
        'head of procurement', 'head of purchasing', 'vp of procurement',
        'category manager', 'sourcing manager', 'strategic sourcing',
        // C-Level
        'cpo', 'chief procurement officer',
    ],
    governanca_compliance: [
        // PT-BR
        'gerente de compliance', 'diretor de compliance',
        'gerente de governança', 'diretor de governança',
        'gerente de riscos', 'diretor de riscos',
        'gestor de riscos', 'auditor interno',
        // EN
        'compliance manager', 'compliance director', 'compliance officer',
        'governance manager', 'governance director',
        'risk manager', 'risk director', 'chief risk officer',
        'internal audit', 'audit manager',
        'dpo', 'data protection officer', 'privacy officer',
        'lgpd', 'sox manager',
        // C-Level
        'cco', 'chief compliance officer',
    ],
    rh_recursos_humanos: [
        // PT-BR
        'gerente de rh', 'diretor de rh', 'coordenador de rh',
        'gerente de recursos humanos', 'diretor de recursos humanos',
        'gerente de pessoas', 'diretor de pessoas',
        'gestão de pessoas', 'gente e gestão',
        'gerente de talentos', 'gerente de recrutamento',
        // EN
        'hr manager', 'hr director', 'human resources manager',
        'head of hr', 'head of people', 'vp of hr',
        'people manager', 'talent manager', 'talent acquisition',
        'people & culture', 'culture manager',
        // C-Level
        'chro', 'chief human resources officer', 'chief people officer',
    ],
    comercial_vendas: [
        // PT-BR
        'gerente comercial', 'diretor comercial',
        'gerente de vendas', 'diretor de vendas',
        'coordenador comercial',
        'desenvolvimento de negócios', 'desenvolvimento de negocios',
        // EN
        'sales manager', 'sales director', 'commercial manager',
        'head of sales', 'vp of sales', 'vp sales',
        'business development manager', 'account manager',
        'revenue manager', 'growth manager',
        // C-Level
        'cso', 'cro', 'chief sales officer', 'chief revenue officer',
    ],
    financeiro: [
        // PT-BR
        'gerente financeiro', 'diretor financeiro',
        'coordenador financeiro', 'controller financeiro',
        'gerente de controladoria', 'diretor de controladoria',
        'gerente de tesouraria', 'planejamento financeiro',
        // EN
        'finance manager', 'finance director', 'financial manager',
        'head of finance', 'vp of finance', 'vp finance',
        'controller', 'financial controller',
        'fp&a manager', 'treasury manager',
        // C-Level
        'cfo', 'chief financial officer',
    ],
    diretoria_clevel: [
        // C-Suite
        'ceo', 'coo', 'cto', 'cfo', 'cio', 'chro', 'cso', 'cpo', 'cro',
        'chief executive officer', 'chief operating officer',
        // Diretor/President
        'presidente executivo', 'president',
        'managing director', 'diretor geral', 'general manager',
        'country manager', 'gerente geral',
        // VP
        'vice presidente', 'vice-presidente', 'vice president',
        // Head
        'head of business', 'head of operations',
    ],
};

// Lista de termos que EXCLUEM um cargo de TI/Infraestrutura
// Evita falsos positivos como "Supplier Developer", "Quality System Director"
const EXCLUSOES_TI: string[] = [
    'supply chain', 'supplier', 'sourcing manager',
    'quality system', 'quality manager', 'quality director',
    'csr', 'corporate social',
    'operations manager', 'operations director', 'gerente de operacoes',
    'operations coordinator',
    'logistics', 'logistica',
    'merchandis', // "merchandiser", "merchandising"
];

function cargoTemExclusao(cargoLower: string, departamentos: string[]): boolean {
    // Só aplica exclusões para filtros TI/Infraestrutura
    const ehFiltroTI = departamentos.some(d => d === 'ti_tecnologia' || d === 'infraestrutura');
    if (!ehFiltroTI) return false;

    return EXCLUSOES_TI.some(ex => cargoLower.includes(ex.toLowerCase()));
}

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

    // Verificar exclusões ANTES de testar keywords positivas
    if (cargoTemExclusao(cargoLower, departamentos)) return false;

    return departamentos.some(dep => {
        const keywords = DEPARTAMENTO_KEYWORDS[dep] || [];
        // Keywords com mais de 1 palavra: usar includes simples (mais confiável)
        // Keywords de 1 palavra: usar word boundary
        return keywords.some(kw => {
            const kwl = kw.trim().toLowerCase();
            if (kwl.includes(' ')) {
                return cargoLower.includes(kwl);
            }
            return kwMatchesCargo(kwl, cargoLower);
        });
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
// EMAIL FINDER — via prospect_hash nativo (endpoint correto documentação oficial)
// Fluxo:
//   1. Cada prospect retornado pela API já tem "search_emails_start" (URL com prospect_hash)
//   2. POST {search_emails_start} → task_hash
//   3. GET /v2/domain-search/prospects/search-emails/result/{task_hash} → email
// Paralelo CONCURRENCY=5, fallback para /v2/emails-by-domain-by-name se sem prospect_hash
// ============================================
async function buscarEmailsBulk(
    token: string,
    prospects: any[],
    domain: string
): Promise<Map<string, { email: string; status: string }>> {
    const emailMap = new Map<string, { email: string; status: string }>();
    const CONCURRENCY = 5;

    const buscarEmailUm = async (p: any): Promise<void> => {
        const key = `${(p.primeiro_nome || '').toLowerCase()}|${(p.ultimo_nome || '').toLowerCase()}`;
        try {
            // ─── MÉTODO 1: prospect_hash nativo (preferido, sem custo extra) ───
            if (p._search_emails_start) {
                const startRes = await fetch(p._search_emails_start, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (startRes.ok) {
                    const startData = await startRes.json();
                    const taskHash  = startData.meta?.task_hash;
                    if (taskHash) {
                        const resultUrl = startData.links?.result ||
                            `${SNOVIO_BASE_URL}/v2/domain-search/prospects/search-emails/result/${taskHash}`;
                        // Poll: 8×2s = 16s máx
                        const resultData = await pollForResult(resultUrl, token, 8, 2000);
                        if (resultData.status === 'completed') {
                            const emails: any[] = resultData.data?.emails || [];
                            const emailEntry = emails[0];
                            if (emailEntry?.email) {
                                emailMap.set(key, { email: emailEntry.email, status: emailEntry.smtp_status || 'unknown' });
                                console.log(`✉️ [Snov.io] ${p.primeiro_nome} → ${emailEntry.email} (via prospect_hash)`);
                                return;
                            }
                        }
                    }
                }
            }

            // ─── MÉTODO 2: fallback /v2/emails-by-domain-by-name ───
            const params = new URLSearchParams();
            params.append('rows[0][first_name]', p.primeiro_nome || '');
            params.append('rows[0][last_name]',  p.ultimo_nome  || '');
            params.append('rows[0][domain]',     domain);

            const startRes = await fetch(`${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/start`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            if (!startRes.ok) return;

            const startData = await startRes.json();

            // Resposta imediata
            if (startData.status === 'completed' && Array.isArray(startData.data)) {
                const row   = startData.data[0];
                const email = row?.result?.[0]?.email || row?.email;
                if (email) {
                    emailMap.set(key, { email, status: row?.result?.[0]?.smtp_status || 'unknown' });
                    console.log(`✉️ [Snov.io] ${p.primeiro_nome} → ${email} (via name/domain)`);
                }
                return;
            }

            const taskHash = startData.data?.task_hash || startData.meta?.task_hash;
            if (!taskHash) return;

            const resultUrl = startData.links?.result ||
                `${SNOVIO_BASE_URL}/v2/emails-by-domain-by-name/result?task_hash=${taskHash}`;

            const resultData = await pollForResult(resultUrl, token, 8, 2500);
            if (resultData.status !== 'completed' || !Array.isArray(resultData.data)) return;

            const row   = resultData.data[0];
            const email = row?.result?.[0]?.email || row?.email;
            if (!email) return;

            emailMap.set(key, { email, status: row?.result?.[0]?.smtp_status || 'unknown' });
            console.log(`✉️ [Snov.io] ${p.primeiro_nome} → ${email} (via name/domain fallback)`);

        } catch {
            // Silencioso por prospect
        }
    };

    console.log(`📧 [Snov.io] Buscando emails: ${prospects.length} prospects (${CONCURRENCY} simultâneos)`);

    for (let i = 0; i < prospects.length; i += CONCURRENCY) {
        const lote = prospects.slice(i, i + CONCURRENCY);
        await Promise.all(lote.map(buscarEmailUm));
        console.log(`📧 [Snov.io] Lote ${Math.floor(i / CONCURRENCY) + 1}: processado`);
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
            snovio_id:              p.id || null,
            nome_completo:          `${p.first_name || ''} ${p.last_name || ''}`.trim(),
            primeiro_nome:          p.first_name || '',
            ultimo_nome:            p.last_name || '',
            cargo:                  p.position || p.title || '',
            email:                  p.email || null,
            email_status:           p.email_status || null,
            linkedin_url:           p.source_page || p.linkedin || p.linkedin_url || null,
            foto_url:               p.photo || p.photo_url || null,
            empresa_nome:           companyResult.data?.company_name || domain,
            empresa_dominio:        domain,
            empresa_setor:          companyResult.data?.industry || null,
            empresa_porte:          companyResult.data?.size || null,
            empresa_linkedin:       companyResult.data?.linkedin || null,
            empresa_website:        companyResult.data?.website || domain,
            cidade:                 p.locality || p.city || null,
            estado:                 p.region || null,
            pais:                   p.country || null,
            senioridade:            null,
            departamentos:          [],
            fonte:                  'snovio' as const,
            enriquecido:            false,
            // Campo nativo para busca de email via prospect_hash
            _search_emails_start:   p.search_emails_start || null,
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
            // Remover campo interno _search_emails_start antes de enviar ao frontend
            resultados: resultadosFinais.map(({ _search_emails_start, ...r }: any) => r)
        });

    } catch (error: any) {
        console.error('❌ [Snov.io] Erro geral:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
