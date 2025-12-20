# 📁 GUIA DE IMPLEMENTAÇÃO ATUALIZADO - Bug Fix Data Relatório

## 🔴 PROBLEMA ENCONTRADO

O mês extraído do PDF (ex: Junho = 6) não chegava até o Supabase porque a função `handleManualAnalysis` no `App.tsx` **não recebia nem passava** os parâmetros `extractedMonth` e `extractedYear`.

---

## 🗂️ ESTRUTURA - ONDE COLOCAR CADA ARQUIVO

```
RMS_RAISA/
└── src/
    ├── 📄 App.tsx                          ← ARQUIVO 1 (NOVO!)
    │
    ├── components/
    │   └── atividades/
    │       └── 📄 AtividadesInserir.tsx    ← ARQUIVO 2
    │
    └── hooks/
        ├── 📄 useSupabaseData.ts           ← ARQUIVO 3
        └── supabase/
            └── 📄 useReportAnalysis.ts     ← ARQUIVO 4
```

---

## 📋 PASSO A PASSO

### PASSO 1: Abra o Terminal no VS Code (Ctrl + `)

### PASSO 2: Faça BACKUP dos arquivos originais

```bash
mkdir -p backup_20dez2025

cp src/App.tsx backup_20dez2025/
cp src/components/atividades/AtividadesInserir.tsx backup_20dez2025/
cp src/hooks/useSupabaseData.ts backup_20dez2025/
cp src/hooks/supabase/useReportAnalysis.ts backup_20dez2025/
```

### PASSO 3: Substitua os 4 arquivos

| Arquivo baixado | Colar em |
|-----------------|----------|
| `App.tsx` | `src/App.tsx` |
| `AtividadesInserir.tsx` | `src/components/atividades/AtividadesInserir.tsx` |
| `useSupabaseData.ts` | `src/hooks/useSupabaseData.ts` |
| `useReportAnalysis.ts` | `src/hooks/supabase/useReportAnalysis.ts` |

### PASSO 4: Teste localmente

```bash
npm run dev
```

1. Abra o navegador
2. Vá em **Atividades** → **Importar Arquivo**
3. Importe o PDF de Junho (02.06.2025 a 06.06.2025)
4. Verifique no Console (F12) se aparece:
   - `📅 Mês extraído recebido no App.tsx: 6`
   - `📅 Ano extraído recebido no App.tsx: 2025`
5. Após processar, verifique no Supabase se o mês está como **6** (não 12)

### PASSO 5: Se funcionou, faça o COMMIT

```bash
git add src/App.tsx
git add src/components/atividades/AtividadesInserir.tsx
git add src/hooks/useSupabaseData.ts
git add src/hooks/supabase/useReportAnalysis.ts

git commit -m "fix: correção completa da extração de data do relatório

Bug: A data do PDF não era passada para o Supabase (sempre usava mês 12)

Correções:
1. AtividadesInserir.tsx: Extrai data do PDF com 6 padrões de regex
2. App.tsx: handleManualAnalysis agora recebe/passa extractedMonth/Year
3. useSupabaseData.ts: Wrapper passa parâmetros para hook
4. useReportAnalysis.ts: processReportAnalysis usa mês extraído

Testado com PDF de Junho/2025 - agora salva corretamente mês 6"

git push origin main
```

---

## 🆘 SE ALGO DER ERRADO - RESTAURAR BACKUP

```bash
cp backup_20dez2025/App.tsx src/
cp backup_20dez2025/AtividadesInserir.tsx src/components/atividades/
cp backup_20dez2025/useSupabaseData.ts src/hooks/
cp backup_20dez2025/useReportAnalysis.ts src/hooks/supabase/
```

---

## ✅ CHECKLIST

- [ ] Backup criado
- [ ] `App.tsx` substituído em `src/`
- [ ] `AtividadesInserir.tsx` substituído em `src/components/atividades/`
- [ ] `useSupabaseData.ts` substituído em `src/hooks/`
- [ ] `useReportAnalysis.ts` substituído em `src/hooks/supabase/`
- [ ] Teste local com `npm run dev`
- [ ] Console mostra "Mês extraído recebido no App.tsx: 6"
- [ ] Supabase salva com mês correto
- [ ] Git commit e push feitos

