/**
 * api/hunter-debug-test.ts — Endpoint de diagnóstico isolado para Hunter HTTP 401
 *
 * v1.0 (18/06/2026)
 *
 * Motivado por sintoma observado nos smokes Apollo de 17-18/06: emails
 * inferidos pelo cascade Apollo retornavam HTTP 401 ao serem validados
 * via Hunter Email Verifier. Conta Hunter tem 1.994 créditos restantes
 * (não é quota) → 401 = problema de autenticação (chave/header).
 *
 * Testa 3 hipóteses sem consumir créditos significativos:
 *
 *   1. Whitespace/CRLF trailing em HUNTER_API_KEY — padrão conhecido
 *      após `vercel env add` via `echo "value" | ...` em vez de paste
 *      manual com Ctrl+V (registrado nas memórias do projeto).
 *
 *   2. Chave revogada/regerada no painel Hunter sem propagação para
 *      Vercel — mesmo após trim, GET /v2/account retornaria 401.
 *
 *   3. Chave configurada em ambiente errado (Preview ≠ Production) —
 *      rodar o teste em ambos os ambientes diagnostica.
 *
 * 3 modos via query string:
 *
 *   ?modo=intro
 *     → Diagnóstico do env (sem rede) — reporta tamanho, charCodes,
 *       presença de \r \n whitespace, primeiros/últimos 4 chars.
 *       NÃO expõe a chave completa.
 *
 *   ?modo=account
 *     → Dupla chamada GET /v2/account com chave trimada vs original.
 *       Endpoint Hunter que NÃO consome créditos. Validação de auth.
 *       Comparação status code lado a lado isola o whitespace.
 *
 *   ?modo=verifier&email=test@example.com
 *     → GET /v2/email-verifier (consome 1 crédito) — só rodar após
 *       account vir 200, para confirmar fluxo completo end-to-end.
 *
 * IMPORTANTE: NÃO toca prospect-hunter-enrich.ts. Após diagnosticar,
 * próxima entrega aplica correção definitiva (trim/normalize na leitura
 * do env, padronizado para todos os arquivos sensíveis).
 *
 * Caminho: api/hunter-debug-test.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

export const config = {
  maxDuration: 15,
};

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Diagnostica a HUNTER_API_KEY sem expor a chave completa.
 *   Reporta: tamanho, charCodes do primeiro/último char, presença de
 *   CR/LF/whitespace, primeiros e últimos 4 chars.
 */
function diagnosticarEnv(apiKeyRaw: string | undefined) {
  if (!apiKeyRaw) {
    return {
      presente:        false,
      tamanho:         0,
      observacoes:     'HUNTER_API_KEY ausente do env Vercel',
    };
  }

  const apiKeyTrim = apiKeyRaw.trim();
  const temDiffTrim = apiKeyTrim.length !== apiKeyRaw.length;
  const primeiro = apiKeyRaw.charCodeAt(0);
  const ultimo   = apiKeyRaw.charCodeAt(apiKeyRaw.length - 1);

  // Caracteres invisíveis presentes
  const contemCR     = apiKeyRaw.includes('\r');
  const contemLF     = apiKeyRaw.includes('\n');
  const contemTab    = apiKeyRaw.includes('\t');
  const contemSpaceInicio = /^\s/.test(apiKeyRaw);
  const contemSpaceFim    = /\s$/.test(apiKeyRaw);

  const observacoes: string[] = [];
  if (temDiffTrim)         observacoes.push(`⚠️ Whitespace detectado: chave trimada tem ${apiKeyTrim.length} chars, original tem ${apiKeyRaw.length}`);
  if (contemCR)            observacoes.push('⚠️ Contém \\r (carriage return) — provável bug echo no vercel env add');
  if (contemLF)            observacoes.push('⚠️ Contém \\n (line feed) — provável bug echo no vercel env add');
  if (contemTab)           observacoes.push('⚠️ Contém \\t (tab)');
  if (contemSpaceInicio)   observacoes.push('⚠️ Espaço no início');
  if (contemSpaceFim && !contemCR && !contemLF) observacoes.push('⚠️ Espaço no fim (não-CR/LF)');
  if (observacoes.length === 0) observacoes.push('✅ Nenhum whitespace anômalo detectado');

  return {
    presente:          true,
    tamanho_original:  apiKeyRaw.length,
    tamanho_trimado:   apiKeyTrim.length,
    diferenca_trim:    apiKeyRaw.length - apiKeyTrim.length,
    primeiro_char: {
      char_visivel:    apiKeyRaw[0],
      char_code:       primeiro,
    },
    ultimo_char: {
      char_visivel:    apiKeyRaw[apiKeyRaw.length - 1] === '\n' ? '\\n'
                     : apiKeyRaw[apiKeyRaw.length - 1] === '\r' ? '\\r'
                     : apiKeyRaw[apiKeyRaw.length - 1],
      char_code:       ultimo,
    },
    contem_CR:         contemCR,
    contem_LF:         contemLF,
    contem_tab:        contemTab,
    contem_espaco_inicio: contemSpaceInicio,
    contem_espaco_fim: contemSpaceFim,
    primeiros_4_chars: apiKeyRaw.substring(0, 4),
    ultimos_4_chars:   apiKeyTrim.substring(Math.max(0, apiKeyTrim.length - 4)),
    observacoes,
  };
}

/**
 * Chamada GET ao Hunter com uma chave específica. Retorna status, body
 * preview e estrutura do response. Não expõe a chave.
 */
async function chamarHunterAccount(apiKey: string): Promise<any> {
  const url = `${HUNTER_BASE_URL}/account?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url);
    const bodyText = await res.text();
    let bodyJson: any = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      // não é JSON
    }

    return {
      http_status:  res.status,
      http_ok:      res.ok,
      body_preview: bodyText.substring(0, 800),
      body_keys:    bodyJson ? Object.keys(bodyJson) : null,
      // Dados do account quando 200
      conta: bodyJson?.data ? {
        email:        bodyJson.data.email || null,
        plan_name:    bodyJson.data.plan_name || null,
        reset_date:   bodyJson.data.reset_date || null,
        // Hunter v2 estrutura de cota varia entre planos
        requests:     bodyJson.data.requests || null,
      } : null,
      // Mensagem de erro quando 4xx/5xx
      erros: bodyJson?.errors || null,
    };
  } catch (err: any) {
    return {
      http_status:  null,
      http_ok:      false,
      erro_rede:    err?.message || 'fetch falhou',
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS aberto (endpoint de diagnóstico)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const modo    = (req.query.modo as string)  || 'intro';
  const emailQ  =  req.query.email as string  || '';

  const apiKeyRaw = process.env.HUNTER_API_KEY;
  const envDiag   = diagnosticarEnv(apiKeyRaw);

  // ─────────────────────────────────────────────────────────────────────
  // MODO 1 — INTRO (sem rede)
  // ─────────────────────────────────────────────────────────────────────
  if (modo === 'intro') {
    return res.status(200).json({
      modo: 'intro',
      versao: 'api/hunter-debug-test.ts v1.0',
      env_diagnostico: envDiag,
      proximos_passos: {
        passo_1: 'Rodar com ?modo=account para validar autenticação (não consome créditos)',
        passo_2: 'Se modo=account vier 401 com chave TRIMADA também, problema é chave revogada — regenerar no painel Hunter',
        passo_3: 'Se modo=account vier 200 com TRIMADA e 401 com ORIGINAL, problema é \\r\\n trailing no env — corrigir HUNTER_API_KEY no Vercel',
        passo_4: 'Após passo_2 e passo_3 OK, opcionalmente rodar ?modo=verifier&email=X para teste end-to-end (consome 1 crédito)',
      },
      hipoteses_consideradas: [
        '(1) \\r\\n trailing no HUNTER_API_KEY do Vercel — padrão histórico do projeto após `echo "value" | vercel env add`',
        '(2) Chave revogada/regerada no painel Hunter sem propagação ao Vercel',
        '(3) Chave configurada em Preview ≠ Production — rodar smoke nos 2 ambientes',
      ],
    });
  }

  // Para os outros modos, precisa da chave
  if (!apiKeyRaw) {
    return res.status(500).json({
      modo,
      erro: 'HUNTER_API_KEY não está no env Vercel',
      env_diagnostico: envDiag,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // MODO 2 — ACCOUNT (dupla chamada para isolar whitespace)
  // ─────────────────────────────────────────────────────────────────────
  if (modo === 'account') {
    const apiKeyTrim = apiKeyRaw.trim();
    const eIgual     = apiKeyTrim === apiKeyRaw;

    if (eIgual) {
      // Chave já está limpa — uma chamada só basta
      const res1 = await chamarHunterAccount(apiKeyRaw);
      return res.status(200).json({
        modo: 'account',
        nota: 'Chave original = chave trimada — apenas 1 teste necessário',
        env_diagnostico: envDiag,
        teste_chave: res1,
        diagnostico_final: res1.http_ok
          ? '✅ AUTH OK — chave válida e ambiente correto. Hunter funciona. O 401 visto nos smokes Apollo provavelmente vinha de OUTRO ponto (verificar logs reais com timestamp).'
          : `❌ AUTH FALHOU mesmo com chave limpa — provável causa: chave revogada/regerada no painel Hunter. Ação: regenerar a chave em hunter.io/api-keys e atualizar HUNTER_API_KEY no Vercel.`,
      });
    }

    // Dupla chamada — trimada vs original
    const [resTrim, resNaoTrim] = await Promise.all([
      chamarHunterAccount(apiKeyTrim),
      chamarHunterAccount(apiKeyRaw),
    ]);

    let diagnosticoFinal: string;
    if (resTrim.http_ok && !resNaoTrim.http_ok) {
      diagnosticoFinal =
        `🎯 DIAGNÓSTICO CONFIRMADO: Whitespace trailing no HUNTER_API_KEY. ` +
        `Trimada=${resTrim.http_status}, Original=${resNaoTrim.http_status}. ` +
        `Ação: 1) vercel env rm HUNTER_API_KEY production; 2) vercel env add HUNTER_API_KEY production (modo INTERATIVO, paste com Ctrl+V); 3) redeploy. ` +
        `Alternativamente: aplicar .trim() no código (entrega seguinte de v1.3 do prospect-hunter-enrich.ts).`;
    } else if (resTrim.http_ok && resNaoTrim.http_ok) {
      diagnosticoFinal =
        `✅ Ambas chamadas OK — Hunter funciona. Investigar logs com timestamp exato do 401 visto nos smokes Apollo.`;
    } else if (!resTrim.http_ok && !resNaoTrim.http_ok) {
      diagnosticoFinal =
        `❌ Ambas chamadas falharam — provável chave revogada. Ação: regenerar em hunter.io/api-keys e atualizar HUNTER_API_KEY no Vercel.`;
    } else {
      diagnosticoFinal =
        `⚠️ Resultado inesperado: trimada=${resTrim.http_status}, original=${resNaoTrim.http_status}. Analisar bodies abaixo.`;
    }

    return res.status(200).json({
      modo: 'account',
      env_diagnostico: envDiag,
      teste_chave_trimada: resTrim,
      teste_chave_original: resNaoTrim,
      diagnostico_final: diagnosticoFinal,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // MODO 3 — VERIFIER (consome 1 crédito)
  // ─────────────────────────────────────────────────────────────────────
  if (modo === 'verifier') {
    if (!emailQ) {
      return res.status(400).json({
        erro: 'modo=verifier requer ?email=... na query string',
        exemplo: '/api/hunter-debug-test?modo=verifier&email=test@example.com',
      });
    }

    // Sempre usa chave trimada no verifier — é o teste curativo
    const apiKey = apiKeyRaw.trim();
    const url = `${HUNTER_BASE_URL}/email-verifier?email=${encodeURIComponent(emailQ)}&api_key=${encodeURIComponent(apiKey)}`;

    try {
      const r = await fetch(url);
      const bodyText = await r.text();
      let bodyJson: any = null;
      try { bodyJson = JSON.parse(bodyText); } catch {}

      return res.status(200).json({
        modo: 'verifier',
        nota: 'Consumiu 1 crédito Hunter. Use apenas se modo=account já validou autenticação.',
        env_diagnostico: envDiag,
        teste: {
          email_testado: emailQ,
          http_status:   r.status,
          http_ok:       r.ok,
          body_preview:  bodyText.substring(0, 800),
          resultado: bodyJson?.data ? {
            result: bodyJson.data.result,
            score:  bodyJson.data.score,
            status: bodyJson.data.status,
          } : null,
          erros: bodyJson?.errors || null,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        modo: 'verifier',
        erro: err?.message || 'fetch falhou',
        env_diagnostico: envDiag,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // MODO INVÁLIDO
  // ─────────────────────────────────────────────────────────────────────
  return res.status(400).json({
    erro: `modo '${modo}' inválido`,
    modos_validos: ['intro', 'account', 'verifier'],
    exemplo: '/api/hunter-debug-test?modo=account',
  });
}
