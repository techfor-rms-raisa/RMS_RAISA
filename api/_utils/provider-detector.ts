/**
 * PROVIDER DETECTOR — v1.0
 * Sub-fase 3.A — Camada Gemini (Decisão A.4 — SMTP probe seletivo)
 * Data: 13/06/2026
 *
 * Detecta o provedor de email (Microsoft 365 / Google Workspace / Amazon SES /
 * outros) a partir dos MX records retornados pelo `mx-validator.ts`.
 *
 * Por quê: o SMTP probe direto é confiável em domínios próprios (cPanel,
 * Locaweb, mail.empresa.com.br) mas dá falso positivo em Microsoft/Google
 * que respondem `250 OK` para qualquer endereço (anti-validator behavior).
 * A detecção permite ao motor pular SMTP probe seletivamente.
 *
 * USO:
 *   import { detectarProvider } from './_utils/provider-detector';
 *   const provider = detectarProvider(['lavanderia.miramar.protection.outlook.com.']);
 *   // → { tipo: 'microsoft', confiavel_no_smtp_probe: false, observacao: '...' }
 *
 * Esta camada também serve futuramente à Sub-fase 3.B (item A.2 — Provider
 * Detection do roadmap) — vamos antecipar a infraestrutura.
 */

// ============================================================================
// TIPOS
// ============================================================================

export type ProviderTipo =
  | 'microsoft'    // Office 365 / Exchange Online
  | 'google'       // Google Workspace / Gmail
  | 'amazon_ses'   // Amazon SES
  | 'zoho'         // Zoho Mail
  | 'proofpoint'   // Proofpoint Essentials (gateway corporativo comum)
  | 'mimecast'     // Mimecast (idem)
  | 'cisco'        // Cisco Email Security
  | 'mailgun'      // Mailgun
  | 'sendgrid'     // SendGrid
  | 'locaweb'      // Locaweb (BR)
  | 'kinghost'     // KingHost (BR)
  | 'uolhost'      // UOL Host (BR)
  | 'hostgator'    // HostGator (BR)
  | 'hostinger'    // Hostinger (BR)
  | 'titan'        // Titan Email (BR)
  | 'cpanel_proprio' // mail.empresa.com.br ou MX que coincide com o domínio
  | 'desconhecido';

export interface ProviderDetectado {
  tipo: ProviderTipo;
  /**
   * Se `false`, o motor DEVE pular SMTP probe direto para este provedor
   * (devolve falsos positivos). Snov.io ainda valida normalmente.
   */
  confiavel_no_smtp_probe: boolean;
  /**
   * Texto curto explicando a detecção (para histórico/log).
   */
  observacao: string;
  /**
   * MX record que casou com a regra (para auditoria).
   */
  mx_match: string | null;
}

// ============================================================================
// PADRÕES DE DETECÇÃO
// ============================================================================

interface ProviderRegra {
  tipo: ProviderTipo;
  /** Substrings (lowercase) que indicam o provedor. Order matters — primeira match vence. */
  patterns: string[];
  /** SMTP probe é confiável para este provedor? */
  confiavel_no_smtp_probe: boolean;
  observacao: string;
}

const REGRAS: ProviderRegra[] = [
  // ── Big providers que dão falso positivo no SMTP probe ────────────────────
  {
    tipo: 'microsoft',
    patterns: ['protection.outlook.com', 'mail.protection.outlook', '.outlook.com', '.office365.com', 'eo.outlook.com'],
    confiavel_no_smtp_probe: false,
    observacao: 'Microsoft 365 — responde 250 OK para qualquer email (anti-validator). Confia só no Snov.io.',
  },
  {
    tipo: 'google',
    patterns: ['aspmx.l.google.com', 'googlemail.com', 'google.com.', 'gmail-smtp-in.l.google.com'],
    confiavel_no_smtp_probe: false,
    observacao: 'Google Workspace — comportamento anti-validator similar ao Microsoft. Confia só no Snov.io.',
  },
  {
    tipo: 'amazon_ses',
    patterns: ['amazonses.com', 'inbound-smtp.', '.amazon.ses'],
    confiavel_no_smtp_probe: false,
    observacao: 'Amazon SES — SMTP probe não-confiável.',
  },

  // ── Gateways corporativos (anti-spam / DLP intermediários) ────────────────
  {
    tipo: 'proofpoint',
    patterns: ['pphosted.com', 'proofpoint.com', '.ppe-hosted.com'],
    confiavel_no_smtp_probe: false,
    observacao: 'Gateway Proofpoint — SMTP probe inconclusivo.',
  },
  {
    tipo: 'mimecast',
    patterns: ['mimecast.com', '-mimecast.com'],
    confiavel_no_smtp_probe: false,
    observacao: 'Gateway Mimecast — SMTP probe inconclusivo.',
  },
  {
    tipo: 'cisco',
    patterns: ['iphmx.com', '.cisco.com'],
    confiavel_no_smtp_probe: false,
    observacao: 'Gateway Cisco Email Security — SMTP probe inconclusivo.',
  },

  // ── Provedores onde SMTP probe FUNCIONA (devolve resposta real) ───────────
  {
    tipo: 'zoho',
    patterns: ['zoho.com', 'zohomail.com'],
    confiavel_no_smtp_probe: true,
    observacao: 'Zoho Mail — SMTP probe confiável.',
  },
  {
    tipo: 'mailgun',
    patterns: ['mailgun.org'],
    confiavel_no_smtp_probe: true,
    observacao: 'Mailgun — SMTP probe confiável.',
  },
  {
    tipo: 'sendgrid',
    patterns: ['sendgrid.net'],
    confiavel_no_smtp_probe: true,
    observacao: 'SendGrid — SMTP probe confiável.',
  },

  // ── Hosts brasileiros (cPanel/Plesk típicos — SMTP probe funciona) ────────
  {
    tipo: 'locaweb',
    patterns: ['locaweb.com.br', '.locaweb.com'],
    confiavel_no_smtp_probe: true,
    observacao: 'Locaweb — SMTP probe geralmente confiável.',
  },
  {
    tipo: 'kinghost',
    patterns: ['kinghost.net', '.kinghost.com'],
    confiavel_no_smtp_probe: true,
    observacao: 'KingHost — SMTP probe geralmente confiável.',
  },
  {
    tipo: 'uolhost',
    patterns: ['uolhost.com.br', 'uol.com.br'],
    confiavel_no_smtp_probe: true,
    observacao: 'UOL Host — SMTP probe geralmente confiável.',
  },
  {
    tipo: 'hostgator',
    patterns: ['hostgator.com.br', '.hostgator.com'],
    confiavel_no_smtp_probe: true,
    observacao: 'HostGator — SMTP probe geralmente confiável.',
  },
  {
    tipo: 'hostinger',
    patterns: ['hostinger.com', 'hostinger.com.br'],
    confiavel_no_smtp_probe: true,
    observacao: 'Hostinger — SMTP probe geralmente confiável.',
  },
  {
    tipo: 'titan',
    patterns: ['titan.email', 'mx.titan.email'],
    confiavel_no_smtp_probe: true,
    observacao: 'Titan Email — SMTP probe geralmente confiável.',
  },
];

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Detecta o provedor de email a partir dos MX records.
 *
 * Estratégia:
 *  1. Normaliza cada MX para lowercase, sem trailing dot.
 *  2. Itera regras em ordem (Microsoft/Google primeiro — mais comuns no Brasil).
 *  3. Primeira match vence.
 *  4. Se nada bater, tenta heurística "cpanel_proprio" (MX = mail.<dominio>).
 *  5. Fallback "desconhecido" → trata como confiável_no_smtp_probe=true
 *     (assume domínio próprio = SMTP probe pode funcionar; melhor errar
 *     adicionando uma camada de validação a mais do que pulando uma camada
 *     útil).
 *
 * @param mxRecords lista de hostnames retornados por dns.resolveMx
 * @param dominio opcional — domínio original do email; usado para a
 *                heurística cpanel_proprio
 */
export function detectarProvider(
  mxRecords: string[],
  dominio?: string
): ProviderDetectado {
  if (!Array.isArray(mxRecords) || mxRecords.length === 0) {
    return {
      tipo: 'desconhecido',
      confiavel_no_smtp_probe: false, // sem MX = sem SMTP probe
      observacao: 'Sem MX records — não há onde testar.',
      mx_match: null,
    };
  }

  const mxNormalizados = mxRecords
    .filter(Boolean)
    .map(m => m.toLowerCase().trim().replace(/\.$/, ''));

  // 1. Tenta cada regra em ordem
  for (const regra of REGRAS) {
    for (const mx of mxNormalizados) {
      for (const pattern of regra.patterns) {
        if (mx.includes(pattern.toLowerCase().replace(/\.$/, ''))) {
          return {
            tipo: regra.tipo,
            confiavel_no_smtp_probe: regra.confiavel_no_smtp_probe,
            observacao: regra.observacao,
            mx_match: mx,
          };
        }
      }
    }
  }

  // 2. Heurística cpanel_proprio: MX termina com o próprio domínio
  if (dominio) {
    const domNorm = dominio.toLowerCase().trim().replace(/^@/, '');
    for (const mx of mxNormalizados) {
      if (mx.endsWith('.' + domNorm) || mx === domNorm) {
        return {
          tipo: 'cpanel_proprio',
          confiavel_no_smtp_probe: true,
          observacao: `MX coincide com o domínio (${domNorm}) — provavelmente servidor próprio. SMTP probe confiável.`,
          mx_match: mx,
        };
      }
    }
  }

  // 3. Fallback desconhecido — assume confiável (melhor checar duas vezes do
  //    que pular uma camada útil de validação)
  return {
    tipo: 'desconhecido',
    confiavel_no_smtp_probe: true,
    observacao: `Provedor desconhecido (MX: ${mxNormalizados[0] || '?'}). SMTP probe será aplicado.`,
    mx_match: mxNormalizados[0] || null,
  };
}
