# 📊 ANÁLISE REAL DO SCHEMA SUPABASE - RMS-RAISA
## Data: 28/12/2024

---

## 📈 RESUMO DO BANCO DE DADOS

| Tipo | Quantidade |
|------|------------|
| **Tabelas** | 69 |
| **Views** | 42 |
| **Funções** | 24 |
| **Triggers** | 6 |

---

## ✅ BOA NOTÍCIA: Views EXISTEM (com nomes diferentes!)

O código espera views com prefixo `vw_raisa_*`, mas o banco tem views equivalentes com prefixo `vw_*`:

| Código Espera | View Existente no Banco | Status |
|---------------|------------------------|--------|
| `vw_raisa_funil_conversao` | `vw_funil_conversao` | ✅ Existe |
| `vw_raisa_performance_analista` | `vw_performance_analista` | ✅ Existe |
| `vw_raisa_performance_cliente` | `vw_performance_cliente` | ✅ Existe |
| `vw_raisa_kpis_principais` | `vw_dashboard_resumo` | ✅ Equivalente |
| `vw_raisa_aprovacao_reprovacao` | — | ⚠️ Dados podem vir de `candidatura_aprovacoes` |
| `vw_raisa_top_clientes` | `vw_performance_cliente` | ✅ Pode usar (ordenado) |
| `vw_raisa_top_analistas` | `vw_performance_analista` | ✅ Pode usar (ordenado) |
| `vw_raisa_motivos_reprovacao` | — | ⚠️ Criar ou usar `candidatura_aprovacoes` |
| `vw_raisa_analise_tempo` | `vw_evolucao_mensal` | ✅ Equivalente |

---

## 📋 TODAS AS VIEWS DISPONÍVEIS NO SUPABASE

### Views de Compliance
- `v_compliance_at_risk`
- `v_compliance_dashboard`
- `v_compliance_recent`
- `v_compliance_trends`

### Views de Performance e Analytics
- `vw_acuracia_ia`
- `vw_carga_analista`
- `vw_comparacao_ia_vs_real`
- `vw_dashboard_resumo`
- `vw_evolucao_mensal`
- `vw_evolucao_performance_mensal`
- `vw_evolucao_por_analista`
- `vw_funil_conversao`
- `vw_metricas_distribuicao`
- `vw_ml_performance`
- `vw_performance_analista`
- `vw_performance_cliente`
- `vw_performance_distribuicao`
- `vw_performance_ia_vs_manual`
- `vw_performance_mensal_analista`
- `vw_performance_mensal_geral`
- `vw_ranking_priorizacao`
- `vw_red_flags_comuns`
- `vw_resumo_performance_analista`

### Views de Vagas e Distribuição
- `vw_alertas_ativos`
- `vw_analistas_disponiveis`
- `vw_distribuicao_vagas`
- `vw_historico_redistribuicoes`
- `vw_questoes_vaga`
- `vw_sugestoes_ia_pendentes`
- `vw_vagas_sombra`

### Views de Pessoas e Talentos
- `vw_banco_talentos`
- `vw_consultores_com_cv`

### Views de Entrevistas
- `vw_entrevistas_audio`

### Views de Movimentações
- `vw_movimentacoes_exclusoes`
- `vw_movimentacoes_inclusoes`
- `vw_movimentacoes_resumo_mensal`

### Views de Posição Comercial
- `vw_posicao_comercial`
- `vw_posicao_comercial_resumo`

### Views de Usuários e Permissões
- `vw_clientes_ativos`
- `vw_gestores_comerciais`
- `vw_perfil_permissoes_detalhadas`
- `vw_usuarios_perfis`

---

## 📋 TODAS AS TABELAS (69 total)

### Tabelas Core
- `app_users`
- `clients`
- `consultants`
- `usuarios_cliente`
- `coordenadores_cliente`
- `users`
- `perfis`
- `perfis_usuario`
- `permissoes`
- `perfil_permissoes`
- `configuracoes_sistema`

### Tabelas RAISA - Vagas
- `vagas`
- `vaga_analise_ia`
- `vaga_analista_distribuicao`
- `vaga_candidato_match`
- `vaga_distribuicao`
- `vaga_perguntas_tecnicas`
- `vaga_priorizacao`
- `vaga_questoes`

### Tabelas RAISA - Candidaturas
- `candidaturas`
- `candidatura_aprovacao`
- `candidatura_aprovacoes`
- `candidatura_avaliacao_ia`
- `candidatura_envio`
- `candidatura_envios`
- `candidatura_matriz_qualificacoes`
- `candidatura_respostas`
- `candidato_respostas`
- `candidato_respostas_questoes`

### Tabelas RAISA - Pessoas/Talentos
- `pessoas`
- `pessoa_cv_log`
- `pessoa_experiencias`
- `pessoa_formacao`
- `pessoa_idiomas`
- `pessoa_skills`

### Tabelas RAISA - Distribuição IA
- `distribuicao_candidato_historico`
- `distribuicao_decisao`
- `distribuicao_decisao_log`
- `distribuicao_sugestao_ia`
- `ia_sobrescrita_atribuicao`
- `ia_sobrescrita_prioridade`
- `redistribuicao_log`
- `priorizacao_historico`

### Tabelas RAISA - Entrevistas
- `entrevista_audio`
- `entrevista_audios`
- `entrevista_transcricao`
- `pergunta_resposta_avaliacao`
- `questoes_inteligentes`

### Tabelas RAISA - IA/ML
- `recomendacoes_analista_ia`
- `predicao_risco_candidato`
- `analise_reprovacao_mensal`
- `analista_cliente_historico`
- `analista_especializacao`
- `ml_feedback_candidatura`
- `ml_model_weights`
- `ml_predictions`
- `ml_training_history`

### Tabelas CVs
- `cv_gerado`
- `cv_template`

### Tabelas Compliance
- `campaigns`
- `compliance_campaigns`
- `consultant_behavioral_flags`
- `consultant_compliance_analysis`
- `consultant_reports`
- `email_templates`
- `feedback_responses`
- `learning_feedback_loop`
- `rh_actions`
- `templates`

---

## 🔧 SOLUÇÃO RECOMENDADA

### Opção A: Atualizar o Código (RECOMENDADO ✅)

Alterar `dashboardRaisaService.ts` para usar os nomes corretos das views:

```typescript
// ANTES:
.from('vw_raisa_funil_conversao')

// DEPOIS:
.from('vw_funil_conversao')
```

### Opção B: Criar Views Alias no Banco

Criar views com prefixo `vw_raisa_*` que apontam para as existentes:

```sql
CREATE VIEW vw_raisa_funil_conversao AS
SELECT * FROM vw_funil_conversao;
```

---

## ⚠️ VIEWS QUE PRECISAM SER CRIADAS

Apenas 2 views não têm equivalente direto:

### 1. `vw_raisa_aprovacao_reprovacao`
```sql
CREATE OR REPLACE VIEW vw_raisa_aprovacao_reprovacao AS
SELECT 
    to_char(decidido_em, 'YYYY-MM') as periodo,
    to_char(decidido_em, 'Mon/YYYY') as periodo_formatado,
    COUNT(*) as total_respostas,
    COUNT(*) FILTER (WHERE decisao = 'aprovado') as aprovacoes,
    COUNT(*) FILTER (WHERE decisao = 'reprovado') as reprovacoes,
    ROUND(100.0 * COUNT(*) FILTER (WHERE decisao = 'aprovado') / NULLIF(COUNT(*), 0), 1) as taxa_aprovacao,
    ROUND(100.0 * COUNT(*) FILTER (WHERE decisao = 'reprovado') / NULLIF(COUNT(*), 0), 1) as taxa_reprovacao
FROM candidatura_aprovacoes
WHERE decidido_em IS NOT NULL
GROUP BY to_char(decidido_em, 'YYYY-MM'), to_char(decidido_em, 'Mon/YYYY')
ORDER BY periodo DESC;
```

### 2. `vw_raisa_motivos_reprovacao`
```sql
CREATE OR REPLACE VIEW vw_raisa_motivos_reprovacao AS
SELECT 
    COALESCE(motivo_reprovacao, 'Não informado') as motivo,
    COUNT(*) as quantidade,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as percentual
FROM candidatura_aprovacoes
WHERE decisao = 'reprovado'
GROUP BY motivo_reprovacao
ORDER BY quantidade DESC;
```

---

## 📊 CONCLUSÃO

O banco de dados está **muito mais completo** do que a análise inicial sugeriu:

- ✅ **42 views** já criadas (não zero!)
- ✅ **69 tabelas** com estrutura completa
- ✅ A maioria das funcionalidades tem suporte no banco
- ⚠️ O problema era apenas **nomenclatura diferente** das views

### Próximos Passos:
1. **Atualizar `dashboardRaisaService.ts`** para usar nomes corretos das views
2. **Criar as 2 views faltantes** (aprovacao_reprovacao e motivos_reprovacao)
3. **Resolver AuthContext** - criar contexto ou usar props
4. **Adicionar rotas faltantes** no App.tsx

---

*Relatório gerado por Claude em 28/12/2024*
