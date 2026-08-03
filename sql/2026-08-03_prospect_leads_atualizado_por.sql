-- ============================================================================
-- 2026-08-03_prospect_leads_atualizado_por.sql
--
-- Objetivo: dar rastreabilidade ao CRUD do prospect (aba "Meus Prospects
--           Salvos" do Prospect Engine v2.2).
--
-- Contexto: a tabela prospect_leads já possui `atualizado_em`
--           (timestamptz DEFAULT now()), mas NÃO possui a coluna que
--           registra QUEM alterou. Sem ela, uma correção de email ou de
--           empresa fica anônima — e edição de dado que alimenta disparo
--           de campanha precisa de autoria.
--
-- Semântica: `atualizado_por` é campo de AUTORIA da última alteração
--            manual. Diferente de `reservado_por` (posse/atribuição, que
--            pode ser reatribuída), a autoria é um fato histórico e só é
--            sobrescrita por uma nova edição manual.
--
-- Ambiente:  aplicar primeiro em PREVIEW (smuikbkjfuggtcmkurqh),
--            depois em PRODUCTION (wuejqxijjjdvwighjiiaj).
--
-- Como rodar no Supabase SQL Editor:
--   Selecione TODO o conteúdo (Ctrl+A) e execute. São statements
--   auto-commit independentes e idempotentes — rodar 2x não quebra.
-- ============================================================================

-- ── 1. Coluna de autoria ────────────────────────────────────────────────────
ALTER TABLE public.prospect_leads
    ADD COLUMN IF NOT EXISTS atualizado_por integer;

COMMENT ON COLUMN public.prospect_leads.atualizado_por IS
    'app_users.id do usuário que fez a última alteração manual do cadastro '
    '(edição via aba "Meus Prospects Salvos" ou descarte/restauração lógica). '
    'NULL = registro nunca editado manualmente.';

-- ── 2. Chave estrangeira (mesmo padrão das demais FKs de usuário) ───────────
--    ON DELETE SET NULL: se o usuário for removido, o prospect permanece.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname  = 'prospect_leads_atualizado_por_fkey'
          AND conrelid = 'public.prospect_leads'::regclass
    ) THEN
        ALTER TABLE public.prospect_leads
            ADD CONSTRAINT prospect_leads_atualizado_por_fkey
            FOREIGN KEY (atualizado_por)
            REFERENCES public.app_users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- ── 3. Recarregar o cache de schema do PostgREST ────────────────────────────
--    Obrigatório: sem isso a API retorna erro de coluna inexistente
--    até o cache expirar sozinho.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO (rode isolado após o script acima)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'prospect_leads'
--   AND column_name IN ('atualizado_em', 'atualizado_por');
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.prospect_leads'::regclass
--   AND conname  = 'prospect_leads_atualizado_por_fkey';
--
-- Resultado esperado:
--   atualizado_em  | timestamp with time zone | YES
--   atualizado_por | integer                  | YES
--   prospect_leads_atualizado_por_fkey | FOREIGN KEY (atualizado_por)
--       REFERENCES app_users(id) ON DELETE SET NULL
-- ============================================================================
