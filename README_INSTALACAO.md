# 📦 Instruções de Instalação - Fluxo do Analista com IA

## 🎯 Objetivo

Este guia contém o passo a passo para instalar e integrar os novos endpoints de API e o cron job do **Fluxo do Analista com IA** no seu projeto ORBIT.AI.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de que você tem:

- ✅ Projeto Next.js funcionando
- ✅ Conta no Vercel (ou outro provedor de hospedagem)
- ✅ Banco de dados Supabase configurado
- ✅ Chave de API do Google Gemini
- ✅ Git instalado e configurado

---

## 🚀 Passo 1: Copiar os Arquivos

### 1.1. Copiar Endpoints de API

Copie os seguintes arquivos para a pasta `api/` do seu projeto:

```
api/
├── questoes-inteligentes.ts
├── recomendacao-analista.ts
└── predicao-riscos.ts
```

**No terminal do VS Code:**

```bash
# Navegue até a pasta do seu projeto
cd C:\Users\moliveira\Documents\Atividades\SITE_DASHBOARD\RMS-RAISA

# Copie os arquivos (ajuste o caminho de origem conforme necessário)
copy caminho\para\api\*.ts api\
```

### 1.2. Copiar Cron Job

Copie o arquivo do cron job para a pasta `api/cron/`:

```
api/cron/
└── analise-reprovacoes.ts
```

**No terminal:**

```bash
copy caminho\para\api\cron\analise-reprovacoes.ts api\cron\
```

---

## 🔧 Passo 2: Configurar o Cron Job

### 2.1. Editar o arquivo `vercel.json`

Abra o arquivo `vercel.json` na raiz do seu projeto e adicione a configuração do novo cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron/analise-mensal",
      "schedule": "0 2 1 * *"
    },
    {
      "path": "/api/cron/limpeza-notificacoes",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/repriorizacao",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/analise-reprovacoes",
      "schedule": "0 2 1 * *"
    }
  ]
}
```

**Explicação do Schedule:**
- `0 2 1 * *` = Todo dia 1º do mês, às 02:00 AM

---

## 🔐 Passo 3: Configurar Variáveis de Ambiente

### 3.1. No Vercel

1. Acesse o painel do Vercel: https://vercel.com
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**
4. Adicione/verifique as seguintes variáveis:

| Nome | Valor | Descrição |
|------|-------|-----------|
| `CRON_SECRET` | `seu-token-secreto-aqui` | Token para autenticar cron jobs |
| `DATABASE_URL` | `postgresql://...` | URL de conexão com Supabase |
| `API_KEY` | `sua-chave-gemini-aqui` | Chave da API do Google Gemini |

### 3.2. Localmente (para desenvolvimento)

Crie/edite o arquivo `.env.local` na raiz do projeto:

```env
CRON_SECRET=seu-token-secreto-aqui
DATABASE_URL=postgresql://...
API_KEY=sua-chave-gemini-aqui
```

**⚠️ IMPORTANTE:** Nunca commite o arquivo `.env.local` no Git!

---

## 📊 Passo 4: Executar as Migrações do Banco de Dados

O sistema requer 5 novas tabelas no banco de dados. Execute o script SQL:

```bash
# O arquivo database/fluxo_analista_ia.sql já deve estar no projeto
# Execute-o no Supabase SQL Editor
```

**No Supabase:**

1. Acesse: https://app.supabase.com
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Cole o conteúdo do arquivo `database/fluxo_analista_ia.sql`
6. Clique em **Run**

---

## 🧪 Passo 5: Testar os Endpoints

### 5.1. Testar Localmente

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

### 5.2. Testar Endpoint de Questões

```bash
curl -X POST http://localhost:3000/api/questoes-inteligentes/gerar \
  -H "Content-Type: application/json" \
  -d '{
    "vagaId": "teste-123",
    "analistaId": "analista-456"
  }'
```

**Resposta esperada:**

```json
{
  "success": true,
  "data": {
    "questoes": [...],
    "insights": [...]
  },
  "message": "Questões geradas com sucesso"
}
```

### 5.3. Testar Endpoint de Recomendação

```bash
curl -X POST http://localhost:3000/api/recomendacao-analista/analisar \
  -H "Content-Type: application/json" \
  -d '{
    "candidaturaId": "candidatura-789",
    "analistaId": "analista-456"
  }'
```

---

## 🚢 Passo 6: Deploy no Vercel

### 6.1. Commit e Push

```bash
# Adicionar todos os arquivos novos
git add .

# Fazer commit
git commit -m "feat: adicionar endpoints de IA para fluxo do analista"

# Enviar para o GitHub
git push origin main
```

### 6.2. Deploy Automático

O Vercel detectará automaticamente o push e fará o deploy.

**Acompanhe em:** https://vercel.com/seu-usuario/seu-projeto/deployments

---

## ✅ Passo 7: Verificar Funcionamento

### 7.1. Verificar Endpoints

Teste os endpoints em produção:

```bash
curl https://seu-dominio.vercel.app/api/questoes-inteligentes/gerar \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"vagaId": "teste", "analistaId": "teste"}'
```

### 7.2. Verificar Cron Job

1. Acesse o Vercel Dashboard
2. Vá em **Cron Jobs**
3. Verifique se `analise-reprovacoes` está listado
4. Clique em **Trigger** para executar manualmente (teste)

---

## 🐛 Troubleshooting

### Erro: "Invalid CRON_SECRET"

**Solução:** Verifique se a variável `CRON_SECRET` está configurada corretamente no Vercel.

### Erro: "Failed to parse AI response"

**Solução:** Verifique se a chave `API_KEY` do Google Gemini está correta e ativa.

### Erro: "Database connection failed"

**Solução:** Verifique se a `DATABASE_URL` está correta e se o banco está acessível.

---

## 📞 Suporte

Se encontrar problemas durante a instalação, verifique:

1. **Logs do Vercel**: https://vercel.com/seu-projeto/logs
2. **Logs do Supabase**: https://app.supabase.com/project/seu-projeto/logs
3. **Console do navegador**: F12 → Console

---

## 🎉 Conclusão

Após seguir todos os passos, seu sistema estará com:

- ✅ 3 novos endpoints de API funcionando
- ✅ 1 cron job executando mensalmente
- ✅ Sistema de IA integrado ao fluxo do analista
- ✅ Aprendizado contínuo ativado

**Próximo passo:** Integrar os componentes React ao frontend!
