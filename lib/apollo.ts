/**
 * lib/apollo.ts — Wrapper Apollo People Match para Revalidação de Leads
 *
 * v2.0 (18/06/2026 — Ativação Apollo Basic Plan 2.500 créditos/mês)
 *   Cirurgia mínima preparando o wrapper para uso em Production com a
 *   `APOLLO_API_KEY` ativa. 4 acréscimos sem mudar a assinatura externa
 *   (campo `user_id` é OPCIONAL no input — backwards compatível):
 *
 *   1. FEATURE FLAG (APOLLO_ENABLED)
 *      env var `APOLLO_ENABLED` (default `true`). Setar `false` no
 *      Vercel desabilita Apollo sem deploy — orquestrador cai pro
 *      fallback Gemini automaticamente. Kill switch operacional.
 *
 *   2. CAP DIÁRIO POR GESTOR (APOLLO_DAILY_CAP_PER_USER)
 *      env var `APOLLO_DAILY_CAP_PER_USER` (default `30`).
 *      Apuração: SUM(creditos_apollo) em prospect_revalidacao_log
 *      WHERE revalidado_por = user_id AND revalidado_em >= 00:00 BRT.
 *      Quando cap é atingido, retorna `encontrado: false` com motivo
 *      explícito (fallback Gemini ativa). Pattern de janela BRT
 *      reaproveitado de api/prospect-revalidate.ts `contarValidacoesHoje()`.
 *
 *      Math (Apollo Basic, 2.500 créditos/mês):
 *        - 2.500 / 30 dias ≈ 83 créditos/dia compartilhados
 *        - 30/dia/gestor × ~2-3 gestores ativos = 60-90/dia → cabe
 *
 *      Fail-open intencional: se query do cap falha, retorna 0
 *      (NÃO bloqueia Apollo). Melhor servir UX do que parar produção
 *      por erro infra. Erro persistente fica registrado no console.
 *
 *   3. PRIORIZAÇÃO INTELIGENTE (SKIP PREVENTIVO)
 *      SE não tem `linkedin_url` E não tem `empresa_dominio` → pula
 *      Apollo sem chamar o endpoint. Apollo Basic Plan tem taxa de
 *      match << 10% nesses casos (sem identificador forte). Evita
 *      queimar créditos em chamadas de baixa probabilidade.
 *
 *   4. LOG EXPLÍCITO DE CRÉDITO CONSUMIDO
 *      Quando Apollo retorna match válido, console.log inclui o ícone
 *      💰 + texto "1 crédito" para facilitar auditoria nos logs Vercel.
 *
 *   IMPORTANTE: o input `ApolloLeadInput` ganha o campo opcional
 *   `user_id`. Quando ausente, o cap por gestor NÃO é aplicado
 *   (compatibilidade com chamadores legados que não passem user).
 *   O orquestrador `prospect-revalidate.ts` v1.5 passa o user_id
 *   ativo da requisição.
 *
 * v1.0 (17/06/2026)
 *
 * 🔄 AGNÓSTICO À EXISTÊNCIA da APOLLO_API_KEY:
 *   Se a env var não está configurada, a função retorna
 *   `{ encontrado: false, motivo: 'APOLLO_API_KEY ausente...' }`
 *   silenciosamente. O orquestrador (api/prospect-revalidate.ts) trata
 *   esse retorno como "Apollo não encontrou" e dispara automaticamente
 *   o fallback Gemini (Etapa 2-B).
 *
 * Endpoint: POST https://api.apollo.io/api/v1/people/match
 * Custo: 1 crédito Apollo por chamada com match.
 * Rate limit: 200 req/min em planos comuns (margem confortável).
 *
 * Estratégia de identificação (prioridade decrescente):
 *   1. linkedin_url (identificador mais estável da pessoa ao longo do tempo)
 *   2. first_name + last_name + domain
 *   3. first_name + last_name + organization_name
 *
 * Caminho: lib/apollo.ts
 */

import { createClient } from '@supabase/supabase-js';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ──────────────────────────────────────────────────────────────────────
// 🆕 v2.0 — CONFIGURAÇÃO OPERACIONAL
// ──────────────────────────────────────────────────────────────────────

/**
 * Cliente Supabase admin para apuração do cap diário Apollo.
 * Reutiliza as mesmas env vars do orquestrador.
 */
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Feature flag — quando `APOLLO_ENABLED=false`, Apollo é desligado
 * sem deploy de código. Útil como kill switch em caso de incidente.
 */
const APOLLO_ENABLED = process.env.APOLLO_ENABLED !== 'false';

/**
 * Cap diário de créditos Apollo por gestor (GC/SDR).
 * Default 30/dia/gestor — compatível com Apollo Basic 2.500/mês
 * com 2-3 gestores ativos (60-90 créditos/dia agregados).
 */
const APOLLO_DAILY_CAP_PER_USER = Number(
  process.env.APOLLO_DAILY_CAP_PER_USER || 30,
);

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ──────────────────────────────────────────────────────────────────────

export interface ApolloLeadInput {
  primeiro_nome?:    string | null;
  ultimo_nome?:      string | null;
  nome_completo?:    string | null;
  linkedin_url?:     string | null;
  empresa_dominio?:  string | null;
  empresa_nome?:     string | null;

  // 🆕 v2.0 — user_id do gestor que disparou a revalidação. Quando
  //   presente, o cap diário por gestor é aplicado antes de chamar
  //   o endpoint Apollo. Quando ausente, o cap é pulado (backwards
  //   compatível com chamadores legados).
  user_id?:          number | null;
}

export interface ApolloMatchResult {
  /** True quando Apollo retornou um person válido com pelo menos empresa OU cargo. */
  encontrado:       boolean;
  empresa_nome?:    string;
  empresa_dominio?: string;
  cargo?:           string;
  linkedin_url?:    string;
  email?:           string;
  email_status?:    string;
  apollo_id?:       string;
  /** Payload completo da Apollo, para auditoria em prospect_revalidacao_log. */
  payload_raw?:     any;
  /** Motivo quando encontrado=false: api key ausente, cap atingido, HTTP 4xx/5xx, sem person, etc. */
  motivo?:          string;
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ──────────────────────────────────────────────────────────────────────

/**
 * Quebra "João Silva da Costa" em primeiro="João" e ultimo="Costa".
 * Remove preposições comuns ('de', 'da', 'do', etc.).
 */
function extrairPrimeiroEUltimo(nomeCompleto: string): { primeiro: string; ultimo: string } {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  const filtrado = partes.filter(p => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(p.toLowerCase()));
  return {
    primeiro: filtrado[0] || '',
    ultimo:   filtrado.length > 1 ? filtrado[filtrado.length - 1] : '',
  };
}

/**
 * 🆕 v2.0 — Apura créditos Apollo consumidos pelo gestor desde 00:00 BRT.
 *
 * Pattern de janela BRT reaproveitado de api/prospect-revalidate.ts
 * `contarValidacoesHoje()` (mesma timezone, mesma fórmula de offset).
 *
 * Fonte de verdade: `prospect_revalidacao_log.creditos_apollo`.
 * Cada chamada Apollo com match consome 1 crédito (validado em
 * endpoint /people/match com `reveal_personal_emails=false`).
 *
 * Fail-open: erro de query retorna 0 (NÃO bloqueia Apollo). Trade-off
 * consciente — melhor servir UX do que parar produção por erro infra.
 */
async function getApolloCreditosHojeUser(user_id: number): Promise<number> {
  const agora = new Date();
  // Converte para BRT (UTC-3), calcula início do dia, volta para UTC
  const offsetBrtMs = 3 * 60 * 60 * 1000;
  const brt = new Date(agora.getTime() - offsetBrtMs);
  const inicioBrt = new Date(Date.UTC(
    brt.getUTCFullYear(),
    brt.getUTCMonth(),
    brt.getUTCDate(),
    0, 0, 0,
  ));
  const inicioUtc = new Date(inicioBrt.getTime() + offsetBrtMs);

  const { data, error } = await supabaseAdmin
    .from('prospect_revalidacao_log')
    .select('creditos_apollo')
    .eq('revalidado_por', user_id)
    .gte('revalidado_em', inicioUtc.toISOString())
    .gt('creditos_apollo', 0);

  if (error) {
    console.error(`❌ [apolloPeopleMatch/cap] Erro apurando cota: ${error.message}`);
    return 0; // fail-open
  }

  return (data || []).reduce(
    (sum: number, row: any) => sum + (row.creditos_apollo || 0),
    0,
  );
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — apolloPeopleMatch
// ──────────────────────────────────────────────────────────────────────

/**
 * Apollo People Match — identifica uma pessoa por nome + identificadores
 * múltiplos. Prioriza linkedin_url como chave (mais estável que email).
 *
 * Comportamento agnóstico:
 *   - APOLLO_ENABLED=false → retorna { encontrado: false, motivo: 'desabilitado...' }
 *   - APOLLO_API_KEY ausente → retorna { encontrado: false, motivo: '...' }
 *   - Sem linkedin_url E sem empresa_dominio → SKIP preventivo (v2.0)
 *   - Cap diário do gestor atingido → SKIP cap (v2.0)
 *   - HTTP error → retorna { encontrado: false, motivo: 'Apollo HTTP X' }
 *   - Sem person no payload → retorna { encontrado: false, motivo: 'sem match' }
 *   - Match válido → retorna { encontrado: true, ...dados } (1 crédito consumido)
 */
export async function apolloPeopleMatch(lead: ApolloLeadInput): Promise<ApolloMatchResult> {
  // 🆕 v2.0 — Feature flag (kill switch sem deploy)
  if (!APOLLO_ENABLED) {
    return {
      encontrado: false,
      motivo:     'Apollo desabilitado (APOLLO_ENABLED=false) — fallback Gemini ativará',
    };
  }

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    // Comportamento intencional: silenciar e deixar o orquestrador cair pro Gemini.
    return {
      encontrado: false,
      motivo:     'APOLLO_API_KEY ausente — etapa pulada (fallback Gemini ativará)',
    };
  }

  // 🆕 v2.0 — Priorização inteligente: SKIP preventivo quando sem identificador forte.
  // Apollo Basic Plan tem taxa de match << 10% sem linkedin_url + empresa_dominio.
  // Evita queimar créditos em chamadas de baixa probabilidade.
  if (!lead.linkedin_url && !lead.empresa_dominio) {
    return {
      encontrado: false,
      motivo:     'Sem linkedin_url nem empresa_dominio — Apollo pulado (skip preventivo)',
    };
  }

  // 🆕 v2.0 — Cap diário por gestor (apurado em runtime via SUM no log).
  // Quando user_id ausente (chamador legado), o cap NÃO é aplicado.
  if (lead.user_id) {
    const consumidoHoje = await getApolloCreditosHojeUser(lead.user_id);
    if (consumidoHoje >= APOLLO_DAILY_CAP_PER_USER) {
      console.warn(
        `⛔ [apolloPeopleMatch/cap] User ${lead.user_id} atingiu cap diário ` +
        `(${consumidoHoje}/${APOLLO_DAILY_CAP_PER_USER}) — pulando Apollo`,
      );
      return {
        encontrado: false,
        motivo:     `Cap diário Apollo atingido (${consumidoHoje}/${APOLLO_DAILY_CAP_PER_USER}) — fallback Gemini ativará`,
      };
    }
  }

  // Resolve primeiro/último nome a partir do nome_completo se necessário
  let primeiro = (lead.primeiro_nome || '').trim();
  let ultimo   = (lead.ultimo_nome   || '').trim();
  if ((!primeiro || !ultimo) && lead.nome_completo) {
    const extraido = extrairPrimeiroEUltimo(lead.nome_completo);
    if (!primeiro) primeiro = extraido.primeiro;
    if (!ultimo)   ultimo   = extraido.ultimo;
  }

  if (!primeiro && !lead.linkedin_url) {
    return {
      encontrado: false,
      motivo:     'Sem identificadores mínimos (precisa de nome_completo OU linkedin_url)',
    };
  }

  // Monta querystring (Apollo aceita params na URL para POST /people/match)
  const params = new URLSearchParams();
  if (primeiro)             params.append('first_name',        primeiro);
  if (ultimo)               params.append('last_name',         ultimo);
  if (lead.linkedin_url)    params.append('linkedin_url',      lead.linkedin_url);
  if (lead.empresa_dominio) params.append('domain',            lead.empresa_dominio);
  if (lead.empresa_nome)    params.append('organization_name', lead.empresa_nome);
  params.append('reveal_personal_emails', 'false');

  try {
    const res = await fetch(`${APOLLO_BASE_URL}/people/match?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-cache',
        'accept':        'application/json',
        'x-api-key':     apiKey,
      },
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      console.warn(`⚠️ [apolloPeopleMatch] HTTP ${res.status}: ${errTxt.substring(0, 200)}`);
      return {
        encontrado: false,
        motivo:     `Apollo retornou HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const person = data?.person;

    if (!person) {
      console.log(`📋 [apolloPeopleMatch] Sem match: ${primeiro} ${ultimo} @ ${lead.empresa_dominio || lead.empresa_nome || '?'}`);
      return {
        encontrado:  false,
        motivo:      'Apollo retornou payload sem person',
        payload_raw: data,
      };
    }

    const result: ApolloMatchResult = {
      encontrado:      true,
      empresa_nome:    person.organization?.name,
      empresa_dominio: person.organization?.primary_domain || person.organization?.domain,
      cargo:           person.title,
      linkedin_url:    person.linkedin_url,
      email:           person.email,
      email_status:    person.email_status,
      apollo_id:       person.id,
      payload_raw:     person,
    };

    // 🆕 v2.0 — Log explícito de crédito consumido (auditoria fácil em logs Vercel).
    console.log(
      `✅ [apolloPeopleMatch] 💰 Match (1 crédito): ${primeiro} ${ultimo} ` +
      `→ ${result.empresa_nome || '?'} (${result.cargo || '?'})`,
    );
    return result;

  } catch (err: any) {
    console.error(`❌ [apolloPeopleMatch] Erro: ${err?.message}`);
    return {
      encontrado: false,
      motivo:     `Erro na chamada Apollo: ${err?.message}`,
    };
  }
}
