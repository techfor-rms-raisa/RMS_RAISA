/**
 * unsubscribe-token.ts — Helpers de token HMAC para o endpoint público
 *
 * Caminho: api/_helpers/unsubscribe-token.ts
 * Versão: 1.0 (Bloco 2 do plano OPT-OUT 100% — 11/06/2026)
 *
 * ════════════════════════════════════════════════════════════════════════
 * PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════
 * Gera e valida tokens assinados (HMAC-SHA256) que identificam o
 * destinatário de um e-mail sem expor lead_id em texto claro na URL.
 *
 * USADO POR:
 *   • api/cron/disparar-fila.ts (Bloco 3) — gera o token na hora do envio
 *     e o injeta no header `List-Unsubscribe` + no link "SAIR" do rodapé
 *   • api/unsubscribe.ts (Bloco 2) — valida o token recebido no GET/POST
 *
 * ════════════════════════════════════════════════════════════════════════
 * DESIGN DO TOKEN
 * ════════════════════════════════════════════════════════════════════════
 * Formato (similar a JWT simplificado, sem header — fixamos HS256):
 *
 *     <payload_base64url>.<signature_base64url>
 *
 *   payload    = JSON {lead_id, email} em base64url
 *   signature  = HMAC-SHA256(payload_base64url, UNSUBSCRIBE_TOKEN_SECRET)
 *                em base64url
 *
 * EXEMPLO:
 *   eyJsZWFkX2lkIjoxMywiZW1haWwiOiJ0ZXN0ZUBleC5jb20ifQ.zJ8hXkE2...
 *
 * ════════════════════════════════════════════════════════════════════════
 * SEM EXPIRAÇÃO (decisão de produto)
 * ════════════════════════════════════════════════════════════════════════
 * Tokens NÃO expiram. Justificativa: a LGPD garante ao titular o direito
 * de exercer opt-out a qualquer momento — emails antigos no fundo da caixa
 * de entrada devem continuar funcionais. O HMAC apenas garante autenticidade
 * (foi a plataforma quem emitiu).
 *
 * Como consequência: a rotação do `UNSUBSCRIBE_TOKEN_SECRET` invalida
 * todos os tokens anteriores. Em caso de comprometimento da chave, gerar
 * novo segredo + redeploy. Destinatários que tentarem usar links antigos
 * receberão a página "Link inválido" e devem ser contatados pelo DPO.
 *
 * ════════════════════════════════════════════════════════════════════════
 * BASE64URL (RFC 4648 §5)
 * ════════════════════════════════════════════════════════════════════════
 * Substitui:
 *   • '+' → '-'   (safe em URL)
 *   • '/' → '_'   (safe em URL)
 *   • Remove padding '='
 *
 * Garante que o token seja transportável em URL sem encodeURIComponent
 * (o que reduz o tamanho do link e melhora deliverabilidade — alguns
 * filtros antispam penalizam URLs com %-encoding).
 *
 * ════════════════════════════════════════════════════════════════════════
 * SEPARAÇÃO ENTRE AMBIENTES
 * ════════════════════════════════════════════════════════════════════════
 * O segredo `UNSUBSCRIBE_TOKEN_SECRET` tem valores DIFERENTES em Production
 * e Preview (configurado pelo Messias em 11/06/2026). Tokens emitidos em
 * Preview NÃO validam em Production e vice-versa. Isolamento de domínio
 * de segurança entre ambientes.
 *
 * ════════════════════════════════════════════════════════════════════════
 * URL BASE (PUBLIC_BASE_URL com fallback)
 * ════════════════════════════════════════════════════════════════════════
 * Production:
 *   PUBLIC_BASE_URL = "https://unsubscribe.techfortirms.online"
 *   → URLs geradas: https://unsubscribe.techfortirms.online/api/unsubscribe?token=...
 *
 * Preview:
 *   PUBLIC_BASE_URL NÃO definida → fallback para VERCEL_URL
 *   → URLs geradas: https://<deploy-preview-url>.vercel.app/api/unsubscribe?token=...
 *
 * Development local:
 *   Sem nenhuma das duas → throw na geração (defensivo).
 *
 * Tokens são válidos APENAS no ambiente onde foram gerados (cada ambiente
 * tem seu próprio segredo). O cross-environment não funciona — proteção
 * intencional contra usar token Preview em Production e vice-versa.
 */

import crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────
// HELPERS DE BASE64URL
// ────────────────────────────────────────────────────────────────────────

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  // Re-adiciona padding e converte caracteres URL-safe de volta
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

// ────────────────────────────────────────────────────────────────────────
// TIPOS
// ────────────────────────────────────────────────────────────────────────

export interface UnsubscribePayload {
  lead_id: number;
  email: string;
}

export type ValidacaoTokenResult =
  | { valid: true; payload: UnsubscribePayload }
  | { valid: false; error: string };

// ────────────────────────────────────────────────────────────────────────
// GERAR TOKEN
// ────────────────────────────────────────────────────────────────────────

/**
 * Gera token HMAC para um destinatário específico.
 *
 * @param payload {lead_id, email}
 * @returns token em formato "payload_b64url.signature_b64url"
 * @throws se UNSUBSCRIBE_TOKEN_SECRET não estiver configurado
 */
export function gerarTokenUnsubscribe(payload: UnsubscribePayload): string {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      '[unsubscribe-token] UNSUBSCRIBE_TOKEN_SECRET não configurado no ambiente',
    );
  }

  // Normaliza email no payload (importante: validador faz mesma normalização)
  const payloadNormalizado: UnsubscribePayload = {
    lead_id: Number(payload.lead_id),
    email: String(payload.email || '').toLowerCase().trim(),
  };

  if (!payloadNormalizado.lead_id || !payloadNormalizado.email) {
    throw new Error('[unsubscribe-token] lead_id e email são obrigatórios');
  }

  const payloadJson = JSON.stringify(payloadNormalizado);
  const payloadB64 = base64UrlEncode(payloadJson);

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest();
  const signatureB64 = base64UrlEncode(signature);

  return `${payloadB64}.${signatureB64}`;
}

// ────────────────────────────────────────────────────────────────────────
// VALIDAR TOKEN
// ────────────────────────────────────────────────────────────────────────

/**
 * Valida um token recebido no endpoint /api/unsubscribe.
 *
 * Verificações em ordem:
 *   1. Formato: precisa ter exatamente 2 partes separadas por '.'
 *   2. Assinatura: HMAC-SHA256 calculada bate com a recebida (timingSafeEqual)
 *   3. Payload: JSON válido contendo lead_id (number) e email (string)
 *
 * @param token string recebida em req.query.token
 * @returns objeto com valid=true+payload ou valid=false+error
 */
export function validarTokenUnsubscribe(token: string): ValidacaoTokenResult {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret || secret.trim().length === 0) {
    return {
      valid: false,
      error: 'Servidor mal configurado (segredo ausente)',
    };
  }

  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token vazio' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Formato de token inválido' };
  }

  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) {
    return { valid: false, error: 'Formato de token inválido' };
  }

  // Calcular assinatura esperada
  let signatureEsperada: Buffer;
  let signatureRecebida: Buffer;
  try {
    signatureEsperada = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest();
    signatureRecebida = base64UrlDecode(signatureB64);
  } catch {
    return { valid: false, error: 'Assinatura corrompida' };
  }

  // Comparação timing-safe (defesa contra timing attacks)
  if (signatureEsperada.length !== signatureRecebida.length) {
    return { valid: false, error: 'Assinatura inválida' };
  }
  if (!crypto.timingSafeEqual(signatureEsperada, signatureRecebida)) {
    return { valid: false, error: 'Assinatura inválida' };
  }

  // Decodificar payload e validar estrutura
  let payload: any;
  try {
    const payloadJson = base64UrlDecode(payloadB64).toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, error: 'Payload corrompido' };
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.lead_id !== 'number' ||
    typeof payload.email !== 'string' ||
    payload.lead_id <= 0 ||
    payload.email.trim().length === 0
  ) {
    return { valid: false, error: 'Payload com estrutura inválida' };
  }

  return {
    valid: true,
    payload: {
      lead_id: payload.lead_id,
      email: payload.email.toLowerCase().trim(),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// MONTAR URL COMPLETA
// ────────────────────────────────────────────────────────────────────────

/**
 * Monta a URL absoluta completa de unsubscribe pronta para uso em:
 *   • Header SMTP `List-Unsubscribe`
 *   • Link clicável "SAIR" no rodapé HTML do email
 *
 * Resolução da URL base:
 *   1. process.env.PUBLIC_BASE_URL (Production)
 *   2. fallback: https://${process.env.VERCEL_URL} (Preview)
 *   3. throw se nenhuma das duas está disponível
 *
 * @param payload {lead_id, email}
 * @returns URL absoluta no formato https://.../api/unsubscribe?token=...
 */
export function montarUrlUnsubscribe(payload: UnsubscribePayload): string {
  const explicitBase = process.env.PUBLIC_BASE_URL?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();

  let baseUrl = explicitBase || (vercelUrl ? `https://${vercelUrl}` : '');
  if (!baseUrl) {
    throw new Error(
      '[unsubscribe-token] PUBLIC_BASE_URL não definida e VERCEL_URL ausente — ' +
        'não é possível montar URL absoluta de unsubscribe',
    );
  }

  // Remove trailing slash para evitar // no path final
  baseUrl = baseUrl.replace(/\/+$/, '');

  const token = gerarTokenUnsubscribe(payload);
  return `${baseUrl}/api/unsubscribe?token=${token}`;
}
