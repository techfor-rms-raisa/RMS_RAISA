# RMS-RAISA — Contexto do Projeto
> Atualizado manualmente em 16/03/2026

---

## 1. Visão Geral

**RMS-RAISA** é um SaaS de gestão de talentos e recrutamento desenvolvido pela TechFor.
- **Stack:** React + TypeScript + Vite (frontend) | Supabase (banco + auth) | Vercel (deploy + serverless)
- **Repositório:** `techfor-rms-raisa / RMS_RAISA`
- **Branches:** `preview` (desenvolvimento/testes) → `main` (produção)
- **Deploy:** Vercel com environments separados (preview e production)
- **Variáveis de ambiente:** Gerenciadas via Vercel CLI (mais confiável que dashboard)

---

## 2. Pessoas e Perfis

| Nome | Perfil | Uso principal |
|---|---|---|
| Tatiana | Gestão Comercial | Prospecção de leads B2B |
| Marcos | Gestão Comercial | Prospecção de leads B2B |
| Roseni | Gestão Comercial | Prospecção de leads B2B |
| Larissa | Analista | Gestão de candidatos |
| Macielma | Analista | Gestão de candidatos |

---

## 3. Arquitetura de Pastas

```
RMS_RAISA/
├── api/                          # Serverless functions (Vercel)
│   ├── gemini-analyze.ts         # Hub central de IA — todas as actions Gemini
│   ├── prospect-gemini-search.ts # Motor de prospecção B2B via Gemini + Google Search
│   ├── prospect-hunter-enrich.ts # Enriquecimento de email via Hunter.io + Snov.io fallback
│   ├── prospect-save.ts          # Salvar leads no Supabase
│   ├── prospect-leads.ts         # Listar leads salvos
│   └── [outros endpoints...]
├── src/
│   ├── components/
│   │   ├── prospect/
│   │   │   └── ProspectSearchPage.tsx  # UI do Prospect Engine v4.1
│   │   ├── cv/                         # Geração de CV (DOCX)
│   │   ├── candidates/                 # Gestão de candidatos
│   │   ├── jobs/                       # Gestão de vagas
│   │   └── interviews/                 # Entrevistas técnicas
│   ├── contexts/
│   │   └── AuthContext.tsx             # Autenticação Supabase
│   ├── types/
│   │   └── types_users.ts              # UserRole union type (inclui 'SDR')
│   ├── utils/
│   │   └── permissions.ts              # Sistema centralizado de permissões v58.4
│   └── components/layout/
│       └── Sidebar.tsx                 # Menu lateral com controle de acesso v58.4
├── database/                           # Scripts SQL e migrations
├── docs/                               # Documentação
├── scripts/
│   └── update-context.js               # Auto-update deste arquivo
├── CONTEXT.md                          # Este arquivo
├── .claudeignore                       # Exclusões para indexação Claude.ai
└── .gitignore                          # node_modules, dist, .env, etc.
```

---

## 4. Módulos Funcionais

### 4.1 Prospect Engine v2.1 ✅ PRODUÇÃO
**Arquivo principal:** `api/prospect-gemini-search.ts` + `api/prospect-hunter-enrich.ts`
**Status:** Operacional — última correção 16/03/2026

**Fluxo:**
1. Usuário informa domínio + filtros (departamento, nível hierárquico, max resultados)
2. Gemini 2.5 Flash + Google Search Grounding descobre executivos publicamente indexados
3. Resultados exibidos imediatamente
4. Hunter.io enriquece emails sob demanda (checkbox — consome créditos)
5. **Fallback automático:** se Hunter não encontra → Snov.io tenta
6. Leads selecionados salvos no Supabase

**Pipeline de enriquecimento (Hunter + Snov.io):**
```
Tentativa 1: Domain Search cross-reference  (sem crédito extra)
Tentativa 2: Hunter Email Finder            (1 crédito Hunter)
Tentativa 3: Snov.io Email Finder           (fallback automático)
Sem email:   not_found
```

**Processamento paralelo:** lotes de 4 prospects simultâneos via `Promise.all` — evita timeout 504 do Vercel (limite 60s).

**Coluna "Origem E-mail"** na tabela de resultados:
- 🎯 Hunter Finder — laranja
- 🔵 Hunter Domain — amarelo
- 🟣 Snov.io — roxo

**Configurações validadas:**
- `thinkingBudget: 4096` — sweet spot para 5-6 queries Google sem loop
- `maxPorChamada: 10–50` — configurável via slider no frontend
- Estratégia dual paralela: divide por departamento ou senioridade para maximizar cobertura

**Bugs resolvidos (v2.1):**
- ✅ Snov.io `taskHash` — estava em `startData.data.task_hash` (não `meta.task_hash`)
- ✅ Timeout 504 — resolvido com processamento paralelo em lotes de 4
- ✅ Hunter enriquece apenas prospects selecionados (não toda a lista)
- ✅ Merge cirúrgico preserva seleção e dados ao retornar do Hunter
- ✅ Variáveis env `\r\n` — usar prompt interativo do CLI, nunca `echo |`

**DEPT_LABELS** e **SENIOR_LABELS** — ver seção anterior (sem mudanças)

### 4.2 CV Generator ✅ PRODUÇÃO
**Biblioteca:** `docx-js`
**Templates:** TechFor Simple | TechFor Detailed | T-Systems

### 4.3 LinkedIn Chrome Extension v5.45+ ✅ PRODUÇÃO
**Estratégia:** text-parsing (não CSS selectors)
**Auto-refresh:** Supabase Realtime WebSocket + visibilitychange + evento `raisa-linkedin-import`

### 4.4 Entrevistas Técnicas ✅ PRODUÇÃO

### 4.5 Relatórios de Atividade (Consultores) ✅ PRODUÇÃO

### 4.6 Banco de Talentos v3.2 ✅ PRODUÇÃO
**Auto-refresh triplo:**
- Estratégia 1: Supabase Realtime WebSocket (INSERT/UPDATE/DELETE na tabela `pessoas`)
- Estratégia 2: `visibilitychange` — refresh ao voltar para a aba
- Estratégia 3: evento `raisa-linkedin-import` — extensão notifica explicitamente
**SQL necessário:** `ALTER TABLE pessoas REPLICA IDENTITY FULL;`

### 4.7 Perfil SDR ✅ PREVIEW / PRODUÇÃO
**Status:** Deployado em 16/03/2026
**Acesso:** exclusivo ao módulo Prospect (Buscar Leads, Meus Prospects, Consumo Créditos)
**Arquivos alterados:**
- `src/types/types_users.ts` — `'SDR'` adicionado ao union type `UserRole`
- `src/utils/permissions.ts` — SDR em `getPerfisPodeVer/Criar` + `podeUsarProspect()`
- `src/components/layout/Sidebar.tsx` — SDR nos 3 itens Prospect + `temAcessoPROSPECT`
- `src/components/ManageUsers.tsx` — SDR em `allUserRoles` + badge teal
- `src/App.tsx` — SDR redireciona para `prospect_search` ao logar (não vê Dashboard RMS)
**Banco de dados:** nenhuma query necessária — `tipo_usuario` é `VARCHAR(50)` sem CHECK constraint

### 4.8 Talent Finder 🔲 PENDENTE — PRÓXIMO MÓDULO
**Status:** Decisões de design pendentes antes do desenvolvimento

---

## 5. APIs e Integrações

| Serviço | Uso | Variável de Ambiente |
|---|---|---|
| Gemini 2.5 Flash | Prospect Engine (Search Grounding) | `API_KEY` |
| Gemini 2.0 Flash | CV, triagem, entrevistas, relatórios | `API_KEY` |
| Hunter.io | Email finder/enrichment (motor principal) | `HUNTER_API_KEY` |
| Snov.io | Email finder (fallback quando Hunter falha) | `SNOVIO_USER_ID`, `SNOVIO_API_SECRET` |
| Supabase | Banco de dados + Auth + Realtime | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Vercel | Deploy + Serverless functions | (configurado no projeto) |

**⚠️ Atenção ao cadastrar variáveis no Vercel CLI:**
- NUNCA usar `echo "valor" | npx vercel env add` — adiciona `\r\n` no final da chave
- SEMPRE usar `npx vercel env add NOME ambiente` e colar o valor diretamente no prompt interativo

**Removidos/Descartados:**
- ❌ Apollo.io — Free Tier não permite filtrar domain + location para empresas brasileiras

---

## 6. Banco de Dados Supabase

### Tabelas principais
| Tabela | Descrição |
|---|---|
| `app_users` | Usuários do sistema — `tipo_usuario VARCHAR(50)` sem CHECK constraint |
| `candidatos` / `pessoas` | Banco de talentos |
| `vagas` | Vagas abertas |
| `candidaturas` | Relacionamento candidato ↔ vaga |
| `prospect_leads` | Leads B2B salvos pelo Prospect Engine |
| `relatorios_consultores` | Relatórios mensais de atividade |
| `entrevistas` | Entrevistas técnicas geradas |

### Constraints importantes — prospect_leads
```sql
-- motor CHECK constraint atual (inclui 'extension')
CHECK (motor IN ('apollo', 'snovio', 'ambos', 'gemini', 'hunter', 'gemini+hunter', 'extension'));
```

### Regras importantes
- **RLS:** pode bloquear silenciosamente o frontend sem policies → sempre verificar quando houver 403
- **`.single()`:** lança erro se não encontrar registro → usar `.maybeSingle()`
- **Session Pooler:** usar connection string do Session Pooler quando direct connection falhar DNS
- **REPLICA IDENTITY:** executar `ALTER TABLE pessoas REPLICA IDENTITY FULL` para Realtime funcionar

---

## 7. Padrões de Desenvolvimento

### Regras do projeto (acordadas com Messias)
1. Entregar sempre arquivos completos prontos para download
2. Citar o caminho hierárquico completo do arquivo
3. Não agrupar em ZIP
4. Conferir lista de arquivos antes de entregar
5. Comandos Git sempre para ambiente PREVIEW (PowerShell Windows)
6. Modificações cirúrgicas — não afetar código existente
7. Nunca modificar layouts/designs sem aprovação prévia
8. Sempre chamar backend (`/api/gemini-analyze`) em vez de API diretamente no frontend
9. Soluções definitivas — não contornos temporários
10. Investigar nomes de colunas/tabelas antes de criar queries

### Git Workflow
```powershell
# Desenvolvimento → Preview
git add [arquivos]
git commit -m "tipo(escopo): descrição"
git push origin preview

# Preview → Produção (após validação)
# ⚠️ SEMPRE seguir esta ordem para evitar conflito com script update-context.js
git checkout main
git merge preview --no-ff -m "descrição"
git pull origin main --no-rebase   # ← integra commit automático do CONTEXT.md
git push origin main
git checkout preview
```

### Vercel CLI — Variáveis de Ambiente
```powershell
# Listar variáveis
npx vercel env ls

# Adicionar (SEMPRE interativo — nunca echo |)
npx vercel env rm NOME ambiente
npx vercel env add NOME ambiente
# → colar valor diretamente no prompt, branch vazio = todos

# Baixar .env.local do preview
npx vercel env pull .env.local --environment preview
# ⚠️ Nunca commitar .env.local

# Redeploy de deployment específico
npx vercel ls   # pegar URL do deployment
npx vercel redeploy https://rms-raisa-[id]-techfor.vercel.app

# Trocar de team
npx vercel switch   # selecionar Techfor (techfor)
```

---

## 8. Problemas Conhecidos / Lições Aprendidas

| Problema | Solução |
|---|---|
| Apollo Free Tier não filtra domain+location para BR | Não revisitar Apollo |
| Gemini thinkingBudget muito baixo (<1024) faz modelo desistir | Manter em 4096 |
| LinkedIn DOM muda frequentemente | Usar text-parsing, nunca CSS selectors |
| Supabase `.single()` estoura em query vazia | Usar `.maybeSingle()` |
| RLS sem policies bloqueia silenciosamente | Verificar RLS em erros 403 |
| Vercel dashboard para env vars é instável | Usar Vercel CLI |
| `echo \|` no PowerShell adiciona `\r\n` às env vars | Usar prompt interativo do CLI |
| `git push origin main` rejeitado após merge | Sempre `git pull origin main --no-rebase` antes do push (script update-context.js commita no main automaticamente) |
| Timeout 504 no Hunter com muitos prospects | Processamento paralelo em lotes de 4 via Promise.all |
| Snov.io `taskHash` não encontrado | `task_hash` está em `startData.data.task_hash` (objeto simples, não array) |
| `node_modules` no Git quebra Knowledge Base | `.gitignore` + `.claudeignore` corretos |
| Vercel CLI `switch` — "cannot set Personal Account as scope" | Usar `npx vercel switch` sem parâmetros e selecionar Techfor |

---

## 9. Especialidades Ativas (Claude)

| Código | Especialidade | Quando usar |
|---|---|---|
| 🔧 Claude DEV | Engenharia de Software Sênior | Código, bugs, Git |
| 🎨 Claude Design | UX/UI Sênior | Melhorias visuais, fluxos |
| 💼 Claude Negócios | Estratégia de Produto | KPIs, modelo de negócio |
| 🤖 Claude IA | Machine Learning Sênior | Prompts Gemini, otimização |
| ⚠️ Claude Riscos | Análise de Riscos Sênior | Segurança, contingências |
| 👥 Claude RH | Gestão de Pessoas Sênior | Onboarding, adoção |
| 📊 Claude Processos | Gestão de Processos Sênior | Workflows, automações |
| 🗄️ Claude DBA | Supabase/PostgreSQL Sênior | Queries, performance, RLS |
---

## 10. Métricas do Repositório
> Gerado automaticamente pelo script update-context.js

| Módulo | Arquivos | Tamanho | Última modificação |
|---|---|---|---|
| `api/` | 40 arquivos | 451.6 KB | 17/03/2026 |
| `src/components/` | 107 arquivos | 807.7 KB | 17/03/2026 |
| `src/pages/` | 0 arquivos | 0 KB | N/A |
| `src/contexts/` | 2 arquivos | 2.3 KB | 17/03/2026 |
| `src/types/` | 6 arquivos | 29.8 KB | 17/03/2026 |
| `database/` | 0 arquivos | 109.5 KB | 17/03/2026 |
| `scripts/` | 1 arquivos | 6.8 KB | 17/03/2026 |

### Endpoints API ativos
- `api/analise-adequacao-perfil.ts`
- `api/analyze-activity-report.ts`
- `api/apollo-prospect-test.ts`
- `api/claude-analyze.ts`
- `api/cv-generator-docx-bg.ts`
- `api/cv-generator-docx.ts`
- `api/debug-env.ts`
- `api/entrevista-docx.ts`
- `api/gemini-analyze.ts`
- `api/gemini-audio-transcription.ts`
- `api/gemini-cv-generator-v2.ts`
- `api/gemini-cv.ts`
- `api/predicao-riscos.ts`
- `api/prospect-apollo-search.ts`
- `api/prospect-capture.ts`
- `api/prospect-email-finder.ts`
- `api/prospect-gemini-search.ts`
- `api/prospect-hunter-enrich.ts`
- `api/prospect-leads.ts`
- `api/prospect-save.ts`
- `api/prospect-snovio-search.ts`
- `api/questoes-inteligentes.ts`
- `api/recomendacao-analista.ts`
- `api/send-email.ts`
- `api/talent-finder-search.ts`
- `api/upload-audio.ts`
- `api/vaga-analistas-recomendados.ts`
- `api/vaga-prioridade.ts`
- `api/version.ts`

---
