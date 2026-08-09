-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION: Espionagem Estratégica — RPC v4 (performance)
-- Data: 2026-08-09 | Sessão 5 (hotfix) | Claude DBA
--
-- REGRESSÃO CORRIGIDA: a RPC v3 (empresa canônica) reintroduziu o padrão
-- lento pré-v2 — JOINs com OR + = ANY(array) + subquery IN correlacionada,
-- que impedem hash join e forçam nested loop sobre email_leads e
-- prospect_leads inteiras → erro 57014 (statement timeout) em Production.
--
-- v4 = arquitetura de performance da v2 + Empresa Canônica da v3:
--  - `dominio_map`: unnest dos domínios em linhas (cliente_id, dominio)
--  - ORs decompostos em ramos UNION ALL com EQUI-JOINS hasheáveis
--    (1 seq scan por tabela grande, hash construído no lado pequeno)
--  - Match por nome/sigla isolado em ramo próprio (clientes × prospects,
--    lado pequeno dirige o loop)
--  - Shape do jsonb e assinatura INALTERADOS (backend/frontend intactos)
--
-- Aplicar em: PRODUCTION (wuejqxijjjdvwighjiiaj) — hotfix imediato.
--             Depois replicar em PREVIEW (smuikbkjfuggtcmkurqh) p/ paridade.
-- Idempotente. Uso: SQL Editor — UM bloco por vez (selecionar → Run).
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — RPC v4
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS espionagem_analisar_concorrente(BIGINT);

CREATE OR REPLACE FUNCTION espionagem_analisar_concorrente(p_concorrente_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH clientes AS (
  SELECT
    cc.id,
    coalesce(e.nome, cc.nome) AS nome,
    coalesce(
      (SELECT array_agg(lower(trim(d)))
         FROM unnest(coalesce(coalesce(e.dominios, cc.dominios), '{}')) AS d
        WHERE trim(d) <> ''),
      '{}'::text[]
    ) AS dominios,
    coalesce(
      nullif(trim(coalesce(e.chave_busca, cc.chave_busca)), ''),
      coalesce(e.nome, cc.nome)
    ) AS chave,
    cc.descoberto_em
  FROM espionagem_concorrente_clientes cc
  LEFT JOIN espionagem_empresas e ON e.id = cc.empresa_id
  WHERE cc.concorrente_id = p_concorrente_id
    AND cc.ativo
),

-- ── Mapa plano domínio → cliente (padrão de performance da v2) ──────────
dominio_map AS (
  SELECT c.id AS cliente_id, d.dominio
  FROM clientes c
  CROSS JOIN LATERAL unnest(c.dominios) AS d(dominio)
),

-- Empresas do CRM cujo domínio pertence a algum cliente (equi-join)
empresas_match AS (
  SELECT DISTINCT dm.cliente_id, e.id AS empresa_id
  FROM dominio_map dm
  JOIN email_empresas e ON lower(coalesce(e.dominio, '')) = dm.dominio
),

-- ── Leads do CRM: 2 ramos equi-join (hash) em vez de OR ────────────────
leads_crm AS (
  SELECT DISTINCT cliente_id, lead_id
  FROM (
    -- Ramo 1: domínio do e-mail do lead
    SELECT dm.cliente_id, l.id AS lead_id
    FROM email_leads l
    JOIN dominio_map dm ON split_part(lower(l.email), '@', 2) = dm.dominio
    UNION ALL
    -- Ramo 2: empresa vinculada com domínio do cliente
    SELECT em.cliente_id, l.id
    FROM email_leads l
    JOIN empresas_match em ON l.empresa_id = em.empresa_id
  ) x
),

-- ── Prospect Engine: 3 ramos; flag corporativo via bool_or ─────────────
prospects_raw AS (
  -- Ramo 1: domínio da empresa do prospect
  SELECT dm.cliente_id, p.id AS prospect_id, false AS email_corp
  FROM prospect_leads p
  JOIN dominio_map dm ON lower(coalesce(p.empresa_dominio, '')) = dm.dominio
  WHERE coalesce(p.status, '') <> 'descartado'
  UNION ALL
  -- Ramo 2: domínio do e-mail do prospect (corporativo)
  SELECT dm.cliente_id, p.id, true
  FROM prospect_leads p
  JOIN dominio_map dm ON split_part(lower(coalesce(p.email, '')), '@', 2) = dm.dominio
  WHERE coalesce(p.status, '') <> 'descartado'
  UNION ALL
  -- Ramo 3: nome da empresa — chave >= 4 chars ILIKE | sigla 2–3 chars \y
  SELECT c.id, p.id, false
  FROM clientes c
  JOIN prospect_leads p
    ON ( (length(c.chave) >= 4
          AND coalesce(p.empresa_nome, '') ILIKE '%' || c.chave || '%')
      OR (length(c.chave) BETWEEN 2 AND 3
          AND c.chave ~ '^[A-Za-z0-9]+$'
          AND coalesce(p.empresa_nome, '') ~* ('\y' || c.chave || '\y')) )
  WHERE coalesce(p.status, '') <> 'descartado'
),

prospects AS (
  SELECT cliente_id, prospect_id, bool_or(email_corp) AS email_corporativo
  FROM prospects_raw
  GROUP BY cliente_id, prospect_id
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
-- BLOCO 2 — RELOAD DO CACHE DO POSTGREST
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — SMOKE TEST COM CRONÔMETRO
-- Rode e observe o tempo no rodapé do SQL Editor. Esperado: < 5s
-- (a v2 rodava nessa faixa com os mesmos volumes).
-- ════════════════════════════════════════════════════════════════════════
SELECT jsonb_pretty(espionagem_analisar_concorrente(
  (SELECT id FROM espionagem_concorrentes WHERE lower(nome) = 'talentfour')
));

SELECT jsonb_pretty(espionagem_analisar_concorrente(
  (SELECT id FROM espionagem_concorrentes WHERE lower(nome) = 'taking')
));
