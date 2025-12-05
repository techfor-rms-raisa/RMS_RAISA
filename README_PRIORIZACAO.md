# 🎯 RAISA ADVANCED: PRIORIZAÇÃO E DISTRIBUIÇÃO INTELIGENTE DE VAGAS

## 📋 VISÃO GERAL

Este módulo adiciona **inteligência artificial** ao processo de priorização de vagas e distribuição para analistas, otimizando o fluxo de trabalho e aumentando a eficiência do time de R&S.

---

## ✨ FUNCIONALIDADES

### **1. Cálculo Automático de Prioridade de Vagas**

A IA analisa cada vaga e calcula um **Score de Prioridade (0-100)** considerando:

- ✅ **Urgência do Prazo:** Quanto mais próximo o deadline, maior a prioridade
- ✅ **Valor de Faturamento:** Vagas com maior retorno financeiro têm prioridade
- ✅ **Cliente VIP:** Clientes VIP recebem boost de prioridade
- ✅ **Tempo em Aberto:** Vagas abertas há muito tempo precisam de atenção
- ✅ **Complexidade da Stack:** Stacks raras/complexas precisam de mais tempo

**Níveis de Prioridade:**
- 🔴 **Alta (80-100):** Ação imediata necessária
- 🟡 **Média (50-79):** Atenção moderada
- 🟢 **Baixa (0-49):** Pode ser tratada depois

**SLA Sugerido:**
A IA também sugere um prazo (em dias) para fechar a vaga, baseado em dados históricos.

---

### **2. Recomendação Inteligente de Analistas**

Para cada vaga, a IA recomenda os **melhores analistas** considerando:

- ✅ **Fit de Stack Tecnológica:** Overlap entre experiência do analista e requisitos da vaga
- ✅ **Fit com Cliente:** Histórico de sucesso do analista com aquele cliente
- ✅ **Disponibilidade:** Carga de trabalho atual do analista
- ✅ **Taxa de Sucesso:** Performance geral do analista

**Níveis de Adequação:**
- 🌟 **Excelente (85-100):** Altamente Recomendado
- 👍 **Bom (70-84):** Recomendado
- 👌 **Regular (50-69):** Adequado
- ⚠️ **Baixo (0-49):** Não Recomendado

---

## 🚀 COMO USAR

### **PASSO 1: Configurar o Banco de Dados**

Execute o SQL no Supabase:

```bash
# No SQL Editor do Supabase, execute:
database/priorizacao_distribuicao.sql
```

Isso criará:
- 3 tabelas (vaga_priorizacao, vaga_distribuicao, analista_perfil)
- 4 views úteis
- Índices e triggers

---

### **PASSO 2: Cadastrar Perfil dos Analistas (Opcional)**

Para melhores recomendações, cadastre o perfil de cada analista na tabela `analista_perfil`:

```sql
INSERT INTO analista_perfil (
    analista_id, 
    stack_experiencia, 
    especialidades
) VALUES (
    1, -- ID do analista
    ARRAY['React', 'Node.js', 'TypeScript', 'Python'],
    ARRAY['Frontend', 'Full Stack']
);
```

**Nota:** Se não cadastrar, o sistema usará dados históricos automaticamente.

---

### **PASSO 3: Usar a Funcionalidade**

1. **Acesse o módulo RAISA → Vagas**
2. **Clique no botão "🎯 Priorizar"** em qualquer vaga
3. **Aguarde o cálculo** (leva ~10 segundos)
4. **Veja o score de prioridade** e a justificativa da IA
5. **Veja a lista de analistas recomendados** ordenados por adequação
6. **Clique em "Atribuir"** para atribuir um analista à vaga

---

## 📊 DADOS CALCULADOS

### **Score de Prioridade:**

```json
{
  "score_prioridade": 85,
  "nivel_prioridade": "Alta",
  "sla_dias": 15,
  "justificativa": "Vaga de alta prioridade devido ao cliente VIP e prazo urgente...",
  "fatores_considerados": {
    "urgencia_prazo": 90,
    "valor_faturamento": 80,
    "cliente_vip": true,
    "tempo_vaga_aberta": 5,
    "complexidade_stack": 70
  }
}
```

### **Recomendação de Analista:**

```json
{
  "analista_nome": "João Silva",
  "score_match": 92,
  "nivel_adequacao": "Excelente",
  "recomendacao": "Altamente Recomendado",
  "justificativa_match": "Analista com forte experiência em React e histórico de 95% de aprovação com este cliente...",
  "fatores_match": {
    "fit_stack_tecnologica": 95,
    "fit_cliente": 95,
    "disponibilidade": 85,
    "taxa_sucesso_historica": 92
  },
  "tempo_estimado_fechamento_dias": 12
}
```

---

## 🎯 BENEFÍCIOS

### **Para Gestores Comerciais:**
- ✅ Visibilidade clara de quais vagas precisam de atenção urgente
- ✅ Otimização do faturamento (vagas de alto valor são priorizadas)
- ✅ Redução de atrasos e perda de clientes

### **Para Gestão de Pessoas:**
- ✅ Distribuição inteligente de carga de trabalho
- ✅ Alocação baseada em fit (analista certo para vaga certa)
- ✅ Aumento da taxa de sucesso do time

### **Para Analistas de R&S:**
- ✅ Recebem vagas que combinam com seu perfil
- ✅ Maior taxa de aprovação (menos retrabalho)
- ✅ Foco em vagas prioritárias

---

## 📈 MÉTRICAS E DASHBOARDS

O sistema cria automaticamente views para análise:

### **vw_vagas_com_prioridade**
Lista todas as vagas abertas com seus scores de prioridade e SLA.

### **vw_recomendacoes_analistas**
Lista recomendações de analistas para cada vaga.

### **vw_dashboard_priorizacao**
Métricas gerais:
- Vagas por nível de prioridade
- Score médio de prioridade
- SLA médio
- Vagas atrasadas
- Vagas sem analista

### **vw_analistas_performance_priorizacao**
Performance de cada analista com dados de priorização.

---

## 🔧 CONFIGURAÇÕES AVANÇADAS

### **Ajustar Pesos do Algoritmo**

Os pesos padrão são:
- **Fit Stack:** 40%
- **Fit Cliente:** 30%
- **Disponibilidade:** 20%
- **Taxa Sucesso:** 10%

Para ajustar, edite a função `recommendAnalyst` em `services/geminiService.ts`.

### **Recalcular Prioridades Automaticamente**

Você pode criar um cron job para recalcular prioridades diariamente:

```typescript
// Exemplo: Recalcular todas as vagas abertas
const vagas = await supabase.from('vagas').select('id').eq('status', 'aberta');
for (const vaga of vagas.data) {
    await calcularPrioridadeVaga(vaga.id);
}
```

---

## ⚠️ TROUBLESHOOTING

### **Erro: "Não foi possível calcular prioridade"**
- Verifique se a vaga tem todos os campos obrigatórios preenchidos
- Verifique se a API do Gemini está configurada corretamente

### **Recomendações vazias**
- Certifique-se de que existem analistas cadastrados e ativos
- Verifique se os analistas têm `stack_experiencia` cadastrada

### **Score sempre 0**
- Verifique se os dados da vaga estão completos (prazo, faturamento, etc.)
- Verifique os logs do console para erros da API do Gemini

---

## 📞 SUPORTE

Para dúvidas ou problemas, consulte:
- Documentação completa em `README.md`
- Logs do console do navegador
- Logs do Supabase

---

**Desenvolvido com ❤️ pela equipe Orbit.ai**
