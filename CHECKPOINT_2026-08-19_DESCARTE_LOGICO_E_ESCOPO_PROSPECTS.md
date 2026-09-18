# CHECKPOINT — 19/08/2026
## Descarte lógico do lead importado + Correção de escopo do modal "Importar Prospects"

**Sessão:** Messias (PO) + Claude (DEV / DBA / Riscos)
**Ambientes tocados:** Preview e Production
**Migrations:** 1 (backfill de dados, sem DDL)

---

## ⚠️ AÇÃO PENDENTE ANTES DE QUALQUER COISA

**Production está sem a Entrega 1.** Ao final da sessão, o bloco de *rollback de emergência* foi executado por engano no lugar do bloco de release:

```
[main 5102eda2] Revert "Merge branch 'preview'"
 5 files changed, 20 insertions(+), 550 deletions(-)
 delete mode 100644 src/components/crm/base-leads/DescartarLeadImportadoModal.tsx
```

O merge do descarte lógico foi desfeito. Nenhum dado foi perdido — o revert atingiu só o código, e a branch `preview` está íntegra.

**Correção (reverter o revert):**

```powershell
git checkout main
git pull origin main --no-rebase
git revert 5102eda2 --no-edit
git log --oneline -3
git push origin main
git checkout preview
```

> **Não funciona refazer o merge do `preview`.** Para o Git aquele merge já consta no histórico da `main`; um novo merge traria apenas commits posteriores. O único caminho é reverter o commit de revert.

**Validação após o deploy** (`techfortirms.online` › Base de Leads › Leads Importados): lixeira vermelha na coluna Ações e checkbox "Ver descartados" devem reaparecer. Os leads descartados durante o teste continuam com `status='descartado'` e voltam a ser listados pelo filtro.

---

## ENTREGA 1 — Descarte lógico do lead importado

**Status:** ✅ Codificado, testado em Production, **revertido por engano** (ver acima).

Espelha o comportamento já existente na aba "Meus Prospects Salvos" do Prospect Engine: o lead sai da listagem sem ser apagado do banco e volta pelo filtro "Ver descartados".

| Arquivo | Versão | Mudança |
|---|---|---|
| `api/revalidacao-leads-importados.ts` | 1.7 | Param `ver_descartados`; listagem exclui `status='descartado'` |
| `src/components/crm/shared/hooks/useLeadsImportados.ts` | 1.6 | Estado `verDescartados`; ações `descartar()` / `restaurar()` |
| `src/components/crm/base-leads/LeadsImportadosTab.tsx` | 1.6 | Botão lixeira, filtro, banner, botão Restaurar, empty state próprio |
| `src/components/crm/base-leads/DescartarLeadImportadoModal.tsx` | 1.0 | **Arquivo novo** — modal de confirmação |
| `src/components/crm/base-leads/BaseLeadsPage.tsx` | 1.21 | Wiring do modal + refetch ao alternar o filtro |

### Decisões de arquitetura

**A escrita reaproveita `PATCH /api/prospect-leads`** (v1.2) com `excluir_logico: true` / `restaurar: true`, em vez de criar operação nova em `revalidacao-leads-importados`. A trava de integridade (`status='no_crm'` → HTTP 409) já vive lá; duplicá-la geraria duas fontes de verdade que divergiriam na primeira manutenção.

**Só a LEITURA mudou no endpoint da aba.** `status` (novo / no_crm / descartado) é coluna **diferente** de `status_atualizacao` (o dropdown da aba). Sem o filtro novo, o lead descartado continuaria listado e o botão pareceria quebrado.

**Sem migration:** `status`, `atualizado_em` e `atualizado_por` já existiam em `prospect_leads`.

**Exclusão lógica, nunca DELETE físico:** `email_leads.prospect_lead_id` é `ON DELETE SET NULL` (perderia rastreabilidade) e `prospect_revalidacao_log` é `ON DELETE CASCADE` (apagaria o histórico de revalidação).

---

## ENTREGA 2 — Escopo do modal "Importar Prospects"

**Status:** ✅ Em Preview. Botão ocultado ao final da sessão (ver Entrega 3).

### O problema

O modal chamava `GET /api/prospect-leads?status=novo&limit=200`. Sem `origem` e sem `reservado_por`, com quatro consequências:

1. **Entravam EMPRESAS no lugar de pessoas.** Os filtros estruturais do backend só rodam dentro do bloco `origem === 'leads'`. `motor cv_*` identifica **empresas** extraídas de currículo — eram 4.562 registros elegíveis a um modal de importação de leads.
2. **Entravam leads de planilha.** `motor='importacao_lista'` (1.052 registros) tem aba própria com revalidação, cota e anti-duplicidade. Promovê-los pelo modal contornava todo esse fluxo.
3. **Entravam prospects de outros analistas.** Sem `reservado_por`, listava a base inteira da equipe.
4. **`limit` era ignorado.** Teto fixo de `.limit(500)` no backend. Com 7.302 registros em `status='novo'`, **93% da base era descartada silenciosamente** — a lista era uma fatia arbitrária dos mais recentes.

### Composição diagnosticada (`status='novo'`)

| Categoria | Registros | Destino |
|---|---|---|
| `cv_*` (empresas) | 4.562 | Fora — aba Lista Empresas |
| `importacao_lista` | 1.052 | Fora — aba Leads Importados |
| **gemini + apollo + extension** | **1.688** | **Universo real do modal** |

Dos 1.688, apenas 1.120 tinham e-mail e **somente 96 tinham dono**.

### Causa raiz do "sem dono"

| Caminho | Grava `reservado_por`? |
|---|---|
| `api/prospect-save.ts` (Nova Busca → Salvar) | ✅ Sim |
| `api/prospect-apollo-search.ts` | N/A — **não faz INSERT**, só consulta a API |
| `api/prospect-email-finder.ts` | N/A — wrapper sobre `lib/email-finder.ts` |
| `api/prospect-capture.ts` (Chrome Extension) | ❌ **Não** — vazamento ativo, corrigido nesta sessão |

Os 942 órfãos de gemini/apollo são **legado** anterior à correção do `prospect-save`. Os 82 da Extension estavam sendo gerados continuamente.

### Correção aplicada

| Arquivo | Versão | Mudança |
|---|---|---|
| `src/components/crm/shared/hooks/useImportProspects.ts` | 1.1 | Query passa a `?origem=leads&status=novo&reservado_por={userId}&limit=500`; aborta a carga sem `userId` |
| `api/prospect-leads.ts` | 1.3 | Param `limit` respeitado (default 500, teto 2.000) |
| `api/prospect-capture.ts` | 2.2 | INSERT da Extension grava `reservado_por` + `reservado_em` |
| `src/components/crm/base-leads/BaseLeadsPage.tsx` | 1.22 | Passa `userId` ao hook |
| `sql/2026-08-19_backfill_prospect_leads_reservado_por.sql` | — | **Novo** — backfill de 1.024 órfãos |

**`origem=leads` reaproveita os filtros do backend** em vez de duplicar a regra no frontend: se a definição de "lead de prospecção" mudar, muda num lugar só.

### Backfill

`reservado_por = buscado_por` para prospects órfãos, excluindo `cv_*` e `importacao_lista`. `reservado_em` retroage a `criado_em` (é quando o vínculo passou a existir; `now()` falsearia a antiguidade das carteiras).

Diagnóstico prévio: **1.024 órfãos, 1.024 recuperáveis (100%)**, distribuídos em 5 usuários. Executado em Production e replicado em Preview.

> ⏳ **Validar com o Bloco 3 do script** — `orfaos_restantes` deve estar zerado em ambos os ambientes.

**Ordem obrigatória:** SQL **antes** do deploy. Com o código no ar e o backfill pendente, o modal fica vazio.

---

## ENTREGA 3 — Botão "Importar Prospects" oculto

**Status:** ✅ Em Preview.

| Arquivo | Versão | Mudança |
|---|---|---|
| `src/components/crm/base-leads/BaseLeadsPage.tsx` | 1.23 | Feature flag `MOSTRAR_IMPORTAR_PROSPECTS = false` |

**Motivo:** após a v1.22 restringir a listagem à carteira do próprio usuário, a tela do Messias caiu de 475 para 6 itens — tecnicamente correto, mas contraintuitivo para quem via a base inteira da equipe até então. Gerou confusão no time comercial.

**Feature flag em vez de remoção do bloco JSX:** religar é trocar `false` por `true` numa linha, sem risco de reconstruir o botão errado semanas depois. Hook, modal, states, handlers e a action `importar_prospects` do backend permanecem íntegros.

### Por que a tela mostrou 6 de 35

Não era bug. Os 35 da aba "Meus Prospects Salvos" incluem todos os status; o modal filtra `status='novo'` **e** exige e-mail:

| Recorte | Aba | Modal |
|---|---|---|
| `novo` **com** e-mail | ✅ | ✅ — os 6 |
| `exportado` com e-mail | ✅ | ❌ |
| Qualquer status **sem** e-mail | ✅ | ❌ |

O filtro `status=novo` é da v1.0 do hook (maio/2026) — não foi introduzido nesta sessão. Ele só ficou visível quando a consulta parou de trazer a base da equipe inteira.

---

## PENDÊNCIAS ABERTAS

| # | Pendência | Bloqueia |
|---|---|---|
| 1 | **Reverter o revert em Production** (comandos no topo) | Entrega 1 fora do ar |
| 2 | **Validar o backfill** com o Bloco 3 do SQL em ambos os ambientes | Confiança no dado |
| 3 | **`novo` vs `exportado`** no modal — "exportado" marca saída em planilha, não presença no CRM (isso é `no_crm`). No Prospect Engine esses leads seguem com "+ Campanhas" ativo. Se o modal é o caminho equivalente, deveria aceitar os dois | Religar o botão |
| 4 | **Texto do empty state do modal** — proposta pendente de aprovação: *"Nenhum prospect seu disponível para importação / Só aparecem aqui os prospects reservados para você, com e-mail e ainda não promovidos."* | Religar o botão |
| 5 | **"Descartado por {nome}"** na aba Leads Importados — hoje mostra só a data. O nome exigiria join com `app_users` no endpoint | Nada |

---

## APRENDIZADOS

**Git — reverter um merge não pode ser desfeito com um novo merge.** Após `git revert -m 1 <merge>`, a `main` considera o merge já integrado; refazê-lo não traz o código de volta. O único caminho é `git revert <commit-do-revert>`. Blocos de rollback de emergência devem vir visualmente separados dos blocos de release para não serem copiados por engano.

**Colunas homônimas em camadas diferentes são armadilha.** `status` e `status_atualizacao` convivem em `prospect_leads` com semânticas distintas. O filtro exposto na UI usava a segunda; o descarte grava na primeira. Sem inspecionar as duas, o botão teria ido para Production parecendo quebrado.

**Filtro estrutural condicionado a parâmetro opcional vaza.** Em `prospect-leads.ts`, as exclusões de `cv_*` e `importacao_lista` só rodam sob `origem === 'leads'`. Qualquer chamador que esquecesse o param recebia a tabela inteira — e foi exatamente o que aconteceu por meses no modal de importação.

**Parâmetro aceito e ignorado é pior que parâmetro inexistente.** `limit=200` era enviado desde maio sem nenhum efeito, criando a ilusão de controle enquanto 93% da base era cortada em silêncio.

**Dado revela processo.** A distribuição de `reservado_por` expôs um caminho de gravação (Chrome Extension) que nunca atribuiu dono — invisível na UI porque a tela que o denunciaria também não filtrava por propriedade.

---

## VERSÕES FINAIS

| Arquivo | Versão |
|---|---|
| `api/revalidacao-leads-importados.ts` | 1.7 |
| `api/prospect-leads.ts` | 1.3 |
| `api/prospect-capture.ts` | 2.2 |
| `src/components/crm/shared/hooks/useLeadsImportados.ts` | 1.6 |
| `src/components/crm/shared/hooks/useImportProspects.ts` | 1.1 |
| `src/components/crm/base-leads/LeadsImportadosTab.tsx` | 1.6 |
| `src/components/crm/base-leads/DescartarLeadImportadoModal.tsx` | 1.0 (novo) |
| `src/components/crm/base-leads/BaseLeadsPage.tsx` | 1.23 |

**Não alterados:** `api/prospect-save.ts`, `api/prospect-apollo-search.ts`, `api/prospect-email-finder.ts`, `ImportProspectsModal.tsx`.
