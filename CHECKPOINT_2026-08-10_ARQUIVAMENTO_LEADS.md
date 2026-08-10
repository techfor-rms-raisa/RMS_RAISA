# CHECKPOINT — 10/08/2026 · Arquivamento de Leads (soft-delete)

> **Status:** validado em Preview · aguardando release para Production
> **Módulo:** CRM & Campanhas → Base de Leads → aba "Meus Leads"
> **Sessão:** Messias (PO) + Claude DEV / DBA / Design / Riscos

---

## 1. Origem da demanda

Messias relatou que "a função de delete no form Base de Leads, aba Meus Leads, se perdeu — alguma versão subiu para Production sem a rotina".

**A investigação provou o contrário: a rotina nunca existiu.**

Evidências coletadas:

| Verificação | Resultado |
|---|---|
| `git log -S "excluir_lead"` | 0 commits |
| `git log --all -p` (todos os branches, todo o histórico, 6 variações de nome) | 0 ocorrências |
| `LeadsTab.tsx` — coluna AÇÕES | único botão: Editar (documentado no próprio cabeçalho) |
| `useLeads.ts` (470 linhas) | zero ocorrências de excluir/deletar/remover/delete |
| `crm-leads.ts` — inventário de 28 actions | nenhuma action de DELETE sobre `email_leads` |

Os `Select-String` iniciais deram falsos positivos: o filtro `outras_campanhas: 'excluir'` (que exclui leads *da listagem de vínculo*, não do banco), textos de UI no `VincularEmLoteTab`, e o ícone `fa-trash` do `OptOutTab.tsx:298`.

**O que causou a memória:** o botão **Opt-Out** do `LeadFormModal` cumpre papel de "delete lógico" no sistema. Não era a rotina lembrada, mas ocupa o mesmo lugar mental.

**Conclusão:** não houve regressão. A feature foi projetada do zero — melhor desfecho, porque nasceu com as travas de compliance corretas em vez de restaurar algo cru.

---

## 2. Decisões de produto (Messias, 10/08/2026)

### D1 — Soft-delete, não hard-delete

O registro **permanece** em `email_leads`. Razão dada pelo PO:

> "apenas desaparecer do form para não poluir os dados; caso haja uma nova tentativa de inserção pela rotina de Importação, o e-mail excluído ainda estará na base e a nova inclusão falhará."

**Validado no código.** A dedup de `importar_prospects` consulta apenas por e-mail, sem filtrar status:

```ts
const { data: leadExistente } = await supabase
  .from('email_leads').select('id')
  .eq('email', p.email.toLowerCase().trim()).maybeSingle();
if (leadExistente) { resultados.duplicados++; continue; }
```

Um lead arquivado continua bloqueando a reimportação, contabilizado como `duplicados`. **Zero alteração necessária na rotina de importação.**

### D2 — Irreversível pela interface (opção B1)

Sem aba "Arquivados", sem botão Restaurar. Restaurar exige intervenção do Administrador no banco. Mitigação do risco de erro: modal de confirmação explícito + motivo obrigatório.

### D3 — Motivo obrigatório, whitelist fechada

`duplicado` · `fora_icp` · `dados_incorretos` · `saiu_da_empresa` · `outro`

Fechado de propósito: texto livre viraria lixo não-agregável. A pergunta "por que N leads foram arquivados neste mês?" precisa ter resposta.

⚠️ A whitelist está espelhada em **três** lugares. Alterar em um só produz erro 400 (backend) ou 23514 (banco):
1. CHECK constraint `email_leads_arquivado_motivo_check`
2. objeto `MOTIVOS_ARQUIVAMENTO` da action `arquivar_lead`
3. constante `MOTIVOS_ARQUIVAMENTO` do `ArquivarLeadModal.tsx`

### D4 — Ponto de entrada único

Botão apenas na linha da tabela. **Não** foi adicionado ao rodapé do `LeadFormModal`, que já tem o Opt-Out — duas ações destrutivas lado a lado convidam ao erro.

### D5 — Vocabulário de cor

Ícone 📦 âmbar. **Vermelho é reservado ao Opt-Out**, que é mais severo (manifestação do titular, LGPD). Usar a mesma cor achataria a diferença de gravidade.

### D6 — RBAC

Administrador, SDR e Gestão Comercial. A visibilidade da aba já é restrita por `reservado_por`, então cada perfil só arquiva o que já enxerga — nenhum filtro adicional foi necessário.

---

## 3. Arquitetura entregue

### 3.1 Schema (`sql/2026-08-10_email_leads_arquivamento.sql`)

Quarteto no padrão já usado por `opt_out`, `bounced` e `apto_campanha`:

```
arquivado          BOOLEAN NOT NULL DEFAULT false
arquivado_em       TIMESTAMPTZ
arquivado_por      TEXT      -- nome_usuario, igual a criado_por
arquivado_motivo   TEXT      -- CHECK constraint com whitelist
```

Mais: índice parcial `WHERE arquivado = true` (só o subconjunto pequeno vale indexar — um índice sobre a coluna inteira teria seletividade péssima e o planner ignoraria), `COMMENT ON COLUMN` em todas as quatro, e `NOTIFY pgrst, 'reload schema'`.

### 3.2 Trava crítica — leads em campanha viva

**O buraco que o desenho ingênuo teria deixado passar:** arquivar um lead com itens `pendente` em `email_fila` o tornaria um **fantasma** — invisível na UI, ativo no Resend. O operador não teria como interromper depois, porque o lead não aparece em lugar nenhum para ser aberto.

A action recusa quando existem pendentes em campanhas `ativa` / `pausada` / `agendada`, e devolve **quais** campanhas e **quantos** envios. O modal troca para o estado de bloqueio e aponta o caminho correto: Opt-Out, que cancela a fila em cascata.

Verificação no **submit**, não na abertura do modal: evita round-trip em toda abertura e elimina TOCTOU (entre um pré-check e a confirmação, outro operador poderia ativar a campanha).

### 3.3 Propagação do filtro `arquivado`

| Ponto | Onde |
|---|---|
| `listar_leads` | aba Meus Leads |
| `listar_invalidos` | aba E-mails Inválidos |
| `detalhe_empresa` | leads no drawer da empresa |
| `buscar_global` | busca do header |
| `stats` | KPIs leads/prospects/clientes + total_invalidos + total_optout |
| `atualizarCountersEmpresa` | coluna "Leads" da aba Minhas Empresas |
| `crm-campanhas` × 2 | seleção do Wizard + validação de vínculo |

**A RPC `crm_listar_leads_vinculo_em_lote` NÃO foi tocada.** Ela já exige `apto_campanha = true`, e o arquivamento zera essa coluna. O lead some da aba "Vincular em Lote" sem reescrever SQL de RPC — que seria a parte mais arriscada da entrega.

---

## 4. Descoberta arquitetural — `useCrmApi` achata erros estruturados

`parseResponse` descarta o corpo da resposta quando `!resp.ok`:

```ts
if (!resp.ok) {
  return { ok: false, data: null, error, status: resp.status };
}
```

**Consequência:** um HTTP 409 no bloqueio faria o array `campanhas[]` morrer no fetcher, e o modal mostraria "não foi possível" sem dizer qual campanha está travando.

**Contorno adotado:** o bloqueio volta como **HTTP 200 + `success:false` + `bloqueado:true`**. O status reporta o transporte; o corpo reporta o desfecho de negócio.

**⚙️ BACKLOG (não é peculiaridade desta feature):** todo o módulo CRM está limitado a erros de string. Correção proposta — campo `body` (corpo bruto sempre preservado) em `ApiResult<T>`. É **aditivo**, zero regressão. Não foi feito nesta sessão por exigir o arquivo atual do `useCrmApi.ts`.

---

## 5. Arquivos da entrega

| Caminho | Versão |
|---|---|
| `sql/2026-08-10_email_leads_arquivamento.sql` | 🆕 novo |
| `api/crm-leads.ts` | v1.30 (6.663 linhas) |
| `api/crm-campanhas.ts` | v1.17 |
| `src/components/crm/shared/hooks/useLeads.ts` | v1.5 |
| `src/components/crm/base-leads/LeadsTab.tsx` | v1.3.1 |
| `src/components/crm/base-leads/ArquivarLeadModal.tsx` | 🆕 novo |
| `src/components/crm/base-leads/BaseLeadsPage.tsx` | v1.20 |

---

## 6. Incidentes da sessão

### 6.1 `crm-leads.ts` não foi substituído no disco

Sintoma: HTTP 400 "Ação POST desconhecida: arquivar_lead" com o modal já funcionando na tela. O frontend subiu, o backend não.

Diagnóstico: `Select-String -Pattern "arquivar_lead"` voltou vazio e `(Get-Content).Count` deu 6319 (original) em vez de 6663.

**Agravante — erro do Claude:** a instrução de validação citou "6646", número de uma verificação intermediária feita antes do último ajuste (o bloco de comentário sobre HTTP 200 vs 409, que somou 17 linhas). O número correto sempre foi **6663**.

> **Lição:** ao instruir validação por contagem de linhas, extrair o número do arquivo final, nunca de medição intermediária.

### 6.2 Commits com mensagem certa e conteúdo errado

Os commits `5a0e34cc` e `d3789621` levaram checkpoints e mockups de sessões anteriores sob a mensagem "arquivamento de leads". O commit correto foi o `970676cb` (5 de 7 arquivos).

> **Lição:** o `git status` antes do commit não é formalidade — é o único ponto onde a divergência aparece.

### 6.3 Ícones empilhados na coluna AÇÕES

Dois `<button>` inline soltos na célula; com a coluna ANALISTA presente, a largura residual ficou menor que a soma dos dois e o fluxo inline quebrou.

Correção (v1.3.1): contêiner `flex items-center justify-center gap-1` + `whitespace-nowrap` na célula. `gap-1` substituiu o `ml-1` — espaçamento passa a ser responsabilidade do contêiner.

---

## 7. Investigação paralela — Espionagem invisível para Gestão Comercial

Reportado: usuária de perfil Gestão Comercial não enxerga o menu Espionagem.

| Hipótese | Verificação | Resultado |
|---|---|---|
| RBAC do código | 3 camadas auditadas (`Sidebar` × 2, `EspionagemPage`) | ✅ todas incluem 'Gestão Comercial' |
| `tipo_usuario` divergente | SQL em **Production**: `bate_exatamente` | ✅ true, tamanho 16, ativo |
| Variantes na base | `GROUP BY tipo_usuario, length()` | ✅ 1 variante por perfil |
| `main` mais antigo que `preview` | `git diff origin/main origin/preview -- Sidebar.tsx` | ✅ vazio (idênticos) |
| Prova empírica | Messias logou em Production como **Gestão Comercial** | ✅ menu apareceu, funcional |

**Conclusão: problema de cliente.** Bundle em cache no navegador dela (`index-*.js` muda a cada build) ou favorito apontando para URL de deployment congelado.

**Ação pendente:** (1) Ctrl+Shift+R; (2) limpar apenas "imagens e arquivos em cache"; (3) sair e entrar de novo; (4) **conferir a barra de endereço** — precisa ser `techfortirms.online`, não `rms-raisa.vercel.app` nem URL com hash de deployment.

**Nota:** a busca `ILIKE '%tatiana%'` retornou apenas **Tatiana Silva** (`tsilva@techforti.com.br`). Se a pessoa que reportou for outra, é o perfil da conta dela que precisa ser verificado.

---

## 8. Pendências e backlog

### Desta feature
- [ ] Release para Production (SQL primeiro, merge depois)
- [ ] Confirmar Bloco 8 da migration em Production (CHECK sobre `email_lead_historico.tipo`) — se existir constraint, precisa aceitar `'lead_arquivado'`
- [ ] Contador `arquivados_bloqueados` na resposta de `importar_prospects` + exibição no `ImportProspectsModal`. Hoje o operador vê "X duplicados" sem saber que o registro foi arquivado de propósito
- [ ] Campo `body` em `ApiResult<T>` do `useCrmApi` (§4)

### Anterior, sem alteração
- [ ] "Visão Cliente" da Espionagem — mockup aprovado, implementação não iniciada
- [ ] Sub-fase 3.B Email Recovery pre-intelligence (~6h)
- [ ] Proactive TTL Revalidation (R1–R5) — 6 perguntas de produto pendentes
- [ ] Vincular em Lote v2 Sessões 2+3
- [ ] `handleTentarRecovery` mostra "Novo email: —" (mismatch `data.email`)
- [ ] Regex 'bloqueado' com falso-positivo em frases genéricas de bounce do Resend
- [ ] Modal de falha do Vincular em Lote visualmente idêntico ao de sucesso quando 0 leads
- [ ] Badge `empresa_nome`: "Promovido" → "Cargo atualizado"
- [ ] Três leads em limbo sem motor (pessoa_ids 615, 319, 597)

### Observação de dado
Apenas **1 usuário SDR** em `app_users`. Sem impacto imediato; anotado.

---

## 9. Regras de negócio confirmadas nesta sessão

- Lead com `opt_out=true` **nunca** sai de `email_leads` (LGPD — registro histórico eterno)
- **Opt-out ≠ Arquivamento.** Opt-out é manifestação de vontade do **titular**; arquivamento é faxina de **cadastro** pelo operador. Semanticamente separados, com colunas, telas e cores distintas
- Dedup de importação é por e-mail puro, sem filtro de status — é isso que sustenta a decisão D1
- A RPC de Vínculo em Lote governa elegibilidade por `apto_campanha` — qualquer feature que precise remover leads dessa aba pode fazê-lo zerando essa coluna, sem tocar no SQL da RPC
