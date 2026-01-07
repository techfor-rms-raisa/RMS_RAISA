# 📧 Setup: Integração Resend Inbound + Gemini

## Visão Geral

Esta integração automatiza o controle de envios de CVs:

1. **Analista envia email** via Outlook com cópia para `raisa@techfortirms.online`
2. **Resend recebe** e dispara webhook para a API
3. **Gemini classifica** o email (envio de CV ou resposta do cliente)
4. **Sistema atualiza** automaticamente o banco de dados

---

## Passo 1: Configurar DNS do Domínio

### Adicionar MX Records

No painel do seu provedor de DNS (Cloudflare, GoDaddy, etc.), adicione:

| Tipo | Nome | Valor | Prioridade |
|------|------|-------|------------|
| MX | @ | `inbound-smtp.resend.com` | 10 |

### Adicionar TXT para verificação

| Tipo | Nome | Valor |
|------|------|-------|
| TXT | @ | `v=spf1 include:resend.com ~all` |

---

## Passo 2: Configurar Resend

### 2.1 Criar conta
1. Acesse [resend.com](https://resend.com)
2. Crie uma conta ou faça login

### 2.2 Adicionar Domínio Inbound
1. Vá em **Settings** → **Domains**
2. Clique em **Add Domain**
3. Digite: `techfortirms.online`
4. Aguarde verificação do DNS (pode levar até 48h)

### 2.3 Configurar Webhook
1. Vá em **Webhooks** → **Add Webhook**
2. Configure:
   - **URL**: `https://rms-raisa.vercel.app/api/webhook/email-inbound`
   - **Events**: Selecione `email.received`
3. Copie o **Signing Secret** (será usado no próximo passo)

---

## Passo 3: Configurar Variáveis de Ambiente

No painel da Vercel (ou `.env.local`), adicione:

```env
# Resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx

# Supabase (já deve existir)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx...
```

---

## Passo 4: Executar SQL no Supabase

Execute o arquivo `sql/create_controle_envios_completo.sql` no Supabase:

1. Acesse **Supabase Dashboard** → **SQL Editor**
2. Cole o conteúdo do arquivo
3. Execute

Isso criará as tabelas:
- `candidatura_envios`
- `candidatura_aprovacoes`
- `email_processamento_log`
- `email_pendente_classificacao`

---

## Passo 5: Deploy

```bash
git add .
git commit -m "feat: Integração Resend + Gemini para Controle de Envios"
git push origin main
```

---

## Testar a Integração

### Teste 1: Verificar Webhook

```bash
curl -X POST https://rms-raisa.vercel.app/api/webhook/email-inbound \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email.received",
    "created_at": "2026-01-06T10:00:00Z",
    "data": {
      "email_id": "test_123",
      "from": "analista@techfortirms.com.br",
      "to": ["raisa@techfortirms.online"],
      "cc": ["cliente@empresa.com.br"],
      "subject": "CV - Maria Santos - Vaga Dev React Senior - ACME Corp",
      "text": "Prezado João, segue o CV da candidata Maria Santos para a vaga de Desenvolvedor React Senior."
    }
  }'
```

### Teste 2: Enviar Email Real

1. Abra o Outlook
2. Compose um email:
   - **Para**: cliente@exemplo.com
   - **CC**: raisa@techfortirms.online
   - **Assunto**: CV - [Nome Candidato] - [Vaga] - [Cliente]
   - **Corpo**: Texto do email + anexo do CV
3. Envie o email
4. Verifique no sistema se o envio foi registrado

---

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                      FLUXO AUTOMATIZADO                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ANALISTA ENVIA EMAIL (Outlook)                              │
│     Para: cliente@empresa.com                                   │
│     CC: raisa@techfortirms.online                               │
│     Assunto: CV - Maria Santos - Dev React - ACME               │
│                                                                 │
│  2. RESEND RECEBE                                               │
│     → Dispara webhook para /api/webhook/email-inbound           │
│                                                                 │
│  3. API PROCESSA                                                │
│     → Valida signature                                          │
│     → Verifica duplicação                                       │
│     → Cria log                                                  │
│                                                                 │
│  4. GEMINI CLASSIFICA                                           │
│     → Extrai: candidato, vaga, cliente                          │
│     → Determina tipo: envio_cv ou resposta_cliente              │
│     → Retorna confiança (0-100)                                 │
│                                                                 │
│  5. SISTEMA ATUALIZA                                            │
│     → Busca candidatura no banco                                │
│     → Cria registro em candidatura_envios                       │
│     → Atualiza status da candidatura                            │
│                                                                 │
│  6. CLIENTE RESPONDE (Reply All)                                │
│     → Mesmo fluxo, mas classificado como resposta               │
│     → Gemini detecta: aprovado, reprovado, agendamento          │
│     → Sistema atualiza status                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fallbacks e Classificação Manual

Se a IA não conseguir classificar (confiança < 70%):

1. Email vai para `email_pendente_classificacao`
2. Aparece na aba **"Classificação Manual"** do Controle de Envios
3. Analista classifica manualmente
4. Sistema atualiza banco

---

## Logs e Auditoria

Todos os emails são registrados em `email_processamento_log`:

```sql
SELECT 
  email_subject,
  tipo_email_detectado,
  confianca_ia,
  status_processamento,
  acao_executada,
  processado_em
FROM email_processamento_log
ORDER BY processado_em DESC
LIMIT 20;
```

---

## Troubleshooting

### Webhook não está recebendo emails
- Verifique MX records (pode levar 24-48h para propagar)
- Confirme que o domínio está verificado no Resend
- Verifique logs no Resend Dashboard

### Emails indo para "Pendente"
- Confiança da IA está baixa
- Candidatura não encontrada no banco
- Verifique se os nomes batem (candidato, vaga, cliente)

### Erro de Signature
- Verifique `RESEND_WEBHOOK_SECRET` na Vercel
- Regenere o secret no Resend se necessário

---

## Arquivos Criados

### Backend (API Routes)
- `/api/webhook/email-inbound.ts` - Recebe webhook do Resend
- `/api/envios/listar.ts` - Lista envios
- `/api/envios/registrar-manual.ts` - Registra envio manual
- `/api/envios/aprovar.ts` - Registra aprovação/reprovação
- `/api/envios/pendentes.ts` - Lista emails pendentes
- `/api/envios/classificar-manual.ts` - Classifica email manualmente

### Backend (Gemini)
- `/api/gemini-analyze.ts` - Actions adicionadas:
  - `classificar_email_candidatura`
  - `classificar_resposta_cliente`

### Frontend
- `/src/hooks/supabase/useControleEnvios.ts` - Hook para chamar APIs
- `/src/components/raisa/ControleEnvios.tsx` - Componente atualizado
- `/src/components/raisa/EmailsPendentesPanel.tsx` - Painel de pendentes

### SQL
- `/sql/create_controle_envios_completo.sql` - Todas as tabelas

---

## Contatos e Suporte

- **Resend Docs**: https://resend.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **Vercel Docs**: https://vercel.com/docs
