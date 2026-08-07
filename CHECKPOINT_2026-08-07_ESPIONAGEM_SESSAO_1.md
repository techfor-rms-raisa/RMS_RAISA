# CHECKPOINT — Espionagem Estratégica · Sessão 1 (Concepção)
**Data:** 2026-08-07 · **Status:** Mockup entregue, aguardando aprovação (Regra 9)

## Contexto de origem
Nasceu da análise "Penetração RMS × carteira Talentfour" (07/08/2026): relatório SQL de
cruzamento de domínios + slide hierárquico PPT. Objetivo: transformar em módulo permanente
de inteligência competitiva.

## Decisões de produto (fechadas)
- **Escopo v1:** completa — modo Manual + Descoberta automática via Gemini Search Grounding
- **Q1 Acesso:** módulo próprio, item novo no Sidebar ("Espionagem")
- **Q2 RBAC:** Administrador + Gestão Comercial + SDR
- **Q3 Histórico:** snapshots por execução já na v1; chip "novo na carteira" + Δ entre as 2 análises mais recentes

## Modelo de dados (a criar na Sessão 2)
1. `espionagem_concorrentes` — id, nome, website, dominio, origem (auto|manual), status, criado_por/em
2. `espionagem_concorrente_clientes` — concorrente_id, nome, dominio (permite variantes múltiplas
   por cliente), origem_descoberta (site|gemini|manual), descoberto_em, ativo
3. `espionagem_analises` — concorrente_id, executado_em, executado_por, resultado jsonb, totais
   (prospectados, leads_crm, campanhas, abordagens, cobertura_pct)

## Motor de cruzamento (RPC — Sessão 2)
- `espionagem_analisar_concorrente(p_concorrente_id)` → `RETURNS jsonb` (jsonb_agg — bypassa limite 1.000 linhas)
- Fontes: email_empresas (nome/dominio) + email_leads (domínio do e-mail) + prospect_leads (nome/dominio/e-mail, aberto por status)
- Lições incorporadas: domínios variantes por cliente; e-mails pessoais contam como prospectados;
  excluir prospect_leads status='descartado'; contagem de e-mails corporativos vs pessoais (penetrabilidade)

## Indicadores do resultado
Por conta: prospectados, campanhas, abordagens, respostas, e-mails corporativos, recência (frio +90d),
"novo na carteira" (Δ). Globais: totais + % cobertura da carteira.

## Fluxo Gemini (Sessão 3)
Site do concorrente → Gemini Search Grounding extrai carteira (páginas clientes/cases/parceiros) →
lista com checkboxes → NADA é gravado sem confirmação do usuário (human-in-the-loop).
Marcar duplicados já cadastrados. Padrão técnico: prospect-gemini-search.ts
(gemini-2.5-flash, maxOutputTokens 8192, thinkingBudget 4096, prompt estilo v1.6 sem proibições excessivas).

## Ações de saída (Resultado)
Exportar PPT da análise · Reexecutar cruzamento · Gerar alvos no Prospect Engine (fecha o ciclo)

## Arquivos aguardados do Messias (versões atuais do disco — Regra 17)
1. src/App.tsx
2. src/components/layout/Sidebar.tsx
3. src/components/crm/types/crm.types.ts
4. src/components/crm/types/crm.constants.ts
5. src/components/crm/shared/hooks/useCrmApi.ts
6. src/components/crm/base-leads/BaseLeadsPage.tsx (referência de padrão)
7. api/prospect-gemini-search.ts
8. api/crm-config.ts (padrão de endpoint)

## Plano de sessões
- **S1 (07/08) ✅** Mockup + decisões — mockup_espionagem_estrategica.html
- **S2** SQL migrations (3 tabelas + RPC jsonb) + api/crm-espionagem.ts (CRUD + análise) — ~4h
- **S3** Descoberta Gemini + confirmação — ~3h
- **S4** Frontend (EspionagemPage + modal resultado hierárquico) + smoke test Preview — ~4h

## Convenções
Backend com prefixo de módulo: `crm-espionagem.ts`. RPC com DROP FUNCTION IF EXISTS + NOTIFY pgrst.
Migrations idempotentes, aplicadas antes do deploy. RBAC verificado no backend (não só UI).
