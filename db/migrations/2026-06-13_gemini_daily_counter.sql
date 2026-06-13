-- =====================================================================
-- MIGRATION: gemini_daily_counter
-- Data: 13/06/2026
-- Sub-fase 3.A — Camada Gemini (Decisão A.5 — cap diário 200 chamadas)
--
-- Tabela operacional simples para rastrear chamadas Gemini por dia.
-- Antes de cada chamada (Discovery ou Ranker), o helper verifica se
-- ainda há orçamento. Se atingiu o cap, falha graciosamente (degradação
-- silenciosa para o motor Snov.io puro).
--
-- Custo estimado:
--   - Discovery + Ranker máx 2 chamadas/lead = ~$0.0015
--   - 200 chamadas/dia = ~$0.30/dia = ~$9/mês teto absoluto
--
-- =====================================================================
-- 🟡 PADRÃO DE REVIEW DO PROJETO:
-- MANTER ROLLBACK no final para revisar. Trocar por COMMIT após validar
-- os SELECTs de inspeção.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabela principal
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gemini_daily_counter (
  data           DATE PRIMARY KEY,
  total_chamadas INTEGER NOT NULL DEFAULT 0,
  chamadas_discovery INTEGER NOT NULL DEFAULT 0,
  chamadas_ranker    INTEGER NOT NULL DEFAULT 0,
  cap_diario     INTEGER NOT NULL DEFAULT 200,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gemini_daily_counter_total_nao_negativo
    CHECK (total_chamadas >= 0),
  CONSTRAINT gemini_daily_counter_discovery_nao_negativo
    CHECK (chamadas_discovery >= 0),
  CONSTRAINT gemini_daily_counter_ranker_nao_negativo
    CHECK (chamadas_ranker >= 0),
  CONSTRAINT gemini_daily_counter_cap_positivo
    CHECK (cap_diario > 0)
);

-- ---------------------------------------------------------------------
-- 2. Comentários (documentação inline)
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.gemini_daily_counter IS
  'Cap diário de chamadas Gemini (Sub-fase 3.A — Recovery Pipeline). Decisão A.5 — 13/06/2026.';

COMMENT ON COLUMN public.gemini_daily_counter.data IS
  'Data do dia (CURRENT_DATE no momento da chamada). PK.';

COMMENT ON COLUMN public.gemini_daily_counter.total_chamadas IS
  'Soma de chamadas_discovery + chamadas_ranker do dia.';

COMMENT ON COLUMN public.gemini_daily_counter.chamadas_discovery IS
  'Quantas chamadas a Gemini Discovery (C.1) foram feitas hoje.';

COMMENT ON COLUMN public.gemini_daily_counter.chamadas_ranker IS
  'Quantas chamadas a Gemini Ranker (C.2) foram feitas hoje.';

COMMENT ON COLUMN public.gemini_daily_counter.cap_diario IS
  'Cap operacional do dia (default 200). Configurável por dia se necessário.';

-- ---------------------------------------------------------------------
-- 3. RLS (Row Level Security)
-- ---------------------------------------------------------------------
-- Habilita RLS (alinhado com padrão do projeto). Backend usa service_role
-- e bypassa RLS — frontend NÃO consome esta tabela diretamente.

ALTER TABLE public.gemini_daily_counter ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. SELECTs de inspeção
-- ---------------------------------------------------------------------

-- Confirmar que a tabela foi criada
SELECT
  table_name,
  table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'gemini_daily_counter';

-- Confirmar colunas
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gemini_daily_counter'
ORDER BY ordinal_position;

-- Confirmar constraints
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'gemini_daily_counter'
ORDER BY constraint_name;

-- Estado inicial (vazio)
SELECT COUNT(*) AS total_dias_registrados FROM public.gemini_daily_counter;

-- ---------------------------------------------------------------------
-- 5. Decisão final
-- ---------------------------------------------------------------------
-- ⚠️ Para APLICAR de verdade: trocar a linha abaixo de ROLLBACK para COMMIT
ROLLBACK;
-- COMMIT;
