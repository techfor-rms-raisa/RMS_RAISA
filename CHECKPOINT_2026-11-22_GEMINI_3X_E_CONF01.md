# CHECKPOINT 22/11/2026 — Migração Gemini 2.5 → 3.x (Commit 1) e Hotfix CONF-01 (Commit 2)

**Sessão:** 22/11/2026, 10:42–12:20 (domingo)
**Participantes:** Messias (PO) + Claude (DEV / IA / Riscos / Design)
**Branches:** `preview` (`e7f5ba5`, `727bbcd`) → `main` (merge `9428e8a`) — **Produção Ready 12:16**
**Tema de origem:** retomada dos checkpoints de 05/11 (Módulo 1 — Validação de Consistência) e 11/11 (Módulo 2 — Avaliação Técnica e Comparativa). Frente escolhida: **auditar o que existe** → upgrade de modelo → hotfix CONF-01.

---

## 1. Auditoria do código (somente leitura) — resultado

| Item | Situação encontrada |
|---|---|
| Módulos 1 e 2 (checkpoints 05/11 e 11/11) | **Nenhum implementado.** Sem endpoints, sem tabelas (`tecnologias_referencia`, `validacoes_candidatura`, `questao_rubrica`, `stack_equivalencias`, `niveis_referencia`, `avaliacoes_tecnicas`). |
| Pendência prompt injection (maio/2026) | **Não implementada.** Zero sanitização, boundary defense ou validação de schema em `gemini-analyze.ts`, `analise-adequacao-perfil.ts`, `extract-cv-text.ts`. Não existe `api/lib/sanitize-cv-text.ts` nem `src/utils/sanitizePromptInput.ts`. |
| `aiRouter.ts` (70% Gemini / 30% Claude) | `claude-analyze.ts` usa `claude-haiku-4-5-20251001` e exige `ANTHROPIC_API_KEY`, **que não consta** entre as 30 env vars do Vercel (lista de 20/08). Provável que toda rota "Claude" caia no fallback Gemini. **Confirmar no Vercel.** |
| `src/services/geminiService.ts` | Instancia `GoogleGenAI` **no navegador** (viola Regra 12). Afeta o bundle do Vite — pesa na decisão de upgrade do SDK. |
| `extrair_texto_docx` (mammoth `extractRawText`) | Perde tabelas e cores — insuficiente para o parser do Skill/roteiro (peso por cor `002060`). |
| `fichaInclusaoParser.ts` v1.0 (18/11) | Parser puro, testável isolado — **padrão a copiar** para o parser do Skill .docx. |
| `questoes-inteligentes.ts`, `predicao-riscos.ts` | ~3 KB cada, praticamente stubs. |

### 1.1 Causa raiz do CONF-01 (cadeia de 3 pontos)
1. `analise-adequacao-perfil.ts` com `maxOutputTokens: 8192` (v2.2) — no Gemini 2.5/3.x os tokens de *thinking* consomem o mesmo limite → JSON truncado.
2. Bloco "v2.1 recuperar JSON truncado": extraía `score_geral` por regex, fixava `confianca_analise: 70`, zerava os arrays de requisitos e devolvia `recomendacao` da regex **ou `'ENTREVISTAR'` por padrão**.
3. `AnaliseRisco.tsx` `formatarGaps` só lia os arrays de requisitos → vazios → `gaps_identificados.length === 0` → check verde "Nenhum gap crítico identificado!". A tela ignorava `confianca_analise`.
4. Agravante: a análise degradada era **salva no cache** (`analise_adequacao`, status `concluida`) e servida para sempre ao mesmo CV+vaga.

---

## 2. Status do modelo Gemini (verificado 22/11)

- Página oficial de deprecations: `gemini-2.5-flash` "não deprecado, servido até segunda ordem, **acesso limitado a quem já usava**; para projetos novos use 3.5 Flash-Lite ou 3.8 Flash".
- **E-mail oficial da Google (recebido por Messias):** a partir de **01/12/2026** toda chamada a `gemini-2.5-flash` é **redirecionada para `gemini-3.5-flash-lite`** (thinking_level padrão "minimal"), cobrada a $0.30/$2.50 por 1M. Sem escolha explícita, as análises de recrutamento cairiam para o modelo mais fraco **sem erro no log**.
- Sucessor GA: `gemini-3.8-flash` (02/09/2026) — $0.75 in / $3.75 out por 1M até 31/12/2026; **dobra em 01/01/2027** ($1.50 / $7.50). 3.7 Flash e 3.5 Flash já foram descontinuados (08/10).
- Quebras dos modelos 3.x: `temperature`/`top_p`/`top_k` **ignorados** (400 em gerações futuras); `thinking_budget` → `thinking_level` (minimal/low/medium/high); `candidate_count > 1` e prefill de turno `model` → 400; `maxOutputTokens` recomendado ≥ 32768.
- SDK: projeto usa `@google/genai ^0.6.0`. Verificado no pacote 0.6.1: `thinkingConfig` só serializa `includeThoughts` — `thinkingLevel` é **descartado em silêncio**. Última versão: **3.6.1** (compatível com nosso uso; exige Node ≥ 22; afeta o bundle do frontend por causa do `geminiService.ts`). **Upgrade adiado para 28/11.**
- Fontes: https://ai.google.dev/gemini-api/docs/deprecations · https://ai.google.dev/gemini-api/docs/changelog · https://ai.google.dev/gemini-api/docs/latest-model · https://ai.google.dev/gemini-api/docs/pricing

---

## 3. Entregas

### Commit 1 — `e7f5ba5` `feat(gemini): camada unica de modelo e migracao 2.5 para 3.x nos endpoints de analise de CV`
| Arquivo | Versão | Mudança |
|---|---|---|
| `api/_utils/gemini-model.ts` | **NOVO v1.0** | `GEMINI_MODEL_ANALISE` (env ou `gemini-3.8-flash`), `GEMINI_MODEL_LITE` (env ou `gemini-3.5-flash-lite`), `GEMINI_MAX_OUTPUT_TOKENS = 32768`, `logarModelosGemini()` (1 log por cold-start). |
| `api/gemini-analyze.ts` | v5.1 → v5.2 | 18 pontos migrados: 13 ANALISE, 5 LITE (`extrairTextoPDF`, texto em `extrairDadosCV`, `classificarEmailCandidatura`, `classificarRespostaCliente`). `temperature` removido (3 blocos); 8192 → 32768 (2 blocos). |
| `api/analise-adequacao-perfil.ts` | v2.2 → v2.3 | modelo da camada; `temperature` removido; 8192 → 32768; mensagens de erro citam o modelo real. |
| `api/extract-cv-text.ts` | 1.0 → 1.1 | PDF→texto em LITE; `temperature` removido; 8192 → 32768. |

Teste Preview (11:39): `🤖 [analise-adequacao-perfil] Gemini ANALISE=gemini-3.8-flash | LITE=gemini-3.5-flash-lite | maxOutputTokens=32768` · análise João Pedro Custódio × 8067 concluída em **44.989 ms**, Score 86%, Confiança 92%, JSON íntegro. PDF extraído em ~3 s pela rota LITE.

### Commit 2 — `727bbcd` `fix(raisa): CONF-01 governanca de confianca na Analise de Adequacao`
Mockup `mockup_conf01_analise_cv.html` aprovado por Messias às 11:44 (Regra 9) antes do código.

| Arquivo | Versão | Mudança |
|---|---|---|
| `api/analise-adequacao-perfil.ts` | v2.3 → **v2.4** | `maxDuration` 60 → 300; detecção explícita de `FinishReason.MAX_TOKENS` + log de tokens; campos calculados no backend `analise_parcial`, `motivo_parcial`, `veredicto_confiavel` (= !parcial && confiança ≥ 80), `modelo_ia`; recuperação parcial: confiança 70 → 50, recomendação **sempre `REAVALIAR`**; fallback idem; `_metadata.finish_reason` e `confianca_minima`. |
| `src/components/raisa/AnaliseRisco.tsx` | v4.6 → **v5.1** | Sem veredicto confiável: score riscado cinza, "Confiança: N% — abaixo do mínimo (80%)", selo "⚠️ Não avaliável", faixa âmbar (motivo, requisitos avaliados, modelo) + botão **Reprocessar análise**; aba Gaps nunca mostra check verde sem veredicto; Requisitos/Perguntas desabilitadas se vazias; **análise degradada não é persistida** (fluxo auto e manual); **cache ignora `confianca_analise < 80`**; `modelo_ia` grava o modelo real (antes `'claude-sonnet'` fixo). |

Teste Preview (12:05):
- João Pedro × 8067 → **cache** (badge azul), 86/92/Entrevistar, sem IA. ✅
- **Bruno Martins × 8068 (regressão):** 11/11 = 78% / 70% / Entrevistar / "Nenhum gap crítico". 22/11 = **72% / 90% / 2 gaps impacto alto** (Go: "seniodade Pleno, não Sênior"; MySQL: "não evidencia altíssima escala"), Go 65% Parcial, ponto de atenção "transição recente em 2022/2023, perfil Pleno frente ao requisito Sênior". Estado B não disparou porque a análise veio completa (causa raiz eliminada; rede de segurança armada).

### Promoção
`git checkout main → pull --no-rebase → merge preview -X theirs → push` → merge `9428e8a`, **Produção Ready 12:16**. Sem migration SQL.

---

## 4. Decisões tomadas (Messias)

| # | Decisão | Hora |
|---|---|---|
| D1 | Começar pela auditoria do código existente, não pelo board nem pelo hotfix. | 10:45 |
| D2 | Antes do hotfix, verificar deprecação do modelo e já fazer o upgrade. | 10:55 |
| D3 | Divisão **3.8 Flash (análise/raciocínio)** × **3.5 Flash-Lite (volume/classificação)**, sobrescrevível por env var. | 11:07 |
| D4 | Commit 1 hoje só nos 3 endpoints do hotfix; **migração total do Gemini (demais ~15 arquivos + upgrade do SDK para 3.6.1 + `geminiService.ts` + `version.ts`/`constants.ts`) no sábado 28/11/2026.** | 11:07 |
| D5 | Mockup CONF-01 aprovado sem alterações (limiar 80%, textos, botão Reprocessar). | 11:44 |
| D6 | Promover os dois commits para Produção no mesmo dia. | 12:14 |

---

## 5. Pendências priorizadas

| Prior. | Item | Resp. | Quando |
|---|---|---|---|
| **P0** | **Migração total Gemini 3.x** (deadline Google 01/12): `prospect-*`, `lib/gemini-confirma-emprego.ts`, `_utils/gemini-discovery.ts`, `_utils/gemini-ranker.ts`, `gemini-cv.ts`, `gemini-cv-generator-v2.ts`, `gemini-audio-transcription.ts`, `analyze-activity-report.ts`, `cron/*` → usar `./_utils/gemini-model.js`; remover `temperature`; verificar function calling / Search Grounding (`thought_signature`) nos arquivos de Email Recovery. Upgrade `@google/genai` → 3.6.1 (commit do `package-lock.json` junto — regra do lockfile ghost) e então `thinking_level` explícito por tier. Tratar `src/services/geminiService.ts` (SDK no browser) e os textos fixos "Powered by gemini-2.5-flash" / "Gemini 2.0 + Claude" (`constants.ts`, `version.ts`, `AnaliseRisco.tsx` subtítulo). | Claude + Messias | **28/11 (sáb)** |
| **P0** | Confirmar no Vercel se `ANTHROPIC_API_KEY` existe (define se a rota Claude está viva). | Messias | antes de 28/11 |
| **P1** | Custo: 3.8 Flash dobra em 01/01/2027. Reavaliar tier por action depois de 1 mês de uso (Consumo Créditos). | Messias | dez/2026 |
| **P1** | Módulo 2 — família **SENIOR** (`SENIOR-01`: tempo na disciplina por união de intervalos × `niveis_referencia`) e **CONF-04**. O caso Bruno Martins continua "Entrevistar" por ser Pleno em vaga Sênior — a IA descreve, mas nada transforma em veredicto. Depende da coluna `disciplina` em `pessoa_experiencias`. | Claude | após board |
| **P1** | Apresentação ao board (negócios + técnico): fluxo bases × regras × benefícios dos Módulos 1 e 2 (intenção de 14/11). | Messias | a agendar |
| **P1** | Prompt injection (3 camadas) — nasce junto com o Módulo 1. | Claude | com Módulo 1 |
| **P2** | `api/prospect-vagas-1.ts` untracked (sobra, 8.199 bytes = mesmo tamanho do original) — comparar e apagar. | Messias | qualquer hora |
| **P2** | Decisões em aberto dos checkpoints 05/11 (8) e 11/11 (12) — recomendação por item. | Claude | abertura do chat do Módulo 1/2 |

---

## 6. Lições da sessão

- **Downloads do Claude chegam com sufixo `-1`** quando o arquivo já existe; o `_utils/` não é criado → sempre `Move-Item -Force` para o caminho certo e `Test-Path` antes do `git add`.
- **Paste multilinha no PowerShell:** um bloco com erro de parse (pipe cortado, `<` de e-mail) **não executa nenhuma linha** e deixa o terminal em `>>` — Ctrl+C e repetir em blocos curtos; trailers de commit entre **aspas simples**.
- **Python `open()` em modo texto normaliza CRLF** → diff de 3.000 linhas falso. Ler/escrever com `newline=''` ou reconverter; conferir `grep -c $'\r$'`.
- Cache de análise de IA deve ter **critério de qualidade na escrita e na leitura**; resultado degradado nunca pode ser cacheado.
- Gemini 3.x: a IA do 3.8 Flash já aponta senioridade no texto ("limite entre Pleno maduro e Sênior inicial") — regra determinística SENIOR-01 vai só formalizar o que o modelo descreve.

---

## 7. Frase de retomada

> "Claude, retomar a partir do CHECKPOINT_2026-11-22_GEMINI_3X_E_CONF01: hoje é a migração total do Gemini 3.x (pendência P0). Resultado do `ANTHROPIC_API_KEY` no Vercel: [existe / não existe]. Vou te mandar os arquivos atuais de `lib/gemini-*`, `_utils/gemini-*` e `prospect-*` conforme você pedir."
