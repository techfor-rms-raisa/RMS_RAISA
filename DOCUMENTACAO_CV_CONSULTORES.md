# 📎 Sistema de Recuperação Automática de CVs - RMS-RAISA

## 📋 Visão Geral

Este documento descreve a implementação completa do sistema de recuperação automática de currículos (CVs) de candidatos aprovados que se tornam consultores no sistema RMS-RAISA.

---

## 🎯 Objetivo

Quando um **Analista de R&S** avalia um candidato através da IA e o candidato é **aprovado pelo cliente**, o sistema deve:

1. ✅ Armazenar o CV do candidato no Supabase
2. ✅ Vincular automaticamente o CV quando o candidato se torna consultor
3. ✅ Disponibilizar o CV no formulário de consultores para consultas futuras
4. ✅ Exibir ícone de anexo 📎 indicando presença do CV

---

## 🔄 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CV NO SISTEMA                       │
└─────────────────────────────────────────────────────────────────┘

1. CANDIDATO ENVIA CV
   ↓
   Tabela: pessoas
   Campo: curriculo_url
   
2. ANALISTA AVALIA CANDIDATO
   ↓
   Tabela: candidaturas
   Status: 'aprovado_cliente'
   
3. CANDIDATO APROVADO → CONSULTOR
   ↓
   Sistema busca automaticamente:
   - Por CPF ou Email
   - Na tabela 'pessoas'
   - Recupera curriculo_url
   
4. CONSULTOR CRIADO COM CV
   ↓
   Tabela: consultants
   Campos vinculados:
   - pessoa_id
   - candidatura_id
   - curriculo_url
   - curriculo_uploaded_at
   
5. VISUALIZAÇÃO NO FORM
   ↓
   Botão "Ver CV" 👁️
   Abre CV em nova aba
```

---

## 🗄️ Estrutura do Banco de Dados

### **Tabela: `consultants` (Modificada)**

Novos campos adicionados:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `pessoa_id` | INTEGER (FK) | Referência à pessoa no banco de talentos |
| `candidatura_id` | INTEGER (FK) | Referência à candidatura aprovada |
| `curriculo_url` | TEXT | URL do CV armazenado no Supabase Storage |
| `curriculo_filename` | TEXT | Nome original do arquivo do CV |
| `curriculo_uploaded_at` | TIMESTAMP | Data/hora do upload do CV |

### **Índices Criados**

```sql
CREATE INDEX idx_consultants_pessoa_id ON consultants(pessoa_id);
CREATE INDEX idx_consultants_candidatura_id ON consultants(candidatura_id);
CREATE INDEX idx_consultants_cpf ON consultants(cpf);
CREATE INDEX idx_consultants_email ON consultants(email_consultor);
CREATE INDEX idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX idx_pessoas_email ON pessoas(email);
```

### **Função SQL: `buscar_cv_candidato()`**

Função auxiliar para buscar CV por CPF ou Email:

```sql
SELECT * FROM buscar_cv_candidato(
    p_cpf := '12345678900',
    p_email := 'candidato@email.com'
);
```

Retorna:
- `pessoa_id`
- `candidatura_id`
- `curriculo_url`
- `nome_pessoa`
- `email_pessoa`

### **View: `vw_consultores_com_cv`**

View completa com informações de CV:

```sql
SELECT * FROM vw_consultores_com_cv
WHERE tem_cv = true;
```

Campos adicionais:
- `candidato_nome_original`
- `candidato_email_original`
- `candidato_telefone`
- `candidato_linkedin`
- `vaga_id`
- `candidatura_status`
- `data_candidatura`
- `tem_cv` (boolean)

---

## 💻 Implementação no Código

### **1. Interface TypeScript Atualizada**

**Arquivo:** `src/components/types.ts`

```typescript
export interface Consultant {
  // ... campos existentes ...
  
  // Campos de vínculo com candidatos e CV
  pessoa_id?: number | null;
  candidatura_id?: number | null;
  curriculo_url?: string | null;
  curriculo_filename?: string | null;
  curriculo_uploaded_at?: string | null;
}
```

### **2. Lógica de Recuperação Automática**

**Arquivo:** `hooks/useSupabaseData.ts`

#### **Função: `addConsultant()`** (Criação Individual)

```typescript
const addConsultant = async (newConsultant: Omit<Consultant, 'id'>) => {
  // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CV
  let cvData = {};
  
  // Buscar pessoa no banco de talentos por CPF ou Email
  if (newConsultant.cpf || newConsultant.email_consultor) {
    const { data: pessoaData } = await supabase
      .from('pessoas')
      .select('*')
      .eq(newConsultant.cpf ? 'cpf' : 'email', 
          newConsultant.cpf || newConsultant.email_consultor)
      .single();
    
    if (pessoaData) {
      cvData.pessoa_id = pessoaData.id;
      cvData.curriculo_url = pessoaData.curriculo_url;
      
      // Buscar candidatura aprovada
      const { data: candidaturaData } = await supabase
        .from('candidaturas')
        .select('*')
        .eq('pessoa_id', String(pessoaData.id))
        .in('status', ['aprovado_cliente', 'aprovado'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (candidaturaData) {
        cvData.candidatura_id = parseInt(candidaturaData.id);
      }
    }
  }
  
  // Inserir consultor com CV vinculado
  const { data, error } = await supabase
    .from('consultants')
    .insert([{
      // ... campos existentes ...
      pessoa_id: cvData.pessoa_id || null,
      candidatura_id: cvData.candidatura_id || null,
      curriculo_url: cvData.curriculo_url || null,
      curriculo_uploaded_at: cvData.curriculo_url ? new Date().toISOString() : null
    }])
    .select()
    .single();
};
```

#### **Função: `batchAddConsultants()`** (Importação em Lote)

```typescript
const batchAddConsultants = async (newConsultants: Omit<Consultant, 'id'>[]) => {
  // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CVs EM LOTE
  
  // Buscar todas as pessoas de uma vez
  const cpfs = newConsultants.filter(c => c.cpf).map(c => c.cpf);
  const emails = newConsultants.filter(c => c.email_consultor).map(c => c.email_consultor);
  
  const { data: pessoasData } = await supabase
    .from('pessoas')
    .select('*')
    .or(`cpf.in.(${cpfs.join(',')}),email.in.(${emails.join(',')})`);
  
  // Criar mapa de CVs por CPF e Email
  const cvMap = new Map<string, any>();
  if (pessoasData) {
    for (const pessoa of pessoasData) {
      if (pessoa.cpf) cvMap.set(`cpf:${pessoa.cpf}`, pessoa);
      if (pessoa.email) cvMap.set(`email:${pessoa.email}`, pessoa);
    }
  }
  
  // Inserir consultores com CVs vinculados
  const { data, error } = await supabase
    .from('consultants')
    .insert(newConsultants.map(c => {
      let pessoa = null;
      if (c.cpf) pessoa = cvMap.get(`cpf:${c.cpf}`);
      if (!pessoa && c.email_consultor) pessoa = cvMap.get(`email:${c.email_consultor}`);
      
      return {
        // ... campos existentes ...
        pessoa_id: pessoa?.id || null,
        curriculo_url: pessoa?.curriculo_url || null,
        curriculo_uploaded_at: pessoa?.curriculo_url ? new Date().toISOString() : null
      };
    }))
    .select();
};
```

### **3. Interface do Formulário**

**Arquivo:** `components/ManageConsultants.tsx`

#### **Campo de CV no Formulário:**

```tsx
{/* Campo de CV */}
<div className="col-span-2 border-t pt-4 mt-2">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    📎 Currículo (CV)
  </label>
  
  {editingConsultant?.curriculo_url ? (
    // CV DISPONÍVEL
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded border">
      <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/>
      </svg>
      
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">
          {editingConsultant.curriculo_filename || 'Currículo.pdf'}
        </p>
        <p className="text-xs text-gray-500">
          {editingConsultant.curriculo_uploaded_at 
            ? `Enviado em ${new Date(editingConsultant.curriculo_uploaded_at).toLocaleDateString('pt-BR')}`
            : 'Recuperado do banco de talentos'
          }
        </p>
      </div>
      
      <a 
        href={editingConsultant.curriculo_url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
      >
        👁️ Ver CV
      </a>
    </div>
  ) : (
    // SEM CV
    <div className="p-4 bg-gray-50 rounded border border-dashed border-gray-300 text-center">
      <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm text-gray-600 mb-2">Nenhum CV vinculado</p>
      <p className="text-xs text-gray-500">
        O CV será recuperado automaticamente se o consultor foi aprovado como candidato
      </p>
    </div>
  )}
</div>
```

---

## 🚀 Instalação e Configuração

### **Passo 1: Executar Script SQL**

Execute o script SQL no Supabase SQL Editor:

```bash
# Arquivo: ADICIONAR_CV_CONSULTORES.sql
```

Este script irá:
1. ✅ Adicionar colunas na tabela `consultants`
2. ✅ Criar índices para otimização
3. ✅ Criar função `buscar_cv_candidato()`
4. ✅ Criar view `vw_consultores_com_cv`
5. ✅ Migrar dados existentes (vincular CVs já existentes)

### **Passo 2: Atualizar Código Frontend**

Os seguintes arquivos foram atualizados:

1. ✅ `src/components/types.ts` - Interface Consultant
2. ✅ `hooks/useSupabaseData.ts` - Lógica de recuperação
3. ✅ `components/ManageConsultants.tsx` - Interface do formulário

### **Passo 3: Testar Funcionalidade**

#### **Teste 1: Criação Manual de Consultor**

1. Criar uma pessoa no Banco de Talentos com CV
2. Criar um consultor com o mesmo CPF ou Email
3. Verificar se o CV foi vinculado automaticamente
4. Abrir formulário de edição e clicar em "Ver CV"

#### **Teste 2: Importação em Lote**

1. Preparar planilha Excel com consultores
2. Importar consultores via "Importar Ficha"
3. Verificar quantos CVs foram recuperados automaticamente
4. Consultar view: `SELECT * FROM vw_consultores_com_cv WHERE tem_cv = true`

---

## 📊 Monitoramento e Estatísticas

### **Verificar Consultores com CV**

```sql
SELECT 
    COUNT(*) AS total_consultores,
    COUNT(curriculo_url) AS com_cv,
    COUNT(pessoa_id) AS vinculados_pessoa,
    COUNT(candidatura_id) AS vinculados_candidatura,
    ROUND(COUNT(curriculo_url)::NUMERIC / COUNT(*)::NUMERIC * 100, 2) AS percentual_com_cv
FROM consultants;
```

### **Listar Consultores com CV**

```sql
SELECT 
    nome_consultores,
    email_consultor,
    cpf,
    curriculo_url,
    candidato_nome_original,
    data_candidatura,
    tem_cv
FROM vw_consultores_com_cv
WHERE tem_cv = true
ORDER BY nome_consultores;
```

### **Consultores SEM CV (para investigação)**

```sql
SELECT 
    nome_consultores,
    email_consultor,
    cpf,
    data_inclusao_consultores
FROM consultants
WHERE curriculo_url IS NULL
ORDER BY data_inclusao_consultores DESC;
```

---

## 🔍 Logs e Debugging

O sistema gera logs detalhados no console:

```
🔍 Buscando CV do candidato...
✅ Pessoa encontrada no banco de talentos: João Silva
✅ Candidatura aprovada encontrada
📎 CV recuperado automaticamente: https://supabase.co/storage/...
➥ Criando consultor: João Silva
✅ Consultor criado: { id: 123, curriculo_url: '...' }
```

Para importação em lote:

```
🔍 Buscando CVs dos candidatos em lote...
✅ 15 pessoas encontradas no banco de talentos
➥ Criando 20 consultores em lote...
✅ 20 consultores criados em lote
```

---

## 🎨 Interface do Usuário

### **Com CV Disponível:**

```
┌─────────────────────────────────────────────────────┐
│ 📎 Currículo (CV)                                   │
├─────────────────────────────────────────────────────┤
│ 📄  Currículo.pdf                      [👁️ Ver CV] │
│     Recuperado do banco de talentos                 │
└─────────────────────────────────────────────────────┘
```

### **Sem CV:**

```
┌─────────────────────────────────────────────────────┐
│ 📎 Currículo (CV)                                   │
├─────────────────────────────────────────────────────┤
│              📄                                      │
│     Nenhum CV vinculado                             │
│     O CV será recuperado automaticamente            │
│     se o consultor foi aprovado como candidato      │
└─────────────────────────────────────────────────────┘
```

---

## ⚠️ Considerações Importantes

### **1. Privacidade e LGPD**

- CVs contêm dados pessoais sensíveis
- Garantir acesso apenas a usuários autorizados
- Implementar logs de acesso aos CVs
- Considerar anonimização após período de retenção

### **2. Storage no Supabase**

- CVs devem ser armazenados no bucket `media` ou bucket específico
- Configurar políticas de acesso (RLS - Row Level Security)
- Definir limite de tamanho de arquivo (ex: 5MB)
- Formatos aceitos: PDF, DOCX, DOC

### **3. Performance**

- Índices criados para otimizar buscas por CPF e Email
- Importação em lote busca todos os CVs de uma vez (1 query)
- View materializada pode ser criada para relatórios pesados

### **4. Casos de Uso Especiais**

**Consultor sem candidatura prévia:**
- CV não será recuperado automaticamente
- Permitir upload manual do CV (funcionalidade futura)

**Múltiplas candidaturas do mesmo candidato:**
- Sistema pega a candidatura aprovada mais recente
- `ORDER BY created_at DESC LIMIT 1`

**Atualização de CV:**
- Se candidato atualizar CV no banco de talentos
- Consultor existente NÃO será atualizado automaticamente
- Implementar botão "Atualizar CV" (funcionalidade futura)

---

## 🔮 Melhorias Futuras

### **Fase 2: Upload Manual de CV**

- [ ] Botão "Upload CV" no formulário de consultores
- [ ] Integração com Supabase Storage
- [ ] Validação de tipo e tamanho de arquivo
- [ ] Histórico de versões de CV

### **Fase 3: Visualização Inline**

- [ ] Preview do CV dentro do formulário (iframe ou PDF.js)
- [ ] Extração de texto do CV para busca
- [ ] Análise de skills do CV com IA

### **Fase 4: Sincronização Automática**

- [ ] Trigger no Supabase para atualizar CV automaticamente
- [ ] Notificação quando CV for atualizado
- [ ] Versionamento de CVs

### **Fase 5: Analytics**

- [ ] Dashboard de CVs no sistema
- [ ] Taxa de conversão candidato → consultor
- [ ] Tempo médio entre candidatura e contratação

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verificar logs no console do navegador
2. Consultar view `vw_consultores_com_cv`
3. Executar queries de diagnóstico acima
4. Verificar permissões no Supabase

---

## 📝 Changelog

### **Versão 1.0 - 2025-12-04**

- ✅ Implementação inicial do sistema de recuperação automática de CVs
- ✅ Criação de campos na tabela `consultants`
- ✅ Lógica de busca por CPF e Email
- ✅ Interface no formulário de consultores
- ✅ Suporte para importação em lote
- ✅ Documentação completa

---

**Desenvolvido para RMS-RAISA** 🚀
