# Análise: Problema de Escala de Risco

## ❌ PROBLEMA IDENTIFICADO

Os scores estão sendo salvos, MAS com **escala incompatível**!

---

## 📊 Comparação de Escalas

### **ESPECIFICAÇÃO (Esperado):**

| Valor | Cor | Significado |
|-------|-----|-------------|
| **1** | 🔴 Vermelho #EA4335 | Risco Crítico/Alto |
| **2** | 🟡 Amarelo #FBBC05 | Risco Moderado |
| **3** | 🟢 Verde #34A853 | Risco Baixo/Satisfatório |
| **4** | 🔵 Azul #4285F4 | Excelente/Sem Risco |

**Lógica:** Quanto MENOR o número, PIOR a situação!

---

### **CÓDIGO ATUAL (Implementado):**

```typescript
// analyzeRiskFromActivities retorna:
if (highRiskCount >= 2) return 1; // Risco Crítico
if (highRiskCount >= 1 || mediumRiskCount >= 3) return 2; // Risco Alto  
if (mediumRiskCount >= 1 || positiveCount === 0) return 3; // Risco Médio
return 4; // Baixo Risco
```

**Escala:** 1 (pior) → 4 (melhor)

**MAS o tipo RiskScore aceita 1-5:**
```typescript
type RiskScore = 1 | 2 | 3 | 4 | 5;
```

---

## 🔍 PROBLEMA

### **1. Escala Correta (1-4)**

O código `analyzeRiskFromActivities` **JÁ USA** a escala correta (1-4)!

✅ 1 = Crítico (Vermelho)
✅ 2 = Alto Risco (Amarelo)
✅ 3 = Médio (Verde?)
✅ 4 = Baixo Risco (Azul?)

**MAS:**
- ❌ Falta o valor 5 (nunca é retornado)
- ⚠️ Escala 3 e 4 podem estar trocadas

---

### **2. Mapeamento de Cores**

**Dashboard atual:**
```typescript
// RecommendationModule.tsx
if (riskScore === 5) {
    riskLabel = 'CRÍTICO';
    riskIcon = '⚫';
} else if (riskScore === 4) {
    riskLabel = 'ALTO RISCO';
    riskIcon = '🔴';
} else if (riskScore === 3) {
    riskLabel = 'MODERADO';
    riskIcon = '🟡';
}
```

**INVERTIDO!** O código trata 5 como pior e 1 como melhor!

---

## ✅ SOLUÇÃO

### **Opção 1: Inverter a escala do analyzeRiskFromActivities**

```typescript
// ANTES
if (highRiskCount >= 2) return 1; // Crítico
if (highRiskCount >= 1) return 2; // Alto
if (mediumRiskCount >= 1) return 3; // Médio
return 4; // Baixo

// DEPOIS
if (highRiskCount >= 2) return 4; // Crítico (Vermelho)
if (highRiskCount >= 1) return 3; // Alto (Amarelo)
if (mediumRiskCount >= 1) return 2; // Médio (Verde)
return 1; // Excelente (Azul)
```

**Problema:** Quebra a especificação!

---

### **Opção 2: Manter escala 1-4 e corrigir Dashboard** ✅

Manter `analyzeRiskFromActivities` como está (1=pior, 4=melhor) e corrigir os dashboards para usar a mesma lógica!

```typescript
// Dashboard corrigido
if (riskScore === 1) {
    riskLabel = 'CRÍTICO';
    color = '#EA4335'; // Vermelho
} else if (riskScore === 2) {
    riskLabel = 'MODERADO';
    color = '#FBBC05'; // Amarelo
} else if (riskScore === 3) {
    riskLabel = 'SATISFATÓRIO';
    color = '#34A853'; // Verde
} else if (riskScore === 4) {
    riskLabel = 'EXCELENTE';
    color = '#4285F4'; // Azul
}
```

---

## 🎯 RECOMENDAÇÃO

**Usar Opção 2:**
1. ✅ Mantém `analyzeRiskFromActivities` (1-4, 1=pior)
2. ✅ Corrige Dashboard para mapear cores corretas
3. ✅ Remove valor 5 do tipo RiskScore
4. ✅ Alinha com especificação

---

## 📝 Arquivos a Corrigir

1. **types.ts** - Mudar `RiskScore = 1 | 2 | 3 | 4 | 5` para `1 | 2 | 3 | 4`
2. **RecommendationModule.tsx** - Corrigir mapeamento de cores
3. **Dashboard components** - Corrigir exibição de ícones
4. **Quarentena** - Ajustar filtro (1 e 2 = quarentena)

---

## ⚠️ NOTA IMPORTANTE

O problema NÃO é que os dados não estão sendo salvos!

**Os dados ESTÃO sendo salvos corretamente em:**
- `parecer_10_consultor` = riskScore (1-4)
- `parecer_final_consultor` = riskScore (1-4)

**O problema é que o Dashboard não está EXIBINDO corretamente** porque espera escala diferente!
