-- ═══════════════════════════════════════════════════════════════════
-- 2026-08-10_email_leads_arquivamento.sql
-- Caminho: sql/2026-08-10_email_leads_arquivamento.sql
--
-- ARQUIVAMENTO DE LEADS (soft-delete irreversível pela interface)
--
-- Contexto: a Base de Leads não tinha como remover um cadastro feito por
-- engano. A única saída era o Opt-Out — semanticamente errado: opt-out é
-- manifestação de vontade do TITULAR (LGPD), não faxina de cadastro do
-- operador.
--
-- Decisão de produto (Messias, 10/08/2026): o registro PERMANECE em
-- email_leads. É justamente isso que faz a deduplicação por e-mail de
-- `importar_prospects` continuar bloqueando a reentrada do endereço.
--
-- Pareado com: api/crm-leads.ts v1.30, api/crm-campanhas.ts v1.17
--
-- ⚠️ APLICAR NO BANCO ANTES DO DEPLOY DO CÓDIGO.
--    O código novo escreve nestas colunas; o código antigo as ignora.
--    Portanto: migration primeiro, deploy depois — nunca o inverso.
--
-- ⚠️ Supabase SQL Editor executa APENAS O TEXTO SELECIONADO.
--    Rode um BLOCO POR VEZ, na ordem, ou dê Ctrl+A antes de executar.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 1 — INTROSPECÇÃO PRÉVIA (somente leitura, não altera nada)
-- Esperado ANTES da migration: 0 linhas.
-- ═══════════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'email_leads'
  AND column_name LIKE 'arquivado%'
ORDER BY ordinal_position;


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 2 — COLUNAS
--
-- Quarteto flag/timestamp/autor/motivo, mesmo formato já usado por
-- opt_out (+_em), bounced (+_em, _motivo) e apto_campanha (+_em, _por).
--
-- `arquivado_por` é TEXT (não FK para usuários) por consistência com
-- criado_por e apto_campanha_por, que guardam nome_usuario. Trocar o
-- padrão só nesta coluna criaria uma exceção a explicar para sempre.
--
-- NOT NULL DEFAULT false em `arquivado`: garante que todo lead existente
-- fique explicitamente não-arquivado, sem NULLs de três valores para o
-- código tratar. As demais colunas são NULL enquanto o lead estiver ativo.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.email_leads
  ADD COLUMN IF NOT EXISTS arquivado        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arquivado_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arquivado_por    TEXT,
  ADD COLUMN IF NOT EXISTS arquivado_motivo TEXT;


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 3 — CHECK CONSTRAINT DO MOTIVO
--
-- Whitelist fechada. Espelhada em DOIS outros lugares:
--   • objeto MOTIVOS_ARQUIVAMENTO da action `arquivar_lead`
--   • constante MOTIVOS_ARQUIVAMENTO do ArquivarLeadModal.tsx
-- Alterar em um só produz 400 (backend) ou 23514 (banco).
--
-- Fechado de propósito: texto livre viraria lixo não-agregável, e a
-- pergunta "por que N leads foram arquivados neste mês?" precisa ter
-- resposta. Idempotente via pg_constraint.
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname  = 'email_leads_arquivado_motivo_check'
      AND conrelid = 'public.email_leads'::regclass
  ) THEN
    ALTER TABLE public.email_leads
      ADD CONSTRAINT email_leads_arquivado_motivo_check
      CHECK (
        arquivado_motivo IS NULL
        OR arquivado_motivo IN (
          'duplicado',
          'fora_icp',
          'dados_incorretos',
          'saiu_da_empresa',
          'outro'
        )
      );
    RAISE NOTICE 'Constraint email_leads_arquivado_motivo_check criada.';
  ELSE
    RAISE NOTICE 'Constraint email_leads_arquivado_motivo_check já existia — nada a fazer.';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 4 — ÍNDICE PARCIAL
--
-- Deliberadamente APENAS sobre arquivado = true.
--
-- Um índice sobre `arquivado` inteiro seria inútil: praticamente todas as
-- linhas terão false, seletividade péssima, e o planner ignoraria. O que
-- vale indexar é o subconjunto pequeno — auditorias do tipo "o que foi
-- arquivado e por quem" varrem só ele.
--
-- As listagens (que filtram arquivado <> true) continuam usando os
-- índices já existentes de empresa_id / reservado_por / funil_status.
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_email_leads_arquivados
  ON public.email_leads (arquivado_em DESC)
  WHERE arquivado = true;


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 5 — DOCUMENTAÇÃO NO PRÓPRIO SCHEMA
-- ═══════════════════════════════════════════════════════════════════
COMMENT ON COLUMN public.email_leads.arquivado IS
  'Soft-delete de cadastro (10/08/2026). Lead some de TODA a UI mas o '
  'registro permanece — é o que bloqueia reimportação do mesmo e-mail. '
  'NÃO confundir com opt_out: aquele é vontade do titular (LGPD), este é '
  'faxina de cadastro pelo operador. Irreversível pela interface.';

COMMENT ON COLUMN public.email_leads.arquivado_em IS
  'Timestamp do arquivamento. NULL enquanto o lead estiver ativo.';

COMMENT ON COLUMN public.email_leads.arquivado_por IS
  'nome_usuario de quem arquivou (mesmo padrão de criado_por).';

COMMENT ON COLUMN public.email_leads.arquivado_motivo IS
  'Whitelist: duplicado | fora_icp | dados_incorretos | saiu_da_empresa | '
  'outro. Espelhada no backend e no modal.';


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 6 — RECARGA DO CACHE DE SCHEMA DO POSTGREST
-- Sem isso, o PostgREST pode responder 404/400 para as colunas novas
-- até o próximo restart.
-- ═══════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 7 — VERIFICAÇÃO PÓS-APLICAÇÃO
-- Esperado: 4 linhas (arquivado, arquivado_em, arquivado_por,
--           arquivado_motivo) e total_arquivados = 0.
-- ═══════════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'email_leads'
  AND column_name LIKE 'arquivado%'
ORDER BY ordinal_position;

SELECT
  count(*)                                        AS total_leads,
  count(*) FILTER (WHERE arquivado)               AS total_arquivados,
  count(*) FILTER (WHERE NOT arquivado)           AS total_ativos
FROM public.email_leads;


-- ═══════════════════════════════════════════════════════════════════
-- BLOCO 8 — DIAGNÓSTICO (somente leitura)
--
-- A action grava uma linha em email_lead_historico com
-- tipo = 'lead_arquivado'. Se essa tabela tiver uma CHECK constraint
-- restringindo `tipo`, o INSERT falharia.
--
-- Esperado: 0 linhas (nenhuma CHECK sobre `tipo`) → nada a fazer.
-- Se retornar alguma linha, me envie o resultado: a constraint precisa
-- ser estendida antes do deploy.
--
-- Observação: mesmo que falhasse, o arquivamento NÃO é perdido — a
-- action trata o histórico como best-effort e apenas loga um warning.
-- Só a trilha de auditoria daquele evento ficaria ausente.
-- ═══════════════════════════════════════════════════════════════════
SELECT con.conname, pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
WHERE c.relname = 'email_lead_historico'
  AND con.contype = 'c'
  AND pg_get_constraintdef(con.oid) ILIKE '%tipo%';
