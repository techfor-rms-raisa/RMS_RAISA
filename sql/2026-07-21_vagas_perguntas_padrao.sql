-- ============================================================
-- Migration: 2026-07-21_vagas_perguntas_padrao.sql
-- Módulo: Ranqueamento de Candidatos (RAISA)
-- ------------------------------------------------------------
-- Objetivo:
--   Dar um "lar" às PERGUNTAS PADRONIZADAS por vaga.
--   Decisão de arquitetura (Messias, 21/07/2026): todos os
--   candidatos de uma mesma vaga respondem exatamente às mesmas
--   perguntas técnicas, garantindo score COMPARÁVEL no ranking.
--
--   Solução definitiva (sem tabela nova para relação 1:1):
--   coluna jsonb em `vagas`, espelhando o padrão já existente
--   em `analise_adequacao.perguntas_entrevista`.
--
-- Estrutura esperada de `perguntas_padrao` (mesmo shape usado
-- pela Entrevista Técnica Inteligente):
--   [
--     {
--       "categoria": "Requisito Obrigatório - ...",
--       "icone": "💻",
--       "perguntas": [
--         {
--           "pergunta": "...",
--           "objetivo": "...",
--           "o_que_avaliar": ["...","..."],
--           "red_flags": ["...","..."]
--         }
--       ]
--     }
--   ]
--
-- Aplicar em: Preview PRIMEIRO, validar, depois Production.
-- Idempotente (IF NOT EXISTS) — seguro reexecutar.
-- ============================================================

ALTER TABLE vagas
  ADD COLUMN IF NOT EXISTS perguntas_padrao jsonb;

ALTER TABLE vagas
  ADD COLUMN IF NOT EXISTS perguntas_padrao_geradas_em timestamptz;

COMMENT ON COLUMN vagas.perguntas_padrao IS
  'Perguntas técnicas padronizadas da vaga (jsonb). Idênticas para todos os candidatos, garantindo score comparável no Ranqueamento. Mesmo shape de analise_adequacao.perguntas_entrevista.';

COMMENT ON COLUMN vagas.perguntas_padrao_geradas_em IS
  'Timestamp da última geração das perguntas padronizadas da vaga.';
