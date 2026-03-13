/**
 * api/talent-finder-search.ts
 *
 * TALENT FINDER — Motor de Busca de Candidatos via Gemini AI + Google Search
 *
 * Versão: 3.0 — Arquitetura definitiva
 *
 * Aprendizados das versões anteriores:
 * - v1.x: prompt único sobrecarregado → alucinação
 * - v2.0: multi-etapas → boa ideia mas Etapa 2 retornava JSON vazio
 * - v2.1: anti-alucinação → thinkingConfig removido → grounding desativado
 * - v2.2: diagnóstico → confirmado: sem thinkingConfig o Gemini 2.5 Flash
 *         não ativa o Google Search Grounding (0 chunks, 0 queries executadas)
 *
 * Solução v3.0:
 * ETAPA 1 — gemini-2.0-flash (sem search): gera queries booleanas válidas
 * ETAPA 2 — gemini-2.5-flash + googleSearch + thinkingConfig:4096 (padrão
 *            VALIDADO do Prospect Engine) com prompt anti-alucinação integrado
 * ETAPA 3 — gemini-2.0-flash (sem search): valida perfis encontrados
 *
 * A diferença vs v2.x: o prompt da Etapa 2 NÃO pede JSON — pede texto livre
 * descrevendo os perfis encontrados. A Etapa 3 estrutura em JSON.
 * Isso libera o Gemini para usar o grounding sem conflito de formato.
 *
 * Data: 13/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export const config = { maxDuration: 60 };

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

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — Geração de queries booleanas (gemini-2.0-flash, SEM Google Search)
// ════════════════════════════════════════════════════════════════════════════
async function gerarQueriesBooleanas(requisitos: string): Promise<string[]> {

    const ai = getAI();

    const prompt = `
Você é um especialista em sourcing de talentos. Gere queries de busca para o Google encontrar profissionais no LinkedIn.

REQUISITOS DA VAGA:
"${requisitos}"

PRINCÍPIOS FUNDAMENTAIS:

1. SINTAXE CORRETA DO GOOGLE:
   - Sempre comece com: site:linkedin.com/in
   - Use OR entre parênteses para variações: ("Consultor SAP" OR "SAP Consultant")
   - NUNCA use AND explícito — o Google não suporta entre termos comuns
   - Aspas apenas em termos compostos: "IS-Oil", "React Native", "Front End"
   - Siglas curtas (SD, MM, FI) sem aspas — aspas em siglas são muito restritivas

2. AMPLITUDE — regra crítica:
   - Se houver múltiplos módulos/tecnologias: use apenas 1-2 por query, não todos juntos
   - Prefira queries que retornem resultados parciais a queries que retornem zero
   - Cubra variações: "IS-Oil" OR "IS Oil" OR "ISOil"

3. PROGRESSÃO:
   - Queries 1-2: termo diferenciador + localização
   - Queries 3-4: variações sem localização restritiva
   - Query 5: cargo principal + Brasil apenas
   - Query 6: termos em inglês ou abordagem diferente

EXEMPLOS VÁLIDOS para "Consultor SAP IS-Oil SD MM FI São Paulo":
- site:linkedin.com/in ("Consultor SAP" OR "SAP Consultant") ("IS-Oil" OR "IS Oil") "São Paulo"
- site:linkedin.com/in ("Especialista SAP" OR "Consultor SAP") "IS-Oil" Brasil
- site:linkedin.com/in ("Consultor SAP" OR "SAP Consultant") SD MM Brasil
- site:linkedin.com/in ("SAP IS-Oil" OR "SAP Oil Gas") consultor Brasil
- site:linkedin.com/in ("Consultor SAP" OR "SAP Consultant") Brasil
- site:linkedin.com/in "SAP IS-Oil" Brasil

EXEMPLOS VÁLIDOS para "Desenvolvedor React Native Android/Kotlin São Paulo":
- site:linkedin.com/in ("Desenvolvedor React Native" OR "React Native Developer") "São Paulo"
- site:linkedin.com/in "React Native" ("Desenvolvedor" OR "Developer") Android "São Paulo"
- site:linkedin.com/in ("Mobile Developer" OR "Desenvolvedor Mobile") "React Native" Kotlin
- site:linkedin.com/in ("Frontend Developer" OR "Desenvolvedor Front End") "React Native" Brasil
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

    try {
        const cleanText = (result.text || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        const queries: string[] = (parsed.queries || []).filter((q: any) => typeof q === 'string' && q.trim());

        if (queries.length === 0) throw new Error('Nenhuma query gerada');

        console.log(`✅ [TalentFinder] ETAPA 1 — ${queries.length} queries:`);
        queries.forEach((q, i) => console.log(`   ${i + 1}. ${q.substring(0, 120)}`));
        return queries;

    } catch {
        console.error('⚠️ [TalentFinder] ETAPA 1 — Fallback básico');
        const termos = requisitos.split(/[\s,]+/).slice(0, 3).join(' ');
        return [
            `site:linkedin.com/in ${termos} Brasil`,
            `site:linkedin.com/in ${termos}`,
        ];
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — Busca + descrição em TEXTO LIVRE (padrão validado Prospect Engine)
// NÃO pede JSON — pede descrição dos perfis para não travar o grounding
// thinkingConfig:4096 é OBRIGATÓRIO para o Gemini 2.5 Flash ativar o Search
// ════════════════════════════════════════════════════════════════════════════
async function buscarPerfisTexto(
    queries: string[],
    requisitos: string,
    maxResultados: number
): Promise<{ candidatos: any[]; queries_usadas: string[]; chunks: number }> {

    const ai = getAI();
    // Extrair âncora principal dos requisitos (mesmo padrão do Prospect Engine)
    // O Prospect Engine usa empresaAncora — aqui usamos o cargo/tecnologia principal
    // Âncora concreta força o Gemini a buscar em vez de responder com conhecimento interno
    const primeiraQuery = queries[0] || '';
    const ancoraPrincipal = primeiraQuery
        .replace(/site:linkedin\.com\/in\s*/gi, '')
        .replace(/\(|\)/g, '')
        .replace(/OR/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split('"').filter(t => t.trim().length > 2)[0]?.trim()
        || requisitos.split(/[,\-]/)[0].trim();

    // Queries interpoladas com variáveis — padrão idêntico ao Prospect Engine validado
    const cargosQuery = queries.slice(0, 2)
        .map(q => q.replace(/site:linkedin\.com\/in\s*/gi, '').trim())
        .join(' OR ');

    const prompt = `
Você é um especialista em recrutamento. Use o Google Search para encontrar profissionais reais com o perfil abaixo.

PERFIL BUSCADO: "${ancoraPrincipal}"
REQUISITOS COMPLETOS: ${requisitos}

EXECUTE ATÉ 6 BUSCAS DISTINTAS (pare ao ter ${maxResultados}+ candidatos ou ao esgotar opções):

1. site:linkedin.com/in ${cargosQuery}
2. "${ancoraPrincipal}" linkedin profissional Brasil
3. ${queries[2] || `"${ancoraPrincipal}" linkedin Brasil`}
4. ${queries[3] || `"${ancoraPrincipal}" especialista linkedin`}
5. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} candidatos) ${queries[4] || `"${ancoraPrincipal}" Brasil`}
6. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} candidatos) ${queries[5] || `"${ancoraPrincipal}" sênior linkedin`}

REGRAS ABSOLUTAS:
- Inclua TODA pessoa encontrada, mesmo sem LinkedIn (linkedin_url fica null)
- Para LinkedIn: se encontrou na busca, use a URL exata. Se não, coloque null
- NÃO repita queries nem confirme o mesmo nome mais de uma vez
- JAMAIS invente nomes, cargos ou URLs
- Retorne quem encontrou, mesmo que seja só 1 ou 2 pessoas

Responda SOMENTE JSON sem markdown:
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string ou null","linkedin_url":"https://linkedin.com/in/slug ou null","cidade":"string ou null","estado":"UF ou null","resumo":"string ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🔍 [TalentFinder] ETAPA 2 — Buscando perfis via Google Search Grounding...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.3,
            maxOutputTokens: 8192,
            // thinkingConfig OBRIGATÓRIO — sem ele o Gemini 2.5 Flash não ativa o grounding
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    const textoResposta = result.text || '';
    const candidate    = (result as any).candidates?.[0];
    const groundingMeta = candidate?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];
    const chunks: any[] = groundingMeta?.groundingChunks || [];

    console.log(`📦 [TalentFinder] ETAPA 2 — Resposta: ${textoResposta.length} chars`);
    console.log(`🌐 [TalentFinder] ETAPA 2 — ${chunks.length} groundingChunks | Queries: ${queriesUsadas.length}`);
    queriesUsadas.forEach((q, i) => console.log(`   query real ${i+1}: ${q.substring(0, 100)}`));
    if (chunks.length > 0) {
        chunks.slice(0, 5).forEach((c: any, i: number) => {
            console.log(`   chunk ${i+1}: ${(c?.web?.title || '').substring(0, 60)} | ${(c?.web?.uri || '').substring(0, 60)}`);
        });
    }
    if (textoResposta.length > 0) {
        console.log(`📝 [TalentFinder] ETAPA 2 — Preview resposta: ${textoResposta.substring(0, 300)}`);
    }

    // Parse defensivo — a Etapa 2 agora retorna JSON diretamente (padrão Prospect Engine)
    if (textoResposta.length < 20) {
        console.log('⚠️ [TalentFinder] ETAPA 2 — Resposta vazia');
        return { candidatos: [], queries_usadas: queriesUsadas, chunks: chunks.length };
    }

    const cleanText = textoResposta.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.log('⚠️ [TalentFinder] ETAPA 2 — Sem JSON válido');
        return { candidatos: [], queries_usadas: queriesUsadas, chunks: chunks.length };
    }

    try {
        const sanitized = jsonMatch[0]
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        const parsed = JSON.parse(sanitized);
        const candidatos = parsed.candidatos || [];
        console.log(`✅ [TalentFinder] ETAPA 2 — ${candidatos.length} candidatos no JSON`);
        return { candidatos, queries_usadas: queriesUsadas, chunks: chunks.length };
    } catch (e) {
        console.error('❌ [TalentFinder] ETAPA 2 — Falha parse JSON:', e);
        return { candidatos: [], queries_usadas: queriesUsadas, chunks: chunks.length };
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — Estruturação + Validação (gemini-2.0-flash, SEM Google Search)
// Recebe o texto livre da Etapa 2 e estrutura em JSON validado
// ════════════════════════════════════════════════════════════════════════════
async function estruturarEValidar(
    candidatosBrutos: any[],
    requisitos: string
): Promise<CandidatoEncontrado[]> {

    if (!candidatosBrutos || candidatosBrutos.length === 0) return [];

    const ai = getAI();

    const prompt = `
Você é um recrutador técnico sênior. Avalie os candidatos abaixo e filtre apenas os aderentes à vaga.

REQUISITOS DA VAGA:
"${requisitos}"

CANDIDATOS ENCONTRADOS PELO GOOGLE:
${JSON.stringify(candidatosBrutos, null, 2)}

SUA TAREFA:
Avalie cada candidato e inclua apenas os aderentes aos requisitos.

CRITÉRIOS DE RELEVÂNCIA:
- "alta": cargo e resumo indicam claramente domínio dos requisitos principais
- "media": cargo relacionado, experiência parcial com os requisitos
- "baixa": alguma relação mas não é o foco principal
- EXCLUIR: sem relação com os requisitos

REGRAS ANTI-ALUCINAÇÃO:
- Use APENAS as informações já presentes em cada candidato — NÃO invente dados
- Mantenha linkedin_url, cidade, estado exatamente como estão (ou null)
- O resumo pode ser refinado mas deve ser baseado no campo resumo original

Retorne SOMENTE JSON puro sem markdown:
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string ou null","linkedin_url":"URL exata ou null","cidade":"string ou null","estado":"UF ou null","resumo":"string ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🔎 [TalentFinder] ETAPA 3 — Estruturando e validando perfis...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        }
    });

    try {
        const cleanText = (result.text || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        const candidatos: any[] = parsed.candidatos || [];

        const validados: CandidatoEncontrado[] = candidatos
            .filter((c: any) => c.nome_completo && c.nome_completo !== 'null')
            .map((c: any, idx: number) => {
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

        console.log(`✅ [TalentFinder] ETAPA 3 — ${validados.length} aprovados de ${candidatos.length} extraídos`);
        if (candidatos.length > validados.length) {
            console.log(`🚫 [TalentFinder] ETAPA 3 — ${candidatos.length - validados.length} reprovados por não aderência`);
        }
        return validados;

    } catch (e) {
        console.error('❌ [TalentFinder] ETAPA 3 — Falha no parse JSON:', e);
        return [];
    }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
function deduplicar(lista: CandidatoEncontrado[]): CandidatoEncontrado[] {
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
// Tempo estimado: E1 ~2s + E2 ~25s + E3 ~5s = ~32s (dentro de 60s)
// ════════════════════════════════════════════════════════════════════════════
async function buscarCandidatos(
    requisitos: string,
    maxResultados: number
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[]; chunks_google: number; pode_refinar: boolean }> {

    // ETAPA 1: queries booleanas
    const queries = await gerarQueriesBooleanas(requisitos);

    // ETAPA 2: busca via Google Search Grounding (retorna JSON — padrão Prospect Engine)
    const { candidatos: candidatosBrutos, queries_usadas, chunks } =
        await buscarPerfisTexto(queries, requisitos, maxResultados);

    // ETAPA 3: validar aderência aos requisitos
    const validados = await estruturarEValidar(candidatosBrutos, requisitos);

    console.log(`📊 [TalentFinder] Chunks: ${chunks} | Validados: ${validados.length} | Meta: ${maxResultados}`);

    const deduplicados = deduplicar(validados);
    const podeRefinar  = deduplicados.length < Math.ceil(maxResultados * 0.5);

    return { resultados: deduplicados, queries_usadas, chunks_google: chunks, pode_refinar: podeRefinar };
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════════════
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const { requisitos, max_resultados = 20 } = req.body;

    if (!requisitos || typeof requisitos !== 'string' || !requisitos.trim())
        return res.status(400).json({ error: 'requisitos é obrigatório.' });

    if (requisitos.trim().length < 10)
        return res.status(400).json({ error: 'Descreva os requisitos com mais detalhes (mínimo 10 caracteres).' });

    try {
        const maxPorChamada = Math.min(Math.max(max_resultados || 20, 5), 50);

        console.log(`🚀 [TalentFinder v3.0] Iniciando busca`);
        console.log(`   Requisitos: ${requisitos.substring(0, 100)}`);
        console.log(`   Max resultados: ${maxPorChamada}`);

        const { resultados, queries_usadas, chunks_google, pode_refinar } =
            await buscarCandidatos(requisitos.trim(), maxPorChamada);

        // Ordenar: alta → media → baixa
        const ordemRelevancia = { alta: 0, media: 1, baixa: 2 };
        resultados.sort((a, b) => ordemRelevancia[a.relevancia] - ordemRelevancia[b.relevancia]);

        console.log(`✅ [TalentFinder v3.0] Final: ${resultados.length} candidatos | Chunks: ${chunks_google} | Refinar: ${pode_refinar}`);

        return res.status(200).json({
            success:           true,
            resultados,
            total:             resultados.length,
            queries_google:    queries_usadas,
            motor:             'gemini',
            chunks_google,
            pode_refinar,
        });

    } catch (error: any) {
        console.error('❌ [TalentFinder v3.0] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar candidatos via Gemini',
        });
    }
}
