-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION: Módulo Espionagem Estratégica — Schema v1.0
-- Data: 2026-08-07 | Sessão 2 | Claude DBA
-- Aplicar em: PREVIEW (smuikbkjfuggtcmkurqh) primeiro; PRODUCTION no release
-- Idempotente: pode ser reexecutada sem efeitos colaterais
-- Uso: Supabase SQL Editor — executar UM bloco por vez (selecionar → Run)
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — TABELAS + ÍNDICES
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS espionagem_concorrentes (
  id             BIGSERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  website        TEXT,
  dominio        TEXT,
  origem         TEXT NOT NULL DEFAULT 'manual',      -- manual | auto
  status         TEXT NOT NULL DEFAULT 'ativo',       -- ativo | arquivado
  criado_por     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_esp_concorrentes_nome
  ON espionagem_concorrentes (lower(nome));

CREATE TABLE IF NOT EXISTS espionagem_concorrente_clientes (
  id                 BIGSERIAL PRIMARY KEY,
  concorrente_id     BIGINT NOT NULL REFERENCES espionagem_concorrentes(id) ON DELETE CASCADE,
  nome               TEXT NOT NULL,
  dominios           TEXT[] NOT NULL DEFAULT '{}',    -- variantes: {pine.com, pine.com.br}
  chave_busca        TEXT,                            -- termo p/ match por nome no Prospect Engine
                                                      -- (ex.: 'Santander' p/ achar 'Santander Banespa');
                                                      -- NULL = usa o próprio nome
  origem_descoberta  TEXT NOT NULL DEFAULT 'manual',  -- manual | gemini | site
  descoberto_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ativo              BOOLEAN NOT NULL DEFAULT true,   -- exclusão lógica
  criado_por         TEXT
);

CREATE INDEX IF NOT EXISTS ix_esp_clientes_concorrente
  ON espionagem_concorrente_clientes (concorrente_id) WHERE ativo;

CREATE UNIQUE INDEX IF NOT EXISTS ux_esp_clientes_conc_nome
  ON espionagem_concorrente_clientes (concorrente_id, lower(nome));

CREATE TABLE IF NOT EXISTS espionagem_analises (
  id                  BIGSERIAL PRIMARY KEY,
  concorrente_id      BIGINT NOT NULL REFERENCES espionagem_concorrentes(id) ON DELETE CASCADE,
  executado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  executado_por       TEXT,
  resultado           JSONB NOT NULL,                 -- snapshot completo (clientes + totais + delta)
  total_prospectados  INTEGER NOT NULL DEFAULT 0,
  total_leads_crm     INTEGER NOT NULL DEFAULT 0,
  total_campanhas     INTEGER NOT NULL DEFAULT 0,
  total_abordagens    INTEGER NOT NULL DEFAULT 0,
  cobertura_pct       NUMERIC(5,1) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_esp_analises_conc
  ON espionagem_analises (concorrente_id, executado_em DESC);


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — RPC DO MOTOR DE CRUZAMENTO
--
-- RETURNS jsonb (jsonb_agg) — bypassa o limite de 1.000 linhas do PostgREST.
-- Fontes: email_leads (domínio do e-mail OU empresa vinculada),
--         prospect_leads (domínio, e-mail ou nome da empresa; exclui 'descartado'),
--         email_lead_campanhas, email_fila (enviado_em IS NOT NULL),
--         email_respostas.
-- Lições incorporadas (07/08/2026): domínios variantes por cliente;
--   e-mails pessoais contam como prospectados (flag email_corporativo separa);
--   totais deduplicados por conjunto DISTINCT (lead em 2 clientes não dobra).
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS espionagem_analisar_concorrente(BIGINT);

CREATE OR REPLACE FUNCTION espionagem_analisar_concorrente(p_concorrente_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH clientes AS (
  SELECT
    id,
    nome,
    coalesce(
      (SELECT array_agg(lower(trim(d))) FROM unnest(coalesce(dominios, '{}')) AS d WHERE trim(d) <> ''),
      '{}'::text[]
    ) AS dominios,
    coalesce(nullif(trim(chave_busca), ''), nome) AS chave,
    descoberto_em
  FROM espionagem_concorrente_clientes
  WHERE concorrente_id = p_concorrente_id
    AND ativo
),

-- Leads do CRM: domínio do e-mail OU empresa vinculada com domínio do cliente
leads_crm AS (
  SELECT DISTINCT c.id AS cliente_id, l.id AS lead_id
  FROM clientes c
  JOIN email_leads l
    ON split_part(lower(l.email), '@', 2) = ANY(c.dominios)
    OR l.empresa_id IN (
         SELECT e.id FROM email_empresas e
         WHERE lower(coalesce(e.dominio, '')) = ANY(c.dominios)
       )
),

-- Prospect Engine: domínio, e-mail OU nome da empresa (chave); exclui descartados
prospects AS (
  SELECT DISTINCT
    c.id AS cliente_id,
    p.id AS prospect_id,
    (split_part(lower(coalesce(p.email, '')), '@', 2) = ANY(c.dominios)) AS email_corporativo
  FROM clientes c
  JOIN prospect_leads p
    ON ( lower(coalesce(p.empresa_dominio, '')) = ANY(c.dominios)
      OR split_part(lower(coalesce(p.email, '')), '@', 2) = ANY(c.dominios)
      OR (length(c.chave) >= 4 AND coalesce(p.empresa_nome, '') ILIKE '%' || c.chave || '%') )
  WHERE coalesce(p.status, '') <> 'descartado'
),

vinc AS (
  SELECT
    lc.cliente_id,
    COUNT(DISTINCT lc.lead_id) FILTER (WHERE v.lead_id IS NOT NULL) AS leads_em_campanha,
    COUNT(DISTINCT v.campanha_id)                                   AS campanhas
  FROM leads_crm lc
  LEFT JOIN email_lead_campanhas v ON v.lead_id = lc.lead_id
  GROUP BY lc.cliente_id
),

abord AS (
  SELECT lc.cliente_id, COUNT(*) AS abordagens, MAX(f.enviado_em) AS ultima_abordagem_em
  FROM leads_crm lc
  JOIN email_fila f ON f.lead_id = lc.lead_id AND f.enviado_em IS NOT NULL
  GROUP BY lc.cliente_id
),

resp AS (
  SELECT lc.cliente_id, COUNT(*) AS respostas
  FROM leads_crm lc
  JOIN email_respostas r ON r.lead_id = lc.lead_id
  GROUP BY lc.cliente_id
),

crm_cnt AS (
  SELECT cliente_id, COUNT(DISTINCT lead_id) AS leads_crm
  FROM leads_crm GROUP BY cliente_id
),

pros_cnt AS (
  SELECT
    cliente_id,
    COUNT(DISTINCT prospect_id)                                    AS prospectados,
    COUNT(DISTINCT prospect_id) FILTER (WHERE email_corporativo)   AS prospectados_corp
  FROM prospects GROUP BY cliente_id
),

por_cliente AS (
  SELECT
    c.id                                   AS cliente_id,
    c.nome,
    c.dominios,
    c.descoberto_em,
    coalesce(p.prospectados, 0)            AS prospectados,
    coalesce(p.prospectados_corp, 0)       AS prospectados_corp,
    coalesce(cc.leads_crm, 0)              AS leads_crm,
    coalesce(v.leads_em_campanha, 0)       AS leads_em_campanha,
    coalesce(v.campanhas, 0)               AS campanhas,
    coalesce(a.abordagens, 0)              AS abordagens,
    a.ultima_abordagem_em,
    coalesce(r.respostas, 0)               AS respostas,
    (coalesce(a.abordagens, 0) > 0
      AND a.ultima_abordagem_em < now() - interval '90 days') AS frio_90d
  FROM clientes c
  LEFT JOIN pros_cnt p ON p.cliente_id = c.id
  LEFT JOIN crm_cnt  cc ON cc.cliente_id = c.id
  LEFT JOIN vinc     v  ON v.cliente_id = c.id
  LEFT JOIN abord    a  ON a.cliente_id = c.id
  LEFT JOIN resp     r  ON r.cliente_id = c.id
)

SELECT jsonb_build_object(
  'clientes',
    coalesce(
      (SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.prospectados DESC, pc.leads_crm DESC, pc.nome)
       FROM por_cliente pc),
      '[]'::jsonb
    ),
  'totais', jsonb_build_object(
    'clientes',            (SELECT COUNT(*) FROM clientes),
    'prospectados',        (SELECT COUNT(DISTINCT prospect_id) FROM prospects),
    'leads_crm',           (SELECT COUNT(DISTINCT lead_id) FROM leads_crm),
    'campanhas',           (SELECT COUNT(DISTINCT v.campanha_id)
                              FROM (SELECT DISTINCT lead_id FROM leads_crm) lc
                              JOIN email_lead_campanhas v ON v.lead_id = lc.lead_id),
    'abordagens',          (SELECT COUNT(*)
                              FROM email_fila f
                             WHERE f.enviado_em IS NOT NULL
                               AND f.lead_id IN (SELECT DISTINCT lead_id FROM leads_crm)),
    'respostas',           (SELECT COUNT(*)
                              FROM email_respostas r
                             WHERE r.lead_id IN (SELECT DISTINCT lead_id FROM leads_crm)),
    'contas_com_presenca', (SELECT COUNT(*) FROM por_cliente WHERE prospectados > 0 OR leads_crm > 0),
    'cobertura_pct',
      CASE WHEN (SELECT COUNT(*) FROM clientes) = 0 THEN 0
           ELSE round(
             100.0 * (SELECT COUNT(*) FROM por_cliente WHERE prospectados > 0 OR leads_crm > 0)
                   / (SELECT COUNT(*) FROM clientes), 1)
      END
  )
);
$$;


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — RELOAD DO CACHE DO POSTGREST (obrigatório após criar a RPC)
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 4 (OPCIONAL) — SMOKE TEST
-- Cria um concorrente de teste, roda a análise e mostra o jsonb.
-- Reaproveita o exercício Talentfour de hoje. Rode e depois avalie o retorno.
-- ════════════════════════════════════════════════════════════════════════
-- INSERT INTO espionagem_concorrentes (nome, website, dominio, criado_por)
-- VALUES ('Talentfour', 'https://talentfour.com.br', 'talentfour.com.br', 'smoke-test')
-- ON CONFLICT DO NOTHING;
--
-- INSERT INTO espionagem_concorrente_clientes (concorrente_id, nome, dominios, chave_busca, criado_por)
-- SELECT c.id, v.nome, v.dominios, v.chave, 'smoke-test'
-- FROM espionagem_concorrentes c,
-- (VALUES
--   ('Banco Pine',   ARRAY['pine.com','pine.com.br'], 'Pine'),
--   ('Mapfre Seguros', ARRAY['mapfre.com.br'], 'Mapfre'),
--   ('CVC Corp',     ARRAY['cvccorp.com.br','cvc.com.br'], 'Cvc')
-- ) AS v(nome, dominios, chave)
-- WHERE lower(c.nome) = 'talentfour'
-- ON CONFLICT DO NOTHING;
--
-- SELECT jsonb_pretty(espionagem_analisar_concorrente(
--   (SELECT id FROM espionagem_concorrentes WHERE lower(nome) = 'talentfour')
-- ));
