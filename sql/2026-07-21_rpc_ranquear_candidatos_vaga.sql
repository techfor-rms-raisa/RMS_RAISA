-- ============================================================
-- RPC: ranquear_candidatos_vaga
-- Arquivo: 2026-07-21_rpc_ranquear_candidatos_vaga.sql
-- Módulo: Ranqueamento de Candidatos (RAISA)
-- ------------------------------------------------------------
-- Retorna TODOS os candidatos de uma vaga (independe de analista
-- — visão completa para qualquer perfil RAISA, decisão de 21/07/2026),
-- já ponderados e ordenados do melhor para o pior.
--
-- Fórmula do score de ranqueamento (pesos default, configuráveis
-- por parâmetro sem necessidade de deploy):
--   Score = p_peso_cv         * analise_adequacao.score_geral   (CV × Vaga)
--         + p_peso_tecnico     * entrevista_tecnica.score_tecnico
--         + p_peso_comunicacao * entrevista_tecnica.score_comunicacao
--
-- Tratamento de dados parciais (Claude Riscos):
--   - Usa DISTINCT ON para pegar o registro MAIS RECENTE por candidatura
--     (tanto em analise_adequacao quanto em entrevista_tecnica), pois
--     podem existir múltiplos registros por candidatura.
--   - Só considera entrevista com status = 'concluida'.
--   - Candidato SEM entrevista concluída: score_ranking = NULL e
--     tem_entrevista = false. O frontend separa em dois blocos:
--       (1) Ranqueados     -> ordenados por score_ranking
--       (2) Pré-ranking     -> ordenados por score_cv (só CV)
--   - Ordenação já entrega: entrevistados primeiro, depois por score.
--
-- SECURITY INVOKER (default) para respeitar o padrão de acesso já
-- usado no frontend (anon key lê estas tabelas diretamente hoje).
--
-- Aplicar em: Preview PRIMEIRO, validar, depois Production.
-- ============================================================

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
  -- Registro de adequação (CV × Vaga) mais recente por candidatura
  adeq AS (
    SELECT DISTINCT ON (a.candidatura_id)
      a.candidatura_id,
      a.score_geral AS score_cv
    FROM analise_adequacao a
    WHERE a.candidatura_id IN (SELECT id FROM cand)
    ORDER BY a.candidatura_id, a.created_at DESC
  ),
  -- Entrevista técnica concluída mais recente por candidatura
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
  )
  SELECT
    c.id                                         AS candidatura_id,
    c.pessoa_id,
    c.candidato_nome::text,
    c.status::text                               AS candidatura_status,
    COALESCE(ad.score_cv, 0)                     AS score_cv,
    (en.candidatura_id IS NOT NULL)              AS tem_entrevista,
    en.score_tecnico,
    en.score_comunicacao,
    en.score_geral_entrevista,
    en.recomendacao_ia::text,
    en.decisao_analista::text,
    CASE
      WHEN en.candidatura_id IS NOT NULL THEN
        ROUND(
            p_peso_cv          * COALESCE(ad.score_cv, 0)
          + p_peso_tecnico     * COALESCE(en.score_tecnico, 0)
          + p_peso_comunicacao * COALESCE(en.score_comunicacao, 0)
        , 1)
      ELSE NULL
    END                                          AS score_ranking,
    en.entrevista_data
  FROM cand c
  LEFT JOIN adeq ad ON ad.candidatura_id = c.id
  LEFT JOIN entr en ON en.candidatura_id = c.id
  ORDER BY
    -- 1) entrevistados primeiro
    (en.candidatura_id IS NOT NULL) DESC,
    -- 2) dentro de cada bloco, maior score primeiro
    CASE
      WHEN en.candidatura_id IS NOT NULL THEN
          p_peso_cv          * COALESCE(ad.score_cv, 0)
        + p_peso_tecnico     * COALESCE(en.score_tecnico, 0)
        + p_peso_comunicacao * COALESCE(en.score_comunicacao, 0)
      ELSE COALESCE(ad.score_cv, 0)
    END DESC,
    c.candidato_nome ASC;
$$;

-- Permissões: o frontend chama via anon/authenticated (anon key)
GRANT EXECUTE ON FUNCTION ranquear_candidatos_vaga(integer, numeric, numeric, numeric)
  TO anon, authenticated;

-- ============================================================
-- TESTE RÁPIDO (troque 123 por um vaga_id real do Preview):
--   SELECT * FROM ranquear_candidatos_vaga(123);
-- Com pesos customizados:
--   SELECT * FROM ranquear_candidatos_vaga(123, 0.25, 0.55, 0.20);
-- ============================================================
