/**
 * lib/cota-diaria.ts — Helper compartilhado de cota diária por usuário
 *
 * Caminho: lib/cota-diaria.ts
 * Versão:  1.0 (23/06/2026 — Parametrização da cota de revalidação)
 *
 * ────────────────────────────────────────────────────────────────────
 * MOTIVAÇÃO
 * ────────────────────────────────────────────────────────────────────
 * Até 22/06/2026, o limite de 50 leads/dia era replicado como
 * constante hardcoded em DOIS backends:
 *   - api/prospect-revalidate.ts             (linha 213, COTA_DIARIA_POR_GESTOR=50)
 *   - api/revalidacao-leads-importados.ts    (linha 150, COTA_DIARIA_POR_GESTOR=50)
 *
 * Isso violava DRY e gerava risco de drift (alterar um e esquecer o
 * outro). Pior: a UI também tinha o "50" hardcoded em
 *   - LeadsImportadosTab.tsx (linha 184)
 *   - useLeadsImportados.ts  (linhas 243 e 267)
 *
 * Decisão de produto Messias 23/06/2026:
 *   - cota vira parametrizável por usuário em `app_users.cota_revalidacao_diaria`
 *   - Admin gerencia via aba "Cotas" no menu CRM & Campanhas
 *   - Range 0–500 (CHECK constraint no banco)
 *   - Default 50 para novos usuários (migration ALTER TABLE)
 *   - Escopo: APENAS aba "Leads Importados" (Q1)
 *
 * ────────────────────────────────────────────────────────────────────
 * COMPORTAMENTO
 * ────────────────────────────────────────────────────────────────────
 * Função `obterCotaDiaria(supabase, user_id)`:
 *   - SELECT cota_revalidacao_diaria FROM app_users WHERE id = user_id
 *   - Retorna o valor inteiro (0–500)
 *   - FAIL-SAFE: se SELECT falhar (ex: usuário não existe, banco offline,
 *     coluna ausente em ambiente desatualizado), retorna o DEFAULT_COTA=50
 *     e loga warn. Comportamento equivalente ao da constante anterior —
 *     a operação NÃO fica bloqueada por uma falha de leitura.
 *
 * Função `getCotaPadrao()`:
 *   - Retorna o valor default (50) sem tocar no banco. Útil para
 *     UI exibir um valor inicial enquanto carrega.
 *
 * ────────────────────────────────────────────────────────────────────
 * USO
 * ────────────────────────────────────────────────────────────────────
 *   import { obterCotaDiaria } from '../lib/cota-diaria.js';
 *   const cotaDiaria = await obterCotaDiaria(supabase, user_id);
 *   const cotaResidual = Math.max(0, cotaDiaria - cotaConsumida);
 *
 * Compatível com o naming convention de v1.6 (lib/ é compartilhado entre
 * todos os endpoints — não colide com frontend hooks porque ficam em
 * camadas separadas no bundler).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────────────
// CONSTANTES
// ────────────────────────────────────────────────────────────────────

/**
 * Valor default da cota — usado como FAIL-SAFE quando o SELECT no
 * banco falha (ex: ambiente sem a coluna após pull desatualizado),
 * e como sugestão inicial para novos usuários.
 *
 * Sincronizado com o DEFAULT da migration 2026-06-23_app_users_cota_revalidacao.sql.
 */
export const COTA_DIARIA_DEFAULT = 50;

/**
 * Limites do CHECK constraint no banco. Espelhados aqui para a UI
 * poder validar antes de fazer o POST (UX defensiva).
 */
export const COTA_MIN = 0;
export const COTA_MAX = 500;

// ────────────────────────────────────────────────────────────────────
// FUNÇÕES PÚBLICAS
// ────────────────────────────────────────────────────────────────────

/**
 * Lê a cota diária parametrizada do usuário em `app_users`.
 *
 * @param supabase Cliente do Supabase (com service role recomendado, mas
 *                 anon também funciona se a RLS permitir SELECT em app_users
 *                 — o que já é o caso na config atual).
 * @param user_id  ID do app_users (FK).
 * @returns        Inteiro entre COTA_MIN (0) e COTA_MAX (500).
 *                 Se houver QUALQUER falha (rede, SELECT vazio, exceção),
 *                 retorna COTA_DIARIA_DEFAULT (50) e loga warn — para
 *                 NÃO bloquear a operação por causa de leitura.
 */
export async function obterCotaDiaria(
  supabase: SupabaseClient,
  user_id:  number,
): Promise<number> {
  if (!user_id || isNaN(user_id)) {
    console.warn(`⚠️ [cota-diaria] user_id inválido (${user_id}) — usando default ${COTA_DIARIA_DEFAULT}.`);
    return COTA_DIARIA_DEFAULT;
  }

  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('cota_revalidacao_diaria')
      .eq('id', user_id)
      .maybeSingle();

    if (error) {
      console.warn(`⚠️ [cota-diaria] SELECT falhou para user_id=${user_id}: ${error.message} — usando default ${COTA_DIARIA_DEFAULT}.`);
      return COTA_DIARIA_DEFAULT;
    }
    if (!data) {
      console.warn(`⚠️ [cota-diaria] user_id=${user_id} não encontrado em app_users — usando default ${COTA_DIARIA_DEFAULT}.`);
      return COTA_DIARIA_DEFAULT;
    }

    const valor = data.cota_revalidacao_diaria;
    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
      console.warn(`⚠️ [cota-diaria] user_id=${user_id} retornou valor inválido (${valor}) — usando default ${COTA_DIARIA_DEFAULT}.`);
      return COTA_DIARIA_DEFAULT;
    }

    // Clamp defensivo no range (caso o banco aceite valores fora do
    // CHECK em algum cenário de exceção). Aplicado por segurança.
    if (valor < COTA_MIN) return COTA_MIN;
    if (valor > COTA_MAX) return COTA_MAX;
    return valor;
  } catch (err: any) {
    console.error(`❌ [cota-diaria] Exceção para user_id=${user_id}: ${err?.message} — usando default ${COTA_DIARIA_DEFAULT}.`);
    return COTA_DIARIA_DEFAULT;
  }
}

/**
 * Retorna o valor default da cota SEM tocar no banco. Útil para
 * inicializar estados de UI antes da primeira carga assíncrona.
 */
export function getCotaPadrao(): number {
  return COTA_DIARIA_DEFAULT;
}
