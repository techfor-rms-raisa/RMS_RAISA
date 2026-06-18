/**
 * lib/email-finder.ts — Busca email por nome + domínio (cascade)
 *
 * v1.0 (18/06/2026)
 *
 *   Extrai a lógica do api/prospect-email-finder.ts v1.0 para uso
 *   in-process pelo orquestrador prospect-revalidate.ts. Elimina HTTP
 *   401 em Preview causado por Vercel Deployment Protection bloqueando
 *   chamadas cross-function.
 *
 *   Cascade preserva comportamento original do endpoint v1.0:
 *     1. Se fonte_original !== 'snovio': tentar Snov.io Finder primeiro
 *     2. Se Snov.io vazio (ou skipado): tentar Apollo People Match
 *     3. Se Apollo vazio E fonte_original === 'apollo': retry Snov.io
 *
 *   🎁 GANHO ARQUITETURAL vs. endpoint v1.0:
 *
 *     O endpoint original tinha uma função local buscarEmailApollo()
 *     que chamava Apollo /people/match SEM as proteções do wrapper v2.0:
 *       ❌ Sem APOLLO_ENABLED kill switch
 *       ❌ Sem APOLLO_DAILY_CAP_PER_USER cap diário
 *       ❌ Sem skip preventivo quando sem linkedin_url E sem dominio
 *       ❌ Sem log 💰 explícito de crédito consumido
 *
 *     Isso significava que a Etapa 3 (resgate) do cascade do
 *     prospect-revalidate.ts podia FURAR o cap diário silenciosamente —
 *     consumindo créditos Apollo além do limite de 30/dia/gestor.
 *
 *     Agora lib/email-finder.ts usa apolloPeopleMatch de lib/apollo.ts
 *     v2.0 → cap diário é WATERTIGHT em TODA a cascade do revalidate.
 *
 *   ⚠️ IMPORTANTE — propagar user_id:
 *     Para o cap por gestor funcionar, caller DEVE passar user_id no
 *     input. Sem user_id, o wrapper Apollo v2.0 ainda executa, mas o
 *     cap por gestor não é aplicado (mesma semântica que prospect-revalidate
 *     v1.5 quando user_id estava ausente).
 *
 *   NÃO LANÇA exceções. Sempre retorna FinderResult — em pior caso,
 *   success=false email=null motor=null.
 *
 * Caminho: lib/email-finder.ts
 */

import { snovioFindEmailByName } from './snovio.js';
import { apolloPeopleMatch, type ApolloMatchResult } from './apollo.js';

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ──────────────────────────────────────────────────────────────────────

export type FinderMotor = 'snovio' | 'apollo' | null;

export interface FinderInput {
  primeiro_nome:    string;
  ultimo_nome?:     string | null;
  domain:           string;
  empresa_nome?:    string | null;
  /**
   * 'apollo' → prospect veio do Apollo originalmente (tenta Snov.io primeiro)
   * 'snovio' → prospect veio do Snov.io originalmente (tenta Apollo primeiro)
   * undefined → comportamento default ('apollo')
   */
  fonte_original?:  'apollo' | 'snovio';
  /** Propagado para apolloPeopleMatch v2.0 (necessário p/ cap diário). */
  user_id?:         number;
}

export interface FinderResult {
  /** True quando email foi encontrado em qualquer motor. */
  success:      boolean;
  email:        string | null;
  email_status: string;
  motor:        FinderMotor;
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — buscarEmailPorNome
// ──────────────────────────────────────────────────────────────────────

/**
 * Roda a cascade Snov.io ↔ Apollo para descobrir email de uma pessoa
 * dado nome + domínio. Estratégia idêntica ao endpoint v1.0.
 *
 * Sempre retorna FinderResult — nunca lança. Em pior caso success=false.
 *
 * Inputs vazios (primeiro_nome ou domain) → retorna not_found imediatamente
 * sem consumir nada.
 */
export async function buscarEmailPorNome(input: FinderInput): Promise<FinderResult> {
  if (!input.primeiro_nome || !input.domain) {
    return {
      success:      false,
      email:        null,
      email_status: 'not_found',
      motor:        null,
    };
  }

  const firstName = input.primeiro_nome;
  const lastName  = input.ultimo_nome || '';
  const domain    = input.domain;

  // ─── ESTRATÉGIA 1: Snov.io primeiro (se prospect NÃO veio do Snov.io) ───
  if (input.fonte_original !== 'snovio') {
    const snov = await snovioFindEmailByName(firstName, lastName, domain);
    if (snov?.email) {
      console.log(`✅ [email-finder] Snov.io: ${snov.email}`);
      return {
        success:      true,
        email:        snov.email,
        email_status: snov.status,
        motor:        'snovio',
      };
    }
  }

  // ─── ESTRATÉGIA 2: Apollo People Match ───
  // 🆕 Reutiliza lib/apollo.ts v2.0 → ganha cap diário/flag/skip preventivo.
  // Esse era o gap arquitetural: endpoint v1.0 tinha buscarEmailApollo() local
  // sem proteções, o que furava silenciosamente o cap diário do gestor.
  const apollo: ApolloMatchResult = await apolloPeopleMatch({
    primeiro_nome:    firstName,
    ultimo_nome:      lastName,
    nome_completo:    `${firstName} ${lastName}`.trim(),
    linkedin_url:     null,
    empresa_dominio:  domain,
    empresa_nome:     input.empresa_nome,
    user_id:          input.user_id,
  });

  if (apollo.encontrado && apollo.email) {
    console.log(`✅ [email-finder] Apollo: ${apollo.email}`);
    return {
      success:      true,
      email:        apollo.email,
      email_status: apollo.email_status || 'unknown',
      motor:        'apollo',
    };
  }

  // ─── ESTRATÉGIA 3: Última tentativa Snov.io (apenas se origem era Apollo) ───
  if (input.fonte_original === 'apollo') {
    const snovRetry = await snovioFindEmailByName(firstName, lastName, domain);
    if (snovRetry?.email) {
      console.log(`✅ [email-finder] Snov.io retry: ${snovRetry.email}`);
      return {
        success:      true,
        email:        snovRetry.email,
        email_status: snovRetry.status,
        motor:        'snovio',
      };
    }
  }

  // Nenhum motor encontrou
  console.log(`ℹ️ [email-finder] Não encontrado: ${firstName} ${lastName} @ ${domain}`);
  return {
    success:      false,
    email:        null,
    email_status: 'not_found',
    motor:        null,
  };
}
