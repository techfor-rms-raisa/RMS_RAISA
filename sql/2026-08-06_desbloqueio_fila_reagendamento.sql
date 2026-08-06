-- ════════════════════════════════════════════════════════════════════════════
-- Migração: Desbloqueio da email_fila + reagendamento escalonado
-- Data:      2026-08-06
-- Autor:     Messias / Claude
-- Caminho:   sql/2026-08-06_desbloqueio_fila_reagendamento.sql
-- Ambiente:  PRODUÇÃO (aplicar também em Preview para paridade de estado)
--
-- ────────────────────────────────────────────────────────────────────────────
-- INCIDENTE — Fila de e-mails parada desde 23/07/2026 (14 dias)
-- ────────────────────────────────────────────────────────────────────────────
--
-- SINTOMA REPORTADO: "os e-mails dos leads inseridos ontem não são disparados"
-- (campanhas 14 e 15, da Tatiana). Investigação revelou escopo muito maior:
-- NENHUM e-mail da plataforma foi enviado desde 23/07/2026.
--
-- MEDIÇÃO EM PRODUÇÃO (06/08/2026):
--
--   campanha_id | nome                          | status  | vencidos | mais antigo
--   ------------+-------------------------------+---------+----------+------------
--             3 | CRECI - CAMPANHA 01           | pausada |    1.436 | 23/07/2026
--            13 | Campanha_03_IA_Security       | ativa   |      139 | 24/07/2026
--             5 | Campanha_02_Service_Center    | ativa   |      267 | 24/07/2026
--             4 | Campanha_01_Alocacao_Infra    | ativa   |       79 | 24/07/2026
--            10 | Campanha_05_BPO               | ativa   |       71 | 03/08/2026
--             7 | Campanha_05_BPO               | ativa   |       28 | 24/07/2026
--            15 | Campanha_05_BPO (Tatiana)     | ativa   |        5 | 05/08/2026
--            14 | Campanha_03_IA_Security (Tat.)| ativa   |       20 | 05/08/2026
--            11 | Campanha_06_SAP               | ativa   |        1 | 03/08/2026
--                                                  TOTAL:     2.046
--
-- ────────────────────────────────────────────────────────────────────────────
-- CAUSA RAIZ — HEAD-OF-LINE BLOCKING
-- ────────────────────────────────────────────────────────────────────────────
--
-- api/cron/disparar-fila.ts seleciona o lote ANTES de avaliar elegibilidade:
--
--     SELECT id FROM email_fila
--      WHERE status = 'pendente' AND agendado_para <= now()
--      ORDER BY agendado_para ASC, id ASC
--      LIMIT 10                            ← LOTE FECHADO AQUI
--
--     ... só DEPOIS, no loop (5b/5c), descobre janela horária e status da
--         campanha, e devolve o item para 'pendente'.
--
-- Os 10 itens mais antigos da fila pertencem à campanha CRECI #3, que está
-- PAUSADA. A cada execução o cron elege os MESMOS 10, pula todos, devolve
-- para 'pendente' — e repete 15 minutos depois. A cabeça da fila nunca anda.
--
-- Evidência em cron_execucoes (todas as execuções, sem exceção):
--   "0 enviados, 0 erros, 0 fora de janela, 10 pausadas (lote 10)"   ← após 08h
--   "0 enviados, 0 erros, 10 fora de janela, 0 pausadas (lote 10)"   ← antes 08h
--
-- ⚠️  O cron reportou status='sucesso' em TODAS as execuções durante 14 dias.
--     Falha silenciosa com aparência de saúde plena.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ESCOPO DESTE ARQUIVO — CORREÇÃO DE ESTADO (não de código)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Este SQL corrige o ESTADO DOS DADOS e destrava a fila HOJE, sem deploy.
--
-- A correção de CÓDIGO (mover os predicados de elegibilidade para dentro do
-- SELECT do lote, via RPC crm_selecionar_lote_fila) é entrega separada e
-- OBRIGATÓRIA — sem ela, o entupimento retorna na próxima campanha que for
-- pausada com itens vencidos.
--
-- ────────────────────────────────────────────────────────────────────────────
-- DECISÕES DE PRODUTO (Messias — 06/08/2026)
-- ────────────────────────────────────────────────────────────────────────────
--
--  (1) CRECI #3 não retornará tão cedo → itens PARQUEADOS, não cancelados.
--      Parqueamento = deslocamento de +365 dias em agendado_para.
--      REVERSÍVEL (basta o deslocamento inverso), preserva as 1.436 linhas
--      e o espaçamento relativo entre os steps. Cancelamento seria
--      destrutivo e irreversível.
--
--  (2) Leads NÃO podem receber a cadeia inteira de uma vez.
--      → Reagendamento por DESLOCAMENTO CONSTANTE POR CADEIA.
--
-- ────────────────────────────────────────────────────────────────────────────
-- O ALGORITMO DE REAGENDAMENTO
-- ────────────────────────────────────────────────────────────────────────────
--
-- Unidade de trabalho = CADEIA (campanha_id, lead_id), não item isolado.
--
--   1. Para cada cadeia com ao menos 1 item pendente VENCIDO, calcula-se
--      `primeiro` = min(agendado_para) entre TODOS os seus itens pendentes.
--
--   2. As cadeias são ordenadas por `primeiro` e distribuídas em BLOCOS de
--      p_leads_por_dia, um bloco por DIA ÚTIL a partir de p_data_base.
--
--   3. shift = (dia útil alvo às 09:00 BRT) − primeiro
--
--   4. TODOS os itens pendentes da cadeia recebem agendado_para + shift.
--
-- Efeito: espaçamento interno D+0/+4/+9/+15 PRESERVADO ao milissegundo.
--
--     ANTES  Step1 24/07 ──4d── Step2 28/07 ──5d── Step3 02/08
--                        └────────── shift = +17d ──────────┘
--     DEPOIS Step1 10/08 ──4d── Step2 14/08 ──5d── Step3 19/08
--
-- 🛡️  POR QUE A CADEIA INTEIRA, E NÃO SÓ OS VENCIDOS:
--     Se apenas os vencidos fossem movidos, um Step 2 atrasado poderia ser
--     reagendado para DEPOIS de um Step 3 que já estava marcado no futuro,
--     invertendo a ordem da sequência. Mover a cadeia junto é o que garante
--     a monotonicidade.
--
-- 🛡️  POR QUE DIAS ÚTEIS APENAS NA BASE:
--     Só o ponto de partida da cadeia é ancorado em dia útil. Os steps
--     seguintes herdam os deltas originais e podem cair em fim de semana —
--     exatamente como já acontecia antes do incidente. Nenhuma mudança de
--     comportamento é introduzida aqui.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️  RESTRIÇÃO DE VAZÃO (ler antes de calibrar os parâmetros)
-- ────────────────────────────────────────────────────────────────────────────
--
--   LOTE_TAMANHO = 10  ×  1 execução/15min  =  40 e-mails/hora
--   Janela 08:00–18:00 (10h)                =  400 e-mails/dia (TETO ABSOLUTO)
--
--   O bloco 2 (preview) projeta o volume diário resultante. Se algum dia
--   projetado ultrapassar ~350 e-mails, REDUZA p_leads_por_dia e rode o
--   preview de novo. Agendar acima do teto recria o acúmulo que estamos
--   justamente desfazendo.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COMO EXECUTAR NO SUPABASE SQL EDITOR
-- ────────────────────────────────────────────────────────────────────────────
--
--   O editor executa APENAS O TEXTO SELECIONADO. Selecione um bloco por vez
--   (do BEGIN ao ROLLBACK/COMMIT, inclusive) antes de clicar em Run.
--
--   Ordem obrigatória:  0 → 1 → 2 → 3 → 4
--
--   Blocos 1 e 3 vêm com ROLLBACK. Rode primeiro assim, revise o retorno,
--   e só então TROQUE `ROLLBACK;` por `COMMIT;` e rode de novo.
--
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 0 — DIAGNÓSTICO PRÉVIO (read-only, sem transação)
--           Fotografia do estado ANTES. Guarde o retorno para comparação.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    c.id                                                        AS campanha_id,
    c.nome,
    c.status                                                    AS status_campanha,
    count(*)                                                    AS itens_pendentes,
    count(*) FILTER (WHERE f.agendado_para <= now())            AS vencidos,
    count(DISTINCT f.lead_id)                                   AS leads_distintos,
    min(f.agendado_para)                                        AS mais_antigo,
    max(f.agendado_para)                                        AS mais_recente
FROM public.email_fila f
JOIN public.email_campanhas c ON c.id = f.campanha_id
WHERE f.status = 'pendente'
GROUP BY c.id, c.nome, c.status
ORDER BY min(f.agendado_para) ASC;

-- Sanidade adicional: itens travados em 'enviando' (não esperado; se houver,
-- indica execução do cron interrompida no meio do loop).
SELECT count(*) AS itens_travados_em_enviando
FROM public.email_fila
WHERE status = 'enviando';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — PARQUEAMENTO DA CAMPANHA CRECI #3
--           Desloca +365 dias. REVERSÍVEL. Nenhuma linha é apagada.
--           Selecione DESTE BEGIN até o ROLLBACK e rode.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.email_fila
   SET agendado_para = agendado_para + interval '365 days'
 WHERE campanha_id = 3
   AND status = 'pendente';

-- Conferência: nenhum item da CRECI pode restar vencido.
SELECT
    count(*)                                          AS itens_creci_pendentes,
    count(*) FILTER (WHERE agendado_para <= now())    AS ainda_vencidos,   -- deve ser 0
    min(agendado_para)                                AS novo_mais_antigo,
    max(agendado_para)                                AS novo_mais_recente
FROM public.email_fila
WHERE campanha_id = 3
  AND status = 'pendente';

ROLLBACK;   -- ⬅️  TROQUE POR  COMMIT;  APÓS REVISAR O RETORNO ACIMA

-- 🔄 REVERSÃO (se um dia a CRECI #3 for retomada):
--     UPDATE public.email_fila
--        SET agendado_para = agendado_para - interval '365 days'
--      WHERE campanha_id = 3 AND status = 'pendente';
--
--     ⚠️  NÃO reative a campanha #3 sem antes reagendar estes 1.436 itens
--         para datas futuras. Reverter e reativar dispararia 1.436 e-mails
--         atrasados — risco direto de reputação de domínio no Resend.


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — PREVIEW DO REAGENDAMENTO (read-only, NÃO grava nada)
--
--   Rode ANTES do bloco 3. Mostra exatamente o que o bloco 3 fará.
--   Calibre p_data_base e p_leads_por_dia até o volume diário ficar
--   confortavelmente abaixo de 350 e-mails/dia.
-- ════════════════════════════════════════════════════════════════════════════

WITH params AS (
    SELECT
        DATE '2026-08-10' AS p_data_base,      -- ⬅️ AJUSTE: 1º dia de retomada (segunda-feira)
        40                AS p_leads_por_dia,  -- ⬅️ AJUSTE: cadeias iniciadas por dia útil
        TIME '09:00'      AS p_hora_inicio     -- ⬅️ AJUSTE: hora BRT do 1º step da cadeia
),

-- Calendário de dias úteis (seg–sex) a partir da data base.
dias_uteis AS (
    SELECT d::date                                AS dia,
           (row_number() OVER (ORDER BY d)) - 1   AS idx
    FROM params p,
         generate_series(p.p_data_base,
                         p.p_data_base + 180,
                         interval '1 day') d
    WHERE extract(dow FROM d) BETWEEN 1 AND 5
),

-- Cadeias elegíveis: (campanha, lead) de campanha ATIVA com ao menos um
-- item pendente vencido. CRECI #3 fora por já estar parqueada no bloco 1.
cadeias AS (
    SELECT f.campanha_id,
           f.lead_id,
           min(f.agendado_para)                              AS primeiro,
           count(*)                                          AS steps_pendentes,
           count(*) FILTER (WHERE f.agendado_para <= now())  AS steps_vencidos
    FROM public.email_fila f
    JOIN public.email_campanhas c ON c.id = f.campanha_id
    WHERE f.status = 'pendente'
      AND c.status = 'ativa'
      AND c.id <> 3
    GROUP BY f.campanha_id, f.lead_id
    HAVING count(*) FILTER (WHERE f.agendado_para <= now()) > 0
),

-- Ordenação determinística → bloco (dia útil) de cada cadeia.
ordenadas AS (
    SELECT ca.*,
           ((row_number() OVER (ORDER BY ca.primeiro ASC,
                                         ca.campanha_id ASC,
                                         ca.lead_id ASC)) - 1)
             / (SELECT p_leads_por_dia FROM params)          AS bloco
    FROM cadeias ca
),

-- shift por cadeia.
alvo AS (
    SELECT o.campanha_id,
           o.lead_id,
           o.primeiro,
           o.steps_pendentes,
           ((du.dia + (SELECT p_hora_inicio FROM params))
              AT TIME ZONE 'America/Sao_Paulo')              AS nova_base,
           ((du.dia + (SELECT p_hora_inicio FROM params))
              AT TIME ZONE 'America/Sao_Paulo') - o.primeiro AS shift
    FROM ordenadas o
    JOIN dias_uteis du ON du.idx = o.bloco
),

-- Projeção item a item.
projecao AS (
    SELECT f.id,
           f.campanha_id,
           f.lead_id,
           f.agendado_para                AS antes,
           f.agendado_para + a.shift      AS depois
    FROM public.email_fila f
    JOIN alvo a
      ON a.campanha_id = f.campanha_id
     AND a.lead_id     = f.lead_id
    WHERE f.status = 'pendente'
)

-- ── Visão 1: volume projetado por dia (o número que importa) ──
SELECT
    (depois AT TIME ZONE 'America/Sao_Paulo')::date          AS dia_envio_brt,
    count(*)                                                 AS emails_no_dia,
    CASE WHEN count(*) > 350 THEN '🔴 ACIMA DA VAZÃO'
         WHEN count(*) > 250 THEN '🟡 no limite'
         ELSE '🟢 ok' END                                    AS avaliacao,
    count(DISTINCT campanha_id)                              AS campanhas,
    count(DISTINCT lead_id)                                  AS leads
FROM projecao
GROUP BY 1
ORDER BY 1;

-- ── Visão 2: amostra de cadeias, para inspeção do espaçamento preservado ──
-- (rode separadamente trocando a Visão 1 por este SELECT, mantendo os CTEs)
--
-- SELECT campanha_id, lead_id,
--        antes  AT TIME ZONE 'America/Sao_Paulo' AS antes_brt,
--        depois AT TIME ZONE 'America/Sao_Paulo' AS depois_brt
-- FROM projecao
-- WHERE lead_id IN (SELECT lead_id FROM projecao ORDER BY lead_id LIMIT 3)
-- ORDER BY lead_id, depois;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — REAGENDAMENTO (grava)
--
--   ⚠️  Use EXATAMENTE os mesmos valores de params validados no bloco 2.
--   Selecione DESTE BEGIN até o ROLLBACK e rode.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

WITH params AS (
    SELECT
        DATE '2026-08-10' AS p_data_base,      -- ⬅️ MESMO valor do bloco 2
        40                AS p_leads_por_dia,  -- ⬅️ MESMO valor do bloco 2
        TIME '09:00'      AS p_hora_inicio     -- ⬅️ MESMO valor do bloco 2
),
dias_uteis AS (
    SELECT d::date                                AS dia,
           (row_number() OVER (ORDER BY d)) - 1   AS idx
    FROM params p,
         generate_series(p.p_data_base,
                         p.p_data_base + 180,
                         interval '1 day') d
    WHERE extract(dow FROM d) BETWEEN 1 AND 5
),
cadeias AS (
    SELECT f.campanha_id,
           f.lead_id,
           min(f.agendado_para)                              AS primeiro
    FROM public.email_fila f
    JOIN public.email_campanhas c ON c.id = f.campanha_id
    WHERE f.status = 'pendente'
      AND c.status = 'ativa'
      AND c.id <> 3
    GROUP BY f.campanha_id, f.lead_id
    HAVING count(*) FILTER (WHERE f.agendado_para <= now()) > 0
),
ordenadas AS (
    SELECT ca.*,
           ((row_number() OVER (ORDER BY ca.primeiro ASC,
                                         ca.campanha_id ASC,
                                         ca.lead_id ASC)) - 1)
             / (SELECT p_leads_por_dia FROM params)          AS bloco
    FROM cadeias ca
),
alvo AS (
    SELECT o.campanha_id,
           o.lead_id,
           ((du.dia + (SELECT p_hora_inicio FROM params))
              AT TIME ZONE 'America/Sao_Paulo') - o.primeiro AS shift
    FROM ordenadas o
    JOIN dias_uteis du ON du.idx = o.bloco
)
UPDATE public.email_fila f
   SET agendado_para = f.agendado_para + a.shift
  FROM alvo a
 WHERE f.campanha_id = a.campanha_id
   AND f.lead_id     = a.lead_id
   AND f.status      = 'pendente';

-- Conferência imediata: não pode restar NENHUM item vencido em campanha ativa.
SELECT
    count(*) FILTER (WHERE f.agendado_para <= now())  AS ainda_vencidos,  -- deve ser 0
    count(*)                                          AS total_pendentes,
    min(f.agendado_para)                              AS proximo_envio
FROM public.email_fila f
JOIN public.email_campanhas c ON c.id = f.campanha_id
WHERE f.status = 'pendente'
  AND c.status = 'ativa';

ROLLBACK;   -- ⬅️  TROQUE POR  COMMIT;  APÓS REVISAR O RETORNO ACIMA


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — VERIFICAÇÃO PÓS-COMMIT (read-only)
--           Rode após COMMIT dos blocos 1 e 3.
-- ════════════════════════════════════════════════════════════════════════════

-- 4.1) Estado consolidado da fila
SELECT
    c.id                                                     AS campanha_id,
    c.nome,
    c.status                                                 AS status_campanha,
    count(*)                                                 AS pendentes,
    count(*) FILTER (WHERE f.agendado_para <= now())         AS vencidos,
    min(f.agendado_para) AT TIME ZONE 'America/Sao_Paulo'    AS proximo_brt,
    max(f.agendado_para) AT TIME ZONE 'America/Sao_Paulo'    AS ultimo_brt
FROM public.email_fila f
JOIN public.email_campanhas c ON c.id = f.campanha_id
WHERE f.status = 'pendente'
GROUP BY c.id, c.nome, c.status
ORDER BY min(f.agendado_para) ASC;

-- ✅ CRITÉRIO DE ACEITE:
--    • CRECI #3 ....... vencidos = 0, próximo em ~2027
--    • Campanhas ativas vencidos = 0, próximo = p_data_base às 09:00 BRT
--
-- ⚠️  ATENÇÃO — vencidos = 0 significa que o cron NÃO enviará nada até
--     p_data_base. Isso é esperado e desejado: é o que impede a rajada.

-- 4.2) Calendário de envio consolidado (primeiros 30 dias)
SELECT
    (f.agendado_para AT TIME ZONE 'America/Sao_Paulo')::date AS dia_brt,
    count(*)                                                 AS emails,
    count(DISTINCT f.campanha_id)                            AS campanhas
FROM public.email_fila f
JOIN public.email_campanhas c ON c.id = f.campanha_id
WHERE f.status = 'pendente'
  AND c.status = 'ativa'
GROUP BY 1
ORDER BY 1
LIMIT 30;

-- 4.3) Após p_data_base — o cron voltou a enviar?
--      Rode no dia seguinte à retomada. `enviados` deve ser > 0.
--
-- SELECT id, status, enviados, erros, mensagem, executado_em
-- FROM public.cron_execucoes
-- WHERE tipo = 'disparar_fila'
-- ORDER BY executado_em DESC
-- LIMIT 20;


-- ════════════════════════════════════════════════════════════════════════════
-- PENDÊNCIA OBRIGATÓRIA APÓS ESTE SQL
-- ════════════════════════════════════════════════════════════════════════════
--
--  1. 🔴 CORREÇÃO DO CRON (bloqueante) — RPC crm_selecionar_lote_fila movendo
--        `c.status = 'ativa'` e a janela horária para DENTRO do SELECT do lote.
--        Sem isso, o head-of-line blocking retorna na próxima campanha pausada
--        com itens vencidos. As validações 5b/5c do loop PERMANECEM como
--        defesa em profundidade contra corrida (pausa entre SELECT e envio).
--
--  2. 🟠 VAZÃO — LOTE_TAMANHO = 10 a cada 15 min = 400 e-mails/dia é teto
--        baixo para o volume atual. Resend suporta 5 req/s (throttle de 220ms
--        já implementado). Revisar dimensionamento.
--
--  3. 🟠 OBSERVABILIDADE — 2.046 e-mails represados por 14 dias sem nenhum
--        alerta. `cron_execucoes` registrou tudo, mas ninguém lê. Monitor
--        proposto: item 'pendente' com agendado_para vencido há > 2h, ou N
--        execuções consecutivas com enviados = 0 e lote cheio.
--
-- ════════════════════════════════════════════════════════════════════════════
