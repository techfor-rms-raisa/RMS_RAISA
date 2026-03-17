/**
 * api/talent-finder-search.ts
 *
 * TALENT FINDER v4.0 — Gerador de Boolean Search para LinkedIn via Google
 *
 * Nova arquitetura (13/03/2026):
 * Abandona o Google Search Grounding (que não retorna URLs do LinkedIn).
 * Em vez disso, usa Gemini apenas para GERAR queries booleanas avançadas
 * no padrão que os recrutadores já usam manualmente no browser.
 *
 * Fluxo:
 * 1. Recrutador descreve os requisitos em texto livre
 * 2. Gemini 2.0 Flash gera 3 queries booleanas otimizadas
 * 3. Frontend exibe as queries com botão "Abrir no Google"
 * 4. Google retorna perfis reais do LinkedIn com URLs diretas
 *
 * Vantagens vs Grounding:
 * - URLs reais do LinkedIn nos resultados
 * - Sem limite de API de grounding
 * - Recrutador controla e refina as queries
 * - Mais rápido (~2s vs ~30s)
 *
 * Data: 13/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export const config = { maxDuration: 30 };

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
    if (!aiInstance) {
        const apiKey = process.env.API_KEY || '';
        if (!apiKey) throw new Error('API_KEY não configurada.');
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

export interface QueryGerada {
    id:          string;
    tipo:        'abrangente' | 'titulo' | 'tecnologia';
    titulo:      string;
    descricao:   string;
    query:       string;
    url_google:  string;
}

// ─── Gera as queries booleanas via Gemini ────────────────────────────────────
async function gerarQueriesBooleanas(requisitos: string): Promise<QueryGerada[]> {

    const ai = getAI();

    const prompt = `
Você é um especialista em Boolean Search para recrutamento no LinkedIn via Google.

Analise os requisitos abaixo e gere EXATAMENTE 3 queries de busca Google otimizadas para encontrar perfis no LinkedIn.

REQUISITOS:
"${requisitos}"

REGRAS DE CONSTRUÇÃO:
- Sempre comece com: site:linkedin.com/in/
- Use operadores intitle: para focar no título do perfil LinkedIn
- Use OR para variações de cargo (PT-BR e inglês)
- Use AND para combinar tecnologias obrigatórias
- Use aspas para termos compostos: "React Native", "Front End", "IS-Oil"
- Inclua localização quando mencionada nos requisitos
- NÃO use AND entre grupos OR — coloque cada grupo em parênteses

EXEMPLOS DO PADRÃO CORRETO:
Para "Dev React Native, Android/Kotlin, São Paulo":
- Abrangente: site:linkedin.com/in/ ("Desenvolvedor Front End Mobile" OR "Front-End Developer" OR "Mobile Developer") AND ("React Native" OR "Kotlin") AND ("São Paulo" OR "SP")
- Por título: site:linkedin.com/in/ intitle:"Desenvolvedor Mobile" OR intitle:"Mobile Developer" AND ("React Native" AND "Kotlin") AND ("São Paulo" OR "SP")
- Por tecnologia: site:linkedin.com/in/ intitle:"React Native" AND ("Android" OR "Kotlin") AND ("São Paulo" OR "SP" OR "Grande SP")

Para "Consultor SAP IS-Oil SD MM FI, São Paulo":
- Abrangente: site:linkedin.com/in/ ("Consultor SAP" OR "SAP Consultant" OR "Especialista SAP") AND ("IS-Oil" OR "IS Oil") AND ("São Paulo" OR "SP")
- Por título: site:linkedin.com/in/ intitle:"Consultor SAP" OR intitle:"SAP Consultant" AND ("IS-Oil" OR "IS Oil") AND ("São Paulo" OR "SP")
- Por tecnologia: site:linkedin.com/in/ intitle:"SAP IS-Oil" OR intitle:"SAP IS Oil" AND ("SD" OR "MM" OR "FI") AND ("São Paulo" OR "SP" OR "Brasil")

GERE AS 3 QUERIES para os requisitos informados.

Retorne SOMENTE este JSON sem markdown:
{
  "queries": [
    {
      "tipo": "abrangente",
      "titulo": "Busca Abrangente",
      "descricao": "Combina variações de cargo com as tecnologias principais",
      "query": "site:linkedin.com/in/ ..."
    },
    {
      "tipo": "titulo",
      "titulo": "Foco no Título",
      "descricao": "Usa intitle: para perfis que explicitam o cargo no título",
      "query": "site:linkedin.com/in/ intitle:..."
    },
    {
      "tipo": "tecnologia",
      "titulo": "Foco na Tecnologia",
      "descricao": "Prioriza a tecnologia principal como diferenciador",
      "query": "site:linkedin.com/in/ intitle:..."
    }
  ]
}
`.trim();

    console.log(`🧠 [TalentFinder v4.0] Gerando queries para: ${requisitos.substring(0, 80)}...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        }
    });

    const rawText = result.text || '';
    console.log(`✅ [TalentFinder v4.0] Resposta Gemini: ${rawText.length} chars`);

    try {
        const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        const queries: any[] = parsed.queries || [];

        if (queries.length === 0) throw new Error('Nenhuma query gerada');

        const resultado: QueryGerada[] = queries.map((q: any, idx: number) => {
            const queryStr = (q.query || '').trim();
            const urlGoogle = `https://www.google.com/search?q=${encodeURIComponent(queryStr)}`;

            console.log(`   ${idx + 1}. [${q.tipo}] ${queryStr.substring(0, 100)}`);

            return {
                id:         `query_${idx}_${Date.now()}`,
                tipo:       q.tipo || 'abrangente',
                titulo:     q.titulo || `Query ${idx + 1}`,
                descricao:  q.descricao || '',
                query:      queryStr,
                url_google: urlGoogle,
            };
        });

        return resultado;

    } catch (e) {
        console.error('❌ [TalentFinder v4.0] Falha no parse:', e);
        throw new Error('Erro ao gerar queries. Tente novamente.');
    }
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const { requisitos } = req.body;

    if (!requisitos || typeof requisitos !== 'string' || !requisitos.trim())
        return res.status(400).json({ error: 'requisitos é obrigatório.' });

    if (requisitos.trim().length < 10)
        return res.status(400).json({ error: 'Descreva os requisitos com mais detalhes (mínimo 10 caracteres).' });

    try {
        console.log(`🚀 [TalentFinder v4.0] Gerando queries booleanas`);
        console.log(`   Requisitos: ${requisitos.substring(0, 100)}`);

        const queries = await gerarQueriesBooleanas(requisitos.trim());

        console.log(`✅ [TalentFinder v4.0] ${queries.length} queries geradas`);

        return res.status(200).json({
            success: true,
            queries,
            total:   queries.length,
            motor:   'gemini-boolean-search',
        });

    } catch (error: any) {
        console.error('❌ [TalentFinder v4.0] Erro:', error.message);

        // ── Detectar rate limit do Gemini (429) ───────────────────────
        const is429 = error.message?.includes('429') ||
                      error.message?.includes('Resource exhausted') ||
                      error.message?.includes('RESOURCE_EXHAUSTED') ||
                      error.status === 429;

        if (is429) {
            console.warn('⚠️ [TalentFinder v4.0] Rate limit Gemini — retornando 429 amigável');
            return res.status(429).json({
                success:        false,
                error:          'rate_limit',
                mensagem_usuario: '⏳ O serviço de IA está sobrecarregado no momento. Aguarde alguns segundos e tente novamente.',
            });
        }

        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao gerar queries',
        });
    }
}
