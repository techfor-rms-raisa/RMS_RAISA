-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION: Espionagem Estratégica — Empresa Canônica (Schema v2 + RPC v3)
-- Data: 2026-08-09 | Sessão 5 | Claude DBA
--
-- PROBLEMA (caso CVC, 09/08/2026): a mesma empresa-cliente cadastrada em
-- 2+ concorrentes com dominios/chave_busca divergentes exibia números
-- diferentes por concorrente. Causa raiz: o cadastro da empresa era
-- duplicado por concorrente (sem fonte única de verdade).
--
-- SOLUÇÃO: entidade canônica `espionagem_empresas`. O vínculo
-- concorrente ↔ empresa fica em `espionagem_concorrente_clientes`
-- (que passa a referenciar empresa_id). A RPC v3 lê dominios/chave da
-- empresa canônica → números idênticos em todos os concorrentes.
-- Bônus: siglas de 2–3 letras (CVC, UOL, LEV) passam a fazer match por
-- palavra inteira no Prospect Engine (antes eram descartadas em silêncio).
--
-- Aplicar em: PREVIEW (smuikbkjfuggtcmkurqh) primeiro; PRODUCTION no release
-- Idempotente: pode ser reexecutada sem efeitos colaterais
-- Uso: Supabase SQL Editor — executar UM bloco por vez (selecionar → Run)
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — TABELA CANÔNICA + COLUNA DE VÍNCULO + ÍNDICES
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS espionagem_empresas (
  id             BIGSERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  dominios       TEXT[] NOT NULL DEFAULT '{}',   -- fonte única de verdade
  chave_busca    TEXT,                           -- NULL = usa o próprio nome
  criado_por     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_esp_empresas_nome
  ON espionagem_empresas (lower(trim(nome)));

ALTER TABLE espionagem_concorrente_clientes
  ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES espionagem_empresas(id);

CREATE INDEX IF NOT EXISTS ix_esp_clientes_empresa
  ON espionagem_concorrente_clientes (empresa_id) WHERE ativo;

CREATE UNIQUE INDEX IF NOT EXISTS ux_esp_vinculo_conc_empresa
  ON espionagem_concorrente_clientes (concorrente_id, empresa_id)
  WHERE empresa_id IS NOT NULL;

-- Nota: as colunas legadas dominios/chave_busca do vínculo permanecem por
-- compatibilidade (fallback defensivo na RPC), mas a fonte de verdade
-- passa a ser espionagem_empresas.


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — BACKFILL DE DEDUPLICAÇÃO (idempotente)
-- 2.1 Cria empresas canônicas agrupando vínculos por lower(nome)
-- 2.2 Mescla (UNION) os domínios de todos os vínculos na canônica
-- 2.3 Liga os vínculos (empresa_id)
-- Resultado esperado p/ CVC: 1 empresa canônica com
--   {cvc.com.br, cvccorp.com.br} servindo Taking E Talentfour.
-- ════════════════════════════════════════════════════════════════════════

-- 2.1 — empresas canônicas
WITH grupos AS (
  SELECT
    lower(trim(nome))                                    AS k,
    (array_agg(trim(nome) ORDER BY id))[1]               AS nome_canonico,
    (array_agg(chave_busca ORDER BY id)
       FILTER (WHERE nullif(trim(chave_busca), '') IS NOT NULL))[1] AS chave
  FROM espionagem_concorrente_clientes
  GROUP BY lower(trim(nome))
)
INSERT INTO espionagem_empresas (nome, chave_busca, criado_por)
SELECT g.nome_canonico, g.chave, 'backfill-2026-08-09'
FROM grupos g
WHERE NOT EXISTS (
  SELECT 1 FROM espionagem_empresas e WHERE lower(trim(e.nome)) = g.k
);

-- 2.2 — UNION dos domínios de todos os vínculos → canônica
WITH uniao AS (
  SELECT
    e.id,
    array_agg(DISTINCT lower(trim(d))) FILTER (WHERE trim(d) <> '') AS dominios
  FROM espionagem_empresas e
  JOIN espionagem_concorrente_clientes cc
    ON lower(trim(cc.nome)) = lower(trim(e.nome))
  LEFT JOIN LATERAL unnest(coalesce(cc.dominios, '{}') || coalesce(e.dominios, '{}')) AS d ON true
  GROUP BY e.id
)
UPDATE espionagem_empresas e
SET dominios = coalesce(u.dominios, '{}'),
    atualizado_em = now()
FROM uniao u
WHERE u.id = e.id
  AND coalesce(u.dominios, '{}') IS DISTINCT FROM e.dominios;

-- 2.3 — linkage dos vínculos
UPDATE espionagem_concorrente_clientes cc
SET empresa_id = e.id
FROM espionagem_empresas e
WHERE cc.empresa_id IS NULL
  AND lower(trim(e.nome)) = lower(trim(cc.nome));


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — RPC v3 DO MOTOR DE CRUZAMENTO
-- Mudanças vs v2:
--  1. dominios/chave lidos da EMPRESA CANÔNICA (fallback defensivo p/ o
--     vínculo legado se empresa_id ainda for NULL)
--  2. Siglas 2–3 caracteres alfanuméricos: match por palavra inteira
--     (regex \y) no nome da empresa do Prospect Engine — antes, chaves
--     com menos de 4 caracteres eram simplesmente ignoradas
-- Assinatura e shape do jsonb inalterados (frontend intacto):
--     cliente_id continua sendo o id do VÍNCULO (contrato do delta).
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

-- Prospect Engine: domínio, e-mail OU nome da empresa; exclui descartados
-- chave >= 4 chars → ILIKE substring | sigla 2–3 chars alfanum → \y palavra inteira
prospects AS (
  SELECT DISTINCT
    c.id AS cliente_id,
    p.id AS prospect_id,
    (split_part(lower(coalesce(p.email, '')), '@', 2) = ANY(c.dominios)) AS email_corporativo
  FROM clientes c
  JOIN prospect_leads p
    ON ( lower(coalesce(p.empresa_dominio, '')) = ANY(c.dominios)
      OR split_part(lower(coalesce(p.email, '')), '@', 2) = ANY(c.dominios)
      OR (length(c.chave) >= 4
          AND coalesce(p.empresa_nome, '') ILIKE '%' || c.chave || '%')
      OR (length(c.chave) BETWEEN 2 AND 3
          AND c.chave ~ '^[A-Za-z0-9]+$'
          AND coalesce(p.empresa_nome, '') ~* ('\y' || c.chave || '\y')) )
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
-- BLOCO 4 — RELOAD DO CACHE DO POSTGREST (obrigatório após recriar a RPC)
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- BLOCO 5 — VALIDAÇÃO (rodar e conferir)
-- 5.1 — CVC deve ser 1 empresa canônica com a UNIÃO dos domínios,
--       vinculada aos 2 concorrentes
-- ════════════════════════════════════════════════════════════════════════
SELECT
  e.id            AS empresa_id,
  e.nome,
  e.dominios,
  e.chave_busca,
  co.nome         AS concorrente,
  cc.id           AS vinculo_id,
  cc.ativo
FROM espionagem_empresas e
JOIN espionagem_concorrente_clientes cc ON cc.empresa_id = e.id
JOIN espionagem_concorrentes co ON co.id = cc.concorrente_id
WHERE lower(e.nome) LIKE '%cvc%'
ORDER BY co.nome;

-- 5.2 — Sanidade geral: nenhum vínculo pode ficar órfão (esperado: 0)
SELECT COUNT(*) AS vinculos_sem_empresa
FROM espionagem_concorrente_clientes
WHERE empresa_id IS NULL;
