-- ════════════════════════════════════════════════════════════════════════════
-- sql/2026-07-23_creci_acompanhamento_rpcs.sql
--
-- Módulo CRECI — Aba "Acompanhamento de Corretores"
-- RPCs de leitura: listagem da carteira e KPIs agregados.
--
-- PRÉ-REQUISITO: sql/2026-07-23_creci_acompanhamento.sql já aplicado
-- (tabelas creci_contratos e creci_atividades existindo).
--
-- POR QUE RPC E NÃO QUERY NO NODE
--   O client JS do Supabase trunca SELECT em 1.000 linhas silenciosamente —
--   sem erro e sem warning. Montar a carteira puxando corretores + contratos
--   + atividades para agregar no Node reproduziria exatamente esse risco à
--   medida que a base crescer, além de gerar N+1. Toda agregação fica aqui,
--   no Postgres, e o endpoint apenas repassa o resultado.
--
-- ⚠️ COMO EXECUTAR NO SUPABASE SQL EDITOR
--   Ctrl+A para selecionar TODO o arquivo, depois Run.
--   Aplicar em PREVIEW, validar, depois em PRODUCTION.
--   CREATE OR REPLACE é idempotente — pode ser reexecutado sem efeito colateral.
--
-- Versão: 1.0
-- Data: 23/07/2026
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) listar_carteira_creci
--
--    Carteira = corretor com interesse = 'yes' OU negocio_fechado preenchido.
--    Critério fixo, não parametrizável — é a definição do escopo da aba.
--
--    Devolve, por corretor: dados de contato, o contrato vigente (se houver),
--    agregados de atividade e o lead correspondente no CRM (casado por e-mail).
--    total_registros vem por COUNT(*) OVER () — paginação sem segunda query.
--
--    Parâmetros (todos com default — chamada mínima: SELECT * FROM listar_carteira_creci()):
--      p_busca            texto livre em nome, CRECI ou e-mail
--      p_situacao         'todos' | 'interesse' | 'fechado'
--      p_status_contrato  'todos' | 'sem_contrato' | 'pendente' | 'andamento'
--                         | 'paralisado' | 'finalizado'
--      p_responsavel      corretores_creci.analista — '' ou NULL = todos
--      p_limit / p_offset paginação
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.listar_carteira_creci(
  p_busca            text    DEFAULT NULL,
  p_situacao         text    DEFAULT 'todos',
  p_status_contrato  text    DEFAULT 'todos',
  p_responsavel      text    DEFAULT NULL,
  p_limit            integer DEFAULT 50,
  p_offset           integer DEFAULT 0
)
RETURNS TABLE (
  corretor_id            bigint,
  nome                   text,
  creci                  text,
  email                  text,
  celular                text,
  cidade                 text,
  uf                     text,
  analista               text,
  data_contato           date,
  interesse              text,
  negocio_fechado        date,
  data_envio_adv         date,
  data_whatsapp_clicado  timestamptz,
  contrato_id            bigint,
  numero_contrato        text,
  status_contrato        text,
  valor_contrato         numeric,
  data_aceite            date,
  total_atividades       bigint,
  ultima_atividade_em    timestamptz,
  fup_pendente_em        date,
  fup_vencido            boolean,
  lead_id                bigint,
  total_registros        bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH hoje AS (
  -- Data local de São Paulo. O servidor roda em UTC; usar current_date puro
  -- marcaria FUPs como vencidos entre 21h e 00h do dia anterior no Brasil.
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
),
base AS (
  SELECT c.id,
         c.nome,
         c.creci,
         lower(btrim(coalesce(c.email_creci, c.email_pessoal))) AS email_norm,
         c.celular,
         c.cidade,
         c.uf,
         c.analista,
         c.data_contato,
         c.interesse,
         c.negocio_fechado,
         c.data_envio_adv,
         c.data_whatsapp_clicado
    FROM public.corretores_creci c
   WHERE (c.interesse = 'yes' OR c.negocio_fechado IS NOT NULL)
     AND (p_situacao IS NULL
          OR p_situacao = 'todos'
          OR (p_situacao = 'interesse' AND c.interesse = 'yes' AND c.negocio_fechado IS NULL)
          OR (p_situacao = 'fechado'   AND c.negocio_fechado IS NOT NULL))
     AND (p_responsavel IS NULL OR btrim(p_responsavel) = '' OR c.analista = p_responsavel)
     AND (p_busca IS NULL OR btrim(p_busca) = ''
          OR c.nome        ILIKE '%' || btrim(p_busca) || '%'
          OR c.creci       ILIKE '%' || btrim(p_busca) || '%'
          OR c.email_creci ILIKE '%' || btrim(p_busca) || '%'
          OR c.email_pessoal ILIKE '%' || btrim(p_busca) || '%')
),
contrato AS (
  -- Contrato vigente: o não finalizado (só pode existir um, garantido pelo
  -- índice único parcial). Se todos estiverem finalizados, pega o mais recente.
  SELECT DISTINCT ON (ct.corretor_id)
         ct.corretor_id,
         ct.id AS contrato_id,
         ct.numero_contrato,
         ct.status_contrato,
         ct.valor_contrato,
         ct.data_aceite
    FROM public.creci_contratos ct
   ORDER BY ct.corretor_id,
            (ct.status_contrato = 'finalizado'),  -- false (aberto) vem antes
            ct.criado_em DESC
),
atividade AS (
  SELECT a.corretor_id,
         count(*)                  AS total_atividades,
         max(a.data_atividade)     AS ultima_atividade_em
    FROM public.creci_atividades a
   GROUP BY a.corretor_id
),
fup AS (
  SELECT a.corretor_id,
         min(a.fup_em) AS fup_pendente_em
    FROM public.creci_atividades a
   WHERE a.fup_em IS NOT NULL
     AND a.fup_concluido_em IS NULL
   GROUP BY a.corretor_id
),
lead AS (
  -- Vínculo com o CRM por e-mail. Não há FK entre corretores_creci e
  -- email_leads; DISTINCT ON protege contra o caso de dois leads com o
  -- mesmo e-mail (não deveria ocorrer — email_leads tem UNIQUE em email).
  SELECT DISTINCT ON (lower(el.email))
         lower(el.email) AS email_norm,
         el.id           AS lead_id
    FROM public.email_leads el
   WHERE el.email IS NOT NULL
   ORDER BY lower(el.email), el.id
)
SELECT b.id                                   AS corretor_id,
       b.nome,
       b.creci,
       b.email_norm                           AS email,
       b.celular,
       b.cidade,
       b.uf,
       b.analista,
       b.data_contato,
       b.interesse,
       b.negocio_fechado,
       b.data_envio_adv,
       b.data_whatsapp_clicado,
       ct.contrato_id,
       ct.numero_contrato,
       ct.status_contrato,
       ct.valor_contrato,
       ct.data_aceite,
       coalesce(at.total_atividades, 0)       AS total_atividades,
       at.ultima_atividade_em,
       f.fup_pendente_em,
       (f.fup_pendente_em IS NOT NULL
        AND f.fup_pendente_em <= (SELECT d FROM hoje)) AS fup_vencido,
       l.lead_id,
       count(*) OVER ()                       AS total_registros
  FROM base b
  LEFT JOIN contrato  ct ON ct.corretor_id = b.id
  LEFT JOIN atividade at ON at.corretor_id = b.id
  LEFT JOIN fup       f  ON f.corretor_id  = b.id
  LEFT JOIN lead      l  ON l.email_norm   = b.email_norm
 WHERE (p_status_contrato IS NULL
        OR p_status_contrato = 'todos'
        OR (p_status_contrato = 'sem_contrato' AND ct.contrato_id IS NULL)
        OR ct.status_contrato = p_status_contrato)
 ORDER BY (f.fup_pendente_em IS NOT NULL
           AND f.fup_pendente_em <= (SELECT d FROM hoje)) DESC,  -- FUP vencido primeiro
          at.ultima_atividade_em DESC NULLS LAST,
          b.id DESC
 LIMIT  greatest(1, least(coalesce(p_limit, 50), 200))
OFFSET greatest(0, coalesce(p_offset, 0));
$$;

COMMENT ON FUNCTION public.listar_carteira_creci(text,text,text,text,integer,integer) IS
  'Lista a carteira de acompanhamento CRECI (interesse SIM ou negócio fechado) com contrato vigente, agregados de atividade, FUP pendente e lead do CRM. Usada por api/creci-acompanhamento.ts.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) kpis_carteira_creci
--
--    Uma única varredura por tabela, com COUNT(*) FILTER — nunca traz linhas
--    para o Node. Retorna exatamente uma linha.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpis_carteira_creci()
RETURNS TABLE (
  total_carteira             bigint,
  interessados               bigint,
  negocios_fechados          bigint,
  contratos_em_andamento     bigint,
  valor_em_andamento         numeric,
  fups_vencidos              bigint,
  corretores_com_fup_vencido bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH hoje AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
),
carteira AS (
  SELECT c.id, c.interesse, c.negocio_fechado
    FROM public.corretores_creci c
   WHERE c.interesse = 'yes' OR c.negocio_fechado IS NOT NULL
),
cont AS (
  SELECT count(*) FILTER (WHERE ct.status_contrato = 'andamento')        AS em_andamento,
         coalesce(sum(ct.valor_contrato)
                  FILTER (WHERE ct.status_contrato = 'andamento'), 0)    AS valor_andamento
    FROM public.creci_contratos ct
),
fups AS (
  SELECT count(*)                        AS vencidos,
         count(DISTINCT a.corretor_id)   AS corretores
    FROM public.creci_atividades a, hoje h
   WHERE a.fup_em IS NOT NULL
     AND a.fup_concluido_em IS NULL
     AND a.fup_em <= h.d
)
SELECT (SELECT count(*) FROM carteira)                                              AS total_carteira,
       (SELECT count(*) FROM carteira WHERE interesse = 'yes'
                                        AND negocio_fechado IS NULL)                AS interessados,
       (SELECT count(*) FROM carteira WHERE negocio_fechado IS NOT NULL)            AS negocios_fechados,
       (SELECT em_andamento     FROM cont)                                          AS contratos_em_andamento,
       (SELECT valor_andamento  FROM cont)                                          AS valor_em_andamento,
       (SELECT vencidos         FROM fups)                                          AS fups_vencidos,
       (SELECT corretores       FROM fups)                                          AS corretores_com_fup_vencido;
$$;

COMMENT ON FUNCTION public.kpis_carteira_creci() IS
  'KPIs da aba Acompanhamento CRECI. Agregação 100% no Postgres via COUNT(*) FILTER — nenhuma linha trafega para o Node.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) responsaveis_carteira_creci — alimenta o filtro "Responsável"
--    Só devolve responsáveis que de fato têm corretor na carteira.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.responsaveis_carteira_creci()
RETURNS TABLE (analista text, total bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.analista, count(*) AS total
    FROM public.corretores_creci c
   WHERE (c.interesse = 'yes' OR c.negocio_fechado IS NOT NULL)
     AND c.analista IS NOT NULL
     AND btrim(c.analista) <> ''
   GROUP BY c.analista
   ORDER BY c.analista;
$$;

COMMENT ON FUNCTION public.responsaveis_carteira_creci() IS
  'Responsáveis distintos com corretor na carteira de acompanhamento. Alimenta o dropdown de filtro da aba.';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO PÓS-MIGRAÇÃO (rodar em bloco separado, Ctrl+A → Run)
--
--   SELECT * FROM public.kpis_carteira_creci();
--   -- esperado hoje: total_carteira = 3, demais zerados (sem contrato/atividade)
--
--   SELECT corretor_id, nome, creci, email, analista,
--          status_contrato, total_atividades, fup_vencido, lead_id, total_registros
--     FROM public.listar_carteira_creci();
--   -- esperado: 3 linhas, lead_id preenchido nas 3 (casamento por e-mail = 100%)
--
--   SELECT * FROM public.responsaveis_carteira_creci();
--   -- esperado: 3 responsáveis distintos
-- ════════════════════════════════════════════════════════════════════════════
