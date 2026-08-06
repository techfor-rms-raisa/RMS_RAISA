-- ════════════════════════════════════════════════════════════════════════════
-- Migração: Antecipação da retomada da fila + priorização das campanhas 14/15
-- Data:      2026-08-06
-- Autor:     Messias / Claude
-- Caminho:   sql/2026-08-06_antecipacao_retomada_fila.sql
-- Ambiente:  PRODUÇÃO
-- Sucede:    sql/2026-08-06_desbloqueio_fila_reagendamento.sql (já commitado)
--
-- ────────────────────────────────────────────────────────────────────────────
-- CONTEXTO
-- ────────────────────────────────────────────────────────────────────────────
--
-- O desbloqueio anterior reagendou 1.838 itens para retomada em 10/08/2026,
-- com as campanhas 14 e 15 (Tatiana) caindo em 21/08 por ordenação natural
-- de antiguidade — as cadeias de julho entraram primeiro.
--
-- DECISÕES DE PRODUTO (Messias — 06/08/2026):
--   (1) Retomada antecipada de 10/08 para HOJE, 06/08.
--   (2) Campanhas 14 e 15 (Tatiana) promovidas ao PRIMEIRO bloco.
--
-- ────────────────────────────────────────────────────────────────────────────
-- O QUE MUDA EM RELAÇÃO AO SCRIPT ANTERIOR
-- ────────────────────────────────────────────────────────────────────────────
--
--   a) p_data_base: 2026-08-10 → 2026-08-06 (quinta-feira, dia útil).
--      Blocos resultantes: 06/08 → 07/08 → 10/08 → 11/08 → ...
--
--   b) Ordenação ganha chave de PRIORIDADE. Cadeias das campanhas listadas
--      em p_campanhas_prioritarias vão para o bloco 0 incondicionalmente;
--      as demais seguem a ordenação natural por antiguidade, também a
--      partir do bloco 0.
--
--   c) A seleção NÃO filtra mais por itens vencidos. O script anterior usava
--      `HAVING count(*) FILTER (WHERE agendado_para <= now()) > 0` porque
--      naquele momento existiam 682 vencidos. Após o COMMIT, ZERO itens
--      estão vencidos — aquele predicado não selecionaria nada. Agora o
--      escopo é TODA cadeia pendente de campanha ativa.
--
-- 🛡️  O ALGORITMO NÃO MUDA: deslocamento constante por cadeia
--     (campanha_id, lead_id). O espaçamento interno D+0/+4/+9/+15 continua
--     preservado ao milissegundo. Nenhum lead recebe rajada.
--
-- 🛡️  IDEMPOTENTE: o shift é recalculado a partir do estado corrente. Rodar
--     duas vezes com os mesmos parâmetros produz shift = 0 na segunda
--     execução (as cadeias já estão nas bases-alvo). Seguro reexecutar.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️  EFEITO IMEDIATO — LEIA ANTES DE COMMITAR
-- ────────────────────────────────────────────────────────────────────────────
--
-- p_hora_inicio = 09:00 e HOJE já passou das 09:00. Portanto os itens do
-- bloco 0 nascem VENCIDOS e o cron os dispara na PRÓXIMA EXECUÇÃO (ciclo de
-- 15 min). Isso é intencional — é o que significa "antecipar para hoje".
--
-- Volume do bloco 0:
--     25 cadeias prioritárias (campanhas 14 e 15)
--   + 40 cadeias regulares (p_leads_por_dia)
--   = 65 e-mails disparados hoje, a 10 por ciclo de 15 min ≈ 1h40 de escoamento.
--
-- Confira a janela: a campanha precisa estar dentro de horario_inicio–fim
-- (08:00–18:00 BRT em todas as ativas). Se rodar após as 18:00, nada sai
-- hoje e o bloco 0 escoa amanhã a partir das 08:00.
--
-- 📌 Domínio sem envios há 14 dias. 65 e-mails em ~1h40 é um retorno suave
--    e não representa risco de reputação. Não aumente p_leads_por_dia hoje.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COMO EXECUTAR
-- ────────────────────────────────────────────────────────────────────────────
--
--   O SQL Editor do Supabase executa APENAS O TEXTO SELECIONADO.
--   Selecione um bloco INTEIRO antes de clicar em Run.
--
--   ⚠️  LIÇÃO DO INCIDENTE DE HOJE: em transação explícita, remover o
--       ROLLBACK NÃO equivale a commitar. Sem a palavra COMMIT, o Postgres
--       desfaz tudo ao encerrar a conexão — o UPDATE roda, o SELECT mostra
--       o resultado correto na tela, e nada persiste. Por isso o bloco 2
--       abaixo já vem com COMMIT explícito e SEM SELECT interno.
--
--   Ordem:  1 (preview) → 2 (aplica) → 3 (verifica)
--
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — PREVIEW (read-only, não grava nada)
--           Selecione do WITH até o ORDER BY final.
-- ════════════════════════════════════════════════════════════════════════════

WITH params AS (
    SELECT
        DATE '2026-08-06'      AS p_data_base,             -- ⬅️ HOJE (quinta, dia útil)
        40                     AS p_leads_por_dia,         -- ⬅️ cadeias regulares por dia útil
        TIME '09:00'           AS p_hora_inicio,           -- ⬅️ hora BRT do 1º step
        ARRAY[14, 15]::bigint[] AS p_campanhas_prioritarias -- ⬅️ Tatiana: bloco 0
),
dias_uteis AS (
    SELECT d::date                                AS dia,
           (row_number() OVER (ORDER BY d)) - 1   AS idx
    FROM params p,
         generate_series(p.p_data_base, p.p_data_base + 180, interval '1 day') d
    WHERE extract(dow FROM d) BETWEEN 1 AND 5
),
cadeias AS (
    SELECT f.campanha_id,
           f.lead_id,
           min(f.agendado_para)                                      AS primeiro,
           count(*)                                                  AS steps,
           (f.campanha_id = ANY((SELECT p_campanhas_prioritarias FROM params)))
                                                                     AS prioritaria
    FROM public.email_fila f
    JOIN public.email_campanhas c ON c.id = f.campanha_id
    WHERE f.status = 'pendente'
      AND c.status = 'ativa'
      AND c.id <> 3                       -- CRECI parqueada; não tocar
    GROUP BY f.campanha_id, f.lead_id
),
ordenadas AS (
    SELECT ca.*,
           CASE
             WHEN ca.prioritaria THEN 0    -- promoção incondicional ao bloco 0
             ELSE ((row_number() OVER (PARTITION BY ca.prioritaria
                                       ORDER BY ca.primeiro ASC,
                                                ca.campanha_id ASC,
                                                ca.lead_id ASC)) - 1)
                  / (SELECT p_leads_por_dia FROM params)
           END                                                       AS bloco
    FROM cadeias ca
),
alvo AS (
    SELECT o.campanha_id,
           o.lead_id,
           o.prioritaria,
           ((du.dia + (SELECT p_hora_inicio FROM params))
              AT TIME ZONE 'America/Sao_Paulo') - o.primeiro          AS shift
    FROM ordenadas o
    JOIN dias_uteis du ON du.idx = o.bloco
),
projecao AS (
    SELECT f.id, f.campanha_id, f.lead_id,
           a.prioritaria,
           f.agendado_para + a.shift                                  AS depois
    FROM public.email_fila f
    JOIN alvo a ON a.campanha_id = f.campanha_id
               AND a.lead_id     = f.lead_id
    WHERE f.status = 'pendente'
)
SELECT
    (depois AT TIME ZONE 'America/Sao_Paulo')::date                   AS dia_envio_brt,
    count(*)                                                          AS emails_no_dia,
    count(*) FILTER (WHERE prioritaria)                               AS dos_quais_tatiana,
    CASE WHEN count(*) > 350 THEN '🔴 ACIMA DA VAZÃO'
         WHEN count(*) > 250 THEN '🟡 no limite'
         ELSE '🟢 ok' END                                             AS avaliacao,
    count(DISTINCT campanha_id)                                       AS campanhas,
    count(DISTINCT lead_id)                                           AS leads
FROM projecao
GROUP BY 1
ORDER BY 1;

-- ✅ CRITÉRIO DE ACEITE DO PREVIEW:
--    • primeira linha = 2026-08-06 (HOJE)
--    • dos_quais_tatiana = 25 na primeira linha, 0 nas demais
--    • nenhuma linha 🔴


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — APLICAÇÃO (grava — COMMIT explícito, sem SELECT interno)
--           Selecione do BEGIN até o COMMIT, inclusive.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

WITH params AS (
    SELECT
        DATE '2026-08-06'      AS p_data_base,
        40                     AS p_leads_por_dia,
        TIME '09:00'           AS p_hora_inicio,
        ARRAY[14, 15]::bigint[] AS p_campanhas_prioritarias
),
dias_uteis AS (
    SELECT d::date                                AS dia,
           (row_number() OVER (ORDER BY d)) - 1   AS idx
    FROM params p,
         generate_series(p.p_data_base, p.p_data_base + 180, interval '1 day') d
    WHERE extract(dow FROM d) BETWEEN 1 AND 5
),
cadeias AS (
    SELECT f.campanha_id,
           f.lead_id,
           min(f.agendado_para)                                      AS primeiro,
           (f.campanha_id = ANY((SELECT p_campanhas_prioritarias FROM params)))
                                                                     AS prioritaria
    FROM public.email_fila f
    JOIN public.email_campanhas c ON c.id = f.campanha_id
    WHERE f.status = 'pendente'
      AND c.status = 'ativa'
      AND c.id <> 3
    GROUP BY f.campanha_id, f.lead_id
),
ordenadas AS (
    SELECT ca.*,
           CASE
             WHEN ca.prioritaria THEN 0
             ELSE ((row_number() OVER (PARTITION BY ca.prioritaria
                                       ORDER BY ca.primeiro ASC,
                                                ca.campanha_id ASC,
                                                ca.lead_id ASC)) - 1)
                  / (SELECT p_leads_por_dia FROM params)
           END                                                       AS bloco
    FROM cadeias ca
),
alvo AS (
    SELECT o.campanha_id,
           o.lead_id,
           ((du.dia + (SELECT p_hora_inicio FROM params))
              AT TIME ZONE 'America/Sao_Paulo') - o.primeiro          AS shift
    FROM ordenadas o
    JOIN dias_uteis du ON du.idx = o.bloco
)
UPDATE public.email_fila f
   SET agendado_para = f.agendado_para + a.shift
  FROM alvo a
 WHERE f.campanha_id = a.campanha_id
   AND f.lead_id     = a.lead_id
   AND f.status      = 'pendente';

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — VERIFICAÇÃO (read-only, rodar após o COMMIT)
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    c.id                                                     AS campanha_id,
    c.nome,
    c.status                                                 AS status_campanha,
    count(*)                                                 AS pendentes,
    count(*) FILTER (WHERE f.agendado_para <= now())         AS vencidos_agora,
    min(f.agendado_para) AT TIME ZONE 'America/Sao_Paulo'    AS proximo_brt,
    max(f.agendado_para) AT TIME ZONE 'America/Sao_Paulo'    AS ultimo_brt
FROM public.email_fila f
JOIN public.email_campanhas c ON c.id = f.campanha_id
WHERE f.status = 'pendente'
GROUP BY c.id, c.nome, c.status
ORDER BY min(f.agendado_para) ASC;

-- ✅ CRITÉRIO DE ACEITE:
--    • campanhas 14 e 15 ... proximo_brt = 2026-08-06 09:00
--    • bloco 0 (14, 15 e as 40 regulares mais antigas) com vencidos_agora > 0
--      → esses são os que o cron dispara na próxima execução. É o esperado.
--    • CRECI #3 .............. intocada, proximo_brt em 2027, vencidos = 0
--    • total pendente ........ 1.838 (ativas) + 1.436 (CRECI) = 3.274

-- Confirmação de que o cron voltou a enviar (rodar ~20 min após o COMMIT):
--
-- SELECT id, status, enviados, erros, mensagem, executado_em
-- FROM public.cron_execucoes
-- WHERE tipo = 'disparar_fila'
-- ORDER BY executado_em DESC
-- LIMIT 5;
--
-- ✅ `enviados` > 0 e a mensagem deve deixar de citar "10 pausadas".


-- ════════════════════════════════════════════════════════════════════════════
-- PENDÊNCIA OBRIGATÓRIA (inalterada)
-- ════════════════════════════════════════════════════════════════════════════
--
--  🔴 CORREÇÃO DO CRON — RPC crm_selecionar_lote_fila movendo `c.status =
--     'ativa'` e a janela horária para DENTRO do SELECT do lote em
--     api/cron/disparar-fila.ts. Sem isso, o head-of-line blocking retorna
--     na próxima campanha pausada com itens vencidos.
--
--     Contenção operacional até lá: NÃO pausar campanha com itens vencidos.
--     Encerrar ou reagendar os pendentes antes de pausar.
--
-- ════════════════════════════════════════════════════════════════════════════
