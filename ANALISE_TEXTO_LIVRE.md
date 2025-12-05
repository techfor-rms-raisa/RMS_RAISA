# 🤖 Análise de Relatórios com Texto Livre - IA Gemini

## 🎯 **O que foi implementado:**

Sistema de análise inteligente de relatórios de atividades que **identifica automaticamente** consultores e analisa riscos a partir de **texto livre**, sem necessidade de formatação estruturada.

---

## ✨ **Funcionalidades:**

### **1. Identificação Automática:**
- ✅ **Nome do Consultor** - Extraído do cabeçalho `◆ Nome | Cliente`
- ✅ **Cliente** - Identificado automaticamente
- ✅ **Gestor** - Obtido do contexto ou banco de dados
- ✅ **Mês** - Extraído do período do relatório

### **2. Análise de Risco Inteligente:**
- ✅ **Score 1-5** baseado no tom e conteúdo
- ✅ **Padrões negativos** identificados
- ✅ **Alertas preditivos** de risco de saída
- ✅ **Recomendações** de ação

### **3. Processamento em Lote:**
- ✅ **Upload de PDF/TXT** com múltiplos consultores
- ✅ **IA distribui** automaticamente para cada consultor
- ✅ **Atualização em massa** dos scores

---

## 📋 **Formato do Relatório:**

### **Entrada (Texto Livre):**

```
Relatório de Atividades – Período de 03.11.2025 a 07.11.2025

◆ João Silva | AUTO AVALIAR
Está bastante satisfeito com a equipe e o ambiente do projeto. 
Comentou que o time é colaborativo, com uma boa sintonia entre 
todos, o que contribui para um clima de trabalho leve e produtivo...

◆ Pedro Oliveira | AUTO AVALIAR
O CAC me acionou solicitando apoio com o Consultor, pois ele estava 
com o preenchimento da planilha em atraso impactando o envio das 
aprovações ao cliente. Vamos monitorar...

◆ Lucas Ferreira | TECH SOLUTIONS
O Consultor me acionou para informar que recebeu proposta de mercado 
mais alinhada ao seu perfil... Último dia no projeto foi em 04/12/25.
```

### **Saída (Análise Automática):**

```json
{
  "results": [
    {
      "consultantName": "João Silva",
      "clientName": "AUTO AVALIAR",
      "riskScore": 1,
      "summary": "EXCELENTE: Consultor altamente engajado e produtivo",
      "negativePattern": "Nenhum",
      "predictiveAlert": "MANTER: Consultor em situação ideal",
      "recommendations": "Reconhecer bom desempenho e manter ambiente positivo"
    },
    {
      "consultantName": "Pedro Oliveira",
      "clientName": "AUTO AVALIAR",
      "riskScore": 3,
      "summary": "ATENÇÃO: Consultor apresenta problemas operacionais",
      "negativePattern": "Atrasos em entregas",
      "predictiveAlert": "MONITORAR: Acompanhamento próximo necessário",
      "recommendations": "Reunião de alinhamento e plano de ação corretivo"
    },
    {
      "consultantName": "Lucas Ferreira",
      "clientName": "TECH SOLUTIONS",
      "riskScore": 5,
      "summary": "CRÍTICO: Consultor em processo de saída",
      "negativePattern": "Saída confirmada",
      "predictiveAlert": "AÇÃO IMEDIATA: Iniciar processo de substituição",
      "recommendations": "Agilizar contratação de substituto"
    }
  ]
}
```

---

## 🔢 **Escala de Risco:**

### **🟢 Score 1 - Muito Baixo:**
**Indicadores:** "satisfeito", "excelente", "positiva", "colaborativo", "boa sintonia", "entregando bem", "motivado"

**Ação:** Manter ambiente positivo

---

### **🟡 Score 2 - Baixo:**
**Indicadores:** "apesar", "desafiador", "cobranças", "métricas exigentes", "adaptação"

**Ação:** Acompanhamento regular

---

### **🟠 Score 3 - Médio:**
**Indicadores:** "atraso", "impactando", "problemas", "ausente", "sem justificativa", "vamos monitorar"

**Ação:** Reunião de alinhamento e plano de ação

---

### **🔴 Score 4 - Alto:**
**Indicadores:** "insatisfeito", "desmotivado", "buscando oportunidades", "proposta"

**Ação:** Conversa individual urgente

---

### **⚫ Score 5 - Crítico:**
**Indicadores:** "rescisão", "saída", "último dia", "proposta de mercado aceita", "não faria mais sentido"

**Ação:** Iniciar processo de substituição imediata

---

## 📦 **Arquivos Modificados:**

### **1. hooks/useSupabaseData.ts**
**Mudanças:**
- ✅ Função `processReportAnalysis` reescrita para usar Gemini AI
- ✅ Fallback local com regex para identificar `◆ Nome | Cliente`
- ✅ Análise de risco baseada em palavras-chave
- ✅ Suporte a parâmetro `gestorName`

**Funções adicionadas:**
- `processReportAnalysisLocal()` - Análise local sem IA
- `analyzeRiskFromActivities()` - Análise de palavras-chave
- `generateAnalysis()` - Geração de resumos e recomendações

---

### **2. api/analyze-activity-report.ts** ⭐ NOVO
**Funcionalidade:**
- ✅ Endpoint `/api/analyze-activity-report`
- ✅ Usa Gemini 2.0 Flash Exp
- ✅ Prompt especializado em análise de relatórios
- ✅ Identifica múltiplos consultores automaticamente
- ✅ Extrai mês do período
- ✅ Analisa tom e contexto do texto

**Request:**
```json
POST /api/analyze-activity-report
{
  "reportText": "◆ João Silva | AUTO AVALIAR\n...",
  "gestorName": "Priscila do Espírito Santo"
}
```

**Response:**
```json
{
  "results": [
    {
      "consultantName": "João Silva",
      "clientName": "AUTO AVALIAR",
      "managerName": "Priscila do Espírito Santo",
      "reportMonth": 11,
      "riskScore": 1,
      "summary": "...",
      "negativePattern": "...",
      "predictiveAlert": "...",
      "recommendations": "...",
      "details": "..."
    }
  ]
}
```

---

### **3. components/atividades/AtividadesInserir.tsx**
**Mudanças:**
- ✅ Modo manual gera formato `◆ Nome | Cliente\nTexto livre`
- ✅ Template atualizado com exemplos reais
- ✅ Suporte a `gestorName` na função `onManualReport`

**Antes:**
```
CONSULTOR | GESTOR | MÊS | ATIVIDADES
João Silva | Maria Santos | 1 | Entregou todas as tarefas...
```

**Depois:**
```
◆ João Silva | AUTO AVALIAR
Está bastante satisfeito com a equipe e o ambiente do projeto...
```

---

## 🚀 **Como Usar:**

### **Modo 1: Digitação Manual**

1. Acesse **ATIVIDADES → Inserir**
2. Clique em **"✍️ Digitação Manual"**
3. Selecione **Cliente** (dropdown)
4. Selecione **Consultor** (filtrado automaticamente)
5. Digite o texto livre das atividades
6. Clique em **"Enviar Relatório"**

**A IA vai:**
- Identificar o consultor
- Analisar o risco
- Atualizar o score automaticamente

---

### **Modo 2: Upload de Arquivo**

1. Acesse **ATIVIDADES → Inserir**
2. Clique em **"📤 Importar Arquivo"**
3. Clique em **"Baixar Template de Exemplo"** (opcional)
4. Prepare seu arquivo TXT ou PDF com o formato:
   ```
   ◆ Consultor 1 | Cliente 1
   Texto livre...
   
   ◆ Consultor 2 | Cliente 2
   Texto livre...
   ```
5. Faça upload do arquivo
6. Clique em **"Processar Relatórios"**

**A IA vai:**
- Identificar TODOS os consultores
- Analisar risco de cada um
- Atualizar scores em lote

---

## 🔧 **Instalação:**

### **Passo 1: Substituir Arquivos**

Copiar e substituir:
```
hooks/useSupabaseData.ts
components/atividades/AtividadesInserir.tsx
```

### **Passo 2: Adicionar Novo Arquivo**

Criar:
```
api/analyze-activity-report.ts
```

### **Passo 3: Configurar Variável de Ambiente**

No Vercel, adicionar:
```
GEMINI_API_KEY=sua_chave_aqui
```

### **Passo 4: Instalar Dependência**

```bash
npm install @google/generative-ai
```

### **Passo 5: Commit e Push**

```bash
git add hooks/useSupabaseData.ts
git add components/atividades/AtividadesInserir.tsx
git add api/analyze-activity-report.ts
git commit -m "feat: análise de relatórios com texto livre usando Gemini AI"
git push
```

---

## 🧪 **Testar:**

### **Teste 1: Texto Positivo**

```
◆ João Silva | AUTO AVALIAR
Está bastante satisfeito com a equipe e o ambiente do projeto. 
Comentou que o time é colaborativo, com uma boa sintonia entre todos.
```

**Resultado esperado:** Score 1 (Muito Baixo)

---

### **Teste 2: Texto com Alerta**

```
◆ Pedro Oliveira | AUTO AVALIAR
O CAC me acionou solicitando apoio com o Consultor, pois ele estava 
com o preenchimento da planilha em atraso impactando o envio das 
aprovações ao cliente. Vamos monitorar.
```

**Resultado esperado:** Score 3 (Médio)

---

### **Teste 3: Texto Crítico**

```
◆ Lucas Ferreira | TECH SOLUTIONS
O Consultor me acionou para informar que recebeu proposta de mercado 
mais alinhada ao seu perfil. Último dia no projeto foi em 04/12/25.
```

**Resultado esperado:** Score 5 (Crítico)

---

## 🐛 **Troubleshooting:**

### **Erro: "Erro na API"**
**Causa:** GEMINI_API_KEY não configurada
**Solução:** Adicionar variável de ambiente no Vercel

### **Erro: "Resposta da IA não contém JSON válido"**
**Causa:** Prompt retornou texto ao invés de JSON
**Solução:** Sistema usa fallback local automaticamente

### **Consultores não identificados**
**Causa:** Formato do texto incorreto
**Solução:** Verificar se usa `◆ Nome | Cliente` no início de cada entrada

---

## 📊 **Vantagens:**

✅ **Texto livre** - Gestora escreve naturalmente
✅ **Identificação automática** - IA encontra consultores
✅ **Análise contextual** - Entende o tom, não apenas palavras
✅ **Processamento em lote** - Múltiplos consultores de uma vez
✅ **Fallback local** - Funciona mesmo se API falhar
✅ **Template real** - Baseado em relatórios reais da empresa

---

## 🎉 **Resultado:**

Sistema funciona **exatamente como testado no Google AI Studio**:

1. ✅ Gestora cola o texto livre
2. ✅ IA identifica consultores automaticamente
3. ✅ IA analisa riscos pelo contexto
4. ✅ Scores atualizados no banco
5. ✅ Dashboard reflete mudanças

**Sem necessidade de formatação estruturada!** 🚀

---

**Desenvolvido para RMS-RAISA**
**Data:** 04/12/2025
**Versão:** 1.0 - Análise com Texto Livre
