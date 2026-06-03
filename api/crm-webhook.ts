/**
 * api/crm-webhook.ts — Webhook receiver para eventos do Resend
 *
 * Fase 5C-1 — 03/06/2026 (Motor de Disparo / CRM Campanhas)
 *
 * v1.0 — 03/06/2026 — Primeira versão
 *   - Validação HMAC (Svix headers: svix-id, svix-timestamp, svix-signature)
 *   - INSERT em email_eventos (log imutável)
 *   - UPDATE em email_fila (status + timestamp do evento) com hierarquia de
 *     status para não regredir
 *   - INSERT em email_lead_historico (timeline do lead)
 *   - Auto-opt-out em hard bounce e complaint
 *   - Recálculo dos contadores agregados via RPC
 *     recalcular_contadores_campanha
 *
 * Endpoint público — não exige autenticação JWT (Resend chama de fora).
 * Segurança vem 100% da validação HMAC do header svix-signature.
 *
 * Configuração do webhook no painel Resend:
 *   URL    : https://techfortirms.online/api/crm-webhook
 *   Events : email.sent, email.delivered, email.delivery_delayed,
 *            email.bounced, email.complained, email.opened, email.clicked
 *   Secret : já configurada em env var RESEND_WEBHOOK_SECRET
 *
 * IMPORTANTE: este endpoint usa raw body (bodyParser: false) para validação
 * HMAC. Não tente acessar req.body — use o stream lido manualmente.
 *
 * Tabelas envolvidas:
 *   - email_fila          (UPDATE status + timestamp por evento)
 *   - email_eventos       (INSERT log do evento, fonte da verdade)
 *   - email_lead_historico (INSERT timeline)
 *   - email_optout        (UPSERT em hard bounce e complaint)
 *   - email_campanhas     (UPDATE via RPC recalcular_contadores_campanha)
 *
 * Caminho: api/crm-webhook.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO VERCEL
// ────────────────────────────────────────────────────────────────────────
// bodyParser: false → habilita leitura do raw body (necessário para HMAC).
// maxDuration: 30 → webhook deve ser rápido. Se passar disso, Resend
// considera falha e reenvia.
// ────────────────────────────────────────────────────────────────────────
export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

// ────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ────────────────────────────────────────────────────────────────────────

/**
 * Hierarquia de status do email_fila — usada para impedir regressão.
 * Quando um evento chega tardio (ex: 'delivered' depois de já estar 'aberto'),
 * gravamos o timestamp do evento na coluna correspondente, mas NÃO baixamos
 * o status global.
 */
const STATUS_HIERARQUIA: Record<string, number> = {
  pendente: 0,
  enviado: 1,
  entregue: 2,
  aberto: 3,
  clicado: 4,
  respondido: 5,
  // Estados terminais (não progressivos — força status independente)
  bounce: 99,
  unsubscribed: 99,
  erro: 99,
  cancelado: 99,
};

/**
 * Mapeia tipos do Resend para o vocabulário interno do banco.
 * O banco usa termos enxutos; o Resend usa 'email.xxx'.
 */
const MAPA_TIPO_EVENTO: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

/**
 * Tolerância do timestamp do Svix em segundos.
 * Mensagens com timestamp mais antigo que isso são rejeitadas (replay attack).
 * Svix oficialmente usa 5 minutos.
 */
const SVIX_TIMESTAMP_TOLERANCE_SEC = 5 * 60;

// ────────────────────────────────────────────────────────────────────────
// HELPER: ler raw body do stream
// ────────────────────────────────────────────────────────────────────────
async function lerRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ────────────────────────────────────────────────────────────────────────
// HELPER: validar assinatura Svix
// ────────────────────────────────────────────────────────────────────────
/**
 * Implementação manual da validação Svix (mesmo algoritmo da lib oficial).
 * Não importamos a lib 'svix' pra economizar bundle e cold start.
 *
 * Spec: https://docs.svix.com/receiving/verifying-payloads/how-manual
 *
 * Algoritmo:
 *   1. Pega o secret (formato "whsec_BASE64"), decodifica base64 da parte
 *      após "whsec_".
 *   2. Concatena: `${svix_id}.${svix_timestamp}.${raw_body}`
 *   3. HMAC-SHA256 dessa string com a secret decodificada.
 *   4. Codifica em base64.
 *   5. Compara (timing-safe) com cada assinatura no header
 *      svix-signature, que tem formato "v1,BASE64 v1,BASE64 ..."
 */
function validarAssinaturaSvix(
  rawBody: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
  secret: string,
): { ok: boolean; motivo?: string } {
  // 1. Validar timestamp (anti-replay)
  const ts = parseInt(headers.svixTimestamp, 10);
  if (Number.isNaN(ts)) {
    return { ok: false, motivo: 'svix-timestamp inválido' };
  }
  const agora = Math.floor(Date.now() / 1000);
  const delta = Math.abs(agora - ts);
  if (delta > SVIX_TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, motivo: `timestamp fora da janela (${delta}s)` };
  }

  // 2. Extrair secret real (após "whsec_")
  const prefix = 'whsec_';
  if (!secret.startsWith(prefix)) {
    return { ok: false, motivo: 'secret não começa com whsec_' };
  }
  const secretBytes = Buffer.from(secret.substring(prefix.length), 'base64');

  // 3. Montar a string assinada e calcular HMAC esperado
  const dadosAssinados = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const assinaturaEsperada = crypto
    .createHmac('sha256', secretBytes)
    .update(dadosAssinados, 'utf8')
    .digest('base64');

  // 4. Comparar (timing-safe) com cada assinatura recebida
  // Formato: "v1,assinatura1 v1,assinatura2 ..."
  const assinaturas = headers.svixSignature.split(' ');
  for (const sig of assinaturas) {
    const [version, valor] = sig.split(',');
    if (version !== 'v1' || !valor) continue;
    try {
      const bufRecebida = Buffer.from(valor, 'base64');
      const bufEsperada = Buffer.from(assinaturaEsperada, 'base64');
      if (
        bufRecebida.length === bufEsperada.length &&
        crypto.timingSafeEqual(bufRecebida, bufEsperada)
      ) {
        return { ok: true };
      }
    } catch {
      // ignore base64 inválido e segue tentando os próximos
    }
  }
  return { ok: false, motivo: 'nenhuma assinatura bate com a calculada' };
}

// ────────────────────────────────────────────────────────────────────────
// HELPER: header como string (req.headers pode trazer string ou string[])
// ────────────────────────────────────────────────────────────────────────
function hdr(req: VercelRequest, nome: string): string {
  const v = req.headers[nome.toLowerCase()];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

// ────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ════════ 1. Validar método ════════
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ════════ 2. Validar secret presente ════════
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[crm-webhook] ❌ RESEND_WEBHOOK_SECRET ausente no ambiente');
    return res.status(500).json({
      error: 'Webhook secret not configured',
      hint: 'Configure RESEND_WEBHOOK_SECRET no Vercel (formato whsec_xxx)',
    });
  }

  // ════════ 3. Ler raw body e headers do Svix ════════
  let rawBody: string;
  try {
    rawBody = await lerRawBody(req);
  } catch (e: any) {
    console.error('[crm-webhook] ❌ Erro ao ler body:', e?.message);
    return res.status(400).json({ error: 'Failed to read body' });
  }

  const svixId = hdr(req, 'svix-id');
  const svixTimestamp = hdr(req, 'svix-timestamp');
  const svixSignature = hdr(req, 'svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn('[crm-webhook] ⚠️ Headers Svix ausentes:', { svixId, svixTimestamp, svixSignature });
    return res.status(401).json({ error: 'Missing Svix headers' });
  }

  // ════════ 4. Validar HMAC ════════
  const validacao = validarAssinaturaSvix(
    rawBody,
    { svixId, svixTimestamp, svixSignature },
    secret,
  );
  if (!validacao.ok) {
    console.warn('[crm-webhook] ❌ Assinatura inválida:', validacao.motivo);
    return res.status(401).json({ error: 'Invalid signature', detail: validacao.motivo });
  }

  // ════════ 5. Parsear payload ════════
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error('[crm-webhook] ❌ Body não é JSON válido');
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const tipoResend: string = payload?.type || '';
  const dataEvento: any = payload?.data || {};
  const resendMessageId: string | undefined = dataEvento?.email_id;
  const createdAtResend: string | undefined = payload?.created_at || dataEvento?.created_at;

  // Mapear para vocabulário interno
  const tipoInterno = MAPA_TIPO_EVENTO[tipoResend];
  if (!tipoInterno) {
    console.warn('[crm-webhook] ⚠️ Tipo de evento desconhecido:', tipoResend);
    // Retorna 200 OK pra evitar retries infinitos do Resend
    return res.status(200).json({ ignored: true, reason: 'unknown event type', tipoResend });
  }

  if (!resendMessageId) {
    console.warn('[crm-webhook] ⚠️ Payload sem email_id:', payload);
    return res.status(200).json({ ignored: true, reason: 'missing email_id' });
  }

  console.log(`[crm-webhook] 📨 Evento ${tipoInterno} para message_id ${resendMessageId}`);

  // ════════ 6. Conectar ao Supabase ════════
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // ════════ 7. Buscar item da fila pelo message_id ════════
    const { data: fila, error: errFila } = await supabase
      .from('email_fila')
      .select('id, campanha_id, lead_id, step_id, destinatario_email, destinatario_nome, status')
      .eq('resend_message_id', resendMessageId)
      .maybeSingle();

    if (errFila) {
      console.error('[crm-webhook] ❌ Erro ao buscar fila:', errFila.message);
      return res.status(500).json({ error: 'DB lookup failed', detail: errFila.message });
    }

    if (!fila) {
      // Evento chegou antes do cron gravar o resend_message_id, ou pra um
      // e-mail que não saiu por essa fila (ex: alertas RMS). Registra o
      // evento mesmo assim para auditoria, sem update de fila.
      console.warn(`[crm-webhook] ⚠️ Nenhuma fila encontrada para ${resendMessageId} — gravando evento órfão`);
      await supabase.from('email_eventos').insert({
        fila_id: null,
        lead_id: null,
        resend_message_id: resendMessageId,
        tipo_evento: tipoInterno,
        dados: payload,
        ip_origem: null,
        user_agent: null,
        link_clicado: null,
        criado_em: createdAtResend || new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, orphan: true });
    }

    // ════════ 8. Extrair dados específicos por tipo de evento ════════
    let linkClicado: string | null = null;
    let ipOrigem: string | null = null;
    let userAgent: string | null = null;
    let bounceType: string | null = null;     // 'hard' | 'soft' | null
    let bounceMessage: string | null = null;

    if (tipoInterno === 'clicked') {
      linkClicado = dataEvento?.click?.link || dataEvento?.link || null;
      ipOrigem = dataEvento?.click?.ipAddress || dataEvento?.click?.ip_address || null;
      userAgent = dataEvento?.click?.userAgent || dataEvento?.click?.user_agent || null;
    } else if (tipoInterno === 'opened') {
      ipOrigem = dataEvento?.open?.ipAddress || dataEvento?.open?.ip_address || null;
      userAgent = dataEvento?.open?.userAgent || dataEvento?.open?.user_agent || null;
    } else if (tipoInterno === 'bounced') {
      bounceType = (dataEvento?.bounce?.type || '').toLowerCase() || null;
      bounceMessage = dataEvento?.bounce?.message || null;
    }

    // ════════ 9. INSERT em email_eventos (log imutável) ════════
    const { error: errEvento } = await supabase.from('email_eventos').insert({
      fila_id: fila.id,
      lead_id: fila.lead_id,
      resend_message_id: resendMessageId,
      tipo_evento: tipoInterno,
      dados: payload,
      ip_origem: ipOrigem,
      user_agent: userAgent,
      link_clicado: linkClicado,
      criado_em: createdAtResend || new Date().toISOString(),
    });

    if (errEvento) {
      console.error('[crm-webhook] ❌ Erro ao inserir email_eventos:', errEvento.message);
      // Não retorna 500 — segue tentando o resto. Resend reenvia se status != 2xx.
    }

    // ════════ 10. UPDATE em email_fila — status + timestamp ════════
    // Hierarquia: só sobe; eventos tardios atualizam só o timestamp.
    const updateFila: Record<string, any> = {};
    const statusAtualNum = STATUS_HIERARQUIA[fila.status] ?? 0;

    switch (tipoInterno) {
      case 'sent':
        // já tratado pelo cron — só registra log, não mexe na fila
        break;

      case 'delivered':
        updateFila.entregue_em = createdAtResend || new Date().toISOString();
        if (statusAtualNum < STATUS_HIERARQUIA.entregue) {
          updateFila.status = 'entregue';
        }
        break;

      case 'delivery_delayed':
        // sem timestamp dedicado no schema; só registra evento (já feito)
        break;

      case 'opened':
        updateFila.aberto_em = createdAtResend || new Date().toISOString();
        if (statusAtualNum < STATUS_HIERARQUIA.aberto) {
          updateFila.status = 'aberto';
        }
        break;

      case 'clicked':
        updateFila.clicado_em = createdAtResend || new Date().toISOString();
        if (statusAtualNum < STATUS_HIERARQUIA.clicado) {
          updateFila.status = 'clicado';
        }
        break;

      case 'bounced':
        updateFila.bounce_em = createdAtResend || new Date().toISOString();
        updateFila.status = 'bounce';
        updateFila.erro_detalhes = bounceMessage
          ? `Bounce (${bounceType || 'unknown'}): ${bounceMessage}`
          : `Bounce (${bounceType || 'unknown'})`;
        break;

      case 'complained':
        updateFila.status = 'unsubscribed';
        break;
    }

    if (Object.keys(updateFila).length > 0) {
      const { error: errUpdateFila } = await supabase
        .from('email_fila')
        .update(updateFila)
        .eq('id', fila.id);
      if (errUpdateFila) {
        console.error('[crm-webhook] ❌ Erro ao atualizar email_fila:', errUpdateFila.message);
      }
    }

    // ════════ 11. INSERT em email_lead_historico (timeline) ════════
    if (fila.lead_id) {
      const mapaHistorico: Record<string, { tipo: string; descricao: string }> = {
        sent:              { tipo: 'email_enviado',     descricao: 'E-mail enviado pelo provedor (Resend)' },
        delivered:         { tipo: 'email_entregue',    descricao: 'E-mail entregue na caixa do destinatário' },
        delivery_delayed:  { tipo: 'email_atrasado',    descricao: 'Entrega temporariamente atrasada' },
        opened:            { tipo: 'email_aberto',      descricao: 'Destinatário abriu o e-mail' },
        clicked:           { tipo: 'email_clicado',     descricao: linkClicado ? `Clicou no link: ${linkClicado}` : 'Clicou em um link do e-mail' },
        bounced:           { tipo: 'bounce',            descricao: `Bounce ${bounceType || ''}: ${bounceMessage || 'sem detalhes'}`.trim() },
        complained:        { tipo: 'opt_out',           descricao: 'Marcado como spam (auto opt-out)' },
      };

      const hist = mapaHistorico[tipoInterno];
      if (hist) {
        const { error: errHist } = await supabase.from('email_lead_historico').insert({
          lead_id: fila.lead_id,
          campanha_id: fila.campanha_id,
          step_id: fila.step_id,
          tipo: hist.tipo,
          descricao: hist.descricao,
          dados: { link_clicado: linkClicado, bounce_type: bounceType, bounce_message: bounceMessage },
          resend_message_id: resendMessageId,
          criado_por: 'webhook_resend',
          criado_em: createdAtResend || new Date().toISOString(),
        });
        if (errHist) {
          // não bloqueia o resto — timeline é cosmético
          console.warn('[crm-webhook] ⚠️ Falha ao gravar histórico (ignorado):', errHist.message);
        }
      }
    }

    // ════════ 12. Auto-opt-out (hard bounce + complaint) ════════
    const deveOptOut =
      (tipoInterno === 'bounced' && bounceType === 'hard') ||
      tipoInterno === 'complained';

    if (deveOptOut && fila.destinatario_email) {
      const motivo =
        tipoInterno === 'complained'
          ? 'Marcou como spam (auto opt-out via webhook)'
          : `Hard bounce: ${bounceMessage || 'destinatário inexistente'}`;

      const { error: errOptOut } = await supabase
        .from('email_optout')
        .upsert(
          {
            email: fila.destinatario_email.toLowerCase().trim(),
            motivo,
            campanha_origem_id: fila.campanha_id,
            criado_em: new Date().toISOString(),
          },
          { onConflict: 'email', ignoreDuplicates: true },
        );

      if (errOptOut) {
        console.warn('[crm-webhook] ⚠️ Falha ao gravar opt-out (ignorado):', errOptOut.message);
      } else {
        console.log(`[crm-webhook] 🚫 Auto opt-out: ${fila.destinatario_email}`);
      }
    }

    // ════════ 13. Recalcular contadores agregados da campanha (via RPC) ════════
    // RPC criada pelo SQL 2026-06-03_crm_webhook_recalcular_contadores.sql.
    // Recalcular sempre (em vez de incrementar) elimina race conditions e
    // garante idempotência mesmo se o Resend reenviar o mesmo evento.
    if (fila.campanha_id) {
      const { error: errRpc } = await supabase.rpc('recalcular_contadores_campanha', {
        p_campanha_id: fila.campanha_id,
      });
      if (errRpc) {
        console.warn('[crm-webhook] ⚠️ Falha ao recalcular contadores (ignorado):', errRpc.message);
      }
    }

    // ════════ 14. Resposta de sucesso ════════
    return res.status(200).json({
      ok: true,
      tipo: tipoInterno,
      fila_id: fila.id,
      campanha_id: fila.campanha_id,
      opt_out_aplicado: deveOptOut,
    });
  } catch (err: any) {
    console.error('[crm-webhook] ❌ Exceção inesperada:', err?.message);
    console.error('[crm-webhook] Stack:', err?.stack);
    return res.status(500).json({ error: 'Internal server error', detail: err?.message });
  }
}
