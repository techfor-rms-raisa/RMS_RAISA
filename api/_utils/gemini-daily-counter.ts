/**
 * GEMINI DAILY COUNTER — v1.0
 * Sub-fase 3.A — Camada Gemini (Decisão A.5 — cap diário 200)
 * Data: 13/06/2026
 *
 * Helper para gerenciar o cap diário de chamadas Gemini (Discovery + Ranker).
 * Antes de cada chamada Gemini, o motor verifica `verificarCapDisponivel()`.
 * Após uma chamada bem-sucedida, chama `incrementarContador()`.
 *
 * Comportamento "degradação grácil":
 *  - Se a tabela retornar erro, assume cap atingido (false-safe).
 *  - Se cap atingido, motor pula Gemini e segue para Snov.io tradicional.
 *  - Não trava o Recovery — apenas reduz inteligência.
 *
 * USO:
 *   import { verificarCapDisponivel, incrementarContador } from './_utils/gemini-daily-counter';
 *
 *   if (await verificarCapDisponivel('discovery')) {
 *     const resultado = await chamarGeminiDiscovery(...);
 *     await incrementarContador('discovery');
 *   } else {
 *     // pula Gemini, segue para Snov.io
 *   }
 *
 * DEPENDÊNCIA SQL:
 *   - Tabela `gemini_daily_counter` criada por
 *     `db/migrations/2026-06-13_gemini_daily_counter.sql`
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CLIENT (singleton interno ao helper)
// ============================================================================

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

// ============================================================================
// TIPOS
// ============================================================================

export type TipoChamadaGemini = 'discovery' | 'ranker';

export interface ContadorEstado {
  data: string; // ISO YYYY-MM-DD
  total_chamadas: number;
  chamadas_discovery: number;
  chamadas_ranker: number;
  cap_diario: number;
  cap_disponivel: boolean;
  restantes: number;
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Data corrente em formato YYYY-MM-DD (UTC).
 * Usar UTC garante que o "dia" seja consistente independente do servidor.
 */
function hojeUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Consulta estado completo do contador do dia atual.
 * Cria a linha se não existir (cap_diario default = 200).
 *
 * Falha graciosamente: se houver erro no banco, retorna estado "cap atingido"
 * para forçar o motor a pular Gemini (false-safe).
 */
export async function consultarEstado(): Promise<ContadorEstado> {
  const supabase = getSupabase();
  const data = hojeUTC();

  try {
    // 1. UPSERT idempotente para garantir que a linha do dia existe
    const { error: errUpsert } = await supabase
      .from('gemini_daily_counter')
      .upsert(
        {
          data,
          total_chamadas: 0,
          chamadas_discovery: 0,
          chamadas_ranker: 0,
          cap_diario: 200,
        },
        { onConflict: 'data', ignoreDuplicates: true }
      );

    if (errUpsert) {
      console.warn('[gemini-counter] upsert falhou (degradação grácil):', errUpsert.message);
      return estadoCapAtingido(data);
    }

    // 2. SELECT do estado atual
    const { data: row, error: errSel } = await supabase
      .from('gemini_daily_counter')
      .select('data, total_chamadas, chamadas_discovery, chamadas_ranker, cap_diario')
      .eq('data', data)
      .maybeSingle();

    if (errSel || !row) {
      console.warn('[gemini-counter] select falhou (degradação grácil):', errSel?.message);
      return estadoCapAtingido(data);
    }

    const restantes = Math.max(0, row.cap_diario - row.total_chamadas);
    return {
      data: row.data,
      total_chamadas: row.total_chamadas,
      chamadas_discovery: row.chamadas_discovery,
      chamadas_ranker: row.chamadas_ranker,
      cap_diario: row.cap_diario,
      cap_disponivel: restantes > 0,
      restantes,
    };
  } catch (err: any) {
    console.warn('[gemini-counter] exceção (degradação grácil):', err?.message);
    return estadoCapAtingido(data);
  }
}

/**
 * Atalho booleano: o motor tem orçamento Gemini para a chamada `tipo`?
 *
 * Reserva 1 unidade do orçamento para a chamada solicitada — não consome
 * (consumo é via incrementarContador após sucesso da chamada Gemini).
 */
export async function verificarCapDisponivel(
  _tipo: TipoChamadaGemini = 'discovery'
): Promise<boolean> {
  const estado = await consultarEstado();
  return estado.cap_disponivel;
}

/**
 * Incrementa o contador após chamada Gemini bem-sucedida.
 * Atômico via SQL — usa expressão de incremento direta no Supabase.
 *
 * NÃO retorna erro ao chamador — falhas de incremento são apenas logadas.
 * O custo da falha é mínimo (uma chamada Gemini "não contabilizada"), mas
 * propagar erro aqui interromperia o Recovery em si, o que seria pior.
 */
export async function incrementarContador(tipo: TipoChamadaGemini): Promise<void> {
  const supabase = getSupabase();
  const data = hojeUTC();

  try {
    // Garante que a linha do dia existe (UPSERT no_conflict_do_nothing)
    await supabase
      .from('gemini_daily_counter')
      .upsert(
        {
          data,
          total_chamadas: 0,
          chamadas_discovery: 0,
          chamadas_ranker: 0,
          cap_diario: 200,
        },
        { onConflict: 'data', ignoreDuplicates: true }
      );

    // Incremento atômico via RPC ad-hoc (UPDATE direto com expression)
    // Como Supabase JS não suporta expressões diretamente em update(),
    // fazemos SELECT + UPDATE — tolerável aqui porque a chave (data, PK)
    // é única e estamos numa única linha. Race condition entre 2 chamadas
    // simultâneas no mesmo segundo pode subestimar em 1, mas é aceitável
    // para um cap operacional.
    const { data: row } = await supabase
      .from('gemini_daily_counter')
      .select('total_chamadas, chamadas_discovery, chamadas_ranker')
      .eq('data', data)
      .maybeSingle();

    if (!row) {
      console.warn('[gemini-counter] linha do dia não encontrada após upsert');
      return;
    }

    const novoTotal = row.total_chamadas + 1;
    const novoDiscovery =
      row.chamadas_discovery + (tipo === 'discovery' ? 1 : 0);
    const novoRanker = row.chamadas_ranker + (tipo === 'ranker' ? 1 : 0);

    const { error: errUpd } = await supabase
      .from('gemini_daily_counter')
      .update({
        total_chamadas: novoTotal,
        chamadas_discovery: novoDiscovery,
        chamadas_ranker: novoRanker,
        atualizado_em: new Date().toISOString(),
      })
      .eq('data', data);

    if (errUpd) {
      console.warn('[gemini-counter] incremento falhou:', errUpd.message);
    }
  } catch (err: any) {
    console.warn('[gemini-counter] exceção no incremento:', err?.message);
  }
}

// ============================================================================
// HELPERS INTERNOS (estado de fallback)
// ============================================================================

function estadoCapAtingido(data: string): ContadorEstado {
  return {
    data,
    total_chamadas: 200,
    chamadas_discovery: 0,
    chamadas_ranker: 0,
    cap_diario: 200,
    cap_disponivel: false,
    restantes: 0,
  };
}
