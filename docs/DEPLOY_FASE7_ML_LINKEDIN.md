# 🚀 INSTRUÇÕES DE DEPLOY - FASE 7
## Machine Learning + Integração LinkedIn

---

## 📦 LISTA DE ARQUIVOS (6 arquivos)

### 🗄️ SQL (Execute no Supabase)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 1 | `ml_learning_schema.sql` | Tabelas e funções de Machine Learning |
| 2 | `linkedin_integration_schema.sql` | Tabelas e funções de LinkedIn |

### 📁 Hooks (src/hooks/Supabase/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 3 | `useMLLearning.ts` | Hook para Machine Learning |
| 4 | `useLinkedInIntegration.ts` | Hook para LinkedIn |

### 📁 Componentes (src/components/raisa/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 5 | `DashboardMLLearning.tsx` | Dashboard de Machine Learning |
| 6 | `LinkedInImportPanel.tsx` | Painel de importação LinkedIn |

---

## 🔧 PASSO A PASSO

### ETAPA 1: SQL no Supabase

Execute os dois arquivos SQL na ordem:

```sql
-- 1. Primeiro: Machine Learning
-- Execute ml_learning_schema.sql

-- 2. Segundo: LinkedIn
-- Execute linkedin_integration_schema.sql
```

**Tabelas criadas:**

**Machine Learning:**
- `ml_feedback_candidatura` - Feedbacks de aprovação/reprovação
- `ml_model_weights` - Pesos do modelo
- `ml_training_history` - Histórico de treinamentos
- `ml_predictions` - Predições para auditoria
- `vw_ml_performance` - View de performance

**LinkedIn:**
- `linkedin_profiles` - Perfis importados
- `linkedin_vaga_match` - Matches perfil x vaga
- `linkedin_import_history` - Histórico de importações
- `linkedin_skill_mapping` - Mapeamento de skills
- `vw_linkedin_matches` - View de matches

### ETAPA 2: Copiar Arquivos

```
src/
├── hooks/
│   └── Supabase/
│       ├── useMLLearning.ts          ← NOVO
│       └── useLinkedInIntegration.ts ← NOVO
│
└── components/
    └── raisa/
        ├── DashboardMLLearning.tsx   ← NOVO
        └── LinkedInImportPanel.tsx   ← NOVO
```

### ETAPA 3: Adicionar ao Menu

No arquivo `Sidebar.tsx` ou onde você gerencia navegação:

```tsx
// Machine Learning
{
  path: '/raisa/ml',
  label: '🧠 Machine Learning',
  component: DashboardMLLearning
}

// LinkedIn
{
  path: '/raisa/linkedin',
  label: '🔗 LinkedIn',
  component: LinkedInImportPanel
}
```

### ETAPA 4: Integrar Feedback ML nas Aprovações

No componente onde você aprova/reprova candidatos, adicione:

```tsx
import { useMLLearning } from '@/hooks/Supabase/useMLLearning';

const { registrarFeedback } = useMLLearning();

// Quando aprovar:
await registrarFeedback(candidaturaId, 'aprovado');

// Quando reprovar:
await registrarFeedback(candidaturaId, 'reprovado', motivoReprovacao);
```

### ETAPA 5: Git

```powershell
git add src/hooks/Supabase/useMLLearning.ts
git add src/hooks/Supabase/useLinkedInIntegration.ts
git add src/components/raisa/DashboardMLLearning.tsx
git add src/components/raisa/LinkedInImportPanel.tsx

git commit -m "feat(raisa): FASE 7 - Machine Learning e Integração LinkedIn

- Sistema de aprendizado com aprovações/reprovações
- Dashboard de ML com visualização de pesos
- Treinamento de modelo com feedbacks
- Importação de perfis LinkedIn (JSON e manual)
- Match automático perfil x vaga
- Conversão de match em candidatura"

git push origin main
```

---

## 🧠 MACHINE LEARNING - Como Funciona

### Fluxo de Aprendizado:

```
┌──────────────────────────────────────────────────────────────┐
│                    CICLO DE APRENDIZADO                      │
│                                                              │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│   │ Candidato │───▶│  Score IA │───▶│  Envio    │           │
│   │   Novo    │    │  (Pesos)  │    │  Cliente  │           │
│   └───────────┘    └───────────┘    └─────┬─────┘           │
│                                           │                  │
│                    ┌──────────────────────┘                  │
│                    ▼                                         │
│              ┌───────────┐                                   │
│              │ Cliente   │  ✓ Aprova / ✗ Reprova            │
│              │ Decide    │                                   │
│              └─────┬─────┘                                   │
│                    │                                         │
│         ┌─────────▼─────────┐                               │
│         │  FEEDBACK         │                               │
│         │  Registrado       │                               │
│         └─────────┬─────────┘                               │
│                   │                                          │
│         ┌─────────▼─────────┐                               │
│         │  TREINAR          │  (quando tem 10+ amostras)    │
│         │  Novo Modelo      │                               │
│         └─────────┬─────────┘                               │
│                   │                                          │
│         ┌─────────▼─────────┐                               │
│         │  NOVOS PESOS      │  Skills: 30% → 35%            │
│         │  Ajustados        │  Senioridade: 25% → 22%       │
│         └───────────────────┘                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Features do Modelo:

| Feature | Peso Padrão | Descrição |
|---------|-------------|-----------|
| `skills_match_percent` | 30% | Match de skills técnicas |
| `senioridade_match` | 25% | Senioridade compatível |
| `anos_experiencia` | 15% | Anos de experiência |
| `salario_dentro_faixa` | 10% | Expectativa salarial |
| `localizacao_match` | 5% | Localização compatível |
| `formacao_relevante` | 8% | Formação acadêmica |
| `ultima_experiencia_relevante` | 7% | Experiência recente |

---

## 🔗 LINKEDIN - Como Funciona

### Fluxo de Importação:

```
┌──────────────────────────────────────────────────────────────┐
│                    FLUXO LINKEDIN                            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  1. IMPORTAR PERFIL                                 │    │
│  │     • Colar JSON (extensão Chrome)                  │    │
│  │     • Cadastro manual                               │    │
│  │     • API LinkedIn (futuro)                         │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  2. PROCESSAR PERFIL                                │    │
│  │     • Extrair skills                                │    │
│  │     • Calcular anos de experiência                  │    │
│  │     • Estimar senioridade                           │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  3. CALCULAR MATCHES                                │    │
│  │     • Para cada vaga aberta                         │    │
│  │     • Score de skills (50%)                         │    │
│  │     • Score de experiência (25%)                    │    │
│  │     • Score de senioridade (25%)                    │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  4. APROVAR MATCH                                   │    │
│  │     • Analista revisa sugestão                      │    │
│  │     • Clica "Aprovar"                               │    │
│  │     • Sistema cria candidatura automaticamente      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Como Usar Extensões Chrome:

1. Instale uma extensão como "LinkedIn Profile Exporter"
2. Acesse o perfil no LinkedIn
3. Clique para exportar JSON
4. Cole o JSON no painel de importação
5. O sistema processa automaticamente!

---

## 🧪 TESTES

### Teste 1: SQL Views

```sql
-- Testar ML
SELECT * FROM ml_model_weights;
SELECT * FROM vw_ml_performance;

-- Testar LinkedIn
SELECT * FROM linkedin_profiles;
SELECT * FROM vw_linkedin_matches;

-- Testar função de score
SELECT * FROM fn_calcular_score_ml(
  '{"skills_match_percent": 80, "senioridade_match": true, "anos_experiencia": 5}'::JSONB,
  NULL
);
```

### Teste 2: Dashboard ML

1. Acessar `/raisa/ml`
2. Ver modelo ativo
3. Ver gráfico de distribuição
4. Tentar treinar (precisa de 10+ feedbacks)

### Teste 3: LinkedIn

1. Acessar `/raisa/linkedin`
2. Cadastrar perfil manual
3. Ver matches gerados
4. Aprovar um match

---

## 📊 KPIs da FASE 7

### Machine Learning:
- Total de feedbacks coletados
- Taxa de aprovação
- Precisão do modelo (acertos)
- Versão do modelo ativo

### LinkedIn:
- Perfis importados
- Matches gerados
- Candidaturas criadas via LinkedIn
- Score médio de match

---

## 💼 VALOR PARA O NEGÓCIO

| Funcionalidade | Impacto |
|----------------|---------|
| 🧠 ML | Score mais preciso = menos reprovações |
| 📈 Aprendizado | Sistema melhora automaticamente |
| 🔗 LinkedIn | Acelera sourcing de candidatos |
| 🎯 Match | Reduz tempo de triagem manual |
| 📊 Métricas | Visibilidade da performance do modelo |

---

**Claude DEV + Negócios + IA**  
**Data:** 26/12/2024  
**Fase:** 7 - Machine Learning + LinkedIn
