/**
 * api/crm-webhook.ts — Webhook receiver para eventos do Resend
 *
 * Fase 5C-1 + Fase 7-MVP — 03/06/2026 (CRM Campanhas)
 *
 * v1.5 — 04/06/2026 — Instrumentação do email.received (debug do bug "(sem corpo)").
 *   Sintoma: forward ao gestor chega com "(sem corpo)" e o drawer da ficha
 *   mostra "—" na seção Respostas, mesmo quando a UI do Resend Activity
 *   mostra que o e-mail recebido tem `text` e `html` preenchidos.
 *   Achado adicional: a query `SELECT * FROM email_eventos WHERE tipo_evento='received'`
 *   retornou vazio — porque o caminho feliz do `processarEmailRecebido()`
 *   NUNCA gravava em email_eventos (só os órfãos eram gravados). Sem o
 *   payload bruto preservado, não há como auditar quais chaves o Resend
 *   está mandando no webhook (que pode ser diferente do objeto retornado
 *   pela UI Activity).
 *   Correção (não-invasiva, só observabilidade):
 *     1) `console.log` verboso no início de `processarEmailRecebido` com
 *        tem_text/tam_text/tem_html/tam_html + lista das primeiras chaves
 *        do payload.data — permite diagnóstico via logs do Vercel.
 *     2) INSERT em email_eventos AGORA é feito SEMPRE para email.received
 *        (caminho feliz e órfão), igual aos outros tipos de evento. Isso
 *        preserva o payload bruto em `dados` para auditoria SQL posterior.
 *     3) Resend_message_id no INSERT lê de dataEvento.id || dataEvento.email_id
 *        (cobre as 2 variações possíveis do payload).
 *   Não altera o parsing do corpo (corpoTexto/corpoHtml) — esse fix
 *   definitivo virá na v1.6, baseado no payload real capturado.
 *
 * v1.4 — 04/06/2026 — Hotfix: contadores agregados em email_leads.
 *   Sintoma: cards do header da ficha do lead ficavam zerados
 *   (total_emails_recebidos, total_emails_abertos, total_emails_clicados,
 *   total_respostas) mesmo quando o lead tinha eventos gravados em
 *   email_eventos / email_respostas.
 *   Causa-raiz: nenhum handler do webhook fazia UPDATE em email_leads.
 *   Os contadores eram só calculados em email_campanhas (via RPC
 *   recalcular_contadores_campanha), nunca espelhados no lead.
 *   Correção:
 *     1) Nova RPC SQL `incrementar_contador_lead(p_lead_id, p_campo, p_delta)`
 *        — UPDATE atômico com whitelist de campos para evitar SQL injection
 *        e race conditions em concorrência.
 *     2) Ramo outbound (delivered/opened/clicked): após o UPDATE em
 *        email_fila, chama a RPC se for a PRIMEIRA ocorrência do tipo
 *        para aquela fila (gate: entregue_em/aberto_em/clicado_em IS NULL).
 *        Esse gate evita inflar o contador quando o Resend reenvia o
 *        mesmo evento (idempotência).
 *     3) Ramo received: cada resposta nova incrementa total_respostas
 *        (lead pode responder N vezes — cada resposta conta).
 *     4) SELECT da fila no ramo outbound passou a trazer também
 *        entregue_em, aberto_em, clicado_em para suportar o gate.
 *   Falha na RPC só loga warning; não quebra o webhook. A reconciliação
 *   histórica é feita separadamente por SQL script.
 *
 * v1.3 — 04/06/2026 — Plano B: SDK Resend ELIMINADO desta função.
 *   Após validar em 4 versões de `disparar-fila.ts` (v1.3 → v1.3.1 → v1.4 → v1.5)
 *   que o SDK do Resend Node descarta `replyTo`/`reply_to` e até o header
 *   `Reply-To` em `headers`, o caminho de chamada do `encaminharRespostaAoGestor()`
 *   foi migrado para `fetch` direto na REST API do Resend
 *   (`https://api.resend.com/emails`), onde o body JSON com `reply_to`
 *   (snake_case) é aceito nativamente.
 *   Mudanças:
 *     • Removida `import { Resend } from 'resend'`.
 *     • Interface da função: `resend: Resend` → `resendApiKey: string`.
 *     • Disparo: `opts.resend.emails.send(...)` → `fetch(...)`.
 *     • Callsite no `processarEmailRecebido`: não instancia mais `new Resend()`;
 *       passa apenas a chave `RESEND_API_KEY` do env.
 *     • Tratamento de erro adaptado para HTTP status + body JSON.
 *     • Console.log explícito do `reply_to` para auditoria.
 *
 * v1.2 — 03/06/2026 — Forward completo da resposta ao gestor (Fase 7-MVP final).
 *   - Renomeada `dispararAlertaResposta()` → `encaminharRespostaAoGestor()`.
 *   - Antes: chamava `/api/send-email` (type='general'), que embrulha em
 *     `<p>${summary}</p>` e quebra HTML rico. O gestor recebia apenas uma
 *     notificação curta com preview de 500 chars.
 *   - Agora: usa o SDK do Resend diretamente para enviar um e-mail rico
 *     ao gestor responsável pela campanha, contendo o CONTEÚDO COMPLETO
 *     da resposta do lead (HTML preservado + texto fallback). O gestor
 *     pode clicar em "Responder" e responder DIRETO para o lead — o
 *     header `Reply-To` no encaminhamento é o e-mail do próprio lead,
 *     então o envio sai do servidor de e-mail corporativo do gestor
 *     (@techforti.com.br) sem precisar passar pelo Resend Inbound.
 *   - Razão arquitetural: o domínio `techforti.com.br` não pode ter os
 *     MX trocados para o Resend Inbound (política de segurança da TI).
 *     A solução é encaminhar via webhook em vez de redirecionar no
 *     servidor SMTP — mantém Resend Inbound + entrega completa ao gestor.
 *   - Novo parâmetro `corpoHtml` na chamada (era só `corpoTexto`).
 *   - Adicionado import { Resend } from 'resend'.
 *   - From do forward: `${leadNome} via RMS-RAISA <notificacoes@techfortirms.online>`.
 *   - Subject do forward: `[Lead respondeu] ${assunto original do lead}`.
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
// 🆕 v1.3 (04/06/2026 — Plano B): SDK Resend REMOVIDO deste arquivo. A
// função `encaminharRespostaAoGestor()` chama a API REST do Resend via
// `fetch` direto. Razão: o SDK descarta `replyTo`/`reply_to`/header `Reply-To`
// silenciosamente (validado em 4 versões consecutivas de `disparar-fila.ts`).
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
// HELPER (🆕 Fase 7-MVP): escapar HTML em interpolação de texto
// ────────────────────────────────────────────────────────────────────────
/**
 * Escapa caracteres especiais de HTML para evitar XSS quando interpolamos
 * dados externos (nome do lead, e-mail, assunto) em templates.
 * Usado no cabeçalho de contexto do encaminhamento — o corpo do e-mail
 * em si (corpoHtml do lead) é encaminhado intacto, pois é HTML legítimo
 * recebido via Resend Inbound (já passou pelo filtro deles).
 */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ────────────────────────────────────────────────────────────────────────
// HELPER (🆕 Fase 7-MVP v1.2): encaminhar a resposta completa ao gestor
// ────────────────────────────────────────────────────────────────────────
/**
 * Encaminha o conteúdo COMPLETO da resposta do lead ao gestor responsável
 * pela campanha, usando o SDK do Resend diretamente.
 *
 * Diferença vs. v1.1.1 (chamava /api/send-email):
 *   • Antes: notificação curta com preview de 500 chars (send-email com
 *     type='general' embrulha tudo em <p>${summary}</p> e quebra HTML rico).
 *   • Agora: e-mail rico com cabeçalho de contexto + HTML completo do lead
 *     preservado + Reply-To = e-mail do lead (gestor responde direto).
 *
 * Estrutura do e-mail enviado ao gestor:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Cabeçalho de contexto (campanha, link CRM, lead, assunto)│
 *   ├──────────────────────────────────────────────────────────┤
 *   │ HTML/texto ORIGINAL da resposta do lead                  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Rodapé técnico (LGPD, opt-out, instrução de resposta)    │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Headers do envio:
 *   • From    : `${leadNome} via RMS-RAISA <notificacoes@techfortirms.online>`
 *   • To      : e-mail pessoal do gestor (app_users.email_usuario)
 *   • Reply-To: e-mail do PRÓPRIO LEAD — assim, quando o gestor clica em
 *               "Responder" no seu cliente de e-mail (Gmail/Outlook), o
 *               envio vai DIRETO para o lead, saindo do servidor SMTP
 *               corporativo do gestor (@techforti.com.br) sem passar pelo
 *               Resend Inbound (não cria loop).
 *
 * Respeita as flags do gestor:
 *   • `app_users.ativo_usuario = false` → não encaminha
 *   • `app_users.receber_alertas_email = false` → não encaminha
 *
 * Não falha o webhook se o encaminhamento falhar — apenas loga. A resposta
 * já está gravada em `email_respostas`; o gestor pode ver pela ficha do
 * lead no CRM mesmo sem o encaminhamento.
 */
async function encaminharRespostaAoGestor(opts: {
  supabase: any;
  resendApiKey: string;        // 🆕 v1.3 — chave da API (SDK removido, fetch direto)
  responsavelId: number | null | undefined;
  leadId: number;
  leadEmail: string;
  leadNome: string | null;
  campanhaNome: string;
  assunto: string | null;
  corpoTexto: string | null;
  corpoHtml: string | null;          // 🆕 v1.2 — HTML completo do lead
}): Promise<void> {
  if (!opts.responsavelId) {
    console.log('[crm-webhook] ⚠️ Campanha sem responsavel_id — encaminhamento não enviado');
    return;
  }

  try {
    // 1) Buscar dados do gestor responsável
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
      console.log(`[crm-webhook] ⚠️ Responsável ${usr.email_usuario} está inativo — encaminhamento não enviado`);
      return;
    }
    if (usr.receber_alertas_email === false) {
      console.log(`[crm-webhook] ⚠️ Responsável ${usr.email_usuario} desabilitou alertas — não enviado`);
      return;
    }

    // 2) Preparar campos do e-mail
    const FROM_DOMAIN = process.env.RESEND_FROM_EMAIL || 'notificacoes@techfortirms.online';
    // Extrai só o e-mail caso a env venha como "Nome <email>"
    const fromEmailMatch = String(FROM_DOMAIN).match(/<([^>]+)>/);
    const fromEmailLimpo = fromEmailMatch ? fromEmailMatch[1] : String(FROM_DOMAIN);
    const fromNomeAmigavel = opts.leadNome
      ? `${opts.leadNome} via RMS-RAISA`
      : 'RMS-RAISA Sequenciador';
    const fromFormatado = `${fromNomeAmigavel} <${fromEmailLimpo}>`;

    const assuntoLead = opts.assunto || '(sem assunto)';
    // Mantém o "Re:" se já vier do lead, senão prefixa "[Lead respondeu]"
    const subjectForward = /^re\s*:/i.test(assuntoLead)
      ? `[Lead respondeu] ${assuntoLead}`
      : `[Lead respondeu] ${assuntoLead}`;

    // Deep link para a ficha do lead no CRM (Production)
    const linkDeepFichaLead = `https://techfortirms.online/?view=crm_base_leads&lead_id=${opts.leadId}`;

    // Sanitiza dados externos no cabeçalho (anti-XSS)
    const safeLeadNome = escapeHtml(opts.leadNome) || '(sem nome)';
    const safeLeadEmail = escapeHtml(opts.leadEmail);
    const safeCampanhaNome = escapeHtml(opts.campanhaNome);
    const safeAssunto = escapeHtml(assuntoLead);
    const safeGestorNome = escapeHtml(usr.nome_usuario);

    // 3) Corpo do e-mail — HTML rico
    //    Cabeçalho de contexto + HTML original do lead + rodapé técnico.
    //    O corpoHtml vem do payload do Resend Inbound (já processado por eles);
    //    é seguro encaminhar intacto. Fallback para corpoTexto envolvido em
    //    <pre> quando o lead respondeu em texto puro.
    const corpoOriginalRender = opts.corpoHtml
      ? opts.corpoHtml
      : `<pre style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5;white-space:pre-wrap;margin:0">${escapeHtml(opts.corpoTexto || '(sem corpo)')}</pre>`;

    const htmlForward = `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5;max-width:680px">
  <!-- Cabeçalho de contexto RMS-RAISA -->
  <div style="background:#f7f7f7;padding:14px 18px;border-left:4px solid #A33022;margin-bottom:24px;font-size:13px;border-radius:0 4px 4px 0">
    <p style="margin:0 0 8px 0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.5px"><strong style="color:#A33022">Resposta recebida</strong> — RMS-RAISA Sequenciador</p>
    <p style="margin:0 0 4px 0"><strong>De:</strong> ${safeLeadNome} &lt;${safeLeadEmail}&gt;</p>
    <p style="margin:0 0 4px 0"><strong>Campanha:</strong> ${safeCampanhaNome}</p>
    <p style="margin:0 0 10px 0"><strong>Assunto original:</strong> ${safeAssunto}</p>
    <p style="margin:0"><a href="${linkDeepFichaLead}" style="display:inline-block;padding:6px 14px;background:#A33022;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;font-size:12px">Abrir ficha do lead no CRM</a></p>
  </div>

  <!-- E-mail original do lead (preservado) -->
  <div style="border:1px solid #e5e7eb;border-radius:4px;padding:18px;background:#fff">
    ${corpoOriginalRender}
  </div>

  <!-- Rodapé técnico -->
  <hr style="margin:24px 0 14px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="font-size:11px;color:#999;line-height:1.6;margin:0">
    Olá ${safeGestorNome}, você está recebendo este encaminhamento porque é o responsável pela campanha acima.<br>
    Para responder ao lead, clique em <strong>"Responder"</strong> no seu cliente de e-mail — sua resposta irá direto para <strong>${safeLeadEmail}</strong> a partir da sua caixa institucional.<br>
    Próximos passos (continuar sequência ou pausar campanha) devem ser feitos pela ficha do lead no CRM.
  </p>
</div>`.trim();

    const textForward = `RESPOSTA RECEBIDA — RMS-RAISA Sequenciador
═══════════════════════════════════════════════════════

De:                ${opts.leadNome || '(sem nome)'} <${opts.leadEmail}>
Campanha:          ${opts.campanhaNome}
Assunto original:  ${assuntoLead}

Abrir ficha no CRM: ${linkDeepFichaLead}

───────────────────────────────────────────────────────
RESPOSTA DO LEAD:
───────────────────────────────────────────────────────

${opts.corpoTexto || '(sem corpo de texto)'}

───────────────────────────────────────────────────────
Olá ${usr.nome_usuario || ''}, você está recebendo este encaminhamento
porque é o responsável pela campanha. Para responder ao lead, basta
usar "Responder" no seu cliente de e-mail — sua mensagem irá direto
para ${opts.leadEmail} a partir da sua caixa institucional.`;

    // 4) Disparo via Resend — chamada `fetch` direta à API REST.
    //
    // 🆕 v1.3 (04/06/2026 — Plano B) — SDK Resend ELIMINADO daqui também.
    // Razão: o SDK descarta `replyTo` silenciosamente (validado em 4 versões
    // de `disparar-fila.ts`). Sem o `Reply-To` correto no encaminhamento,
    // quando o gestor clicar "Responder" no Outlook/Gmail, o envio iria para
    // o `From` (`notificacoes@techfortirms.online`) em vez de ir direto para
    // o lead (`opts.leadEmail`), quebrando o fluxo proposto.
    // Solução: chamada direta à REST API com `reply_to` em snake_case.
    console.log(
      `[crm-webhook] 📤 forward fila_lead=${opts.leadId} to="${usr.email_usuario}" reply_to="${opts.leadEmail}"`
    );

    const respFetch = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromFormatado,
        to: [usr.email_usuario],
        reply_to: opts.leadEmail,  // 🔑 Gestor clica "Responder" → vai DIRETO ao lead
        subject: subjectForward,
        html: htmlForward,
        text: textForward,
        headers: {
          'X-Entity-Ref-ID': `rms-forward-lead-${opts.leadId}`,
        },
      }),
    });

    const respBody: any = await respFetch.json().catch(() => ({}));

    if (!respFetch.ok) {
      console.warn(
        `[crm-webhook] ⚠️ Forward falhou [${respFetch.status}] ${respBody?.name || ''}: ${respBody?.message || JSON.stringify(respBody).substring(0, 200)}`
      );
    } else {
      console.log(`[crm-webhook] 📨 Resposta encaminhada para ${usr.email_usuario} (resend_id=${respBody?.id})`);
    }
  } catch (e: any) {
    console.warn('[crm-webhook] ⚠️ Erro ao encaminhar resposta ao gestor:', e?.message);
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
    //   v1.4: adicionados entregue_em/aberto_em/clicado_em para suportar o
    //   gate de idempotência ao incrementar contadores em email_leads
    //   (só incrementa na PRIMEIRA ocorrência do tipo para aquela fila).
    const { data: fila, error: errFila } = await supabase
      .from('email_fila')
      .select('id, campanha_id, lead_id, step_id, destinatario_email, destinatario_nome, status, entregue_em, aberto_em, clicado_em')
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

    // 🆕 v1.4 — Incrementar contadores agregados em email_leads.
    //   Gate de idempotência: só incrementa na PRIMEIRA ocorrência do tipo
    //   para esta fila (campos *_em ainda NULL no estado lido ANTES do UPDATE).
    //   Evita inflar quando o Resend reenvia o mesmo evento (retry).
    //   Falha na RPC só loga warning; não impacta o fluxo do webhook.
    if (fila.lead_id) {
      let campoIncrementar: string | null = null;
      if (tipoInterno === 'delivered' && !fila.entregue_em) {
        campoIncrementar = 'total_emails_recebidos';
      } else if (tipoInterno === 'opened' && !fila.aberto_em) {
        campoIncrementar = 'total_emails_abertos';
      } else if (tipoInterno === 'clicked' && !fila.clicado_em) {
        campoIncrementar = 'total_emails_clicados';
      }

      if (campoIncrementar) {
        const { error: errInc } = await supabase.rpc('incrementar_contador_lead', {
          p_lead_id: fila.lead_id,
          p_campo: campoIncrementar,
          p_delta: 1,
        });
        if (errInc) {
          console.warn(
            `[crm-webhook] ⚠️ Falha ao incrementar ${campoIncrementar} no lead ${fila.lead_id}:`,
            errInc.message,
          );
        } else {
          console.log(
            `[crm-webhook] 📊 lead=${fila.lead_id} ${campoIncrementar} +1 (evento ${tipoInterno})`,
          );
        }
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

  // 🆕 v1.5 — Log verboso para diagnóstico do bug "(sem corpo)" no forward.
  //   Mostra exatamente quais campos chegaram no payload do email.received,
  //   incluindo tamanho do text/html e a lista das primeiras chaves do
  //   data — essencial porque o webhook do Resend pode usar nomes
  //   diferentes do objeto retornado pela UI Activity.
  try {
    const chavesData = dataEvento && typeof dataEvento === 'object'
      ? Object.keys(dataEvento).slice(0, 30)
      : [];
    console.log('[crm-webhook] 📩 email.received — campos recebidos:', {
      to: dataEvento?.to,
      from: typeof dataEvento?.from === 'string'
        ? dataEvento.from.substring(0, 80)
        : dataEvento?.from,
      subject: dataEvento?.subject,
      tem_text: !!dataEvento?.text,
      tam_text: typeof dataEvento?.text === 'string' ? dataEvento.text.length : null,
      tem_html: !!dataEvento?.html,
      tam_html: typeof dataEvento?.html === 'string' ? dataEvento.html.length : null,
      id_resend: dataEvento?.id || dataEvento?.email_id,
      chaves_data: chavesData,
    });
  } catch (e) {
    console.warn('[crm-webhook] ⚠️ Falha ao logar diag email.received:', (e as any)?.message);
  }

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

  // 🆕 v1.4 — Incrementar total_respostas no lead.
  //   Diferente dos contadores outbound (delivered/opened/clicked), aqui NÃO
  //   há gate de idempotência: cada email.received que passa pelo parser
  //   corresponde a uma resposta legítima recém-inserida em email_respostas,
  //   e o lead pode responder ao mesmo email N vezes — cada uma é uma resposta.
  //   Falha na RPC só loga warning; resposta já está gravada.
  if (fila.lead_id) {
    const { error: errIncResp } = await supabase.rpc('incrementar_contador_lead', {
      p_lead_id: fila.lead_id,
      p_campo: 'total_respostas',
      p_delta: 1,
    });
    if (errIncResp) {
      console.warn(
        `[crm-webhook] ⚠️ Falha ao incrementar total_respostas no lead ${fila.lead_id}:`,
        errIncResp.message,
      );
    } else {
      console.log(`[crm-webhook] 📊 lead=${fila.lead_id} total_respostas +1`);
    }
  }

  // 9. Recalcular contadores (atualiza total_respondidos e taxa_resposta)
  if (fila.campanha_id) {
    const { error: errRpc } = await supabase.rpc('recalcular_contadores_campanha', {
      p_campanha_id: fila.campanha_id,
    });
    if (errRpc) {
      console.warn('[crm-webhook] ⚠️ Falha ao recalcular contadores:', errRpc.message);
    }
  }

  // 🆕 v1.5 — Sempre gravar em email_eventos (log imutável do payload).
  //   Antes da v1.5, eventos received OK não eram gravados em email_eventos,
  //   só os órfãos. Isso impedia auditoria do payload no caminho feliz.
  //   Agora cada received gera 1 linha em email_eventos com o payload bruto
  //   completo em `dados`, permitindo diagnóstico SQL post-mortem.
  //   Falha aqui só loga warning; não desfaz email_respostas já inserido.
  const { error: errEvento } = await supabase.from('email_eventos').insert({
    fila_id: fila.id,
    lead_id: fila.lead_id,
    resend_message_id: dataEvento?.id || dataEvento?.email_id || null,
    tipo_evento: 'received',
    dados: payload,
    criado_em: createdAtResend || new Date().toISOString(),
  });
  if (errEvento) {
    console.warn(
      '[crm-webhook] ⚠️ Falha ao gravar email_eventos (received):',
      errEvento.message,
    );
  }

  // 10. Encaminhar a resposta COMPLETA do lead ao gestor (não-bloqueante).
  //     🆕 v1.2 — substituiu o antigo "alerta curto" via /api/send-email.
  //     Agora vai HTML completo + Reply-To = lead, então o gestor responde
  //     direto do cliente de e-mail dele (Gmail/Outlook). Requer RESEND_API_KEY
  //     no ambiente; se ausente, loga e segue (não quebra o webhook).
  //     🆕 v1.3 (Plano B) — passa apenas a chave; a função chama API REST do
  //     Resend via fetch direto (SDK eliminado).
  if (campanha?.responsavel_id) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn('[crm-webhook] ⚠️ RESEND_API_KEY ausente — encaminhamento ao gestor pulado');
    } else {
      await encaminharRespostaAoGestor({
        supabase,
        resendApiKey,
        responsavelId: campanha.responsavel_id,
        leadId: fila.lead_id,
        leadEmail: lead?.email || deEmail,
        leadNome: lead?.nome || deNome,
        campanhaNome: campanha.nome || `Campanha #${campanha.id}`,
        assunto,
        corpoTexto,
        corpoHtml, // 🆕 v1.2 — HTML completo preservado
      });
    }
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
