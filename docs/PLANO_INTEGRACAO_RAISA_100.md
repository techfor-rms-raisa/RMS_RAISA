# 🎯 PLANO DE AÇÃO: INTEGRAÇÃO RAISA 100%

**Data:** 27/12/2024  
**Versão:** 1.0  
**Autor:** Claude DEV + Processos + Negócios  
**Objetivo:** Elevar todas as áreas RAISA para 100% de integração com Supabase

---

## 📊 DIAGNÓSTICO ATUAL

| Área | % Atual | Meta | Gap |
|------|---------|------|-----|
| Entrevista Técnica | 90% | 100% | 10% |
| Controle Envios | 90% | 100% | 10% |
| Geração de CV | 30% | 100% | **70%** |
| Recomendações IA | 40% | 100% | **60%** |
| Dashboards | 50% | 100% | 50% |
| Distribuição Inteligente | 60% | 100% | 40% |

---

## 🚀 ROADMAP DE SPRINTS

### **SPRINT 1 - GERAÇÃO DE CV (Prioridade Alta)**
**Duração:** 3-4 dias | **Impacto:** Alto | **Gap: 70%**

O CVGeneratorV2.tsx existe mas NÃO salva no Supabase. Tabelas `cv_template` e `cv_gerado` existem no banco mas não são usadas.

#### Tarefas:

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 1.1 | Criar hook `useCVGenerator` | `hooks/supabase/useCVGenerator.ts` | 4h |
| 1.2 | Criar hook `useCVTemplates` | `hooks/supabase/useCVTemplates.ts` | 2h |
| 1.3 | Integrar CVGeneratorV2 com hooks | `components/raisa/CVGeneratorV2.tsx` | 3h |
| 1.4 | Exportar hooks no index | `hooks/supabase/index.ts` | 10min |
| 1.5 | Testar fluxo completo | - | 2h |

#### Entregáveis:
- [ ] CVs gerados são salvos em `cv_gerado`
- [ ] Templates carregam de `cv_template`
- [ ] Versionamento de CVs funcional
- [ ] Preview e download funcionais

---

### **SPRINT 2 - RECOMENDAÇÃO DE CANDIDATOS (Prioridade Alta)**
**Duração:** 3-4 dias | **Impacto:** Alto | **Gap: 60%**

> ⚠️ **IMPORTANTE:** Este é o módulo RAISA para recomendações sobre CANDIDATOS em processo seletivo.
> NÃO confundir com o módulo RMS de análise de risco de CONSULTORES já alocados.

Tabela `ia_recomendacoes_candidato` existe e o service `recomendacaoAnalistaService.ts` já funciona,
mas NÃO há hook nem componente de UI que exiba as recomendações para o analista.

#### Tarefas:

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 2.1 | Criar hook `useRecomendacaoCandidato` | `hooks/supabase/useRecomendacaoCandidato.ts` | 4h |
| 2.2 | Criar componente `RecomendacaoCandidatoPanel` | `components/raisa/RecomendacaoCandidatoPanel.tsx` | 6h |
| 2.3 | Integrar no fluxo de Candidaturas | `components/raisa/Candidaturas.tsx` | 2h |
| 2.4 | Exportar hook no index | `hooks/supabase/index.ts` | 10min |
| 2.5 | Testar tracking de divergências | - | 2h |

#### Entregáveis:
- [ ] Recomendações IA sobre CANDIDATOS exibidas para analista
- [ ] Tracking de concordância/divergência (analista acatou ou não)
- [ ] Métricas de acerto da IA vs decisões manuais
- [ ] Red flags de candidatos destacados
- [ ] Score de confiança da recomendação

---

### **SPRINT 3 - DASHBOARDS (Prioridade Média)**
**Duração:** 2-3 dias | **Impacto:** Médio | **Gap: 50%**

Service `dashboardRaisaService.ts` usa Supabase, mas depende de VIEWS SQL que podem não existir.

#### Tarefas:

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 3.1 | Criar/Validar views SQL no Supabase | `database/views_dashboard_raisa.sql` | 3h |
| 3.2 | Adicionar filtro temporal real | `dashboardRaisaService.ts` | 2h |
| 3.3 | Criar hook `useRaisaMetrics` (se necessário) | `hooks/supabase/useRaisaMetrics.ts` | 2h |
| 3.4 | Testar dashboards com dados reais | - | 2h |

#### Views SQL necessárias:
```sql
- vw_raisa_funil_conversao
- vw_raisa_aprovacao_reprovacao
- vw_raisa_performance_analista
- vw_raisa_kpis_principais
- vw_raisa_top_clientes
- vw_raisa_top_analistas
- vw_raisa_motivos_reprovacao
- vw_raisa_performance_cliente
- vw_raisa_analise_tempo
```

#### Entregáveis:
- [ ] Todas as views criadas no Supabase
- [ ] Dashboards exibem dados reais
- [ ] Filtro temporal funcional

---

### **SPRINT 4 - DISTRIBUIÇÃO INTELIGENTE (Prioridade Média)**
**Duração:** 2 dias | **Impacto:** Médio | **Gap: 40%**

Hooks `useDistribuicaoIA` e `useDistribuicaoVagas` existem. Falta garantir uso em todos os fluxos.

#### Tarefas:

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 4.1 | Integrar no fluxo de criação de vaga | `components/raisa/VagasCriar.tsx` | 2h |
| 4.2 | Adicionar métricas de IA vs Manual | `DistribuicaoIAPanel.tsx` | 2h |
| 4.3 | Garantir 2 analistas por vaga | `useDistribuicaoVagas.ts` | 2h |
| 4.4 | Testar redistribuição | - | 1h |

#### Entregáveis:
- [ ] Toda vaga criada passa pela IA
- [ ] 2 analistas atribuídos automaticamente
- [ ] Override manual com justificativa
- [ ] Métricas de acurácia

---

### **SPRINT 5 - ENTREVISTA TÉCNICA + CONTROLE ENVIOS (Finalização)**
**Duração:** 1-2 dias | **Impacto:** Baixo | **Gap: 10% cada**

Ambos estão em 90%, faltam pequenos ajustes.

#### Tarefas Entrevista Técnica:

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 5.1 | Integrar com `questoes_inteligentes` | `useRaisaInterview.ts` | 2h |
| 5.2 | Salvar feedback de aprendizado | `useRaisaInterview.ts` | 1h |

#### Tarefas Controle Envios:

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 5.3 | Integrar envio de email real | `useRaisaEnvios.ts` | 2h |
| 5.4 | Adicionar templates de email | `ControleEnvios.tsx` | 1h |

---

## 📋 SEQUÊNCIA DE EXECUÇÃO

```
┌─────────────────────────────────────────────────────────────────┐
│  SEMANA 1                                                        │
├─────────────────────────────────────────────────────────────────┤
│  SPRINT 1: Geração de CV (30% → 100%)                           │
│  ├─ Dia 1-2: Criar hooks useCVGenerator + useCVTemplates        │
│  ├─ Dia 3: Integrar CVGeneratorV2.tsx                           │
│  └─ Dia 4: Testes                                               │
├─────────────────────────────────────────────────────────────────┤
│  SPRINT 2: Recomendações IA (40% → 100%)                        │
│  ├─ Dia 5-6: Criar hook useRecomendacoesIA                      │
│  ├─ Dia 7: Criar RecomendacaoIAPanel                            │
│  └─ Dia 8: Integrar em Candidaturas.tsx                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SEMANA 2                                                        │
├─────────────────────────────────────────────────────────────────┤
│  SPRINT 3: Dashboards (50% → 100%)                              │
│  ├─ Dia 9: Criar views SQL no Supabase                          │
│  ├─ Dia 10: Ajustar dashboardRaisaService                       │
│  └─ Dia 11: Testes com dados reais                              │
├─────────────────────────────────────────────────────────────────┤
│  SPRINT 4: Distribuição Inteligente (60% → 100%)                │
│  ├─ Dia 12: Integrar no fluxo de criação                        │
│  └─ Dia 13: Garantir 2 analistas + métricas                     │
├─────────────────────────────────────────────────────────────────┤
│  SPRINT 5: Finalização (90% → 100%)                             │
│  ├─ Dia 14: Entrevista Técnica + questoes_inteligentes          │
│  └─ Dia 15: Controle Envios + email real                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 ORDEM DE PRIORIDADE

| Prioridade | Sprint | Área | Justificativa |
|------------|--------|------|---------------|
| 🔴 **1** | Sprint 1 | Geração de CV | Gap de 70%, funcionalidade core do RAISA |
| 🔴 **2** | Sprint 2 | Recomendações IA | Gap de 60%, diferencial competitivo |
| 🟡 **3** | Sprint 3 | Dashboards | Visibilidade para gestão |
| 🟡 **4** | Sprint 4 | Distribuição | Automação de processos |
| 🟢 **5** | Sprint 5 | Finalização | Polimento final |

---

## ✅ CHECKLIST DE ARQUIVOS A CRIAR/ALTERAR

### Novos Arquivos:
- [ ] `src/hooks/supabase/useCVGenerator.ts`
- [ ] `src/hooks/supabase/useCVTemplates.ts`
- [ ] `src/hooks/supabase/useRecomendacaoCandidato.ts` *(RAISA - Candidatos)*
- [ ] `src/components/raisa/RecomendacaoCandidatoPanel.tsx` *(RAISA - Candidatos)*
- [ ] `database/views_dashboard_raisa.sql`

### Arquivos a Alterar:
- [ ] `src/hooks/supabase/index.ts` (adicionar exports)
- [ ] `src/components/raisa/CVGeneratorV2.tsx` (integrar hooks)
- [ ] `src/components/raisa/Candidaturas.tsx` (adicionar painel de recomendação)
- [ ] `src/components/raisa/VagasCriar.tsx` (distribuição IA)
- [ ] `src/services/dashboardRaisaService.ts` (filtros)
- [ ] `src/hooks/supabase/useRaisaInterview.ts` (questões inteligentes)
- [ ] `src/hooks/supabase/useRaisaEnvios.ts` (email real)

---

## 📊 MÉTRICAS DE SUCESSO

| KPI | Antes | Depois |
|-----|-------|--------|
| % Integração Geral | 75% | 100% |
| Funcionalidades RAISA ativas | 60% | 100% |
| Dados em mock | ~10% | 0% |
| Tabelas Supabase utilizadas | 30/44 | 44/44 |

---

## 🚨 RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Views SQL não existem no Supabase | Alta | Alto | Criar scripts SQL primeiro |
| Conflito de tipos TypeScript | Média | Médio | Validar types.ts antes |
| Dados de teste insuficientes | Média | Baixo | Criar seeds de teste |

---

## 💬 PRÓXIMO PASSO IMEDIATO

**Recomendação:** Começar pelo **SPRINT 1 - Geração de CV**

Motivos:
1. Maior gap (70%)
2. Funcionalidade crítica para negócio
3. Tabelas já existem no banco
4. Componente UI já existe (só falta integrar)

---

**Aguardando sua aprovação para iniciar o Sprint 1!** 🚀

---

*Claude DEV + Processos + Negócios*
