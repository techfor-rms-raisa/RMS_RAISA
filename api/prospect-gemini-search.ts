/**
 * api/prospect-gemini-search.ts
 *
 * PROSPECT ENGINE v2.0 — Motor de Descoberta de Leads via Gemini AI
 *
 * Correções v2.1 (12/03/2026):
 * - BUG 1: Stellantis Seguros — prompt reformulado para garantir que o campo
 *   empresa_nome (unidade específica) seja a âncora principal das queries Google,
 *   não apenas uma instrução textual ignorada pelo modelo.
 * - BUG 2: Motiva/Gerente TI — DEPT_LABELS expandido com variações BR completas;
 *   SENIOR_LABELS expandido com Gerente-Executivo, Gerente Geral, Gerente Sênior;
 *   filtro pós-merge atualizado para aceitar todas as variações.
 * - BUG 3: Limite de pesquisas — max_resultados agora vem do frontend (configurável);
 *   maxPorChamada aumentado de 15 → 25; prompt instrui até 6 buscas (era 5).
 *
 * Correções v2.2 (25/03/2026):
 * - BUG 4: Resposta raw 0 chars — gemini-2.5-flash com thinkingConfig não popula
 *   result.text diretamente. Corrigido: extração robusta via candidates[0].content.parts,
 *   com fallback para result.text para compatibilidade com versões anteriores da SDK.
 *
 * Versão: 2.2
 * Data: 25/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ─── Timeout: Gemini com múltiplas Search Grounding queries pode levar ~30-50s
export const config = {
    maxDuration: 60,
};

// ─── Lazy init ────────────────────────────────────────────────────────
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY || '';
        if (!apiKey) throw new Error('API_KEY não configurada.');
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

// ─── Mapeamento de departamentos → termos de busca PT-BR (EXPANDIDO v2.1) ────
// BUG 2 FIX: TI expandido com "Tecnologia da Informação", "Technology", "IT",
// "Sistemas", "Inovação" para capturar variações do mercado brasileiro.
const DEPT_LABELS: Record<string, string> = {
    ti_tecnologia:          'TI, Tecnologia, Tecnologia da Informação, Technology, IT, Sistemas, Inovação, Digital, CTO, CIO, VP de Tecnologia',
    compras_procurement:    'Compras, Procurement, Suprimentos, Aquisições, CPO',
    infraestrutura:         'Infraestrutura, Infraestrutura de TI, Cloud, Data Center, Redes, Datacenter',
    governanca_compliance:  'Governança, Compliance, Segurança da Informação, Cybersecurity, LGPD, Auditoria',
    rh_recursos_humanos:    'Recursos Humanos, RH, People, Gente e Gestão, Gente e Cultura, Talent, CHRO',
    comercial_vendas:       'Comercial, Vendas, Revenue, Sales, Business Development, Desenvolvimento de Negócios, CSO',
    financeiro:             'Financeiro, CFO, Controladoria, Finanças, Tesouraria, Contabilidade, FP&A',
    diretoria_clevel:       'CEO, COO, Diretor Geral, Presidente, Vice-Presidente, Diretor Executivo, Managing Director',
};

// ─── Mapeamento de senioridades → termos de busca (EXPANDIDO v2.1) ───────────
// BUG 2 FIX: "gerente" agora inclui Gerente-Executivo, Gerente Geral, Gerente Sênior,
// que são terminologias amplamente usadas no mercado corporativo brasileiro.
const SENIOR_LABELS: Record<string, string> = {
    c_level:        'CEO, CTO, CIO, COO, CFO, CISO, CPO, CHRO, CMO',
    vp:             'Vice-Presidente, VP, Vice President',
    diretor:        'Diretor, Diretor Executivo, Director, Managing Director',
    gerente:        'Gerente, Manager, Gerente-Executivo, Gerente Executivo, Gerente Geral, Gerente Sênior, General Manager',
    coordenador:    'Coordenador, Coordinator, Coordenadora',
    superintendente:'Superintendente, Head, Head of, Head de',
};

// ─── Interface do resultado normalizado ──────────────────────────────
interface ProspectGemini {
    gemini_id:        string;
    nome_completo:    string;
    primeiro_nome:    string;
    ultimo_nome:      string;
    cargo:            string;
    nivel:            string;
    departamento:     string;
    linkedin_url:     string | null;
    email:            null;
    email_status:     null;
    foto_url:         null;
    empresa_nome:     string;
    empresa_dominio:  string;
    empresa_setor:    string | null;
    empresa_porte:    null;
    empresa_linkedin: null;
    empresa_website:  null;
    cidade:           string | null;
    estado:           string | null;
    pais:             string | null;
    senioridade:      string | null;
    departamentos:    string[];
    fonte:            'gemini';
    enriquecido:      false;
}

// ─── Função principal de busca ────────────────────────────────────────
async function buscarLeadsGemini(
    domain: string,
    departamentos: string[],
    senioridades: string[],
    maxResultados: number = 25,
    empresaNomeExplicito?: string
): Promise<{ resultados: ProspectGemini[]; empresa_nome: string; queries_usadas: string[] }> {

    const ai = getAI();

    const deptoTermos = departamentos.length > 0
        ? departamentos.map(d => DEPT_LABELS[d] || d).join(', ')
        : 'TI, Tecnologia, Compras, Infraestrutura, Diretoria, Financeiro, RH';

    const seniorTermos = senioridades.length > 0
        ? senioridades.map(s => SENIOR_LABELS[s] || s).join(', ')
        : 'CEO, CTO, CIO, Diretor, Gerente, VP, Head';

    // Derivar nome hint do domínio para fallback
    const empresaHintDominio = domain
        .replace(/\.(com\.br|com|org|net|io|tech|co)$/, '')
        .replace(/^www\./, '')
        .split('.')[0];

    // Âncora principal: sempre usa o nome explícito se fornecido
    const empresaAncora = empresaNomeExplicito?.trim() || empresaHintDominio;

    // ── BUG 1 FIX: Prompt reformulado ────────────────────────────────────────
    // Problema anterior: quando empresa_nome era informado (ex: "Stellantis Seguros"),
    // o Gemini ignorava o campo e gerava queries genéricas como "stellantis setor sede".
    // Solução: a âncora de busca agora é SEMPRE o empresaNomeExplicito nas queries,
    // com exemplos concretos de queries a executar usando o nome exato.
    // O domínio vira um critério de validação, não de busca.

    const instrucaoUnidade = empresaNomeExplicito?.trim()
        ? `⚠️ ATENÇÃO: O usuário busca especificamente a unidade "${empresaNomeExplicito}" dentro do grupo.
   - Use SEMPRE "${empresaNomeExplicito}" (nome exato) como termo principal das suas queries Google
   - NÃO use apenas "${empresaHintDominio}" genérico — isso traria outras unidades do grupo
   - Exemplo de query correta: "${empresaNomeExplicito}" Gerente linkedin Brasil
   - Exemplo de query ERRADA: "${empresaHintDominio}" gerente linkedin Brasil`
        : '';

    // Extrair 2-3 termos de cargo para as queries (evitar queries muito longas)
    const cargosQuery = senioridades.length > 0
        ? senioridades.map(s => {
            const label = SENIOR_LABELS[s] || s;
            // Pegar os 2 primeiros termos do label para a query
            return label.split(',').slice(0, 2).map(t => t.trim()).join(' OR ');
        }).join(' OR ')
        : 'Diretor OR Gerente OR CTO OR Head';

    const deptosQuery = departamentos.length > 0
        ? departamentos.map(d => {
            const label = DEPT_LABELS[d] || d;
            // Pegar o primeiro termo (mais específico) para a query
            return label.split(',')[0].trim();
        }).slice(0, 3).join(' OR ')
        : 'TI OR Tecnologia OR Compras';

    const prompt = `
Você é um especialista em prospecção B2B. Use o Google Search para encontrar executivos reais de "${empresaAncora}" (domínio corporativo: @${domain}).

${instrucaoUnidade}

EXECUTE ATÉ 6 BUSCAS DISTINTAS (pare ao ter ${maxResultados}+ pessoas ou ao esgotar opções):

1. site:linkedin.com/in "${empresaAncora}" (${cargosQuery})
2. "${empresaAncora}" (${cargosQuery}) linkedin Brasil
3. "${empresaAncora}" (${deptosQuery}) executivos liderança
4. "${empresaAncora}" equipe gestão diretoria site:linkedin.com
5. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} pessoas) "${empresaAncora}" profissionais ${deptosQuery} Brasil
6. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} pessoas) "${empresaAncora}" ${cargosQuery} cargo

REGRAS ABSOLUTAS:
- Use "${empresaAncora}" como âncora PRINCIPAL de TODAS as queries — é o nome que o usuário quer
- NÃO substitua o nome da empresa por sinônimos ou abreviações
- Inclua TODA pessoa encontrada, mesmo sem LinkedIn (linkedin_url fica null)
- Para LinkedIn: se encontrou na busca, use a URL. Se não, coloque null — não tente confirmar
- NÃO repita queries nem tente confirmar o mesmo nome mais de uma vez
- Não invente nomes, cargos ou URLs
- Retorne quem encontrou, mesmo que seja só 1 ou 2 pessoas

Responda SOMENTE JSON sem markdown:
{"empresa_nome":"string","empresa_setor":"string","cidade_sede":"string|null","estado_sede":"string|null","pessoas":[{"nome_completo":"string","cargo":"string","nivel":"C-Level|VP|Diretor|Gerente|Coordenador|Superintendente|Outro","departamento":"TI|Compras|Infraestrutura|Governança|RH|Comercial|Financeiro|Diretoria","linkedin_url":"https://linkedin.com/in/slug ou null","cidade":"string|null","estado":"UF|null","pais":"string"}]}
`.trim();

    console.log(`🤖 [GeminiSearch] Buscando leads: ${domain}${empresaNomeExplicito ? ` / ${empresaNomeExplicito}` : ''}`);
    console.log(`   Âncora: "${empresaAncora}" | Cargos query: ${cargosQuery.substring(0, 60)}`);
    console.log(`   Depts: ${deptoTermos.substring(0, 60)} | Sênior: ${seniorTermos.substring(0, 40)}`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.3,
            maxOutputTokens: 16000,
            // 4096: suficiente para planejar e executar 5-6 buscas Google sem loop infinito
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    // ── BUG 4 FIX: gemini-2.5-flash com thinkingConfig + Search Grounding ──────
    // result.text retorna '' quando o modelo usa thinking — o conteúdo fica em
    // candidates[0].content.parts. Extração robusta com fallback para result.text.
    let rawText = '';
    try {
        const candidates = (result as any).candidates;
        if (candidates?.[0]?.content?.parts) {
            rawText = candidates[0].content.parts
                .filter((p: any) => p.text && typeof p.text === 'string')
                .map((p: any) => p.text)
                .join('');
        }
        // Fallback: usar result.text se candidates não trouxe conteúdo
        if (!rawText && result.text) {
            rawText = result.text;
        }
    } catch {
        rawText = result.text || '';
    }
    console.log(`📦 [GeminiSearch] Resposta raw (${rawText.length} chars)`);
    if (rawText.length === 0) {
        // Log diagnóstico
        console.warn('⚠️ [GeminiSearch] Resposta vazia — estrutura result:', JSON.stringify({
            hasText:      !!result.text,
            candidates:   (result as any).candidates?.length ?? 0,
            partsCount:   (result as any).candidates?.[0]?.content?.parts?.length ?? 0,
            finishReason: (result as any).candidates?.[0]?.finishReason ?? 'N/A',
        }));
        // ── Resposta vazia: empresa não indexada ou sem dados públicos ──────────
        // Não lançar erro — retornar resultado vazio com queries para o analista usar
        const queriesVazio: string[] = [
            `site:linkedin.com/in "${empresaAncora}" (${cargosQuery})`,
            `site:linkedin.com/in "${empresaAncora}" ${deptosQuery.split(' OR ')[0]} Brasil`,
            `"${empresaAncora}" ${cargosQuery.split(' OR ')[0]} linkedin`,
        ];
        console.log(`⚠️ [GeminiSearch] Nenhum dado público encontrado para "${empresaAncora}" — retornando queries manuais`);
        return {
            resultados:    [],
            empresa_nome:  empresaAncora,
            queries_usadas: queriesVazio,
            sem_resultados: true,
        } as any;
    }

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
        // Tratar como empresa não encontrada em vez de erro 500
        const queriesFallback: string[] = [
            `site:linkedin.com/in "${empresaAncora}" (${cargosQuery})`,
            `site:linkedin.com/in "${empresaAncora}" ${deptosQuery.split(' OR ')[0]} Brasil`,
            `"${empresaAncora}" ${cargosQuery.split(' OR ')[0]} linkedin`,
        ];
        return {
            resultados:    [],
            empresa_nome:  empresaAncora,
            queries_usadas: queriesFallback,
            sem_resultados: true,
        } as any;
    }

    let parsed: any;
    try {
        // Sanitizar antes do parse:
        // 1. Remove caracteres de controle ASCII (0x00-0x1F) exceto \n \r \t
        // 2. Normaliza aspas tipográficas
        // 3. Remove null bytes
        const sanitized = jsonMatch[0]
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .replace(/\u0000/g, '');

        parsed = JSON.parse(sanitized);
    } catch (e) {
        console.error('❌ [GeminiSearch] Falha ao parsear JSON:', e);
        // Tentativa de recuperação 1: extrair array de pessoas mesmo com JSON truncado
        try {
            // Estratégia: encontrar o array "pessoas" e fechar todos os colchetes/chaves abertos
            const pessoasStart = jsonMatch[0].indexOf('"pessoas"');
            if (pessoasStart === -1) throw new Error('Campo pessoas não encontrado');

            const arrayStart = jsonMatch[0].indexOf('[', pessoasStart);
            if (arrayStart === -1) throw new Error('Array não encontrado');

            // Percorrer o array contando colchetes/chaves para extrair objetos completos
            let depth = 0;
            let lastCompleteObj = arrayStart + 1; // posição após o '['
            let inString = false;
            let escape = false;
            const src = jsonMatch[0];
            const objPositions: number[] = [arrayStart + 1];

            for (let i = arrayStart; i < src.length; i++) {
                const ch = src[i];
                if (escape) { escape = false; continue; }
                if (ch === '\\' && inString) { escape = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (inString) continue;
                if (ch === '{') depth++;
                if (ch === '}') {
                    depth--;
                    if (depth === 0) lastCompleteObj = i + 1; // marca fim do último objeto completo
                }
            }

            // Montar JSON válido com os objetos completos encontrados
            const arrayCompleto = src.substring(arrayStart, lastCompleteObj) + ']';
            const sanitizedArray = arrayCompleto
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
                .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
                .replace(/\u0000/g, '');

            parsed = { pessoas: JSON.parse(sanitizedArray) };
            console.log(`⚠️ [GeminiSearch] JSON truncado — recuperados ${parsed.pessoas.length} objetos completos`);

        } catch (e2) {
            // Tentativa de recuperação 2: regex simples como fallback final
            try {
                const pessoasMatch = jsonMatch[0].match(/"pessoas"\s*:\s*(\[[\s\S]*)/);
                if (!pessoasMatch) throw new Error('Sem array de pessoas');

                // Fechar o array no último '}' encontrado
                const partial = pessoasMatch[1];
                const lastBrace = partial.lastIndexOf('}');
                if (lastBrace === -1) throw new Error('Sem objetos completos');

                const fixedArray = partial.substring(0, lastBrace + 1) + ']';
                const sanitized2 = fixedArray
                    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');

                parsed = { pessoas: JSON.parse(sanitized2) };
                console.log(`⚠️ [GeminiSearch] Parse recuperado via fallback regex`);
            } catch {
                throw new Error('Erro ao interpretar resposta do Gemini.');
            }
        }
    }

    const pessoas: any[] = parsed.pessoas || [];
    console.log(`✅ [GeminiSearch] ${pessoas.length} pessoas encontradas`);

    const comLinkedin = pessoas.filter(p => p.linkedin_url && p.linkedin_url !== 'null').length;
    console.log(`🔗 [GeminiSearch] LinkedIn no JSON: ${comLinkedin}/${pessoas.length} pessoas`);

    // Normalizar e tipificar resultados
    const resultados: ProspectGemini[] = pessoas.map((p: any, idx: number) => {
        const nomeCompleto = (p.nome_completo || '').trim();
        const partes = nomeCompleto.split(' ');
        const primeiroNome = partes[0] || '';
        const ultimoNome   = partes.slice(1).join(' ') || '';

        // Normalizar linkedin_url
        const rawLinkedin = p.linkedin_url || p.linkedin || null;
        let linkedinNorm: string | null = null;
        if (rawLinkedin && String(rawLinkedin) !== 'null' && String(rawLinkedin).includes('linkedin')) {
            const raw = String(rawLinkedin).trim();
            if (raw.includes('linkedin.com/in/')) {
                linkedinNorm = raw.startsWith('http') ? raw : `https://www.${raw.replace(/^www\./, '')}`;
            } else if (raw.startsWith('linkedin.com')) {
                linkedinNorm = `https://www.${raw}`;
            }
            if (linkedinNorm) console.log(`🔗 [GeminiSearch] LinkedIn encontrado: ${linkedinNorm}`);
        }

        return {
            gemini_id:        `gemini_${domain}_${idx}_${Date.now()}`,
            nome_completo:    nomeCompleto,
            primeiro_nome:    primeiroNome,
            ultimo_nome:      ultimoNome,
            cargo:            (p.cargo || '').trim(),
            nivel:            p.nivel || 'Outro',
            departamento:     p.departamento || 'TI',
            linkedin_url:     linkedinNorm,
            email:            null,
            email_status:     null,
            foto_url:         null,
            empresa_nome:     parsed.empresa_nome || empresaAncora,
            empresa_dominio:  domain,
            empresa_setor:    parsed.empresa_setor || null,
            empresa_porte:    null,
            empresa_linkedin: null,
            empresa_website:  null,
            cidade:           p.cidade && p.cidade !== 'null' ? p.cidade : null,
            estado:           p.estado && p.estado !== 'null' ? p.estado : null,
            pais:             p.pais || 'Brasil',
            senioridade:      p.nivel || null,
            departamentos:    [p.departamento || 'ti_tecnologia'],
            fonte:            'gemini',
            enriquecido:      false,
        };
    });

    // Extrair queries usadas pelo grounding
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesGrounding: string[] = groundingMeta?.webSearchQueries || [];
    console.log(`🔍 [GeminiSearch] Google queries: ${queriesGrounding.join(' | ')}`);

    // ── Gerar queries booleanas com site:linkedin.com/in para a Extension P ──
    // Estas queries são exibidas no painel como sugestão para o analista
    // abrir no Google e usar a Extension para capturar leads adicionais.
    const queriesExtension: string[] = [
        `site:linkedin.com/in "${empresaAncora}" (${cargosQuery})`,
        `site:linkedin.com/in "${empresaAncora}" ${deptosQuery.split(' OR ')[0]} Brasil`,
    ];

    // Combina: queries booleanas p/ Extension primeiro, depois as do grounding
    const queriesUsadas: string[] = [
        ...queriesExtension,
        ...queriesGrounding.filter(q =>
            !queriesExtension.some(e => e.toLowerCase() === q.toLowerCase())
        ),
    ];

    return {
        resultados,
        empresa_nome:   parsed.empresa_nome || empresaAncora,
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
        max_resultados  = 25,   // BUG 3 FIX: padrão aumentado de 20 → 25
    } = req.body;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'domain é obrigatório.' });
    }

    try {
        const domainClean = domain.trim().toLowerCase();

        // Sanitizar empresa_nome
        const empresaNomeLimpo = empresa_nome
            ? empresa_nome
                .trim()
                .replace(/\.(com\.br|com|org|net|io|tech|co\.uk|br)$/i, '')
                .trim()
            : undefined;

        // BUG 3 FIX: maxPorChamada aumentado de 15 → 25 para permitir mais resultados
        const maxPorChamada = Math.min(Math.max(max_resultados || 25, 10), 50);

        // ── Estratégia de divisão inteligente ────────────────────────────────
        // REGRA: NUNCA expandir filtros além do que o usuário selecionou.

        const SENIOR_ALTOS  = ['c_level', 'vp', 'diretor'];
        const SENIOR_OPERAC = ['gerente', 'superintendente', 'coordenador'];

        let chamadaA: { depts: string[], seniorities: string[] };
        let chamadaB: { depts: string[], seniorities: string[] } | null = null;
        let estrategia: string;

        const temSenioridade = senioridades.length > 0;
        const temDept        = departamentos.length > 0;

        if (temSenioridade && departamentos.length >= 2) {
            // CASO 1: múltiplos deptos → divide por depto, senioridade fixa em ambas
            const meio = Math.ceil(departamentos.length / 2);
            chamadaA   = { depts: departamentos.slice(0, meio), seniorities: senioridades };
            chamadaB   = { depts: departamentos.slice(meio),    seniorities: senioridades };
            estrategia = `depto-split [${chamadaA.depts}] + [${chamadaB.depts}]`;

        } else if (temSenioridade && !temDept) {
            // CASO 2a: senioridade + sem depto → 1 chamada
            chamadaA   = { depts: [], seniorities: senioridades };
            chamadaB   = null;
            estrategia = `senior-unica (${senioridades.join(',')})`;

        } else if (temSenioridade && temDept) {
            // CASO 2b: senioridade + 1 depto → 1 chamada
            chamadaA   = { depts: departamentos, seniorities: senioridades };
            chamadaB   = null;
            estrategia = `senior+dept-unica (${senioridades.join(',')}) [${departamentos.join(',')}]`;

        } else if (!temSenioridade && !temDept) {
            // CASO 3: sem filtro → divide por senioridade padrão
            chamadaA   = { depts: [], seniorities: SENIOR_ALTOS };
            chamadaB   = { depts: [], seniorities: SENIOR_OPERAC };
            estrategia = `aberta: A[altos] B[operacionais]`;

        } else {
            // CASO 4: só depto, sem senioridade → divide por senioridade padrão
            chamadaA   = { depts: departamentos, seniorities: SENIOR_ALTOS };
            chamadaB   = { depts: departamentos, seniorities: SENIOR_OPERAC };
            estrategia = `dept+senior-split [${departamentos.join(',')}]`;
        }

        console.log(`🚀 [GeminiSearch] Estratégia: ${estrategia}`);
        console.log(`   Domínio: ${domainClean}${empresaNomeLimpo ? ` / ${empresaNomeLimpo}` : ''}`);
        console.log(`   Max resultados: ${maxPorChamada}`);
        if (empresa_nome !== empresaNomeLimpo) {
            console.log(`   ⚠️ empresa_nome sanitizado: "${empresa_nome}" → "${empresaNomeLimpo}"`);
        }

        let listA: ProspectGemini[] = [];
        let listB: ProspectGemini[] = [];
        let nomeA = '', nomeB = '';
        let qrsA:  string[] = [], qrsB: string[] = [];

        if (chamadaB === null) {
            try {
                const resultado = await buscarLeadsGemini(
                    domainClean, chamadaA.depts, chamadaA.seniorities, maxPorChamada, empresaNomeLimpo
                );
                listA = resultado.resultados;
                nomeA = resultado.empresa_nome;
                qrsA  = resultado.queries_usadas;
                // Propagar flag sem_resultados para uso no retorno
                if ((resultado as any).sem_resultados) {
                    (listA as any).sem_resultados = true;
                }
            } catch (e: any) {
                console.warn('⚠️ [GeminiSearch] Chamada falhou:', e.message);
                throw e;
            }
        } else {
            const [resA, resB] = await Promise.allSettled([
                buscarLeadsGemini(domainClean, chamadaA.depts, chamadaA.seniorities, maxPorChamada, empresaNomeLimpo),
                buscarLeadsGemini(domainClean, chamadaB.depts, chamadaB.seniorities, maxPorChamada, empresaNomeLimpo),
            ]);

            if (resA.status === 'fulfilled') { listA = resA.value.resultados; nomeA = resA.value.empresa_nome; qrsA = resA.value.queries_usadas; }
            if (resB.status === 'fulfilled') { listB = resB.value.resultados; nomeB = resB.value.empresa_nome; qrsB = resB.value.queries_usadas; }
            if (resA.status === 'rejected') console.warn('⚠️ [GeminiSearch] Chamada A:', (resA as PromiseRejectedResult).reason?.message);
            if (resB.status === 'rejected') console.warn('⚠️ [GeminiSearch] Chamada B:', (resB as PromiseRejectedResult).reason?.message);
        }

        // ── Filtro pós-merge (EXPANDIDO v2.1) ────────────────────────────────
        // BUG 2 FIX: aceita variações como "Gerente-Executivo", "Gerente Geral",
        // "Head of", etc., que agora estão no SENIOR_LABELS expandido.
        let merged = deduplicar([...listA, ...listB]);
        if (temSenioridade) {
            const termosAceitos: string[] = [];
            senioridades.forEach((s: string) => {
                const label = SENIOR_LABELS[s] || s;
                label.split(',').forEach((t: string) => {
                    const termo = t.trim().toLowerCase();
                    termosAceitos.push(termo);
                    // Também aceita variações com hífen/espaço
                    // Ex: "gerente executivo" aceita "gerente-executivo" e vice-versa
                    termosAceitos.push(termo.replace(/-/g, ' '));
                    termosAceitos.push(termo.replace(/ /g, '-'));
                });
                // Também aceitar o próprio key
                termosAceitos.push(s.replace(/_/g, ' ').toLowerCase());
            });

            const antes = merged.length;
            merged = merged.filter(p => {
                const nivelLower = (p.nivel || '').toLowerCase();
                const cargoLower = (p.cargo  || '').toLowerCase();
                return termosAceitos.some(t =>
                    nivelLower.includes(t) || cargoLower.includes(t)
                );
            });
            if (antes !== merged.length) {
                console.log(`🔍 [GeminiSearch] Filtro pós-merge: ${antes} → ${merged.length} (removidos ${antes - merged.length} fora do nível)`);
            }
        }

        const empresaNomeFinal = nomeA || nomeB || empresaNomeLimpo || domain;
        const queriesAll       = [...new Set([...qrsA, ...qrsB])];

        console.log(`✅ [GeminiSearch] A: ${listA.length} | B: ${listB.length} | Final: ${merged.length} únicos`);

        // Verificar se alguma das chamadas sinalizou sem_resultados
        const semResultados = merged.length === 0 && (
            (resA as any)?.value?.sem_resultados ||
            (resB as any)?.value?.sem_resultados ||
            listA.length === 0 && listB.length === 0
        );

        return res.status(200).json({
            success:             true,
            resultados:          merged,
            total:               merged.length,
            empresa:             { nome: empresaNomeFinal, dominio: domain },
            queries_google:      queriesAll,
            motor:               'gemini',
            creditos_consumidos: 0,
            sem_resultados:      merged.length === 0,
            aviso:               merged.length === 0
                ? `Nenhum executivo encontrado para "${empresaNomeFinal}". O domínio pode ter poucos dados públicos indexados. Use as queries abaixo para buscar manualmente no Google.`
                : undefined,
        });

    } catch (error: any) {
        console.error('❌ [GeminiSearch] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar leads via Gemini',
        });
    }
}

