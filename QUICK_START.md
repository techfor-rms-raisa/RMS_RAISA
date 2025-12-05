# ⚡ QUICK START - ORBIT.AI V2.1

**Guia rápido para colocar o sistema no ar em 30 minutos!**

---

## 🎯 PRÉ-REQUISITOS

- [ ] Conta no Supabase (https://supabase.com)
- [ ] Conta no Vercel (https://vercel.com)
- [ ] Chave da API do Google Gemini (https://ai.google.dev)
- [ ] Git instalado
- [ ] Node.js 18+ instalado

---

## 🚀 PASSO A PASSO (30 MINUTOS)

### **1. EXTRAIR O ZIP (1 min)**

```bash
# Extrair o ZIP
unzip orbit-ai-sistema-completo-v2.1-FINAL.zip
cd orbit-ai-final
```

---

### **2. INSTALAR DEPENDÊNCIAS (2 min)**

```bash
npm install
```

---

### **3. CONFIGURAR SUPABASE (10 min)**

#### **3.1. Criar Projeto**
1. Acesse: https://app.supabase.com
2. Clique em "New Project"
3. Preencha:
   - Name: `orbit-ai-prod`
   - Database Password: (anote!)
   - Region: `South America (São Paulo)`
4. Clique em "Create new project"
5. Aguarde 2-3 minutos

#### **3.2. Executar Script SQL**
1. No menu lateral, clique em **SQL Editor**
2. Clique em **New Query**
3. Abra o arquivo: `database/SCRIPT_UNICO_COMPLETO_SUPABASE.sql`
4. Copie TODO o conteúdo (Ctrl+A, Ctrl+C)
5. Cole no SQL Editor (Ctrl+V)
6. Clique em **RUN** (ou Ctrl+Enter)
7. Aguarde 3-7 minutos
8. Deve aparecer: ✅ Script executado com sucesso!

#### **3.3. Copiar Credenciais**
1. No menu lateral, clique em **Settings** → **API**
2. Copie:
   - `Project URL` (ex: https://xxx.supabase.co)
   - `anon public` key (começando com "eyJ...")

---

### **4. CONFIGURAR GEMINI (2 min)**

1. Acesse: https://ai.google.dev/gemini-api/docs/api-key
2. Clique em "Get API Key"
3. Clique em "Create API Key"
4. Copie a chave (começando com "AIza...")

---

### **5. CRIAR .env.local (1 min)**

Crie o arquivo `.env.local` na raiz do projeto:

```env
# Supabase
DATABASE_URL=https://xxx.supabase.co
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Google Gemini
GEMINI_API_KEY=AIza...

# Cron Secret (gere um token aleatório)
CRON_SECRET=seu-token-secreto-aqui
```

**Dica:** Para gerar o CRON_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### **6. TESTAR LOCALMENTE (2 min)**

```bash
npm run dev
```

Acesse: http://localhost:5173

**Teste:**
- [ ] Login funciona
- [ ] Dashboard carrega
- [ ] Vagas aparecem

---

### **7. FAZER COMMIT NO GIT (3 min)**

```bash
# Inicializar Git (se ainda não tiver)
git init

# Adicionar arquivos
git add .

# Fazer commit
git commit -m "feat: sistema completo v2.1 com IA"

# Criar repositório no GitHub
# Acesse: https://github.com/new
# Nome: orbit-ai
# Clique em "Create repository"

# Adicionar remote
git remote add origin https://github.com/SEU-USUARIO/orbit-ai.git

# Push
git branch -M main
git push -u origin main
```

---

### **8. DEPLOY NO VERCEL (5 min)**

#### **8.1. Importar Projeto**
1. Acesse: https://vercel.com
2. Clique em "Add New..." → "Project"
3. Clique em "Import Git Repository"
4. Selecione `orbit-ai`
5. Clique em "Import"

#### **8.2. Configurar Variáveis**
1. Em "Environment Variables", adicione:
   - `DATABASE_URL` = (URL do Supabase)
   - `SUPABASE_URL` = (URL do Supabase)
   - `SUPABASE_ANON_KEY` = (Chave anon do Supabase)
   - `GEMINI_API_KEY` = (Chave do Gemini)
   - `CRON_SECRET` = (Mesmo do .env.local)

2. Clique em "Deploy"
3. Aguarde 2-3 minutos

#### **8.3. Configurar Cron Jobs**
1. Após o deploy, vá em **Settings** → **Cron Jobs**
2. Verifique se os 3 cron jobs foram detectados:
   - `analise-reprovacoes` (mensal)
   - `analise-mensal` (mensal)
   - `repriorizacao` (diário)
3. Se não aparecerem, adicione manualmente conforme `vercel.json`

---

### **9. TESTAR EM PRODUÇÃO (2 min)**

1. Acesse: https://seu-projeto.vercel.app
2. Faça login
3. Teste as funcionalidades

**Teste os endpoints:**
```bash
# Gerar questões
curl https://seu-projeto.vercel.app/api/questoes-inteligentes/gerar \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"vagaId": "1", "analistaId": "1"}'

# Deve retornar: { success: true, questoes: [...] }
```

---

### **10. VALIDAR INSTALAÇÃO (2 min)**

Execute no Supabase SQL Editor:

```sql
-- Verificar tabelas criadas
SELECT COUNT(*) AS total_tabelas
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';
-- Esperado: 28

-- Verificar views criadas
SELECT COUNT(*) AS total_views
FROM information_schema.views 
WHERE table_schema = 'public';
-- Esperado: >= 3

-- Verificar triggers
SELECT COUNT(*) AS total_triggers
FROM information_schema.triggers;
-- Esperado: >= 2
```

---

## ✅ CHECKLIST FINAL

- [ ] Supabase configurado
- [ ] Script SQL executado (28 tabelas criadas)
- [ ] Gemini API configurada
- [ ] `.env.local` criado
- [ ] Testado localmente
- [ ] Commit no Git
- [ ] Deploy no Vercel
- [ ] Variáveis de ambiente configuradas
- [ ] Cron jobs configurados
- [ ] Testado em produção
- [ ] Endpoints funcionando

---

## 🎉 PRONTO!

**Seu sistema ORBIT.AI V2.1 está no ar!**

---

## 📚 PRÓXIMOS PASSOS

1. **Ler a documentação completa:**
   - `README_PRINCIPAL.md` - Visão geral
   - `DOCS_FLUXO_ANALISTA_IA.md` - Documentação técnica
   - `README_INSTALACAO.md` - Instalação detalhada

2. **Integrar componentes React:**
   - Adicionar `QuestoesRecomendadasPanel` na página de vagas
   - Adicionar `RecomendacaoIACard` na página de candidatos
   - Adicionar `DashboardAprendizadoReprovacoes` no dashboard

3. **Treinar a equipe:**
   - Como usar as questões inteligentes
   - Como interpretar recomendações da IA
   - Como dar feedback para aprendizado

4. **Monitorar:**
   - Acurácia da IA (view `vw_acuracia_ia`)
   - Questões mais eficazes (view `vw_questoes_eficazes`)
   - Red flags comuns (view `vw_red_flags_comuns`)

---

## 🆘 PROBLEMAS?

### **Erro no SQL:**
- Veja: `database/GUIA_EXECUCAO_SQL.md`

### **Erro no Deploy:**
- Verifique variáveis de ambiente
- Verifique logs no Vercel

### **Endpoints não funcionam:**
- Verifique se o deploy foi concluído
- Verifique se as variáveis estão configuradas
- Verifique logs de erro no Vercel

---

## 📞 SUPORTE

- **Documentação:** Arquivos `.md` no projeto
- **Issues:** GitHub Issues
- **Email:** suporte@orbit.ai

---

**Tempo total:** ~30 minutos ⏱️

**Dificuldade:** Fácil ⭐⭐☆☆☆

---

_Criado por Manus AI - 01/12/2025_
