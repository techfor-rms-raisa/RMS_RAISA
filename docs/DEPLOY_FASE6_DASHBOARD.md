# 🚀 INSTRUÇÕES DE DEPLOY - FASE 6
## Dashboards e Métricas RAISA

---

## 📦 LISTA DE ARQUIVOS (5 arquivos)

### 🗄️ SQL (Execute no Supabase)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 1 | `dashboard_metricas_schema.sql` | Views de KPIs e métricas |

### 📁 Hooks (src/hooks/Supabase/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 2 | `useRaisaMetrics.ts` | Hook para buscar métricas |

### 📁 Componentes (src/components/raisa/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 3 | `DashboardRaisaMetrics.tsx` | Dashboard principal de KPIs |
| 4 | `AlertasDropdown.tsx` | Dropdown de alertas (header) |

### 📁 Documentação

| # | Arquivo | Descrição |
|---|---------|-----------|
| 5 | `DEPLOY_FASE6_DASHBOARD.md` | Este arquivo |

---

## 🔧 PASSO A PASSO

### ETAPA 1: SQL no Supabase

Execute o `dashboard_metricas_schema.sql` no Supabase SQL Editor.

**Views criadas:**
- `vw_dashboard_resumo` - Cards de resumo
- `vw_vagas_sombra` - Vagas esquecidas/paradas
- `vw_performance_analista` - KPIs por analista
- `vw_performance_cliente` - KPIs por cliente
- `vw_funil_conversao` - Etapas do funil
- `vw_evolucao_mensal` - Gráfico 12 meses
- `vw_alertas_ativos` - Sistema de alertas

### ETAPA 2: Copiar Arquivos

```
src/
├── hooks/
│   └── Supabase/
│       └── useRaisaMetrics.ts        ← NOVO
│
└── components/
    └── raisa/
        ├── DashboardRaisaMetrics.tsx ← NOVO
        └── AlertasDropdown.tsx       ← NOVO
```

### ETAPA 3: Adicionar ao Menu

No arquivo `Sidebar.tsx` ou onde você gerencia navegação, adicione:

```tsx
// Importar
import DashboardRaisaMetrics from '@/components/raisa/DashboardRaisaMetrics';

// No menu/rotas
{
  path: '/raisa/dashboard',
  label: '📊 Dashboard',
  component: DashboardRaisaMetrics
}
```

### ETAPA 4: Adicionar Alertas ao Header

No `Header.tsx`:

```tsx
import AlertasDropdown from '@/components/raisa/AlertasDropdown';

// No JSX do header
<AlertasDropdown onNavigate={(route) => navigate(route)} />
```

### ETAPA 5: Git

```powershell
git add src/hooks/Supabase/useRaisaMetrics.ts
git add src/components/raisa/DashboardRaisaMetrics.tsx
git add src/components/raisa/AlertasDropdown.tsx

git commit -m "feat(raisa): FASE 6 - Dashboard de métricas e KPIs

- Cards de resumo (vagas, candidaturas, taxas)
- Gráfico de evolução mensal (12 meses)
- Funil de conversão
- Performance por analista e cliente
- Sistema de alertas para vagas esquecidas
- Dropdown de alertas no header"

git push origin main
```

---

## 📊 KPIs IMPLEMENTADOS

### Cards de Resumo
| Métrica | Descrição |
|---------|-----------|
| Vagas Abertas | Total de vagas em andamento |
| Vagas Urgentes | Vagas marcadas como urgente |
| Candidaturas (Mês) | Total de candidaturas no mês |
| Taxa Aprovação | % de aprovados sobre total |
| Tempo Médio | Dias para fechar uma vaga |

### Vagas na Sombra (Esquecidas)
| Critério | Descrição |
|----------|-----------|
| Sem candidatos | 3+ dias sem nenhum candidato |
| Sem movimentação | 7+ dias sem novas candidaturas |
| Urgente sem envio | Vaga urgente sem envios ao cliente |
| Prazo próximo | Menos de 7 dias para vencer |

### Performance Analista
- Vagas ativas
- Candidaturas no mês
- Enviados ao cliente
- Aprovados/Reprovados
- Taxa de aprovação
- Tempo médio de fechamento

### Performance Cliente
- Vagas ativas
- Histórico total
- Enviados no mês
- Taxa de aprovação
- Tempo médio de resposta

### Alertas Automáticos
| Tipo | Severidade |
|------|------------|
| Vaga sem candidatos | ⚠️ Warning |
| Vaga sem movimentação | ⚠️ Warning |
| Prazo crítico (5 dias) | 🚨 Critical |
| Prazo vencido | 🚨 Critical |

---

## 🎨 VISUAL DO DASHBOARD

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📊 Dashboard RAISA                                    [🔄 Atualizar]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐                 │
│  │📋 Vagas  │🚨 Urgentes│👥 Cands. │✅ Taxa   │⏱️ Tempo  │                 │
│  │   24     │    5     │   156    │  67%     │ 12d      │                 │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘                 │
│                                                                             │
│  [📈 Visão Geral] [👤 Analistas] [🏢 Clientes] [🚨 Alertas (8)]            │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 📈 EVOLUÇÃO MENSAL (12 meses)                                        │ │
│  │                                                                       │ │
│  │   15─┤        ●───●                                                   │ │
│  │      │  ●───●      ╲●   ← Abertas (azul)                             │ │
│  │   10─┤      ╲  ╱   ╱                                                  │ │
│  │      │       ○○   ○   ← Fechadas (verde)                             │ │
│  │    5─┤                                                                │ │
│  │      │ ◇───◇───◇───◇   ← Aprovações (amarelo)                        │ │
│  │    0─└───────────────────────────────────────────────                │ │
│  │       Jan Feb Mar Abr Mai Jun Jul Ago Set Out Nov Dez                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐ │
│  │ 🔻 FUNIL DE CONVERSÃO   │  │ 👻 VAGAS NA SOMBRA                      │ │
│  │                         │  │                                         │ │
│  │ Triagem    ████████ 100 │  │ 🔴 VTI-225 Gerente Projetos      12d   │ │
│  │ Qualific.  ██████── 75  │  │    Cliente X • Sem candidatos          │ │
│  │ Enviado    ████──── 50  │  │                                         │ │
│  │ Entrev.    ███───── 38  │  │ 🟠 DEV-130 Java Senior           8d    │ │
│  │ Aprovado   ██────── 25  │  │    Cliente Y • Sem movimentação        │ │
│  │                         │  │                                         │ │
│  └─────────────────────────┘  └─────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔔 DROPDOWN DE ALERTAS

No header da aplicação:

```
┌────────────────────────────────────────────────────────────────┐
│ RAISA                                      [🔔 5] [👤 Maria]  │
└───────────────────────────────────────────────┬────────────────┘
                                                │
                                    ┌───────────▼───────────┐
                                    │ Alertas    [5 críticos]│
                                    ├───────────────────────┤
                                    │ 🚨 URGENTE: Vaga XYZ  │
                                    │    vence em 2 dias!   │
                                    ├───────────────────────┤
                                    │ ⚠️ Vaga ABC sem       │
                                    │    movimentação 10d   │
                                    ├───────────────────────┤
                                    │ ⚠️ Vaga DEF sem       │
                                    │    candidatos há 5d   │
                                    ├───────────────────────┤
                                    │ [Ver Dashboard →]     │
                                    └───────────────────────┘
```

---

## 🧪 TESTES

### Teste 1: SQL Views
```sql
-- Testar resumo
SELECT * FROM vw_dashboard_resumo;

-- Testar vagas esquecidas
SELECT * FROM vw_vagas_sombra;

-- Testar performance
SELECT * FROM vw_performance_analista;
SELECT * FROM vw_performance_cliente;

-- Testar alertas
SELECT * FROM vw_alertas_ativos;
```

### Teste 2: Dashboard
1. Acessar `/raisa/dashboard`
2. Verificar se cards carregam
3. Verificar gráfico de evolução
4. Navegar pelas tabs

### Teste 3: Alertas
1. Verificar sino no header
2. Clicar e ver dropdown
3. Clicar em alerta específico

---

## ⚠️ DEPENDÊNCIAS

O SQL assume que existem as seguintes tabelas:
- `vagas` (com campos: status, urgente, prazo_fechamento, analista_id, cliente_id, criado_em, atualizado_em)
- `candidaturas` (com campos: status, vaga_id, criado_em, atualizado_em)
- `clientes` (com campos: nome_cliente, ativo)
- `app_users` (com campos: nome_usuario, tipo_usuario, ativo_usuario)

Se alguma coluna não existir, o SQL poderá falhar. Verifique a estrutura antes de executar.

---

## 📈 VALOR PARA O NEGÓCIO

✅ **Visibilidade**: Gestores veem KPIs em tempo real
✅ **Proatividade**: Alertas automáticos evitam vagas esquecidas  
✅ **Accountability**: Performance individual transparente
✅ **Decisões**: Dados para priorização e alocação
✅ **Clientes**: Identificar clientes problemáticos (baixa aprovação)

---

**Claude DEV + Negócios + Processos**  
**Data:** 26/12/2024  
**Fase:** 6 - Dashboards e Métricas
