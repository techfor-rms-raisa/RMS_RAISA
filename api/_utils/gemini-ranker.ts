/**
 * GEMINI RANKER — v1.0
 * Sub-fase 3.A — Camada Gemini (Decisão A.2 — C.2)
 * Data: 13/06/2026
 *
 * Helper que pede ao Gemini para ORDENAR uma lista de candidatos de email
 * do mais provável ao menos provável, dado o contexto da empresa.
 *
 * É chamado AFTER o Gemini Discovery (C.1) falhar, e BEFORE do Snov.io
 * testar os candidatos. Permite que o Snov.io faça early-exit muito mais
 * rápido (testa 3-7 padrões em vez de 16 em média).
 *
 * Diferente do Discovery, o Ranker NÃO retorna email final — só ordem.
 * Por isso, não há risco de hallucination de email aqui. Mesmo se o Gemini
 * "errar" o ranking, o Snov.io ainda é o árbitro final.
 *
 * Falha graciosamente:
 *  - Cap diário atingido → retorna lista original sem reordenar
 *  - Gemini retorna JSON inválido → retorna lista original
 *  - Gemini retorna ordem com itens desconhecidos → ignora desconhecidos,
 *    completa com originais
 *
 * USO:
 *   import { rankearCandidatos } from './_utils/gemini-ranker';
 *   const r = await rankearCandidatos({
 *     candidatos: ['luis.cavanha@riachuelo.com.br', ...],
 *     nome: 'Luis',
 *     sobrenome: 'Cavanha',
 *     empresa: 'Riachuelo',
 *     dominio: 'riachuelo.com.br',
 *     cargo: 'Diretor de TI',
 *   });
 *   // → { ordenados: ['joao.silva@...', 'jsilva@...', ...], gemini_chamado: true }
 */

import { GoogleGenAI } from '@google/genai';
import {
  verificarCapDisponivel,
  incrementarContador,
} from './gemini-daily-counter.js';

// ============================================================================
// CLIENTE GEMINI (singleton)
// ============================================================================

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) {
      throw new Error('API_KEY (Gemini) não configurada no ambiente.');
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ============================================================================
// TIPOS
// ============================================================================

export interface RankerInput {
  candidatos: string[]; // lista de emails (geralmente 32)
  nome: string;
  sobrenome: string;
  empresa: string;
  dominio: string;
  cargo?: string | null;
}

export interface RankerResult {
  ordenados: string[]; // mesma lista, reordenada
  gemini_chamado: boolean;
  tempo_ms: number;
  raciocinio?: string; // breve explicação do Gemini sobre o ranking
  erro?: string;
}

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Reordena a lista `candidatos` do mais provável ao menos provável.
 *
 * GARANTIAS de invariante:
 *  - O array retornado tem EXATAMENTE os mesmos itens do array de entrada
 *    (sem duplicar, sem adicionar, sem omitir).
 *  - Se Gemini falhar por qualquer motivo, retorna `candidatos` na mesma
 *    ordem da entrada (sem ranking).
 *  - Se Gemini retornar uma ordem PARCIAL (perdeu itens), os itens omitidos
 *    são adicionados ao final na ordem original.
 *
 * Isso permite ao caller usar `ordenados` cegamente sem se preocupar com
 * perda de dados.
 */
export async function rankearCandidatos(input: RankerInput): Promise<RankerResult> {
  const inicio = Date.now();

  if (!Array.isArray(input.candidatos) || input.candidatos.length === 0) {
    return {
      ordenados: [],
      gemini_chamado: false,
      tempo_ms: Date.now() - inicio,
      erro: 'LISTA_VAZIA',
    };
  }

  // Se há só 1 candidato, não há o que ordenar
  if (input.candidatos.length === 1) {
    return {
      ordenados: [...input.candidatos],
      gemini_chamado: false,
      tempo_ms: Date.now() - inicio,
    };
  }

  // 1. Verifica cap diário ANTES de chamar Gemini
  const capOk = await verificarCapDisponivel('ranker');
  if (!capOk) {
    return {
      ordenados: [...input.candidatos],
      gemini_chamado: false,
      tempo_ms: Date.now() - inicio,
      raciocinio: 'Cap diário Gemini atingido — usando ordem original.',
    };
  }

  // 2. Monta prompt
  const prompt = construirPromptRanker(input);

  // 3. Chama Gemini SEM Search Grounding (ranker não precisa buscar — só
  //    raciocinar sobre o contexto fornecido)
  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 2048 },
      } as any,
    });

    await incrementarContador('ranker');

    // 4. Extrai texto
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

    // 5. Parse + reconciliação com invariante de completude
    return reconciliarRanking(rawText, input.candidatos, inicio);
  } catch (err: any) {
    return {
      ordenados: [...input.candidatos],
      gemini_chamado: true,
      tempo_ms: Date.now() - inicio,
      erro: err?.message?.slice(0, 200) || 'ERRO_GEMINI_RANKER',
    };
  }
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function construirPromptRanker(input: RankerInput): string {
  const cargoTexto = input.cargo ? `, cargo "${input.cargo}"` : '';
  const empresaTexto = input.empresa || `(domínio ${input.dominio})`;

  // Lista numerada para o Gemini referenciar por índice (mais robusto que
  // referenciar por string em listas longas).
  const listaNumerada = input.candidatos
    .map((c, i) => `${i}: ${c}`)
    .join('\n');

  return `
Tarefa: ordenar uma lista de candidatos de email do MAIS provável ao MENOS
provável, dado o contexto da empresa.

Contexto:
- Pessoa: ${input.nome} ${input.sobrenome}${cargoTexto}
- Empresa: ${empresaTexto}
- Domínio: ${input.dominio}

Critérios de ordenação (use seu conhecimento + raciocínio):
1. Padrão típico de empresas no segmento dela (varejo, banco, tech, etc.)
2. Porte da empresa (multinacionais usam nome.sobrenome; pequenas usam nome)
3. Provider do email (Office365/Google têm padrões típicos)
4. Convenções brasileiras vs internacionais

Lista de candidatos (numerados):
${listaNumerada}

REGRAS:
- Use TODOS os ${input.candidatos.length} candidatos da lista. Não omita nenhum.
- Responda APENAS JSON sem markdown. Schema:

{
  "ordem": [índice_do_mais_provavel, índice_do_segundo, ..., índice_do_menos_provavel],
  "raciocinio": "uma frase curta explicando o critério principal usado"
}

Exemplo válido se a lista tem 4 itens: {"ordem":[2,0,3,1],"raciocinio":"empresa de varejo brasileiro tende a usar nome.sobrenome"}
`.trim();
}

/**
 * Reconcilia a resposta do Gemini com a lista original, garantindo a
 * invariante de completude (todos os candidatos originais aparecem no
 * resultado, sem duplicar).
 */
function reconciliarRanking(
  rawText: string,
  candidatosOriginais: string[],
  inicio: number
): RankerResult {
  if (!rawText || !rawText.trim()) {
    return {
      ordenados: [...candidatosOriginais],
      gemini_chamado: true,
      tempo_ms: Date.now() - inicio,
      erro: 'GEMINI_RANKER_VAZIO',
    };
  }

  const limpo = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim();

  const match = limpo.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      ordenados: [...candidatosOriginais],
      gemini_chamado: true,
      tempo_ms: Date.now() - inicio,
      erro: 'GEMINI_RANKER_NAO_JSON',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return {
      ordenados: [...candidatosOriginais],
      gemini_chamado: true,
      tempo_ms: Date.now() - inicio,
      erro: 'GEMINI_RANKER_JSON_INVALIDO',
    };
  }

  const ordem = Array.isArray(parsed.ordem) ? parsed.ordem : null;
  if (!ordem) {
    return {
      ordenados: [...candidatosOriginais],
      gemini_chamado: true,
      tempo_ms: Date.now() - inicio,
      erro: 'GEMINI_RANKER_SEM_ORDEM',
    };
  }

  // Reconstrói lista respeitando a ordem do Gemini E mantendo a invariante
  // de completude.
  const ordenados: string[] = [];
  const seen = new Set<number>();

  for (const i of ordem) {
    const idx = parseInt(i, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= candidatosOriginais.length) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    ordenados.push(candidatosOriginais[idx]);
  }

  // Adiciona itens omitidos pelo Gemini ao final (na ordem original)
  for (let i = 0; i < candidatosOriginais.length; i++) {
    if (!seen.has(i)) {
      ordenados.push(candidatosOriginais[i]);
    }
  }

  return {
    ordenados,
    gemini_chamado: true,
    tempo_ms: Date.now() - inicio,
    raciocinio: (parsed.raciocinio || '').toString().slice(0, 300),
  };
}
