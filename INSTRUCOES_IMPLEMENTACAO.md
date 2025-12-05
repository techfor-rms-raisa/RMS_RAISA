# 🚀 INSTRUÇÕES DE IMPLEMENTAÇÃO - RMS-RAISA DASHBOARD

## 📋 PRÉ-REQUISITOS

- ✅ Acesso ao repositório do projeto RMS-RAISA
- ✅ Node.js e npm/pnpm instalados
- ✅ Ambiente de desenvolvimento configurado
- ✅ Backup dos arquivos originais

---

## 🔧 PASSO A PASSO

### 1️⃣ FAZER BACKUP DOS ARQUIVOS ORIGINAIS

```bash
# Navegar até o diretório do projeto
cd /caminho/para/RMS-RAISA

# Criar diretório de backup
mkdir -p backups/$(date +%Y%m%d)

# Fazer backup dos arquivos que serão modificados
cp components/Dashboard.tsx backups/$(date +%Y%m%d)/Dashboard.tsx.bak
cp components/StatusCircle.tsx backups/$(date +%Y%m%d)/StatusCircle.tsx.bak
```

---

### 2️⃣ SUBSTITUIR ARQUIVOS CORRIGIDOS

**Opção A - Substituição Completa (Recomendado):**

```bash
# Copiar arquivos corrigidos do pacote para o projeto
cp /caminho/para/RMS-RAISA-FIXES/Dashboard.tsx components/
cp /caminho/para/RMS-RAISA-FIXES/StatusCircle.tsx components/
```

**Opção B - Aplicar Mudanças Manualmente:**

Se preferir aplicar as mudanças manualmente, consulte o arquivo `RESUMO_CORRECOES.md` para ver exatamente quais linhas foram modificadas.

---

### 3️⃣ VERIFICAR DEPENDÊNCIAS

```bash
# Verificar se todas as dependências estão instaladas
npm install
# ou
pnpm install
```

---

### 4️⃣ COMPILAR E TESTAR

```bash
# Compilar TypeScript (verificar erros)
npm run build
# ou
pnpm build

# Iniciar servidor de desenvolvimento
npm run dev
# ou
pnpm dev
```

---

### 5️⃣ TESTES FUNCIONAIS

#### ✅ Teste 1: Dropdown de Ano

1. Abrir Dashboard
2. Verificar se o dropdown de ano mostra pelo menos o ano atual (2025)
3. Selecionar diferentes anos (se houver)
4. Confirmar que a tabela filtra corretamente

**Resultado Esperado:** Dropdown sempre populado, mesmo sem consultores.

---

#### ✅ Teste 2: Cores Padrão (Consultores Sem Score)

1. Cadastrar um consultor novo sem relatórios
2. Abrir Dashboard
3. Localizar o consultor na tabela

**Resultado Esperado:**
- Círculos P1-P12: **Brancos** (#FFFFFF) com borda cinza
- Círculo Final: **Azul** (#4285F4)

---

#### ✅ Teste 3: Popup de Relatórios

1. Importar um relatório de atividades para um consultor
2. Abrir Dashboard
3. Localizar consultor com círculo colorido (vermelho, amarelo, verde ou azul) em P1-P12
4. Clicar no círculo colorido

**Resultado Esperado:**
- Popup abre com detalhes do relatório
- Exibe: Mês/Ano, Resumo, Padrão Negativo, Recomendações
- Botão X fecha o popup

---

#### ✅ Teste 4: Filtro de Ano no Popup

1. Importar relatórios para o mesmo consultor em anos diferentes (ex: 2024 e 2025)
2. Selecionar 2024 no dropdown
3. Clicar em um círculo P1-P12
4. Verificar que o popup mostra relatório de 2024
5. Selecionar 2025 no dropdown
6. Clicar no mesmo mês
7. Verificar que o popup mostra relatório de 2025

**Resultado Esperado:** Popup sempre mostra relatório do ano selecionado.

---

### 6️⃣ TESTES DE REGRESSÃO

Verificar que funcionalidades existentes continuam funcionando:

- [ ] Filtros de cliente, gestor e consultor
- [ ] Visualização de quarentena
- [ ] Exportação de relatórios
- [ ] Importação de clientes e consultores
- [ ] Módulo de recomendações

---

## 🐛 SOLUÇÃO DE PROBLEMAS

### Problema: Erro de compilação TypeScript

**Sintoma:** Erro ao compilar sobre tipos `RiskScore` ou `Consultant`

**Solução:**
```bash
# Limpar cache e recompilar
rm -rf node_modules/.cache
npm run build
```

---

### Problema: Círculos não aparecem

**Sintoma:** Tabela vazia ou sem círculos

**Solução:**
1. Verificar console do navegador (F12)
2. Confirmar que consultores têm `ano_vigencia` definido
3. Verificar se filtro de ano está correto

---

### Problema: Popup não abre

**Sintoma:** Clicar em círculo não faz nada

**Possíveis Causas:**
1. **Consultor não tem `reports`** → Normal se não foi importado relatório
2. **Página foi recarregada** → Relatórios não persistem no Supabase (limitação conhecida)
3. **Ano selecionado diferente** → Popup só abre se houver relatório do ano selecionado

**Solução Temporária:**
Reimportar o relatório de atividades sem recarregar a página.

**Solução Definitiva:**
Implementar persistência de relatórios no Supabase (ver seção abaixo).

---

## 🔄 (OPCIONAL) IMPLEMENTAR PERSISTÊNCIA DE RELATÓRIOS

### Por que implementar?

Atualmente, os relatórios mensais só existem no estado React. Após reload da página:
- ❌ Círculos P1-P12 ficam brancos
- ❌ Popup não funciona
- ✅ Apenas parecer final persiste

### Como implementar?

#### Passo 1: Criar Tabela no Supabase

```sql
-- Conectar ao Supabase SQL Editor e executar:

CREATE TABLE consultant_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  risk_score INTEGER CHECK (risk_score BETWEEN 1 AND 4),
  summary TEXT,
  negative_pattern TEXT,
  alert TEXT,
  activities TEXT,
  recommendations JSONB,
  generated_by TEXT,
  ai_justification TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(consultant_id, month, year)
);

CREATE INDEX idx_consultant_reports_consultant ON consultant_reports(consultant_id);
CREATE INDEX idx_consultant_reports_period ON consultant_reports(year, month);

-- Habilitar Row Level Security (RLS)
ALTER TABLE consultant_reports ENABLE ROW LEVEL SECURITY;

-- Política de leitura (todos autenticados)
CREATE POLICY "Usuários autenticados podem ler relatórios"
ON consultant_reports FOR SELECT
TO authenticated
USING (true);

-- Política de inserção (todos autenticados)
CREATE POLICY "Usuários autenticados podem inserir relatórios"
ON consultant_reports FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política de atualização (todos autenticados)
CREATE POLICY "Usuários autenticados podem atualizar relatórios"
ON consultant_reports FOR UPDATE
TO authenticated
USING (true);
```

#### Passo 2: Modificar `useSupabaseData.ts`

Localizar a função `updateConsultantScore` (linha ~1767) e modificar:

**Código Atual:**
```typescript
// Atualizar apenas parecer_final_consultor no Supabase
const updates: any = {
  parecer_final_consultor: result.riskScore
};

const { data, error } = await supabase
  .from('consultants')
  .update(updates)
  .eq('id', consultant.id)
  .select()
  .single();
```

**Código Novo:**
```typescript
// 1. Atualizar parecer_final_consultor no Supabase
const updates: any = {
  parecer_final_consultor: result.riskScore
};

const { data, error } = await supabase
  .from('consultants')
  .update(updates)
  .eq('id', consultant.id)
  .select()
  .single();

// 2. Inserir/atualizar relatório na tabela consultant_reports
const reportData = {
  consultant_id: consultant.id,
  month: result.reportMonth,
  year: result.reportYear,
  risk_score: result.riskScore,
  summary: result.summary || '',
  negative_pattern: result.negativePattern || null,
  alert: result.alert || null,
  activities: result.details || '',
  recommendations: result.recommendations || [],
  generated_by: 'manual',
  ai_justification: 'Análise baseada em relatório de atividades manual'
};

const { error: reportError } = await supabase
  .from('consultant_reports')
  .upsert(reportData, { 
    onConflict: 'consultant_id,month,year' 
  });

if (reportError) {
  console.warn('⚠️ Erro ao salvar relatório:', reportError.message);
}
```

#### Passo 3: Carregar Relatórios ao Iniciar

Modificar função `loadConsultants` para incluir relatórios:

```typescript
const loadConsultants = async () => {
  const { data, error } = await supabase
    .from('consultants')
    .select(`
      *,
      reports:consultant_reports(*)
    `)
    .order('nome_consultores');
    
  if (error) {
    console.error('Erro ao carregar consultores:', error);
    return;
  }
  
  // Transformar relatórios para o formato esperado
  const consultantsWithReports = data.map(c => ({
    ...c,
    reports: c.reports?.map((r: any) => ({
      id: r.id,
      consultantId: r.consultant_id,
      month: r.month,
      year: r.year,
      riskScore: r.risk_score,
      summary: r.summary,
      negativePattern: r.negative_pattern,
      alert: r.alert,
      activities: r.activities,
      recommendations: r.recommendations,
      createdAt: r.created_at,
      generatedBy: r.generated_by,
      aiJustification: r.ai_justification
    })) || []
  }));
  
  setConsultants(consultantsWithReports);
};
```

---

## 📊 VALIDAÇÃO FINAL

Após implementação completa, validar:

- [ ] ✅ Dropdown de ano sempre populado
- [ ] ✅ Consultores sem score mostram cores corretas (branco mensal, azul final)
- [ ] ✅ Popup abre ao clicar em P1-P12 com relatório
- [ ] ✅ Popup mostra relatório do ano correto
- [ ] ✅ (Se implementou persistência) Relatórios permanecem após reload

---

## 🎯 PRÓXIMOS PASSOS RECOMENDADOS

1. **Implementar persistência de relatórios** (ver seção opcional acima)
2. **Adicionar paginação** se houver muitos consultores
3. **Exportar relatórios em PDF** com gráficos de evolução
4. **Dashboard de analytics** com métricas agregadas
5. **Notificações automáticas** para consultores em quarentena

---

## 📞 SUPORTE E CONTATO

Em caso de dúvidas técnicas:
1. Consultar `RESUMO_CORRECOES.md` para detalhes das mudanças
2. Verificar console do navegador (F12) para erros
3. Revisar logs do Supabase para problemas de banco de dados

---

**Boa implementação! 🚀**
