-- =====================================================================
-- MIGRATION: email_leads — Recovery Pipeline fields
-- Data: 12/06/2026
-- Fase 2 — Email Recovery Pipeline (suporte aos campos de estado)
--
-- Adiciona 3 colunas em public.email_leads para sustentar:
--   • tentativas_recovery  → contador da decisão D9 (máx 3 tentativas)
--   • motivo_invalidacao   → auditoria do D7 (origem da invalidação)
--   • recovery_em          → timestamp da recuperação bem-sucedida
--
-- Mais 1 índice parcial para a aba "Leads Inválidos" (D6+D7):
--   idx_email_leads_invalidos: WHERE apto_campanha = false
--                              AND motivo_invalidacao IS NOT NULL
--
-- =====================================================================
-- 🟡 PADRÃO DE REVIEW DO PROJETO:
-- Trocar o último "COMMIT;" por "ROLLBACK;" para revisar.
-- Validar os SELECTs de inspeção. Trocar de volta para "COMMIT;".
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Novas colunas
-- ---------------------------------------------------------------------
ALTER TABLE public.email_leads
  ADD COLUMN IF NOT EXISTS tentativas_recovery INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_invalidacao  TEXT    NULL,
  ADD COLUMN IF NOT EXISTS recovery_em         TIMESTAMPTZ NULL;

-- ---------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------

-- Teto de tentativas (D9 — 12/06/2026)
ALTER TABLE public.email_leads
  DROP CONSTRAINT IF EXISTS email_leads_tentativas_recovery_max;
ALTER TABLE public.email_leads
  ADD CONSTRAINT email_leads_tentativas_recovery_max
  CHECK (tentativas_recovery >= 0 AND tentativas_recovery <= 3);

-- Enum de motivos (D7 — auditoria)
ALTER TABLE public.email_leads
  DROP CONSTRAINT IF EXISTS email_leads_motivo_invalidacao_valido;
ALTER TABLE public.email_leads
  ADD CONSTRAINT email_leads_motivo_invalidacao_valido
  CHECK (
    motivo_invalidacao IS NULL
    OR motivo_invalidacao IN ('bounce', 'mx', 'f7_pre_campanha', 'no_match', 'edicao_manual')
  );

-- ---------------------------------------------------------------------
-- 3. Índice parcial — aba "Leads Inválidos"
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_email_leads_invalidos
  ON public.email_leads (id)
  WHERE apto_campanha = false AND motivo_invalidacao IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. Comentários (documentação inline)
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.email_leads.tentativas_recovery IS
  'Contador de tentativas de recovery (auto + manual). Máximo 3 (D9 — 12/06/2026). Após 3, lead é "definitivamente irrecuperável".';

COMMENT ON COLUMN public.email_leads.motivo_invalidacao IS
  'Origem da invalidação. Valores: bounce (webhook), mx (DNS falhou), f7_pre_campanha (validação em lote), no_match (Recovery esgotou padrões), edicao_manual (analista editou um email que falhou validação). NULL = nunca foi invalidado.';

COMMENT ON COLUMN public.email_leads.recovery_em IS
  'Quando o lead foi recuperado com sucesso (Recovery Pipeline ou edição manual). NULL = nunca recuperado.';

-- ---------------------------------------------------------------------
-- 5. Validação (queries de inspeção, não-destrutivas)
-- ---------------------------------------------------------------------

SELECT
  'COLUNAS ADICIONADAS' AS status,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_leads'
  AND column_name IN ('tentativas_recovery', 'motivo_invalidacao', 'recovery_em')
ORDER BY ordinal_position;

SELECT
  'CONSTRAINTS' AS status,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'email_leads'
  AND (
    constraint_name = 'email_leads_tentativas_recovery_max'
    OR constraint_name = 'email_leads_motivo_invalidacao_valido'
  );

SELECT
  'INDICE' AS status,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'email_leads'
  AND indexname = 'idx_email_leads_invalidos';

-- ---------------------------------------------------------------------
-- 6. Commit final
-- ---------------------------------------------------------------------
-- Trocar para ROLLBACK ao revisar; voltar a COMMIT após validar SELECTs.

COMMIT;
