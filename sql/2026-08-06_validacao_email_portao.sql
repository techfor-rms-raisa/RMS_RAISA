-- ════════════════════════════════════════════════════════════════════════════
-- Migração: Portão de validação de e-mail — colunas em email_leads
-- Data:      2026-08-06
-- Autor:     Messias / Claude
-- Caminho:   sql/2026-08-06_validacao_email_portao.sql
-- Pareada:   lib/validacao-lead.ts v1.0
--            api/crm-leads.ts v1.23
--
-- ────────────────────────────────────────────────────────────────────────────
-- MOTIVAÇÃO — 13,5% de bounce histórico (395 em 2.932 envios)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Medição em Produção (06/08/2026), por origem do lead:
--
--   origem                          leads  enviados  bounces  taxa
--   ------------------------------  -----  --------  -------  -----
--   importacao_manual                 770     1.905      254  13,3%
--   revalidacao_importacao_lista      445       908      130  14,3%
--   prospect_engine                   269         8        0   0,0%
--                                                    -------
--                                    TOTAL     2.932      395  13,5%
--
-- O teto tolerado pelos provedores (Gmail/Yahoo/Outlook) é 5%.
--
-- DIAGNÓSTICO: leads do prospect_engine passam pela cascade de validação
-- (lib/validate-emails.ts → local/Hunter/Snov.io) e não bounceiam. Leads de
-- importação entram na base SEM NENHUMA verificação de entregabilidade.
--
-- O portão `apto_campanha` valida INTENÇÃO COMERCIAL (curadoria da SDR), não
-- ENTREGABILIDADE. São dimensões ortogonais — faltava a segunda.
--
-- No fluxo de retorno (aba Inválidos), o botão "Promover" destrava por
-- `bounced === false`. Como editar o e-mail zera o flag, basta digitar
-- qualquer endereço para liberar o reenvio. Trava passiva, não portão.
--
-- ────────────────────────────────────────────────────────────────────────────
-- DECISÃO DE PRODUTO (Messias — 06/08/2026)
-- ────────────────────────────────────────────────────────────────────────────
--
--   "Liberar com aviso, e ficar registrado o Risco — pois exigir score 100%
--    vai parar o processo de prospecção."
--
-- Mapeamento no ValidateScore de lib/validate-emails.ts:
--
--   score       semântica                        portão      risco
--   ----------  -------------------------------  ----------  ------
--   verified    Hunter: deliverable              ✅ libera    false
--   probable    catch-all / accept_all           ⚠️ libera    TRUE
--   risky       cascade esgotada, inconclusivo   ⚠️ libera    TRUE
--   invalid     Hunter: undeliverable            🔴 BLOQUEIA  true
--
-- ⚠️  SÓ `invalid` BLOQUEIA — e bloqueia porque é COMPROVADAMENTE morto, não
--     por ser inconclusivo. Domínios catch-all são a maioria no B2B
--     brasileiro e são INVERIFICÁVEIS por natureza: nenhuma API consegue
--     dizer se o endereço existe. Bloquear `probable` pararia a prospecção
--     sem ganho real de entregabilidade.
--
-- ────────────────────────────────────────────────────────────────────────────
-- AS 4 COLUNAS
-- ────────────────────────────────────────────────────────────────────────────
--
--   email_validacao_score   O veredito. NULL = nunca validado.
--   email_validacao_fonte   Quem decidiu (local/hunter/snovio/none).
--                           Auditoria de custo: 'hunter' e 'snovio'
--                           consumiram crédito; 'local' foi cache.
--   email_validado_em       Base do TTL. Sem ele, um `verified` de janeiro
--                           autorizaria envio em dezembro.
--   email_validacao_risco   Materializa a decisão de produto: o lead PASSOU,
--                           mas está marcado. Base para relatório de risco
--                           por campanha e para o badge âmbar na UI.
--
-- 🛡️  `email_validacao_risco` é REDUNDANTE em relação a `score` (é derivável
--     por score IN ('probable','risky')). A redundância é DELIBERADA: permite
--     índice parcial e filtro barato em relatório, sem CASE em toda query.
--     A consistência é garantida no ponto único de escrita (lib/validacao-lead.ts).
--
-- ────────────────────────────────────────────────────────────────────────────
-- TTL — 90 DIAS
-- ────────────────────────────────────────────────────────────────────────────
--
-- Validação vencida é tratada como ausente e dispara nova cascade. Pessoas
-- trocam de emprego; domínios são desativados. 90 dias equilibra frescor e
-- consumo de créditos (Hunter/Snov.io).
--
-- ⚠️  O TTL vive em lib/validacao-lead.ts (TTL_DIAS), não aqui. Esta migração
--     apenas persiste o timestamp.
--
-- ────────────────────────────────────────────────────────────────────────────
-- APLICAÇÃO
-- ────────────────────────────────────────────────────────────────────────────
--   Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--   Não destrutivo: nenhum DROP/UPDATE/DELETE. Colunas nascem NULL —
--   nenhum lead existente é alterado.
--
--   ⚠️  APLICAR ANTES do deploy de crm-leads.ts v1.23. Sem as colunas,
--       o backend falha ao gravar o resultado da validação.
--
--   Rodar por blocos (o SQL Editor executa só o texto selecionado).
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- BLOCO 1 — Colunas
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.email_leads
    ADD COLUMN IF NOT EXISTS email_validacao_score  text,
    ADD COLUMN IF NOT EXISTS email_validacao_fonte  text,
    ADD COLUMN IF NOT EXISTS email_validado_em      timestamptz,
    ADD COLUMN IF NOT EXISTS email_validacao_risco  boolean NOT NULL DEFAULT false;


-- ─────────────────────────────────────────────────────────────
-- BLOCO 2 — Integridade de domínio
-- ─────────────────────────────────────────────────────────────

-- Impede que um valor fora do enum de ValidateScore entre por engano
-- (ex.: 'valido', 'ok', 'deliverable'). NOT VALID para não varrer a tabela
-- na aplicação; linhas existentes são todas NULL e passariam de qualquer forma.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'email_leads_validacao_score_chk'
    ) THEN
        ALTER TABLE public.email_leads
            ADD CONSTRAINT email_leads_validacao_score_chk
            CHECK (email_validacao_score IS NULL
                   OR email_validacao_score IN ('verified','probable','risky','invalid'))
            NOT VALID;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- BLOCO 3 — Índices
-- ─────────────────────────────────────────────────────────────

-- Suporta o portão: "este lead tem validação vigente?"
CREATE INDEX IF NOT EXISTS idx_email_leads_validacao
    ON public.email_leads (email_validacao_score, email_validado_em);

-- Índice PARCIAL para o relatório de risco. Só leads em risco entram —
-- minoria esperada, índice pequeno.
CREATE INDEX IF NOT EXISTS idx_email_leads_validacao_risco
    ON public.email_leads (id)
    WHERE email_validacao_risco = true;


-- ─────────────────────────────────────────────────────────────
-- BLOCO 4 — Documentação
-- ─────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.email_leads.email_validacao_score IS
'Veredito da cascade lib/validate-emails.ts: verified|probable|risky|invalid. NULL = nunca validado. Só invalid bloqueia vínculo a campanha (decisão Messias 06/08/2026).';

COMMENT ON COLUMN public.email_leads.email_validacao_fonte IS
'Motor que decidiu: local (cache, custo 0) | hunter (1 crédito) | snovio (1 token) | none (cascade esgotada). Auditoria de consumo.';

COMMENT ON COLUMN public.email_leads.email_validado_em IS
'Timestamp da validação. Base do TTL de 90 dias (lib/validacao-lead.ts). Validação vencida é tratada como ausente.';

COMMENT ON COLUMN public.email_leads.email_validacao_risco IS
'true quando score IN (probable, risky) — lead LIBERADO mas com risco registrado. Materializa a decisão de produto de 06/08/2026: não travar a prospecção por inconclusivo, mas deixar o risco visível e auditável.';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 5 — VERIFICAÇÃO (read-only, rodar após aplicar)
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'email_leads'
  AND column_name LIKE 'email_valida%'
ORDER BY ordinal_position;

-- ✅ ACEITE: 4 linhas.
--    email_validacao_score  | text        | YES | null
--    email_validacao_fonte  | text        | YES | null
--    email_validado_em      | timestamptz | YES | null
--    email_validacao_risco  | boolean     | NO  | false


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCO 6 — DIMENSIONAMENTO DA BASE LEGADA (read-only)
--            Quantos leads precisarão de validação e quanto isso custa.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
    coalesce(el.origem, '(sem origem)')                        AS origem,
    count(*)                                                   AS leads,
    count(*) FILTER (WHERE el.email_validado_em IS NULL)       AS nunca_validados,
    count(*) FILTER (WHERE el.bounced)                         AS ja_bounced,
    count(*) FILTER (WHERE el.apto_campanha)                   AS aptos_campanha
FROM public.email_leads el
WHERE coalesce(el.opt_out, false) = false
GROUP BY 1
ORDER BY leads DESC;

-- 📌 `nunca_validados` × 1 crédito = custo aproximado da validação em lote.
--    O cache local (etapa 1 da cascade) atende parte sem consumir crédito,
--    então o custo real tende a ser MENOR que esse número.


-- ════════════════════════════════════════════════════════════════════════════
-- PRÓXIMAS ENTREGAS DESTA FRENTE
-- ════════════════════════════════════════════════════════════════════════════
--
--  ✅ Fase 1/2 — backend: lib/validacao-lead.ts + portão em crm-leads v1.23
--  🔜 Fase 1 — UI: botão "Validar" na aba Inválidos (InvalidosTab v1.4)
--  🔜 Fase 3 — job de validação em lote da base legada (~1.200 leads)
--
-- ════════════════════════════════════════════════════════════════════════════
