# RMS-RAISA.ai
## AI-Powered Recruitment & Risk Management Platform

---

# Sistema de Priorização e Distribuição Inteligente de Vagas

### Documentação Técnica e Funcional
**Versão 2.6 | Janeiro 2026**

---

## 1. Sumário Executivo

O **Sistema de Priorização e Distribuição Inteligente de Vagas** é um módulo avançado do RMS-RAISA que utiliza **Inteligência Artificial (Google Gemini)** para automatizar e otimizar o processo de alocação de vagas aos analistas de Recrutamento e Seleção.

O sistema substitui decisões baseadas em **feeling ou conhecimento tácito** por análises objetivas baseadas em dados históricos, métricas de performance e critérios configuráveis, garantindo maior eficiência e transparência no processo.

### 1.1 Principais Benefícios

| Benefício | Descrição |
|-----------|-----------|
| **Objetividade** | Decisões baseadas em dados concretos e métricas mensuráveis |
| **Equilíbrio de Carga** | Distribuição justa de trabalho entre analistas |
| **Aprendizado Contínuo** | Sistema aprende com resultados anteriores |
| **Transparência** | Justificativa clara para cada recomendação da IA |
| **Flexibilidade** | Gestor pode aceitar ou sobrescrever sugestões |

---

## 2. Cálculo do Score de Prioridade

A IA analisa múltiplos critérios para gerar um **Score de Prioridade de 0 a 100** para cada vaga. Este score determina a ordem de atendimento e o nível de urgência.

### 2.1 Critérios de Avaliação

| Critério | Peso | Descrição |
|----------|------|-----------|
| **Urgência do Prazo** | Alto | Quanto mais próximo o deadline, maior a prioridade |
| **Faturamento Estimado** | Alto | Vagas com maior valor financeiro recebem maior atenção |
| **Cliente VIP** | +20 pts | Clientes estratégicos recebem pontuação adicional automática |
| **Tempo em Aberto** | Médio | Vagas antigas requerem atenção para evitar SLA estourado |
| **Complexidade da Stack** | Médio | Tecnologias raras ou complexas exigem mais tempo de busca |

### 2.2 Níveis de Prioridade

| Nível | Score | Indicador | Ação Recomendada |
|-------|-------|-----------|------------------|
| 🔴 **ALTA** | 80 - 100 | Crítico | Atendimento imediato. Prioridade máxima na distribuição. |
| 🟡 **MÉDIA** | 50 - 79 | Atenção | Atendimento em até 48h. Monitorar evolução. |
| 🟢 **BAIXA** | 0 - 49 | Normal | Atendimento conforme disponibilidade. Pode aguardar. |

---

## 3. Recomendação Inteligente de Analistas

Após calcular a prioridade da vaga, o sistema analisa o perfil de cada analista disponível e gera um **ranking de adequação (Match Score)** com ponderação específica.

### 3.1 Critérios de Match

| Critério | Peso | O que Analisa |
|----------|------|---------------|
| **Fit de Stack Tecnológica** | 40% | Overlap entre tecnologias da vaga e experiência do analista |
| **Fit com Cliente** | 30% | Histórico de aprovação com aquele cliente específico |
| **Disponibilidade** | 20% | Carga atual de trabalho (menos vagas = melhor score) |
| **Taxa de Sucesso** | 10% | Taxa geral de aprovação histórica do analista |

### 3.2 Fórmula de Cálculo

```
Match Score = (Fit Stack × 0.40) + (Fit Cliente × 0.30) + (Disponibilidade × 0.20) + (Taxa Sucesso × 0.10)
```

### 3.3 Níveis de Adequação

| Nível | Score | Indicador | Significado |
|-------|-------|-----------|-------------|
| ⭐ **EXCELENTE** | 85 - 100 | Top Match | Analista ideal para a vaga. Alta probabilidade de sucesso. |
| ✅ **BOM** | 70 - 84 | Recomendado | Boa adequação. Recomendado com confiança. |
| ⚠️ **REGULAR** | 50 - 69 | Alternativo | Adequação moderada. Considerar alternativas. |
| ❌ **BAIXO** | 0 - 49 | Evitar | Pouca adequação. Atribuir apenas se necessário. |

---

## 4. Fluxo Operacional do Sistema

### 4.1 Diagrama do Processo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. ACIONAMENTO                                                  │
│    Usuário clica em "Priorizar" no card da vaga                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. COLETA DE DADOS DA VAGA                                      │
│    • Título, Cliente (VIP?), Prazo, Faturamento                 │
│    • Stack tecnológica, Senioridade                             │
│    • Dias em aberto, Histórico de vagas similares               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. CÁLCULO DE PRIORIDADE (IA Gemini)                            │
│    → Score de Prioridade (0-100)                                │
│    → SLA sugerido (dias para fechar)                            │
│    → Justificativa detalhada dos fatores                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. COLETA DE DADOS DOS ANALISTAS                                │
│    • Stack de experiência de cada analista                      │
│    • Carga atual de trabalho (vagas ativas)                     │
│    • Taxa de aprovação histórica geral                          │
│    • Histórico específico com o cliente da vaga                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. RANKING DE ANALISTAS (IA Gemini)                             │
│    → Match Score para cada analista                             │
│    → Ordenação do mais ao menos adequado                        │
│    → Justificativa para cada recomendação                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. DECISÃO DO GESTOR                                            │
│    • Aceitar sugestão da IA (recomendado)                       │
│    • Escolher outro analista manualmente                        │
│    • Redistribuir para outro momento                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. ATRIBUIÇÃO E REGISTRO                                        │
│    • Vaga atribuída ao analista selecionado                     │
│    • Registro no histórico com timestamp                        │
│    • Notificação ao analista (se configurado)                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Dados Utilizados pelo Sistema

| Fonte de Dados | Informações Coletadas |
|----------------|----------------------|
| **Tabela: vagas** | Título, prazo, faturamento, stack, senioridade, urgência, data criação |
| **Tabela: clients** | Nome do cliente, flag VIP |
| **Tabela: app_users** | Analistas ativos, tipo de usuário |
| **View: vw_raisa_analise_tempo** | Tempo médio de fechamento por senioridade/stack |
| **Tabela: vaga_priorizacao** | Score calculado, justificativa, SLA, fatores considerados |
| **Tabela: vaga_analista_distribuicao** | Histórico de atribuições, analista responsável |
| **Tabela: config_priorizacao** | Pesos e parâmetros configuráveis |

---

## 5. Configurações e Personalização

O sistema permite que administradores ajustem os pesos e parâmetros utilizados nos cálculos, adaptando-o às necessidades específicas da operação.

### 5.1 Parâmetros Configuráveis

- **Pesos dos Critérios de Prioridade**: Ajustar importância de cada fator (urgência, faturamento, etc.)
- **Pesos dos Critérios de Match**: Modificar ponderação (stack 40%, cliente 30%, etc.)
- **Limites de Carga por Analista**: Definir máximo de vagas simultâneas
- **Bônus de Cliente VIP**: Ajustar pontuação adicional para clientes estratégicos
- **SLA Padrão por Senioridade**: Definir prazos base para cada nível

### 5.2 Autonomia do Gestor

Embora o sistema forneça recomendações baseadas em IA, o gestor mantém **total autonomia** para:

- ✓ Aceitar ou rejeitar a sugestão de prioridade
- ✓ Escolher um analista diferente do recomendado
- ✓ Redistribuir vagas já atribuídas
- ✓ Ajustar SLAs manualmente quando necessário
- ✓ Sobrescrever scores em casos excepcionais

---

## 6. Arquitetura Técnica

### 6.1 Stack Tecnológica

| Componente | Tecnologia |
|------------|------------|
| **Frontend** | React 18 + TypeScript + Tailwind CSS |
| **Backend/API** | Vercel Serverless Functions |
| **Banco de Dados** | Supabase (PostgreSQL) |
| **Inteligência Artificial** | Google Gemini 2.0 Flash |
| **Autenticação** | Supabase Auth |
| **Hospedagem** | Vercel |

### 6.2 Arquivos Principais

| Arquivo | Localização | Função |
|---------|-------------|--------|
| `vagaPriorizacaoService.ts` | `/src/services/` | Orquestração do cálculo e distribuição |
| `geminiService.ts` | `/src/services/` | Comunicação com IA Gemini |
| `usePriorizacaoDistribuicao.ts` | `/src/hooks/supabase/` | Hook React para estado e ações |
| `VagaPriorizacaoManager.tsx` | `/src/components/raisa/` | Interface do modal de priorização |
| `priorizacaoAprendizadoService.ts` | `/src/services/` | Machine learning e feedback |

### 6.3 Modelo de Dados (Tabelas)

```sql
-- Score de prioridade calculado
CREATE TABLE vaga_priorizacao (
    id SERIAL PRIMARY KEY,
    vaga_id INTEGER REFERENCES vagas(id),
    score_prioridade INTEGER CHECK (score_prioridade BETWEEN 0 AND 100),
    nivel_prioridade VARCHAR(10), -- 'Alta', 'Média', 'Baixa'
    sla_dias INTEGER,
    justificativa TEXT,
    fatores_considerados JSONB,
    calculado_em TIMESTAMP DEFAULT NOW()
);

-- Distribuição de vaga para analista
CREATE TABLE vaga_analista_distribuicao (
    id SERIAL PRIMARY KEY,
    vaga_id INTEGER REFERENCES vagas(id),
    analista_id INTEGER REFERENCES app_users(id),
    match_score INTEGER,
    atribuido_em TIMESTAMP DEFAULT NOW(),
    atribuido_por INTEGER REFERENCES app_users(id)
);

-- Configurações customizáveis
CREATE TABLE config_priorizacao (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100),
    peso_urgencia DECIMAL(3,2) DEFAULT 0.25,
    peso_faturamento DECIMAL(3,2) DEFAULT 0.25,
    peso_tempo_aberto DECIMAL(3,2) DEFAULT 0.20,
    peso_complexidade DECIMAL(3,2) DEFAULT 0.15,
    bonus_vip INTEGER DEFAULT 20,
    ativa BOOLEAN DEFAULT true
);
```

---

## 7. Exemplos de Uso

### 7.1 Exemplo: Vaga de Alta Prioridade

**Cenário:**
- Vaga: Desenvolvedor Java Sênior
- Cliente: Banco XYZ (VIP)
- Prazo: 5 dias
- Faturamento: R$ 25.000/mês
- Dias em aberto: 8 dias

**Resultado da IA:**
```json
{
  "score_prioridade": 92,
  "nivel_prioridade": "Alta",
  "sla_dias": 3,
  "justificativa": "Vaga crítica devido a: (1) Cliente VIP com histórico 
    de grandes contratos, (2) Prazo de apenas 5 dias, (3) Alto valor de 
    faturamento, (4) Tempo em aberto já excede média de vagas similares."
}
```

### 7.2 Exemplo: Recomendação de Analista

**Cenário:**
Mesma vaga acima, 3 analistas disponíveis.

**Ranking gerado:**

| Posição | Analista | Match Score | Motivo |
|---------|----------|-------------|--------|
| 1º | Maria Silva | 94% | Stack Java 100%, 85% aprovação com Banco XYZ, carga baixa |
| 2º | João Santos | 78% | Stack Java 90%, sem histórico com cliente, carga média |
| 3º | Ana Costa | 52% | Stack Java 60%, boa taxa geral mas carga alta |

---

## 8. Métricas e KPIs

O sistema monitora automaticamente:

| Métrica | Descrição | Meta |
|---------|-----------|------|
| **Taxa de Acerto da IA** | % de sugestões aceitas pelo gestor | > 80% |
| **SLA Cumprido** | % de vagas fechadas dentro do prazo sugerido | > 85% |
| **Tempo Médio de Alocação** | Dias entre abertura e atribuição | < 2 dias |
| **Distribuição de Carga** | Desvio padrão de vagas por analista | < 15% |
| **Satisfação do Cliente** | NPS após fechamento de vaga | > 8.0 |

---

## 9. Roadmap Futuro

- [ ] **v2.7**: Integração com calendário para agendamentos automáticos
- [ ] **v2.8**: Alertas proativos de SLA em risco
- [ ] **v2.9**: Dashboard de performance por analista
- [ ] **v3.0**: Modelo de ML próprio (substituir Gemini)

---

## 10. Suporte e Contato

**TechFor TI - RMS-RAISA.ai**

Para dúvidas ou sugestões sobre este módulo:
- Documentação técnica completa no repositório
- Suporte via canal interno do projeto

---

*Documento gerado automaticamente | Janeiro 2026*
*Versão 2.6 do Sistema RMS-RAISA*
