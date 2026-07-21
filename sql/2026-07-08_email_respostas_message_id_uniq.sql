-- ============================================================================
-- sql/2026-07-08_email_respostas_message_id_uniq.sql
-- ----------------------------------------------------------------------------
-- Migration pareada com crm-webhook.ts v1.18 (08/07/2026)
--
-- OBJETIVO
--   Prevenir duplicatas em email_respostas causadas por retentativas do Resend
--   Inbound (que reenvia o webhook até 3× caso o endpoint não retorne 200 em
--   tempo hábil). Histórico registra 1 ocorrência real deste problema em
--   05/06/2026 na fila 11 — respostas ids 9 e 10 gravadas em 46 segundos de
--   diferença com o mesmo Message-ID RFC 5322 do email recebido.
--
-- ESTRATÉGIA
--   Índice UNIQUE PARCIAL em (message_id) WHERE message_id IS NOT NULL:
--     • Bloqueia INSERT de nova linha com message_id igual a um já existente
--       (rede de segurança final — o código v1.18 já executa gate de
--       idempotência ANTES do INSERT, evitando chegar aqui em condições
--       normais);
--     • Permite múltiplos NULLs (compat com o histórico de 26 respostas
--       inbound gravadas antes da v1.18, todas com message_id=NULL, e
--       compat com casos futuros onde o payload do Resend não trouxer
--       Message-ID por qualquer motivo).
--
-- ESCOPO
--   Aplica-se APENAS a email_respostas.message_id. NÃO afeta:
--     • Coluna direcao (a diferenciação inbound vs outbound é validada em
--       aplicação, não em constraint — outbound tem seu próprio pipeline
--       que popula message_id com o ID gerado pelo Resend no envio);
--     • Outros identificadores (in_reply_to_message_id fica sem UNIQUE
--       porque múltiplos emails podem responder ao mesmo pai).
--
-- ORDEM DE APLICAÇÃO — CRÍTICO
--   1. Deploy Preview do crm-webhook.ts v1.18 (contém o gate de idempotência
--      que verifica message_id ANTES do INSERT);
--   2. Smoke test em Preview (validar logs `📎 message_id=`, `⏭️ Retentativa
--      detectada` em replay simulado);
--   3. Promoção Preview → Production do código;
--   4. APÓS o código estar em Production, aplicar este SQL em Production;
--   5. Não é necessário reaplicar em Preview (Supabase Preview é banco
--      separado e recebe migrations independentemente conforme uso).
--
--   Aplicar o SQL ANTES do código gera risco de erro de constraint em
--   retentativas do Resend enquanto o código antigo ainda estiver em vigor,
--   quebrando webhooks e forçando o Resend a retentar em loop.
--
-- REVERSÃO (se necessário)
--   DROP INDEX IF EXISTS public.email_respostas_message_id_uniq;
--   O DROP é seguro e imediato — não há dados dependentes do índice.
--
-- IDEMPOTÊNCIA DESTE PRÓPRIO SCRIPT
--   Usa CREATE UNIQUE INDEX IF NOT EXISTS — pode ser rerodado sem erro.
-- ============================================================================

-- Passo 1 — verificação forense pré-aplicação (não modifica nada)
--           Confirma quantas linhas existentes seriam afetadas pelo índice.
--           Esperado: as 26 respostas inbound históricas têm message_id=NULL
--           e passam pelo WHERE do índice como "não incluídas" (por serem
--           NULL). Zero duplicatas devem existir entre linhas com message_id
--           preenchido — se aparecerem, o CREATE INDEX abaixo falhará e
--           precisamos investigar antes de prosseguir.
SELECT
  COUNT(*) FILTER (WHERE message_id IS NULL)                        AS respostas_sem_message_id,
  COUNT(*) FILTER (WHERE message_id IS NOT NULL)                    AS respostas_com_message_id,
  COUNT(*) FILTER (WHERE message_id IS NOT NULL)
    - COUNT(DISTINCT message_id) FILTER (WHERE message_id IS NOT NULL) AS duplicatas_atuais_message_id
FROM public.email_respostas;

-- Passo 2 — criar o índice UNIQUE parcial
--   Nome do índice: email_respostas_message_id_uniq
--   Convenção do projeto: <tabela>_<colunas>_<tipo> (uniq para UNIQUE parcial).
CREATE UNIQUE INDEX IF NOT EXISTS email_respostas_message_id_uniq
  ON public.email_respostas (message_id)
  WHERE message_id IS NOT NULL;

-- Passo 3 — verificação pós-aplicação
--           Confirma que o índice foi criado. Deve retornar 1 linha.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'email_respostas'
  AND indexname = 'email_respostas_message_id_uniq';

-- Passo 4 (opcional) — smoke test de idempotência
--   Tenta inserir uma linha com message_id que já existe em email_respostas
--   (se não houver nenhum message_id ainda, este passo retorna vazio e
--   é seguro pular). RUN dentro de BEGIN...ROLLBACK para não persistir.
--
-- BEGIN;
--   INSERT INTO public.email_respostas
--     (lead_id, de_email, direcao, message_id)
--   SELECT lead_id, de_email, direcao, message_id
--   FROM public.email_respostas
--   WHERE message_id IS NOT NULL
--   LIMIT 1;
--   -- Esperado: ERROR: duplicate key value violates unique constraint
--   -- "email_respostas_message_id_uniq"
-- ROLLBACK;
