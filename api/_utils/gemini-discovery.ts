/**
 * GEMINI DISCOVERY — v1.0
 * Sub-fase 3.A — Camada Gemini (Decisão A.1+A.2 — Gemini ANTES Snov.io / C.1)
 * Data: 13/06/2026
 *
 * Helper para descoberta direta de email corporativo via Gemini com
 * Search Grounding. Funciona como Etapa 1 da nova cascata de Recovery:
 *
 *   Cache → MX → [GEMINI DISCOVERY (este helper)] → Validação dupla (Snov.io + SMTP probe seletivo)
 *
 * Estratégia de prompt:
 *  - Pede ao Gemini para buscar o email em fontes públicas (LinkedIn,
 *    assinaturas vazadas, podcasts, palestras, sites corporativos).
 *  - Exige resposta em JSON estruturado.
 *  - Pede confiança do Gemini (0-100) — usado por logging/diagnóstico mas
 *    NÃO substitui a validação dupla (decisão A.3=D).
 *  - Anti-hallucination: instrui explicitamente a retornar `null` quando
 *    não houver evidência. Mas confiamos só após Snov.io + SMTP validarem.
 *
 * USO:
 *   import { descobrirEmail } from './_utils/gemini-discovery';
 *   const r = await descobrirEmail({
 *     nome: 'Luis',
 *     sobrenome: 'Cavanha',
 *     empresa: 'Riachuelo',
 *     dominio: 'riachuelo.com.br',
 *     cargo: 'Diretor de TI',
 *   });
 *   // → { email: 'luis.cavanha@riachuelo.com.br', confianca_gemini: 85, raciocinio: '...' }
 *   // ou { email: null, confianca_gemini: 0, raciocinio: 'sem evidência' }
 *
 * REUSA: padrão técnico de `prospect-resolve-domain.ts` já em produção
 * (mesmo modelo gemini-2.5-flash, mesma config de Search Grounding,
 * mesmo padrão de thinkingBudget).
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

export interface DiscoveryInput {
  nome: string;
  sobrenome: string;
  empresa: string;
  dominio: string;
  cargo?: string | null;
}

export interface DiscoveryResult {
  email: string | null;
  confianca_gemini: number; // 0-100 (informativo; validação real é Snov.io + SMTP)
  raciocinio: string;
  tempo_ms: number;
  gemini_chamado: boolean; // false quando cap diário atingido
  erro?: string;
}

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Tenta descobrir o email corporativo de um profissional via Gemini
 * Search Grounding. Falha graciosamente em vários cenários:
 *
 *  - Cap diário Gemini atingido → email=null, gemini_chamado=false
 *  - Gemini retorna texto inválido/sem JSON → email=null, erro setado
 *  - Erro de rede/API → email=null, erro setado
 *  - Gemini diz que não encontrou → email=null, confianca_gemini=0
 *
 * Em TODOS os casos, o motor de Recovery segue para Snov.io tradicional.
 * Este helper NUNCA lança exceção para o caller.
 */
export async function descobrirEmail(
  input: DiscoveryInput
): Promise<DiscoveryResult> {
  const inicio = Date.now();

  // 1. Verifica cap diário ANTES de chamar Gemini
  const capOk = await verificarCapDisponivel('discovery');
  if (!capOk) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: 'Cap diário Gemini atingido — pulando Discovery.',
      tempo_ms: Date.now() - inicio,
      gemini_chamado: false,
    };
  }

  // 2. Validação básica dos inputs
  const nome = (input.nome || '').trim();
  const sobrenome = (input.sobrenome || '').trim();
  const empresa = (input.empresa || '').trim();
  const dominio = (input.dominio || '').trim().toLowerCase();
  const cargo = (input.cargo || '').trim();

  if (!nome || !sobrenome || !dominio) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: 'Inputs insuficientes (nome, sobrenome ou domínio em branco).',
      tempo_ms: Date.now() - inicio,
      gemini_chamado: false,
      erro: 'INPUT_INVALIDO',
    };
  }

  // 3. Monta prompt anti-hallucination explícito
  const prompt = construirPrompt({ nome, sobrenome, empresa, dominio, cargo });

  // 4. Chama Gemini com Search Grounding
  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1, // mínima para máximo determinismo
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 4096 },
      } as any,
    });

    // 5. Incrementa o contador imediatamente após resposta (não esperamos parsing)
    await incrementarContador('discovery');

    // 6. Extração robusta do texto (mesmo padrão de prospect-resolve-domain)
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

    // 7. Parse JSON
    return parsearRespostaGemini(rawText, dominio, inicio);
  } catch (err: any) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: 'Erro ao chamar Gemini.',
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true, // tentou, mas falhou (não conta dupla)
      erro: err?.message?.slice(0, 200) || 'ERRO_GEMINI_DESCONHECIDO',
    };
  }
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Monta o prompt de descoberta para o Gemini. Anti-hallucination explícito:
 *  - Pede para retornar `null` se não houver evidência real.
 *  - Pede para confiança seja honesta (0-100).
 *  - Exige formato JSON limpo (sem markdown, sem texto extra).
 */
function construirPrompt(p: {
  nome: string;
  sobrenome: string;
  empresa: string;
  dominio: string;
  cargo: string;
}): string {
  const cargoTexto = p.cargo ? `, cargo ${p.cargo}` : '';
  const empresaTexto = p.empresa || `(domínio ${p.dominio})`;

  return `
Tarefa: encontrar o email corporativo CONFIRMADO de uma pessoa específica.

Pessoa: ${p.nome} ${p.sobrenome}${cargoTexto}
Empresa: ${empresaTexto}
Domínio corporativo: ${p.dominio}

Pesquise em fontes públicas confiáveis (LinkedIn público, sites corporativos,
palestras gravadas, podcasts, artigos publicados, currículos públicos, perfis
de eventos profissionais, github, slideshare).

REGRAS ESTRITAS:
1. Se você não encontrar EVIDÊNCIA REAL do email (citação direta em alguma
   fonte), retorne email=null com confianca_gemini=0. NÃO INVENTE.
2. Se você inferir o email por padrão da empresa (sem fonte que cite
   literalmente o email), retorne email=null. Esta tarefa é SÓ para emails
   que aparecem literais em alguma fonte pública.
3. O email retornado DEVE usar o domínio "${p.dominio}". Outros domínios
   (gmail, hotmail, etc.) → email=null.
4. Confiança 0-100: 0=não achei nada, 100=email citado literalmente em fonte
   oficial. Seja honesto na confiança.
5. Responda APENAS JSON, sem markdown, sem comentários, sem texto antes ou
   depois. Schema exato:

{
  "email": "valor@${p.dominio}" ou null,
  "confianca_gemini": 0-100,
  "raciocinio": "uma frase curta explicando o que você encontrou ou por que não encontrou"
}
`.trim();
}

/**
 * Parseia a resposta do Gemini, lidando com casos de fronteira:
 *  - Texto vazio → email=null
 *  - JSON com backticks de markdown → limpa
 *  - JSON inválido → retorna email=null com erro setado
 *  - Email retornado mas com domínio DIFERENTE do esperado → email=null
 *    (anti-hallucination — Gemini ignorou a regra 3)
 */
function parsearRespostaGemini(
  rawText: string,
  dominioEsperado: string,
  inicio: number
): DiscoveryResult {
  if (!rawText || !rawText.trim()) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: 'Gemini retornou resposta vazia.',
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true,
      erro: 'GEMINI_VAZIO',
    };
  }

  // Limpar markdown fences se houver
  const limpo = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim();

  // Extrair primeiro objeto JSON da resposta
  const match = limpo.match(/\{[\s\S]*?\}/);
  if (!match) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: `Gemini retornou texto não-JSON: ${limpo.slice(0, 100)}`,
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true,
      erro: 'GEMINI_NAO_JSON',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err: any) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: `Gemini retornou JSON inválido: ${err?.message?.slice(0, 80)}`,
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true,
      erro: 'GEMINI_JSON_INVALIDO',
    };
  }

  // Extrair campos
  const emailBruto = parsed.email;
  const confianca = Math.max(
    0,
    Math.min(100, parseInt(parsed.confianca_gemini, 10) || 0)
  );
  const raciocinio = (parsed.raciocinio || '').toString().slice(0, 500);

  // Email null/vazio = não achou
  if (
    !emailBruto ||
    emailBruto === null ||
    emailBruto === 'null' ||
    String(emailBruto).trim() === ''
  ) {
    return {
      email: null,
      confianca_gemini: confianca,
      raciocinio: raciocinio || 'Gemini não encontrou email.',
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true,
    };
  }

  // Validar formato básico
  const email = String(emailBruto).toLowerCase().trim();
  if (!email.includes('@') || email.length > 254) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: `Gemini retornou email mal-formatado: "${email}"`,
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true,
      erro: 'EMAIL_MAL_FORMATADO',
    };
  }

  // Anti-hallucination crítico: domínio DEVE casar com o esperado.
  const dominioResposta = email.slice(email.indexOf('@') + 1);
  if (dominioResposta !== dominioEsperado.toLowerCase()) {
    return {
      email: null,
      confianca_gemini: 0,
      raciocinio: `Gemini retornou email em domínio diferente (${dominioResposta} ≠ ${dominioEsperado}) — ignorado por segurança.`,
      tempo_ms: Date.now() - inicio,
      gemini_chamado: true,
      erro: 'DOMINIO_DIVERGENTE',
    };
  }

  return {
    email,
    confianca_gemini: confianca,
    raciocinio,
    tempo_ms: Date.now() - inicio,
    gemini_chamado: true,
  };
}
