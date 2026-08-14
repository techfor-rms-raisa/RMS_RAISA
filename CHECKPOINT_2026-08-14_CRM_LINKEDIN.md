# CHECKPOINT — Plugin CRM LinkedIn

**Data:** 2026-08-14 · **Status:** Backend em Production ✅ · Extensão v1.03 validada em Preview ✅ · Distribuição para a equipe comercial ⏳

---

## Objetivo da sessão

Criar um terceiro plugin Chrome — **CRM LinkedIn** — que permita ao Admin/Gestão Comercial/SDR
capturar um perfil individual do LinkedIn direto para a Base de Leads, coletando nome, cargo,
empresa, URL do perfil, vertical de negócios e reserva para o usuário logado, com busca
automática de e-mail.

Requisito de roteamento definido pelo Messias:

- **E-mail encontrado** → persiste na Base de Leads → aba **Meus Leads**
- **E-mail não encontrado** → grava no padrão `nome.sobrenome@dominio` → aba **Leads Importados**,
  para o analista conferir e corrigir

Buscas são **individuais** — um perfil por vez, analista esperando. Não há prospecção em lote
no LinkedIn.

---

## Descoberta que definiu a arquitetura

A leitura de `api/prospect-revalidate.ts` v1.8 revelou que **os dois destinos pedidos já são o
comportamento nativo do pipeline em produção**:

| Etapa | O que faz | Relevância para o plugin |
|---|---|---|
| ETAPA 0 | Triagem: opt-out, TTL, MX do domínio | Barra domínio sem servidor de e-mail |
| ETAPA 1 | Validação de entregabilidade (`lib/validate-emails.ts`) | Valida também o e-mail inferido |
| ETAPA 2 | Apollo People Match — **já recebe `linkedin_url`** | Identificador mais forte que existe |
| ETAPA 2-B | Fallback Gemini Search Grounding | |
| ETAPA 3 | Re-busca de e-mail (`lib/email-finder.ts`) | |
| ETAPA 4 | Persiste em `prospect_leads` (`motor='importacao_lista'`) | = aba **Leads Importados** |
| ETAPA 5 | Auto-promoção → `email_leads` (`lib/promover-email-lead.ts`) | = aba **Meus Leads** |

Critério da ETAPA 5: `status_atualizacao ∈ {'atualizado','promovido'}` E `review_manual=false`.

**Consequência:** o endpoint novo não reimplementa cascade, não insere em `email_leads` e não
decide promoção. Ele é um pré-processador fino que cobre só as 4 lacunas que o pipeline não
tem para esta origem.

### Gargalo avaliado e descartado

`lib/email-finder.ts` linha ~163 passa `linkedin_url: null` ao chamar `apolloPeopleMatch` —
foi escrito para o fluxo de revalidação, que só tem nome+domínio. Cheguei a propor um patch
cirúrgico adicionando `linkedin_url?` opcional ao `FinderInput`.

**Descartado depois de ler o `etapa2_identidade()`:** ele já passa `linkedin_url: lead.linkedin_url`
diretamente ao wrapper Apollo. O gap só existe na ETAPA 3 (resgate), que é caminho secundário.
Nenhuma alteração foi necessária em `lib/email-finder.ts`.

---

## Defeitos encontrados durante a implementação

### D1 — `localStorage.rms_user` NUNCA existiu ⚠️ (afeta a Prospect Extension)

**Sintoma:** v1.00 e v1.01 do plugin falhavam com *"Você não está logado no RMS-RAISA"* mesmo
com sessão ativa (Messias Vieira, Gestão Comercial).

**Causa raiz:** verificado no `App.tsx` — nem `rms_user` nem `userId` são gravados em
`localStorage` em lugar nenhum. A sessão vive apenas no state do React (`currentUser`).

O que **existe** é o `useEffect` comentado como *"🆕 Expor userId no window para o Plugin
LinkedIn Chrome"*:

```js
window.__RMS_USER_ID__   = currentUser.id;
window.__RMS_USER_NAME__ = currentUser.nome_usuario;
```

Variáveis de `window` só são visíveis no **mundo MAIN** — no ISOLATED (padrão do
`chrome.scripting.executeScript`) elas não aparecem.

**Impacto colateral não corrigido:** o `buscarUserIdDoRMS()` da **Prospect Extension v1.06**
lê `rms_user`. Logo, ela vem enviando `user_id: null` desde sempre, e o `prospect-capture.ts`
trata isso silenciosamente:

```
ℹ️ [prospect-capture] user_id não enviado — leads não salvos no Supabase
```

Os leads aparecem na tela do Prospect Engine e **nunca são persistidos**. Casa com os 3
prospects órfãos sem motor atribuído. Correção é a mesma linha (`world: 'MAIN'` +
`__RMS_USER_ID__`) — **escopo separado, pendente**.

### D2 — Cargo e Empresa vinham vazios

**Sintoma:** painel abria com Nome e LinkedIn corretos, mas Cargo e Empresa como
*"não encontrado"*, num perfil que tinha ambos visíveis na tela.

**Três causas somadas, todas já resolvidas no RAISA v5.47:**

| Problema | Solução no RAISA | Erro na v1.00 |
|---|---|---|
| Achar a seção Experiência | `encontrarSectionPorH2` com **4 estratégias** | Só H2 + âncora `#experience` |
| Cargo vs. Empresa | **Lookahead** (v5.45): linha é cargo quando a seguinte é `Empresa · Tipo` | Posição fixa (1ª = cargo, 2ª = empresa) |
| Seção abaixo da dobra | `scrollCompletoParaLazyLoading()` | **Scroll removido por completo** |

A **estratégia 4** era a decisiva: o layout 2024/2025 renderiza o título da seção como `<span>`
dentro de `<div>` — não existe H2 para encontrar.

O `extrairHeadline()` também falhava (seletores de classe do LinkedIn mudaram), e o fallback
por `innerText` do RAISA v5.45 não tinha sido portado.

**Erro de julgamento registrado:** removi o scroll argumentando ganho de tempo e menor
exposição ao LinkedIn. Mas a seção é lazy-loaded — eu lia um DOM onde ela não existia.
Otimização prematura contra um problema que o RAISA já tinha resolvido e documentado.

---

## Entregas

### Backend — em Production

| Arquivo | Situação |
|---|---|
| `api/crm-linkedin-capture.ts` | **novo** — pré-processador |
| `lib/resolve-dominio.ts` | **novo** — `resolverDominio()` extraída do endpoint |
| `api/prospect-resolve-domain.ts` | **alterado** v1.1 → v1.2 (passa a importar a lib; contrato HTTP inalterado) |

**Nenhuma migração SQL.** Nenhuma coluna nova, nenhum CHECK alterado.

#### O que o `crm-linkedin-capture.ts` faz (e só isso)

1. **RBAC + trava CRECI** — perfil validado consultando `app_users` pelo id (banco, não body).
   Vertical `CRECI` é rejeitada: regra permanente trava o funil nos dois sentidos.
2. **Dedupe por `linkedin_url`** — o pipeline dedupe por e-mail, que na captura ainda não existe.
   Confere `email_leads` e `prospect_leads` (ignorando `status='no_crm'`).
3. **Resolução do domínio** — cache em `email_empresas` primeiro, Gemini depois.
4. **E-mail `nome.sobrenome@dominio`** — quando há domínio e sobrenome utilizável.
   Sem sobrenome, **não infere**: manda sem e-mail e deixa o Apollo trabalhar pela URL.

Devolve `{ success, duplicado, email_inferido, lead }`. O `lead` vai direto ao
`prospect-revalidate` em modo individual.

**O e-mail inferido não pula o portão** — passa pela ETAPA 1 como qualquer outro. Nenhum
endereço gerado chega a campanha sem verificação de entregabilidade.

### Extensão — `crm-linkedin-extension-v1.03.zip` (não versionada no Git)

12 arquivos: `manifest.json`, `content.js`, `content-rms.js`, `background.js`,
`popup.html`, `popup.js`, `icons/icon{16,32,48,128}.png`.

Ícones: fundo branco, **L** maiúsculo azul LinkedIn `#0A66C2`, moldura arredondada.

#### Encadeamento (2 chamadas feitas pelo navegador)

```
Perfil LinkedIn → [Capturar para o CRM]
  ↓ content.js: nome, cargo, empresa, url canônica, localização
  ↓ painel de confirmação + seleção da Vertical (obrigatória)
  ↓ background.js: lê sessão via executeScript world:'MAIN'
  ↓ POST /api/crm-linkedin-capture      → payload pronto
  ↓ POST /api/prospect-revalidate       → pipeline completo
  ↓ toast informando o destino real do lead
```

**Por que 2 chamadas do navegador e não 1 endpoint chamando o outro:** Vercel Deployment
Protection bloqueia `fetch` cross-function no mesmo deploy de Preview (HTTP 401 em HTML) —
causa raiz já diagnosticada em 18/06/2026.

#### Verticais (item B do requisito)

Sincronizadas de `/api/crm-copys?action=listar_tipos` (fonte: `crm_tipos_campanha`), cache em
`chrome.storage.local` com TTL de 6h, revalidação ao abrir o popup. **CRECI filtrada da lista.**
Fallback embutido com as 7 verticais não-CRECI caso a sincronização falhe.

#### Histórico de versões da extensão

| Versão | Correção |
|---|---|
| 1.00 | Primeira versão |
| 1.01 | Sessão via `executeScript` em vez de `tabs.sendMessage` (content script não injetado em aba já aberta) |
| 1.02 | **D1** — `window.__RMS_USER_ID__` + `world: 'MAIN'` |
| 1.03 | **D2** — 4 estratégias de seção, lookahead, scroll condicionado, fallback de headline |

---

## Smoke test validado (14/08/2026, Preview)

Perfil: `linkedin.com/in/nicolaumandia` — Nicolau Mandia Neto

| Campo | Capturado | Gravado |
|---|---|---|
| Nome | Nicolau Mandia Neto | Nicolau Mandia Neto |
| Cargo | Diretor Geral de Compras | **Diretor de Supply Chain** |
| Empresa | Fundação Butantan | Fundação Butantan |
| E-mail | *(inferido)* | `nicolau.neto@fundacaobutantan.org.br` |
| Vertical | Alocação | Alocação |
| Reservado para | Messias Vieira | Messias |
| Destino | — | **Meus Leads** ✅ |

O e-mail inferido no padrão `nome.sobrenome@dominio` **validou na cascade** e o lead foi
auto-promovido. Fluxo completo confirmado ponta a ponta.

---

## Pendências

1. **Divergência de cargo LinkedIn × Apollo** — o lead entrou como *Diretor de Supply Chain*
   (dado do Apollo, `status_atualizacao='promovido'`) e não *Diretor Geral de Compras* (perfil).
   O LinkedIn tende a ser mais atual. **Decidir quem vence.** Não alterado nesta sessão.

2. **Cota compartilhada** — `prospect-revalidate` consome `app_users.cota_revalidacao_diaria`
   (default 50/dia). Cada captura queima 1 unidade da mesma cota usada pela revalidação dos
   Leads Importados. Não quebra (erro `cota_esgotada` é tratado), mas as duas atividades
   competem pelo mesmo teto. **Decidir:** aumentar a cota de quem usa o plugin, ou criar
   contador separado.

3. **Prospect Extension enviando `user_id: null`** (D1 acima) — escopo separado.

4. **Distribuição** — ZIP da v1.03 para Tatiana, Marcos, Roseni e Débora.
   Popup apontando para `https://www.techfortirms.online`.
   **Instrução obrigatória para a equipe:** manter o RMS-RAISA aberto e logado em outra aba.

---

## Verificação pós-deploy em Production

```powershell
# Endpoint novo vivo (405 = recusando GET, correto; 404 = não subiu)
curl.exe -s -o NUL -w "%{http_code}" https://www.techfortirms.online/api/crm-linkedin-capture

# Refatoração da lib pelo caminho do endpoint antigo
curl.exe -s -X POST https://www.techfortirms.online/api/prospect-resolve-domain `
  -H "Content-Type: application/json" -d "{\"empresa_nome\":\"Fundacao Butantan\"}"
```

Esperado no segundo: `{"success":true,"empresa_nome":"Fundacao Butantan","dominio":"fundacaobutantan.org.br"}`

Se vier `dominio: null`, investigar `thinkingBudget` do Gemini em Production.
`API_KEY` confirmada presente em Production em 14/08/2026.

---

## Lições incorporadas

**Ler o pipeline inteiro antes de projetar o novo.** A intenção inicial era um endpoint com
cascade própria. As ETAPAS 2 e 5 do `prospect-revalidate` já entregavam exatamente o
roteamento pedido — o endpoint final ficou com ~4 responsabilidades em vez de ~15.

**Os plugins existentes são jurisprudência, não só referência.** Cada estratégia extra do
`encontrarSectionPorH2` e cada linha do lookahead existem porque quebraram em produção antes.
Cortar qualquer uma delas por "simplificação" é repetir o erro que já foi pago.

**Otimização sem medição custa duas rodadas.** A remoção do scroll parecia ganho puro
(12s → 0s, menos exposição ao LinkedIn). Custou duas versões e um teste falho. A v1.03 mantém
o ganho — scroll condicionado, para assim que a seção aparece, tipicamente < 1s — mas agora
derivado do comportamento real do DOM, não de suposição.

**Comentário no código não é evidência de comportamento.** O cabeçalho do `prospect-capture.ts`
afirma *"user_id vem da Extension via localStorage rms_user"*. Descreve algo que nunca
aconteceu, e propagou o defeito para um segundo plugin.

---

## Regras permanentes reafirmadas

- **CRECI é bidirecionalmente travada.** Nenhum lead de fora do funil CRECI recebe essa
  vertical. Aplicado no plugin em dois pontos: filtrada do dropdown e rejeitada pelo backend.
- **`criado_por` é TEXT (`nome_usuario`), `reservado_por` é INTEGER (`id`).** Trocar os dois é
  erro silencioso de tipo em runtime.
- **Arquivos em `api/` viram endpoints serverless no Vercel.** Módulo de biblioteca vai em
  `lib/` — um `lib/*.ts` colocado em `api/` vira rota quebrada.
- **`git add` é atômico:** um pathspec inválido derruba a chamada toda e nada é staged.
  Validar com `Test-Path` / `Select-String` antes do `add`.
