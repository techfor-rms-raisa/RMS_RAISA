/**
 * api/cron/disparar-fila.ts — Motor de envio de e-mails (Fase 5B-cron)
 *
 * Caminho: api/cron/disparar-fila.ts
 *
 * Histórico:
 *  - v1.7 (05/06/2026 — Separação de ambientes no plus-alias Reply-To):
 *      Resolvido o problema de webhooks de Production e Preview processando
 *      eventos do ambiente errado contra bancos Supabase separados, gerando
 *      forwards bagunçados (lead 7/9 com emails inexistentes, destinatário
 *      Admin em vez do responsável da campanha).
 *      Mudança cirúrgica: prefixar o plus-alias com `prod` ou `preview` lido
 *      de `process.env.VERCEL_ENV`. Resultado:
 *        Production envia:  respostas+prod+f{id}+l{id}@techfor.com.br
 *        Preview envia:     respostas+preview+f{id}+l{id}@techfor.com.br
 *      O `api/crm-webhook.ts` v1.8 compara o prefixo com seu próprio
 *      `VERCEL_ENV` e ignora silenciosamente eventos de outro ambiente.
 *      Sem mudanças em DNS, MX, ou verificações DKIM/SPF. Permite manter
 *      webhook de Preview ativo no Resend permanentemente.
 *  - v1.6 (04/06/2026 — Plano B definitivo): SDK Resend ELIMINADO desta etapa.
 *      Após v1.3 → v1.3.1 → v1.4 → v1.5 falharem em fazer o `Reply-To`
 *      chegar no e-mail enviado (todos os Raw JSONs mostraram `reply_to: []`
 *      mesmo com o campo preenchido no payload, e o `Reply-To` em `headers`
 *      também foi filtrado pelo Resend), partimos para chamada `fetch` direta
 *      à API REST do Resend em `https://api.resend.com/emails`.
 *      Mudanças:
 *        • Removida `import { Resend } from 'resend'` e `new Resend(...)`.
 *        • Nova constante `RESEND_API_URL`.
 *        • `resend.emails.send(...)` → `fetch(RESEND_API_URL, { POST + Bearer })`
 *          com body JSON contendo `reply_to` em snake_case (formato nativo da REST).
 *        • Tratamento de erro adaptado: do objeto do SDK (`{name, statusCode, message}`)
 *          para a response HTTP + body JSON do REST. `classificarErroResend()`
 *          continua reaproveitada porque já trabalha com `statusCode`/`name`.
 *      Resultado esperado: `reply_to` populado no Raw JSON, respostas dos leads
 *      indo para o plus-alias `respostas+fX+lY@techfor.com.br`, webhook
 *      parseando corretamente e encaminhando ao gestor responsável.
 *  - v1.5 (04/06/2026 — Fase 7-MVP definitivo): Reply-To via HEADERS SMTP.
 *      Causa do incidente de 04/06/2026: confirmado pelo Raw JSON de 4
 *      envios — `"reply_to": []` mesmo com `replyTo: replyTo` no payload.
 *      O SDK do Resend Node está descartando silenciosamente AMBOS os
 *      formatos do parâmetro (`replyTo` camelCase E `reply_to` snake_case).
 *      Validamos isso em 2 hotfixes seguidos (v1.3 → v1.3.1 → v1.4) e o
 *      bug persistiu.
 *      Solução robusta: passar `Reply-To` como header SMTP padrão (RFC 5322)
 *      pelo campo `headers`, que comprovadamente funciona — o `X-Entity-Ref-ID`
 *      sempre chegou correto no JSON de retorno. Header RFC é universal e
 *      qualquer cliente de e-mail (Gmail, Outlook, etc) respeita.
 *      O parâmetro `replyTo` é mantido por defesa em profundidade — se o
 *      SDK consertar no futuro, ambos coexistem sem conflito.
 *      Adicionado console.log do payload essencial para auditoria futura.
 *  - v1.4 (03/06/2026 — Fase 7-MVP regra de negócio):
 *      Reply-To FIXO em `techfor.com.br`, ignorando `campanha.dominio_envio`.
 *      Razão: o Resend Inbound está habilitado APENAS em `techfor.com.br`
 *      (limitação de DNS do `techforti.com.br`, que tem políticas de
 *      segurança que impedem reconfiguração dos MX). Mesmo quando a
 *      campanha sai por `techforti.inf.br`, o `Reply-To` precisa
 *      apontar para `techfor.com.br` para que as respostas caiam no
 *      único Inbound configurado e disparem o webhook `email.received`.
 *      Mudança cirúrgica: 1 constante + 1 comentário (linhas ~481-482).
 *  - v1.3.1 (03/06/2026 — Fase 7-MVP hotfix): trocado `reply_to` por `replyTo`
 *      no payload do `resend.emails.send`. O SDK do Resend (versão Node atual)
 *      espera o parâmetro em camelCase; em snake_case, o campo era silenciosamente
 *      ignorado e os e-mails saíam sem Reply-To, fazendo o destinatário responder
 *      para o `From` original em vez do plus-alias `respostas+fX+lY@`.
 *      Validado no teste end-to-end de 03/06/2026: as 3 primeiras respostas
 *      chegaram no Resend Inbound endereçadas para o `From` (dsouza@techfor.com.br),
 *      não para o plus-alias esperado — confirmando o bug.
 *  - v1.3 (03/06/2026 — Fase 7-MVP): adicionado `reply_to` dinâmico em
 *      cada envio Resend, no formato `respostas+f{fila_id}+l{lead_id}@{dominio}`.
 *      Quando o lead responde ao e-mail, a resposta vai para esse endereço,
 *      o Resend Inbound recebe e dispara webhook `email.received`, que
 *      correlaciona a resposta com fila/lead pelo plus-alias.
 *      Mudança cirúrgica: 1 cálculo de string + 1 linha no payload de envio.
 *  - v1.1 (02/06/2026): normalização de quebras de linha no `corpo_html`.
 *      O CopyEditorModal usa <textarea> e permite texto puro OU HTML.
 *      Quando o usuário digita texto puro com `Enter` entre parágrafos,
 *      o conteúdo é salvo como `\n\n` no banco. Ao injetar isso em HTML
 *      do e-mail, o whitespace colapsa e o destinatário recebe tudo
 *      grudado num parágrafo só. A função `normalizarCorpoEmail` agora
 *      detecta texto puro (sem tags de bloco) e converte para `<p>...</p>`
 *      com `<br>` para quebras simples. Conteúdos que JÁ são HTML
 *      (têm `<p>`, `<div>`, `<br>`, etc) passam intactos — correção
 *      retroativa e não-destrutiva para todas as copies existentes.
 *  - v1.2 (02/06/2026): correções de ordenação e rate-limit do Resend.
 *      • Segundo critério `id ASC` no SELECT do lote: quando muitos itens
 *        têm o mesmo `agendado_para` (campanhas com delay=0 entre steps),
 *        sem desempate o PostgreSQL retornava em ordem indeterminada e
 *        o cron podia disparar Step 4 antes do Step 1 do mesmo lead.
 *      • Throttle de 220ms entre envios (RATE_LIMIT_MS). O Resend impõe
 *        rate limit de 5 req/s; lotes com delay=0 em todos os steps
 *        geravam bursts > 5/s e os envios 6+ recebiam HTTP 429 "Too many
 *        requests". Validado no teste de 02/06/2026: 2 dos 10 itens do
 *        lote (ids 18, 19) voltaram para `pendente` por esse motivo.
 *        Com o throttle, ~4.5 req/s — abaixo do teto com folga.
 *  - v1.0 (01/06/2026 — Fase 5B-cron): versão inicial do processador.
 *
 * Roda a cada 15 minutos (vercel.json) e processa um lote de até 10
 * mensagens da `email_fila` (status='pendente' AND agendado_para <= NOW).
 * Insere um heartbeat em `cron_execucoes` em TODA execução — inclusive
 * em no-op — para o card de Acompanhamento responder "está vivo?".
 *
 * Premissas aprovadas (sessão 01/06/2026):
 *   1. Frequência: a cada 15 min — futura Fase 5D vai expor isso na UI
 *      (tick base do Vercel passa para 5 min + lógica de skip em tabela
 *      cron_config). Por enquanto, fixo no vercel.json.
 *   2. Lote: 10 mensagens / execução.
 *   3. Janela: respeitar campanha.horario_inicio/fim em fuso America/Sao_Paulo.
 *   4. Token: `Authorization: Bearer ${CRON_SECRET}` — Vercel Cron envia
 *      automaticamente quando a env var CRON_SECRET existe.
 *   5. Idempotência: lock atômico via UPDATE ... WHERE status='pendente'.
 *   6. Retry: erros 5xx/429 voltam para 'pendente' até 3 tentativas; erros
 *      4xx (exceto 429) viram 'erro' direto.
 *   7. Heartbeat sempre: até quando fila vazia ou tudo fora de janela.
 *
 * Dívida técnica registrada (TODO):
 *   • renderAssinatura é COPIADA de api/crm-campanhas.ts (v1.7).
 *     Quando consolidar, mover para api/_lib/render-assinatura.ts e
 *     importar em ambos. Mudança DRY que não cabe agora (Fase 5B).
 *   • Contadores agregados na email_campanhas (total_enviados, etc.) NÃO
 *     são atualizados aqui — o dashboard pode contar direto da email_fila.
 *     Se virar gargalo, criar UPDATE bulk no final da execução.
 *   • Não registra evento `email_enviado` em email_lead_historico — fica
 *     para a Fase 5C (webhooks), que faz isso para todo o ciclo.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// 🆕 v1.6 (04/06/2026 — Plano B): SDK Resend REMOVIDO. Após v1.3.1 → v1.4 →
// v1.5 falharem (SDK descarta `replyTo`/`reply_to`/header `Reply-To` no campo
// `headers`), partimos para chamada `fetch` direta à API REST do Resend, onde
// o `reply_to` (snake_case) no body JSON é aceito nativamente — sem intermediação
// do SDK. Não há mais `import { Resend } from 'resend'` neste arquivo.

export const config = { maxDuration: 60 };

// ════════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════════

const TIPO_CRON = 'disparar_fila';
const LOTE_TAMANHO = 10;
const MAX_TENTATIVAS = 3;
const TIMEZONE_BR = 'America/Sao_Paulo';
/** Pausa entre envios consecutivos via Resend (em ms).
 *  🆕 v1.2 (02/06/2026) — o Resend impõe rate limit de 5 req/s.
 *  220ms entre envios = ~4.5 req/s, abaixo do teto com folga. Sem esse
 *  throttle, lotes com `delay=0` em todos os steps geravam bursts > 5/s
 *  e os envios 6+ voltavam para `pendente` com erro "Too many requests".
 *  Aumentar este valor se o plano do Resend mudar (ex: hobby = 5/s, pro = 10/s). */
const RATE_LIMIT_MS = 220;

/** Endpoint da API REST do Resend para envio de e-mails.
 *  🆕 v1.6 (04/06/2026 — Plano B) — usado em chamada `fetch` direta para
 *  bypassar o SDK do Resend que descarta `replyTo`/`reply_to`/header `Reply-To`
 *  silenciosamente. Body JSON aceita `reply_to` em snake_case nativamente. */
const RESEND_API_URL = 'https://api.resend.com/emails';

/** Prefixo de ambiente no plus-alias de Reply-To.
 *  🆕 v1.7 (05/06/2026 — separação Production/Preview):
 *  O Resend Inbound dispara `email.received` para TODOS os webhooks
 *  configurados no painel, independentemente do ambiente que originou o
 *  envio. Como Production e Preview têm Supabases separados, sem este
 *  prefixo o webhook de Preview processava eventos de Production contra
 *  o banco de Preview, encontrando filas/leads antigos e gerando forwards
 *  para destinatários errados.
 *
 *  Comportamento:
 *    - process.env.VERCEL_ENV === 'production' → prefixo = 'prod'
 *    - qualquer outro valor ('preview', 'development', undefined) → 'preview'
 *
 *  O `api/crm-webhook.ts` v1.8 lê este prefixo do plus-alias e compara com
 *  o próprio `VERCEL_ENV` — eventos de outro ambiente são ignorados (200 OK
 *  silencioso) sem nenhum side-effect no banco. */
const PREFIXO_AMBIENTE: 'prod' | 'preview' =
  process.env.VERCEL_ENV === 'production' ? 'prod' : 'preview';

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/** Hora atual em São Paulo no formato 'HH:MM' (zero-padded). */
function horaAtualSP(): string {
  // 'pt-BR' com locale + timeZone retorna no formato 24h com zero-padding
  return new Date().toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_BR,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Verifica se a hora atual (HH:MM) está dentro da janela [inicio, fim].
 * Comparação lexicográfica funciona porque o formato é HH:MM zero-padded.
 */
function dentroDaJanela(agora: string, inicio: string, fim: string): boolean {
  return agora >= inicio && agora <= fim;
}

/** Normaliza para HH:MM (descarta segundos se vierem da coluna TIME). */
function normalizarHora(h: string | null | undefined, fallback: string): string {
  if (!h) return fallback;
  return h.substring(0, 5);
}

/**
 * Classifica um erro retornado pelo Resend:
 *  - 'temporario' → vale retry (5xx, 429 rate limit)
 *  - 'definitivo' → não retentar (4xx exceto 429, validation_error)
 */
function classificarErroResend(err: any): 'temporario' | 'definitivo' {
  const code = err?.statusCode;
  const name = err?.name || '';
  if (code === 429) return 'temporario';
  if (typeof code === 'number' && code >= 500) return 'temporario';
  if (typeof code === 'number' && code >= 400 && code < 500) return 'definitivo';
  if (name === 'validation_error') return 'definitivo';
  // Sem código identificável: conservadoramente, temporário (vai retentar até max).
  return 'temporario';
}

/**
 * Renderiza a assinatura em HTML — padrão corporativo TechForTI.
 * ⚠️ DUPLICADO de api/crm-campanhas.ts (v1.7+). Quando consolidar, mover
 *   para api/_lib/render-assinatura.ts e importar nos dois lados.
 */
function renderAssinatura(a: any): string {
  const COR_NOME = '#A33022';
  const COR_LINK = '#1a73e8';
  const COR_TEXTO = '#333333';
  const COR_LGPD = '#666666';

  const telefones = [a.telefone_fixo, a.telefone_celular].filter(Boolean).join(' | ');
  const websitePrincipal = (a.websites || []).find(Boolean) || '';
  const politicaUrl = a.politica_privacidade_url || '';

  const linhaTel = telefones
    ? `<p style="margin:0;color:${COR_TEXTO}">Tel. ${telefones}</p>`
    : '';

  const linhaSite = websitePrincipal
    ? `<p style="margin:0"><a href="${websitePrincipal}" style="color:${COR_LINK};text-decoration:underline">${websitePrincipal}</a></p>`
    : '';

  const linkPolitica = politicaUrl
    ? `<a href="${politicaUrl}" style="color:${COR_LINK};text-decoration:underline">Política de Privacidade</a>`
    : 'Política de Privacidade';

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:${COR_TEXTO};line-height:1.5">
  <p style="margin:0;color:${COR_NOME};font-weight:bold;font-size:14px">${a.nome_completo}</p>
  ${a.cargo ? `<p style="margin:0;font-style:italic;color:#555">${a.cargo}</p>` : ''}
  <p style="margin:0"><a href="mailto:${a.email_assinatura}" style="color:${COR_LINK};text-decoration:underline">${a.email_assinatura}</a></p>
  ${linhaTel}
  ${linhaSite}
  <div style="margin-top:14px;font-size:11px;color:${COR_LGPD};line-height:1.5">
    <p style="margin:0">Estamos entrando em contato contigo para lhe apresentar uma oportunidade, que entendemos ser do seu interesse, nos termos da Lei Geral de Proteção de Dados (LGPD).</p>
    <p style="margin:0">Isso quer dizer que coletamos, tratamos e armazenamos dados pessoais com todo o cuidado e zelo. Leia atentamente a nossa ${linkPolitica} e, se tiver alguma dúvida, entre em contato com o nosso Encarregado de Dados (Data Protection Officer - DPO) no seguinte e-mail: <a href="mailto:dpo@techforti.com.br" style="color:${COR_LINK};text-decoration:underline">dpo@techforti.com.br</a>.</p>
    <p style="margin:0">Se não tiver mais interesse em receber nossas mensagens, que foi baseado no legítimo interesse da LGPD, responda este e-mail solicitando o descadastramento (opt out) SAIR.</p>
  </div>
</div>`.trim();
}

// ════════════════════════════════════════════════════════════════
// NORMALIZAÇÃO DO CORPO DO E-MAIL (v1.1 — 02/06/2026)
// ════════════════════════════════════════════════════════════════
/**
 * Garante que o `corpo_html` da copy seja HTML renderizável pelo cliente
 * de e-mail (Gmail, Outlook, etc), respeitando as quebras de linha
 * digitadas pelo usuário no editor.
 *
 * Cenário do bug que esta função resolve:
 *   • CopyEditorModal usa <textarea>. A label permite "HTML ou texto puro".
 *   • Usuário digita texto com Enter entre parágrafos → salvo como `\n\n`.
 *   • Quando o cron injeta isso no campo `html:` do Resend, o HTML
 *     colapsa whitespace e o destinatário recebe tudo grudado num
 *     parágrafo só (perde a separação visual entre parágrafos).
 *
 * Estratégia:
 *   1) Detectar se o conteúdo JÁ é HTML — procura tags de bloco/quebra
 *      comuns (<p>, <div>, <br>, <h1-6>, <ul>, <ol>, <table>).
 *   2) Se for HTML → retornar intacto (preserva intenção do autor).
 *   3) Se for texto puro → converter:
 *        - `\n\n` (ou mais) marca quebra de parágrafo → `<p>...</p>`
 *        - `\n` simples marca quebra de linha dentro do parágrafo → `<br>`
 *
 * Correção retroativa: copies já cadastradas como texto puro passam a
 * renderizar corretamente sem precisar reeditar. Nenhuma alteração no
 * banco — a transformação é feita no momento do envio.
 */
function normalizarCorpoEmail(corpo: string): string {
  if (!corpo) return '';

  // Detecta tags HTML de bloco/quebra — se presentes, o autor escreveu HTML
  // e a intenção dele deve ser preservada.
  const TEM_TAG_HTML = /<\s*(p|div|br|h[1-6]|ul|ol|li|table|tr|td|blockquote|article|section)\b/i;
  if (TEM_TAG_HTML.test(corpo)) {
    return corpo;
  }

  // Texto puro → converter em parágrafos preservando quebras simples.
  // Normaliza CRLF do Windows antes para evitar `<br>` duplicado.
  const normalizado = corpo.replace(/\r\n/g, '\n').trim();
  if (!normalizado) return '';

  return normalizado
    .split(/\n{2,}/)
    .map((paragrafo) => {
      const semQuebrasExtras = paragrafo.trim();
      if (!semQuebrasExtras) return '';
      const comBr = semQuebrasExtras.replace(/\n/g, '<br>');
      return `<p style="margin:0 0 12px 0;line-height:1.5">${comBr}</p>`;
    })
    .filter(Boolean)
    .join('');
}

// ════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const inicioExecucao = Date.now();

  // ── 1) AUTENTICAÇÃO — Bearer token ───────────────────────────────
  // Vercel Cron envia `Authorization: Bearer ${CRON_SECRET}` automaticamente
  // quando a env CRON_SECRET está definida. Sem isso, qualquer um pode
  // disparar o cron via curl.
  const tokenEsperado = process.env.CRON_SECRET;
  if (!tokenEsperado) {
    return res.status(500).json({
      success: false,
      error: 'CRON_SECRET não configurada no ambiente Vercel.',
    });
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${tokenEsperado}`) {
    return res.status(401).json({ success: false, error: 'Não autorizado' });
  }

  // ── 2) CLIENTS ───────────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    // Heartbeat de falha mesmo sem Resend para auditoria
    await supabase.from('cron_execucoes').insert({
      tipo: TIPO_CRON,
      status: 'falha',
      duracao_ms: Date.now() - inicioExecucao,
      mensagem: 'RESEND_API_KEY ausente — execução abortada',
    });
    return res.status(500).json({
      success: false,
      error: 'RESEND_API_KEY não configurada no ambiente Vercel.',
    });
  }
  // 🆕 v1.6 — SDK removido. As chamadas usam `fetch` direto em RESEND_API_URL,
  // autenticadas com a chave abaixo via header `Authorization: Bearer ...`.

  // Estado da execução
  let enviadosCount = 0;
  let errosCount = 0;
  let skipJanelaCount = 0;
  let skipPausadaCount = 0;
  const detalhes: any = {
    lote_solicitado: LOTE_TAMANHO,
    iniciado_em: new Date().toISOString(),
    hora_sp: horaAtualSP(),
    itens: [] as any[],
  };

  try {
    // ── 3) SELECIONAR LOTE — passo 1: pegar IDs ─────────────────────
    // 🆕 v1.2: segundo critério `id ASC`. Quando muitos itens têm o
    // mesmo `agendado_para` (típico em campanhas com delay=0 em vários
    // steps), sem desempate o PostgreSQL retorna em ordem indeterminada
    // e o cron pode disparar Step 4 antes do Step 1 do mesmo lead. Como
    // o enfileiramento popula a fila iterando (lead × step), `id ASC`
    // dá a sequência natural Lead1[Step1→2→3→4] → Lead2[Step1→2→3→4]...
    const agora = new Date();
    const { data: candidatos, error: errSelect } = await supabase
      .from('email_fila')
      .select('id')
      .eq('status', 'pendente')
      .lte('agendado_para', agora.toISOString())
      .order('agendado_para', { ascending: true })
      .order('id', { ascending: true })
      .limit(LOTE_TAMANHO);

    if (errSelect) {
      throw new Error(`Falha ao selecionar fila: ${errSelect.message}`);
    }

    if (!candidatos || candidatos.length === 0) {
      // Fila vazia — heartbeat e sair
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'sucesso',
        enviados: 0,
        erros: 0,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: 'Fila vazia (nada pendente para agora)',
        detalhes,
      });
      return res.status(200).json({
        success: true,
        processados: 0,
        mensagem: 'Fila vazia',
      });
    }

    const ids = candidatos.map((c: any) => c.id);

    // ── 3b) LOCK ATÔMICO — UPDATE com guarda de status ──────────────
    // Se outra execução simultânea já pegou esses IDs (race condition),
    // o `.eq('status', 'pendente')` evita dupla seleção.
    const { data: lote, error: errLock } = await supabase
      .from('email_fila')
      .update({ status: 'enviando' })
      .in('id', ids)
      .eq('status', 'pendente')
      .select(`
        id, campanha_id, step_id, lead_id,
        destinatario_email, destinatario_nome,
        dominio_usado, tentativas
      `);

    if (errLock) {
      throw new Error(`Falha ao bloquear lote: ${errLock.message}`);
    }
    if (!lote || lote.length === 0) {
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'sucesso',
        enviados: 0,
        erros: 0,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: 'Lote já processado por outra execução (race condition coberta)',
        detalhes,
      });
      return res.status(200).json({ success: true, processados: 0 });
    }

    detalhes.lote_bloqueado = lote.length;

    // ── 4) CARREGAR dados ricos (campanhas, steps, assinaturas) ─────
    const campanhaIds = Array.from(new Set(lote.map((l: any) => l.campanha_id)));
    const stepIds = Array.from(new Set(lote.map((l: any) => l.step_id)));

    const { data: campanhas } = await supabase
      .from('email_campanhas')
      .select('id, nome, email_remetente, nome_remetente, dominio_envio, horario_inicio, horario_fim, unidade, assinatura_id, status')
      .in('id', campanhaIds);
    const mapaCampanhas = new Map<number, any>();
    (campanhas || []).forEach((c: any) => mapaCampanhas.set(c.id, c));

    const { data: steps } = await supabase
      .from('email_campanha_steps')
      .select('id, assunto, corpo_html, corpo_texto')
      .in('id', stepIds);
    const mapaSteps = new Map<number, any>();
    (steps || []).forEach((s: any) => mapaSteps.set(s.id, s));

    const assinaturaIds = Array.from(new Set(
      (campanhas || [])
        .map((c: any) => c.assinatura_id)
        .filter((id: any): id is number => typeof id === 'number')
    ));
    const mapaAssinaturas = new Map<number, any>();
    if (assinaturaIds.length > 0) {
      const { data: assinaturas } = await supabase
        .from('email_assinaturas')
        .select('*')
        .in('id', assinaturaIds);
      (assinaturas || []).forEach((a: any) => mapaAssinaturas.set(a.id, a));
    }

    const horaSP = horaAtualSP();

    // 🆕 v1.2: flag para aplicar throttle ENTRE envios (não antes do primeiro).
    // Marca true após o try/catch do `resend.emails.send`, independente do
    // resultado (sucesso/erro/temporário). Resend conta tentativas mesmo em
    // falha; respeitar 5 req/s sempre é mais seguro.
    let jaEnviouAlgum = false;

    // ── 5) PROCESSAR cada linha do lote ─────────────────────────────
    for (const item of lote as any[]) {
      const campanha = mapaCampanhas.get(item.campanha_id);
      const step = mapaSteps.get(item.step_id);
      const assinatura = campanha?.assinatura_id
        ? mapaAssinaturas.get(campanha.assinatura_id)
        : null;

      // 5a) Validações estruturais — se step/campanha sumiu, marca erro
      if (!campanha || !step) {
        const motivo = !campanha ? 'Campanha não encontrada' : 'Step não encontrado';
        await supabase.from('email_fila')
          .update({ status: 'erro', erro_detalhes: motivo })
          .eq('id', item.id);
        errosCount++;
        detalhes.itens.push({ id: item.id, resultado: 'erro_estrutura', motivo });
        continue;
      }

      // 5b) Janela horária da campanha (fuso SP)
      const horaInicio = normalizarHora(campanha.horario_inicio, '08:00');
      const horaFim    = normalizarHora(campanha.horario_fim,    '18:00');
      if (!dentroDaJanela(horaSP, horaInicio, horaFim)) {
        // Volta para 'pendente' para o próximo ciclo dentro da janela
        await supabase.from('email_fila')
          .update({ status: 'pendente' })
          .eq('id', item.id);
        skipJanelaCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'skip_janela',
          janela: `${horaInicio}-${horaFim}`,
        });
        continue;
      }

      // 5c) Campanha ativa? (extra safety — se pausada/concluída, não envia)
      if (campanha.status !== 'ativa') {
        await supabase.from('email_fila')
          .update({ status: 'pendente' })
          .eq('id', item.id);
        skipPausadaCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'skip_campanha_nao_ativa',
          status_campanha: campanha.status,
        });
        continue;
      }

      // 5d) Renderizar e-mail
      // v1.1: corpo_html pode ter sido salvo como texto puro pelo editor
      // (textarea aceita "HTML ou texto puro"). Normalizamos antes para
      // garantir que parágrafos digitados com Enter virem <p>...</p>.
      const primeiroNome = (item.destinatario_nome || '').split(' ')[0] || 'time';
      const corpoNormalizado = normalizarCorpoEmail(step.corpo_html || '');
      const corpoMerged = corpoNormalizado.replace(/\{\{name\}\}/gi, primeiroNome);
      const assinaturaHtml = assinatura ? renderAssinatura(assinatura) : '';
      const htmlFinal = `${corpoMerged}\n\n${assinaturaHtml}`;
      const textoFinal: string | undefined = step.corpo_texto
        ? step.corpo_texto.replace(/\{\{name\}\}/gi, primeiroNome)
        : undefined;

      const from = `${campanha.nome_remetente || 'TechFor TI'} <${campanha.email_remetente}>`;

      // 🆕 v1.3 — Reply-To dinâmico com plus-aliasing (Fase 7-MVP).
      // Quando o lead responde, a resposta vai para `respostas+f{id}+l{id}@dominio`.
      // O Resend Inbound recebe, dispara webhook `email.received`, e o
      // api/crm-webhook.ts parseia o plus-alias para correlacionar a resposta
      // com a fila (fila_id) e o lead (lead_id) originais.
      //
      // 🔒 v1.4 — Domínio FIXO em `techfor.com.br`, ignorando `campanha.dominio_envio`.
      // O Resend Inbound só está habilitado neste domínio (limitação de DNS
      // do `techforti.com.br`, mantido em outro provedor por política corporativa).
      // Centraliza toda a captura de respostas — campanhas que saem por
      // `techforti.inf.br` continuam tendo as respostas roteadas para cá.
      //
      // 🆕 v1.7 — Prefixo de ambiente (`prod` ou `preview`) entre `respostas` e
      // `+f`. Permite ao webhook de cada ambiente ignorar eventos do outro
      // (necessário porque Production e Preview têm Supabases separados e o
      // Resend dispara webhook em TODOS os endpoints configurados).
      const DOMINIO_REPLY_TO = 'techfor.com.br';
      const replyTo = `respostas+${PREFIXO_AMBIENTE}+f${item.id}+l${item.lead_id}@${DOMINIO_REPLY_TO}`;

      // 🆕 v1.2 — Throttle ENTRE envios (não antes do primeiro). Mantém o ritmo
      // abaixo do rate limit do Resend (5 req/s). Aplicado a partir do segundo
      // envio do lote, independente do resultado do anterior.
      if (jaEnviouAlgum) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }
      jaEnviouAlgum = true;

      // 5e) Enviar via Resend — chamada `fetch` direta à API REST.
      //
      // 🆕 v1.6 (04/06/2026 — Plano B): SDK Resend ELIMINADO desta etapa.
      // Cronologia do bug:
      //   • v1.3 — `reply_to` (snake_case) no payload → ignorado pelo SDK.
      //   • v1.3.1 — `replyTo` (camelCase) no payload → também ignorado.
      //   • v1.5 — `Reply-To` em `headers` → também ignorado/filtrado.
      // Em TODOS os Raw JSONs dos envios, o campo `reply_to: []` voltou vazio.
      // Como o SDK do Resend Node está descartando todas as tentativas de
      // definir o Reply-To, partimos para `fetch` direto no endpoint REST,
      // onde o body JSON com `reply_to` em snake_case é aceito nativamente
      // pelo servidor (sem intermediação do SDK).
      //
      // Auditoria: log explícito do payload essencial para diagnóstico futuro.
      console.log(
        `[disparar-fila] 📤 fila=${item.id} from="${from}" to="${item.destinatario_email}" reply_to="${replyTo}"`
      );

      try {
        const respFetch = await fetch(RESEND_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [item.destinatario_email],
            reply_to: replyTo, // 🆕 v1.6 — snake_case, formato nativo da REST API
            subject: step.assunto || '(sem assunto)',
            html: htmlFinal,
            text: textoFinal,
            headers: {
              'X-Entity-Ref-ID': `rms-fila-${item.id}`,
            },
          }),
        });

        // O endpoint REST sempre retorna JSON, sucesso ou erro
        const respBody: any = await respFetch.json().catch(() => ({}));

        if (!respFetch.ok) {
          // Erro do Resend — formato: { name, message, statusCode? }
          const classe = classificarErroResend({
            statusCode: respFetch.status,
            name: respBody?.name,
            message: respBody?.message,
          });
          const novasTentativas = (item.tentativas || 0) + 1;
          const erroMsg = `[${respFetch.status}] ${respBody?.name || 'erro'}: ${respBody?.message || JSON.stringify(respBody)}`.substring(0, 500);

          if (classe === 'definitivo' || novasTentativas >= MAX_TENTATIVAS) {
            await supabase.from('email_fila').update({
              status: 'erro',
              tentativas: novasTentativas,
              erro_detalhes: erroMsg,
            }).eq('id', item.id);
          } else {
            await supabase.from('email_fila').update({
              status: 'pendente',
              tentativas: novasTentativas,
              erro_detalhes: erroMsg,
            }).eq('id', item.id);
          }
          errosCount++;
          detalhes.itens.push({
            id: item.id,
            resultado: 'erro_resend',
            classe,
            tentativa: novasTentativas,
            msg: erroMsg.substring(0, 200),
          });
          continue;
        }

        // Sucesso — o body de retorno traz `{ id: "uuid" }`
        const resendId: string | null = respBody?.id || null;
        await supabase.from('email_fila').update({
          status: 'enviado',
          enviado_em: new Date().toISOString(),
          resend_message_id: resendId,
        }).eq('id', item.id);
        enviadosCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'enviado',
          resend_id: resendId,
        });
      } catch (sendErr: any) {
        // Exceção inesperada (rede, timeout) — trata como temporário
        const novasTentativas = (item.tentativas || 0) + 1;
        const erroMsg = (sendErr?.message || String(sendErr)).substring(0, 500);
        if (novasTentativas >= MAX_TENTATIVAS) {
          await supabase.from('email_fila').update({
            status: 'erro',
            tentativas: novasTentativas,
            erro_detalhes: erroMsg,
          }).eq('id', item.id);
        } else {
          await supabase.from('email_fila').update({
            status: 'pendente',
            tentativas: novasTentativas,
            erro_detalhes: erroMsg,
          }).eq('id', item.id);
        }
        errosCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'erro_inesperado',
          tentativa: novasTentativas,
          msg: erroMsg.substring(0, 200),
        });
      }
    }

    // ── 6) STATUS FINAL + HEARTBEAT ─────────────────────────────────
    detalhes.skip_janela = skipJanelaCount;
    detalhes.skip_pausada = skipPausadaCount;

    let statusFinal: 'sucesso' | 'parcial' | 'falha';
    if (errosCount === 0) {
      statusFinal = 'sucesso';
    } else if (enviadosCount > 0) {
      statusFinal = 'parcial';
    } else {
      statusFinal = 'falha';
    }

    const mensagemFinal =
      `${enviadosCount} enviados, ${errosCount} erros, ` +
      `${skipJanelaCount} fora de janela, ${skipPausadaCount} pausadas ` +
      `(lote ${lote.length})`;

    await supabase.from('cron_execucoes').insert({
      tipo: TIPO_CRON,
      status: statusFinal,
      enviados: enviadosCount,
      erros: errosCount,
      duracao_ms: Date.now() - inicioExecucao,
      mensagem: mensagemFinal,
      detalhes,
    });

    return res.status(200).json({
      success: true,
      processados: lote.length,
      enviados: enviadosCount,
      erros: errosCount,
      skip_janela: skipJanelaCount,
      skip_pausada: skipPausadaCount,
      duracao_ms: Date.now() - inicioExecucao,
    });

  } catch (err: any) {
    // Erro fatal não-tratado — heartbeat de falha + 500
    const errMsg = (err?.message || String(err)).substring(0, 500);
    try {
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'falha',
        enviados: enviadosCount,
        erros: errosCount,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: `Falha fatal: ${errMsg}`,
        detalhes: { ...detalhes, erro_fatal: errMsg },
      });
    } catch {
      // Se nem o heartbeat conseguiu, segue para o response — log da Vercel pega.
    }
    console.error('[cron/disparar-fila] Erro fatal:', err);
    return res.status(500).json({ success: false, error: errMsg });
  }
}
