# 📋 INSTRUÇÕES DE IMPLEMENTAÇÃO - WORKFLOW COMPLETO DE VAGAS

## 🎯 VISÃO GERAL

Este documento contém as instruções passo a passo para implementar o **Workflow Completo de Vagas** com 10 etapas no ORBIT.AI.

**Funcionalidades implementadas:**
- ✅ Melhoria de descrição de vagas pela IA
- ✅ Aprovação humana em múltiplas etapas
- ✅ Priorização dinâmica a cada 4 horas
- ✅ Redistribuição manual de vagas
- ✅ Sistema de notificações
- ✅ Análise mensal de aprendizado IA vs Humano
- ✅ Cron jobs automatizados

---

## 📦 ARQUIVOS CRIADOS/MODIFICADOS

### **1. DATABASE (SQL)**
- `database/workflow_vagas.sql` - Tabelas, views, triggers e funções

### **2. SERVICES**
- `src/services/vagaWorkflowService.ts` - Gerencia fluxo de 10 etapas
- `src/services/notificacaoService.ts` - Sistema de notificações
- `src/services/priorizacaoAprendizadoService.ts` - Análise mensal
- `src/services/cronJobsService.ts` - Cron jobs
- `services/geminiService.ts` - **ATUALIZADO** com `improveJobDescription()` e `suggestReprioritization()`

### **3. COMPONENTS**
- `src/components/NotificacaoBell.tsx` - Sino de notificações
- `src/components/VagaWorkflowManager.tsx` - Timeline de workflow
- `src/components/DescricaoAprovacaoModal.tsx` - Aprovar descrição
- `src/components/PriorizacaoAprovacaoModal.tsx` - Aprovar priorização
- `src/components/RedistribuicaoModal.tsx` - Redistribuir vaga
- `src/components/DashboardAprendizadoIA.tsx` - Dashboard de aprendizado

### **4. API (CRON JOBS)**
- `api/cron/repriorizacao.ts` - Endpoint de repriorização (4h)
- `api/cron/analise-mensal.ts` - Endpoint de análise mensal
- `api/cron/limpeza-notificacoes.ts` - Endpoint de limpeza

### **5. CONFIGURAÇÃO**
- `vercel.json` - Configuração de cron jobs

---

## 🚀 PASSO A PASSO DE IMPLEMENTAÇÃO

### **ETAPA 1: EXECUTAR SQL NO SUPABASE** ⏱️ 5 min

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Abra o arquivo `database/workflow_vagas.sql`
4. **Copie TODO o conteúdo**
5. Cole no SQL Editor do Supabase
6. Clique em **Run**
7. Verifique se todas as tabelas foram criadas:
   - `vaga_descricao_historico`
   - `notificacoes`
   - `vaga_redistribuicao_historico`
   - `vaga_repriorizacao_sugestao`

**✅ Checkpoint:** Execute `SELECT * FROM notificacoes LIMIT 1;` - deve retornar sem erro.

---

### **ETAPA 2: ADICIONAR VARIÁVEL DE AMBIENTE** ⏱️ 2 min

1. Acesse **Vercel Dashboard** > Seu Projeto > **Settings** > **Environment Variables**
2. Adicione nova variável:
   - **Name:** `CRON_SECRET`
   - **Value:** Gere uma senha forte (ex: `OrbitAI_Cron_2025_SecureKey`)
   - **Environments:** Production, Preview, Development
3. Clique em **Save**

**✅ Checkpoint:** Variável `CRON_SECRET` aparece na lista.

---

### **ETAPA 3: COPIAR ARQUIVOS PARA O PROJETO** ⏱️ 10 min

**Usando GitHub.dev (RECOMENDADO):**

1. Acesse `https://github.dev/SEU_USUARIO/SEU_REPOSITORIO`
2. Aguarde carregar o editor online
3. Copie os arquivos na seguinte ordem:

**Services:**
```
src/services/vagaWorkflowService.ts
src/services/notificacaoService.ts
src/services/priorizacaoAprendizadoService.ts
src/services/cronJobsService.ts
```

**Atualizar geminiService.ts:**
- Abra `services/geminiService.ts`
- **Adicione ao final do arquivo** as funções:
  - `improveJobDescription()`
  - `suggestReprioritization()`
- (Copie do arquivo fornecido)

**Components:**
```
src/components/NotificacaoBell.tsx
src/components/VagaWorkflowManager.tsx
src/components/DescricaoAprovacaoModal.tsx
src/components/PriorizacaoAprovacaoModal.tsx
src/components/RedistribuicaoModal.tsx
src/components/DashboardAprendizadoIA.tsx
```

**API:**
```
api/cron/repriorizacao.ts
api/cron/analise-mensal.ts
api/cron/limpeza-notificacoes.ts
```

**Configuração:**
```
vercel.json
```

4. **Commit e Push:**
   - No GitHub.dev, vá em **Source Control** (ícone de ramificação)
   - Escreva mensagem: `feat: implementar workflow completo de vagas`
   - Clique em **Commit & Push**

**✅ Checkpoint:** Vercel inicia deploy automático.

---

### **ETAPA 4: INTEGRAR COMPONENTES NA UI** ⏱️ 15 min

**4.1. Adicionar NotificacaoBell no Header**

Abra `src/components/Layout.tsx` (ou onde está o header):

```tsx
import { NotificacaoBell } from './NotificacaoBell';

// Dentro do header, adicione:
<div className="flex items-center gap-4">
  <NotificacaoBell />
  {/* ... outros itens do header ... */}
</div>
```

**4.2. Adicionar VagaWorkflowManager na página de detalhes da vaga**

Abra a página de detalhes da vaga (ex: `src/pages/VagaDetalhes.tsx`):

```tsx
import { VagaWorkflowManager } from '../components/VagaWorkflowManager';

// Dentro do componente:
<VagaWorkflowManager 
  vagaId={vagaId} 
  onWorkflowUpdate={() => {
    // Recarregar dados da vaga
  }}
/>
```

**4.3. Adicionar DashboardAprendizadoIA como nova rota**

Abra `src/App.tsx` (ou onde estão as rotas):

```tsx
import { DashboardAprendizadoIA } from './components/DashboardAprendizadoIA';

// Adicione nova rota:
<Route path="/dashboard/aprendizado-ia" element={<DashboardAprendizadoIA />} />
```

**4.4. Adicionar link no menu**

Adicione no menu lateral (apenas para Gestor de R&S):

```tsx
{user?.role === 'Gestão de Pessoas' && (
  <Link to="/dashboard/aprendizado-ia">
    <Brain className="w-5 h-5" />
    Aprendizado IA
  </Link>
)}
```

**✅ Checkpoint:** Sino de notificações aparece no header.

---

### **ETAPA 5: TESTAR CRON JOBS** ⏱️ 5 min

**Teste Manual (via Vercel):**

1. Acesse **Vercel Dashboard** > Seu Projeto > **Deployments**
2. Aguarde deploy finalizar
3. Vá em **Settings** > **Crons**
4. Verifique se os 3 cron jobs aparecem:
   - `/api/cron/repriorizacao` - A cada 4 horas
   - `/api/cron/analise-mensal` - Dia 1 do mês
   - `/api/cron/limpeza-notificacoes` - Semanalmente
5. Clique em **Run Now** no cron de repriorização
6. Verifique logs em **Logs** > **Functions**

**✅ Checkpoint:** Cron executa sem erro.

---

### **ETAPA 6: TESTAR FLUXO COMPLETO** ⏱️ 20 min

**Teste o fluxo de 10 etapas:**

1. **Criar Vaga:**
   - Vá em RAISA > Nova Vaga
   - Preencha dados básicos
   - Status inicial: `rascunho`

2. **Melhorar Descrição:**
   - Abra a vaga criada
   - Clique em "Melhorar Descrição com IA"
   - Aguarde processamento
   - Status: `aguardando_aprovacao_descricao`

3. **Aprovar Descrição:**
   - Clique em "Revisar e Aprovar Descrição"
   - Compare original vs melhorada
   - Aprove ou edite
   - Status: `descricao_aprovada`

4. **Priorizar Vaga:**
   - Sistema calcula prioridade automaticamente
   - Status: `aguardando_aprovacao_priorizacao`

5. **Aprovar Priorização:**
   - Clique em "Aprovar Priorização"
   - Revise score, nível e SLA
   - Aprove
   - Status: `priorizada_e_distribuida`

6. **Redistribuir (Opcional):**
   - Clique em "Redistribuir Vaga"
   - Selecione novo analista
   - Informe motivo
   - Confirme

7. **Verificar Notificações:**
   - Clique no sino
   - Verifique notificações geradas em cada etapa

8. **Aguardar Repriorização:**
   - Aguarde 4 horas (ou execute cron manualmente)
   - Verifique se sugestões aparecem

9. **Visualizar Dashboard de Aprendizado:**
   - Vá em Dashboard > Aprendizado IA
   - Selecione mês/ano
   - Verifique métricas e gráficos

**✅ Checkpoint:** Fluxo completo funciona sem erros.

---

## 🔧 TROUBLESHOOTING

### **Erro: "Cannot find module 'NotificacaoBell'"**
**Solução:** Verifique se o arquivo está em `src/components/NotificacaoBell.tsx`

### **Erro: "Table 'notificacoes' does not exist"**
**Solução:** Execute novamente o SQL no Supabase

### **Cron não executa**
**Solução:** 
1. Verifique se `vercel.json` está na raiz do projeto
2. Verifique se `CRON_SECRET` está configurado
3. Aguarde próximo deploy (crons só ativam após deploy)

### **IA não melhora descrição**
**Solução:**
1. Verifique se `VITE_GEMINI_API_KEY` está configurado
2. Verifique logs do Gemini no console
3. Teste função `improveJobDescription()` isoladamente

---

## 📊 MÉTRICAS DE SUCESSO

Após 1 mês de uso, você deve ver:

- ✅ **Taxa de concordância IA:** > 70%
- ✅ **Vagas priorizadas automaticamente:** 100%
- ✅ **Notificações enviadas:** > 50/mês
- ✅ **Repriorização dinâmica:** A cada 4 horas
- ✅ **Relatório mensal:** Gerado automaticamente dia 1

---

## 🎓 PRÓXIMOS PASSOS

1. **Treinar equipe:** Mostrar novo fluxo para Gestor de R&S
2. **Monitorar:** Acompanhar dashboard de aprendizado mensalmente
3. **Ajustar:** Refinar critérios de priorização conforme necessário
4. **Expandir:** Adicionar mais automações baseadas em aprendizado

---

## 📞 SUPORTE

**Dúvidas?** Consulte a documentação completa em `ENTREGA_FINAL_ORBIT_AI.md`

**Problemas técnicos?** Verifique logs em:
- Vercel: Dashboard > Logs
- Supabase: Dashboard > Logs
- Browser: Console (F12)

---

**Implementação estimada:** ~1 hora
**Complexidade:** Média
**Impacto:** Alto 🚀
