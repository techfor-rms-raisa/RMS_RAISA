# 🔒 SEGURANÇA - RMS_RAISA

## ⚠️ IMPORTANTE - NUNCA COMMITE CHAVES DE API!

Este projeto usa variáveis de ambiente para proteger informações sensíveis.

---

## 📋 CONFIGURAÇÃO INICIAL

### 1. Criar arquivo .env.local

```bash
# Copie o arquivo de exemplo:
cp .env.example .env.local
```

### 2. Preencher com suas chaves REAIS

Edite `.env.local` e substitua os valores de exemplo:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_aqui
VITE_GEMINI_API_KEY=sua_chave_gemini_aqui
# ... etc
```

### 3. NUNCA commite .env.local

O arquivo `.gitignore` já está configurado para ignorar `.env.local`.

**❌ NUNCA faça:**
```bash
git add .env.local  # ❌ ERRADO!
```

---

## 🔑 ONDE OBTER AS CHAVES

### Supabase
1. Acesse: https://app.supabase.com
2. Selecione seu projeto
3. Settings > API
4. Copie: `URL` e `anon/public key`

### Google Gemini AI
1. Acesse: https://aistudio.google.com/app/apikey
2. Clique em "Create API Key"
3. Copie a chave gerada

### EmailJS
1. Acesse: https://www.emailjs.com/
2. Account > API Keys
3. Copie: Service ID, Template ID, Public Key

### Resend
1. Acesse: https://resend.com/api-keys
2. Clique em "Create API Key"
3. Copie a chave gerada

---

## 🚀 DEPLOY NO VERCEL

As variáveis de ambiente devem ser configuradas no Vercel:

1. Acesse seu projeto no Vercel
2. Settings > Environment Variables
3. Adicione TODAS as variáveis do `.env.local`
4. Selecione: Production, Preview, Development

---

## 🔄 ROTAÇÃO DE CHAVES

Se suspeitar que uma chave foi exposta:

1. **Supabase:** Settings > API > Reset keys
2. **Gemini:** Revoke key e crie uma nova
3. **EmailJS:** Regenerate keys
4. **Resend:** Delete e crie nova key

Após rotacionar:
- Atualize `.env.local`
- Atualize no Vercel
- Faça novo deploy

---

## ✅ CHECKLIST DE SEGURANÇA

- [ ] `.env.local` está no `.gitignore`
- [ ] Nunca commitei `.env.local`
- [ ] Variáveis configuradas no Vercel
- [ ] Chaves rotacionadas após exposição
- [ ] Equipe treinada sobre segurança

---

## 🆘 SE VOCÊ EXPÔS CHAVES ACIDENTALMENTE

1. **IMEDIATO:** Rotacione TODAS as chaves
2. Remova do Git:
   ```bash
   git rm --cached .env.local
   git commit -m "security: Remove exposed keys"
   git push origin main
   ```
3. Verifique logs de acesso das APIs
4. Monitore uso suspeito

---

## 📞 DÚVIDAS

Em caso de dúvidas sobre segurança, consulte a equipe de DevOps.

**Última atualização:** 20/12/2024