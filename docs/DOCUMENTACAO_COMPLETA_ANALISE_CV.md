# 🤖 Implementação Completa: Análise de CV com IA

## Data: 06/01/2026

---

## 📋 Resumo das Duas Rotinas

### 1️⃣ **Candidaturas** (Menu: Candidaturas)
- Análise de CV **contextualizada** com a vaga específica
- Score de compatibilidade candidato x vaga
- Salva análise no banco vinculada à candidatura
- Registra resultado real quando status final é atingido

### 2️⃣ **Análise de Currículo (AI)** (Menu: Análise de Currículo (AI))
- **ABA 1 - Triagem de CVs:** Upload de PDF/DOC + análise genérica + salvar no banco de talentos
- **ABA 2 - Candidaturas em Risco:** Lista candidaturas com risco alto (dados reais)
- **ABA 3 - Métricas de Acurácia:** Taxa de acerto da IA (dados reais)

---

## 🔄 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DE DADOS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐         ┌─────────────────────────────────────┐   │
│  │  ANÁLISE DE CV (AI) │         │         CANDIDATURAS                │   │
│  │    (Triagem)        │         │      (Modal de Detalhes)            │   │
│  ├─────────────────────┤         ├─────────────────────────────────────┤   │
│  │                     │         │                                     │   │
│  │  1. Upload PDF/DOC  │         │  1. Usuário abre candidatura        │   │
│  │  2. Extrai texto    │         │  2. Clica "Analisar CV com IA"      │   │
│  │  3. Analisa (genérico)        │  3. Analisa (contextualizado)       │   │
│  │  4. Score >= 50?    │         │                                     │   │
│  │     ↓               │         │     ↓                               │   │
│  │  [Salvar Banco]     │         │  Salva em:                          │   │
│  │     ↓               │         │  ia_recomendacoes_candidato         │   │
│  │  Tabela: pessoas    │         │  (com vínculo à candidatura)        │   │
│  │                     │         │                                     │   │
│  └─────────────────────┘         └─────────────────────────────────────┘   │
│                                              │                              │
│                                              ▼                              │
│                                  ┌───────────────────────┐                  │
│                                  │ Status Final Atingido │                  │
│                                  │ (contratado/reprovado)│                  │
│                                  └───────────────────────┘                  │
│                                              │                              │
│                                              ▼                              │
│                                  ┌───────────────────────┐                  │
│                                  │ Atualiza resultado_real│                 │
│                                  │ + predicao_correta     │                 │
│                                  └───────────────────────┘                  │
│                                              │                              │
│                                              ▼                              │
│                         ┌────────────────────┴────────────────────┐        │
│                         │                                         │        │
│                         ▼                                         ▼        │
│            ┌─────────────────────────┐          ┌─────────────────────────┐│
│            │  ABA 2: Candidaturas    │          │  ABA 3: Métricas de     ││
│            │  em Risco               │          │  Acurácia               ││
│            │                         │          │                         ││
│            │  Busca análises com     │          │  Calcula taxa de acerto ││
│            │  risco_reprovacao >= 50 │          │  baseado em predicao_   ││
│            │  + status em processo   │          │  correta                ││
│            └─────────────────────────┘          └─────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Arquivos Modificados/Criados

### 1. `AnaliseRisco.tsx` (REFATORADO)
**Caminho:** `src/components/raisa/AnaliseRisco.tsx`

**Mudanças:**
- ❌ Removido: textarea para colar texto
- ✅ Adicionado: Upload de PDF/DOC
- ✅ Adicionado: Extração automática de texto
- ✅ Adicionado: Botão "Salvar no Banco de Talentos"
- ✅ Adicionado: Aba 2 busca dados reais de `ia_recomendacoes_candidato`
- ✅ Adicionado: Aba 3 calcula métricas de acurácia reais

### 2. `DetalhesCandidaturaModal.tsx` (ATUALIZADO)
**Caminho:** `src/components/raisa/DetalhesCandidaturaModal.tsx`

**Mudanças:**
- ✅ Adicionado: `AnaliseCVPanel` na aba de detalhes
- ✅ Adicionado: Hook `useCandidaturaAnaliseIA`
- ✅ Adicionado: Função `registrarResultadoRealAnalise()`
- ✅ Adicionado: Trigger para atualizar `resultado_real` quando status final

### 3. `gemini-analyze.ts` (ATUALIZADO)
**Caminho:** `api/gemini-analyze.ts`

**Novas Actions:**
- `analisar_cv_candidatura` - Análise com contexto de vaga
- `triagem_cv_generica` - Análise genérica (sem vaga)

### 4. `AnaliseCVPanel.tsx` (NOVO)
**Caminho:** `src/components/raisa/AnaliseCVPanel.tsx`

**Funcionalidade:**
- Componente para exibir análise de CV no modal

### 5. `useCandidaturaAnaliseIA.ts` (NOVO)
**Caminho:** `src/hooks/supabase/useCandidaturaAnaliseIA.ts`

**Funcionalidade:**
- Hook para gerenciar análise de CV

### 6. `hooks_index.ts` (ATUALIZADO)
**Caminho:** `src/hooks/supabase/index.ts`

**Mudanças:**
- Exportação do novo hook

---

## 🗄️ Tabela: ia_recomendacoes_candidato

```sql
-- Campos principais utilizados:
id                    -- PK
candidatura_id        -- FK para candidaturas
vaga_id               -- FK para vagas
candidato_id          -- FK para pessoas
tipo_recomendacao     -- 'analise_cv'
recomendacao          -- 'aprovar', 'entrevistar', 'revisar', 'rejeitar'
score_confianca       -- 0-100
score_compatibilidade -- 0-100 (match candidato x vaga)
risco_reprovacao      -- 0-100
justificativa         -- Texto explicativo
analise_detalhada     -- JSONB com detalhes
cv_texto_analisado    -- Texto do CV
modelo_ia             -- 'Gemini 2.0 Flash'

-- Campos para métricas (preenchidos quando status final):
resultado_real        -- 'contratado', 'reprovado', etc.
predicao_correta      -- true/false (IA acertou?)

-- Feedback do usuário:
feedback_util         -- true/false
feedback_texto        -- Comentário
```

---

## 🎯 Como Funciona Cada Aba

### **ABA 1: Triagem de CVs**

1. Usuário faz **upload de PDF ou DOC**
2. Sistema **extrai texto** automaticamente (Gemini)
3. Usuário clica **"Analisar Currículo"**
4. IA retorna:
   - Score geral (0-100)
   - Nível de risco
   - Fatores de risco
   - Skills detectadas
   - Senioridade estimada
   - Recomendação: salvar/analisar mais/descartar
5. Se score >= 50, botão **"Salvar no Banco de Talentos"**
6. Salva na tabela `pessoas` com skills

### **ABA 2: Candidaturas em Risco**

1. Busca análises de `ia_recomendacoes_candidato`:
   - `tipo_recomendacao = 'analise_cv'`
   - `risco_reprovacao >= 50`
   - Status em processo (triagem, entrevista, etc.)
2. Exibe lista com:
   - Nome do candidato
   - Título da vaga
   - Percentual de risco
   - Recomendação da IA
   - Data da análise

### **ABA 3: Métricas de Acurácia**

1. Busca análises com `resultado_real IS NOT NULL`
2. Calcula:
   - Total de análises
   - Quantidade com resultado final
   - Predições corretas
   - Taxa de acerto (%)
3. Agrupa por tipo de recomendação
4. Exibe detalhamento

---

## 🔧 Trigger de Resultado Real

Quando o status de uma candidatura muda para **status final**, o sistema:

```typescript
const statusFinais = ['contratado', 'reprovado', 'reprovado_cliente', 'aprovado_cliente', 'desistencia'];

if (statusFinais.includes(novoStatus)) {
  // 1. Busca análise mais recente
  // 2. Determina se predição foi correta
  // 3. Atualiza resultado_real e predicao_correta
}
```

**Lógica de verificação:**
- Resultados positivos: `contratado`, `aprovado_cliente`
- Resultados negativos: `reprovado`, `reprovado_cliente`, `desistencia`
- IA recomendou positivo: `aprovar`, `entrevistar`
- IA recomendou negativo: `revisar`, `rejeitar`

Predição correta = (resultado positivo E IA recomendou positivo) OU (resultado negativo E IA recomendou negativo)

---

## 🚀 Comandos para Deploy

```powershell
# Adicionar arquivos
git add src/components/raisa/AnaliseRisco.tsx
git add src/components/raisa/AnaliseCVPanel.tsx
git add src/components/raisa/DetalhesCandidaturaModal.tsx
git add src/hooks/supabase/useCandidaturaAnaliseIA.ts
git add src/hooks/supabase/index.ts
git add api/gemini-analyze.ts

# Commit
git commit -m "feat: Refatoração completa Análise de CV com IA

- AnaliseRisco: Upload PDF/DOC + salvar banco de talentos
- Alertas: Dados reais de ia_recomendacoes_candidato
- Métricas: Cálculo de acurácia com resultado_real
- Modal Candidatura: Análise contextualizada
- Trigger: resultado_real quando status final"

# Push
git push origin main
```

---

## ✅ Checklist

| Item | Status |
|------|--------|
| Tabela `ia_recomendacoes_candidato` criada | ✅ |
| Tabela `pessoas` tem campos necessários | ⚠️ Verificar: `curriculo_texto`, `origem` |
| Upload de PDF/DOC funcionando | ✅ |
| Extração de texto com Gemini | ✅ |
| Análise genérica (triagem) | ✅ |
| Salvar no banco de talentos | ✅ |
| Análise contextualizada (modal) | ✅ |
| Alertas com dados reais | ✅ |
| Métricas de acurácia | ✅ |
| Trigger de resultado_real | ✅ |

---

## ⚠️ Verificar no Banco

A tabela `pessoas` já possui os campos necessários:
- `cv_texto_original` ✅ (texto do CV)
- `cv_texto_completo` ✅
- `cv_resumo` ✅
- `cv_processado` ✅
- `cv_processado_em` ✅
- `cv_processado_por` ✅

**Nenhum SQL adicional necessário para a tabela `pessoas`!**

A tabela `candidaturas` também já possui:
- `curriculo_texto` ✅ (usado na análise contextualizada)
