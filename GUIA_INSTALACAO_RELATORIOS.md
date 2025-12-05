# 🚀 Guia de Instalação Rápida - Sistema de Relatórios

## ⏱️ Tempo estimado: 5 minutos

---

## 📋 Checklist de Instalação

### **Passo 1: Substituir Arquivos** ⏱️ 2 min

Substitua os seguintes arquivos no seu projeto:

#### **1.1. Novos Componentes (criar):**

```
components/ReportActivityModal.tsx   ✨ NOVO
components/ReportImport.tsx          ✨ NOVO
```

#### **1.2. Arquivos Existentes (substituir):**

```
hooks/useSupabaseData.ts             ✏️ ATUALIZADO
components/ManageConsultants.tsx     ✏️ ATUALIZADO
components/ManageClients.tsx         ✏️ ATUALIZADO
App.tsx                              ✏️ ATUALIZADO
```

---

### **Passo 2: Verificar Imports** ⏱️ 1 min

Certifique-se de que não há erros de import:

```bash
# No terminal do VS Code
npm run build
```

Se houver erros, verifique:
- Todos os arquivos foram copiados corretamente
- Não há duplicação de código
- Paths dos imports estão corretos

---

### **Passo 3: Testar Funcionalidade** ⏱️ 2 min

#### **Teste 1: Inserção Manual**

1. Acesse **Gestão de Consultores**
2. Veja se aparece o componente **"📊 Importar Relatórios de Atividades em Lote"**
3. Clique em **"📋 Relatório"** em um consultor
4. Preencha o formulário:
   - Mês: Janeiro
   - Atividades: "Consultor apresentou 2 faltas não justificadas. Reclamação do cliente."
5. Clique em **"✅ Processar Relatório"**
6. Deve aparecer alert de sucesso

#### **Teste 2: Importação em Lote**

1. Expanda **"📊 Importar Relatórios..."**
2. Clique em **"📥 Baixar Template de Exemplo"**
3. Arquivo `template_relatorios_atividades.txt` será baixado
4. Faça upload do template
5. Deve aparecer alert: "X consultor(es) atualizado(s)"

#### **Teste 3: Verificar Dashboard**

1. Vá para **Dashboard**
2. Veja se os círculos de status foram atualizados
3. Clique em um círculo colorido
4. Modal deve abrir com detalhes do relatório

---

## ✅ Verificação Final

Execute no console do navegador (F12):

```javascript
// Verificar se funções existem
console.log(typeof processReportAnalysis);  // deve ser "function"
console.log(typeof updateConsultantScore);  // deve ser "function"
```

---

## 🎯 Resultado Esperado

### **Na Interface:**

**Gestão de Consultores:**
```
┌─────────────────────────────────────────────────────┐
│ 📊 Importar Relatórios de Atividades em Lote  [▼]  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Gerenciar Consultores            [+ Novo Consultor] │
├─────────────────────────────────────────────────────┤
│ Consultor    │ Cliente │ Cargo │ Ações              │
├─────────────────────────────────────────────────────┤
│ João Silva   │ Acme    │ Dev   │ [Editar] [📋 Relatório] │
└─────────────────────────────────────────────────────┘
```

**Dashboard:**
```
┌─────────────────────────────────────────────────────┐
│ Dashboard de Acompanhamento                         │
├─────────────────────────────────────────────────────┤
│ Cliente: Acme Corp                                  │
│ Gestor: Maria Santos                                │
│                                                     │
│ Consultor      │ Jan │ Fev │ Mar │ ...             │
│ João Silva     │ 🔴  │ 🟡  │ 🟢  │ ...             │
│ Pedro Oliveira │ 🟢  │ 🟢  │ 🟢  │ ...             │
└─────────────────────────────────────────────────────┘

Legenda:
🔴 Risco Crítico (1)
🟠 Risco Alto (2)
🟡 Risco Médio (3)
🟢 Baixo Risco (4)
⚪ Sem Relatório
```

---

## 🐛 Troubleshooting

### **Problema: Botão "📋 Relatório" não aparece**

**Solução:**
1. Verificar se `onManualReport` está sendo passado como prop
2. Verificar tipo de usuário (não aparece para "Consulta")
3. Verificar console por erros de import

### **Problema: Análise não funciona**

**Solução:**
1. Abrir console (F12)
2. Procurar por erros em vermelho
3. Verificar se `processReportAnalysis` foi implementado corretamente
4. Verificar formato do texto (CONSULTOR|GESTOR|MÊS|ATIVIDADES)

### **Problema: Score não atualiza no banco**

**Solução:**
1. Verificar permissões no Supabase
2. Verificar se campos `parecer_X_consultor` existem na tabela
3. Verificar console por erros de Supabase
4. Verificar se consultor foi encontrado pelo nome

### **Problema: Importação em lote falha**

**Solução:**
1. Verificar formato do arquivo (deve ser .txt)
2. Verificar separador (deve ser pipe |)
3. Verificar se consultores existem no banco
4. Verificar console por erros

---

## 📝 Formato do Arquivo de Importação

### **Estrutura:**

```
CONSULTOR|GESTOR|MÊS|ATIVIDADES
```

### **Exemplo Válido:**

```
João Silva|Maria Santos|1|Entregou todas as tarefas dentro do prazo. Recebeu elogio do cliente.
Pedro Oliveira|Maria Santos|1|Apresentou 2 faltas não justificadas. Dificuldade em comunicação.
Ana Costa|Carlos Souza|2|Performance excelente. Superou expectativas.
```

### **Erros Comuns:**

❌ **Falta de separador:**
```
João Silva Maria Santos 1 Atividades...
```

❌ **Separador errado:**
```
João Silva;Maria Santos;1;Atividades...
```

❌ **Mês inválido:**
```
João Silva|Maria Santos|Janeiro|Atividades...
```
(Deve ser número: 1-12)

❌ **Campos vazios:**
```
João Silva||1|Atividades...
```

---

## 🎨 Personalização

### **Ajustar Palavras-chave:**

Edite `hooks/useSupabaseData.ts` linha ~1790:

```typescript
const highRiskKeywords = [
    'falta', 'atraso', 'não entregou', 
    // Adicione suas palavras aqui
];
```

### **Ajustar Lógica de Score:**

Edite `hooks/useSupabaseData.ts` linha ~1811:

```typescript
if (highRiskCount >= 2) return 1;  // Ajuste o threshold
```

### **Customizar Cores:**

Edite `components/StatusCircle.tsx` para mudar cores dos círculos.

---

## 📞 Suporte

Se encontrar problemas:

1. ✅ Verificar logs no console (F12)
2. ✅ Consultar `DOCUMENTACAO_RELATORIOS_ATIVIDADES.md` completa
3. ✅ Testar com template de exemplo
4. ✅ Verificar permissões de usuário

---

## 🎉 Pronto!

Após seguir estes passos, o sistema de relatórios estará funcionando! 🚀

**Próximos passos:**
- Treinar gestores no uso da funcionalidade
- Estabelecer rotina mensal de relatórios
- Monitorar quarentena semanalmente
- Ajustar palavras-chave conforme necessário

---

**Desenvolvido para RMS-RAISA** 📊
