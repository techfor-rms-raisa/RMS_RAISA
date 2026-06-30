/**
 * api/crm-leads.ts — CRUD Empresas + Leads (CRM de Campanhas)
 *
 * Histórico:
 *  - v1.25.5 (30/06/2026 — POLISH P2 — Ordem cronológica reversa):
 *    Ajuste UX solicitado por Messias em smoke real: a timeline do
 *    CRM E-mail estava em ordem cronológica ASCENDENTE (mais antigo
 *    no topo), forçando o operador a rolar para baixo para ver a
 *    resposta mais recente. Padrão Outlook desktop é DESCENDENTE
 *    (mais recente no topo) — mais natural para acompanhar conversas
 *    em andamento.
 *
 *    Mudança cirúrgica: 1 linha em `mensagens.sort()` — troca
 *    `a.data.localeCompare(b.data)` por `b.data.localeCompare(a.data)`.
 *    O frontend (RespostasTab v2.3) também precisa ajustar a lógica
 *    de "separador adaptativo entre direções" para que funcione
 *    corretamente na ordem invertida.
 *
 *  - v1.25.4 (30/06/2026 — HOTFIX P2 — UX da timeline):
 *    Bug em smoke real (Messias): a timeline do CRM E-mail estava
 *    mostrando bolhas "(sem assunto registrado)" / "Step ? · Campanha"
 *    intercaladas entre as respostas. Causa: o próprio `responder_thread`
 *    cria itens sintéticos em `email_fila` com `step_id=NULL` (para
 *    reusar o Reply-To dinâmico), e o `listar_msgs_thread` listava
 *    TODOS os itens enviados de email_fila — incluindo esses sintéticos
 *    sem step relacionado.
 *
 *    Fix: filtro `step_id NOT NULL` no SELECT de email_fila. Assim só
 *    envios reais de step da campanha aparecem como "Step X". Os
 *    outbounds do CRM E-mail seguem aparecendo via email_respostas
 *    (direcao='outbound') — únicos e corretos.
 *
 *    Mudança cirúrgica: 1 linha (.not('step_id', 'is', null)).
 *
 *  - v1.25.3 (30/06/2026 — HOTFIX P2 — Visualização outbound na thread):
 *    Bug em smoke real (Messias respondeu 2x para o mesmo lead via CRM
 *    E-mail; emails chegaram perfeitos no Gmail do destinatário, mas as
 *    bolhas outbound NUNCA apareceram na thread do RAISA).
 *
 *    Causas raízes (2 paralelas):
 *
 *      (1) `listar_msgs_thread` (v1.24) NÃO trazia a coluna `direcao`
 *          no SELECT de email_respostas, e hardcoded TODOS os registros
 *          como `tipo='recebido_lead' / direcao='inbound'`. Mesmo que
 *          o INSERT outbound funcionasse, o frontend recebia o registro
 *          como se fosse mensagem do lead — bolha cinza à esquerda em
 *          vez de indigo à direita.
 *
 *      (2) `responder_thread` (v1.25.0+) gravava `de_email =
 *          assinatura.email_assinatura` (ex: moliveira@techcob.com.br),
 *          que é divergente do FROM SMTP real (`campanha.email_remetente`,
 *          ex: moliveira@techfor.com.br) após o hotfix v1.25.2.
 *          Coerência semântica: o registro deve refletir o que o lead
 *          efetivamente vê no campo From do email recebido.
 *
 *    Fix:
 *
 *      (A) listar_msgs_thread: SELECT inclui `direcao, message_id,
 *          in_reply_to_message_id, enviado_por`. Processamento agora
 *          ramifica por direcao:
 *            - 'outbound' → tipo='enviado_crm', bolha indigo direita
 *            - 'inbound' (default null/legacy) → tipo='recebido_lead',
 *              bolha cinza esquerda
 *
 *      (B) responder_thread: `de_email` registrado agora é
 *          `campanha.email_remetente` (espelhando o FROM SMTP real).
 *          `de_nome` permanece `assinatura.nome_completo || responsavel.
 *          nome_usuario` (identidade visual humana — pode ser "Messias
 *          | Tech Cob" mesmo enviando de moliveira@techfor.com.br).
 *
 *    Pré-requisito: migration P1 aplicada (Seção 2 do SQL
 *    2026-06-30_extender_email_respostas_p1.sql). Sem ela, o SELECT
 *    do (A) falha por coluna inexistente. Validar com:
 *      SELECT column_name FROM information_schema.columns
 *      WHERE table_name='email_respostas' AND column_name='direcao';
 *
 *  - v1.25.2 (30/06/2026 — HOTFIX P2 — FROM SMTP):
 *    Bug em smoke real (campanha "Teste de Vertical Alocação - Infraestrutura"):
 *    a resposta usava `assinatura.email_assinatura` no campo From do SMTP
 *    quando esse email aponta para um domínio interno (ex: techcob.com.br)
 *    que NÃO é sending domain verificado na Resend. Resultado: Resend
 *    rejeitava com 403 validation_error.
 *
 *    Causa raiz: confusão entre 2 conceitos diferentes:
 *      • SENDER SMTP (campo From do envelope) — DEVE ser de domínio verificado
 *        na Resend (techfor.com.br ou techforti.inf.br hoje).
 *      • Assinatura visual no rodapé HTML — pode mostrar QUALQUER email
 *        (techcob.com.br, marcas internas, branding) porque é apenas
 *        identidade visual no corpo da mensagem.
 *
 *    O cron disparar-fila v1.13 (Production estável) sempre usou
 *    `campanha.email_remetente` (campo dedicado, validado no Wizard
 *    contra domínios verificados) no SMTP From, mantendo a assinatura
 *    rica no corpo HTML. Mesma estratégia agora aplicada aqui.
 *
 *    Mudança cirúrgica: 1 linha.
 *      ANTES:  from = `${responsavel.nome_usuario} <${assinatura.email_assinatura}>`
 *      DEPOIS: from = `${campanha.nome_remetente || 'TechFor TI'} <${campanha.email_remetente}>`
 *
 *    Defesa em camadas: guard antes do envio retorna 412 com mensagem
 *    clara se `campanha.email_remetente` for null/vazio (cenário não
 *    esperado em Production por validação do Wizard, mas defensivo).
 *
 *  - v1.25.1 (30/06/2026 — HOTFIX P2 — roteamento):
 *    Bug em smoke real Preview: a action `responder_thread` introduzida em
 *    v1.25 caía no bloco `if (req.method === 'GET')` do handler, com guard
 *    interno `&& req.method === 'POST'` que NUNCA matchava (porque o bloco
 *    GET só executa quando o método já é GET). Resultado: o handler caía
 *    no fall-through e retornava 400 "Ação GET desconhecida: responder_thread".
 *
 *    Sintoma observado por Messias: smoke do P2 com formulário preenchido
 *    e clique em Enviar → 400 imediato sem stack trace, mensagem do erro
 *    pelo console.
 *
 *    Fix: a action foi MOVIDA para o bloco `if (req.method === 'POST')`,
 *    posicionada como primeira action dentro dele (para legibilidade —
 *    actions de envio costumam ser as mais frequentes em volume operacional).
 *    Reusa o `body = req.body` já desestruturado pelo bloco POST.
 *
 *    Nenhuma mudança no contrato externo — frontend continua chamando
 *    POST /api/crm-leads?action=responder_thread com o mesmo payload.
 *
 *    Lição arquitetural: NUNCA colocar guard duplicado de método dentro
 *    de bloco já roteado por método. Se a action é POST, ela vai no bloco
 *    POST. Estrutura limpa = uma action por método, sem condicionais
 *    aninhadas de método.
 *
 *  - v1.25 (30/06/2026 — Pacote P2 da feature "CRM E-mail" — Outbound):
 *    Action `responder_thread` — envio de respostas pelo próprio RAISA,
 *    fechando o ciclo do Caminho C aprovado em 30/06/2026 (Messias).
 *
 *    Comportamento end-to-end:
 *      1. Validação RBAC ESTRITA: somente o `responsavel_id` da campanha
 *         pode responder. Admin NÃO interfere (decisão Messias 30/06/2026:
 *         "cada Gestor/SDR responde APENAS seus leads, Admin não interfere").
 *         Esta regra protege a continuidade da thread para o lead (que
 *         sempre vê o mesmo remetente).
 *
 *      2. Resolução de assinatura: combinação `(responsavel.email_usuario,
 *         email_campanhas.unidade)` → email_assinaturas.html — reusa o
 *         mesmo modelo do wizard de campanha (Fase E-2) e do cron de
 *         disparo (renderAssinatura) sem duplicação semântica. A
 *         função renderAssinatura local é COPIADA do disparar-fila v1.13
 *         exatamente como já está duplicada em crm-campanhas (decisão
 *         arquitetural pendente de consolidação em api/_lib/).
 *
 *      3. Item sintético em email_fila com `step_id=NULL`:
 *           - lead_id, campanha_id reais
 *           - destinatario_email = lead.email
 *           - status='pendente' → será atualizado para 'enviado'
 *           - resend_message_id setado após response da Resend
 *         Justificativa: reusar o esquema de Reply-To dinâmico
 *         `customer-service+f{fila_id}+l{lead_id}@techfor.com.br`
 *         já consolidado e parsing-ready no crm-webhook v1.22. Quando o
 *         lead responder esse outbound, o webhook captura sem nenhuma
 *         alteração. Métricas de campanha já filtram `step_id IS NOT NULL`
 *         na maioria dos cálculos (manter atenção em painéis futuros).
 *
 *      4. Envio via fetch direto para `https://api.resend.com/emails`
 *         (NÃO usar SDK — bug histórico descarta reply_to silenciosamente,
 *         documentado em disparar-fila v1.6/v1.10):
 *           - from: `${responsavel.nome_usuario} <${assinatura.email_assinatura}>`
 *           - to: [lead.email]
 *           - bcc: [responsavel.email_usuario]
 *             ↑ Item 4 do pedido do Messias — cópia para Exchange do
 *             próprio operador (mantém Outlook dele sincronizado).
 *           - reply_to: [customer-service+f{filaId}+l{leadId}@techfor.com.br]
 *           - in_reply_to (header SMTP): Message-ID da última mensagem
 *             da thread (busca em email_respostas.message_id ou
 *             email_fila.resend_message_id)
 *           - references (header SMTP): cadeia completa de Message-IDs
 *           - subject: "Re: <assunto da última mensagem>"
 *           - html: corpo digitado + assinatura renderizada
 *
 *      5. Registro outbound em email_respostas (POPULA AS 5 COLUNAS
 *         NOVAS da migration P1):
 *           - direcao='outbound'
 *           - enviado_por = currentUserId
 *           - message_id = id retornado pela Resend
 *           - in_reply_to_message_id = message-id da msg respondida
 *           - bcc_corporativo_em = timestamp do envio
 *
 *      6. Em caso de falha da Resend: rollback do item sintético
 *         (DELETE email_fila row criada) para não poluir o pipeline
 *         da campanha. Mensagem NÃO entra em email_respostas.
 *
 *    Compatibilidade:
 *      - Não altera nenhuma action existente. Aditivo puro.
 *      - Reusa schema email_fila/email_respostas/email_assinaturas
 *        sem necessidade de novas migrations (a P1 SQL já preparou as
 *        5 colunas e a FK enviado_por).
 *      - Atenção: depende da migration P1 estar aplicada (a Seção 2
 *        do SQL `2026-06-30_extender_email_respostas_p1.sql`). Sem ela,
 *        o INSERT em email_respostas falha por coluna inexistente.
 *
 *  - v1.24 (30/06/2026 — Pacote P1 da feature "CRM E-mail"):
 *    Aprovado em 30/06/2026 o Caminho C (Responder pelo RAISA) para
 *    centralizar conversas dos leads numa só plataforma. Esta versão
 *    entrega o LADO LEITURA do Pacote P1 com 2 actions novas:
 *
 *      (A) `listar_threads` — substitui o uso de `listar_respostas`
 *          dentro da aba "CRM E-mail" (antiga "Respostas Campanhas").
 *          Agrupa as respostas em THREADS (1 thread = 1 lead × 1
 *          campanha), retornando para cada uma:
 *            • identidade do lead/empresa/campanha
 *            • snippet + assunto da última mensagem
 *            • total de mensagens
 *            • flag tem_nao_lido
 *            • timestamp do último evento
 *          Reusa o padrão de TETO_POR_FONTE=500 + paginação Node já
 *          consagrado no listar_respostas e listar_invalidos.
 *          RBAC idêntico ao listar_respostas (v1.21): por dono da
 *          campanha (`email_campanhas.responsavel_id`).
 *
 *      (B) `listar_msgs_thread` — quando o operador clica num card,
 *          essa action retorna a CONVERSA COMPLETA cronológica de
 *          uma thread específica, INTERCALANDO:
 *            • Mensagens enviadas pela campanha (origem: email_fila,
 *              com JOIN em email_campanha_steps para assunto e ordem)
 *            • Respostas do lead (origem: email_respostas)
 *          P1 não inclui ainda outbound do RAISA (entrará em P2).
 *          O frontend (RespostasTab v2.0) ordena cronologicamente,
 *          mais antigo primeiro (estilo Outlook/Gmail).
 *
 *    Compatibilidade:
 *      • A action `listar_respostas` (v1.21) NÃO foi alterada — fica
 *        no código como API legada para callers externos (ex: scripts
 *        de auditoria, integrações futuras). Apenas o frontend
 *        useRespostas v2.0 deixa de chamá-la.
 *      • Nenhuma migration de schema é exigida POR ESTA versão de
 *        código — `listar_threads` e `listar_msgs_thread` leem apenas
 *        colunas pré-existentes. As 5 colunas novas de email_respostas
 *        (direcao, message_id, in_reply_to_message_id, enviado_por,
 *        bcc_corporativo_em) serão consumidas pelo backend P2/P3.
 *      • A migration acompanha esta versão APENAS por economia
 *        operacional (1 SQL em vez de 2) e para preparar P2 sem novo
 *        downtime.
 *
 *    Dependência: nenhuma. Schemas usados são todos pré-existentes:
 *      email_respostas, email_leads, email_empresas, email_campanhas,
 *      email_fila, email_campanha_steps.
 *
 *  - v1.23 (30/06/2026 — Filtros "CRECI" e "Analista" na aba "Meus Leads"):
 *    Melhoria de UX solicitada por Messias. Com 2.360+ leads dominando a
 *    aba (esmagadora maioria CRECI), GC/SDR/Admin tinham fricção real
 *    para encontrar ou alocar leads comerciais. Esta versão adiciona 2
 *    filtros opcionais à action `listar_leads`:
 *
 *      (A) `incluir_creci` ('1' default | '0' para esconder)
 *          Quando '0', adiciona `vertical != 'CRECI'` à query.
 *          Idempotente com o RBAC v1.20: para SDR, o AND-composto
 *          colapsa naturalmente para "apenas seus em verticais
 *          não-CRECI" (o OR `vertical.eq.CRECI` do RBAC vira false).
 *          Para GC já é no-op (RBAC já bloqueia CRECI).
 *
 *      (B) `analista_filter` ('mine_or_unassigned' default Admin/SDR |
 *          'mine' default GC | 'unassigned' | 'all' só Admin | id num
 *          só Admin)
 *          Quando informado, restringe `reservado_por` por:
 *            - 'mine'              → reservado_por = currentUserId
 *            - 'unassigned'        → reservado_por IS NULL
 *            - 'mine_or_unassigned'→ reservado_por = userId OR IS NULL
 *            - 'all'               → sem filtro (só Admin pode usar)
 *            - <id_num>            → reservado_por = id (só Admin)
 *          AND-composto com o RBAC já existente. Para GC, o filtro
 *          'mine' é redundante (RBAC já força reservado_por = userId)
 *          mas idempotente.
 *
 *    Justificativa para 'mine_or_unassigned' como default Admin/SDR:
 *      Cenário operacional comum — leads recém-promovidos do CreciPage
 *      ou importados sem analista definido (reservado_por=NULL) ficam
 *      visíveis para alocação imediata, SEM exigir troca de filtro.
 *      Caso contrário, leads órfãos ficariam invisíveis até o operador
 *      adivinhar que precisa trocar o filtro — anti-UX clássico.
 *
 *    Mudança cirúrgica: 1 bloco novo na action listar_leads (entre o
 *    switch de ordenar_por e os filtros opcionais empresa_id/funil/
 *    busca/tags). Stats NÃO mudou — KPIs do header refletem o universo
 *    RBAC global (decisão de produto: filtros frontend não alteram KPIs
 *    para manter referência visual de tamanho da base).
 *
 *    Compatibilidade total: ambos os parâmetros são opcionais. Callers
 *    legados (sem os params) recebem o comportamento v1.22.2 idêntico.
 *
 *  - v1.22.2 (24/06/2026 — Bugfix etapas 8 + 9 do helper para Recuperação):
 *    Hotfix descoberto pela falha real do Rafael Baroni em Production
 *    (24/06/2026 ~08:24 BRT). O botão "Promover" abria o modal, listava a
 *    campanha elegível corretamente (graças ao bugfix v1.22.1 da etapa 6),
 *    mas ao clicar "Confirmar recuperação" o backend retornava:
 *      "Falha ao vincular lead à campanha: duplicate key value violates
 *       unique constraint 'email_lead_campanhas_unique'"
 *
 *    Causa raiz: a etapa 8 do helper `vincularLeadACampanha` fazia INSERT
 *    incondicional em email_lead_campanhas (que tem UNIQUE em lead_id +
 *    campanha_id). Após o backfill executado hoje em Production, o vínculo
 *    do Rafael (id=1061) estava em status='bounced' — a v1.22.1 deixou
 *    de bloquear na validação, mas o INSERT seguiu bate-cabeça com a
 *    unique. Bug em camadas: meio caminho na entrega anterior.
 *
 *    Risco silencioso descoberto na investigação: email_fila NÃO tem
 *    unique em (lead_id, campanha_id, step_id) — apenas PK (id). Se o
 *    INSERT da etapa 8 tivesse passado, a etapa 9 DUPLICARIA silenciosamente
 *    a fila (4 linhas antigas em estado terminal + 4 novas = 8 totais
 *    para o mesmo lead/campanha). Bug funcional mascarado por ausência
 *    de constraint.
 *
 *    Mudança cirúrgica — 4 pontos no arquivo:
 *
 *      (A) Helper `vincularLeadACampanha`: novo opt `modoRecuperacao?: boolean`
 *          (default false → ZERO regressão para callers existentes).
 *
 *      (B) Etapa 8 do helper: quando `modoRecuperacao=true`, UPSERT com
 *          onConflict='lead_id,campanha_id' em vez de INSERT puro. Vínculo
 *          terminal (bounced/cancelado/concluida) é REATIVADO para
 *          status='ativa', step_atual=1, adicionado_em=NOW().
 *
 *      (C) Etapa 9 do helper: quando `modoRecuperacao=true`, DELETE prévio
 *          em email_fila WHERE lead_id=X AND campanha_id=Y antes do INSERT
 *          dos novos rows. Sem isso, fila terminal antiga coexistiria com
 *          a fila nova (sem erro, mas com lixo de dados visível em
 *          dashboards de Acompanhamento).
 *
 *      (D) Etapa 11 do helper: tipo de histórico vira 'campanha_recuperada'
 *          (em vez de 'campanha_vinculada') quando `modoRecuperacao=true`.
 *          Permite métricas separadas de leads "salvos" da aba Inválidos
 *          e auditoria mais limpa.
 *
 *      (E) Action `recuperar_invalido_para_campanha`: passa
 *          `{ modoRecuperacao: true }` ao helper. Mudança de 1 linha.
 *
 *    Pareado com (mesma entrega):
 *      • CHECKPOINT_2026-06-24 (a criar) — registro forense + lições
 *
 *  - v1.22.1 (23/06/2026 — Bugfix etapa 6 do helper vincularLeadACampanha):
 *    Hotfix consolidado com v1.22 (Recuperação de Leads Inválidos).
 *    Descoberto via caso forense do Rafael Baroni (lead 1740, Campanha_06):
 *    a etapa 6 do helper (defesa em profundidade contra duplicação)
 *    filtrava APENAS pelo status da CAMPANHA, ignorando o status do
 *    VÍNCULO. Resultado: leads que bouncearam em uma campanha ativa
 *    (vínculo deveria ser 'bounced' após webhook v1.16) continuavam
 *    sendo rejeitados pela defesa em profundidade.
 *
 *    Mudança cirúrgica na etapa 6: adicionar filtro
 *    `['ativa', 'pausada'].includes(v.status)` ao lado do filtro
 *    existente sobre o status da campanha. Vínculos terminais
 *    ('bounced', 'cancelado', 'concluida') NÃO bloqueiam mais
 *    re-vinculação — comportamento esperado para o caso de recuperação
 *    de leads inválidos pela aba E-mails Inválidos.
 *
 *    Pareado com (mesma entrega):
 *      • crm-webhook.ts v1.16 (UPDATE no vínculo após hard bounce)
 *      • crm-campanhas.ts (bugfix idêntico em
 *        listar_campanhas_disponiveis_para_lead)
 *      • db/scripts/2026-06-23_backfill_vinculos_bounced.sql (corrige
 *        vínculos fantasma históricos via email_fila como fonte da verdade)
 *
 *  - v1.22 (23/06/2026 — Recuperação de Leads Inválidos para Campanha):
 *    Funcionalidade nova solicitada por Messias em Production. Quando um
 *    lead dá bounce em uma campanha, ele é movido para a aba "E-mails
 *    Inválidos" (bounced=true + motivo_invalidacao preenchido). Hoje o
 *    GC/SDR só tinha 2 ações disponíveis: Editar (corrigir o email) e
 *    Recovery (motor automático 3.A com Snov.io). Ambos resolvem o
 *    PRIMEIRO passo (corrigir o endereço), mas o SEGUNDO passo (mandar
 *    de volta para uma campanha) exigia navegação manual para o wizard
 *    de campanhas ou para a aba Vincular em Lote — fricção desnecessária.
 *
 *    Mudanças nesta versão:
 *
 *      (1) Whitelist COLUNAS_EDITAVEIS_LEAD ganha 'motivo_invalidacao'.
 *          Bug latente registrado em CHECKPOINTs anteriores: PATCH
 *          atualizar_lead descartava silenciosamente qualquer tentativa
 *          de limpar este campo (filtro pickEditable). Sem essa correção,
 *          a nova action `recuperar_invalido_para_campanha` não conseguia
 *          limpar o motivo via fluxo padrão. Decisão de produto Messias
 *          23/06/2026: liberar edição para Admin e para o caso de
 *          recuperação automática (próximo item).
 *
 *      (2) Action GET listar_invalidos passa a retornar 2 novos campos
 *          no objeto de cada item:
 *            • `bounced` (boolean) — usado pelo frontend para decidir
 *              se renderiza o botão "Promover" (regra: só aparece quando
 *              bounced=false — o lead foi recuperado, manualmente via
 *              Editar ou automaticamente via Recovery 3.A).
 *            • `vertical` (string | null) — contexto exibido pelo
 *              RecuperarParaCampanhaModal sem precisar de requisição extra.
 *          Mudança aditiva: caller legado que ignora os campos continua
 *          funcionando.
 *
 *      (3) Nova action POST `recuperar_invalido_para_campanha`. Recebe
 *          { lead_id, campanha_id, criado_por } e executa em sequência:
 *            a) Carrega o lead de email_leads (404 se não existir).
 *            b) Validação defensiva: bounced=false (rejeita com 400 se
 *               ainda bounced — frontend já filtra, mas defesa em
 *               profundidade contra race conditions).
 *            c) Validação defensiva: opt_out=false (LGPD).
 *            d) Chama vincularLeadACampanha (helper estável v1.17) que
 *               aplica TODAS as 7 validações canônicas: status da campanha,
 *               data_encerramento, vertical match, responsavel match (com
 *               relaxamento CRECI v1.17), duplicação simultânea, opt-out
 *               legacy.
 *            e) Se vinculação OK: limpa motivo_invalidacao + bounced_motivo
 *               em email_leads (lead sai da aba Inválidos pelo critério
 *               D2: bounced=false AND motivo_invalidacao IS NULL).
 *            f) Registra histórico tipo='recuperacao_invalido' (auditoria).
 *
 *          Retorna 201 com { lead, vinculo } em sucesso ou 400 com erro
 *          estruturado. Operação atômica do ponto de vista de produto:
 *          se a vinculação falha (vertical incompatível, etc.), o
 *          motivo_invalidacao NÃO é limpo — lead permanece visível na
 *          aba para o usuário tentar outra campanha ou outra correção.
 *
 *    Sem mudanças em schema (nenhuma migração necessária). Usa apenas
 *    colunas já existentes em email_leads e email_lead_historico.
 *
 *    Pareado com (mesma entrega):
 *      • useInvalidos.ts v1.3 (método recuperarParaCampanha)
 *      • InvalidosTab.tsx v1.3 (botão Promover purple)
 *      • BaseLeadsPage.tsx v1.15 (handler + state + modal)
 *      • RecuperarParaCampanhaModal.tsx (componente NOVO)
 *      • crm-campanhas.ts SEM MUDANÇAS (action
 *        listar_campanhas_disponiveis_para_lead já aceita lead_id).
 *
 *  - v1.22 (23/06/2026 — RBAC nos contadores stats: respostas, inválidos e opt-out):
 *    Completa a aplicação do RBAC iniciada em v1.20/v1.21. Resolve bug
 *    reportado por Messias 23/06/2026 (smoke caso Marcos Rossi/GC):
 *    badges das abas "Respostas Campanhas" (10), "E-mails Inválidos" (46)
 *    e "Opt-Out" (18) mostravam totais GLOBAIS enquanto as listagens
 *    abriam vazias por causa do RBAC. Divergência confusa.
 *
 *    Causa raiz: action `stats` v1.20 só implementou RBAC em totalLeads.
 *    Os outros 3 contadores ficaram globais (comentário das linhas
 *    1217-1221 da v1.20 dizia "ainda não há decisão de produto pedindo
 *    restrição"). A decisão chegou — restringir.
 *
 *    Mudanças cirúrgicas na action `stats`:
 *
 *      total_respostas:
 *        Replica EXATAMENTE a regra de listar_respostas v1.21
 *        (RBAC por dono da CAMPANHA, não do lead):
 *          Admin             → count global em email_respostas
 *          Outros            → pré-busca campanhaIdsPermitidas via
 *                              email_campanhas.responsavel_id = userId,
 *                              count em email_respostas com .in('campanha_id', ids)
 *          Operador sem camp → 0 (early-return semântico)
 *          Sem currentUser   → 0 (fail-safe — KPI não trava a página)
 *
 *      total_invalidos:
 *        Replica EXATAMENTE a regra de listar_invalidos v1.21
 *        (RBAC por dono do LEAD):
 *          Admin             → count global em email_leads
 *                              (bounced OR motivo_invalidacao)
 *          SDR               → (vertical=CRECI) OR (reservado_por=userId)
 *          Gestão Comercial  → (vertical!=CRECI) AND (reservado_por=userId)
 *          Sem currentUser   → 0 (fail-safe)
 *
 *      total_optout:
 *        Decisão Messias 23/06/2026: opt-outs cujo email corresponde
 *        a um LEAD VISÍVEL ao usuário (mesma regra de listar_invalidos).
 *        Implementação:
 *          Admin             → count global em email_optout
 *          Outros            → pré-busca emails de email_leads RBAC-filtrado
 *                              (sem opt_out=true para não duplicar universo),
 *                              count em email_optout com .in('email', emails)
 *                              + chunking se >300 emails (URL guard PostgREST)
 *          Sem currentUser   → 0 (fail-safe)
 *
 *    Performance/risco (⚠️ Claude Riscos):
 *      - Pré-busca de campanhaIdsPermitidas: típico <100 IDs/operador
 *        (já validado em listar_respostas v1.21).
 *      - Pré-busca de emails para opt-out RBAC: cap de 5000 leads por
 *        operador (limit defensivo). Marcos = 72 leads → trivial.
 *        Acima disso, chunking em blocos de 300 emails para não estourar
 *        o limite de URL do PostgREST. Cada chunk gera 1 count adicional.
 *      - SELECT email em email_leads é leve (indexado).
 *      - Caso extremo (Admin com cap): nunca atinge — Admin tem early
 *        path sem RBAC, count global.
 *
 *    Backwards-compatible: contrato JSON inalterado. As 3 chaves
 *    (total_respostas, total_invalidos, total_optout) continuam
 *    existindo no payload — agora com valores RBAC-filtrados.
 *
 *  - v1.21 (22/06/2026 — RBAC em listar_invalidos e listar_respostas):
 *    Continuação da decisão de produto Messias 22/06/2026 (vide v1.20).
 *    Estende o RBAC para as 2 abas restantes da Base de Leads:
 *
 *      Action listar_invalidos (aba "E-mails Inválidos"):
 *        MESMA regra do listar_leads v1.20 (filtro por dono do LEAD).
 *        Admin             → sem filtro
 *        SDR               → (vertical=CRECI) OR (reservado_por=userId)
 *        Gestão Comercial  → (vertical!=CRECI) AND (reservado_por=userId)
 *        outros tipos      → fail-safe (lista vazia)
 *
 *      Action listar_respostas (aba "Respostas Campanhas"):
 *        Filtro por dono da CAMPANHA (não do lead). Decisão de produto:
 *          "Cada Campanha é criada para um determinado GC/SDR."
 *        A resposta é um evento da campanha → quem está conduzindo é
 *        quem responde ao reply.
 *
 *        Admin             → sem filtro
 *        SDR / GC          → email_campanhas.responsavel_id = userId
 *
 *        Implementação: pré-cálculo das campanhas do usuário corrente
 *        (1 query simples em email_campanhas) e aplicação de
 *        `.in('campanha_id', [...])` no SELECT principal. Early-return
 *        para operador sem campanhas (lista vazia direta).
 *
 *        Volume típico: dezenas de campanhas por operador (longe do
 *        limite de URL do PostgREST). Se algum dia escalar (>500 campanhas
 *        por operador), migrar para RPC com RETURNS BIGINT[] (padrão
 *        estabelecido no fix do 1000 limit em listar_leads_para_vinculo_em_lote).
 *
 *    Mudanças cirúrgicas:
 *      • Action listar_invalidos: leitura de current_user_id/tipo + validação
 *        defensiva + bloco RBAC entre o filtro D2 e o filtro de busca textual.
 *      • Action listar_respostas: leitura dos mesmos params + pré-cálculo de
 *        campanhaIdsPermitidas + early-return se vazio + `.in()` na query
 *        principal de respostas.
 *      • Tabs (InvalidosTab, RespostasTab): ZERO alteração — contrato JSON
 *        100% idêntico, só o conjunto de itens devolvido fica menor.
 *
 *    Frontend pareado:
 *      • useInvalidos.ts v1.1 → v1.2 — aceita currentUser e propaga.
 *      • useRespostas.ts v1.0 → v1.1 — aceita currentUser e propaga.
 *      • BaseLeadsPage.tsx — passa currentUser para useInvalidos() e useRespostas()
 *        (mesma técnica já aplicada ao useLeads em v1.20).
 *
 *    Smoke esperado em Production:
 *      • Marcos (GC, id=8) — aba "E-mails Inválidos": só vê inválidos
 *        com vertical != CRECI e reservado_por = 8. KPI de aba diminui.
 *      • Marcos — aba "Respostas Campanhas": só vê respostas de campanhas
 *        que ele criou.
 *      • Débora (SDR, id=18) — aba "Inválidos": vê CRECI todos + outros
 *        onde é reservado_por.
 *      • Débora — aba "Respostas": vê apenas respostas das campanhas
 *        que ela criou (incluindo CRECI 01).
 *      • Admin (você): comportamento atual preservado em ambas as abas.
 *
 *    Riscos:
 *      • Operador sem nenhuma campanha → aba "Respostas Campanhas" vazia.
 *        Mensagem padrão do EmptyState cobre o caso.
 *      • Auditoria preventiva: outros callers de listar_invalidos/listar_respostas
 *        sem currentUser quebram com 400. Próxima sessão: grep em todo o
 *        frontend (provavelmente nenhum além de useInvalidos/useRespostas).
 *
 *  - v1.20 (22/06/2026 — RBAC de visibilidade na aba "Meus Leads"):
 *    Decisão de produto (Messias, 22/06/2026 — sessão final do dia):
 *      • Cada GC/SDR no Form "Base de Leads" aba "Meus Leads" vê APENAS
 *        os leads sob sua responsabilidade (reservado_por = ele).
 *      • Leads CRECI aparecem para o GC EXCLUSIVAMENTE no Form CRECI
 *        → aba "Meus Leads Salvos" (tabela corretores_creci, filtrada
 *        por analista = nome_usuario).
 *      • Quando o lead CRECI é promovido para Base de Leads, somente
 *        SDR e Admin podem vê-lo lá e movê-lo para Campanha CRECI.
 *      • Admin vê tudo.
 *
 *    Mapa RBAC implementado:
 *      Admin             → sem filtro (vê tudo)
 *      SDR               → (vertical=CRECI) OR (reservado_por=userId)
 *      Gestão Comercial  → (vertical!=CRECI) AND (reservado_por=userId)
 *      outros tipos      → fail-safe (lista vazia)
 *
 *    Mudanças cirúrgicas:
 *      • Action `listar_leads`: leitura de 2 novos query params obrigatórios
 *        (current_user_id, current_user_tipo), validação defensiva (400 se
 *        ausentes/inválidos), aplicação do filtro RBAC após filtros de
 *        elegibilidade e antes de filtros opcionais do operador.
 *      • Action `stats`: mesmo filtro aplicado APENAS ao contador
 *        totalLeads (KPI "LEADS" do header). Os demais KPIs ficam globais
 *        (sem decisão de produto pedindo restrição). Fallback sem
 *        currentUser: retorna 0 em totalLeads (não trava a página).
 *
 *    Frontend pareado:
 *      • useLeads.ts v1.2 → v1.3 — aceita currentUser nas options e propaga
 *        no querystring de listar_leads e stats.
 *      • BaseLeadsPage.tsx — passa currentUser para useLeads().
 *
 *    Decisão de coluna para "gerados/gravados por eles":
 *      Optamos por reservado_por (FK app_users) e NÃO criado_por (text).
 *      Razão: reservado_por reflete a responsabilidade ATUAL — quando o
 *      Admin reatribui um lead, ele transita corretamente entre operadores.
 *      criado_por preservaria a visibilidade histórica para sempre,
 *      gerando ambiguidade sobre "de quem é o lead hoje". reservado_por é
 *      o padrão de CRM esperado.
 *
 *    Congruência com B1 da mesma sessão (22/06/2026 manhã):
 *      • B1 (LeadFormModal v1.4 + VincularEmLoteTab v2.1) permite SDR
 *        EDITAR/VINCULAR leads CRECI de outros analistas. Este v1.20
 *        complementa: SDR também VÊ todos os leads CRECI em "Meus Leads"
 *        da Base de Leads (sem restrição por reservado_por para CRECI).
 *      • Para GC, a regra é mais restritiva: nem vê CRECI nem pode editar
 *        leads de outros (regra B1 manteve trava (d) do helper para
 *        não-CRECI).
 *
 *    Smoke esperado em Production:
 *      • Marcos (GC, id=8): KPI "LEADS" cai de 1692 para apenas os leads
 *        dele em verticais não-CRECI. Aba "Meus Leads" mostra os mesmos.
 *      • Débora (SDR, id=18): vê todos leads CRECI + seus leads não-CRECI.
 *      • Admin (você): KPI continua mostrando 1692.
 *
 *    Risco: se algum endpoint chamar listar_leads SEM passar currentUser,
 *    vai retornar 400. Auditoria preventiva já está no backlog do
 *    CHECKPOINT 22/06 — verificar outros callers durante a próxima
 *    sessão (provavelmente nenhum, mas vale conferir).
 *
 *  - v1.19 (22/06/2026 — HOTFIX da v1.18: RPC com TABLE também sofria do 1000):
 *    A v1.18 tentou resolver o bug do 1000 substituindo
 *    `.from('email_lead_campanhas').select()` por `.rpc('crm_leads_em_campanhas_ativas')`,
 *    onde a function tinha `RETURNS TABLE (lead_id BIGINT)`. Erro de design:
 *    PostgREST trata functions com RETURNS TABLE como SELECTs regulares e
 *    aplica o MESMO limite default de 1000 do cliente Supabase JS. O bug
 *    foi APENAS movido da query antiga para a chamada RPC — sintoma 100%
 *    idêntico em Production após o deploy v1.18: 17 leads vazando.
 *
 *    Diagnóstico final (rastreamento de causa-raiz em 22/06):
 *      - SQL direto: SELECT COUNT(*) FROM crm_leads_em_campanhas_ativas() = 1017 ✓
 *      - Via Supabase JS: idsBloqueadosAtivas.length = 1000 (truncado)
 *      - Leads vazando: 1017 - 1000 = 17 — aritmética exata
 *
 *    Solução definitiva: mudar tipo de retorno da function para BIGINT[]
 *    (array escalar). Functions que retornam array escalar são tratadas
 *    pelo PostgREST como UMA ÚNICA linha (com a coluna sendo o array
 *    completo). NÃO sofrem do limite de 1000.
 *
 *    Mudanças mínimas no backend (este arquivo):
 *      - Consumo de `data` muda de `[{lead_id: number}]` para `number[]`
 *      - Linhas afetadas: 1498 e 1514 do v1.18, agora 1499 e 1518 com
 *        `Array.isArray(...) ? ...map(Number) : []`
 *      - Mensagem de erro atualizada para apontar para a migration v2
 *
 *    Pareada com migration
 *    `sql/2026-06-22_crm_leads_em_campanhas_rpc_v2_fix_bigint_array.sql`
 *    que aplica CREATE OR REPLACE FUNCTION com RETURNS BIGINT[]. Idempotente.
 *    Aplicar em Preview E Production ANTES do deploy desta versão.
 *
 *    Lição arquitetural REFORÇADA (será adicionada ao CONTEXT.md): o limite
 *    de 1000 do cliente Supabase JS NÃO se aplica apenas a `.from().select()`,
 *    mas também a RPCs com `RETURNS TABLE` / `RETURNS SETOF`. Para retornar
 *    listas grandes via RPC sem sofrer do limite, usar tipos array escalares:
 *    BIGINT[], TEXT[], JSONB. A migration corretiva (v2) explica o padrão.
 *
 *    Frontend ZERO alteração (contrato JSON 100% idêntico).
 *
 *    Auditoria preventiva: PRIORIDADE AGORA ALTA. Esta é a 3ª ocorrência
 *    da família do 1000 em 2 dias (CHECKPOINT 21/06: Painel Campanha +
 *    helper calcularTaxasPorCampanha; v1.18 desta sessão; v1.19 que
 *    finalmente fecha). Necessário grep guiado em todos os endpoints
 *    procurando .select() sem .range()/.limit()/head:true E .rpc() de
 *    functions com RETURNS TABLE/SETOF.
 *
 *  - v1.18 (22/06/2026 — FIX bug arquitetural do 1000 em listar_leads_para_vinculo_em_lote):
 *    Substituídas as 2 queries de pré-cálculo de `idsBloqueadosAtivas` e
 *    `idsEmEncerradas` na action `listar_leads_para_vinculo_em_lote` por
 *    chamadas RPC ao Postgres (`crm_leads_em_campanhas_ativas()` e
 *    `crm_leads_em_campanhas_encerradas()`).
 *
 *    Causa raiz (diagnosticada em 22/06/2026 via SQL direto em Production):
 *    o cliente Supabase JS aplica LIMIT 1000 silencioso a todo .select()
 *    sem .range() / .limit() explícito. Em Production, `email_lead_campanhas`
 *    com filtro de status ativa/pausada/agendada retornava 1017 linhas;
 *    o cliente truncou em 1000 sem warning. 17 lead_ids ficaram FORA do
 *    array `idsBloqueadosAtivas` → escaparam do filtro `.not('id', 'in', ...)`
 *    da query principal → apareceram na UI como "falsos disponíveis".
 *
 *    Sintoma reportado: SDR Débora viu 16 leads (dos 17 vazados) na lista
 *    "Selecione os leads" da aba Vincular em Lote → ao tentar vincular,
 *    a defesa em camadas (passo 6 do helper `vincularLeadACampanha`)
 *    bloqueou todos com "Lead já vinculado a campanha em andamento" →
 *    tela "Falha total — 0 de 16 vinculados".
 *
 *    Mesmo bug arquitetural identificado no CHECKPOINT 21/06 (Painel
 *    Campanha → KPIs truncados pelo limite de 1000). Mesma classe de
 *    solução: RPC function Postgres com agregação no banco, JS recebe
 *    apenas os IDs já consolidados (sem trafegar as 1017+ linhas).
 *
 *    Impacto operacional do bug em Production: ZERO duplicação real.
 *    A defesa em camadas (Fase B v1.10) impediu qualquer INSERT errado.
 *    O sintoma foi APENAS cosmético — lista falsa de "disponíveis" +
 *    tela "Falha total" ao tentar vincular. Lição arquitetural: as
 *    travas Fase B do helper pagaram em proteção real, mesmo causando
 *    o ruído UX.
 *
 *    Mudança cirúrgica: apenas o bloco de pré-cálculo (linhas 1424-1476
 *    da v1.17) foi substituído por 2 chamadas .rpc(). Defesa em
 *    profundidade adicionada: se a RPC não existe (migration não aplicada),
 *    retorna 500 com mensagem clara em vez de devolver listagem corrompida.
 *
 *    Pareada com migration `sql/2026-06-22_crm_leads_em_campanhas_rpc.sql`
 *    (CREATE OR REPLACE FUNCTION crm_leads_em_campanhas_ativas() +
 *    crm_leads_em_campanhas_encerradas()). Aplicar em Preview E
 *    Production ANTES do deploy desta versão do backend.
 *
 *    Frontend ZERO alteração — contrato JSON 100% idêntico.
 *
 *    Auditoria preventiva PENDENTE (backlog CHECKPOINT 21/06 + reforço
 *    desta sessão): grep em todos os endpoints procurando outros
 *    `.select(...)` sem `.range()`/`.limit()`/`head:true` que possam vir
 *    a sofrer do mesmo limite quando os volumes crescerem.
 *
 *  - v1.17 (22/06/2026 — B1: SDR distribuidor de Leads CRECI):
 *    Mudança CIRÚRGICA no helper `vincularLeadACampanha` (linha do passo 5):
 *    a TRAVA (d) Fase B `camp.responsavel_id === lead.reservado_por` é
 *    RELAXADA quando `camp.tipo === 'CRECI'`.
 *
 *    Decisão de produto Messias 22/06: a Campanha CRECI é única e operada
 *    pelo SDR responsável (Débora), que centraliza a distribuição dos
 *    leads coletados em massa por toda a equipe (Tatiana, Marcos, Messias)
 *    via Chrome Extension. A regra original "responsavel_id===reservado_por"
 *    foi pensada para verticais B2B (cada GC opera leads próprios) e não
 *    se aplica ao fluxo operacional centralizado CRECI.
 *
 *    Implementação: 1 linha de código + comentário longo explicando a
 *    decisão. Os outros 6 passos do helper (status, data_encerramento,
 *    vertical match, duplicação, opt-out, bounce) PERMANECEM IDÊNTICOS.
 *    Métrica de origem preservada via `email_leads.criado_por` (não
 *    afetada por esta mudança). O `email_leads.reservado_por` do lead
 *    NÃO é mutado pelo helper — apenas o vínculo da campanha em
 *    `email_lead_campanhas` e o enfileiramento em `email_fila` são
 *    criados, exatamente como antes.
 *
 *    Pareado com:
 *      - useVincularEmLote v1.1 (frontend permite SDR ver leads de outros
 *        responsáveis quando vertical_destino === 'CRECI')
 *      - VincularEmLoteTab v2.1 (UI de filtros expandida para SDR + CRECI)
 *      - LeadFormModal v1.4 (SDR pode reatribuir reservado_por em Leads
 *        CRECI manualmente, se preferir o caminho alternativo)
 *
 *    Risco controlado: a relaxação é localizada (1 condição), só impacta
 *    a vertical CRECI, e a defesa CRECI bidirecional (vertical match
 *    no passo 4) PERMANECE intacta. Para outras verticais, a trava (d)
 *    continua ativa.
 *
 *    Smoke esperado: SDR Débora abre Vincular em Lote → vertical_destino
 *    = CRECI → filtra responsável = Marcos Rossi → lista leads CRECI de
 *    Marcos → seleciona N leads → vincula à Campanha CRECI cujo
 *    responsavel_id = Débora.id → tudo sucesso (sem error 'Lead está
 *    reservado a outro usuário').
 *
 *  - v1.16.2 (17/06/2026 — Vincular em Lote v2 — Sessão 3 fix de smoke):
 *    Três correções cirúrgicas descobertas durante o smoke test em Preview
 *    (Cenário B — Conversíveis com mudança vertical). Pareada com o
 *    CHECKPOINT_2026-06-17_VINCULAR_EM_LOTE_V2_SESSAO_2.md:
 *
 *      FIX A — ORDERING DETERMINÍSTICO em `listar_leads_para_vinculo_em_lote`
 *        Sintoma reportado na Sessão 1: ordem aparente 50→10→10→11→10
 *        quando esperado 50→11→10→10→10. Causa-raiz: o `.order()` no
 *        PostgREST aplicava apenas (score_engajamento DESC, nome ASC), sem
 *        tiebreaker FINAL determinístico. Empates em (score, nome) tornam-se
 *        não-determinísticos entre execuções (physical row order do
 *        PostgreSQL muda conforme VACUUM/UPDATE). Em paginação por `range()`,
 *        isso pode embaralhar empates entre páginas adjacentes.
 *        Fix: adicionado `.order('id', { ascending: false })` como tiebreaker
 *        FINAL. Custo: zero (id já tem índice PK). Benefício: ordem 100%
 *        estável e reproduzível.
 *
 *      FIX B — ATOMICIDADE de mutações em `vincular_em_lote_a_campanha`
 *        Sintoma descoberto na auditoria SQL (Q3): timestamp do histórico
 *        `vertical_alterada` (13:27:57) ficou ANTES da timestamp do
 *        `campanha_vinculada` em ~62s. Causa: na 1ª tentativa que falhou
 *        no modal vermelho (Roseni reservada para Débora), o UPDATE de
 *        vertical já tinha sido feito + histórico gravado, ANTES do helper
 *        `vincularLeadACampanha` validar RBAC. Estado inconsistente
 *        latente: lead com vertical alterada sem nunca ter sido vinculado.
 *        Fix: introduzido modo `dryRun` no helper. O loop da action agora
 *        executa o helper em modo dry-run PRIMEIRO (valida tudo sem mutar),
 *        e só promove o UPDATE vertical + INSERT histórico + chamada real
 *        do helper se o dry-run retornar success. Caso falhe, lead fica
 *        com vertical original intacta — zero contaminação.
 *
 *      FIX C — FK `campanha_id` populado em email_lead_historico
 *        Sintoma descoberto na auditoria SQL (Q3): eventos 268 e 269 tinham
 *        `campanha_id=NULL` apesar de descrição em texto mencionando a
 *        campanha. Isso quebra queries auditoria por campanha (ex.: "todas
 *        as movimentações da campanha 13"). Fix: ambos os INSERTs em
 *        email_lead_historico (`vertical_alterada` na action e
 *        `campanha_vinculada` no helper) agora preenchem o FK `campanha_id`.
 *
 *    Schema: sem mudanças. Backward-compatível (opts é opcional no helper).
 *
 *  - v1.16.1 (17/06/2026 — Vincular em Lote v2 FIX defesa em profundidade):
 *    Patch sobre v1.16. Em chamadas SEM `vertical_destino` (uso direto de
 *    API sem contexto de campanha de destino), a v1.16 inicial deixava
 *    leads CRECI vazarem nos resultados de listar_leads_para_vinculo_em_lote.
 *    A v1.15.1 tinha fallback defensivo que sempre excluía CRECI nesse caso;
 *    restaurado em ambos os ramos do filtro tipo_busca (aderentes E
 *    conversíveis). Frontend novo SEMPRE envia vertical_destino, então
 *    essa proteção só ativa em chamadas API externas — mas é a postura
 *    correta para defesa em profundidade (memória #27).
 *
 *    Sem mudança de schema. Smoke test em Preview validou o fix
 *    (chamada sem vertical_destino → 0 leads CRECI).
 *
 *  - v1.16 (17/06/2026 — Vincular em Lote v2 — Sessão 1 backend):
 *    Reescrita da action `listar_leads_para_vinculo_em_lote` para suportar o
 *    novo fluxo do mockup aprovado (CHECKPOINT 16/06/2026):
 *
 *      • 6 NOVOS FILTROS:
 *          - tipo_busca: 'aderentes' (vertical exata) | 'conversiveis'
 *            (qualquer vertical, com CRECI ainda bidirecionalmente blindada).
 *            Default backend = 'conversiveis' (compat com v1.15.1).
 *          - engajamento: 'qualquer' | 'abriu' | 'clicou' | 'respondeu' |
 *            'virgem'. Operados sobre contadores materializados de
 *            email_leads (sem subselect em email_eventos).
 *          - setor: filtro exato em email_empresas.setor (JOIN INNER quando
 *            usado; LEFT quando ausente — leads sem empresa aparecem).
 *          - uf: filtro exato em email_empresas.uf.
 *          - cidade: ilike em email_empresas.cidade.
 *          - cadastro_range: '7d' | '30d' | '90d' | 'mais_90d' | 'qualquer'.
 *          - outras_campanhas: 'excluir' (default — bloqueia leads em
 *            ativa/pausada/agendada) | 'incluir' | 'so_encerradas'.
 *
 *      • PAGINAÇÃO BACKEND:
 *          - per_page (default 30, max 100), offset (default 0).
 *          - count: 'exact' do PostgREST → resposta inclui total_geral,
 *            pagina_atual, total_paginas, has_proxima, has_anterior.
 *
 *      • SCORE DE ENGAJAMENTO NA RESPOSTA:
 *          - Cada lead retorna score_engajamento populado (vinha NULL
 *            antes — agora é mantido em sync pela RPC; vide migration
 *            2026-06-17_vincular_em_lote_v2_score_e_indices.sql).
 *          - Também devolve total_emails_abertos/_clicados, total_respostas
 *            para o frontend mostrar breakdown.
 *
 *      • NOVA ACTION `listar_metadados_filtros_vinculo_em_lote`:
 *          - Devolve setores/UFs/cidades DISTINCT de email_empresas e
 *            responsáveis ativos (GC + SDR + Administrador) para popular
 *            os dropdowns dinâmicos do wizard.
 *          - Zero hardcode no frontend — opções refletem a base real.
 *
 *    Defesa em profundidade CRECI bidirecional PRESERVADA — a action
 *    `vincular_em_lote_a_campanha` (v1.10) NÃO foi tocada, e mantém a
 *    blindagem por lead conforme o helper vincularLeadACampanha (v1.8).
 *
 *    Pareado com migration `2026-06-17_vincular_em_lote_v2_score_e_indices.sql`
 *    que (1) atualiza a RPC `incrementar_contador_lead` para também
 *    sincronizar `email_leads.score_engajamento`, (2) faz backfill one-shot
 *    do score nos 1662 leads existentes, (3) cria 3 índices de suporte aos
 *    filtros novos. Migration deve rodar ANTES do deploy desta versão.
 *
 *  - v1.15.1 (16/06/2026 — F8 FIX: tradução de motivo_invalidacao):
 *    Pareado com webhook v1.15.1 que passou a gravar CÓDIGOS técnicos
 *    snake_case ('mailbox_inexistente', 'caixa_lotada', 'bloqueado',
 *    'servidor_indisponivel') em vez de strings em português. Isso resolve
 *    a violação da CHECK constraint `email_leads_motivo_invalidacao_valido`
 *    descoberta em smoke test 16/06/2026 (logs Vercel 15:21:28 BRT).
 *
 *    Mudança neste arquivo (apenas listar_invalidos):
 *      • Dicionário TRADUCAO_MOTIVO_INVALIDACAO no topo do módulo, mapeando
 *        cada código snake_case → string legível em português. Inclui os 5
 *        códigos pré-existentes (Recovery 3.A, F7) + 4 novos da F8.
 *      • No mapeamento dos itens (campo `motivo`), aplica a tradução em vez
 *        de retornar o código bruto. Fallback "Falha permanente" mantido
 *        para leads pré-v1.15 (bounced=true mas motivo_invalidacao=NULL).
 *
 *    Camada única de tradução: este dicionário é a fonte da verdade para
 *    todos os pontos da UI que mostram motivo de invalidação. Frontend
 *    (InvalidosTab) NÃO PRECISA conhecer códigos — recebe pronto do backend.
 *
 *    Dependência SQL: migration
 *    `db/scripts/2026-06-16_amplia_whitelist_motivo_invalidacao.sql` DEVE
 *    rodar ANTES do deploy desta versão (adiciona os 4 códigos novos à
 *    whitelist da CHECK constraint).
 *
 *  - v1.15 (16/06/2026 — F8: Aba Inválidos lead-centric):
 *    Trilha de mudanças que move a aba "Inválidos" de modelo fila-centric
 *    para lead-centric, em sincronia com webhook v1.15 (popula
 *    `motivo_invalidacao`) e crm.types.ts v1.7 (novo schema InvalidoItem).
 *
 *    Decisões de produto consolidadas (16/06/2026):
 *      D1=C — Híbrido: motivo_invalidacao recebe classificação curta;
 *             bounced_motivo preserva o raw do Resend.
 *      D2=B — Critério "lead inválido" = bounced=true OR motivo_invalidacao
 *             IS NOT NULL. Mesmo critério exclui da aba "Leads".
 *      D3=Não — Sem backfill: leads pre-v1.15 ficam com motivo_invalidacao
 *             NULL mas continuam visíveis na aba pelo critério bounced=true.
 *
 *    Mudanças neste arquivo (3 actions tocadas, cirurgicamente):
 *
 *      • GET `listar_leads` (aba "Leads"): adicionados 2 filtros
 *        defensivos antes do range/order — esconde leads em estado
 *        terminal de invalidação:
 *           query
 *             .not('bounced', 'is', true)
 *             .is('motivo_invalidacao', null)
 *        Mantém o filtro v1.13 de opt-out (`opt_out IS NOT true`).
 *        Resultado: aba "Leads" mostra APENAS leads ativos/recuperáveis.
 *
 *      • GET `stats`: `total_invalidos` muda de fonte. Antes contava
 *        `email_fila WHERE status IN ('bounce','erro')` (eventos de envio
 *        falhos — 1 lead aparecia N vezes). Agora conta `email_leads`
 *        com critério D2:
 *           bounced=true OR motivo_invalidacao IS NOT NULL
 *        Resultado: badge da aba Inválidos passa a refletir LEADS únicos.
 *
 *      • GET `listar_invalidos`: REESCRITA completa (era fila-centric,
 *        passa a ser lead-centric). Consulta `email_leads` em vez de
 *        `email_fila`. Cada linha = 1 lead inválido com seu estado
 *        consolidado. Inclui campos novos no payload para a UI v1.1:
 *           motivo (classificação curta — derivada de motivo_invalidacao
 *                   com fallback "Falha permanente" para leads pre-v1.15)
 *           motivo_raw (bounced_motivo — tooltip)
 *           tentativas_recovery, recovery_em (progresso do motor 3.A)
 *        Busca aceita: nome, email, motivo, motivo_raw (ilike).
 *        Ordenação: bounced_em DESC (mais recentes primeiro), com
 *        fallback para atualizado_em DESC.
 *
 *    Sem mudança de schema, sem migration. Todas as colunas usadas
 *    (`bounced`, `bounced_em`, `bounced_motivo`, `motivo_invalidacao`,
 *    `tentativas_recovery`, `recovery_em`) já existem em `email_leads`
 *    desde a Fase Recovery 3.A (smoke test 2026-06-13).
 *
 *  - v1.14 (13/06/2026 — Coluna ANALISTA + ordenação configurável):
 *    Continuação da reorganização Prospect/Lead. Action `listar_leads`
 *    ganha 2 capacidades para alimentar a nova tabela LeadsTab v1.1:
 *
 *      • Parâmetro `ordenar_por` (query string): aceita 'recentes'
 *        (default — criado_em desc), 'empresa' (email_empresas.nome asc),
 *        'nome' (email_leads.nome asc), 'cargo' (cargo asc com NULLs
 *        no final). Mapa de ordenações usa whitelist — qualquer valor
 *        desconhecido cai no default 'recentes'.
 *
 *      • Batch lookup de responsáveis: após buscar a página de leads,
 *        coleta os `reservado_por` únicos e faz UM SELECT em `app_users`
 *        (id, nome_usuario). Cada lead é enriquecido com
 *        `reservado_por_nome` (string | null) antes da resposta.
 *        Custo: 1 query extra por página, sem N+1. Alinhado com o
 *        padrão usado em `listar_respostas` para empresa/campanha.
 *
 *    Sem mudança de schema, sem migration. Sem impacto em outras
 *    actions.
 *
 *  - v1.13 (13/06/2026 — Reorganização Prospect/Lead + LGPD eterna):
 *    Três cirurgias para alinhar o backend com a nova organização de abas
 *    da Base de Leads (BaseLeadsPage v1.7) e com a regra LGPD permanente
 *    de que lead em opt-out NUNCA é deletado, apenas omitido das
 *    listagens "ativas":
 *
 *      • Action `listar_leads`: passa a filtrar `opt_out IS NOT TRUE`
 *        (defesa de NULL embutida via `.not('opt_out', 'is', true)`).
 *        Resultado: aba "Meus Leads" mostra somente a base ATIVA;
 *        leads em opt-out continuam vivos no banco mas invisíveis nessa
 *        listagem. Eles aparecem APENAS na aba "Opt-Out" dedicada
 *        (consumida via /api/crm-config v1.1).
 *
 *      • Action `stats`: contadores `total_leads`, `total_prospects` e
 *        `total_clientes` passam a EXCLUIR opt-outs (mesmo filtro acima).
 *        Reflete a base operacional disponível para campanhas.
 *        `total_optout` continua somando `email_optout` integralmente.
 *
 *      • Action `listar_respostas`: REMOVIDO o merge histórico que
 *        incluía entradas de `email_optout` no feed. Agora a aba
 *        "Respostas Campanhas" mostra exclusivamente itens de
 *        `email_respostas` (replies reais). Centraliza opt-outs
 *        (manuais e automáticos) na aba "Opt-Out".
 *
 *    Sem mudança de schema, sem migration. Sem impacto em endpoints
 *    de cron/webhook. Tipo `ItemInbox` mantém 'opt_out' no union por
 *    defesa em camadas (clientes antigos podem ter cache), mas
 *    nenhum item desse tipo é produzido pelo backend a partir desta
 *    versão.
 *
 *  - v1.12.1 (11/06/2026 — HOTFIX ESM): adicionada extensão `.js` no
 *    import relativo `'./_helpers/aplicar-opt-out'` → `'./_helpers/aplicar-opt-out.js'`.
 *    Node.js em ESM strict mode (runtime Vercel) exige extensão explícita.
 *    Sem ela, o módulo crasha com ERR_MODULE_NOT_FOUND e TODAS as actions
 *    do endpoint param de funcionar — incluindo `listar_responsaveis_lead`
 *    que alimenta o select "Reservado para" do LeadFormModal.
 *
 *  - v1.12 (11/06/2026 — Bloco 1 do plano OPT-OUT 100%): REFACTOR cirúrgico
 *    da action POST `desabilitar_lead`. Os 4 passos da cascata foram
 *    extraídos para o helper compartilhado `api/_helpers/aplicar-opt-out.ts`.
 *    A action agora apenas valida parâmetros e delega ao helper com
 *    origem='manual'. Comportamento externo PRESERVADO — o frontend
 *    (LeadFormModal v1.2 / useLeads v1.1) continua recebendo {success,
 *    lead_id, email, ja_estava_optout, total_cancelados, motivo}.
 *    Motivação: o mesmo helper serve os outros 3 caminhos de opt-out
 *    (webhook complained, POST RFC 8058, GET link rodapé). Elimina
 *    duplicação e garante consistência da auditoria LGPD.
 *
 *  - v1.11 (10/06/2026 — Auto-bounce + Opt-out cascading): suporte às
 *    decisões consolidadas no CHECKPOINT_2026-06-10.md (Prioridades 1 e 2).
 *
 *      • PATCH `atualizar_lead`: detecta mudança do campo `email`. Se mudou
 *        E o lead estava com `bounced=true`, automaticamente reseta as 3
 *        colunas (bounced=false, bounced_em=null, bounced_motivo=null) e
 *        registra no histórico tipo='bounce_resetado'. Análogo ao reset
 *        natural — o analista corrigiu o endereço, o "estado de bounced"
 *        do lead anterior não se aplica ao novo email.
 *        Justificativa P1.1: bounce marca o lead como inválido para o
 *        endereço que falhou. Ao mudar o endereço, o lead "fica saudável
 *        de novo" automaticamente — sem precisar de botão manual.
 *
 *      • GET `listar_leads_para_vinculo_em_lote`: adicionado filtro
 *        `bounced != true` (defesa em profundidade contra reuso de lead
 *        sabidamente inválido). Combina com filtros existentes de
 *        apto_campanha, opt_out, funil_status!=perdido e CRECI.
 *
 *      • Helper `vincularLeadACampanha`: nova validação 7-A entre as
 *        validações 7 (opt-out) e 8 (insert do vínculo): rejeita o lead
 *        se `lead.bounced === true`. Mensagem de erro estruturada para o
 *        frontend (ex.: "Email do lead deu hard bounce — corrija o endereço
 *        antes de vincular.").
 *
 *      • POST `desabilitar_lead` (NOVA action): opt-out manual disparado
 *        por gestor/admin via UI (LeadDetailDrawer). Cascata completa:
 *           1. UPDATE email_leads SET opt_out=true, opt_out_em=NOW()
 *           2. UPSERT email_optout (motivo='opt_out_manual', criado_por)
 *           3. UPDATE email_fila SET status='cancelado',
 *              motivo_cancelamento='opt_out_manual' para todos pendentes
 *              desse email em TODAS as campanhas (decisão P2 cascading)
 *           4. INSERT email_lead_historico (tipo='opt_out_manual')
 *        Conforme decisão P2.1 — opt-out é IRREVERSÍVEL (LGPD). Não há
 *        action de "reativar" — atalho consciente: omitido por contrato.
 *
 *      • Helper `vincularLeadACampanha` validação 7 (opt-out) atualizada
 *        para também consultar `email_leads.opt_out` (defesa em camadas —
 *        antes consultava apenas email_optout). Ambas as fontes
 *        bloqueiam o vínculo.
 *
 *    Dependência SQL: `2026-06-10_email_leads_bounce_handling.sql`
 *    (colunas bounced/bounced_em/bounced_motivo em email_leads e
 *    motivo_cancelamento em email_fila).
 *
 *  - v1.10 (10/06/2026 — CRECI condicional): refinamento da regra CRECI
 *    em ambas as actions de vinculação em lote, para resolver o problema
 *    do pessoal CRECI ficar IMPEDIDO de vincular leads CRECI a campanhas
 *    CRECI via essa aba (a v1.9 excluía indiscriminadamente todos leads
 *    CRECI). A regra "CRECI não muda de vertical" continua bidirecional:
 *
 *      • GET `listar_leads_para_vinculo_em_lote`: agora aceita query
 *        param `vertical_destino`:
 *          - Se vertical_destino === 'CRECI': filtra `vertical = 'CRECI'`
 *            (mostra APENAS leads CRECI — vincula sem alteração)
 *          - Se vertical_destino ≠ 'CRECI': filtra `vertical != 'CRECI'`
 *            (exclui CRECI — leads CRECI não podem virar outra vertical)
 *          - Se vertical_destino ausente: comportamento de fallback v1.9
 *            (exclui CRECI — para retrocompatibilidade defensiva)
 *
 *      • POST `vincular_em_lote_a_campanha`:
 *          - Quando vertical_destino === 'CRECI':
 *              * Rejeita leads com vertical ≠ 'CRECI' ("não pode virar CRECI")
 *              * NÃO dispara UPDATE em email_leads.vertical (já são CRECI)
 *              * NÃO conta como "vertical_alterada" no resultado
 *          - Quando vertical_destino ≠ 'CRECI':
 *              * Rejeita leads com vertical === 'CRECI' (já fazia em v1.9)
 *              * Altera vertical normalmente se diferente
 *
 *  - v1.9 (10/06/2026 — Vinculação em Lote): adiciona 2 actions para a
 *    nova aba "Vincular em Lote" do form Empresas & Leads
 *    (BaseLeadsPage.tsx v1.5):
 *
 *      • GET `listar_leads_para_vinculo_em_lote` — lista leads aptos,
 *        não opt-out, não-perdidos e NÃO vinculados a campanhas em
 *        andamento. RBAC: filtra por reservado_por (se não-admin).
 *        🛡️ REGRA CRECI BIDIRECIONAL: exclui automaticamente leads
 *        com vertical='CRECI' (lead CRECI nunca muda de vertical).
 *
 *      • POST `vincular_em_lote_a_campanha` — vincula N leads a uma
 *        campanha em uma única operação:
 *          1. Valida vertical_destino ≠ 'CRECI' (defesa em profundidade)
 *          2. Valida campanha.tipo === vertical_destino
 *          3. Para cada lead:
 *             a. Bloqueia se lead.vertical === 'CRECI' (não muda)
 *             b. Se lead.vertical ≠ vertical_destino → UPDATE vertical
 *                + registra histórico 'vertical_alterada'
 *             c. Chama helper `vincularLeadACampanha` (Fase A v1.8) com
 *                as 7 validações + enfileiramento condicional em email_fila
 *        Resultado estruturado: { sucessos, falhas[], verticais_alteradas }.
 *        Loop não-transacional — falha individual não bloqueia os demais.
 *
 *  - v1.8 (09/06/2026 — Fase A): atalho "promover + vincular a campanha"
 *    em uma única operação. Duas mudanças principais:
 *
 *      • Action `promover_para_campanha` agora aceita `campanha_id`
 *        OPCIONAL no body. Quando informado, o lead criado (ou o lead
 *        pré-existente, em caso de "ja_existia") é vinculado à campanha
 *        e — se a campanha já tem inicio_envio (status ativa/pausada) —
 *        é enfileirado em `email_fila` com a MESMA lógica de delays
 *        acumulados usada na ativação inicial (crm-campanhas.ts v1.6
 *        Fase 5A). Para status='agendada' (inicio_envio NULL) o vínculo
 *        é criado mas o enfileiramento fica a cargo da futura ativação.
 *        Validações em camadas (defesa em profundidade):
 *          (a) campanha existe e status IN ('ativa','pausada','agendada');
 *          (b) data_encerramento IS NULL OR >= hoje (Fase B v1.10);
 *          (c) campanha.tipo === lead.vertical (Fase B trava);
 *          (d) campanha.responsavel_id === lead.reservado_por (Fase B);
 *          (e) lead não está em outra campanha ativa/pausada/agendada
 *              (regra de duplicação - decisão produto 09/06/2026);
 *          (f) email não está em opt-out global.
 *        Helper `vincularLeadACampanha` extraído ao final do arquivo
 *        para reuso entre o caminho "lead novo" e "lead já existia"
 *        (no segundo caso, apenas vincula sem criar email_lead).
 *
 *      • BUG FIX preexistente: o INSERT em email_leads do
 *        promover_para_campanha NÃO populava `reservado_por`, o que
 *        deixava o lead inelegível para qualquer campanha (a Fase B
 *        trava exige reservado_por === campanha.responsavel_id). Sem
 *        esse fix, a action `listar_campanhas_disponiveis_para_lead`
 *        sempre retornaria vazio para leads vindos do Prospect Engine.
 *        Correção: herda `prospect.reservado_por` (campo já populado
 *        em prospect_leads desde o salvamento da pesquisa). Também
 *        populamos `apto_campanha=true` + `apto_campanha_em/por` para
 *        ficar consistente com a action `criar_lead` (v1.7) — o lead
 *        promovido nasce apto a campanhas.
 *
 *    Frontend complementar: ProspectSearchPage.tsx passa a abrir o
 *    SelecionarCampanhaModal.tsx antes de chamar esta action; o modal
 *    consulta `crm-campanhas?action=listar_campanhas_disponiveis_para_lead`
 *    e devolve `campanha_id` (ou null para "só CRM").
 *
 *  - v1.0 (13/05/2026): criado como api/campaign-leads.ts
 *  - v1.1 (30/05/2026): adicionada action 'promover_para_campanha' +
 *    UPDATE de prospect_leads.status='no_crm' em importar_prospects
 *  - v1.2 (30/05/2026 - Fase 1E): renomeado para api/crm-leads.ts
 *    (nome semanticamente correto — CRUD do CRM, não de campanhas).
 *  - v1.3 (04/06/2026 - Fase 8-Inbox): novas actions GET para alimentar
 *    as abas "Respostas" e "Inválidos" do Form Empresas & Leads:
 *      • listar_respostas — UNION em camada Node de email_respostas +
 *        email_optout, com lookups de lead/empresa/campanha em batch
 *        (1 query por tabela, evita N+1).
 *      • listar_invalidos — email_fila WHERE status IN ('bounce','erro'),
 *        com joins para lead+empresa+campanha.
 *  - v1.4 (04/06/2026 - Fase 8-fix): correção do bug
 *    "Could not find the 'email_empresas' column of 'email_leads'"
 *    nas actions PATCH `atualizar_lead` e `atualizar_empresa`. Causa:
 *    o frontend trazia o JOIN embed (ex.: `email_empresas`) no objeto
 *    e enviava de volta no PATCH; o PostgREST tentava `UPDATE` na
 *    coluna fantasma e falhava. Solução: whitelist explícita das
 *    colunas editáveis (defesa em profundidade) — qualquer campo fora
 *    da whitelist é silenciosamente ignorado, protegendo também
 *    contra futuras adições de JOINs e contra mutação de campos
 *    calculados (contadores, timestamps de webhook).
 *  - v1.5 (04/06/2026 - Fase 8-fix2): action `stats` agora também
 *    devolve `total_respostas` (rows em `email_respostas`) e
 *    `total_invalidos` (rows em `email_fila` com status bounce/erro).
 *    Motivação: os badges das abas "Respostas" e "Inválidos" no
 *    BaseLeadsPage ficavam zerados até o usuário clicar (porque os
 *    respectivos hooks só carregavam sob demanda). Com `stats`
 *    devolvendo os totais agregados no mount, o badge fica sempre
 *    correto sem custo extra de requisições.
 *  - v1.6 (05/06/2026 - HOTFIX Production): adicionada action
 *    `promover_corretor_para_campanha` que estava ausente apesar de
 *    documentada no CHECKPOINT_2026-06-02. Sintoma em Production:
 *    erro 400 "Ação POST desconhecida: promover_corretor_para_campanha"
 *    quando a SDR clica em "+ Campanha" no módulo CRECI. Causa
 *    provável: regressão em algum merge entre 02/06 e 04/06.
 *    Implementação espelha `promover_para_campanha` adaptada à
 *    realidade de PF (corretor não tem empresa): empresa_id=null,
 *    vertical='CRECI', origem='creci', cargo='Corretor de Imóveis'.
 *    Email priorizado: email_creci > email_pessoal (falha se ambos
 *    vazios). Marca data_envio_adv no corretor (igual ao Prospect
 *    Engine marca status='no_crm'). Idempotente: se já existe lead
 *    com o mesmo email, apenas sincroniza data_envio_adv e retorna
 *    ja_existia=true.
 *  - v1.7 (05/06/2026 - Lead RBAC fix): novas funcionalidades para o
 *    LeadFormModal v1.1 — leads criados via "Novo Lead" agora entram
 *    com vertical/apto/reservado_por corretamente populados:
 *      • Nova action GET `listar_responsaveis_lead`: retorna usuários
 *        com tipo_usuario IN ('Gestão Comercial','SDR'). Usado pelo
 *        Admin no LeadFormModal para escolher para quem o lead será
 *        reservado.
 *      • Action `criar_lead`: passou a aceitar `vertical`,
 *        `apto_campanha` e `reservado_por` no body; valida que
 *        `vertical` (NOT NULL após esse fix), `apto_campanha`
 *        (boolean, default true) e `reservado_por` (FK app_users)
 *        sejam consistentes. Grava no INSERT em email_leads.
 *      • Whitelist `COLUNAS_EDITAVEIS_LEAD` (v1.4): adicionados
 *        `vertical`, `apto_campanha`, `reservado_por` à lista de
 *        colunas editáveis via PATCH `atualizar_lead`. Sem isso, o
 *        Admin não conseguiria corrigir a vertical de um lead já
 *        existente.
 *    Combinação dos 3 garante que a action `leads_disponiveis` da
 *    campanha encontre o lead no seletor de vínculo (era o sintoma
 *    reportado pela Débora SDR em 05/06/2026 com 3 leads de teste
 *    invisíveis em campanha).
 *
 * Endpoints:
 * GET  ?action=listar_empresas[&busca=X&setor=X&page=1&limit=20]
 * GET  ?action=detalhe_empresa&id=X
 * GET  ?action=listar_leads[&empresa_id=X&funil=X&busca=X&page=1&limit=30]
 * GET  ?action=detalhe_lead&id=X  (inclui timeline + campanhas)
 * GET  ?action=buscar_global&q=X  (busca por nome empresa/domínio/email lead)
 * GET  ?action=stats                (contadores gerais)
 * GET  ?action=listar_respostas[&busca=X&page=1&limit=30]   (🆕 v1.3 — Fase 8)
 * GET  ?action=listar_invalidos[&busca=X&page=1&limit=30]   (🆕 v1.3 — Fase 8)
 * GET  ?action=listar_responsaveis_lead                     (🆕 v1.7 — Lead RBAC fix; retorna GC + SDR)
 * POST action=criar_empresa
 * POST action=criar_lead                                    (🔧 v1.7 — aceita vertical, apto_campanha, reservado_por)
 * POST action=importar_prospects    (importa de prospect_leads → email_leads/email_empresas)
 * POST action=promover_para_campanha (1 prospect → email_leads; marca status='no_crm')
 * POST action=promover_corretor_para_campanha (🆕 v1.6 — 1 corretor CRECI → email_leads; marca data_envio_adv)
 * PATCH action=atualizar_empresa    (🔧 v1.4 — whitelist de campos)
 * PATCH action=atualizar_lead       (🔧 v1.4 — whitelist de campos)
 * PATCH action=mudar_funil          (muda status funil + registra histórico)
 *
 * Caminho: api/crm-leads.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// 🆕 v1.12 — Helper compartilhado de opt-out (Bloco 1 OPT-OUT 100%)
// 🔧 v1.12.1 — Extensão .js obrigatória no path (Node.js ESM strict — Vercel runtime)
import { aplicarOptOut } from './_helpers/aplicar-opt-out.js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ════════════════════════════════════════════════════════════════════════
// 🆕 v1.25 (30/06/2026 — Pacote P2 "CRM E-mail") — CONSTANTES/HELPERS DE ENVIO
// ════════════════════════════════════════════════════════════════════════
// Duplicações intencionais de api/cron/disparar-fila.ts (v1.13). Quando
// consolidar, mover para api/_lib/render-assinatura.ts + api/_lib/resend.ts
// e importar dos dois lados. Manter sincronia até lá.

/** Endpoint REST da Resend (NÃO usar SDK — descarta reply_to silenciosamente). */
const RESEND_API_URL = 'https://api.resend.com/emails';

/** Domínio-base do plus-alias de captura de respostas. */
const DOMINIO_REPLY_TO_OUTBOUND = 'techfor.com.br';

/**
 * Renderiza a assinatura em HTML — IDÊNTICA à do disparar-fila v1.13.
 * Mantida local para evitar acoplamento de bundling.
 * Para Pacote P2, o `unsubscribeUrl` não é passado (a mensagem outbound
 * de resposta direta não precisa de mecanismo de descadastro RFC 8058 —
 * o lead já está em conversa ativa, opt-out segue pelo fluxo manual).
 */
function renderAssinaturaP2(a: any, unsubscribeUrl?: string): string {
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

/**
 * Determina o sufixo de ambiente para o plus-alias do Reply-To.
 * Production: vazio (sem sufixo, mais limpo comercialmente).
 * Preview:    `+test` (filtra webhook por ambiente — v1.8 do disparar-fila).
 */
function sufixoAmbienteOutbound(): string {
  return process.env.VERCEL_ENV === 'production' ? '' : '+test';
}

// ════════════════════════════════════════════════════════════════════════
// 🆕 v1.4 — WHITELIST DE CAMPOS EDITÁVEIS
// ════════════════════════════════════════════════════════════════════════
// O frontend traz objetos com JOIN embed (ex.: email_leads.email_empresas,
// vindo do `.select('*, email_empresas(...)')`) que NÃO são colunas reais
// da tabela. Sem essa whitelist, ao salvar a edição o PostgREST devolve:
//   "Could not find the 'email_empresas' column of 'email_leads'"
//
// A whitelist também serve como defesa em profundidade contra mutação
// indevida de:
//   - contadores incrementados pelo webhook (total_emails_recebidos, etc.)
//   - timestamps automáticos (criado_em, opt_out_em, ultimo_email_*)
//   - flags calculadas (apto_campanha, score_engajamento)
//   - funil_status (deve ser atualizado pela action `mudar_funil` com
//     registro de histórico, não diretamente)
//
// Para incluir novo campo editável: ADICIONAR aqui + no LeadFormModal
// (ou EmpresaFormModal) na UI. Para campos somente leitura: deixar fora.

const COLUNAS_EDITAVEIS_LEAD = [
  'empresa_id',
  'nome',
  'email',
  'cargo',
  'telefone',
  'linkedin_url',
  'opt_out',
  'tags',
  'notas',
  'reservado_por',
  'origem',
  'prospect_lead_id',
  // 🆕 v1.7 (05/06/2026 — Lead RBAC fix)
  'vertical',
  'apto_campanha',
  // 🆕 v1.22 (23/06/2026 — Recuperação de Inválidos): permite que a
  //   action `recuperar_invalido_para_campanha` limpe esse campo (lead
  //   sai da aba Inválidos) e que o Admin possa corrigir manualmente
  //   via Editar Lead. Antes da v1.22, qualquer tentativa de limpar
  //   este campo era silenciosamente descartada por `pickEditable`.
  'motivo_invalidacao',
] as const;

const COLUNAS_EDITAVEIS_EMPRESA = [
  'nome',
  'dominio',
  'cnpj',
  'setor',
  'porte',
  'cidade',
  'uf',
  'website',
  'linkedin_url',
  'telefone_comercial',
  'observacoes',
  'origem',
] as const;

/**
 * 🆕 v1.15.1 (16/06/2026 — F8 FIX) — Tradução código → string visível para
 * o campo `email_leads.motivo_invalidacao`.
 *
 * A coluna armazena CÓDIGOS técnicos snake_case (validados pela CHECK
 * constraint `email_leads_motivo_invalidacao_valido`). A UI precisa de
 * strings em português legíveis. Este dicionário é a FONTE ÚNICA dessa
 * tradução — toda exibição de motivo na UI deve passar por aqui.
 *
 * Origem dos códigos:
 *   • Recovery 3.A (Production desde 13/06/2026): grava 'bounce', 'mx',
 *     'no_match' (resultados do motor Recovery).
 *   • F7 MVP: grava 'f7_pre_campanha' (lead invalidado antes da campanha).
 *   • Edição manual (PATCH atualizar_lead): grava 'edicao_manual'.
 *   • F8 webhook v1.15.1: grava 'mailbox_inexistente', 'caixa_lotada',
 *     'mx', 'bloqueado', 'servidor_indisponivel', 'bounce' (fallback).
 *
 * Se a coluna receber um código DESCONHECIDO (ex.: futuro código não
 * mapeado aqui), o backend retorna o próprio código para a UI — pior UX
 * mas não quebra a tela. Vale revisar este dicionário sempre que a
 * whitelist da CHECK constraint for ampliada.
 */
const TRADUCAO_MOTIVO_INVALIDACAO: Record<string, string> = {
  // Códigos pré-F8 (Recovery 3.A, F7, edição manual)
  bounce:                'Falha permanente',
  mx:                    'Domínio inválido',
  f7_pre_campanha:       'Invalidado antes da campanha',
  no_match:              'Recovery não encontrou',
  edicao_manual:         'Editado manualmente',
  // Códigos F8 (webhook v1.15.1)
  mailbox_inexistente:   'Email não existe',
  caixa_lotada:          'Caixa lotada',
  bloqueado:             'Email bloqueado',
  servidor_indisponivel: 'Servidor indisponível',
};

/**
 * Pega do `body` apenas os campos presentes na `whitelist`, ignorando
 * qualquer outro. Preserva valores `null` (necessário para limpar campos
 * — ex.: empresa_id = null).
 */
function pickEditable<T extends readonly string[]>(
  body: Record<string, any>,
  whitelist: T,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of whitelist) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 🔧 31/05/2026 (Fase 4C-fix): action sempre da query (useCrmApi); fallback body p/ compat.
    const action = (req.query.action ?? req.body?.action) as string;

    if (!action) {
      return res.status(400).json({ success: false, error: 'Parâmetro "action" é obrigatório' });
    }

    // ════════════════════════════════════════════
    // GET ACTIONS
    // ════════════════════════════════════════════
    if (req.method === 'GET') {

      // ── LISTAR EMPRESAS ──────────────────────────
      if (action === 'listar_empresas') {
        const { busca, setor, porte, page = '1', limit = '20' } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabase
          .from('email_empresas')
          .select('*', { count: 'exact' })
          .order('nome', { ascending: true })
          .range(offset, offset + parseInt(limit) - 1);

        if (busca) {
          // Busca por nome OU domínio
          query = query.or(`nome.ilike.%${busca}%,dominio.ilike.%${busca}%`);
        }
        if (setor) query = query.eq('setor', setor);
        if (porte) query = query.eq('porte', porte);

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({
          success: true,
          empresas: data || [],
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit)),
        });
      }

      // ── DETALHE EMPRESA ──────────────────────────
      if (action === 'detalhe_empresa') {
        const { id } = req.query as Record<string, string>;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        const { data: empresa, error: errEmpresa } = await supabase
          .from('email_empresas')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (errEmpresa) throw errEmpresa;
        if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

        // Buscar leads desta empresa
        const { data: leads, error: errLeads } = await supabase
          .from('email_leads')
          .select('*')
          .eq('empresa_id', id)
          .order('nome', { ascending: true });

        if (errLeads) throw errLeads;

        // Buscar campanhas que atingiram leads desta empresa
        const leadIds = (leads || []).map(l => l.id);
        let campanhas: any[] = [];

        if (leadIds.length > 0) {
          const { data: vinculosCampanha } = await supabase
            .from('email_lead_campanhas')
            .select('campanha_id, lead_id, status, step_atual, email_campanhas(id, nome, status, tipo, total_enviados, total_abertos, taxa_abertura)')
            .in('lead_id', leadIds);

          campanhas = vinculosCampanha || [];
        }

        return res.status(200).json({
          success: true,
          empresa,
          leads: leads || [],
          campanhas,
          total_leads: leads?.length || 0,
        });
      }

      // ── LISTAR LEADS ─────────────────────────────
      if (action === 'listar_leads') {
        const {
          empresa_id,
          funil,
          busca,
          tags,
          page = '1',
          limit = '30',
          ordenar_por = 'recentes',          // 🆕 v1.14
          // 🆕 v1.20 — RBAC de visibilidade na aba "Meus Leads" da Base de Leads.
          //   Recebe quem é o usuário corrente para aplicar a regra:
          //     - Admin       : vê tudo (sem filtro)
          //     - SDR         : vê todos CRECI + apenas seus em outras verticais
          //     - GC          : NUNCA vê CRECI + apenas onde é reservado_por
          //   Decisão de produto (Messias, 22/06/2026 — sessão final do dia):
          //     "Cada GC/SDR vê apenas leads gerados/gravados por eles
          //     (reservado_por). Leads CRECI aparecem só no Form CRECI
          //     para o GC que inseriu. Quando movidos para Base de Leads,
          //     somente SDR/Admin podem ver e mover para Campanha CRECI."
          current_user_id,
          current_user_tipo,
          // 🆕 v1.23 (30/06/2026) — Filtros opcionais do operador. Ver cabeçalho
          //   do arquivo para a justificativa de produto e UX.
          incluir_creci,     // '1' (default) | '0' (esconde CRECI)
          analista_filter,   // 'mine' | 'unassigned' | 'mine_or_unassigned' | 'all' | <id_num>
        } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // 🆕 v1.20 — Validação defensiva. Sem currentUser, NÃO é seguro listar.
        //   O frontend (useLeads v1.3) sempre passa esses 2 params. Se chegou
        //   sem eles, é caller mal configurado ou tentativa de bypass — recusamos.
        if (!current_user_id || !current_user_tipo) {
          return res.status(400).json({
            success: false,
            error:
              'Parâmetros obrigatórios ausentes: current_user_id e current_user_tipo. ' +
              'A action listar_leads requer identificação do usuário corrente para aplicar RBAC.',
          });
        }
        const currentUserIdNum = parseInt(current_user_id);
        if (isNaN(currentUserIdNum) || currentUserIdNum < 1) {
          return res.status(400).json({
            success: false,
            error: `current_user_id inválido: "${current_user_id}"`,
          });
        }

        let query = supabase
          .from('email_leads')
          .select('*, email_empresas(id, nome, dominio, setor)', { count: 'exact' })
          .range(offset, offset + parseInt(limit) - 1);

        // 🆕 v1.13 (13/06/2026 — Reorganização Prospect/Lead + LGPD):
        //   Excluir leads em opt-out da listagem "Meus Leads".
        //   Eles continuam vivos na base (regra LGPD permanente — opt-out
        //   é eterno, jamais deletado), mas aparecem APENAS na aba "Opt-Out".
        query = query.not('opt_out', 'is', true);

        // 🆕 v1.15 (16/06/2026 — F8): excluir leads em estado terminal de
        //   invalidação. Critério D2 (decidido com PO em 16/06/2026):
        //     bounced=true  OR  motivo_invalidacao IS NOT NULL
        //   Esses leads aparecem EXCLUSIVAMENTE na aba "Inválidos"
        //   (action listar_invalidos abaixo). Sem isso, eles apareceriam
        //   em ambas as abas — pior UX e risco operacional (analista
        //   tentando reativar lead já bouncedo).
        //
        //   Defesa em camadas: o filtro aqui replica o critério usado pelo
        //   listar_invalidos abaixo. Single source of truth seria uma view
        //   SQL, mas a duplicação é pequena e local.
        query = query.not('bounced', 'is', true);
        query = query.is('motivo_invalidacao', null);

        // 🆕 v1.20 (22/06/2026) — RBAC de visibilidade na aba "Meus Leads".
        //   Aplicado APÓS os filtros de elegibilidade (opt_out, bounced,
        //   motivo_invalidacao) e ANTES dos filtros opcionais do operador
        //   (busca, funil, tags) — esses são REFINAMENTOS por cima do RBAC.
        //
        //   Mapa:
        //     Admin             → sem filtro adicional (vê tudo)
        //     SDR               → (vertical=CRECI) OR (reservado_por=userId)
        //     Gestão Comercial  → (vertical!=CRECI) AND (reservado_por=userId)
        //     outros tipos      → bloqueio defensivo (lista vazia)
        //
        //   Justificativa por perfil:
        //     - SDR distribui CRECI (regra B1 de 22/06/2026), portanto precisa
        //       ver todos os leads CRECI mesmo quando reservado_por != ele
        //       (incluindo reservado_por=NULL — leads recém-promovidos do CreciPage).
        //     - GC executa em verticais não-CRECI sobre leads sob sua
        //       responsabilidade. CRECI fica EXCLUSIVAMENTE no Form CRECI →
        //       aba "Meus Leads Salvos", para o GC que capturou.
        //
        //   Idempotência com outros filtros: este RBAC é AND-composto com os
        //   filtros opcionais (busca, funil, tags), garantindo que um GC NUNCA
        //   veja leads de outras pessoas mesmo via filtros refinados.
        if (current_user_tipo === 'Administrador') {
          // Sem filtro adicional — Admin vê tudo
        } else if (current_user_tipo === 'SDR') {
          // SDR: vê todos CRECI + apenas seus em outras verticais
          query = query.or(`vertical.eq.CRECI,reservado_por.eq.${currentUserIdNum}`);
        } else if (current_user_tipo === 'Gestão Comercial') {
          // GC: NUNCA vê CRECI + apenas onde é reservado_por
          query = query.neq('vertical', 'CRECI');
          query = query.eq('reservado_por', currentUserIdNum);
        } else {
          // Perfis não mapeados (ex.: futuros tipos) — fail-safe: lista vazia.
          //   Preferimos retornar 0 leads a expor tudo por default.
          //   Quando um novo tipo for criado, esta action precisa de adição
          //   explícita acima, não cair no default.
          query = query.eq('id', -1);
        }

        // 🆕 v1.14 (13/06/2026) — Ordenação configurável.
        //   Whitelist defensiva — qualquer valor desconhecido em
        //   `ordenar_por` cai no default 'recentes'.
        //   • 'recentes' → criado_em desc (default)
        //   • 'empresa'  → email_empresas.nome asc (foreignTable)
        //   • 'nome'     → email_leads.nome asc
        //   • 'cargo'    → cargo asc (NULLs no final)
        switch (ordenar_por) {
          case 'empresa':
            query = query.order('nome', {
              ascending: true,
              foreignTable: 'email_empresas',
              nullsFirst: false,
            });
            break;
          case 'nome':
            query = query.order('nome', { ascending: true });
            break;
          case 'cargo':
            query = query.order('cargo', { ascending: true, nullsFirst: false });
            break;
          case 'recentes':
          default:
            query = query.order('criado_em', { ascending: false });
            break;
        }

        // ════════════════════════════════════════════════════════════
        // 🆕 v1.23 (30/06/2026) — Filtros opcionais do operador
        // ════════════════════════════════════════════════════════════
        // Aplicados AND-composto com o RBAC já vigente. Ver cabeçalho do
        // arquivo para detalhes de justificativa de produto.
        //
        // ATENÇÃO ARQUITETURAL: estes filtros são REFINAMENTOS por cima
        // do RBAC — nunca AMPLIAM a visibilidade. Por isso:
        //   - 'all' só faz sentido para Admin (que não tem teto).
        //   - 'mine_or_unassigned' para SDR ainda respeita "vertical=CRECI
        //     OR reservado_por=X" do RBAC: SDR jamais verá leads não-CRECI
        //     de outros mesmo pedindo "sem analista".
        //   - GC com 'mine' é redundante mas idempotente.

        // (A) Esconder CRECI: AND com vertical != 'CRECI'.
        //   Para SDR, isso colapsa o OR do RBAC (CRECI vira false), deixando
        //   apenas "reservado_por = X AND vertical != CRECI" — exatamente
        //   o intencionado.
        if (incluir_creci === '0') {
          query = query.neq('vertical', 'CRECI');
        }

        // (B) Filtro de analista (reservado_por).
        if (analista_filter) {
          if (analista_filter === 'mine') {
            query = query.eq('reservado_por', currentUserIdNum);
          } else if (analista_filter === 'unassigned') {
            query = query.is('reservado_por', null);
          } else if (analista_filter === 'mine_or_unassigned') {
            query = query.or(
              `reservado_por.eq.${currentUserIdNum},reservado_por.is.null`
            );
          } else if (analista_filter === 'all') {
            // Sem filtro adicional — só Admin tem direito ao 'all' (frontend
            // bloqueia para outros perfis; defesa em profundidade aqui é
            // implícita pelo RBAC: SDR/GC já não veem leads de outros).
          } else {
            // Tentativa de id numérico (Admin escolhe outro analista no dropdown).
            const idOutroAnalista = parseInt(analista_filter, 10);
            if (!isNaN(idOutroAnalista) && idOutroAnalista > 0) {
              query = query.eq('reservado_por', idOutroAnalista);
            }
            // Valor não reconhecido → ignora silenciosamente (degrada para
            // o comportamento RBAC base). NÃO retornamos erro porque o
            // frontend pode ter passado vazio em transição de estado.
          }
        }

        if (empresa_id) query = query.eq('empresa_id', empresa_id);
        if (funil) query = query.eq('funil_status', funil);
        if (busca) {
          query = query.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%,cargo.ilike.%${busca}%`);
        }
        if (tags) {
          const tagsArray = tags.split(',').map(t => t.trim());
          query = query.overlaps('tags', tagsArray);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        // 🆕 v1.14 (13/06/2026) — Batch lookup de responsáveis.
        //   Coleta `reservado_por` únicos da página atual e faz 1 SELECT
        //   em `app_users`. Cada lead recebe `reservado_por_nome` como
        //   projeção computada (não persistida) — consumida pela coluna
        //   ANALISTA da LeadsTab v1.1.
        const responsavelIds = Array.from(
          new Set((data || []).map((l: any) => l.reservado_por).filter(Boolean))
        ) as number[];

        const responsaveisPorId: Record<number, string> = {};
        if (responsavelIds.length > 0) {
          const { data: resps, error: errResp } = await supabase
            .from('app_users')
            .select('id, nome_usuario')
            .in('id', responsavelIds);
          // Falha aqui é não-fatal — degrada graciosamente para "—" na UI.
          if (!errResp) {
            for (const r of resps || []) responsaveisPorId[r.id] = r.nome_usuario;
          } else {
            console.warn('[listar_leads] Falha ao resolver responsáveis:', errResp.message);
          }
        }

        const leadsEnriquecidos = (data || []).map((l: any) => ({
          ...l,
          reservado_por_nome:
            l.reservado_por != null ? responsaveisPorId[l.reservado_por] ?? null : null,
        }));

        return res.status(200).json({
          success: true,
          leads: leadsEnriquecidos,
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit)),
        });
      }

      // ── DETALHE LEAD (com timeline + campanhas) ──
      if (action === 'detalhe_lead') {
        const { id } = req.query as Record<string, string>;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // Lead + empresa
        const { data: lead, error: errLead } = await supabase
          .from('email_leads')
          .select('*, email_empresas(id, nome, dominio, setor, porte, cidade, uf)')
          .eq('id', id)
          .maybeSingle();

        if (errLead) throw errLead;
        if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

        // Timeline (últimos 100 eventos)
        const { data: historico } = await supabase
          .from('email_lead_historico')
          .select('*, email_campanhas(nome)')
          .eq('lead_id', id)
          .order('criado_em', { ascending: false })
          .limit(100);

        // Campanhas vinculadas
        const { data: campanhas } = await supabase
          .from('email_lead_campanhas')
          .select('*, email_campanhas(id, nome, status, tipo, criado_em)')
          .eq('lead_id', id)
          .order('adicionado_em', { ascending: false });

        // Respostas
        const { data: respostas } = await supabase
          .from('email_respostas')
          .select('*, email_campanhas(nome)')
          .eq('lead_id', id)
          .order('recebido_em', { ascending: false })
          .limit(20);

        // Emails enviados
        const { data: emailsEnviados } = await supabase
          .from('email_fila')
          .select('*, email_campanhas(nome), email_campanha_steps(ordem, assunto)')
          .eq('lead_id', id)
          .order('agendado_para', { ascending: false })
          .limit(50);

        return res.status(200).json({
          success: true,
          lead,
          historico: historico || [],
          campanhas: campanhas || [],
          respostas: respostas || [],
          emails_enviados: emailsEnviados || [],
        });
      }

      // ── BUSCA GLOBAL ─────────────────────────────
      if (action === 'buscar_global') {
        const { q } = req.query as Record<string, string>;
        if (!q || q.length < 2) {
          return res.status(400).json({ success: false, error: 'Busca precisa de ao menos 2 caracteres' });
        }

        // Buscar empresas por nome ou domínio
        const { data: empresas } = await supabase
          .from('email_empresas')
          .select('id, nome, dominio, setor, total_leads')
          .or(`nome.ilike.%${q}%,dominio.ilike.%${q}%`)
          .order('nome')
          .limit(10);

        // Buscar leads por nome, email ou cargo
        const { data: leads } = await supabase
          .from('email_leads')
          .select('id, nome, email, cargo, funil_status, email_empresas(id, nome)')
          .or(`nome.ilike.%${q}%,email.ilike.%${q}%`)
          .order('nome')
          .limit(10);

        return res.status(200).json({
          success: true,
          empresas: empresas || [],
          leads: leads || [],
          total: (empresas?.length || 0) + (leads?.length || 0),
        });
      }

      // ── STATS (contadores gerais) ────────────────
      if (action === 'stats') {
        // 🆕 v1.20 — RBAC nos KPIs. O contador "LEADS" do header da página
        //   "Base de Leads" precisa refletir o universo VISÍVEL ao usuário
        //   logado, não o universo absoluto. Sem isso, GC veria "LEADS: 1692"
        //   mas só conseguiria abrir os seus N — divergência confusa.
        //
        // 🆕 v1.22 (23/06/2026) — RBAC EXTENDIDO para mais 3 contadores:
        //   total_respostas, total_invalidos e total_optout. Sem isso,
        //   badges das abas mostravam totais GLOBAIS mas listagens abriam
        //   vazias (caso Marcos Rossi/GC reportado por Messias 23/06).
        //   Decisão de produto: badges precisam refletir o que a listagem
        //   mostra. Regras replicam EXATAMENTE listar_respostas v1.21,
        //   listar_invalidos v1.21 e (para opt-out) regra simétrica via
        //   JOIN por email com email_leads RBAC-filtrado.
        //
        //   Contadores que permanecem GLOBAIS (sem decisão de produto):
        //     totalProspects, totalClientes, totalEmpresas, totalCampanhas.
        //
        //   Política de fallback (sem currentUser): todos os contadores
        //   com RBAC retornam 0 ao invés de erro. O endpoint /stats não
        //   é crítico de UI — a página renderiza, só com KPIs zerados,
        //   e o operador pode investigar (typically: useLeads não
        //   propagou currentUser por bug de integração).
        const currentUserIdRaw = req.query.current_user_id as string | undefined;
        const currentUserTipoStats = req.query.current_user_tipo as string | undefined;
        const currentUserIdNumStats = currentUserIdRaw ? parseInt(currentUserIdRaw) : NaN;
        const hasValidUser =
          !isNaN(currentUserIdNumStats) &&
          (currentUserTipoStats === 'Administrador' ||
           currentUserTipoStats === 'SDR' ||
           currentUserTipoStats === 'Gestão Comercial');

        const { count: totalEmpresas } = await supabase
          .from('email_empresas').select('id', { count: 'exact', head: true });

        // 🆕 v1.13 (13/06/2026 — Reorganização Prospect/Lead + LGPD):
        //   Os 3 contadores de funil agora EXCLUEM leads em opt-out
        //   para refletir a base ATIVA (que efetivamente pode receber
        //   campanhas). O contador total_optout abaixo continua mostrando
        //   o universo de descadastros (vivos eternamente — LGPD).
        // 🆕 v1.20 — totalLeads agora respeita o RBAC (vide cabeçalho acima).
        let queryTotalLeads = supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'lead')
          .not('opt_out', 'is', true);

        if (currentUserTipoStats === 'Administrador') {
          // Sem filtro adicional
        } else if (currentUserTipoStats === 'SDR' && !isNaN(currentUserIdNumStats)) {
          queryTotalLeads = queryTotalLeads.or(
            `vertical.eq.CRECI,reservado_por.eq.${currentUserIdNumStats}`
          );
        } else if (currentUserTipoStats === 'Gestão Comercial' && !isNaN(currentUserIdNumStats)) {
          queryTotalLeads = queryTotalLeads
            .neq('vertical', 'CRECI')
            .eq('reservado_por', currentUserIdNumStats);
        } else {
          // Sem currentUser → fail-safe: 0 (não trava a página)
          queryTotalLeads = queryTotalLeads.eq('id', -1);
        }

        const { count: totalLeads } = await queryTotalLeads;

        const { count: totalProspects } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'prospect')
          .not('opt_out', 'is', true);

        const { count: totalClientes } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'cliente')
          .not('opt_out', 'is', true);

        const { count: totalCampanhas } = await supabase
          .from('email_campanhas').select('id', { count: 'exact', head: true });

        // ════════════════════════════════════════════════════════════
        // 🆕 v1.22 — total_respostas COM RBAC
        // ════════════════════════════════════════════════════════════
        //   Replica EXATAMENTE a regra de listar_respostas v1.21:
        //   RBAC por dono da CAMPANHA (responsavel_id). Decisão de produto
        //   Messias 22/06/2026: "Cada Campanha é criada para um determinado
        //   GC/SDR" → operador só vê respostas das campanhas onde é dono.
        //
        //   Performance: pré-busca de IDs de campanhas (tipicamente <100
        //   por operador). Volume validado em produção pela v1.21.
        let totalRespostas: number = 0;
        if (currentUserTipoStats === 'Administrador') {
          const { count } = await supabase
            .from('email_respostas').select('id', { count: 'exact', head: true });
          totalRespostas = count || 0;
        } else if (hasValidUser) {
          const { data: campsDoUsuario } = await supabase
            .from('email_campanhas')
            .select('id')
            .eq('responsavel_id', currentUserIdNumStats);
          const campIds = (campsDoUsuario || []).map((c: any) => c.id);
          if (campIds.length > 0) {
            const { count } = await supabase
              .from('email_respostas').select('id', { count: 'exact', head: true })
              .in('campanha_id', campIds);
            totalRespostas = count || 0;
          }
          // Operador sem campanhas → totalRespostas continua 0.
        }
        // Sem currentUser válido → totalRespostas continua 0 (fail-safe).

        // ════════════════════════════════════════════════════════════
        // 🆕 v1.22 — total_invalidos COM RBAC
        // ════════════════════════════════════════════════════════════
        //   Replica EXATAMENTE a regra de listar_invalidos v1.21:
        //   RBAC por dono do LEAD (mesmo padrão de totalLeads v1.20).
        //
        // 🆕 v1.15 (16/06/2026 — F8): total_invalidos passa a contar LEADS,
        //   não eventos de email_fila. Critério D2:
        //     bounced=true  OR  motivo_invalidacao IS NOT NULL
        //   Filtro `not('opt_out', 'is', true)` defensivo: opt-out tem
        //   aba própria, não deve contar como inválido na aba Inválidos.
        let queryTotalInvalidos = supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .or('bounced.eq.true,motivo_invalidacao.not.is.null')
          .not('opt_out', 'is', true);

        if (currentUserTipoStats === 'Administrador') {
          // Sem filtro adicional — count global.
        } else if (currentUserTipoStats === 'SDR' && !isNaN(currentUserIdNumStats)) {
          queryTotalInvalidos = queryTotalInvalidos.or(
            `vertical.eq.CRECI,reservado_por.eq.${currentUserIdNumStats}`
          );
        } else if (currentUserTipoStats === 'Gestão Comercial' && !isNaN(currentUserIdNumStats)) {
          queryTotalInvalidos = queryTotalInvalidos
            .neq('vertical', 'CRECI')
            .eq('reservado_por', currentUserIdNumStats);
        } else {
          // Sem currentUser válido → fail-safe: 0
          queryTotalInvalidos = queryTotalInvalidos.eq('id', -1);
        }
        const { count: totalInvalidos } = await queryTotalInvalidos;

        // ════════════════════════════════════════════════════════════
        // 🆕 v1.22 — total_optout COM RBAC
        // ════════════════════════════════════════════════════════════
        //   Decisão Messias 23/06/2026: opt-outs cujo email corresponde
        //   a um LEAD VISÍVEL ao usuário (mesma regra de listar_invalidos).
        //
        //   email_optout NÃO tem FK direta para email_leads — só compartilha
        //   o campo `email`. Por isso é JOIN implícito via .in('email', [...]).
        //
        //   Performance:
        //     - Admin sempre vai pelo caminho rápido (count global, 1 query).
        //     - GC/SDR: pré-busca de emails (cap defensivo de 5000 leads).
        //       Marcos = 72 leads → trivial. Acima de 300 emails, chunking
        //       em blocos para não estourar URL do PostgREST.
        //     - SELECT email em email_leads é leve (campo indexado).
        const CAP_LEADS_PARA_RBAC_OPTOUT = 5000;
        const CHUNK_EMAILS_URL = 300;
        let totalOptOut: number = 0;
        if (currentUserTipoStats === 'Administrador') {
          const { count } = await supabase
            .from('email_optout').select('id', { count: 'exact', head: true });
          totalOptOut = count || 0;
        } else if (hasValidUser) {
          // Pré-busca de emails visíveis ao usuário, aplicando a MESMA regra
          // de RBAC do listar_invalidos (por dono do LEAD).
          let qEmails = supabase
            .from('email_leads')
            .select('email')
            .not('email', 'is', null)
            .limit(CAP_LEADS_PARA_RBAC_OPTOUT);
          if (currentUserTipoStats === 'SDR') {
            qEmails = qEmails.or(
              `vertical.eq.CRECI,reservado_por.eq.${currentUserIdNumStats}`
            );
          } else if (currentUserTipoStats === 'Gestão Comercial') {
            qEmails = qEmails
              .neq('vertical', 'CRECI')
              .eq('reservado_por', currentUserIdNumStats);
          }
          const { data: emailsData } = await qEmails;
          const emails = Array.from(new Set(
            ((emailsData || [])
              .map((r: any) => (r.email || '').toLowerCase().trim())
              .filter(Boolean) as string[])
          ));

          if (emails.length > 0) {
            // Chunking se exceder o tamanho seguro do URL PostgREST.
            if (emails.length <= CHUNK_EMAILS_URL) {
              const { count } = await supabase
                .from('email_optout').select('id', { count: 'exact', head: true })
                .in('email', emails);
              totalOptOut = count || 0;
            } else {
              let somaChunks = 0;
              for (let i = 0; i < emails.length; i += CHUNK_EMAILS_URL) {
                const chunk = emails.slice(i, i + CHUNK_EMAILS_URL);
                const { count } = await supabase
                  .from('email_optout').select('id', { count: 'exact', head: true })
                  .in('email', chunk);
                somaChunks += (count || 0);
              }
              // Como email é único em email_optout (UNIQUE constraint),
              // a soma dos chunks é correta sem risco de duplicação.
              totalOptOut = somaChunks;
            }
          }
          // Operador sem emails visíveis → totalOptOut continua 0.
        }
        // Sem currentUser válido → totalOptOut continua 0 (fail-safe).

        return res.status(200).json({
          success: true,
          stats: {
            total_empresas: totalEmpresas || 0,
            total_leads: totalLeads || 0,
            total_prospects: totalProspects || 0,
            total_clientes: totalClientes || 0,
            total_optout: totalOptOut,
            total_campanhas: totalCampanhas || 0,
            // 🆕 v1.22 — agora RBAC-filtrados (eram globais até v1.21)
            total_respostas: totalRespostas,
            total_invalidos: totalInvalidos || 0,
          }
        });
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.3 — INBOX DE RESPOSTAS (Aba "Respostas Campanhas" da Base de Leads)
      // ════════════════════════════════════════════════════════════
      //
      // 🆕 v1.13 (13/06/2026 — Reorganização Prospect/Lead):
      //   O MERGE de opt-outs FOI REMOVIDO desta action. Agora a aba
      //   "Respostas Campanhas" mostra APENAS respostas reais (`email_respostas`).
      //   Opt-outs (manuais e automáticos) vivem em sua aba própria
      //   "Opt-Out" (consumida via /api/crm-config?action=listar_optout
      //   com RBAC contextual). Decisão de produto + LGPD: centralizar
      //   descadastros na aba dedicada, sem ruído no inbox.
      //
      // Parâmetros aceitos:
      //   - busca: string (nome, email, assunto) — opcional, ilike
      //   - page, limit: paginação clássica (default 1 / 30)
      //
      // Resposta: { success, itens: RespostaInbox[], total, page, limit }
      if (action === 'listar_respostas') {
        const {
          busca = '',
          page = '1',
          limit = '30',
          // 🆕 v1.21 — RBAC por DONO DA CAMPANHA. Decisão de produto
          //   (Messias, 22/06/2026): "Cada Campanha é criada para um
          //   determinado GC/SDR" → cada operador recebe apenas respostas
          //   das campanhas onde é responsavel_id. Diferente do
          //   listar_invalidos (que é por dono do LEAD): aqui é por dono
          //   da CAMPANHA — a resposta é um evento da campanha, e quem
          //   está conduzindo é quem responde ao reply.
          current_user_id,
          current_user_tipo,
        } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);

        // 🆕 v1.21 — Validação defensiva
        if (!current_user_id || !current_user_tipo) {
          return res.status(400).json({
            success: false,
            error:
              'Parâmetros obrigatórios ausentes: current_user_id e current_user_tipo. ' +
              'A action listar_respostas requer identificação do usuário corrente para aplicar RBAC.',
          });
        }
        const currentUserIdNum = parseInt(current_user_id);
        if (isNaN(currentUserIdNum) || currentUserIdNum < 1) {
          return res.status(400).json({
            success: false,
            error: `current_user_id inválido: "${current_user_id}"`,
          });
        }

        // 🆕 v1.21 — Pré-cálculo das campanhas do usuário corrente.
        //   Para Admin: campanhaIdsPermitidas = null (sem restrição).
        //   Para outros: SELECT id FROM email_campanhas WHERE responsavel_id = userId.
        //   Volume típico esperado: dezenas de campanhas por operador →
        //   abaixo do limite de URL do PostgREST. Se algum dia esse volume
        //   crescer (>500 campanhas por operador), migrar para RPC com
        //   RETURNS BIGINT[] (padrão estabelecido no fix do 1000 limit).
        let campanhaIdsPermitidas: number[] | null = null;
        if (current_user_tipo !== 'Administrador') {
          const { data: campsDoUsuario, error: errCamps } = await supabase
            .from('email_campanhas')
            .select('id')
            .eq('responsavel_id', currentUserIdNum);
          if (errCamps) {
            console.error('[crm-leads] erro pré-cálculo campanhas RBAC:', errCamps.message);
            return res.status(500).json({ success: false, error: errCamps.message });
          }
          campanhaIdsPermitidas = (campsDoUsuario || []).map((c: any) => c.id);

          // Early-return: operador sem campanhas → não tem respostas para ver.
          //   Saved-cycles + evita o efeito colateral de `.in('campanha_id', [])`
          //   no PostgREST (que aceita mas pode confundir o operador).
          if (campanhaIdsPermitidas.length === 0) {
            return res.status(200).json({
              success: true,
              itens: [],
              total: 0,
              page: pageNum,
              limit: limitNum,
              total_pages: 0,
            });
          }
        }

        // Trazemos um teto generoso (500 mais recentes) e paginamos no Node.
        // Para volumes maiores, migramos para uma VIEW SQL
        // `vw_crm_inbox_respostas` com paginação real.
        const TETO_POR_FONTE = 500;

        // ── Respostas (única fonte do feed após v1.13) ──
        // 🆕 v1.21 — Filtro RBAC aplicado ANTES do order/limit:
        let respostasQuery = supabase
          .from('email_respostas')
          .select('id, lead_id, campanha_id, de_email, de_nome, assunto, corpo_texto, classificacao, lido, recebido_em')
          .order('recebido_em', { ascending: false })
          .limit(TETO_POR_FONTE);
        if (campanhaIdsPermitidas !== null) {
          respostasQuery = respostasQuery.in('campanha_id', campanhaIdsPermitidas);
        }
        const { data: respostas, error: errR } = await respostasQuery;
        if (errR) throw errR;

        // ── Lookups em batch (apenas respostas após v1.13) ──
        const leadIds = Array.from(new Set(
          ((respostas || []).map(r => r.lead_id).filter(Boolean) as number[])
        ));
        const campanhaIds = Array.from(new Set(
          ((respostas || []).map(r => r.campanha_id).filter(Boolean) as number[])
        ));

        // Lead lookup (por id apenas — opt-outs deixaram de existir aqui)
        const leadsPorId: Record<number, any> = {};
        if (leadIds.length > 0) {
          const { data: leadsData, error: errL } = await supabase
            .from('email_leads')
            .select('id, nome, email, empresa_id')
            .in('id', leadIds);
          if (errL) throw errL;
          for (const lead of leadsData || []) {
            leadsPorId[lead.id] = lead;
          }
        }

        // Empresa lookup
        const empresaIds = Array.from(new Set(
          Object.values(leadsPorId).map((l: any) => l.empresa_id).filter(Boolean)
        )) as number[];
        const empresasPorId: Record<number, any> = {};
        if (empresaIds.length > 0) {
          const { data: emps, error: errE } = await supabase
            .from('email_empresas')
            .select('id, nome')
            .in('id', empresaIds);
          if (errE) throw errE;
          for (const e of emps || []) empresasPorId[e.id] = e;
        }

        // Campanha lookup
        const campanhasPorId: Record<number, any> = {};
        if (campanhaIds.length > 0) {
          const { data: camps, error: errC } = await supabase
            .from('email_campanhas')
            .select('id, nome')
            .in('id', campanhaIds);
          if (errC) throw errC;
          for (const c of camps || []) campanhasPorId[c.id] = c;
        }

        // ── Montar itens ──
        //
        // 🆕 v1.13: o tipo 'opt_out' ainda existe no enum por defesa
        //   em camadas (alguns clientes podem ter cache antigo), mas
        //   nenhum item desse tipo é produzido por esta action.
        type ItemInbox = {
          tipo: 'resposta' | 'opt_out';
          id: number;
          data_evento: string;
          lead_id: number | null;
          lead_nome: string | null;
          lead_email: string;
          empresa_id: number | null;
          empresa_nome: string | null;
          campanha_id: number | null;
          campanha_nome: string | null;
          assunto: string | null;
          corpo_texto: string | null;
          classificacao: string | null;
          lido: boolean;
          motivo_optout: string | null;
        };

        const itens: ItemInbox[] = [];

        for (const r of respostas || []) {
          const lead = r.lead_id != null ? leadsPorId[r.lead_id] : null;
          const empresa = lead?.empresa_id ? empresasPorId[lead.empresa_id] : null;
          const camp = r.campanha_id ? campanhasPorId[r.campanha_id] : null;
          itens.push({
            tipo: 'resposta',
            id: r.id,
            data_evento: r.recebido_em,
            lead_id: r.lead_id,
            lead_nome: lead?.nome ?? r.de_nome ?? null,
            lead_email: r.de_email,
            empresa_id: lead?.empresa_id ?? null,
            empresa_nome: empresa?.nome ?? null,
            campanha_id: r.campanha_id,
            campanha_nome: camp?.nome ?? null,
            assunto: r.assunto,
            // Preview do corpo (200 chars) — corpo completo fica em email_respostas
            corpo_texto: r.corpo_texto ? r.corpo_texto.substring(0, 400) : null,
            classificacao: r.classificacao || 'pendente',
            lido: !!r.lido,
            motivo_optout: null,
          });
        }

        // Ordenar por data desc
        itens.sort((a, b) => (b.data_evento || '').localeCompare(a.data_evento || ''));

        // Filtro de busca (pós-merge)
        let itensFiltrados = itens;
        if (busca && busca.trim().length > 0) {
          const q = busca.toLowerCase().trim();
          itensFiltrados = itens.filter(it =>
            (it.lead_nome || '').toLowerCase().includes(q) ||
            (it.lead_email || '').toLowerCase().includes(q) ||
            (it.empresa_nome || '').toLowerCase().includes(q) ||
            (it.assunto || '').toLowerCase().includes(q)
          );
        }

        const total = itensFiltrados.length;
        const offset = (pageNum - 1) * limitNum;
        const pageItems = itensFiltrados.slice(offset, offset + limitNum);

        return res.status(200).json({
          success: true,
          itens: pageItems,
          total,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil(total / limitNum),
        });
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.24 (30/06/2026 — Pacote P1 da feature "CRM E-mail")
      //         LISTAR THREADS — agrupa email_respostas por (lead × campanha)
      // ════════════════════════════════════════════════════════════
      // Substitui o uso de `listar_respostas` no useRespostas v2.0 da aba
      // CRM E-mail. Conceito: cada thread representa UMA conversa entre o
      // operador (GC/SDR/Admin) e o lead, dentro do contexto de UMA campanha
      // — espelhando como Outlook/Gmail agrupam por "assunto".
      //
      // Estratégia de implementação (igual ao padrão consolidado):
      //   1. TETO_POR_FONTE=500 respostas mais recentes (RBAC aplicado)
      //   2. Agregar no Node por (lead_id, campanha_id)
      //   3. Lookup de leads + empresas + campanhas em batch
      //   4. Ordenar threads pelo evento mais recente
      //   5. Aplicar busca textual (Node — universo pequeno após RBAC)
      //   6. Paginar
      //
      // Trade-off: se um lead tem 30 respostas em 1 thread e existem outras
      // threads ativas, o `total_msgs` desta thread pode ficar subestimado
      // (porque o batch de 500 prioriza recência global, não da thread).
      // Aceitamos por ora — o universo prático é ~100 respostas/dia (item 5
      // do alinhamento), então 500 cobre vários dias. Se virar problema,
      // migramos para RPC com GROUP BY no servidor.
      //
      // Parâmetros:
      //   - busca: string (lead nome/email/empresa/corpo) — opcional
      //   - page, limit: paginação clássica
      //   - current_user_id, current_user_tipo: RBAC obrigatório (idêntico
      //     ao listar_respostas v1.21)
      //
      // Resposta:
      //   {
      //     success: true,
      //     threads: ThreadItem[],
      //     total, page, limit, total_pages
      //   }
      //
      //   ThreadItem = {
      //     lead_id, lead_nome, lead_email, lead_cargo,
      //     empresa_id, empresa_nome,
      //     campanha_id, campanha_nome,
      //     ultima_msg_em (ISO),
      //     ultima_msg_assunto,
      //     ultima_msg_snippet (até 200 chars),
      //     total_msgs (count dentro do batch de 500 — ver trade-off acima),
      //     tem_nao_lido (bool),
      //     classificacao_ultima (string|null),
      //   }
      if (action === 'listar_threads') {
        const {
          busca = '',
          page = '1',
          limit = '30',
          current_user_id,
          current_user_tipo,
        } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);

        // Validação defensiva (mesmo padrão do listar_respostas v1.21)
        if (!current_user_id || !current_user_tipo) {
          return res.status(400).json({
            success: false,
            error:
              'Parâmetros obrigatórios ausentes: current_user_id e current_user_tipo. ' +
              'A action listar_threads requer identificação do usuário corrente para aplicar RBAC.',
          });
        }
        const currentUserIdNum = parseInt(current_user_id);
        if (isNaN(currentUserIdNum) || currentUserIdNum < 1) {
          return res.status(400).json({
            success: false,
            error: `current_user_id inválido: "${current_user_id}"`,
          });
        }

        // RBAC: pré-cálculo das campanhas que o usuário pode ver
        //   (mesmo padrão do listar_respostas v1.21)
        let campanhaIdsPermitidas: number[] | null = null;
        if (current_user_tipo !== 'Administrador') {
          const { data: campsDoUsuario, error: errCamps } = await supabase
            .from('email_campanhas')
            .select('id')
            .eq('responsavel_id', currentUserIdNum);
          if (errCamps) {
            console.error('[crm-leads] erro pré-cálculo campanhas RBAC threads:', errCamps.message);
            return res.status(500).json({ success: false, error: errCamps.message });
          }
          campanhaIdsPermitidas = (campsDoUsuario || []).map((c: any) => c.id);
          if (campanhaIdsPermitidas.length === 0) {
            return res.status(200).json({
              success: true,
              threads: [],
              total: 0,
              page: pageNum,
              limit: limitNum,
              total_pages: 0,
            });
          }
        }

        const TETO_POR_FONTE = 500;
        let respostasQuery = supabase
          .from('email_respostas')
          .select(
            'id, lead_id, campanha_id, de_email, de_nome, assunto, ' +
              'corpo_texto, corpo_html, classificacao, lido, recebido_em'
          )
          .order('recebido_em', { ascending: false })
          .limit(TETO_POR_FONTE);
        if (campanhaIdsPermitidas !== null) {
          respostasQuery = respostasQuery.in('campanha_id', campanhaIdsPermitidas);
        }
        const { data: respostas, error: errR } = await respostasQuery;
        if (errR) throw errR;

        // Lookups em batch
        const leadIds = Array.from(
          new Set(((respostas || []).map((r: any) => r.lead_id).filter(Boolean) as number[]))
        );
        const campIds = Array.from(
          new Set(((respostas || []).map((r: any) => r.campanha_id).filter(Boolean) as number[]))
        );

        const leadsPorId: Record<number, any> = {};
        if (leadIds.length > 0) {
          const { data: leadsData } = await supabase
            .from('email_leads')
            .select('id, nome, email, cargo, empresa_id')
            .in('id', leadIds);
          for (const l of leadsData || []) leadsPorId[l.id] = l;
        }

        const empIds = Array.from(
          new Set(
            (Object.values(leadsPorId).map((l: any) => l.empresa_id).filter(Boolean) as number[])
          )
        );
        const empPorId: Record<number, any> = {};
        if (empIds.length > 0) {
          const { data: empsData } = await supabase
            .from('email_empresas')
            .select('id, nome')
            .in('id', empIds);
          for (const e of empsData || []) empPorId[e.id] = e;
        }

        const campPorId: Record<number, any> = {};
        if (campIds.length > 0) {
          const { data: campsData } = await supabase
            .from('email_campanhas')
            .select('id, nome')
            .in('id', campIds);
          for (const c of campsData || []) campPorId[c.id] = c;
        }

        // ── Agregar em threads ─────────────────────────────────────
        type ThreadAcc = {
          lead_id: number;
          campanha_id: number;
          ultima_msg_em: string;
          ultima_msg_assunto: string;
          ultima_msg_snippet: string;
          ultima_msg_corpo_html: string | null;
          ultima_classificacao: string | null;
          total_msgs: number;
          tem_nao_lido: boolean;
        };
        const threadsMap = new Map<string, ThreadAcc>();
        for (const r of respostas || []) {
          if (!r.lead_id || !r.campanha_id) continue;
          const key = `${r.lead_id}_${r.campanha_id}`;
          const existing = threadsMap.get(key);
          if (!existing) {
            // Snippet: até 200 chars do corpo texto (alinhado com listar_respostas)
            const snippet = (r.corpo_texto || '').substring(0, 200);
            threadsMap.set(key, {
              lead_id: r.lead_id,
              campanha_id: r.campanha_id,
              ultima_msg_em: r.recebido_em,
              ultima_msg_assunto: r.assunto || '',
              ultima_msg_snippet: snippet,
              ultima_msg_corpo_html: r.corpo_html || null,
              ultima_classificacao: r.classificacao || null,
              total_msgs: 1,
              tem_nao_lido: !r.lido,
            });
          } else {
            existing.total_msgs += 1;
            if (!r.lido) existing.tem_nao_lido = true;
            // Como já vieram ordenados desc, a primeira é a mais recente.
            // Não precisa sobrescrever ultima_msg_* aqui.
          }
        }

        // ── Hidratar identidades ───────────────────────────────────
        type ThreadItem = ThreadAcc & {
          lead_nome: string | null;
          lead_email: string | null;
          lead_cargo: string | null;
          empresa_id: number | null;
          empresa_nome: string | null;
          campanha_nome: string | null;
        };
        let threadsHidratadas: ThreadItem[] = Array.from(threadsMap.values()).map((t) => {
          const lead = leadsPorId[t.lead_id];
          const empresa = lead?.empresa_id ? empPorId[lead.empresa_id] : null;
          const camp = campPorId[t.campanha_id];
          return {
            ...t,
            lead_nome: lead?.nome || null,
            lead_email: lead?.email || null,
            lead_cargo: lead?.cargo || null,
            empresa_id: lead?.empresa_id || null,
            empresa_nome: empresa?.nome || null,
            campanha_nome: camp?.nome || null,
          };
        });

        // ── Busca textual (Node — universo pós-RBAC pequeno) ───────
        if (busca.trim()) {
          const termo = busca.trim().toLowerCase();
          threadsHidratadas = threadsHidratadas.filter((t) => {
            const haystack = [
              t.lead_nome,
              t.lead_email,
              t.empresa_nome,
              t.campanha_nome,
              t.ultima_msg_assunto,
              t.ultima_msg_snippet,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(termo);
          });
        }

        // ── Ordenar por última mensagem (mais recente primeiro) ────
        threadsHidratadas.sort((a, b) =>
          (b.ultima_msg_em || '').localeCompare(a.ultima_msg_em || '')
        );

        // ── Paginar ────────────────────────────────────────────────
        const total = threadsHidratadas.length;
        const offset = (pageNum - 1) * limitNum;
        const pageItems = threadsHidratadas.slice(offset, offset + limitNum);

        return res.status(200).json({
          success: true,
          threads: pageItems,
          total,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil(total / limitNum),
        });
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.24 (30/06/2026 — Pacote P1 da feature "CRM E-mail")
      //         LISTAR MENSAGENS DA THREAD (lead × campanha específicos)
      // ════════════════════════════════════════════════════════════
      // Quando o operador clica num card de thread no Inbox, esta action
      // retorna a conversa COMPLETA cronológica entre o lead e a campanha,
      // intercalando:
      //   • Mensagens da campanha enviadas para o lead (origem: email_fila
      //     + JOIN com email_campanha_steps)
      //   • Respostas do lead (origem: email_respostas)
      //   • (P2+): respostas outbound do RAISA (origem: email_respostas
      //     com direcao='outbound')
      //
      // Ordenação: cronológica ascendente (mais antigo primeiro), espelhando
      // o padrão Outlook/Gmail de leitura natural.
      //
      // RBAC: o operador precisa ser o responsável pela campanha
      //       (mesmo critério do listar_respostas v1.21 e listar_threads).
      //       Admin tem bypass.
      //
      // Parâmetros:
      //   - lead_id (required)
      //   - campanha_id (required)
      //   - current_user_id, current_user_tipo (required, RBAC)
      //
      // Resposta:
      //   {
      //     success: true,
      //     lead: { id, nome, email, cargo, empresa_nome },
      //     campanha: { id, nome },
      //     mensagens: MensagemThread[]
      //   }
      //
      //   MensagemThread = {
      //     id, tipo, direcao,
      //     data (ISO), assunto, corpo_texto, corpo_html,
      //     de_email, de_nome,
      //     // específicos por tipo:
      //     step_ordem?, step_id?, status?, aberto_em?, clicado_em?,
      //     classificacao?, lido?,
      //   }
      //
      //   tipo ∈ ('enviado_campanha' | 'recebido_lead' | 'enviado_crm')
      //   P1 emite apenas 'enviado_campanha' e 'recebido_lead'.
      if (action === 'listar_msgs_thread') {
        const {
          lead_id,
          campanha_id,
          current_user_id,
          current_user_tipo,
        } = req.query as Record<string, string>;

        if (!lead_id || !campanha_id) {
          return res.status(400).json({
            success: false,
            error: 'Parâmetros obrigatórios: lead_id, campanha_id.',
          });
        }
        if (!current_user_id || !current_user_tipo) {
          return res.status(400).json({
            success: false,
            error:
              'Parâmetros obrigatórios ausentes: current_user_id e current_user_tipo (RBAC).',
          });
        }

        const leadIdNum = parseInt(lead_id);
        const campIdNum = parseInt(campanha_id);
        const currentUserIdNum = parseInt(current_user_id);
        if (isNaN(leadIdNum) || isNaN(campIdNum) || isNaN(currentUserIdNum)) {
          return res.status(400).json({
            success: false,
            error: 'lead_id, campanha_id e current_user_id precisam ser inteiros válidos.',
          });
        }

        // RBAC: verificar que o operador pode ver essa campanha
        const { data: campanha, error: errCamp } = await supabase
          .from('email_campanhas')
          .select('id, nome, responsavel_id')
          .eq('id', campIdNum)
          .maybeSingle();
        if (errCamp) {
          return res.status(500).json({ success: false, error: errCamp.message });
        }
        if (!campanha) {
          return res.status(404).json({ success: false, error: 'Campanha não encontrada.' });
        }
        if (
          current_user_tipo !== 'Administrador' &&
          campanha.responsavel_id !== currentUserIdNum
        ) {
          return res.status(403).json({
            success: false,
            error: 'Sem permissão para visualizar esta thread (RBAC).',
          });
        }

        // Identidade do lead (para o header da thread)
        const { data: lead, error: errLead } = await supabase
          .from('email_leads')
          .select('id, nome, email, cargo, empresa_id')
          .eq('id', leadIdNum)
          .maybeSingle();
        if (errLead) {
          return res.status(500).json({ success: false, error: errLead.message });
        }
        if (!lead) {
          return res.status(404).json({ success: false, error: 'Lead não encontrado.' });
        }
        let empresaNome: string | null = null;
        if (lead.empresa_id) {
          const { data: emp } = await supabase
            .from('email_empresas')
            .select('nome')
            .eq('id', lead.empresa_id)
            .maybeSingle();
          empresaNome = emp?.nome || null;
        }

        // ── Mensagens enviadas pela campanha (email_fila + steps) ──
        // Filtra apenas itens que já saíram (não pendentes/cancelados).
        // 🆕 v1.25.4 (30/06/2026 — HOTFIX): EXCLUI itens sintéticos
        //   (step_id=NULL) criados pelo próprio responder_thread para
        //   reusar o Reply-To dinâmico. Esses itens não representam
        //   "envios da campanha" — eles existem só como contraparte de
        //   uma resposta outbound do CRM E-mail (que já aparece via
        //   email_respostas com direcao='outbound'). Sem esse filtro,
        //   a timeline mostra bolhas duplicadas "(sem assunto registrado)".
        const { data: enviados, error: errEnv } = await supabase
          .from('email_fila')
          .select(
            'id, step_id, status, agendado_para, enviado_em, entregue_em, ' +
              'aberto_em, clicado_em, respondido_em, ' +
              'email_campanha_steps(ordem, assunto)'
          )
          .eq('lead_id', leadIdNum)
          .eq('campanha_id', campIdNum)
          .not('step_id', 'is', null)
          .in('status', ['enviado', 'entregue', 'aberto', 'clicado', 'respondido']);
        if (errEnv) {
          console.error('[crm-leads] listar_msgs_thread enviados:', errEnv.message);
        }

        // ── Respostas do lead (email_respostas) ────────────────────
        // 🆕 v1.25.3 (30/06/2026 — HOTFIX): SELECT inclui `direcao` e
        //   demais colunas P1 para distinguir inbound (resposta do lead)
        //   de outbound (resposta enviada pelo RAISA via CRM E-mail P2).
        //   Sem essa distinção, o frontend renderiza outbounds como se
        //   fossem do lead — bolha errada no lado errado.
        //
        //   Compatibilidade: registros legados sem `direcao` (pré-migration
        //   P1) defaultam para 'inbound' (DEFAULT da coluna). Se a coluna
        //   não existir (migration não aplicada), a query falha — log
        //   abaixo trata e o operador vê apenas envios da campanha.
        const { data: replies, error: errReps } = await supabase
          .from('email_respostas')
          .select(
            'id, de_email, de_nome, assunto, corpo_texto, corpo_html, ' +
              'classificacao, lido, recebido_em, ' +
              'direcao, message_id, in_reply_to_message_id, enviado_por'
          )
          .eq('lead_id', leadIdNum)
          .eq('campanha_id', campIdNum);
        if (errReps) {
          console.error('[crm-leads] listar_msgs_thread replies:', errReps.message);
        }

        // ── Montar timeline cronológica ascendente ─────────────────
        const mensagens: any[] = [];

        for (const env of enviados || []) {
          const step = (env as any).email_campanha_steps;
          mensagens.push({
            id: `env_${env.id}`,
            tipo: 'enviado_campanha',
            direcao: 'outbound',
            data: env.enviado_em || env.agendado_para,
            assunto: step?.assunto || '(sem assunto registrado)',
            corpo_texto: null,
            corpo_html: null,
            de_email: null,
            de_nome: null,
            step_ordem: step?.ordem || null,
            step_id: env.step_id,
            status: env.status,
            aberto_em: env.aberto_em,
            clicado_em: env.clicado_em,
            respondido_em: env.respondido_em,
            entregue_em: env.entregue_em,
          });
        }

        for (const rep of replies || []) {
          // 🆕 v1.25.3 (30/06/2026 — HOTFIX) — ramifica por direção.
          //   Default 'inbound' para registros legados ou se a coluna
          //   ainda não existir (compat pré-migration P1).
          const direcao = (rep as any).direcao || 'inbound';
          const isOutbound = direcao === 'outbound';
          mensagens.push({
            id: `rep_${rep.id}`,
            tipo: isOutbound ? 'enviado_crm' : 'recebido_lead',
            direcao: isOutbound ? 'outbound' : 'inbound',
            data: rep.recebido_em,
            assunto: rep.assunto || '',
            corpo_texto: rep.corpo_texto || '',
            corpo_html: rep.corpo_html || null,
            de_email: rep.de_email,
            de_nome: rep.de_nome,
            // Específicos de 'recebido_lead' (relevantes só para inbound,
            // mas nulos em outbound — frontend trata graceful):
            classificacao: isOutbound ? null : rep.classificacao || null,
            lido: rep.lido,
            // 🆕 P2/P3 — exposto para threading futuro e debug
            message_id: (rep as any).message_id || null,
            in_reply_to_message_id: (rep as any).in_reply_to_message_id || null,
            enviado_por: (rep as any).enviado_por || null,
          } as any);
        }

        // Ordenação cronológica DESCENDENTE (mais recente no topo),
        //   padrão Outlook desktop moderno. Mudou em v1.25.5 a pedido
        //   do Messias. Mensagens sem `data` vão para o fim (defensivo).
        mensagens.sort((a, b) => {
          if (!a.data && !b.data) return 0;
          if (!a.data) return 1;
          if (!b.data) return -1;
          return b.data.localeCompare(a.data);
        });

        return res.status(200).json({
          success: true,
          lead: {
            id: lead.id,
            nome: lead.nome,
            email: lead.email,
            cargo: lead.cargo,
            empresa_nome: empresaNome,
          },
          campanha: {
            id: campanha.id,
            nome: campanha.nome,
            // 🆕 v1.25 (30/06/2026 — Pacote P2) — Exposto ao frontend para
            //   calcular `pode_responder` localmente sem round-trip extra.
            //   ATENÇÃO: Não é dado sensível, é apenas o FK do responsável.
            responsavel_id: campanha.responsavel_id,
          },
          // 🆕 v1.25 (30/06/2026 — Pacote P2) — Calculado server-side
          //   para evitar discrepância entre cálculo cliente e regra real
          //   do `responder_thread`. Frontend usa esse flag direto.
          pode_responder: campanha.responsavel_id === currentUserIdNum,
          // Motivo do bloqueio (quando pode_responder=false) para UX clara
          motivo_bloqueio:
            campanha.responsavel_id === currentUserIdNum
              ? null
              : current_user_tipo === 'Administrador'
                ? 'Apenas o responsável da campanha pode responder. Administrador acessa em modo leitura.'
                : 'Você não é o responsável por esta campanha.',
          mensagens,
        });
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.3 (04/06/2026 — Fase 8-Inbox) — INVÁLIDOS — schema original
      //         (fila-centric, 1 linha por evento de email_fila)
      // 🔄 v1.15 (16/06/2026 — F8) — REESCRITA lead-centric
      // ════════════════════════════════════════════════════════════
      // LEADS em estado terminal de invalidação. Critério D2 (decidido
      // com PO em 16/06/2026):
      //
      //     email_leads.bounced = true
      //        OR
      //     email_leads.motivo_invalidacao IS NOT NULL
      //
      // Mudança vs v1.3:
      //   ANTES — consulta `email_fila` por evento de falha. Mesmo lead
      //           aparecia N vezes (1 por bounce). Lead corrigido pelo
      //           analista mas sem novo envio continuava na lista.
      //   AGORA — consulta `email_leads` por estado consolidado. 1 lead =
      //           1 linha. Lead corrigido sai automaticamente (PATCH
      //           atualizar_lead v1.11 já reseta bounced quando email muda).
      //
      // Campos do payload (alinhados com crm.types.ts v1.7 → InvalidoItem):
      //   lead_id, lead_nome, lead_email, empresa_id, empresa_nome,
      //   status (sempre 'bounce' por ora),
      //   motivo (motivo_invalidacao classificada — fallback "Falha
      //           permanente" para leads pré-v1.15 com bounced=true mas
      //           motivo_invalidacao=NULL),
      //   motivo_raw (bounced_motivo — exibido em tooltip na UI),
      //   bounced_em, tentativas_recovery, recovery_em.
      //
      // Parâmetros aceitos:
      //   - busca: string (nome, email, motivo, motivo_raw) — opcional, ilike
      //   - page, limit: paginação clássica
      //
      // Resposta: { success, itens: InvalidoItem[], total, page, limit }
      if (action === 'listar_invalidos') {
        const {
          busca = '',
          page = '1',
          limit = '30',
          // 🆕 v1.21 — RBAC de visibilidade na aba "E-mails Inválidos".
          //   Mesma regra do listar_leads v1.20: cada operador vê apenas
          //   seus inválidos (consistente — se o lead é meu, eu vejo se
          //   ele virou inválido). Decisão de produto (Messias, 22/06/2026):
          //     "Cada GC/SDR só consegue vincular um Lead atribuído a ele."
          //   Por simetria, só pode ver inválidos atribuídos a si.
          current_user_id,
          current_user_tipo,
        } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);
        const offset = (pageNum - 1) * limitNum;

        // 🆕 v1.21 — Validação defensiva. Mesmo padrão do listar_leads v1.20:
        //   sem currentUser não é seguro listar (potencial vazamento RBAC).
        if (!current_user_id || !current_user_tipo) {
          return res.status(400).json({
            success: false,
            error:
              'Parâmetros obrigatórios ausentes: current_user_id e current_user_tipo. ' +
              'A action listar_invalidos requer identificação do usuário corrente para aplicar RBAC.',
          });
        }
        const currentUserIdNum = parseInt(current_user_id);
        if (isNaN(currentUserIdNum) || currentUserIdNum < 1) {
          return res.status(400).json({
            success: false,
            error: `current_user_id inválido: "${current_user_id}"`,
          });
        }

        // Critério D2 — bounced=true OR motivo_invalidacao IS NOT NULL
        // Exclui leads em opt-out (eles têm aba própria — Opt-Out).
        let query = supabase
          .from('email_leads')
          .select(
            'id, nome, email, vertical, empresa_id, bounced, bounced_em, bounced_motivo, ' +
            'motivo_invalidacao, tentativas_recovery, recovery_em, atualizado_em, ' +
            'email_empresas(id, nome)',
            { count: 'exact' }
          )
          .or('bounced.eq.true,motivo_invalidacao.not.is.null')
          .not('opt_out', 'is', true)
          .order('bounced_em', { ascending: false, nullsFirst: false })
          .order('atualizado_em', { ascending: false })
          .range(offset, offset + limitNum - 1);

        // 🆕 v1.21 — RBAC: mesma regra do listar_leads v1.20 (vide cabeçalho).
        //   Aplicado APÓS o critério D2 (bounced/motivo) e ANTES da busca textual.
        //
        //   Mapa:
        //     Admin             → sem filtro (vê todos inválidos)
        //     SDR               → (vertical=CRECI) OR (reservado_por=userId)
        //     Gestão Comercial  → (vertical!=CRECI) AND (reservado_por=userId)
        //     outros tipos      → fail-safe (lista vazia)
        if (current_user_tipo === 'Administrador') {
          // Sem filtro adicional
        } else if (current_user_tipo === 'SDR') {
          query = query.or(`vertical.eq.CRECI,reservado_por.eq.${currentUserIdNum}`);
        } else if (current_user_tipo === 'Gestão Comercial') {
          query = query.neq('vertical', 'CRECI');
          query = query.eq('reservado_por', currentUserIdNum);
        } else {
          query = query.eq('id', -1);
        }

        if (busca && busca.trim().length > 0) {
          const q = busca.trim();
          // Busca em campos do lead + campos de invalidação (motivo classificado e raw).
          query = query.or(
            `nome.ilike.%${q}%,email.ilike.%${q}%,motivo_invalidacao.ilike.%${q}%,bounced_motivo.ilike.%${q}%`
          );
        }

        const { data: leads, error: errLeads, count } = await query;
        if (errLeads) throw errLeads;

        const itens = (leads || []).map((l: any) => {
          const empresa = l.email_empresas;
          // 🆕 v1.15.1 — tradução de CÓDIGO → string visível, via dicionário
          //   centralizado. O campo `motivo_invalidacao` no banco armazena
          //   códigos snake_case (validados pela CHECK constraint).
          //   Fallback "Falha permanente" para leads pré-v1.15 com bounced=true
          //   mas motivo_invalidacao=NULL (decisão D3: sem backfill).
          //   Fallback final (código desconhecido): retorna o próprio código —
          //   pior UX, mas não quebra a tela; sinaliza necessidade de mapping.
          let motivo: string;
          if (l.motivo_invalidacao) {
            motivo = TRADUCAO_MOTIVO_INVALIDACAO[l.motivo_invalidacao]
                  || l.motivo_invalidacao;
          } else {
            motivo = l.bounced ? 'Falha permanente' : 'Outro motivo';
          }
          return {
            lead_id: l.id,
            lead_nome: l.nome,
            lead_email: l.email,
            empresa_id: l.empresa_id ?? null,
            empresa_nome: empresa?.nome ?? null,
            status: 'bounce' as const,
            motivo,
            motivo_raw: l.bounced_motivo ?? null,
            bounced_em: l.bounced_em ?? null,
            tentativas_recovery: l.tentativas_recovery ?? 0,
            recovery_em: l.recovery_em ?? null,
            // 🆕 v1.22 (23/06/2026 — Recuperação de Inválidos): flag
            //   booleana usada pelo frontend (InvalidosTab v1.3) para
            //   decidir se mostra o botão "Promover". Regra: só aparece
            //   quando bounced=false (email já foi corrigido — manualmente
            //   via Editar, automaticamente via Recovery 3.A, ou nunca
            //   teve bounce verdadeiro como nos casos f7_pre_campanha /
            //   no_match em que motivo_invalidacao foi setado sem bounce).
            bounced: l.bounced === true,
            // 🆕 v1.22 — Vertical do lead, exibida no
            //   RecuperarParaCampanhaModal como contexto para o usuário.
            //   Pode ser NULL para leads pré-v1.7 (deveria ter sido
            //   preenchida na promoção/criação; quando ausente, o
            //   backend rejeita a recuperação com erro claro).
            vertical: l.vertical ?? null,
          };
        });

        return res.status(200).json({
          success: true,
          itens,
          total: count || 0,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil((count || 0) / limitNum),
        });
      }

      // ── LISTAR RESPONSÁVEIS ELEGÍVEIS (GC + SDR) ──────────────────────────────
      // 🆕 v1.7 (05/06/2026) — Usado pelo LeadFormModal quando o usuário logado
      // é Administrador: ele precisa escolher para quem o lead será reservado
      // (não pode reservar para si mesmo, pois Admin não atua operacionalmente).
      // GC/SDR não chamam essa action — eles são travados automaticamente em
      // si mesmos no lado do frontend.
      if (action === 'listar_responsaveis_lead') {
        const { data, error } = await supabase
          .from('app_users')
          .select('id, nome_usuario, tipo_usuario, email_usuario')
          .in('tipo_usuario', ['Gestão Comercial', 'SDR'])
          .order('tipo_usuario', { ascending: true })
          .order('nome_usuario', { ascending: true });

        if (error) {
          console.error('[crm-leads] listar_responsaveis_lead erro:', error.message);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
          success: true,
          responsaveis: data || [],
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 v1.16 (17/06/2026 — Vincular em Lote v2) — Lista dinâmica de
      // setores, UFs, cidades e responsáveis para popular os dropdowns do
      // wizard. Zero hardcode no frontend — opções refletem base real.
      //
      // Sem parâmetros. Custo trivial (~3 queries pequenas, <100ms).
      //
      // Retorna:
      //   { setores: string[], ufs: string[], cidades: string[],
      //     responsaveis: { id, nome_usuario, tipo_usuario, email_usuario }[] }
      // ─────────────────────────────────────────────────────────
      if (action === 'listar_metadados_filtros_vinculo_em_lote') {
        // 1) Setores/UFs/cidades distintos da base de empresas (sem null)
        const { data: empresas, error: errEmp } = await supabase
          .from('email_empresas')
          .select('setor, cidade, uf');

        if (errEmp) {
          console.error('[crm-leads] listar_metadados_filtros erro empresas:', errEmp.message);
          return res.status(500).json({ success: false, error: errEmp.message });
        }

        const setores: string[] = Array.from(new Set(
          (empresas || []).map((e: any) => (e.setor || '').trim()).filter(Boolean) as string[]
        )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        const ufs: string[] = Array.from(new Set(
          (empresas || []).map((e: any) => (e.uf || '').trim().toUpperCase()).filter(Boolean) as string[]
        )).sort();

        const cidades: string[] = Array.from(new Set(
          (empresas || []).map((e: any) => (e.cidade || '').trim()).filter(Boolean) as string[]
        )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // 2) Responsáveis ativos (GC + SDR + Administrador — Admin pode aparecer
        //    como responsável em casos excepcionais; vide criar_lead v1.7).
        //    Não filtramos por flag 'ativo' aqui porque a tabela app_users no
        //    schema atual não a expõe consistentemente; basta filtrar pelo tipo.
        const { data: responsaveis, error: errResp } = await supabase
          .from('app_users')
          .select('id, nome_usuario, tipo_usuario, email_usuario')
          .in('tipo_usuario', ['Gestão Comercial', 'SDR', 'Administrador'])
          .order('tipo_usuario', { ascending: true })
          .order('nome_usuario', { ascending: true });

        if (errResp) {
          console.error('[crm-leads] listar_metadados_filtros erro responsaveis:', errResp.message);
          return res.status(500).json({ success: false, error: errResp.message });
        }

        return res.status(200).json({
          success: true,
          setores,
          ufs,
          cidades,
          responsaveis: responsaveis || [],
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🔄 v1.16 (17/06/2026 — Vincular em Lote v2 — REESCRITA):
      // Lista leads aptos a vinculação em lote, com 6 NOVOS FILTROS +
      // PAGINAÇÃO + SCORE no payload. Pareado com migration
      // 2026-06-17_vincular_em_lote_v2_score_e_indices.sql (RPC do score
      // + 3 índices: criado_em, empresas.setor, empresas.uf).
      //
      // Histórico desta action:
      //   - v1.9 (10/06): criação (8 filtros base).
      //   - v1.10 (10/06): vertical_destino condicional (CRECI bidirecional).
      //   - v1.11 (10/06): filtro bounced=false (decisão P1.2).
      //   - v1.16 (17/06): 6 novos filtros + paginação + score.
      //
      // ── PARÂMETROS (todos GET querystring) ─────────────────
      //
      // FILTROS BASE (compat v1.15.1):
      //   responsavel_id    : number  — RBAC; não-admin envia próprio user.id
      //   vertical_destino  : string  — vertical da campanha (obriga regra CRECI)
      //   busca             : string  — ilike em nome/email/cargo
      //
      // FILTROS V2:
      //   tipo_busca        : 'aderentes' | 'conversiveis' (default 'conversiveis')
      //                       - aderentes:   só leads com vertical === destino
      //                       - conversiveis: qualquer vertical (CRECI ainda
      //                         bidirecionalmente blindada — não entra nem sai)
      //   engajamento       : 'qualquer' | 'abriu' | 'clicou' | 'respondeu'
      //                     | 'virgem'  (default 'qualquer')
      //                       Operados sobre contadores materializados de
      //                       email_leads (populados pelo webhook v1.15.1).
      //   setor             : string  — exato em email_empresas.setor
      //   uf                : string  — exato em email_empresas.uf (uppercase)
      //   cidade            : string  — ilike em email_empresas.cidade
      //   cadastro_range    : '7d' | '30d' | '90d' | 'mais_90d' | 'qualquer'
      //                       (default 'qualquer')
      //   outras_campanhas  : 'excluir' (default) | 'incluir' | 'so_encerradas'
      //                       - excluir:      bloqueia leads em ativa/pausada/agendada
      //                       - incluir:      sem bloqueio (admin power)
      //                       - so_encerradas: lead em ≥1 encerrada E nenhuma ativa
      //
      // PAGINAÇÃO:
      //   per_page          : number (default 30, max 100)
      //   offset            : number (default 0)
      //
      // ── CRITÉRIOS HARD-CODED (não negociáveis) ──────────────
      //   • apto_campanha = true
      //   • opt_out IS NULL OR opt_out = false
      //   • bounced IS NULL OR bounced = false
      //   • funil_status != 'perdido'
      //   • opt-out global (tabela email_optout) — defesa em profundidade
      //
      // ── DEFESA CRECI BIDIRECIONAL ──────────────────────────
      // Mantida em DUAS camadas:
      //   1. Aqui (filtro de listagem) — não mostra leads CRECI em destinos
      //      não-CRECI nem vice-versa.
      //   2. vincular_em_lote_a_campanha (linha ~1975) — valida lead a lead.
      //
      // ── RBAC ───────────────────────────────────────────────
      // Admin não passa responsavel_id (vê tudo); não-admin passa o próprio
      // user.id (vê apenas leads sob sua responsabilidade).
      // ─────────────────────────────────────────────────────────
      if (action === 'listar_leads_para_vinculo_em_lote') {
        // ── 1) Coleta e normalização dos parâmetros ─────────
        const responsavelIdQ = req.query.responsavel_id as string | undefined;
        const verticalDestinoQ = (req.query.vertical_destino as string) || '';
        const busca = (req.query.busca as string) || '';

        const tipoBusca = ((req.query.tipo_busca as string) || 'conversiveis').toLowerCase();
        const engajamento = ((req.query.engajamento as string) || 'qualquer').toLowerCase();
        const setor = (req.query.setor as string) || '';
        const uf = ((req.query.uf as string) || '').toUpperCase();
        const cidade = (req.query.cidade as string) || '';
        const cadastroRange = ((req.query.cadastro_range as string) || 'qualquer').toLowerCase();
        const outrasCampanhas = ((req.query.outras_campanhas as string) || 'excluir').toLowerCase();

        // Paginação — clamp defensivo
        let perPage = parseInt((req.query.per_page as string) || '30');
        if (isNaN(perPage) || perPage < 1) perPage = 30;
        if (perPage > 100) perPage = 100;
        let offset = parseInt((req.query.offset as string) || '0');
        if (isNaN(offset) || offset < 0) offset = 0;

        // ── 2) Pré-cálculo: IDs bloqueados / IDs em encerradas ─
        //   (depende do parâmetro outras_campanhas; defaults para 'excluir').
        // 🆕 v1.19 (22/06/2026 — HOTFIX da v1.18): as 2 RPCs agora retornam
        //   BIGINT[] (array escalar) em vez de TABLE (lead_id BIGINT). Functions
        //   com RETURNS TABLE também sofriam do limite default de 1000 do
        //   cliente Supabase JS — apenas movemos o bug do `.from().select()`
        //   para o `.rpc()`. O retorno array escalar é tratado como UMA linha,
        //   sem limite. Pareada com migration
        //   sql/2026-06-22_crm_leads_em_campanhas_rpc_v2_fix_bigint_array.sql
        //   que precisa ser aplicada ANTES desta versão do backend.
        let idsBloqueadosAtivas: number[] = [];
        let idsEmEncerradas: number[] = [];

        if (outrasCampanhas === 'excluir' || outrasCampanhas === 'so_encerradas') {
          const { data: vinculosAtivos, error: errVA } = await supabase
            .rpc('crm_leads_em_campanhas_ativas');
          if (errVA) {
            console.error('[crm-leads] erro rpc crm_leads_em_campanhas_ativas:', errVA.message);
            // Defesa em profundidade: se a RPC não existe (migration não aplicada),
            // retorna 500 com mensagem clara em vez de devolver listagem corrompida.
            return res.status(500).json({
              success: false,
              error:
                `Erro ao consultar vínculos ativos: ${errVA.message}. ` +
                `Verifique se a migration sql/2026-06-22_crm_leads_em_campanhas_rpc_v2_fix_bigint_array.sql ` +
                `foi aplicada no banco.`,
            });
          }
          // 🆕 v1.19 — RPC agora retorna BIGINT[] (não TABLE). data é o array
          //   DIRETO de bigints. Cada bigint vira string em JSON, daí o Number().
          idsBloqueadosAtivas = Array.isArray(vinculosAtivos)
            ? vinculosAtivos.map((id: any) => Number(id))
            : [];
        }

        if (outrasCampanhas === 'so_encerradas') {
          const { data: vinculosEncerrados, error: errVE } = await supabase
            .rpc('crm_leads_em_campanhas_encerradas');
          if (errVE) {
            console.error('[crm-leads] erro rpc crm_leads_em_campanhas_encerradas:', errVE.message);
            return res.status(500).json({
              success: false,
              error:
                `Erro ao consultar vínculos encerrados: ${errVE.message}. ` +
                `Verifique se a migration sql/2026-06-22_crm_leads_em_campanhas_rpc_v2_fix_bigint_array.sql ` +
                `foi aplicada no banco.`,
            });
          }
          // 🆕 v1.19 — array DIRETO de bigints (vide acima)
          idsEmEncerradas = Array.isArray(vinculosEncerrados)
            ? vinculosEncerrados.map((id: any) => Number(id))
            : [];
          // Se não houver nenhum lead em campanha encerrada, retorno cedo —
          // saved-cycles e evita .in('id', [vazio]) que o PostgREST não aceita.
          if (idsEmEncerradas.length === 0) {
            return res.status(200).json({
              success: true,
              leads: [],
              total_geral: 0,
              total_paginas: 0,
              pagina_atual: 1,
              per_page: perPage,
              offset,
              has_proxima: false,
              has_anterior: false,
              vertical_destino_aplicado: verticalDestinoQ || null,
              tipo_busca_aplicado: tipoBusca,
              filtros_aplicados: {
                engajamento, setor, uf, cidade, cadastro_range: cadastroRange,
                outras_campanhas: outrasCampanhas, responsavel_id: responsavelIdQ || null,
                busca: busca || null,
              },
              ids_vinculados_bloqueados: idsBloqueadosAtivas.length,
            });
          }
        }

        // ── 3) JOIN strategy ────────────────────────────────
        // Se houver filtro em setor/uf/cidade → INNER (exige empresa associada).
        // Caso contrário → LEFT (leads sem empresa aparecem normalmente).
        const usaInnerEmpresa = !!(setor || uf || cidade);
        const empresaSelect = usaInnerEmpresa
          ? 'email_empresas!inner(id, nome, setor, cidade, uf)'
          : 'email_empresas(id, nome, setor, cidade, uf)';

        // ── 4) Query principal ──────────────────────────────
        // count: 'exact' devolve total_geral em uma query só (PostgREST
        // executa SELECT count(*) em paralelo — ~10ms em 1.6k leads hoje).
        let query = supabase
          .from('email_leads')
          .select(
            `
            id, nome, email, cargo, vertical, reservado_por, funil_status,
            apto_campanha, opt_out, telefone, linkedin_url, criado_em,
            total_emails_recebidos, total_emails_abertos, total_emails_clicados,
            total_respostas, score_engajamento,
            ${empresaSelect}
            `,
            { count: 'exact' }
          )
          .eq('apto_campanha', true)
          .or('opt_out.is.null,opt_out.eq.false')
          .or('bounced.is.null,bounced.eq.false')
          .not('funil_status', 'eq', 'perdido');

        // ── 4.1) Filtro tipo_busca + regra CRECI bidirecional ─
        // 🛡️ v1.16.1 (17/06/2026) — FIX defesa em profundidade:
        // Quando verticalDestinoQ é vazio (chamada API direta sem destino),
        // a v1.16 inicial deixava CRECI vazar nos resultados. A v1.15.1 tinha
        // fallback defensivo que EXCLUÍA CRECI nesse caso. Restaurado abaixo
        // em ambos os ramos (aderentes E conversíveis). O frontend novo
        // SEMPRE envia vertical_destino, então essa proteção só ativa em
        // chamadas API externas indevidas — mas é a postura correta.
        if (tipoBusca === 'aderentes') {
          // ADERENTES: vertical exata = destino.
          // - Se destino CRECI → só CRECI (zero alteração).
          // - Se destino X → só X.
          // - Se SEM destino → exclui CRECI (defesa em profundidade).
          if (verticalDestinoQ) {
            query = query.eq('vertical', verticalDestinoQ);
          } else {
            query = query.not('vertical', 'eq', 'CRECI');
          }
        } else {
          // CONVERSÍVEIS: qualquer vertical, com regra CRECI bidirecional:
          // - Se destino CRECI → ainda só leads CRECI (entrada blindada).
          // - Se destino ≠ CRECI (ou ausente) → exclui CRECI (saída blindada).
          if (verticalDestinoQ === 'CRECI') {
            query = query.eq('vertical', 'CRECI');
          } else {
            query = query.not('vertical', 'eq', 'CRECI');
          }
        }

        // ── 4.2) Filtros de empresa (setor / UF / cidade) ────
        if (setor) query = query.eq('email_empresas.setor', setor);
        if (uf) query = query.eq('email_empresas.uf', uf);
        if (cidade) query = query.ilike('email_empresas.cidade', `%${cidade}%`);

        // ── 4.3) Filtro de responsável ──────────────────────
        if (responsavelIdQ) {
          query = query.eq('reservado_por', parseInt(responsavelIdQ));
        }

        // ── 4.4) Busca textual ──────────────────────────────
        if (busca) {
          query = query.or(
            `nome.ilike.%${busca}%,email.ilike.%${busca}%,cargo.ilike.%${busca}%`
          );
        }

        // ── 4.5) Filtro de engajamento ──────────────────────
        // Operados sobre colunas materializadas em email_leads. Quase grátis
        // (sem join com email_eventos). O score_engajamento já foi atualizado
        // pelo webhook v1.15.1 + RPC v1.16 (vide migration).
        if (engajamento === 'abriu') {
          query = query.gte('total_emails_abertos', 1);
        } else if (engajamento === 'clicou') {
          query = query.gte('total_emails_clicados', 1);
        } else if (engajamento === 'respondeu') {
          query = query.gte('total_respostas', 1);
        } else if (engajamento === 'virgem') {
          query = query.or('total_emails_recebidos.is.null,total_emails_recebidos.eq.0');
        }
        // 'qualquer' (default) → sem filtro

        // ── 4.6) Filtro de data de cadastro ─────────────────
        // Faixas calculadas no servidor para evitar drift de timezone do cliente.
        if (cadastroRange !== 'qualquer') {
          const agora = Date.now();
          const dia = 24 * 60 * 60 * 1000;
          if (cadastroRange === '7d') {
            query = query.gte('criado_em', new Date(agora - 7 * dia).toISOString());
          } else if (cadastroRange === '30d') {
            query = query.gte('criado_em', new Date(agora - 30 * dia).toISOString());
          } else if (cadastroRange === '90d') {
            query = query.gte('criado_em', new Date(agora - 90 * dia).toISOString());
          } else if (cadastroRange === 'mais_90d') {
            query = query.lt('criado_em', new Date(agora - 90 * dia).toISOString());
          }
        }

        // ── 4.7) Filtros "outras campanhas" ─────────────────
        if (idsBloqueadosAtivas.length > 0) {
          query = query.not('id', 'in', `(${idsBloqueadosAtivas.join(',')})`);
        }
        if (outrasCampanhas === 'so_encerradas') {
          // idsEmEncerradas garantido não-vazio (early-return acima cobre o caso vazio)
          query = query.in('id', idsEmEncerradas);
        }

        // ── 5) Ordenação + paginação ────────────────────────
        // Mais engajados primeiro (score DESC), depois alfabético por nome.
        // 🆕 v1.16.2: adicionado tiebreaker FINAL .order('id') para garantir
        //   determinismo em empates. Sem isso, o PostgREST/PostgreSQL pode
        //   retornar linhas com mesmo (score, nome) em ordem indefinida
        //   (depende do physical row order, que muda com VACUUM/UPDATE).
        //   Em paginação por range(), isso causava o sintoma 50→10→10→11→10
        //   reportado na Sessão 1 — empates "atravessando" páginas.
        //   Custo: zero (id tem índice PK). Benefício: ordem 100% estável.
        // Range é zero-indexed e INCLUSIVO em ambas as pontas.
        query = query
          .order('score_engajamento', { ascending: false, nullsFirst: false })
          .order('nome', { ascending: true })
          .order('id', { ascending: false })
          .range(offset, offset + perPage - 1);

        const { data: leads, error: errLeads, count: totalGeral } = await query;
        if (errLeads) {
          console.error('[crm-leads] listar_leads_para_vinculo_em_lote erro:', errLeads.message);
          return res.status(500).json({ success: false, error: errLeads.message });
        }

        // ── 6) Defesa em profundidade: opt-out global ───────
        // A tabela email_optout é desacoplada de email_leads, então o filtro
        // vai pós-query. Em casos reais (poucos opt-outs vs total de leads),
        // o impacto na contagem é desprezível; documentamos como aproximação.
        const { data: optouts } = await supabase
          .from('email_optout')
          .select('email');
        const emailsOptout = new Set(
          (optouts || []).map((o: any) => (o.email || '').toLowerCase().trim())
        );

        const leadsFiltrados = (leads || []).filter(
          (l: any) => !emailsOptout.has((l.email || '').toLowerCase().trim())
        );

        const removidosPorOptout = (leads || []).length - leadsFiltrados.length;
        const totalAjustado = Math.max(0, (totalGeral || 0) - removidosPorOptout);

        // ── 7) Metadados de paginação ───────────────────────
        const totalPaginas = Math.max(1, Math.ceil(totalAjustado / perPage));
        const paginaAtual = Math.floor(offset / perPage) + 1;
        const hasProxima = offset + perPage < totalAjustado;
        const hasAnterior = offset > 0;

        return res.status(200).json({
          success: true,
          leads: leadsFiltrados,
          total_geral: totalAjustado,
          total_paginas: totalPaginas,
          pagina_atual: paginaAtual,
          per_page: perPage,
          offset,
          has_proxima: hasProxima,
          has_anterior: hasAnterior,
          vertical_destino_aplicado: verticalDestinoQ || null,
          tipo_busca_aplicado: tipoBusca,
          filtros_aplicados: {
            engajamento,
            setor: setor || null,
            uf: uf || null,
            cidade: cidade || null,
            cadastro_range: cadastroRange,
            outras_campanhas: outrasCampanhas,
            responsavel_id: responsavelIdQ || null,
            busca: busca || null,
          },
          ids_vinculados_bloqueados: idsBloqueadosAtivas.length,
        });
      }

      return res.status(400).json({ success: false, error: `Ação GET desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════
    // POST ACTIONS
    // ════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = req.body;

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.25 (30/06/2026 — Pacote P2 da feature "CRM E-mail")
      //         RESPONDER THREAD — envio outbound pelo próprio RAISA
      // ════════════════════════════════════════════════════════════
      // Ver cabeçalho do arquivo (v1.25) para a especificação completa
      // do comportamento end-to-end. Resumo do fluxo:
      //   1. Validação RBAC: somente responsavel_id da campanha
      //   2. Resolução de assinatura (responsavel.email + campanha.unidade)
      //   3. Item sintético em email_fila (step_id=NULL)
      //   4. Envio via fetch direto na Resend API com:
      //        - From (assinatura corporativa do responsável)
      //        - BCC (Exchange do próprio responsável)
      //        - Reply-To dinâmico (plus-alias customer-service+f+l@)
      //        - In-Reply-To + References (threading SMTP)
      //   5. Registro em email_respostas com direcao='outbound'
      //   6. Rollback do item sintético em caso de falha Resend
      //
      // Resposta:
      //   { success, mensagem_id, message_id (Resend), fila_id_sintetico }
      //
      // POST body (JSON):
      //   {
      //     lead_id, campanha_id,
      //     corpo_texto, corpo_html,
      //     in_reply_to_message_id?   // opcional — usado para threading
      //     current_user_id, current_user_tipo
      //   }
      //
      // 🔧 v1.25.1 (30/06/2026 — HOTFIX): action movida do bloco GET para
      //   o bloco POST. Bug original: a action estava dentro de `if
      //   (req.method === 'GET')` com guard `&& req.method === 'POST'`
      //   nunca matchável → handler caía no fall-through retornando
      //   400 "Ação GET desconhecida: responder_thread". Aqui dentro do
      //   bloco POST, `body` já está desestruturado como `req.body` na
      //   linha imediatamente anterior.
      if (action === 'responder_thread') {
        const {
          lead_id,
          campanha_id,
          corpo_texto,
          corpo_html,
          in_reply_to_message_id,
          current_user_id,
          current_user_tipo,
        } = body || {};

        // ── Validações ──────────────────────────────────────────────
        if (!lead_id || !campanha_id) {
          return res.status(400).json({
            success: false,
            error: 'Parâmetros obrigatórios: lead_id, campanha_id.',
          });
        }
        if (!current_user_id || !current_user_tipo) {
          return res.status(400).json({
            success: false,
            error: 'RBAC obrigatório: current_user_id e current_user_tipo.',
          });
        }
        if (!corpo_html || typeof corpo_html !== 'string' || corpo_html.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: 'corpo_html não pode ser vazio.',
          });
        }

        const leadIdNum = parseInt(String(lead_id));
        const campIdNum = parseInt(String(campanha_id));
        const currentUserIdNum = parseInt(String(current_user_id));
        if (isNaN(leadIdNum) || isNaN(campIdNum) || isNaN(currentUserIdNum)) {
          return res.status(400).json({
            success: false,
            error: 'lead_id, campanha_id e current_user_id precisam ser inteiros válidos.',
          });
        }

        // ── 1. Carregar campanha + responsável + lead + última msg ──
        const { data: campanha, error: errCamp } = await supabase
          .from('email_campanhas')
          .select(
            'id, nome, responsavel_id, unidade, email_remetente, nome_remetente, status'
          )
          .eq('id', campIdNum)
          .maybeSingle();
        if (errCamp || !campanha) {
          return res.status(404).json({
            success: false,
            error: errCamp?.message || 'Campanha não encontrada.',
          });
        }

        // RBAC ESTRITO: Admin NÃO PODE responder (decisão Messias 30/06/2026).
        if (campanha.responsavel_id !== currentUserIdNum) {
          return res.status(403).json({
            success: false,
            error:
              current_user_tipo === 'Administrador'
                ? 'Apenas o responsável da campanha pode enviar respostas. Administrador acessa em modo leitura.'
                : 'Sem permissão: você não é o responsável desta campanha.',
          });
        }

        // Carregar dados do responsável (para From, BCC, assinatura)
        const { data: responsavel, error: errResp } = await supabase
          .from('app_users')
          .select('id, nome_usuario, email_usuario')
          .eq('id', campanha.responsavel_id)
          .maybeSingle();
        if (errResp || !responsavel) {
          return res.status(500).json({
            success: false,
            error: 'Responsável da campanha não encontrado em app_users.',
          });
        }
        if (!responsavel.email_usuario) {
          return res.status(500).json({
            success: false,
            error: 'Responsável sem email_usuario cadastrado — impossível enviar.',
          });
        }

        // Carregar lead
        const { data: lead, error: errLead } = await supabase
          .from('email_leads')
          .select('id, nome, email, opt_out')
          .eq('id', leadIdNum)
          .maybeSingle();
        if (errLead || !lead) {
          return res.status(404).json({
            success: false,
            error: errLead?.message || 'Lead não encontrado.',
          });
        }
        if (lead.opt_out) {
          return res.status(409).json({
            success: false,
            error:
              'Lead em opt-out — envio bloqueado por LGPD (regra permanente).',
          });
        }
        if (!lead.email) {
          return res.status(400).json({
            success: false,
            error: 'Lead sem email cadastrado.',
          });
        }

        // ── 2. Resolver assinatura: (responsavel.email + campanha.unidade) ──
        const { data: assinatura, error: errAssin } = await supabase
          .from('email_assinaturas')
          .select(
            'id, nome_completo, cargo, email_assinatura, telefone_fixo, telefone_celular, websites, politica_privacidade_url, unidade'
          )
          .eq('user_email', responsavel.email_usuario)
          .eq('unidade', campanha.unidade || 'TechFor TI')
          .maybeSingle();
        if (errAssin) {
          return res.status(500).json({ success: false, error: errAssin.message });
        }
        if (!assinatura) {
          return res.status(412).json({
            success: false,
            error:
              `Assinatura não cadastrada para ${responsavel.email_usuario} ` +
              `na unidade "${campanha.unidade || 'TechFor TI'}". ` +
              `Configure em Assinaturas (Admin) antes de responder.`,
          });
        }

        // ── 3. Recuperar última mensagem da thread (para threading SMTP) ──
        const { data: ultimaResposta } = await supabase
          .from('email_respostas')
          .select('id, message_id, assunto, recebido_em')
          .eq('lead_id', leadIdNum)
          .eq('campanha_id', campIdNum)
          .order('recebido_em', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Última fila enviada nesta combinação (fallback para References)
        const { data: ultimaFila } = await supabase
          .from('email_fila')
          .select('id, resend_message_id, enviado_em')
          .eq('lead_id', leadIdNum)
          .eq('campanha_id', campIdNum)
          .in('status', ['enviado', 'entregue', 'aberto', 'clicado', 'respondido'])
          .order('enviado_em', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Assunto: "Re: <último assunto>". Se não tem assunto anterior,
        // usa fallback genérico.
        const assuntoBase =
          ultimaResposta?.assunto ||
          'Conversa CRM RAISA';
        const subject = assuntoBase.toLowerCase().startsWith('re:')
          ? assuntoBase
          : `Re: ${assuntoBase}`;

        // Threading SMTP — prioridade ao param explícito do frontend.
        const inReplyTo =
          in_reply_to_message_id ||
          ultimaResposta?.message_id ||
          ultimaFila?.resend_message_id ||
          null;

        // ── 4. Criar item sintético em email_fila (step_id=NULL) ──
        // 🆕 v1.25.2 (30/06/2026 — HOTFIX): guard defensivo antes de criar
        //   item sintético. Se a campanha não tem email_remetente configurado
        //   (caso anômalo — Wizard valida isso na criação), retornamos 412
        //   ANTES de poluir email_fila com item sem chances de ser enviado.
        if (!campanha.email_remetente || campanha.email_remetente.trim().length === 0) {
          return res.status(412).json({
            success: false,
            error:
              'Campanha sem email_remetente configurado (sender SMTP). ' +
              'Não é possível enviar — peça ao admin para corrigir a campanha.',
          });
        }

        const { data: filaSintetica, error: errFila } = await supabase
          .from('email_fila')
          .insert({
            campanha_id: campIdNum,
            lead_id: leadIdNum,
            step_id: null,                                  // sinal "outbound CRM E-mail"
            destinatario_email: lead.email,
            status: 'pendente',
            tentativas: 0,
            agendado_para: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (errFila || !filaSintetica) {
          return res.status(500).json({
            success: false,
            error: `Falha ao criar item sintético em email_fila: ${errFila?.message}`,
          });
        }
        const filaId = filaSintetica.id;

        // ── 5. Montar payload Resend ──
        const sufixo = sufixoAmbienteOutbound();
        const replyTo = `customer-service${sufixo}+f${filaId}+l${leadIdNum}@${DOMINIO_REPLY_TO_OUTBOUND}`;

        // 🆕 v1.25.2 (30/06/2026 — HOTFIX): FROM SMTP usa email_remetente da
        //   CAMPANHA (sender verificado na Resend), NÃO email_assinatura
        //   (que pode ser domínio interno tipo techcob.com.br). Idêntico
        //   ao padrão do cron disparar-fila v1.13 em Production.
        //   A assinatura visual rica no rodapé HTML continua usando o
        //   email_assinatura (para identidade comercial interna).
        const from = `${campanha.nome_remetente || 'TechFor TI'} <${campanha.email_remetente}>`;

        // Renderiza HTML final (corpo digitado + assinatura)
        const htmlFinal = `${corpo_html}\n<br><br>\n${renderAssinaturaP2(assinatura)}`;

        // Headers SMTP de threading (omitidos se não houver msg anterior)
        const headersExtra: Record<string, string> = {
          'X-Entity-Ref-ID': `rms-crm-email-${filaId}`,
        };
        if (inReplyTo) {
          headersExtra['In-Reply-To'] = `<${inReplyTo}>`;
          headersExtra['References'] = `<${inReplyTo}>`;
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          // Rollback do item sintético
          await supabase.from('email_fila').delete().eq('id', filaId);
          return res.status(500).json({
            success: false,
            error: 'RESEND_API_KEY não configurada no ambiente.',
          });
        }

        // ── 6. Enviar via fetch direto (NÃO usar SDK Resend) ──
        let respFetch: Response;
        try {
          respFetch = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from,
              to: [lead.email],
              // 🆕 v1.25 — BCC para Exchange do próprio operador (item 4 do
              //   pedido do Messias). Manter Outlook sincronizado sem precisar
              //   regra Exchange Transport. Resend cobra 1 send mesmo com BCC.
              bcc: [responsavel.email_usuario],
              reply_to: [replyTo],
              subject,
              html: htmlFinal,
              text: corpo_texto || '(este email contém formatação HTML)',
              headers: headersExtra,
            }),
          });
        } catch (netErr: any) {
          await supabase.from('email_fila').delete().eq('id', filaId);
          return res.status(502).json({
            success: false,
            error: `Falha de rede ao enviar via Resend: ${netErr?.message || 'erro desconhecido'}`,
          });
        }

        const respBody: any = await respFetch.json().catch(() => ({}));

        if (!respFetch.ok) {
          // Rollback do item sintético — não polui o pipeline
          await supabase.from('email_fila').delete().eq('id', filaId);
          return res.status(502).json({
            success: false,
            error: `Resend rejeitou: [${respFetch.status}] ${respBody?.name || 'erro'}: ${respBody?.message || JSON.stringify(respBody)}`.substring(0, 500),
          });
        }

        const messageIdResend: string | null = respBody?.id || null;

        // ── 7. Atualizar item sintético com message_id e status enviado ──
        await supabase
          .from('email_fila')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            resend_message_id: messageIdResend,
          })
          .eq('id', filaId);

        // ── 8. Registrar outbound em email_respostas (POPULA 5 COLUNAS P1) ──
        // 🆕 v1.25.3 (30/06/2026 — HOTFIX): `de_email` agora espelha o
        //   FROM SMTP real (campanha.email_remetente), não a assinatura
        //   visual. Coerência com o que o lead efetivamente vê no campo
        //   "De:" do email recebido. `de_nome` mantém a identidade visual
        //   humana (nome do operador) para a thread interna.
        const nowIso = new Date().toISOString();
        const { data: novaMsg, error: errInsResp } = await supabase
          .from('email_respostas')
          .insert({
            lead_id: leadIdNum,
            campanha_id: campIdNum,
            fila_id: filaId,
            de_email: campanha.email_remetente,             // ✅ espelha FROM SMTP real
            de_nome:
              campanha.nome_remetente ||
              assinatura.nome_completo ||
              responsavel.nome_usuario ||
              'TechFor TI',
            assunto: subject,
            corpo_texto: corpo_texto || null,
            corpo_html: corpo_html,
            classificacao: null,                  // outbound não é classificável
            lido: true,                           // outbound é "lido" por definição
            recebido_em: nowIso,                  // mesmo schema — represente data de envio
            // 🆕 v1.25 — 5 colunas novas (migration P1)
            direcao: 'outbound',
            message_id: messageIdResend,
            in_reply_to_message_id: inReplyTo,
            enviado_por: currentUserIdNum,
            bcc_corporativo_em: nowIso,
          })
          .select('id')
          .single();

        if (errInsResp) {
          // Não rollback aqui — email JÁ FOI enviado. Apenas logar.
          // 🆕 v1.25.3 — log com mais detalhe para diagnóstico (ex: coluna
          //   inexistente quando migration P1 não foi aplicada).
          console.error(
            '[crm-leads] responder_thread: INSERT email_respostas falhou após envio do email. ' +
            'Frequente: migration P1 nao aplicada (coluna direcao inexistente). ' +
            'Detalhe:',
            errInsResp.message
          );
        }

        console.log(
          `[crm-leads] 💬 Outbound enviado: fila=${filaId} lead=${leadIdNum} campanha=${campIdNum} resend_id=${messageIdResend}`
        );

        return res.status(200).json({
          success: true,
          mensagem_id: novaMsg?.id || null,
          message_id_resend: messageIdResend,
          fila_id_sintetico: filaId,
          bcc_corporativo: responsavel.email_usuario,
        });
      }

      // ── CRIAR EMPRESA ────────────────────────────
      if (action === 'criar_empresa') {
        const { nome, dominio, cnpj, setor, porte, cidade, uf, website, linkedin_url,
                telefone_comercial, observacoes, origem, criado_por } = body;

        if (!nome || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome e criado_por são obrigatórios' });
        }

        // Verificar duplicata por domínio
        if (dominio) {
          const { data: existente } = await supabase
            .from('email_empresas')
            .select('id, nome')
            .eq('dominio', dominio.toLowerCase().trim())
            .maybeSingle();

          if (existente) {
            return res.status(409).json({
              success: false,
              error: `Empresa com domínio "${dominio}" já existe: ${existente.nome} (ID: ${existente.id})`,
              empresa_existente: existente,
            });
          }
        }

        const { data, error } = await supabase
          .from('email_empresas')
          .insert({
            nome: nome.trim(),
            dominio: dominio?.toLowerCase().trim() || null,
            cnpj: cnpj?.trim() || null,
            setor: setor || null,
            porte: porte || null,
            cidade: cidade?.trim() || null,
            uf: uf?.trim() || null,
            website: website?.trim() || null,
            linkedin_url: linkedin_url?.trim() || null,
            telefone_comercial: telefone_comercial?.trim() || null,
            observacoes: observacoes || null,
            origem: origem || 'manual',
            criado_por,
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Empresa criada: ${nome} (ID: ${data.id})`);
        return res.status(201).json({ success: true, empresa: data });
      }

      // ── CRIAR LEAD ───────────────────────────────
      if (action === 'criar_lead') {
        const { empresa_id, nome, email, cargo, telefone, linkedin_url,
                tags, notas, origem, criado_por, prospect_lead_id,
                // 🆕 v1.7 — Lead RBAC fix
                vertical, apto_campanha, reservado_por } = body;

        if (!nome || !email || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome, email e criado_por são obrigatórios' });
        }

        // 🆕 v1.7 — vertical e reservado_por agora são obrigatórios (sem eles
        // o lead vira invisível para a action `leads_disponiveis` de campanha)
        if (!vertical || !String(vertical).trim()) {
          return res.status(400).json({
            success: false,
            error: 'vertical é obrigatória — sem ela o lead não fica elegível para campanhas',
          });
        }
        if (!reservado_por || typeof reservado_por !== 'number') {
          return res.status(400).json({
            success: false,
            error: 'reservado_por é obrigatório (id do responsável GC/SDR pelo lead)',
          });
        }

        // 🆕 v1.7 — Validar que reservado_por aponta para um usuário GC/SDR ativo
        const { data: respUser } = await supabase
          .from('app_users')
          .select('id, tipo_usuario')
          .eq('id', reservado_por)
          .maybeSingle();
        if (!respUser) {
          return res.status(400).json({
            success: false,
            error: `Usuário responsável (id=${reservado_por}) não encontrado em app_users`,
          });
        }
        if (!['Gestão Comercial', 'SDR', 'Administrador'].includes(respUser.tipo_usuario)) {
          // Permite Admin (caso ele crie um lead reservado a si mesmo em algum
          // cenário excepcional), mas bloqueia outros perfis não operacionais.
          return res.status(400).json({
            success: false,
            error: `Tipo de usuário inválido para responsabilizar por lead: ${respUser.tipo_usuario}`,
          });
        }

        // Verificar duplicata por email
        const { data: existente } = await supabase
          .from('email_leads')
          .select('id, nome, email')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();

        if (existente) {
          return res.status(409).json({
            success: false,
            error: `Lead com email "${email}" já existe: ${existente.nome} (ID: ${existente.id})`,
            lead_existente: existente,
          });
        }

        // Verificar se email está no opt-out global
        const { data: optout } = await supabase
          .from('email_optout')
          .select('id')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();

        // 🆕 v1.7 — apto_campanha respeita o que veio do form (default true).
        // Se vier opt-out global, força apto_campanha=false como guarda-extra
        // (não faz sentido aptar p/ campanha um endereço que opt-out).
        const aptoFinal =
          (apto_campanha === undefined ? true : !!apto_campanha) && !optout;

        const { data, error } = await supabase
          .from('email_leads')
          .insert({
            empresa_id: empresa_id || null,
            prospect_lead_id: prospect_lead_id || null,
            nome: nome.trim(),
            email: email.toLowerCase().trim(),
            cargo: cargo?.trim() || null,
            telefone: telefone?.trim() || null,
            linkedin_url: linkedin_url?.trim() || null,
            tags: tags || null,
            notas: notas || null,
            origem: origem || 'manual',
            criado_por,
            opt_out: !!optout,
            opt_out_em: optout ? new Date().toISOString() : null,
            // 🆕 v1.7 — Lead RBAC fix
            vertical: String(vertical).trim(),
            apto_campanha: aptoFinal,
            apto_campanha_em: aptoFinal ? new Date().toISOString() : null,
            apto_campanha_por: aptoFinal ? criado_por : null,
            reservado_por,
            reservado_em: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Atualizar counter cache da empresa
        if (empresa_id) {
          await atualizarCountersEmpresa(empresa_id);
        }

        // Registrar no histórico
        await supabase.from('email_lead_historico').insert({
          lead_id: data.id,
          tipo: 'lead_criado',
          descricao: `Lead criado via ${origem || 'manual'}`,
          criado_por,
        });

        console.log(`✅ [crm-leads] Lead criado: ${nome} <${email}> (ID: ${data.id})${optout ? ' ⚠️ OPT-OUT' : ''}`);
        return res.status(201).json({ success: true, lead: data, opt_out_warning: !!optout });
      }

      // ── IMPORTAR DE PROSPECT_LEADS ───────────────
      if (action === 'importar_prospects') {
        const { prospect_ids, criado_por } = body;

        if (!prospect_ids?.length || !criado_por) {
          return res.status(400).json({ success: false, error: 'prospect_ids[] e criado_por são obrigatórios' });
        }

        // Buscar prospects selecionados
        const { data: prospects, error: errProspects } = await supabase
          .from('prospect_leads')
          .select('*')
          .in('id', prospect_ids);

        if (errProspects) throw errProspects;
        if (!prospects?.length) {
          return res.status(404).json({ success: false, error: 'Nenhum prospect encontrado' });
        }

        const resultados = { importados: 0, duplicados: 0, sem_email: 0, empresas_criadas: 0, erros: [] as string[] };

        for (const p of prospects) {
          // Pular se não tem email
          if (!p.email) {
            resultados.sem_email++;
            continue;
          }

          // Verificar se lead já existe
          const { data: leadExistente } = await supabase
            .from('email_leads')
            .select('id')
            .eq('email', p.email.toLowerCase().trim())
            .maybeSingle();

          if (leadExistente) {
            resultados.duplicados++;
            continue;
          }

          // Criar ou encontrar empresa pelo domínio
          let empresaId: number | null = null;
          if (p.empresa_dominio || p.empresa_nome) {
            empresaId = await findOrCreateEmpresa({
              nome: p.empresa_nome || p.empresa_dominio || 'Sem nome',
              dominio: p.empresa_dominio || null,
              setor: p.empresa_setor || null,
              cidade: p.cidade || null,
              uf: p.estado || null,
              website: p.empresa_website || null,
              linkedin_url: p.empresa_linkedin || null,
              criado_por,
            }, resultados);
          }

          // Criar lead
          const { error: errInsert } = await supabase
            .from('email_leads')
            .insert({
              empresa_id: empresaId,
              prospect_lead_id: p.id,
              nome: p.nome_completo?.trim() || 'Sem nome',
              email: p.email.toLowerCase().trim(),
              cargo: p.cargo || null,
              linkedin_url: p.linkedin_url || null,
              origem: 'prospect_engine',
              criado_por,
            });

          if (errInsert) {
            resultados.erros.push(`${p.nome_completo}: ${errInsert.message}`);
          } else {
            resultados.importados++;
            // 🆕 30/05/2026 — Marcar prospect como 'no_crm' para sumir do Prospect Engine
            await supabase
              .from('prospect_leads')
              .update({ status: 'no_crm' })
              .eq('id', p.id);
          }
        }

        // Atualizar counters de todas as empresas afetadas
        const { data: empresasAfetadas } = await supabase
          .from('email_empresas')
          .select('id');

        for (const emp of empresasAfetadas || []) {
          await atualizarCountersEmpresa(emp.id);
        }

        console.log(`✅ [crm-leads] Importação: ${resultados.importados} importados, ${resultados.duplicados} duplicados, ${resultados.sem_email} sem email, ${resultados.empresas_criadas} empresas criadas`);
        return res.status(200).json({ success: true, resultados });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 🆕 PROMOVER 1 PROSPECT → CRM (30/05/2026)
      // ─────────────────────────────────────────────────────────────────────
      // Action chamada pelo botão "Campanhas" da aba "Meus Leads Salvos" do
      // ProspectSearchPage. Promove um único prospect_lead para email_leads
      // (CRM) e marca o prospect com status='no_crm' para sumir da lista.
      //
      // Diferenças de 'importar_prospects':
      //  - Recebe 1 prospect_id (não lista)
      //  - Resposta tem o lead criado completo (para uso imediato no frontend)
      //  - Trata caso "já existe no CRM" como sucesso (sincroniza status)
      // ─────────────────────────────────────────────────────────────────────
      if (action === 'promover_para_campanha') {
        // 🆕 v1.8 (Fase A) — campanha_id opcional: quando informado,
        // o lead promovido é vinculado à campanha em sequência (mesmo
        // request, defesa em profundidade com rollback lógico em caso
        // de erro). Quando null/omitido, comportamento legado: lead
        // vai apenas para o CRM como "apto" (aguarda futura vinculação
        // pelo wizard de campanha).
        const { prospect_id, criado_por, campanha_id } = body;

        if (!prospect_id || !criado_por) {
          return res.status(400).json({
            success: false,
            error: 'prospect_id e criado_por são obrigatórios',
          });
        }

        // 1. Buscar o prospect
        const { data: prospect, error: errProspect } = await supabase
          .from('prospect_leads')
          .select('*')
          .eq('id', prospect_id)
          .maybeSingle();

        if (errProspect) throw errProspect;
        if (!prospect) {
          return res.status(404).json({ success: false, error: 'Prospect não encontrado' });
        }

        // 2. Validar email (sem email não pode virar lead de campanha)
        if (!prospect.email) {
          return res.status(400).json({
            success: false,
            error: 'Prospect sem email — resolva o email antes de promover',
          });
        }

        // 2b. 🆕 31/05/2026 — Validar vertical (obrigatória para campanhas)
        if (!prospect.vertical || !String(prospect.vertical).trim()) {
          return res.status(400).json({
            success: false,
            error: 'Setar uma Vertical de Negócios para este Lead',
          });
        }

        const emailNormalizado = prospect.email.toLowerCase().trim();

        // 3. Se já existe em email_leads, apenas sincronizar status no prospect
        const { data: leadExistente } = await supabase
          .from('email_leads')
          .select('id, nome')
          .eq('email', emailNormalizado)
          .maybeSingle();

        if (leadExistente) {
          await supabase
            .from('prospect_leads')
            .update({ status: 'no_crm' })
            .eq('id', prospect_id);

          console.log(`ℹ️ [crm-leads] Lead "${prospect.nome_completo}" já estava no CRM (ID ${leadExistente.id}) — Prospect marcado como 'no_crm'`);

          // 🆕 v1.8 (Fase A) — se foi pedido para vincular a campanha,
          // executar a vinculação MESMO no lead pré-existente. A função
          // helper aplica todas as validações (status, vertical, dono,
          // duplicação, opt-out) + enfileiramento se necessário.
          let vinculoCampanha: any = null;
          if (campanha_id) {
            // Buscar dados completos do lead existente para validação
            // (vertical e reservado_por podem ter sido editados desde
            // a criação — não confiar nos dados do prospect).
            const { data: leadCompleto } = await supabase
              .from('email_leads')
              .select('id, nome, email, vertical, reservado_por')
              .eq('id', leadExistente.id)
              .maybeSingle();

            if (!leadCompleto) {
              return res.status(500).json({
                success: false,
                error: 'Lead existente desapareceu entre buscas (erro de consistência)',
              });
            }

            const resultadoVinculo = await vincularLeadACampanha(
              supabase,
              leadCompleto,
              Number(campanha_id),
              criado_por
            );
            if (!resultadoVinculo.success) {
              // Importante: prospect já foi marcado como 'no_crm' acima.
              // Devolvemos erro 400 indicando que a vinculação falhou mas
              // o lead permanece no CRM. O frontend deve mostrar o erro
              // e atualizar a lista (lead saiu da aba "Meus Leads Salvos").
              return res.status(400).json({
                success: false,
                ja_existia: true,
                lead: leadExistente,
                error: resultadoVinculo.error,
              });
            }
            vinculoCampanha = resultadoVinculo.vinculo;
          }

          return res.status(200).json({
            success: true,
            lead: leadExistente,
            ja_existia: true,
            campanha: vinculoCampanha,
            mensagem: vinculoCampanha
              ? `Lead já estava no CRM e foi vinculado à campanha "${vinculoCampanha.campanha_nome}".`
              : 'Lead já estava no CRM. Prospect Engine atualizado.',
          });
        }

        // 4. Criar ou encontrar empresa pelo domínio
        let empresaId: number | null = null;
        const empresasResult = { empresas_criadas: 0 };
        if (prospect.empresa_dominio || prospect.empresa_nome) {
          empresaId = await findOrCreateEmpresa({
            nome: prospect.empresa_nome || prospect.empresa_dominio || 'Sem nome',
            dominio: prospect.empresa_dominio || null,
            setor: prospect.empresa_setor || null,
            cidade: prospect.cidade || null,
            uf: prospect.estado || null,
            website: prospect.empresa_website || null,
            linkedin_url: prospect.empresa_linkedin || null,
            criado_por,
          }, empresasResult);
        }

        // 5. Criar email_lead no CRM
        //
        // 🐛 v1.8 (09/06/2026 — Fase A) — BUG FIX preexistente:
        //   Antes desta versão, este INSERT não populava `reservado_por`,
        //   o que tornava o lead INELEGÍVEL para qualquer campanha (a
        //   Fase B em crm-campanhas.ts trava `lead.reservado_por ===
        //   campanha.responsavel_id`). Bug histórico que só apareceu
        //   quando a action `listar_campanhas_disponiveis_para_lead`
        //   (v1.11) tentou filtrar campanhas elegíveis e sempre
        //   retornou vazio para leads vindos do Prospect Engine.
        //   Correção: herdar `prospect.reservado_por` (campo já
        //   populado em prospect_leads desde a pesquisa). Adicionamos
        //   também `apto_campanha=true` + auditoria para consistência
        //   com `criar_lead` (v1.7) — lead promovido nasce apto.
        const agoraIso = new Date().toISOString();
        const { data: novoLead, error: errInsertLead } = await supabase
          .from('email_leads')
          .insert({
            empresa_id: empresaId,
            prospect_lead_id: prospect.id,
            nome: prospect.nome_completo?.trim() || 'Sem nome',
            email: emailNormalizado,
            cargo: prospect.cargo || null,
            linkedin_url: prospect.linkedin_url || null,
            vertical: String(prospect.vertical).trim(),
            origem: 'prospect_engine',
            criado_por,
            // 🆕 v1.8 — Lead RBAC fix (bug preexistente):
            reservado_por: prospect.reservado_por || null,
            reservado_em: prospect.reservado_por ? agoraIso : null,
            apto_campanha: true,
            apto_campanha_em: agoraIso,
            apto_campanha_por: criado_por,
          })
          .select()
          .single();

        if (errInsertLead) {
          return res.status(500).json({
            success: false,
            error: `Erro ao criar lead no CRM: ${errInsertLead.message}`,
          });
        }

        // 6. Marcar prospect como 'no_crm'
        const { error: errUpdate } = await supabase
          .from('prospect_leads')
          .update({ status: 'no_crm' })
          .eq('id', prospect_id);

        if (errUpdate) {
          console.error(`⚠️ [crm-leads] Lead criado mas falhou ao atualizar prospect ${prospect_id}: ${errUpdate.message}`);
          // Não bloqueia — o lead já está no CRM, apenas o prospect ficará visível ainda
        }

        // 7. Atualizar counter cache da empresa
        if (empresaId) {
          await atualizarCountersEmpresa(empresaId);
        }

        // 8. Registrar no histórico do lead
        await supabase.from('email_lead_historico').insert({
          lead_id: novoLead.id,
          tipo: 'lead_criado',
          descricao: `Lead promovido do Prospect Engine (prospect ID ${prospect.id})`,
          criado_por,
        });

        console.log(`✅ [crm-leads] Lead promovido: ${prospect.nome_completo} <${emailNormalizado}> → CRM ID ${novoLead.id}`);

        // 🆕 v1.8 (Fase A) — vincular a campanha SE solicitado.
        // O helper aplica validações completas e enfileira em email_fila
        // quando a campanha já tem inicio_envio (status ativa/pausada).
        // Falha aqui NÃO desfaz o lead criado — o lead permanece no CRM
        // e o erro indica que apenas a vinculação falhou (operação parcial
        // consistente: lead apto a futuras vinculações).
        let vinculoCampanha: any = null;
        if (campanha_id) {
          const resultadoVinculo = await vincularLeadACampanha(
            supabase,
            novoLead,
            Number(campanha_id),
            criado_por
          );
          if (!resultadoVinculo.success) {
            // Devolve 207 (Multi-Status) — sucesso parcial. O frontend
            // deve mostrar o lead como criado + alerta da falha de vínculo.
            return res.status(207).json({
              success: true,
              lead: novoLead,
              empresa_id: empresaId,
              empresa_criada: empresasResult.empresas_criadas > 0,
              campanha: null,
              vinculo_falhou: true,
              error: resultadoVinculo.error,
            });
          }
          vinculoCampanha = resultadoVinculo.vinculo;
        }

        return res.status(201).json({
          success: true,
          lead: novoLead,
          empresa_id: empresaId,
          empresa_criada: empresasResult.empresas_criadas > 0,
          campanha: vinculoCampanha,
          mensagem: vinculoCampanha
            ? `Lead promovido e vinculado à campanha "${vinculoCampanha.campanha_nome}".`
            : 'Lead promovido para o CRM.',
        });
      }

      // ── PROMOVER CORRETOR CRECI PARA CAMPANHA ─────────────────────────────────
      // 🆕 v1.6 (05/06/2026) — Promove 1 corretor da tabela `corretores_creci`
      // para o CRM. Cria registro em `email_leads` com vertical='CRECI' e
      // empresa_id=null (corretor é PF, sem empresa). Marca `data_envio_adv`
      // no corretor para que a UI do CreciPage reflita a promoção.
      // Idempotente: se já existir lead com o mesmo email, apenas sincroniza
      // data_envio_adv e retorna ja_existia=true.
      if (action === 'promover_corretor_para_campanha') {
        const { corretor_id, criado_por } = body;

        if (!corretor_id || !criado_por) {
          return res.status(400).json({
            success: false,
            error: 'corretor_id e criado_por são obrigatórios',
          });
        }

        // 1. Buscar o corretor
        const { data: corretor, error: errCorretor } = await supabase
          .from('corretores_creci')
          .select('*')
          .eq('id', corretor_id)
          .maybeSingle();

        if (errCorretor) throw errCorretor;
        if (!corretor) {
          return res.status(404).json({ success: false, error: 'Corretor não encontrado' });
        }

        // 2. Determinar email — prioridade: email_creci > email_pessoal
        const emailRaw = corretor.email_creci || corretor.email_pessoal;
        if (!emailRaw || !String(emailRaw).trim()) {
          return res.status(400).json({
            success: false,
            error: 'Corretor sem email (email_creci e email_pessoal vazios) — não pode ser promovido para campanha',
          });
        }
        const emailNormalizado = String(emailRaw).toLowerCase().trim();

        // 3. Se já existe lead com o mesmo email, apenas sincronizar data_envio_adv
        const { data: leadExistente } = await supabase
          .from('email_leads')
          .select('id, nome')
          .eq('email', emailNormalizado)
          .maybeSingle();

        if (leadExistente) {
          await supabase
            .from('corretores_creci')
            .update({ data_envio_adv: new Date().toISOString() })
            .eq('id', corretor_id);

          console.log(`ℹ️ [crm-leads] Corretor "${corretor.nome}" já estava no CRM (lead ID ${leadExistente.id}) — data_envio_adv sincronizado`);
          return res.status(200).json({
            success: true,
            lead: leadExistente,
            ja_existia: true,
            mensagem: 'Corretor já estava no CRM. data_envio_adv sincronizado.',
          });
        }

        // 4. Verificar opt-out global
        const { data: optout } = await supabase
          .from('email_optout')
          .select('id')
          .eq('email', emailNormalizado)
          .maybeSingle();

        // 5. Criar email_lead (corretor PF — sem empresa)
        const { data: novoLead, error: errInsertLead } = await supabase
          .from('email_leads')
          .insert({
            empresa_id: null,                                  // corretor é PF
            prospect_lead_id: null,                            // não vem do Prospect Engine
            nome: String(corretor.nome || '').trim() || 'Sem nome',
            email: emailNormalizado,
            cargo: 'Corretor de Imóveis',
            telefone: corretor.celular || null,
            vertical: 'CRECI',
            origem: 'creci',
            criado_por,
            opt_out: !!optout,
            opt_out_em: optout ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (errInsertLead) {
          return res.status(500).json({
            success: false,
            error: `Erro ao criar lead no CRM: ${errInsertLead.message}`,
          });
        }

        // 6. Marcar data_envio_adv no corretor (timestamp da promoção)
        const { error: errUpdate } = await supabase
          .from('corretores_creci')
          .update({ data_envio_adv: new Date().toISOString() })
          .eq('id', corretor_id);

        if (errUpdate) {
          console.error(`⚠️ [crm-leads] Lead criado mas falhou ao atualizar data_envio_adv do corretor ${corretor_id}: ${errUpdate.message}`);
          // Não bloqueia — o lead já está no CRM
        }

        // 7. Registrar no histórico do lead
        await supabase.from('email_lead_historico').insert({
          lead_id: novoLead.id,
          tipo: 'lead_criado',
          descricao: `Corretor CRECI promovido para CRM (corretor ID ${corretor.id}, CRECI: ${corretor.creci || 's/CRECI'})`,
          criado_por,
        });

        console.log(`✅ [crm-leads] Corretor promovido: ${corretor.nome} <${emailNormalizado}> → CRM ID ${novoLead.id}`);
        return res.status(201).json({
          success: true,
          lead: novoLead,
          ja_existia: false,
          mensagem: 'Corretor enviado ao CRM com sucesso.',
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 v1.9 (10/06/2026 — Vinculação em Lote) — vincula N leads
      // a uma campanha em uma única operação, com alteração opcional
      // de vertical em lote.
      // 🔄 v1.10 (10/06/2026 — CRECI condicional) — tratamento bidirecional:
      //   - vertical_destino === 'CRECI':
      //       Rejeita leads com vertical ≠ CRECI ("não vira CRECI");
      //       NÃO altera vertical dos leads CRECI (já são CRECI).
      //   - vertical_destino ≠ 'CRECI':
      //       Rejeita leads com vertical === CRECI (já fazia em v1.9);
      //       Altera vertical normalmente se diferente.
      //
      // 🛡️ REGRA PERMANENTE — A garantia "CRECI não muda de vertical" é
      //   mantida nos DOIS casos: nenhum UPDATE em email_leads.vertical
      //   é disparado quando o lead já é CRECI (apenas vincula).
      //
      // Body:
      //   lead_ids: number[]         (obrigatório, ≥ 1)
      //   campanha_id: number        (obrigatório)
      //   vertical_destino: string   (obrigatório — qualquer vertical, inclusive CRECI)
      //   criado_por: string         (obrigatório, email do usuário)
      //
      // Processo (não-transacional):
      //   Para cada lead:
      //     1. Validar compatibilidade CRECI (vide tabela bidirecional acima)
      //     2. Se lead.vertical ≠ vertical_destino → UPDATE vertical
      //        + histórico 'vertical_alterada' (não ocorre quando ambos=CRECI)
      //     3. Chama vincularLeadACampanha (Fase A v1.8) — 7 validações
      //        + enfileiramento condicional em email_fila
      //     4. Coleta sucesso ou falha estruturada
      //
      // Retorno:
      //   { success, campanha_nome, total, sucessos,
      //     verticais_alteradas, falhas: [{lead_id, lead_nome, error}] }
      // ─────────────────────────────────────────────────────────
      if (action === 'vincular_em_lote_a_campanha') {
        const { lead_ids, campanha_id, vertical_destino, criado_por } = body;

        // ── Validações de entrada ──────────────────────────────
        if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
          return res.status(400).json({ success: false, error: 'lead_ids[] obrigatório (≥ 1 lead)' });
        }
        if (!campanha_id) {
          return res.status(400).json({ success: false, error: 'campanha_id obrigatório' });
        }
        if (!vertical_destino || !String(vertical_destino).trim()) {
          return res.status(400).json({ success: false, error: 'vertical_destino obrigatória' });
        }
        if (!criado_por) {
          return res.status(400).json({ success: false, error: 'criado_por obrigatório' });
        }

        // 🔄 v1.10 — CRECI agora é aceito como destino, mas com regra
        //   especial: só permite leads que JÁ sejam CRECI (loop por lead).
        const destinoEhCreci = vertical_destino === 'CRECI';

        // ── Buscar campanha (validações da camada de vinculação ainda rodam por lead) ──
        const { data: campanha, error: errCamp } = await supabase
          .from('email_campanhas')
          .select('id, nome, tipo, status, inicio_envio, data_encerramento')
          .eq('id', campanha_id)
          .maybeSingle();

        if (errCamp) throw errCamp;
        if (!campanha) {
          return res.status(404).json({ success: false, error: `Campanha ID ${campanha_id} não encontrada` });
        }
        if (campanha.tipo !== vertical_destino) {
          return res.status(400).json({
            success: false,
            error: `Inconsistência: vertical_destino="${vertical_destino}" ≠ campanha.tipo="${campanha.tipo}". Recarregue a lista de campanhas.`,
          });
        }
        if (!['ativa', 'pausada', 'agendada'].includes(campanha.status)) {
          return res.status(400).json({
            success: false,
            error: `Campanha "${campanha.nome}" está em status "${campanha.status}" — só aceita novos leads em ativa/pausada/agendada.`,
          });
        }

        // ── Buscar leads selecionados ──────────────────────────
        const { data: leads, error: errLeads } = await supabase
          .from('email_leads')
          .select('id, nome, email, vertical, reservado_por, apto_campanha, opt_out, funil_status')
          .in('id', lead_ids);

        if (errLeads) throw errLeads;
        if (!leads || leads.length === 0) {
          return res.status(404).json({ success: false, error: 'Nenhum lead encontrado para os IDs informados' });
        }

        // ── Loop de processamento ──────────────────────────────
        const resultados = {
          total: leads.length,
          sucessos: 0,
          verticais_alteradas: 0,
          falhas: [] as Array<{ lead_id: number; lead_nome: string; error: string }>,
        };

        for (const lead of leads) {
          // 🛡️ REGRA CRECI BIDIRECIONAL (v1.10 — condicional pelo destino)
          if (destinoEhCreci) {
            // Destino CRECI → só aceita leads que JÁ são CRECI.
            // Lead não-CRECI não pode virar CRECI (entrada bloqueada).
            if (lead.vertical !== 'CRECI') {
              resultados.falhas.push({
                lead_id: lead.id,
                lead_nome: lead.nome,
                error: `Lead de vertical "${lead.vertical || '—'}" não pode ser vinculado a campanha CRECI — apenas leads CRECI vinculam a campanhas CRECI (regra permanente).`,
              });
              continue;
            }
            // OK: lead.vertical === 'CRECI' e destino === 'CRECI' → vincula sem alterar
          } else {
            // Destino não-CRECI → bloqueia leads CRECI (saída bloqueada)
            if (lead.vertical === 'CRECI') {
              resultados.falhas.push({
                lead_id: lead.id,
                lead_nome: lead.nome,
                error: 'Lead CRECI não pode ter sua vertical alterada para outra (regra permanente).',
              });
              continue;
            }
          }

          // Validação adicional — lead apto e não-opt-out
          if (!lead.apto_campanha) {
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: 'Lead não está marcado como apto a campanhas (apto_campanha=false).',
            });
            continue;
          }

          let verticalAtualizada = lead.vertical;

          // 🆕 v1.16.2 — DRY-RUN PRIMEIRO (atomicidade).
          //   Antes desta versão, o UPDATE vertical era feito ANTES das
          //   validações do helper (RBAC, opt-out, bounce, duplicação). Em
          //   caso de falha, o lead ficava com vertical alterada SEM ter
          //   sido vinculado — estado inconsistente latente.
          //
          //   Solução: chamar o helper em modo dryRun=true PRIMEIRO,
          //   passando vertical_destino via opts.verticalEsperada (o helper
          //   simula que a vertical já estaria alterada). Se passar, então
          //   promovemos UPDATE + histórico + chamada real. Se falhar, lead
          //   permanece intacto.
          const dryRunResult = await vincularLeadACampanha(
            supabase,
            {
              id: lead.id,
              nome: lead.nome,
              email: lead.email,
              vertical: lead.vertical,
              reservado_por: lead.reservado_por,
            },
            campanha_id,
            criado_por,
            { verticalEsperada: vertical_destino, dryRun: true }
          );

          if (!dryRunResult.success) {
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: dryRunResult.error || 'Falha na pré-validação (dry-run)',
            });
            continue;
          }

          // ── Alteração de vertical (se necessário) ────────────
          // 🔄 v1.10 — Quando destinoEhCreci=true e lead.vertical==='CRECI',
          //   esta condição é falsa → NÃO dispara UPDATE (já são iguais).
          // 🆕 v1.16.2 — Esta etapa só é executada se o dry-run acima passou.
          //   A vertical é alterada como ÚLTIMA mutação antes da chamada
          //   real do helper, garantindo atomicidade.
          if (lead.vertical !== vertical_destino) {
            const { error: errUpdate } = await supabase
              .from('email_leads')
              .update({
                vertical: vertical_destino,
                atualizado_em: new Date().toISOString(),
              })
              .eq('id', lead.id);

            if (errUpdate) {
              resultados.falhas.push({
                lead_id: lead.id,
                lead_nome: lead.nome,
                error: `Falha ao atualizar vertical: ${errUpdate.message}`,
              });
              continue;
            }

            verticalAtualizada = vertical_destino;
            resultados.verticais_alteradas++;

            // Histórico de mudança de vertical
            // 🆕 v1.16.2 — campanha_id agora populado (FK) para permitir
            //   queries auditoria "todas as movimentações da campanha X".
            await supabase.from('email_lead_historico').insert({
              lead_id: lead.id,
              campanha_id: campanha_id,
              tipo: 'vertical_alterada',
              descricao: `Vertical alterada de "${lead.vertical || '—'}" para "${vertical_destino}" (vinculação em lote à campanha "${campanha.nome}")`,
              criado_por,
            });
          }

          // ── Vinculação à campanha (helper reaproveitado, execução real) ─
          const resultadoVinculo = await vincularLeadACampanha(
            supabase,
            {
              id: lead.id,
              nome: lead.nome,
              email: lead.email,
              vertical: verticalAtualizada,
              reservado_por: lead.reservado_por,
            },
            campanha_id,
            criado_por
          );

          if (resultadoVinculo.success) {
            resultados.sucessos++;
          } else {
            // Caso raríssimo: dry-run passou mas execução real falhou
            // (ex: concorrência entre janelas). Reportar honestamente.
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: resultadoVinculo.error || 'Erro desconhecido ao vincular (pós dry-run)',
            });
          }
        }

        console.log(
          `✅ [crm-leads/vincular_em_lote] ${resultados.sucessos}/${resultados.total} leads vinculados à campanha "${campanha.nome}" ` +
          `(${resultados.verticais_alteradas} verticais alteradas, ${resultados.falhas.length} falhas) [destino=${vertical_destino}]`
        );

        return res.status(200).json({
          success: true,
          campanha_id: campanha.id,
          campanha_nome: campanha.nome,
          campanha_status: campanha.status,
          ...resultados,
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 v1.22 (23/06/2026) — POST `recuperar_invalido_para_campanha`
      // ─────────────────────────────────────────────────────────
      //
      // Recupera um lead da aba "E-mails Inválidos" para uma campanha.
      // Disparado pelo botão "Promover" do InvalidosTab v1.3, que aparece
      // somente quando o lead foi previamente CORRIGIDO (bounced=false +
      // motivo_invalidacao IS NOT NULL).
      //
      // Cenário típico:
      //   1. Lead recebe hard bounce em campanha → webhook seta
      //      bounced=true + motivo_invalidacao='bounce' (ou similar).
      //   2. Lead aparece na aba Inválidos (botões: Editar, Recovery).
      //   3. GC/SDR corrige o email (Editar) ou Recovery 3.A encontra
      //      novo email → backend reseta bounced=false automaticamente
      //      (atualizar_lead v1.11) mas motivo_invalidacao permanece
      //      preenchido (proposital — lead continua na aba como
      //      "pronto para promover").
      //   4. GC/SDR clica em "Promover" → escolhe campanha no modal
      //      RecuperarParaCampanhaModal → chama esta action.
      //
      // Body esperado:
      //   { lead_id: number, campanha_id: number, criado_por: string }
      //
      // Validações (defesa em profundidade — frontend já filtra):
      //   - Lead existe em email_leads
      //   - lead.bounced === false (rejeita com 400 se ainda bounced)
      //   - lead.opt_out === false (rejeita por LGPD)
      //   - Helper vincularLeadACampanha aplica as 7 validações canônicas
      //     (status campanha, data_encerramento, vertical, responsavel,
      //     duplicação simultânea, opt-out legacy).
      //
      // Efeitos colaterais:
      //   - INSERT em email_lead_campanhas (status='ativa', step_atual=1)
      //   - Eventuais INSERTs em email_fila (se campanha já iniciou)
      //   - UPDATE em email_leads: motivo_invalidacao=NULL,
      //     bounced_motivo=NULL, atualizado_em=NOW(). Lead sai da aba
      //     Inválidos pelo critério D2 (bounced=false AND
      //     motivo_invalidacao IS NULL).
      //   - INSERT em email_lead_historico tipo='recuperacao_invalido'.
      //
      // Atomicidade lógica:
      //   - Se vinculação falha (vertical incompatível, campanha encerrada,
      //     etc.), motivo_invalidacao NÃO é limpo. Lead permanece visível
      //     na aba para outra tentativa. Sem rollback complexo necessário.
      //   - Se UPDATE da limpeza falha após vincular_lead_a_campanha
      //     bem-sucedido (raro): logamos warning mas retornamos sucesso —
      //     o lead já está na campanha e o motivo será reclassificado
      //     na próxima leitura da aba (consistência eventual).
      //
      // Retorno: 201 { success, lead, vinculo } ou 400 { success, error }.
      //
      if (action === 'recuperar_invalido_para_campanha') {
        const { lead_id, campanha_id, criado_por } = body;

        if (!lead_id || !campanha_id || !criado_por) {
          return res.status(400).json({
            success: false,
            error: 'lead_id, campanha_id e criado_por são obrigatórios',
          });
        }

        // 1. Carregar lead completo (precisa de vertical/reservado_por para
        //    o helper + bounced/opt_out para validação defensiva).
        const { data: lead, error: errLead } = await supabase
          .from('email_leads')
          .select(
            'id, nome, email, vertical, reservado_por, bounced, opt_out, ' +
            'motivo_invalidacao, bounced_motivo'
          )
          .eq('id', lead_id)
          .maybeSingle();

        if (errLead) throw errLead;
        if (!lead) {
          return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }

        // 2. Validação defensiva: bounced=false (frontend já oculta o botão,
        //    mas defesa contra race condition — Recovery pode ter falhado
        //    e setado bounced=true entre o render e o clique).
        if (lead.bounced === true) {
          return res.status(400).json({
            success: false,
            error:
              'Lead ainda está marcado como bounced=true. Corrija o email ' +
              '(botão Editar) antes de promover para uma campanha.',
          });
        }

        // 3. Validação defensiva: opt_out (LGPD — defesa em profundidade,
        //    helper também checa, mas falhamos cedo com mensagem clara).
        if (lead.opt_out === true) {
          return res.status(400).json({
            success: false,
            error: 'Lead está em opt-out — não pode entrar em campanha (LGPD).',
          });
        }

        // 4. Validação: lead precisa ter vertical e responsável (pré-requisitos
        //    do helper, mas falhamos cedo com mensagem específica).
        if (!lead.vertical || !String(lead.vertical).trim()) {
          return res.status(400).json({
            success: false,
            error: 'Lead sem Vertical de Negócios definida — defina antes de promover.',
          });
        }
        if (!lead.reservado_por) {
          return res.status(400).json({
            success: false,
            error: 'Lead sem responsável (reservado_por) — atribua antes de promover.',
          });
        }

        // 5. Vincular via helper canônico (7 validações + enfileiramento).
        //    Helper retorna estruturado {success, error?, vinculo?} — sem
        //    exceções. Passamos bounced=false explícito (otimização: helper
        //    não precisa consultar o banco de novo).
        //
        // 🆕 v1.22.2 (24/06/2026) — `modoRecuperacao: true` instrui o helper
        //    a fazer UPSERT no vínculo (etapa 8), DELETE prévio na fila
        //    (etapa 9) e gravar histórico tipo='campanha_recuperada' (etapa
        //    11). Necessário porque leads vindos da aba Inválidos
        //    NORMALMENTE já têm vínculo terminal pré-existente (bounced/
        //    cancelado/concluida) — INSERT puro batia em unique constraint.
        const resultadoVinculo = await vincularLeadACampanha(
          supabase,
          {
            id: lead.id,
            nome: lead.nome,
            email: lead.email,
            vertical: lead.vertical,
            reservado_por: lead.reservado_por,
            bounced: false,
            opt_out: false,
          },
          Number(campanha_id),
          criado_por,
          { modoRecuperacao: true },
        );

        if (!resultadoVinculo.success) {
          // Vinculação rejeitada — NÃO limpamos motivo_invalidacao.
          // Lead continua na aba Inválidos para nova tentativa.
          return res.status(400).json({
            success: false,
            error: resultadoVinculo.error,
          });
        }

        // 6. Limpeza pós-vinculação: motivo_invalidacao + bounced_motivo
        //    para o lead sair da aba Inválidos. bounced JÁ é false (foi
        //    validado no passo 2). bounced_em mantemos como auditoria
        //    histórica (quando bouncou pela primeira vez) — só limpamos
        //    bounced_motivo (último motivo raw do Resend, já consumido).
        const { error: errLimpeza } = await supabase
          .from('email_leads')
          .update({
            motivo_invalidacao: null,
            bounced_motivo: null,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', lead_id);

        if (errLimpeza) {
          // Inconsistência rara: vinculação OK mas limpeza falhou.
          // O lead JÁ está na campanha — não falhamos a operação inteira.
          console.warn(
            `⚠️ [crm-leads/recuperar_invalido] Lead ${lead_id} vinculado à campanha ${campanha_id} ` +
            `mas falhou ao limpar motivo_invalidacao: ${errLimpeza.message}. ` +
            `Lead permanecerá visível na aba Inválidos até intervenção manual.`
          );
        }

        // 7. Histórico para auditoria — sempre, mesmo se limpeza falhou.
        await supabase.from('email_lead_historico').insert({
          lead_id: lead_id,
          tipo: 'recuperacao_invalido',
          descricao:
            `Lead recuperado da aba E-mails Inválidos e vinculado à campanha "${resultadoVinculo.vinculo?.campanha_nome}". ` +
            `Motivo de invalidação anterior: ${lead.motivo_invalidacao || 'não registrado'}. ` +
            `Email atual: "${lead.email}".`,
          dados: {
            campanha_id: resultadoVinculo.vinculo?.campanha_id,
            campanha_nome: resultadoVinculo.vinculo?.campanha_nome,
            campanha_status: resultadoVinculo.vinculo?.campanha_status,
            motivo_invalidacao_anterior: lead.motivo_invalidacao,
            bounced_motivo_anterior: lead.bounced_motivo,
            email: lead.email,
            enfileirados: resultadoVinculo.vinculo?.enfileirados ?? 0,
          },
          criado_por,
        });

        console.log(
          `✅ [crm-leads/recuperar_invalido] Lead ${lead_id} (${lead.email}) recuperado → ` +
          `campanha ${campanha_id} (${resultadoVinculo.vinculo?.campanha_nome}) ` +
          `[enfileirados=${resultadoVinculo.vinculo?.enfileirados ?? 0}]`
        );

        return res.status(201).json({
          success: true,
          lead: {
            id: lead.id,
            nome: lead.nome,
            email: lead.email,
          },
          vinculo: resultadoVinculo.vinculo,
          mensagem: `Lead recuperado e vinculado à campanha "${resultadoVinculo.vinculo?.campanha_nome}".`,
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 v1.11 (10/06/2026) — POST `desabilitar_lead` (opt-out manual)
      // 🔧 v1.12 (11/06/2026 — Bloco 1 OPT-OUT 100%): REFATORADO para
      //   delegar a cascata ao helper compartilhado aplicarOptOut.
      // ─────────────────────────────────────────────────────────
      //
      // Aplica opt-out manual em cascata para um lead específico, disparado
      // por gestor/admin/SDR via UI (botão "Opt-Out" no LeadFormModal v1.2).
      //
      // Decisão de produto (CHECKPOINT_2026-06-10.md):
      //   • P2.1 — opt-out é IRREVERSÍVEL (LGPD). Esta action NÃO tem
      //     contraparte de reativação.
      //   • P2.2 — lead permanece visível na Base de Leads com badge vermelho.
      //   • Cascata global: cancela fila pendente em TODAS as campanhas.
      //
      // Cascata (executada pelo helper aplicarOptOut, origem='manual'):
      //   1. UPDATE email_leads SET opt_out=true, opt_out_em=NOW()
      //   2. UPSERT email_optout (motivo, criado_por)
      //   3. UPDATE email_fila SET status='cancelado',
      //      motivo_cancelamento='opt_out_manual' para todos pendentes
      //   4. INSERT email_lead_historico (tipo='opt_out_manual', dados)
      //
      // RBAC: o frontend deve restringir o botão a Administrador / Gestão
      //   Comercial / SDR (decisão 11/06/2026). Esta action confia no
      //   `criado_por` informado (auditoria, não autorização).
      //
      // Body esperado:
      //   { lead_id: number, motivo?: string, criado_por: string }
      //
      // Retorno: { success: true, lead_id, email, total_cancelados,
      //            ja_estava_optout, motivo }
      //
      // Idempotência: se o lead já estava em opt-out (lead.opt_out=true),
      //   o helper retorna `ja_estava_optout=true` sem repetir a cascata.
      //
      if (action === 'desabilitar_lead') {
        const { lead_id, motivo, criado_por } = body;
        if (!lead_id || !criado_por) {
          return res.status(400).json({
            success: false,
            error: 'lead_id e criado_por são obrigatórios',
          });
        }

        // Buscar email do lead (validação prévia + retorno na resposta).
        // O helper aceita lead_id mas precisamos do email para retornar ao
        // frontend (ele exibe o email no toast pós-ação).
        const { data: lead, error: errLead } = await supabase
          .from('email_leads')
          .select('id, nome, email')
          .eq('id', lead_id)
          .maybeSingle();

        if (errLead) {
          return res.status(500).json({
            success: false,
            error: `Falha ao buscar lead: ${errLead.message}`,
          });
        }
        if (!lead) {
          return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }

        const emailNorm = String(lead.email || '').toLowerCase().trim();
        if (!emailNorm) {
          return res.status(400).json({
            success: false,
            error: 'Lead sem email — nada a desabilitar.',
          });
        }

        // 🆕 v1.12 — Delegação ao helper compartilhado.
        const resultado = await aplicarOptOut({
          supabase,
          lead_id: lead.id,
          email: emailNorm,
          origem: 'manual',
          motivo: motivo?.trim() || null,
          criado_por,
          campanha_origem_id: null, // opt-out manual não é vinculado a campanha
        });

        if (!resultado.ok) {
          return res.status(500).json({
            success: false,
            error: resultado.error || 'Falha ao aplicar opt-out',
          });
        }

        // Resposta retrocompatível com o frontend (LeadFormModal v1.2 / useLeads v1.1):
        //   - `motivo` sempre presente (motivo customizado ou 'opt_out_manual')
        //   - `mensagem` opcional quando ja_estava_optout=true
        const responsePayload: any = {
          success: true,
          lead_id: resultado.lead_id,
          email: lead.email,
          ja_estava_optout: resultado.ja_estava_optout,
          total_cancelados: resultado.total_cancelados,
          motivo: motivo?.trim() || 'opt_out_manual',
        };
        if (resultado.ja_estava_optout) {
          responsePayload.mensagem = 'Lead já estava em opt-out.';
        }

        return res.status(200).json(responsePayload);
      }

      return res.status(400).json({ success: false, error: `Ação POST desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════
    // PATCH ACTIONS
    // ════════════════════════════════════════════
    if (req.method === 'PATCH') {
      const body = req.body;

      // ── ATUALIZAR EMPRESA ────────────────────────
      if (action === 'atualizar_empresa') {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // 🆕 v1.4 — Whitelist de colunas editáveis (vide cabeçalho).
        //   Substitui o padrão antigo de `{ id, ...campos }` + deletes,
        //   que deixava passar JOINs embed e campos calculados.
        const campos = pickEditable(body, COLUNAS_EDITAVEIS_EMPRESA);
        campos.atualizado_em = new Date().toISOString();

        if (campos.dominio) campos.dominio = String(campos.dominio).toLowerCase().trim();

        const { data, error } = await supabase
          .from('email_empresas')
          .update(campos)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Empresa atualizada: ID ${id} (${Object.keys(campos).length - 1} campos)`);
        return res.status(200).json({ success: true, empresa: data });
      }

      // ── ATUALIZAR LEAD ───────────────────────────
      if (action === 'atualizar_lead') {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // 🆕 v1.4 — Whitelist de colunas editáveis (vide cabeçalho).
        //   Resolve o bug "Could not find the 'email_empresas' column of
        //   'email_leads'" — o frontend enviava o JOIN embed no PATCH e o
        //   PostgREST falhava tentando UPDATE numa coluna fantasma.
        const campos = pickEditable(body, COLUNAS_EDITAVEIS_LEAD);
        campos.atualizado_em = new Date().toISOString();

        if (campos.email) campos.email = String(campos.email).toLowerCase().trim();

        // 🆕 v1.11 (10/06/2026) — Reset automático de bounced se email mudou.
        //   Decisão P1.1 (CHECKPOINT_2026-06-10.md): hard bounce marca o LEAD
        //   como inválido para o ENDEREÇO que falhou. Ao trocar o endereço,
        //   o "estado bounced" anterior não se aplica ao novo email — o lead
        //   volta a ser saudável automaticamente.
        let bounceResetado = false;
        let emailAnterior: string | null = null;
        let bouncedMotivoAnterior: string | null = null;

        if (campos.email) {
          const { data: leadAtual } = await supabase
            .from('email_leads')
            .select('email, bounced, bounced_motivo')
            .eq('id', id)
            .maybeSingle();

          if (
            leadAtual &&
            leadAtual.bounced === true &&
            String(leadAtual.email || '').toLowerCase().trim() !== campos.email
          ) {
            // Email mudou E lead estava marcado como bounced → reset.
            campos.bounced = false;
            campos.bounced_em = null;
            campos.bounced_motivo = null;
            bounceResetado = true;
            emailAnterior = leadAtual.email;
            bouncedMotivoAnterior = leadAtual.bounced_motivo || null;
          }
        }

        const { data, error } = await supabase
          .from('email_leads')
          .update(campos)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        // Registrar no histórico SE houve reset de bounced (auditoria).
        if (bounceResetado) {
          await supabase.from('email_lead_historico').insert({
            lead_id: id,
            tipo: 'bounce_resetado',
            descricao:
              `Bounce resetado automaticamente: email "${emailAnterior}" → "${campos.email}". ` +
              `Motivo do bounce anterior: ${bouncedMotivoAnterior || 'não registrado'}.`,
            dados: {
              email_anterior: emailAnterior,
              email_novo: campos.email,
              bounced_motivo_anterior: bouncedMotivoAnterior,
            },
            criado_por: body.criado_por || 'sistema_reset_bounce',
          });
          console.log(
            `🔄 [crm-leads] Bounce resetado: lead ${id} "${emailAnterior}" → "${campos.email}"`,
          );
        }

        console.log(`✅ [crm-leads] Lead atualizado: ID ${id} (${Object.keys(campos).length - 1} campos${bounceResetado ? ' + reset bounce' : ''})`);
        return res.status(200).json({
          success: true,
          lead: data,
          bounce_resetado: bounceResetado,
        });
      }

      // ── MUDAR FUNIL ──────────────────────────────
      if (action === 'mudar_funil') {
        const { id, novo_status, motivo_perda, criado_por } = body;
        if (!id || !novo_status || !criado_por) {
          return res.status(400).json({ success: false, error: 'id, novo_status e criado_por são obrigatórios' });
        }

        const statusValidos = ['lead', 'prospect', 'cliente', 'inativo', 'perdido'];
        if (!statusValidos.includes(novo_status)) {
          return res.status(400).json({ success: false, error: `Status inválido. Use: ${statusValidos.join(', ')}` });
        }

        // Buscar status atual
        const { data: leadAtual } = await supabase
          .from('email_leads')
          .select('funil_status, empresa_id')
          .eq('id', id)
          .single();

        if (!leadAtual) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

        const statusAnterior = leadAtual.funil_status;

        // Atualizar funil
        const updateData: any = {
          funil_status: novo_status,
          funil_atualizado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        };
        if (novo_status === 'perdido' && motivo_perda) {
          updateData.motivo_perda = motivo_perda;
        }

        const { data, error } = await supabase
          .from('email_leads')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        // Registrar mudança no histórico
        await supabase.from('email_lead_historico').insert({
          lead_id: id,
          tipo: 'funil_mudou',
          descricao: `Funil alterado: ${statusAnterior} → ${novo_status}${motivo_perda ? ` (${motivo_perda})` : ''}`,
          dados: { de: statusAnterior, para: novo_status, motivo: motivo_perda || null },
          criado_por,
        });

        // Atualizar counters da empresa
        if (leadAtual.empresa_id) {
          await atualizarCountersEmpresa(leadAtual.empresa_id);
        }

        console.log(`✅ [crm-leads] Funil: Lead ${id} — ${statusAnterior} → ${novo_status}`);
        return res.status(200).json({ success: true, lead: data, transicao: { de: statusAnterior, para: novo_status } });
      }

      return res.status(400).json({ success: false, error: `Ação PATCH desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (err: any) {
    console.error('❌ [crm-leads] Erro:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

/**
 * Encontra empresa pelo domínio ou cria nova
 */
async function findOrCreateEmpresa(
  dados: { nome: string; dominio: string | null; setor: string | null; cidade: string | null; uf: string | null; website: string | null; linkedin_url: string | null; criado_por: string },
  resultados: { empresas_criadas: number }
): Promise<number | null> {
  // Tentar encontrar por domínio
  if (dados.dominio) {
    const { data: existente } = await supabase
      .from('email_empresas')
      .select('id')
      .eq('dominio', dados.dominio.toLowerCase().trim())
      .maybeSingle();

    if (existente) return existente.id;
  }

  // Tentar encontrar por nome (case insensitive)
  const { data: porNome } = await supabase
    .from('email_empresas')
    .select('id')
    .ilike('nome', dados.nome.trim())
    .maybeSingle();

  if (porNome) return porNome.id;

  // Criar nova empresa
  const { data: nova, error } = await supabase
    .from('email_empresas')
    .insert({
      nome: dados.nome.trim(),
      dominio: dados.dominio?.toLowerCase().trim() || null,
      setor: dados.setor || null,
      cidade: dados.cidade || null,
      uf: dados.uf || null,
      website: dados.website || null,
      linkedin_url: dados.linkedin_url || null,
      origem: 'prospect_engine',
      criado_por: dados.criado_por,
    })
    .select('id')
    .single();

  if (error) {
    // Se deu duplicata de domínio (race condition), buscar novamente
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('email_empresas')
        .select('id')
        .eq('dominio', dados.dominio?.toLowerCase().trim() || '')
        .maybeSingle();
      return retry?.id || null;
    }
    console.error(`⚠️ [crm-leads] Erro ao criar empresa ${dados.nome}:`, error.message);
    return null;
  }

  resultados.empresas_criadas++;
  return nova.id;
}

/**
 * Atualiza os counters cache de leads/prospects/clientes na empresa
 */
async function atualizarCountersEmpresa(empresaId: number): Promise<void> {
  const { count: leads } = await supabase
    .from('email_leads').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('funil_status', 'lead');

  const { count: prospects } = await supabase
    .from('email_leads').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('funil_status', 'prospect');

  const { count: clientes } = await supabase
    .from('email_leads').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('funil_status', 'cliente');

  await supabase
    .from('email_empresas')
    .update({
      total_leads: leads || 0,
      total_prospects: prospects || 0,
      total_clientes: clientes || 0,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', empresaId);
}

// ════════════════════════════════════════════════════════════════
// 🆕 v1.8 (09/06/2026 — Fase A) — Helper: vincular lead a campanha
// ════════════════════════════════════════════════════════════════
//
// Encapsula toda a lógica de:
//  • Validações de elegibilidade da campanha (status, data, vertical, dono)
//  • Validações do lead (opt-out, duplicação simultânea)
//  • Insert em email_lead_campanhas
//  • Enfileiramento em email_fila (se campanha já tem inicio_envio)
//  • Atualização de total_destinatarios da campanha
//  • Registro de histórico
//
// Retorna `{ success: true, vinculo }` ou `{ success: false, error }`.
// Não lança exceções — todos os erros são retornados estruturados.
//
// Reutilizado por `promover_para_campanha` em dois caminhos:
//  (1) lead recém-criado (novoLead);
//  (2) lead pré-existente em email_leads (caso ja_existia=true).
//
// IMPORTANTE: a lógica de cálculo de `agendado_para` (step 1 = AGORA,
// step N = AGORA + delays acumulados) é IDÊNTICA à da ativação inicial
// em crm-campanhas.ts > mudar_status > 'ativa' (Fase 5A v1.6). Manter
// alinhamento se uma das duas mudar.
interface LeadParaVincular {
  id: number;
  nome: string;
  email: string;
  vertical: string;
  reservado_por: number;
  // 🆕 v1.11 — Estados terminais (opcionais). Se ausentes, o helper consulta
  //   diretamente o banco (defesa em profundidade).
  bounced?: boolean;
  opt_out?: boolean;
}

interface ResultadoVinculo {
  success: boolean;
  error?: string;
  vinculo?: {
    campanha_id: number;
    campanha_nome: string;
    campanha_status: string;
    enfileirados: number;
  };
}

async function vincularLeadACampanha(
  supabase: any,
  lead: LeadParaVincular,
  campanhaId: number,
  criadoPor: string,
  opts?: {
    /**
     * 🆕 v1.16.2 — quando presente, substitui `lead.vertical` para a
     * validação do passo 4. Permite simular o estado pós-UPDATE de
     * vertical no fluxo de vinculação em lote, sem mutar o lead ainda.
     */
    verticalEsperada?: string;
    /**
     * 🆕 v1.16.2 — quando true, o helper executa apenas as validações
     * (passos 1-7) e retorna success sem realizar INSERTs em
     * email_lead_campanhas / email_fila / email_lead_historico nem
     * o UPDATE de total_destinatarios. Usado pela action
     * `vincular_em_lote_a_campanha` para garantir atomicidade:
     * dry-run primeiro → UPDATE vertical → execução real.
     */
    dryRun?: boolean;
    /**
     * 🆕 v1.22.2 (24/06/2026) — quando true, o helper assume cenário de
     * REATIVAÇÃO de vínculo terminal (caso típico: lead vindo da aba
     * "E-mails Inválidos" via action `recuperar_invalido_para_campanha`).
     *
     * Efeitos:
     *   - Etapa 8 (vínculo): UPSERT em email_lead_campanhas usando
     *     onConflict='lead_id,campanha_id'. Vínculo terminal
     *     (bounced/cancelado/concluida) vira status='ativa', step_atual=1,
     *     adicionado_em=NOW(). Sem o flag, INSERT bate em unique constraint.
     *
     *   - Etapa 9 (fila): DELETE prévio em email_fila WHERE lead_id+campanha_id
     *     antes do INSERT dos novos rows. Como email_fila NÃO tem unique em
     *     (lead_id, campanha_id, step_id), o INSERT sem DELETE duplicaria
     *     silenciosamente linhas (bug funcional mascarado por ausência de
     *     constraint).
     *
     *   - Etapa 11 (histórico): tipo='campanha_recuperada' (em vez de
     *     'campanha_vinculada'). Permite auditoria separada e métricas de
     *     leads "salvos" da aba Inválidos.
     *
     * Default false → zero regressão para callers existentes
     * (vincular_em_lote, criar_lead, atualizar_lead, etc).
     */
    modoRecuperacao?: boolean;
  }
): Promise<ResultadoVinculo> {
  // 1. Buscar campanha
  const { data: camp, error: errCamp } = await supabase
    .from('email_campanhas')
    .select('id, nome, status, tipo, responsavel_id, inicio_envio, data_encerramento, dominio_envio, unidade')
    .eq('id', campanhaId)
    .maybeSingle();

  if (errCamp) return { success: false, error: `Falha ao buscar campanha: ${errCamp.message}` };
  if (!camp) return { success: false, error: `Campanha ID ${campanhaId} não encontrada` };

  // 2. Validar status
  if (!['ativa', 'pausada', 'agendada'].includes(camp.status)) {
    return {
      success: false,
      error: `Campanha "${camp.nome}" está em status "${camp.status}" — só aceita novos leads em status ativa/pausada/agendada.`,
    };
  }

  // 3. Validar data_encerramento
  if (camp.data_encerramento) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (camp.data_encerramento < hoje) {
      return {
        success: false,
        error: `Campanha "${camp.nome}" já encerrou em ${camp.data_encerramento} — não aceita novos leads.`,
      };
    }
  }

  // 4. Validar match de vertical (Fase B trava)
  // 🆕 v1.16.2 — opts.verticalEsperada permite simular um estado pós-UPDATE
  //   sem mutar o lead. Usado no fluxo dry-run da action `vincular_em_lote`.
  const verticalEfetiva = opts?.verticalEsperada ?? lead.vertical;
  if (camp.tipo !== verticalEfetiva) {
    return {
      success: false,
      error: `Lead tem vertical "${verticalEfetiva}" e a campanha é da vertical "${camp.tipo}". Verticais incompatíveis.`,
    };
  }

  // 5. Validar match de responsável (Fase B trava)
  // 🆕 v1.17 (22/06/2026 — B1: SDR distribuidor de Leads CRECI):
  //   A trava de match `responsavel_id === reservado_por` é RELAXADA
  //   quando a campanha é da vertical CRECI. Decisão de produto
  //   Messias 22/06: a Campanha CRECI é única e operada por SDR (Débora),
  //   que centraliza a distribuição dos leads coletados por toda a equipe
  //   (Tatiana, Marcos, Messias, etc.) via Chrome Extension.
  //
  //   A regra original `responsavel_id===reservado_por` faz sentido em
  //   verticais B2B (Service Center, Outsourcing IA, etc.) onde cada GC
  //   opera leads próprios, mas não no fluxo CRECI que é centralizado.
  //
  //   Métrica de origem PRESERVADA: `email_leads.criado_por` (string)
  //   continua registrando quem inseriu o lead originalmente — só o
  //   vínculo da campanha vira cross-owner. O `reservado_por` do lead
  //   tampouco é mutado por este helper (apenas o vínculo com a campanha
  //   em email_lead_campanhas + enfileiramento em email_fila).
  //
  //   Pareado com:
  //     - useVincularEmLote v1.1 (frontend permite SDR ver leads de
  //       outros responsáveis quando vertical_destino === 'CRECI')
  //     - VincularEmLoteTab v2.1 (UI do filtro Responsável aparece para SDR)
  //     - LeadFormModal v1.4 (SDR pode reatribuir reservado_por em
  //       Leads CRECI manualmente, se preferir)
  if (camp.tipo !== 'CRECI' && camp.responsavel_id !== lead.reservado_por) {
    return {
      success: false,
      error: 'Lead está reservado a outro usuário — não pode entrar em campanha sob responsabilidade diferente.',
    };
  }

  // 6. Defesa em profundidade — duplicação simultânea
  //    (decisão de produto 09/06/2026: bloquear lead em múltiplas
  //    campanhas ativa/pausada/agendada para evitar spam ao contato).
  //
  // 🔧 v1.22.1 BUGFIX (23/06/2026) — Antes desta correção, o filtro
  //   considerava APENAS o status da CAMPANHA. Resultado: vínculos
  //   em estado terminal ('bounced', 'cancelado', 'concluida') em
  //   campanhas ainda ativas eram tratados como conflito, bloqueando
  //   re-vinculação legítima de leads recuperados (caso forense Rafael
  //   Baroni, 23/06/2026 — vide cabeçalho v1.22.1).
  //
  //   Correção: adicionado filtro `['ativa', 'pausada'].includes(v.status)`
  //   para considerar apenas vínculos ATIVOS como conflito. Vínculos
  //   terminais não bloqueiam mais.
  const { data: vinculosExistentes } = await supabase
    .from('email_lead_campanhas')
    .select('campanha_id, status, email_campanhas!inner(status, nome)')
    .eq('lead_id', lead.id);

  const conflitos = (vinculosExistentes || []).filter(
    (v: any) =>
      ['ativa', 'pausada', 'agendada'].includes(v.email_campanhas?.status) &&
      ['ativa', 'pausada'].includes(v.status)
  );
  if (conflitos.length > 0) {
    const nomes = conflitos.map((v: any) => `"${v.email_campanhas?.nome}"`).join(', ');
    return {
      success: false,
      error: `Lead já vinculado a campanha em andamento: ${nomes}. Aguarde conclusão ou desvincule antes.`,
    };
  }

  // 7. Verificar opt-out global + bounce (defesa em profundidade)
  //
  // 🆕 v1.11 (10/06/2026) — Bloqueia DOIS estados terminais:
  //   (a) bounce permanente — email inválido reportado pelo Resend
  //   (b) opt-out — destinatário ou sistema marcou como não enviar mais
  //
  // Estratégia: se o caller já passou `lead.bounced`/`lead.opt_out`,
  // confia nesses valores. Se algum está ausente, consulta diretamente
  // o banco. Bonus: também consulta email_optout (fonte legacy).
  // Qualquer um dos sinais → bloqueia.
  let bouncedFlag = lead.bounced;
  let optOutFlag = lead.opt_out;

  if (bouncedFlag === undefined || optOutFlag === undefined) {
    const { data: leadDb } = await supabase
      .from('email_leads')
      .select('bounced, opt_out')
      .eq('id', lead.id)
      .maybeSingle();
    if (bouncedFlag === undefined) bouncedFlag = leadDb?.bounced === true;
    if (optOutFlag === undefined) optOutFlag = leadDb?.opt_out === true;
  }

  if (bouncedFlag === true) {
    return {
      success: false,
      error:
        'Email do lead deu hard bounce permanente — corrija o endereço antes de vincular a uma campanha.',
    };
  }

  if (optOutFlag === true) {
    return {
      success: false,
      error: 'Lead está em opt-out — não pode entrar em campanha (bloqueio permanente conforme LGPD).',
    };
  }

  // Fonte legacy de opt-out (email_optout) — defesa em camadas.
  const { data: optout } = await supabase
    .from('email_optout')
    .select('email')
    .eq('email', lead.email.toLowerCase().trim())
    .maybeSingle();
  if (optout) {
    return {
      success: false,
      error: 'Email está em opt-out global — não pode entrar em campanha.',
    };
  }

  // 🆕 v1.16.2 — DRY-RUN early-return.
  //   Todas as validações (passos 1-7) passaram. Se o caller pediu dryRun,
  //   retornamos sucesso sem executar nenhuma mutação (INSERT vínculo,
  //   enfileiramento, UPDATE de total_destinatarios, INSERT histórico).
  //   O caller usará esse sinal para liberar o UPDATE de vertical antes
  //   de chamar o helper novamente (sem dryRun) para execução real.
  //   O campo `vinculo` é omitido no retorno — a interface ResultadoVinculo
  //   já o declara como opcional.
  if (opts?.dryRun) {
    return { success: true };
  }

  // 8. Inserir vínculo (ou reativar se vínculo terminal pré-existente)
  //
  // 🆕 v1.22.2 (24/06/2026) — UPSERT semântico em modoRecuperacao:
  //   - Sem flag (default): INSERT puro — comportamento histórico para
  //     vinculação NORMAL (lead novo). Falha se vínculo já existir
  //     (correto: evita duplicação acidental no fluxo de criação).
  //   - Com flag (true): UPSERT com onConflict='lead_id,campanha_id'.
  //     Vínculo terminal (bounced/cancelado/concluida) é REATIVADO para
  //     status='ativa', step_atual=1, adicionado_em=NOW(). Necessário
  //     porque email_lead_campanhas_unique bloqueia INSERT em (lead_id,
  //     campanha_id) repetido.
  const dadosVinculo = {
    lead_id: lead.id,
    campanha_id: camp.id,
    status: 'ativa',
    step_atual: 1,
    adicionado_em: new Date().toISOString(),
  };

  const { error: errVinc } = opts?.modoRecuperacao
    ? await supabase
        .from('email_lead_campanhas')
        .upsert(dadosVinculo, { onConflict: 'lead_id,campanha_id' })
    : await supabase
        .from('email_lead_campanhas')
        .insert(dadosVinculo);

  if (errVinc) {
    return {
      success: false,
      error: `Falha ao vincular lead à campanha: ${errVinc.message}`,
    };
  }

  // 9. Enfileirar em email_fila SE campanha já está rodando
  //    (inicio_envio populado = status ativa ou pausada após primeira
  //    ativação). Status='agendada' tem inicio_envio NULL — o
  //    enfileiramento ocorre depois, na ativação inicial em
  //    crm-campanhas.ts > mudar_status. Não precisamos fazer aqui.
  let enfileirados = 0;
  if (camp.inicio_envio) {
    // 🆕 v1.22.2 (24/06/2026) — Limpeza prévia da fila em modoRecuperacao.
    //   email_fila NÃO tem unique em (lead_id, campanha_id, step_id),
    //   apenas PK em (id). Logo, o INSERT abaixo sem DELETE prévio
    //   DUPLICARIA silenciosamente as linhas: o lead recuperado teria
    //   na fila tanto os rows TERMINAIS (bounce/cancelado/concluido)
    //   da campanha anterior quanto os rows NOVOS pendentes. Dashboards
    //   de Acompanhamento da Campanha mostrariam lixo. DELETE só corre
    //   no modo recuperação — fluxo normal de criação não tem fila prévia.
    if (opts?.modoRecuperacao) {
      const { error: errDelFila } = await supabase
        .from('email_fila')
        .delete()
        .eq('lead_id', lead.id)
        .eq('campanha_id', camp.id);

      if (errDelFila) {
        return {
          success: false,
          error: `Vínculo reativado mas falha ao limpar fila antiga: ${errDelFila.message}`,
        };
      }
    }

    const { data: steps, error: errSteps } = await supabase
      .from('email_campanha_steps')
      .select('id, ordem, delay_dias')
      .eq('campanha_id', camp.id)
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (errSteps) {
      // O vínculo foi feito — o lead aparece na campanha mas sem fila.
      // Manter consistência: retornar erro estruturado.
      return {
        success: false,
        error: `Vínculo criado mas falha ao ler steps para enfileirar: ${errSteps.message}`,
      };
    }

    if (steps && steps.length > 0) {
      const agora = new Date();
      const stepDates = new Map<number, string>();
      let cumDays = 0;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (i === 0) {
          // Primeiro step: envia no início (delay_dias do step 1 é ignorado).
          stepDates.set(s.id, agora.toISOString());
        } else {
          cumDays += Number(s.delay_dias) || 0;
          const dt = new Date(agora);
          dt.setDate(dt.getDate() + cumDays);
          stepDates.set(s.id, dt.toISOString());
        }
      }

      const filaRows = steps.map((s: any) => ({
        campanha_id: camp.id,
        step_id: s.id,
        lead_id: lead.id,
        destinatario_email: lead.email.toLowerCase().trim(),
        destinatario_nome: lead.nome || null,
        dominio_usado: camp.dominio_envio || null,
        status: 'pendente',
        agendado_para: stepDates.get(s.id),
      }));

      const { data: ins, error: errFila } = await supabase
        .from('email_fila')
        .insert(filaRows)
        .select('id');

      if (errFila) {
        return {
          success: false,
          error: `Vínculo criado mas falha ao enfileirar: ${errFila.message}`,
        };
      }
      enfileirados = ins?.length || 0;
    }
  }

  // 10. Atualizar total_destinatarios da campanha
  const { count: totalDest } = await supabase
    .from('email_lead_campanhas')
    .select('id', { count: 'exact', head: true })
    .eq('campanha_id', camp.id);

  await supabase
    .from('email_campanhas')
    .update({
      total_destinatarios: totalDest || 0,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', camp.id);

  // 11. Registrar no histórico do lead
  // 🆕 v1.16.2 — campanha_id agora populado (FK) para permitir queries
  //   auditoria "todas as movimentações da campanha X".
  //
  // 🆕 v1.22.2 (24/06/2026) — Distinção semântica em modoRecuperacao:
  //   - 'campanha_vinculada' → vinculação NORMAL (lead novo na campanha)
  //   - 'campanha_recuperada' → REATIVAÇÃO de vínculo terminal pela aba
  //     E-mails Inválidos. Permite consultas separadas (ex: "quantos
  //     leads salvamos da aba Inválidos este mês") e auditoria mais clara.
  const tipoHistorico = opts?.modoRecuperacao ? 'campanha_recuperada' : 'campanha_vinculada';
  const verboHistorico = opts?.modoRecuperacao ? 'Recuperado para' : 'Vinculado à';

  await supabase.from('email_lead_historico').insert({
    lead_id: lead.id,
    campanha_id: camp.id,
    tipo: tipoHistorico,
    descricao: `${verboHistorico} campanha "${camp.nome}" (ID ${camp.id})${enfileirados > 0 ? ` — ${enfileirados} envio(s) agendado(s)` : ''}`,
    criado_por: criadoPor,
  });

  console.log(`✅ [crm-leads/vincularLeadACampanha] Lead ${lead.id} (${lead.email}) → campanha ${camp.id} (${camp.nome}) [status=${camp.status}, enfileirados=${enfileirados}]`);

  return {
    success: true,
    vinculo: {
      campanha_id: camp.id,
      campanha_nome: camp.nome,
      campanha_status: camp.status,
      enfileirados,
    },
  };
}

