/**
 * MX VALIDATOR — v1.0
 * Fase 1 (F1) — Email Recovery Pipeline (Fundação)
 * Data: 12/06/2026
 *
 * Verifica se o domínio de um e-mail tem MX records válidos via DNS lookup
 * nativo do Node. Custo: zero. Latência típica: 50-200ms por verificação.
 *
 * Quando usar:
 *  1. Primeira barreira antes de gastar crédito Snov.io (Recovery)
 *  2. Validação em Lote pré-campanha (F7)
 *  3. Confirmação após edição manual de e-mail (D10 — "Validar e Reativar")
 *
 * USO:
 *   import { validarMX, extrairDominio } from './_utils/mx-validator';
 *   const r = await validarMX('riachuelo.com');
 *   // → { valido: true, dominio: 'riachuelo.com', mx_records: [...], tempo_ms: 87 }
 *
 *   import { validarMXLote } from './_utils/mx-validator';
 *   const lote = await validarMXLote(['riachuelo.com', 'inexistente.zzz'], 10);
 */

import { promises as dns } from 'dns';

// ============================================================================
// TIPOS
// ============================================================================

export interface MXValidationResult {
  valido: boolean;
  dominio: string;
  mx_records: string[]; // ex: ['aspmx.l.google.com', 'alt1.aspmx.l.google.com']
  tempo_ms: number;
  erro?: string;        // código DNS (ENOTFOUND, ENODATA, ETIMEOUT, etc.)
}

// ============================================================================
// CONSTANTES
// ============================================================================

const TIMEOUT_MS = 5000;          // 5s por lookup
const DOMINIO_MAX_LENGTH = 253;   // RFC 1035

// ============================================================================
// EXTRAÇÃO
// ============================================================================

/**
 * Extrai o domínio (parte após @) de um e-mail.
 * Tolera espaços, capitalização e leading/trailing whitespace.
 *
 *  'luis@riachuelo.com'       → 'riachuelo.com'
 *  '  LUIS@RIACHUELO.COM  '   → 'riachuelo.com'
 *  'sem-arroba'               → null
 *  'fim@'                     → null
 */
export function extrairDominio(email: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const limpo = email.trim().toLowerCase();
  const at = limpo.indexOf('@');
  if (at < 0 || at === limpo.length - 1) return null;
  return limpo.slice(at + 1).trim();
}

// ============================================================================
// VALIDAÇÃO UNITÁRIA
// ============================================================================

/**
 * Valida MX records de um domínio.
 *  - true se o domínio tem pelo menos 1 MX record
 *  - false se ENOTFOUND (domínio não existe), ENODATA (sem MX) ou timeout
 *
 * Timeout interno: 5 segundos.
 */
export async function validarMX(dominio: string): Promise<MXValidationResult> {
  const inicio = Date.now();
  const dom = (dominio || '').toLowerCase().trim();

  // Sanitização básica
  if (!dom || !dom.includes('.') || dom.length > DOMINIO_MAX_LENGTH) {
    return {
      valido: false,
      dominio: dom,
      mx_records: [],
      tempo_ms: Date.now() - inicio,
      erro: 'FORMATO_INVALIDO',
    };
  }

  try {
    // Promise.race com timeout, já que dns.resolveMx não tem timeout nativo
    const records = await Promise.race([
      dns.resolveMx(dom),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Timeout DNS'), { code: 'ETIMEOUT' })), TIMEOUT_MS)
      ),
    ]);

    const valido = Array.isArray(records) && records.length > 0;
    return {
      valido,
      dominio: dom,
      mx_records: valido
        ? records.map(r => r.exchange).filter(Boolean)
        : [],
      tempo_ms: Date.now() - inicio,
      erro: valido ? undefined : 'SEM_MX_RECORDS',
    };
  } catch (err: any) {
    // Códigos DNS comuns:
    //  ENOTFOUND — domínio não existe
    //  ENODATA   — domínio existe mas sem MX (raro, mas possível)
    //  ETIMEOUT  — timeout (resolver lento ou bloqueado)
    //  ESERVFAIL — falha do servidor DNS
    return {
      valido: false,
      dominio: dom,
      mx_records: [],
      tempo_ms: Date.now() - inicio,
      erro: err?.code || 'ERRO_DESCONHECIDO',
    };
  }
}

// ============================================================================
// VALIDAÇÃO EM LOTE (com limite de concorrência)
// ============================================================================

/**
 * Valida MX de múltiplos domínios em paralelo (batches de `concorrencia`).
 * Útil para a Validação em Lote pré-campanha (F7).
 *
 * Default: 10 lookups simultâneos. Aumentar com cuidado — DNS resolvers de
 * provedor cloud (Vercel) podem rate-limitar.
 *
 * Domínios duplicados na entrada NÃO são deduplicados aqui — quem chama
 * deve passar a lista única se quiser economizar.
 */
export async function validarMXLote(
  dominios: string[],
  concorrencia = 10
): Promise<MXValidationResult[]> {
  const resultados: MXValidationResult[] = [];

  for (let i = 0; i < dominios.length; i += concorrencia) {
    const batch = dominios.slice(i, i + concorrencia);
    const batchResults = await Promise.all(batch.map(d => validarMX(d)));
    resultados.push(...batchResults);
  }

  return resultados;
}

// ============================================================================
// HELPER COMPOSTO — extrai e valida em um único passo
// ============================================================================

/**
 * Atalho conveniente: dado um e-mail completo, extrai o domínio e valida MX.
 * Retorna `valido: false` com `erro: 'EMAIL_INVALIDO'` se o e-mail não puder
 * ser parseado.
 */
export async function validarMXDoEmail(email: string): Promise<MXValidationResult> {
  const dominio = extrairDominio(email);
  if (!dominio) {
    return {
      valido: false,
      dominio: '',
      mx_records: [],
      tempo_ms: 0,
      erro: 'EMAIL_INVALIDO',
    };
  }
  return validarMX(dominio);
}
