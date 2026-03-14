# RMS-RAISA — Contexto do Projeto
> Atualizado automaticamente pelo script `scripts/update-context.js`
> Última atualização automática: 14/03/2026, 09:22

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
│   ├── prospect-hunter-enrich.ts # Enriquecimento de email via Hunter.io
│   ├── prospect-save.ts          # Salvar leads no Supabase
│   ├── prospect-leads.ts         # Listar leads salvos
│   └── [outros endpoints...]
├── src/
│   ├── components/
│   │   ├── prospect/
│   │   │   └── ProspectSearchPage.tsx  # UI do Prospect Engine v2.0
│   │   ├── cv/                         # Geração de CV (DOCX)
│   │   ├── candidates/                 # Gestão de candidatos
│   │   ├── jobs/                       # Gestão de vagas
│   │   └── interviews/                 # Entrevistas técnicas
│   ├── contexts/
│   │   └── AuthContext.tsx             # Autenticação Supabase
│   ├── pages/                          # Roteamento principal
│   └── types/                          # TypeScript types
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
**Arquivo principal:** `api/prospect-gemini-search.ts`
**Status:** Operacional — última correção 12/03/2026

**Fluxo:**
1. Usuário informa domínio + filtros (departamento, nível hierárquico, max resultados)
2. Gemini 2.5 Flash + Google Search Grounding descobre executivos publicamente indexados
3. Resultados exibidos imediatamente
4. Hunter.io enriquece emails sob demanda (checkbox — consome créditos)
5. Leads selecionados salvos no Supabase

**Configurações validadas:**
- `thinkingBudget: 4096` — sweet spot para 5-6 queries Google sem loop
- `maxPorChamada: 10–50` — configurável via slider no frontend
- Estratégia dual paralela: divide por departamento ou senioridade para maximizar cobertura

**DEPT_LABELS** (mapeamento de filtros → termos de busca):
```
ti_tecnologia → TI, Tecnologia, Tecnologia da Informação, Technology, IT, Sistemas, Inovação, Digital
compras_procurement → Compras, Procurement, Suprimentos, Aquisições
infraestrutura → Infraestrutura, Cloud, Data Center, Redes
governanca_compliance → Governança, Compliance, Segurança da Informação, Cybersecurity
rh_recursos_humanos → Recursos Humanos, RH, People, Gente e Gestão
comercial_vendas → Comercial, Vendas, Revenue, Sales, Business Development
financeiro → Financeiro, CFO, Controladoria, Finanças, Tesouraria
diretoria_clevel → CEO, COO, Diretor Geral, Presidente, Vice-Presidente
```

**SENIOR_LABELS** (mapeamento de níveis → termos de busca):
```
c_level → CEO, CTO, CIO, COO, CFO, CISO, CPO, CHRO, CMO
vp → Vice-Presidente, VP, Vice President
diretor → Diretor, Diretor Executivo, Director, Managing Director
gerente → Gerente, Manager, Gerente-Executivo, Gerente Executivo, Gerente Geral, Gerente Sênior
coordenador → Coordenador, Coordinator
superintendente → Superintendente, Head, Head of, Head de
```

**Bugs resolvidos (v2.1):**
- ✅ Stellantis Seguros: prompt reformulado para usar nome explícito como âncora das queries
- ✅ Gerente-Executivo: SENIOR_LABELS expandido com variações brasileiras
- ✅ Filtro pós-merge: aceita hífen/espaço em variações de cargo
- ✅ Slider de max resultados (10–50) no frontend

### 4.2 CV Generator ✅ PRODUÇÃO
**Biblioteca:** `docx-js`
**Templates:** TechFor Simple | TechFor Detailed | T-Systems
**Letterhead:** TechFor
**Bugs resolvidos:** dimensões da imagem de fundo, margens, conflito INSERT/UPDATE em `candidatura_id`

### 4.3 LinkedIn Chrome Extension v5.45+ ✅ PRODUÇÃO
**Estratégia:** text-parsing (não CSS selectors — LinkedIn usa hash-based dynamic classes)
**Lookahead parsing:** identifica job titles via H2 headings → parent SECTION → innerText
**Auto-refresh:** Supabase Realtime WebSocket atualiza banco de talentos ao importar

### 4.4 Entrevistas Técnicas ✅ PRODUÇÃO
**Fluxo:** Gemini gera perguntas personalizadas por vaga + CV → candidato responde → Gemini avalia + detecta uso de IA

### 4.5 Relatórios de Atividade (Consultores) ✅ PRODUÇÃO
**Análise:** Gemini extrai behavioral flags, risco de saída (1–5), recomendações

### 4.6 Talent Finder 🔲 PENDENTE — PRÓXIMO MÓDULO
**Status:** Decisões de design pendentes antes do desenvolvimento
- Menu placement / posição na sidebar
- Campos a exibir nos resultados
- Ações pós-busca

---

## 5. APIs e Integrações

| Serviço | Uso | Variável de Ambiente |
|---|---|---|
| Gemini 2.5 Flash | Prospect Engine (Search Grounding) | `API_KEY` |
| Gemini 2.0 Flash | CV, triagem, entrevistas, relatórios | `API_KEY` |
| Hunter.io | Email finder/enrichment | `HUNTER_API_KEY` |
| Supabase | Banco de dados + Auth + Realtime | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Vercel | Deploy + Serverless functions | (configurado no projeto) |
| Sentry | Monitoramento de erros (via Vercel) | — |

**Removidos/Descartados:**
- ❌ Apollo.io — Free Tier não permite filtrar domain + location simultaneamente para empresas brasileiras
- ❌ Snov.io — substituído pelo Gemini Search Grounding

---

## 6. Banco de Dados Supabase

### Tabelas principais
| Tabela | Descrição |
|---|---|
| `usuarios` | Usuários do sistema (16 registros, 14 colunas) |
| `candidatos` | Banco de talentos |
| `vagas` | Vagas abertas |
| `candidaturas` | Relacionamento candidato ↔ vaga |
| `prospect_leads` | Leads B2B salvos pelo Prospect Engine |
| `relatorios_consultores` | Relatórios mensais de atividade |
| `entrevistas` | Entrevistas técnicas geradas |

### Coluna importante — prospect_leads
```sql
-- Adicionada em 05/03/2026
ALTER TABLE prospect_leads ADD COLUMN fonte_id_gemini TEXT;
-- Constraint motor atualizada para incluir novos valores
ALTER TABLE prospect_leads DROP CONSTRAINT prospect_leads_motor_check;
ALTER TABLE prospect_leads ADD CONSTRAINT prospect_leads_motor_check
  CHECK (motor IN ('gemini', 'hunter', 'gemini+hunter', 'apollo', 'snovio'));
```

### Regras importantes
- **RLS:** pode bloquear silenciosamente o frontend sem policies → sempre verificar quando houver 403
- **`.single()`:** lança erro se não encontrar registro → usar `.maybeSingle()` para queries opcionais
- **Session Pooler:** usar connection string do Session Pooler quando direct connection falhar DNS (IPv4)

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
git checkout main
git merge preview
git push origin main
```

### Padrão de actions no gemini-analyze.ts
Toda nova funcionalidade de IA deve ser adicionada como uma nova `case` no switch:
```typescript
case 'nome_da_action':
  result = await minhaFuncao(payload);
  break;
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
| `node_modules` no Git quebra Knowledge Base Claude.ai | `.gitignore` + `.claudeignore` corretos |

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
| `api/` | 39 arquivos | 435.9 KB | 14/03/2026 |
| `src/components/` | 107 arquivos | 807.6 KB | 14/03/2026 |
| `src/pages/` | 0 arquivos | 0 KB | N/A |
| `src/contexts/` | 2 arquivos | 2.3 KB | 14/03/2026 |
| `src/types/` | 6 arquivos | 29.7 KB | 14/03/2026 |
| `database/` | 0 arquivos | 109.5 KB | 14/03/2026 |
| `scripts/` | 1 arquivos | 6.8 KB | 14/03/2026 |

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
