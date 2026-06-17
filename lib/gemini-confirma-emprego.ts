/**
 * lib/gemini-confirma-emprego.ts — Fallback Gemini para Revalidação (Etapa 2-B)
 *
 * v1.0 (17/06/2026)
 *
 * Quando o Apollo People Match retorna vazio (caso muito comum para perfis
 * de empresas brasileiras de médio porte que o Apollo não indexa), este
 * adapter usa Gemini 2.5 Flash com Google Search grounding para confirmar:
 *   - se a pessoa ainda trabalha na empresa antiga (CRM)
 *   - empresa atual, cargo atual, LinkedIn URL
 *   - nível de confiança: 'alta' | 'media' | 'baixa'
 *
 * Padrão técnico copiado de api/prospect-resolve-domain.ts v1.1:
 *   - gemini-2.5-flash (estável após depreciação de 2.0-flash em 01/06/2026)
 *   - maxOutputTokens: 8192 (modelo precisa de tokens para "pensar")
 *   - thinkingConfig.thinkingBudget: 4096 (obrigatório p/ Search Grounding)
 *
 * Custo: ~$0 (cota generosa Gemini). Latência: 3-8s por chamada com Search.
 * É o motor mais lento da cascata — usado só quando Apollo vazia.
 *
 * Caminho: lib/gemini-confirma-emprego.ts
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) throw new Error('API_KEY (Gemini) não configurada.');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ──────────────────────────────────────────────────────────────────────

export interface GeminiConfirmaInput {
  nome_completo:    string;
  empresa_antiga:   string;            // empresa atual no CRM (a ser confirmada/refutada)
  empresa_dominio?: string | null;
  linkedin_url?:    string | null;
  cargo_anterior?:  string | null;
}

export interface GeminiConfirmaResult {
  /** True quando Gemini retornou empresa_atual com confiança >= 'media'. */
  encontrado:      boolean;
  empresa_nome?:   string;
  cargo?:          string;
  linkedin_url?:   string;
  confianca:       'alta' | 'media' | 'baixa';
  evidencia_url?:  string;
  /** Payload completo do Gemini, para auditoria em prospect_revalidacao_log. */
  payload_raw?:    any;
  /** Motivo quando encontrado=false (sem JSON, confiança baixa, etc). */
  motivo?:         string;
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — geminiConfirmaEmprego
// ──────────────────────────────────────────────────────────────────────

export async function geminiConfirmaEmprego(
  input: GeminiConfirmaInput
): Promise<GeminiConfirmaResult> {

  if (!input.nome_completo || !input.empresa_antiga) {
    return {
      encontrado: false,
      confianca:  'baixa',
      motivo:     'Faltam dados mínimos: nome_completo e empresa_antiga',
    };
  }

  const ai = getAI();

  // Prompt da Seção 3.4.1 da especificação, com ajustes para JSON estrito
  const prompt = `
Verifique se "${input.nome_completo}" ainda trabalha em "${input.empresa_antiga}".
${input.linkedin_url ? `Perfil LinkedIn de referência: ${input.linkedin_url}` : ''}
${input.cargo_anterior ? `Cargo informado no CRM: ${input.cargo_anterior}` : ''}

Use busca no Google priorizando: linkedin.com/in/, sites corporativos,
notícias recentes e portais de imprensa profissional.

Retorne SOMENTE JSON válido (sem markdown, sem backticks, sem texto fora do JSON):
{
  "empresa_atual":  "Nome da empresa atual",
  "cargo_atual":    "Cargo atual",
  "linkedin_url":   "URL completa do perfil LinkedIn",
  "confianca":      "alta" | "media" | "baixa",
  "evidencia_url":  "URL da fonte onde encontrou a informação"
}

Se NÃO conseguir confirmar com pelo menos confiança média, retorne:
{
  "empresa_atual":  null,
  "cargo_atual":    null,
  "linkedin_url":   null,
  "confianca":      "baixa",
  "evidencia_url":  null
}
`.trim();

  try {
    const result = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools:           [{ googleSearch: {} }],
        temperature:     0.1,
        maxOutputTokens: 8192,
        thinkingConfig:  { thinkingBudget: 4096 },
      } as any,
    });

    // Extração robusta do texto (padrão observado em prospect-resolve-domain v1.1)
    let rawText = '';
    try {
      const candidates = (result as any).candidates;
      if (candidates?.[0]?.content?.parts) {
        rawText = candidates[0].content.parts
          .filter((p: any) => p.text && typeof p.text === 'string')
          .map((p: any) => p.text)
          .join('');
      }
      if (!rawText && (result as any).text) rawText = (result as any).text;
    } catch {
      rawText = (result as any).text || '';
    }

    if (!rawText) {
      return {
        encontrado: false,
        confianca:  'baixa',
        motivo:     'Gemini retornou texto vazio',
      };
    }

    // Extrai primeiro bloco {...} do texto
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        encontrado:  false,
        confianca:   'baixa',
        motivo:      'Gemini retornou texto sem JSON parseável',
        payload_raw: { rawText: rawText.substring(0, 500) },
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch (parseErr: any) {
      return {
        encontrado:  false,
        confianca:   'baixa',
        motivo:      `JSON malformado: ${parseErr?.message}`,
        payload_raw: { rawText: rawText.substring(0, 500) },
      };
    }

    // Normaliza confiança
    const confStr = String(parsed.confianca || 'baixa').toLowerCase().trim();
    const confianca: 'alta' | 'media' | 'baixa' =
      confStr === 'alta'  ? 'alta'  :
      confStr === 'media' ? 'media' :
      'baixa';

    // Confiança baixa OU sem empresa → não encontrado
    if (confianca === 'baixa' || !parsed.empresa_atual) {
      return {
        encontrado:  false,
        confianca,
        motivo:      'Gemini não conseguiu confirmar com confiança suficiente',
        payload_raw: parsed,
      };
    }

    console.log(`✅ [geminiConfirmaEmprego] ${input.nome_completo} → ${parsed.empresa_atual} (${parsed.cargo_atual || '?'}) [confianca=${confianca}]`);
    return {
      encontrado:    true,
      empresa_nome:  parsed.empresa_atual,
      cargo:         parsed.cargo_atual || undefined,
      linkedin_url:  parsed.linkedin_url || undefined,
      confianca,
      evidencia_url: parsed.evidencia_url || undefined,
      payload_raw:   parsed,
    };

  } catch (err: any) {
    console.error(`❌ [geminiConfirmaEmprego] Erro: ${err?.message}`);
    return {
      encontrado: false,
      confianca:  'baixa',
      motivo:     `Erro na chamada Gemini: ${err?.message}`,
    };
  }
}
