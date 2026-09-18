# CHECKPOINT — 18/09/2026
## Prospect Engine: leads capturados não eram gravados + promoção para produção

**Sessão:** 18/09/2026
**Responsável:** Messias Oliveira
**Branches tocadas:** `preview` → `main`
**Status final:** ✅ Resolvido e em produção

---

## 1. Contexto do problema

A Chrome Extension "RMS-RAISA Prospect Engine" exibia a mensagem
`✅ 10 leads enviados para o Prospect Engine!` após a captura em uma SERP do
Google, mas **nenhum registro chegava à tabela `prospect_leads`**.

O falso positivo mascarava a falha havia tempo indeterminado — o usuário só
percebia a ausência dos leads ao abrir a aba "Meus Prospects Salvos".

Cenário de reprodução: busca `site:linkedin.com/in "rappi" (Diretor OR Diretor
Executivo OR Gerente OR Manager)` no Google, botão flutuante "Capturar Leads".

---

## 2. Diagnóstico — causa raiz

Três defeitos encadeados, sendo o primeiro a causa e o terceiro o agravante
que impediu a detecção:

### Bug 1 — ponte de `user_id` quebrada por arquitetura (CAUSA RAIZ)

`content-rms.js` lia a sessão assim:

```js
const stored = localStorage.getItem('rms_user');
```

Essa chave **nunca foi gravada pelo RMS-RAISA**. O `App.tsx` publica a sessão
apenas em `window.__RMS_USER_ID__` e não executa nenhum `localStorage.setItem`.

Agravante arquitetural: content scripts do Chrome rodam no **ISOLATED world** e
não enxergam variáveis do `window` da página (**MAIN world**). Mesmo corrigindo
o nome da chave, a leitura continuaria impossível por esse caminho.

**Evidência (console do tab RMS-RAISA logado):**
```
[Prospect Bridge] GET_USER_ID solicitado — respondendo: null
localStorage.getItem('rms_user')  → null
localStorage.getItem('userId')    → null
window.__RMS_USER_ID__            → 2      ✅ (sessão existe!)
```

### Bug 2 — endpoint pula o INSERT em silêncio

`api/prospect-capture.ts` v2.2, linha ~278:

```ts
if (user_id && deduplicados.length > 0) {   // user_id null → não entra
```

Com `user_id = null` o endpoint **não gravava nada** e ainda assim respondia
`HTTP 200` com `success: true, salvos: 0`. Nenhum sinal de erro ao chamador.

### Bug 3 — notificação mentia (por que ninguém percebeu)

`content.js` montava a mensagem de sucesso com `leads.length` — a quantidade
raspada do DOM do Google — **ignorando completamente** o campo `salvos`
devolvido pelo backend. Sucesso formal com banco vazio.

---

## 3. Correções aplicadas

### Extension v1.06 → **v1.07**

| Arquivo | Mudança |
|---|---|
| `background.js` | `buscarUserIdDoRMS()` reescrita: lê `window.__RMS_USER_ID__` via `chrome.scripting.executeScript({ world: 'MAIN' })`. Mensagem `GET_USER_ID` mantida como fallback. Novo helper `montarPadroesDeUrl()` casa URL com e sem `www.`. **Aborta com erro explícito** quando não há `user_id`, em vez de descartar os leads em silêncio. |
| `content.js` | Feedback derivado de `response.data.salvos`. Se `salvos === 0`, entra em estado de erro exibindo `erro_persistencia`. Texto mudou de "enviados" para **"gravados"** — serve de marcador visual da versão. |
| `content-rms.js` | Apenas cabeçalho e log de versão. Handler `GET_USER_ID` **mantido intacto de propósito** como segunda tentativa. |
| `manifest.json` | `version: "1.07"` + descrição. |

Sem alteração de layout: mesmas classes CSS, mesmos componentes visuais
(Regra 9 respeitada).

### Backend v2.2 → **v2.3**

`api/prospect-capture.ts` — novo campo `erro_persistencia` na resposta,
alimentado em três cenários:

1. `user_id` ausente
2. Erro retornado pelo Supabase no INSERT
3. INSERT que retorna zero linhas

Campo **aditivo** — nenhum consumidor existente quebra. Resolve a cegueira
diagnóstica que permitiu o bug passar despercebido.

---

## 4. Validação (evidências reais, não simuladas)

### Captura 1 — Rappi (preview)

```sql
SELECT id, nome_completo, empresa_nome, buscado_por, reservado_por, criado_em
FROM prospect_leads WHERE motor = 'extension' ORDER BY id DESC LIMIT 15;
```

Resultado: **ids 9362–9371, exatamente 10 leads**, todos em `13:13:53` (INSERT
em lote), todos com `buscado_por = 2` e `reservado_por = 2`. Zero órfãos.
Aba "Meus Prospects Salvos" subiu de 46 para **56 leads**.

### Captura 2 — Loggi (preview)

Notificação exibida: **`✅ 10 leads gravados no Prospect Engine!`** — a palavra
"gravados" confirma que o feedback vem do backend. Contador foi a **66 leads**.

### Produção

Deploy `Merge branch 'preview'` — **Ready em 1m48s**, commit `1677281`, branch
`main`. `techfortirms.online` carrega o Prospect Engine com os leads da Loggi
visíveis, origem `Extension`, analista `Messias`.

---

## 5. Achado colateral — arquivo duplicado no repositório

Durante o `git status` da sessão apareceu uma linha `deleted:` inesperada.
Investigação revelou **duas cópias rastreadas** do mesmo componente:

```
src/components/ProspectSearchPage.tsx           ← órfã (305.268 bytes)
src/components/prospect/ProspectSearchPage.tsx  ← viva  (305.269 bytes)
```

Origem: na "Fase 1 — reorganização Prospect/Lead" (`31314626`) o arquivo foi
**copiado em vez de movido com `git mv`**, e as duas cópias receberam commits
em paralelo por um período.

**Análise de risco antes de remover:**
- Hashes divergentes → não era cópia idêntica
- Diferença real: **1 linha** em 305 KB
- `git grep` recursivo: **nenhum import** aponta para a órfã
- `App.tsx:55` importa `./components/prospect/ProspectSearchPage`
- Commit `0bbd2434` ("aba Prospeccao em Lote no ProspectSearchPage CORRETO
  (pasta prospect/)") prova que o trabalho já havia sido migrado para a
  versão viva — nenhuma funcionalidade ficou órfã

**Ação:** `git rm` em commit isolado `7fb148d7` — 4.994 deletions, zero
insertions. Build do preview validou em 1m42s.

**Motivação:** além do código morto, dois arquivos homônimos em `src/` são
candidatos à colisão de bundle do Vercel — falha já registrada nas regras
permanentes do projeto.

Restaurável a qualquer momento:
```powershell
git checkout 0bbd2434 -- "src/components/ProspectSearchPage.tsx"
```

---

## 6. Promoção para produção

Decisão de produto registrada: **merge completo dos 12 commits** acumulados no
`preview` desde 19/08/2026. O portão "validar antes do rollout" da Prospecção
em Lote (definido em 20/08/2026) foi considerado **fechado**.

Conteúdo promovido além do fix de hoje:
- Prospecção em Lote (Apollo + LinkedIn) — `ProspeccaoEmLoteTab.tsx` (+444),
  `lib/apollo-search.ts` (+262), `prospect-linkedin-lote.ts` (+264),
  `prospect-linkedin-enrich.ts` (+143)
- Troca do motor Apollo → Gemini na Prospecção em Lote (`f8700c0c`)
- Descarte lógico no modal Importar Prospects
- Migration `2026-08-19_backfill_prospect_leads_reservado_por.sql`

Comandos executados:
```powershell
git checkout main
git pull origin main --no-rebase
git merge preview -X theirs --no-edit
git push origin main
```

Resultado: `a9c40c8d..16772812  main -> main` — 13 files changed,
1.801 insertions(+), 3.335 deletions(-).

Histórico do `main` apresentava a sequência `Merge → Revert → Reapply`, o que
inicialmente levantou suspeita de commits marcados como "já integrados". O
`Reapply` (`27b8ddba`) havia restaurado o estado, e o delta de 14 arquivos
confirmou que o merge traria o conteúdo correto.

---

## 7. Erros cometidos nesta sessão (registro honesto)

| Erro | Impacto | Correção |
|---|---|---|
| Caminho `C:\Usuários\` usado nos comandos | `cd` falhou; só funcionou porque o PowerShell já estava na pasta certa | O Explorer exibe o nome traduzido; o caminho real é `C:\Users\` |
| `Select-String -Path ".\src\**\*.tsx"` | Resultado vazio foi tratado como prova de ausência de importadores — **não era** | Em PowerShell `**` não é recursivo. Substituído por `git grep`, que varre todos os arquivos rastreados |
| Alarme falso sobre commit ausente | Tempo gasto verificando `git log --oneline -3` e `git branch -vv` | Era apenas rolagem do terminal cortando a primeira linha |
| Commit multi-linha com `-m` duplo | PowerShell embaralhou o colar (`\x0a` no meio da linha) | Comportamento já conhecido e registrado; comandos passaram a ser entregues em blocos menores, um por vez |

---

## 8. Pendências prioritizadas

| # | Item | Prioridade | Observação |
|---|---|---|---|
| 1 | Confirmar `git checkout preview` | 🔴 Alta | Se o branch local ficou em `main`, o próximo commit vai direto para produção sem querer |
| 2 | Validar migration `backfill_prospect_leads_reservado_por` | 🔴 Alta | A query de verificação não foi executada antes do merge. Rodar: `SELECT COUNT(*) FILTER (WHERE reservado_por IS NULL) AS sem_dono, COUNT(*) AS total FROM prospect_leads;` |
| 3 | Remover `api/prospect-apollo-teste.ts` de produção | 🟡 Média | Endpoint de teste (+134 linhas) publicado. Consome créditos Apollo, sem gate de RBAC aparente |
| 4 | Investigar divergência no contador "Total de Empresas" | 🟡 Média | Preview exibia 2.279; produção exibe 4.833. Pode ser filtro/escopo diferente entre ambientes — verificar antes de assumir bug |
| 5 | Parser de `empresa_nome` da SERP | 🟢 Baixa | 4 de 10 leads vieram com empresa nula; outros com ruído ("Rappi Experiência", "Commercial Strategy"). Comportamento esperado da v2.1 (aceitar lead sem empresa > descartar), mas é candidato a refinamento |
| 6 | Limpar `icons/icons/` duplicada na Extension | 🟢 Baixa | Pasta não referenciada pelo manifest, mantida por não alterar estrutura sem aprovação |

---

## 9. Lições para as regras permanentes

1. **Content script nunca lê `window` da página.** ISOLATED vs MAIN world é
   barreira arquitetural. A leitura de estado da página exige
   `chrome.scripting.executeScript({ world: 'MAIN' })` a partir do
   service worker.

2. **Feedback de UI derivado de contagem local é falso positivo esperando
   acontecer.** A confirmação tem que vir do backend, do campo que representa
   o efeito real (`salvos`), nunca da intenção (`leads.length`).

3. **Endpoint que engole erro e responde `success: true` esconde bug por meses.**
   Toda falha de persistência precisa de campo próprio na resposta.

4. **Reorganização de pastas exige `git mv`, nunca copiar e colar.** A cópia
   sobrevive rastreada, recebe commits em paralelo e vira armadilha — tanto
   para o bundler quanto para quem abre o arquivo errado achando que é o certo.

---

## 10. Frase de retomada

> "Claude, retomando o checkpoint de 18/09/2026 — Prospect Engine v1.07 e
> backend v2.3 estão em produção e validados com 20 leads reais (Rappi e
> Loggi). Preciso tratar as pendências: confirmar branch local, validar a
> migration de `reservado_por` e remover o endpoint de teste do Apollo."

---

**Arquivos entregues nesta sessão:**
- `prospect-extension-v1.07/background.js`
- `prospect-extension-v1.07/content.js`
- `prospect-extension-v1.07/content-rms.js`
- `prospect-extension-v1.07/manifest.json`
- `api/prospect-capture.ts` (v2.3)
- `CHECKPOINT_2026-09-18_PROSPECT_ENGINE_USER_ID.md`

**Commits:**
- `075b3fa4` — fix(prospect): expor erro_persistencia no capture da Extension (v2.3)
- `7fb148d7` — chore(prospect): remover ProspectSearchPage.tsx duplicado em src/components
- `16772812` — Merge branch 'preview' (produção)
