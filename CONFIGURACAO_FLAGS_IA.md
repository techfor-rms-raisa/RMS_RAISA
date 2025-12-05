# 🎛️ GUIA: CONFIGURAÇÃO DE FLAGS DE IA

## 🎯 VISÃO GERAL

Este documento explica como **ativar/desativar funcionalidades de IA gradualmente** no ORBIT.AI, permitindo acumular histórico orgânico antes de usar predições.

---

## 📊 FLAGS DISPONÍVEIS

| Flag | Funcionalidade | Padrão | Quando Ativar |
|------|----------------|--------|---------------|
| `ENABLE_AI_QUESTIONS` | Questões Inteligentes | ✅ `true` | Desde o início |
| `ENABLE_AI_CANDIDATE_RECOMMENDATION` | Recomendação de Candidato | ✅ `true` | Desde o início |
| `ENABLE_AI_RED_FLAGS` | Red Flags Automáticos | ✅ `true` | Desde o início |
| `ENABLE_AI_REJECTION_ANALYSIS` | Análise de Reprovações | ❌ `false` | Após 15+ reprovações |
| `ENABLE_AI_RISK_PREDICTION` | Predição de Riscos | ❌ `false` | Após 30+ candidaturas |
| `ENABLE_AI_QUESTION_IMPROVEMENT` | Melhoria de Questões | ❌ `false` | Após 20+ candidaturas |
| `ENABLE_AI_AUTO_REPRIORITIZATION` | Repriorização Automática | ✅ `true` | Desde o início |

---

## 🚀 CONFIGURAÇÃO RÁPIDA

### **FASE 1: INÍCIO (Recomendado para primeiros 30 dias)**

Adicione no arquivo `.env`:

```env
# ✅ ATIVO - Não depende de histórico
VITE_ENABLE_AI_QUESTIONS=true
VITE_ENABLE_AI_CANDIDATE_RECOMMENDATION=true
VITE_ENABLE_AI_RED_FLAGS=true
VITE_ENABLE_AI_AUTO_REPRIORITIZATION=true

# ❌ INATIVO - Acumulando dados
VITE_ENABLE_AI_REJECTION_ANALYSIS=false
VITE_MIN_REJECTIONS_FOR_ANALYSIS=15

VITE_ENABLE_AI_RISK_PREDICTION=false
VITE_MIN_APPLICATIONS_FOR_PREDICTION=30

VITE_ENABLE_AI_QUESTION_IMPROVEMENT=false
VITE_MIN_APPLICATIONS_FOR_IMPROVEMENT=20
```

**O que acontece:**
- ✅ IA gera questões personalizadas
- ✅ IA recomenda candidatos (análise básica)
- ✅ IA identifica red flags
- ✅ Repriorização automática funciona
- ❌ Análise de reprovações aguarda dados
- ❌ Predição de riscos aguarda dados
- ❌ Melhoria de questões aguarda dados

---

### **FASE 2: CRESCIMENTO (Após 30-60 dias)**

Quando tiver dados suficientes, ative gradualmente:

```env
# ✅ Manter ativos
VITE_ENABLE_AI_QUESTIONS=true
VITE_ENABLE_AI_CANDIDATE_RECOMMENDATION=true
VITE_ENABLE_AI_RED_FLAGS=true
VITE_ENABLE_AI_AUTO_REPRIORITIZATION=true

# ✅ ATIVAR se tiver 15+ reprovações
VITE_ENABLE_AI_REJECTION_ANALYSIS=true
VITE_MIN_REJECTIONS_FOR_ANALYSIS=15

# ✅ ATIVAR se tiver 20+ candidaturas com questões
VITE_ENABLE_AI_QUESTION_IMPROVEMENT=true
VITE_MIN_APPLICATIONS_FOR_IMPROVEMENT=20

# ❌ Ainda aguardando
VITE_ENABLE_AI_RISK_PREDICTION=false
VITE_MIN_APPLICATIONS_FOR_PREDICTION=30
```

---

### **FASE 3: MATURIDADE (Após 60+ dias)**

Sistema totalmente operacional:

```env
# ✅ TUDO ATIVO
VITE_ENABLE_AI_QUESTIONS=true
VITE_ENABLE_AI_CANDIDATE_RECOMMENDATION=true
VITE_ENABLE_AI_RED_FLAGS=true
VITE_ENABLE_AI_REJECTION_ANALYSIS=true
VITE_ENABLE_AI_RISK_PREDICTION=true
VITE_ENABLE_AI_QUESTION_IMPROVEMENT=true
VITE_ENABLE_AI_AUTO_REPRIORITIZATION=true
```

---

## 📋 DETALHES DE CADA FLAG

### **1. QUESTÕES INTELIGENTES**

```env
VITE_ENABLE_AI_QUESTIONS=true
```

**O que faz:** IA gera 5-10 questões personalizadas por vaga

**Depende de histórico?** ❌ NÃO

**Motivo:** Usa apenas descrição da vaga, não precisa de histórico

**Recomendação:** ✅ Ativar desde o início

---

### **2. RECOMENDAÇÃO DE CANDIDATO**

```env
VITE_ENABLE_AI_CANDIDATE_RECOMMENDATION=true
VITE_MIN_INTERVIEWS_FOR_RECOMMENDATION=0
```

**O que faz:** IA recomenda aprovar/rejeitar candidato

**Depende de histórico?** ⚠️ PARCIALMENTE (melhora com histórico)

**Motivo:** Análise básica funciona sem histórico. Com histórico, fica mais precisa.

**Recomendação:** ✅ Ativar desde o início

---

### **3. RED FLAGS AUTOMÁTICOS**

```env
VITE_ENABLE_AI_RED_FLAGS=true
```

**O que faz:** IA identifica red flags em candidatos

**Depende de histórico?** ❌ NÃO

**Motivo:** Usa padrões gerais do mercado

**Recomendação:** ✅ Ativar desde o início

---

### **4. ANÁLISE DE REPROVAÇÕES**

```env
VITE_ENABLE_AI_REJECTION_ANALYSIS=false
VITE_MIN_REJECTIONS_FOR_ANALYSIS=15
```

**O que faz:** IA analisa padrões mensais de reprovação

**Depende de histórico?** ✅ SIM (precisa de 15+ reprovações)

**Motivo:** Sem dados, análise não tem valor

**Recomendação:** ❌ Desativar até ter 15+ reprovações

**Como verificar se pode ativar:**
1. Acesse Dashboard → Status de IA
2. Veja "Análise de Reprovações"
3. Se mostrar "✅ PRONTO PARA ATIVAR", pode ativar

---

### **5. PREDIÇÃO DE RISCOS**

```env
VITE_ENABLE_AI_RISK_PREDICTION=false
VITE_MIN_APPLICATIONS_FOR_PREDICTION=30
```

**O que faz:** IA prevê risco de reprovação de candidato

**Depende de histórico?** ✅ SIM (precisa de 30+ candidaturas)

**Motivo:** Predição sem histórico é chute

**Recomendação:** ❌ Desativar até ter 30+ candidaturas com resultado final

**Como verificar:**
1. Acesse Dashboard → Status de IA
2. Veja "Predição de Riscos"
3. Se mostrar "✅ PRONTO PARA ATIVAR", pode ativar

---

### **6. MELHORIA DE QUESTÕES**

```env
VITE_ENABLE_AI_QUESTION_IMPROVEMENT=false
VITE_MIN_APPLICATIONS_FOR_IMPROVEMENT=20
```

**O que faz:** IA desativa questões ineficazes e sugere novas

**Depende de histórico?** ✅ SIM (precisa de 20+ candidaturas com questões)

**Motivo:** Precisa de dados para saber se questão é eficaz

**Recomendação:** ❌ Desativar até ter 20+ candidaturas

**Como verificar:**
1. Acesse Dashboard → Status de IA
2. Veja "Melhoria de Questões"
3. Se mostrar "✅ PRONTO PARA ATIVAR", pode ativar

---

### **7. REPRIORIZAÇÃO AUTOMÁTICA**

```env
VITE_ENABLE_AI_AUTO_REPRIORITIZATION=true
```

**O que faz:** IA reprioriza vagas a cada 4 horas

**Depende de histórico?** ⚠️ PARCIALMENTE (usa dados em tempo real)

**Motivo:** Usa urgência e tempo decorrido, não apenas histórico

**Recomendação:** ✅ Ativar desde o início

---

## 🔍 VERIFICAR STATUS

### **Opção 1: Dashboard Visual**

1. Acesse: `https://seu-dominio.com/dashboard/ai-status`
2. Veja status de cada funcionalidade
3. Veja progresso de dados acumulados
4. Veja estimativa de quando pode ativar

### **Opção 2: Console do Navegador**

```javascript
import { getAIFeaturesStatus } from './src/config/aiConfig';

const status = await getAIFeaturesStatus();
console.log(status);
```

### **Opção 3: Logs do Sistema**

Quando uma funcionalidade está desativada, você verá no console:

```
[Análise] Análise de reprovações desativada por configuração
[Análise] Dados insuficientes: ⏳ Acumulando dados (8/15)
```

---

## 🛠️ TROUBLESHOOTING

### **Problema: Mudei .env mas não funcionou**

**Solução:**
1. Reinicie o servidor: `npm run dev`
2. Limpe cache: `npm run build`
3. No Vercel: Redeploy após adicionar variáveis

### **Problema: Dashboard mostra "Erro ao carregar status"**

**Solução:**
1. Verifique se `aiConfig.ts` está importado corretamente
2. Verifique conexão com Supabase
3. Veja console do navegador para detalhes

### **Problema: Flag ativa mas funcionalidade não executa**

**Solução:**
1. Verifique se há dados suficientes
2. Veja logs no console
3. Verifique se service está importando `aiConfig`

### **Problema: Quero forçar ativação mesmo sem dados**

**Solução:**
1. Edite `src/config/aiConfig.ts`
2. Mude `MIN_*_FOR_*` para `0`
3. Ou remova verificação de `checkDataSufficiency()`

---

## 📊 EXEMPLO DE EVOLUÇÃO

### **Dia 1-30: Acumulando Dados**

```
✅ Questões Inteligentes: ATIVO
   └─ 45 questões geradas

✅ Recomendação de Candidato: ATIVO
   └─ 23 recomendações

⏸️ Análise de Reprovações: INATIVO
   └─ 8/15 reprovações (53%)
   └─ Ativar em: ~7 dias

⏸️ Predição de Riscos: INATIVO
   └─ 23/30 candidaturas (77%)
   └─ Ativar em: ~7 dias
```

### **Dia 31-60: Ativando Gradualmente**

```
✅ Questões Inteligentes: ATIVO
✅ Recomendação de Candidato: ATIVO
✅ Análise de Reprovações: ATIVO ← Ativado!
   └─ 18/15 reprovações ✅

✅ Melhoria de Questões: ATIVO ← Ativado!
   └─ 25/20 candidaturas ✅

⏸️ Predição de Riscos: INATIVO
   └─ 28/30 candidaturas (93%)
   └─ Ativar em: ~2 dias
```

### **Dia 61+: Totalmente Operacional**

```
✅ Todas as funcionalidades ATIVAS
✅ IA aprendendo continuamente
✅ Acurácia: 75%
✅ Sistema maduro
```

---

## 🎯 RECOMENDAÇÕES FINAIS

### **DO:**
- ✅ Ative funcionalidades gradualmente
- ✅ Monitore dashboard de status regularmente
- ✅ Aguarde dados suficientes antes de ativar predições
- ✅ Teste cada funcionalidade isoladamente

### **DON'T:**
- ❌ Não ative tudo de uma vez no início
- ❌ Não force ativação sem dados suficientes
- ❌ Não ignore alertas de dados insuficientes
- ❌ Não confie em predições sem histórico

---

## 📞 PRÓXIMOS PASSOS

1. **Configure .env** com flags da Fase 1
2. **Reinicie servidor** e faça deploy
3. **Monitore dashboard** semanalmente
4. **Ative gradualmente** conforme acumula dados
5. **Meça impacto** de cada funcionalidade

---

**Configuração estimada:** ~15 minutos  
**Complexidade:** Baixa  
**Impacto:** 🚀 ALTO (evita predições ruins)

**Sistema pronto para crescer organicamente com sua empresa! 🌱**
