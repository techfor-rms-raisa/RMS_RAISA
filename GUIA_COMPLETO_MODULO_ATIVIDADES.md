# 🚀 Guia Completo - Módulo de Atividades RMS-RAISA

## 📋 Visão Geral

Este guia descreve a instalação completa do **Módulo de Atividades**, que reorganiza todo o sistema de relatórios de atividades em um menu dedicado com 3 submenus:

- ✅ **Inserir** - Digitação manual ou importação de arquivo
- ✅ **Consultar** - Visualização de relatórios com filtros
- ✅ **Exportar** - Exportação em CSV, TXT ou JSON

---

## 🎯 O que foi implementado:

### **1. Removido do Dashboard:**
- ❌ "Upload de Relatório" (componente FileUpload)
- ❌ Botão "Selecionar PDF/TXT"

### **2. Criado Menu Lateral "ATIVIDADES":**
```
RMS
├─ Dashboard
├─ Quarentena
├─ ...

ATIVIDADES ⭐ NOVO
├─ Inserir
├─ Consultar
└─ Exportar

RAISA
├─ Vagas
├─ ...
```

### **3. Novos Componentes:**

#### **AtividadesInserir.tsx**
- 🖊️ Modo Manual: Form com dropdown Cliente → Consultor
- 📤 Modo Upload: Importação de arquivo com IA
- 📥 Download de template
- 📊 Análise automática de risco

#### **AtividadesConsultar.tsx**
- 🔍 Filtros: Ano, Cliente, Consultor, Mês
- 📊 Estatísticas: Total, Crítico, Alto, Médio, Baixo
- 📅 Tabela com círculos coloridos por mês
- 👁️ Modal com detalhes completos do relatório

#### **AtividadesExportar.tsx**
- 📥 Exportação em CSV, TXT ou JSON
- 📊 Estatísticas antes de exportar
- ⚙️ Opção de incluir detalhes completos
- 📋 Preview do que será exportado

---

## ⏱️ Tempo de Instalação: ~10 minutos

---

## 📦 Passo 1: Extrair Arquivos

Extraia o ZIP `RMS-RAISA_MODULO_ATIVIDADES.zip` e você verá:

```
RMS-RAISA/
├── components/
│   ├── atividades/                    ⭐ NOVA PASTA
│   │   ├── AtividadesInserir.tsx      ⭐ NOVO
│   │   ├── AtividadesConsultar.tsx    ⭐ NOVO
│   │   └── AtividadesExportar.tsx     ⭐ NOVO
│   ├── ManageConsultants.tsx          ✏️ ATUALIZADO
│   ├── ManageClients.tsx              ✏️ ATUALIZADO
│   └── layout/
│       └── Sidebar.tsx                ✏️ ATUALIZADO
├── hooks/
│   └── useSupabaseData.ts             ✏️ ATUALIZADO
├── App.tsx                            ✏️ ATUALIZADO
├── types.ts                           ✏️ ATUALIZADO
├── DOCUMENTACAO_RELATORIOS_ATIVIDADES.md
├── GUIA_INSTALACAO_RELATORIOS.md
└── GUIA_COMPLETO_MODULO_ATIVIDADES.md (este arquivo)
```

---

## 📝 Passo 2: Copiar Arquivos

### **2.1. Criar nova pasta:**

```bash
# No seu projeto RMS-RAISA
mkdir -p components/atividades
```

### **2.2. Copiar novos componentes:**

```
components/atividades/AtividadesInserir.tsx    → seu_projeto/components/atividades/
components/atividades/AtividadesConsultar.tsx  → seu_projeto/components/atividades/
components/atividades/AtividadesExportar.tsx   → seu_projeto/components/atividades/
```

### **2.3. Substituir arquivos existentes:**

```
components/ManageConsultants.tsx  → seu_projeto/components/
components/ManageClients.tsx      → seu_projeto/components/
components/layout/Sidebar.tsx     → seu_projeto/components/layout/
hooks/useSupabaseData.ts          → seu_projeto/hooks/
App.tsx                           → seu_projeto/
types.ts                          → seu_projeto/
```

---

## ✅ Passo 3: Verificar Instalação

### **3.1. Compilar projeto:**

```bash
npm run build
```

Se houver erros, verifique:
- Todos os arquivos foram copiados
- Não há duplicação de código
- Paths dos imports estão corretos

### **3.2. Iniciar aplicação:**

```bash
npm start
```

---

## 🧪 Passo 4: Testar Funcionalidades

### **Teste 1: Menu Lateral**

1. Faça login como **Administrador**, **Gestão Comercial** ou **Gestão de Pessoas**
2. Veja se aparece o menu **"ATIVIDADES"** na lateral
3. Clique para expandir
4. Deve mostrar: **Inserir**, **Consultar**, **Exportar**

✅ **Resultado esperado:**
```
ATIVIDADES
├─ ✍️ Inserir
├─ 🔍 Consultar
└─ 📥 Exportar
```

---

### **Teste 2: Inserir - Modo Manual**

1. Clique em **ATIVIDADES → Inserir**
2. Selecione modo **"✍️ Digitação Manual"**
3. Escolha um **Cliente** no dropdown
4. Escolha um **Consultor** (lista filtra automaticamente)
5. Selecione o **Mês**
6. Digite atividades:
   ```
   Consultor apresentou 2 faltas não justificadas.
   Reclamação do cliente sobre qualidade do trabalho.
   ```
7. Clique em **"✅ Processar Relatório"**

✅ **Resultado esperado:**
- Alert: "✅ Relatório de atividades processado com sucesso!"
- Console: Logs de análise
- Score atualizado no banco

---

### **Teste 3: Inserir - Modo Upload**

1. Clique em **ATIVIDADES → Inserir**
2. Selecione modo **"📤 Importar Arquivo"**
3. Clique em **"📥 Baixar Template de Exemplo"**
4. Edite o template com dados reais
5. Faça upload do arquivo
6. Aguarde processamento

✅ **Resultado esperado:**
- Alert: "✅ Relatórios importados e processados com sucesso!"
- Console: "X relatório(s) analisado(s)"
- Múltiplos consultores atualizados

---

### **Teste 4: Consultar**

1. Clique em **ATIVIDADES → Consultar**
2. Veja estatísticas no topo (Total, Crítico, Alto, Médio, Baixo)
3. Filtre por **Cliente** ou **Consultor**
4. Veja tabela com círculos coloridos por mês
5. Clique em um círculo colorido

✅ **Resultado esperado:**
- Modal abre com detalhes completos
- Mostra: Resumo, Padrões, Alertas, Recomendações, Atividades
- Botão "×" fecha o modal

---

### **Teste 5: Exportar**

1. Clique em **ATIVIDADES → Exportar**
2. Selecione **Ano** e **Cliente**
3. Veja estatísticas atualizarem
4. Escolha formato: **CSV**, **TXT** ou **JSON**
5. Marque/desmarque **"Incluir detalhes completos"**
6. Clique em **"📥 Exportar CSV"** (ou TXT/JSON)

✅ **Resultado esperado:**
- Arquivo baixado automaticamente
- Alert: "✅ Arquivo exportado com sucesso!"
- Arquivo contém dados corretos

---

### **Teste 6: Dashboard (sem Upload)**

1. Vá para **Dashboard**
2. Verifique que **NÃO** aparece mais:
   - "Upload de Relatório"
   - Botão "Selecionar PDF/TXT"

✅ **Resultado esperado:**
- Dashboard limpo, sem componente de upload
- Apenas filtros e tabela de consultores

---

## 🔍 Passo 5: Verificação Técnica

### **5.1. Console do Navegador (F12):**

Execute:

```javascript
// Verificar se funções existem
console.log(typeof processReportAnalysis);  // "function"
console.log(typeof updateConsultantScore);  // "function"
```

### **5.2. Verificar Views no types.ts:**

Abra `types.ts` e veja se existe:

```typescript
export type View = 
  // ...
  | 'atividades_inserir' | 'atividades_consultar' | 'atividades_exportar'
  // ...
```

### **5.3. Verificar Sidebar:**

Abra `components/layout/Sidebar.tsx` e veja se existe:

```typescript
const atividadesItems = [
    { view: 'atividades_inserir', label: 'Inserir', ... },
    { view: 'atividades_consultar', label: 'Consultar', ... },
    { view: 'atividades_exportar', label: 'Exportar', ... },
];
```

---

## 📊 O que mudou em cada arquivo:

### **types.ts**
```diff
+ | 'atividades_inserir' | 'atividades_consultar' | 'atividades_exportar'
```

### **Sidebar.tsx**
```diff
+ const atividadesItems = [...]
+ <SidebarSection title="ATIVIDADES" items={atividadesItems} />
```

### **App.tsx**
```diff
+ import AtividadesInserir from './components/atividades/AtividadesInserir';
+ import AtividadesConsultar from './components/atividades/AtividadesConsultar';
+ import AtividadesExportar from './components/atividades/AtividadesExportar';
- import FileUpload from './components/FileUpload';

+ case 'atividades_inserir': return <AtividadesInserir ... />;
+ case 'atividades_consultar': return <AtividadesConsultar ... />;
+ case 'atividades_exportar': return <AtividadesExportar ... />;

- case 'dashboard': return <><FileUpload .../><Dashboard .../></>;
+ case 'dashboard': return <Dashboard .../>;
```

### **ManageConsultants.tsx**
```diff
- import ReportActivityModal from './ReportActivityModal';
- import ReportImport from './ReportImport';
- onManualReport?: (text: string) => Promise<void>;
- {!isReadOnly && onManualReport && <ReportImport ... />}
- <ReportActivityModal ... />
```

### **ManageClients.tsx**
```diff
- import ReportActivityModal from './ReportActivityModal';
- onManualReport?: (text: string) => Promise<void>;
- <ReportActivityModal ... />
```

### **useSupabaseData.ts**
✅ Já implementado anteriormente (funções `processReportAnalysis` e `updateConsultantScore`)

---

## 🎨 Interface Final:

### **Menu Lateral:**

```
┌─────────────────────────┐
│ ⭕ ORBIT RMS            │
├─────────────────────────┤
│ RMS                     │
│ ├─ 📊 Dashboard         │
│ ├─ ⚠️ Quarentena        │
│ ├─ 💡 Recomendações     │
│ └─ ...                  │
├─────────────────────────┤
│ ATIVIDADES ⭐           │
│ ├─ ✍️ Inserir           │
│ ├─ 🔍 Consultar         │
│ └─ 📥 Exportar          │
├─────────────────────────┤
│ RAISA                   │
│ ├─ 💼 Vagas             │
│ └─ ...                  │
└─────────────────────────┘
```

### **Tela Inserir:**

```
┌─────────────────────────────────────────────┐
│ 📝 Inserir Relatório de Atividades          │
├─────────────────────────────────────────────┤
│ [✍️ Digitação Manual] [📤 Importar Arquivo] │
├─────────────────────────────────────────────┤
│ Cliente: [Dropdown ▼]                       │
│ Consultor: [Dropdown ▼]                     │
│ Mês: [Janeiro ▼]                            │
│                                             │
│ Atividades:                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ [Digite aqui...]                        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 📊 Níveis de Risco: [Legenda]               │
│                                             │
│                   [✅ Processar Relatório]  │
└─────────────────────────────────────────────┘
```

### **Tela Consultar:**

```
┌─────────────────────────────────────────────┐
│ 🔍 Consultar Relatórios de Atividades       │
├─────────────────────────────────────────────┤
│ [Ano ▼] [Cliente ▼] [Consultor ▼] [Mês ▼]  │
├─────────────────────────────────────────────┤
│ [50 Total] [5 🔴] [10 🟠] [15 🟡] [20 🟢]   │
├─────────────────────────────────────────────┤
│ Consultor  │ Jan│Fev│Mar│...│Dez           │
│ João Silva │ 🔴 │🟡 │🟢 │...│⚪            │
│ Ana Costa  │ 🟢 │🟢 │🟢 │...│🟢            │
└─────────────────────────────────────────────┘
```

### **Tela Exportar:**

```
┌─────────────────────────────────────────────┐
│ 📥 Exportar Relatórios de Atividades        │
├─────────────────────────────────────────────┤
│ Ano: [2025 ▼]  Cliente: [Todos ▼]          │
├─────────────────────────────────────────────┤
│ [50 Total] [5 🔴] [10 🟠] [15 🟡] [20 🟢]   │
├─────────────────────────────────────────────┤
│ Formato:                                    │
│ [📊 CSV] [📄 TXT] [🔧 JSON]                 │
│                                             │
│ ☑ Incluir detalhes completos                │
│                                             │
│ 📋 Será exportado: 50 consultores           │
│                                             │
│                      [📥 Exportar CSV]      │
└─────────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting:

### **Problema: Menu "ATIVIDADES" não aparece**

**Causa:** Tipo de usuário sem permissão

**Solução:**
- Fazer login como: Administrador, Gestão Comercial ou Gestão de Pessoas
- Outros tipos (Consulta, Cliente, Analista R&S) não têm acesso

---

### **Problema: Erro "AtividadesInserir is not defined"**

**Causa:** Arquivo não foi copiado ou import está errado

**Solução:**
1. Verificar se pasta `components/atividades/` existe
2. Verificar se arquivos `.tsx` estão dentro
3. Verificar import no `App.tsx`:
   ```typescript
   import AtividadesInserir from './components/atividades/AtividadesInserir';
   ```

---

### **Problema: Dropdown de Consultor vazio**

**Causa:** Cliente selecionado não tem consultores ativos

**Solução:**
- Selecionar outro cliente
- Verificar se cliente tem gestores cadastrados
- Verificar se gestores têm consultores ativos

---

### **Problema: Upload não funciona**

**Causa:** Formato do arquivo incorreto

**Solução:**
1. Baixar template de exemplo
2. Verificar separador: pipe `|` (não vírgula ou ponto-e-vírgula)
3. Verificar estrutura: `CONSULTOR|GESTOR|MÊS|ATIVIDADES`
4. Mês deve ser número (1-12), não texto

---

### **Problema: Exportação não baixa arquivo**

**Causa:** Bloqueio de popup do navegador

**Solução:**
- Permitir downloads automáticos do site
- Verificar pasta de Downloads
- Tentar outro formato (CSV → TXT)

---

## 📞 Suporte:

Se encontrar problemas:

1. ✅ Verificar logs no console (F12)
2. ✅ Consultar `DOCUMENTACAO_RELATORIOS_ATIVIDADES.md`
3. ✅ Testar com template de exemplo
4. ✅ Verificar permissões de usuário
5. ✅ Recompilar projeto (`npm run build`)

---

## 🎉 Conclusão:

Após seguir este guia, você terá:

✅ Menu lateral **ATIVIDADES** com 3 submenus
✅ Inserção manual e por arquivo
✅ Consulta com filtros e modal de detalhes
✅ Exportação em múltiplos formatos
✅ Dashboard limpo (sem upload)
✅ Sistema organizado e profissional

**Tempo total: ~10 minutos**

---

## 🔄 Comandos Git para Atualizar:

```bash
# 1. Verificar status
git status

# 2. Adicionar novos arquivos
git add components/atividades/

# 3. Adicionar arquivos modificados
git add components/ManageConsultants.tsx
git add components/ManageClients.tsx
git add components/layout/Sidebar.tsx
git add hooks/useSupabaseData.tsx
git add App.tsx
git add types.ts

# 4. Adicionar documentação
git add DOCUMENTACAO_RELATORIOS_ATIVIDADES.md
git add GUIA_INSTALACAO_RELATORIOS.md
git add GUIA_COMPLETO_MODULO_ATIVIDADES.md

# 5. Commit
git commit -m "feat: implementar módulo de Atividades com menu dedicado

- Criar menu lateral ATIVIDADES com submenus Inserir, Consultar, Exportar
- Remover Upload de Relatório do Dashboard
- Criar AtividadesInserir com modo manual e upload
- Criar AtividadesConsultar com filtros e modal de detalhes
- Criar AtividadesExportar com CSV, TXT e JSON
- Atualizar Sidebar, App.tsx e types.ts
- Limpar ManageConsultants e ManageClients
- Incluir documentação completa"

# 6. Push
git push
```

---

**Desenvolvido para RMS-RAISA** 📊
**Versão:** 2.0
**Data:** 04/12/2025
