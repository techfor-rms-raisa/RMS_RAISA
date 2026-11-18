-- ═══════════════════════════════════════════════════════════════════════
-- 2026-11-18_vagas_publicadas_03_poscheck_producao.sql
--
-- MÓDULO: Prospect Engine › Vagas Publicadas — VERIFICAÇÃO PÓS-CRIAÇÃO
-- VERSÃO: 1.0 (18/11/2026) — Claude DBA
--
-- OBJETIVO: confirmar no banco de PRODUÇÃO que TUDO o que o
--           2026-10-18_vagas_publicadas_02_schema.sql cria existe e está igual
--           ao que o código (lib/prospect-vagas + api/prospect-vagas.ts) usa:
--           3 tabelas · 48 colunas · constraints (inclui os nomes das FKs usados
--           nos joins da tela) · 11 índices · 2 funções · extensões ·
--           teste funcional do RPC com dados reais · RLS/privilégios · volume.
--
-- SOMENTE LEITURA: não cria, não altera e não apaga nada. Os testes funcionais
--                  só executam o que existir (não dá erro se faltar algo).
--
-- COMO RODAR: Supabase (projeto PRODUÇÃO wuejqxijjjdvwighjiiaj) › SQL Editor ›
--             Ctrl+A › Run. Uma única consulta → um único resultado.
--             A 1ª linha (RESUMO) diz se está tudo OK.
--
-- STATUS: ✅ ok · ❌ problema · ⚠️ atenção · ℹ️ informativo
-- ═══════════════════════════════════════════════════════════════════════

WITH
esperado_tabelas (tabela) AS (
  VALUES ('prospect_vagas'), ('prospect_vagas_empresas_salvas'), ('prospect_vagas_busca_log')
),
esperado_colunas (tabela, coluna, tipo) AS (
  VALUES
    -- prospect_vagas
    ('prospect_vagas', 'id', 'bigint'),
    ('prospect_vagas', 'fonte', 'character varying'),
    ('prospect_vagas', 'fonte_vaga_id', 'text'),
    ('prospect_vagas', 'vaga_url', 'text'),
    ('prospect_vagas', 'titulo', 'text'),
    ('prospect_vagas', 'area', 'character varying'),
    ('prospect_vagas', 'keyword_busca', 'text'),
    ('prospect_vagas', 'senioridade', 'text'),
    ('prospect_vagas', 'regime', 'text'),
    ('prospect_vagas', 'stack', 'ARRAY'),
    ('prospect_vagas', 'cidade', 'text'),
    ('prospect_vagas', 'uf', 'character'),
    ('prospect_vagas', 'modalidade', 'character varying'),
    ('prospect_vagas', 'publicado_em', 'date'),
    ('prospect_vagas', 'empresa_nome', 'text'),
    ('prospect_vagas', 'empresa_nome_norm', 'text'),
    ('prospect_vagas', 'empresa_slug', 'text'),
    ('prospect_vagas', 'empresa_url', 'text'),
    ('prospect_vagas', 'empresa_dominio', 'text'),
    ('prospect_vagas', 'confidencial', 'boolean'),
    ('prospect_vagas', 'capturado_em', 'timestamp with time zone'),
    ('prospect_vagas', 'ultima_captura_em', 'timestamp with time zone'),
    ('prospect_vagas', 'ativa', 'boolean'),
    -- prospect_vagas_busca_log
    ('prospect_vagas_busca_log', 'id', 'bigint'),
    ('prospect_vagas_busca_log', 'buscado_por', 'integer'),
    ('prospect_vagas_busca_log', 'areas', 'ARRAY'),
    ('prospect_vagas_busca_log', 'keyword_extra', 'text'),
    ('prospect_vagas_busca_log', 'uf', 'character'),
    ('prospect_vagas_busca_log', 'modalidade', 'character varying'),
    ('prospect_vagas_busca_log', 'periodo_dias', 'integer'),
    ('prospect_vagas_busca_log', 'fontes', 'ARRAY'),
    ('prospect_vagas_busca_log', 'resultados_por_fonte', 'jsonb'),
    ('prospect_vagas_busca_log', 'total_vagas', 'integer'),
    ('prospect_vagas_busca_log', 'total_empresas', 'integer'),
    ('prospect_vagas_busca_log', 'cache_hit', 'boolean'),
    ('prospect_vagas_busca_log', 'duracao_ms', 'integer'),
    ('prospect_vagas_busca_log', 'criado_em', 'timestamp with time zone'),
    -- prospect_vagas_empresas_salvas
    ('prospect_vagas_empresas_salvas', 'id', 'bigint'),
    ('prospect_vagas_empresas_salvas', 'empresa_nome', 'text'),
    ('prospect_vagas_empresas_salvas', 'empresa_nome_norm', 'text'),
    ('prospect_vagas_empresas_salvas', 'empresa_dominio', 'text'),
    ('prospect_vagas_empresas_salvas', 'empresa_url', 'text'),
    ('prospect_vagas_empresas_salvas', 'email_empresa_id', 'bigint'),
    ('prospect_vagas_empresas_salvas', 'vaga_origem_id', 'bigint'),
    ('prospect_vagas_empresas_salvas', 'salvo_por', 'integer'),
    ('prospect_vagas_empresas_salvas', 'salvo_em', 'timestamp with time zone'),
    ('prospect_vagas_empresas_salvas', 'observacao', 'text'),
    ('prospect_vagas_empresas_salvas', 'status', 'character varying')
),
-- contem = trechos que precisam aparecer na definição da constraint
esperado_constraints (tabela, nome, tipo, contem) AS (
  VALUES
    ('prospect_vagas', 'prospect_vagas_pkey',             'p', ARRAY['id']),
    ('prospect_vagas', 'prospect_vagas_fonte_id_unique',  'u', ARRAY['fonte', 'fonte_vaga_id']),
    ('prospect_vagas', 'prospect_vagas_fonte_check',      'c', ARRAY['gupy', 'linkedin', 'vagascom', 'programathor']),
    ('prospect_vagas', 'prospect_vagas_area_check',       'c', ARRAY['tecnologia', 'dados', 'seguranca', 'infra', 'administrativo']),
    ('prospect_vagas', 'prospect_vagas_modalidade_check', 'c', ARRAY['remoto', 'hibrido', 'presencial']),
    ('prospect_vagas_empresas_salvas', 'prospect_vagas_empresas_salvas_pkey',                 'p', ARRAY['id']),
    ('prospect_vagas_empresas_salvas', 'prospect_vagas_empresas_salvas_norm_unique',          'u', ARRAY['empresa_nome_norm']),
    ('prospect_vagas_empresas_salvas', 'prospect_vagas_empresas_salvas_status_check',         'c', ARRAY['salva', 'prospectando', 'descartada']),
    ('prospect_vagas_empresas_salvas', 'prospect_vagas_empresas_salvas_email_empresa_id_fkey','f', ARRAY['email_empresas']),
    -- os 2 nomes abaixo são usados literalmente pela tela (embed do PostgREST em listarSalvas)
    ('prospect_vagas_empresas_salvas', 'prospect_vagas_empresas_salvas_vaga_origem_id_fkey',  'f', ARRAY['prospect_vagas']),
    ('prospect_vagas_empresas_salvas', 'prospect_vagas_empresas_salvas_salvo_por_fkey',       'f', ARRAY['app_users']),
    ('prospect_vagas_busca_log', 'prospect_vagas_busca_log_pkey',             'p', ARRAY['id']),
    ('prospect_vagas_busca_log', 'prospect_vagas_busca_log_buscado_por_fkey', 'f', ARRAY['app_users'])
),
esperado_indices (tabela, nome) AS (
  VALUES
    ('prospect_vagas',                 'idx_prospect_vagas_area_pub'),
    ('prospect_vagas',                 'idx_prospect_vagas_ultima_captura'),
    ('prospect_vagas',                 'idx_prospect_vagas_uf_modalidade'),
    ('prospect_vagas',                 'idx_prospect_vagas_nome_norm_trgm'),
    ('prospect_vagas',                 'idx_prospect_vagas_dominio'),
    ('prospect_vagas_empresas_salvas', 'idx_pv_empresas_salvas_salvo_por'),
    ('prospect_vagas_busca_log',       'idx_pv_busca_log_user_data'),
    ('email_empresas',                 'idx_email_empresas_nome_norm_trgm'),
    ('email_empresas',                 'idx_email_empresas_dominio_lower'),
    ('prospect_leads',                 'idx_prospect_leads_empresa_nome_norm'),
    ('prospect_leads',                 'idx_prospect_leads_empresa_dominio_lower')
),
esperado_funcoes (assinatura, retorno, volatilidade) AS (
  VALUES
    ('public.f_unaccent(text)',                     'text',  'i'),
    ('public.rpc_vagas_match_empresas(jsonb,real)', 'jsonb', 's')
),
-- Testes funcionais via SQL dinâmico (query_to_xml): só executam se a função existir,
-- assim a consulta nunca quebra quando algo está faltando.
testes AS (
  SELECT
    CASE WHEN to_regprocedure('public.f_unaccent(text)') IS NOT NULL THEN
      (xpath('/row/r/text()', query_to_xml(
        $q$SELECT public.f_unaccent('Ação Técnica São João') AS r$q$, false, true, '')))[1]::text
    END AS unaccent_resultado,
    CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NOT NULL THEN
      (xpath('/row/r/text()', query_to_xml(
        $q$SELECT public.rpc_vagas_match_empresas('[]'::jsonb)::text AS r$q$, false, true, '')))[1]::text
    END AS rpc_vazio,
    CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NOT NULL THEN
      (xpath('/row/r/text()', query_to_xml(
        $q$SELECT (public.rpc_vagas_match_empresas(
                    '[{"idx":0,"nome":"Empresa Inexistente Teste XYZ 999","dominio":null}]'::jsonb
                  ) -> 0 -> 'empresa')::text AS r$q$, true, true, '')))[1]::text
    END AS rpc_inexistente,
    CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NOT NULL THEN
      (xpath('/row/r/text()', query_to_xml(
        $q$SELECT e.nome || ' · ' || e.dominio || ' → ' ||
                  CASE WHEN lower(public.rpc_vagas_match_empresas(
                         jsonb_build_array(jsonb_build_object('idx', 0, 'nome', e.nome, 'dominio', e.dominio))
                       ) -> 0 -> 'empresa' ->> 'dominio') = lower(e.dominio)
                       THEN 'encontrou' ELSE 'NAO encontrou' END AS r
           FROM public.email_empresas e
           WHERE e.dominio IS NOT NULL AND coalesce(e.nome, '') <> ''
           ORDER BY e.id
           LIMIT 1$q$, false, true, '')))[1]::text
    END AS rpc_empresa_real
),
checks AS (
  -- 1) Tabelas
  SELECT 1 AS ordem, 'tabela'::text AS item, t.tabela::text AS nome,
         CASE WHEN to_regclass('public.' || t.tabela) IS NULL THEN '— NÃO EXISTE —' ELSE 'existe' END::text AS detalhe,
         CASE WHEN to_regclass('public.' || t.tabela) IS NULL THEN '❌ FALTA' ELSE '✅' END::text AS status
  FROM esperado_tabelas t

  UNION ALL
  -- 2) Colunas e tipos
  SELECT 2, 'coluna', c.tabela || '.' || c.coluna,
         CASE WHEN ic.column_name IS NULL THEN '— NÃO EXISTE —'
              WHEN ic.data_type <> c.tipo THEN ic.data_type || ' (esperado: ' || c.tipo || ')'
              ELSE ic.data_type END,
         CASE WHEN ic.column_name IS NULL THEN '❌ FALTA'
              WHEN ic.data_type <> c.tipo THEN '❌ TIPO DIFERENTE'
              ELSE '✅' END
  FROM esperado_colunas c
  LEFT JOIN information_schema.columns ic
         ON ic.table_schema = 'public' AND ic.table_name = c.tabela AND ic.column_name = c.coluna

  UNION ALL
  -- 3) Constraints (PK, UNIQUE, CHECK com os valores aceitos, FKs com os nomes usados pela tela)
  SELECT 3, 'constraint', ec.nome,
         coalesce(pg_get_constraintdef(con.oid), '— NÃO EXISTE —'),
         CASE WHEN con.oid IS NULL THEN '❌ FALTA'
              WHEN con.contype::text <> ec.tipo THEN '❌ TIPO DIFERENTE'
              WHEN EXISTS (SELECT 1 FROM unnest(ec.contem) x
                           WHERE pg_get_constraintdef(con.oid) NOT ILIKE '%' || x || '%')
                   THEN '❌ DEFINIÇÃO DIFERENTE'
              ELSE '✅' END
  FROM esperado_constraints ec
  LEFT JOIN pg_constraint con
         ON con.conname = ec.nome
        AND con.conrelid = to_regclass('public.' || ec.tabela)

  UNION ALL
  -- 4) Índices (existência + válido)
  SELECT 4, 'índice', ei.nome,
         CASE WHEN ix.indexrelid IS NULL THEN '— NÃO EXISTE —'
              ELSE 'em ' || ei.tabela || CASE WHEN ix.indisvalid THEN '' ELSE ' (INVÁLIDO)' END END,
         CASE WHEN ix.indexrelid IS NULL THEN '❌ FALTA'
              WHEN NOT ix.indisvalid THEN '❌ INVÁLIDO'
              ELSE '✅' END
  FROM esperado_indices ei
  LEFT JOIN pg_index ix ON ix.indexrelid = to_regclass('public.' || ei.nome)

  UNION ALL
  -- 5) Funções (assinatura, retorno, volatilidade)
  SELECT 5, 'função', ef.assinatura,
         CASE WHEN p.oid IS NULL THEN '— NÃO EXISTE —'
              ELSE 'retorna ' || pg_get_function_result(p.oid) || ' · ' ||
                   CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END END,
         CASE WHEN p.oid IS NULL THEN '❌ FALTA'
              WHEN pg_get_function_result(p.oid) <> ef.retorno THEN '❌ RETORNO DIFERENTE'
              WHEN p.provolatile::text <> ef.volatilidade THEN '❌ VOLATILIDADE DIFERENTE'
              ELSE '✅' END
  FROM esperado_funcoes ef
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(ef.assinatura)

  UNION ALL
  -- 6) Extensões
  SELECT 6, 'extensão', e.ext,
         coalesce('schema ' || n.nspname || ' · v' || x.extversion, '— NÃO INSTALADA —'),
         CASE WHEN x.extname IS NULL THEN '❌ FALTA'
              WHEN e.ext = 'unaccent' AND n.nspname <> 'public' THEN '⚠️ fora do schema public'
              ELSE '✅' END
  FROM (VALUES ('unaccent'), ('pg_trgm')) AS e(ext)
  LEFT JOIN pg_extension x ON x.extname = e.ext
  LEFT JOIN pg_namespace n ON n.oid = x.extnamespace

  UNION ALL
  -- 7) email_empresas.origem aceita 'vagas_publicadas' (gravado ao "Salvar p/ prospectar")
  SELECT 7, 'origem empresa', 'email_empresas.origem',
         coalesce(string_agg(pg_get_constraintdef(con.oid), ' | '), 'sem CHECK em origem (aceita qualquer valor)'),
         CASE WHEN bool_or(pg_get_constraintdef(con.oid) NOT ILIKE '%vagas_publicadas%')
              THEN '❌ não aceita vagas_publicadas' ELSE '✅' END
  FROM pg_constraint con
  WHERE con.conrelid = to_regclass('public.email_empresas')
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%origem%'

  UNION ALL
  -- 8) Testes funcionais (dados reais, somente leitura)
  SELECT 8, 'teste', 'f_unaccent(''Ação Técnica São João'')',
         coalesce(t.unaccent_resultado, '— função ausente —'),
         CASE WHEN t.unaccent_resultado = 'Acao Tecnica Sao Joao' THEN '✅' ELSE '❌ FALHOU' END
  FROM testes t
  UNION ALL
  SELECT 8, 'teste', 'rpc com lista vazia',
         coalesce(t.rpc_vazio, '— função ausente —'),
         CASE WHEN t.rpc_vazio = '[]' THEN '✅' ELSE '❌ FALHOU' END
  FROM testes t
  UNION ALL
  SELECT 8, 'teste', 'rpc com empresa inexistente',
         CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NULL THEN '— função ausente —'
              ELSE 'empresa = ' || coalesce(t.rpc_inexistente, 'null') END,
         CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NULL THEN '❌ FALHOU'
              WHEN t.rpc_inexistente IS NULL OR t.rpc_inexistente = 'null' THEN '✅'
              ELSE '❌ FALHOU' END
  FROM testes t
  UNION ALL
  SELECT 8, 'teste', 'rpc com empresa real (por domínio)',
         coalesce(t.rpc_empresa_real,
                  CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NULL
                       THEN '— função ausente —' ELSE 'nenhuma empresa com domínio para testar' END),
         CASE WHEN to_regprocedure('public.rpc_vagas_match_empresas(jsonb,real)') IS NULL THEN '❌ FALHOU'
              WHEN t.rpc_empresa_real IS NULL THEN 'ℹ️'
              WHEN t.rpc_empresa_real LIKE '%→ encontrou' THEN '✅'
              ELSE '❌ FALHOU' END
  FROM testes t

  UNION ALL
  -- 9) Segurança: RLS e acesso da chave pública (anon), comparado ao padrão de email_empresas
  SELECT 9, 'segurança', c.relname::text,
         'RLS ' || CASE WHEN c.relrowsecurity THEN 'ativo' ELSE 'desativado' END || ' · anon: ' ||
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN 'n/a'
              WHEN has_table_privilege('anon', c.oid, 'INSERT') THEN 'lê e grava'
              WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'só lê'
              ELSE 'sem acesso' END,
         CASE WHEN c.relname = 'email_empresas' THEN 'ℹ️ referência (padrão atual)'
              WHEN c.relrowsecurity = ref.relrowsecurity THEN 'ℹ️ mesmo padrão de email_empresas'
              ELSE '⚠️ diferente de email_empresas' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_class ref ON ref.oid = to_regclass('public.email_empresas')
  WHERE c.relkind = 'r'
    AND c.relname IN ('prospect_vagas', 'prospect_vagas_empresas_salvas', 'prospect_vagas_busca_log', 'email_empresas')

  UNION ALL
  -- 10) Volume atual (informativo)
  SELECT 10, 'volume', t.tabela::text,
         CASE WHEN to_regclass('public.' || t.tabela) IS NULL THEN '— tabela ausente —'
              ELSE (xpath('/row/n/text()', query_to_xml(
                     format('SELECT count(*) AS n FROM public.%I', t.tabela), false, true, '')))[1]::text || ' linha(s)'
         END,
         'ℹ️'
  FROM esperado_tabelas t
)
SELECT 0 AS ordem, 'RESUMO' AS item,
       count(*) FILTER (WHERE status LIKE '✅%') || ' ✅ · ' ||
       count(*) FILTER (WHERE status LIKE '❌%') || ' ❌ · ' ||
       count(*) FILTER (WHERE status LIKE '⚠️%') || ' ⚠️ · ' ||
       count(*) FILTER (WHERE status LIKE 'ℹ️%') || ' ℹ️' AS nome,
       'total de verificações: ' || count(*) AS detalhe,
       CASE WHEN count(*) FILTER (WHERE status LIKE '❌%') > 0 THEN '❌ HÁ PROBLEMAS — ver linhas ❌'
            WHEN count(*) FILTER (WHERE status LIKE '⚠️%') > 0 THEN '⚠️ OK COM ATENÇÃO — ver linhas ⚠️'
            ELSE '✅ TUDO OK' END AS status
FROM checks
UNION ALL
SELECT ordem, item, nome, detalhe, status FROM checks
ORDER BY 1, 3;
