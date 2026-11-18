-- ═══════════════════════════════════════════════════════════════════════
-- 2026-11-18_vagas_publicadas_00_precheck_producao.sql
--
-- MÓDULO: Prospect Engine › Vagas Publicadas — PROMOÇÃO PARA PRODUÇÃO
-- VERSÃO: 1.0 (18/11/2026) — Claude DBA
--
-- OBJETIVO: confirmar, no banco de PRODUÇÃO (wuejqxijjjdvwighjiiaj), tudo de que
--           2026-10-18_vagas_publicadas_02_schema.sql e o código dependem.
--           O schema foi validado só no PREVIEW, que está defasado de Produção.
--
-- SOMENTE LEITURA: não cria, não altera e não apaga nada.
--
-- COMO RODAR: Supabase (projeto PRODUÇÃO) › SQL Editor › Ctrl+A › Run.
--             Uma única consulta → um único resultado.
--
-- LEITURA DO RESULTADO (coluna status):
--   ✅  ok
--   ℹ️  informativo (não bloqueia)
--   ❌ / ⚠️  NÃO rodar o 02_schema — enviar o resultado ao Claude antes.
-- ═══════════════════════════════════════════════════════════════════════

WITH colunas_necessarias (tabela, coluna) AS (
  VALUES
    -- usuário / RBAC / território
    ('app_users',      'id'),
    ('app_users',      'nome_usuario'),
    ('app_users',      'tipo_usuario'),
    -- empresa (match + "Salvar p/ prospectar")
    ('email_empresas', 'id'),
    ('email_empresas', 'nome'),
    ('email_empresas', 'dominio'),
    ('email_empresas', 'website'),
    ('email_empresas', 'linkedin_url'),
    ('email_empresas', 'origem'),
    ('email_empresas', 'observacoes'),
    ('email_empresas', 'criado_por'),
    ('email_empresas', 'reservado_por'),
    ('email_empresas', 'reservado_em'),
    ('email_empresas', 'atualizado_em'),
    ('email_empresas', 'total_leads'),
    -- donos dos leads da empresa
    ('email_leads',    'empresa_id'),
    ('email_leads',    'reservado_por'),
    -- donos em prospects
    ('prospect_leads', 'reservado_por'),
    ('prospect_leads', 'status'),
    ('prospect_leads', 'empresa_nome'),
    ('prospect_leads', 'empresa_dominio')
)
-- 1) Colunas usadas pelo RPC e pelo backend
SELECT 1 AS ordem,
       'coluna'::text AS item,
       c.tabela || '.' || c.coluna AS nome,
       coalesce(ic.data_type, '— NÃO EXISTE —')::text AS detalhe,
       CASE WHEN ic.column_name IS NULL THEN '❌ FALTA' ELSE '✅' END AS status
FROM colunas_necessarias c
LEFT JOIN information_schema.columns ic
       ON ic.table_schema = 'public'
      AND ic.table_name   = c.tabela
      AND ic.column_name  = c.coluna

UNION ALL
-- 2) Extensões: o 02_schema chama public.unaccent(...) e usa gin_trgm_ops/similarity()
SELECT 2,
       'extensão',
       e.ext,
       coalesce('schema ' || n.nspname || ' · v' || x.extversion, '— NÃO INSTALADA —'),
       CASE
         WHEN x.extname IS NULL                              THEN '❌ FALTA'
         WHEN e.ext = 'unaccent' AND n.nspname <> 'public'   THEN '⚠️ fora do schema public'
         ELSE '✅'
       END
FROM (VALUES ('unaccent'), ('pg_trgm')) AS e(ext)
LEFT JOIN pg_extension  x ON x.extname = e.ext
LEFT JOIN pg_namespace  n ON n.oid = x.extnamespace

UNION ALL
-- 3) Constraints de email_empresas: CHECK em "origem" precisa aceitar 'vagas_publicadas'
SELECT 3,
       CASE con.contype WHEN 'c' THEN 'check' WHEN 'u' THEN 'unique' ELSE con.contype::text END,
       con.conname::text,
       pg_get_constraintdef(con.oid),
       CASE
         WHEN con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%origem%'
          AND pg_get_constraintdef(con.oid) NOT ILIKE '%vagas_publicadas%'
           THEN '❌ origem não aceita vagas_publicadas'
         ELSE 'ℹ️'
       END
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.email_empresas')
  AND con.contype IN ('c', 'u')

UNION ALL
-- 4) Objetos do módulo que porventura já existam (o 02_schema é idempotente)
SELECT 4,
       'já existe',
       c.relname::text,
       CASE c.relkind WHEN 'r' THEN 'tabela' WHEN 'i' THEN 'índice' ELSE c.relkind::text END,
       'ℹ️ ok (script idempotente)'
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'prospect\_vagas%'

ORDER BY 1, 3;
