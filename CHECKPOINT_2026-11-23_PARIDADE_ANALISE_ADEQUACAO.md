# CHECKPOINT 23/11/2026 — Paridade entre "Análise de Currículo AI" e "Candidaturas → Análise de Adequação"

**Sessão:** 23/11/2026, 10:07–10:39 (segunda-feira)
**Participantes:** Messias (PO) + Claude (DEV / IA / DBA)
**Branches:** `preview` (`6cdabc1`, 10:25) → `main` (merge `a2e153a`, 10:34) — **promovido para Produção**
**Tema de origem:** Messias observou que as duas telas do RAISA que cruzam CV × Vaga deveriam dar o mesmo resultado ("tanto faz analisar pela Análise de Currículo ou pela Análise de Adequação") e pediu a averiguação.
**Novidade operacional:** primeira sessão com Claude lendo e gravando **direto na pasta local do projeto** (`...\PROJETO RMS_RAISA\RMS_RAISA`) — sem download manual, sem sufixo `-1`, CRLF preservado, gravação com trava de `mtime`.

---

## 1. Diagnóstico — as duas telas NÃO eram equivalentes

Ambas chamavam o **mesmo endpoint** (`/api/analise-adequacao-perfil`, mesmo prompt `buildAnalysisPrompt`, mesmo `gemini-3.8-flash`) e gravavam na **mesma tabela** (`analise_adequacao`). A divergência estava no que cada uma **enviava** e em **como guardava**:

| Aspecto | Análise de Currículo AI (`AnaliseRisco.tsx` v5.1) | Candidaturas (`DetalhesCandidaturaModal.tsx` v2.4 → hook → service) |
|---|---|---|
| Texto do CV | Texto bruto do PDF | Só `candidaturas.curriculo_texto` — **frequentemente NULL** (LinkedIn, importação, vínculo manual) → IA analisava **sem o CV** |
| Dados estruturados | Nenhum; `nome: 'Candidato'` e **`senioridade: 'pleno'` fixa** (enviesava o prompt) | `pessoa_skills`, `pessoa_experiencias`, `pessoa_formacao`, título, senioridade real |
| Vaga | Select **sem `descricao` nem `modalidade`** → "Descrição: Não fornecida" | Com `descricao` e `modalidade` |
| Requisitos (`TEXT[]`) | Array cru → `"a,b,c"` no template | `join('\n')` → um por linha |
| Chave de cache | `cv_hash + vaga_id`, `candidatura_id = NULL` | Só `candidatura_id` |
| Gate CONF-01 na gravação | Sim (v5.1) | **Não** — gravava até análise degradada |

**Consequências:** (1) mesmo CV × mesma vaga gerava scores diferentes conforme a tela; (2) uma tela não enxergava a análise feita na outra → nova chamada à IA, novo resultado; (3) o não-determinismo do Gemini 3.x (sem `temperature`) amplificava a diferença porque o cache não era compartilhado.

Fontes verificadas: repositório `techfor-rms-raisa/RMS_RAISA` (commit `cef329d`, 22/11) e os 4 arquivos do disco local (idênticos ao repo, exceto CRLF).

---

## 2. Entrega — commit `6cdabc1`

`feat(adequacao): paridade entre Analise de Curriculo AI e Candidaturas - payload canonico, cache compartilhado cv_hash+vaga_id, gate CONF-01 no hook` — 4 arquivos, +442 / −141. **Sem alteração de layout (Regra 9). Backend não alterado. Sem migration SQL.**

| Arquivo | Versão | Mudança |
|---|---|---|
| `src/services/analiseAdequacaoService.ts` | → **v1.1** | Passa a ser a **fonte única** de: `gerarHashCV` (mesmo algoritmo do AnaliseRisco v4.6 → cache existente continua válido), `resolverTextoCV` (primeira fonte com ≥ 50 chars), `montarCandidatoAnalise` (sem valores "chutados"; normaliza experiências/formações), `montarVagaAnalise` (requisitos sempre um por linha; `descricao`, `modalidade`, `cliente_nome`), `CONFIANCA_MINIMA_VEREDICTO = 80`. Tipo `AnaliseAdequacaoPerfil` ganha `analise_parcial`, `motivo_parcial`, `veredicto_confiavel`, `modelo_ia`. |
| `src/hooks/supabase/useAnaliseAdequacao.ts` | → **v1.1** | `carregarAnalise(candidaturaId, pessoaId, vagaId, cvHash?)` busca em ordem **`candidatura_id` → `cv_hash+vaga_id` → `pessoa_id+vaga_id`**, sempre `status='concluida'` e `confianca_analise >= 80`. `salvarAnalise(..., cvHash?)`: **gate CONF-01** (não persiste análise sem veredicto confiável), payload único para UPDATE/INSERT, grava `status: 'concluida'` + `cv_hash`, `modelo_ia` real (`resolverModeloIA`), e **vincula** a linha de cache do AnaliseRisco (`candidatura_id NULL`) à candidatura em vez de duplicar. Exporta `analiseEhConfiavel()`. |
| `src/components/raisa/DetalhesCandidaturaModal.tsx` | 2.4 → **2.5** | CV por prioridade **`pessoas.cv_texto_original` → `candidaturas.curriculo_texto`**; ao abrir o modal tenta o cache por hash; PASSO 0 de cache antes da IA; payload via montador compartilhado. |
| `src/components/raisa/AnaliseRisco.tsx` | 5.1 → **5.2** | Select da vaga traz `descricao` e `modalidade`; payload via montador compartilhado (removida `senioridade: 'pleno'` fixa); `gerarHashCV` delega ao serviço; análise gravada **já com `candidatura_id`** quando existe candidatura pessoa × vaga. |

### Verificação técnica
- `vite build` OK.
- `tsc --noEmit`: nenhum erro **novo** nos 4 arquivos (comparação antes × depois). O projeto tem ~665 erros de `tsc` pré-existentes (não bloqueiam o build Vite) — inclusive 2 nesses arquivos, ver P2.
- **Regra 15 evitou um erro de runtime:** `candidaturas` ordena por **`criado_em`**, enquanto `analise_adequacao` usa **`created_at`**. A primeira versão do vínculo usava `created_at` em `candidaturas`; corrigido antes da entrega.

### Teste em Preview (10:31)
- **João Pedro Custódio × 8067 (Desenvolvedor Back-end Node.js Sr):** análise feita na tela Análise de Currículo (86%, confiança 90%, Entrevistar) → aberta em Candidaturas: o modal exibiu **a mesma análise** ao abrir — 86% · ENTREVISTAR, 6 Atende / 1 Parcial / 1 Gap, mesmo resumo executivo — **sem nova chamada à IA**. ✅

### Promoção
`checkout preview → pull → checkout main → pull → merge preview --no-edit → push` → merge **`a2e153a`** (10:34).

---

## 3. Decisões tomadas (Messias)

| # | Decisão | Hora |
|---|---|---|
| D1 | As duas telas devem produzir o **mesmo resultado** para o mesmo CV × vaga. | 10:07 |
| D2 | Aprovada a solução: payload canônico único + cache compartilhado `cv_hash+vaga_id` + gate CONF-01 também no hook + vínculo à candidatura. | 10:14 |
| D3 | Claude autorizado a ler e gravar **direto na pasta local** do projeto ("é a última versão e pode seguir"). | 10:14 |
| D4 | Promover para Produção no mesmo dia. | 10:32 |

---

## 4. Comportamento esperado a partir de agora

- Mesmo CV + mesma vaga → **mesmo resultado nas duas telas**, servido do cache, sem custo de IA.
- Sem cache, as duas telas montam o **mesmo prompt** (CV completo + dados estruturados quando existem + vaga com descrição). Duas execuções distintas ainda podem variar alguns pontos (natureza do modelo); a primeira análise confiável vira a referência para ambas.
- Análise degradada (confiança < 80 ou parcial) **não é gravada nem servida** em nenhuma das telas.
- Produção e Preview têm **bancos diferentes** (`wuejqxijjjdvwighjiiaj` × `smuikbkjfuggtcmkurqh`): o cache do Preview não existe em Produção — o primeiro par analisado em Produção chama a IA normalmente.

### ⚠️ Errata da sessão (dito às 10:31, precisa de confirmação)
Foi afirmado que "candidaturas antigas com análise gravada por `candidatura_id` continuam exibindo a análise antiga". Isso **só é verdade se o `DEFAULT` da coluna `analise_adequacao.status` for `'concluida'`**. O hook antigo **não gravava `status`**, e o `carregarAnalise` v1.1 filtra `status='concluida'` e `confianca_analise >= 80`. O DDL da tabela não está no repositório, então não foi possível confirmar. Se o default for outro (ou NULL), essas análises antigas **deixam de aparecer** no modal e o botão "Analisar Adequação" volta — sem perda de dados (a nova análise faz UPDATE na mesma linha por `candidatura_id`), mas com nova chamada à IA e possivelmente outro score. Análises antigas com confiança < 80 deixam de aparecer **por design** (CONF-01). → Ver P1-a.

---

## 5. Pendências priorizadas

| Prior. | Item | Resp. | Quando |
|---|---|---|---|
| **P0** | *(herdada de 22/11)* **Migração total Gemini 3.x** — demais endpoints + `@google/genai` 3.6.1 + `geminiService.ts` no browser. Deadline Google 01/12. | Claude + Messias | **28/11 (sáb)** |
| **P0** | *(herdada de 22/11)* Confirmar no Vercel se `ANTHROPIC_API_KEY` existe. | Messias | antes de 28/11 |
| **P1-a** | **Diagnóstico do `status` em `analise_adequacao`** (Produção e Preview) — SQL abaixo. Conforme resultado, decidir entre aceitar a reanálise sob demanda ou um backfill pontual (`status='concluida'` onde NULL e confiança ≥ 80), que só será escrito após o diagnóstico. | Messias roda / Claude decide com ele | próxima sessão |
| **P1-b** | Validar em **Produção**: (1) ida — Análise de Currículo → Candidaturas; (2) volta — Candidaturas → Análise de Currículo com o mesmo PDF (badge "Resultado em cache"); (3) uma candidatura antiga. | Messias | esta semana |
| **P1** | *(herdadas de 22/11)* Módulo 2 família SENIOR (`SENIOR-01`) e CONF-04; apresentação ao board; prompt injection com o Módulo 1. | — | ver checkpoint 22/11 |
| **P2** | Tipos duplicados: `AnaliseRisco.tsx` e `AnaliseAdequacaoPanel.tsx` redeclaram `RequisitoAnalisado`/`CategoriaPerguntas` localmente (erro `tsc` pré-existente TS2322 no Panel). Consolidar no service. | Claude | oportunidade |
| **P2** | `DetalhesCandidaturaModal.tsx` importa de `@/types` (TS2307 pré-existente no `tsc`; o Vite resolve). Alinhar o alias no `tsconfig`. | Claude | oportunidade |
| **P2** | Existem **dois algoritmos de hash de CV** no código: `analiseAdequacaoService.gerarHashCV` (base36) e o de `useCandidaturaAnaliseIA.ts` (hex, `padStart 16`, tabela `ia_recomendacoes_candidato`). Tabelas diferentes, sem conflito hoje — unificar quando mexer em `ia_recomendacoes_candidato`. | Claude | oportunidade |

### SQL de diagnóstico (P1-a) — somente leitura, rodar no SQL Editor de cada ambiente
```sql
-- 1) Estrutura (Regra 15)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'analise_adequacao'
  AND column_name IN ('status','cv_hash','candidatura_id','pessoa_id','vaga_id','confianca_analise','created_at')
ORDER BY column_name;

-- 2) Distribuição das linhas existentes
SELECT COALESCE(status, '<NULL>')        AS status,
       (candidatura_id IS NOT NULL)      AS tem_candidatura,
       (cv_hash IS NOT NULL)             AS tem_hash,
       COUNT(*)                          AS total,
       COUNT(*) FILTER (WHERE confianca_analise < 80) AS abaixo_80
FROM analise_adequacao
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

---

## 6. Lições da sessão

- **Mesmo endpoint ≠ mesmo resultado.** Paridade de IA exige três coisas juntas: mesmo **payload** (montado em um único lugar), mesma **chave de cache** e mesma **regra de qualidade** na escrita e na leitura do cache.
- **Nunca enviar valores "chutados" ao prompt** (`senioridade: 'pleno'`, `nome: 'Candidato'` como dado): a IA trata como evidência. Campo desconhecido deve ir ausente.
- **Nomes de coluna de data não são padronizados no banco:** `candidaturas.criado_em` × `analise_adequacao.created_at`. Sempre conferir antes de `.order()` (Regra 15).
- **Filtro novo em leitura de cache = mudança de comportamento para dados antigos.** Ao introduzir `status`/`confiança` no `select`, checar o `DEFAULT` e as linhas legadas antes de afirmar compatibilidade.
- **Acesso direto à pasta local funciona bem:** staging → edição → `vite build` + `tsc` antes/depois → gravação com trava de `mtime` e CRLF. Elimina o problema dos downloads com sufixo `-1` registrado em 22/11.

---

## 7. Frase de retomada

> "Claude, retomar a partir do CHECKPOINT_2026-11-23_PARIDADE_ANALISE_ADEQUACAO: rodei o SQL de diagnóstico do `status` em `analise_adequacao` (P1-a) — resultado de Produção: [colar] / Preview: [colar]. Validação em Produção das duas telas: [ok / problema]."
