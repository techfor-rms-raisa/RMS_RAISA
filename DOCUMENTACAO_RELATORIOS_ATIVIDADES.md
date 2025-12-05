# 📊 Sistema de Relatórios de Atividades - RMS-RAISA

## 📋 Visão Geral

Este documento descreve a funcionalidade completa de **Relatórios de Atividades** que foi restaurada no sistema RMS-RAISA, incluindo:

- ✅ Inserção manual de relatórios
- ✅ Importação em lote via arquivo
- ✅ Análise automática de risco com IA
- ✅ Sistema de quarentena
- ✅ Atualização de scores (parecer_X_consultor)

---

## 🎯 Objetivo

Permitir que **Gestores Comerciais** e **Gestores de Pessoas** registrem as atividades dos consultores mensalmente, com análise automática de risco que:

1. Identifica problemas de performance
2. Classifica o nível de risco (1-4)
3. Atualiza o score do consultor no sistema
4. Coloca consultores em quarentena quando necessário
5. Gera recomendações de ação

---

## 🔄 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                FLUXO DE RELATÓRIOS DE ATIVIDADES                │
└─────────────────────────────────────────────────────────────────┘

1. GESTOR REGISTRA ATIVIDADES
   ├─ Manual: Botão "📋 Relatório" na lista de consultores
   └─ Lote: Importar arquivo .txt com múltiplos relatórios

2. IA ANALISA O TEXTO
   ├─ Identifica palavras-chave de risco
   ├─ Calcula score de risco (1-4)
   └─ Gera recomendações

3. SISTEMA ATUALIZA BANCO
   ├─ Campo: parecer_X_consultor (X = mês)
   ├─ Campo: parecer_final_consultor
   └─ Cria registro em reports[]

4. QUARENTENA (se risco 1 ou 2)
   ├─ Consultor aparece na view "Quarentena"
   ├─ Alerta visual no Dashboard
   └─ Requer ação imediata

5. DASHBOARD EXIBE RESULTADOS
   ├─ Círculos coloridos por mês
   ├─ Modal com detalhes do relatório
   └─ Filtros por cliente/gestor
```

---

## 🗄️ Estrutura de Dados

### **Tabela: `consultants`**

Campos utilizados para relatórios:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `parecer_1_consultor` | INTEGER (1-4) | Score do mês 1 (Janeiro) |
| `parecer_2_consultor` | INTEGER (1-4) | Score do mês 2 (Fevereiro) |
| ... | ... | ... |
| `parecer_12_consultor` | INTEGER (1-4) | Score do mês 12 (Dezembro) |
| `parecer_final_consultor` | INTEGER (1-4) | Score final (último mês) |
| `reports` | JSONB | Array de objetos ConsultantReport |

### **Interface: `ConsultantReport`**

```typescript
interface ConsultantReport {
  id: string;
  month: number;                    // 1-12
  year: number;
  riskScore: RiskScore;             // 1-4
  summary: string;                  // Resumo da análise
  negativePattern: string;          // Padrões negativos identificados
  predictiveAlert: string;          // Alerta preditivo
  recommendations: Recommendation[]; // Recomendações de ação
  content: string;                  // Texto original das atividades
  createdAt: string;
  generatedBy: 'manual' | 'batch';
  aiJustification: string;
}
```

### **Interface: `RiskScore`**

```typescript
type RiskScore = 1 | 2 | 3 | 4;

// 1 = Crítico (vermelho)
// 2 = Alto (laranja)
// 3 = Médio (amarelo)
// 4 = Baixo (verde)
```

---

## 💻 Componentes Implementados

### **1. ReportActivityModal.tsx**

**Localização:** `components/ReportActivityModal.tsx`

**Função:** Modal para inserção manual de relatório de um consultor específico.

**Campos:**
- Consultor (preenchido automaticamente)
- Gestor (preenchido automaticamente)
- Mês de referência (dropdown)
- Descrição das atividades (textarea)

**Uso:**
```tsx
<ReportActivityModal
    isOpen={isReportModalOpen}
    onClose={() => setIsReportModalOpen(false)}
    consultant={selectedConsultant}
    manager={selectedManager}
    onSubmit={handleManualAnalysis}
/>
```

---

### **2. ReportImport.tsx**

**Localização:** `components/ReportImport.tsx`

**Função:** Componente expansível para importação em lote de relatórios.

**Recursos:**
- ✅ Download de template de exemplo
- ✅ Upload de arquivo .txt
- ✅ Instruções detalhadas de formato
- ✅ Legenda de níveis de risco
- ✅ Palavras-chave monitoradas

**Formato do arquivo:**
```
CONSULTOR|GESTOR|MÊS|ATIVIDADES
João Silva|Maria Santos|1|Entregou todas as tarefas dentro do prazo. Recebeu elogio do cliente.
Pedro Oliveira|Maria Santos|1|Apresentou 2 faltas não justificadas. Dificuldade em comunicação.
```

**Uso:**
```tsx
<ReportImport onImport={handleManualAnalysis} />
```

---

## 🤖 Análise de IA

### **Função: `processReportAnalysis()`**

**Localização:** `hooks/useSupabaseData.ts` (linhas 1806-1883)

**Processo:**

1. **Parsear texto do relatório**
   - Divide por linhas
   - Extrai: CONSULTOR | GESTOR | MÊS | ATIVIDADES

2. **Analisar risco** (`analyzeRiskFromActivities()`)
   - Conta palavras-chave de alto risco
   - Conta palavras-chave de médio risco
   - Conta palavras-chave positivas
   - Determina score final (1-4)

3. **Gerar análise** (`generateAnalysis()`)
   - Cria resumo textual
   - Identifica padrões negativos
   - Gera alertas preditivos
   - Cria recomendações de ação

4. **Retornar resultados**
   - Array de `AIAnalysisResult[]`

---

### **Palavras-chave Monitoradas**

#### **Alto Risco (Score 1-2):**
- falta
- atraso
- não entregou
- problema
- conflito
- reclamação
- insatisfação
- demissão
- advertência

#### **Médio Risco (Score 3):**
- dificuldade
- desafio
- atenção
- melhorar
- ajuste
- revisão

#### **Positivo (Score 4):**
- ótimo
- excelente
- sucesso
- entregou
- superou
- destaque
- elogio
- promoção

---

### **Lógica de Classificação:**

```typescript
if (highRiskCount >= 2) return 1;           // Crítico
if (highRiskCount >= 1 || mediumRiskCount >= 3) return 2;  // Alto
if (mediumRiskCount >= 1 || positiveCount === 0) return 3; // Médio
return 4;                                   // Baixo
```

---

## 📊 Atualização de Scores

### **Função: `updateConsultantScore()`**

**Localização:** `hooks/useSupabaseData.ts` (linhas 1734-1804)

**Processo:**

1. **Buscar consultor pelo nome**
   ```typescript
   const consultant = consultants.find(c => 
       c.nome_consultores.toLowerCase() === result.consultantName.toLowerCase()
   );
   ```

2. **Preparar campo do mês**
   ```typescript
   const monthField = `parecer_${result.reportMonth}_consultor`;
   ```

3. **Criar objeto de relatório**
   ```typescript
   const newReport: ConsultantReport = {
       id: `${consultant.id}_${result.reportMonth}_${Date.now()}`,
       month: result.reportMonth,
       year: new Date().getFullYear(),
       riskScore: result.riskScore,
       summary: result.summary,
       // ...
   };
   ```

4. **Atualizar no Supabase**
   ```typescript
   const updates = {
       [monthField]: result.riskScore,
       parecer_final_consultor: result.riskScore
   };
   
   await supabase
       .from('consultants')
       .update(updates)
       .eq('id', consultant.id);
   ```

5. **Verificar quarentena**
   ```typescript
   if (result.riskScore === 1 || result.riskScore === 2) {
       console.log(`⚠️ Consultor em QUARENTENA: ${result.consultantName}`);
   }
   ```

---

## 🚨 Sistema de Quarentena

### **Critérios:**

Um consultor entra em quarentena quando:

1. **Score de risco 1 ou 2** (Crítico ou Alto)
2. **Inclusão recente** (últimos 45 dias)

### **Visualização:**

**Dashboard → View "Quarentena"**

```typescript
// App.tsx
case 'quarantine':
    return <Dashboard 
        consultants={consultants} 
        isQuarantineView={true} 
    />;
```

**Filtro no Dashboard:**

```typescript
managerConsultants = managerConsultants.filter(c => {
    const isRecent = c.data_inclusao_consultores >= cutoffStr && 
                     c.data_inclusao_consultores <= todayStr;
    const isRisk = c.parecer_final_consultor === 1 || 
                   c.parecer_final_consultor === 2;
    return isRecent || isRisk;
});
```

---

## 🎨 Interface do Usuário

### **1. Botão na Lista de Consultores**

**Localização:** `ManageConsultants.tsx`

```tsx
<button 
    onClick={() => {
        setReportingConsultant(c);
        setIsReportModalOpen(true);
    }} 
    className="text-green-600 hover:text-green-800"
>
    📋 Relatório
</button>
```

**Aparece:**
- Ao lado do botão "Editar"
- Apenas para usuários com permissão (não "Consulta")
- Apenas se `onManualReport` estiver definido

---

### **2. Importação em Lote**

**Localização:** `ManageConsultants.tsx` (topo da página)

**Componente expansível:**
- Clique para expandir/recolher
- Instruções detalhadas
- Botão "Baixar Template"
- Upload de arquivo

---

### **3. Dashboard - Círculos de Status**

**Cores:**
- 🔴 Vermelho: Risco 1 (Crítico)
- 🟠 Laranja: Risco 2 (Alto)
- 🟡 Amarelo: Risco 3 (Médio)
- 🟢 Verde: Risco 4 (Baixo)
- ⚪ Cinza: Sem relatório

**Clique no círculo:**
- Abre modal com detalhes do relatório
- Mostra resumo, padrões, alertas e recomendações

---

## 🧪 Como Testar

### **Teste 1: Inserção Manual**

1. Acesse **Gestão de Consultores**
2. Clique em **"📋 Relatório"** em um consultor
3. Selecione o mês
4. Digite atividades com palavras-chave:
   ```
   Consultor apresentou 2 faltas não justificadas.
   Reclamação do cliente sobre qualidade do trabalho.
   Advertência aplicada.
   ```
5. Clique em **"✅ Processar Relatório"**
6. Verifique:
   - Alert de sucesso
   - Console: logs de análise
   - Dashboard: círculo vermelho no mês

---

### **Teste 2: Importação em Lote**

1. Acesse **Gestão de Consultores**
2. Expanda **"📊 Importar Relatórios de Atividades em Lote"**
3. Clique em **"📥 Baixar Template de Exemplo"**
4. Edite o template com dados reais
5. Faça upload do arquivo
6. Verifique:
   - Alert: "X consultor(es) atualizado(s)"
   - Console: logs detalhados
   - Dashboard: múltiplos círculos atualizados

---

### **Teste 3: Quarentena**

1. Crie relatório com risco 1 ou 2
2. Vá para **Dashboard**
3. Clique na view **"⚠️ Quarentena"**
4. Verifique:
   - Consultor aparece na lista
   - Fundo amarelo
   - Alerta visual

---

### **Teste 4: Análise de Palavras-chave**

**Teste com diferentes textos:**

| Texto | Score Esperado |
|-------|----------------|
| "Excelente performance, superou expectativas" | 4 (Verde) |
| "Algumas dificuldades, precisa melhorar" | 3 (Amarelo) |
| "Reclamação do cliente, precisa atenção" | 2 (Laranja) |
| "Falta não justificada, advertência aplicada" | 1 (Vermelho) |

---

## 📝 Logs do Sistema

### **Console Logs:**

```
🤖 Processando análise de relatório com IA...
✅ 3 relatórios analisados
📊 Atualizando score do consultor: João Silva
✅ Score atualizado: João Silva - Mês 1 - Risco 2
⚠️ Consultor em QUARENTENA: João Silva
```

### **Alerts ao Usuário:**

```
✅ Análise concluída com sucesso!

3 consultor(es) atualizado(s).

Verifique o Dashboard para ver os resultados.
```

---

## 🔧 Arquivos Modificados

### **Novos Arquivos:**

1. `components/ReportActivityModal.tsx` - Modal de inserção manual
2. `components/ReportImport.tsx` - Componente de importação em lote
3. `DOCUMENTACAO_RELATORIOS_ATIVIDADES.md` - Esta documentação

### **Arquivos Atualizados:**

1. `hooks/useSupabaseData.ts`
   - Implementação de `processReportAnalysis()`
   - Implementação de `updateConsultantScore()`
   - Funções auxiliares de análise

2. `components/ManageConsultants.tsx`
   - Import dos novos componentes
   - Estados para modal de relatório
   - Botão "📋 Relatório" na tabela
   - Renderização dos componentes

3. `components/ManageClients.tsx`
   - Import do ReportActivityModal
   - Estados para modal de relatório
   - Renderização do modal

4. `App.tsx`
   - Atualização de `handleManualAnalysis()`
   - Loop para processar múltiplos resultados
   - Mensagens de feedback melhoradas

---

## 🎯 Recomendações de Uso

### **Para Gestores Comerciais:**

1. **Registrar atividades mensalmente**
   - Até o dia 5 do mês seguinte
   - Ser específico e detalhado
   - Incluir feedbacks do cliente

2. **Usar importação em lote**
   - Para múltiplos consultores
   - Economiza tempo
   - Mantém consistência

3. **Monitorar quarentena**
   - Verificar semanalmente
   - Agir imediatamente em riscos críticos
   - Documentar ações tomadas

---

### **Para Gestores de Pessoas:**

1. **Acompanhar tendências**
   - Identificar padrões recorrentes
   - Propor treinamentos
   - Intervir preventivamente

2. **Usar recomendações da IA**
   - Seguir planos de ação sugeridos
   - Documentar resultados
   - Ajustar estratégias

3. **Gerar relatórios**
   - Exportar dados do Dashboard
   - Analisar performance geral
   - Apresentar para diretoria

---

## ⚠️ Considerações Importantes

### **1. Privacidade:**

- Relatórios contêm informações sensíveis
- Acesso restrito por tipo de usuário
- Logs de acesso recomendados

### **2. Precisão da IA:**

- Análise baseada em palavras-chave
- Pode ter falsos positivos/negativos
- Revisão humana sempre necessária

### **3. Ações Recomendadas:**

- Não substituem julgamento profissional
- São sugestões baseadas em padrões
- Devem ser adaptadas ao contexto

---

## 🔮 Melhorias Futuras

### **Fase 2: IA Avançada**

- [ ] Integração com GPT-4 para análise mais sofisticada
- [ ] Detecção de sentimento no texto
- [ ] Análise de tendências temporais
- [ ] Predição de risco futuro

### **Fase 3: Automação**

- [ ] Envio automático de alertas por email
- [ ] Agendamento de reuniões automáticas
- [ ] Criação de planos de ação automatizados
- [ ] Integração com calendário

### **Fase 4: Analytics**

- [ ] Dashboard específico de relatórios
- [ ] Gráficos de evolução temporal
- [ ] Comparação entre consultores
- [ ] Benchmarking por cliente

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verificar logs no console (F12)
2. Consultar esta documentação
3. Testar com template de exemplo
4. Verificar permissões de usuário

---

**Desenvolvido para RMS-RAISA** 📊
**Versão:** 1.0
**Data:** 04/12/2025
