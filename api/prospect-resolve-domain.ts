/**
 * api/prospect-resolve-domain.ts
 *
 * Resolve o domínio de email corporativo de uma empresa usando Gemini AI + Search Grounding.
 *
 * Modos:
 * - POST { empresa_nome }           → resolve domínio de uma empresa
 * - POST { empresas: string[] }     → resolve em lote (máx 20 por chamada)
 *
 * 🆕 v1.2 (14/08/2026): Refator lib/ — a função `resolverDominio()` (e a
 *                       constante DOMINIOS_PESSOAIS) saíram deste arquivo
 *                       para `lib/resolve-dominio.ts`, permitindo uso
 *                       in-process por api/crm-linkedin-capture.ts sem
 *                       fetch cross-function (bloqueado pelo Vercel
 *                       Deployment Protection em Preview).
 *
 *                       Este endpoint continua existindo com contrato HTTP
 *                       IDÊNTICO — nenhum caller precisa mudar. A lógica de
 *                       resolução (prompt, modelo, thinkingBudget, validações)
 *                       foi movida sem alteração de comportamento.
 *
 *                       Mudanças: remoção de getAI(), DOMINIOS_PESSOAIS e
 *                       resolverDominio(); adição do import da lib. Nada mais.
 *
 * 🆕 v1.1 (08/06/2026): Migração Gemini — 'gemini-2.0-flash' (depreciado, desativação 01/06/2026)
 *                       → 'gemini-2.5-flash' (estável, ativo).
 *                       Ajustes obrigatórios para gemini-2.5-flash com Search Grounding:
 *                       - maxOutputTokens: 100 → 8192 (modelo precisa de tokens para "pensar" antes de responder)
 *                       - thinkingConfig.thinkingBudget: 4096 (obrigatório p/ Search Grounding; sem isso retorna vazio)
 *                       Re-aplicação da entrega da sessão 05/06/2026 cujo commit foi perdido.
 *
 * Versão: 1.2
 * Data: 25/03/2026 (criação) | 08/06/2026 (migração modelo) | 14/08/2026 (refator lib/)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolverDominio } from '../lib/resolve-dominio.js';

export const config = { maxDuration: 30 };

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
