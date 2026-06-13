/**
 * SMTP PROBE — v1.0
 * Sub-fase 3.A — Camada Gemini (Decisão A.4 — SMTP probe seletivo)
 * Data: 13/06/2026
 *
 * Realiza um RCPT TO direto ao MX do domínio para validar a existência de
 * um endereço de email específico. Custo: zero. Tempo: 2-10s por probe.
 *
 * Usado como SEGUNDA camada de validação anti-hallucination (Decisão A.3 — D)
 * após o Gemini Discovery retornar um email candidato.
 *
 * IMPORTANTE — degradação seletiva:
 *  - Microsoft/Google respondem 250 OK para tudo (anti-validator behavior).
 *  - O SMTP probe SÓ é chamado se provider-detector reportar
 *    `confiavel_no_smtp_probe: true`.
 *  - Quando pulado, o caller usa apenas o resultado Snov.io.
 *
 * USO:
 *   import { smtpProbe } from './_utils/smtp-probe';
 *   const result = await smtpProbe('luis@riachuelo.com.br', ['mx.riachuelo.com.br']);
 *   if (result.resultado === 'accept') { ... }
 *
 * RESULTADOS:
 *  - 'accept'        → servidor respondeu 2xx ao RCPT TO (email aceito)
 *  - 'reject'        → servidor respondeu 5xx ao RCPT TO (email rejeitado)
 *  - 'inconclusive'  → servidor respondeu 4xx (greylist), timeout, ou conexão recusada
 *  - 'skipped'       → provider conhecido como não-confiável (Microsoft/Google)
 */

import * as net from 'net';

// ============================================================================
// TIPOS
// ============================================================================

export type SmtpProbeResultado = 'accept' | 'reject' | 'inconclusive' | 'skipped';

export interface SmtpProbeResult {
  email: string;
  mx_used: string | null;
  resultado: SmtpProbeResultado;
  smtp_code: number | null;   // Código SMTP retornado (ex: 250, 550)
  smtp_msg: string | null;    // Linha de resposta SMTP
  tempo_ms: number;
  erro?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const SMTP_PORT = 25;
const TIMEOUT_CONN_MS = 8000;    // 8s para conectar
const TIMEOUT_RESPONSE_MS = 8000; // 8s para cada comando
const HELO_DOMAIN = 'techfortirms.online'; // domínio do RMS-RAISA em produção
const MAIL_FROM = 'recovery-probe@techfortirms.online';

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Executa SMTP probe contra o MX mais prioritário (primeiro da lista).
 * Falha graciosamente: qualquer erro de rede vira `inconclusive`.
 *
 * @param email endereço a ser testado
 * @param mxRecords lista ordenada de MX hosts (primeiro = prioritário)
 */
export async function smtpProbe(
  email: string,
  mxRecords: string[]
): Promise<SmtpProbeResult> {
  const inicio = Date.now();
  const emailNorm = (email || '').toLowerCase().trim();

  if (!emailNorm || !emailNorm.includes('@')) {
    return {
      email: emailNorm,
      mx_used: null,
      resultado: 'inconclusive',
      smtp_code: null,
      smtp_msg: null,
      tempo_ms: Date.now() - inicio,
      erro: 'EMAIL_FORMATO_INVALIDO',
    };
  }

  if (!Array.isArray(mxRecords) || mxRecords.length === 0) {
    return {
      email: emailNorm,
      mx_used: null,
      resultado: 'inconclusive',
      smtp_code: null,
      smtp_msg: null,
      tempo_ms: Date.now() - inicio,
      erro: 'SEM_MX_RECORDS',
    };
  }

  const mxHost = mxRecords[0].replace(/\.$/, '');

  try {
    const probe = await executarProbe(emailNorm, mxHost);
    return {
      email: emailNorm,
      mx_used: mxHost,
      resultado: probe.resultado,
      smtp_code: probe.smtp_code,
      smtp_msg: probe.smtp_msg,
      tempo_ms: Date.now() - inicio,
      erro: probe.erro,
    };
  } catch (err: any) {
    return {
      email: emailNorm,
      mx_used: mxHost,
      resultado: 'inconclusive',
      smtp_code: null,
      smtp_msg: null,
      tempo_ms: Date.now() - inicio,
      erro: err?.message?.slice(0, 200) || 'ERRO_DESCONHECIDO',
    };
  }
}

// ============================================================================
// IMPLEMENTAÇÃO INTERNA (TCP raw via net.Socket)
// ============================================================================

interface ProbeInterno {
  resultado: SmtpProbeResultado;
  smtp_code: number | null;
  smtp_msg: string | null;
  erro?: string;
}

/**
 * Abre conexão TCP na porta 25 do MX e executa o handshake SMTP mínimo:
 *
 *   S: 220 mx.empresa.com.br ESMTP ready
 *   C: HELO techfortirms.online
 *   S: 250 OK
 *   C: MAIL FROM:<recovery-probe@techfortirms.online>
 *   S: 250 OK
 *   C: RCPT TO:<luis@riachuelo.com.br>
 *   S: 250 OK   ← accept!
 *      550 ...  ← reject
 *      4xx ...  ← inconclusive (greylist)
 *   C: QUIT
 *
 * Importante: NÃO envia DATA. O probe não envia email real.
 */
function executarProbe(email: string, mxHost: string): Promise<ProbeInterno> {
  return new Promise(resolve => {
    let resolved = false;
    const finalize = (r: ProbeInterno) => {
      if (!resolved) {
        resolved = true;
        try { socket.end(); } catch {}
        try { socket.destroy(); } catch {}
        resolve(r);
      }
    };

    const socket = new net.Socket();
    socket.setTimeout(TIMEOUT_CONN_MS);

    let buffer = '';
    let etapa: 'greeting' | 'after_helo' | 'after_mailfrom' | 'after_rcpt' = 'greeting';
    let lastCode: number | null = null;
    let lastMsg: string | null = null;

    const enviar = (cmd: string) => {
      try {
        socket.write(cmd + '\r\n');
      } catch (e: any) {
        finalize({
          resultado: 'inconclusive',
          smtp_code: lastCode,
          smtp_msg: lastMsg,
          erro: `WRITE_ERR: ${e?.message}`,
        });
      }
    };

    socket.on('connect', () => {
      socket.setTimeout(TIMEOUT_RESPONSE_MS);
      // Não envia nada — aguarda o greeting do servidor (220).
    });

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');

      // SMTP responses são linhas separadas por \r\n.
      // Multi-line: linhas intermediárias usam "250-text", final usa "250 text".
      // Pegamos a última linha que começa com 3 dígitos + espaço.
      const linhas = buffer.split(/\r?\n/);
      let respostaCompleta = '';
      let codigo: number | null = null;

      for (const linha of linhas) {
        const m = linha.match(/^(\d{3})([ -])(.*)$/);
        if (m) {
          codigo = parseInt(m[1], 10);
          respostaCompleta += m[3] + '\n';
          if (m[2] === ' ') {
            // Última linha — resposta concluída
            break;
          }
        }
      }

      if (codigo == null) return; // ainda chunked; aguarda mais data
      buffer = ''; // reset para próxima resposta

      lastCode = codigo;
      lastMsg = respostaCompleta.trim().slice(0, 200);

      if (etapa === 'greeting') {
        if (codigo >= 200 && codigo < 300) {
          etapa = 'after_helo';
          enviar(`HELO ${HELO_DOMAIN}`);
        } else {
          finalize({
            resultado: 'inconclusive',
            smtp_code: codigo,
            smtp_msg: lastMsg,
            erro: 'GREETING_NON_2XX',
          });
        }
      } else if (etapa === 'after_helo') {
        if (codigo >= 200 && codigo < 300) {
          etapa = 'after_mailfrom';
          enviar(`MAIL FROM:<${MAIL_FROM}>`);
        } else {
          finalize({
            resultado: 'inconclusive',
            smtp_code: codigo,
            smtp_msg: lastMsg,
            erro: 'HELO_NON_2XX',
          });
        }
      } else if (etapa === 'after_mailfrom') {
        if (codigo >= 200 && codigo < 300) {
          etapa = 'after_rcpt';
          enviar(`RCPT TO:<${email}>`);
        } else {
          finalize({
            resultado: 'inconclusive',
            smtp_code: codigo,
            smtp_msg: lastMsg,
            erro: 'MAILFROM_NON_2XX',
          });
        }
      } else if (etapa === 'after_rcpt') {
        // ─── A resposta que importa ───
        if (codigo >= 200 && codigo < 300) {
          finalize({
            resultado: 'accept',
            smtp_code: codigo,
            smtp_msg: lastMsg,
          });
        } else if (codigo >= 500 && codigo < 600) {
          finalize({
            resultado: 'reject',
            smtp_code: codigo,
            smtp_msg: lastMsg,
          });
        } else {
          // 4xx (greylist temporário) ou outro → inconclusivo
          finalize({
            resultado: 'inconclusive',
            smtp_code: codigo,
            smtp_msg: lastMsg,
            erro: `RCPT_${codigo}`,
          });
        }
      }
    });

    socket.on('timeout', () => {
      finalize({
        resultado: 'inconclusive',
        smtp_code: lastCode,
        smtp_msg: lastMsg,
        erro: `TIMEOUT_${etapa}`,
      });
    });

    socket.on('error', err => {
      finalize({
        resultado: 'inconclusive',
        smtp_code: lastCode,
        smtp_msg: lastMsg,
        erro: `SOCKET_ERR: ${err?.message?.slice(0, 100) || 'unknown'}`,
      });
    });

    socket.on('close', () => {
      if (!resolved) {
        finalize({
          resultado: 'inconclusive',
          smtp_code: lastCode,
          smtp_msg: lastMsg,
          erro: 'CLOSE_BEFORE_COMPLETE',
        });
      }
    });

    try {
      socket.connect(SMTP_PORT, mxHost);
    } catch (e: any) {
      finalize({
        resultado: 'inconclusive',
        smtp_code: null,
        smtp_msg: null,
        erro: `CONNECT_ERR: ${e?.message?.slice(0, 100)}`,
      });
    }
  });
}
