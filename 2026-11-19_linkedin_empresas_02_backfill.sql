-- ════════════════════════════════════════════════════════════════════════
-- 2026-11-19_linkedin_empresas_02_backfill.sql
-- Coluna "LinkedIn" na Base de Leads — BACKFILL das empresas já salvas
--
-- O que faz: preenche email_empresas.linkedin_url das empresas salvas em
-- Vagas Publicadas que ficaram SEM o link porque já existiam na base antes
-- de serem salvas (bug corrigido em vagas-persistencia.ts v1.1).
-- Diagnóstico de 19/11/2026 (Produção): 1 caso recuperável — XP Inc. (#1169).
--
-- Segurança:
--   • Só preenche linkedin_url VAZIO — nunca sobrescreve um valor existente.
--   • Só usa URL de página de empresa do LinkedIn (linkedin.com/company/…)
--     vinda da própria vaga salva ou de outra vaga LinkedIn da mesma empresa.
--   • Idempotente: rodar de novo não muda nada.
--
-- Onde rodar: PRODUÇÃO (wuejqxijjjdvwighjiiaj). Pode rodar no Preview
-- também (sem efeito se não houver casos).
-- Como rodar no Supabase SQL Editor: selecione UM bloco por vez (do
-- comentário "BLOCO n" até o ponto-e-vírgula) e clique em Run.
--   BLOCO 1 → confere colunas      BLOCO 2 → prévia (o que vai mudar)
--   BLOCO 3 → aplica               BLOCO 4 → confere o resultado
--
-- Versão: 1.0 — 19/11/2026
-- ════════════════════════════════════════════════════════════════════════


-- ─── BLOCO 1 — Confirma as colunas que o UPDATE usa (Regra 15) ──────────
--   Esperado: 2 linhas (email_empresas.linkedin_url e email_empresas.atualizado_em)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'email_empresas'
  AND column_name IN ('linkedin_url', 'atualizado_em')
ORDER BY column_name;


-- ─── BLOCO 2 — PRÉVIA: empresas que serão preenchidas (não altera nada) ──
--   Esperado hoje: 1 linha — XP Inc. (#1169) → https://br.linkedin.com/company/xpinc
WITH li AS (
  SELECT DISTINCT ON (empresa_nome_norm)
         empresa_nome_norm,
         empresa_url
  FROM public.prospect_vagas
  WHERE fonte = 'linkedin'
    AND empresa_url ILIKE '%linkedin.com/company/%'
    AND empresa_nome_norm IS NOT NULL
  ORDER BY empresa_nome_norm, ultima_captura_em DESC
),
alvo AS (
  SELECT DISTINCT ON (s.email_empresa_id)
         s.email_empresa_id,
         CASE WHEN s.empresa_url ILIKE '%linkedin.com/company/%'
              THEN s.empresa_url
              ELSE li.empresa_url
         END AS linkedin_novo
  FROM public.prospect_vagas_empresas_salvas s
  LEFT JOIN li ON li.empresa_nome_norm = s.empresa_nome_norm
  WHERE s.email_empresa_id IS NOT NULL
    AND (s.empresa_url ILIKE '%linkedin.com/company/%' OR li.empresa_url IS NOT NULL)
  ORDER BY s.email_empresa_id, s.salvo_em DESC
)
SELECT e.id, e.nome, e.linkedin_url AS linkedin_atual, a.linkedin_novo
FROM public.email_empresas e
JOIN alvo a ON a.email_empresa_id = e.id
WHERE NULLIF(TRIM(e.linkedin_url), '') IS NULL
ORDER BY e.nome;


-- ─── BLOCO 3 — APLICA (só rode depois de conferir a prévia do Bloco 2) ──
--   Devolve as linhas alteradas. Esperado hoje: 1 linha (XP Inc.).
WITH li AS (
  SELECT DISTINCT ON (empresa_nome_norm)
         empresa_nome_norm,
         empresa_url
  FROM public.prospect_vagas
  WHERE fonte = 'linkedin'
    AND empresa_url ILIKE '%linkedin.com/company/%'
    AND empresa_nome_norm IS NOT NULL
  ORDER BY empresa_nome_norm, ultima_captura_em DESC
),
alvo AS (
  SELECT DISTINCT ON (s.email_empresa_id)
         s.email_empresa_id,
         CASE WHEN s.empresa_url ILIKE '%linkedin.com/company/%'
              THEN s.empresa_url
              ELSE li.empresa_url
         END AS linkedin_novo
  FROM public.prospect_vagas_empresas_salvas s
  LEFT JOIN li ON li.empresa_nome_norm = s.empresa_nome_norm
  WHERE s.email_empresa_id IS NOT NULL
    AND (s.empresa_url ILIKE '%linkedin.com/company/%' OR li.empresa_url IS NOT NULL)
  ORDER BY s.email_empresa_id, s.salvo_em DESC
)
UPDATE public.email_empresas e
SET linkedin_url  = a.linkedin_novo,
    atualizado_em = now()
FROM alvo a
WHERE e.id = a.email_empresa_id
  AND NULLIF(TRIM(e.linkedin_url), '') IS NULL
RETURNING e.id, e.nome, e.linkedin_url;


-- ─── BLOCO 4 — Confere: situação de todas as empresas salvas ────────────
--   Esperado: nenhuma linha com situacao = 'recuperavel'.
--   'sem_fonte' (ex.: Econverse, Vivo Digital) é esperado: a vaga não veio
--   do LinkedIn → na tela aparece "Buscar"; o analista cola o perfil no Editar.
WITH li AS (
  SELECT DISTINCT ON (empresa_nome_norm)
         empresa_nome_norm,
         empresa_url AS linkedin_outra_vaga
  FROM public.prospect_vagas
  WHERE fonte = 'linkedin'
    AND empresa_url ILIKE '%linkedin.com/company/%'
    AND empresa_nome_norm IS NOT NULL
  ORDER BY empresa_nome_norm, ultima_captura_em DESC
)
SELECT s.empresa_nome,
       s.email_empresa_id,
       e.linkedin_url AS linkedin_atual,
       CASE
         WHEN NULLIF(TRIM(e.linkedin_url), '') IS NOT NULL                   THEN 'ok'
         WHEN s.empresa_url ILIKE '%linkedin.com/company/%'
           OR li.linkedin_outra_vaga IS NOT NULL                             THEN 'recuperavel'
         ELSE 'sem_fonte'
       END            AS situacao
FROM public.prospect_vagas_empresas_salvas s
LEFT JOIN public.email_empresas e ON e.id = s.email_empresa_id
LEFT JOIN li                      ON li.empresa_nome_norm = s.empresa_nome_norm
ORDER BY situacao, s.empresa_nome;
