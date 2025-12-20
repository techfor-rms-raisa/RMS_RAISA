# 📁 GUIA DE IMPLEMENTAÇÃO - Bug Fix Data Relatório

## 🗂️ ESTRUTURA DE PASTAS DO SEU PROJETO

```
RMS_RAISA/
├── 📁 src/
│   ├── 📁 components/
│   │   ├── 📁 atividades/
│   │   │   ├── 📄 AtividadesInserir.tsx    ← ✅ SUBSTITUIR ESTE ARQUIVO
│   │   │   ├── 📄 AtividadesConsultar.tsx
│   │   │   └── 📄 AtividadesExportar.tsx
│   │   └── ... (outros componentes)
│   │
│   ├── 📁 hooks/
│   │   ├── 📄 useSupabaseData.ts           ← ✅ SUBSTITUIR ESTE ARQUIVO
│   │   └── 📁 supabase/
│   │       ├── 📄 useReportAnalysis.ts     ← ✅ SUBSTITUIR ESTE ARQUIVO
│   │       ├── 📄 useUsers.ts
│   │       ├── 📄 useClients.ts
│   │       ├── 📄 useCampaigns.ts
│   │       └── ... (outros hooks)
│   │
│   └── ... (outras pastas)
│
├── 📄 package.json
├── 📄 vite.config.ts
└── ... (outros arquivos)
```

---

## 📋 PASSO A PASSO DETALHADO

### PASSO 1: Abra o VS Code com seu projeto

```
No VS Code, abra a pasta: RMS_RAISA
```

---

### PASSO 2: Faça backup dos arquivos originais (IMPORTANTE!)

Abra o **Terminal** no VS Code (Ctrl + `) e execute:

```bash
# Criar pasta de backup
mkdir -p backup_20dez2025

# Copiar arquivos originais para backup
cp src/components/atividades/AtividadesInserir.tsx backup_20dez2025/
cp src/hooks/supabase/useReportAnalysis.ts backup_20dez2025/
cp src/hooks/useSupabaseData.ts backup_20dez2025/
```

---

### PASSO 3: Substitua os 3 arquivos

#### 📄 Arquivo 1: AtividadesInserir.tsx

**Caminho completo:** `src/components/atividades/AtividadesInserir.tsx`

**Como fazer no VS Code:**
1. No painel esquerdo, navegue: `src` → `components` → `atividades`
2. Clique com botão direito em `AtividadesInserir.tsx`
3. Selecione "Delete" (ou pressione Delete)
4. Baixe o arquivo `AtividadesInserir.tsx` que te enviei
5. Arraste o arquivo baixado para dentro da pasta `atividades`

---

#### 📄 Arquivo 2: useReportAnalysis.ts

**Caminho completo:** `src/hooks/supabase/useReportAnalysis.ts`

**Como fazer no VS Code:**
1. No painel esquerdo, navegue: `src` → `hooks` → `supabase`
2. Clique com botão direito em `useReportAnalysis.ts`
3. Selecione "Delete" (ou pressione Delete)
4. Baixe o arquivo `useReportAnalysis.ts` que te enviei
5. Arraste o arquivo baixado para dentro da pasta `supabase`

---

#### 📄 Arquivo 3: useSupabaseData.ts

**Caminho completo:** `src/hooks/useSupabaseData.ts`

**Como fazer no VS Code:**
1. No painel esquerdo, navegue: `src` → `hooks`
2. Clique com botão direito em `useSupabaseData.ts`
3. Selecione "Delete" (ou pressione Delete)
4. Baixe o arquivo `useSupabaseData.ts` que te enviei
5. Arraste o arquivo baixado para dentro da pasta `hooks`

---

### PASSO 4: Teste localmente

No Terminal do VS Code, execute:

```bash
npm run dev
```

Depois:
1. Abra o navegador em `http://localhost:5173` (ou a porta que aparecer)
2. Vá em **Atividades** → **Importar Arquivo**
3. Importe o PDF de relatório
4. Verifique se aparece o card verde com a data detectada

---

### PASSO 5: Comandos Git (se o teste funcionar)

Execute os comandos abaixo **um por um** no Terminal:

```bash
# 1. Ver quais arquivos foram alterados
git status
```

```bash
# 2. Adicionar os arquivos modificados
git add src/components/atividades/AtividadesInserir.tsx
git add src/hooks/supabase/useReportAnalysis.ts
git add src/hooks/useSupabaseData.ts
```

```bash
# 3. Criar o commit com mensagem descritiva
git commit -m "fix: correção da extração de data do relatório de atividades

Problema: A data do PDF não era extraída, usando mês atual incorretamente
Solução: 
- Função extractDateFromReport() com 6 padrões de regex
- Card visual mostrando data detectada
- Opção de correção manual
- Parâmetros extractedMonth/extractedYear passados para API"
```

```bash
# 4. Enviar para o GitHub
git push origin main
```

---

## ✅ CHECKLIST FINAL

- [ ] Backup criado na pasta `backup_20dez2025`
- [ ] Arquivo `AtividadesInserir.tsx` substituído em `src/components/atividades/`
- [ ] Arquivo `useReportAnalysis.ts` substituído em `src/hooks/supabase/`
- [ ] Arquivo `useSupabaseData.ts` substituído em `src/hooks/`
- [ ] Teste local executado com `npm run dev`
- [ ] Card verde aparece com data detectada ao importar PDF
- [ ] Commit feito com `git commit`
- [ ] Push feito com `git push origin main`

---

## 🆘 SE ALGO DER ERRADO

### Restaurar arquivos do backup:

```bash
# Restaurar AtividadesInserir.tsx
cp backup_20dez2025/AtividadesInserir.tsx src/components/atividades/

# Restaurar useReportAnalysis.ts
cp backup_20dez2025/useReportAnalysis.ts src/hooks/supabase/

# Restaurar useSupabaseData.ts
cp backup_20dez2025/useSupabaseData.ts src/hooks/
```

### Desfazer último commit (se já fez commit mas não fez push):

```bash
git reset --soft HEAD~1
```

---

## 📞 RESUMO DOS CAMINHOS

| Arquivo | Caminho Completo |
|---------|------------------|
| AtividadesInserir.tsx | `src/components/atividades/AtividadesInserir.tsx` |
| useReportAnalysis.ts | `src/hooks/supabase/useReportAnalysis.ts` |
| useSupabaseData.ts | `src/hooks/useSupabaseData.ts` |

