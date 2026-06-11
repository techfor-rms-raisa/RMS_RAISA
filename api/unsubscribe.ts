/**
 * api/unsubscribe.ts — Endpoint público de descadastramento
 *
 * Caminho: api/unsubscribe.ts
 * Versão: 1.0.1 (HOTFIX ESM — 11/06/2026)
 *
 * v1.0.1 (11/06/2026 — HOTFIX ESM): adicionada extensão `.js` nos imports
 *   `'./_helpers/unsubscribe-token'` e `'./_helpers/aplicar-opt-out'`.
 *   Node.js em ESM strict mode (runtime Vercel) exige extensão explícita.
 *
 * v1.0 (Bloco 2 do plano OPT-OUT 100% — 11/06/2026)
 *
 * URL pública (Production):  https://unsubscribe.techfortirms.online/api/unsubscribe
 * URL pública (Preview):     https://<deploy-preview-url>.vercel.app/api/unsubscribe
 *
 * ════════════════════════════════════════════════════════════════════════
 * PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════
 * Atende DOIS caminhos automáticos de opt-out do plano OPT-OUT 100%:
 *
 *   CAMINHO #2 — POST RFC 8058 (one-click unsubscribe)
 *     • Gmail/Outlook detectam o header `List-Unsubscribe-Post: One-Click`
 *       no e-mail (injetado pelo disparar-fila.ts v1.11) e mostram um
 *       botão "Unsubscribe" na barra superior do cliente de e-mail.
 *     • Ao clicar, o cliente faz POST direto na URL do `List-Unsubscribe`
 *       SEM intervenção do usuário (1-clique). Pela especificação, esse
 *       POST deve retornar 200 OK ou 202 Accepted com body vazio.
 *     • Cliente NÃO segue redirects nem mostra UI ao usuário — apenas
 *       confirma sucesso visualmente.
 *
 *   CAMINHO #3 — GET link clicável do rodapé HTML
 *     • Destinatário clica na palavra "SAIR" no rodapé do email (alteração
 *       em disparar-fila.ts v1.11 — antes era texto plano "responda este
 *       e-mail solicitando o descadastramento").
 *     • Browser abre a URL com método GET → retornamos página HTML
 *       confirmando o opt-out (página branded TechForTI).
 *
 * Em ambos os caminhos, a cascata de opt-out é a MESMA do caminho #1
 * (botão UI manual) e do caminho #4 (webhook complained): delegada ao
 * helper `aplicarOptOut` (Bloco 1) com `origem` distinta. A consistência
 * de auditoria LGPD é garantida pelo helper.
 *
 * ════════════════════════════════════════════════════════════════════════
 * FLUXO RESUMIDO
 * ════════════════════════════════════════════════════════════════════════
 *
 *   Request → Validação do token HMAC (unsubscribe-token.ts)
 *           → Extrai {lead_id, email} do payload
 *           → Determina origem por método (POST=list_unsubscribe, GET=link_rodape)
 *           → Chama aplicarOptOut com origem correta
 *           → POST: retorna 200 OK com body vazio (RFC 8058)
 *             GET:  retorna HTML página de sucesso
 *
 *   Em caso de erro de token:
 *           → POST: retorna 400 (cliente ignora silenciosamente)
 *             GET:  retorna HTML página "link inválido" com instrução
 *                   de contatar o DPO
 *
 * ════════════════════════════════════════════════════════════════════════
 * SEGURANÇA
 * ════════════════════════════════════════════════════════════════════════
 *   • Token HMAC-SHA256 com segredo dedicado por ambiente. Sem token
 *     válido, NÃO há side-effect.
 *   • CORS aberto (Access-Control-Allow-Origin: *) — necessário porque
 *     os clientes de e-mail (Gmail, Outlook) fazem POST de origens
 *     diversas (incluindo origens internas do Google).
 *   • IP/UA do request são registrados no histórico do lead para
 *     auditoria LGPD (campo email_lead_historico.descricao). UA truncado
 *     a 80 chars para não inflar.
 *   • Endpoint NÃO retorna 30x redirect — RFC 8058 não obriga clientes
 *     a seguir redirects em POST one-click.
 *
 * ════════════════════════════════════════════════════════════════════════
 * IDEMPOTÊNCIA
 * ════════════════════════════════════════════════════════════════════════
 * O helper aplicarOptOut é idempotente. Se o destinatário clicar várias
 * vezes no link (humano impaciente) ou se o cliente de e-mail enviar
 * múltiplos POSTs (retry no Gmail/Outlook), apenas o primeiro tem efeito
 * real; os subsequentes retornam sem repetir a cascata.
 *
 * No GET, a página de sucesso indica "Você já estava em opt-out" quando
 * a chamada veio com `ja_estava_optout=true` — UX honesta para o
 * destinatário que clica em link antigo.
 *
 * ════════════════════════════════════════════════════════════════════════
 * AUSÊNCIA DE EXPIRAÇÃO DE TOKEN (intencional)
 * ════════════════════════════════════════════════════════════════════════
 * Conforme decidido no helper unsubscribe-token.ts, tokens NÃO expiram.
 * Justificativa: LGPD garante direito de opt-out a qualquer momento;
 * emails antigos devem permanecer funcionais para o destinatário.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// 🔧 v1.0.1 — Extensão .js obrigatória nos paths (Node.js ESM strict — Vercel runtime)
import { validarTokenUnsubscribe } from './_helpers/unsubscribe-token.js';
import { aplicarOptOut, type OrigemOptOut } from './_helpers/aplicar-opt-out.js';

export const config = { maxDuration: 15 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Cor corporativa TechForTI (consistência visual com o rodapé do email)
const COR_NOME = '#A33022';

// ════════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — necessário para POSTs vindo de clientes de email diversos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return responder(res, req.method || 'GET', 405, 'Método não permitido');
  }

  // Token vem em ?token=... — vale para GET e POST one-click (RFC 8058
  // permite o token ficar na URL OU no body; padronizamos por URL)
  const token = String(req.query.token || '').trim();
  if (!token) {
    return responder(res, req.method, 400, 'token_ausente');
  }

  // ── Validação HMAC ─────────────────────────────────────────────────
  const validacao = validarTokenUnsubscribe(token);
  if (!validacao.valid) {
    console.warn(
      `[unsubscribe] Token inválido (${req.method}):`,
      validacao.error,
    );
    return responder(res, req.method, 400, 'token_invalido');
  }

  const { lead_id, email } = validacao.payload;

  // ── Captura IP/UA para auditoria LGPD ──────────────────────────────
  const ip = extrairIp(req);
  const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 80);

  // ── Determina a origem pelo método HTTP ────────────────────────────
  // GET  = clique manual no link "SAIR" do rodapé HTML  → link_rodape
  // POST = one-click do Gmail/Outlook via List-Unsubscribe → list_unsubscribe
  const origem: OrigemOptOut =
    req.method === 'POST' ? 'list_unsubscribe' : 'link_rodape';

  const motivoAudit = `Auto-${origem} (ip=${ip}, ua="${ua}")`;

  // ── Dispara cascata via helper compartilhado ───────────────────────
  try {
    const resultado = await aplicarOptOut({
      supabase,
      lead_id,
      email,
      origem,
      motivo: motivoAudit,
      criado_por: `auto:${origem}`,
      campanha_origem_id: null, // não temos a campanha aqui (poderia vir
                                 // do token se quiséssemos, mas optamos por
                                 // simplificar — auditoria global por origem
                                 // já é suficiente)
    });

    if (!resultado.ok) {
      console.error(
        '[unsubscribe] Falha aplicarOptOut:',
        resultado.error,
      );
      return responder(res, req.method, 500, 'erro_interno');
    }

    console.log(
      `[unsubscribe] ✅ ${origem} para ${resultado.email} ` +
        `(lead=${resultado.lead_id}, ` +
        `cancelados=${resultado.total_cancelados}, ` +
        `ja_era=${resultado.ja_estava_optout})`,
    );

    return responder(res, req.method, 200, 'success', {
      email: resultado.email,
      ja_estava_optout: resultado.ja_estava_optout,
      total_cancelados: resultado.total_cancelados,
    });
  } catch (err: any) {
    console.error('[unsubscribe] ❌ Exceção inesperada:', err?.message);
    return responder(res, req.method, 500, 'erro_interno');
  }
}

// ════════════════════════════════════════════════════════════════════════
// HELPER: extração de IP confiável (com proxy / load balancer)
// ════════════════════════════════════════════════════════════════════════

function extrairIp(req: VercelRequest): string {
  // x-forwarded-for pode ser lista "client, proxy1, proxy2" — pegamos o
  // primeiro (cliente real). x-real-ip é fallback do nginx/Vercel.
  const xff = String(req.headers['x-forwarded-for'] || '').trim();
  if (xff) {
    return xff.split(',')[0].trim() || 'unknown';
  }
  const xri = String(req.headers['x-real-ip'] || '').trim();
  if (xri) return xri;
  return 'unknown';
}

// ════════════════════════════════════════════════════════════════════════
// RESPONDER: roteamento de resposta por método HTTP
// ════════════════════════════════════════════════════════════════════════

function responder(
  res: VercelResponse,
  method: string,
  status: number,
  code: string,
  data?: { email?: string; ja_estava_optout?: boolean; total_cancelados?: number },
) {
  if (method === 'POST') {
    // RFC 8058: body vazio. Cliente (Gmail/Outlook) ignora qualquer corpo
    // e só observa o status code. Retornamos 200 mesmo em caso de "já em
    // opt-out" para o cliente mostrar "OK" ao usuário (UX consistente).
    if (status === 200) return res.status(200).end();
    return res.status(status).end();
  }

  // GET — retornamos HTML branded
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (status === 200 && code === 'success') {
    return res
      .status(200)
      .send(
        paginaSucesso(
          data?.email || '',
          !!data?.ja_estava_optout,
          data?.total_cancelados || 0,
        ),
      );
  }

  // Erro (token ausente, inválido, falha interna)
  const msgUsuario =
    code === 'token_ausente' || code === 'token_invalido'
      ? 'Este link de descadastramento não é válido ou expirou.'
      : 'Ocorreu um problema ao processar sua solicitação.';

  return res.status(status).send(paginaErro(msgUsuario));
}

// ════════════════════════════════════════════════════════════════════════
// PÁGINAS HTML (estilo inline para isolamento de CSS externo)
// ════════════════════════════════════════════════════════════════════════

function paginaSucesso(
  email: string,
  jaEra: boolean,
  totalCancelados: number,
): string {
  const titulo = jaEra
    ? 'Você já estava descadastrado'
    : 'Descadastramento confirmado';

  const detalhe = jaEra
    ? 'Este e-mail já constava na nossa lista de opt-out anteriormente. Não é necessária nenhuma ação adicional.'
    : `O e-mail ${escapeHtml(email)} foi removido das nossas listas de campanhas. Você não receberá mais e-mails de prospecção da TechForTI.${
        totalCancelados > 0
          ? ` ${totalCancelados} envio(s) pendente(s) foram cancelados.`
          : ''
      }`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${titulo} — TechForTI</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;max-width:520px;width:100%;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.08);padding:40px 32px;text-align:center}
    .logo{font-weight:700;font-size:14px;color:${COR_NOME};letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
    .icon{width:64px;height:64px;border-radius:50%;background:#e8f5e9;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
    .icon svg{width:32px;height:32px;color:#2e7d32}
    h1{margin:0 0 12px 0;font-size:22px;color:#1d1d1f;font-weight:600}
    p{margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#4a4a4a}
    .footer{margin-top:32px;padding-top:24px;border-top:1px solid #e0e0e0;font-size:12px;color:#999;line-height:1.5}
    .footer a{color:${COR_NOME};text-decoration:none}
    .footer a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">TechForTI</div>
    <div class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>${titulo}</h1>
    <p>${detalhe}</p>
    <div class="footer">
      <p style="margin:0 0 8px 0">Em conformidade com a Lei Geral de Proteção de Dados (LGPD).</p>
      <p style="margin:0">Dúvidas? Contate nosso DPO em <a href="mailto:dpo@techforti.com.br">dpo@techforti.com.br</a></p>
    </div>
  </div>
</body>
</html>`;
}

function paginaErro(msg: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Link inválido — TechForTI</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;max-width:520px;width:100%;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.08);padding:40px 32px;text-align:center}
    .logo{font-weight:700;font-size:14px;color:${COR_NOME};letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
    .icon{width:64px;height:64px;border-radius:50%;background:#fff3e0;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
    .icon svg{width:32px;height:32px;color:#e65100}
    h1{margin:0 0 12px 0;font-size:22px;color:#1d1d1f;font-weight:600}
    p{margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#4a4a4a}
    .footer{margin-top:32px;padding-top:24px;border-top:1px solid #e0e0e0;font-size:12px;color:#999;line-height:1.5}
    .footer a{color:${COR_NOME};text-decoration:none}
    .footer a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">TechForTI</div>
    <div class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="8" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
    </div>
    <h1>Link inválido</h1>
    <p>${escapeHtml(msg)}</p>
    <p style="font-size:14px;color:#666">Se você deseja se descadastrar das nossas comunicações, por favor entre em contato com o nosso DPO.</p>
    <div class="footer">
      <p style="margin:0">Contato DPO: <a href="mailto:dpo@techforti.com.br">dpo@techforti.com.br</a></p>
    </div>
  </div>
</body>
</html>`;
}

// Escape mínimo para conteúdo dinâmico em HTML (defesa contra XSS no
// improvável caso de email com caracteres especiais — o email já vem
// normalizado pelo helper, mas guard adicional)
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
