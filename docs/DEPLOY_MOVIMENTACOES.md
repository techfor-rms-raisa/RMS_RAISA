# 🚀 INSTRUÇÕES DE DEPLOY - MOVIMENTAÇÕES DE CONSULTORES
## Relatório de Inclusões e Exclusões

---

## 📦 LISTA DE ARQUIVOS (3 arquivos)

### 🗄️ SQL (Execute no Supabase)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 1 | `movimentacoes_schema.sql` | Colunas + Views + Funções |

### 📁 Hooks (src/hooks/Supabase/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 2 | `useMovimentacoes.ts` | Hook para buscar movimentações |

### 📁 Componentes (src/components/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 3 | `MovimentacoesConsultores.tsx` | Dashboard de Movimentações |

---

## 🔧 PASSO A PASSO

### ETAPA 1: SQL no Supabase

Execute o arquivo `movimentacoes_schema.sql`:

**Alterações em tabelas:**
- `vagas.tipo_de_vaga` - Nova coluna (VARCHAR): 'Nova Posição' | 'Reposição'
- `consultants.substituicao` - Nova coluna (BOOLEAN): TRUE = Reposição, FALSE = Sem Reposição
- `consultants.cliente_id` - Nova coluna (FK) para vincular consultor ao cliente

**Views criadas:**
- `vw_movimentacoes_inclusoes` - Consultores Ativos com data de inclusão no ano
- `vw_movimentacoes_exclusoes` - Consultores Perdidos/Encerrados com data de saída no ano
- `vw_movimentacoes_resumo_mensal` - Resumo por mês (qtd e valores)
- `vw_gestores_comerciais` - Lista de gestores comerciais

**Funções criadas:**
- `fn_buscar_inclusoes(mes, ano, gestor_id)` - Busca inclusões filtradas
- `fn_buscar_exclusoes(mes, ano, gestor_id)` - Busca exclusões filtradas

### ETAPA 2: Copiar Arquivos

```
src/
├── hooks/
│   └── Supabase/
│       └── useMovimentacoes.ts       ← NOVO
│
└── components/
    └── MovimentacoesConsultores.tsx  ← NOVO
```

### ETAPA 3: Adicionar Rota no App.tsx

```tsx
import MovimentacoesConsultores from './components/MovimentacoesConsultores';

// Na seção de rotas:
{activeSection === 'movimentacoes' && <MovimentacoesConsultores />}
```

### ETAPA 4: Adicionar ao Menu Lateral (Sidebar.tsx)

```tsx
// Adicionar item no menu
<SidebarItem
  icon={<ChartBarIcon />}
  label="Movimentações"
  active={activeSection === 'movimentacoes'}
  onClick={() => handleNavigation('movimentacoes')}
/>
```

### ETAPA 5: Git

```powershell
git add src/hooks/Supabase/useMovimentacoes.ts
git add src/components/MovimentacoesConsultores.tsx

git commit -m "feat: Dashboard de Movimentações de Consultores

- Relatório de Inclusões (consultores ativos)
- Relatório de Exclusões (consultores perdidos/encerrados)
- Filtro por mês (JAN-DEZ + ACUMULADO)
- Filtro por Gestão Comercial
- Cálculo de valores (PJ x 168, CLT direto)
- Novas colunas: tipo_de_vaga, substituicao"

git push origin main
```

---

## 📋 ALTERAÇÕES NECESSÁRIAS NOS FORMULÁRIOS

### 1. Formulário de VAGAS (VagasCriar.tsx)

Adicionar campo `tipo_de_vaga`:

```tsx
<div className="form-group">
  <label>Tipo de Vaga</label>
  <select
    value={formData.tipo_de_vaga || 'Nova Posição'}
    onChange={(e) => setFormData({...formData, tipo_de_vaga: e.target.value})}
    className="form-select"
  >
    <option value="Nova Posição">Nova Posição</option>
    <option value="Reposição">Reposição</option>
  </select>
</div>
```

### 2. Formulário de CONSULTORES (ManageConsultants.tsx)

Adicionar campo `substituicao`:

```tsx
<div className="form-group">
  <label>
    <input
      type="checkbox"
      checked={formData.substituicao || false}
      onChange={(e) => setFormData({...formData, substituicao: e.target.checked})}
    />
    <span className="ml-2">Repor vaga quando sair</span>
  </label>
  <p className="text-xs text-gray-500">
    Se marcado, a vaga será reposta quando o consultor sair
  </p>
</div>
```

Adicionar campo `cliente_id`:

```tsx
<div className="form-group">
  <label>Cliente</label>
  <select
    value={formData.cliente_id || ''}
    onChange={(e) => setFormData({...formData, cliente_id: e.target.value})}
    className="form-select"
  >
    <option value="">Selecione o cliente</option>
    {clientes.map(c => (
      <option key={c.id} value={c.id}>{c.razao_social_cliente}</option>
    ))}
  </select>
</div>
```

---

## 🎨 DESIGN DO COMPONENTE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📊 Movimentações de Consultores                  [Gestão Comercial: ▼]    │
│  Relatório de Inclusões e Exclusões - 2024                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────────┐
│  │ JAN │ FEV │ MAR │ ABR │ MAI │ JUN │ JUL │ AGO │ SET │ OUT │ NOV │ DEZ │ ACUMULADO │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────────────┘
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  │ Total Inclusões  │ │ Valor Inclusões  │ │ Total Exclusões  │ │ Valor Exclusões  │
│  │       01         │ │  R$ 18.078,48    │ │       01         │ │  R$ 18.078,48    │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ ➕ INCLUSÃO - Total: 01                                                 │
│  ├─────────────────────────────────────────────────────────────────────────┤
│  │ CLIENTE      │ PERFIL                │ ALOCADO      │ MOVIMENTAÇÃO │ R$ │
│  │ FAST SHOP    │ Analista Governança   │ Jackson...   │ Reposição    │ xx │
│  │──────────────┴───────────────────────┴──────────────┴──────────────┴────│
│  │                                         Total:       R$ 18.078,48       │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ ➖ EXCLUSÃO - Total: 01                                                 │
│  ├─────────────────────────────────────────────────────────────────────────┤
│  │ CLIENTE      │ FUNÇÃO                │ NOME         │ MOTIVAÇÃO    │ R$ │
│  │ FAST SHOP    │ Desenvolvedor PHP...  │ Jackson...   │ Reposição    │ xx │
│  │──────────────┴───────────────────────┴──────────────┴──────────────┴────│
│  │                                         Total:       R$ 18.078,48       │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ 📈 Resumo do Período                                                    │
│  │ ┌────────────────┬────────────────┬────────────────┬────────────────┐  │
│  │ │ Saldo Líquido  │ Valor Líquido  │ Inclusões      │ Exclusões      │  │
│  │ │      +0        │   R$ 0,00      │ 1 (R$ 18k)     │ 1 (R$ 18k)     │  │
│  │ └────────────────┴────────────────┴────────────────┴────────────────┘  │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 LÓGICA DE CÁLCULO DE VALORES

### Para INCLUSÕES:
```
SE regime_contratacao = 'PJ':
   valor_mensal = valor_pagamento * 168 (horas)
SENÃO:
   valor_mensal = valor_pagamento (salário CLT)

valor_anual = valor_mensal * 12
```

### Para EXCLUSÕES:
```
Mesma lógica de valores.

substituicao:
- TRUE → Label "Reposição" (vaga será reposta)
- FALSE → Label "Sem Reposição" (vaga não será reposta)
```

### Critérios de Inclusão:
- `status = 'Ativo'`
- `data_inclusao_consultores` no ano corrente
- Agrupado por mês da data_inclusao

### Critérios de Exclusão:
- `status IN ('Perdido', 'Encerrado')`
- `data_saida` no ano corrente
- Agrupado por mês da data_saida

---

## 🧪 TESTES

### Teste 1: Views SQL

```sql
-- Verificar inclusões
SELECT * FROM vw_movimentacoes_inclusoes;

-- Verificar exclusões
SELECT * FROM vw_movimentacoes_exclusoes;

-- Verificar resumo
SELECT * FROM vw_movimentacoes_resumo_mensal;

-- Testar função
SELECT * FROM fn_buscar_inclusoes(12, 2024, NULL);
```

### Teste 2: Interface

1. Acessar menu "Movimentações"
2. Clicar em diferentes meses
3. Filtrar por Gestão Comercial
4. Verificar totais e valores

---

**Claude DEV + Design + RH + Negócios**  
**Data:** 26/12/2024
