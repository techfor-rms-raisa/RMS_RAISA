-- ============================================================================
-- 2026-06-17_prospect_leads_motor_importacao.sql
--
-- Caminho: db/migrations/2026-06-17_prospect_leads_motor_importacao.sql
-- Objetivo: Adicionar 'importacao_lista' como valor aceito no CHECK constraint
--           da coluna `motor` em `prospect_leads`. Pré-requisito para a Sub-fase
--           3.C do Módulo de Revalidação ("Importar Lista de Leads").
--
-- Antes (11 valores): apollo, snovio, ambos, gemini, hunter, gemini+hunter,
--                     extension, cv_alocacao, cv_infra, cv_ia_ml, cv_sap
-- Adicionado (1):     importacao_lista
-- Total (12).
--
-- Procedimento padrão Messias:
--   1ª passada: roda como está (com ROLLBACK no fim) — confere V1 vs V4.
--   2ª passada: troca ROLLBACK por COMMIT (após inspeção visual OK).
--
-- Ambiente: aplicar primeiro em Preview (smuikbkjfuggtcmkurqh),
--           depois em Production (wuejqxijjjdvwighjiiaj) após smoke OK.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- V1 — Estado atual da constraint do `motor` (esperado: 1 linha)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  conname AS nome_constraint,
  pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'prospect_leads'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%motor%';

-- ──────────────────────────────────────────────────────────────────────────
-- V2 — DROP da constraint antiga (descobre nome dinamicamente)
-- Defensivo: se o nome for diferente do esperado, este DO bloco encontra
-- mesmo assim. Se NÃO existir constraint, emite NOTICE e segue (não falha).
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nome TEXT;
BEGIN
  SELECT conname INTO v_nome
  FROM pg_constraint
  WHERE conrelid = 'prospect_leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%motor%'
  LIMIT 1;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE prospect_leads DROP CONSTRAINT %I', v_nome);
    RAISE NOTICE 'Constraint % removida.', v_nome;
  ELSE
    RAISE NOTICE 'Nenhuma constraint de motor encontrada — pulando DROP.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- V3 — ADD constraint nova, agora com 'importacao_lista'
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE prospect_leads
ADD CONSTRAINT prospect_leads_motor_check
CHECK (motor IN (
  'apollo',
  'snovio',
  'ambos',
  'gemini',
  'hunter',
  'gemini+hunter',
  'extension',
  'cv_alocacao',
  'cv_infra',
  'cv_ia_ml',
  'cv_sap',
  'importacao_lista'
));

-- ──────────────────────────────────────────────────────────────────────────
-- V4 — Confirmação visual da nova constraint
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  conname AS nome_constraint,
  pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'prospect_leads'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%motor%';

-- ──────────────────────────────────────────────────────────────────────────
-- V5 — Teste idempotente: tentar INSERIR e DELETAR um lead de teste com o
-- novo motor. Se a constraint estiver correta, INSERT passa e DELETE limpa.
-- Se algo dá errado, a transação inteira é abortada pelo ROLLBACK no fim.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO prospect_leads (
    buscado_por, motor, nome_completo
  ) VALUES (
    2, 'importacao_lista', '__TESTE_MIGRATION_MOTOR__'
  ) RETURNING id INTO v_id;
  RAISE NOTICE 'INSERT teste OK — id=%', v_id;
  DELETE FROM prospect_leads WHERE id = v_id;
  RAISE NOTICE 'DELETE teste OK — constraint aceita ''importacao_lista''.';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- INSPEÇÃO: confira V1 (antes) vs V4 (depois) e os NOTICEs do V2/V5.
-- Se OK → rode esta migration de novo trocando ROLLBACK por COMMIT.
-- ════════════════════════════════════════════════════════════════════════
ROLLBACK;
