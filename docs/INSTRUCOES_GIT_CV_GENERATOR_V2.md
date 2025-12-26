# 🚀 INSTRUÇÕES GIT - CV Generator v2.0
## Templates Techfor e T-Systems
### RMS_RAISA - Deploy 26/12/2024

---

## 📋 RESUMO DAS ALTERAÇÕES

Esta release implementa o **CV Generator v2.0** com templates 100% aderentes aos CVs reais da Techfor:

| # | Arquivo | Tipo | Descrição |
|---|---------|------|-----------|
| 1 | `src/types/cvTypes.ts` | 🆕 NOVO | Tipos completos para CV Techfor |
| 2 | `api/gemini-cv-generator-v2.ts` | 🆕 NOVO | API com templates Techfor e T-Systems |
| 3 | `src/components/raisa/CVGeneratorV2.tsx` | 🆕 NOVO | UI completa com wizard de 6 etapas |
| 4 | `database/cv_templates_techfor_tsystems.sql` | 🆕 NOVO | SQL para inserir templates |

---

## 🎯 NOVOS RECURSOS v2.0

### Template Techfor:
- ✅ Header com dados pessoais (nome, idade, estado civil, disponibilidade)
- ✅ Parecer de Seleção (texto do recrutador)
- ✅ Tabela de Requisitos (Tecnologia x Tempo x Observação)
- ✅ Recomendação final padrão
- ✅ Histórico com motivo de saída
- ✅ Formação complementar (certificações)
- ✅ Rodapé institucional Techfor

### Template T-Systems:
- ✅ Capa com logo e nome do candidato
- ✅ Cores magenta (#E20074)
- ✅ Tabela de Hard Skills
- ✅ Layout diferenciado
- ✅ Seção de informações adicionais

---

## 📂 ESTRUTURA DE DESTINO

```
RMS_RAISA/
├── api/
│   ├── gemini-cv-generator.ts      ← MANTER (v1)
│   └── gemini-cv-generator-v2.ts   ← NOVO (v2)
├── database/
│   ├── cv_generator_schema.sql     ← MANTER
│   └── cv_templates_techfor_tsystems.sql  ← NOVO
├── src/
│   ├── types/
│   │   └── cvTypes.ts              ← NOVO (criar pasta se não existir)
│   └── components/raisa/
│       ├── CVGenerator.tsx         ← MANTER (v1)
│       └── CVGeneratorV2.tsx       ← NOVO (v2)
```

---

## 🔧 PASSO 1: EXECUTAR SQL NO SUPABASE

**Execute ANTES do deploy!**

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Execute primeiro o `cv_generator_schema.sql` (se ainda não executou)
4. Execute o `cv_templates_techfor_tsystems.sql`

---

## 🖥️ PASSO 2: CRIAR PASTA TYPES (se não existir)

```powershell
# Verificar se a pasta existe
dir src\types

# Se não existir, criar
mkdir src\types
```

---

## 🖥️ PASSO 3: COPIAR ARQUIVOS

| Arquivo Download | Destino |
|------------------|---------|
| `cvTypes.ts` | `src/types/cvTypes.ts` |
| `gemini-cv-generator-v2.ts` | `api/gemini-cv-generator-v2.ts` |
| `CVGeneratorV2.tsx` | `src/components/raisa/CVGeneratorV2.tsx` |
| `cv_templates_techfor_tsystems.sql` | `database/cv_templates_techfor_tsystems.sql` |

---

## 🖥️ PASSO 4: COMANDOS GIT

```powershell
# 1. Atualizar main
git checkout main
git pull origin main

# 2. Criar branch
git checkout -b feature/cv-generator-v2

# 3. Adicionar arquivos
git add src/types/cvTypes.ts
git add api/gemini-cv-generator-v2.ts
git add src/components/raisa/CVGeneratorV2.tsx
git add database/cv_templates_techfor_tsystems.sql

# 4. Verificar
git status

# 5. Commit
git commit -m "feat(raisa): implementa CV Generator v2.0 com templates reais

Templates implementados:
- Techfor Padrão: parecer, requisitos, rodapé
- T-Systems: capa, hard skills, layout magenta

Novos campos:
- Parecer de Seleção (IA)
- Tabela Requisitos Match
- Motivo de saída nas experiências
- Formação complementar
- Dados pessoais completos"

# 6. Push
git push -u origin feature/cv-generator-v2

# 7. Merge (após testes)
git checkout main
git merge feature/cv-generator-v2
git push origin main
```

---

## 🧪 PASSO 5: TESTES

### Teste 1: Template Techfor
1. Abrir CVGeneratorV2
2. Selecionar template Techfor
3. Preencher dados pessoais
4. Preencher tabela de requisitos
5. Gerar parecer com IA
6. Verificar preview (deve parecer com CV Leandro/Victor)

### Teste 2: Template T-Systems
1. Selecionar template T-Systems
2. Preencher dados
3. Verificar se tem capa
4. Verificar cores magenta
5. Preview deve parecer com CV Marcos

---

## 📊 COMPARAÇÃO v1 vs v2

| Recurso | v1 | v2 |
|---------|----|----|
| Templates | Genérico | Techfor + T-Systems |
| Parecer Seleção | ❌ | ✅ |
| Tabela Requisitos | ❌ | ✅ |
| Motivo Saída | ❌ | ✅ |
| Capa (T-Systems) | ❌ | ✅ |
| Rodapé Institucional | ❌ | ✅ |
| Geração Parecer IA | ❌ | ✅ |
| Etapas do Wizard | 4 | 6 |

---

## ⚠️ IMPORTANTE

1. **Não substitua** o CVGenerator.tsx original - adicione o CVGeneratorV2.tsx
2. Execute os SQLs no Supabase **ANTES** do deploy
3. A pasta `src/types/` pode não existir - crie se necessário
4. A API v2 é independente da v1

---

## 📌 PRÓXIMOS PASSOS (Backlog)

1. [ ] Integrar CVGeneratorV2 nas Candidaturas
2. [ ] Adicionar botão "Gerar CV" (usar v1 ou v2)
3. [ ] Implementar exportação PDF real (puppeteer)
4. [ ] Templates para outros clientes
5. [ ] Dashboard de CVs gerados

---

**Claude DEV + Design + RH**  
**Data:** 26/12/2024  
**Versão:** 2.0
