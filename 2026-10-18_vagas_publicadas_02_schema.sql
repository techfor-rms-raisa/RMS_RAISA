-- ═══════════════════════════════════════════════════════════════════════
-- 2026-10-18_vagas_publicadas_02_schema.sql
--
-- MÓDULO: Prospect Engine › Vagas Publicadas (scraper de vagas SEM LOGIN)
-- ETAPA:  2/6 — Schema + RPC de cruzamento de território.
-- VERSÃO: 1.0 (18/10/2026) — Messias + Claude DEV / Claude DBA
--
-- BASEADO NA INTROSPECÇÃO DE 18/10/2026 (Preview):
--   • app_users.id            = integer
--   • email_empresas.id       = bigint; possui reservado_por integer +
--                               reservado_em (território no nível da EMPRESA)
--   • prospect_leads.id       = bigint; reservado_por integer;
--                               empresa_nome / empresa_dominio varchar
--   • pg_trgm 1.6 e unaccent 1.1 instaladas
--   • nenhum objeto prospect_vagas* pré-existente
--
-- O QUE CRIA
--   1. f_unaccent()                      — wrapper IMMUTABLE p/ índice
--   2. prospect_vagas                    — cache de vagas capturadas (24h)
--   3. prospect_vagas_empresas_salvas    — empresa salva p/ prospectar
--   4. prospect_vagas_busca_log          — telemetria por busca (saúde fontes)
--   5. índices (inclui trgm em email_empresas.nome — aditivo, IF NOT EXISTS)
--   6. rpc_vagas_match_empresas(jsonb)   — cruzamento set-based (1 roundtrip)
--   7. NOTIFY pgrst + verificação
--
-- LGPD: nenhuma tabela deste módulo armazena dado pessoal. Apenas
--       empresa + vaga + id do analista (app_users) que salvou/buscou.
--
-- COMO RODAR: Supabase SQL Editor → Ctrl+A → Run (script é um bloco só;
--             todos os CREATE usam IF NOT EXISTS / OR REPLACE = idempotente).
--             Rodar em PREVIEW primeiro. Migração ANTES do deploy do código.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. HELPER IMMUTABLE PARA UNACCENT ───────────────────────────────────
-- unaccent() nativo é STABLE e não pode ser usado em índice. Wrapper
-- padrão da comunidade PostgreSQL: fixa o dicionário e marca IMMUTABLE.
CREATE OR REPLACE FUNCTION public.f_unaccent(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', p_text) $$;

-- ─── 2. CACHE DE VAGAS CAPTURADAS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_vagas (
  id                 BIGSERIAL PRIMARY KEY,

  -- identidade na fonte (dedupe natural: 1 vaga = 1 linha)
  fonte              VARCHAR(20) NOT NULL
                     CHECK (fonte IN ('gupy','linkedin','vagascom','programathor')),
  fonte_vaga_id      TEXT        NOT NULL,          -- gupy id / linkedin urn / v2824782 / 33685
  vaga_url           TEXT        NOT NULL,

  -- a vaga
  titulo             TEXT        NOT NULL,
  area               VARCHAR(20) NOT NULL
                     CHECK (area IN ('tecnologia','dados','seguranca','infra','administrativo')),
  keyword_busca      TEXT        NOT NULL,          -- termo que trouxe a vaga
  senioridade        TEXT,
  regime             TEXT,                          -- CLT / PJ / etc (quando a fonte informa)
  stack              TEXT[],                        -- Programathor informa; demais null
  cidade             TEXT,
  uf                 CHAR(2),
  modalidade         VARCHAR(12)
                     CHECK (modalidade IS NULL OR modalidade IN ('remoto','hibrido','presencial')),
  publicado_em       DATE,

  -- a empresa (como veio da fonte + normalização)
  empresa_nome       TEXT,                          -- NULL = confidencial
  empresa_nome_norm  TEXT,                          -- lower + sem acento + sem sufixo legal (gerado no TS)
  empresa_slug       TEXT,                          -- subdomínio Gupy / slug company LinkedIn
  empresa_url        TEXT,                          -- página da empresa na fonte
  empresa_dominio    TEXT,                          -- preenchido ao salvar (resolve-dominio) ou se a fonte expõe
  confidencial       BOOLEAN     NOT NULL DEFAULT false,

  -- ciclo de vida do cache
  capturado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),   -- 1ª vez vista
  ultima_captura_em  TIMESTAMPTZ NOT NULL DEFAULT now(),   -- última vez vista (refresh)
  ativa              BOOLEAN     NOT NULL DEFAULT true,    -- false quando sumir da fonte (Fase 2)

  CONSTRAINT prospect_vagas_fonte_id_unique UNIQUE (fonte, fonte_vaga_id)
);

COMMENT ON TABLE public.prospect_vagas IS
  'Vagas Publicadas — cache 24h das vagas capturadas em fontes públicas sem login (Gupy API, LinkedIn Jobs guest, Vagas.com, Programathor). Sem dado pessoal.';

-- ─── 3. EMPRESAS SALVAS PARA PROSPECTAR ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospect_vagas_empresas_salvas (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_nome       TEXT        NOT NULL,
  empresa_nome_norm  TEXT        NOT NULL,
  empresa_dominio    TEXT,
  empresa_url        TEXT,

  -- vínculos
  email_empresa_id   BIGINT      REFERENCES public.email_empresas(id) ON DELETE SET NULL,
  vaga_origem_id     BIGINT      REFERENCES public.prospect_vagas(id)  ON DELETE SET NULL,

  -- território: quem salvou é o dono
  salvo_por          INTEGER     NOT NULL REFERENCES public.app_users(id),
  salvo_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao         TEXT,
  status             VARCHAR(15) NOT NULL DEFAULT 'salva'
                     CHECK (status IN ('salva','prospectando','descartada')),

  -- uma empresa só pode ser salva uma vez (o dono é salvo_por)
  CONSTRAINT prospect_vagas_empresas_salvas_norm_unique UNIQUE (empresa_nome_norm)
);

COMMENT ON TABLE public.prospect_vagas_empresas_salvas IS
  'Empresas marcadas "Salvar p/ prospectar" na tela Vagas Publicadas. salvo_por = analista dono (território). Espelhada em email_empresas (origem=vagas_publicadas).';

-- ─── 4. LOG DE BUSCAS (saúde das fontes + telemetria p/ Consumo) ─────────
CREATE TABLE IF NOT EXISTS public.prospect_vagas_busca_log (
  id                    BIGSERIAL PRIMARY KEY,
  buscado_por           INTEGER     NOT NULL REFERENCES public.app_users(id),
  areas                 TEXT[]      NOT NULL,
  keyword_extra         TEXT,
  uf                    CHAR(2),
  modalidade            VARCHAR(12),
  periodo_dias          INTEGER,
  fontes                TEXT[]      NOT NULL,
  resultados_por_fonte  JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- {"gupy":{"ok":true,"qtd":100,"ms":1100},...}
  total_vagas           INTEGER     NOT NULL DEFAULT 0,
  total_empresas        INTEGER     NOT NULL DEFAULT 0,
  cache_hit             BOOLEAN     NOT NULL DEFAULT false,
  duracao_ms            INTEGER,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. ÍNDICES ──────────────────────────────────────────────────────────
-- prospect_vagas: filtros da tela
CREATE INDEX IF NOT EXISTS idx_prospect_vagas_area_pub
  ON public.prospect_vagas (area, publicado_em DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_vagas_ultima_captura
  ON public.prospect_vagas (ultima_captura_em DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_vagas_uf_modalidade
  ON public.prospect_vagas (uf, modalidade);
CREATE INDEX IF NOT EXISTS idx_prospect_vagas_nome_norm_trgm
  ON public.prospect_vagas USING gin (empresa_nome_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_prospect_vagas_dominio
  ON public.prospect_vagas (empresa_dominio) WHERE empresa_dominio IS NOT NULL;

-- empresas salvas
CREATE INDEX IF NOT EXISTS idx_pv_empresas_salvas_salvo_por
  ON public.prospect_vagas_empresas_salvas (salvo_por, status);

-- log
CREATE INDEX IF NOT EXISTS idx_pv_busca_log_user_data
  ON public.prospect_vagas_busca_log (buscado_por, criado_em DESC);

-- email_empresas / prospect_leads: índices ADITIVOS para o match por nome.
-- Não alteram colunas nem constraints existentes.
CREATE INDEX IF NOT EXISTS idx_email_empresas_nome_norm_trgm
  ON public.email_empresas USING gin (lower(public.f_unaccent(nome)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_email_empresas_dominio_lower
  ON public.email_empresas (lower(dominio)) WHERE dominio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospect_leads_empresa_nome_norm
  ON public.prospect_leads (lower(public.f_unaccent(empresa_nome)))
  WHERE empresa_nome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospect_leads_empresa_dominio_lower
  ON public.prospect_leads (lower(empresa_dominio)) WHERE empresa_dominio IS NOT NULL;

-- ─── 6. RPC: CRUZAMENTO DE TERRITÓRIO (set-based, 1 roundtrip) ───────────
-- Entrada: jsonb array [{ "idx": 0, "nome": "Stefanini Group", "dominio": "stefanini.com" | null }, ...]
-- Saída:   jsonb array, 1 item por idx:
--   {
--     "idx": 0,
--     "empresa": { "id", "nome", "dominio", "reservado_por", "reservado_por_nome",
--                  "total_leads", "score", "match_por": "dominio"|"nome" } | null,
--     "donos_leads":     [{ "user_id", "nome_usuario", "qtd" }],   -- email_leads da empresa
--     "donos_prospects": [{ "user_id", "nome_usuario", "qtd" }],   -- prospect_leads por nome/domínio
--     "salva": { "id", "salvo_por", "salvo_por_nome", "status" } | null
--   }
-- A decisão nova/outro/você é tomada no TS com o currentUser.id (Admin vê tudo).
-- RETURNS jsonb (não TABLE) — regra do projeto: evita limite 1000 do PostgREST.
DROP FUNCTION IF EXISTS public.rpc_vagas_match_empresas(jsonb, real);
CREATE OR REPLACE FUNCTION public.rpc_vagas_match_empresas(
  p_itens      jsonb,
  p_threshold  real DEFAULT 0.55
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
WITH itens AS (
  SELECT (e->>'idx')::int                                   AS idx,
         lower(public.f_unaccent(coalesce(e->>'nome','')))  AS nome_norm,
         nullif(lower(trim(e->>'dominio')), '')             AS dominio
  FROM jsonb_array_elements(p_itens) e
  WHERE coalesce(e->>'nome','') <> ''
),
-- melhor empresa em email_empresas por item (domínio exato vence; senão trigram)
emp_cand AS (
  SELECT i.idx, ee.id, ee.nome, ee.dominio, ee.reservado_por, ee.total_leads,
         CASE
           WHEN i.dominio IS NOT NULL AND lower(ee.dominio) = i.dominio THEN 1.0::real
           ELSE similarity(lower(public.f_unaccent(ee.nome)), i.nome_norm)
         END AS score,
         CASE
           WHEN i.dominio IS NOT NULL AND lower(ee.dominio) = i.dominio THEN 'dominio'
           ELSE 'nome'
         END AS match_por
  FROM itens i
  JOIN public.email_empresas ee
    ON (i.dominio IS NOT NULL AND lower(ee.dominio) = i.dominio)
    OR similarity(lower(public.f_unaccent(ee.nome)), i.nome_norm) >= p_threshold
),
emp AS (
  SELECT DISTINCT ON (idx) *
  FROM emp_cand
  ORDER BY idx, score DESC, total_leads DESC NULLS LAST, id
),
-- donos dos email_leads vinculados à empresa casada
donos_leads AS (
  SELECT e.idx, el.reservado_por AS user_id, au.nome_usuario, count(*)::int AS qtd
  FROM emp e
  JOIN public.email_leads el ON el.empresa_id = e.id AND el.reservado_por IS NOT NULL
  LEFT JOIN public.app_users au ON au.id = el.reservado_por
  GROUP BY e.idx, el.reservado_por, au.nome_usuario
),
-- donos em prospect_leads (por domínio ou nome normalizado igual)
donos_prospects AS (
  SELECT i.idx, pl.reservado_por AS user_id, au.nome_usuario, count(*)::int AS qtd
  FROM itens i
  JOIN public.prospect_leads pl
    ON pl.reservado_por IS NOT NULL
   AND coalesce(pl.status,'') NOT IN ('descartado')
   AND (
        (i.dominio IS NOT NULL AND lower(pl.empresa_dominio) = i.dominio)
     OR (pl.empresa_nome IS NOT NULL AND lower(public.f_unaccent(pl.empresa_nome)) = i.nome_norm)
   )
  LEFT JOIN public.app_users au ON au.id = pl.reservado_por
  GROUP BY i.idx, pl.reservado_por, au.nome_usuario
),
-- já salva na própria tela?
salva AS (
  SELECT i.idx, s.id, s.salvo_por, au.nome_usuario AS salvo_por_nome, s.status
  FROM itens i
  JOIN public.prospect_vagas_empresas_salvas s ON s.empresa_nome_norm = i.nome_norm
  LEFT JOIN public.app_users au ON au.id = s.salvo_por
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'idx', i.idx,
  'empresa', (
    SELECT jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'dominio', e.dominio,
      'reservado_por', e.reservado_por,
      'reservado_por_nome', (SELECT nome_usuario FROM public.app_users WHERE id = e.reservado_por),
      'total_leads', e.total_leads,
      'score', round(e.score::numeric, 2), 'match_por', e.match_por)
    FROM emp e WHERE e.idx = i.idx
  ),
  'donos_leads', coalesce((
    SELECT jsonb_agg(jsonb_build_object('user_id', d.user_id, 'nome_usuario', d.nome_usuario, 'qtd', d.qtd) ORDER BY d.qtd DESC)
    FROM donos_leads d WHERE d.idx = i.idx), '[]'::jsonb),
  'donos_prospects', coalesce((
    SELECT jsonb_agg(jsonb_build_object('user_id', d.user_id, 'nome_usuario', d.nome_usuario, 'qtd', d.qtd) ORDER BY d.qtd DESC)
    FROM donos_prospects d WHERE d.idx = i.idx), '[]'::jsonb),
  'salva', (
    SELECT jsonb_build_object('id', s.id, 'salvo_por', s.salvo_por, 'salvo_por_nome', s.salvo_por_nome, 'status', s.status)
    FROM salva s WHERE s.idx = i.idx LIMIT 1
  )
) ORDER BY i.idx), '[]'::jsonb)
FROM itens i;
$$;

COMMENT ON FUNCTION public.rpc_vagas_match_empresas(jsonb, real) IS
  'Vagas Publicadas — cruza empresas capturadas com email_empresas (domínio exato ou trigram >= threshold), donos em email_leads/prospect_leads e empresas já salvas. 1 roundtrip por busca.';

-- ─── 7. RELOAD DO SCHEMA CACHE + VERIFICAÇÃO ─────────────────────────────
NOTIFY pgrst, 'reload schema';

-- Verificação (deve listar 3 tabelas + 2 funções + testar o RPC):
SELECT 'tabela' AS tipo, table_name AS nome
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'prospect_vagas%'
UNION ALL
SELECT 'funcao', routine_name
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN ('f_unaccent','rpc_vagas_match_empresas')
ORDER BY 1, 2;

-- Teste funcional do RPC (empresas de exemplo — troque por nomes que existem na sua base):
SELECT jsonb_pretty(public.rpc_vagas_match_empresas(
  '[{"idx":0,"nome":"Stefanini","dominio":null},
    {"idx":1,"nome":"Wipro","dominio":"wipro.com"},
    {"idx":2,"nome":"Empresa Inexistente XYZ","dominio":null}]'::jsonb
));
