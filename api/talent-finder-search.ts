/**
 * api/talent-finder-search.ts
 *
 * TALENT FINDER — Motor de Busca de Candidatos via Gemini AI + Google Search
 *
 * Fluxo:
 * 1. Analista informa requisitos em texto livre (ex: "Consultor SAP FI Senior, SP")
 * 2. Gemini 2.5 Flash + Google Search Grounding descobre perfis públicos no LinkedIn
 * 3. Retorna: Nome / Cargo / Empresa / LinkedIn URL / Cidade / Relevância
 * 4. Sem gravação no banco — apenas exibição + exportação XLS opcional
 *
 * Versão: 1.3 — Prompt corrigido com queries pré-montadas (padrão Prospect Engine v2.1)
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

// ─── Extrai termos-âncora dos requisitos para montar as queries ──────────────
// Pega os 4-5 primeiros termos técnicos relevantes (ex: "SAP ISOil SD MM FI")
// sem palavras genéricas, para montar queries curtas e eficazes no Google
function extrairAncoras(requisitos: string): { tecnologias: string; localizacao: string } {
    const stopWords = new Set([
        'com', 'sem', 'para', 'por', 'que', 'ou', 'e', 'de', 'do', 'da',
        'como', 'nível', 'nivel', 'região', 'regiao', 'capital', 'grande',
        'é', 'são', 'ser', 'ter', 'conhecimento', 'conhecimentos',
        'básico', 'basico', 'avançado', 'avancado', 'intermediario', 'intermediário',
        'obrigatório', 'obrigatorio', 'desejável', 'desejavel', 'profissional',
    ]);

    // Localização: detecta padrões como "São Paulo", "SP", "Rio de Janeiro", "RJ", "Brasil"
    const locMatch = requisitos.match(
        /\b(São Paulo|SP|Rio de Janeiro|RJ|Curitiba|PR|Belo Horizonte|BH|MG|Grande SP|Campinas|Brasil|Brazil|Remote|Remoto)\b/gi
    );
    const localizacao = locMatch ? [...new Set(locMatch.map(l => l.trim()))].slice(0, 2).join(' OR ') : 'Brasil';

    // Tecnologias/skills: palavras relevantes, sem stop words, máx 5 termos
    const palavras = requisitos
        .split(/[\s,;:/\n()+\-]+/)
        .map(p => p.trim())
        .filter(p => p.length > 2 && !stopWords.has(p.toLowerCase()));

    const tecnologias = palavras.slice(0, 5).join(' ');

    return { tecnologias, localizacao };
}

async function buscarCandidatosGemini(
    requisitos: string,
    maxResultados: number = 20
): Promise<{ resultados: CandidatoEncontrado[]; queries_usadas: string[] }> {

    const ai = getAI();
    const { tecnologias, localizacao } = extrairAncoras(requisitos);

    // ── PROMPT: mesmo padrão do Prospect Engine v2.1
    // Queries pré-montadas com âncoras extraídas — obriga o Gemini a executar buscas
    const prompt = `
Você é um especialista em recrutamento técnico. Use o Google Search para encontrar profissionais reais que atendam os requisitos abaixo.

REQUISITOS DA VAGA:
"${requisitos}"

EXECUTE ATÉ 6 BUSCAS DISTINTAS (pare ao ter ${maxResultados}+ candidatos ou ao esgotar opções):

1. site:linkedin.com/in ${tecnologias} "${localizacao}"
2. "${tecnologias}" linkedin.com/in profissional Brasil
3. ${tecnologias} linkedin Brasil "${localizacao}"
4. ${tecnologias} especialista senior linkedin site:linkedin.com
5. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} candidatos) ${tecnologias} consultor especialista linkedin Brasil
6. (se ainda abaixo de ${Math.ceil(maxResultados / 2)} candidatos) ${tecnologias} pleno sênior linkedin "${localizacao}"

REGRAS ABSOLUTAS:
- Inclua APENAS pessoas reais encontradas nas buscas — JAMAIS invente nomes, cargos ou URLs
- Não repita o mesmo profissional mesmo que apareça em múltiplas buscas
- Para LinkedIn: use a URL exata encontrada. Se não encontrou, coloque linkedin_url: null
- NÃO tente confirmar o mesmo perfil mais de uma vez
- Avalie a relevância em relação aos requisitos informados: "alta" = atende todos os requisitos principais, "media" = atende a maioria, "baixa" = atende parcialmente
- Inclua empresa_atual, cidade e estado se visíveis no perfil encontrado; caso contrário, null
- Retorne quem encontrou, mesmo que seja só 1 ou 2 pessoas

Responda SOMENTE JSON puro sem markdown:
{"candidatos":[{"nome_completo":"string","cargo_atual":"string","empresa_atual":"string ou null","linkedin_url":"https://linkedin.com/in/slug ou null","cidade":"string ou null","estado":"UF ou null","resumo":"resumo em 1 frase do perfil ou null","relevancia":"alta|media|baixa"}]}
`.trim();

    console.log(`🤖 [TalentFinder] Iniciando busca Gemini`);
    console.log(`   Âncora tecnologias: "${tecnologias}"`);
    console.log(`   Localização: "${localizacao}"`);

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
    console.log(`📦 [TalentFinder] Resposta raw (${rawText.length} chars)`);

    if (rawText.length < 20) {
        console.error('❌ [TalentFinder] Resposta muito curta');
        console.error('Raw text:', JSON.stringify(rawText));
        throw new Error('O Gemini não retornou resultados. Tente reformular os requisitos.');
    }

    // Parse defensivo
    const cleanText = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('❌ [TalentFinder] Nenhum JSON válido na resposta');
        console.error('Raw:', rawText.substring(0, 500));
        throw new Error('Gemini não retornou JSON válido. Tente novamente.');
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
        console.error('❌ [TalentFinder] Falha ao parsear JSON:', e);
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
            throw new Error('Erro ao interpretar resposta do Gemini. Tente novamente.');
        }
    }

    const candidatos: any[] = parsed.candidatos || [];
    console.log(`✅ [TalentFinder] ${candidatos.length} candidatos encontrados`);

    const comLinkedin = candidatos.filter(c => c.linkedin_url && c.linkedin_url !== 'null').length;
    console.log(`🔗 [TalentFinder] Com LinkedIn: ${comLinkedin}/${candidatos.length}`);

    // Normalizar resultados
    const resultados: CandidatoEncontrado[] = candidatos.map((c: any, idx: number) => {
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

    // Extrair queries usadas pelo grounding
    const groundingMeta = (result as any).candidates?.[0]?.groundingMetadata;
    const queriesUsadas: string[] = groundingMeta?.webSearchQueries || [];
    console.log(`🔍 [TalentFinder] Google queries: ${queriesUsadas.join(' | ')}`);

    return { resultados, queries_usadas: queriesUsadas };
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

    const { requisitos, max_resultados = 20 } = req.body;

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
