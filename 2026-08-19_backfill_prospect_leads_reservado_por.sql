-- ═══════════════════════════════════════════════════════════════════════
-- 2026-08-19_backfill_prospect_leads_reservado_por.sql
--
-- Backfill de `prospect_leads.reservado_por` a partir de `buscado_por`
-- para os prospects de PROSPECÇÃO que nasceram órfãos.
--
-- CONTEXTO (diagnóstico 19/08/2026)
--   O modal "Importar Prospects" da Base de Leads passou a respeitar
--   `reservado_por` (useImportProspects v1.1). Sem este backfill, a
--   listagem esvaziaria: apenas 96 dos 1.120 prospects com e-mail tinham
--   dono no momento da análise.
--
--   Origem dos órfãos:
--     • gemini (512) e apollo (430) — legado anterior à correção do
--       api/prospect-save.ts, que hoje já grava a reserva.
--     • extension (82) — INSERT direto de api/prospect-capture.ts, que
--       gravava apenas `buscado_por`. Corrigido na v2.2, entregue junto.
--
--   Verificação prévia confirmou 1.024 órfãos e 1.024 recuperáveis
--   (100% com `buscado_por` preenchido, distribuídos em 5 usuários).
--
-- SEMÂNTICA
--   Quem buscou o prospect é quem deveria tê-lo reservado. Decisão
--   aprovada por Messias em 19/08/2026.
--
-- ESCOPO — o que este script NÃO toca:
--   • motor LIKE 'cv_%'          → são EMPRESAS extraídas de currículo,
--                                  não interlocutores. Reserva de empresa
--                                  é gerida na aba Lista Empresas.
--   • motor = 'importacao_lista' → já possuem dono (0 órfãos) e fluxo
--                                  próprio na aba Leads Importados.
--   • registros com reservado_por já preenchido → nunca sobrescritos.
--   • registros com buscado_por NULL → sem base para inferir o dono.
--
--   Vertical CRECI não é filtrada aqui: possui base própria e não está
--   presente neste conjunto (confirmado por introspeção em 19/08/2026).
--
-- ORDEM DE EXECUÇÃO
--   Este SQL deve rodar ANTES do deploy do código. Se o frontend subir
--   primeiro, o modal fica vazio até o backfill ser aplicado.
--
-- COMO EXECUTAR
--   O SQL Editor do Supabase executa APENAS o texto selecionado.
--   Selecione um bloco inteiro (de BEGIN até ROLLBACK/COMMIT) por vez.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- BLOCO 1 — DRY-RUN. Mostra o que SERIA alterado e desfaz tudo.
-- Selecione de BEGIN até ROLLBACK e execute.
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;

WITH alvo AS (
    SELECT id, motor, buscado_por
    FROM prospect_leads
    WHERE reservado_por IS NULL
      AND buscado_por IS NOT NULL
      AND motor NOT LIKE 'cv_%'
      AND motor <> 'importacao_lista'
),
aplicado AS (
    UPDATE prospect_leads pl
    SET reservado_por = pl.buscado_por,
        -- A data da reserva retroage à criação do registro: é quando o
        -- vínculo de fato passou a existir. Usar now() falsearia a
        -- antiguidade da carteira de cada analista.
        reservado_em  = COALESCE(pl.reservado_em, pl.criado_em)
    FROM alvo a
    WHERE pl.id = a.id
    RETURNING pl.id, pl.motor, pl.reservado_por
)
SELECT
    motor,
    reservado_por,
    COUNT(*) AS registros_afetados
FROM aplicado
GROUP BY motor, reservado_por
ORDER BY motor, registros_afetados DESC;

ROLLBACK;


-- ═══════════════════════════════════════════════════════════════════════
-- BLOCO 2 — EXECUÇÃO DEFINITIVA.
-- Rode SOMENTE após conferir os números do Bloco 1.
-- Selecione de BEGIN até COMMIT e execute.
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;

UPDATE prospect_leads
SET reservado_por = buscado_por,
    reservado_em  = COALESCE(reservado_em, criado_em)
WHERE reservado_por IS NULL
  AND buscado_por IS NOT NULL
  AND motor NOT LIKE 'cv_%'
  AND motor <> 'importacao_lista';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════
-- BLOCO 3 — VALIDAÇÃO PÓS-EXECUÇÃO.
-- Esperado: coluna `orfaos_restantes` zerada em todas as linhas.
-- ═══════════════════════════════════════════════════════════════════════
SELECT
    motor,
    COUNT(*)                                                                AS total,
    COUNT(*) FILTER (WHERE reservado_por IS NOT NULL)                       AS com_dono,
    COUNT(*) FILTER (WHERE reservado_por IS NULL AND buscado_por IS NOT NULL) AS orfaos_restantes
FROM prospect_leads
WHERE motor NOT LIKE 'cv_%'
  AND motor <> 'importacao_lista'
GROUP BY motor
ORDER BY total DESC;


-- ═══════════════════════════════════════════════════════════════════════
-- BLOCO 4 — ROLLBACK DE EMERGÊNCIA (só se necessário).
--
-- Reverte APENAS os registros tocados por este backfill: aqueles em que
-- reservado_por é idêntico a buscado_por E reservado_em coincide com
-- criado_em. Reservas manuais feitas pelo Prospect Engine não satisfazem
-- as duas condições ao mesmo tempo e ficam intactas.
--
-- Atenção: quanto mais tempo passar após o backfill, maior a chance de
-- reservas legítimas novas se parecerem com as retroagidas. Use logo.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
--
-- UPDATE prospect_leads
-- SET reservado_por = NULL,
--     reservado_em  = NULL
-- WHERE reservado_por = buscado_por
--   AND reservado_em  = criado_em
--   AND motor NOT LIKE 'cv_%'
--   AND motor <> 'importacao_lista';
--
-- COMMIT;
