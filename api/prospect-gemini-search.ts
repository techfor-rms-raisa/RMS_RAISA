/**
 * api/prospect-gemini-search.ts
 *
 * PROSPECT ENGINE v2.0 — Motor de Descoberta de Leads via Gemini AI
 * Substitui: prospect-snovio-search.ts
 *
 * Estratégia:
 * - Usa Gemini 2.5 Flash + Google Search Grounding (nativo)
 * - Busca executivos/decisores por domínio, departamento e senioridade
 * - Retorna lista estruturada com nome, cargo, LinkedIn, nível
 * - SEM login no LinkedIn → dados públicos indexados pelo Google
 * - Custo: ~$0,003–$0,018 por busca (dentro do free tier de 1.500/dia)
 *
 * Versão: 1.0
 * Data: 05/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ─── Timeout: Gemini com múltiplas Search Grounding queries pode levar ~30-50s
export const config = {
    maxDuration: 60,
};

// ─── Lazy init (padrão do gemini-analyze.ts) ─────────────────────────
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY || '';
        if (!apiKey) throw new Error('API_KEY não configurada.');
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

// ─── Mapeamento de departamentos → termos de busca em PT-BR ──────────
const DEPT_LABELS: Record<string, string> = {
    ti_tecnologia:          'TI, Tecnologia, CTO, CIO, VP de Tecnologia',
    compras_procurement:    'Compras, Procurement, Suprimentos, CPO',
    infraestrutura:         'Infraestrutura de TI, Cloud, Data Center',
    governanca_compliance:  'Governança, Compliance, Segurança da Informação',
    rh_recursos_humanos:    'Recursos Humanos, RH, People, CHRO',
    comercial_vendas:       'Comercial, Vendas, Revenue, CSO',
    financeiro:             'Financeiro, CFO, Controladoria, Tesouraria',
    diretoria_clevel:       'CEO, COO, Diretor Geral, Presidente, Vice-Presidente',
};

const SENIOR_LABELS: Record<string, string> = {
    c_level:        'CEO, CTO, CIO, COO, CFO, CISO, CPO',
    vp:             'Vice-Presidente, VP',
    diretor:        'Diretor, Director',
    gerente:        'Gerente, Manager',
    coordenador:    'Coordenador, Coordinator',
    superintendente:'Superintendente, Head',
};

// ─── Interface do resultado normalizado ──────────────────────────────
interface ProspectGemini {
    gemini_id:      string;       // hash local para controle
    nome_completo:  string;
    primeiro_nome:  string;
    ultimo_nome:    string;
    cargo:          string;
    nivel:          string;       // C-Level | VP | Diretor | Gerente | etc.
    departamento:   string;
    linkedin_url:   string | null;
    email:          null;         // preenchido pelo Hunter.io depois
    email_status:   null;
    foto_url:       null;
    empresa_nome:   string;
    empresa_dominio:string;
    empresa_setor:  string | null;
    empresa_porte:  null;
    empresa_linkedin: null;
    empresa_website:  null;
    cidade:         string | null;
    estado:         string | null;
    pais:           string | null;
    senioridade:    string | null;
    departamentos:  string[];
    fonte:          'gemini';
    enriquecido:    false;
}

// ─── Função principal de busca ────────────────────────────────────────
async function buscarLeadsGemini(
    domain: string,
    departamentos: string[],
    senioridades: string[],
    maxResultados: number = 20,
    empresaNomeExplicito?: string   // ← desambiguador: "Banco Carrefour" vs "Carrefour Varejo"
): Promise<{ resultados: ProspectGemini[]; empresa_nome: string; queries_usadas: string[] }> {

    const ai = getAI();

    // Montar termos de busca a partir dos filtros
    const deptoTermos = departamentos.length > 0
        ? departamentos.map(d => DEPT_LABELS[d] || d).join(', ')
        : 'TI, Tecnologia, Compras, Infraestrutura, Diretoria';

    const seniorTermos = senioridades.length > 0
        ? senioridades.map(s => SENIOR_LABELS[s] || s).join(', ')
        : 'CEO, CTO, CIO, Diretor, Gerente, VP';

    // Nome da empresa: usa o explícito se informado, senão deriva do domínio
    const empresaHint = empresaNomeExplicito?.trim() ||
        domain
            .replace(/\.(com\.br|com|org|net|io|tech|co)$/, '')
            .replace(/^www\./, '')
            .split('.')[0];

    // Instrução de desambiguação — só ativa quando usuário informou nome explícito
    const desambiguacaoInstrucao = empresaNomeExplicito?.trim()
        ? `IMPORTANTE: busque APENAS executivos de "${empresaNomeExplicito}" — ignore outras unidades do grupo ${empresaHint}.`
        : '';

    const prompt = `
Você é um especialista em prospecção B2B. Use o Google Search para encontrar executivos reais de "${empresaNomeExplicito || empresaHint}" (email: @${domain}).

${desambiguacaoInstrucao}

EXECUTE ESTAS BUSCAS (nesta ordem):
1. site:linkedin.com/in "${empresaNomeExplicito || empresaHint}" ${seniorTermos.split(',').slice(0,3).join(' OR ')}
2. site:linkedin.com/in "${empresaNomeExplicito || empresaHint}" ${deptoTermos.split(',').slice(0,3).join(' OR ')}
3. "${empresaNomeExplicito || empresaHint}" executivos TI tecnologia liderança Brasil linkedin

REGRAS:
- META: retorne entre 10 e ${maxResultados} pessoas — não pare com menos de 10
- Para cada nome encontrado, tente localizar o perfil linkedin.com/in/* e inclua a URL completa
- Inclua a pessoa mesmo que não tenha LinkedIn — campo fica null
- Nivéis aceitos: ${seniorTermos}
- Departamentos aceitos: ${deptoTermos}
- Não invente nomes, cargos ou URLs

Responda SOMENTE JSON sem markdown:
{"empresa_nome":"string","empresa_setor":"string","cidade_sede":"string|null","estado_sede":"string|null","pessoas":[{"nome_completo":"string","cargo":"string","nivel":"C-Level|VP|Diretor|Gerente|Coordenador|Superintendente|Outro","departamento":"TI|Compras|Infraestrutura|Governança|RH|Comercial|Financeiro|Diretoria","linkedin_url":"https://linkedin.com/in/... ou null","cidade":"string|null","estado":"UF|null","pais":"string"}]}
`.trim();

    console.log(`🤖 [GeminiSearch] Buscando leads: ${domain}${empresaNomeExplicito ? ` / ${empresaNomeExplicito}` : ''}`);
    console.log(`   Depts: ${deptoTermos.substring(0, 60)} | Sênior: ${seniorTermos.substring(0, 40)}`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',  // único modelo 2.5 com Search Grounding suportado
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.2,
            maxOutputTokens: 8192,
            // thinkingBudget não definido = Gemini decide quanto pensar
            // temperature baixa (0.2) já reduz o tempo de resposta significativamente
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [GeminiSearch] Resposta raw (${rawText.length} chars)`);

    // Parse defensivo — remove markdown se vier
    const cleanText = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

    // Extrai bloco JSON
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('❌ [GeminiSearch] Nenhum JSON válido na resposta');
        console.error('Raw:', rawText.substring(0, 500));
        throw new Error('Gemini não retornou JSON válido. Tente novamente.');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error('❌ [GeminiSearch] Falha ao parsear JSON:', e);
        throw new Error('Erro ao interpretar resposta do Gemini.');
    }

    const pessoas: any[] = parsed.pessoas || [];
    console.log(`✅ [GeminiSearch] ${pessoas.length} pessoas encontradas`);

    // Log diagnóstico: quantas têm linkedin_url no JSON bruto
    const comLinkedin = pessoas.filter(p => p.linkedin_url && p.linkedin_url !== 'null').length;
    console.log(`🔗 [GeminiSearch] LinkedIn no JSON: ${comLinkedin}/${pessoas.length} pessoas`);

    // Normalizar e tipificar resultados
    const resultados: ProspectGemini[] = pessoas.map((p: any, idx: number) => {
        const nomeCompleto = (p.nome_completo || '').trim();
        const partes = nomeCompleto.split(' ');
        const primeiroNome = partes[0] || '';
        const ultimoNome  = partes.slice(1).join(' ') || '';

        // Normalizar linkedin_url — aceita múltiplos formatos
        const rawLinkedin = p.linkedin_url || p.linkedin || null;
        let linkedinNorm: string | null = null;
        if (rawLinkedin && String(rawLinkedin) !== 'null' && String(rawLinkedin).includes('linkedin')) {
            const raw = String(rawLinkedin).trim();
            if (raw.includes('linkedin.com/in/')) {
                linkedinNorm = raw.startsWith('http') ? raw : `https://www.${raw.replace(/^www\./, '')}`;
            } else if (raw.startsWith('linkedin.com')) {
                linkedinNorm = `https://www.${raw}`;
            }
            // Log apenas quando há URL para monitorar qualidade
            if (linkedinNorm) console.log(`🔗 [GeminiSearch] LinkedIn encontrado: ${linkedinNorm}`);
        }

        return {
            gemini_id:      `gemini_${domain}_${idx}_${Date.now()}`,
            nome_completo:  nomeCompleto,
            primeiro_nome:  primeiroNome,
            ultimo_nome:    ultimoNome,
            cargo:          (p.cargo || '').trim(),
            nivel:          p.nivel || 'Outro',
            departamento:   p.departamento || 'TI',
            linkedin_url:   linkedinNorm,
            email:          null,
            email_status:   null,
            foto_url:       null,
            empresa_nome:   parsed.empresa_nome || empresaHint,
            empresa_dominio: domain,
            empresa_setor:  parsed.empresa_setor || null,
            empresa_porte:  null,
            empresa_linkedin: null,
            empresa_website:  null,
            cidade:         p.cidade && p.cidade !== 'null' ? p.cidade : null,
            estado:         p.estado && p.estado !== 'null' ? p.estado : null,
            pais:           p.pais || 'Brasil',
            senioridade:    p.nivel || null,
            departamentos:  [p.departamento || 'ti_tecnologia'],
            fonte:          'gemini',
            enriquecido:    false,
        };
    });

    // Extrair queries usadas pelo grounding (para log/debug)
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];
    console.log(`🔍 [GeminiSearch] Google queries: ${queriesUsadas.join(' | ')}`);

    return {
        resultados,
        empresa_nome: parsed.empresa_nome || empresaHint,
        queries_usadas: queriesUsadas,
    };
}

// ─── Deduplicação por nome normalizado ───────────────────────────────
function deduplicar(lista: ProspectGemini[]): ProspectGemini[] {
    const vistos = new Set<string>();
    return lista.filter(p => {
        const chave = p.nome_completo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

// ─── HANDLER ─────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const {
        domain,
        empresa_nome,
        departamentos   = [],
        senioridades    = [],
        max_resultados  = 20,
    } = req.body;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'domain é obrigatório.' });
    }

    try {
        const domainClean = domain.trim().toLowerCase();

        // ── Sanitizar empresa_nome: remover extensões de domínio acidentais ──
        // Ex: "Banco Carrefour.com" → "Banco Carrefour"
        const empresaNomeLimpo = empresa_nome
            ? empresa_nome
                .trim()
                .replace(/\.(com\.br|com|org|net|io|tech|co\.uk|br)$/i, '')
                .trim()
            : undefined;

        const maxPorChamada = 15;

        // ── Estratégia de divisão inteligente ────────────────────────────────
        //
        // REGRA PRINCIPAL: NUNCA expandir filtros além do que o usuário selecionou.
        // Se o usuário escolheu "Diretor", só buscar Diretores — não gerentes, não C-Level.
        //
        // CASO 1 — Senioridade(s) selecionada(s) + múltiplos departamentos:
        //   Divide por departamento, mantém senioridade exata em ambas
        //   Ex: Diretor + [TI, Infra] → A: Diretor+TI | B: Diretor+Infra
        //
        // CASO 2 — Senioridade(s) selecionada(s) + 0 ou 1 departamento:
        //   Ambas as chamadas usam a MESMA senioridade selecionada
        //   Chamada A: foco em cargos exatos | Chamada B: variações do cargo
        //   Ex: Diretor → A: Diretor+TI | B: Diretor+variações de área
        //
        // CASO 3 — Nenhum filtro (busca aberta):
        //   Divide por senioridade padrão altos vs operacionais

        const SENIOR_ALTOS  = ['c_level', 'vp', 'diretor'];
        const SENIOR_OPERAC = ['gerente', 'superintendente', 'coordenador'];

        let chamadaA: { depts: string[], seniorities: string[] };
        let chamadaB: { depts: string[], seniorities: string[] } | null = null;
        let estrategia: string;

        const temSenioridade = senioridades.length > 0;
        const temDept        = departamentos.length > 0;

        if (temSenioridade && departamentos.length >= 2) {
            // CASO 1: múltiplos deptos → divide por depto, senioridade fixa em ambas
            const meio   = Math.ceil(departamentos.length / 2);
            chamadaA  = { depts: departamentos.slice(0, meio), seniorities: senioridades };
            chamadaB  = { depts: departamentos.slice(meio),    seniorities: senioridades };
            estrategia = `depto-split [${chamadaA.depts}] + [${chamadaB.depts}]`;

        } else if (temSenioridade && !temDept) {
            // CASO 2a: senioridade + sem depto → 1 chamada apenas (evita timeout com 2 iguais)
            chamadaA  = { depts: [], seniorities: senioridades };
            chamadaB  = null; // ← chamada única
            estrategia = `senior-unica (${senioridades.join(',')})`;

        } else if (temSenioridade && temDept) {
            // CASO 2b: senioridade + 1 depto → 1 chamada (parâmetros idênticos não justificam 2)
            chamadaA  = { depts: departamentos, seniorities: senioridades };
            chamadaB  = null; // ← chamada única
            estrategia = `senior+dept-unica (${senioridades.join(',')}) [${departamentos.join(',')}]`;

        } else if (!temSenioridade && !temDept) {
            // CASO 3: sem filtro → divide por senioridade padrão
            chamadaA  = { depts: [], seniorities: SENIOR_ALTOS };
            chamadaB  = { depts: [], seniorities: SENIOR_OPERAC };
            estrategia = `aberta: A[altos] B[operacionais]`;

        } else {
            // CASO 4: só depto, sem senioridade → divide por senioridade padrão
            chamadaA  = { depts: departamentos, seniorities: SENIOR_ALTOS };
            chamadaB  = { depts: departamentos, seniorities: SENIOR_OPERAC };
            estrategia = `dept+senior-split [${departamentos.join(',')}]`;
        }

        console.log(`🚀 [GeminiSearch] Estratégia: ${estrategia}`);
        console.log(`   Domínio: ${domainClean}${empresaNomeLimpo ? ` / ${empresaNomeLimpo}` : ''}`);
        if (empresa_nome !== empresaNomeLimpo) {
            console.log(`   ⚠️ empresa_nome sanitizado: "${empresa_nome}" → "${empresaNomeLimpo}"`);
        }

        let listA: ProspectGemini[] = [];
        let listB: ProspectGemini[] = [];
        let nomeA = '', nomeB = '';
        let qrsA:  string[] = [], qrsB: string[] = [];

        if (chamadaB === null) {
            // ── Chamada única — sem wrapper de timeout (Vercel controla os 60s) ──
            try {
                const res = await buscarLeadsGemini(
                    domainClean, chamadaA.depts, chamadaA.seniorities, maxPorChamada, empresaNomeLimpo
                );
                listA = res.resultados;
                nomeA = res.empresa_nome;
                qrsA  = res.queries_usadas;
            } catch (e: any) {
                console.warn('⚠️ [GeminiSearch] Chamada falhou:', e.message);
                // Retorna vazio mas não estoura — o catch do handler vai responder 500
                throw e;
            }
        } else {
            // ── Dual paralelo — sem wrapper de timeout ─────────────────────────
            const [resA, resB] = await Promise.allSettled([
                buscarLeadsGemini(domainClean, chamadaA.depts, chamadaA.seniorities, maxPorChamada, empresaNomeLimpo),
                buscarLeadsGemini(domainClean, chamadaB.depts, chamadaB.seniorities, maxPorChamada, empresaNomeLimpo),
            ]);

            if (resA.status === 'fulfilled') { listA = resA.value.resultados; nomeA = resA.value.empresa_nome; qrsA = resA.value.queries_usadas; }
            if (resB.status === 'fulfilled') { listB = resB.value.resultados; nomeB = resB.value.empresa_nome; qrsB = resB.value.queries_usadas; }
            if (resA.status === 'rejected') console.warn('⚠️ [GeminiSearch] Chamada A:', (resA as PromiseRejectedResult).reason?.message);
            if (resB.status === 'rejected') console.warn('⚠️ [GeminiSearch] Chamada B:', (resB as PromiseRejectedResult).reason?.message);
        }

        // Filtra pós-merge: se havia filtro de senioridade, remove quem fugiu dele
        let merged = deduplicar([...listA, ...listB]);
        if (temSenioridade) {
            const niveisPermitidos = new Set(
                senioridades.map((s: string) => (SENIOR_LABELS[s] || s).split(',').map((t: string) => t.trim().toLowerCase())).flat()
            );
            const antes = merged.length;
            merged = merged.filter(p => {
                const nivelLower = (p.nivel || '').toLowerCase();
                // Aceita se o nivel bate com algum dos selecionados
                return senioridades.some((s: string) => {
                    const label = (SENIOR_LABELS[s] || '').toLowerCase();
                    return nivelLower.includes(s.replace('_', '-')) ||
                           label.split(',').some((t: string) => nivelLower.includes(t.trim().toLowerCase()));
                });
            });
            if (antes !== merged.length) {
                console.log(`🔍 [GeminiSearch] Filtro pós-merge: ${antes} → ${merged.length} (removidos ${antes - merged.length} fora do nível)`);
            }
        }

        const empresaNome = nomeA || nomeB || empresaNomeLimpo || domain;
        const queriesAll  = [...new Set([...qrsA, ...qrsB])];

        console.log(`✅ [GeminiSearch] A: ${listA.length} | B: ${listB.length} | Final: ${merged.length} únicos`);

        return res.status(200).json({
            success:             true,
            resultados:          merged,
            total:               merged.length,
            empresa:             { nome: empresaNome, dominio: domain },
            queries_google:      queriesAll,
            motor:               'gemini',
            creditos_consumidos: 0,
        });

    } catch (error: any) {
        console.error('❌ [GeminiSearch] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar leads via Gemini',
        });
    }
}
