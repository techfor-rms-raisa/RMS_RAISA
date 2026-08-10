# CHECKPOINT — Entregabilidade na aba Vincular em Lote
**Data:** 2026-08-10 · **Status:** Banco aplicado em Production ✅ · Código pendente de commit em `preview` ⏳

---

## Problema de origem

Relato do Messias: *"implementamos uma rotina para assegurar que o e-mail esteja válido antes
o lead ir para a campanha. Agora estes Leads mesmo inválidos ficam estacionados na pré
vinculação em lote (aparecem como disponíveis) e isso polui os leads que realmente podem ir
para as campanhas."*

Refinamento na 2ª rodada: **não** desvincular campanhas (o bounce já faz isso automaticamente).
O que se quer é **flexibilidade** — o analista pode correr o risco de liberar um e-mail em
dúvida, distinto de domínio totalmente inválido, quando Snov.io/Apollo/Skrapp não confirmam
mas também não condenam.

---

## Diagnóstico (2 hipóteses, a 1ª refutada por dados)

**Hipótese 1 (REFUTADA).** Supus que a rotina gravava `motivo_invalidacao` sem setar
`bounced`, escapando ao filtro da RPC. O SQL de dimensionamento mostrou correlação de 100%:

| motivo_invalidacao | total | com_bounced |
|---|---|---|
| bloqueado | 443 | 443 |
| bounce | 142 | 142 |
| no_match | 5 | 5 |

Todos já eram barrados por `coalesce(bounced,false)=false`. Não era por aí.

**Causa real.** A rotina implementada em 06/08/2026 (`lib/validacao-lead.ts` v1.0, portão
7-bis de `vincularLeadACampanha`) criou 4 colunas novas em `email_leads`:

```
email_validacao_score    text      -- verified | probable | risky | invalid
email_validacao_fonte    text
email_validado_em        timestamptz
email_validacao_risco    boolean   NOT NULL DEFAULT false
```

A RPC `crm_listar_leads_vinculo_em_lote` foi escrita em **23/07/2026 — 14 dias ANTES** — e
desconhecia essas colunas por completo.

**Assinatura do defeito: o backend acertava, a listagem mentia antes dele.** O portão recusava
o lead reprovado na confirmação; a listagem o exibia como disponível. O analista montava o
lote e só descobria no final.

### Medição em Production (10/08/2026)

| score | leads | liberados_c_risco | já_em_revisar | elegíveis |
|---|---|---|---|---|
| (nunca verificado) | 4.554 | 0 | 569 | 3.847 |
| probable | 90 | 90 | 29 | 61 |
| verified | 74 | 0 | 1 | 73 |
| **invalid** | **55** | 0 | **0** | **55** ⚠️ |
| risky | 2 | 2 | 0 | 2 |

Os 55 reprovados estavam **em limbo duplo**: listados como disponíveis no vínculo E invisíveis
na aba de revisão (cujo critério é `bounced OR motivo_invalidacao IS NOT NULL`, e nenhum dos
dois estava marcado).

---

## Descobertas colaterais (2 defeitos adicionais, ambos corrigidos)

### D1 — O caminho de recuperação estava fechado

`atualizar_lead` v1.11 já resetava `bounced` ao trocar o e-mail, mas as colunas
`email_validacao_*` continuavam apontando para o endereço ANTIGO.

A guarda `mesmoEmail` da lib não pega isso: ela compara `email_leads.email` (banco) com o
e-mail recebido do caller — depois do UPDATE **os dois já são o endereço novo**, logo
`mesmoEmail = true` e o veredito velho era servido do cache por até 90 dias.

**Efeito prático:** o analista corrigia o endereço do lead reprovado e ele CONTINUAVA
reprovado, sem nenhum sinal na UI.

### D2 — Assimetria de critério em 3 consumidores

| Consumidor | Critério de "inválido" (antes) |
|---|---|
| Aba E-mails Inválidos (D2, 16/06) | `bounced` OR `motivo_invalidacao IS NOT NULL` |
| RPC Vincular em Lote | apenas `bounced` |
| Helper `vincularLeadACampanha` (7-A) | apenas `bounced` |

Unificado nesta sessão.

---

## Decisões de produto (fechadas)

### Matriz de tratamento — aprovada 10/08/2026

| `email_validacao_score` | Significado | Aparece no Vincular em Lote? | Tratamento |
|---|---|---|---|
| `verified` | Confirmado pelo provedor | ✅ normal | nenhum |
| `probable` | **Catch-all — INVERIFICÁVEL** | ⚠️ só com toggle ligado | badge âmbar + aceite de risco |
| `risky` | Cascade esgotada, inconclusivo | ⚠️ só com toggle ligado | badge âmbar + aceite de risco |
| `invalid` | Condenado | ❌ nunca | vai para a aba de revisão |
| `NULL` | Nunca verificado / TTL vencido | ✅ normal | verifica na confirmação |

**Correção semântica aplicada ao mockup aprovado:** o mockup original pintava `probable` de
azul como categoria segura. `lib/validacao-lead.ts` grava `email_validacao_risco=true` para
`probable` E `risky` (90/90 dos `probable` da base estavam marcados). Pintá-lo de azul
rotularia como seguros 90 leads que o próprio motor considera duvidosos.
**Decisão: ambos em âmbar "Em dúvida", distinguidos só pelo texto de apoio.**

### Outras decisões

- **Toggle "Incluir e-mails em dúvida" LIGADO por padrão.** Desligado seria endurecer a regra
  de 06/08 ("liberar com aviso") sem ninguém ter pedido — regressão silenciosa.
- **Sem aceite, os em dúvida SAEM do lote** e os demais são vinculados. Bloquear o botão
  obrigaria o analista a voltar e desmarcar um por um.
- **O aceite vale para UM lote**, resetado a cada abertura do modal.
- **`motivo_invalidacao = 'f7_pre_campanha'`** como destino do reprovado — código já existente
  na whitelist da CHECK, já traduzido na UI ("Invalidado antes da campanha"), e o botão
  "Promover" do `InvalidosTab` v1.3 já aparece exatamente para leads sem bounce.
  **Zero schema novo.**
- **Não desvincular campanhas automaticamente** — o bounce já faz isso.

---

## Entregas

### Bloco 1 — Banco + Backend

| Arquivo | Estado |
|---|---|
| `sql/2026-08-10_vinculo_em_lote_entregabilidade.sql` | **novo** |
| `lib/validacao-lead.ts` | v1.0 → **v1.1** |
| `api/crm-leads.ts` | v1.28 → **v1.29** |

**Migração (5 blocos):** Bloco 0 pré-checagem de CHECK em `email_lead_historico.tipo` ·
Bloco 1 backfill com `BEGIN...ROLLBACK` · Bloco 2 RPC v1.29 · Bloco 3 `NOTIFY pgrst` ·
Bloco 4 verificação.

**RPC v1.29** — novo param `p_incluir_em_duvida boolean DEFAULT true`; exclusão de
`motivo_invalidacao IS NOT NULL` e de `invalid` vigente; 4 campos de entregabilidade no payload
por lead; `resumo_entregabilidade` sobre o conjunto elegível COMPLETO.

**`validacao-lead` v1.1** — grava `motivo_invalidacao='f7_pre_campanha'` no mesmo UPDATE do
veredito; limpeza CONDICIONADA (`.eq('motivo_invalidacao', 'f7_pre_campanha')`) para nunca
apagar um `'bounce'`; autocura no caminho de cache via `.is(..., null)`.

**`crm-leads` v1.29** — repassa o toggle; devolve `resumo_entregabilidade` com fallback de
zeros; **invalida `email_validacao_*` quando o e-mail muda** (correção do D1), com registro
em histórico.

### Bloco 2 — Frontend

| Arquivo | Estado |
|---|---|
| `src/components/crm/shared/hooks/useVincularEmLote.ts` | v1.2 → **v1.3** |
| `src/components/crm/base-leads/VincularEmLoteTab.tsx` | v2.2 → **v2.3** |

4 adições, nenhuma linha removida, nenhuma estrutura movida:
1. **Passo 3** — bloco "Entregabilidade" com o toggle, fora do grid dos demais filtros
2. **Passo 4** — faixa de contagens (escopo global) + coluna "Entregabilidade";
   `colSpan` 8/9 → 9/10 em 3 pontos; linha em dúvida com fundo âmbar (seleção índigo tem precedência)
3. **Modal** — faixa âmbar com lista NOMINAL (teto 8) + checkbox de aceite
4. **Barra de ação + botão** — contador reflete o total REAL a vincular

---

## Estado de aplicação

| Ambiente | Migração SQL | Código |
|---|---|---|
| **Production** (`wuejqxijjjdvwighjiiaj`) | ✅ aplicada — RPC 13 params, backfill 55/0 | ⏳ pendente |
| **Preview** (`smuikbkjfuggtcmkurqh`) | ❌ **NÃO aplicada** | ⏳ pendente |

### Verificações que passaram em Production
- 4.1 — função única, `n_params = 13` ✅
- 4.2 — `invalidos_ainda_elegiveis = 0` (era 55) ✅
- 4.3 — `com_duvida = sem_duvida = 44` ✅ *(ver nota abaixo)*
- 4.4 — resumo com as 4 chaves ✅
- Backfill — `marcados_pelo_portao = 55`, `sem_motivo = 0` ✅

**Nota sobre 4.3/4.4:** o toggle não muda nada hoje e o resumo mostra `{verified:0, probable:0,
risky:0, nao_verificado:44}`. É consistente: **um lead só ganha score quando passa pelo portão,
e o portão só roda no vínculo a campanha.** Todos os 73 `verified` e 61 `probable` receberam o
score justamente por terem sido vinculados — e por isso estão fora da listagem de disponíveis
(`p_outras_campanhas='excluir'`). Os 44 restantes nunca foram vinculados, logo nunca verificados.

---

## Pendências imediatas

1. **Commit do Bloco 1 em `preview`** — `git add` da última rodada cobriu só os 2 arquivos de
   frontend. Os 3 do Bloco 1 estão no disco mas fora do índice (o `.sql` aparece como untracked).
   ⚠️ **Não promover para `main` sem eles:** o `VincularEmLoteTab` v2.3 lê
   `resumoEntregabilidade` e `selecionadosEmDuvida`; sem o `crm-leads` v1.29 a faixa renderiza
   zeros permanentes.
2. **Aplicar a migração no Supabase de Preview** — sem a RPC v1.29 lá, a aba quebra em Preview.
3. **`CRMEmailPage.tsx`** — não recebido. Item 4 do mockup (renomear "E-mails Inválidos" →
   "E-mails para revisar") não pôde ser feito: a v1.19 do `BaseLeadsPage` (01/07/2026) migrou
   as abas `respostas`/`invalidos`/`opt_out` para lá.

## Comandos de promoção (após resolver a pendência 1)

```powershell
git checkout main
git pull origin main --no-rebase
git merge preview -X theirs --no-edit
git diff --name-only HEAD~1 HEAD    # confira os 5 arquivos
git push origin main
```

## Smoke test pós-deploy

Esperado hoje: faixa com **0 confirmados · 0 em dúvida · 44 não verificados**, coluna toda
cinza, toggle sem efeito visível, modal sem faixa âmbar. Total de disponíveis não conta mais
os 55 reprovados.

Para exercitar o caminho do aceite de risco em Preview:
```sql
UPDATE public.email_leads
   SET email_validacao_score = 'probable',
       email_validacao_fonte = 'teste_manual',
       email_validado_em     = now(),
       email_validacao_risco = true
 WHERE id = <ID_DE_LEAD_ELEGIVEL>;
```

---

## Lições incorporadas

- **`pg_get_functiondef()` devolve a definição SEM `;` terminal.** Colar a saída direto numa
  migração faz o parser tratar o comando seguinte como continuação — o erro aparece no `GRANT`,
  três linhas depois da causa real. *(Incidente desta sessão.)*
- **Adicionar parâmetro a uma função exige `DROP FUNCTION` explícito.** `CREATE OR REPLACE`
  cria SOBRECARGA, e o PostgREST falha com *"could not choose the best candidate function"*.
- **GRANTs não sobrevivem ao DROP** — reaplicar no mesmo bloco.
- **Colunas novas criam dívida em consumidores pré-existentes.** Uma RPC escrita 14 dias antes
  de uma feature não sabe que a feature existe. Ao criar colunas de estado, auditar quem lista
  a mesma tabela.
- **O veredito de validação pertence ao ENDEREÇO, não ao lead.** Toda mutação do e-mail precisa
  invalidar o cache — mesma classe do reset de bounce da v1.11.
- **TTL duplicado entre SQL e TS.** Os 90 dias vivem em `lib/validacao-lead.ts` (`TTL_DIAS`) e
  na RPC (`interval '90 days'`). Divergir faria a UI prometer um veredito que o portão
  recalcularia. **Alterar sempre os dois no mesmo commit.**
- **Dimensionar antes de corrigir.** A hipótese inicial (elegante e plausível) foi refutada por
  uma query de 5 linhas. Sem ela, teríamos entregue um filtro que não filtrava nada.

---

## Regra permanente reafirmada

`probable` ≠ "provavelmente bom". `probable` = **domínio catch-all, inverificável**. Junto com
`risky`, é score de RISCO — `SCORES_DE_RISCO` em `lib/validacao-lead.ts`. Qualquer UI que os
trate como categorias distintas de confiança contradiz o motor.
