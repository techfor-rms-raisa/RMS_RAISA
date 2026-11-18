-- ═══════════════════════════════════════════════════════════════════════
-- 2026-10-18_vagas_publicadas_01_introspeccao.sql
--
-- MÓDULO: Prospect Engine › Vagas Publicadas (scraper de vagas sem login)
-- ETAPA:  2/6 — Introspecção OBRIGATÓRIA antes de escrever o schema e o
--         cruzamento de território (lib/prospect-vagas/match-crm.ts).
--
-- SOMENTE LEITURA — nenhum bloco altera dados.
--
-- COMO RODAR (Supabase SQL Editor, instância PREVIEW smuikbkjfuggtcmkurqh):
--   O editor executa apenas o texto SELECIONADO. Rode um bloco de cada
--   vez (selecione do "-- ▶ BLOCO N" até o ";" final) e copie o resultado
--   de cada um. Me devolva os 7 resultados (pode ser print ou CSV).
--
-- O QUE CADA BLOCO RESPONDE
--   1. Colunas reais de email_empresas (nome/domínio/dono?) e tipo do id
--   2. Colunas de email_leads que importam para território
--   3. Colunas de prospect_leads que importam para território
--   4. Tipo do id de app_users + perfis existentes
--   5. Constraints/índices de email_empresas (unique dominio? trgm?)
--   6. Extensões disponíveis (pg_trgm / unaccent para match por nome)
--   7. Conflito de nome: já existe algo chamado prospect_vagas*?
--
-- Caminho sugerido no repo: raiz (mesma convenção dos SQLs de 08/2026)
-- ═══════════════════════════════════════════════════════════════════════


-- ▶ BLOCO 1 — email_empresas: todas as colunas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'email_empresas'
ORDER BY ordinal_position;


-- ▶ BLOCO 2 — email_leads: colunas relevantes para território/estado
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'email_leads'
  AND column_name IN (
    'id','empresa_id','prospect_lead_id','nome','email',
    'reservado_por','apto_campanha','vertical','funil_status',
    'opt_out','arquivado','origem','criado_por','criado_em'
  )
ORDER BY ordinal_position;


-- ▶ BLOCO 3 — prospect_leads: colunas relevantes para território/estado
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'prospect_leads'
  AND column_name IN (
    'id','empresa_nome','empresa_dominio','empresa_website',
    'reservado_por','buscado_por','exportado_por','status','motor',
    'criado_em'
  )
ORDER BY ordinal_position;


-- ▶ BLOCO 4 — app_users: tipo do id + perfis em uso
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='app_users' AND column_name='id') AS app_users_id_type,
  tipo_usuario,
  COUNT(*) AS qtd
FROM app_users
GROUP BY tipo_usuario
ORDER BY tipo_usuario;


-- ▶ BLOCO 5 — email_empresas: constraints e índices (unique em dominio? trgm em nome?)
SELECT 'constraint' AS tipo, conname AS nome, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.email_empresas'::regclass
UNION ALL
SELECT 'index', indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'email_empresas'
ORDER BY 1, 2;


-- ▶ BLOCO 6 — extensões para match por nome (fuzzy/sem acento)
SELECT name, installed_version IS NOT NULL AS instalada, default_version
FROM pg_available_extensions
WHERE name IN ('pg_trgm', 'unaccent')
ORDER BY name;


-- ▶ BLOCO 7 — conflito de nomes: já existe objeto prospect_vagas*?
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'prospect_vagas%'
UNION ALL
SELECT routine_name, 'FUNCTION'
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE '%vagas_publicadas%'
ORDER BY 1;
