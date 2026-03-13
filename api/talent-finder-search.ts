/**
 * api/talent-finder-search.ts
 *
 * TALENT FINDER — Motor de Busca de Candidatos via Gemini AI + Google Search
 *
 * Versão: 2.2 — Anti-alucinação + validação independente + timeout fix
 *
 * Problema v2.0: Gemini fabricava cargos/resumos plausíveis para URLs reais encontradas,
 * criando perfis com relevância "Alta" mas completamente falsos.
 *
 * Correção v2.1:
 * ETAPA 1 — gemini-2.0-flash: analisa requisitos → gera queries booleanas otimizadas
 * ETAPA 2 — gemini-2.5-flash + Google Search: coleta APENAS dados brutos encontrados
 *            (sem avaliar relevância, sem inferir campos ausentes)
 * ETAPA 3 — gemini-2.0-flash (sem search): valida cada perfil honestamente
 *            contra os requisitos — pode reprovar todos se nenhum for aderente
 * ETAPA 4 — (Opcional) Refinamento se resultado validado < 50% da meta
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

// ─── Interfaces ──────────────────────────────────────────────────────────────

// Dado bruto da busca — sem avaliação de relevância ainda
interface PerfilBruto {
    nome_completo:  string;
    cargo_atual:    string | null;
    empresa_atual:  string | null;
    linkedin_url:   string | null;
    cidade:         string | null;
    estado:         string | null;
    snippet_google: string | null; // texto exato do snippet do Google — âncora contra alucinação
}

// Perfil validado — passou pela avaliação independente
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

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — Geração de queries booleanas (gemini-2.0-flash, SEM Google Search)
// Responsabilidade: interpretar requisitos e gerar queries otimizadas
// ════════════════════════════════════════════════════════════════════════════
async function gerarQueriesBooleanas(requisitos: string): Promise<string[]> {

    const ai = getAI();

    const prompt = `
Você é um especialista em sourcing de talentos. Gere queries de busca para o Google encontrar profissionais no LinkedIn.

REQUISITOS DA VAGA:
"${requisitos}"

PRINCÍPIOS FUNDAMENTAIS PARA GERAR QUERIES EFICAZES:

1. SINTAXE DO GOOGLE — regras absolutas:
   - Sempre comece com: site:linkedin.com/in
   - Use OR entre parênteses para variações: ("Consultor SAP" OR "SAP Consultant")
   - NUNCA use AND explícito entre termos — o Google não suporta
   - Aspas apenas em termos compostos obrigatórios: "IS-Oil", "React Native"
   - Siglas curtas (SD, MM, FI, RJ) NÃO precisam de aspas — podem distorcer a busca

2. AMPLITUDE DAS QUERIES — regra crítica:
   - Se os requisitos têm MÚLTIPLOS módulos/tecnologias (ex: SD, MM, FI, IS-Oil):
     → NÃO exija todos na mesma query — isso resulta em zero resultados
     → Cada query deve usar apenas 1-2 dos módulos principais como filtro
     → Use OR para cobrir variações do mesmo termo
   - Prefira queries que retornem resultados parciais a queries que retornem zero

3. COBERTURA DE VARIAÇÕES:
   - Cubra variações ortográficas: "IS-Oil" OR "IS Oil" OR "ISOil" OR "IS-OIL"
   - Cubra PT-BR e inglês: "Consultor SAP" OR "SAP Consultant" OR "SAP Specialist"
   - Cubra níveis: especialista, sênior, pleno, senior, lead

4. PROGRESSÃO DO ESPECÍFICO AO AMPLO:
   - Queries 1-2: termo mais diferenciador dos requisitos + localização
   - Queries 3-4: variações de cargo/módulo sem localização restrita
   - Query 5: apenas cargo principal + Brasil (sem módulos específicos)
   - Query 6: termos em inglês ou abordagem completamente diferente

EXEMPLOS CORRETOS para "Consultor SAP IS-Oil SD MM FI São Paulo":
- site:linkedin.com/in ("Consultor SAP" OR "SAP Consultant") ("IS-Oil" OR "IS Oil" OR "ISOil") "São Paulo"
- site:linkedin.com/in ("Especialista SAP" OR "Consultor SAP") "IS-Oil" Brasil
- site:linkedin.com/in ("Consultor SAP" OR "SAP Consultant") SD MM "São Paulo" Brasil
- site:linkedin.com/in ("SAP IS-Oil" OR "SAP Oil Gas") ("Consultor" OR "Especialista") Brasil
- site:linkedin.com/in ("Consultor SAP" OR "SAP Consultant") Brasil
- site:linkedin.com/in ("SAP IS-Oil Consultant" OR "SAP Oil and Gas") Brasil

EXEMPLOS CORRETOS para "Desenvolvedor React Native São Paulo":
- site:linkedin.com/in ("Desenvolvedor React Native" OR "React Native Developer") "São Paulo"
- site:linkedin.com/in "React Native" ("Desenvolvedor" OR "Developer") "São Paulo" Brasil
- site:linkedin.com/in "React Native" Android Kotlin Brasil
- site:linkedin.com/in ("Mobile Developer" OR "Desenvolvedor Mobile") "React Native"
- site:linkedin.com/in "React Native" Brasil
- site:linkedin.com/in ("Mobile Engineer" OR "Frontend Mobile") "React Native" Brasil

Retorne SOMENTE este JSON sem markdown:
{"queries":["query1","query2","query3","query4","query5","query6"]}
`.trim();

    console.log(`🧠 [TalentFinder] ETAPA 1 — Gerando queries para: ${requisitos.substring(0, 60)}...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
            temperature: 0.2,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
        }
    });

    const rawText = result.text || '';

    try {
        const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        const queries: string[] = (parsed.queries || []).filter((q: any) => typeof q === 'string' && q.trim());

        if (queries.length === 0) throw new Error('Nenhuma query gerada');

        console.log(`✅ [TalentFinder] ETAPA 1 — ${queries.length} queries:`);
        queries.forEach((q, i) => console.log(`   ${i + 1}. ${q.substring(0, 120)}`));

        return queries;
    } catch {
        console.error('⚠️ [TalentFinder] ETAPA 1 — Fallback para queries básicas');
        const termos = requisitos.split(/[\s,]+/).slice(0, 4).join(' ');
        return [
            `site:linkedin.com/in ${termos} Brasil`,
            `${termos} linkedin profissional Brasil`,
        ];
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — Coleta de dados BRUTOS via Google Search Grounding
// Responsabilidade: retornar APENAS o que o Google encontrou — sem inventar nada
// ════════════════════════════════════════════════════════════════════════════
async function coletarPerfisBrutos(
    queries: string[],
    maxResultados: number
): Promise<{ perfis: PerfilBruto[]; queries_usadas: string[] }> {

    const ai = getAI();

    const queriesFormatadas = queries.map((q, i) => `${i + 1}. ${q}`).join('\n');

    // ANTI-ALUCINAÇÃO: prompt focado em coleta fiel, sem avaliação de aderência
    const prompt = `
Você é um robô de coleta de dados. Use o Google Search para executar as buscas abaixo e colete os dados de cada perfil exatamente como aparecem nos resultados.

EXECUTE ESTAS BUSCAS EM ORDEM (pare ao ter ${maxResultados}+ perfis):
${queriesFormatadas}

REGRAS RÍGIDAS DE COLETA — leia com atenção:
- Colete APENAS perfis que o Google efetivamente retornou — NUNCA invente ou deduza perfis
- Para cada perfil, copie o cargo_atual EXATAMENTE como aparece no resultado da busca — não reescreva, não melhore
- O campo snippet_google deve conter o texto exato do snippet/descrição que o Google mostrou
- Se um campo não apareceu no resultado da busca, coloque null — NUNCA invente empresa, cidade ou cargo
- Se o Google não retornou nenhum perfil relevante para uma query, pule para a próxima
- Não avalie se o perfil é adequado ou não — isso será feito depois

Retorne SOMENTE JSON puro sem markdown:
{"perfis":[{"nome_completo":"string ou null","cargo_atual":"exatamente como apareceu no Google ou null","empresa_atual":"exatamente como apareceu no Google ou null","linkedin_url":"URL exata ou null","cidade":"string ou null","estado":"UF ou null","snippet_google":"texto exato do snippet do Google ou null"}]}
`.trim();

    console.log(`🔍 [TalentFinder] ETAPA 2 — Coletando perfis brutos via Google Search...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,   // baixíssima temperatura — modo coleta fiel
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [TalentFinder] ETAPA 2 — Resposta raw (${rawText.length} chars)`);

    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];
    console.log(`🔗 [TalentFinder] ETAPA 2 — Google queries executadas: ${queriesUsadas.join(' | ')}`);

    if (rawText.length < 20) {
        console.log('⚠️ [TalentFinder] ETAPA 2 — Resposta vazia, nenhum perfil coletado');
        return { perfis: [], queries_usadas: queriesUsadas };
    }

    const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
        console.log('⚠️ [TalentFinder] ETAPA 2 — Nenhum JSON válido, nenhum perfil coletado');
        return { perfis: [], queries_usadas: queriesUsadas };
    }

    try {
        const sanitized = jsonMatch[0]
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

        const parsed = JSON.parse(sanitized);
        const perfis: PerfilBruto[] = (parsed.perfis || []).filter(
            (p: any) => p.nome_completo && p.nome_completo !== 'null'
        );

        console.log(`✅ [TalentFinder] ETAPA 2 — ${perfis.length} perfis brutos coletados`);
        return { perfis, queries_usadas: queriesUsadas };

    } catch (e) {
        console.error('❌ [TalentFinder] ETAPA 2 — Falha no parse JSON:', e);
        return { perfis: [], queries_usadas: queriesUsadas };
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — Validação independente (gemini-2.0-flash, SEM Google Search)
// Responsabilidade: avaliar honestamente cada perfil bruto contra os requisitos
// Pode e deve reprovar candidatos que não atendem — honestidade > quantidade
// ════════════════════════════════════════════════════════════════════════════
async function validarPerfis(
    perfis: PerfilBruto[],
    requisitos: string
): Promise<CandidatoEncontrado[]> {

    if (perfis.length === 0) return [];

    const ai = getAI();

    const perfisJson = JSON.stringify(perfis, null, 2);

    const prompt = `
Você é um recrutador técnico sênior avaliando candidatos para uma vaga.

REQUISITOS DA VAGA:
"${requisitos}"

PERFIS COLETADOS DO GOOGLE (dados brutos — podem ser irrelevantes):
${perfisJson}

SUA TAREFA:
Para cada perfil, avalie se o cargo_atual e snippet_google indicam que a pessoa realmente trabalha com os requisitos da vaga.

CRITÉRIOS DE AVALIAÇÃO RIGOROSOS:
- "alta": cargo e/ou snippet indicam claramente experiência com os requisitos principais
- "media": cargo e/ou snippet sugerem experiência parcial ou relacionada
- "baixa": cargo e/ou snippet têm alguma relação mas não é o foco principal
- EXCLUIR (não incluir no JSON): perfil não tem nenhuma relação com os requisitos

REGRAS ANTI-ALUCINAÇÃO:
- Use APENAS as informações presentes nos campos cargo_atual e snippet_google para avaliar
- NÃO invente experiências que não estão no snippet
- NÃO melhore ou reescreva o cargo — use o campo cargo_atual como está
- O campo resumo deve ser baseado APENAS no snippet_google disponível; se snippet for null, coloque null
- Se a maioria dos perfis não for aderente, retorne apenas os aderentes — pode ser 0

Retorne SOMENTE JSON puro sem markdown (inclua apenas os perfis aprovados):
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string ou null","linkedin_url":"string ou null","cidade":"string ou null","estado":"string ou null","resumo":"baseado apenas no snippet ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🔎 [TalentFinder] ETAPA 3 — Validando ${perfis.length} perfis contra requisitos...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        }
    });

    const rawText = result.text || '';

    try {
        const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        const candidatos: any[] = parsed.candidatos || [];

        const validados: CandidatoEncontrado[] = candidatos
            .filter((c: any) => c.nome_completo && c.nome_completo !== 'null')
            .map((c: any, idx: number) => {
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

        console.log(`✅ [TalentFinder] ETAPA 3 — ${validados.length} aprovados de ${perfis.length} avaliados`);
        const reprovados = perfis.length - validados.length;
        if (reprovados > 0) {
            console.log(`🚫 [TalentFinder] ETAPA 3 — ${reprovados} perfis reprovados por não aderência`);
        }

        return validados;

    } catch (e) {
        console.error('❌ [TalentFinder] ETAPA 3 — Falha no parse, retornando 0 validados');
        return [];
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 4 — Refinamento (se validados < 50% da meta)
// Usa cargos alternativos e sinônimos para expandir a busca
// ════════════════════════════════════════════════════════════════════════════
async function executarRefinamento(
    requisitos: string,
    jaEncontrados: CandidatoEncontrado[],
    maxResultados: number
): Promise<{ perfis: PerfilBruto[]; queries_usadas: string[] }> {

    const ai = getAI();

    const nomesJaEncontrados = jaEncontrados.map(c => c.nome_completo).join(', ') || 'nenhum';
    const faltam = maxResultados - jaEncontrados.length;

    const prompt = `
Você é um robô de coleta de dados para recrutamento. A busca inicial retornou poucos resultados.

REQUISITOS ORIGINAIS DA VAGA:
"${requisitos}"

Candidatos já encontrados (NÃO repita): ${nomesJaEncontrados}

TAREFA: Execute novas buscas no Google focando em:
- Títulos alternativos em inglês que não foram tentados
- Tecnologias equivalentes do mesmo ecossistema
- Remova restrição de localização nas buscas
- Tente variações de seniority: pleno, senior, lead, especialista

META: Coletar até ${faltam} perfis adicionais.

REGRAS RÍGIDAS — igual à coleta principal:
- Copie cargo e snippet EXATAMENTE como aparecem no Google
- Se campo não apareceu no resultado, coloque null — NUNCA invente
- Não avalie aderência

Retorne SOMENTE JSON puro sem markdown:
{"perfis":[{"nome_completo":"string ou null","cargo_atual":"exatamente como apareceu no Google ou null","empresa_atual":"string ou null","linkedin_url":"URL exata ou null","cidade":"string ou null","estado":"UF ou null","snippet_google":"texto exato do snippet ou null"}]}
`.trim();

    console.log(`🔄 [TalentFinder] ETAPA 4 — Refinamento: buscando ${faltam} candidatos adicionais...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.1,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [TalentFinder] ETAPA 4 — Resposta raw (${rawText.length} chars)`);

    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];

    if (rawText.length < 20) {
        return { perfis: [], queries_usadas: queriesUsadas };
    }

    const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { perfis: [], queries_usadas: queriesUsadas };

    try {
        const sanitized = jsonMatch[0]
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

        const parsed = JSON.parse(sanitized);
        const perfis: PerfilBruto[] = (parsed.perfis || []).filter(
            (p: any) => p.nome_completo && p.nome_completo !== 'null'
        );

        console.log(`✅ [TalentFinder] ETAPA 4 — ${perfis.length} perfis adicionais coletados`);
        return { perfis, queries_usadas: queriesUsadas };
    } catch {
        return { perfis: [], queries_usadas: queriesUsadas };
    }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
function deduplicarBrutos(lista: PerfilBruto[]): PerfilBruto[] {
    const vistos = new Set<string>();
    return lista.filter(p => {
        const chave = (p.nome_completo || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
        if (!chave || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

function deduplicarValidados(lista: CandidatoEncontrado[]): CandidatoEncontrado[] {
    const vistos = new Set<string>();
    return lista.filter(c => {
        const chave = c.nome_completo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
        if (!chave || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

// ════════════════════════════════════════════════════════════════════════════
// ORQUESTRADOR
// Fluxo otimizado para respeitar o limite de 60s da Vercel:
// - ETAPA 1 (gerar queries) e ETAPA 2 (coleta Search) em paralelo usando
//   Promise.all — ETAPA 2 recebe queries de fallback enquanto ETAPA 1 processa
// - ETAPA 3 (validação) sempre executada sobre os brutos coletados
// - ETAPA 4 (refinamento) REMOVIDA do fluxo síncrono — retorna flag
//   pode_refinar:true para o frontend oferecer "Buscar mais" se necessário
// Tempo estimado: ~35-45s (dentro dos 60s)
// ════════════════════════════════════════════════════════════════════════════
async function buscarCandidatos(
    requisitos: string,
    maxResultados: number
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[]; etapas: number; brutos_coletados: number; pode_refinar: boolean }> {

    // ETAPAS 1 + 2 em paralelo:
    // E1 gera queries booleanas otimizadas enquanto E2 já inicia com queries de fallback.
    // Quando E1 termina (~3s), E2 ainda está buscando (~25s) — o paralelismo não ajuda
    // a E2 diretamente mas libera tempo de CPU do Node para processar outras tarefas.
    // Na prática, executamos sequencialmente pois E2 depende do output de E1,
    // mas E1 é rápida (~3s) então o impacto é mínimo.
    const queries = await gerarQueriesBooleanas(requisitos);

    // ETAPA 2: Coleta bruta via Google Search (maior consumidor de tempo ~25-30s)
    const { perfis: perfisBrutos, queries_usadas: qrs2 } =
        await coletarPerfisBrutos(queries, maxResultados);

    // ETAPA 3: Validação independente — honesta, pode aprovar 0 perfis (~5s)
    const validados = await validarPerfis(deduplicarBrutos(perfisBrutos), requisitos);

    console.log(`📊 [TalentFinder] Brutos: ${perfisBrutos.length} | Validados: ${validados.length} | Meta: ${maxResultados}`);

    // Log diagnóstico: mostra os primeiros perfis brutos coletados
    if (perfisBrutos.length > 0) {
        console.log(`🗂️ [TalentFinder] Amostra de perfis brutos (primeiros 5):`);
        perfisBrutos.slice(0, 5).forEach((p, i) => {
            console.log(`   ${i + 1}. "${p.nome_completo}" | cargo: "${p.cargo_atual}" | snippet: "${(p.snippet_google || '').substring(0, 80)}"`);
        });
    } else {
        console.log(`⚠️ [TalentFinder] ETAPA 2 retornou 0 perfis brutos — Google Search não encontrou resultados para as queries`);
    }

    // Log diagnóstico: mostra resultado da validação
    if (validados.length > 0) {
        console.log(`✔️ [TalentFinder] Perfis aprovados na validação:`);
        validados.forEach((v, i) => console.log(`   ${i + 1}. "${v.nome_completo}" | ${v.cargo_atual} | ${v.relevancia}`));
    } else if (perfisBrutos.length > 0) {
        console.log(`🚫 [TalentFinder] ETAPA 3 reprovou TODOS os ${perfisBrutos.length} perfis brutos — nenhum aderente aos requisitos`);
    }

    // Sinaliza se o frontend deve oferecer "Buscar mais" (refinamento sob demanda)
    const metaMinima = Math.ceil(maxResultados * 0.5);
    const podeRefinar = validados.length < metaMinima;

    if (podeRefinar) {
        console.log(`ℹ️ [TalentFinder] ${validados.length} < ${metaMinima} — refinamento disponível sob demanda`);
    }

    return {
        resultados:       deduplicarValidados(validados),
        queries_usadas:   qrs2,
        etapas:           3,
        brutos_coletados: perfisBrutos.length,
        pode_refinar:     podeRefinar,
    };
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════════════
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

        console.log(`🚀 [TalentFinder v2.1] Iniciando busca anti-alucinação`);
        console.log(`   Requisitos: ${requisitos.substring(0, 100)}`);
        console.log(`   Max resultados: ${maxPorChamada}`);

        const { resultados, queries_usadas, etapas, brutos_coletados, pode_refinar } =
            await buscarCandidatos(requisitos.trim(), maxPorChamada);

        // Ordenar: alta → media → baixa
        const ordemRelevancia = { alta: 0, media: 1, baixa: 2 };
        resultados.sort((a, b) => ordemRelevancia[a.relevancia] - ordemRelevancia[b.relevancia]);

        console.log(`✅ [TalentFinder v2.1] Final: ${resultados.length} validados | Brutos: ${brutos_coletados} | Etapas: ${etapas}`);

        return res.status(200).json({
            success:           true,
            resultados,
            total:             resultados.length,
            queries_google:    queries_usadas,
            motor:             'gemini',
            etapas_executadas: etapas,
            brutos_coletados,
            pode_refinar,
        });

    } catch (error: any) {
        console.error('❌ [TalentFinder v2.1] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar candidatos via Gemini',
        });
    }
}
