# 🚀 DEPLOY - POSIÇÃO COMERCIAL
## Relatório de CVs Enviados por Vaga

---

## 📦 LISTA DE ARQUIVOS (5 arquivos)

### 🗄️ SQL (Execute no Supabase)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 1 | `posicao_comercial_schema.sql` | Colunas + Views + Funções |

### 📁 Hooks (src/hooks/Supabase/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 2 | `usePosicaoComercial.ts` | Hook para buscar dados |

### 📁 Componentes (src/components/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 3 | `PosicaoComercial.tsx` | Dashboard de Posição Comercial |

### 📁 Layout (src/components/layout/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 4 | `Sidebar_COMPLETO.tsx` | Sidebar com Movimentações + Posição Comercial |

### 📁 App (src/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 5 | `App_COMPLETO.tsx` | App com imports e cases novos |

---

## 🔧 PASSO A PASSO

### ETAPA 1: SQL no Supabase

Execute o arquivo `posicao_comercial_schema.sql`:

**Alterações em tabelas:**
- `vagas.ocorrencia` - Nova coluna (INTEGER): Número da OC
- `vagas.vaga_faturavel` - Nova coluna (BOOLEAN): Se é faturável ou não

**Views criadas:**
- `vw_posicao_comercial` - View principal com todas as métricas
- `vw_clientes_ativos` - Lista de clientes ativos
- `vw_posicao_comercial_resumo` - Resumo por status

**Funções criadas:**
- `fn_posicao_comercial(gestor_id, cliente_id, faturavel)` - Busca filtrada

### ETAPA 2: Copiar Arquivos

```
src/
├── hooks/
│   └── Supabase/
│       └── usePosicaoComercial.ts      ← NOVO
│
├── components/
│   ├── PosicaoComercial.tsx            ← NOVO
│   └── layout/
│       └── Sidebar.tsx                 ← SUBSTITUIR (Sidebar_COMPLETO.tsx)
│
└── App.tsx                             ← SUBSTITUIR (App_COMPLETO.tsx)
```

### ETAPA 3: Git

```powershell
git add src/hooks/Supabase/usePosicaoComercial.ts
git add src/components/PosicaoComercial.tsx
git add src/components/layout/Sidebar.tsx
git add src/App.tsx

git commit -m "feat: Dashboard de Posição Comercial

- Relatório de CVs enviados por vaga
- Filtros: Gestor Comercial, Cliente, Faturável
- Colunas: Cliente, Vaga, OC, Abertura
- CVs por semana (Sem 1-5)
- Totais: Enviados, Reprovados, Aguardando
- Ordenação por Status"

git push origin main
```

---

## 🎨 DESIGN DO DASHBOARD

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  📊 Posição Comercial                                                                   │
│  CVs enviados em Dezembro 2024                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Gestor: [Todos ▼]  Cliente: [Todos ▼]  Faturável: [Todos ▼]  [🔄 Atualizar]          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ CLIENTE │ VAGA       │Qtde│ OC  │Abertura│ Nov │ CVs enviados em Dez  │  Total   │STATUS│
│         │            │    │     │        │     │Sem1│Sem2│Sem3│Sem4│Sem5│Env│Rep│Ag│      │
├─────────┼────────────┼────┼─────┼────────┼─────┼────┼────┼────┼────┼────┼───┼───┼──┼──────┤
│FAST SHOP│Analista Gov│  1 │7330 │07/11/25│  0  │ 1  │ 2  │ -  │ -  │ -  │ 3 │ - │3 │APROV │
│T-SYSTEMS│Analista SAP│  1 │7441 │06/11/25│  0  │ -  │ 3  │ -  │ -  │ -  │ 3 │ - │3 │PERDIDA│
│CATENO   │VTI-186 Dev │  1 │7235 │30/09/25│  0  │ -  │ -  │ -  │ -  │ -  │ 0 │ - │0 │EM AND│
├─────────┴────────────┴────┴─────┴────────┴─────┴────┴────┴────┴────┴────┴───┴───┴──┴──────┤
│ TOTAL (X vagas)                              │  X │ X  │ X  │ X  │ X  │ X │ X │X │  -   │
└─────────────────────────────────────────────────────────────────────────────────────────┘

📋 Legenda de Status: 1) CANCELADA  2) PERDIDA  3) APROVADA  4) EM ANDAMENTO  5) ABERTA
```

---

## 📊 COLUNAS DO RELATÓRIO

| Coluna | Fonte | Descrição |
|--------|-------|-----------|
| CLIENTE | `clients.razao_social_cliente` | Nome do cliente |
| VAGA | `vagas.titulo` | Título da vaga |
| Qtde | Fixo 1 | Quantidade de posições |
| OC | `vagas.ocorrencia` | Número da Ordem de Compra |
| Abertura | `vagas.criado_em` | Data de abertura |
| Enviados (mês anterior) | `candidatura_envios` | Total mês anterior |
| Sem 1-5 | `candidatura_envios` | Envios por semana |
| Total Enviados | `candidaturas` | Total CVs enviados |
| Total Reprovados | `candidaturas` | Status reprovado |
| Total Aguardando | `candidaturas` | Status em análise |
| STATUS | `vagas.status` | Status da vaga |

---

## 🔄 ORDENAÇÃO POR STATUS

| Ordem | Status | Cor |
|-------|--------|-----|
| 1 | CANCELADA | Cinza |
| 2 | PERDIDA | Vermelho |
| 3 | APROVADA | Verde |
| 4 | EM ANDAMENTO | Amarelo |
| 5 | ABERTA | Azul |

---

## 📅 CÁLCULO DAS SEMANAS

```
Semana 1: Dias 1-7 do mês
Semana 2: Dias 8-14 do mês
Semana 3: Dias 15-21 do mês
Semana 4: Dias 22-28 do mês
Semana 5: Dias 29+ do mês
```

---

## 🧪 TESTES

### Teste SQL no Supabase:

```sql
-- Verificar colunas
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'vagas' AND column_name IN ('ocorrencia', 'vaga_faturavel');

-- Testar view
SELECT * FROM vw_posicao_comercial LIMIT 10;

-- Testar função
SELECT * FROM fn_posicao_comercial(NULL, NULL, NULL);
```

### Teste Interface:

1. Acessar menu "Posição Comercial"
2. Testar filtros: Gestor, Cliente, Faturável
3. Verificar ordenação por status
4. Verificar totais no footer

---

## ⚠️ ALTERAÇÕES NECESSÁRIAS NO FORM DE VAGAS

Depois de executar o SQL, adicione os campos no formulário de Vagas (`VagasCriar.tsx`):

```tsx
{/* Campo Ocorrência */}
<div className="form-group">
  <label>Nº da Ocorrência (OC)</label>
  <input
    type="number"
    value={formData.ocorrencia || ''}
    onChange={(e) => setFormData({...formData, ocorrencia: parseInt(e.target.value) || null})}
    className="form-input"
    placeholder="Ex: 7330"
  />
</div>

{/* Campo Faturável */}
<div className="form-group">
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={formData.vaga_faturavel !== false}
      onChange={(e) => setFormData({...formData, vaga_faturavel: e.target.checked})}
    />
    <span>Vaga Faturável</span>
  </label>
</div>
```

---

**Claude DEV + Design + RH + Negócios**  
**Data:** 26/12/2024
