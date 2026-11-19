-- ════════════════════════════════════════════════════════════════════════
-- 2026-11-19_linkedin_empresas_01_diagnostico.sql
-- Coluna "LinkedIn" na Base de Leads › Minhas Empresas — DIAGNÓSTICO
--
-- SOMENTE LEITURA (apenas SELECT). Não altera nada.
-- Rodar em PRODUÇÃO (wuejqxijjjdvwighjiiaj) — é onde estão as empresas
-- salvas pelos analistas via Vagas Publicadas.
--
-- Como rodar no Supabase SQL Editor: selecione UM bloco por vez
-- (do comentário "BLOCO n" até o ponto-e-vírgula) e clique em Run.
-- Devolva o resultado dos 3 blocos.
--
-- Versão: 1.0 — 19/11/2026
-- ════════════════════════════════════════════════════════════════════════


-- ─── BLOCO 1 — Confirma as colunas usadas (Regra 15) ────────────────────
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
        (table_name = 'email_empresas'
           AND column_name IN ('id','nome','dominio','linkedin_url','origem','reservado_por'))
     OR (table_name = 'prospect_vagas_empresas_salvas'
           AND column_name IN ('id','empresa_nome','empresa_nome_norm','empresa_url','email_empresa_id','salvo_em'))
     OR (table_name = 'prospect_vagas'
           AND column_name IN ('fonte','empresa_nome_norm','empresa_url','ultima_captura_em'))
      )
ORDER BY table_name, column_name;


-- ─── BLOCO 2 — Quantas empresas já têm LinkedIn, por origem ─────────────
SELECT COALESCE(origem, '(sem origem)')                                        AS origem,
       COUNT(*)                                                                AS empresas,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(linkedin_url), '') IS NOT NULL)      AS com_linkedin,
       COUNT(*) FILTER (WHERE NULLIF(TRIM(linkedin_url), '') IS NULL)          AS sem_linkedin
FROM public.email_empresas
GROUP BY 1
ORDER BY empresas DESC;


-- ─── BLOCO 3 — Empresas salvas em Vagas Publicadas: situação do LinkedIn ─
--   ok           → email_empresas.linkedin_url já preenchido (vai aparecer "Perfil")
--   recuperavel  → vazio, mas existe URL do LinkedIn na vaga salva ou em
--                  outra vaga da mesma empresa capturada do LinkedIn Jobs
--   sem_fonte    → vazio e sem URL do LinkedIn em lugar nenhum (vai aparecer "Buscar")
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
       e.linkedin_url               AS linkedin_atual,
       s.empresa_url                AS url_da_vaga_salva,
       li.linkedin_outra_vaga,
       CASE
         WHEN NULLIF(TRIM(e.linkedin_url), '') IS NOT NULL                   THEN 'ok'
         WHEN s.empresa_url ILIKE '%linkedin.com/company/%'
           OR li.linkedin_outra_vaga IS NOT NULL                             THEN 'recuperavel'
         ELSE 'sem_fonte'
       END                          AS situacao,
       s.salvo_em
FROM public.prospect_vagas_empresas_salvas s
LEFT JOIN public.email_empresas e ON e.id = s.email_empresa_id
LEFT JOIN li                      ON li.empresa_nome_norm = s.empresa_nome_norm
ORDER BY situacao, s.empresa_nome;
