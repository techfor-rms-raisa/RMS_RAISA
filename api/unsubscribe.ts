/**
 * api/unsubscribe.ts — Endpoint público de descadastramento
 *
 * Caminho: api/unsubscribe.ts
 * Versão: 1.1 (CORREÇÃO DE SEGURANÇA — GET deixa de ter efeito colateral)
 *
 * ════════════════════════════════════════════════════════════════════════
 * v1.1 (14/08/2026 — INCIDENTE OPT-OUT AUTOMÁTICO POR SCANNER)
 * ════════════════════════════════════════════════════════════════════════
 * PROBLEMA CORRIGIDO
 *   Até a v1.0.1, uma requisição GET nesta URL aplicava a cascata de
 *   opt-out IMEDIATAMENTE, antes de renderizar qualquer tela. Isso viola
 *   a semântica HTTP: GET é um método SEGURO (RFC 9110 §9.2.1) e não pode
 *   produzir efeito colateral destrutivo.
 *
 *   Consequência real observada em Production:
 *     • 11/08/2026 — 15 leads de vivo.com.br descadastrados, 12 deles em
 *       10 segundos, a partir de 3 IPs de datacenter.
 *     • 24/06/2026 — 7 leads de btgpactual.com, 2 no mesmo segundo.
 *     • Causa: gateways de segurança de e-mail corporativo (Microsoft
 *       Defender Safe Links, Exchange Online Protection e equivalentes)
 *       abrem TODOS os `href` da mensagem para análise antifraude. O link
 *       "SAIR" do rodapé é um deles. Cada varredura = um opt-out
 *       irreversível de um lead que nunca pediu nada.
 *
 * CORREÇÃO APLICADA
 *   GET   → NÃO aplica mais opt-out. Renderiza uma página de confirmação
 *           com um botão. Puramente informativa, sem acesso ao banco.
 *           Um scanner que abrir a URL não causa nenhum efeito.
 *   POST  → único método que aplica a cascata. Robô de varredura segue
 *           `href`; ele não submete formulário HTML.
 *
 * PRESERVAÇÃO DO RFC 8058 (crítico para deliverability)
 *   O botão "Unsubscribe" nativo do Gmail/Outlook continua funcionando
 *   exatamente como antes — ele já fazia POST. Nenhuma mudança para o
 *   destinatário nesse caminho, e nenhum risco de perder o compliance de
 *   bulk sender exigido pelo Google/Yahoo desde fev/2024.
 *
 * COMO AS DUAS ORIGENS DE POST SÃO DISTINGUIDAS
 *   O formulário da nossa página de confirmação envia o campo
 *   `confirmado=1`. O POST one-click do Gmail/Outlook não envia esse
 *   campo (envia `List-Unsubscribe=One-Click`, conforme RFC 8058).
 *     • POST com    `confirmado=1` → origem='link_rodape'
 *     • POST sem    `confirmado`   → origem='list_unsubscribe'
 *   A distinção de auditoria em email_optout.motivo fica preservada, e os
 *   dados históricos continuam comparáveis.
 *
 * POR QUE O GET NÃO CONSULTA O BANCO
 *   Decisão deliberada: a página de confirmação é estática. Os scanners
 *   batem nessa URL com altíssima frequência (140 IPs automatizados
 *   identificados na base em 14/08/2026). Fazer uma query a cada varredura
 *   seria custo puro sem benefício. O caso "já estava em opt-out" continua
 *   sendo tratado corretamente após o POST, pelo helper aplicarOptOut.
 *
 * SEM MUDANÇA EM OUTROS ARQUIVOS
 *   `api/cron/disparar-fila.ts` e `api/_helpers/*` permanecem intocados.
 *   A URL gerada é a mesma; apenas o comportamento do GET mudou.
 *
 * ════════════════════════════════════════════════════════════════════════
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
  // 🆕 v1.1 — Impede que proxies corporativos e CDNs cacheiem a página de
  //   confirmação (o token é único por destinatário; cache seria vazamento).
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return responder(res, 'html', 405, 'metodo_nao_permitido');
  }

  // 🆕 v1.1 — Formato da resposta:
  //   • GET  → sempre HTML (é um browser humano do outro lado)
  //   • POST → HTML se veio do nosso formulário (`confirmado=1`);
  //            corpo vazio se veio do one-click RFC 8058 (Gmail/Outlook,
  //            que ignora qualquer corpo e só observa o status code).
  const veioDoFormulario =
    String(req.body?.confirmado ?? req.query.confirmado ?? '') === '1';
  const formato: FormatoResposta =
    req.method === 'GET' || veioDoFormulario ? 'html' : 'vazio';

  // Token vem em ?token=... — vale para GET e POST one-click (RFC 8058
  // permite o token ficar na URL OU no body; padronizamos por URL)
  const token = String(req.query.token || '').trim();
  if (!token) {
    return responder(res, formato, 400, 'token_ausente');
  }

  // ── Validação HMAC ─────────────────────────────────────────────────
  const validacao = validarTokenUnsubscribe(token);
  if (!validacao.valid) {
    console.warn(
      `[unsubscribe] Token inválido (${req.method}):`,
      validacao.error,
    );
    return responder(res, formato, 400, 'token_invalido');
  }

  const { lead_id, email } = validacao.payload;

  // ══════════════════════════════════════════════════════════════════
  // 🆕 v1.1 — GET: MÉTODO SEGURO. NENHUM EFEITO COLATERAL.
  // ══════════════════════════════════════════════════════════════════
  // Apenas renderiza a página de confirmação. Não toca no banco, não
  // marca opt-out, não cancela fila. Um gateway de segurança varrendo
  // os links do e-mail cai exatamente aqui e não causa dano algum.
  //
  // O opt-out só acontece quando o destinatário HUMANO clica no botão
  // da página, o que gera o POST tratado logo abaixo.
  if (req.method === 'GET') {
    console.log(
      `[unsubscribe] 👁️ GET (confirmação exibida, sem efeito) ` +
        `lead=${lead_id} ip=${extrairIp(req)}`,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(paginaConfirmacao(email, token));
  }

  // ══════════════════════════════════════════════════════════════════
  // POST: ÚNICO CAMINHO QUE APLICA A CASCATA
  // ══════════════════════════════════════════════════════════════════

  // ── Captura IP/UA para auditoria LGPD ──────────────────────────────
  const ip = extrairIp(req);
  const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 80);

  // ── Determina a origem pela procedência do POST ────────────────────
  // 🔧 v1.1 — Antes a origem era decidida pelo método HTTP (GET vs POST).
  //   Agora ambos os caminhos são POST, então o discriminante passou a ser
  //   o campo `confirmado=1`, enviado apenas pelo nosso formulário.
  //
  //   COM  `confirmado=1` → botão da nossa página  → link_rodape
  //   SEM  `confirmado`   → one-click RFC 8058     → list_unsubscribe
  const origem: OrigemOptOut = veioDoFormulario
    ? 'link_rodape'
    : 'list_unsubscribe';

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
      return responder(res, formato, 500, 'erro_interno');
    }

    console.log(
      `[unsubscribe] ✅ ${origem} para ${resultado.email} ` +
        `(lead=${resultado.lead_id}, ` +
        `cancelados=${resultado.total_cancelados}, ` +
        `ja_era=${resultado.ja_estava_optout})`,
    );

    return responder(res, formato, 200, 'success', {
      email: resultado.email,
      ja_estava_optout: resultado.ja_estava_optout,
      total_cancelados: resultado.total_cancelados,
    });
  } catch (err: any) {
    console.error('[unsubscribe] ❌ Exceção inesperada:', err?.message);
    return responder(res, formato, 500, 'erro_interno');
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

// 🆕 v1.1 — O discriminante deixou de ser o método HTTP e passou a ser o
//   formato desejado, porque agora AMBOS os caminhos de opt-out são POST:
//     'html'  → browser humano (GET, ou POST vindo do nosso formulário)
//     'vazio' → cliente de e-mail no one-click RFC 8058
export type FormatoResposta = 'html' | 'vazio';

function responder(
  res: VercelResponse,
  formato: FormatoResposta,
  status: number,
  code: string,
  data?: { email?: string; ja_estava_optout?: boolean; total_cancelados?: number },
) {
  if (formato === 'vazio') {
    // RFC 8058: body vazio. Cliente (Gmail/Outlook) ignora qualquer corpo
    // e só observa o status code. Retornamos 200 mesmo em caso de "já em
    // opt-out" para o cliente mostrar "OK" ao usuário (UX consistente).
    if (status === 200) return res.status(200).end();
    return res.status(status).end();
  }

  // Browser humano — retornamos HTML branded
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

/**
 * 🆕 v1.1 — PÁGINA DE CONFIRMAÇÃO (a correção do incidente)
 *
 * Renderizada no GET. É o que um gateway de segurança enxerga ao varrer o
 * link "SAIR" — e, por não conter nenhum efeito colateral, a varredura
 * passa a ser inofensiva.
 *
 * DECISÕES DE IMPLEMENTAÇÃO:
 *   • Formulário HTML puro, SEM JavaScript. Motivos:
 *       (a) funciona em qualquer browser, inclusive os embutidos em
 *           clientes de e-mail corporativos com JS restrito;
 *       (b) robôs de varredura seguem `href`, mas não submetem `<form>`;
 *       (c) sem dependência externa = nada para quebrar.
 *   • O token viaja tanto no `action` (query) quanto num campo oculto,
 *     por redundância defensiva caso algum proxy reescreva a URL.
 *   • `confirmado=1` é o campo que distingue este POST do one-click
 *     RFC 8058 do Gmail/Outlook (ver comentário no handler).
 *   • Visual idêntico ao das páginas de sucesso/erro já existentes
 *     (mesmo card, mesma tipografia, mesma cor corporativa) — nenhuma
 *     linguagem visual nova foi introduzida.
 */
function paginaConfirmacao(email: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Confirmar descadastramento — TechForTI</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;max-width:520px;width:100%;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.08);padding:40px 32px;text-align:center}
    .logo{font-weight:700;font-size:14px;color:${COR_NOME};letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
    .icon{width:64px;height:64px;border-radius:50%;background:#fdecea;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
    .icon svg{width:32px;height:32px;color:${COR_NOME}}
    h1{margin:0 0 12px 0;font-size:22px;color:#1d1d1f;font-weight:600}
    p{margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#4a4a4a}
    .email{display:inline-block;background:#f5f5f7;border-radius:8px;padding:10px 16px;font-size:15px;color:#1d1d1f;font-weight:600;word-break:break-all;margin-bottom:8px}
    .btn{display:inline-block;width:100%;border:0;border-radius:10px;background:${COR_NOME};color:#fff;font-size:16px;font-weight:600;padding:14px 24px;cursor:pointer;font-family:inherit;margin-top:8px}
    .btn:hover{opacity:.9}
    .aviso{font-size:13px;color:#777;margin-top:16px}
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
        <path d="M4 4h16v16H4z"></path>
        <polyline points="4 7 12 13 20 7"></polyline>
      </svg>
    </div>
    <h1>Confirmar descadastramento</h1>
    <p>Você está prestes a deixar de receber nossas comunicações no endereço:</p>
    <div class="email">${escapeHtml(email)}</div>
    <form method="POST" action="/api/unsubscribe?token=${escapeHtml(token)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <input type="hidden" name="confirmado" value="1">
      <button type="submit" class="btn">Confirmar descadastramento</button>
    </form>
    <p class="aviso">Se você não solicitou isso, basta fechar esta página — nada será alterado.</p>
    <div class="footer">
      <p style="margin:0 0 8px 0">Em conformidade com a Lei Geral de Proteção de Dados (LGPD).</p>
      <p style="margin:0">Dúvidas? Contate nosso DPO em <a href="mailto:dpo@techforti.com.br">dpo@techforti.com.br</a></p>
    </div>
  </div>
</body>
</html>`;
}

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
