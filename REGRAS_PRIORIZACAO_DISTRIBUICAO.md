# 📊 REGRAS DE PRIORIZAÇÃO E DISTRIBUIÇÃO AUTOMÁTICA

## 🎯 1. PRIORIZAÇÃO DE VAGAS

### **DADOS CONSIDERADOS**

A IA analisa os seguintes dados da vaga:

| Dado | Fonte | Peso |
|------|-------|------|
| **Prazo de Fechamento** | Campo `prazo_fechamento` | Alto |
| **Faturamento Estimado** | Campo `faturamento_estimado` | Alto |
| **Cliente VIP** | Campo `cliente_vip` (boolean) | Fixo (+20 pontos) |
| **Dias em Aberto** | Calculado: `hoje - createdAt` | Médio |
| **Stack Tecnológica** | Array `stack_tecnologica` | Médio |
| **Senioridade** | Campo `senioridade` | Baixo |
| **Média Histórica** | Tempo médio de vagas similares | Referência |

---

### **CRITÉRIOS DE PRIORIZAÇÃO**

A IA calcula um **Score de 0 a 100** baseado em 5 critérios:

#### **1. URGÊNCIA DO PRAZO (0-100 pontos)**
```
Lógica da IA:
- Prazo < 7 dias: 100 pontos
- Prazo 7-15 dias: 80 pontos
- Prazo 15-30 dias: 60 pontos
- Prazo 30-60 dias: 40 pontos
- Prazo > 60 dias: 20 pontos
- Sem prazo definido: 30 pontos (prioridade média)
```

**Parâmetros ajustáveis:**
- ✅ `prazo_fechamento` (data) - Manual no cadastro da vaga

---

#### **2. VALOR DE FATURAMENTO (0-100 pontos)**
```
Lógica da IA:
- Faturamento > R$ 50.000: 100 pontos
- Faturamento R$ 30.000-50.000: 80 pontos
- Faturamento R$ 15.000-30.000: 60 pontos
- Faturamento R$ 5.000-15.000: 40 pontos
- Faturamento < R$ 5.000: 20 pontos
- Sem faturamento informado: 50 pontos (neutro)
```

**Parâmetros ajustáveis:**
- ✅ `faturamento_estimado` (número) - Manual no cadastro da vaga

---

#### **3. CLIENTE VIP (+20 pontos fixos)**
```
Lógica da IA:
- Se cliente_vip = true: Adiciona 20 pontos ao score final
- Se cliente_vip = false: Não adiciona
```

**Parâmetros ajustáveis:**
- ✅ `cliente_vip` (boolean) - Manual no cadastro do cliente
- ⚠️ **ATENÇÃO:** Este é um bônus fixo, não proporcional

---

#### **4. TEMPO EM ABERTO (0-100 pontos)**
```
Lógica da IA:
- Vaga aberta há 60+ dias: 100 pontos (urgente!)
- Vaga aberta há 45-60 dias: 80 pontos
- Vaga aberta há 30-45 dias: 60 pontos
- Vaga aberta há 15-30 dias: 40 pontos
- Vaga aberta há 7-15 dias: 20 pontos
- Vaga aberta há < 7 dias: 10 pontos
```

**Parâmetros ajustáveis:**
- ❌ Calculado automaticamente (não editável)

---

#### **5. COMPLEXIDADE DA STACK (0-100 pontos)**
```
Lógica da IA:
A IA analisa a stack_tecnologica e considera:
- Quantidade de tecnologias: Mais tecnologias = mais complexo
- Raridade das tecnologias: Tecnologias raras = mais complexo
- Senioridade exigida: Sênior/Especialista = mais complexo

Exemplos:
- Stack simples (React, JavaScript): 30 pontos
- Stack média (React, Node.js, PostgreSQL): 50 pontos
- Stack complexa (React, Node.js, Kubernetes, AWS, Microservices): 80 pontos
- Stack rara (Elixir, Phoenix, GraphQL, Kafka): 100 pontos
```

**Parâmetros ajustáveis:**
- ✅ `stack_tecnologica` (array) - Manual no cadastro da vaga
- ✅ `senioridade` (string) - Manual no cadastro da vaga

---

### **CÁLCULO DO SCORE FINAL**

```
Score Final = (
    urgencia_prazo * 0.25 +
    valor_faturamento * 0.25 +
    tempo_vaga_aberta * 0.25 +
    complexidade_stack * 0.25
) + (cliente_vip ? 20 : 0)

Máximo: 100 + 20 (VIP) = 120 pontos
Mínimo: 0 pontos
```

**Pesos atuais:**
- Urgência do Prazo: **25%**
- Valor de Faturamento: **25%**
- Tempo em Aberto: **25%**
- Complexidade da Stack: **25%**
- Bônus Cliente VIP: **+20 pontos fixos**

⚠️ **ATENÇÃO:** Os pesos estão hardcoded na IA. Para ajustar, seria necessário:
1. Criar tabela `config_priorizacao` com os pesos
2. Passar os pesos como parâmetro para a IA
3. Criar UI para ajustar os pesos

---

### **NÍVEL DE PRIORIDADE**

Baseado no score final:

| Score | Nível | SLA Sugerido |
|-------|-------|--------------|
| 80-120 | **Alta** | 7-15 dias |
| 50-79 | **Média** | 15-30 dias |
| 0-49 | **Baixa** | 30-60 dias |

**Parâmetros ajustáveis:**
- ❌ Faixas hardcoded na IA

---

### **CÁLCULO DO SLA (PRAZO SUGERIDO)**

```
Lógica da IA:
1. Busca média histórica de vagas similares (mesma stack + senioridade)
2. Ajusta conforme urgência:
   - Prioridade Alta: média * 0.7
   - Prioridade Média: média * 1.0
   - Prioridade Baixa: média * 1.3
3. Considera complexidade da stack:
   - Stack complexa: adiciona 5-10 dias
4. Retorna SLA em dias
```

**Parâmetros ajustáveis:**
- ❌ Lógica hardcoded na IA
- ✅ Histórico acumulado automaticamente

---

## 🎯 2. DISTRIBUIÇÃO AUTOMÁTICA DE CVs (RECOMENDAÇÃO DE ANALISTA)

### **DADOS CONSIDERADOS**

A IA analisa os seguintes dados de cada analista:

| Dado | Fonte | Peso |
|------|-------|------|
| **Stack de Experiência** | Campo `stack_experiencia` (array) | 40% |
| **Histórico com Cliente** | Tabela `vw_raisa_performance_cliente` | 30% |
| **Carga de Trabalho Atual** | Count de vagas ativas | 20% |
| **Taxa de Aprovação Geral** | Tabela `vw_raisa_performance_analista` | 10% |
| **Tempo Médio de Fechamento** | Tabela `vw_raisa_analise_tempo` | Referência |

---

### **CRITÉRIOS DE RECOMENDAÇÃO**

A IA calcula um **Score de Match de 0 a 100** para cada analista:

#### **1. FIT DE STACK TECNOLÓGICA (0-100 pontos) - PESO 40%**
```
Lógica da IA:
1. Compara stack_tecnologica da vaga com stack_experiencia do analista
2. Calcula % de overlap (tecnologias em comum)
3. Considera senioridade:
   - Analista com experiência em stack sênior = mais pontos
4. Pontuação:
   - 100% overlap: 100 pontos
   - 80-99% overlap: 80 pontos
   - 60-79% overlap: 60 pontos
   - 40-59% overlap: 40 pontos
   - < 40% overlap: 20 pontos

Exemplo:
Vaga: [React, Node.js, PostgreSQL, AWS]
Analista A: [React, Node.js, PostgreSQL, AWS, Docker] → 100 pontos (100% overlap)
Analista B: [React, Node.js, MongoDB] → 50 pontos (50% overlap)
```

**Parâmetros ajustáveis:**
- ✅ `stack_experiencia` do analista - Manual no cadastro do usuário
- ✅ `stack_tecnologica` da vaga - Manual no cadastro da vaga

---

#### **2. FIT COM CLIENTE (0-100 pontos) - PESO 30%**
```
Lógica da IA:
1. Busca histórico do analista com o cliente específico
2. Considera:
   - Taxa de aprovação histórica com o cliente
   - Quantidade de vagas fechadas com o cliente
   - Feedback do cliente sobre o analista

Pontuação:
- Taxa aprovação > 80% + 5+ vagas: 100 pontos
- Taxa aprovação 60-80% + 3+ vagas: 80 pontos
- Taxa aprovação 40-60% + 1+ vaga: 60 pontos
- Sem histórico com cliente: 50 pontos (neutro)
- Taxa aprovação < 40%: 20 pontos
```

**Parâmetros ajustáveis:**
- ❌ Calculado automaticamente do histórico
- ✅ Histórico acumulado automaticamente

---

#### **3. DISPONIBILIDADE (0-100 pontos) - PESO 20%**
```
Lógica da IA:
1. Conta vagas ativas atribuídas ao analista
2. Considera capacidade ideal (5-7 vagas simultâneas)

Pontuação:
- 0-3 vagas ativas: 100 pontos (disponível)
- 4-5 vagas ativas: 80 pontos (carga normal)
- 6-7 vagas ativas: 60 pontos (carga alta)
- 8-9 vagas ativas: 40 pontos (sobrecarregado)
- 10+ vagas ativas: 20 pontos (crítico)
```

**Parâmetros ajustáveis:**
- ❌ Calculado automaticamente
- ⚠️ **SUGESTÃO:** Criar campo `capacidade_maxima` por analista

---

#### **4. TAXA DE SUCESSO HISTÓRICA (0-100 pontos) - PESO 10%**
```
Lógica da IA:
1. Busca taxa geral de aprovação do analista
2. Considera todas as vagas já trabalhadas

Pontuação:
- Taxa > 80%: 100 pontos
- Taxa 60-80%: 80 pontos
- Taxa 40-60%: 60 pontos
- Taxa 20-40%: 40 pontos
- Taxa < 20%: 20 pontos
```

**Parâmetros ajustáveis:**
- ❌ Calculado automaticamente do histórico

---

### **CÁLCULO DO SCORE DE MATCH**

```
Score Match = (
    fit_stack_tecnologica * 0.40 +
    fit_cliente * 0.30 +
    disponibilidade * 0.20 +
    taxa_sucesso_historica * 0.10
)

Máximo: 100 pontos
Mínimo: 0 pontos
```

**Pesos atuais:**
- Fit de Stack: **40%**
- Fit com Cliente: **30%**
- Disponibilidade: **20%**
- Taxa de Sucesso: **10%**

⚠️ **ATENÇÃO:** Os pesos estão hardcoded na IA. Para ajustar, seria necessário:
1. Criar tabela `config_distribuicao` com os pesos
2. Passar os pesos como parâmetro para a IA
3. Criar UI para ajustar os pesos

---

### **NÍVEL DE ADEQUAÇÃO**

Baseado no score de match:

| Score | Nível | Recomendação |
|-------|-------|--------------|
| 85-100 | **Excelente** | Altamente Recomendado |
| 70-84 | **Bom** | Recomendado |
| 50-69 | **Regular** | Adequado |
| 0-49 | **Baixo** | Não Recomendado |

**Parâmetros ajustáveis:**
- ❌ Faixas hardcoded na IA

---

### **TEMPO ESTIMADO DE FECHAMENTO**

```
Lógica da IA:
1. Busca tempo médio histórico do analista
2. Ajusta conforme:
   - Fit de stack: Melhor fit = menos tempo
   - Carga de trabalho: Mais carga = mais tempo
   - Complexidade da vaga: Mais complexa = mais tempo
3. Retorna estimativa em dias
```

**Parâmetros ajustáveis:**
- ❌ Calculado automaticamente

---

## 🎛️ PARÂMETROS AJUSTÁVEIS MANUALMENTE

### **PRIORIZAÇÃO**

| Parâmetro | Onde Ajustar | Impacto |
|-----------|--------------|---------|
| `prazo_fechamento` | Cadastro da vaga | Alto |
| `faturamento_estimado` | Cadastro da vaga | Alto |
| `cliente_vip` | Cadastro do cliente | Médio (+20 pontos) |
| `stack_tecnologica` | Cadastro da vaga | Médio |
| `senioridade` | Cadastro da vaga | Baixo |

### **DISTRIBUIÇÃO**

| Parâmetro | Onde Ajustar | Impacto |
|-----------|--------------|---------|
| `stack_experiencia` | Cadastro do analista | Alto (40%) |
| Histórico com cliente | Automático | Alto (30%) |
| Carga de trabalho | Automático | Médio (20%) |
| Taxa de aprovação | Automático | Baixo (10%) |

---

## ⚠️ LIMITAÇÕES ATUAIS

### **PESOS HARDCODED**

Os pesos dos critérios estão fixos no código da IA:

**Priorização:**
- Urgência: 25%
- Faturamento: 25%
- Tempo Aberto: 25%
- Complexidade: 25%
- VIP: +20 fixo

**Distribuição:**
- Stack: 40%
- Cliente: 30%
- Disponibilidade: 20%
- Taxa Sucesso: 10%

**Para tornar ajustável:**
1. Criar tabela `config_priorizacao` e `config_distribuicao`
2. Adicionar campos de peso (0-100%)
3. Criar UI de configuração
4. Passar pesos como parâmetro para a IA

---

## 💡 SUGESTÕES DE MELHORIA

### **1. CRIAR TABELA DE CONFIGURAÇÃO**

```sql
CREATE TABLE config_priorizacao (
    id BIGSERIAL PRIMARY KEY,
    peso_urgencia_prazo INTEGER DEFAULT 25,
    peso_faturamento INTEGER DEFAULT 25,
    peso_tempo_aberto INTEGER DEFAULT 25,
    peso_complexidade INTEGER DEFAULT 25,
    bonus_cliente_vip INTEGER DEFAULT 20,
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE config_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    peso_fit_stack INTEGER DEFAULT 40,
    peso_fit_cliente INTEGER DEFAULT 30,
    peso_disponibilidade INTEGER DEFAULT 20,
    peso_taxa_sucesso INTEGER DEFAULT 10,
    capacidade_maxima_analista INTEGER DEFAULT 7,
    atualizado_em TIMESTAMP DEFAULT NOW()
);
```

### **2. CRIAR UI DE CONFIGURAÇÃO**

Componente: `ConfiguracaoPriorizacaoDistribuicao.tsx`

**Funcionalidades:**
- Sliders para ajustar pesos
- Validação: soma dos pesos = 100%
- Preview do impacto
- Salvar configuração
- Histórico de mudanças

### **3. ADICIONAR CAMPO `capacidade_maxima` POR ANALISTA**

Permitir que cada analista tenha capacidade diferente:
- Analista Júnior: 3-5 vagas
- Analista Pleno: 5-7 vagas
- Analista Sênior: 7-10 vagas

---

## 📊 RESUMO

### **PRIORIZAÇÃO**
- ✅ 5 critérios considerados
- ✅ Score 0-120 pontos
- ⚠️ Pesos fixos (25% cada + 20 VIP)
- ✅ Parâmetros manuais: prazo, faturamento, cliente_vip, stack, senioridade

### **DISTRIBUIÇÃO**
- ✅ 4 critérios considerados
- ✅ Score 0-100 pontos
- ⚠️ Pesos fixos (40%, 30%, 20%, 10%)
- ✅ Parâmetro manual: stack_experiencia do analista
- ✅ Demais calculados automaticamente do histórico

### **RECOMENDAÇÃO**
- ✅ Implementar tabelas de configuração
- ✅ Criar UI para ajustar pesos
- ✅ Adicionar campo `capacidade_maxima` por analista
- ✅ Permitir override manual da recomendação

---

**Quer que eu implemente o sistema de configuração ajustável?** 🎛️
