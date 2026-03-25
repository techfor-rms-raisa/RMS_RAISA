/**
 * api/prospect-resolve-domain.ts
 *
 * Resolve o domínio de email corporativo de uma empresa usando Gemini AI + Search Grounding.
 *
 * Modos:
 * - POST { empresa_nome }           → resolve domínio de uma empresa
 * - POST { empresas: string[] }     → resolve em lote (máx 20 por chamada)
 *
 * Versão: 1.0
 * Data: 25/03/2026
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

// Domínios pessoais — nunca aceitar como domínio corporativo
const DOMINIOS_PESSOAIS = new Set([
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
    'live.com', 'msn.com', 'icloud.com', 'bol.com.br', 'uol.com.br',
    'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
]);

// ─── RESOLVER ÚNICO ────────────────────────────────────────────────────────────

async function resolverDominio(empresaNome: string): Promise<string | null> {
    const ai = getAI();

    const prompt = `
Qual é o domínio de email corporativo oficial da empresa "${empresaNome}" no Brasil?

Pesquise no Google e retorne APENAS o domínio (ex: empresa.com.br), sem protocolo http/https.
Se a empresa tiver múltiplos domínios, retorne o principal/mais usado para emails corporativos.
Se não encontrar com certeza, retorne null.

Responda SOMENTE com JSON:
{"dominio": "empresa.com.br"} ou {"dominio": null}
`.trim();

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
                maxOutputTokens: 100,
            } as any,
        });

        // Extração robusta do texto
        let rawText = '';
        try {
            const candidates = (result as any).candidates;
            if (candidates?.[0]?.content?.parts) {
                rawText = candidates[0].content.parts
                    .filter((p: any) => p.text && typeof p.text === 'string')
                    .map((p: any) => p.text)
                    .join('');
            }
            if (!rawText && result.text) rawText = result.text;
        } catch {
            rawText = result.text || '';
        }

        // Parse JSON
        const match = rawText.match(/\{[\s\S]*?\}/);
        if (!match) return null;

        const parsed = JSON.parse(match[0]);
        const dominio = parsed.dominio?.toLowerCase()?.trim() || null;

        // Validar: não aceitar domínios pessoais, genéricos ou inválidos
        if (!dominio) return null;
        if (DOMINIOS_PESSOAIS.has(dominio)) return null;
        if (!dominio.includes('.')) return null;
        if (dominio.length > 100) return null;

        // Remover http/https se o modelo errar
        return dominio.replace(/^https?:\/\//, '').replace(/\/$/, '');

    } catch (err: any) {
        console.warn(`⚠️ [resolve-domain] Erro ao resolver "${empresaNome}":`, err.message);
        return null;
    }
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const { empresa_nome, empresas } = req.body;

    // ── MODO ÚNICO ─────────────────────────────────────────────────────────────
    if (empresa_nome && typeof empresa_nome === 'string') {
        const dominio = await resolverDominio(empresa_nome.trim());

        if (!dominio) {
            console.log(`📋 [resolve-domain] Sem resultado: "${empresa_nome}" — deixar para review manual`);
        } else {
            console.log(`✅ [resolve-domain] "${empresa_nome}" → ${dominio}`);
        }

        return res.status(200).json({ success: true, empresa_nome, dominio });
    }

    // ── MODO LOTE ──────────────────────────────────────────────────────────────
    if (Array.isArray(empresas) && empresas.length > 0) {
        const lista = empresas.slice(0, 20); // máx 20 por chamada
        const semResultado: string[] = [];

        // Processar em lotes de 4 (evitar timeout)
        const resultados: Record<string, string | null> = {};
        for (let i = 0; i < lista.length; i += 4) {
            const lote = lista.slice(i, i + 4);
            const promises = lote.map(async (nome: string) => {
                const dominio = await resolverDominio(nome.trim());
                resultados[nome] = dominio;
                if (!dominio) semResultado.push(nome);
                else console.log(`✅ [resolve-domain] "${nome}" → ${dominio}`);
            });
            await Promise.all(promises);
        }

        if (semResultado.length > 0) {
            console.log(`📋 [resolve-domain] Sem resultado (${semResultado.length}): ${semResultado.join(', ')}`);
        }

        return res.status(200).json({
            success:      true,
            resultados,
            sem_resultado: semResultado,
            total:        lista.length,
            resolvidos:   Object.values(resultados).filter(Boolean).length,
        });
    }

    return res.status(400).json({ error: 'Informe empresa_nome (string) ou empresas (array).' });
}
