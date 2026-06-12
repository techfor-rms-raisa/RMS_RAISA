/**
 * api/crm-webhook.ts — Webhook receiver para eventos do Resend
 *
 * Fase 5C-1 + Fase 7-MVP — 03/06/2026 (CRM Campanhas)
 *
 * v1.14 — 12/06/2026 — P3: popular `email_fila.respondido_em` no UPDATE
 *   do ramo `email.received`.
 *
 *   Bug histórico: o CHECKPOINT_2026-06-04_FASE_7_MVP_CONCLUIDA.md documentou
 *   que a v1.1.1 atualizava `status='respondido', respondido_em=NOW()` no
 *   mesmo UPDATE da fila. Em alguma refatoração subsequente (provavelmente
 *   entre v1.4 e v1.10, durante as evoluções de Fase C e auto-opt-out), a
 *   coluna `respondido_em` foi removida do payload do UPDATE, ficando NULL
 *   para todas as filas respondidas.
 *
 *   Sintoma diagnosticado em 11/06/2026 (CHECKPOINT_2026-06-11_BCC_PRODUCTION_
 *   E_DIAGNOSTICO_METRICAS.md): motor de métricas no dashboard de Acompanhamento
 *   mostrava `taxa_resposta=0%` mesmo com respostas reais gravadas em
 *   `email_respostas` (lead 8 respondeu, fila marcava 0 respondido_em).
 *
 *   Correção cirúrgica (1 UPDATE alterado em `processarEmailRecebido`):
 *     ANTES:
 *       .update({ status: 'respondido' })
 *     DEPOIS:
 *       .update({
 *         status: 'respondido',
 *         respondido_em: createdAtResend || new Date().toISOString(),
 *       })
 *
 *   Padrão idêntico aos outros casos do switch outbound (entregue_em,
 *   aberto_em, clicado_em, bounce_em): usa `createdAtResend` (timestamp
 *   do evento fornecido pelo Resend) com fallback para NOW() local —
 *   preserva o tempo real do evento mesmo em retries.
 *
 *   ⚠️ Bugs P2/P4/P5 do mesmo checkpoint NÃO são tratados nesta versão:
 *     • P2 (bounce_em) — código v1.13.2 já popula corretamente no switch
 *       outbound (linha do case 'bounced'). Diagnóstico de 11/06 indicava
 *       9 bounces sem bounce_em — investigação SQL pendente para confirmar
 *       se é caso de órfãos ou bounces antigos antes do código atual.
 *     • P4 (status='pendente' não evolui para 'enviado') — correção fica
 *       em `api/cron/disparar-fila.ts`, não neste arquivo.
 *     • P5 (step_atual não avança) — correção também em `disparar-fila.ts`
 *       (ou neste webhook no ramo delivered, dependendo de decisão de
 *       produto pendente).
 *
 *   Idempotência: o UPDATE é o mesmo de antes, apenas adiciona um campo
 *   ao payload. Múltiplas chamadas com o mesmo `createdAtResend` produzem
 *   o mesmo resultado (last-write-wins é o comportamento esperado para
 *   responde do Resend que reenvia o mesmo evento).
 *
 *   Dependência: nenhuma SQL adicional. Coluna `respondido_em` já existe
 *   em `email_fila` desde a criação da tabela (Fase 5B).
 *
 * v1.13.2 — 11/06/2026 — Prioridade 1: BCC nas respostas da campanha.
 *   Quando o lead RESPONDE a uma campanha (ramo `email.received`), o
 *   forward montado por `encaminharRespostaAoGestor` passa a incluir
 *   até 3 endereços em cópia (campo `bcc` do Resend), lidos da coluna
 *   nova `email_campanhas.bcc_emails`.
 *
 *   NÃO afeta o envio inicial dos steps (disparar-fila.ts intocado).
 *   Apenas o ramo `received` propaga a cópia.
 *
 *   Mudanças cirúrgicas:
 *     • SELECT da campanha no `processarEmailRecebido` passa a buscar
 *       também `bcc_emails` (era `id, nome, responsavel_id`).
 *     • Assinatura de `encaminharRespostaAoGestor` ganha
 *       `bccEmails?: string[]` (opcional, default não enviar).
 *     • Sanitização defensiva interna: filtra strings vazias / formato
 *       inválido / duplicação com responsável ou com o próprio lead /
 *       limita a 3. Garante que valores espúrios na coluna não vazem
 *       no payload do Resend.
 *     • Body do fetch só inclui `bcc` se a lista limpa tiver pelo menos
 *       1 item (não envia chave bcc vazia).
 *     • Log de auditoria do forward agora mostra a lista BCC efetivamente
 *       enviada (ou `[]`).
 *
 *   Dependências:
 *     • SQL: `2026-06-11_email_campanhas_bcc_emails.sql` aplicado.
 *     • Backend: `api/crm-campanhas.ts` v1.15 (validação na criação/edição).
 *     • Frontend: `StepInfo.tsx` v1.4 + `crm.types.ts` (interface Campanha).
 *
 * v1.13.1 — 11/06/2026 — HOTFIX ESM: adicionada extensão `.js` no import
 *   `'./_helpers/aplicar-opt-out'` → `'./_helpers/aplicar-opt-out.js'`.
 *   Mesmo problema de ESM strict do crm-leads.ts v1.12.1.
 *
 * v1.13 — 11/06/2026 — REFACTOR Bloco 1 do plano OPT-OUT 100%.
 *   Os blocos B (complained → opt_out) e C (cancelamento global da fila)
 *   foram refatorados para delegar ao helper compartilhado
 *   `api/_helpers/aplicar-opt-out.ts` (origem='spam_complaint').
 *
 *   ⚠️ O bloco A (hard bounce) NÃO usa o helper. Hard bounce marca
 *      lead.bounced=true (não lead.opt_out=true) e tem cascata própria.
 *      Decisão P1.3 — bounce ≠ opt-out, fluxos distintos.
 *
 *   Motivação do refactor: o mesmo helper passa a servir os outros
 *   3 caminhos de opt-out (manual via UI, POST RFC 8058, GET link rodapé).
 *   Elimina duplicação da cascata (que existia em 2 lugares — webhook +
 *   crm-leads/desabilitar_lead) e garante consistência da auditoria LGPD
 *   entre todos os caminhos.
 *
 *   Comportamento externo PRESERVADO:
 *     • Resposta HTTP idêntica ao Resend
 *     • Mesmos efeitos no banco (email_leads, email_optout, email_fila,
 *       email_lead_historico)
 *     • motivo_cancelamento='opt_out_spam' mantido por compat com
 *       histórico/auditoria
 *
 * v1.12.1 — 10/06/2026 — BUG FIX: bounceType do Resend é 'Permanent', não 'hard'.
 *   Diagnóstico empírico (smoke test 10/06/2026 — lead 8, mvieir5582px@gmail.com):
 *     • Evento bounced chegou no webhook (registrado em email_eventos)
 *     • Payload mostrou `bounce.type = "Permanent"` (após .toLowerCase = 'permanent')
 *     • Código v1.12 verificava `bounceType === 'hard'` — comparação NUNCA bate
 *     • Resultado: isHardBounce sempre false → blocos A (marcar lead.bounced)
 *       e C (cancelar fila pendente) nunca executavam
 *     • Sintomas: email_leads.bounced=false mesmo após bounce real;
 *       email_fila.status='pendente' persistia para próximos steps
 *
 *   Esse bug já existia desde a v1.0 do webhook (o auto-opt-out por bounce
 *   nunca tinha sido exercitado em produção real — todos os "bounces" anteriores
 *   eram supressões silenciosas do Resend, sem disparar webhook).
 *
 *   Correção cirúrgica (1 expressão, 2 ocorrências unificadas):
 *     const isHardBounce =
 *       tipoInterno === 'bounced' &&
 *       ['hard', 'permanent'].includes((bounceType || '').toLowerCase());
 *
 *   Whitelist com ambas as strings: 'permanent' (Resend atual) e 'hard' (legacy
 *   de outras documentações, mantido por compat defensiva). O .toLowerCase
 *   redundante (bounceType já vem em lowercase do parsing) é mantido como
 *   guarda extra para o caso da fonte do payload mudar no futuro.
 *
 *   A mesma lógica unifica o cálculo de `tipoBounce` no histórico (que
 *   também usava `bounceType === 'hard'` na v1.12).
 *
 *   Dependência: nenhuma SQL adicional. Apenas redeploy do código.
 *   Remediação: leads já bounced antes desta correção precisam de
 *   intervenção manual via SQL (script de remediação fornecido em
 *   2026-06-10_remediacao_lead_bounced_v1_12_bug.sql).
 *
 * v1.12 — 10/06/2026 — AUTO-BOUNCE HANDLING + OPT-OUT CASCADING (P1 + P2).
 *   Decisões de produto consolidadas no CHECKPOINT_2026-06-10.md (Prioridades
 *   1 e 2). Mudanças no fluxo de tratamento de eventos terminais:
 *
 *   ── Hard bounce (email.bounced com bounceType='hard') ──
 *     • ANTES (v1.11): inseria em `email_optout` + chamava RPC global de
 *       cancelamento de fila. Histórico tipo='opt_out' (genérico).
 *     • AGORA: NÃO insere em email_optout (decisão P1.3 — bounce ≠ opt-out).
 *       UPDATE em email_leads SET bounced=true, bounced_em=NOW(),
 *       bounced_motivo=mensagem_resend (decisão P1.1 — marcar, não deletar).
 *       Cancela fila pendente em TODAS as campanhas globalmente (P1.2),
 *       gravando motivo_cancelamento='hard_bounce' nos registros. Histórico
 *       tipo='bounce_permanente'.
 *     • Justificativa: hard bounce indica email inválido (mailbox does not
 *       exist, etc) — não é manifestação do destinatário. O analista pode
 *       corrigir o email, e o backend reseta `bounced` automaticamente
 *       no PATCH atualizar_lead (crm-leads.ts v1.11).
 *
 *   ── Complained (email.complained — marcou como spam) ──
 *     • ANTES (v1.11): upsert em email_optout + cancelamento global. UPDATE
 *       fila status='unsubscribed'.
 *     • AGORA: mantém upsert em email_optout (complained É opt-out genuíno —
 *       decisão P2.1: irreversível por LGPD), PLUS UPDATE em email_leads
 *       SET opt_out=true, opt_out_em=NOW() (decisão P2.2 — badge visível na
 *       Base de Leads). Cancela fila com motivo_cancelamento='opt_out_spam'.
 *
 *   ── Substituição da RPC `cancelar_fila_pendente_email_global` ──
 *     • Antes: RPC SQL externa.
 *     • Agora: UPDATE direto no email_fila com filtro por destinatario_email
 *       + status='pendente', escrevendo motivo_cancelamento atomicamente.
 *     • Razão: garantir que motivo_cancelamento (coluna nova adicionada em
 *       2026-06-10_email_leads_bounce_handling.sql) seja sempre escrito, sem
 *       depender de uma versão atualizada da RPC. A RPC original continua
 *       existindo no banco; pode ser usada por outras integrações no futuro.
 *
 *   ── Dependência SQL ──
 *     • Requer `2026-06-10_email_leads_bounce_handling.sql` aplicado em
 *       Preview e Production. Sem ele, o UPDATE em email_leads/email_fila
 *       falhará por coluna inexistente.
 *
 *   ── Idempotência ──
 *     • UPDATE em email_leads.bounced é idempotente (já era true → continua
 *       true; bounced_em só atualiza se ainda for NULL — preserva o primeiro
 *       bounce reportado).
 *     • UPDATE em email_fila com filtro `status='pendente'` é naturalmente
 *       idempotente (segunda passada → 0 linhas afetadas).
 *
 * v1.11 — 08/06/2026 — BUG FIX CRÍTICO: reply_to do forward como array.
 *   Diagnóstico (08/06/2026): durante validação prática da Fase C, o lead
 *   de teste respondeu mas a resposta veio para `mvieira@techfor.com.br`
 *   (o `from` do envio) em vez do plus-alias esperado
 *   `customer-service+test+f{id}+l{id}@techfor.com.br`.
 *   Raw JSON do Resend mostrou `reply_to: []` mesmo com o cron passando
 *   `reply_to: replyTo` como string. A doc oficial do Resend define o
 *   parâmetro como `string[]` (array). Quando passado como string única,
 *   a API descarta silenciosamente.
 *   Esta mesma classe de bug afeta a função `encaminharRespostaAoGestor`
 *   deste arquivo: quando o forward é enviado ao gestor, o `reply_to`
 *   apontava para `opts.leadEmail` como string única — pelo mesmo motivo,
 *   o Resend descartava e o gestor não conseguiria responder direto ao
 *   lead (Responder no Outlook iria para `notificacoes@techfortirms.online`
 *   em vez do lead).
 *   Não foi notado antes porque os forwards nunca chegaram a ser exercitados
 *   em produção real (Fase 7-MVP validou apenas estrutural em 04/06; o uso
 *   prático começou em 08/06 e travou em outro ponto antes do forward).
 *   Mudança cirúrgica: 1 linha — `reply_to: opts.leadEmail` →
 *   `reply_to: [opts.leadEmail]`. Mesmo padrão aplicado em
 *   disparar-fila.ts v1.10 (commitado junto).
 *
 * v1.10 — 08/06/2026 — FASE C: Pausa automática (LGPD compliance).
 *   Motivação: até a v1.9, quando um lead respondia ou seu e-mail virava
 *   hard bounce / complained, apenas a fila ATUAL daquele evento mudava de
 *   status. Os STEPS FUTUROS da mesma campanha (e em outras, no caso de
 *   bounce) continuavam em `status='pendente'` e o cron os despachava — o
 *   que é problema de compliance (LGPD), de reputação de domínio e de
 *   profissionalismo (lead recebe sequência mesmo após responder ou pedir
 *   para sair).
 *
 *   Correção (2 RPCs novas em SQL + 2 chamadas neste webhook):
 *     1) Ramo `received` (resposta do lead, em processarEmailRecebido):
 *        após o UPDATE de status='respondido' na fila atual, chama
 *        `cancelar_fila_pendente_lead_campanha(lead_id, campanha_id)` para
 *        cancelar todos os steps futuros DAQUELA campanha. Não interfere
 *        em outras campanhas onde o lead esteja vinculado.
 *     2) Ramo `bounced` (hard) e `complained` (no fluxo outbound): após o
 *        upsert em email_optout, chama
 *        `cancelar_fila_pendente_email_global(email)` para cancelar todos
 *        os pendentes daquele e-mail em TODAS as campanhas (complementar
 *        ao auto-opt-out global).
 *
 *   Idempotência:
 *     • Ambas RPCs só atualizam linhas com status='pendente' — segunda
 *       chamada é no-op (zero linhas afetadas).
 *     • Não bloqueia o fluxo do webhook se a RPC falhar (graceful: loga
 *       warning e continua). A resposta/bounce já foi gravada antes.
 *
 *   Dependência: requer o SQL `2026-06-08_crm_evolucao_C_B_D.sql` aplicado
 *     em Production (cria as 2 RPCs).
 *
 * v1.9 — 05/06/2026 — Renomeação comercial do plus-alias.
 *   Motivação: o Reply-To `respostas+prod+f4+l1@techfor.com.br` aparecia
 *   diretamente no cliente de e-mail do lead. "respostas" é descritivo mas
 *   "+prod" expunha jargão técnico interno. Decisão de produto: trocar para
 *   `customer-service` (mais profissional) e remover o sufixo de ambiente
 *   em Production (Preview mantém `+test` para diferenciação interna).
 *
 *   Mudanças cirúrgicas:
 *     1) `REPLY_TO_PATTERN` ampliada com OR para aceitar AMBAS as palavras-base
 *        e ambos os conjuntos de sufixos:
 *          `(?:customer-service|respostas)(?:\+(test|prod|preview))?\+f(\d+)\+l(\d+)@`
 *        Backward compat 100%: filas em curso da v1.7 (`respostas+prod+...`,
 *        `respostas+preview+...`) e da v1.6 ou anterior (`respostas+...` sem
 *        sufixo) continuam funcionando sem migração.
 *     2) `parsearReplyTo` mapeia sufixo → ambiente:
 *          - 'test'    → 'preview' (novo formato v1.8)
 *          - 'preview' → 'preview' (legacy v1.7)
 *          - 'prod'    → 'prod'    (legacy v1.7)
 *          - undefined → 'prod'    (default novo: Production sem sufixo)
 *     3) Logs e mensagens de erro atualizadas para mencionar ambos formatos.
 *
 *   Dependência: requer `api/cron/disparar-fila.ts` v1.8 para gerar
 *     `customer-service[+test]+f{id}+l{id}@...` em vez de `respostas+prod/...`.
 *   Nada muda no Resend painel (o MX captura tudo do domínio `techfor.com.br`).
 *
 * v1.8 — 05/06/2026 — Separação de ambientes (Production/Preview) no plus-alias.
 *   Diagnóstico (05/06/2026, primeira campanha real em Production):
 *     • Campanha 1 enviada e respondida em Production. Forwards bagunçados
 *       chegaram em moliveira@techforti.com.br com Reply-To `dsouza@xqqrtecherro.com`
 *       e `errodenome@techforti.com.br` (emails de testes de PREVIEW de 04/06)
 *       e `X-Entity-Ref-ID: rms-forward-lead-7` e `rms-forward-lead-9`.
 *     • Tabela `email_eventos` em Production só tinha 3 filas (campanha 1,
 *       leads 1/501/502) — incapaz de gerar pelo código v1.7 os IDs 7 e 9
 *       com aqueles emails.
 *     • Conclusão: o Resend Inbound dispara `email.received` para TODOS os
 *       webhooks configurados no painel (Production + Preview + legacy). Como
 *       Production e Preview têm Supabases SEPARADOS, o webhook de Preview
 *       processava o evento de Production contra o banco de Preview, onde a
 *       fila 3 antiga ainda existia apontando para o lead 9 antigo (DEBORA
 *       TESTES SOUZA / dsouza@xqqrtecherro.com).
 *   Correção:
 *     1) `REPLY_TO_PATTERN` ampliada para capturar prefixo opcional
 *        `(prod|preview)` entre `respostas` e `+f`. Backward compat: sem
 *        prefixo, assume `prod` (preserva filas já em curso de 05/06).
 *     2) `parsearReplyTo` agora retorna `{ env, filaId, leadId }`.
 *     3) `processarEmailRecebido` adiciona guard de ambiente APÓS o parse:
 *        compara `parsed.env` com `process.env.VERCEL_ENV` e retorna
 *        `{ status: 'ignored', reason: 'environment_mismatch' }` se não bater.
 *     Sem mudanças em DNS, MX ou DKIM. Permite manter o webhook de Preview
 *     ativo no Resend permanentemente.
 *   Dependência: requer `api/cron/disparar-fila.ts` v1.7 para que envios
 *     novos já saiam com o prefixo no Reply-To.
 *
 * v1.7 — 04/06/2026 — Fix do endpoint REST para inbound emails.
 *   Diagnóstico (após nova API key Full Access ativa em preview):
 *     • Log mostrou `GET /emails/{id}` retornando 404 "Email not found"
 *       mesmo com chave Full Access — confirmando que esse endpoint é
 *       apenas para emails OUTBOUND (mensagens enviadas via POST /emails).
 *     • Inspeção do `/api/webhook/email-inbound` (módulo RAISA legacy,
 *       que resolveu o mesmo problema há 5 meses) revelou que o endpoint
 *       correto para inbound emails é `GET /emails/receiving/{id}`.
 *   Correção:
 *     1) Em `buscarEmailCompletoResend`: trocada a URL
 *        `https://api.resend.com/emails/${id}`  (outbound)
 *        → `https://api.resend.com/emails/receiving/${id}`  (inbound).
 *     2) Header `Content-Type: application/json` adicionado por simetria
 *        com o padrão do legacy (não é estritamente necessário em GET,
 *        mas mantém consistência se o Resend exigir no futuro).
 *
 * v1.6 — 04/06/2026 — Fix definitivo do bug "(sem corpo)".
 *   Diagnóstico (apoiado pela v1.5):
 *     • Query SQL: `SELECT pg_typeof(dados->'data'->'text'), LENGTH(...)`
 *       sobre `email_eventos` mostrou tam_text/tam_html = NULL.
 *     • O webhook do Resend para `email.received` NÃO inclui `text`/`html`
 *       no payload (por design). Esses campos só existem no recurso completo
 *       e devem ser obtidos via `GET https://api.resend.com/emails/{id}`.
 *     • Comportamento idêntico ao do webhook legacy
 *       `/api/webhook/email-inbound` (módulo RAISA candidaturas), que já
 *       resolveu o mesmo problema há ~5 meses pelo mesmo caminho.
 *   Correção:
 *     1) Novo helper `buscarEmailCompletoResend(emailId, apiKey)` —
 *        chama `GET /emails/:id` e devolve `{ text, html, subject }`.
 *     2) Em `processarEmailRecebido`: se `dataEvento.text` E `dataEvento.html`
 *        vierem vazios, faz o fallback fetch e enriquece os corpos antes
 *        de gravar em `email_respostas` e antes do forward ao gestor.
 *     3) `corpoTexto`/`corpoHtml`/`assunto` agora são `let` (mutáveis para
 *        absorver o enriquecimento).
 *     4) Falha no fetch só loga warning e segue com o que tinha — não
 *        bloqueia gravação (o histórico mostra "Resposta recebida" mesmo
 *        sem o corpo; é graceful degradation).
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
// 🆕 v1.13 — Helper compartilhado de opt-out (Bloco 1 OPT-OUT 100%)
// 🔧 v1.13.1 — Extensão .js obrigatória no path (Node.js ESM strict — Vercel runtime)
import { aplicarOptOut } from './_helpers/aplicar-opt-out.js';
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
 * Regex do padrão de Reply-To dinâmico usado pelo cron disparar-fila.
 *
 * Formatos aceitos (em ordem cronológica do projeto):
 *   v1.8+ Production:  customer-service+f{fila_id}+l{lead_id}@{dominio}        (atual)
 *   v1.8+ Preview:     customer-service+test+f{fila_id}+l{lead_id}@{dominio}   (atual)
 *   v1.7  Production:  respostas+prod+f{fila_id}+l{lead_id}@{dominio}          (legacy)
 *   v1.7  Preview:     respostas+preview+f{fila_id}+l{lead_id}@{dominio}       (legacy)
 *   v1.6  e anterior:  respostas+f{fila_id}+l{lead_id}@{dominio}               (legacy)
 *
 * 🆕 v1.9 — Adicionado `customer-service` como palavra-base alternativa, e
 * `test` como sufixo equivalente a `preview` (ambos mapeiam para env=preview).
 * Sem sufixo → assume `prod` (default novo de Production).
 *
 * Match groups: [1]=sufixo (test|prod|preview|undefined)  [2]=fila_id  [3]=lead_id
 */
const REPLY_TO_PATTERN =
  /^(?:customer-service|respostas)(?:\+(test|prod|preview))?\+f(\d+)\+l(\d+)@/i;

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
 * 🆕 v1.9 — Mapeamento sufixo → ambiente:
 *   - 'test'    → 'preview'  (novo formato v1.8, Production sem sufixo)
 *   - 'preview' → 'preview'  (legacy v1.7)
 *   - 'prod'    → 'prod'     (legacy v1.7)
 *   - undefined → 'prod'     (default novo: Production v1.8 não traz sufixo;
 *                             OU formato v1.6/anterior sem prefixo de ambiente)
 *
 * Retorno: { env, filaId, leadId } se encontrar; null caso contrário.
 */
function parsearReplyTo(
  toField: any,
): { env: 'prod' | 'preview'; filaId: number; leadId: number } | null {
  const candidatos: string[] = Array.isArray(toField)
    ? toField.map((x) => String(x || '').trim())
    : [String(toField || '').trim()];

  for (const dest of candidatos) {
    const m = dest.match(REPLY_TO_PATTERN);
    if (m) {
      // m[1] = 'test' | 'prod' | 'preview' | undefined
      const sufixo = m[1]?.toLowerCase();
      const env: 'prod' | 'preview' =
        sufixo === 'test' || sufixo === 'preview' ? 'preview' : 'prod';
      const filaId = parseInt(m[2], 10);
      const leadId = parseInt(m[3], 10);
      if (!Number.isNaN(filaId) && !Number.isNaN(leadId)) {
        return { env, filaId, leadId };
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
  bccEmails?: string[];              // 🆕 v1.13.2 (Prioridade 1 — 11/06/2026) — até 3 endereços em cópia
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
    //
    // 🆕 v1.13.2 (Prioridade 1 — 11/06/2026) — sanitização defensiva do BCC.
    //    O backend de `crm-campanhas` já valida (helper validarBccEmails),
    //    mas re-aplicamos aqui as garantias mínimas porque a fonte da lista
    //    é uma coluna do banco (pode ter sido populada por scripts ad-hoc):
    //      • filtra valores não-string / vazios
    //      • normaliza para lowercase
    //      • remove o próprio responsável (evita duplicar — ele já está em `to`)
    //      • remove o próprio lead (defesa contra erro humano no cadastro)
    //      • limita a 3 itens (espelho da CHECK constraint do banco)
    //    O resultado SÓ é incluído no body do Resend se houver pelo menos 1
    //    item válido restante, evitando enviar `bcc: []` (Resend aceita, mas
    //    economiza payload).
    const responsavelEmailLower = (usr.email_usuario || '').trim().toLowerCase();
    const leadEmailLower = (opts.leadEmail || '').trim().toLowerCase();
    const bccLimpo: string[] = Array.isArray(opts.bccEmails)
      ? opts.bccEmails
          .filter((e): e is string => typeof e === 'string')
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0)
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
          .filter((e) => e !== responsavelEmailLower)
          .filter((e) => e !== leadEmailLower)
          .slice(0, 3)
      : [];
    const bccDedupe = Array.from(new Set(bccLimpo));

    console.log(
      `[crm-webhook] 📤 forward fila_lead=${opts.leadId} to="${usr.email_usuario}" reply_to="${opts.leadEmail}" bcc=${bccDedupe.length > 0 ? JSON.stringify(bccDedupe) : '[]'}`
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
        // 🆕 v1.13.2 (Prioridade 1 — 11/06/2026): incluir BCC somente se
        // houver pelo menos 1 endereço válido (não envia chave bcc vazia).
        ...(bccDedupe.length > 0 && { bcc: bccDedupe }),
        // 🔧 v1.11 (08/06/2026) — BUG FIX CRÍTICO: reply_to deve ser array.
        //   Mesmo bug identificado em disparar-fila.ts v1.10. A doc oficial
        //   do Resend define `reply_to` como `string[]`. Quando passado como
        //   string única, a API descarta silenciosamente — o gestor recebia
        //   o forward, mas ao clicar "Responder" no Gmail/Outlook, a resposta
        //   ia para o `from` (notificacoes@techfortirms.online) em vez do
        //   `opts.leadEmail`, quebrando o fluxo proposto da Fase 7-MVP.
        //   Mudança cirúrgica: `reply_to: opts.leadEmail` → `reply_to: [opts.leadEmail]`.
        //   O comentário "Responder vai DIRETO ao lead" do plano v1.3 só passa
        //   a ser verdade efetivamente com este fix.
        reply_to: [opts.leadEmail],
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
      // 🆕 v1.12.1 (10/06/2026) — tipo='bounce_permanente' quando o bounce
      //   é permanente (decisão P1). O Resend envia bounce.type='Permanent'
      //   (após toLowerCase fica 'permanent'). Documentações antigas/legacy
      //   às vezes referenciam 'hard' — aceitamos ambos para robustez.
      const tipoBounce = ['hard', 'permanent'].includes(bounceType || '') ? 'bounce_permanente' : 'bounce';
      const mapaHistorico: Record<string, { tipo: string; descricao: string }> = {
        sent:              { tipo: 'email_enviado',     descricao: 'E-mail enviado pelo provedor (Resend)' },
        delivered:         { tipo: 'email_entregue',    descricao: 'E-mail entregue na caixa do destinatário' },
        delivery_delayed:  { tipo: 'email_atrasado',    descricao: 'Entrega temporariamente atrasada' },
        opened:            { tipo: 'email_aberto',      descricao: 'Destinatário abriu o e-mail' },
        clicked:           { tipo: 'email_clicado',     descricao: linkClicado ? `Clicou no link: ${linkClicado}` : 'Clicou em um link do e-mail' },
        bounced:           { tipo: tipoBounce,          descricao: `Bounce ${bounceType || ''}: ${bounceMessage || 'sem detalhes'}`.trim() },
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

    // ─────────────────────────────────────────────────────────────
    // 🆕 v1.12 (10/06/2026) — Tratamento separado de bounce vs complained.
    //   Decisões CHECKPOINT_2026-06-10.md (P1 e P2):
    //     • Hard bounce → marca lead.bounced=true, NÃO entra em email_optout.
    //     • Complained  → entra em email_optout (opt-out genuíno, LGPD
    //       irreversível) + marca lead.opt_out=true (badge UI).
    //   Ambos cancelam fila pendente globalmente, com motivo_cancelamento
    //   distinto para auditoria ('hard_bounce' vs 'opt_out_spam').
    //
    // 🆕 v1.12.1 (10/06/2026) — BUG FIX: o Resend envia bounce.type='Permanent'
    //   (após toLowerCase = 'permanent'), não 'hard'. A comparação anterior
    //   `bounceType === 'hard'` nunca batia, deixando isHardBounce sempre
    //   false e os blocos A e C inertes. Validado empiricamente no smoke
    //   test 10/06/2026 (lead 8 com mvieir5582px@gmail.com: evento bounced
    //   chegou e foi gravado em email_eventos, mas cascata não executou).
    //   Whitelist defensiva aceita ambas as strings conhecidas: a atual do
    //   Resend ('permanent') e a histórica de outras documentações ('hard').
    // ─────────────────────────────────────────────────────────────
    const isHardBounce =
      tipoInterno === 'bounced' &&
      ['hard', 'permanent'].includes((bounceType || '').toLowerCase());
    const isComplained = tipoInterno === 'complained';
    // 🔧 v1.13 — variável `isTerminalDestrutivo` removida: blocos B (complained)
    //   e C-bounce (hard bounce) agora são tratados em ramos separados,
    //   cada um com seu próprio guard (`isHardBounce` / `isComplained`).

    // ── (A) Hard bounce — marca o LEAD como bounced (decisão P1.1) ──
    if (isHardBounce && fila.lead_id) {
      const motivoBounce = bounceMessage || `Hard bounce (${bounceType || 'unknown'})`;

      // Lê o estado atual para preservar o PRIMEIRO bounced_em (idempotência).
      const { data: leadAtual } = await supabase
        .from('email_leads')
        .select('bounced, bounced_em')
        .eq('id', fila.lead_id)
        .maybeSingle();

      const updateLead: Record<string, any> = {
        bounced: true,
        bounced_motivo: motivoBounce,
        atualizado_em: new Date().toISOString(),
      };
      // bounced_em só é gravado na PRIMEIRA ocorrência (preserva timestamp original).
      if (!leadAtual?.bounced_em) {
        updateLead.bounced_em = createdAtResend || new Date().toISOString();
      }

      const { error: errBounce } = await supabase
        .from('email_leads')
        .update(updateLead)
        .eq('id', fila.lead_id);

      if (errBounce) {
        console.error(
          `[crm-webhook] ❌ Falha ao marcar lead ${fila.lead_id} como bounced:`,
          errBounce.message,
        );
      } else {
        console.log(
          `[crm-webhook] 📛 Lead ${fila.lead_id} (${fila.destinatario_email}) marcado como bounced. Motivo: ${motivoBounce}`,
        );
      }
    }

    // ── (B) Complained — entra em email_optout (LGPD irreversível) ──
    // ── (C) Cancelamento global da fila pendente — bounce OU complained ──
    //
    // 🔧 v1.13 (11/06/2026 — Bloco 1 OPT-OUT 100%): blocos B e C foram
    //   unificados em uma única chamada ao helper compartilhado
    //   aplicarOptOut (origem='spam_complaint'). O helper executa:
    //     1. UPDATE email_leads.opt_out=true (PASSO 1 — equivale ao
    //        UPDATE manual que o bloco B fazia)
    //     2. UPSERT email_optout (PASSO 2 — idempotente)
    //     3. UPDATE email_fila SET status='cancelado',
    //        motivo_cancelamento='opt_out_spam' WHERE destinatario_email
    //        AND status='pendente' (PASSO 3 — equivale ao UPDATE direto
    //        que o bloco C fazia para complained)
    //     4. INSERT email_lead_historico (PASSO 4 — adicional do helper,
    //        registra a origem='spam_complaint' para auditoria)
    //
    //   Resultado idêntico ao código v1.12.1 mais o INSERT histórico
    //   (que antes só era feito pelo mapaHistorico do bloco anterior
    //   ao tratamento terminal, agora consolidado no helper).
    //
    //   ⚠️ HARD BOUNCE continua sendo tratado SEPARADAMENTE no bloco A
    //   (acima desta seção) — bounce ≠ opt-out (decisão P1.3).
    //   O cancelamento de fila para HARD BOUNCE é feito a seguir (bloco C
    //   restante apenas para o caso de bounce).
    if (isComplained && fila.destinatario_email) {
      const resultado = await aplicarOptOut({
        supabase,
        lead_id: fila.lead_id ?? null,
        email: fila.destinatario_email,
        origem: 'spam_complaint',
        motivo: 'Marcou como spam (auto opt-out via webhook)',
        criado_por: null, // auto, sem usuário humano
        campanha_origem_id: fila.campanha_id,
      });

      if (resultado.ok) {
        if (resultado.ja_estava_optout) {
          console.log(
            `[crm-webhook] ℹ️ Complained recebido mas ${fila.destinatario_email} já estava em opt-out (no-op)`,
          );
        } else {
          console.log(
            `[crm-webhook] 🚫 Auto opt-out (complained): ${fila.destinatario_email} ` +
              `→ ${resultado.total_cancelados} pendente(s) cancelado(s)`,
          );
        }
      } else {
        console.error(
          `[crm-webhook] ❌ Falha no aplicarOptOut(spam_complaint) para ${fila.destinatario_email}:`,
          resultado.error,
        );
      }
    }

    // ── (C-bounce) Cancelamento global da fila APENAS para hard bounce ──
    //   v1.13 cirúrgica: o cancelamento para `complained` foi para o
    //   helper acima. Aqui permanece apenas o caminho de hard bounce,
    //   que NÃO é opt-out (não entra em email_optout — decisão P1.3) mas
    //   AINDA precisa cancelar a fila pendente do email com
    //   motivo_cancelamento='hard_bounce'.
    if (isHardBounce && fila.destinatario_email) {
      const emailNorm = fila.destinatario_email.toLowerCase().trim();

      const { data: cancelados, error: errCancel } = await supabase
        .from('email_fila')
        .update({
          status: 'cancelado',
          motivo_cancelamento: 'hard_bounce',
        })
        .eq('destinatario_email', emailNorm)
        .eq('status', 'pendente')
        .select('id');

      if (errCancel) {
        console.warn(
          `[crm-webhook] ⚠️ Falha ao cancelar fila pendente (hard bounce) de ${emailNorm}:`,
          errCancel.message,
        );
      } else {
        const total = cancelados?.length || 0;
        console.log(
          `[crm-webhook] 🛑 Cancelados ${total} pendente(s) globais (hard_bounce) de ${emailNorm}`,
        );
      }
    }

    // Variável legacy mantida para compatibilidade do response payload abaixo.
    const deveOptOut = isComplained; // hard bounce não mais entra em opt-out (v1.12)

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
// 🆕 v1.6 — HELPER: buscar e-mail completo via REST API do Resend
// ────────────────────────────────────────────────────────────────────────
/**
 * O webhook de `email.received` chega SEM `text` e `html` no payload
 * (descoberta validada na v1.5 — `LENGTH(dados->'data'->>'text') = NULL`).
 * O corpo só está disponível chamando a REST API com o id do email.
 *
 * 🆕 v1.7 (04/06/2026) — Endpoint correto para INBOUND emails é
 *   `GET /emails/receiving/{id}` (não `GET /emails/{id}`, que é só
 *   para outbound). Descoberto via inspeção do webhook legacy
 *   `/api/webhook/email-inbound` do módulo RAISA candidaturas, que já
 *   usava esse path corretamente desde a sua primeira versão (5 meses).
 *
 * Esta função encapsula esse fetch:
 *   • Usa o id do e-mail (campo `id` ou `email_id` do payload).
 *   • Autentica com `RESEND_API_KEY` (Bearer) — requer chave Full Access.
 *   • Retorna `{ text, html, subject }` ou null em qualquer falha.
 *   • Nunca lança exceção — falha é graceful (loga warning e retorna null).
 *
 * Comportamento idêntico ao webhook legacy `/api/webhook/email-inbound`.
 */
async function buscarEmailCompletoResend(
  emailId: string,
  apiKey: string,
): Promise<{ text: string | null; html: string | null; subject: string | null } | null> {
  try {
    // 🆕 v1.7 — URL específica para INBOUND. Path: /emails/receiving/{id}
    const url = `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(
        `[crm-webhook] ⚠️ GET /emails/receiving/${emailId} retornou ${resp.status}: ${body.substring(0, 200)}`,
      );
      return null;
    }

    const data: any = await resp.json().catch(() => null);
    if (!data) {
      console.warn(`[crm-webhook] ⚠️ GET /emails/receiving/${emailId} sem corpo JSON`);
      return null;
    }

    return {
      text: typeof data.text === 'string' ? data.text : null,
      html: typeof data.html === 'string' ? data.html : null,
      subject: typeof data.subject === 'string' ? data.subject : null,
    };
  } catch (e: any) {
    console.warn(
      `[crm-webhook] ⚠️ Exceção em GET /emails/receiving/${emailId}:`,
      e?.message || String(e),
    );
    return null;
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
    console.warn('[crm-webhook] ⚠️ email.received sem padrão de Reply-To esperado (customer-service+[test+]f{id}+l{id} ou respostas+...) no "to":', toField);
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
      reason: 'to não bate padrão Reply-To (customer-service+[test+]f{id}+l{id}@ ou legacy respostas+...)',
    });
  }

  // 🆕 v1.8 — Guard de ambiente. O Resend Inbound dispara webhook em todos
  // os endpoints configurados (Production + Preview + legacy). Como Production
  // e Preview usam Supabases separados, sem este filtro um webhook processaria
  // eventos do OUTRO ambiente contra seu próprio banco, encontrando IDs de
  // fila/lead diferentes e gerando forwards bagunçados.
  //
  // Comportamento:
  //   - Evento com prefixo `prod` chega em servidor com VERCEL_ENV='production' → processa
  //   - Evento com prefixo `preview` chega em servidor com VERCEL_ENV='preview'  → processa
  //   - Outros cruzamentos → ignora silenciosamente com 200 OK (não polui o banco)
  //   - Backward compat: eventos SEM prefixo (formato v1.6 e antes) são tratados
  //     como `prod` no parsearReplyTo — funcionam só no servidor de Production.
  const ambienteAtual: 'prod' | 'preview' =
    process.env.VERCEL_ENV === 'production' ? 'prod' : 'preview';
  if (parsed.env !== ambienteAtual) {
    console.log(
      `[crm-webhook] ⏭️ Evento de outro ambiente ignorado: parsed_env=${parsed.env}, server_env=${ambienteAtual}, to=${JSON.stringify(toField)}`,
    );
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: 'environment_mismatch',
      parsed_env: parsed.env,
      server_env: ambienteAtual,
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
  //    🆕 v1.13.2 (Prioridade 1 — 11/06/2026): trazer também `bcc_emails`
  //    (array de até 3 endereços) — usado pelo forward para incluir cópia
  //    aos destinatários extras configurados na campanha.
  const { data: campanha } = await supabase
    .from('email_campanhas')
    .select('id, nome, responsavel_id, bcc_emails')
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
  // 🆕 v1.6 — mutáveis para absorver o enriquecimento via REST API.
  let assunto: string | null = dataEvento?.subject || null;
  let corpoTexto: string | null = dataEvento?.text || null;
  let corpoHtml: string | null = dataEvento?.html || null;

  // 🆕 v1.6 — Fallback fetch quando text E html vierem vazios.
  //   O webhook do Resend para email.received NÃO traz o corpo no payload
  //   (descoberta da v1.5). Precisamos buscar via REST API para enriquecer.
  //   Se text OU html já vierem preenchidos (cenário raro mas possível),
  //   pulamos o fetch e usamos o que veio no payload.
  if (!corpoTexto && !corpoHtml) {
    const emailIdResend: string | null =
      dataEvento?.id || dataEvento?.email_id || null;
    const apiKey = process.env.RESEND_API_KEY;

    if (!emailIdResend) {
      console.warn(
        '[crm-webhook] ⚠️ email.received sem id/email_id no payload — não é possível enriquecer',
      );
    } else if (!apiKey) {
      console.warn(
        '[crm-webhook] ⚠️ RESEND_API_KEY ausente — corpo do e-mail não será buscado',
      );
    } else {
      console.log(
        `[crm-webhook] 🔍 Buscando email completo via REST API (id=${emailIdResend})`,
      );
      const enriquecido = await buscarEmailCompletoResend(emailIdResend, apiKey);
      if (enriquecido) {
        // Preenche o que estava vazio sem sobrescrever o que já veio.
        if (!corpoTexto && enriquecido.text) corpoTexto = enriquecido.text;
        if (!corpoHtml && enriquecido.html) corpoHtml = enriquecido.html;
        if (!assunto && enriquecido.subject) assunto = enriquecido.subject;
        console.log(
          `[crm-webhook] ✅ Email enriquecido: text_len=${(corpoTexto || '').length} html_len=${(corpoHtml || '').length}`,
        );
      } else {
        console.warn(
          `[crm-webhook] ⚠️ Falha ao enriquecer email ${emailIdResend} — graceful degradation`,
        );
      }
    }
  }

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

  // 7. UPDATE em email_fila — status='respondido' + respondido_em
  //   🔧 v1.14 (12/06/2026 — P3): popular `respondido_em` no MESMO UPDATE.
  //     Bug regredido entre v1.1.1 e v1.13.2 — a coluna ficava NULL em todas
  //     as filas que recebiam resposta, quebrando o motor de métricas
  //     (taxa_resposta zerada no dashboard de Acompanhamento). Diagnóstico
  //     em CHECKPOINT_2026-06-11_BCC_PRODUCTION_E_DIAGNOSTICO_METRICAS.md.
  //     Padrão idêntico aos outros casos do switch (entregue_em, aberto_em,
  //     clicado_em, bounce_em): usa `createdAtResend` (timestamp do evento
  //     fornecido pelo Resend) com fallback para NOW() local.
  await supabase
    .from('email_fila')
    .update({
      status: 'respondido',
      respondido_em: createdAtResend || new Date().toISOString(),
    })
    .eq('id', fila.id);

  // 🆕 v1.10 (Fase C) — Cancela steps FUTUROS do lead NESTA campanha.
  //   Após o UPDATE acima (que muda só o item atual para 'respondido'),
  //   precisamos interromper a sequência: Steps 2/3/4 já enfileirados
  //   continuariam disparando mesmo após a resposta do lead — problema
  //   de compliance e profissionalismo.
  //   Escopo: APENAS esta campanha. Se o lead estiver em outras campanhas,
  //   essas continuam normalmente (responder em uma não silencia todas).
  //   Falha aqui é graceful — a resposta já foi gravada acima.
  if (fila.lead_id && fila.campanha_id) {
    const { data: totCancel, error: errCancel } = await supabase.rpc(
      'cancelar_fila_pendente_lead_campanha',
      {
        p_lead_id: fila.lead_id,
        p_campanha_id: fila.campanha_id,
        p_motivo: 'lead_respondeu',
      },
    );
    if (errCancel) {
      console.warn(
        `[crm-webhook] ⚠️ Falha ao cancelar fila pendente do lead ${fila.lead_id} em campanha ${fila.campanha_id}:`,
        errCancel.message,
      );
    } else {
      console.log(
        `[crm-webhook] 🛑 Cancelados ${totCancel || 0} steps futuros do lead ${fila.lead_id} em campanha ${fila.campanha_id} (lead respondeu)`,
      );
    }
  }

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
        bccEmails: campanha?.bcc_emails || [], // 🆕 v1.13.2 (Prioridade 1 — 11/06/2026)
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
