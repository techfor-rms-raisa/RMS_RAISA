/**
 * api/talent-finder-search.ts
 *
 * TALENT FINDER — Motor de Busca de Candidatos via Gemini AI + Google Search
 *
 * Versão: 2.0 — Arquitetura multi-etapas (baseada em análise Manus AI 13/03/2026)
 *
 * Fluxo v2.0:
 * ETAPA 1 — Gemini sem Search: analisa requisitos e gera queries booleanas otimizadas
 * ETAPA 2 — Gemini com Google Search Grounding: executa as queries geradas na Etapa 1
 * ETAPA 3 — (Opcional) Se resultado < metade do esperado: refinamento com novas queries
 *
 * Melhorias vs v1.x:
 * - Eliminada a função extrairAncoras() (heurística frágil) → IA gera as queries
 * - Operadores booleanos avançados: OR, AND, site:, intitle:, inurl:
 * - Separação de responsabilidades: LLM de planejamento ≠ LLM de busca
 * - Loop de refinamento automático quando resultado < 50% do esperado
 * - Sem sobrecarga cognitiva: cada chamada tem uma única responsabilidade
 *
 * Data: 13/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export const config = {
    maxDuration: 60,
};

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY || '';
        if (!apiKey) throw new Error('API_KEY não configurada.');
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

export interface CandidatoEncontrado {
    finder_id:     string;
    nome_completo: string;
    cargo_atual:   string;
    empresa_atual: string | null;
    linkedin_url:  string | null;
    cidade:        string | null;
    estado:        string | null;
    resumo:        string | null;
    relevancia:    'alta' | 'media' | 'baixa';
}

// ════════════════════════════════════════════════════════════════════
// ETAPA 1 — Geração de queries booleanas via LLM (SEM Google Search)
// Responsabilidade única: analisar requisitos e gerar queries otimizadas
// ════════════════════════════════════════════════════════════════════
async function gerarQueriesBooleanas(
    requisitos: string,
    maxResultados: number
): Promise<string[]> {

    const ai = getAI();

    const prompt = `
Você é um especialista em sourcing de talentos e Boolean Search para LinkedIn.

Sua tarefa é gerar queries de busca para o Google que encontrem profissionais no LinkedIn com os seguintes requisitos:

REQUISITOS DA VAGA:
"${requisitos}"

REGRAS PARA GERAR AS QUERIES:
1. Use o operador site:linkedin.com/in para focar em perfis do LinkedIn
2. Use operadores booleanos: OR para variações de cargo/tecnologia, AND para combinar requisitos obrigatórios
3. Use aspas para termos compostos: "React Native", "Front End", "Analista de Testes"
4. Inclua variações de cargo: PT-BR e inglês (ex: "Analista de Testes" OR "QA Engineer" OR "Test Engineer")
5. Inclua sinônimos de tecnologias quando relevante
6. Inclua a localização quando mencionada nos requisitos
7. Gere queries do mais específico (todos os requisitos) ao mais amplo (requisitos principais apenas)

FORMATO DE SAÍDA — retorne APENAS um JSON puro sem markdown:
{"queries":["query1","query2","query3","query4","query5","query6"]}

Gere exatamente 6 queries, sendo:
- Queries 1-3: específicas (combinam cargo + tecnologias principais + localização)
- Queries 4-5: intermediárias (cargo + tecnologia principal, sem localização restritiva)  
- Query 6: ampla (cargo principal + Brasil, para fallback se as outras falharem)
`.trim();

    console.log(`🧠 [TalentFinder] ETAPA 1 — Gerando queries booleanas para: ${requisitos.substring(0, 60)}...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',   // modelo rápido — tarefa de planejamento, sem search
        contents: prompt,
        config: {
            temperature: 0.2,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
        }
    });

    const rawText = result.text || '';
    console.log(`📋 [TalentFinder] ETAPA 1 — Queries geradas (${rawText.length} chars)`);

    try {
        const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        const queries: string[] = parsed.queries || [];

        if (queries.length === 0) throw new Error('Nenhuma query gerada');

        console.log(`✅ [TalentFinder] ETAPA 1 — ${queries.length} queries geradas:`);
        queries.forEach((q, i) => console.log(`   ${i + 1}. ${q.substring(0, 100)}`));

        return queries;
    } catch (e) {
        console.error('⚠️ [TalentFinder] ETAPA 1 — Falha no parse, usando fallback básico');
        // Fallback: queries simples se o parse falhar
        const termos = requisitos.split(/[\s,]+/).slice(0, 4).join(' ');
        return [
            `site:linkedin.com/in ${termos} Brasil`,
            `${termos} linkedin profissional Brasil`,
        ];
    }
}

// ════════════════════════════════════════════════════════════════════
// ETAPA 2 — Busca com Google Search Grounding usando as queries da Etapa 1
// Responsabilidade única: executar buscas e extrair candidatos
// ════════════════════════════════════════════════════════════════════
async function executarBuscaComQueries(
    requisitos: string,
    queries: string[],
    maxResultados: number
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[] }> {

    const ai = getAI();

    // Monta o bloco de queries numeradas para o prompt
    const queriesFormatadas = queries
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n');

    const prompt = `
Você é um especialista em recrutamento. Use o Google Search para encontrar profissionais reais no LinkedIn.

REQUISITOS DA VAGA (para avaliar relevância):
"${requisitos}"

EXECUTE ESTAS BUSCAS EM ORDEM (pare ao ter ${maxResultados}+ candidatos ou ao esgotar a lista):
${queriesFormatadas}

REGRAS ABSOLUTAS:
- Inclua APENAS pessoas reais encontradas nas buscas — JAMAIS invente nomes, cargos ou URLs
- Não repita o mesmo profissional mesmo que apareça em múltiplas buscas
- Para LinkedIn: use a URL exata encontrada. Se não encontrou URL, coloque linkedin_url: null
- Avalie relevância vs os requisitos: "alta" = atende os requisitos principais, "media" = atende parcialmente, "baixa" = atende apenas alguns
- Inclua empresa_atual, cidade, estado se visíveis no perfil; caso contrário null
- Retorne quem encontrou mesmo que seja 1 ou 2 pessoas

Responda SOMENTE JSON puro sem markdown:
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string ou null","linkedin_url":"https://linkedin.com/in/slug ou null","cidade":"string ou null","estado":"UF ou null","resumo":"resumo em 1 frase do perfil ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🔍 [TalentFinder] ETAPA 2 — Executando busca com ${queries.length} queries via Google Search Grounding`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.3,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [TalentFinder] ETAPA 2 — Resposta raw (${rawText.length} chars)`);

    if (rawText.length < 20) {
        console.error('❌ [TalentFinder] ETAPA 2 — Resposta muito curta:', JSON.stringify(rawText));
        return { resultados: [], queries_usadas: [] };
    }

    const candidatos = parsearCandidatos(rawText);

    // Extrair queries realmente usadas pelo grounding
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || queries;
    console.log(`🔗 [TalentFinder] ETAPA 2 — Queries Google: ${queriesUsadas.join(' | ')}`);

    return { resultados: candidatos, queries_usadas: queriesUsadas };
}

// ════════════════════════════════════════════════════════════════════
// ETAPA 3 — Refinamento (opcional): se resultado < 50% do esperado
// Gera novas queries com foco em sinônimos e cargos alternativos
// ════════════════════════════════════════════════════════════════════
async function executarRefinamento(
    requisitos: string,
    resultadosParciais: CandidatoEncontrado[],
    maxResultados: number
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[] }> {

    const ai = getAI();

    const nomesCandidatosAtuais = resultadosParciais
        .map(c => c.nome_completo)
        .join(', ');

    const prompt = `
Você é um especialista em sourcing de talentos. A primeira rodada de buscas retornou apenas ${resultadosParciais.length} candidatos para a vaga abaixo. Precisamos de mais.

REQUISITOS DA VAGA:
"${requisitos}"

Candidatos já encontrados (NÃO repita estes): ${nomesCandidatosAtuais || 'nenhum'}

TAREFA: Execute novas buscas no Google usando cargos alternativos, sinônimos de tecnologias e combinações diferentes das que foram tentadas. Exemplos de variações a explorar:
- Títulos alternativos em inglês/PT-BR que não foram tentados
- Tecnologias equivalentes ou do mesmo ecossistema
- Buscas sem restrição de localização se a localização limitou os resultados
- Perfis em outros estados/regiões que possam ser remotos ou relocar

META: encontrar mais ${maxResultados - resultadosParciais.length} candidatos adicionais.

Responda SOMENTE JSON puro sem markdown:
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string ou null","linkedin_url":"https://linkedin.com/in/slug ou null","cidade":"string ou null","estado":"UF ou null","resumo":"resumo em 1 frase do perfil ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🔄 [TalentFinder] ETAPA 3 — Refinamento: buscando mais candidatos...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.4,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [TalentFinder] ETAPA 3 — Resposta raw (${rawText.length} chars)`);

    if (rawText.length < 20) {
        console.log('⚠️ [TalentFinder] ETAPA 3 — Sem resultados adicionais');
        return { resultados: [], queries_usadas: [] };
    }

    const candidatos = parsearCandidatos(rawText);
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];

    console.log(`✅ [TalentFinder] ETAPA 3 — ${candidatos.length} candidatos adicionais encontrados`);
    return { resultados: candidatos, queries_usadas: queriesUsadas };
}

// ════════════════════════════════════════════════════════════════════
// HELPERS — Parse e normalização
// ════════════════════════════════════════════════════════════════════
function parsearCandidatos(rawText: string): CandidatoEncontrado[] {
    const cleanText = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('❌ [TalentFinder] Nenhum JSON válido na resposta');
        return [];
    }

    let parsed: any;
    try {
        const sanitized = jsonMatch[0]
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .replace(/\u0000/g, '');
        parsed = JSON.parse(sanitized);
    } catch (e) {
        // Tentativa de recuperação via extração do array
        try {
            const arrayMatch = jsonMatch[0].match(/"candidatos"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
            if (arrayMatch) {
                const sanitizedArray = arrayMatch[1]
                    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                    .replace(/[\u201C\u201D]/g, '"');
                parsed = { candidatos: JSON.parse(sanitizedArray) };
                console.log('⚠️ [TalentFinder] Parse recuperado via extração de array');
            } else {
                return [];
            }
        } catch {
            console.error('❌ [TalentFinder] Falha total no parse JSON');
            return [];
        }
    }

    const candidatos: any[] = parsed.candidatos || [];

    return candidatos.map((c: any, idx: number) => {
        // Normalizar linkedin_url
        const rawLinkedin = c.linkedin_url || null;
        let linkedinNorm: string | null = null;
        if (rawLinkedin && String(rawLinkedin) !== 'null' && String(rawLinkedin).includes('linkedin')) {
            const raw = String(rawLinkedin).trim();
            if (raw.includes('linkedin.com/in/')) {
                linkedinNorm = raw.startsWith('http') ? raw : `https://www.${raw.replace(/^www\./, '')}`;
            } else if (raw.startsWith('linkedin.com')) {
                linkedinNorm = `https://www.${raw}`;
            }
        }

        const relevancia = ['alta', 'media', 'baixa'].includes(c.relevancia)
            ? c.relevancia as 'alta' | 'media' | 'baixa'
            : 'media';

        return {
            finder_id:     `finder_${idx}_${Date.now()}`,
            nome_completo: (c.nome_completo || '').trim(),
            cargo_atual:   (c.cargo_atual || '').trim(),
            empresa_atual: c.empresa_atual && c.empresa_atual !== 'null' ? c.empresa_atual : null,
            linkedin_url:  linkedinNorm,
            cidade:        c.cidade && c.cidade !== 'null' ? c.cidade : null,
            estado:        c.estado && c.estado !== 'null' ? c.estado : null,
            resumo:        c.resumo && c.resumo !== 'null' ? c.resumo : null,
            relevancia,
        };
    });
}

function deduplicar(lista: CandidatoEncontrado[]): CandidatoEncontrado[] {
    const vistos = new Set<string>();
    return lista.filter(c => {
        const chave = c.nome_completo
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .trim();
        if (!chave || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

// ════════════════════════════════════════════════════════════════════
// ORQUESTRADOR — Coordena as 3 etapas
// ════════════════════════════════════════════════════════════════════
async function buscarCandidatos(
    requisitos: string,
    maxResultados: number
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[]; etapas_executadas: number }> {

    // ETAPA 1: Gerar queries booleanas otimizadas
    const queries = await gerarQueriesBooleanas(requisitos, maxResultados);

    // ETAPA 2: Executar busca com as queries geradas
    const { resultados: resultadosEtapa2, queries_usadas: qrs2 } =
        await executarBuscaComQueries(requisitos, queries, maxResultados);

    console.log(`📊 [TalentFinder] Etapa 2: ${resultadosEtapa2.length} candidatos | Meta: ${maxResultados}`);

    // ETAPA 3: Refinamento se resultado < 50% da meta
    const metaMinima = Math.ceil(maxResultados * 0.5);
    if (resultadosEtapa2.length < metaMinima) {
        console.log(`🔄 [TalentFinder] Resultado abaixo de 50% da meta (${resultadosEtapa2.length} < ${metaMinima}) — ativando refinamento`);

        const { resultados: resultadosEtapa3, queries_usadas: qrs3 } =
            await executarRefinamento(requisitos, resultadosEtapa2, maxResultados);

        const todos = deduplicar([...resultadosEtapa2, ...resultadosEtapa3]);
        const todasQueries = [...new Set([...qrs2, ...qrs3])];

        return { resultados: todos, queries_usadas: todasQueries, etapas_executadas: 3 };
    }

    return {
        resultados:        deduplicar(resultadosEtapa2),
        queries_usadas:    qrs2,
        etapas_executadas: 2,
    };
}

// ════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const { requisitos, max_resultados = 20 } = req.body;

    if (!requisitos || typeof requisitos !== 'string' || !requisitos.trim()) {
        return res.status(400).json({ error: 'requisitos é obrigatório.' });
    }

    if (requisitos.trim().length < 10) {
        return res.status(400).json({ error: 'Descreva os requisitos com mais detalhes (mínimo 10 caracteres).' });
    }

    try {
        const maxPorChamada = Math.min(Math.max(max_resultados || 20, 5), 50);

        console.log(`🚀 [TalentFinder v2.0] Iniciando busca multi-etapas`);
        console.log(`   Requisitos: ${requisitos.substring(0, 100)}`);
        console.log(`   Max resultados: ${maxPorChamada}`);

        const { resultados, queries_usadas, etapas_executadas } =
            await buscarCandidatos(requisitos.trim(), maxPorChamada);

        // Ordenar por relevância: alta → media → baixa
        const ordemRelevancia = { alta: 0, media: 1, baixa: 2 };
        resultados.sort((a, b) => ordemRelevancia[a.relevancia] - ordemRelevancia[b.relevancia]);

        console.log(`✅ [TalentFinder v2.0] Final: ${resultados.length} únicos | Etapas: ${etapas_executadas}`);

        return res.status(200).json({
            success:           true,
            resultados,
            total:             resultados.length,
            queries_google:    queries_usadas,
            motor:             'gemini',
            etapas_executadas,
        });

    } catch (error: any) {
        console.error('❌ [TalentFinder v2.0] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar candidatos via Gemini',
        });
    }
}
