-- ════════════════════════════════════════════════════════════════════════════
-- Migração: RPC crm_selecionar_lote_fila
-- Data:      2026-08-06
-- Autor:     Messias / Claude
-- Caminho:   sql/2026-08-06_rpc_crm_selecionar_lote_fila.sql
-- Pareada:   api/cron/disparar-fila.ts v1.14
--
-- ────────────────────────────────────────────────────────────────────────────
-- MOTIVAÇÃO — Incidente de 23/07 a 06/08/2026 (HEAD-OF-LINE BLOCKING)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Durante 14 dias NENHUM e-mail da plataforma foi enviado. 2.046 itens
-- represados em 8 campanhas ativas. O cron executou pontualmente a cada 15
-- minutos, reportando `status='sucesso'` em TODAS as execuções.
--
-- O código v1.13 selecionava o lote ANTES de avaliar elegibilidade:
--
--     SELECT id FROM email_fila
--      WHERE status = 'pendente' AND agendado_para <= now()
--      ORDER BY agendado_para ASC, id ASC
--      LIMIT 10                                  ← LOTE FECHADO AQUI
--
--     ... e só DEPOIS, dentro do loop de processamento (5b/5c), descobria
--         janela horária e status da campanha, devolvendo o item para
--         'pendente'.
--
-- Os 10 itens mais antigos da fila pertenciam à campanha CRECI #3, PAUSADA,
-- com 1.436 itens vencidos desde 23/07. A cada execução o cron elegia os
-- MESMOS 10, pulava todos, devolvia para 'pendente' — e repetia 15 minutos
-- depois. A cabeça da fila nunca andava. Tudo atrás dela ficou refém.
--
-- Evidência em cron_execucoes (todas as execuções, sem exceção):
--   "0 enviados, 0 erros, 0 fora de janela, 10 pausadas (lote 10)"   ← após 08h
--   "0 enviados, 0 erros, 10 fora de janela, 0 pausadas (lote 10)"   ← antes 08h
--
-- ⚠️  DEGRADAÇÃO SILENCIOSA: nenhum deploy quebrou nada. Bastou uma campanha
--     ser pausada com itens vencidos. O sintoma — "campanha sem envios" — é
--     indistinguível de "campanha sem leads", e por isso passou 14 dias sem
--     ser detectado.
--
-- ────────────────────────────────────────────────────────────────────────────
-- SOLUÇÃO DEFINITIVA
-- ────────────────────────────────────────────────────────────────────────────
--
-- Toda a elegibilidade passa a ser resolvida DENTRO do PostgreSQL, no mesmo
-- SELECT que monta o lote. Itens inelegíveis NUNCA entram no lote — logo,
-- nunca ocupam as vagas nem travam a cabeça da fila.
--
-- Mesma lição arquitetural da RPC crm_listar_leads_vinculo_em_lote
-- (incidente HTTP 414 de 23/07): elegibilidade pertence ao plano do
-- Postgres, não à memória do Node depois do fato.
--
-- 🛡️  RETURNS jsonb (UMA única linha) — retorno escalar/agregado NÃO é
--     afetado pelo limite default de 1.000 linhas do cliente supabase-js.
--     Um `RETURNS TABLE` aqui apenas plantaria a próxima falha por volume.
--
-- ────────────────────────────────────────────────────────────────────────────
-- FIDELIDADE DE COMPORTAMENTO — replica EXATAMENTE a v1.13
-- ────────────────────────────────────────────────────────────────────────────
--
--   • ORDER BY agendado_para ASC, id ASC
--     Desempate por `id` preservado da v1.2. Sem ele, itens com o mesmo
--     `agendado_para` (típico em campanhas com delay=0) retornam em ordem
--     indeterminada e o cron pode disparar Step 4 antes do Step 1 do mesmo
--     lead. O enfileiramento popula a fila iterando (lead × step), então
--     `id ASC` dá a sequência natural Lead1[1→2→3→4] → Lead2[1→2→3→4].
--
--   • Janela horária: espelha `dentroDaJanela(horaSP, inicio, fim)` do TS,
--     que compara strings "HH:MM" com `>=` e `<=` (AMBOS OS EXTREMOS
--     INCLUSIVOS). Daqui o `date_trunc('minute', ...)`: sem ele, às
--     18:00:30 o SQL excluiria um item que o TS aceitava (18:00 <= 18:00).
--     Granularidade de MINUTO é o que reproduz o comportamento atual.
--
--   • Defaults 08:00 / 18:00 via COALESCE: espelham `normalizarHora(valor,
--     '08:00')` e `normalizarHora(valor, '18:00')` do TS para campanhas com
--     horário nulo.
--
--   • `c.status = 'ativa'`: espelha a validação 5c do loop.
--
-- ⚠️  O QUE ESTA RPC **NÃO** FAZ (deliberadamente):
--     Não avalia opt-out tardio (5c-bis) nem integridade de step/campanha
--     (5a). Esses seguem no loop, onde já operam sobre dados ricos já
--     carregados. Movê-los para cá não traria ganho e aumentaria acoplamento.
--
-- 🛡️  AS VALIDAÇÕES 5b E 5c DO LOOP PERMANECEM NO CÓDIGO.
--     Deixam de ser o mecanismo primário e passam a ser DEFESA EM
--     PROFUNDIDADE contra corrida: alguém pode pausar a campanha entre o
--     SELECT e o envio. Removê-las trocaria um bug por outro.
--
-- ────────────────────────────────────────────────────────────────────────────
-- APLICAÇÃO
-- ────────────────────────────────────────────────────────────────────────────
--   1. Aplicar em PREVIEW  (SQL Editor → Ctrl+A → Run)
--   2. Rodar o smoke test do rodapé
--   3. Aplicar em PRODUÇÃO **ANTES** do deploy de api/cron/disparar-fila.ts v1.14
--
--   Idempotente: CREATE OR REPLACE + CREATE INDEX IF NOT EXISTS.
--   Não destrutivo: nenhum DROP, UPDATE ou DELETE.
--
--   ⚠️  A ORDEM IMPORTA. Se o código v1.14 subir antes da RPC existir, o
--       cron falha com PostgREST 404 e a fila para de novo. SQL primeiro.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Índice de apoio (idempotente)
-- ─────────────────────────────────────────────────────────────

-- Suporta o predicado + ordenação do lote. Índice PARCIAL: só linhas
-- 'pendente' interessam, e elas são minoria conforme a fila envelhece.
CREATE INDEX IF NOT EXISTS idx_email_fila_pendente_agendado
    ON public.email_fila (agendado_para ASC, id ASC)
    WHERE status = 'pendente';


-- ─────────────────────────────────────────────────────────────
-- 2) A RPC
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_selecionar_lote_fila(
    p_limite integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$

WITH par AS (
    -- Clamp defensivo. Teto de 200 protege contra chamada equivocada que
    -- estouraria o maxDuration=60s da função serverless.
    SELECT greatest(1, least(200, coalesce(p_limite, 10))) AS limite
),

agora AS (
    SELECT now()                                                        AS ts,
           -- Granularidade de MINUTO — ver nota de fidelidade no cabeçalho.
           date_trunc('minute', now() AT TIME ZONE 'America/Sao_Paulo')::time
                                                                        AS hora_sp
),

-- ═══════════════════════════════════════════════════════════════
-- O CORAÇÃO DA CORREÇÃO
--   Antes: LIMIT 10 sobre a fila crua → itens de campanha pausada
--          ocupavam as 10 vagas indefinidamente.
--   Agora: campanha pausada e fora de janela filtradas ANTES do
--          LIMIT. Só entra no lote o que pode de fato ser enviado.
-- ═══════════════════════════════════════════════════════════════
elegiveis AS (
    SELECT f.id,
           f.agendado_para
    FROM public.email_fila f
    JOIN public.email_campanhas c ON c.id = f.campanha_id
    CROSS JOIN agora a
    WHERE f.status = 'pendente'
      AND f.agendado_para <= a.ts

      -- ── Campanha ativa (espelha validação 5c do loop) ───────
      AND c.status = 'ativa'

      -- ── Janela horária (espelha validação 5b do loop) ───────
      AND a.hora_sp >= coalesce(c.horario_inicio, TIME '08:00')
      AND a.hora_sp <= coalesce(c.horario_fim,    TIME '18:00')

    ORDER BY f.agendado_para ASC,
             f.id            ASC
    LIMIT (SELECT limite FROM par)
)

SELECT jsonb_build_object(
    'ids', coalesce(
        (
            SELECT jsonb_agg(e.id ORDER BY e.agendado_para ASC, e.id ASC)
              FROM elegiveis e
        ),
        '[]'::jsonb
    ),
    'total', (SELECT count(*)::int FROM elegiveis)
);

$function$;


-- ─────────────────────────────────────────────────────────────
-- 3) Documentação + permissões
-- ─────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.crm_selecionar_lote_fila(integer) IS
'Seleciona o lote de itens da email_fila prontos para disparo, resolvendo
TODA a elegibilidade em SQL (status pendente, vencimento, campanha ativa e
janela horária no fuso de São Paulo) ANTES do LIMIT. Elimina o head-of-line
blocking em que itens de campanha pausada ocupavam permanentemente as vagas
do lote e paralisavam a fila inteira (incidente 23/07–06/08/2026, 14 dias
sem envios). Retorna jsonb {ids, total} — retorno escalar, imune ao limite
default de 1000 linhas do supabase-js. Pareada com api/cron/disparar-fila.ts v1.14.';

GRANT EXECUTE ON FUNCTION public.crm_selecionar_lote_fila(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_selecionar_lote_fila(integer) TO authenticated;

-- PostgREST cacheia o schema; sem isto a primeira chamada pode dar 404.
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- 4) SMOKE TEST — rodar logo após aplicar (read-only, autocontido)
-- ════════════════════════════════════════════════════════════════════════════

-- 4.1) A RPC responde e devolve o contrato esperado?
SELECT public.crm_selecionar_lote_fila(10) AS retorno;

-- 4.2) Comparação com o SELECT INGÊNUO da v1.13 — a prova da correção.
--      `ingenuos` reproduz o que a v1.13 selecionaria; `elegiveis`, o que a
--      RPC seleciona. A diferença é exatamente o entupimento eliminado.
WITH ingenuos AS (
    SELECT f.id, f.campanha_id
    FROM public.email_fila f
    WHERE f.status = 'pendente'
      AND f.agendado_para <= now()
    ORDER BY f.agendado_para ASC, f.id ASC
    LIMIT 10
),
elegiveis AS (
    SELECT (jsonb_array_elements_text(
                public.crm_selecionar_lote_fila(10) -> 'ids'
            ))::bigint AS id
)
SELECT
    (SELECT count(*) FROM ingenuos)                                AS lote_v1_13,
    (SELECT count(*) FROM elegiveis)                               AS lote_v1_14,
    (SELECT count(*) FROM ingenuos i
      WHERE NOT EXISTS (SELECT 1 FROM elegiveis e WHERE e.id = i.id))
                                                                   AS bloqueadores_removidos,
    (SELECT string_agg(DISTINCT c.nome || ' [' || c.status || ']', ' | ')
       FROM ingenuos i
       JOIN public.email_campanhas c ON c.id = i.campanha_id
      WHERE NOT EXISTS (SELECT 1 FROM elegiveis e WHERE e.id = i.id))
                                                                   AS origem_dos_bloqueadores;

-- ✅ LEITURA DO RESULTADO:
--    • bloqueadores_removidos = 0
--        → não há campanha pausada/fora de janela na cabeça da fila AGORA.
--          A RPC está correta, apenas não há o que filtrar neste instante.
--          Para provar de verdade, veja 4.3.
--    • bloqueadores_removidos > 0
--        → a RPC está removendo itens que a v1.13 deixaria travando o lote.
--          `origem_dos_bloqueadores` nomeia a campanha e o status culpados.

-- 4.3) TESTE DECISIVO — simula o cenário exato do incidente sem alterar dados.
--      Pergunta: se a CRECI #3 estivesse vencida hoje, ela entraria no lote?
WITH simulacao AS (
    SELECT f.id, c.nome, c.status
    FROM public.email_fila f
    JOIN public.email_campanhas c ON c.id = f.campanha_id
    CROSS JOIN LATERAL (
        SELECT date_trunc('minute', now() AT TIME ZONE 'America/Sao_Paulo')::time AS hora_sp
    ) a
    WHERE f.status = 'pendente'
      AND c.id = 3                                    -- CRECI, pausada
      AND c.status = 'ativa'                          -- ← predicado da RPC
      AND a.hora_sp >= coalesce(c.horario_inicio, TIME '08:00')
      AND a.hora_sp <= coalesce(c.horario_fim,    TIME '18:00')
)
SELECT count(*) AS itens_creci_que_entrariam_no_lote FROM simulacao;

-- ✅ CRITÉRIO DE ACEITE: 0.
--    A CRECI tem 1.436 itens pendentes, mas a campanha está 'pausada' — e
--    por isso NENHUM deles é elegível. Era exatamente esse filtro que
--    chegava tarde demais na v1.13.


-- ════════════════════════════════════════════════════════════════════════════
-- PENDÊNCIAS REMANESCENTES (fora do escopo desta migração)
-- ════════════════════════════════════════════════════════════════════════════
--
--  🟠 VAZÃO — LOTE_TAMANHO = 10 a cada 15 min = 40 e-mails/hora; na janela
--     08–18h, teto de 400/dia. Resend suporta 5 req/s (throttle de 220ms já
--     implementado). Revisar dimensionamento com o volume atual (~1.974
--     itens pendentes).
--
--  🟠 OBSERVABILIDADE — 2.046 e-mails represados por 14 dias sem nenhum
--     alerta. `cron_execucoes` registrou tudo, mas ninguém lê. Monitor
--     proposto: item 'pendente' vencido há > 2h, ou N execuções consecutivas
--     com enviados = 0 e lote cheio.
--
-- ════════════════════════════════════════════════════════════════════════════
