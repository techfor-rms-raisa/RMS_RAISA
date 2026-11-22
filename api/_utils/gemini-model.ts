/**
 * api/_utils/gemini-model.ts
 *
 * Camada única de seleção do modelo Gemini para o backend (Vercel).
 *
 * v1.0 — 2026-11-22 (Commit 1 da migração Gemini 2.5 → 3.x)
 *   Motivo: aviso oficial da Google — a partir de 01/12/2026 toda chamada a
 *   `gemini-2.5-flash` é redirecionada automaticamente para `gemini-3.5-flash-lite`
 *   (thinking_level padrão "minimal"). Sem escolha explícita, as análises de
 *   recrutamento cairiam para o modelo mais fraco da linha, sem erro no log.
 *
 * Dois níveis, sobrescrevíveis por variável de ambiente no Vercel:
 *   - ANALISE → raciocínio (adequação CV×vaga, triagem, extração estruturada de CV,
 *               perguntas de entrevista, respostas escritas, relatórios de risco).
 *   - LITE    → alto volume / baixa inferência (transcrição PDF→texto, classificação
 *               de e-mails e respostas de clientes).
 *
 * Regras herdadas da migração 3.x (guia oficial):
 *   - `temperature`, `top_p` e `top_k` são IGNORADOS pelos modelos 3.x — não enviar.
 *   - `thinking_budget` foi substituído por `thinking_level`. O SDK @google/genai 0.6.x
 *     ainda não serializa `thinkingLevel` (descarta o campo), então até o upgrade do SDK
 *     (previsto 28/11/2026) usamos o default de cada modelo: 3.8 Flash = medium,
 *     3.5 Flash-Lite = minimal.
 *   - `maxOutputTokens` ≥ 32768 em modelos com thinking: os tokens de raciocínio consomem
 *     o mesmo orçamento da resposta (causa raiz do JSON truncado em analise-adequacao-perfil).
 */

/** Modelo para tarefas de análise/raciocínio. */
export const GEMINI_MODEL_ANALISE: string =
  process.env.GEMINI_MODEL_ANALISE || 'gemini-3.8-flash';

/** Modelo para tarefas de alto volume e baixa inferência. */
export const GEMINI_MODEL_LITE: string =
  process.env.GEMINI_MODEL_LITE || 'gemini-3.5-flash-lite';

/** Teto de saída recomendado para modelos 3.x com thinking (inclui tokens de raciocínio). */
export const GEMINI_MAX_OUTPUT_TOKENS = 32768;

/** Loga, uma vez por cold-start, qual modelo está em uso (diagnóstico em Preview/Produção). */
let _logado = false;
export function logarModelosGemini(origem: string): void {
  if (_logado) return;
  _logado = true;
  console.log(`🤖 [${origem}] Gemini ANALISE=${GEMINI_MODEL_ANALISE} | LITE=${GEMINI_MODEL_LITE} | maxOutputTokens=${GEMINI_MAX_OUTPUT_TOKENS}`);
}
