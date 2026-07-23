-- ============================================================
-- RPC: ranquear_candidatos_vaga  (v2 — renormalização de pesos)
-- Arquivo: 2026-07-21_rpc_ranquear_candidatos_vaga.sql
-- Módulo: Ranqueamento de Candidatos (RAISA)
-- ------------------------------------------------------------
-- v2 (21/07/2026) — Opção A aprovada por Messias:
--   Renormaliza os pesos DINAMICAMENTE conforme os componentes
--   presentes, para nenhum candidato ser penalizado por um dado
--   que não foi coletado (ex.: entrevista feita, mas sem Análise
--   de CV). Antes, CV ausente entrava como 0 e "puxava" o score.
--
--   Componentes e presença:
--     - CV          : presente se existe Análise de Adequação (tem_cv)
--     - Técnico     : presente se score_tecnico não é nulo (na entrevista)
--     - Comunicação : presente se score_comunicacao não é nulo
--
--   Score renormalizado (bloco "Ranqueados", com entrevista concluída):
--     Score = Σ(peso_i * score_i, para i presente) / Σ(peso_i, para i presente)
--
--   Exemplo (Danilo): CV ausente, Técnico=75, Comunicação=85
--     antes:  0.30*0 + 0.50*75 + 0.20*85            = 55
--     agora: (0.50*75 + 0.20*85) / (0.50 + 0.20)    ≈ 78
--
--   Guarda contra divisão por zero: se nenhum componente presente,
--   score_ranking = NULL.
--
-- Candidato SEM entrevista concluída continua no "Pré-ranking",
-- ordenado por score_cv (que pode ser 0 quando não há Análise de CV).
--
-- Coluna de saída `tem_cv` para o frontend distinguir
--   "CV = 0 real" de "sem Análise de CV" (exibir "n/d").
--
-- Aplicar em: Preview PRIMEIRO, validar, depois Production.
-- Após aplicar, recarregar o cache do PostgREST:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- Necessário porque a v2 altera o TIPO DE RETORNO (nova coluna tem_cv):
-- o Postgres não permite CREATE OR REPLACE mudando o retorno de uma
-- função existente (erro 42P13). O DROP resolve. Idempotente.
DROP FUNCTION IF EXISTS ranquear_candidatos_vaga(integer, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION ranquear_candidatos_vaga(
  p_vaga_id            integer,
  p_peso_cv            numeric DEFAULT 0.30,
  p_peso_tecnico       numeric DEFAULT 0.50,
  p_peso_comunicacao   numeric DEFAULT 0.20
)
RETURNS TABLE (
  candidatura_id           integer,
  pessoa_id                integer,
  candidato_nome           text,
  candidatura_status       text,
  score_cv                 integer,
  tem_cv                   boolean,
  tem_entrevista           boolean,
  score_tecnico            integer,
  score_comunicacao        integer,
  score_geral_entrevista   integer,
  recomendacao_ia          text,
  decisao_analista         text,
  score_ranking            numeric,
  entrevista_data          timestamp without time zone
)
LANGUAGE sql
STABLE
AS $$
  WITH cand AS (
    SELECT id, pessoa_id, candidato_nome, status
    FROM candidaturas
    WHERE vaga_id = p_vaga_id
  ),
  adeq AS (
    SELECT DISTINCT ON (a.candidatura_id)
      a.candidatura_id,
      a.score_geral AS score_cv
    FROM analise_adequacao a
    WHERE a.candidatura_id IN (SELECT id FROM cand)
    ORDER BY a.candidatura_id, a.created_at DESC
  ),
  entr AS (
    SELECT DISTINCT ON (e.candidatura_id)
      e.candidatura_id,
      e.score_tecnico,
      e.score_comunicacao,
      e.score_geral      AS score_geral_entrevista,
      e.recomendacao_ia,
      e.decisao_analista,
      e.created_at       AS entrevista_data
    FROM entrevista_tecnica e
    WHERE e.candidatura_id IN (SELECT id FROM cand)
      AND e.status = 'concluida'
    ORDER BY e.candidatura_id, e.created_at DESC
  ),
  base AS (
    SELECT
      c.id                              AS candidatura_id,
      c.pessoa_id,
      c.candidato_nome,
      c.status                          AS candidatura_status,
      (ad.candidatura_id IS NOT NULL)   AS tem_cv,
      ad.score_cv,
      (en.candidatura_id IS NOT NULL)   AS tem_entrevista,
      en.score_tecnico,
      en.score_comunicacao,
      en.score_geral_entrevista,
      en.recomendacao_ia,
      en.decisao_analista,
      en.entrevista_data
    FROM cand c
    LEFT JOIN adeq ad ON ad.candidatura_id = c.id
    LEFT JOIN entr en ON en.candidatura_id = c.id
  ),
  pres AS (
    SELECT
      b.*,
      b.tem_cv                                               AS p_cv,
      (b.tem_entrevista AND b.score_tecnico     IS NOT NULL) AS p_tec,
      (b.tem_entrevista AND b.score_comunicacao IS NOT NULL) AS p_com
    FROM base b
  ),
  final AS (
    SELECT
      p.*,
      (   (CASE WHEN p.p_cv  THEN p_peso_cv          ELSE 0 END)
        + (CASE WHEN p.p_tec THEN p_peso_tecnico     ELSE 0 END)
        + (CASE WHEN p.p_com THEN p_peso_comunicacao ELSE 0 END) ) AS soma_pesos,
      (   (CASE WHEN p.p_cv  THEN p_peso_cv          * COALESCE(p.score_cv, 0)          ELSE 0 END)
        + (CASE WHEN p.p_tec THEN p_peso_tecnico     * COALESCE(p.score_tecnico, 0)     ELSE 0 END)
        + (CASE WHEN p.p_com THEN p_peso_comunicacao * COALESCE(p.score_comunicacao, 0) ELSE 0 END) ) AS soma_ponderada
    FROM pres p
  )
  SELECT
    f.candidatura_id,
    f.pessoa_id,
    f.candidato_nome::text,
    f.candidatura_status::text,
    COALESCE(f.score_cv, 0)::integer      AS score_cv,
    f.tem_cv,
    f.tem_entrevista,
    f.score_tecnico,
    f.score_comunicacao,
    f.score_geral_entrevista,
    f.recomendacao_ia::text,
    f.decisao_analista::text,
    CASE
      WHEN f.tem_entrevista AND f.soma_pesos > 0
        THEN ROUND(f.soma_ponderada / f.soma_pesos, 1)
      ELSE NULL
    END                                   AS score_ranking,
    f.entrevista_data
  FROM final f
  ORDER BY
    f.tem_entrevista DESC,
    CASE
      WHEN f.tem_entrevista AND f.soma_pesos > 0 THEN f.soma_ponderada / f.soma_pesos
      ELSE COALESCE(f.score_cv, 0)
    END DESC NULLS LAST,
    f.candidato_nome ASC;
$$;

GRANT EXECUTE ON FUNCTION ranquear_candidatos_vaga(integer, numeric, numeric, numeric)
  TO anon, authenticated;

-- ============================================================
-- TESTE (vaga 27 = "7410 - Desenvolvedor Full Stack PHP/Vue Sr"):
--   SELECT * FROM ranquear_candidatos_vaga(27);
--   -> Danilo deve sair com score_ranking ~ 78 (nao mais 55),
--      tem_cv = false, tem_entrevista = true.
-- ============================================================
