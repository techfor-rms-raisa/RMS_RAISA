# 🤖 Implementação: Análise de CV com IA

## Resumo da Implementação

Data: 06/01/2026
Versão: 1.0

---

## 📁 Arquivos Criados

### 1. Hook: `useCandidaturaAnaliseIA.ts`
**Caminho:** `src/hooks/supabase/useCandidaturaAnaliseIA.ts`

**Funcionalidades:**
- `carregarAnalise(candidaturaId)` - Busca análise existente no banco
- `analisarCV(candidatura, vaga, userId)` - Executa nova análise com IA
- `registrarFeedback(analiseId, util, texto, userId)` - Registra feedback
- `registrarResultadoReal(analiseId, resultado)` - Para métricas de acurácia

**Tipos exportados:**
- `AnaliseCV` - Interface completa da análise
- `FatorRisco` - Fator de risco identificado
- `SkillsMatch` - Match de skills com a vaga

---

### 2. Componente: `AnaliseCVPanel.tsx`
**Caminho:** `src/components/raisa/AnaliseCVPanel.tsx`

**Estados renderizados:**
- Sem currículo disponível
- Carregando análise
- Erro na análise
- Sem análise (botão para analisar)
- Análise completa com:
  - Score de compatibilidade
  - Risco de reprovação
  - Recomendação da IA
  - Fatores de risco
  - Pontos fortes
  - Pontos de atenção
  - Skills match
  - Perguntas sugeridas para entrevista
  - Feedback do usuário

---

## 📝 Arquivos Modificados

### 1. Backend: `api/gemini-analyze.ts`
**Modificações:**
- Nova action: `analisar_cv_candidatura`
- Nova função: `analisarCVCandidatura(payload)`
  - Recebe: curriculo_texto, dados da vaga, dados do candidato
  - Retorna: análise estruturada em JSON

### 2. Modal: `DetalhesCandidaturaModal.tsx`
**Modificações:**
- Import do hook `useCandidaturaAnaliseIA`
- Import do componente `AnaliseCVPanel`
- Novos estados para análise de CV
- Handler `handleAnalisarCV()`
- Handler `handleFeedbackAnalise()`
- Componente `AnaliseCVPanel` adicionado na aba "Detalhes"

### 3. Index de Hooks: `src/hooks/supabase/index.ts`
**Modificações:**
- Exportação do hook `useCandidaturaAnaliseIA`
- Exportação dos tipos `AnaliseCV`, `FatorRisco`, `SkillsMatch`

---

## 🗄️ Tabela SQL (já criada)

**Tabela:** `ia_recomendacoes_candidato`

**Colunas principais:**
- `candidatura_id` - FK para candidaturas
- `vaga_id` - FK para vagas
- `candidato_id` - FK para pessoas
- `tipo_recomendacao` - 'analise_cv', 'predicao_risco', etc.
- `recomendacao` - 'aprovar', 'entrevistar', 'revisar', 'rejeitar'
- `score_confianca` - 0-100
- `score_compatibilidade` - 0-100
- `risco_reprovacao` - 0-100
- `justificativa` - Texto
- `analise_detalhada` - JSONB com detalhes
- `cv_texto_analisado` - Texto do CV
- `modelo_ia` - 'Gemini 2.0 Flash'
- `feedback_util` - Boolean
- `resultado_real` - Para métricas

---

## 🔄 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DetalhesCandidaturaModal                        │
│                                                                     │
│  1. Usuário abre modal da candidatura                               │
│  2. Hook carrega análise existente (se houver)                      │
│  3. Se não houver análise, exibe botão "Analisar CV com IA"         │
│                                                                     │
│  4. Usuário clica em "Analisar CV com IA"                           │
│     │                                                               │
│     ▼                                                               │
│  5. Hook envia para API:                                            │
│     - curriculo_texto (da candidatura)                              │
│     - dados da vaga (requisitos, skills, senioridade)               │
│     - dados do candidato (nome, email)                              │
│                                                                     │
│     │                                                               │
│     ▼                                                               │
│  6. Backend (gemini-analyze.ts):                                    │
│     - Monta prompt detalhado                                        │
│     - Chama Gemini 2.0 Flash                                        │
│     - Parseia resposta JSON                                         │
│     - Retorna análise estruturada                                   │
│                                                                     │
│     │                                                               │
│     ▼                                                               │
│  7. Hook salva análise na tabela:                                   │
│     - ia_recomendacoes_candidato                                    │
│                                                                     │
│     │                                                               │
│     ▼                                                               │
│  8. AnaliseCVPanel exibe resultados:                                │
│     - Score de compatibilidade                                      │
│     - Risco de reprovação                                           │
│     - Recomendação (aprovar/entrevistar/revisar/rejeitar)           │
│     - Fatores de risco                                              │
│     - Pontos fortes/atenção                                         │
│     - Skills match                                                  │
│     - Perguntas para entrevista                                     │
│                                                                     │
│  9. Usuário dá feedback (útil/não útil)                             │
│     - Salvo para métricas                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Análise da IA Retorna

```json
{
  "score_compatibilidade": 75,
  "risco_reprovacao": 25,
  "nivel_risco": "Baixo",
  "recomendacao": "entrevistar",
  "justificativa": "Candidato possui boa experiência...",
  "fatores_risco": [
    {
      "tipo": "gap_emprego",
      "nivel": "medium",
      "descricao": "Gap de 8 meses entre 2022-2023",
      "evidencia": "Último emprego encerrou em março/2022..."
    }
  ],
  "pontos_fortes": [
    "5 anos de experiência com React",
    "Trabalhou em projetos de grande escala"
  ],
  "pontos_atencao": [
    "Verificar motivo do gap de emprego",
    "Confirmar nível de inglês"
  ],
  "skills_match": {
    "atendidas": ["React", "Node.js", "TypeScript"],
    "parciais": ["AWS - certificação mas pouca prática"],
    "faltantes": ["Kubernetes", "GraphQL"]
  },
  "perguntas_entrevista": [
    "Qual foi o motivo da saída da empresa X?",
    "Pode detalhar sua experiência com AWS em produção?"
  ],
  "confianca_analise": 85
}
```

---

## ✅ Checklist de Deploy

### Arquivos para commitar:

```bash
git add src/hooks/supabase/useCandidaturaAnaliseIA.ts
git add src/hooks/supabase/index.ts
git add src/components/raisa/AnaliseCVPanel.tsx
git add src/components/raisa/DetalhesCandidaturaModal.tsx
git add api/gemini-analyze.ts
```

### Commit:

```bash
git commit -m "feat: Análise de CV com IA no modal de candidatura

- Novo hook useCandidaturaAnaliseIA
- Novo componente AnaliseCVPanel
- Nova action analisar_cv_candidatura no backend
- Integração no DetalhesCandidaturaModal
- Score de compatibilidade, riscos, skills match
- Feedback do usuário para métricas"
```

### Push:

```bash
git push origin main
```

---

## 🧪 Testes Recomendados

1. **Abrir modal de candidatura** com curriculo_texto preenchido
2. **Clicar em "Analisar CV com IA"**
3. **Verificar exibição dos resultados**
4. **Dar feedback (útil/não útil)**
5. **Fechar e reabrir modal** - deve carregar análise existente
6. **Testar "Reanalisar"** - deve criar nova análise

---

## 📋 Pré-requisitos

- ✅ Tabela `ia_recomendacoes_candidato` criada
- ✅ Candidatura com `curriculo_texto` preenchido
- ✅ Vaga com requisitos/stack preenchidos
- ✅ API_KEY do Gemini configurada no Vercel
