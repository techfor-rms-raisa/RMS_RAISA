# 🚀 INSTRUÇÕES DE DEPLOY - FASE 4 COMPLETA
## Distribuição Inteligente com IA + Dashboard de Performance

---

## 📦 LISTA COMPLETA DE ARQUIVOS (10 arquivos)

### 🗄️ SQL (Execute no Supabase na ordem)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 1 | `distribuicao_vagas_v4.sql` | Tabelas de distribuição e round-robin |
| 2 | `distribuicao_ia_scoring.sql` | Scoring IA e logs de decisão |
| 3 | `performance_ia_views.sql` | Views para dashboard de métricas |

### 📁 Hooks (src/hooks/supabase/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 4 | `useDistribuicaoVagas.ts` | Hook de distribuição básica |
| 5 | `useDistribuicaoIA.ts` | Hook de IA com ranking |

### 📁 Componentes (src/components/raisa/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 6 | `DistribuicaoVagasPanel.tsx` | Painel simples de distribuição |
| 7 | `DistribuicaoIAPanel.tsx` | Painel com sugestão IA |
| 8 | `DashboardIAvsManual.tsx` | Dashboard comparativo resumido |
| 9 | `DashboardPerformanceIA.tsx` | Dashboard com gráficos de linha |
| 10 | `Pipeline.tsx` | ⚠️ SUBSTITUI o atual |

---

## 🔧 PASSO A PASSO

### ETAPA 1: SQL no Supabase

```sql
-- Execute na ordem:
-- 1. distribuicao_vagas_v4.sql
-- 2. distribuicao_ia_scoring.sql  
-- 3. performance_ia_views.sql
```

### ETAPA 2: Criar pasta hooks/supabase

```powershell
# No VS Code, criar pasta se não existir:
mkdir src/hooks/supabase
```

### ETAPA 3: Copiar arquivos

```
src/
├── hooks/
│   └── supabase/
│       ├── useDistribuicaoVagas.ts   ← NOVO
│       └── useDistribuicaoIA.ts      ← NOVO
│
└── components/
    └── raisa/
        ├── DistribuicaoVagasPanel.tsx   ← NOVO
        ├── DistribuicaoIAPanel.tsx      ← NOVO
        ├── DashboardIAvsManual.tsx      ← NOVO
        ├── DashboardPerformanceIA.tsx   ← NOVO
        └── Pipeline.tsx                 ← SUBSTITUIR
```

### ETAPA 4: Git

```powershell
git checkout main
git pull origin main
git checkout -b feature/distribuicao-ia-completa

git add src/hooks/supabase/useDistribuicaoVagas.ts
git add src/hooks/supabase/useDistribuicaoIA.ts
git add src/components/raisa/DistribuicaoVagasPanel.tsx
git add src/components/raisa/DistribuicaoIAPanel.tsx
git add src/components/raisa/DashboardIAvsManual.tsx
git add src/components/raisa/DashboardPerformanceIA.tsx
git add src/components/raisa/Pipeline.tsx

git commit -m "feat(raisa): Sistema completo de distribuição inteligente com IA

FASE 4 - Distribuição Inteligente:
- Scoring multi-critério (especialização, cliente, carga, taxa, velocidade)
- Sugestão IA com ranking visual dos 4 analistas
- Override manual com justificativa obrigatória
- Log completo para aprendizado do sistema
- Dashboard comparativo IA vs Manual
- Gráfico de linha temporal com evolução
- View por analista e geral
- Métricas de acurácia da IA"

git push -u origin feature/distribuicao-ia-completa
git checkout main
git merge feature/distribuicao-ia-completa
git push origin main
```

---

## 🎯 FUNCIONALIDADES ENTREGUES

### 1. Sistema de Scoring (5 critérios = 100 pts)
- Especialização técnica: 30 pts
- Conhecimento do cliente: 25 pts
- Carga atual: 20 pts
- Taxa de aprovação: 15 pts
- Velocidade fechamento: 10 pts

### 2. Fluxo de Distribuição
- IA gera ranking dos 4 analistas
- Gestora vê scores detalhados
- Aceita IA ou escolhe manual com justificativa
- Sistema grava log para aprendizado

### 3. Dashboard de Performance
- Gráfico de linha: IA vs Manual (12 meses)
- Toggle: Visão Geral / Por Analista
- Cards com métricas resumidas
- Tabela detalhada por analista
- Indicador de quem performa melhor

### 4. Logs e Rastreabilidade
- distribuicao_decisao_log: todas as decisões
- redistribuicao_log: todas as mudanças
- vw_performance_*: views para análise

---

## 📊 VIEWS CRIADAS NO SQL

| View | Descrição |
|------|-----------|
| vw_evolucao_performance_mensal | Gráfico de linha geral |
| vw_evolucao_por_analista | Gráfico de linha por analista |
| vw_resumo_performance_analista | Tabela resumo |
| vw_performance_ia_vs_manual | Comparativo IA vs Manual |
| vw_acuracia_ia | Taxa de aceitação da IA |
| vw_comparacao_ia_vs_real | Detalhes de cada decisão |

---

## 🧪 TESTES

### Teste 1: Configurar Distribuição
1. Abrir Pipeline de Vagas
2. Clicar em "Configurar Distribuição" em uma vaga
3. Ver ranking IA dos analistas
4. Aceitar sugestão ou escolher manual
5. Verificar log no banco

### Teste 2: Dashboard Performance
1. Acessar DashboardPerformanceIA
2. Ver gráfico de linha com evolução
3. Alternar entre Geral e Por Analista
4. Verificar tabela de resumo

### Teste 3: Verificar Logs
```sql
-- Ver decisões
SELECT * FROM distribuicao_decisao_log ORDER BY decidido_em DESC;

-- Ver métricas
SELECT * FROM vw_performance_ia_vs_manual;

-- Ver evolução
SELECT * FROM vw_evolucao_performance_mensal;
```

---

## ⚠️ OBSERVAÇÕES

1. O **Pipeline.tsx** SUBSTITUI o arquivo atual
2. Execute os SQLs NA ORDEM indicada
3. As métricas só aparecem após registrar decisões
4. O sistema "aprende" com cada override registrado

---

**Claude DEV + IA + Design**  
**Data:** 26/12/2024  
**Fase:** 4 - Distribuição Inteligente (Completa)
