/**
 * api/talent-finder-search.ts
 *
 * TALENT FINDER — Motor de Busca de Candidatos via Gemini AI + Google Search
 *
 * Conceito: mesmo padrão do Prospect Engine (prospect-gemini-search.ts),
 * mas voltado para busca de CANDIDATOS no LinkedIn com base em requisitos
 * mandatórios informados pelo Analista de R&S.
 *
 * Fluxo:
 * 1. Analista informa requisitos em texto livre (ex: "Consultor SAP FI Senior, SP")
 * 2. Gemini 2.5 Flash + Google Search Grounding descobre perfis públicos no LinkedIn
 * 3. Retorna: Nome / Cargo / LinkedIn URL
 * 4. Sem gravação no banco — apenas exibição + exportação XLS opcional
 *
 * Versão: 1.0
 * Data: 12/03/2026
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

// ─── Interface do candidato encontrado ──────────────────────────────
export interface CandidatoEncontrado {
    finder_id:      string;
    nome_completo:  string;
    cargo_atual:    string;
    empresa_atual:  string | null;
    linkedin_url:   string | null;
    cidade:         string | null;
    estado:         string | null;
    resumo:         string | null;
    relevancia:     'alta' | 'media' | 'baixa';
}

// ─── Função principal de busca ────────────────────────────────────────
async function buscarCandidatosGemini(
    requisitos: string,
    maxResultados: number = 20
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[] }> {

    const ai = getAI();

    const prompt = `
Você é um especialista em recrutamento técnico. Use o Google Search para encontrar profissionais reais com os requisitos abaixo, priorizando perfis públicos do LinkedIn.

REQUISITOS DO ANALISTA:
"${requisitos}"

EXECUTE ATÉ 6 BUSCAS DISTINTAS (pare ao ter ${maxResultados}+ candidatos ou ao esgotar opções):

1. site:linkedin.com/in ${extrairTermosPrincipais(requisitos)} Brasil
2. ${extrairTermosPrincipais(requisitos)} linkedin.com/in profissional
3. ${extrairTermosPrincipais(requisitos)} linkedin Brasil "São Paulo" OR "SP" (se houver indicação de região)
4. ${extrairTermosPrincipais(requisitos)} perfil profissional linkedin Brasil
5. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} candidatos) ${extrairTermosPrincipais(requisitos)} consultor especialista linkedin
6. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} candidatos) ${extrairTermosPrincipais(requisitos)} sênior pleno linkedin Brasil

REGRAS ABSOLUTAS:
- Busque SOMENTE profissionais com os requisitos técnicos informados
- Inclua APENAS pessoas reais encontradas nas buscas — NÃO invente nomes ou cargos
- Para LinkedIn: use a URL exata encontrada. Se não encontrou, coloque null
- NÃO repita o mesmo profissional
- NÃO confirme o mesmo nome mais de uma vez
- Avalie a relevância: "alta" (atende todos os requisitos), "media" (atende os principais), "baixa" (atende parcialmente)
- Se encontrou empresa atual, inclua. Se não, coloque null
- Inclua cidade/estado se visível no perfil

Responda SOMENTE JSON sem markdown:
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string|null","linkedin_url":"https://linkedin.com/in/slug ou null","cidade":"string|null","estado":"UF|null","resumo":"breve resumo do perfil ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🤖 [TalentFinder] Buscando candidatos com requisitos: ${requisitos.substring(0, 80)}...`);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.2,
            maxOutputTokens: 8192,
            // 4096: validado no Prospect Engine — suficiente para 5-6 buscas Google
            thinkingConfig: { thinkingBudget: 4096 },
        } as any
    });

    const rawText = result.text || '';
    console.log(`📦 [TalentFinder] Resposta raw (${rawText.length} chars)`);

    // Parse defensivo — remove markdown se vier
    const cleanText = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

    // Extrai bloco JSON
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('❌ [TalentFinder] Nenhum JSON válido na resposta');
        console.error('Raw:', rawText.substring(0, 500));
        throw new Error('Gemini não retornou JSON válido. Tente novamente.');
    }

    let parsed: any;
    try {
        // Sanitizar: remove controles ASCII, normaliza aspas tipográficas
        const sanitized = jsonMatch[0]
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .replace(/\u0000/g, '');

        parsed = JSON.parse(sanitized);
    } catch (e) {
        console.error('❌ [TalentFinder] Falha ao parsear JSON:', e);
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
                throw new Error('Sem array de candidatos');
            }
        } catch {
            throw new Error('Erro ao interpretar resposta do Gemini.');
        }
    }

    const candidatos: any[] = parsed.candidatos || [];
    console.log(`✅ [TalentFinder] ${candidatos.length} candidatos encontrados`);

    const comLinkedin = candidatos.filter(c => c.linkedin_url && c.linkedin_url !== 'null').length;
    console.log(`🔗 [TalentFinder] Com LinkedIn: ${comLinkedin}/${candidatos.length}`);

    // Normalizar e tipar resultados
    const resultados: CandidatoEncontrado[] = candidatos.map((c: any, idx: number) => {
        const nomeCompleto = (c.nome_completo || '').trim();

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
            finder_id:      `finder_${idx}_${Date.now()}`,
            nome_completo:  nomeCompleto,
            cargo_atual:    (c.cargo_atual || '').trim(),
            empresa_atual:  c.empresa_atual && c.empresa_atual !== 'null' ? c.empresa_atual : null,
            linkedin_url:   linkedinNorm,
            cidade:         c.cidade && c.cidade !== 'null' ? c.cidade : null,
            estado:         c.estado && c.estado !== 'null' ? c.estado : null,
            resumo:         c.resumo && c.resumo !== 'null' ? c.resumo : null,
            relevancia,
        };
    });

    // Extrair queries usadas pelo grounding
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];
    console.log(`🔍 [TalentFinder] Google queries: ${queriesUsadas.join(' | ')}`);

    return { resultados, queries_usadas: queriesUsadas };
}

// ─── Helper: extrai termos-chave dos requisitos para as queries ───────
// Evita enviar o texto completo como query — pega os termos mais relevantes
function extrairTermosPrincipais(requisitos: string): string {
    // Remove palavras comuns de contexto, mantém termos técnicos e de nível
    const stopWords = [
        'conhecimentos', 'obrigatórios', 'obrigatorios', 'desejáveis', 'desejavel',
        'com', 'sem', 'para', 'por', 'que', 'ou', 'e', 'de', 'do', 'da',
        'como', 'nível', 'nivel', 'região', 'regiao', 'capital', 'grande',
        'é', 'são', 'ser', 'ter', 'profissional', 'conhecimento',
        'básico', 'basico', 'avançado', 'avancado', 'intermediario', 'intermediário'
    ];

    const palavras = requisitos
        .split(/[\s,;:/\n]+/)
        .map(p => p.trim())
        .filter(p => p.length > 2 && !stopWords.includes(p.toLowerCase()));

    // Pega as 6 primeiras palavras relevantes para não criar query muito longa
    return palavras.slice(0, 6).join(' ');
}

// ─── Deduplicação por nome normalizado ───────────────────────────────
function deduplicar(lista: CandidatoEncontrado[]): CandidatoEncontrado[] {
    const vistos = new Set<string>();
    return lista.filter(c => {
        const chave = c.nome_completo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
        if (!chave || vistos.has(chave)) return false;
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
        requisitos,
        max_resultados = 20,
    } = req.body;

    if (!requisitos || typeof requisitos !== 'string' || !requisitos.trim()) {
        return res.status(400).json({ error: 'requisitos é obrigatório.' });
    }

    if (requisitos.trim().length < 10) {
        return res.status(400).json({ error: 'Descreva os requisitos com mais detalhes (mínimo 10 caracteres).' });
    }

    try {
        const maxPorChamada = Math.min(Math.max(max_resultados || 20, 5), 50);

        console.log(`🚀 [TalentFinder] Iniciando busca`);
        console.log(`   Requisitos: ${requisitos.substring(0, 100)}`);
        console.log(`   Max resultados: ${maxPorChamada}`);

        const { resultados, queries_usadas } = await buscarCandidatosGemini(
            requisitos.trim(),
            maxPorChamada
        );

        const deduplicados = deduplicar(resultados);

        // Ordenar por relevância: alta → media → baixa
        const ordemRelevancia = { alta: 0, media: 1, baixa: 2 };
        deduplicados.sort((a, b) => ordemRelevancia[a.relevancia] - ordemRelevancia[b.relevancia]);

        console.log(`✅ [TalentFinder] Final: ${deduplicados.length} únicos (de ${resultados.length})`);

        return res.status(200).json({
            success:        true,
            resultados:     deduplicados,
            total:          deduplicados.length,
            queries_google: queries_usadas,
            motor:          'gemini',
        });

    } catch (error: any) {
        console.error('❌ [TalentFinder] Erro:', error.message);
        return res.status(500).json({
            success: false,
            error:   error.message || 'Erro ao buscar candidatos via Gemini',
        });
    }
}
