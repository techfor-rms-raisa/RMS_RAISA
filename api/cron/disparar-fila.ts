/**
 * api/cron/disparar-fila.ts — Motor de envio de e-mails (Fase 5B-cron)
 *
 * Caminho: api/cron/disparar-fila.ts
 *
 * Histórico:
 *  - v1.12.1 (11/06/2026 — HOTFIX ESM): adicionada extensão `.js` no import
 *    `'../_helpers/unsubscribe-token'` → `'../_helpers/unsubscribe-token.js'`.
 *    Mesmo problema de ESM strict que crm-leads e crm-webhook.
 *
 *  - v1.12 (11/06/2026 — Bloco 3 do plano OPT-OUT 100%):
 *      Adicionado suporte aos dois caminhos automáticos de opt-out:
 *
 *        CAMINHO #2 — One-click RFC 8058 (Gmail/Outlook)
 *          • Headers SMTP `List-Unsubscribe` e `List-Unsubscribe-Post: One-Click`
 *            injetados em cada envio, apontando para a URL pública
 *            https://unsubscribe.techfortirms.online/api/unsubscribe?token=XYZ
 *            (Production) ou https://<vercel-url>/api/unsubscribe?token=XYZ
 *            (Preview, via fallback automático em PUBLIC_BASE_URL).
 *          • Token único por destinatário, gerado em tempo de envio via
 *            HMAC-SHA256 (helper api/_helpers/unsubscribe-token.ts).
 *          • Gmail/Outlook detectam o header e expõem botão "Unsubscribe"
 *            na barra superior do cliente de email. Clique → POST direto
 *            na URL → cascata automática via aplicarOptOut (origem
 *            'list_unsubscribe').
 *          • Atende RFC 8058 e bulk-sending requirements de Gmail/Yahoo
 *            (obrigatório para senders >5k msg/dia desde fev/2024).
 *
 *        CAMINHO #3 — Link clicável "SAIR" no rodapé HTML
 *          • A palavra "SAIR" no rodapé LGPD da renderAssinatura agora é
 *            um link clicável apontando para a MESMA URL (mesmo token).
 *          • Antes era apenas texto plano forçando o destinatário a
 *            responder o email — fluxo que dependia de leitura manual
 *            pelo SDR (caminho #4 manual).
 *          • Clique → GET → página HTML branded de confirmação +
 *            cascata via aplicarOptOut (origem 'link_rodape').
 *
 *      Mudanças cirúrgicas:
 *        • Import de `montarUrlUnsubscribe` do helper unsubscribe-token.
 *        • `renderAssinatura` aceita novo parâmetro opcional
 *          `unsubscribeUrl?: string`. Quando presente, a palavra "SAIR"
 *          vira `<a href="...">SAIR</a>`. Quando ausente (fallback
 *          defensivo, ex.: env var faltando), mantém texto plano.
 *        • No loop de envio, antes de chamar fetch do Resend:
 *            - try/catch ao redor de `montarUrlUnsubscribe({lead_id,
 *              destinatario_email})` — se gerar erro (segredo ausente),
 *              segue sem URL (não bloqueia o envio).
 *            - Passa URL para renderAssinatura.
 *            - Adiciona headers SMTP no body do fetch.
 *
 *      Ambiente de Preview: a env var `PUBLIC_BASE_URL` NÃO é definida em
 *      Preview (decisão Messias 11/06/2026). O helper cai automaticamente
 *      no fallback `https://${VERCEL_URL}` — URLs únicas por deploy preview.
 *      Tokens emitidos em Preview usam o segredo Preview; só válidos lá.
 *
 *  - v1.11 (08/06/2026 — FASE B: auto-finalização por data_encerramento):
 *      Motivação: a coluna `email_campanhas.data_encerramento` (criada no
 *      SQL combinado 2026-06-08_crm_evolucao_C_B_D.sql) permite ao gestor
 *      planejar a data de fim da campanha. Quando essa data chega, é o
 *      cron que deve fechar a campanha automaticamente — não faz sentido
 *      depender de ação humana para encerrar algo já planejado.
 *
 *      Comportamento (decisão de produto 08/06 — Opção A):
 *        1. No início de CADA execução, ANTES de selecionar o lote da fila:
 *           buscar todas as campanhas com `status='ativa'` e
 *           `data_encerramento <= CURRENT_DATE`.
 *        2. Para cada uma:
 *           a. UPDATE email_campanhas SET status='concluida',
 *              fim_envio=NOW() — marca encerramento limpo.
 *           b. UPDATE email_fila SET status='cancelado' onde campanha_id=X
 *              AND status='pendente' — cancela TODOS os itens futuros
 *              (LGPD: e-mails agendados após o fim da campanha não devem
 *              ser disparados; relatórios ficam consistentes com o status).
 *      Performance: 1 SELECT bulk + 2 UPDATEs por campanha encerrada.
 *      Custo típico: 0 (campanhas raramente vencem) ou ínfimo. O índice
 *      parcial `idx_email_campanhas_data_encerramento_ativas` torna o
 *      SELECT trivial mesmo com milhões de campanhas inativas.
 *      Auditoria: log explícito por campanha + contadores no heartbeat
 *      (`campanhas_auto_finalizadas` e `pendentes_cancelados_por_data`).
 *
 *  - v1.10 (08/06/2026 — BUG FIX CRÍTICO: reply_to como array):
 *      Diagnóstico (08/06/2026): após entregar a Fase C, validação prática
 *      revelou que as respostas dos leads de teste não estavam disparando
 *      o pipeline esperado (forward ao gestor + cancelamento de fila).
 *      Raw JSON do Resend Sending mostrou:
 *        "reply_to": []
 *      mesmo com o cron passando `reply_to: replyTo` (string preenchida).
 *      Consulta à doc oficial do Resend
 *      (https://resend.com/docs/api-reference/emails/send-email) confirma:
 *        `reply_to | string[] | Reply-to addresses`
 *      O parâmetro DEVE ser array. Quando passado como string única, a API
 *      descarta SILENCIOSAMENTE (sem erro 4xx), envia o e-mail sem Reply-To,
 *      e a resposta do lead vai para o `from` original — quebrando todo o
 *      pipeline de captura de respostas (plus-alias `customer-service+f+l`
 *      nunca chega ao webhook, evento gravado como órfão, sem forward, sem
 *      cancelamento da Fase C).
 *      Provável regressão silenciosa do Resend entre 04/06 (quando string
 *      única funcionava — validado em CHECKPOINT_2026-06-04_FASE_7_MVP_CONCLUIDA)
 *      e 08/06 (quando deixou de funcionar).
 *      Mudança cirúrgica: 1 linha no body do fetch — `reply_to: replyTo`
 *      → `reply_to: [replyTo]`. Idempotente: a doc define array como
 *      formato canônico, então a mudança é robusta a qualquer
 *      reversão futura do comportamento do Resend.
 *
 *  - v1.9 (08/06/2026 — FASE C: defesa em profundidade contra opt-out tardio):
 *      Motivação: o opt-out (email_optout) e o cancelamento de fila (RPCs
 *      novas em crm-webhook.ts v1.10) são complementares mas o gap temporal
 *      entre eles pode permitir envios indevidos:
 *        1. Lead vinculado e enfileirado (Step 2 com agendado_para em D+3).
 *        2. Lead responde no Step 1 → webhook cancela Steps 2/3/4 via RPC.
 *        3. ⚠️ Se RPC falhar por qualquer razão (Supabase indisponível, race
 *           condition), o Step 2 permanece pendente. Mais grave: lead pode ter
 *           virado opt-out manualmente OU em outra campanha entre enfileiramento
 *           e disparo — o cron continuava despachando se a RPC anterior tivesse
 *           falhado.
 *      Correção (defesa em profundidade):
 *        1. Após carregar dados ricos, fazer 1 SELECT bulk em email_optout
 *           contendo apenas os e-mails que estão no lote (eficiente).
 *        2. No início do loop de processamento (passo 5d, antes de renderizar
 *           e enviar), verificar se item.destinatario_email está no set de
 *           opt-outs. Se estiver: marcar fila como 'cancelado' com motivo
 *           explícito (sem voltar a 'pendente') e contabilizar.
 *      Não afeta performance: 1 query a mais por execução, e só com os
 *      e-mails do lote (no máximo LOTE_TAMANHO=10 e-mails na cláusula IN).
 *      Custo zero quando lote vazio (early return acima evita o SELECT).
 *
 *  - v1.8 (05/06/2026 — Renomeação comercial do plus-alias):
 *      Trocada a palavra-base do plus-alias de `respostas` para `customer-service`
 *      por ser mais profissional para o lead que vê o Reply-To no cliente
 *      de e-mail. Adicionalmente, em Production o sufixo de ambiente foi
 *      removido (ficava feio comercialmente expor `+prod`). Resultado:
 *        Production envia:  customer-service+f{id}+l{id}@techfor.com.br
 *        Preview envia:     customer-service+test+f{id}+l{id}@techfor.com.br
 *      O `api/crm-webhook.ts` v1.9 aceita ambos formatos (novo e legacy via
 *      OR no regex), mantendo backward compat com filas em curso da v1.7
 *      (`respostas+prod+...` e `respostas+preview+...`).
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
// 🆕 v1.12 — Helper de geração de URL de unsubscribe (Bloco 3 OPT-OUT 100%).
//   Usado para: (a) montar a URL pública no header SMTP `List-Unsubscribe`
//   (RFC 8058 one-click) e (b) injetar como href na palavra "SAIR" do
//   rodapé HTML da renderAssinatura.
// 🔧 v1.12.1 — Extensão .js obrigatória no path (Node.js ESM strict — Vercel runtime)
import { montarUrlUnsubscribe } from '../_helpers/unsubscribe-token.js';
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

/** Sufixo de ambiente no plus-alias de Reply-To.
 *  🆕 v1.8 (05/06/2026 — renomeação comercial):
 *  Substituiu PREFIXO_AMBIENTE da v1.7. Mudanças semânticas:
 *    - Production agora retorna string VAZIA → plus-alias fica
 *      `customer-service+f{id}+l{id}@...` (sem expor "prod" ao lead).
 *    - Preview retorna `+test` → plus-alias fica
 *      `customer-service+test+f{id}+l{id}@...`.
 *
 *  Razão: o lead vê o Reply-To no cliente de e-mail dele. "prod" é jargão
 *  técnico que polui a percepção comercial; "test" só aparece em ambiente
 *  interno (Preview) e é aceitável para uso transitório.
 *
 *  O `api/crm-webhook.ts` v1.9 detecta o ambiente:
 *    - Sufixo `test` → ambiente `preview`
 *    - Sem sufixo → ambiente `prod` (default novo)
 *    - Sufixos `prod` / `preview` da v1.7 → ambos reconhecidos (backward compat) */
const SUFIXO_AMBIENTE: '' | '+test' =
  process.env.VERCEL_ENV === 'production' ? '' : '+test';

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
 *
 * ⚠️ DUPLICADO de api/crm-campanhas.ts (v1.7+). Quando consolidar, mover
 *   para api/_lib/render-assinatura.ts e importar nos dois lados.
 *
 * 🆕 v1.12 (11/06/2026 — Bloco 3 OPT-OUT 100%): adicionado parâmetro opcional
 *   `unsubscribeUrl`. Quando presente, a palavra "SAIR" no parágrafo LGPD do
 *   rodapé vira um link clicável (`<a href="unsubscribeUrl">SAIR</a>`),
 *   ativando o caminho #3 do plano OPT-OUT 100% (clique no rodapé).
 *
 *   Quando `unsubscribeUrl` está ausente (ex.: env var faltando, geração
 *   falhou em runtime), o texto plano antigo é preservado como FALLBACK
 *   DEFENSIVO — o envio não é bloqueado, e o caminho #4 manual (responder
 *   o email) continua sendo a alternativa para o destinatário.
 *
 *   IMPORTANTE: este parâmetro deve ser gerado por destinatário (token
 *   HMAC único — ver montarUrlUnsubscribe em api/_helpers/unsubscribe-token.ts).
 *   Não reusar a mesma URL entre destinatários distintos.
 */
function renderAssinatura(a: any, unsubscribeUrl?: string): string {
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

  // 🆕 v1.12 — Render condicional da palavra "SAIR".
  //   • Com URL: link clicável `<a href="...">SAIR</a>` (caminho #3 ativo)
  //   • Sem URL: texto plano antigo (fallback defensivo)
  const sairTermo = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:${COR_LINK};text-decoration:underline;font-weight:bold">SAIR</a>`
    : 'SAIR';

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
    <p style="margin:0">Se não tiver mais interesse em receber nossas mensagens, que foi baseado no legítimo interesse da LGPD, responda este e-mail solicitando o descadastramento (opt out) ou clique em ${sairTermo}.</p>
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
    // ── 2.5) AUTO-FINALIZAÇÃO POR DATA — 🆕 v1.11 (Fase B) ──────────
    // Antes de tentar despachar a fila, verifica se há campanhas que
    // atingiram `data_encerramento`. Para cada uma:
    //   1. Marca status='concluida' + fim_envio=NOW()
    //   2. Cancela todos os itens pendentes em email_fila (LGPD: não
    //      enviar nada após data planejada).
    // O índice parcial `idx_email_campanhas_data_encerramento_ativas`
    // garante que esse SELECT é trivial mesmo com milhões de campanhas.
    let autoFinalizadasCount = 0;
    let pendentesCanceladosPorDataCount = 0;
    try {
      const hojeDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const { data: campanhasParaEncerrar, error: errEncBusca } = await supabase
        .from('email_campanhas')
        .select('id, nome')
        .eq('status', 'ativa')
        .not('data_encerramento', 'is', null)
        .lte('data_encerramento', hojeDate);

      if (errEncBusca) {
        console.warn(
          '[disparar-fila] ⚠️ Falha ao buscar campanhas para auto-finalizar (Fase B):',
          errEncBusca.message,
        );
      } else if (campanhasParaEncerrar && campanhasParaEncerrar.length > 0) {
        console.log(
          `[disparar-fila] 📅 ${campanhasParaEncerrar.length} campanha(s) atingiram data_encerramento — encerrando…`,
        );
        const agoraISO = new Date().toISOString();
        for (const c of campanhasParaEncerrar as Array<{ id: number; nome: string }>) {
          // Passo 1: marcar campanha como concluída
          const { error: errFimCamp } = await supabase
            .from('email_campanhas')
            .update({
              status: 'concluida',
              fim_envio: agoraISO,
              atualizado_em: agoraISO,
            })
            .eq('id', c.id)
            .eq('status', 'ativa'); // guard contra race condition

          if (errFimCamp) {
            console.warn(
              `[disparar-fila] ⚠️ Falha ao concluir campanha ${c.id}:`,
              errFimCamp.message,
            );
            continue;
          }
          autoFinalizadasCount++;

          // Passo 2: cancelar pendentes daquela campanha.
          // Não usamos a RPC `cancelar_fila_pendente_lead_campanha` aqui
          // porque ela é por lead — aqui queremos cancelar em massa para
          // TODOS os leads da campanha. UPDATE direto é mais eficiente.
          const { data: cancelados, error: errCancelFila } = await supabase
            .from('email_fila')
            .update({
              status: 'cancelado',
              erro_detalhes: `Auto-cancelado: campanha encerrada por data (${hojeDate}) em ${agoraISO}`,
            })
            .eq('campanha_id', c.id)
            .eq('status', 'pendente')
            .select('id');

          if (errCancelFila) {
            console.warn(
              `[disparar-fila] ⚠️ Falha ao cancelar fila da campanha ${c.id}:`,
              errCancelFila.message,
            );
          } else {
            const qtdCancelada = cancelados?.length || 0;
            pendentesCanceladosPorDataCount += qtdCancelada;
            console.log(
              `[disparar-fila] ✅ Campanha ${c.id} ("${c.nome}") encerrada — ${qtdCancelada} pendentes cancelados.`,
            );
          }
        }
      }
    } catch (errEnc: any) {
      // Falha aqui é graceful — segue para o despacho da fila normalmente.
      console.warn(
        '[disparar-fila] ⚠️ Exceção inesperada na auto-finalização (Fase B):',
        errEnc?.message || errEnc,
      );
    }
    detalhes.campanhas_auto_finalizadas = autoFinalizadasCount;
    detalhes.pendentes_cancelados_por_data = pendentesCanceladosPorDataCount;

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
      // 🆕 v1.11 (Fase B): mensagem inclui auto-finalização se houve.
      const msgFimEnvio = autoFinalizadasCount > 0
        ? `Fila vazia + ${autoFinalizadasCount} campanha(s) auto-finalizada(s) (${pendentesCanceladosPorDataCount} pendentes cancelados)`
        : 'Fila vazia (nada pendente para agora)';
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'sucesso',
        enviados: 0,
        erros: 0,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: msgFimEnvio,
        detalhes,
      });
      return res.status(200).json({
        success: true,
        processados: 0,
        campanhas_auto_finalizadas: autoFinalizadasCount, // 🆕 v1.11 (Fase B)
        pendentes_cancelados_por_data: pendentesCanceladosPorDataCount, // 🆕 v1.11 (Fase B)
        mensagem: msgFimEnvio,
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

    // 🆕 v1.9 (Fase C) — Defesa em profundidade contra opt-out tardio.
    //   Carrega 1 vez todos os opt-outs cujos e-mails estão no lote atual
    //   (cláusula IN com até LOTE_TAMANHO=10 e-mails — eficiente). Itens
    //   da fila cujo destinatário entrou em opt-out APÓS o enfileiramento
    //   serão cancelados no passo 5d antes de qualquer envio.
    //   Cenário típico: lead respondeu em outra campanha e foi para opt-out;
    //   cancelamento via RPC nem sempre alcança todas as filas (race
    //   condition raro mas possível). Esta camada garante o piso.
    const emailsDoLote = Array.from(
      new Set(
        (lote as any[])
          .map((it) => (it.destinatario_email || '').toLowerCase().trim())
          .filter((e) => e.length > 0),
      ),
    );
    const setOptoutLote = new Set<string>();
    if (emailsDoLote.length > 0) {
      const { data: optouts, error: errOptout } = await supabase
        .from('email_optout')
        .select('email')
        .in('email', emailsDoLote);
      if (errOptout) {
        console.warn(
          '[disparar-fila] ⚠️ Falha ao carregar opt-outs do lote (segue sem filtro):',
          errOptout.message,
        );
      } else {
        (optouts || []).forEach((o: any) => {
          if (o?.email) setOptoutLote.add(o.email.toLowerCase().trim());
        });
      }
    }
    detalhes.opt_outs_no_lote = setOptoutLote.size;
    let skipOptoutCount = 0;

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

      // 🆕 v1.9 (Fase C) — 5c-bis) Opt-out tardio? (defesa em profundidade).
      //   Se o e-mail entrou em opt-out DEPOIS do enfileiramento e o webhook
      //   não conseguiu cancelar via RPC, este filtro impede o envio. Marca
      //   como 'cancelado' (estado terminal — NÃO volta para 'pendente',
      //   pois opt-out é permanente até remoção manual).
      const emailNorm = (item.destinatario_email || '').toLowerCase().trim();
      if (emailNorm && setOptoutLote.has(emailNorm)) {
        await supabase.from('email_fila')
          .update({
            status: 'cancelado',
            erro_detalhes: `Auto-cancelado: opt-out detectado pelo cron em ${new Date().toISOString()}`,
          })
          .eq('id', item.id);
        skipOptoutCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'skip_optout',
          email: emailNorm,
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

      // 🆕 v1.12 — Bloco 3 OPT-OUT 100%: gera URL única de unsubscribe
      //   por destinatário. Usada em DOIS lugares:
      //     1. Link clicável na palavra "SAIR" do rodapé HTML
      //        (renderAssinatura abaixo recebe a URL como parâmetro)
      //     2. Header SMTP `List-Unsubscribe` no fetch do Resend
      //        (linha ~895, abaixo)
      //
      //   Try/catch defensivo: se a env var UNSUBSCRIBE_TOKEN_SECRET não
      //   estiver configurada (ou PUBLIC_BASE_URL/VERCEL_URL ausentes em
      //   ambiente local), o envio NÃO é bloqueado. Continua com o
      //   comportamento legado (texto plano + caminho #4 manual via
      //   resposta de email).
      let unsubscribeUrl: string | null = null;
      try {
        if (item.lead_id && item.destinatario_email) {
          unsubscribeUrl = montarUrlUnsubscribe({
            lead_id: item.lead_id,
            email: item.destinatario_email,
          });
        }
      } catch (errUrl: any) {
        console.warn(
          `[disparar-fila] ⚠️ Falha ao gerar unsubscribe URL para fila=${item.id} ` +
            `(lead=${item.lead_id}, email=${item.destinatario_email}). ` +
            `Envio prossegue sem List-Unsubscribe. Causa: ${errUrl?.message}`,
        );
      }

      const assinaturaHtml = assinatura
        ? renderAssinatura(assinatura, unsubscribeUrl || undefined)
        : '';
      const htmlFinal = `${corpoMerged}\n\n${assinaturaHtml}`;
      const textoFinal: string | undefined = step.corpo_texto
        ? step.corpo_texto.replace(/\{\{name\}\}/gi, primeiroNome)
        : undefined;

      const from = `${campanha.nome_remetente || 'TechFor TI'} <${campanha.email_remetente}>`;

      // 🆕 v1.3 — Reply-To dinâmico com plus-aliasing (Fase 7-MVP).
      // Quando o lead responde, a resposta vai para `customer-service+f{id}+l{id}@dominio`.
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
      // 🆕 v1.7 — Sufixo de ambiente entre a palavra-base e `+f`. Permite ao
      // webhook de cada ambiente ignorar eventos do outro (necessário porque
      // Production e Preview têm Supabases separados e o Resend dispara
      // webhook em TODOS os endpoints configurados).
      //
      // 🆕 v1.8 — Palavra-base renomeada `respostas` → `customer-service` por
      // razões comerciais (lead vê esse endereço no cliente de e-mail dele).
      // Production NÃO leva sufixo de ambiente (mais limpo comercialmente);
      // Preview leva `+test`. O webhook v1.9 aceita ambas as palavras-base
      // (`customer-service` e `respostas` legacy) e todos os sufixos
      // (`test`, `prod`, `preview`) via regex tolerante.
      const DOMINIO_REPLY_TO = 'techfor.com.br';
      const replyTo = `customer-service${SUFIXO_AMBIENTE}+f${item.id}+l${item.lead_id}@${DOMINIO_REPLY_TO}`;

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
            // 🔧 v1.10 (08/06/2026) — BUG FIX CRÍTICO: reply_to deve ser array.
            //   Diagnóstico (08/06/2026): Raw JSON do Resend mostrou `reply_to: []`
            //   mesmo com o campo preenchido como string. A doc oficial do Resend
            //   (https://resend.com/docs/api-reference/emails/send-email) define
            //   `reply_to` como `string[]` (array). Quando recebe string única,
            //   a API descarta silenciosamente e o e-mail sai sem Reply-To,
            //   fazendo a resposta do lead voltar para o `from` em vez do
            //   plus-alias — quebrando todo o pipeline de captura de respostas.
            //   Provável regressão recente do lado do Resend (string única era
            //   tolerada antes, validado em 04/06; deixou de ser em algum
            //   momento entre 04/06 e 08/06).
            //   Mudança cirúrgica: envolver replyTo em array `[replyTo]`.
            reply_to: [replyTo],
            subject: step.assunto || '(sem assunto)',
            html: htmlFinal,
            text: textoFinal,
            headers: {
              'X-Entity-Ref-ID': `rms-fila-${item.id}`,
              // 🆕 v1.12 — Bloco 3 OPT-OUT 100%: headers RFC 8058 para
              //   one-click unsubscribe (Gmail, Outlook, Yahoo).
              //   Só incluímos se a URL foi gerada com sucesso acima
              //   (try/catch defensivo). Se faltou (segredo ausente, etc),
              //   o email sai sem List-Unsubscribe — comportamento legado.
              //
              //   List-Unsubscribe: <URL>           → cliente faz POST direto
              //   List-Unsubscribe-Post: One-Click  → sinaliza RFC 8058
              //
              //   Quando o cliente (Gmail/Outlook) detecta esses dois
              //   headers em conjunto, expõe botão "Unsubscribe" na barra
              //   superior do email. Clique → POST silencioso para a URL,
              //   sem confirmação visual do usuário no cliente — apenas o
              //   POST e a resposta 200 OK do nosso endpoint.
              //
              //   Atende bulk-sending requirements de Gmail/Yahoo (Feb 2024,
              //   obrigatório para senders >5k msg/dia).
              ...(unsubscribeUrl
                ? {
                    'List-Unsubscribe': `<${unsubscribeUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                  }
                : {}),
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
    detalhes.skip_optout = skipOptoutCount; // 🆕 v1.9 (Fase C)

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
      `${skipJanelaCount} fora de janela, ${skipPausadaCount} pausadas, ` +
      `${skipOptoutCount} opt-out, ` +
      `${autoFinalizadasCount} auto-finalizadas, ${pendentesCanceladosPorDataCount} canc.por.data ` +
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
      skip_optout: skipOptoutCount, // 🆕 v1.9 (Fase C)
      campanhas_auto_finalizadas: autoFinalizadasCount, // 🆕 v1.11 (Fase B)
      pendentes_cancelados_por_data: pendentesCanceladosPorDataCount, // 🆕 v1.11 (Fase B)
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
