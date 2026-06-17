/**
 * lib/apollo.ts — Wrapper Apollo People Match para Revalidação de Leads
 *
 * v1.0 (17/06/2026)
 *
 * 🔄 AGNÓSTICO À EXISTÊNCIA da APOLLO_API_KEY:
 *   Se a env var não está configurada (caso atual do projeto em 17/06/2026,
 *   confirmado por print das Settings Vercel), a função retorna
 *   `{ encontrado: false, motivo: 'APOLLO_API_KEY ausente...' }`
 *   silenciosamente. O orquestrador (api/prospect-revalidate.ts) trata
 *   esse retorno como "Apollo não encontrou" e dispara automaticamente
 *   o fallback Gemini (Etapa 2-B).
 *
 *   Quando o Messias configurar APOLLO_API_KEY, o sistema usará Apollo
 *   automaticamente — sem alteração de código.
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

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

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
  /** Motivo quando encontrado=false: api key ausente, HTTP 4xx/5xx, sem person, etc. */
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

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — apolloPeopleMatch
// ──────────────────────────────────────────────────────────────────────

/**
 * Apollo People Match — identifica uma pessoa por nome + identificadores
 * múltiplos. Prioriza linkedin_url como chave (mais estável que email).
 *
 * Comportamento agnóstico:
 *   - APOLLO_API_KEY ausente → retorna { encontrado: false, motivo: '...' }
 *   - HTTP error → retorna { encontrado: false, motivo: 'Apollo HTTP X' }
 *   - Sem person no payload → retorna { encontrado: false, motivo: 'sem match' }
 *   - Match válido → retorna { encontrado: true, ...dados }
 */
export async function apolloPeopleMatch(lead: ApolloLeadInput): Promise<ApolloMatchResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    // Comportamento intencional: silenciar e deixar o orquestrador cair pro Gemini.
    return {
      encontrado: false,
      motivo:     'APOLLO_API_KEY ausente — etapa pulada (fallback Gemini ativará)',
    };
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
  if (primeiro)            params.append('first_name',         primeiro);
  if (ultimo)              params.append('last_name',          ultimo);
  if (lead.linkedin_url)   params.append('linkedin_url',       lead.linkedin_url);
  if (lead.empresa_dominio) params.append('domain',            lead.empresa_dominio);
  if (lead.empresa_nome)   params.append('organization_name', lead.empresa_nome);
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

    console.log(`✅ [apolloPeopleMatch] Match: ${primeiro} ${ultimo} → ${result.empresa_nome || '?'} (${result.cargo || '?'})`);
    return result;

  } catch (err: any) {
    console.error(`❌ [apolloPeopleMatch] Erro: ${err?.message}`);
    return {
      encontrado: false,
      motivo:     `Erro na chamada Apollo: ${err?.message}`,
    };
  }
}
