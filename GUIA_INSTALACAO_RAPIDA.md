# 🚀 Guia de Instalação Rápida - Sistema de CV Automático

## ⏱️ Tempo estimado: 10 minutos

---

## 📋 Checklist de Instalação

### **Passo 1: Banco de Dados (Supabase)** ⏱️ 3 min

1. Acesse o **Supabase SQL Editor**
2. Abra o arquivo `ADICIONAR_CV_CONSULTORES.sql`
3. Copie TODO o conteúdo
4. Cole no SQL Editor
5. Clique em **RUN** (▶️)
6. Aguarde a mensagem de sucesso ✅

**Verificação:**
```sql
-- Execute esta query para verificar se funcionou:
SELECT 
    COUNT(*) AS total_consultores,
    COUNT(curriculo_url) AS com_cv
FROM consultants;
```

---

### **Passo 2: Código Frontend** ⏱️ 5 min

#### **2.1. Atualizar Types**

**Arquivo:** `src/components/types.ts`

Substitua a interface `Consultant` pela versão atualizada do arquivo fornecido.

**Linhas modificadas:** 113-122 (adicionar campos de CV)

#### **2.2. Atualizar Hook**

**Arquivo:** `hooks/useSupabaseData.ts`

Substitua as funções:
- `addConsultant()` - linhas 791-829
- `batchAddConsultants()` - linhas 923-960

**Ou:** Substitua o arquivo completo pela versão atualizada.

#### **2.3. Atualizar Componente**

**Arquivo:** `components/ManageConsultants.tsx`

Substitua o arquivo completo pela versão atualizada.

**Principais mudanças:**
- Campo de CV no formulário (linhas 174-215)
- Exibição de ícone de anexo 📎
- Botão "Ver CV" 👁️

---

### **Passo 3: Testar** ⏱️ 2 min

#### **Teste 1: Criar Consultor Manualmente**

1. Acesse **Banco de Talentos** (RAISA)
2. Adicione uma pessoa com CV
3. Vá para **Gestão de Consultores**
4. Crie um consultor com o **mesmo CPF ou Email**
5. Salve e edite novamente
6. Verifique se o CV aparece com o botão "Ver CV" 👁️

#### **Teste 2: Importar em Lote**

1. Prepare planilha Excel com consultores
2. Clique em **Importar Ficha**
3. Importe os consultores
4. Verifique no console do navegador (F12):
   ```
   🔍 Buscando CVs dos candidatos em lote...
   ✅ X pessoas encontradas no banco de talentos
   ```
5. Edite um consultor importado
6. Verifique se o CV foi vinculado automaticamente

---

## ✅ Verificação Final

Execute no Supabase SQL Editor:

```sql
-- Estatísticas de CVs vinculados
SELECT 
    COUNT(*) AS total_consultores,
    COUNT(curriculo_url) AS com_cv,
    COUNT(pessoa_id) AS vinculados_pessoa,
    ROUND(COUNT(curriculo_url)::NUMERIC / COUNT(*)::NUMERIC * 100, 2) AS percentual_com_cv
FROM consultants;

-- Listar consultores com CV
SELECT 
    nome_consultores,
    curriculo_url,
    tem_cv
FROM vw_consultores_com_cv
WHERE tem_cv = true
LIMIT 10;
```

---

## 🎯 Resultado Esperado

### **No Formulário de Consultores:**

**COM CV:**
```
┌─────────────────────────────────────────┐
│ 📎 Currículo (CV)                       │
├─────────────────────────────────────────┤
│ 📄 Currículo.pdf         [👁️ Ver CV]   │
│    Recuperado do banco de talentos      │
└─────────────────────────────────────────┘
```

**SEM CV:**
```
┌─────────────────────────────────────────┐
│ 📎 Currículo (CV)                       │
├─────────────────────────────────────────┤
│           📄                            │
│    Nenhum CV vinculado                  │
│    Será recuperado automaticamente      │
└─────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### **Problema: CV não aparece no formulário**

**Solução:**
1. Verificar se a pessoa existe no banco de talentos
2. Verificar se CPF ou Email estão corretos
3. Verificar logs no console (F12):
   ```
   🔍 Buscando CV do candidato...
   ✅ Pessoa encontrada no banco de talentos
   📎 CV recuperado automaticamente
   ```

### **Problema: Erro ao executar SQL**

**Solução:**
1. Verificar se as tabelas `pessoas` e `candidaturas` existem
2. Verificar permissões no Supabase
3. Executar o script em partes (comentar seções)

### **Problema: Botão "Ver CV" não abre**

**Solução:**
1. Verificar se `curriculo_url` está preenchido
2. Verificar se a URL é válida
3. Verificar permissões do bucket no Supabase Storage

---

## 📞 Suporte

Se encontrar problemas:

1. ✅ Verificar logs no console (F12)
2. ✅ Executar queries de verificação acima
3. ✅ Consultar `DOCUMENTACAO_CV_CONSULTORES.md` completa
4. ✅ Verificar permissões no Supabase

---

## 📦 Arquivos Incluídos

```
RMS-RAISA_CV_FEATURE.zip
├── ADICIONAR_CV_CONSULTORES.sql          # Script SQL
├── DOCUMENTACAO_CV_CONSULTORES.md        # Documentação completa
├── GUIA_INSTALACAO_RAPIDA.md            # Este arquivo
├── src/components/types.ts               # Interface atualizada
├── hooks/useSupabaseData.ts              # Lógica de recuperação
└── components/ManageConsultants.tsx      # Interface do formulário
```

---

## 🎉 Pronto!

Após seguir estes passos, o sistema estará funcionando e recuperando CVs automaticamente! 🚀

**Próximos passos:**
- Testar com dados reais
- Monitorar logs de recuperação
- Ajustar conforme necessário

---

**Desenvolvido para RMS-RAISA** 📎
