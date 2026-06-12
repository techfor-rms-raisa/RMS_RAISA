-- =====================================================================
-- MIGRATION: email_padroes_empresa
-- Data: 12/06/2026
-- Fase 1 (F4) — Email Recovery Pipeline (Fundação)
--
-- Objetivo: tabela de aprendizado dos padrões de e-mail por domínio.
-- Auto-enriquecida pelo Recovery Pipeline a cada validação positiva via Snov.io.
-- Consultada pelo webhook de bounce para decidir entre:
--   - confianca >= 3 → AUTO-recovery (1 chamada Snov.io com o padrão estável)
--   - confianca <  3 → fila MANUAL (analista decide rodar os 32 padrões)
--
-- Alinhada com api/_utils/email-patterns.ts:
--   - template  ↔ BASE_TEMPLATES[].id  (ex: 'nome.sobrenome', 'nsobrenome')
--   - extensao  ↔ Extensao             ('.com' ou '.com.br')
--
-- =====================================================================
-- 🟡 PADRÃO DE REVIEW DO PROJETO:
-- Para REVISAR antes de aplicar, troque o último "COMMIT;" por "ROLLBACK;".
-- Os SELECTs de inspeção mostram o estado. Após validar, troque de volta para
-- "COMMIT;" e re-execute.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tabela principal
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_padroes_empresa (
  id             BIGSERIAL PRIMARY KEY,
  dominio        TEXT NOT NULL,                       -- base do domínio sem TLD (ex: 'riachuelo')
  template       TEXT NOT NULL,                       -- id do template alinhado com email-patterns.ts
  extensao       TEXT NOT NULL,                       -- '.com' ou '.com.br'
  confianca      INTEGER NOT NULL DEFAULT 1,          -- # de validações positivas deste padrão neste domínio
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT email_padroes_empresa_unico
    UNIQUE (dominio, template, extensao),
  CONSTRAINT email_padroes_empresa_confianca_positiva
    CHECK (confianca >= 1),
  CONSTRAINT email_padroes_empresa_extensao_valida
    CHECK (extensao IN ('.com', '.com.br'))
);

-- ---------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------

-- Lookup principal do webhook: "qual padrão estável para o domínio X?"
-- Ordenação por confianca DESC permite pegar o mais confiável primeiro.
CREATE INDEX IF NOT EXISTS idx_email_padroes_empresa_dominio_confianca
  ON public.email_padroes_empresa (dominio, confianca DESC);

-- Índice parcial dos padrões "estáveis" (confianca >= 3) — usado em
-- consultas frequentes do webhook para decidir AUTO vs MANUAL.
CREATE INDEX IF NOT EXISTS idx_email_padroes_empresa_estaveis
  ON public.email_padroes_empresa (dominio)
  WHERE confianca >= 3;

-- ---------------------------------------------------------------------
-- 3. Trigger: atualizado_em automático em UPDATE
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_email_padroes_empresa_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_padroes_empresa_atualizado_em
  ON public.email_padroes_empresa;

CREATE TRIGGER trg_email_padroes_empresa_atualizado_em
  BEFORE UPDATE ON public.email_padroes_empresa
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_email_padroes_empresa_atualizado_em();

-- ---------------------------------------------------------------------
-- 4. Comentários (documentação inline da tabela e colunas)
-- ---------------------------------------------------------------------

COMMENT ON TABLE public.email_padroes_empresa IS
  'Aprendizado dos padrões de e-mail por domínio. Auto-enriquecida pelo Recovery Pipeline a cada validação positiva via Snov.io. Threshold de "estabilidade": confianca >= 3.';

COMMENT ON COLUMN public.email_padroes_empresa.dominio IS
  'Base do domínio sem extensão TLD. Ex: "riachuelo" extraído de "riachuelo.com.br". Gerado por extrairBaseDominio() em api/_utils/email-patterns.ts.';

COMMENT ON COLUMN public.email_padroes_empresa.template IS
  'ID do template do padrão. Valores válidos em BASE_TEMPLATES[].id de api/_utils/email-patterns.ts (ex: "nome.sobrenome", "nsobrenome", "iniciais").';

COMMENT ON COLUMN public.email_padroes_empresa.extensao IS
  'Extensão TLD aplicada: ".com" ou ".com.br".';

COMMENT ON COLUMN public.email_padroes_empresa.confianca IS
  'Contador de validações positivas deste padrão neste domínio. >= 3 considera "estável" → AUTO-recovery; < 3 → fila MANUAL. Threshold tunável.';

-- ---------------------------------------------------------------------
-- 5. RLS (Row Level Security)
-- ---------------------------------------------------------------------
-- Tabela técnica de aprendizado, sem PII direto (apenas domínios públicos).
-- Acesso via service_role apenas (chamadas server-side em api/_utils/*).
-- Negar acesso de usuários autenticados por padrão.

ALTER TABLE public.email_padroes_empresa ENABLE ROW LEVEL SECURITY;

-- Sem policies criadas = acesso negado para clients autenticados.
-- service_role bypassa RLS por padrão no Supabase.

-- ---------------------------------------------------------------------
-- 6. Validação rápida (queries de inspeção, não-destrutivas)
-- ---------------------------------------------------------------------

SELECT
  'TABELA CRIADA' AS status,
  COUNT(*) AS total_padroes,
  pg_size_pretty(pg_total_relation_size('public.email_padroes_empresa')) AS tamanho_disco
FROM public.email_padroes_empresa;

SELECT
  'INDICES' AS status,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_indexes
JOIN pg_class ON pg_class.relname = indexname
WHERE schemaname = 'public'
  AND tablename = 'email_padroes_empresa'
ORDER BY indexname;

SELECT
  'TRIGGERS' AS status,
  trigger_name,
  event_manipulation AS evento,
  action_timing AS momento
FROM information_schema.triggers
WHERE event_object_table = 'email_padroes_empresa'
ORDER BY trigger_name;

-- ---------------------------------------------------------------------
-- 7. Commit final
-- ---------------------------------------------------------------------
-- Trocar para ROLLBACK ao revisar; voltar a COMMIT após validar SELECTs acima.

COMMIT;
