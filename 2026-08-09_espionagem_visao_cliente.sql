-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION: Espionagem Estratégica — Visão Cliente × Concorrentes
-- Data: 2026-08-09 | Sessão 6 | Claude DBA
--
-- Operação INVERSA da espionagem: dado um CLIENTE (empresa canônica),
-- retorna suas métricas canônicas (mesmo motor v4: dominio_map + equi-joins
-- hasheáveis + match de siglas \y) e o mapa de CONCORRENTES que o possuem
-- na carteira. 100% interno — sem Gemini.
--
-- Pré-requisito: 2026-08-09_espionagem_empresa_canonica.sql (schema v2)
--                + 2026-08-09_espionagem_rpc_v4_performance.sql
-- Aplicar em: PREVIEW (smuikbkjfuggtcmkurqh) primeiro; PRODUCTION no release
-- Idempotente. Uso: SQL Editor — UM bloco por vez (selecionar → Run).
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — RPC: LISTAR EMPRESAS (seletor da Visão Cliente)
-- Só empresas com ao menos 1 vínculo ativo em concorrente não-arquivado.
-- RETURNS jsonb — bypassa o limite de 1.000 linhas do PostgREST.
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS espionagem_listar_empresas();

CREATE OR REPLACE FUNCTION espionagem_listar_empresas()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.nome), '[]'::jsonb)
FROM (
  SELECT
    e.id,
    e.nome,
    e.dominios,
    e.chave_busca,
    (SELECT COUNT(*)
       FROM espionagem_concorrente_clientes cc
       JOIN espionagem_concorrentes co ON co.id = cc.concorrente_id
      WHERE cc.empresa_id = e.id
        AND cc.ativo
        AND co.status <> 'arquivado') AS num_concorrentes
  FROM espionagem_empresas e
) x
WHERE x.num_concorrentes > 0;
$$;


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — RPC: ANALISAR EMPRESA (motor inverso)
-- Métricas canônicas de UMA empresa (padrão de performance v4) +
-- concorrentes que a possuem na carteira (vínculo ativo, não-arquivados).
-- Retorno: { empresa: {...}|null, concorrentes: [...], total_concorrentes }
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS espionagem_analisar_empresa(BIGINT);

CREATE OR REPLACE FUNCTION espionagem_analisar_empresa(p_empresa_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH emp AS (
  SELECT
    id,
    nome,
    coalesce(
      (SELECT array_agg(lower(trim(d)))
         FROM unnest(coalesce(dominios, '{}')) AS d
        WHERE trim(d) <> ''),
      '{}'::text[]
    ) AS dominios,
    coalesce(nullif(trim(chave_busca), ''), nome) AS chave
  FROM espionagem_empresas
  WHERE id = p_empresa_id
),

-- Mapa plano de domínios (padrão v4 — equi-joins hasheáveis)
dominio_map AS (
  SELECT e.id AS empresa_id, d.dominio
  FROM emp e
  CROSS JOIN LATERAL unnest(e.dominios) AS d(dominio)
),

empresas_match AS (
  SELECT DISTINCT ee.id AS crm_empresa_id
  FROM dominio_map dm
  JOIN email_empresas ee ON lower(coalesce(ee.dominio, '')) = dm.dominio
),

leads_crm AS (
  SELECT DISTINCT lead_id
  FROM (
    SELECT l.id AS lead_id
    FROM email_leads l
    JOIN dominio_map dm ON split_part(lower(l.email), '@', 2) = dm.dominio
    UNION ALL
    SELECT l.id
    FROM email_leads l
    JOIN empresas_match em ON l.empresa_id = em.crm_empresa_id
  ) x
),

prospects_raw AS (
  SELECT p.id AS prospect_id, false AS email_corp
  FROM prospect_leads p
  JOIN dominio_map dm ON lower(coalesce(p.empresa_dominio, '')) = dm.dominio
  WHERE coalesce(p.status, '') <> 'descartado'
  UNION ALL
  SELECT p.id, true
  FROM prospect_leads p
  JOIN dominio_map dm ON split_part(lower(coalesce(p.email, '')), '@', 2) = dm.dominio
  WHERE coalesce(p.status, '') <> 'descartado'
  UNION ALL
  SELECT p.id, false
  FROM emp c
  JOIN prospect_leads p
    ON ( (length(c.chave) >= 4
          AND coalesce(p.empresa_nome, '') ILIKE '%' || c.chave || '%')
      OR (length(c.chave) BETWEEN 2 AND 3
          AND c.chave ~ '^[A-Za-z0-9]+$'
          AND coalesce(p.empresa_nome, '') ~* ('\y' || c.chave || '\y')) )
  WHERE coalesce(p.status, '') <> 'descartado'
),

prospects AS (
  SELECT prospect_id, bool_or(email_corp) AS email_corporativo
  FROM prospects_raw
  GROUP BY prospect_id
),

metricas AS (
  SELECT
    (SELECT COUNT(*) FROM prospects)                                   AS prospectados,
    (SELECT COUNT(*) FROM prospects WHERE email_corporativo)           AS prospectados_corp,
    (SELECT COUNT(*) FROM leads_crm)                                   AS leads_crm,
    (SELECT COUNT(DISTINCT v.lead_id)
       FROM leads_crm lc
       JOIN email_lead_campanhas v ON v.lead_id = lc.lead_id)          AS leads_em_campanha,
    (SELECT COUNT(DISTINCT v.campanha_id)
       FROM leads_crm lc
       JOIN email_lead_campanhas v ON v.lead_id = lc.lead_id)          AS campanhas,
    (SELECT COUNT(*)
       FROM email_fila f
      WHERE f.enviado_em IS NOT NULL
        AND f.lead_id IN (SELECT lead_id FROM leads_crm))              AS abordagens,
    (SELECT MAX(f.enviado_em)
       FROM email_fila f
      WHERE f.enviado_em IS NOT NULL
        AND f.lead_id IN (SELECT lead_id FROM leads_crm))              AS ultima_abordagem_em,
    (SELECT COUNT(*)
       FROM email_respostas r
      WHERE r.lead_id IN (SELECT lead_id FROM leads_crm))              AS respostas
),

concorrentes AS (
  SELECT
    co.id,
    co.nome,
    co.website,
    co.dominio,
    cc.descoberto_em,
    cc.origem_descoberta,
    (SELECT COUNT(*)
       FROM espionagem_concorrente_clientes x
      WHERE x.concorrente_id = co.id AND x.ativo)                      AS total_clientes,
    (SELECT a.cobertura_pct
       FROM espionagem_analises a
      WHERE a.concorrente_id = co.id
      ORDER BY a.executado_em DESC LIMIT 1)                            AS cobertura_pct,
    (SELECT a.executado_em
       FROM espionagem_analises a
      WHERE a.concorrente_id = co.id
      ORDER BY a.executado_em DESC LIMIT 1)                            AS ultima_analise_em
  FROM espionagem_concorrente_clientes cc
  JOIN espionagem_concorrentes co ON co.id = cc.concorrente_id
  WHERE cc.empresa_id = p_empresa_id
    AND cc.ativo
    AND co.status <> 'arquivado'
)

SELECT jsonb_build_object(
  'empresa',
    (SELECT to_jsonb(e) || to_jsonb(m) || jsonb_build_object(
       'frio_90d',
       (m.abordagens > 0 AND m.ultima_abordagem_em < now() - interval '90 days')
     )
     FROM emp e, metricas m),
  'concorrentes',
    coalesce(
      (SELECT jsonb_agg(to_jsonb(cq) ORDER BY cq.total_clientes DESC, cq.nome)
       FROM concorrentes cq),
      '[]'::jsonb
    ),
  'total_concorrentes', (SELECT COUNT(*) FROM concorrentes)
);
$$;


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — RELOAD DO CACHE DO POSTGREST
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — SMOKE TEST
-- 4.1 Seletor: esperado lista com CVC (num_concorrentes = 2)
-- 4.2 Motor inverso da CVC: esperado empresa com 4 prospectados / 6 leads /
--     1 campanha / 3 abordagens e 2 concorrentes (Talentfour, Taking)
-- ════════════════════════════════════════════════════════════════════════
SELECT jsonb_pretty(espionagem_listar_empresas());

SELECT jsonb_pretty(espionagem_analisar_empresa(
  (SELECT id FROM espionagem_empresas WHERE lower(nome) = 'cvc')
));
