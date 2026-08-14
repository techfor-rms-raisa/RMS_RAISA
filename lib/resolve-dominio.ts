/**
 * lib/resolve-dominio.ts — Resolução de domínio corporativo via Gemini
 *
 * v1.0 (14/08/2026)
 *
 *   Extrai a função `resolverDominio()` de api/prospect-resolve-domain.ts
 *   v1.1 para uso in-process, seguindo o mesmo padrão já adotado em
 *   lib/email-finder.ts, lib/validate-emails.ts e lib/snovio.ts.
 *
 *   MOTIVO: api/crm-linkedin-capture.ts precisa resolver o domínio da
 *   empresa antes de montar o payload do pipeline de revalidação. Chamar
 *   /api/prospect-resolve-domain via fetch cross-function é bloqueado
 *   pelo Vercel Deployment Protection em Preview (HTTP 401 em HTML) —
 *   mesma causa raiz já diagnosticada em 18/06/2026.
 *
 *   COMPORTAMENTO PRESERVADO BIT A BIT do endpoint v1.1:
 *     - modelo 'gemini-2.5-flash'
 *     - maxOutputTokens 8192 + thinkingBudget 4096 (obrigatório para
 *       Search Grounding devolver conteúdo; sem isso retorna vazio)
 *     - temperature 0.1
 *     - mesmo prompt, mesma extração robusta de texto, mesmas validações
 *       (domínio pessoal, precisa ter ponto, máx 100 chars, strip de
 *       protocolo e barra final)
 *
 *   Fail-soft: qualquer falha retorna null. Quem chama decide o fallback.
 *
 * Caminho: lib/resolve-dominio.ts
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    // 🛡️ .trim() defensivo — protege contra \r\n trailing no env Vercel
    // (padrão histórico do projeto após `echo "..." | vercel env add`).
    const apiKey = (process.env.API_KEY || '').trim();
    if (!apiKey) throw new Error('API_KEY não configurada.');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

/** Domínios pessoais — nunca aceitar como domínio corporativo. */
export const DOMINIOS_PESSOAIS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
  'live.com', 'msn.com', 'icloud.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
]);

/**
 * Descobre o domínio de e-mail corporativo de uma empresa brasileira
 * usando Gemini com Search Grounding.
 *
 * @returns o domínio em minúsculas (ex.: 'empresa.com.br') ou null
 *          quando não há resposta confiável.
 */
export async function resolverDominio(empresaNome: string): Promise<string | null> {
  if (!empresaNome || !empresaNome.trim()) return null;

  const prompt = `
Qual é o domínio de email corporativo oficial da empresa "${empresaNome}" no Brasil?

Pesquise no Google e retorne APENAS o domínio (ex: empresa.com.br), sem protocolo http/https.
Se a empresa tiver múltiplos domínios, retorne o principal/mais usado para emails corporativos.
Se não encontrar com certeza, retorne null.

Responda SOMENTE com JSON:
{"dominio": "empresa.com.br"} ou {"dominio": null}
`.trim();

  try {
    const ai = getAI();

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 4096 },
      } as any,
    });

    // Extração robusta do texto (mesma do endpoint v1.1)
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

    const match = rawText.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const dominio = parsed.dominio?.toLowerCase()?.trim() || null;

    if (!dominio) return null;
    if (DOMINIOS_PESSOAIS.has(dominio)) return null;
    if (!dominio.includes('.')) return null;
    if (dominio.length > 100) return null;

    return dominio.replace(/^https?:\/\//, '').replace(/\/$/, '');
  } catch (err: any) {
    console.warn(`⚠️ [resolve-dominio] Erro ao resolver "${empresaNome}": ${err?.message}`);
    return null;
  }
}
