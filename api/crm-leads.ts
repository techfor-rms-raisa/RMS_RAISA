/**
 * api/crm-leads.ts — CRUD Empresas + Leads (CRM de Campanhas)
 *
 * Histórico:
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
        } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

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
        const { count: totalEmpresas } = await supabase
          .from('email_empresas').select('id', { count: 'exact', head: true });

        // 🆕 v1.13 (13/06/2026 — Reorganização Prospect/Lead + LGPD):
        //   Os 3 contadores de funil agora EXCLUEM leads em opt-out
        //   para refletir a base ATIVA (que efetivamente pode receber
        //   campanhas). O contador total_optout abaixo continua mostrando
        //   o universo de descadastros (vivos eternamente — LGPD).
        const { count: totalLeads } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'lead')
          .not('opt_out', 'is', true);

        const { count: totalProspects } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'prospect')
          .not('opt_out', 'is', true);

        const { count: totalClientes } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'cliente')
          .not('opt_out', 'is', true);

        const { count: totalOptOut } = await supabase
          .from('email_optout').select('id', { count: 'exact', head: true });

        const { count: totalCampanhas } = await supabase
          .from('email_campanhas').select('id', { count: 'exact', head: true });

        // 🆕 v1.5 — agregados das abas "Respostas" e "Inválidos"
        // (Fase 8-fix2: badges sempre populados, sem precisar abrir a aba).
        const { count: totalRespostas } = await supabase
          .from('email_respostas').select('id', { count: 'exact', head: true });

        // 🆕 v1.15 (16/06/2026 — F8): total_invalidos passa a contar LEADS,
        //   não eventos de email_fila. Critério D2:
        //     bounced=true  OR  motivo_invalidacao IS NOT NULL
        //   Resultado: badge reflete leads únicos, sincronizado com a
        //   nova fonte do listar_invalidos abaixo. Antes da v1.15 podia
        //   acontecer de o badge mostrar "15" e a aba abrir só 8 leads
        //   (porque havia 15 eventos de bounce em 8 leads distintos).
        //
        //   Filtro `not('opt_out', 'is', true)` defensivo: opt-out tem
        //   aba própria, não deve contar como inválido na aba Inválidos.
        const { count: totalInvalidos } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .or('bounced.eq.true,motivo_invalidacao.not.is.null')
          .not('opt_out', 'is', true);

        return res.status(200).json({
          success: true,
          stats: {
            total_empresas: totalEmpresas || 0,
            total_leads: totalLeads || 0,
            total_prospects: totalProspects || 0,
            total_clientes: totalClientes || 0,
            total_optout: totalOptOut || 0,
            total_campanhas: totalCampanhas || 0,
            // 🆕 v1.5
            total_respostas: totalRespostas || 0,
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
        const { busca = '', page = '1', limit = '30' } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);

        // Trazemos um teto generoso (500 mais recentes) e paginamos no Node.
        // Para volumes maiores, migramos para uma VIEW SQL
        // `vw_crm_inbox_respostas` com paginação real.
        const TETO_POR_FONTE = 500;

        // ── Respostas (única fonte do feed após v1.13) ──
        const { data: respostas, error: errR } = await supabase
          .from('email_respostas')
          .select('id, lead_id, campanha_id, de_email, de_nome, assunto, corpo_texto, classificacao, lido, recebido_em')
          .order('recebido_em', { ascending: false })
          .limit(TETO_POR_FONTE);
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
        const { busca = '', page = '1', limit = '30' } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);
        const offset = (pageNum - 1) * limitNum;

        // Critério D2 — bounced=true OR motivo_invalidacao IS NOT NULL
        // Exclui leads em opt-out (eles têm aba própria — Opt-Out).
        let query = supabase
          .from('email_leads')
          .select(
            'id, nome, email, empresa_id, bounced, bounced_em, bounced_motivo, ' +
            'motivo_invalidacao, tentativas_recovery, recovery_em, atualizado_em, ' +
            'email_empresas(id, nome)',
            { count: 'exact' }
          )
          .or('bounced.eq.true,motivo_invalidacao.not.is.null')
          .not('opt_out', 'is', true)
          .order('bounced_em', { ascending: false, nullsFirst: false })
          .order('atualizado_em', { ascending: false })
          .range(offset, offset + limitNum - 1);

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
        let idsBloqueadosAtivas: number[] = [];
        let idsEmEncerradas: number[] = [];

        if (outrasCampanhas === 'excluir' || outrasCampanhas === 'so_encerradas') {
          const { data: vinculosAtivos, error: errVA } = await supabase
            .from('email_lead_campanhas')
            .select('lead_id, email_campanhas!inner(status)')
            .in('email_campanhas.status', ['ativa', 'pausada', 'agendada']);
          if (errVA) {
            console.error('[crm-leads] erro vinculosAtivos:', errVA.message);
            return res.status(500).json({ success: false, error: errVA.message });
          }
          idsBloqueadosAtivas = Array.from(
            new Set((vinculosAtivos || []).map((v: any) => v.lead_id))
          );
        }

        if (outrasCampanhas === 'so_encerradas') {
          const { data: vinculosEncerrados, error: errVE } = await supabase
            .from('email_lead_campanhas')
            .select('lead_id, email_campanhas!inner(status)')
            .in('email_campanhas.status', ['encerrada']);
          if (errVE) {
            console.error('[crm-leads] erro vinculosEncerrados:', errVE.message);
            return res.status(500).json({ success: false, error: errVE.message });
          }
          idsEmEncerradas = Array.from(
            new Set((vinculosEncerrados || []).map((v: any) => v.lead_id))
          );
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
        // Range é zero-indexed e INCLUSIVO em ambas as pontas.
        query = query
          .order('score_engajamento', { ascending: false, nullsFirst: false })
          .order('nome', { ascending: true })
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

          // ── Alteração de vertical (se necessário) ────────────
          // 🔄 v1.10 — Quando destinoEhCreci=true e lead.vertical==='CRECI',
          //   esta condição é falsa → NÃO dispara UPDATE (já são iguais).
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
            await supabase.from('email_lead_historico').insert({
              lead_id: lead.id,
              tipo: 'vertical_alterada',
              descricao: `Vertical alterada de "${lead.vertical || '—'}" para "${vertical_destino}" (vinculação em lote à campanha "${campanha.nome}")`,
              criado_por,
            });
          }

          // ── Vinculação à campanha (helper reaproveitado) ─────
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
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: resultadoVinculo.error || 'Erro desconhecido ao vincular',
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
  criadoPor: string
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
  if (camp.tipo !== lead.vertical) {
    return {
      success: false,
      error: `Lead tem vertical "${lead.vertical}" e a campanha é da vertical "${camp.tipo}". Verticais incompatíveis.`,
    };
  }

  // 5. Validar match de responsável (Fase B trava)
  if (camp.responsavel_id !== lead.reservado_por) {
    return {
      success: false,
      error: 'Lead está reservado a outro usuário — não pode entrar em campanha sob responsabilidade diferente.',
    };
  }

  // 6. Defesa em profundidade — duplicação simultânea
  //    (decisão de produto 09/06/2026: bloquear lead em múltiplas
  //    campanhas ativa/pausada/agendada para evitar spam ao contato).
  const { data: vinculosExistentes } = await supabase
    .from('email_lead_campanhas')
    .select('campanha_id, email_campanhas!inner(status, nome)')
    .eq('lead_id', lead.id);

  const conflitos = (vinculosExistentes || []).filter(
    (v: any) => ['ativa', 'pausada', 'agendada'].includes(v.email_campanhas?.status)
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

  // 8. Inserir vínculo
  const { error: errVinc } = await supabase
    .from('email_lead_campanhas')
    .insert({
      lead_id: lead.id,
      campanha_id: camp.id,
      status: 'ativa',
      step_atual: 1,
    });

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
  await supabase.from('email_lead_historico').insert({
    lead_id: lead.id,
    tipo: 'campanha_vinculada',
    descricao: `Vinculado à campanha "${camp.nome}" (ID ${camp.id})${enfileirados > 0 ? ` — ${enfileirados} envio(s) agendado(s)` : ''}`,
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
