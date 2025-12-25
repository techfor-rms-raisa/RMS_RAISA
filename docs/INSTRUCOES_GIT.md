# 🚀 INSTRUÇÕES GIT - Integração RAISA com Supabase v2.0
# Data: 25/12/2024
# Branch Recomendada: feature/raisa-supabase-integration

# ============================================
# PASSO 1: CRIAR BRANCH DE FEATURE
# ============================================

# No VS Code, abra o terminal e execute:
git checkout -b feature/raisa-supabase-integration

# ============================================
# PASSO 2: BACKUP DOS ARQUIVOS ANTIGOS (OPCIONAL)
# ============================================

# Criar pasta de backup
mkdir -p src/components/raisa/_backup
mkdir -p src/hooks/Supabase/_backup

# Mover arquivos antigos para backup
cp src/components/raisa/EntrevistaTecnica.tsx src/components/raisa/_backup/EntrevistaTecnica_old.tsx
cp src/components/raisa/ControleEnvios.tsx src/components/raisa/_backup/ControleEnvios_old.tsx

# ============================================
# PASSO 3: COPIAR NOVOS ARQUIVOS
# ============================================

# HOOKS SUPABASE (copie os arquivos baixados para estas pastas):

# 3.1 - useRaisaInterview.ts
# Destino: src/hooks/Supabase/useRaisaInterview.ts

# 3.2 - useRaisaEnvios.ts  
# Destino: src/hooks/Supabase/useRaisaEnvios.ts

# 3.3 - useVagaAnaliseIA.ts
# Destino: src/hooks/Supabase/useVagaAnaliseIA.ts

# 3.4 - index.ts (renomear index_supabase.ts)
# Destino: src/hooks/Supabase/index.ts (SUBSTITUIR)

# COMPONENTES RAISA:

# 3.5 - EntrevistaTecnica.tsx (arquivo final, sem _v2)
# Destino: src/components/raisa/EntrevistaTecnica.tsx (SUBSTITUIR)

# 3.6 - ControleEnvios.tsx (arquivo final, sem _v2)
# Destino: src/components/raisa/ControleEnvios.tsx (SUBSTITUIR)

# 3.7 - VagaSugestoesIA.tsx (NOVO)
# Destino: src/components/raisa/VagaSugestoesIA.tsx

# API ENDPOINT:

# 3.8 - gemini-analyze.ts
# Destino: api/gemini-analyze.ts (SUBSTITUIR)

# APP.TSX:

# 3.9 - App.tsx
# Destino: src/App.tsx (SUBSTITUIR)

# ============================================
# PASSO 4: VERIFICAR ESTRUTURA FINAL
# ============================================

# Após copiar, sua estrutura deve ficar assim:
#
# src/
# ├── hooks/
# │   └── Supabase/
# │       ├── index.ts          (ATUALIZADO)
# │       ├── useRaisaInterview.ts  (NOVO)
# │       ├── useRaisaEnvios.ts     (NOVO)
# │       ├── useVagaAnaliseIA.ts   (NOVO)
# │       └── ... (outros hooks existentes)
# │
# ├── components/
# │   └── raisa/
# │       ├── _backup/
# │       │   ├── EntrevistaTecnica_old.tsx
# │       │   └── ControleEnvios_old.tsx
# │       ├── EntrevistaTecnica.tsx  (ATUALIZADO)
# │       ├── ControleEnvios.tsx     (ATUALIZADO)
# │       ├── VagaSugestoesIA.tsx    (NOVO)
# │       └── ... (outros componentes)
# │
# └── App.tsx (ATUALIZADO)
#
# api/
# └── gemini-analyze.ts (ATUALIZADO)

# ============================================
# PASSO 5: ADICIONAR AO GIT
# ============================================

# Adicionar todos os arquivos novos/modificados
git add src/hooks/Supabase/useRaisaInterview.ts
git add src/hooks/Supabase/useRaisaEnvios.ts
git add src/hooks/Supabase/useVagaAnaliseIA.ts
git add src/hooks/Supabase/index.ts
git add src/components/raisa/EntrevistaTecnica.tsx
git add src/components/raisa/ControleEnvios.tsx
git add src/components/raisa/VagaSugestoesIA.tsx
git add api/gemini-analyze.ts
git add src/App.tsx

# Verificar o que será commitado
git status

# ============================================
# PASSO 6: COMMIT
# ============================================

git commit -m "feat(raisa): integração completa com Supabase v2.0

BREAKING CHANGES:
- EntrevistaTecnica agora usa Supabase (não mais Mock)
- ControleEnvios agora usa Supabase (não mais Mock)

Novos arquivos:
- useRaisaInterview.ts: Hook para entrevistas técnicas
- useRaisaEnvios.ts: Hook para controle de envios
- useVagaAnaliseIA.ts: Hook para análise de vagas com IA
- VagaSugestoesIA.tsx: Componente de sugestões IA

Tabelas Supabase utilizadas:
- vaga_perguntas_tecnicas
- candidatura_respostas
- candidatura_matriz_qualificacoes
- candidatura_avaliacao_ia
- candidatura_envios
- candidatura_aprovacoes
- vaga_analise_ia

API:
- Adicionada action 'analise_vaga' no gemini-analyze.ts

Closes #RAISA-SPRINT1"

# ============================================
# PASSO 7: PUSH PARA REPOSITÓRIO
# ============================================

git push -u origin feature/raisa-supabase-integration

# ============================================
# PASSO 8: CRIAR PULL REQUEST (OPCIONAL)
# ============================================

# No GitHub/GitLab, crie um PR de:
# feature/raisa-supabase-integration -> main (ou develop)

# ============================================
# PASSO 9: APÓS APROVAÇÃO - MERGE
# ============================================

# Via interface GitHub/GitLab ou:
git checkout main
git merge feature/raisa-supabase-integration
git push origin main

# ============================================
# COMANDOS ÚTEIS
# ============================================

# Ver diferenças antes de commitar:
git diff src/components/raisa/EntrevistaTecnica.tsx

# Desfazer mudanças em um arquivo:
git checkout -- src/components/raisa/EntrevistaTecnica.tsx

# Ver histórico de commits:
git log --oneline -10

# Voltar para branch anterior:
git checkout -

# ============================================
# TESTE LOCAL ANTES DE COMMIT
# ============================================

# 1. Instalar dependências (se necessário)
npm install

# 2. Rodar em desenvolvimento
npm run dev

# 3. Testar:
#    - Acessar RAISA > Entrevista Técnica
#    - Verificar se carrega perguntas do Supabase
#    - Acessar RAISA > Controle de Envios
#    - Verificar se lista envios do Supabase

# ============================================
# TROUBLESHOOTING
# ============================================

# Se der erro de TypeScript:
npm run build

# Se der erro de importação:
# Verificar se o arquivo index.ts da pasta Supabase está correto

# Se der erro de conexão Supabase:
# Verificar .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# ============================================
# CONTATO
# ============================================
# Em caso de problemas, verifique:
# 1. Estrutura de pastas correta
# 2. Imports no App.tsx
# 3. Conexão com Supabase
