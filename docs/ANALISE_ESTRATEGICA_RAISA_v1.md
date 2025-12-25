# 🎯 ANÁLISE ESTRATÉGICA COMPLETA - MÓDULO RAISA
## RMS_RAISA - Sistema de Recrutamento com Inteligência Artificial

**Data:** 25/12/2024  
**Versão:** 1.0  
**Autor:** Claude (DEV + Processos + IA + Negócios + RH)

---

## 📋 SUMÁRIO EXECUTIVO

Este documento apresenta uma análise completa do módulo RAISA, comparando o **fluxo operacional desejado** com a **implementação atual**, identificando gaps e propondo um roadmap de desenvolvimento.

---

## 🔄 FLUXO OPERACIONAL DESEJADO (Macro)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO RAISA - VISÃO MACRO                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘

1️⃣ CRIAÇÃO DA VAGA
   │
   ▼
2️⃣ IA ANALISA E SUGERE MELHORIAS NO ANÚNCIO
   │
   ▼
3️⃣ APROVAÇÃO (Gestor Comercial + Gestor R&S)
   │
   ▼
4️⃣ BUSCA AUTOMÁTICA DE CVs (máx. 20 candidatos - configurável)
   │
   ▼
5️⃣ SELEÇÃO DE 2 ANALISTAS R&S (distribuição alternada de candidatos)
   │
   ▼
6️⃣ GERAÇÃO DE 5-10 QUESTÕES TÉCNICAS PELA IA
   │
   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        ETAPA 1 - APROVAÇÃO INTERNA                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
7️⃣ ENTREVISTA INTERNA (Upload de Áudio)
   │
   ▼
8️⃣ IA VALIDA CV vs RESPOSTAS → % Aderência (0-100%)
   │
   ▼
9️⃣ PARECER TÉCNICO IA (Gaps + Recomendações)
   │
   ▼
🔟 DECISÃO: Enviar ou não ao Cliente
   │
   ▼
1️⃣1️⃣ GERAÇÃO DE CV PADRÃO TECHFOR
   │
   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        ETAPA 2 - APROVAÇÃO EXTERNA (CLIENTE)                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
1️⃣2️⃣ ENVIO DO CV AO CLIENTE
   │
   ▼
1️⃣3️⃣ ENTREVISTA TÉCNICA CLIENTE (Upload de Áudio)
   │
   ▼
1️⃣4️⃣ IA ANALISA DESEMPENHO NA ENTREVISTA CLIENTE
   │
   ▼
1️⃣5️⃣ RESULTADO FINAL:
       ├── APROVADO → IA registra para aprendizado
       └── REPROVADO → IA registra + revisa questões
```

---

## 📊 MATRIZ DE ADERÊNCIA - COMPONENTES EXISTENTES

### Legenda:
- ✅ **Implementado** - Funcionalidade completa
- 🟡 **Parcial** - Existe mas precisa melhorias
- ❌ **Não Existe** - Precisa ser criado
- 🔧 **Mock** - Usa dados fictícios

| # | Etapa do Fluxo | Status | Componente | Observações |
|---|---------------|--------|------------|-------------|
| 1 | Criação de Vaga | ✅ | `Vagas.tsx` | Funcional com cliente/gestor |
| 2 | IA sugere melhorias no anúncio | ❌ | - | **CRIAR** |
| 3 | Aprovação dupla (Comercial + R&S) | ❌ | - | **CRIAR workflow de aprovação** |
| 4 | Busca automática de CVs | ❌ | `BancoTalentos.tsx` | Banco básico, falta busca IA |
| 5 | Seleção de 2 Analistas | 🟡 | `VagaPriorizacaoManager.tsx` | Existe, mas atribui 1 analista |
| 6 | Geração de Questões IA | ✅ | `perguntasTecnicasService.ts` | Funcional |
| 7 | Entrevista Interna (Áudio) | 🔧 | `EntrevistaTecnica.tsx` | Usa Mock, sem upload áudio |
| 8 | Validação CV vs Respostas | ❌ | - | **CRIAR** |
| 9 | Parecer Técnico IA | 🟡 | `geminiService.ts` | Funções existem, não integradas |
| 10 | Decisão enviar ao cliente | 🟡 | `Candidaturas.tsx` | Status existe, falta workflow |
| 11 | Geração CV Padrão | ❌ | - | **CRIAR** |
| 12 | Envio ao Cliente | 🔧 | `ControleEnvios.tsx` | Usa Mock |
| 13 | Entrevista Cliente (Áudio) | ❌ | - | **CRIAR** |
| 14 | IA analisa entrevista cliente | 🟡 | `geminiService.ts` | Função existe (`summarizeInterview`) |
| 15 | Registro Aprovação/Reprovação | 🟡 | `Candidaturas.tsx` | Status existe, falta learning |

---

## 🔍 ANÁLISE DETALHADA POR COMPONENTE

### 1. `Vagas.tsx` - ✅ Funcional
**Status:** Operacional

**Funcionalidades:**
- Criar/Editar/Excluir vagas
- Vinculação com Cliente
- Vinculação com Gestor do Cliente
- Stack tecnológica
- Modal de Priorização (integrado)

**Gaps Identificados:**
- Não tem campo para workflow de aprovação
- Não tem status intermediário (rascunho → aprovação → publicada)
- Falta campos: `aprovado_por_comercial`, `aprovado_por_rs`, `data_aprovacao`

---

### 2. `BancoTalentos.tsx` - ⚠️ Muito Básico
**Status:** Funcional mas insuficiente

**Funcionalidades Atuais:**
- Nome, Email, Telefone, LinkedIn

**Gaps Críticos:**
- ❌ Falta CPF
- ❌ Falta upload/armazenamento de CV
- ❌ Falta skills/competências
- ❌ Falta experiências/histórico
- ❌ Falta integração com IA para busca semântica
- ❌ Falta indexação para matching com vagas

---

### 3. `EntrevistaTecnica.tsx` - 🔧 Usa Mock
**Status:** Interface pronta, backend mock

**Funcionalidades:**
- Seleção de candidatura
- Exibição de questões geradas
- Registro de respostas
- Matriz de qualificações
- Avaliação com IA

**Gaps:**
- ❌ Usa `useMockData()` - não persiste no Supabase
- ❌ Não tem upload de áudio
- ❌ Não tem transcrição de áudio
- ❌ Não distingue entrevista interna vs cliente

---

### 4. `ControleEnvios.tsx` - 🔧 Usa Mock
**Status:** Interface pronta, backend mock

**Funcionalidades:**
- Dashboard de métricas
- Tabela de envios
- Filtros por status/data

**Gaps:**
- ❌ Usa `useMockData()` - não persiste
- ❌ Falta integração real com Supabase
- ❌ Falta workflow de aprovação cliente

---

### 5. `VagaPriorizacaoManager.tsx` - 🟡 Parcial
**Status:** Funcional para 1 analista

**Funcionalidades:**
- Cálculo de prioridade por IA
- Recomendação de analistas
- Atribuição de analista

**Gaps:**
- ❌ Atribui apenas 1 analista (fluxo pede 2)
- ❌ Falta distribuição alternada de candidatos
- ❌ Falta controle para não enviar mesmo candidato para 2 analistas

---

### 6. Serviços de IA (`geminiService.ts`) - 🟡 Parcial
**Status:** Funções existem, integração incompleta

**Funções Existentes:**
```typescript
✅ analyzeReport()
✅ extractBehavioralFlags()
✅ generatePredictiveAlert()
✅ summarizeInterview()
✅ identifyRedFlags()
✅ analyzeRejectionPatterns()
✅ predictCandidateRisk()
```

**Funções Necessárias (Criar):**
```typescript
❌ analyzeJobDescription() // Sugerir melhorias no anúncio
❌ matchCVsToJob()         // Buscar CVs aderentes
❌ generateTechforCV()     // Gerar CV padrão
❌ transcribeAudio()       // Transcrição de áudio
❌ validateCVvsAnswers()   // Validar CV vs respostas
```

---

## 🗄️ ANÁLISE DO BANCO DE DADOS

### Tabelas Existentes (Relevantes para RAISA):
```sql
✅ vagas
✅ pessoas (candidatos)
✅ candidaturas
✅ candidatura_envios
✅ candidatura_aprovacoes
✅ perguntas_tecnicas
✅ respostas_candidato
✅ matriz_qualificacao
✅ avaliacoes_ia
✅ questoes_inteligentes
✅ recomendacoes_analista_ia
✅ predicao_risco_candidato
✅ analise_reprovacao_mensal
```

### Tabelas Necessárias (Criar):
```sql
❌ vaga_workflow_aprovacao     -- Aprovação dupla de vagas
❌ vaga_sugestoes_ia           -- Sugestões de melhoria no anúncio
❌ candidato_cv_arquivo        -- Storage de CVs
❌ candidato_skills            -- Competências para matching
❌ entrevista_audio            -- Armazenamento de áudios
❌ entrevista_transcricao      -- Transcrições
❌ cv_gerado_techfor           -- CVs padronizados gerados
❌ configuracoes_raisa         -- Parâmetros ajustáveis
```

---

## 📈 KPIs E MÉTRICAS SOLICITADOS

### Métricas de Produtividade:
| Métrica | Status | Implementação |
|---------|--------|---------------|
| Candidatos enviados por vaga | 🟡 | Tabela existe, view necessária |
| Tempo criação → fechamento | ❌ | Criar campo e cálculo |
| Vagas em atendimento por analista | 🟡 | Dados existem |
| Vagas críticas em atendimento | ✅ | Priorização existe |
| Vagas "esquecidas" (sem remessa) | ❌ | Criar alerta |
| Índice acertividade analista | 🟡 | `recomendacoes_analista_ia` |

### Métricas de Qualidade:
| Métrica | Status | Implementação |
|---------|--------|---------------|
| Taxa aprovação por cliente | 🟡 | Dados existem |
| Taxa aprovação por analista | 🟡 | Dados existem |
| Taxa aprovação por perfil vaga | ❌ | Criar agregação |
| Qualidade pré-checagem | ❌ | Criar métrica |

---

## 🚀 ROADMAP DE IMPLEMENTAÇÃO

### FASE 1 - Fundação (Sprint 1-2)
**Objetivo:** Estabelecer base sólida

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 1.1 | Migrar `EntrevistaTecnica` de Mock para Supabase | 🔴 Alta | 3 dias |
| 1.2 | Migrar `ControleEnvios` de Mock para Supabase | 🔴 Alta | 2 dias |
| 1.3 | Expandir `Pessoa` com CPF, skills, CV URL | 🔴 Alta | 2 dias |
| 1.4 | Criar tabela `configuracoes_raisa` | 🟡 Média | 1 dia |
| 1.5 | Criar parâmetro "max_candidatos_busca" | 🟡 Média | 0.5 dia |

### FASE 2 - Workflow de Vagas (Sprint 3-4)
**Objetivo:** Implementar aprovação e sugestões IA

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 2.1 | Criar tabela `vaga_workflow_aprovacao` | 🔴 Alta | 1 dia |
| 2.2 | Criar função `analyzeJobDescription()` | 🔴 Alta | 2 dias |
| 2.3 | Criar componente `VagaAprovacaoWorkflow.tsx` | 🔴 Alta | 3 dias |
| 2.4 | Modificar `Vagas.tsx` para novo workflow | 🟡 Média | 2 dias |
| 2.5 | Notificações para aprovadores | 🟡 Média | 1 dia |

### FASE 3 - Busca Inteligente de CVs (Sprint 5-6)
**Objetivo:** Matching automático CV-Vaga

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 3.1 | Expandir `BancoTalentos` com skills estruturadas | 🔴 Alta | 3 dias |
| 3.2 | Criar função `matchCVsToJob()` com embeddings | 🔴 Alta | 4 dias |
| 3.3 | Criar componente `CVMatchingPanel.tsx` | 🔴 Alta | 3 dias |
| 3.4 | Implementar upload e parsing de CV | 🟡 Média | 3 dias |

### FASE 4 - Distribuição para Analistas (Sprint 7)
**Objetivo:** Distribuição inteligente com alternância

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 4.1 | Modificar `VagaPriorizacaoManager` para 2 analistas | 🔴 Alta | 2 dias |
| 4.2 | Criar lógica de distribuição alternada | 🔴 Alta | 2 dias |
| 4.3 | Criar tabela `analista_candidato_atribuicao` | 🟡 Média | 1 dia |
| 4.4 | Dashboard de distribuição | 🟡 Média | 2 dias |

### FASE 5 - Entrevistas com Áudio (Sprint 8-10)
**Objetivo:** Upload e transcrição de áudio

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 5.1 | Configurar Supabase Storage para áudios | 🔴 Alta | 1 dia |
| 5.2 | Criar componente `AudioUploader.tsx` | 🔴 Alta | 2 dias |
| 5.3 | Integrar Whisper API ou similar para transcrição | 🔴 Alta | 3 dias |
| 5.4 | Criar `EntrevistaInterna.tsx` (separado de Cliente) | 🔴 Alta | 3 dias |
| 5.5 | Criar `EntrevistaCliente.tsx` | 🔴 Alta | 2 dias |
| 5.6 | Validação CV vs Respostas pela IA | 🔴 Alta | 3 dias |

### FASE 6 - CV Padrão e Envio (Sprint 11-12)
**Objetivo:** Geração de CV e controle de envio

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 6.1 | Criar função `generateTechforCV()` | 🔴 Alta | 4 dias |
| 6.2 | Template de CV Techfor (DOCX/PDF) | 🟡 Média | 2 dias |
| 6.3 | Integrar `ControleEnvios` com Supabase | 🔴 Alta | 2 dias |
| 6.4 | Workflow de envio ao cliente | 🟡 Média | 2 dias |

### FASE 7 - Aprendizado e Dashboards (Sprint 13-14)
**Objetivo:** Learning loop e métricas

| # | Item | Prioridade | Esforço |
|---|------|------------|---------|
| 7.1 | Implementar feedback de aprovação/reprovação | 🔴 Alta | 2 dias |
| 7.2 | Criar revisão automática de questões | 🟡 Média | 3 dias |
| 7.3 | Dashboard de produtividade analistas | 🟡 Média | 3 dias |
| 7.4 | Dashboard de qualidade por cliente | 🟡 Média | 2 dias |
| 7.5 | Alertas de vagas "esquecidas" | 🟡 Média | 1 dia |

---

## 🗂️ QUERY PARA ESTRUTURA SUPABASE

Execute esta query no Supabase SQL Editor para obter 100% da estrutura:

```sql
-- ============================================
-- QUERY: ESTRUTURA COMPLETA DO BANCO
-- ============================================

-- 1. LISTAR TODAS AS TABELAS
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. LISTAR TODAS AS COLUNAS DE CADA TABELA
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    c.character_maximum_length
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- 3. LISTAR TODOS OS ENUMS
SELECT 
    t.typname AS enum_name,
    e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- 4. LISTAR TODAS AS FOREIGN KEYS
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- 5. LISTAR TODAS AS VIEWS
SELECT 
    table_name AS view_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public';

-- 6. LISTAR TODOS OS ÍNDICES
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 7. CONTAR REGISTROS POR TABELA
SELECT 
    schemaname,
    relname as table_name,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
```

---

## ✅ PRÓXIMOS PASSOS IMEDIATOS

1. **Executar a query acima** no Supabase e me enviar o resultado
2. **Priorizar** quais fases começar primeiro
3. **Validar** se o roadmap atende às expectativas
4. **Aprovar** ou ajustar o escopo de cada fase

---

## 📎 ANEXOS

### Componentes Analisados:
- `src/components/raisa/Vagas.tsx`
- `src/components/raisa/Candidaturas.tsx`
- `src/components/raisa/EntrevistaTecnica.tsx`
- `src/components/raisa/BancoTalentos.tsx`
- `src/components/raisa/ControleEnvios.tsx`
- `src/components/raisa/VagaPriorizacaoManager.tsx`
- `src/services/geminiService.ts`
- `src/services/perguntasTecnicasService.ts`
- `database/SCRIPT_UNICO_COMPLETO_SUPABASE.sql`

---

**Documento gerado por Claude com as especialidades:**
- 🔧 Claude DEV (Análise técnica)
- 📊 Claude Processos (Mapeamento de workflow)
- 🤖 Claude IA (Avaliação de funcionalidades ML)
- 💼 Claude Negócios (KPIs e métricas)
- 👥 Claude RH (Contexto de R&S)

