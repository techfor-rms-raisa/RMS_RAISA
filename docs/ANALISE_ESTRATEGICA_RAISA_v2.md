# 🎯 ANÁLISE ESTRATÉGICA RAISA v2.0
## Atualizada com Estrutura Real do Supabase

**Data:** 25/12/2024  
**Versão:** 2.0  
**Status:** REVISADA - Banco mais completo que esperado!

---

## 🚨 DESCOBERTA IMPORTANTE

> **O banco de dados Supabase está MUITO mais completo do que os componentes React utilizam!**
> 
> Isso significa que o problema principal é de **INTEGRAÇÃO**, não de criação de tabelas.

---

## 📊 MAPEAMENTO COMPLETO - 44 TABELAS IDENTIFICADAS

### 🟢 TABELAS RAISA JÁ EXISTENTES (Não previstas na análise anterior):

| Tabela | Status | Uso Atual |
|--------|--------|-----------|
| `vaga_analise_ia` | ✅ Existe | ❌ Não integrada |
| `vaga_distribuicao` | ✅ Existe | ❌ Não integrada |
| `vaga_perguntas_tecnicas` | ✅ Existe | 🟡 Parcial (useMockData) |
| `vaga_priorizacao` | ✅ Existe | ✅ Integrada |
| `cv_template` | ✅ Existe | ❌ Não integrada |
| `cv_gerado` | ✅ Existe | ❌ Não integrada |
| `candidatura_avaliacao_ia` | ✅ Existe | ❌ Não integrada |
| `candidatura_matriz_qualificacoes` | ✅ Existe | ❌ Não integrada |
| `candidatura_respostas` | ✅ Existe | ❌ Não integrada |
| `candidato_respostas_questoes` | ✅ Existe | ❌ Não integrada |
| `questoes_inteligentes` | ✅ Existe | ❌ Não integrada |
| `recomendacoes_analista_ia` | ✅ Existe | ❌ Não integrada |
| `predicao_risco_candidato` | ✅ Existe | ❌ Não integrada |
| `analise_reprovacao_mensal` | ✅ Existe | ❌ Não integrada |
| `pergunta_resposta_avaliacao` | ✅ Existe | ❌ Não integrada |
| `priorizacao_historico` | ✅ Existe | ❌ Não integrada |
| `ia_sobrescrita_atribuicao` | ✅ Existe | ❌ Não integrada |
| `ia_sobrescrita_prioridade` | ✅ Existe | ❌ Não integrada |

---

## 📋 ESTRUTURA DETALHADA DAS TABELAS RAISA

### 1. `vagas` - Tabela Principal
```
id (integer, NOT NULL)
titulo (varchar, NOT NULL)
descricao (text)
senioridade (varchar)
stack_tecnologica (text)  ⚠️ Deveria ser ARRAY ou JSONB
salario_min (numeric)
salario_max (numeric)
status (varchar)
requisitos_obrigatorios (text)  ⚠️ Deveria ser ARRAY
requisitos_desejaveis (text)    ⚠️ Deveria ser ARRAY
regime_contratacao (varchar)
modalidade (varchar)
beneficios (text)               ⚠️ Deveria ser ARRAY
analista_id (integer)
cliente_id (integer)
urgente (boolean)
prazo_fechamento (date)
faturamento_mensal (numeric)
criado_em, atualizado_em, created_at, updated_at
```

### 2. `vaga_analise_ia` - Sugestões de Melhoria ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
vaga_id (bigint)
descricao_original (text)
fonte (varchar)
sugestoes (jsonb)              ✅ Estrutura para IA
confidence_score (integer)
confidence_detalhado (jsonb)
ajustes (jsonb)
total_ajustes (integer)
campos_ajustados (ARRAY)
qualidade_sugestao (integer)
feedback_texto (text)
analisado_em, analisado_por
revisado_em, revisado_por
aprovado (boolean)             ✅ Campo de aprovação!
requer_revisao_manual (boolean)
metadados (jsonb)
```

### 3. `vaga_distribuicao` - Atribuição de Analistas ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
vaga_id (bigint)
analista_id (bigint)
analista_nome (varchar)
tipo_distribuicao (varchar)    ✅ Pode ser 'automatica' ou 'manual'
distribuido_em, distribuido_por
score_match (integer)
justificativa_match (text)
reatribuido (boolean)          ✅ Controle de reatribuição
reatribuido_de, reatribuido_em, reatribuido_por
motivo_reatribuicao (text)
ativo (boolean)
metadados (jsonb)
```

### 4. `vaga_perguntas_tecnicas` - Questões Geradas ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
vaga_id (bigint)
pergunta_texto (text)
categoria (USER-DEFINED)       ✅ ENUM: tecnica, comportamental, experiencia
tecnologia_relacionada (varchar)
nivel_dificuldade (USER-DEFINED) ✅ ENUM: junior, pleno, senior
resposta_esperada (text)
pontos_chave (jsonb)
ordem (integer)
gerada_em, gerada_por
ativa (boolean)
metadados (jsonb)
```

### 5. `candidaturas` - Candidaturas
```
id (integer, NOT NULL)
vaga_id (integer)
pessoa_id (integer)
candidato_nome, candidato_email, candidato_cpf
analista_id (integer)
status (varchar)               ✅ Status do fluxo
curriculo_texto (text)
cv_url (varchar)
observacoes (text)
feedback_cliente (text)
data_envio_cliente (timestamp)
enviado_ao_cliente (boolean)
criado_em, atualizado_em
```

### 6. `candidatura_avaliacao_ia` - Parecer IA ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
candidatura_id (bigint)
vaga_id (bigint)
analista_id (bigint)
score_geral (integer)          ✅ 0-100%
recomendacao (USER-DEFINED)    ✅ ENUM: aprovado, reprovado, condicional
pontos_fortes (jsonb)
gaps_identificados (jsonb)     ✅ GAPs!
score_tecnico (integer)
score_experiencia (integer)
score_fit_cultural (integer)
justificativa (text)
requisitos_atendidos (jsonb)
taxa_atendimento (integer)     ✅ % Aderência!
decisao_final (varchar)
decisao_justificativa (text)
decidido_por, decidido_em
concordancia (boolean)         ✅ Se analista concordou com IA
avaliado_em, avaliado_por
metadados (jsonb)
```

### 7. `cv_template` - Templates de CV ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
nome (varchar)
descricao (text)
logo_url (text)
cor_primaria, cor_secundaria (varchar)
fonte (varchar)
secoes (jsonb)                 ✅ Estrutura do CV
template_html (text)           ✅ HTML do template
template_css (text)
ativo (boolean)
criado_em, criado_por
metadados (jsonb)
```

### 8. `cv_gerado` - CVs Padronizados ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
candidatura_id (bigint)
template_id (bigint)
cv_original_url (text)
dados_processados (jsonb)
cv_padronizado_url (text)      ✅ URL do CV gerado
cv_html (text)
aprovado (boolean)
aprovado_por, aprovado_em
diferencas (jsonb)
gerado_em, gerado_por
versao (integer)
metadados (jsonb)
```

### 9. `questoes_inteligentes` - Questões com Aprendizado ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
vaga_id (bigint, NOT NULL)
analista_id (bigint, NOT NULL)
questao (text, NOT NULL)
categoria (USER-DEFINED, NOT NULL)
subcategoria (varchar)
relevancia (integer)
motivo (text)
baseado_em_reprovacao (boolean) ✅ Learning!
reprovacao_referencia_id (bigint)
vezes_usada (integer)          ✅ Métricas
correlacao_aprovacao (numeric) ✅ Métricas
eficacia_score (integer)       ✅ Métricas
ativa (boolean)
gerada_em, gerada_por
desativada_em, motivo_desativacao
metadados (jsonb)
```

### 10. `recomendacoes_analista_ia` - Recomendações com Tracking ✅ JÁ EXISTE!
```
id (bigint, NOT NULL)
candidatura_id, vaga_id, analista_id (bigint, NOT NULL)
recomendacao (USER-DEFINED, NOT NULL)  ✅ aprovar/rejeitar/reavaliar
score_confianca (integer)
justificativa (text, NOT NULL)
red_flags (jsonb)                      ✅ Red Flags!
pontos_fortes (ARRAY)
probabilidade_aprovacao_cliente (integer)
score_tecnico, score_comportamental, score_cultural, score_experiencia (integer)
decisao_analista (USER-DEFINED)        ✅ Tracking decisão
justificativa_analista (text)
seguiu_recomendacao (boolean)          ✅ Divergência tracking
divergencia_detectada (boolean)
data_decisao (timestamp)
resultado_final (varchar)              ✅ Resultado real
motivo_resultado (text)
data_resultado (timestamp)
ia_acertou (boolean)                   ✅ Validação IA
tipo_erro (varchar)                    ✅ falso_positivo/falso_negativo
gerada_em, gerada_por, atualizada_em
metadados (jsonb)
```

---

## 🔄 MATRIZ DE ADERÊNCIA ATUALIZADA

| # | Etapa do Fluxo | DB Status | UI Status | Gap Real |
|---|---------------|-----------|-----------|----------|
| 1 | Criação de Vaga | ✅ | ✅ | Nenhum |
| 2 | IA sugere melhorias | ✅ `vaga_analise_ia` | ❌ | **INTEGRAR** |
| 3 | Aprovação dupla | 🟡 Campo `aprovado` existe | ❌ | **CRIAR WORKFLOW UI** |
| 4 | Busca automática CVs | ❌ | ❌ | **CRIAR** |
| 5 | Seleção 2 Analistas | ✅ `vaga_distribuicao` | 🟡 | **INTEGRAR + AJUSTAR** |
| 6 | Geração Questões IA | ✅ `vaga_perguntas_tecnicas` | 🔧 Mock | **INTEGRAR** |
| 7 | Entrevista (Áudio) | 🟡 | 🔧 Mock | **CRIAR STORAGE** |
| 8 | Validação CV vs Respostas | ✅ `candidatura_avaliacao_ia` | ❌ | **INTEGRAR** |
| 9 | Parecer Técnico IA | ✅ `recomendacoes_analista_ia` | ❌ | **INTEGRAR** |
| 10 | Decisão enviar cliente | ✅ `candidatura_envio` | 🔧 Mock | **INTEGRAR** |
| 11 | Geração CV Padrão | ✅ `cv_template` + `cv_gerado` | ❌ | **INTEGRAR** |
| 12 | Envio ao Cliente | ✅ `candidatura_envios` | 🔧 Mock | **INTEGRAR** |
| 13 | Entrevista Cliente | 🟡 | ❌ | **CRIAR** |
| 14 | IA analisa entrevista | ✅ | 🔧 | **INTEGRAR** |
| 15 | Registro aprendizado | ✅ `questoes_inteligentes` | ❌ | **INTEGRAR** |

---

## 🚀 ROADMAP REVISADO (Prioridade Integração)

### FASE 1 - INTEGRAÇÃO PRIORITÁRIA (Sprint 1-3)
**Objetivo:** Conectar componentes existentes ao banco real

| # | Item | Tabela Supabase | Componente | Esforço |
|---|------|-----------------|------------|---------|
| 1.1 | Integrar EntrevistaTecnica com Supabase | `vaga_perguntas_tecnicas`, `candidatura_respostas` | `EntrevistaTecnica.tsx` | 2 dias |
| 1.2 | Integrar ControleEnvios com Supabase | `candidatura_envios` | `ControleEnvios.tsx` | 2 dias |
| 1.3 | Integrar Avaliação IA | `candidatura_avaliacao_ia` | `EntrevistaTecnica.tsx` | 2 dias |
| 1.4 | Integrar Recomendações IA | `recomendacoes_analista_ia` | Novo: `RecomendacaoIAPanel.tsx` | 3 dias |

### FASE 2 - WORKFLOW DE VAGAS (Sprint 4-5)
**Objetivo:** Implementar análise e aprovação de vagas

| # | Item | Tabela Supabase | Componente | Esforço |
|---|------|-----------------|------------|---------|
| 2.1 | Criar função analyzeJobDescription | `vaga_analise_ia` | `geminiService.ts` | 2 dias |
| 2.2 | Criar UI de sugestões IA | `vaga_analise_ia` | Novo: `VagaSugestoesIA.tsx` | 3 dias |
| 2.3 | Criar workflow de aprovação | Usar campo `aprovado` | Novo: `VagaAprovacaoWorkflow.tsx` | 3 dias |
| 2.4 | Ajustar Vagas.tsx para novo fluxo | - | `Vagas.tsx` | 2 dias |

### FASE 3 - GERAÇÃO DE CV (Sprint 6-7)
**Objetivo:** Implementar CV padrão Techfor

| # | Item | Tabela Supabase | Componente | Esforço |
|---|------|-----------------|------------|---------|
| 3.1 | Criar gerenciador de templates | `cv_template` | Novo: `CVTemplateManager.tsx` | 3 dias |
| 3.2 | Criar gerador de CV | `cv_gerado` | Novo: `CVGenerator.tsx` | 4 dias |
| 3.3 | Integrar com geminiService | - | `geminiService.ts` | 2 dias |

### FASE 4 - DISTRIBUIÇÃO INTELIGENTE (Sprint 8)
**Objetivo:** Distribuir vagas para 2 analistas

| # | Item | Tabela Supabase | Componente | Esforço |
|---|------|-----------------|------------|---------|
| 4.1 | Ajustar para 2 analistas | `vaga_distribuicao` | `VagaPriorizacaoManager.tsx` | 2 dias |
| 4.2 | Implementar alternância de candidatos | Nova coluna ou lógica | `vagaPriorizacaoService.ts` | 2 dias |

### FASE 5 - ÁUDIO E TRANSCRIÇÃO (Sprint 9-11)
**Objetivo:** Upload e processamento de áudio

| # | Item | Tabela Supabase | Componente | Esforço |
|---|------|-----------------|------------|---------|
| 5.1 | Configurar Supabase Storage | - | Supabase Dashboard | 1 dia |
| 5.2 | Criar upload de áudio | Nova: `entrevista_audio` | Novo: `AudioUploader.tsx` | 3 dias |
| 5.3 | Integrar Whisper/transcrição | Nova: `entrevista_transcricao` | `geminiService.ts` | 4 dias |
| 5.4 | Separar entrevista interna/cliente | - | `EntrevistaInterna.tsx`, `EntrevistaCliente.tsx` | 4 dias |

### FASE 6 - DASHBOARDS E MÉTRICAS (Sprint 12-14)
**Objetivo:** KPIs e produtividade

| # | Item | Tabela Supabase | Componente | Esforço |
|---|------|-----------------|------------|---------|
| 6.1 | Dashboard produtividade analistas | Views existentes | Novo: `DashboardProdutividade.tsx` | 3 dias |
| 6.2 | Dashboard qualidade por cliente | `analise_reprovacao_mensal` | Novo: `DashboardQualidade.tsx` | 3 dias |
| 6.3 | Alertas de vagas esquecidas | `vaga_priorizacao` | `NotificacaoBell.tsx` | 2 dias |

---

## 📊 TABELAS A CRIAR (Mínimo necessário)

Apenas **2 tabelas** são realmente necessárias:

```sql
-- 1. Storage de Áudios de Entrevista
CREATE TABLE IF NOT EXISTS entrevista_audio (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id),
    tipo_entrevista VARCHAR(20) NOT NULL CHECK (tipo_entrevista IN ('interna', 'cliente')),
    audio_url TEXT NOT NULL,
    duracao_segundos INTEGER,
    tamanho_bytes BIGINT,
    formato VARCHAR(10),
    transcricao_status VARCHAR(20) DEFAULT 'pendente',
    uploaded_em TIMESTAMPTZ DEFAULT NOW(),
    uploaded_por BIGINT REFERENCES app_users(id),
    metadados JSONB
);

-- 2. Transcrições de Áudio
CREATE TABLE IF NOT EXISTS entrevista_transcricao (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    audio_id BIGINT NOT NULL REFERENCES entrevista_audio(id),
    candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id),
    transcricao_texto TEXT NOT NULL,
    idioma VARCHAR(10) DEFAULT 'pt-BR',
    confianca_media NUMERIC(5,2),
    palavras_total INTEGER,
    duracao_processamento_ms INTEGER,
    modelo_usado VARCHAR(50),
    processada_em TIMESTAMPTZ DEFAULT NOW(),
    metadados JSONB
);

-- Índices
CREATE INDEX idx_entrevista_audio_candidatura ON entrevista_audio(candidatura_id);
CREATE INDEX idx_entrevista_transcricao_candidatura ON entrevista_transcricao(candidatura_id);
```

---

## 🎯 CONCLUSÃO

### Antes (Análise v1):
- Estimativa: ~15 tabelas a criar
- Foco: Criação de estrutura

### Depois (Análise v2):
- **Apenas 2 tabelas** realmente necessárias
- Foco: **INTEGRAÇÃO** de componentes existentes

### Esforço Revisado:
| Fase | Antes | Depois | Redução |
|------|-------|--------|---------|
| Total Sprints | 14 | 10 | -29% |
| Tabelas a criar | 15 | 2 | -87% |
| Componentes novos | 12 | 8 | -33% |

---

## ✅ PRÓXIMOS PASSOS IMEDIATOS

1. **Aprovar** este roadmap revisado
2. **Começar Fase 1** - Integração de `EntrevistaTecnica.tsx` com Supabase
3. **Remover** uso de `useMockData()` nos componentes RAISA

---

**Claude DEV + Processos + IA + Negócios**
