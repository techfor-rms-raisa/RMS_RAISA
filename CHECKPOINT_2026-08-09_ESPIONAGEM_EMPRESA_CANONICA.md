# CHECKPOINT — 09/08/2026 — Espionagem Estratégica: Empresa Canônica (Sessão 5)

## Contexto da sessão

Messias reportou incongruência no módulo Espionagem Estratégica (Production):
o cliente **CVC** exibia números diferentes por concorrente — na Talentfour
mostrava "Camp 1 · Abord 1" com 0 prospectados; na Taking, tudo zerado.
Requisito de produto firmado: **um mesmo cliente-empresa deve exibir os
mesmos números em qualquer concorrente que o possua na carteira.**

## Diagnóstico (causa raiz)

Consulta diagnóstica em Production confirmou:

| id | concorrente | cliente | dominios | chave_busca |
|----|-------------|---------|----------|-------------|
| 51 | Taking | CVC | {cvc.com.br} | NULL |
| 16 | Talentfour | CVC | {cvc.com.br, cvccorp.com.br} | NULL |

1. **Cadastro duplicado por concorrente**: `espionagem_concorrente_clientes`
   guardava `dominios`/`chave_busca` por vínculo. A descoberta Gemini é
   não-determinística → mesma empresa nascia com domínios divergentes.
2. **Siglas descartadas em silêncio**: a RPC exigia `length(chave) >= 4`
   para o match por nome no Prospect Engine — CVC, UOL, LEV etc. nunca
   davam match por nome.

## Solução entregue — Empresa Canônica

### Schema v2 (`2026-08-09_espionagem_empresa_canonica.sql`)
- 🆕 Tabela **`espionagem_empresas`** (fonte única de verdade: nome,
  dominios TEXT[], chave_busca). Unicidade por `lower(trim(nome))`.
- `espionagem_concorrente_clientes` ganhou **`empresa_id`** (FK) e passou a
  ser apenas o VÍNCULO concorrente ↔ empresa. Colunas legadas
  dominios/chave_busca mantidas como fallback defensivo (não são mais
  fonte de verdade).
- Índices: `ux_esp_empresas_nome`, `ix_esp_clientes_empresa`,
  `ux_esp_vinculo_conc_empresa (concorrente_id, empresa_id) WHERE empresa_id IS NOT NULL`.
- **Backfill idempotente**: agrupa vínculos por `lower(nome)`, cria a
  canônica com UNION dos domínios de todos os concorrentes e liga os
  vínculos. Resultado CVC: 1 empresa com {cvc.com.br, cvccorp.com.br}
  servindo Taking e Talentfour.

### RPC — v3 e hotfix v4 (`2026-08-09_espionagem_rpc_v4_performance.sql`)
- v3: dominios/chave lidos da canônica (LEFT JOIN + coalesce p/ legado);
  **siglas 2–3 chars alfanuméricos** passam a fazer match por palavra
  inteira (`~* '\yCVC\y'`) no `empresa_nome` do Prospect Engine.
- ⚠️ **Regressão v3 → corrigida na v4**: a v3 foi construída sobre o schema
  de 07/08 (anterior ao fix de timeout da v2) e reintroduziu JOINs com
  `OR + = ANY(array) + IN (subquery)` → nested loop → erro **57014
  statement timeout** em Production.
- **v4 (vigente)**: restaura o padrão de performance da v2 — CTE
  `dominio_map` (unnest plano cliente_id × dominio) e ORs decompostos em
  ramos **UNION ALL com equi-joins hasheáveis** (1 seq scan por tabela
  grande). Flag `email_corporativo` consolidada via `bool_or`. Shape do
  jsonb e assinatura inalterados.

### Backend — `api/crm-espionagem.ts` v2.0
- `adicionar_clientes`: upsert na empresa canônica
  (`upsertEmpresaCanonica`: merge/UNION de domínios; chave_busca só
  preenche se vazia; corrida 23505 tratada com re-fetch) + cria/reativa o
  vínculo por (concorrente_id, empresa_id); adota vínculos legados sem
  empresa_id.
- `detalhe_concorrente` / `descobrir_clientes`: leem via embed
  `espionagem_empresas(...)` e devolvem ACHATADO no mesmo shape
  (`achatarCliente`) — **frontend 100% intacto**.
- `atualizar_cliente`: `ativo` → vínculo (remoção lógica só naquele
  concorrente); `nome`/`dominios`/`chave_busca` → empresa canônica
  (propaga a todos os concorrentes). Whitelists separadas:
  `CAMPOS_VINCULO_CLIENTE` / `CAMPOS_EMPRESA_CLIENTE`.
- Helper `escapeIlike` (curingas % e _ escapados nos matches por nome).

## Validação em Production (09/08/2026)

- Bloco 5.1: CVC = 1 empresa canônica, {cvc.com.br, cvccorp.com.br},
  vinculada a Taking e Talentfour ✅
- Bloco 5.2: `vinculos_sem_empresa = 0` ✅
- Smoke test RPC v4 (Taking): **CVC → 4 prospectados, 6 leads CRM,
  1 campanha, 3 abordagens** (antes: tudo 0). Cobertura Taking:
  40% → **73,3%**. Sem timeout ✅

## Estado dos ambientes

- **Production** (`wuejqxijjjdvwighjiiaj`): schema v2 + RPC v4 aplicados;
  backend v2.0 deployado via `main`. ✅ validado por Messias.
- **Preview** (`smuikbkjfuggtcmkurqh`): aplicar os mesmos blocos da RPC v4
  para paridade (schema v2 já aplicado na sessão).

## Lições da sessão (para regras permanentes)

1. **Fonte de verdade de RPCs em produção**: antes de reescrever uma RPC,
   extrair a versão VIGENTE do banco (`pg_get_functiondef`) — arquivos de
   migração antigos no repo/Knowledge podem ser anteriores a hotfixes
   (Regra 17 vale também para objetos de banco, não só arquivos de código).
2. **Padrão anti-timeout consolidado**: em cruzamentos com arrays de
   domínios, NUNCA usar `JOIN ... ON x = ANY(array) OR ... IN (subquery)`.
   Sempre: unnest em CTE plana + ramos UNION ALL com equi-joins.
3. Match por nome de empresa: >= 4 chars ILIKE substring; 2–3 chars
   alfanuméricos regex `\y...\y` (word boundary) — nunca descartar em
   silêncio.

## Pendências / Próximos passos

- [ ] Aplicar RPC v4 no Preview (paridade)
- [ ] (Backlog UX/Negócios) chip "disputado" no card quando a empresa
      canônica pertence a 2+ concorrentes — dado já disponível via
      empresa_id; requer aprovação de layout (Regra 9)
- [ ] (Backlog curadoria) mesclar canônicas com nomes distintos da mesma
      empresa (ex.: "CVC" × "CVC Corp") — hoje geram 2 canônicas
- Demais pendências gerais do projeto inalteradas (Sub-fase 3.B, TTL
  R1–R5, Camada D, Apollo key, governance patch, etc.)

## Arquivos da sessão

| Arquivo | Caminho | Versão |
|---------|---------|--------|
| 2026-08-09_espionagem_empresa_canonica.sql | migrações (raiz do repo) | Schema v2 + RPC v3 |
| 2026-08-09_espionagem_rpc_v4_performance.sql | migrações (raiz do repo) | RPC v4 (vigente) |
| crm-espionagem.ts | api/crm-espionagem.ts | v2.0 |
| EspionagemPage.tsx | src/components/espionagem/EspionagemPage.tsx | v1.0 (inalterado) |
