# 📝 CHANGELOG - ORBIT.AI

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

---

## [2.1.0] - 2025-12-01

### ✨ Adicionado

#### **Endpoints de API (4 novos)**
- `api/questoes-inteligentes.ts` - Gerenciamento de questões personalizadas
  - POST `/api/questoes-inteligentes/gerar` - Gera questões para vaga
  - POST `/api/questoes-inteligentes/responder` - Salva respostas
  - GET `/api/questoes-inteligentes/:vagaId` - Busca questões

- `api/recomendacao-analista.ts` - Recomendações inteligentes
  - POST `/api/recomendacao-analista/analisar` - Analisa candidato
  - POST `/api/recomendacao-analista/enviar-cv` - Detecta divergências
  - GET `/api/recomendacao-analista/:candidaturaId` - Busca recomendação

- `api/predicao-riscos.ts` - Predição de riscos
  - POST `/api/predicao-riscos/prever` - Prevê risco
  - POST `/api/predicao-riscos/gerar-alertas` - Gera alertas
  - GET `/api/predicao-riscos/:candidaturaId` - Busca predição
  - GET `/api/predicao-riscos/dashboard/:vagaId` - Dashboard

- `api/cron/analise-reprovacoes.ts` - Análise mensal automatizada
  - Executa dia 1 de cada mês às 02:00
  - Analisa padrões de reprovação
  - Mede acurácia da IA
  - Identifica red flags recorrentes

#### **Tabelas do Banco de Dados (5 novas)**
- `questoes_inteligentes` - Questões geradas por IA
- `candidato_respostas_questoes` - Respostas dos candidatos
- `recomendacoes_analista_ia` - Recomendações e tracking de acurácia
- `analise_reprovacao_mensal` - Análise mensal de padrões
- `predicao_risco_candidato` - Predição de riscos

#### **Campos Adicionados**
- `candidaturas.feedback_cliente` (TEXT) - Feedback do cliente
- `candidaturas.data_envio_cliente` (TIMESTAMPTZ) - Data de envio
- `candidaturas.enviado_ao_cliente` (BOOLEAN) - Flag de envio

#### **Views para Dashboards (3 novas)**
- `vw_acuracia_ia` - Dashboard de acurácia ao longo do tempo
- `vw_questoes_eficazes` - Ranking de questões mais eficazes
- `vw_red_flags_comuns` - Red flags mais frequentes

#### **Triggers Automatizados (2 novos)**
- `trigger_update_recomendacoes_ia` - Atualiza timestamps
- `trigger_detectar_divergencia` - Detecta divergências IA vs Analista

#### **Componentes React (4 novos)**
- `QuestoesRecomendadasPanel.tsx` - Painel de questões inteligentes
- `RecomendacaoIACard.tsx` - Card de recomendação da IA
- `FeedbackClienteModal.tsx` - Modal para feedback do cliente
- `DashboardAprendizadoReprovacoes.tsx` - Dashboard de aprendizado

#### **Services (4 novos)**
- `questoesInteligentesService.ts` - Lógica de questões
- `recomendacaoAnalistaService.ts` - Lógica de recomendações
- `aprendizadoReprovacaoService.ts` - Lógica de aprendizado
- `predicaoRiscosService.ts` - Lógica de predição

#### **Funções de IA (5 novas)**
- `geminiService.recommendQuestionsForVaga()` - Gera questões personalizadas
- `geminiService.recommendCandidateDecision()` - Recomenda decisão
- `geminiService.identifyRedFlags()` - Identifica red flags
- `geminiService.analyzeRejectionPatterns()` - Analisa padrões mensais
- `geminiService.predictCandidateRisk()` - Prevê risco de reprovação

#### **Documentação (7 novos arquivos)**
- `README_PRINCIPAL.md` - Visão geral do sistema
- `DOCS_FLUXO_ANALISTA_IA.md` - Documentação técnica completa
- `README_INSTALACAO.md` - Guia de instalação
- `RESUMO_ENTREGA.md` - Resumo executivo
- `database/SCRIPT_UNICO_COMPLETO_SUPABASE.sql` - Script SQL completo
- `database/GUIA_EXECUCAO_SQL.md` - Guia de execução SQL
- `CHANGELOG.md` - Este arquivo

### 🔧 Modificado

- `geminiService.ts` - Adicionadas 5 novas funções de IA
- `database/` - Reorganizada estrutura de scripts SQL
- `vercel.json` - Adicionado cron job de análise mensal

### 🐛 Corrigido

- Corrigida view `vw_red_flags_comuns` que causava erro de agregação
- Corrigidos tipos ENUM que não suportavam `IF NOT EXISTS`
- Ajustadas foreign keys em tabelas de IA

### 📊 Estatísticas

- **Linhas de código adicionadas:** ~3.500
- **Arquivos novos:** 22
- **Arquivos modificados:** 3
- **Endpoints de API:** +10
- **Tabelas no banco:** +5
- **Componentes React:** +4
- **Funções de IA:** +5

---

## [2.0.0] - 2025-11-28

### ✨ Adicionado

#### **Sistema RMS (Risk Management System)**
- Gestão de consultores
- Relatórios de acompanhamento
- Flags comportamentais
- Learning feedback loop

#### **Sistema RAISA (Recruitment AI System Assistant)**
- Gestão de pessoas (candidatos)
- Gestão de vagas
- Gestão de candidaturas
- Análise proativa de vagas com IA
- Perguntas técnicas geradas por IA
- Matriz de qualificações
- Avaliação final com IA

#### **Módulo de Compliance**
- Templates de email
- Campanhas de compliance
- Feedback requests
- Feedback responses
- Ações de RH

#### **Priorização e Distribuição**
- Distribuição automática de vagas
- Priorização inteligente
- Histórico de priorizações
- Ajustes manuais

#### **Workflow de Entrevistas**
- Geração de perguntas técnicas
- Coleta de respostas
- Avaliação de respostas
- Tunning de IA

#### **Geração de CVs**
- Templates de CV
- CVs padronizados
- Aprovação de CVs

### 📊 Estatísticas

- **Tabelas criadas:** 23
- **Endpoints de API:** 15+
- **Componentes React:** 20+
- **Services:** 10+

---

## [1.0.0] - 2025-11-01

### ✨ Inicial

- Estrutura básica do projeto
- Configuração do Vite + React + TypeScript
- Configuração do Supabase
- Autenticação básica
- Layout principal

---

## 🔮 Planejado

### [2.2.0] - Futuro

- [ ] Integração com LinkedIn para busca de candidatos
- [ ] Análise de sentimento em feedbacks
- [ ] Predição de tempo de fechamento de vaga
- [ ] Recomendação de salário baseada em mercado
- [ ] Dashboard executivo com métricas de IA
- [ ] Exportação de relatórios em PDF
- [ ] Notificações push
- [ ] App mobile

### [3.0.0] - Futuro

- [ ] Multi-tenancy completo
- [ ] White-label para clientes
- [ ] API pública
- [ ] Webhooks
- [ ] Integrações com ATS externos
- [ ] Machine Learning local (sem dependência de APIs)

---

## 📝 Notas de Versão

### Convenções de Versionamento

Este projeto segue [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0) - Mudanças incompatíveis com versões anteriores
- **MINOR** (0.X.0) - Novas funcionalidades compatíveis
- **PATCH** (0.0.X) - Correções de bugs

### Categorias de Mudanças

- **✨ Adicionado** - Novas funcionalidades
- **🔧 Modificado** - Mudanças em funcionalidades existentes
- **🗑️ Removido** - Funcionalidades removidas
- **🐛 Corrigido** - Correções de bugs
- **🔐 Segurança** - Correções de vulnerabilidades
- **📚 Documentação** - Mudanças na documentação
- **⚡ Performance** - Melhorias de performance

---

_Última atualização: 01/12/2025_
