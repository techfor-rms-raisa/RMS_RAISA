-- ═══════════════════════════════════════════════════════════════════════
-- 2026-11-18_vagas_publicadas_04_seguranca_producao.sql
--
-- MÓDULO: Prospect Engine › Vagas Publicadas — ALINHAMENTO DE SEGURANÇA
-- VERSÃO: 1.0 (18/11/2026) — Claude DBA / Claude Riscos
--
-- MOTIVO: o pós-check de Produção (03) mostrou email_empresas com RLS ATIVO.
--         O 02_schema cria as 3 tabelas novas com RLS DESATIVADO → ficariam
--         abertas para leitura/gravação pela chave pública (anon) do navegador.
--
-- POR QUE É SEGURO: a tela VagasPublicadasPage.tsx só acessa /api/prospect-vagas;
--         o backend (lib/prospect-vagas/vagas-persistencia.ts) usa
--         SUPABASE_SERVICE_ROLE_KEY, que ignora RLS. RLS sem policy = apenas o
--         backend acessa; anon/authenticated ficam bloqueados.
--
-- O QUE FAZ (idempotente):
--   1. Ativa RLS nas 3 tabelas do módulo (sem policies).
--   2. RPC rpc_vagas_match_empresas: execução só para service_role (backend).
--      Evita que a chave pública consulte o território (donos de empresas/leads).
--   3. Recarrega o schema do PostgREST e mostra a verificação.
--
-- COMO RODAR: Supabase (projeto PRODUÇÃO wuejqxijjjdvwighjiiaj) › SQL Editor ›
--             Ctrl+A › Run. Rodar DEPOIS do 02_schema.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. RLS nas tabelas do módulo ─────────────────────────────────────────
ALTER TABLE public.prospect_vagas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_vagas_empresas_salvas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_vagas_busca_log       ENABLE ROW LEVEL SECURITY;

-- ─── 2. RPC: somente o backend (service_role) executa ────────────────────
REVOKE EXECUTE ON FUNCTION public.rpc_vagas_match_empresas(jsonb, real) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_vagas_match_empresas(jsonb, real) TO service_role;

-- ─── 3. Reload do schema cache + verificação ─────────────────────────────
NOTIFY pgrst, 'reload schema';

SELECT c.relname::text AS objeto,
       CASE WHEN c.relrowsecurity THEN 'RLS ativo' ELSE 'RLS DESATIVADO' END AS situacao,
       CASE WHEN c.relrowsecurity THEN '✅' ELSE '❌' END AS status
FROM pg_class c
WHERE c.oid IN (to_regclass('public.prospect_vagas'),
                to_regclass('public.prospect_vagas_empresas_salvas'),
                to_regclass('public.prospect_vagas_busca_log'))
UNION ALL
SELECT 'rpc_vagas_match_empresas · ' || r.papel,
       CASE WHEN has_function_privilege(r.papel, 'public.rpc_vagas_match_empresas(jsonb,real)', 'EXECUTE')
            THEN 'pode executar' ELSE 'bloqueado' END,
       CASE WHEN (r.papel = 'service_role') = has_function_privilege(r.papel, 'public.rpc_vagas_match_empresas(jsonb,real)', 'EXECUTE')
            THEN '✅' ELSE '❌' END
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(papel)
ORDER BY 1;
