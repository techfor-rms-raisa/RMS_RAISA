# 📘 Guia de Execução do Script SQL no Supabase

## 🎯 Objetivo

Este guia explica como executar o script SQL de atualização no Supabase de **produção** de forma segura.

---

## ⚠️ IMPORTANTE - LEIA ANTES DE EXECUTAR

### **1. Backup Obrigatório**

**ANTES DE EXECUTAR O SCRIPT, FAÇA BACKUP DO BANCO DE DADOS!**

No Supabase:
1. Vá em **Database** → **Backups**
2. Clique em **Create Backup**
3. Aguarde a conclusão
4. **Só execute o script após o backup estar completo**

### **2. Ambiente Correto**

- ✅ Execute em **PRODUÇÃO** (não em desenvolvimento)
- ✅ Verifique se está no projeto correto
- ✅ Tenha permissões de administrador

### **3. Horário Recomendado**

- ✅ Execute em horário de **baixo tráfego**
- ✅ Evite horário comercial
- ✅ Tempo estimado: **2-5 minutos**

---

## 📋 Passo a Passo

### **PASSO 1: Acessar o Supabase**

1. Acesse: https://app.supabase.com
2. Faça login
3. Selecione o projeto **ORBIT.AI (Produção)**

---

### **PASSO 2: Abrir o SQL Editor**

1. No menu lateral, clique em **SQL Editor**
2. Clique em **New Query**

---

### **PASSO 3: Copiar o Script**

1. Abra o arquivo: `SCRIPT_COMPLETO_SUPABASE_PRODUCAO.sql`
2. **Selecione TODO o conteúdo** (Ctrl+A)
3. **Copie** (Ctrl+C)

---

### **PASSO 4: Colar no SQL Editor**

1. No SQL Editor do Supabase
2. **Cole o script** (Ctrl+V)
3. **Revise visualmente** (role a página)

---

### **PASSO 5: Executar o Script**

1. Clique no botão **RUN** (ou pressione Ctrl+Enter)
2. **Aguarde a execução** (2-5 minutos)
3. **Não feche a página** durante a execução

---

### **PASSO 6: Verificar Resultado**

Após a execução, você deve ver:

```
✅ Script executado com sucesso!
📊 5 novas tabelas criadas para o Fluxo do Analista com IA
🔧 3 campos adicionados na tabela candidaturas
📈 3 views criadas para dashboards
⚡ 2 triggers criados para automação
```

**Se aparecer algum erro:**
- Leia a mensagem de erro
- Verifique se é um erro crítico
- Se necessário, restaure o backup

---

### **PASSO 7: Validar as Tabelas**

Execute este comando para verificar se as tabelas foram criadas:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'questoes_inteligentes',
    'candidato_respostas_questoes',
    'recomendacoes_analista_ia',
    'analise_reprovacao_mensal',
    'predicao_risco_candidato'
  )
ORDER BY table_name;
```

**Resultado esperado:**
```
analise_reprovacao_mensal
candidato_respostas_questoes
predicao_risco_candidato
questoes_inteligentes
recomendacoes_analista_ia
```

**Devem aparecer as 5 tabelas!**

---

### **PASSO 8: Verificar Views**

Execute:

```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE 'vw_%'
ORDER BY table_name;
```

**Resultado esperado:**
```
vw_acuracia_ia
vw_questoes_eficazes
vw_red_flags_comuns
```

---

### **PASSO 9: Verificar Campos Adicionados**

Execute:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'candidaturas' 
  AND column_name IN ('feedback_cliente', 'data_envio_cliente', 'enviado_ao_cliente')
ORDER BY column_name;
```

**Resultado esperado:**
```
data_envio_cliente    | timestamp with time zone
enviado_ao_cliente    | boolean
feedback_cliente      | text
```

---

## ✅ Checklist de Validação

Após executar o script, verifique:

- [ ] Backup foi criado antes da execução
- [ ] Script executou sem erros
- [ ] 5 novas tabelas foram criadas
- [ ] 3 views foram criadas
- [ ] 3 campos foram adicionados em `candidaturas`
- [ ] Triggers foram criados
- [ ] Nenhum dado existente foi perdido

---

## 🔍 Queries de Validação Completa

Execute este bloco para validar tudo de uma vez:

```sql
-- 1. Contar tabelas criadas
SELECT COUNT(*) AS tabelas_criadas
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'questoes_inteligentes',
    'candidato_respostas_questoes',
    'recomendacoes_analista_ia',
    'analise_reprovacao_mensal',
    'predicao_risco_candidato'
  );
-- Esperado: 5

-- 2. Contar views criadas
SELECT COUNT(*) AS views_criadas
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE 'vw_%';
-- Esperado: >= 3

-- 3. Verificar campos em candidaturas
SELECT COUNT(*) AS campos_adicionados
FROM information_schema.columns 
WHERE table_name = 'candidaturas' 
  AND column_name IN ('feedback_cliente', 'data_envio_cliente', 'enviado_ao_cliente');
-- Esperado: 3

-- 4. Verificar triggers
SELECT COUNT(*) AS triggers_criados
FROM information_schema.triggers 
WHERE trigger_name IN ('trigger_update_recomendacoes_ia', 'trigger_detectar_divergencia');
-- Esperado: 2
```

---

## 🐛 Troubleshooting

### **Erro: "relation already exists"**

**Causa:** Tabela já existe

**Solução:** O script usa `CREATE TABLE IF NOT EXISTS`, então isso não deve acontecer. Se acontecer, significa que você já executou o script antes.

**Ação:** Não há problema, o script é idempotente.

---

### **Erro: "column already exists"**

**Causa:** Campo já foi adicionado anteriormente

**Solução:** O script verifica se o campo existe antes de adicionar.

**Ação:** Não há problema, continue.

---

### **Erro: "permission denied"**

**Causa:** Usuário não tem permissão

**Solução:** Você precisa ser administrador do projeto Supabase.

**Ação:** Entre com uma conta de administrador.

---

### **Erro: "syntax error"**

**Causa:** Script foi colado incorretamente

**Solução:** 
1. Limpe o SQL Editor
2. Copie o script novamente
3. Cole novamente
4. Execute

---

## 📊 Estrutura Criada

### **Tabelas (5)**
1. `questoes_inteligentes` - Questões geradas por IA
2. `candidato_respostas_questoes` - Respostas dos candidatos
3. `recomendacoes_analista_ia` - Recomendações e tracking
4. `analise_reprovacao_mensal` - Análise mensal automatizada
5. `predicao_risco_candidato` - Predição de riscos

### **Views (3)**
1. `vw_acuracia_ia` - Dashboard de acurácia
2. `vw_questoes_eficazes` - Ranking de questões
3. `vw_red_flags_comuns` - Red flags mais frequentes

### **Triggers (2)**
1. `trigger_update_recomendacoes_ia` - Atualiza timestamp
2. `trigger_detectar_divergencia` - Detecta divergências automaticamente

### **Campos Adicionados (3)**
1. `candidaturas.feedback_cliente` - Feedback do cliente
2. `candidaturas.data_envio_cliente` - Data do envio
3. `candidaturas.enviado_ao_cliente` - Flag de envio

---

## 🎯 Próximos Passos

Após executar o script com sucesso:

1. ✅ **Testar os endpoints de API** (localmente primeiro)
2. ✅ **Fazer deploy dos endpoints** no Vercel
3. ✅ **Configurar o cron job** no `vercel.json`
4. ✅ **Integrar os componentes React**
5. ✅ **Testar o fluxo completo** em staging
6. ✅ **Liberar para produção**

---

## 📞 Suporte

Se encontrar problemas:

1. **Verifique os logs** do Supabase
2. **Restaure o backup** se necessário
3. **Documente o erro** (print, mensagem)
4. **Entre em contato** com o suporte

---

## ✅ Conclusão

Após seguir este guia, você terá:

- ✅ 5 novas tabelas de IA funcionando
- ✅ 3 views para dashboards
- ✅ 2 triggers automatizados
- ✅ Sistema pronto para os endpoints de API

**Tempo total:** 10-15 minutos

**Próximo arquivo:** `README_INSTALACAO.md` (para instalar os endpoints)

---

_Criado por Manus AI - 01/12/2025_
