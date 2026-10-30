-- ════════════════════════════════════════════════════════════════════════════
-- Migração: CICLO DO LEAD NA CAMPANHA + DESCANSO DE 7 DIAS
-- Data:      2026-10-30
-- Autor:     Messias / Claude
-- Caminho:   sql/2026-10-30_ciclo_lead_campanha_descanso_7d.sql
-- Pareada:   api/cron/disparar-fila.ts v1.15
--            api/crm-leads.ts v1.31
--            api/crm-campanhas.ts v1.18
--            api/crm-webhook.ts v1.19
--            src/components/crm/shared/hooks/useVincularEmLote.ts v1.4
--
-- ────────────────────────────────────────────────────────────────────────────
-- PROBLEMA CONCEITUAL
-- ────────────────────────────────────────────────────────────────────────────
-- A regra "1 campanha por lead" bloqueava pelo STATUS DA CAMPANHA. Campanhas
-- duram meses; o ciclo do lead (4 e-mails, D+0/+4/+9/+15) dura ~4 semanas.
-- O lead que já recebeu os 4 e-mails ficava preso até a campanha encerrar.
--
-- Evidência em Produção (30/10/2026):
--   • email_lead_campanhas: 5.471 'ativa', 962 'bounced', ZERO 'concluida'
--     → nenhum código jamais fechava o vínculo ao fim do ciclo.
--   • RPC crm_listar_leads_vinculo_em_lote (Alocação, Messias):
--     total_excluir = 0  |  total_incluir = 51
--     → 51 leads aptos invisíveis só por vínculo com campanha 'ativa'.
--
-- DECISÃO DE PRODUTO (Messias 30/10/2026):
--   Terminado o ciclo, o lead fica livre para outra campanha após 7 DIAS de
--   descanso, contados do último e-mail enviado.
--
-- ────────────────────────────────────────────────────────────────────────────
-- SOLUÇÃO — FONTE ÚNICA DA REGRA
-- ────────────────────────────────────────────────────────────────────────────
-- Função crm_lead_bloqueio_campanha(p_lead_id, p_campanha_destino_id,
--                                   p_reativar_bounced DEFAULT false):
--   NULL  → lead LIVRE
--   jsonb → BLOQUEADO: { motivo, mensagem, ... }, motivo em:
--     1. ja_participou_da_campanha  vínculo prévio com a campanha destino
--                                   (qualquer status). A mesma sequência não
--                                   é reenviada, e email_lead_campanhas_unique
--                                   recusaria o INSERT de qualquer forma.
--                                   Só avaliado quando p_campanha_destino_id
--                                   é informado. Com p_reativar_bounced=true
--                                   (fluxo E-mails Inválidos), vínculo
--                                   'bounced' na mesma campanha é liberado.
--     2. ciclo_em_andamento         há item 'pendente' em email_fila numa
--                                   campanha viva (ativa/pausada/agendada), OU
--                                   vínculo ativo numa campanha que ainda não
--                                   iniciou (fila ainda não gerada).
--     3. descanso                   último e-mail ENVIADO e NÃO bounced há
--                                   menos de 7 dias (qualquer campanha).
--
-- 🛡️ POR QUE A FILA E NÃO O STATUS DO VÍNCULO:
--   O vínculo não é confiável como verdade operacional:
--     • o Recovery (campaign-email-recovery.ts) reenfileira sem voltar o
--       vínculo para 'ativa';
--     • a resposta do lead cancela a fila, mas o vínculo segue 'ativa'.
--   "Tem e-mail pendente para sair" é o fato que importa. O status do vínculo
--   ('concluida', marcado pelo cron v1.15 + backfill abaixo) vira informativo.
--
-- 🛡️ DESCANSO IGNORA BOUNCE: e-mail que não chegou não "cansa" o contato.
--   Sem isso, o fluxo de reativação da aba E-mails Inválidos (corrigir e-mail
--   → revincular) ficaria travado 7 dias após cada bounce.
--
-- 🛡️ RETURNS jsonb: o motivo E a mensagem para a UX nascem aqui. Backend e
--   listagem não reimplementam texto nem regra.
--
-- ────────────────────────────────────────────────────────────────────────────
-- APLICAÇÃO (Supabase SQL Editor — o Editor só mostra o resultado da ÚLTIMA
-- query, então rode CADA BLOCO separadamente: selecione o bloco → Run)
-- ────────────────────────────────────────────────────────────────────────────
--   PREVIEW primeiro, depois PRODUÇÃO. Em CADA ambiente:
--     0. BLOCO 0 (pré-checagem)                — se retornar ALGUMA linha,
--                                                PARE e envie o resultado
--     1. BLOCO A (função) e BLOCO B (índices)  — inofensivos sozinhos
--     2. BLOCO D (RPC v1.30)                   — e IMEDIATAMENTE o deploy do
--                                                código (git push). Entre os
--                                                dois, a lista pode mostrar
--                                                leads que o backend antigo
--                                                recusa na confirmação.
--     3. Deploy do código concluído
--     4. BLOCO C1 (conferir número) → C2       — SÓ DEPOIS do deploy: o
--                                                backend antigo trataria
--                                                'concluida' como livre SEM
--                                                os 7 dias de descanso.
--     5. BLOCO E (testes de fumaça)
--   ⚠️ Código ANTES do Bloco D = erro: o backend v1.31 envia o parâmetro
--      p_campanha_destino_id, que só existe na RPC v1.30.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 0 — PRÉ-CHECAGEM (SOMENTE LEITURA)
--   crm-campanhas.ts v1.18 (desvincular_leads) grava
--   email_fila.motivo_cancelamento = 'desvinculado' e o cron/backfill gravam
--   email_lead_campanhas.status = 'concluida'. Se houver CHECK restringindo
--   essas colunas, esses valores precisam estar na lista.
--   ESPERADO: nenhuma linha (email_lead_campanhas já confirmado sem CHECK em
--   30/10/2026). Se vier linha: PARE e envie o resultado.
-- ════════════════════════════════════════════════════════════════════════════
SELECT rel.relname AS tabela, con.conname, pg_get_constraintdef(con.oid) AS definicao
  FROM pg_constraint con
  JOIN pg_class      rel ON rel.oid = con.conrelid
  JOIN pg_namespace  nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'public'
   AND con.contype = 'c'
   AND (
        (rel.relname = 'email_fila'           AND pg_get_constraintdef(con.oid) ILIKE '%motivo_cancelamento%')
     OR (rel.relname = 'email_lead_campanhas' AND pg_get_constraintdef(con.oid) ILIKE '%status%')
   );


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO A — Função da regra (idempotente)
-- ════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE (sem DROP): reexecutar este bloco nunca deixa a RPC do
-- Vincular em Lote sem a função. Se um dia o tipo de retorno mudar, aí sim
-- DROP antes (erro 42P13).
CREATE OR REPLACE FUNCTION public.crm_lead_bloqueio_campanha(
    p_lead_id             bigint,
    p_campanha_destino_id bigint  DEFAULT NULL,
    -- true SOMENTE no fluxo de reativação da aba E-mails Inválidos
    -- (crm-leads.ts › vincularLeadACampanha com modoRecuperacao): permite
    -- reativar vínculo 'bounced' NA MESMA campanha. Qualquer outro status
    -- ('concluida', 'ativa', ...) continua bloqueando — a sequência nunca é
    -- reenviada a quem já a recebeu.
    p_reativar_bounced    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
WITH
-- (1) Já participou da campanha destino (qualquer status de vínculo,
--     exceto 'bounced' quando p_reativar_bounced = true)
participou AS (
    SELECT c.id, c.nome
      FROM public.email_lead_campanhas lc
      JOIN public.email_campanhas       c ON c.id = lc.campanha_id
     WHERE p_campanha_destino_id IS NOT NULL
       AND lc.lead_id     = p_lead_id
       AND lc.campanha_id = p_campanha_destino_id
       AND NOT (coalesce(p_reativar_bounced, false) AND lc.status = 'bounced')
     LIMIT 1
),
-- (2) Ciclo em andamento
ciclo AS (
    SELECT x.id, x.nome
      FROM (
            -- (2a) E-mail pendente em campanha viva.
            --   'enviando' (lock do cron, segundos) NÃO entra de propósito:
            --   nada reseta automaticamente item travado em 'enviando', e
            --   incluí-lo bloquearia o lead para sempre. A janela de
            --   segundos é coberta pelo descanso logo após o envio.
            SELECT c.id, c.nome, 1 AS prio
              FROM public.email_fila      f
              JOIN public.email_campanhas c ON c.id = f.campanha_id
             WHERE f.lead_id = p_lead_id
               AND f.status  = 'pendente'
               AND c.status IN ('ativa', 'pausada', 'agendada')
            UNION ALL
            -- (2b) Vinculado a campanha que ainda não iniciou (sem fila)
            SELECT c.id, c.nome, 2 AS prio
              FROM public.email_lead_campanhas lc
              JOIN public.email_campanhas       c ON c.id = lc.campanha_id
             WHERE lc.lead_id = p_lead_id
               AND lc.status IN ('ativa', 'pausada')
               AND c.status  IN ('ativa', 'pausada', 'agendada')
               AND c.inicio_envio IS NULL
           ) x
     ORDER BY x.prio
     LIMIT 1
),
-- (3) Último e-mail efetivamente enviado (bounce não conta)
descanso AS (
    SELECT max(f.enviado_em) AS ultimo_envio
      FROM public.email_fila f
     WHERE f.lead_id    = p_lead_id
       AND f.enviado_em IS NOT NULL
       AND f.bounce_em  IS NULL
       AND coalesce(f.status, '') <> 'bounce'
)
SELECT CASE
    WHEN EXISTS (SELECT 1 FROM participou) THEN (
        SELECT jsonb_build_object(
                   'motivo',        'ja_participou_da_campanha',
                   'campanha_id',   p.id,
                   'campanha_nome', btrim(p.nome),
                   'mensagem',      format(
                       'Lead já participou da campanha "%s" — a mesma sequência não é reenviada.',
                       btrim(p.nome))
               )
          FROM participou p
    )
    WHEN EXISTS (SELECT 1 FROM ciclo) THEN (
        SELECT jsonb_build_object(
                   'motivo',        'ciclo_em_andamento',
                   'campanha_id',   k.id,
                   'campanha_nome', btrim(k.nome),
                   'mensagem',      format(
                       'Lead com ciclo de e-mails em andamento na campanha "%s". '
                       'Aguarde o término dos envios ou desvincule antes.',
                       btrim(k.nome))
               )
          FROM ciclo k
    )
    WHEN (SELECT d.ultimo_envio FROM descanso d) > now() - interval '7 days' THEN (
        SELECT jsonb_build_object(
                   'motivo',          'descanso',
                   'ultimo_envio_em', d.ultimo_envio,
                   'liberado_em',     d.ultimo_envio + interval '7 days',
                   'mensagem',        format(
                       'Lead em descanso: último e-mail em %s; liberado para nova campanha a partir de %s.',
                       to_char(d.ultimo_envio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
                       to_char((d.ultimo_envio + interval '7 days') AT TIME ZONE 'America/Sao_Paulo',
                               'DD/MM/YYYY "às" HH24:MI'))
               )
          FROM descanso d
    )
    ELSE NULL
END;
$fn$;

COMMENT ON FUNCTION public.crm_lead_bloqueio_campanha(bigint, bigint, boolean) IS
'FONTE ÚNICA da regra "1 campanha por lead" (30/10/2026). NULL = lead livre.
jsonb {motivo, mensagem, ...} = bloqueado. Motivos: ja_participou_da_campanha
(só com p_campanha_destino_id), ciclo_em_andamento (fila pendente em campanha
viva ou campanha não iniciada), descanso (último envio não-bounced < 7 dias).
Consumidores: crm_listar_leads_vinculo_em_lote v1.30, crm-leads.ts v1.31
(vincularLeadACampanha), crm-campanhas.ts v1.18
(listar_campanhas_disponiveis_para_lead).';

GRANT EXECUTE ON FUNCTION public.crm_lead_bloqueio_campanha(bigint, bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_lead_bloqueio_campanha(bigint, bigint, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO B — Índices de apoio (idempotentes, não destrutivos)
--   A função roda uma vez por lead na listagem do Vincular em Lote.
--   (lead_id) em email_lead_campanhas e a unique (lead_id, campanha_id) já
--   existem — não recriados aqui.
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_email_fila_lead_pendente
    ON public.email_fila (lead_id)
 WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_email_fila_lead_enviado_em
    ON public.email_fila (lead_id, enviado_em DESC)
 WHERE enviado_em IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO C1 — PREVIEW do backfill (SOMENTE LEITURA)
--   Vínculos 'ativa' cujo ciclo JÁ terminou: campanha iniciada, nenhum item
--   pendente/enviando, ao menos um e-mail enviado, nenhum bounce. Anote o TOTAL.
--   (Vínculo 'ativa' sem NENHUM envio fica como está — não é "concluído";
--    a função já o trata como livre, pois não há pendente.)
-- ════════════════════════════════════════════════════════════════════════════
SELECT c.id                       AS campanha_id,
       btrim(c.nome)              AS campanha,
       c.status                   AS status_campanha,
       count(*)                   AS vinculos_a_concluir,
       sum(count(*)) OVER ()      AS total_geral
  FROM public.email_lead_campanhas lc
  JOIN public.email_campanhas       c ON c.id = lc.campanha_id
 WHERE lc.status = 'ativa'
   AND c.inicio_envio IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.email_fila f
                    WHERE f.lead_id = lc.lead_id AND f.campanha_id = lc.campanha_id
                      AND f.status IN ('pendente', 'enviando'))
   AND EXISTS     (SELECT 1 FROM public.email_fila f
                    WHERE f.lead_id = lc.lead_id AND f.campanha_id = lc.campanha_id
                      AND f.enviado_em IS NOT NULL)
   -- ciclo que deu bounce fica como está ('bounced' é do webhook; vínculo
   -- 'bounced' é o que o fluxo de reativação da aba Inválidos oferece)
   AND NOT EXISTS (SELECT 1 FROM public.email_fila f
                    WHERE f.lead_id = lc.lead_id AND f.campanha_id = lc.campanha_id
                      AND (f.bounce_em IS NOT NULL OR f.status = 'bounce'))
 GROUP BY c.id, c.nome, c.status
 ORDER BY c.id;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO C2 — Backfill (statement único = atômico). Deve retornar o MESMO
--   total do C1. Só marca o status informativo; não apaga nada, não toca na
--   fila, não envia e-mail.
-- ════════════════════════════════════════════════════════════════════════════
WITH upd AS (
    UPDATE public.email_lead_campanhas lc
       SET status = 'concluida'
      FROM public.email_campanhas c
     WHERE c.id = lc.campanha_id
       AND lc.status = 'ativa'
       AND c.inicio_envio IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.email_fila f
                        WHERE f.lead_id = lc.lead_id AND f.campanha_id = lc.campanha_id
                          AND f.status IN ('pendente', 'enviando'))
       AND EXISTS     (SELECT 1 FROM public.email_fila f
                        WHERE f.lead_id = lc.lead_id AND f.campanha_id = lc.campanha_id
                          AND f.enviado_em IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.email_fila f
                        WHERE f.lead_id = lc.lead_id AND f.campanha_id = lc.campanha_id
                          AND (f.bounce_em IS NOT NULL OR f.status = 'bounce'))
    RETURNING 1
)
SELECT count(*) AS vinculos_marcados_concluida FROM upd;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO D — RPC crm_listar_leads_vinculo_em_lote v1.30
--   ⚠️ SELECIONE O BLOCO D INTEIRO (DROP + CREATE + GRANT) e rode de uma vez —
--      o Editor executa tudo numa transação. Rodar só o DROP deixaria a aba
--      Vincular em Lote sem listagem até o CREATE.
--
--   Fonte: definição ATUAL de Produção (v1.29, pg_get_functiondef em
--   30/10/2026) — NÃO o arquivo de 23/07 da base de conhecimento. Exatamente
--   3 alterações, todo o resto (entregabilidade v1.29 inclusa) idêntico:
--     (1) novo parâmetro p_campanha_destino_id bigint DEFAULT NULL;
--     (2) CTE `par` expõe campanha_destino_id;
--     (3) bloqueio "status da campanha" → crm_lead_bloqueio_campanha.
--
--   🛡️ COMPATIBILIDADE: o novo parâmetro tem DEFAULT. O backend v1.30 que
--      está no ar (13 parâmetros nomeados) continua funcionando contra esta
--      RPC — por isso o SQL pode subir ANTES do código sem quebrar nada.
--
--   DROP necessário: a assinatura muda (13 → 14 parâmetros). Sem o DROP o
--   PostgREST veria duas sobrecargas e recusaria a chamada por ambiguidade.
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.crm_listar_leads_vinculo_em_lote(
    text, text, text, text, text, text, text, text, text, integer, integer, integer, boolean
);

CREATE OR REPLACE FUNCTION public.crm_listar_leads_vinculo_em_lote(p_vertical_destino text DEFAULT NULL::text, p_tipo_busca text DEFAULT 'conversiveis'::text, p_busca text DEFAULT NULL::text, p_engajamento text DEFAULT 'qualquer'::text, p_setor text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_cidade text DEFAULT NULL::text, p_cadastro_range text DEFAULT 'qualquer'::text, p_outras_campanhas text DEFAULT 'excluir'::text, p_responsavel_id integer DEFAULT NULL::integer, p_per_page integer DEFAULT 30, p_offset integer DEFAULT 0, p_incluir_em_duvida boolean DEFAULT true, p_campanha_destino_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
 
WITH par AS (
    SELECT
        NULLIF(btrim(coalesce(p_vertical_destino, '')), '')                          AS vertical_destino,
        lower(coalesce(NULLIF(btrim(p_tipo_busca),       ''), 'conversiveis'))       AS tipo_busca,
        NULLIF(btrim(coalesce(p_busca, '')), '')                                     AS busca,
        lower(coalesce(NULLIF(btrim(p_engajamento),      ''), 'qualquer'))           AS engajamento,
        NULLIF(btrim(coalesce(p_setor, '')), '')                                     AS setor,
        upper(NULLIF(btrim(coalesce(p_uf, '')), ''))                                 AS uf,
        NULLIF(btrim(coalesce(p_cidade, '')), '')                                    AS cidade,
        lower(coalesce(NULLIF(btrim(p_cadastro_range),   ''), 'qualquer'))           AS cadastro_range,
        lower(coalesce(NULLIF(btrim(p_outras_campanhas), ''), 'excluir'))            AS outras_campanhas,
        p_responsavel_id                                                             AS responsavel_id,
        -- 🆕 v1.29 — quando false, remove da lista os leads cuja verificação
        --   de e-mail ficou INCONCLUSIVA (probable = catch-all, risky =
        --   cascade esgotada). Default true: preserva integralmente o
        --   comportamento anterior a esta versão.
        coalesce(p_incluir_em_duvida, true)                                          AS incluir_em_duvida,
        -- 🆕 v1.30 (30/10/2026) — campanha de destino (NULL = desconhecida).
        --   Usada para nunca listar quem JÁ participou dela.
        p_campanha_destino_id                                                        AS campanha_destino_id,
        -- Clamp defensivo espelhando o backend (default 30, teto 100)
        greatest(1, least(100, coalesce(p_per_page, 30)))                            AS per_page,
        greatest(0, coalesce(p_offset, 0))                                           AS pg_offset
),
 
-- ═══════════════════════════════════════════════════════════════
-- Conjunto elegível COMPLETO (sem paginação). É sobre ele que o
-- total_geral é contado — daí a correção do defeito (c).
-- ═══════════════════════════════════════════════════════════════
elegiveis AS (
    SELECT
        el.id,
        el.nome,
        el.email,
        el.cargo,
        el.vertical,
        el.reservado_por,
        el.funil_status,
        el.apto_campanha,
        el.opt_out,
        el.telefone,
        el.linkedin_url,
        el.criado_em,
        el.score_engajamento,
        -- ── 🆕 v1.29 — ENTREGABILIDADE ──────────────────────────────
        --   Espelha lib/validacao-lead.ts v1.1. A validação VENCIDA
        --   (> TTL_DIAS) é tratada como ausente, exatamente como a lib
        --   faz em validacaoVigente(). Manter os dois lados em sincronia:
        --   divergência aqui faria a UI prometer um veredito que o portão
        --   recalcularia na confirmação.
        CASE
            WHEN el.email_validado_em IS NULL
              OR el.email_validado_em < now() - interval '90 days'
              OR el.email_validacao_score IS NULL
                THEN 'nao_verificado'
            ELSE el.email_validacao_score
        END                                                                          AS entregabilidade,
        el.email_validacao_fonte,
        el.email_validado_em,
        coalesce(el.email_validacao_risco, false)                                    AS email_validacao_risco,
        -- 🆕 v1.27 — CORREÇÃO DE CONTRATO. A UI (LeadDisponivel) lê
        --   total_abertos / total_clicados / total_respostas, mas o backend
        --   devolvia total_emails_abertos / total_emails_clicados. Resultado:
        --   detalheEngajamento() retornava "virgem" para TODO lead.
        --   Mesma classe do bug handleTentarRecovery (nome de chave divergente).
        coalesce(el.total_emails_abertos,  0)                                        AS total_abertos,
        coalesce(el.total_emails_clicados, 0)                                        AS total_clicados,
        coalesce(el.total_respostas,       0)                                        AS total_respostas,
        -- 🆕 v1.27 — campos declarados pela UI que nunca eram enviados
        (CURRENT_DATE - el.criado_em::date)::int                                     AS dias_desde_cadastro,
        au.nome_usuario                                                              AS responsavel_nome,
        CASE
            WHEN ee.id IS NULL THEN NULL
            ELSE jsonb_build_object(
                     'id',     ee.id,
                     'nome',   ee.nome,
                     'setor',  ee.setor,
                     'cidade', ee.cidade,
                     'uf',     ee.uf
                 )
        END                                                                          AS email_empresas
    FROM public.email_leads el
    CROSS JOIN par p
    LEFT JOIN public.email_empresas ee ON ee.id = el.empresa_id
    LEFT JOIN public.app_users      au ON au.id = el.reservado_por
    WHERE
        -- ── Critérios hard-coded ────────────────────────────────
            el.apto_campanha = true
        AND coalesce(el.opt_out, false) = false
        AND coalesce(el.bounced, false) = false
        AND el.funil_status <> 'perdido'          -- NULL descartado (ver nota de fidelidade)
 
        -- ══════════════════════════════════════════════════════════
        -- 🆕 v1.29 — PORTÃO DE ENTREGABILIDADE NA LISTAGEM
        --
        -- Até a v1.28 esta RPC desconhecia as colunas email_validacao_*,
        -- criadas 14 dias depois dela (portão de vínculo, 06/08/2026).
        -- Consequência medida em Produção (10/08/2026): 55 leads com
        -- score 'invalid' listados como DISPONÍVEIS. O analista os
        -- selecionava, e o portão 7-bis de vincularLeadACampanha os
        -- recusava na confirmação. O backend acertava; a listagem
        -- mentia antes.
        --
        -- 🛡️  Critério de invalidez UNIFICADO com a aba "E-mails para
        --     revisar" (bounced OR motivo_invalidacao IS NOT NULL). Antes
        --     existiam dois critérios divergentes em três consumidores.
        -- ══════════════════════════════════════════════════════════
        AND el.motivo_invalidacao IS NULL
 
        -- Reprovado na verificação nunca aparece — nem com o toggle ligado.
        -- Redundante com a linha acima após o backfill do Bloco 1, mantido
        -- como defesa em profundidade contra escrita fora da lib.
        AND NOT (
                el.email_validacao_score = 'invalid'
            AND el.email_validado_em IS NOT NULL
            AND el.email_validado_em >= now() - interval '90 days'
        )
 
        -- Inconclusivo (probable/risky) só sai da lista quando o analista
        -- desliga o toggle. Ligado por padrão — decisão de produto de
        -- 06/08/2026 ("liberar com aviso") permanece intacta.
        AND (
            p.incluir_em_duvida
            OR el.email_validacao_score IS NULL
            OR el.email_validado_em IS NULL
            OR el.email_validado_em < now() - interval '90 days'
            OR el.email_validacao_score NOT IN ('probable', 'risky')
        )
 
        -- ── Opt-out global (defesa em profundidade) ─────────────
        --   Anti-join em SQL. Substitui o `.select('email')` sem range que
        --   truncava silenciosamente em 1000 linhas — defeito (b).
        AND NOT EXISTS (
            SELECT 1
              FROM public.email_optout o
             WHERE lower(btrim(o.email)) = lower(btrim(el.email))
        )
 
        -- ── tipo_busca + regra CRECI bidirecional ───────────────
        AND (
            CASE
                WHEN p.tipo_busca = 'aderentes' THEN
                    CASE
                        -- ADERENTES com destino: vertical exata = destino.
                        WHEN p.vertical_destino IS NOT NULL
                            THEN el.vertical = p.vertical_destino
                        -- ADERENTES sem destino: exclui CRECI (defesa em
                        -- profundidade contra chamada de API sem vertical).
                        ELSE el.vertical <> 'CRECI'
                    END
                ELSE
                    CASE
                        -- CONVERSÍVEIS com destino CRECI: entrada blindada,
                        -- só leads que JÁ são CRECI.
                        WHEN p.vertical_destino = 'CRECI'
                            THEN el.vertical = 'CRECI'
                        -- CONVERSÍVEIS demais casos: saída blindada,
                        -- CRECI nunca sai da vertical.
                        ELSE el.vertical <> 'CRECI'
                    END
            END
        )
 
        -- ── Filtros de empresa (forçam semântica INNER quando usados) ──
        AND (p.setor  IS NULL OR ee.setor = p.setor)
        AND (p.uf     IS NULL OR ee.uf    = p.uf)
        AND (p.cidade IS NULL OR ee.cidade ILIKE '%' || p.cidade || '%')
 
        -- ── RBAC / filtro de responsável ────────────────────────
        AND (p.responsavel_id IS NULL OR el.reservado_por = p.responsavel_id)
 
        -- ── Busca textual ───────────────────────────────────────
        AND (
            p.busca IS NULL
            OR el.nome  ILIKE '%' || p.busca || '%'
            OR el.email ILIKE '%' || p.busca || '%'
            OR el.cargo ILIKE '%' || p.busca || '%'
        )
 
        -- ── Engajamento ─────────────────────────────────────────
        AND (
            CASE p.engajamento
                WHEN 'abriu'     THEN coalesce(el.total_emails_abertos,   0) >= 1
                WHEN 'clicou'    THEN coalesce(el.total_emails_clicados,  0) >= 1
                WHEN 'respondeu' THEN coalesce(el.total_respostas,        0) >= 1
                WHEN 'virgem'    THEN coalesce(el.total_emails_recebidos, 0) =  0
                ELSE true   -- 'qualquer'
            END
        )
 
        -- ── Data de cadastro ────────────────────────────────────
        AND (
            CASE p.cadastro_range
                WHEN '7d'       THEN el.criado_em >= now() - interval '7 days'
                WHEN '30d'      THEN el.criado_em >= now() - interval '30 days'
                WHEN '90d'      THEN el.criado_em >= now() - interval '90 days'
                WHEN 'mais_90d' THEN el.criado_em <  now() - interval '90 days'
                ELSE true   -- 'qualquer'
            END
        )
 
        -- ══════════════════════════════════════════════════════════
        -- ── Outras campanhas — O CORAÇÃO DA CORREÇÃO ──────────────
        --   Antes: 3.660 ids serializados em 17 KB de URL → HTTP 414.
        --   Agora: anti-join/semi-join resolvido no plano do Postgres.
        --   Zero bytes trafegados.
        -- ══════════════════════════════════════════════════════════
        --
        -- 🔄 v1.30 (30/10/2026) — CICLO DO LEAD + DESCANSO DE 7 DIAS.
        --   Antes: bloqueava qualquer lead com vínculo em campanha VIVA —
        --   campanhas duram meses, o ciclo do lead (4 e-mails) ~4 semanas.
        --   Lead que concluiu o ciclo ficava preso até a campanha encerrar
        --   (30/10/2026: 51 leads Alocação aptos invisíveis).
        --   Agora: a regra mora em crm_lead_bloqueio_campanha (FONTE ÚNICA,
        --   mesma do backend). NULL = livre.
        --     'excluir' (default) → só leads livres.
        --     'incluir'           → mostra também leads em ciclo/descanso
        --                           (o helper recusa na confirmação, como
        --                           antes), mas NUNCA quem já participou da
        --                           campanha destino (unique recusaria).
        AND (
            CASE
                WHEN p.outras_campanhas = 'incluir' THEN
                    coalesce(
                        public.crm_lead_bloqueio_campanha(el.id, p.campanha_destino_id) ->> 'motivo',
                        ''
                    ) <> 'ja_participou_da_campanha'
                ELSE
                    public.crm_lead_bloqueio_campanha(el.id, p.campanha_destino_id) IS NULL
            END
        )
        AND (
            p.outras_campanhas <> 'so_encerradas'
            OR EXISTS (
                SELECT 1
                  FROM public.email_lead_campanhas lc
                  JOIN public.email_campanhas       c ON c.id = lc.campanha_id
                 WHERE lc.lead_id = el.id
                   AND c.status = 'encerrada'
            )
        )
),
 
-- Total sobre o conjunto COMPLETO (não sobre a página) — defeito (c) corrigido.
tot AS (
    SELECT count(*)::int AS n FROM elegiveis
),
 
-- Página ordenada. Ordenação idêntica à v1.16.2, incluindo o tiebreaker
-- final por id que garante determinismo em empates (sem ele, o physical
-- row order muda com VACUUM/UPDATE e linhas "atravessam" páginas).
pagina AS (
    SELECT e.*
      FROM elegiveis e
     ORDER BY e.score_engajamento DESC NULLS LAST,
              e.nome              ASC,
              e.id                DESC
     LIMIT  (SELECT per_page  FROM par)
    OFFSET (SELECT pg_offset FROM par)
)
 
SELECT jsonb_build_object(
    'leads', coalesce(
        (
            SELECT jsonb_agg(
                       jsonb_build_object(
                           'id',                  x.id,
                           'nome',                x.nome,
                           'email',               x.email,
                           'cargo',               x.cargo,
                           'vertical',            x.vertical,
                           'reservado_por',       x.reservado_por,
                           'funil_status',        x.funil_status,
                           'apto_campanha',       x.apto_campanha,
                           'opt_out',             x.opt_out,
                           'telefone',            x.telefone,
                           'linkedin_url',        x.linkedin_url,
                           'criado_em',           x.criado_em,
                           'score_engajamento',   x.score_engajamento,  -- NULL preservado: a UI o exibe como '—'
                           'total_abertos',       x.total_abertos,
                           'total_clicados',      x.total_clicados,
                           'total_respostas',     x.total_respostas,
                           'dias_desde_cadastro', x.dias_desde_cadastro,
                           'responsavel_nome',    x.responsavel_nome,
                           -- 🆕 v1.29 — entregabilidade (ver LeadDisponivel)
                           'entregabilidade',        x.entregabilidade,
                           'email_validacao_fonte',  x.email_validacao_fonte,
                           'email_validado_em',      x.email_validado_em,
                           'email_validacao_risco',  x.email_validacao_risco,
                           'email_empresas',      x.email_empresas
                       )
                       ORDER BY x.score_engajamento DESC NULLS LAST,
                                x.nome              ASC,
                                x.id                DESC
                   )
              FROM pagina x
        ),
        '[]'::jsonb
    ),
    'total_geral', (SELECT n FROM tot),
    -- 🆕 v1.29 — contagens sobre o conjunto elegível COMPLETO (não sobre a
    --   página). Alimenta a faixa de resumo acima da tabela. Calculado na
    --   mesma varredura da CTE `elegiveis` — custo marginal desprezível.
    'resumo_entregabilidade', (
        SELECT jsonb_build_object(
            'verified',       count(*) FILTER (WHERE e.entregabilidade = 'verified'),
            'probable',       count(*) FILTER (WHERE e.entregabilidade = 'probable'),
            'risky',          count(*) FILTER (WHERE e.entregabilidade = 'risky'),
            'nao_verificado', count(*) FILTER (WHERE e.entregabilidade = 'nao_verificado')
        )
          FROM elegiveis e
    )
);
 
$function$;

COMMENT ON FUNCTION public.crm_listar_leads_vinculo_em_lote(
    text, text, text, text, text, text, text, text, text, integer, integer, integer, boolean, bigint
) IS
'Listagem paginada de leads elegíveis para vínculo em lote. v1.30 (30/10/2026):
bloqueio por CICLO DO LEAD + DESCANSO DE 7 DIAS via crm_lead_bloqueio_campanha
(fonte única) — substitui o bloqueio por status da campanha. Exclui sempre quem
já participou da campanha destino (p_campanha_destino_id). Mantém integralmente
a entregabilidade da v1.29. Retorna jsonb {leads, total_geral,
resumo_entregabilidade}. Pareada com api/crm-leads.ts v1.31.';

GRANT EXECUTE ON FUNCTION public.crm_listar_leads_vinculo_em_lote(
    text, text, text, text, text, text, text, text, text, integer, integer, integer, boolean, bigint
) TO service_role;

GRANT EXECUTE ON FUNCTION public.crm_listar_leads_vinculo_em_lote(
    text, text, text, text, text, text, text, text, text, integer, integer, integer, boolean, bigint
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO E — TESTES DE FUMAÇA (SOMENTE LEITURA). Rode cada query separada.
--   Substitua <<ID_MESSIAS>> pelo mesmo app_users.id usado no diagnóstico D4.
-- ════════════════════════════════════════════════════════════════════════════

-- E1. Situação dos leads Alocação do Messias frente à Campanha_08 (ID 18).
--     Esperado: parte LIVRE (ciclo encerrado há ≥ 7 dias) e o restante com o
--     motivo exato (ciclo_em_andamento / descanso / ja_participou_da_campanha).
SELECT coalesce(public.crm_lead_bloqueio_campanha(el.id, 18) ->> 'motivo', 'LIVRE') AS situacao,
       count(*)                                                                    AS leads
  FROM public.email_leads el
 WHERE el.reservado_por = <<ID_MESSIAS>>
   AND el.vertical = 'Alocação'
   AND el.apto_campanha = true
   AND coalesce(el.opt_out, false) = false
   AND coalesce(el.bounced, false) = false
 GROUP BY 1
 ORDER BY 2 DESC;

-- E2. A listagem v1.30 para a Campanha_08 (ID 18), modo Aderentes.
--     Antes da correção: total_excluir = 0. Esperado agora: total_excluir > 0
--     e igual ao LIVRE do E1 (menos os filtrados por funil/entregabilidade).
SELECT (public.crm_listar_leads_vinculo_em_lote(
            p_vertical_destino    => 'Alocação',
            p_tipo_busca          => 'aderentes',
            p_outras_campanhas    => 'excluir',
            p_responsavel_id      => <<ID_MESSIAS>>,
            p_campanha_destino_id => 18,
            p_per_page            => 30) -> 'total_geral') AS total_excluir,
       (public.crm_listar_leads_vinculo_em_lote(
            p_vertical_destino    => 'Alocação',
            p_tipo_busca          => 'aderentes',
            p_outras_campanhas    => 'incluir',
            p_responsavel_id      => <<ID_MESSIAS>>,
            p_campanha_destino_id => 18,
            p_per_page            => 30) -> 'total_geral') AS total_incluir;

-- E3. Vocabulário de status dos vínculos após o backfill (esperado: surge
--     'concluida'; 'bounced' inalterado = 962).
SELECT status, count(*) AS total
  FROM public.email_lead_campanhas
 GROUP BY status
 ORDER BY total DESC;

-- E4. Mensagem que o usuário verá para um lead específico (troque o id).
-- SELECT public.crm_lead_bloqueio_campanha(<<LEAD_ID>>, 18);

-- E5. Desempenho (rode em PREVIEW antes de Produção). A função roda uma vez
--     por lead elegível; "Execution Time" deve ficar na casa de centenas de
--     ms. Acima de ~2 s, PARE e envie o resultado.
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.crm_listar_leads_vinculo_em_lote(
           p_vertical_destino    => 'Alocação',
           p_tipo_busca          => 'conversiveis',
           p_outras_campanhas    => 'excluir',
           p_campanha_destino_id => 18,
           p_per_page            => 30);
