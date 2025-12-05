# 🔧 MODIFICAÇÃO COMPLETA: useSupabaseData.ts - Escala 1-5 + Persistência

## 📍 ARQUIVO
`hooks/useSupabaseData.ts` ou `src/hooks/useSupabaseData.ts`

---

## 🎯 MODIFICAÇÃO 1: updateConsultantScore (Salvar Relatórios)

### Localização
Função `updateConsultantScore` (aproximadamente linha 1734)

### Código Atual (Linhas 1767-1783)
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

if (error) {
  console.warn(`⚠️ Erro ao atualizar Supabase...`, error.message);
}
```

### Código Novo (Substituir)
```typescript
// 1. Atualizar parecer_final_consultor na tabela consultants
const updates: any = {
  parecer_final_consultor: result.riskScore
};

const { data, error } = await supabase
  .from('consultants')
  .update(updates)
  .eq('id', consultant.id)
  .select()
  .single();

if (error) {
  console.warn(`⚠️ Erro ao atualizar consultor:`, error.message);
}

// 2. Salvar relatório detalhado na tabela consultant_reports
const reportData = {
  consultant_id: consultant.id,
  month: result.reportMonth,
  year: result.reportYear || new Date().getFullYear(),
  risk_score: result.riskScore,  // ✅ Agora aceita 1-5
  summary: result.summary || '',
  negative_pattern: result.negativePattern || null,
  predictive_alert: result.predictiveAlert || null,
  content: result.details || '',
  recommendations: result.recommendations || [],
  generated_by: 'manual',
  ai_justification: 'Análise baseada em relatório de atividades manual'
};

const { error: reportError } = await supabase
  .from('consultant_reports')
  .upsert(reportData, { 
    onConflict: 'consultant_id,month,year',
    ignoreDuplicates: false
  });

if (reportError) {
  console.warn('⚠️ Erro ao salvar relatório:', reportError.message);
} else {
  console.log(`✅ Relatório salvo no banco: Mês ${result.reportMonth}/${result.reportYear || new Date().getFullYear()} - Score ${result.riskScore}`);
}
```

---

## 🎯 MODIFICAÇÃO 2: loadConsultants (Carregar Relatórios)

### Localização
Função `loadConsultants` (aproximadamente linha 741)

### Código Atual (Linhas 741-789)
```typescript
const loadConsultants = async () => {
  try {
    const { data, error } = await supabase
      .from('consultants')
      .select('*')
      .order('id', { ascending: true});

    if (error) throw error;

    const mappedConsultants: Consultant[] = (data || []).map((consultant: any) => ({
      // ... campos ...
      reports: []  // ❌ SEMPRE VAZIO
    }));

    setConsultants(mappedConsultants);
    console.log(`✅ ${mappedConsultants.length} consultores carregados`);
  } catch (err: any) {
    console.error('❌ Erro ao carregar consultores:', err);
    throw err;
  }
};
```

### Código Novo (Substituir Função Completa)
```typescript
const loadConsultants = async () => {
  try {
    // 1. Carregar consultores
    const { data, error } = await supabase
      .from('consultants')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    // 2. Carregar TODOS os relatórios
    const { data: reportsData, error: reportsError } = await supabase
      .from('consultant_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (reportsError) {
      console.warn('⚠️ Erro ao carregar relatórios:', reportsError.message);
    }

    // 3. Criar mapa de relatórios por consultor
    const reportsByConsultant: { [key: number]: ConsultantReport[] } = {};
    
    (reportsData || []).forEach((report: any) => {
      if (!reportsByConsultant[report.consultant_id]) {
        reportsByConsultant[report.consultant_id] = [];
      }
      
      reportsByConsultant[report.consultant_id].push({
        id: report.id,
        consultantId: report.consultant_id,
        month: report.month,
        year: report.year,
        riskScore: report.risk_score,  // ✅ 1-5
        summary: report.summary,
        negativePattern: report.negative_pattern,
        predictiveAlert: report.predictive_alert,
        recommendations: report.recommendations,
        content: report.content,
        createdAt: report.created_at,
        generatedBy: report.generated_by,
        aiJustification: report.ai_justification
      });
    });

    // 4. Mapear consultores COM relatórios
    const mappedConsultants: Consultant[] = (data || []).map((consultant: any) => {
      const consultantReports = reportsByConsultant[consultant.id] || [];
      
      // Preencher parecer_X_consultor com base nos relatórios
      const monthlyScores: any = {};
      consultantReports.forEach(report => {
        const monthField = `parecer_${report.month}_consultor`;
        monthlyScores[monthField] = report.riskScore;
      });
      
      return {
        id: consultant.id,
        nome_consultores: consultant.nome_consultores,
        email_consultor: consultant.email_consultor,
        cpf: consultant.cpf,
        cargo_consultores: consultant.cargo_consultores,
        ano_vigencia: consultant.ano_vigencia,
        data_inclusao_consultores: consultant.data_inclusao_consultores,
        data_ultima_alteracao: consultant.data_ultima_alteracao,
        data_saida: consultant.data_saida,
        status: consultant.status,
        motivo_desligamento: consultant.motivo_desligamento,
        valor_faturamento: consultant.valor_faturamento,
        gestor_imediato_id: consultant.gestor_imediato_id,
        coordenador_id: consultant.coordenador_id,
        gestor_rs_id: consultant.gestor_rs_id,
        id_gestao_de_pessoas: consultant.id_gestao_de_pessoas,
        
        // Scores mensais (da tabela consultants OU dos relatórios)
        parecer_1_consultor: consultant.parecer_1_consultor || monthlyScores.parecer_1_consultor || null,
        parecer_2_consultor: consultant.parecer_2_consultor || monthlyScores.parecer_2_consultor || null,
        parecer_3_consultor: consultant.parecer_3_consultor || monthlyScores.parecer_3_consultor || null,
        parecer_4_consultor: consultant.parecer_4_consultor || monthlyScores.parecer_4_consultor || null,
        parecer_5_consultor: consultant.parecer_5_consultor || monthlyScores.parecer_5_consultor || null,
        parecer_6_consultor: consultant.parecer_6_consultor || monthlyScores.parecer_6_consultor || null,
        parecer_7_consultor: consultant.parecer_7_consultor || monthlyScores.parecer_7_consultor || null,
        parecer_8_consultor: consultant.parecer_8_consultor || monthlyScores.parecer_8_consultor || null,
        parecer_9_consultor: consultant.parecer_9_consultor || monthlyScores.parecer_9_consultor || null,
        parecer_10_consultor: consultant.parecer_10_consultor || monthlyScores.parecer_10_consultor || null,
        parecer_11_consultor: consultant.parecer_11_consultor || monthlyScores.parecer_11_consultor || null,
        parecer_12_consultor: consultant.parecer_12_consultor || monthlyScores.parecer_12_consultor || null,
        
        parecer_final_consultor: consultant.parecer_final_consultor,
        
        // ✅ RELATÓRIOS CARREGADOS DO BANCO
        reports: consultantReports
      };
    });

    setConsultants(mappedConsultants);
    console.log(`✅ ${mappedConsultants.length} consultores carregados`);
    console.log(`✅ ${reportsData?.length || 0} relatórios carregados`);
  } catch (err: any) {
    console.error('❌ Erro ao carregar consultores:', err);
    throw err;
  }
};
```

---

## 🎯 MODIFICAÇÃO 3: Atualizar Lógica de Quarentena

### Localização
Buscar por: `parecer_final_consultor === 1 || parecer_final_consultor === 2`

### Substituir por:
```typescript
parecer_final_consultor === 4 || parecer_final_consultor === 5
```

**Motivo:** Na escala 1-5, scores 4 (Alto) e 5 (Crítico) vão para quarentena.

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Modificar `updateConsultantScore` (salvar relatórios)
- [ ] Modificar `loadConsultants` (carregar relatórios)
- [ ] Atualizar lógica de quarentena (4 e 5)
- [ ] Compilar código (`npm run build`)
- [ ] Testar importação de relatório
- [ ] Verificar console: "✅ Relatório salvo no banco"
- [ ] Recarregar página e verificar persistência
- [ ] Testar popup de relatórios

---

## 📊 ESCALA CONFIRMADA (1-5)

| Score | Cor | Significado |
|-------|-----|-------------|
| 1 | 🟢 Verde | Excelente |
| 2 | 🔵 Azul | Bom |
| 3 | 🟡 Amarelo | Médio |
| 4 | 🟠 Laranja | Alto |
| 5 | 🔴 Vermelho | Crítico |

**Quarentena:** Scores 4 e 5
