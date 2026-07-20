# RMS-RAISA — Contexto do Projeto
> Atualizado manualmente em 25/03/2026 (fim do dia)

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
| Larissa | Analista R&S | Gestão de candidatos |
| Macielma | Analista R&S | Gestão de candidatos |

---

## 3. Arquitetura de Pastas

```
RMS_RAISA/
├── api/                          # Serverless functions (Vercel)
│   ├── gemini-analyze.ts         # Hub central de IA — todas as actions Gemini
│   ├── gemini-cv-generator-v2.ts # Geração de CV HTML (preview + PDF)
│   ├── cv-generator-docx.ts      # Geração de CV DOCX (TechFor + T-Systems)
│   ├── prospect-gemini-search.ts # Motor de prospecção B2B via Gemini + Google Search
│   ├── prospect-hunter-enrich.ts # Enriquecimento de email via Hunter.io + Snov.io fallback
│   ├── prospect-save.ts          # Salvar leads no Supabase
│   ├── prospect-leads.ts         # Listar leads salvos
│   ├── prospect-capture.ts       # Receber leads da Prospect Chrome Extension
│   ├── prospect-validate-emails.ts  # Validação de emails (Campanha)
│   ├── prospect-infer-emails.ts     # Inferência de emails por padrão (Campanha)
│   ├── prospect-enrich-company.ts   # Enriquecimento CNPJ/endereço via cnpj.ws (Campanha)
│   └── linkedin/
│       └── importar.ts           # Importação de perfis LinkedIn (normalização de URL)
├── src/
│   ├── components/
│   │   ├── prospect/
│   │   │   ├── ProspectSearchPage.tsx   # UI do Prospect Engine v4.1+
│   │   │   └── CampanhaPrep.tsx         # Wizard "Preparar Campanha" v1.1
│   │   ├── AgendaAcompanhamento.tsx     # Agenda de Acompanhamento de Consultores v1.0
│   │   ├── raisa/
│   │   │   ├── NovaCandidaturaModal.tsx  # Modal nova candidatura v57.9+
│   │   │   ├── EntrevistaComportamental.tsx  # Entrevista + geração de CV
│   │   │   ├── CVGeneratorV2.tsx         # Interface geração de CV
│   │   │   └── DetalhesCandidaturaModal.tsx  # Detalhes + status "Sem Interesse"
│   │   ├── linkedin/
│   │   │   └── LinkedInImportPanel.tsx  # Painel principal LinkedIn (canonical)
│   │   ├── cv/                          # Geração de CV (componentes auxiliares)
│   │   ├── candidates/                  # Gestão de candidatos
│   │   ├── jobs/                        # Gestão de vagas
│   │   └── interviews/                  # Entrevistas técnicas
│   ├── contexts/
│   │   └── AuthContext.tsx              # Autenticação Supabase
│   ├── hooks/
│   │   └── supabase/
│   │       └── useRaisaCVSearch.ts      # Hook busca de candidatos (busca banco ilike)
│   ├── types/
│   │   ├── types_users.ts               # UserRole union type (inclui 'SDR')
│   │   └── types_models.ts              # View union type (inclui 'agenda_acompanhamento', 'prospect_campaign')
│   ├── utils/
│   │   └── permissions.ts              # Sistema centralizado de permissões v58.5
│   └── components/layout/
│       └── Sidebar.tsx                 # Menu lateral com controle de acesso
├── database/                           # Scripts SQL e migrations
├── docs/                               # Documentação
├── scripts/
│   └── update-context.js               # Auto-update deste arquivo
├── CONTEXT.md                          # Este arquivo
├── .claudeignore                       # Exclusões para indexação Claude.ai
└── .gitignore                          # node_modules, dist, .env, etc.
```

> ⚠️ **Arquivo legado a remover:** `src/components/raisa/LinkedInImportPanel.tsx` — supersedido por `src/components/linkedin/LinkedInImportPanel.tsx`

---

## 4. Módulos Funcionais

### 4.1 Prospect Engine v2.1 ✅ PRODUÇÃO
**Arquivo principal:** `api/prospect-gemini-search.ts` + `api/prospect-hunter-enrich.ts`
**Status:** Operacional

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

**Coluna "Gravado Por"** — JOIN com `app_users` exibe nome do usuário que salvou o lead.

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

### 4.1.1 Dashboard de Créditos (CreditosTab) ✅ PRODUÇÃO
**Arquivo:** dentro de `ProspectSearchPage.tsx` (ou tab separado)
**Exibe:** KPIs de consumo, top cargos prospectados, distribuição por motor (gemini/hunter/snov.io), performance por usuário, filtros por período (7d / 30d / 90d / todos).

### 4.1.2 Prospect Chrome Extension v1.03 ✅ PRODUÇÃO
**Fluxo:** Extensão captura resultados do Google Search (busca boolean LinkedIn) → envia para `/api/prospect-capture` → ProspectSearchPage exibe leads capturados.

**Bugs resolvidos em v1.03:**
- ✅ `user_id` chegava `null` no backend — `background.js` chamava API antes do `content-rms.js` ler `rms_user` do localStorage
- ✅ Fix: `buscarUserIdDoRMS()` em `background.js` envia mensagem `GET_USER_ID` para o tab RMS-RAISA via `content-rms.js` antes de chamar a API
- ✅ `manifest.json` atualizado: permissão `"tabs"` + `https://www.techfortirms.online/*` em `host_permissions` e `content_scripts`

**Arquivos da extensão:** `background.js`, `content.js`, `content-rms.js`, `manifest.json`, `popup.html`, `popup.js`

### 4.1.3 Preparar Campanha v1.1 ✅ PREVIEW/PRODUÇÃO
**Arquivo:** `src/components/prospect/CampanhaPrep.tsx`
**Posição no menu:** abaixo de "Meus Prospects"
**Fluxo (4 etapas):**
1. Selecionar leads (de Meus Prospects ou upload CSV externo)
2. Configurar campanha (funil: ALOCAÇÃO / SERVICE CENTER / BPO)
3. Enriquecer e validar (Gemini para dados empresa + inferência de email + validação cascata)
4. Exportar CSV 48 colunas no formato Leads2B

**Arquitetura de enriquecimento:**
- Cache local → Hunter.io → Snov.io (valida apenas emails novos ou inferidos, preserva créditos)
- `prospect-enrich-company.ts` — CNPJ/endereço via cnpj.ws
- `prospect-infer-emails.ts` — padrão empresa (ex: nome.sobrenome@empresa.com)
- `prospect-validate-emails.ts` — validação cascata

**Formato de exportação:** CSV/XLS com 48 colunas (padrão Leads2B) — mesmo layout para importação manual ou via wizard.

**Campos fixos no export:** etapa=`Novos Leads`, origem=`Campanha`, status=`ativo`, temperatura=`Frio`, país=`Brasil`. Campo `funil` preenchido apenas no wizard (não no export direto do Prospect Engine).

**Permissões:** `podePrepararCampanha()` em `permissions.ts` v58.5 — Administrador, Gestão Comercial, SDR.

**Visibilidade de leads:** Administrador e Gestão Comercial veem todos os prospects da equipe; SDR vê apenas os próprios.

### 4.2 CV Generator ✅ PRODUÇÃO
**Arquivos:** `api/gemini-cv-generator-v2.ts` (HTML/PDF) + `api/cv-generator-docx.ts` (DOCX)
**Templates:** TechFor Simple | TechFor Detailed | T-Systems

**Ordem correta de seções — Template TechFor:**
Dados Pessoais → Parecer Seleção → Resumo Profissional → Recomendação + Disponibilidade → Requisitos Mandatórios → Requisitos Diferenciais → Hard Skills → Formação Acadêmica → Formação Complementar → Idiomas → Histórico Profissional

**Template T-Systems:**
- Cover (Seção 1): logo TechFor, nome candidato (TeleGrotesk Headline Ultra 30pt branco), objetivo ({codigo_vaga} - {titulo_vaga}), blocos de cor (#F48FB1 rosa topo + #E20074 magenta fundo)
- Corpo (Seção 2): Perfil, Hard Skills (tabela cabeçalho magenta), Parecer da Entrevista Técnica (bloco rosé #FCE8F3), Recomendação, Experiência, Idiomas, Formação, Informações Adicionais
- Fontes: `TeleGrotesk Headline Ultra` (nome), `TeleGrotesk Headline` (objetivo), `Verdana` (corpo)
- Background cover: tabelas com `ShadingType.CLEAR` + `fill` (docx não suporta background em paragráfo diretamente)

**Bugs resolvidos:**
- ✅ `EntrevistaComportamental.tsx` — useEffect init agora busca 5 tabelas em paralelo (`Promise.all`): `pessoas`, `pessoa_experiencias`, `pessoa_formacao`, `pessoa_idiomas`, `pessoa_skills`
- ✅ `hard_skills_tabela` da vaga não sobrescreve skills do candidato
- ✅ `motivo_saida` persistido em todos os 7 pontos de inserção
- ✅ `templateSelecionado` lido corretamente no DOCX (não mais hardcoded como `'tsystems'`)
- ✅ Resumo Profissional inserido após "Parecer Seleção" em ambos os geradores (HTML e DOCX)
- ✅ iframe do preview com altura dinâmica (não mais `h-[700px] overflow-hidden`)
- ✅ `cv_gerado` com lógica UPDATE/INSERT condicional (sem conflito 409)
- ✅ Tabela `cv_template` em produção com registros `Techfor` e `T-Systems`
- ✅ 10 colunas faltantes adicionadas à tabela `pessoas` em produção (bairro, cep, rg, data_nascimento, valor_hora_atual, pretensao_valor_hora, ja_trabalhou_pj, aceita_pj, possui_empresa, aceita_abrir_empresa)

**Pendência de banco (PRODUÇÃO):**
```sql
-- ⚠️ AINDA NÃO EXECUTADO em produção:
ALTER TABLE candidaturas ADD COLUMN motivo_sem_interesse TEXT;
```

### 4.3 LinkedIn Chrome Extension v5.47 ✅ PRODUÇÃO
**Arquivo:** `content.js` da extensão LinkedIn
**Estratégia:** text-parsing com H2-to-SECTION traversal (4 estratégias de fallback)
**Auto-refresh:** Supabase Realtime WebSocket + `visibilitychange` + evento `raisa-linkedin-import`

**Bug resolvido em v5.47:**
- ✅ `normalizarLinkedInUrl()` reescrita com regex para extrair username canônico — previne duplicatas por variações de URL (com/sem `www`, trailing slash, parâmetros)
- ✅ Normalização aplicada em `importar.ts` (backend) e na extensão (capture time)

**SQL necessário:** `ALTER TABLE pessoas REPLICA IDENTITY FULL;`

### 4.4 Entrevistas Técnicas ✅ PRODUÇÃO
**Fluxo:** Gemini gera perguntas personalizadas por vaga + CV → candidato responde → Gemini avalia + detecta uso de IA
**Campo novo:** `parecer_entrevista_tecnica` — exibido exclusivamente no template T-Systems (entre Hard Skills e Recomendação)

### 4.5 Relatórios de Atividade (Consultores) ✅ PRODUÇÃO
**Análise:** Gemini extrai behavioral flags, risco de saída (1–5), recomendações

### 4.6 Banco de Talentos v3.2 ✅ PRODUÇÃO
**Auto-refresh triplo:**
- Estratégia 1: Supabase Realtime WebSocket (INSERT/UPDATE/DELETE na tabela `pessoas`)
- Estratégia 2: `visibilitychange` — refresh ao voltar para a aba
- Estratégia 3: evento `raisa-linkedin-import` — extensão notifica explicitamente

**SQL necessário:** `ALTER TABLE pessoas REPLICA IDENTITY FULL;`

### 4.7 Perfil SDR ✅ PRODUÇÃO
**Status:** Deployado
**Acesso:** exclusivo ao módulo Prospect (Buscar Leads, Meus Prospects, Consumo Créditos, Preparar Campanha)
**Arquivos alterados:**
- `src/types/types_users.ts` — `'SDR'` adicionado ao union type `UserRole`
- `src/utils/permissions.ts` — SDR em `getPerfisPodeVer/Criar` + `podeUsarProspect()` + `podePrepararCampanha()`
- `src/components/layout/Sidebar.tsx` — SDR nos itens Prospect
- `src/components/ManageUsers.tsx` — SDR em `allUserRoles` + badge teal
- `src/App.tsx` — SDR redireciona para `prospect_search` ao logar (não vê Dashboard RMS)
**Banco de dados:** nenhuma query necessária — `tipo_usuario` é `VARCHAR(50)` sem CHECK constraint

### 4.8 Agenda de Acompanhamento v1.0 ✅ PRODUÇÃO
**Arquivo:** `src/components/AgendaAcompanhamento.tsx`
**Posição no menu:** entre "Recomendações" e "Consultores"
**Acesso:** Administrador, Gestão de R&S, Gestão de Pessoas
**Ícone:** `fa-regular fa-calendar-check`

**Funcionalidade:**
- Distribui consultores ativos (`status === 'Ativo'`) nos dias úteis do mês
- Consultores com score 4–5 (Alto/Crítico) ou novos (<45 dias) → **semanal** (1x por semana, 4 semanas)
- Demais consultores → **mensal** (distribuídos uniformemente nos dias úteis)
- Recalcula via `useMemo` ao mudar dados

**Botão +Atividade:**
- 🔵 Azul — pendente (padrão)
- 🟢 Verde — atividade registrada hoje (detectado via `created_at` do relatório)
- 🔴 Vermelho — atrasado (último relatório > 1 dia sem registro)
- Clicar abre modal `AtividadesInserir`

**Layout responsivo:**
- Desktop: tabs "📅 Calendário / 👥 Consultores"
- Mobile: 3 tabs (Hoje / Agenda / Consultores) com hamburger drawer em `App.tsx` + `isMobileDrawer` prop em `Sidebar.tsx`

**Arquivos alterados:**
- `src/components/AgendaAcompanhamento.tsx` — NOVO
- `src/components/layout/Sidebar.tsx` — item de menu adicionado
- `src/App.tsx` — import + case + hamburger drawer mobile
- `src/types/types_models.ts` — `'agenda_acompanhamento'` adicionado ao union type `View`

### 4.9 NovaCandidaturaModal v57.9+ ✅ PRODUÇÃO
**Arquivo:** `src/components/raisa/NovaCandidaturaModal.tsx`
**Hook:** `src/hooks/supabase/useRaisaCVSearch.ts`

**Melhorias implementadas:**
- **"Meus Candidatos":** busca via `ilike` no banco (debounce 400ms, ≥2 chars) — captura candidatos com `id_analista_rs=null` (importados via plugin LinkedIn)
- **"Buscar Todos":** retorna todos os candidatos (`scoreMinimo:0`, `incluirIncompativeis:true`) com badge laranja "Sem compatibilidade" para score=0% e tags verdes/vermelhas de skills

### 4.10 Candidaturas — Status "Sem Interesse" ✅ PREVIEW/PRODUÇÃO
**Arquivos:** `src/components/raisa/DetalhesCandidaturaModal.tsx` + `src/components/raisa/Candidaturas.tsx`
**Funcionalidade:** popup com 10 motivos de declínio, badge âmbar, 9º passo no progress bar
**⚠️ Pendência de banco (PRODUÇÃO):**
```sql
ALTER TABLE candidaturas ADD COLUMN motivo_sem_interesse TEXT;
```

### 4.11 Talent Finder (Boolean Search Builder) ✅ PRODUÇÃO
**Localização:** aba dentro de `src/components/linkedin/LinkedInImportPanel.tsx`
**Funcionalidade:** Gemini 2.0 Flash gera 3 queries boolean otimizadas (`site:linkedin.com/in/` + `intitle:`) para busca manual no Google Search

**Instrumentação de eventos (tabela `talent_finder_logs`):**
- `gerar` — query gerada
- `abrir` — link aberto no Google
- `copiar` — query copiada
- `captura` — leads capturados via extensão

**TalentFinderStatsTab:** dashboard de estatísticas como aba entre "Pesquisar" e "Como Usar"

**Decisão arquitetural:** Gemini Grounding abandonado para este módulo — retorna URLs de redirecionamento/agregadores, nunca URLs diretas do LinkedIn. Boolean Search + busca manual no Google é a arquitetura correta.

### 4.12 Inteligência de Mercado (Módulo Conceitual) 🔲 ESTUDO PENDENTE
**Status:** Proposta arquitetural definida, desenvolvimento não iniciado
**Objetivo:** automatizar mapeamento de clientes de consultorias TI concorrentes

**Arquitetura proposta (4 camadas):**
1. Seed data de consultorias conhecidas
2. Extração de nomes de clientes das páginas públicas via Gemini Search Grounding
3. Inferência de domínios + scoring de confiança
4. Matriz de cross-reference (Cliente × Consultoria e Consultoria × Cliente)

**Modos operacionais:** quick scan (1 consultoria) | batch/overnight | visualização da matriz
**Localização proposta:** nova aba "Inteligência" dentro do Prospect Finder
**Build sugerido:** Fase 1 (single scan + matrix) → Fase 2 (batch + priority scoring)

---

## 5. APIs e Integrações

| Serviço | Uso | Variável de Ambiente |
|---|---|---|
| Gemini 2.5 Flash | Prospect Engine (Search Grounding) | `API_KEY` |
| Gemini 2.0 Flash | CV, triagem, entrevistas, relatórios, Talent Finder | `API_KEY` |
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
| `cv_gerado` | CVs gerados por candidatura (UPDATE/INSERT condicional) |
| `cv_template` | Templates de CV ativos (`Techfor`, `T-Systems`) |
| `talent_finder_logs` | Logs de eventos do Talent Finder (gerar/abrir/copiar/captura) |

### Migrations executadas (produção)
```sql
-- 05/03/2026 — Prospect Engine
ALTER TABLE prospect_leads ADD COLUMN fonte_id_gemini TEXT;
ALTER TABLE prospect_leads DROP CONSTRAINT prospect_leads_motor_check;
ALTER TABLE prospect_leads ADD CONSTRAINT prospect_leads_motor_check
  CHECK (motor IN ('apollo', 'snovio', 'ambos', 'gemini', 'hunter', 'gemini+hunter', 'extension'));

-- 16/03/2026 — FK buscado_por corrigida
-- prospect_leads.buscado_por referencia app_users(id) ON DELETE SET NULL

-- 17/03/2026 — 10 colunas adicionadas à tabela pessoas
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS valor_hora_atual NUMERIC;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS pretensao_valor_hora NUMERIC;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS ja_trabalhou_pj BOOLEAN;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS aceita_pj BOOLEAN;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS possui_empresa BOOLEAN;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS aceita_abrir_empresa BOOLEAN;

-- 17/03/2026 — Inseridos registros em cv_template
INSERT INTO cv_template (nome, ...) VALUES ('Techfor', ...), ('T-Systems', ...);

-- PENDENTES em produção:
-- ALTER TABLE candidaturas ADD COLUMN motivo_sem_interesse TEXT;
```

### Regras importantes
- **RLS:** pode bloquear silenciosamente o frontend sem policies → sempre verificar quando houver 403
- **`.single()`:** lança erro se não encontrar registro → usar `.maybeSingle()`
- **Session Pooler:** usar connection string do Session Pooler quando direct connection falhar DNS
- **REPLICA IDENTITY:** executar `ALTER TABLE pessoas REPLICA IDENTITY FULL` para Realtime funcionar
- **Supabase ref ID produção:** 21 caracteres — CLI rejeita; usar Supabase Dashboard ou ticket de suporte para operações diretas

---

## 7. Padrões de Desenvolvimento

### Regras do projeto (acordadas com Messias)
1. Entregar sempre arquivos completos prontos para download
2. Citar o caminho hierárquico completo do arquivo
3. Não agrupar em ZIP
4. Conferir lista de arquivos antes de entregar
5. Comandos Git sempre em bloco único copiável, ambiente PREVIEW (PowerShell Windows)
6. Modificações cirúrgicas — não afetar código existente
7. Nunca modificar layouts/designs sem aprovação prévia
8. Sempre chamar backend (`/api/gemini-analyze`) em vez de API diretamente no frontend
9. Soluções definitivas — não contornos temporários
10. Investigar nomes de colunas/tabelas antes de criar queries
11. Versionar arquivos com badges visíveis durante testes (ex: `🔧 v1.1-trace`) para confirmar deploy correto

### Git Workflow
```powershell
# Desenvolvimento → Preview
git add [arquivos]
git commit -m "tipo(escopo): descrição"
git push origin preview
```

```powershell
# Preview → Produção (sequência DEFINITIVA — evita conflito com update-context.js)
# ⚠️ NÃO usar git merge — o script auto-commita CONTEXT.md e gera conflito sempre
# Usar cherry-pick apenas dos commits de CÓDIGO (pular commits "chore(context):")

# Passo 1: sincronizar main com remote
git checkout main
git fetch origin main
git reset --hard origin/main

# Passo 2: ver quais commits da preview ainda não estão na main
git log origin/main..preview --oneline
# → anote os hashes dos commits de CÓDIGO (ignorar os "chore(context): atualização automática")

# Passo 3: aplicar cada hash na ordem (do mais antigo para o mais novo)
# Exemplo com 3 commits (substituir pelos hashes reais):
#   git cherry-pick abc1234
#   git cherry-pick def5678
#   git cherry-pick ghi9012
# Se conflito aparecer em qualquer arquivo:
#   git checkout --theirs nome-do-arquivo
#   git add nome-do-arquivo
#   git cherry-pick --continue

# Passo 4: push e retorno
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
npx vercel switch   # selecionar Techfor (techfor) — usar sem parâmetros
```

---

## 8. Problemas Conhecidos / Lições Aprendidas

| Problema | Solução |
|---|---|
| Apollo Free Tier não filtra domain+location para BR | Não revisitar Apollo |
| Gemini thinkingBudget muito baixo (<1024) faz modelo desistir | Manter em 4096 |
| Gemini Grounding não retorna URLs diretas do LinkedIn | Usar Boolean Search Builder (Talent Finder) — busca manual no Google |
| LinkedIn DOM muda frequentemente | Usar text-parsing/H2 traversal, nunca CSS selectors |
| Supabase `.single()` estoura em query vazia | Usar `.maybeSingle()` |
| RLS sem policies bloqueia silenciosamente | Verificar RLS em erros 403 |
| Vercel dashboard para env vars é instável | Usar Vercel CLI |
| `echo \|` no PowerShell adiciona `\r\n` às env vars | Usar prompt interativo do CLI |
| `git push origin main` rejeitado — conflito recorrente no `CONTEXT.md` | Usar `cherry-pick` por hash (não `merge`) — ver seção Git Workflow |
| Timeout 504 no Hunter com muitos prospects | Processamento paralelo em lotes de 4 via Promise.all |
| Snov.io `taskHash` não encontrado | `task_hash` está em `startData.data.task_hash` |
| `node_modules` no Git quebra Knowledge Base | `.gitignore` + `.claudeignore` corretos |
| Vercel CLI `switch` erro "Personal Account" | Usar `npx vercel switch` sem parâmetros |
| Supabase produção ref ID 21 chars — CLI rejeita | Usar Dashboard; abrir ticket de suporte |
| Dois arquivos com mesmo nome em pastas diferentes | Verificar imports; Vite compila o importado, não o editado |
| `cv_gerado` com registro stale bloqueia re-extração | Deletar registro para forçar nova extração pelo Gemini |
| LinkedIn duplicatas por variação de URL | `normalizarLinkedInUrl()` com regex extrai username canônico |
| `user_id` null na Prospect Extension | `buscarUserIdDoRMS()` busca ID antes da chamada API |
| Extensão Chrome não capturava de `www.techfortirms.online` | Adicionar URL com `www.` em `host_permissions` e `content_scripts` |
| Site cai com `DNS_PROBE_FINISHED_NXDOMAIN` — Vercel mostra deploy Ready | Hostinger resetou nameservers para `ns1.dns-parking.com` — corrigir para `ns1.vercel-dns.com` / `ns2.vercel-dns.com` |
| Extensão Chrome: inversão empresa_nome × cargo nos leads capturados | Parser `content.js` v1.04: segmento `i===1` sem `\|` é cargo (não empresa); bio >60 chars descartada |
| Schema de tabela diferente entre Preview e Produção causa erro silencioso | Sempre verificar schema dos dois bancos antes de mexer no código — migrar o banco, não o código |
| `prospect_exclusoes` Produção com colunas `nome/tipo/criado_em` vs Preview `empresa_nome/motivo/created_at` | Resolvido renomeando colunas em Produção via `ALTER TABLE ... RENAME COLUMN` |

---

## 9. Infraestrutura de Domínio

| Item | Detalhe |
|---|---|
| Registrador | Hostinger |
| Domínio principal | `techfortirms.online` (expira 2026-11-23, renovação automática ativa) |
| Domínio secundário | `techforti.online` (expira 2026-07-02, renovação automática ativa) |
| Nameservers corretos | `ns1.vercel-dns.com` / `ns2.vercel-dns.com` |
| URL produção | `techfortirms.online` e `www.techfortirms.online` |

**⚠️ Problema recorrente — DNS resetado pela Hostinger**
- **Sintoma:** `DNS_PROBE_FINISHED_NXDOMAIN` — site inacessível, mas Vercel mostra deployment `Ready`
- **Causa:** Hostinger reseta nameservers para `ns1.dns-parking.com` / `ns2.dns-parking.com` após operações no painel
- **Correção:** Hostinger → Domínios → Gerenciar `techfortirms.online` → Nameservers → Alterar → inserir `ns1.vercel-dns.com` e `ns2.vercel-dns.com` → Salvar
- **Propagação:** 15 min a 2h — acompanhar em https://dnschecker.org/#NS/techfortirms.online

---

## 10. Backlog / Pendências

> **CHECKPOINT 25/03/2026 — CONCLUÍDO**
> - ✅ Extensão Chrome v1.04 — fix inversão empresa_nome × cargo
> - ✅ View Território — agrupamento por empresa, reserva, redistribuição, liberação
> - ✅ prospect-leads.ts v1.2 — PATCH aceita null para liberar + endpoint ?usuarios=true
> - ✅ prospect-gemini-search.ts v2.2 — fix resposta 0 chars gemini-2.5-flash + aviso amigável empresa não encontrada com queries manuais
> - ✅ DNS produção restaurado — nameservers Hostinger corrigidos
> - ✅ prospect_exclusoes produção — colunas renomeadas para igualar Preview
> - ✅ CONTEXT.md — seção Infraestrutura de Domínio + Protocolo de Sessões + Git Workflow definitivo

| Item | Prioridade | Detalhes |
|---|---|---|
| `motivo_sem_interesse` — migration produção | 🔴 Alta | `ALTER TABLE candidaturas ADD COLUMN motivo_sem_interesse TEXT;` |
| Remover `LinkedInImportPanel.tsx` legado | 🟡 Média | `src/components/raisa/LinkedInImportPanel.tsx` |
| `podeUsarLinkedIn` para Gestão Comercial | 🟡 Média | Decisão: NEGADO — Gestão Comercial não acessa Banco de Talentos |
| Testar Snov.io fallback com Hunter zerado | 🟡 Média | Validação em ambiente real |
| Inteligência de Mercado | 🟢 Baixa | Arquitetura definida, build não iniciado |
| Talent Finder pós-busca | 🟢 Baixa | Definir ações após captura de leads |

---

## 11. Especialidades Ativas (Claude)

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

## 12. Protocolo de Sessões Claude

### Regra geral: 1 chat = 1 módulo ou 1 problema
O contexto da conversa acumula tokens a cada mensagem (histórico + arquivos + CONTEXT.md).
Arquivos grandes como `ProspectSearchPage.tsx` (~1.900 linhas) consomem muito contexto rapidamente.

### Como abrir cada chat
1. Sempre anexar o `CONTEXT.md` atualizado
2. Anexar **apenas** os arquivos do módulo que será trabalhado
3. Nunca subir mais de 2 arquivos `.tsx` grandes por sessão
4. Nunca subir arquivos que não sejam diretamente relevantes para a tarefa

### Mapa de sessões por módulo

| Módulo | Arquivos para subir |
|---|---|
| Prospect Engine (busca) | `ProspectSearchPage.tsx` + `prospect-gemini-search.ts` |
| Leads Salvos / Território | `ProspectSearchPage.tsx` + `prospect-leads.ts` |
| Preparar Campanha | `CampanhaPrep.tsx` + endpoints relevantes |
| CV / Entrevista | `EntrevistaComportamental.tsx` ou `cv-generator-docx.ts` |
| LinkedIn / Banco Talentos | `BancoTalentos_v3.tsx` + `LinkedInImportPanel.tsx` |
| Banco de Dados (SQL/migrations) | Só o `CONTEXT.md` — sem código |
| Bugs pontuais | `CONTEXT.md` + **só o arquivo com o bug** |

### Ritual de fim de sessão
Ao final de cada sessão importante, registrar no CONTEXT.md:
- ✅ O que foi feito (CHECKPOINT)
- 🔄 O que ficou pendente
- ▶️ Por onde começar na próxima sessão

### Dicas para sessões longas de código
- Subir o arquivo grande **no início** e fazer todas as alterações dele em sequência
- Claude **sempre entrega o arquivo completo** — nunca trechos ou patches parciais (evita erros de integração)
- Abrir chat novo ao mudar de módulo, mesmo que a sessão não tenha travado

### Resumo
> **"CONTEXT.md + 1 ou 2 arquivos do módulo + 1 tema por chat"**
> = máximo aproveitamento, mínimo desperdício de contexto.
---

## 10. Métricas do Repositório
> Gerado automaticamente pelo script update-context.js

| Módulo | Arquivos | Tamanho | Última modificação |
|---|---|---|---|
| `api/` | 79 arquivos | 1.37 MB | 20/07/2026 |
| `src/components/` | 177 arquivos | 1.10 MB | 20/07/2026 |
| `src/pages/` | 0 arquivos | 0 KB | N/A |
| `src/contexts/` | 2 arquivos | 2.3 KB | 20/07/2026 |
| `src/types/` | 6 arquivos | 31.3 KB | 20/07/2026 |
| `database/` | 0 arquivos | 109.5 KB | 20/07/2026 |
| `scripts/` | 1 arquivos | 15.3 KB | 20/07/2026 |

### Endpoints API ativos
- `api/analise-adequacao-perfil.ts`
- `api/analyze-activity-report.ts`
- `api/apollo-prospect-test.ts`
- `api/campaign-email-recovery.ts`
- `api/claude-analyze.ts`
- `api/creci-capture.ts`
- `api/crm-analytics.ts`
- `api/crm-campanhas.ts`
- `api/crm-config.ts`
- `api/crm-copys.ts`
- `api/crm-cotas.ts`
- `api/crm-leads.ts`
- `api/crm-webhook.ts`
- `api/cv-generator-docx-bg.ts`
- `api/cv-generator-docx.ts`
- `api/debug-env.ts`
- `api/entrevista-docx.ts`
- `api/extract-cv-text.ts`
- `api/gemini-analyze.ts`
- `api/gemini-audio-transcription.ts`
- `api/gemini-confirma-test.ts`
- `api/gemini-cv-generator-v2.ts`
- `api/gemini-cv.ts`
- `api/hunter-debug-test.ts`
- `api/predicao-riscos.ts`
- `api/prospect-apollo-search.ts`
- `api/prospect-capture.ts`
- `api/prospect-cv-extract.ts`
- `api/prospect-cv-reconcile.ts`
- `api/prospect-dominios-turnover.ts`
- `api/prospect-email-finder.ts`
- `api/prospect-empresa-normalize.ts`
- `api/prospect-enrich-company.ts`
- `api/prospect-exclusoes.ts`
- `api/prospect-gemini-search.ts`
- `api/prospect-hunter-enrich.ts`
- `api/prospect-infer-emails.ts`
- `api/prospect-leads.ts`
- `api/prospect-resolve-domain.ts`
- `api/prospect-revalidate.ts`
- `api/prospect-save.ts`
- `api/prospect-snovio-search.ts`
- `api/prospect-stats.ts`
- `api/prospect-validate-emails.ts`
- `api/questoes-inteligentes.ts`
- `api/recomendacao-analista.ts`
- `api/revalidacao-leads-importados.ts`
- `api/send-email.ts`
- `api/talent-finder-log.ts`
- `api/talent-finder-search.ts`
- `api/talent-finder-stats.ts`
- `api/unsubscribe.ts`
- `api/update-report-meta.ts`
- `api/upload-audio.ts`
- `api/vaga-analistas-recomendados.ts`
- `api/vaga-prioridade.ts`
- `api/version.ts`

---
