# 📋 ATIVIDADES PENDENTES - RMS-RAISA
## Registrado em: 28/12/2024 | Atualizado: 28/12/2024

---

## 📊 DESCOBERTA IMPORTANTE
**O banco já tem 42 views e 69 tabelas!** O problema era apenas nomenclatura:
- Código espera: `vw_raisa_*`
- Banco tem: `vw_*` (sem prefixo "raisa")

---

## 🔴 PRIORIDADE ALTA (Crítico)

### 1. Criar AuthContext
**Arquivo a criar:** `src/contexts/AuthContext.tsx`
**Componentes afetados:**
- `components/RedistribuicaoModal.tsx`
- `components/NotificacaoBell.tsx`
- `components/DescricaoAprovacaoModal.tsx`
- `components/PriorizacaoAprovacaoModal.tsx`

---

### 2. Adicionar Rotas Faltantes no App.tsx
**Arquivo:** `src/App.tsx`
**Views a adicionar no switch(currentView):**

```tsx
case 'linkedin_import':
    return <LinkedInImportPanel />;

case 'dashboard_ml':
    return <DashboardMLLearning />;

case 'dashboard_performance_ia':
    return <DashboardPerformanceIA />;

case 'dashboard_raisa_metrics':
    return <DashboardRaisaMetrics />;
```

**Imports necessários:**
```tsx
import LinkedInImportPanel from './components/raisa/LinkedInImportPanel';
import DashboardMLLearning from './components/raisa/DashboardMLLearning';
import DashboardPerformanceIA from './components/raisa/DashboardPerformanceIA';
import DashboardRaisaMetrics from './components/raisa/DashboardRaisaMetrics';
```

---

### 3. ✅ RESOLVER: Criar Views Alias no Supabase
**Script pronto:** `database/CRIAR_VIEWS_RAISA.sql`

**Views a criar (aliases para as existentes):**
| View a Criar | Baseada em |
|-------------|------------|
| `vw_raisa_funil_conversao` | `vw_evolucao_mensal` |
| `vw_raisa_performance_analista` | `vw_performance_analista` |
| `vw_raisa_performance_cliente` | `vw_performance_cliente` |
| `vw_raisa_kpis_principais` | `vw_dashboard_resumo` |
| `vw_raisa_top_clientes` | `vw_performance_cliente` |
| `vw_raisa_top_analistas` | `vw_performance_analista` |
| `vw_raisa_analise_tempo` | `vw_evolucao_mensal` |

**Views NOVAS (sem equivalente):**
- `vw_raisa_aprovacao_reprovacao` - calcular de `candidatura_aprovacoes`
- `vw_raisa_motivos_reprovacao` - calcular de `candidatura_aprovacoes`

---

## 🟠 PRIORIDADE MÉDIA

### 4. ✅ Substituir Dados Mockados - CONCLUÍDO

| Componente | O que foi feito |
|------------|-----------------|
| ✅ RedistribuicaoModal | Busca analistas de `vw_performance_analista` |
| ✅ DescricaoAprovacaoModal | Busca de `vaga_analise_ia` |
| ✅ PriorizacaoAprovacaoModal | Busca de `vaga_priorizacao` |
| ⏳ VagaWorkflowManager | Implementar busca de vaga específica |

---

### 5. Resolver TODOs de usuarioId

| Arquivo | Linha | Ação |
|---------|-------|------|
| ConfiguracaoPriorizacaoDistribuicao.tsx | 78, 104 | Usar useAuth() |
| AjustesDistribuicaoAnalista.tsx | 62, 83 | Usar useAuth() |

---

## 🟢 CONCLUÍDO EM 28/12/2024

### ✅ 1. AuthContext Criado
- Arquivo: `src/contexts/AuthContext.tsx`
- Exporta: `AuthProvider`, `useAuth`
- Integrado ao App.tsx

### ✅ 2. Rotas Faltantes Adicionadas
Adicionadas no App.tsx:
- `linkedin_import` → LinkedInImportPanel
- `dashboard_ml` → DashboardMLLearning  
- `dashboard_performance_ia` → DashboardPerformanceIA
- `dashboard_raisa_metrics` → DashboardRaisaMetrics

### ✅ 3. Views SQL Criadas
9 views `vw_raisa_*` criadas no Supabase

### ✅ 4. Campo `nome` adicionado
Para compatibilidade com componentes que usam `user.nome`:
- LoginScreen.tsx
- useUsers.ts (loadUsers, addUser, updateUser)

### ✅ 5. Mocks Substituídos por Supabase (28/12/2024)
| Componente | Busca de | Status |
|------------|----------|--------|
| RedistribuicaoModal | `vw_performance_analista` | ✅ Concluído |
| DescricaoAprovacaoModal | `vaga_analise_ia` + `vagas` | ✅ Concluído |
| PriorizacaoAprovacaoModal | `vaga_priorizacao` + `vagas` + `clients` | ✅ Concluído |

---

## 🟡 PRIORIDADE BAIXA

### 6. Implementar ExportModule
**Arquivo:** `src/components/ExportModule.tsx`
**Status atual:** Apenas placeholder

---

### 7. Calcular Métricas Reais
- `cronJobsService.ts:86` - Média de mercado
- `useDistribuicaoIA.ts:269` - Score velocidade histórico

---

## ✅ PRÓXIMOS PASSOS

1. ⏳ Aguardar resultado da query de schema do Supabase
2. 🔧 Criar AuthContext
3. 🔧 Adicionar rotas faltantes
4. 🔧 Criar views SQL necessárias
5. 🔧 Substituir mocks por dados reais

---

*Última atualização: 28/12/2024*
