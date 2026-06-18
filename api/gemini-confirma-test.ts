/**
 * api/gemini-confirma-test.ts
 *
 * ENDPOINT DE TESTE — Gemini Confirma Emprego (Etapa 2-B da Cascade Motor v2.0)
 *
 * Valida o wrapper lib/gemini-confirma-emprego.ts em isolamento, sem passar
 * pela cascade completa do prospect-revalidate. Útil para:
 *   - Smoke test do refinamento de prompt v2.0
 *   - A/B test entre versões do prompt
 *   - Debug rápido quando Gemini retorna vazio em produção
 *   - Validação manual antes de promover para Production
 *
 * USO:
 *
 *   1) Modo input direto (URL query):
 *      GET /api/gemini-confirma-test?nome=Luiza%20Trajano&empresa=Magazine%20Luiza
 *
 *   2) Modo bateria predefinida (3 casos representativos):
 *      GET /api/gemini-confirma-test?suite=true
 *
 *   3) Sem parâmetros → retorna instruções de uso:
 *      GET /api/gemini-confirma-test
 *
 * Custo: ~$0 (Gemini Free Tier generoso). Latência: 3-15s por chamada
 *        (até 40s no modo bateria, mas rodando em paralelo cabe nos 60s
 *        do maxDuration Vercel).
 *
 * Versão: 1.0
 * Data: 18/06/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  geminiConfirmaEmprego,
  type GeminiConfirmaInput,
  type GeminiConfirmaResult,
} from '../lib/gemini-confirma-emprego.js';

// ──────────────────────────────────────────────────────────────────────
// BATERIA PREDEFINIDA — 3 casos representativos
// ──────────────────────────────────────────────────────────────────────
// Cada caso exercita um caminho diferente do prompt v2.0:
//   A) Confirma empresa atual estável (testa happy path)
//   B) Pessoa que provavelmente trocou (testa decisão "trocou_empresa")
//   C) Variação de nome de empresa (testa regra A4 do v2.0)
// ──────────────────────────────────────────────────────────────────────

interface CasoBateria extends GeminiConfirmaInput {
  rotulo: string;
  expectativa: string;
}

const BATERIA_SMOKE: CasoBateria[] = [
  {
    rotulo:         'A — Confirma empresa estável (executiva pública conhecida)',
    expectativa:    'encontrado=true, confianca=alta, empresa_atual=Magazine Luiza',
    nome_completo:  'Luiza Trajano',
    empresa_antiga: 'Magazine Luiza',
    cargo_anterior: 'Presidente do Conselho',
  },
  {
    rotulo:         'B — Possível troca de empresa (testa prompt prospectivo A1)',
    expectativa:    'encontrado=true, empresa_atual ≠ GPA (Abilio saiu do GPA há anos)',
    nome_completo:  'Abilio Diniz',
    empresa_antiga: 'GPA',
    cargo_anterior: 'Presidente',
  },
  {
    rotulo:         'C — Variação de nome (Magalu vs Magazine Luiza — testa regra A4)',
    expectativa:    'encontrado=true, confianca=alta, NÃO marcar como troca por causa do nome',
    nome_completo:  'Frederico Trajano',
    empresa_antiga: 'Magalu',
    cargo_anterior: 'CEO',
  },
];

// ──────────────────────────────────────────────────────────────────────
// TIPOS DE SAÍDA
// ──────────────────────────────────────────────────────────────────────

interface CasoExecutado {
  rotulo:         string;
  expectativa?:   string;
  input:          GeminiConfirmaInput;
  tempo_total_ms: number;
  resultado:      GeminiConfirmaResult;
}

interface ResumoBateria {
  total:                     number;
  encontrados:               number;
  vazios:                    number;
  confianca_alta:            number;
  confianca_media:           number;
  confianca_baixa:           number;
  usaram_retry:              number;
  tempo_total_ms:            number;
  tempo_medio_por_caso_ms:   number;
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTOR DE UM CASO
// ──────────────────────────────────────────────────────────────────────

async function executarCaso(caso: CasoBateria | (GeminiConfirmaInput & { rotulo: string; expectativa?: string })): Promise<CasoExecutado> {
  const inicio = Date.now();
  let resultado: GeminiConfirmaResult;

  console.log(`🧪 [gemini-confirma-test] Executando: ${caso.rotulo}`);

  try {
    resultado = await geminiConfirmaEmprego({
      nome_completo:   caso.nome_completo,
      empresa_antiga:  caso.empresa_antiga,
      empresa_dominio: caso.empresa_dominio,
      linkedin_url:    caso.linkedin_url,
      cargo_anterior:  caso.cargo_anterior,
    });
  } catch (err: any) {
    resultado = {
      encontrado: false,
      confianca:  'baixa',
      motivo:     `Exception não tratada no executor: ${err?.message}`,
    };
  }

  return {
    rotulo:         caso.rotulo,
    expectativa:    caso.expectativa,
    input: {
      nome_completo:   caso.nome_completo,
      empresa_antiga:  caso.empresa_antiga,
      cargo_anterior:  caso.cargo_anterior,
      linkedin_url:    caso.linkedin_url,
      empresa_dominio: caso.empresa_dominio,
    },
    tempo_total_ms: Date.now() - inicio,
    resultado,
  };
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Aceita GET para facilitar teste no navegador (sem precisar de Postman)
  const nome     = (req.query.nome     as string) || (req.body?.nome     as string);
  const empresa  = (req.query.empresa  as string) || (req.body?.empresa  as string);
  const linkedin = (req.query.linkedin as string) || (req.body?.linkedin as string) || undefined;
  const cargo    = (req.query.cargo    as string) || (req.body?.cargo    as string) || undefined;
  const dominio  = (req.query.dominio  as string) || (req.body?.dominio  as string) || undefined;
  const suite    = req.query.suite === 'true' || req.query.suite === '1';

  // ─── MODO 3: Sem parâmetros → mostrar instruções ───
  if (!nome && !empresa && !suite) {
    return res.status(200).json({
      endpoint:      'api/gemini-confirma-test',
      versao:        '1.0',
      versao_motor:  'lib/gemini-confirma-emprego.ts v2.0',
      instrucoes:    'Use os parâmetros de query string para testar o wrapper Gemini Confirma Emprego.',
      modos: {
        modo_1_input_direto: {
          descricao:               'Testa um caso específico passado via query string',
          exemplo:                 '/api/gemini-confirma-test?nome=Luiza%20Trajano&empresa=Magazine%20Luiza',
          parametros_obrigatorios: ['nome', 'empresa'],
          parametros_opcionais:    ['cargo', 'linkedin', 'dominio'],
        },
        modo_2_bateria_smoke: {
          descricao: 'Roda bateria predefinida de 3 casos representativos em paralelo',
          exemplo:   '/api/gemini-confirma-test?suite=true',
          duracao:   '5-15 segundos (3 casos em paralelo)',
        },
      },
      bateria_disponivel: BATERIA_SMOKE.map(c => ({
        rotulo:         c.rotulo,
        nome:           c.nome_completo,
        empresa_antiga: c.empresa_antiga,
        expectativa:    c.expectativa,
      })),
      configuracao_motor: {
        modelo:              'gemini-2.5-flash',
        timeout_primario_ms: 25000,
        timeout_retry_ms:    15000,
        max_output_tokens:   8192,
        thinking_budget:     4096,
        tools:               ['googleSearch'],
      },
    });
  }

  const casos: CasoExecutado[] = [];

  // ─── MODO 2: Bateria predefinida (paralela) ───
  if (suite) {
    console.log(`🧪 [gemini-confirma-test] Iniciando bateria de ${BATERIA_SMOKE.length} casos em paralelo`);
    const promessas  = BATERIA_SMOKE.map(executarCaso);
    const resultados = await Promise.all(promessas);
    casos.push(...resultados);
  }
  // ─── MODO 1: Input direto único ───
  else {
    if (!nome || !empresa) {
      return res.status(400).json({
        erro:    'Parâmetros obrigatórios faltando: nome E empresa devem ser informados',
        exemplo: '/api/gemini-confirma-test?nome=Luiza%20Trajano&empresa=Magazine%20Luiza',
      });
    }

    const executado = await executarCaso({
      rotulo:          'Input direto via query string',
      nome_completo:   nome,
      empresa_antiga:  empresa,
      cargo_anterior:  cargo,
      linkedin_url:    linkedin,
      empresa_dominio: dominio,
    });
    casos.push(executado);
  }

  // ─── RESUMO AGREGADO ───
  const tempoTotal = casos.reduce((sum, c) => sum + c.tempo_total_ms, 0);
  const resumo: ResumoBateria = {
    total:                   casos.length,
    encontrados:             casos.filter(c => c.resultado.encontrado).length,
    vazios:                  casos.filter(c => !c.resultado.encontrado).length,
    confianca_alta:          casos.filter(c => c.resultado.confianca === 'alta').length,
    confianca_media:         casos.filter(c => c.resultado.confianca === 'media').length,
    confianca_baixa:         casos.filter(c => c.resultado.confianca === 'baixa').length,
    usaram_retry:            casos.filter(c => c.resultado.payload_raw?.usouRetry === true).length,
    tempo_total_ms:          tempoTotal,
    tempo_medio_por_caso_ms: Math.round(tempoTotal / casos.length),
  };

  console.log(
    `🧪 [gemini-confirma-test] Bateria concluída: ` +
    `${resumo.encontrados}/${resumo.total} encontrados, ` +
    `${resumo.confianca_alta} alta, ${resumo.confianca_media} media, ${resumo.confianca_baixa} baixa, ` +
    `${resumo.usaram_retry} usaram retry, tempo médio ${resumo.tempo_medio_por_caso_ms}ms`,
  );

  return res.status(200).json({
    modo:               suite ? 'suite' : 'input_direto',
    versao_motor:       'lib/gemini-confirma-emprego.ts v2.0',
    configuracao_motor: {
      modelo:              'gemini-2.5-flash',
      timeout_primario_ms: 25000,
      timeout_retry_ms:    15000,
      max_output_tokens:   8192,
      thinking_budget:     4096,
    },
    casos,
    resumo,
  });
}
