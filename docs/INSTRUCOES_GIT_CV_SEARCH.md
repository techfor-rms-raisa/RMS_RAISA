# 🚀 INSTRUÇÕES GIT - Busca Inteligente de CVs v1.0
## RMS_RAISA - Deploy 26/12/2024

---

## 📋 RESUMO DAS ALTERAÇÕES

Esta release implementa o sistema de **Busca Inteligente de CVs** com IA:

| # | Arquivo | Tipo | Descrição |
|---|---------|------|-----------|
| 1 | `database/cv_embeddings_search.sql` | 🆕 NOVO | Script SQL para tabelas de skills e match |
| 2 | `src/components/raisa/Vagas.tsx` | 📝 ALTERADO | Integração do CVMatchingPanel |
| 3 | `src/components/raisa/CVMatchingPanel.tsx` | ✅ EXISTENTE | Painel de resultados de busca |
| 4 | `src/components/raisa/CVUploadProcessor.tsx` | 🆕 NOVO | Upload e processamento de CV |
| 5 | `src/components/raisa/BancoTalentos_v2.tsx` | 🆕 NOVO | Banco de talentos expandido |
| 6 | `src/hooks/Supabase/useRaisaCVSearch.ts` | ✅ EXISTENTE | Hook de busca de CVs |
| 7 | `src/hooks/Supabase/index.ts` | 📝 ALTERADO | Exportação dos novos hooks |
| 8 | `api/gemini-cv.ts` | 🆕 NOVO | Endpoint API para processamento |

---

## 🔧 PASSO 1: EXECUTAR SQL NO SUPABASE

**IMPORTANTE:** Execute este script ANTES do deploy!

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Cole o conteúdo do arquivo `database/cv_embeddings_search.sql`
4. Execute o script
5. Verifique se as tabelas foram criadas:

```sql
-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'pessoa_skills',
    'pessoa_experiencias', 
    'pessoa_formacao',
    'pessoa_idiomas',
    'vaga_candidato_match',
    'pessoa_cv_log'
);
```

---

## 📂 PASSO 2: ORGANIZAR ARQUIVOS

Estrutura de destino:

```
RMS_RAISA/
├── api/
│   └── gemini-cv.ts                     ← NOVO
├── database/
│   └── cv_embeddings_search.sql         ← NOVO
├── src/
│   ├── components/
│   │   └── raisa/
│   │       ├── Vagas.tsx                ← ALTERADO (v53.0)
│   │       ├── CVMatchingPanel.tsx      ← EXISTENTE
│   │       ├── CVUploadProcessor.tsx    ← NOVO
│   │       └── BancoTalentos_v2.tsx     ← NOVO
│   └── hooks/
│       └── Supabase/
│           ├── index.ts                 ← ALTERADO
│           └── useRaisaCVSearch.ts      ← EXISTENTE
```

---

## 🖥️ PASSO 3: COMANDOS GIT

### Opção A: Nova Branch (Recomendado)

```bash
# 1. Garantir que está na main e atualizada
cd RMS_RAISA
git checkout main
git pull origin main

# 2. Criar branch de feature
git checkout -b feature/cv-search-ia

# 3. Copiar os arquivos para as pastas corretas
# (Faça isso manualmente no VS Code ou Explorer)

# 4. Adicionar arquivos novos
git add database/cv_embeddings_search.sql
git add api/gemini-cv.ts
git add src/components/raisa/CVUploadProcessor.tsx
git add src/components/raisa/BancoTalentos_v2.tsx

# 5. Adicionar arquivos alterados
git add src/components/raisa/Vagas.tsx
git add src/hooks/Supabase/index.ts

# 6. Verificar status
git status

# 7. Commit
git commit -m "feat(raisa): implementa busca inteligente de CVs com IA

- Adiciona CVUploadProcessor para upload e processamento de CV
- Integra CVMatchingPanel no Vagas.tsx
- Cria BancoTalentos_v2 com skills estruturadas
- Adiciona API gemini-cv.ts para processamento com Gemini
- Cria estrutura SQL para pessoa_skills e vaga_candidato_match
- Atualiza exportações dos hooks Supabase"

# 8. Push da branch
git push -u origin feature/cv-search-ia

# 9. (Após testes) Merge na main
git checkout main
git merge feature/cv-search-ia
git push origin main
```

### Opção B: Commit Direto na Main

```bash
# 1. Atualizar main
cd RMS_RAISA
git checkout main
git pull origin main

# 2. Copiar arquivos para as pastas corretas

# 3. Adicionar todos os arquivos
git add .

# 4. Commit
git commit -m "feat(raisa): busca inteligente de CVs v1.0"

# 5. Push
git push origin main
```

---

## ✅ PASSO 4: VERIFICAR DEPLOY NA VERCEL

Após o push:

1. Acesse **Vercel Dashboard**
2. Verifique se o deploy iniciou automaticamente
3. Aguarde conclusão (~2-3 min)
4. Verifique os logs por erros
5. Teste a aplicação em produção

---

## 🧪 PASSO 5: TESTES

### Teste 1: Busca de CVs
1. Acesse **RAISA → Vagas**
2. Selecione uma vaga com stack tecnológica
3. Clique em **🔍 CVs**
4. Verifique se o modal abre corretamente
5. Se houver candidatos, verifique o score de match

### Teste 2: Processamento de CV
1. Acesse **RAISA → Banco de Talentos**
2. Selecione um talento
3. Clique em **🤖 CV**
4. Faça upload de um CV (PDF, DOCX ou TXT)
5. Clique em **Processar com IA**
6. Verifique skills extraídas

### Teste 3: API Gemini
1. Verifique se a variável `GEMINI_API_KEY` está configurada na Vercel
2. Teste endpoint: `POST /api/gemini-cv`
3. Body: `{"action": "processar_cv", "texto_cv": "..."}`

---

## 🔑 VARIÁVEIS DE AMBIENTE

Certifique-se que estas variáveis estão configuradas na **Vercel**:

| Variável | Descrição |
|----------|-----------|
| `GEMINI_API_KEY` | Chave da API Google Gemini |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima do Supabase |

---

## 🐛 TROUBLESHOOTING

### Erro: "Tabela pessoa_skills não existe"
**Solução:** Execute o script SQL `cv_embeddings_search.sql` no Supabase

### Erro: "GEMINI_API_KEY not found"
**Solução:** Adicione a variável de ambiente na Vercel

### Erro: "Cannot find module CVMatchingPanel"
**Solução:** Verifique se o arquivo está em `src/components/raisa/`

### Erro de build: "Cannot resolve @/types"
**Solução:** Verifique o tsconfig.json e paths

---

## 📊 FUNCIONALIDADES ENTREGUES

| Feature | Status |
|---------|--------|
| Busca de CVs por skills | ✅ |
| Match vaga-candidato | ✅ |
| Upload de CV (PDF/DOCX/TXT) | ✅ |
| Processamento com Gemini IA | ✅ |
| Extração de skills | ✅ |
| Extração de experiências | ✅ |
| Criação de candidatura do match | ✅ |
| Filtros avançados | ✅ |
| Banco de Talentos expandido | ✅ |

---

## 📅 PRÓXIMOS PASSOS (Backlog)

1. [ ] Implementar embeddings vetoriais (pgvector)
2. [ ] Dashboard de métricas de matching
3. [ ] Exportação de relatórios de busca
4. [ ] Notificações de novos matches
5. [ ] Integração com LinkedIn para enriquecimento

---

**Documento gerado por Claude DEV**  
**Data:** 26/12/2024  
**Versão:** 1.0
