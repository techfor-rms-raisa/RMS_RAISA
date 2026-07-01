-- ============================================================
-- Migration: 2026-06-30 — Extensão de email_respostas para
--            suportar threads bidirecionais (Pacote P1 da
--            feature CRM E-mail).
-- ============================================================
--
-- Caminho sugerido: database/sql/2026-06-30_extender_email_respostas_p1.sql
--
-- Contexto:
--   Hoje email_respostas armazena apenas REPLIES dos leads (inbound).
--   Para a feature CRM E-mail (Caminho C aprovado em 30/06/2026),
--   essa tabela passa a ser a fonte da verdade de TODA conversa
--   bidirecional com o lead, incluindo respostas enviadas pelo
--   próprio RAISA (outbound — Pacote P2/P3).
--
--   Mudanças:
--     1. Coluna `direcao` ('inbound' default | 'outbound') com CHECK
--     2. Coluna `message_id` (Message-ID Resend da própria mensagem)
--     3. Coluna `in_reply_to_message_id` (threading nativo SMTP)
--     4. Coluna `enviado_por` (FK app_users — quem digitou no outbound)
--     5. Coluna `bcc_corporativo_em` (timestamp do envio com BCC ao
--        email corporativo do GC/SDR para manter Exchange sincronizado)
--     6. Dois índices novos (lead/campanha + message_id)
--
-- Compatibilidade:
--   • Todas as colunas novas são NULLABLE (exceto `direcao` que tem
--     DEFAULT 'inbound'). Linhas pré-existentes ficam direcao='inbound'
--     automaticamente — zero backfill manual.
--   • A action listar_respostas existente (crm-leads v1.21) continua
--     funcionando sem mudança porque o SELECT enumera colunas
--     específicas e nenhuma das novas entra naquele payload.
--   • Webhook crm-webhook v1.22 também não muda — continua INSERT
--     sem informar direcao (que defaulta para 'inbound') nem
--     enviado_por (NULL).
--
-- Como aplicar:
--   • Preview primeiro (Supabase smuikbkjfuggtcmkurqh)
--   • Validar via SELECT count(*) na auditoria abaixo
--   • Replicar em Production (Supabase wuejqxijjjdvwighjiiaj)
--   • DEPOIS subir o código (crm-leads v1.24 + RespostasTab v2.0).
--     Inverter a ordem causaria erro 500 no listar_threads (coluna
--     inexistente).
--
-- Reversão:
--   ALTER TABLE email_respostas
--     DROP COLUMN IF EXISTS bcc_corporativo_em,
--     DROP COLUMN IF EXISTS enviado_por,
--     DROP COLUMN IF EXISTS in_reply_to_message_id,
--     DROP COLUMN IF EXISTS message_id,
--     DROP COLUMN IF EXISTS direcao;
--   DROP INDEX IF EXISTS idx_resp_lead_camp_data;
--   DROP INDEX IF EXISTS idx_resp_message_id;
-- ============================================================

-- ── 1. AUDITORIA PRÉ-MIGRAÇÃO (apenas leitura) ───────────────
SELECT
  COUNT(*) AS total_respostas_existentes,
  MIN(recebido_em) AS primeira_resposta,
  MAX(recebido_em) AS ultima_resposta
FROM email_respostas;

-- ── 2. ALTER TABLE — adiciona 5 colunas ──────────────────────
ALTER TABLE email_respostas
  ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to_message_id TEXT,
  ADD COLUMN IF NOT EXISTS enviado_por INTEGER,
  ADD COLUMN IF NOT EXISTS bcc_corporativo_em TIMESTAMPTZ;

-- ── 3. CHECK constraint ──────────────────────────────────────
-- Garante que somente os 2 valores aceitos entram na coluna.
-- IF NOT EXISTS protege contra reaplicações.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_respostas_direcao_check'
  ) THEN
    ALTER TABLE email_respostas
      ADD CONSTRAINT email_respostas_direcao_check
      CHECK (direcao IN ('inbound', 'outbound'));
  END IF;
END $$;

-- ── 4. FOREIGN KEY enviado_por → app_users ───────────────────
-- Soft-FK (ON DELETE SET NULL): se o usuário for desativado/excluído
-- no futuro, a mensagem fica preservada como histórico — coerente
-- com a política LGPD eterna para conversas comerciais.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_respostas_enviado_por_fkey'
  ) THEN
    ALTER TABLE email_respostas
      ADD CONSTRAINT email_respostas_enviado_por_fkey
      FOREIGN KEY (enviado_por) REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 5. ÍNDICES ───────────────────────────────────────────────
-- 5.1 — Lookup principal do listar_threads (agrupa por lead+campanha
--       ordenando pelas mais recentes primeiro).
CREATE INDEX IF NOT EXISTS idx_resp_lead_camp_data
  ON email_respostas (lead_id, campanha_id, recebido_em DESC);

-- 5.2 — Lookup do reverso Exchange (P5): localizar thread pelo
--       header In-Reply-To/References quando o GC/SDR responde
--       pelo Outlook copiando crm-reverso@...
CREATE INDEX IF NOT EXISTS idx_resp_message_id
  ON email_respostas (message_id) WHERE message_id IS NOT NULL;

-- ── 6. AUDITORIA PÓS-MIGRAÇÃO ────────────────────────────────
-- Confirma que TODAS as linhas têm direcao='inbound' (preservação
-- semântica do estado pré-existente).
SELECT
  direcao,
  COUNT(*) AS total,
  COUNT(message_id) AS com_message_id,
  COUNT(in_reply_to_message_id) AS com_in_reply_to,
  COUNT(enviado_por) AS com_enviado_por
FROM email_respostas
GROUP BY direcao;

-- ── 7. VALIDAÇÃO DE ESTRUTURA ────────────────────────────────
-- Confirma que as 5 colunas foram criadas com os tipos corretos.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'email_respostas'
  AND column_name IN (
    'direcao', 'message_id', 'in_reply_to_message_id',
    'enviado_por', 'bcc_corporativo_em'
  )
ORDER BY ordinal_position;

-- ── 8. COMMENT ON COLUMN (documentação inline) ───────────────
COMMENT ON COLUMN email_respostas.direcao IS
  'Direção da mensagem: inbound (resposta do lead, fluxo legado v1.0+) | outbound (resposta enviada pelo RAISA via aba CRM E-mail, v1.24+)';

COMMENT ON COLUMN email_respostas.message_id IS
  'Message-ID retornado pela Resend ao enviar (outbound) ou capturado do header da resposta (inbound). Usado para threading SMTP e para o reverso Exchange (crm-reverso@) localizar a thread.';

COMMENT ON COLUMN email_respostas.in_reply_to_message_id IS
  'Message-ID da mensagem-pai a qual esta responde. Forma a cadeia de threading visível no cliente do lead (Outlook/Gmail agrupam por References/In-Reply-To).';

COMMENT ON COLUMN email_respostas.enviado_por IS
  'FK para app_users — somente para outbound (quem digitou e clicou Enviar). NULL para inbound (a resposta veio do lead, não de um operador).';

COMMENT ON COLUMN email_respostas.bcc_corporativo_em IS
  'Timestamp do envio da cópia BCC para o email corporativo do GC/SDR (item 4 do pedido do Messias — manter Exchange sincronizado).';
