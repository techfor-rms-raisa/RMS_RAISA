-- ════════════════════════════════════════════════════════════════════════════
-- sql/2026-07-23_creci_acompanhamento.sql
--
-- Módulo CRECI — Aba "Acompanhamento de Corretores"
-- Cria a base de dados do pós-venda: ficha de contrato + registro de atividades
-- dos corretores que demonstraram interesse ou fecharam negócio.
--
-- Contexto: até aqui o módulo CRECI cobria o funil apenas até
-- `corretores_creci.negocio_fechado`. A partir desse marco não havia onde
-- registrar aceite, valor, andamento do contrato nem o que foi combinado em
-- cada conversa. Estas duas tabelas fecham essa lacuna.
--
-- Escopo desta migração: DDL apenas (tabelas, índices, trigger, RLS).
-- Nenhum dado existente é alterado. Nenhuma tabela existente é modificada.
--
-- Base da modelagem — introspecção de 23/07/2026 (Preview):
--   • corretores_creci.id ......... bigint
--   • app_users.id ................ integer
--   • app_users.tipo_usuario ...... varchar — valores reais:
--       'Administrador', 'Analista de R&S', 'Gestão Comercial',
--       'Gestão de Pessoas', 'Consulta', 'SDR', 'Gestão de R&S'
--   • Nenhuma tabela com prefixo 'creci' além de corretores_creci
--
-- ⚠️ COMO EXECUTAR NO SUPABASE SQL EDITOR
--   1) Ctrl+A para selecionar TODO o arquivo, depois Run. O editor executa
--      apenas o bloco sob o cursor se nada estiver selecionado.
--   2) Para revisar antes de gravar: troque a última linha por ROLLBACK;
--      ⚠️ ROLLBACK DESCARTA TUDO — será necessário rodar o arquivo de novo
--      com COMMIT; para que as tabelas passem a existir de fato.
--   3) Aplicar primeiro em PREVIEW, validar, depois em PRODUCTION.
--      A migração precisa estar aplicada ANTES do deploy do código.
--
-- Versão: 1.0
-- Data: 23/07/2026
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) FUNÇÃO DE TOQUE EM atualizado_em
--    Mantém a coluna consistente mesmo em UPDATE feito direto no SQL Editor,
--    fora do endpoint. Nome prefixado para não colidir com funções existentes.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_creci_touch_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_creci_touch_atualizado_em() IS
  'Atualiza atualizado_em em cada UPDATE. Usada por creci_contratos e creci_atividades.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) TABELA creci_contratos — a "ficha de cliente" do corretor
--
--    Autoria em par (id + nome): o id serve para join e RBAC; o nome é um
--    SNAPSHOT congelado no INSERT. Se o usuário for renomeado ou desativado,
--    a ficha continua legível — mesmo padrão de email_lead_historico.criado_por.
--
--    ON DELETE RESTRICT é deliberado: um corretor com contrato registrado
--    não pode ser apagado. Histórico financeiro é permanente.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.creci_contratos (
  id                   bigserial     PRIMARY KEY,
  corretor_id          bigint        NOT NULL
                                     REFERENCES public.corretores_creci(id)
                                     ON DELETE RESTRICT,

  -- Dados do acordo
  numero_contrato      text,
  data_aceite          date,
  valor_contrato       numeric(14,2),
  status_contrato      text          NOT NULL DEFAULT 'pendente',
  modelo_remuneracao   text,
  percentual_exito     numeric(5,2),
  proxima_revisao      date,
  observacoes          text,

  -- Autoria (snapshot)
  criado_por_id        integer       REFERENCES public.app_users(id),
  criado_por_nome      text          NOT NULL,
  criado_em            timestamptz   NOT NULL DEFAULT now(),
  atualizado_por_id    integer       REFERENCES public.app_users(id),
  atualizado_por_nome  text,
  atualizado_em        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT creci_contratos_status_chk
    CHECK (status_contrato IN ('pendente','andamento','paralisado','finalizado')),

  CONSTRAINT creci_contratos_modelo_chk
    CHECK (modelo_remuneracao IS NULL
           OR modelo_remuneracao IN ('exito','fixo','misto')),

  CONSTRAINT creci_contratos_valor_chk
    CHECK (valor_contrato IS NULL OR valor_contrato >= 0),

  CONSTRAINT creci_contratos_percentual_chk
    CHECK (percentual_exito IS NULL
           OR (percentual_exito >= 0 AND percentual_exito <= 100)),

  -- Contrato finalizado exige data de aceite — não se encerra o que não começou
  CONSTRAINT creci_contratos_finalizado_chk
    CHECK (status_contrato <> 'finalizado' OR data_aceite IS NOT NULL)
);

COMMENT ON TABLE  public.creci_contratos IS
  'Ficha de contrato do corretor CRECI (pós-venda). Um corretor pode ter vários contratos ao longo do tempo, mas apenas um em aberto por vez.';
COMMENT ON COLUMN public.creci_contratos.status_contrato IS
  'pendente | andamento | paralisado | finalizado. Default: pendente.';
COMMENT ON COLUMN public.creci_contratos.criado_por_nome IS
  'Snapshot do nome de quem criou. Não é derivado de app_users em tempo de leitura — preserva o histórico se o usuário mudar de nome ou for desativado.';
COMMENT ON COLUMN public.creci_contratos.percentual_exito IS
  'Percentual de honorários por êxito (0 a 100). Preenchido quando modelo_remuneracao = exito ou misto.';

-- Um único contrato NÃO finalizado por corretor.
-- Regra de negócio: evita duas fichas abertas para o mesmo corretor.
-- Contratos finalizados ficam livres — permite renovação e histórico.
CREATE UNIQUE INDEX creci_contratos_um_aberto_por_corretor_uniq
  ON public.creci_contratos (corretor_id)
  WHERE status_contrato <> 'finalizado';

-- Número de contrato único quando informado
CREATE UNIQUE INDEX creci_contratos_numero_uniq
  ON public.creci_contratos (numero_contrato)
  WHERE numero_contrato IS NOT NULL;

CREATE INDEX creci_contratos_corretor_idx ON public.creci_contratos (corretor_id);
CREATE INDEX creci_contratos_status_idx   ON public.creci_contratos (status_contrato);

CREATE TRIGGER trg_creci_contratos_touch
  BEFORE UPDATE ON public.creci_contratos
  FOR EACH ROW EXECUTE FUNCTION public.fn_creci_touch_atualizado_em();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) TABELA creci_atividades — conversas, acordos e follow-ups
--
--    executado_por_* guarda QUEM FEZ a ação, não o responsável da carteira.
--    São conceitos distintos: corretores_creci.analista pode ser repassado a
--    outro usuário; a autoria de uma atividade de 2026 é fato imutável.
--
--    contrato_id é opcional: há atividade antes de existir contrato (fase de
--    interesse) e atividade que não se refere a nenhum acordo específico.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.creci_atividades (
  id                      bigserial     PRIMARY KEY,
  corretor_id             bigint        NOT NULL
                                        REFERENCES public.corretores_creci(id)
                                        ON DELETE RESTRICT,
  contrato_id             bigint        REFERENCES public.creci_contratos(id)
                                        ON DELETE SET NULL,

  -- Conteúdo
  tipo                    text          NOT NULL,
  data_atividade          timestamptz   NOT NULL DEFAULT now(),
  descricao               text          NOT NULL,

  -- Follow-up
  fup_em                  date,
  fup_concluido_em        timestamptz,
  fup_concluido_por_id    integer       REFERENCES public.app_users(id),
  fup_concluido_por_nome  text,

  -- Autoria (snapshot)
  executado_por_id        integer       REFERENCES public.app_users(id),
  executado_por_nome      text          NOT NULL,
  origem                  text          NOT NULL DEFAULT 'manual',

  criado_em               timestamptz   NOT NULL DEFAULT now(),
  atualizado_em           timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT creci_atividades_tipo_chk
    CHECK (tipo IN ('conversa','whatsapp','reuniao','proposta',
                    'acordo','documentacao','nota')),

  CONSTRAINT creci_atividades_origem_chk
    CHECK (origem IN ('manual','automatico')),

  CONSTRAINT creci_atividades_descricao_chk
    CHECK (length(btrim(descricao)) > 0),

  -- Não existe FUP concluído sem FUP agendado
  CONSTRAINT creci_atividades_fup_coerente_chk
    CHECK (fup_concluido_em IS NULL OR fup_em IS NOT NULL)
);

COMMENT ON TABLE  public.creci_atividades IS
  'Registro de conversas, acordos e follow-ups com corretores CRECI da carteira de acompanhamento.';
COMMENT ON COLUMN public.creci_atividades.tipo IS
  'conversa | whatsapp | reuniao | proposta | acordo | documentacao | nota';
COMMENT ON COLUMN public.creci_atividades.executado_por_nome IS
  'Snapshot de quem executou a ação — NÃO é o responsável da carteira (corretores_creci.analista), que pode mudar de dono ao longo do tempo.';
COMMENT ON COLUMN public.creci_atividades.data_atividade IS
  'Quando a conversa aconteceu — pode ser retroativa. Diferente de criado_em, que é quando o registro foi digitado.';
COMMENT ON COLUMN public.creci_atividades.origem IS
  'manual = digitada pelo usuário. automatico = gerada pelo sistema (ex.: clique no WhatsApp). Reservado para uso futuro.';

CREATE INDEX creci_atividades_corretor_data_idx
  ON public.creci_atividades (corretor_id, data_atividade DESC);

CREATE INDEX creci_atividades_contrato_idx
  ON public.creci_atividades (contrato_id)
  WHERE contrato_id IS NOT NULL;

-- Índice parcial que alimenta o KPI "FUPs vencidos" sem varrer a tabela
CREATE INDEX creci_atividades_fup_pendente_idx
  ON public.creci_atividades (fup_em)
  WHERE fup_em IS NOT NULL AND fup_concluido_em IS NULL;

CREATE TRIGGER trg_creci_atividades_touch
  BEFORE UPDATE ON public.creci_atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_creci_touch_atualizado_em();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ÍNDICE DE APOIO À CARTEIRA em corretores_creci
--    Predicado idêntico ao critério de entrada na aba: interesse = 'yes'
--    OU negocio_fechado preenchido. Não altera a tabela, apenas indexa.
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS corretores_creci_carteira_idx
  ON public.corretores_creci (analista, id DESC)
  WHERE interesse = 'yes' OR negocio_fechado IS NOT NULL;

COMMENT ON INDEX public.corretores_creci_carteira_idx IS
  'Suporta a listagem da aba Acompanhamento (carteira = interesse SIM ou negócio fechado).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RLS — acesso exclusivo via service_role
--
--    As duas tabelas são acessadas SOMENTE pelo endpoint
--    api/creci-acompanhamento.ts, que usa SUPABASE_SERVICE_ROLE_KEY e aplica
--    o RBAC no servidor. Habilitar RLS sem criar policy bloqueia anon e
--    authenticated por completo; service_role ignora RLS por definição.
--
--    Isso é mais restritivo que o padrão atual do CreciPage, que consulta
--    corretores_creci direto com a anon key. Contrato e valores financeiros
--    não devem ficar expostos ao cliente dessa forma.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.creci_contratos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creci_atividades ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO PÓS-MIGRAÇÃO (rodar em bloco separado, com Ctrl+A → Run)
--
--   SELECT table_name
--     FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name LIKE 'creci%'
--    ORDER BY 1;
--   -- esperado: creci_atividades, creci_contratos
--
--   SELECT indexname
--     FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND tablename IN ('creci_contratos','creci_atividades','corretores_creci')
--    ORDER BY tablename, indexname;
--   -- esperado: 6 índices novos + corretores_creci_carteira_idx
--
--   SELECT relname, relrowsecurity
--     FROM pg_class
--    WHERE relname IN ('creci_contratos','creci_atividades');
--   -- esperado: relrowsecurity = true nas duas
-- ════════════════════════════════════════════════════════════════════════════
