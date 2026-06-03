/**
 * api/crm-webhook.ts — Webhook receiver para eventos do Resend
 *
 * Fase 5C-1 + Fase 7-MVP — 03/06/2026 (CRM Campanhas)
 *
 * v1.1.1 — 03/06/2026 — Link no e-mail de alerta agora aponta para deep link
 *   da ficha do lead em Production:
 *     https://techfortirms.online/?view=crm_base_leads&lead_id={lead_id}
 *   Pre-requisito para deep link FUNCIONAR (abrir drawer auto): mudança
 *   pendente no App.tsx parsear `view` e `lead_id` da query string.
 *   Enquanto isso, o link leva o gestor pra home; ele navega manualmente
 *   até a ficha — comportamento gracioso, não quebra.
 *
 * v1.1 — 03/06/2026 — Adicionado handler para evento email.received (Fase 7-MVP).
 *   - Parse do "to" do payload para extrair fila_id e lead_id via padrão
 *     `respostas+f{fila_id}+l{lead_id}@dominio`.
 *   - INSERT em email_respostas (lead_id, campanha_id, fila_id, de_email,
 *     de_nome, assunto, corpo_texto, corpo_html).
 *   - UPDATE email_fila.status = 'respondido' (sem regredir; já está em
 *     estado terminal alternativo).
 *   - INSERT em email_lead_historico (tipo 'email_respondido').
 *   - Disparo de e-mail de alerta ao responsavel_id da campanha
 *     (via api/send-email type='general'), respeitando flag
 *     receber_alertas_email do destinatário.
 *   - Email recebido em endereço que NÃO bate o padrão `respostas+...`
 *     gera evento órfão (auditável) sem quebrar o webhook.
 *
 * v1.0 — 03/06/2026 — Primeira versão (sent/delivered/opened/clicked/bounced/
 *   complained/delivery_delayed):
 *   - Validação HMAC (Svix headers: svix-id, svix-timestamp, svix-signature)
 *   - INSERT em email_eventos (log imutável)
 *   - UPDATE em email_fila (status + timestamp do evento) com hierarquia
 *   - INSERT em email_lead_historico (timeline)
 *   - Auto-opt-out em hard bounce e complaint
 *   - Recálculo de contadores via RPC recalcular_contadores_campanha
 *
 * Endpoint público — não exige autenticação JWT (Resend chama de fora).
 * Segurança vem 100% da validação HMAC do header svix-signature.
 *
 * Configuração do webhook no painel Resend:
 *   URL    : https://{deploy}.vercel.app/api/crm-webhook
 *   Events : email.sent, email.delivered, email.delivery_delayed,
 *            email.bounced, email.complained, email.opened, email.clicked,
 *            email.received   ← Fase 7-MVP
 *   Secret : RESEND_WEBHOOK_SECRET
 *
 * Tabelas envolvidas:
 *   - email_fila          (UPDATE status + timestamp por evento)
 *   - email_eventos       (INSERT log do evento, fonte da verdade)
 *   - email_lead_historico (INSERT timeline)
 *   - email_optout        (UPSERT em hard bounce e complaint)
 *   - email_respostas     (INSERT em email.received — Fase 7-MVP)
 *   - email_campanhas     (UPDATE via RPC recalcular_contadores_campanha)
 *   - app_users           (SELECT responsável da campanha para alerta)
 *
 * Caminho: api/crm-webhook.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO VERCEL
// ────────────────────────────────────────────────────────────────────────
export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

// ────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ────────────────────────────────────────────────────────────────────────

/** Hierarquia de status do email_fila — usada para impedir regressão. */
const STATUS_HIERARQUIA: Record<string, number> = {
  pendente: 0,
  enviado: 1,
  entregue: 2,
  aberto: 3,
  clicado: 4,
  respondido: 5,
  // Estados terminais alternativos
  bounce: 99,
  unsubscribed: 99,
  erro: 99,
  cancelado: 99,
};

/** Mapeia tipos do Resend para o vocabulário interno do banco. */
const MAPA_TIPO_EVENTO: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.received': 'received', // 🆕 Fase 7-MVP
};

/** Tolerância do timestamp do Svix em segundos (anti-replay). */
const SVIX_TIMESTAMP_TOLERANCE_SEC = 5 * 60;

/**
 * Regex do padrão de Reply-To dinâmico usado pelo cron disparar-fila:
 *   respostas+f{fila_id}+l{lead_id}@{dominio}
 * Match groups: [1]=fila_id  [2]=lead_id
 */
const REPLY_TO_PATTERN = /^respostas\+f(\d+)\+l(\d+)@/i;

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
// HELPER: validar assinatura Svix (HMAC-SHA256 com anti-replay)
// ────────────────────────────────────────────────────────────────────────
function validarAssinaturaSvix(
  rawBody: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
  secret: string,
): { ok: boolean; motivo?: string } {
  const ts = parseInt(headers.svixTimestamp, 10);
  if (Number.isNaN(ts)) {
    return { ok: false, motivo: 'svix-timestamp inválido' };
  }
  const agora = Math.floor(Date.now() / 1000);
  const delta = Math.abs(agora - ts);
  if (delta > SVIX_TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, motivo: `timestamp fora da janela (${delta}s)` };
  }

  const prefix = 'whsec_';
  if (!secret.startsWith(prefix)) {
    return { ok: false, motivo: 'secret não começa com whsec_' };
  }
  const secretBytes = Buffer.from(secret.substring(prefix.length), 'base64');

  const dadosAssinados = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const assinaturaEsperada = crypto
    .createHmac('sha256', secretBytes)
    .update(dadosAssinados, 'utf8')
    .digest('base64');

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
      // ignore base64 inválido
    }
  }
  return { ok: false, motivo: 'nenhuma assinatura bate com a calculada' };
}

// ────────────────────────────────────────────────────────────────────────
// HELPER: header como string
// ────────────────────────────────────────────────────────────────────────
function hdr(req: VercelRequest, nome: string): string {
  const v = req.headers[nome.toLowerCase()];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

// ────────────────────────────────────────────────────────────────────────
// HELPER (🆕 Fase 7-MVP): parse do "to" do email.received
// ────────────────────────────────────────────────────────────────────────
/**
 * O payload do email.received traz "to" como string OU array de strings.
 * Procura entre eles o primeiro que case com o padrão de Reply-To dinâmico.
 *
 * Retorno: { filaId, leadId } se encontrar; null caso contrário.
 */
function parsearReplyTo(toField: any): { filaId: number; leadId: number } | null {
  const candidatos: string[] = Array.isArray(toField)
    ? toField.map((x) => String(x || '').trim())
    : [String(toField || '').trim()];

  for (const dest of candidatos) {
    const m = dest.match(REPLY_TO_PATTERN);
    if (m) {
      const filaId = parseInt(m[1], 10);
      const leadId = parseInt(m[2], 10);
      if (!Number.isNaN(filaId) && !Number.isNaN(leadId)) {
        return { filaId, leadId };
      }
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// HELPER (🆕 Fase 7-MVP): extrair from como { email, nome }
// ────────────────────────────────────────────────────────────────────────
/**
 * O campo "from" do payload pode vir como:
 *   - "Nome Sobrenome <email@dominio.com>"
 *   - "email@dominio.com"
 * Esta função separa nome e e-mail. Robusto a ambos os formatos.
 */
function parsearFrom(fromField: any): { email: string; nome: string | null } {
  const raw = String(fromField || '').trim();
  if (!raw) return { email: '', nome: null };

  // Formato "Nome <email>"
  const m = raw.match(/^\s*(.+?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) {
    return {
      email: m[2].trim().toLowerCase(),
      nome: m[1].replace(/^["']|["']$/g, '').trim() || null,
    };
  }
  // Só e-mail
  return { email: raw.toLowerCase(), nome: null };
}

// ────────────────────────────────────────────────────────────────────────
// HELPER (🆕 Fase 7-MVP): disparar alerta de resposta para o responsável
// ────────────────────────────────────────────────────────────────────────
/**
 * Chama internamente o endpoint /api/send-email para notificar o responsável
 * da campanha que recebeu uma nova resposta. Usa type='general'.
 *
 * Não falha o webhook se o alerta falhar — apenas loga. A resposta já
 * está gravada em email_respostas; o gestor pode ver pela UI mesmo sem o alerta.
 */
async function dispararAlertaResposta(opts: {
  supabase: any;
  origem: string; // base URL do próprio Vercel (req.headers.host)
  responsavelId: number | null | undefined;
  leadId: number;                          // 🆕 v1.1.1 — usado no deep link
  leadEmail: string;
  leadNome: string | null;
  campanhaNome: string;
  assunto: string | null;
  corpoTexto: string | null;
}): Promise<void> {
  if (!opts.responsavelId) {
    console.log('[crm-webhook] ⚠️ Campanha sem responsavel_id — alerta não enviado');
    return;
  }

  try {
    // Buscar e-mail do responsável
    const { data: usr, error: errUsr } = await opts.supabase
      .from('app_users')
      .select('id, nome_usuario, email_usuario, receber_alertas_email, ativo_usuario')
      .eq('id', opts.responsavelId)
      .maybeSingle();

    if (errUsr || !usr) {
      console.warn('[crm-webhook] ⚠️ Responsável da campanha não encontrado:', opts.responsavelId);
      return;
    }
    if (usr.ativo_usuario === false) {
      console.log(`[crm-webhook] ⚠️ Responsável ${usr.email_usuario} está inativo — alerta não enviado`);
      return;
    }
    if (usr.receber_alertas_email === false) {
      console.log(`[crm-webhook] ⚠️ Responsável ${usr.email_usuario} desabilitou alertas — não enviado`);
      return;
    }

    const previewCorpo = (opts.corpoTexto || '').substring(0, 500);

    // 🆕 v1.1.1 — Link deep para a ficha do lead no RMS-RAISA (Production).
    // Em Preview (sem custom domain), o e-mail mostraria a URL Vercel; em
    // Production essa é a URL definitiva. Hoje (sem mudança no App.tsx),
    // o gestor cai na home e navega manualmente; quando o App.tsx parsear
    // a query string, o link abre direto na ficha do lead (drawer auto-aberto).
    const linkDeepFichaLead = `https://techfortirms.online/?view=crm_base_leads&lead_id=${opts.leadId}`;

    const subjectAlerta = `RMS-RAISA: ${opts.leadNome || opts.leadEmail} respondeu à campanha "${opts.campanhaNome}"`;
    const htmlAlerta = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5">
        <p>Olá ${usr.nome_usuario || ''},</p>
        <p>Um lead respondeu a uma campanha sob sua responsabilidade.</p>
        <table style="border-collapse:collapse;margin:16px 0;font-size:13px">
          <tr><td style="padding:4px 10px 4px 0;color:#666">Lead:</td><td style="padding:4px 0"><strong>${opts.leadNome || '(sem nome)'}</strong> &lt;${opts.leadEmail}&gt;</td></tr>
          <tr><td style="padding:4px 10px 4px 0;color:#666">Campanha:</td><td style="padding:4px 0">${opts.campanhaNome}</td></tr>
          <tr><td style="padding:4px 10px 4px 0;color:#666">Assunto da resposta:</td><td style="padding:4px 0">${opts.assunto || '(sem assunto)'}</td></tr>
        </table>
        <p style="color:#666;font-size:13px;margin-top:18px">Prévia da resposta:</p>
        <blockquote style="margin:6px 0;padding:10px 14px;border-left:3px solid #A33022;background:#f7f7f7;color:#444;font-size:13px;white-space:pre-wrap">${previewCorpo || '(sem corpo de texto)'}</blockquote>
        <p style="margin-top:18px;font-size:13px">Acesse: <a href="${linkDeepFichaLead}" style="color:#A33022;text-decoration:underline;font-weight:bold">${linkDeepFichaLead}</a> para ver a resposta completa na ficha do lead e decidir os próximos passos (continuar a sequência ou pausar).</p>
        <p style="font-size:12px;color:#999;margin-top:24px">— RMS-RAISA Sequenciador</p>
      </div>
    `.trim();
    const textAlerta = `Olá ${usr.nome_usuario || ''},
Um lead respondeu a uma campanha sob sua responsabilidade.

Lead: ${opts.leadNome || '(sem nome)'} <${opts.leadEmail}>
Campanha: ${opts.campanhaNome}
Assunto: ${opts.assunto || '(sem assunto)'}

Prévia: ${previewCorpo || '(sem corpo)'}

Acesse: ${linkDeepFichaLead} para ver a resposta completa e decidir os próximos passos.`;

    // Chama o /api/send-email do próprio deploy
    const baseUrl = opts.origem.startsWith('http')
      ? opts.origem
      : `https://${opts.origem}`;

    const respAlerta = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: usr.email_usuario,
        toName: usr.nome_usuario,
        subject: subjectAlerta,
        type: 'general',
        summary: textAlerta,
        // Override para HTML rico (send-email com type='general' usa <p>${summary}</p>;
        // queremos um layout melhor, então passamos HTML completo via summary mesmo
        // — o send-email envolve em <p> mas o navegador trata HTML interno).
      }),
    });

    if (!respAlerta.ok) {
      const txt = await respAlerta.text().catch(() => '');
      console.warn(`[crm-webhook] ⚠️ Alerta falhou (status ${respAlerta.status}): ${txt.substring(0, 200)}`);
    } else {
      console.log(`[crm-webhook] 📨 Alerta de resposta enviado para ${usr.email_usuario}`);
    }
  } catch (e: any) {
    console.warn('[crm-webhook] ⚠️ Erro ao disparar alerta de resposta:', e?.message);
  }
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
    console.warn('[crm-webhook] ⚠️ Headers Svix ausentes');
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
  const createdAtResend: string | undefined = payload?.created_at || dataEvento?.created_at;

  const tipoInterno = MAPA_TIPO_EVENTO[tipoResend];
  if (!tipoInterno) {
    console.warn('[crm-webhook] ⚠️ Tipo de evento desconhecido:', tipoResend);
    return res.status(200).json({ ignored: true, reason: 'unknown event type', tipoResend });
  }

  console.log(`[crm-webhook] 📨 Evento ${tipoInterno}`);

  // ════════ 6. Conectar ao Supabase ════════
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ════════ 7. ROTEAMENTO POR TIPO DE EVENTO ════════
  try {
    // ───────────────────────────────────────────────────────────────
    // 🆕 RAMO ESPECIAL: email.received (Fase 7-MVP)
    // ───────────────────────────────────────────────────────────────
    if (tipoInterno === 'received') {
      return await processarEmailRecebido({
        supabase,
        req,
        res,
        payload,
        dataEvento,
        createdAtResend,
      });
    }

    // ───────────────────────────────────────────────────────────────
    // RAMO PADRÃO: eventos outbound (sent, delivered, opened, etc.)
    // ───────────────────────────────────────────────────────────────
    const resendMessageId: string | undefined = dataEvento?.email_id;
    if (!resendMessageId) {
      console.warn('[crm-webhook] ⚠️ Payload sem email_id:', payload);
      return res.status(200).json({ ignored: true, reason: 'missing email_id' });
    }

    // Buscar item da fila pelo message_id
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
      console.warn(`[crm-webhook] ⚠️ Nenhuma fila para ${resendMessageId} — gravando órfão`);
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

    // Extrair dados específicos do evento
    let linkClicado: string | null = null;
    let ipOrigem: string | null = null;
    let userAgent: string | null = null;
    let bounceType: string | null = null;
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

    // INSERT em email_eventos (log imutável)
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
    }

    // UPDATE email_fila — status + timestamp do evento
    const updateFila: Record<string, any> = {};
    const statusAtualNum = STATUS_HIERARQUIA[fila.status] ?? 0;

    switch (tipoInterno) {
      case 'sent':
        break;
      case 'delivered':
        updateFila.entregue_em = createdAtResend || new Date().toISOString();
        if (statusAtualNum < STATUS_HIERARQUIA.entregue) updateFila.status = 'entregue';
        break;
      case 'delivery_delayed':
        break;
      case 'opened':
        updateFila.aberto_em = createdAtResend || new Date().toISOString();
        if (statusAtualNum < STATUS_HIERARQUIA.aberto) updateFila.status = 'aberto';
        break;
      case 'clicked':
        updateFila.clicado_em = createdAtResend || new Date().toISOString();
        if (statusAtualNum < STATUS_HIERARQUIA.clicado) updateFila.status = 'clicado';
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
        .from('email_fila').update(updateFila).eq('id', fila.id);
      if (errUpdateFila) {
        console.error('[crm-webhook] ❌ Erro ao atualizar email_fila:', errUpdateFila.message);
      }
    }

    // INSERT email_lead_historico (timeline)
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
        await supabase.from('email_lead_historico').insert({
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
      }
    }

    // Auto-opt-out (hard bounce + complaint)
    const deveOptOut =
      (tipoInterno === 'bounced' && bounceType === 'hard') ||
      tipoInterno === 'complained';

    if (deveOptOut && fila.destinatario_email) {
      const motivo =
        tipoInterno === 'complained'
          ? 'Marcou como spam (auto opt-out via webhook)'
          : `Hard bounce: ${bounceMessage || 'destinatário inexistente'}`;
      await supabase.from('email_optout').upsert(
        {
          email: fila.destinatario_email.toLowerCase().trim(),
          motivo,
          campanha_origem_id: fila.campanha_id,
          criado_em: new Date().toISOString(),
        },
        { onConflict: 'email', ignoreDuplicates: true },
      );
      console.log(`[crm-webhook] 🚫 Auto opt-out: ${fila.destinatario_email}`);
    }

    // Recalcular contadores agregados via RPC
    if (fila.campanha_id) {
      await supabase.rpc('recalcular_contadores_campanha', { p_campanha_id: fila.campanha_id });
    }

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

// ────────────────────────────────────────────────────────────────────────
// 🆕 PROCESSADOR DEDICADO: email.received (Fase 7-MVP)
// ────────────────────────────────────────────────────────────────────────
/**
 * Trata um evento email.received do Resend Inbound.
 *
 * Fluxo:
 *   1. Parse do "to" do payload → extrai fila_id e lead_id do plus-alias
 *      `respostas+f{fila_id}+l{lead_id}@dominio`.
 *   2. Lookup da fila correspondente (valida que fila_id e lead_id batem).
 *   3. INSERT em email_respostas com de_email, de_nome, assunto, corpos.
 *   4. UPDATE em email_fila: status='respondido' (estado terminal alternativo).
 *   5. INSERT em email_lead_historico (timeline tipo='email_respondido').
 *   6. Recalcular contadores da campanha (RPC).
 *   7. Disparar alerta por e-mail ao responsável (não-bloqueante).
 *
 * Casos de borda:
 *   - "to" não bate o padrão → grava evento órfão em email_eventos para
 *     auditoria, retorna 200 (não força retry do Resend).
 *   - fila/lead inconsistente → idem.
 */
async function processarEmailRecebido(opts: {
  supabase: any;
  req: VercelRequest;
  res: VercelResponse;
  payload: any;
  dataEvento: any;
  createdAtResend: string | undefined;
}) {
  const { supabase, req, res, payload, dataEvento, createdAtResend } = opts;

  // 1. Parse do "to" — campo do Resend pode ser string ou array
  const toField = dataEvento?.to;
  const parsed = parsearReplyTo(toField);

  if (!parsed) {
    console.warn('[crm-webhook] ⚠️ email.received sem padrão respostas+f+l no "to":', toField);
    // Grava como evento órfão pra auditoria
    await supabase.from('email_eventos').insert({
      fila_id: null,
      lead_id: null,
      resend_message_id: null,
      tipo_evento: 'received',
      dados: payload,
      criado_em: createdAtResend || new Date().toISOString(),
    });
    return res.status(200).json({
      ok: true,
      orphan: true,
      reason: 'to não bate padrão respostas+f{id}+l{id}',
    });
  }

  const { filaId, leadId } = parsed;

  // 2. Lookup da fila — valida que existe e que lead_id confere
  const { data: fila, error: errFila } = await supabase
    .from('email_fila')
    .select('id, campanha_id, lead_id, step_id, destinatario_email')
    .eq('id', filaId)
    .maybeSingle();

  if (errFila) {
    console.error('[crm-webhook] ❌ Erro ao buscar fila para resposta:', errFila.message);
    return res.status(500).json({ error: 'DB lookup failed', detail: errFila.message });
  }

  if (!fila) {
    console.warn(`[crm-webhook] ⚠️ Fila ${filaId} não encontrada (resposta órfã)`);
    await supabase.from('email_eventos').insert({
      fila_id: null,
      lead_id: leadId,
      resend_message_id: null,
      tipo_evento: 'received',
      dados: payload,
      criado_em: createdAtResend || new Date().toISOString(),
    });
    return res.status(200).json({ ok: true, orphan: true, reason: 'fila não encontrada' });
  }

  if (fila.lead_id !== leadId) {
    console.warn(
      `[crm-webhook] ⚠️ Lead do Reply-To (${leadId}) não bate com fila ${filaId} (lead ${fila.lead_id})`,
    );
    // Ainda assim grava a resposta — confia no lead_id da fila como verdade
  }

  // 3. Buscar dados da campanha para o alerta
  const { data: campanha } = await supabase
    .from('email_campanhas')
    .select('id, nome, responsavel_id')
    .eq('id', fila.campanha_id)
    .maybeSingle();

  // 4. Buscar dados do lead (para o nome no histórico)
  const { data: lead } = await supabase
    .from('email_leads')
    .select('id, nome, email')
    .eq('id', fila.lead_id)
    .maybeSingle();

  // 5. Extrair from, assunto e corpos do payload
  const { email: deEmail, nome: deNome } = parsearFrom(dataEvento?.from);
  const assunto: string | null = dataEvento?.subject || null;
  const corpoTexto: string | null = dataEvento?.text || null;
  const corpoHtml: string | null = dataEvento?.html || null;

  if (!deEmail) {
    console.warn('[crm-webhook] ⚠️ email.received sem "from" válido');
    return res.status(200).json({ ok: true, orphan: true, reason: 'from inválido' });
  }

  // 6. INSERT em email_respostas
  const { data: novaResposta, error: errResp } = await supabase
    .from('email_respostas')
    .insert({
      lead_id: fila.lead_id,
      campanha_id: fila.campanha_id,
      fila_id: fila.id,
      de_email: deEmail,
      de_nome: deNome,
      assunto,
      corpo_texto: corpoTexto,
      corpo_html: corpoHtml,
      classificacao: 'pendente',
      lido: false,
      recebido_em: createdAtResend || new Date().toISOString(),
    })
    .select('id')
    .single();

  if (errResp) {
    console.error('[crm-webhook] ❌ Erro ao inserir email_respostas:', errResp.message);
    return res.status(500).json({ error: 'Insert failed', detail: errResp.message });
  }

  console.log(`[crm-webhook] 💬 Resposta gravada: id=${novaResposta?.id} lead=${fila.lead_id} campanha=${fila.campanha_id}`);

  // 7. UPDATE em email_fila — status='respondido'
  await supabase
    .from('email_fila')
    .update({ status: 'respondido' })
    .eq('id', fila.id);

  // 8. INSERT em email_lead_historico
  await supabase.from('email_lead_historico').insert({
    lead_id: fila.lead_id,
    campanha_id: fila.campanha_id,
    step_id: fila.step_id,
    tipo: 'email_respondido',
    descricao: assunto ? `Resposta recebida: ${assunto}` : 'Resposta recebida do lead',
    dados: {
      resposta_id: novaResposta?.id,
      de_email: deEmail,
      de_nome: deNome,
      preview: (corpoTexto || '').substring(0, 200),
    },
    criado_por: 'webhook_resend',
    criado_em: createdAtResend || new Date().toISOString(),
  });

  // 9. Recalcular contadores (atualiza total_respondidos e taxa_resposta)
  if (fila.campanha_id) {
    const { error: errRpc } = await supabase.rpc('recalcular_contadores_campanha', {
      p_campanha_id: fila.campanha_id,
    });
    if (errRpc) {
      console.warn('[crm-webhook] ⚠️ Falha ao recalcular contadores:', errRpc.message);
    }
  }

  // 10. Disparar alerta para o responsável (não-bloqueante)
  if (campanha?.responsavel_id) {
    const host = hdr(req, 'host') || hdr(req, 'x-forwarded-host') || '';
    await dispararAlertaResposta({
      supabase,
      origem: host,
      responsavelId: campanha.responsavel_id,
      leadId: fila.lead_id, // 🆕 v1.1.1 — para deep link
      leadEmail: lead?.email || deEmail,
      leadNome: lead?.nome || deNome,
      campanhaNome: campanha.nome || `Campanha #${campanha.id}`,
      assunto,
      corpoTexto,
    });
  }

  return res.status(200).json({
    ok: true,
    tipo: 'received',
    resposta_id: novaResposta?.id,
    fila_id: fila.id,
    lead_id: fila.lead_id,
    campanha_id: fila.campanha_id,
  });
}
