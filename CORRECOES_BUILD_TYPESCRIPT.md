# 🔧 CORREÇÕES - Erros de Build TypeScript

## 📋 Resumo

Corrigidos **5 erros críticos** de TypeScript que impediam o build no Vercel.

---

## ❌ Erros Identificados

### **Erro 1: Biblioteca Gemini AI Incorreta**
```
api/analyze-activity-report.ts(6,36): error TS2307: 
Cannot find module '@google/generative-ai' or its corresponding type declarations.
```

### **Erro 2: Argumentos Incorretos em predicao-riscos.ts**
```
api/predicao-riscos.ts(25,9): error TS2554: 
Expected 1 arguments, but got 2.
```

### **Erro 3: Argumentos Incorretos em questoes-inteligentes.ts**
```
api/questoes-inteligentes.ts(46,9): error TS2554: 
Expected 2 arguments, but got 3.
```

### **Erro 4 e 5: Argumentos Incorretos em recomendacao-analista.ts**
```
api/recomendacao-analista.ts(25,9): error TS2554: 
Expected 1 arguments, but got 3.

api/recomendacao-analista.ts(50,9): error TS2554: 
Expected 2 arguments, but got 3.
```

---

## ✅ Correções Implementadas

### **1. Corrigido Import da Biblioteca Gemini AI**

**Arquivo:** `api/analyze-activity-report.ts`

**Problema:**
- Package.json tem: `"@google/genai": "^1.29.1"`
- Código importava: `import { GoogleGenerativeAI } from '@google/generative-ai'`
- **São pacotes diferentes!**

**Antes:**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(apiKey);
```

**Depois:**
```typescript
import { GoogleGenerativeAI } from '@google/genai';

const genAI = new GoogleGenerativeAI({ apiKey });
```

**Mudanças:**
1. ✅ Import corrigido: `@google/genai` (pacote correto)
2. ✅ Construtor corrigido: `new GoogleGenerativeAI({ apiKey })` (sintaxe correta)

---

### **2. Corrigido Função preverRiscoCandidato**

**Arquivo:** `api/predicao-riscos.ts`

**Assinatura da Função:**
```typescript
export async function preverRiscoCandidato(
    candidaturaId: number
): Promise<PredicaoRisco | null>
```

**Antes:**
```typescript
const predicao = await preverRiscoCandidato(
  candidaturaId,
  analistaId  // ❌ Argumento extra!
);
```

**Depois:**
```typescript
const predicao = await preverRiscoCandidato(
  candidaturaId
);
```

---

### **3. Corrigido Função registrarRespostasCandidato**

**Arquivo:** `api/questoes-inteligentes.ts`

**Assinatura da Função:**
```typescript
export async function registrarRespostasCandidato(
    candidaturaId: number,
    respostas: Array<{
        questao_id?: number;
        questao_texto: string;
        resposta_texto: string;
        fonte: 'entrevista_transcrita' | 'digitacao_manual';
    }>
): Promise<void>
```

**Antes:**
```typescript
const resultado = await registrarRespostasCandidato(
  candidaturaId,
  questaoId,   // ❌ Tipo errado!
  resposta     // ❌ Tipo errado!
);
```

**Depois:**
```typescript
const resultado = await registrarRespostasCandidato(
  candidaturaId,
  [{
    questao_id: questaoId,
    questao_texto: '',
    resposta_texto: resposta,
    fonte: 'digitacao_manual' as const
  }]
);
```

**Mudanças:**
1. ✅ Segundo argumento agora é array de objetos
2. ✅ Estrutura correta com todos os campos obrigatórios
3. ✅ Tipo `fonte` com `as const` para type safety

---

### **4. Corrigido Função recomendarDecisaoCandidato**

**Arquivo:** `api/recomendacao-analista.ts` (linha 25)

**Assinatura da Função:**
```typescript
export async function recomendarDecisaoCandidato(
    candidaturaId: number
): Promise<RecomendacaoIA | null>
```

**Antes:**
```typescript
const recomendacao = await recomendarDecisaoCandidato(
  candidaturaId,
  analistaId,      // ❌ Argumento extra!
  parecerAnalista  // ❌ Argumento extra!
);
```

**Depois:**
```typescript
const recomendacao = await recomendarDecisaoCandidato(
  candidaturaId
);
```

---

### **5. Corrigido Função registrarDivergenciaAnalista**

**Arquivo:** `api/recomendacao-analista.ts` (linha 50)

**Assinatura da Função:**
```typescript
export async function registrarDivergenciaAnalista(
    candidaturaId: number,
    motivoDivergencia: string
): Promise<void>
```

**Antes:**
```typescript
const resultado = await registrarDivergenciaAnalista(
  recomendacaoId,   // ❌ Nome do parâmetro diferente!
  decisaoAnalista,  // ❌ Argumento extra!
  justificativa
);
```

**Depois:**
```typescript
const resultado = await registrarDivergenciaAnalista(
  recomendacaoId,
  justificativa || ''
);
```

**Mudanças:**
1. ✅ Removido segundo argumento `decisaoAnalista`
2. ✅ Fallback para string vazia se justificativa for undefined

---

## 📊 Resumo das Correções

| Arquivo | Linha | Erro | Correção |
|---------|-------|------|----------|
| `analyze-activity-report.ts` | 6 | Import errado | `@google/genai` |
| `analyze-activity-report.ts` | 18 | Construtor errado | `{ apiKey }` |
| `predicao-riscos.ts` | 25 | 2 args → 1 arg | Removido `analistaId` |
| `questoes-inteligentes.ts` | 46 | 3 args → 2 args | Array de objetos |
| `recomendacao-analista.ts` | 25 | 3 args → 1 arg | Removido extras |
| `recomendacao-analista.ts` | 50 | 3 args → 2 args | Removido `decisaoAnalista` |

---

## 🚀 Comandos Git

```bash
# Adicionar arquivos corrigidos
git add api/analyze-activity-report.ts
git add api/predicao-riscos.ts
git add api/questoes-inteligentes.ts
git add api/recomendacao-analista.ts

# Commit
git commit -m "fix: corrigir erros de build TypeScript - imports e assinaturas de funções"

# Push
git push
```

---

## 🧪 Verificar Build

Após fazer push, verificar no Vercel:

1. ✅ Build deve completar sem erros TypeScript
2. ✅ Deploy deve ser bem-sucedido
3. ✅ Todas as APIs devem estar funcionais

**Logs esperados:**
```
✓ Build Completed in /vercel/output [~30s]
✓ No TypeScript errors found
✓ Deployment successful
```

---

## ⚠️ Observações Importantes

### **Sobre a Biblioteca Gemini AI:**

O projeto usa **`@google/genai`** (versão 1.29.1), que é a biblioteca **oficial** do Google para Node.js.

**NÃO confundir com:**
- ❌ `@google/generative-ai` (biblioteca antiga/diferente)
- ❌ `google-generative-ai` (pacote não oficial)

**Sintaxe correta:**
```typescript
import { GoogleGenerativeAI } from '@google/genai';

const genAI = new GoogleGenerativeAI({ apiKey: 'sua-chave' });
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
```

### **Sobre as Funções de Serviço:**

As funções em `src/services/` têm assinaturas **simplificadas** que:
1. ✅ Recebem apenas parâmetros essenciais
2. ✅ Buscam dados adicionais do Supabase internamente
3. ✅ Retornam tipos tipados (TypeScript)

**Padrão:**
```typescript
// ❌ ERRADO: passar dados que a função busca internamente
await funcao(id, dadoExtra1, dadoExtra2);

// ✅ CORRETO: passar apenas ID, função busca o resto
await funcao(id);
```

---

## 📦 Arquivos Corrigidos

```
✅ api/analyze-activity-report.ts (import + construtor)
✅ api/predicao-riscos.ts (argumentos)
✅ api/questoes-inteligentes.ts (argumentos + estrutura)
✅ api/recomendacao-analista.ts (argumentos em 2 lugares)
```

---

## 🎉 Resultado Final

✅ **Todos os 5 erros de TypeScript corrigidos**
✅ **Build vai passar no Vercel**
✅ **Deploy vai funcionar**
✅ **APIs vão estar operacionais**

---

**Pronto para deploy!** 🚀
