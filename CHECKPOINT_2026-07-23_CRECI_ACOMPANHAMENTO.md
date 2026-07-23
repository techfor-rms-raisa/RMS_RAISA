# CHECKPOINT — 23/07/2026 · CRECI Acompanhamento de Corretores

**Módulo:** CRECI
**Entrega:** nova aba "Acompanhamento" — carteira pós-venda de corretores
**Status:** validado em Preview · pendente de Production
**Product Owner:** Messias

---

## 1. O problema resolvido

O módulo CRECI cobria o funil até `corretores_creci.negocio_fechado`. A partir
desse marco o rastro morria: não havia onde registrar aceite, valor de contrato,
andamento do acordo nem o que foi combinado em cada conversa.

A nova aba fecha essa lacuna. Corretor com **INTERESSE = Sim** ou
**NEGÓCIO = Fechado** entra numa carteira de acompanhamento com ficha de
contrato, registro de atividades, follow-ups e o histórico de e-mails que já
existia no CRM. Ninguém sai da carteira — o histórico é permanente.

Como a carteira é pequena (3 corretores hoje) e a profundidade por registro é
alta, o layout é **mestre-detalhe**, não tabela.

---

## 2. Decisões de produto tomadas nesta sessão

### 2.1 RBAC próprio, diferente do resto da plataforma

Este form **não** usa o RBAC por dono aplicado em `email_leads`:

| Ação | Administrador | SDR | Gestão Comercial |
|---|:--:|:--:|:--:|
| Ler a carteira inteira (sem filtro por responsável) | ✅ | ✅ | ✅ |
| Abrir ficha, atividades, e-mails, timeline | ✅ | ✅ | ✅ |
| Registrar/editar atividade, concluir FUP | ✅ | ✅ | 🚫 |
| Criar/editar ficha de contrato | ✅ | ✅ | 🚫 |

Razão: a Gestão Comercial precisa enxergar o pipeline de negócios fechados sem
ser dona dos corretores. E **quem gerencia o corretor é o SDR** — a escrita é
liberada em qualquer corretor da carteira, independentemente de quem esteja em
`corretores_creci.analista`. Havia 3 corretores com 3 responsáveis distintos e
apenas 1 SDR cadastrada; filtrar por responsável deixaria a SDR sem acesso a 2
dos 3 casos que ela mesma gerencia.

### 2.2 Autoria = quem executou, não quem é responsável

`creci_atividades.executado_por_id` + `executado_por_nome` guardam quem **de
fato** fez a ação. O nome é snapshot congelado no INSERT: se o usuário for
renomeado ou desativado, a timeline continua legível. `corretores_creci.analista`
pode ser repassado; a autoria de uma atividade é fato imutável.

Na edição de uma atividade, a autoria original **não** é reescrita.

### 2.3 Sem exclusão

Não existe action de DELETE. Correções são feitas por edição, preservando o
rastro. Coerente com a regra de que histórico de acompanhamento é permanente.

### 2.4 Um contrato aberto por corretor

Índice único parcial em `creci_contratos (corretor_id) WHERE status_contrato <>
'finalizado'`. Contratos finalizados ficam livres — permite renovação e
histórico, bloqueia duas fichas abertas simultâneas.

---

## 3. Introspecção — achados que mudaram o desenho

Executada em Preview, 23/07/2026:

| Achado | Impacto |
|---|---|
| `app_users.tipo_usuario` = `'Administrador'`, não `'Admin'` | Comparar com `'Admin'` zeraria a permissão de escrita para **todos** os usuários |
| Perfis reais: Administrador (5), Analista de R&S (4), Gestão Comercial (3), Gestão de Pessoas (2), Consulta (2), **SDR (1)**, Gestão de R&S (1) | Whitelists definidas sobre valores reais |
| `corretores_creci.id` = `bigint`; `app_users.id` = `integer` | Tipos das FKs |
| Existe tabela legada `users` (id/nome/email/senha/tipo) | **Não tocada** — a aplicação usa `app_users` |
| Nenhuma tabela com prefixo `creci` além de `corretores_creci` | Sem colisão de nomes |
| Carteira: 3 corretores, 3 com e-mail, 3 com lead no CRM, 3 responsáveis distintos | Casamento por e-mail em 100% — a FK vira melhoria, não pré-requisito |
| `email_leads`: 34 registros, 0 com maiúscula no e-mail | Risco de divergência de case é teórico no Preview |

Colunas relevantes de `corretores_creci`: `interesse text DEFAULT 'not'`
(valores `'yes'`/`'not'`), `negocio_fechado date`, `data_contato date`,
`data_envio_adv date`, `data_whatsapp_clicado timestamptz`, `analista text`.

---

## 4. Arquivos da entrega

### Migrações (aplicar ANTES do deploy de código)

| Arquivo | Conteúdo |
|---|---|
| `sql/2026-07-23_creci_acompanhamento.sql` | Tabelas `creci_contratos` e `creci_atividades`, trigger `fn_creci_touch_atualizado_em`, índices, RLS |
| `sql/2026-07-23_creci_acompanhamento_rpcs.sql` | RPCs `listar_carteira_creci`, `kpis_carteira_creci`, `responsaveis_carteira_creci` |

### Backend

| Arquivo | Versão |
|---|---|
| `api/creci-acompanhamento.ts` | v1.0 — 6 actions GET + 4 POST, RBAC no servidor |

### Frontend — `src/components/creci/acompanhamento/`

| Arquivo | Versão |
|---|---|
| `creciAcompanhamento.types.ts` | v1.1 |
| `useAcompanhamento.ts` | v1.0 — hooks `useCarteira` e `useFichaCorretor` |
| `AcompanhamentoCorretoresTab.tsx` | v1.0 — raiz: KPIs, filtros, mestre-detalhe |
| `CarteiraLista.tsx` | v1.0 |
| `CorretorFicha.tsx` | v1.1 |
| `ContratoForm.tsx` | v1.0 |
| `AtividadesTimeline.tsx` | v1.0 |
| `AtividadeFormModal.tsx` | v1.0 |
| `EmailsCorretorTimeline.tsx` | v1.0 |

### Alterado

| Arquivo | De → Para |
|---|---|
| `src/components/creci/CreciPage.tsx` | v1.2.2 → v1.3.0 |

Patch cirúrgico em 5 pontos (cabeçalho, import, `TabType`, `TabButton`, ramo do
ternário de conteúdo). **1.425 → 1.452 linhas — nenhuma linha removida.**

---

## 5. Aprendizados técnicos desta sessão

### 5.1 Colunas `date` e o construtor `Date` do JS

`new Date('2026-07-22')` é interpretado como **meia-noite UTC**. No fuso do
Brasil (UTC-3) isso vira 21/07 às 21:00. Toda coluna `date` do Postgres chega ao
frontend como `'YYYY-MM-DD'` e cai nessa armadilha.

Manifestação real: a linha do tempo exibiu "Aceite do contrato — 21/07/2026,
21:00" para uma data de aceite preenchida como 22/07. Corrigido com
`formatDataOuHora`, que detecta a granularidade da origem por regex antes de
escolher o formatador.

**Regra para o projeto:** nunca passar coluna `date` por formatador de
timestamp. Onde a origem for mista, detectar o padrão `^\d{4}-\d{2}-\d{2}$`.

### 5.2 `current_date` em servidor UTC

Pelo mesmo motivo, as RPCs calculam "FUP vencido" com
`(now() AT TIME ZONE 'America/Sao_Paulo')::date`. Com `current_date` puro, um
follow-up agendado para hoje seria marcado como vencido entre 21h e meia-noite
no horário do Brasil.

### 5.3 Não chamar endpoint interno a partir de outro endpoint

`listar_emails` remonta a thread direto de `email_fila` + `email_respostas` em
vez de chamar `/api/crm-leads?action=listar_msgs_thread`. Dois motivos: `fetch`
entre funções serverless do mesmo deployment devolve HTTP 401 com página de
login em Preview (Deployment Protection); e aquela action aplica RBAC de dono da
**campanha**, o que bloquearia a Gestão Comercial e contrariaria a regra desta
aba.

### 5.4 Race condition na troca de seleção

`useFichaCorretor` guarda o id da requisição em voo num `useRef`. Sem isso,
clicar rápido em dois corretores permite que a resposta lenta do primeiro
sobrescreva a ficha do segundo — bug que só aparece em produção, com latência
real.

### 5.5 Arquivo `.tsx` colado no SQL Editor

Ocorrido nesta sessão: `ERROR 42601: syntax error at or near "React"`. Sem dano —
o Postgres recusa na primeira palavra que não é SQL, nada é executado.
Regra prática: `.sql` → SQL Editor; `.ts`/`.tsx` → Git.

### 5.6 `schema cache` do PostgREST

Sintoma: `Could not find the function public.listar_carteira_creci(...) in the
schema cache` com a tela carregando normalmente e KPIs em `—`. Causa nesta
sessão: a segunda migração não havia sido executada. Quando a função existe mas
a API não a enxerga, `NOTIFY pgrst, 'reload schema';` força o recarregamento.

---

## 6. Backlog gerado

| # | Item | Prioridade |
|---|---|---|
| 1 | Rodar a query de e-mails com maiúscula em **Production** antes do merge. Se `com_maiuscula > 0`, trocar os dois `.eq('email', ...)` de `obter_ficha`/`listar_emails` por `.ilike('email', ...)`, alinhando com o `lower()` da RPC | Alta (bloqueia merge) |
| 2 | `email_leads.corretor_creci_id` — FK real substituindo o casamento por e-mail, com backfill. Hoje o vínculo se perde silenciosamente se o corretor trocar de e-mail | Média |
| 3 | Coluna `data_interesse` em `corretores_creci` — `interesse` guarda só o estado atual, não quando virou "Sim". O marco de entrada na carteira fica ausente da linha do tempo | Média |
| 4 | Duplicidade de copy do WhatsApp: `WHATSAPP_TEXTO_PADRAO` vive no `CreciPage`; o botão da ficha abre `wa.me` sem texto para não criar segunda fonte de verdade. Avaliar extrair a constante | Baixa |
| 5 | Registro automático de atividade (`origem = 'automatico'`) no clique do WhatsApp — a coluna já existe, reservada | Baixa |

---

## 7. Roteiro de subida para Production

1. Query de verificação de case em Production (item 1 do backlog)
2. Supabase **Production** → SQL Editor → `2026-07-23_creci_acompanhamento.sql` → Ctrl+A → Run → bloco de verificação
3. Supabase **Production** → `2026-07-23_creci_acompanhamento_rpcs.sql` → Ctrl+A → Run → bloco de verificação
4. `NOTIFY pgrst, 'reload schema';`
5. Merge `preview → main` e push
6. Smoke test em Production: abrir a aba, conferir os KPIs contra a Lista CRECI,
   selecionar um corretor, abrir as 4 sub-abas
7. Validar o modo leitura com um usuário de Gestão Comercial

---

## 8. Validação já realizada em Preview

- ✅ KPIs corretos: 3 na carteira, 1 interessado, 2 fechados
- ✅ Lista batendo com a Lista CRECI (mesmos 3 corretores)
- ✅ Filtros de situação, status de contrato e responsável respondendo
- ✅ Ficha do corretor com dados reais e 4 sub-abas
- ✅ Criação de contrato (Pendente, R$ 30.000,00) refletindo no card da carteira
- ✅ Linha do tempo montando os marcos do funil e do contrato
- ⏳ Pendente: atividade com FUP vencido → conclusão do FUP
- ⏳ Pendente: sub-aba E-mails num corretor com lead no CRM
- ⏳ Pendente: modo leitura com perfil Gestão Comercial
