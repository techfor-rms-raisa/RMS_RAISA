/**
 * useReportAnalysis Hook - Análise de Relatórios com IA
 * Módulo separado do useSupabaseData para melhor organização
 * Inclui integração com Gemini AI e notificações de risco crítico
 * 
 * ✅ VERSÃO 2.3 - INTEGRAÇÃO COMPLIANCE (31/12/2024)
 * - NOVO: Criação automática de rh_actions para scores 4 e 5
 * - NOVO: Ações aparecem em "Tarefas Críticas" no Compliance Dashboard
 * - Salvamento de feedback para gráfico de sentimento
 * - UPDATE em consultants valida resultado
 * - Logs detalhados para diagnóstico
 */

import { supabase } from '../../config/supabase';
import { sendCriticalRiskNotifications, isCriticalRisk } from '../../services/emailService';
import { 
  Consultant, ConsultantReport, AIAnalysisResult, 
  User, UsuarioCliente, Client, FeedbackResponse 
} from '@/types';

// ============================================================================
// HELPERS: Cálculo de Sentiment e Risk Level
// ============================================================================

/**
 * Deriva o sentiment baseado no score de risco (1-5)
 * 1-2 = Positivo (consultor saudável)
 * 3 = Neutro (atenção necessária)
 * 4-5 = Negativo (risco alto)
 */
const deriveSentiment = (riskScore: number): 'Positivo' | 'Neutro' | 'Negativo' => {
  if (riskScore <= 2) return 'Positivo';
  if (riskScore === 3) return 'Neutro';
  return 'Negativo';
};

/**
 * Deriva o risk level baseado no score de risco (1-5)
 */
const deriveRiskLevel = (riskScore: number): 'Baixo' | 'Médio' | 'Alto' => {
  if (riskScore <= 2) return 'Baixo';
  if (riskScore === 3) return 'Médio';
  return 'Alto';
};

/**
 * Converte score de risco (1-5) para escala de feedback (0-10)
 * Score 1 (Excelente) → 10
 * Score 5 (Crítico) → 2
 */
const convertRiskToFeedbackScore = (riskScore: number): number => {
  const mapping: { [key: number]: number } = {
    1: 10,  // Excelente
    2: 8,   // Bom
    3: 5,   // Médio
    4: 3,   // Alto
    5: 1    // Crítico
  };
  return mapping[riskScore] || 5;
};

export const useReportAnalysis = () => {

  /**
   * ✅ NOVO v2.3: Salva ação de RH para scores críticos (4 e 5)
   * Alimenta a seção "Tarefas Críticas" do Compliance Dashboard
   */
  const saveRHActionFromAnalysis = async (
    consultantId: number,
    consultantName: string,
    riskScore: number,
    summary: string
  ): Promise<void> => {
    // Só cria ação para scores 4 (Alto) e 5 (Crítico)
    if (riskScore < 4) {
      console.log(`ℹ️ Score ${riskScore} não requer ação de RH`);
      return;
    }

    try {
      const priority = riskScore === 5 ? 'alta' : 'media';
      const description = riskScore === 5 
        ? `🚨 CRÍTICO: ${consultantName} - ${summary.substring(0, 200)}...`
        : `⚠️ ATENÇÃO: ${consultantName} - ${summary.substring(0, 200)}...`;

      console.log(`📋 Criando ação de RH: ${consultantName} - Prioridade: ${priority}`);

      const { error } = await supabase
        .from('rh_actions')
        .insert([{
          consultant_id: consultantId,
          descricao: description,  // ✅ Nome real da coluna no Supabase
          status: 'pendente',
          priority: priority,
          origin: 'ai_analysis'
        }]);

      if (error) {
        console.error('❌ Erro ao criar ação de RH:', error);
        // Não interrompe o fluxo principal
        return;
      }

      console.log(`✅ Ação de RH criada: ${consultantName} - ${priority.toUpperCase()}`);
    } catch (err: any) {
      console.error('❌ Erro ao salvar ação de RH:', err);
      // Não interrompe o fluxo principal
    }
  };

  /**
   * ✅ NOVO: Salva feedback no Supabase após análise da IA
   */
  const saveFeedbackFromAnalysis = async (
    consultantId: number,
    riskScore: number,
    summary: string,
    month: number,
    year: number
  ): Promise<void> => {
    try {
      const sentiment = deriveSentiment(riskScore);
      const riskLevel = deriveRiskLevel(riskScore);
      const feedbackScore = convertRiskToFeedbackScore(riskScore);

      console.log(`💾 Salvando feedback: Consultor ${consultantId}, Score ${riskScore} → Sentiment: ${sentiment}`);

      const { error } = await supabase
        .from('feedback_responses')
        .insert([{
          consultant_id: consultantId,
          score: feedbackScore,
          comment: summary,
          month: month,
          year: year,
          sentiment: sentiment,
          risk_level: riskLevel,
          source: 'ai_analysis'
        }]);

      if (error) {
        // Se falhar por causa de campos novos não existentes, tenta sem eles
        if (error.message.includes('column') || error.code === '42703') {
          console.warn('⚠️ Campos novos não existem ainda, salvando versão básica...');
          const { error: basicError } = await supabase
            .from('feedback_responses')
            .insert([{
              consultant_id: consultantId,
              score: feedbackScore,
              comment: summary
            }]);
          
          if (basicError) throw basicError;
        } else {
          throw error;
        }
      }

      console.log(`✅ Feedback salvo: Consultor ${consultantId} - ${sentiment} (${month}/${year})`);
    } catch (err: any) {
      console.error('❌ Erro ao salvar feedback:', err);
      // Não interrompe o fluxo principal
    }
  };

  /**
   * Processa análise de relatório com IA Gemini
   * Chama a API backend que tem acesso à API_KEY
   * 
   * ✅ CORREÇÃO: Aceita mês e ano extraídos como parâmetros opcionais
   */
  const processReportAnalysis = async (
    text: string, 
    gestorName?: string,
    extractedMonth?: number,
    extractedYear?: number
  ): Promise<AIAnalysisResult[]> => {
    try {
      console.log('🤖 Processando análise de relatório com IA Gemini...');
      console.log('📄 Tamanho do texto:', text.length, 'caracteres');
      console.log('📋 Primeiros 100 caracteres:', text.substring(0, 100));
      
      // ✅ Log dos parâmetros de data
      if (extractedMonth) {
        console.log(`📅 Mês extraído pelo frontend: ${extractedMonth}`);
      }
      if (extractedYear) {
        console.log(`📅 Ano extraído pelo frontend: ${extractedYear}`);
      }
      
      console.log('📡 Enviando requisição para API Backend...');
      
      // ✅ CORREÇÃO: Envia mês e ano extraídos para a API
      const response = await fetch('/api/analyze-activity-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reportText: text, 
          gestorName,
          // ✅ Novos parâmetros para correção do bug de data
          extractedMonth,
          extractedYear
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Erro na API: ${response.status} - ${errorData.message || response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Resposta recebida da API Backend');
      
      const analysisResults = data.results || [];
      console.log(`✅ ${analysisResults.length} relatório(s) analisado(s) pela IA Gemini`);
      
      // ✅ CORREÇÃO: Usar mês/ano extraídos se disponíveis, senão usar o que a API retornar
      const defaultMonth = extractedMonth || new Date().getMonth() + 1;
      const defaultYear = extractedYear || new Date().getFullYear();
      
      // Mapear resultados para AIAnalysisResult
      const results: AIAnalysisResult[] = analysisResults.map((analysis: any) => {
        // ✅ Prioriza: 1) Mês extraído pelo frontend, 2) Mês da API, 3) Mês atual
        const reportMonth = extractedMonth || analysis.reportMonth || defaultMonth;
        const reportYear = extractedYear || analysis.reportYear || defaultYear;
        
        console.log(`📊 Consultor: ${analysis.consultantName} → Mês: ${reportMonth}, Ano: ${reportYear}`);
        
        return {
          consultantName: analysis.consultantName,
          managerName: analysis.managerName || gestorName,
          reportMonth: reportMonth,
          reportYear: reportYear,
          riskScore: Math.max(1, Math.min(5, analysis.riskScore)) as 1 | 2 | 3 | 4 | 5,
          summary: analysis.summary,
          negativePattern: analysis.negativePattern || null,
          predictiveAlert: analysis.predictiveAlert || null,
          recommendations: (analysis.recommendations || []).map((rec: any) => {
            if (typeof rec === 'string') {
              return { tipo: 'RECOMENDACAO', descricao: rec };
            }
            return rec;
          }),
          details: analysis.details || analysis.summary,
          // ✅ NOVO v2.1: Trecho original do relatório específico do consultor
          trechoOriginal: analysis.trechoOriginal || null
        };
      });
      
      if (results.length === 0) {
        console.warn('⚠️ IA não encontrou relatórios válidos no texto fornecido');
        alert('⚠️ Nenhum relatório válido encontrado. Verifique o formato do texto.');
      }
      
      return results;
      
    } catch (err: any) {
      console.error('❌ Erro ao processar análise com IA:', err);
      alert(`Erro ao processar relatório com IA: ${err.message}`);
      return [];
    }
  };

  /**
   * Atualiza o score de risco de um consultor e salva relatório
   * Dispara notificações de risco crítico quando necessário
   * 
   * ✅ v2.2: UPDATE com validação robusta e logs detalhados
   */
  const updateConsultantScore = async (
    result: AIAnalysisResult,
    consultants: Consultant[],
    setConsultants: React.Dispatch<React.SetStateAction<Consultant[]>>,
    users: User[],
    usuariosCliente: UsuarioCliente[],
    clients: Client[],
    _originalContent?: string // ✅ DEPRECATED: Não usar mais - manter para compatibilidade
  ) => {
    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`📊 INICIANDO UPDATE: ${result.consultantName}`);
      console.log('═══════════════════════════════════════════════════════');
      console.log(`📅 Mês: ${result.reportMonth}, Ano: ${(result as any).reportYear || new Date().getFullYear()}`);
      console.log(`📊 Score de Risco: ${result.riskScore}`);
      
      // ✅ v2.2: Validar parâmetros antes de continuar
      if (!result.consultantName || typeof result.consultantName !== 'string') {
        console.error('❌ Nome do consultor inválido:', result.consultantName);
        return;
      }
      
      if (!result.reportMonth || result.reportMonth < 1 || result.reportMonth > 12) {
        console.error('❌ Mês do relatório inválido:', result.reportMonth);
        return;
      }
      
      if (!result.riskScore || result.riskScore < 1 || result.riskScore > 5) {
        console.error('❌ Score de risco inválido:', result.riskScore);
        return;
      }
      
      // Buscar consultor pelo nome (case insensitive e trim)
      const consultantSearchName = result.consultantName.toLowerCase().trim();
      const reportYear = (result as any).reportYear || new Date().getFullYear();
      
      console.log(`🔍 Buscando consultor: "${consultantSearchName}" para ano ${reportYear}`);
      console.log(`📋 Total de consultores no estado: ${consultants.length}`);
      
      // ✅ v2.4: CORREÇÃO - Filtrar por nome E ano_vigencia
      // Primeiro tenta encontrar consultor do ano do relatório
      let consultant = consultants.find(c => 
        c.nome_consultores.toLowerCase().trim() === consultantSearchName &&
        c.ano_vigencia === reportYear
      );
      
      // Se não encontrar no ano específico, tenta buscar em qualquer ano (fallback)
      if (!consultant) {
        console.log(`⚠️ Consultor não encontrado em ${reportYear}, buscando em qualquer ano...`);
        consultant = consultants.find(c => 
          c.nome_consultores.toLowerCase().trim() === consultantSearchName
        );
        
        if (consultant && consultant.ano_vigencia !== reportYear) {
          console.warn(`⚠️ ATENÇÃO: Consultor encontrado em ano diferente (${consultant.ano_vigencia} vs ${reportYear})`);
        }
      }
      
      if (!consultant) {
        console.warn(`⚠️ Consultor não encontrado no estado local: "${result.consultantName}"`);
        
        // ✅ v2.4: Tentar buscar diretamente no Supabase como fallback (com filtro de ano)
        console.log(`🔄 Tentando buscar diretamente no Supabase para ano ${reportYear}...`);
        
        // Primeiro tenta com filtro de ano
        let { data: dbConsultants, error: searchError } = await supabase
          .from('consultants')
          .select('id, nome_consultores, ano_vigencia')
          .ilike('nome_consultores', `%${result.consultantName.split(' ')[0]}%`)
          .eq('ano_vigencia', reportYear)
          .limit(5);
        
        // Se não encontrar no ano específico, busca sem filtro de ano
        if (!dbConsultants || dbConsultants.length === 0) {
          console.log(`⚠️ Não encontrado em ${reportYear}, buscando em qualquer ano...`);
          const fallbackResult = await supabase
            .from('consultants')
            .select('id, nome_consultores, ano_vigencia')
            .ilike('nome_consultores', `%${result.consultantName.split(' ')[0]}%`)
            .limit(5);
          
          dbConsultants = fallbackResult.data;
          searchError = fallbackResult.error;
        }
        
        if (searchError || !dbConsultants || dbConsultants.length === 0) {
          console.error(`❌ Consultor "${result.consultantName}" não encontrado nem no Supabase`);
          return;
        }
        
        // Tentar match exato (prioriza ano correto)
        let exactMatch = dbConsultants.find(c => 
          c.nome_consultores.toLowerCase().trim() === consultantSearchName &&
          c.ano_vigencia === reportYear
        );
        
        // Fallback: match só por nome
        if (!exactMatch) {
          exactMatch = dbConsultants.find(c => 
            c.nome_consultores.toLowerCase().trim() === consultantSearchName
          );
          
          if (exactMatch) {
            console.warn(`⚠️ ATENÇÃO: Consultor encontrado em ano diferente (${exactMatch.ano_vigencia} vs ${reportYear})`);
          }
        }
        
        if (!exactMatch) {
          console.error(`❌ Nenhum match exato encontrado. Candidatos:`);
          dbConsultants.forEach(c => console.log(`   - ${c.nome_consultores} (ID: ${c.id}, Ano: ${c.ano_vigencia})`));
          return;
        }
        
        console.log(`✅ Consultor encontrado no Supabase: ${exactMatch.nome_consultores} (ID: ${exactMatch.id}, Ano: ${exactMatch.ano_vigencia})`);
        // Continuar com o ID do banco
        await performUpdate(exactMatch.id, result, users, usuariosCliente, clients, setConsultants);
        return;
      }
      
      console.log(`✅ Consultor encontrado no estado: ${consultant.nome_consultores} (ID: ${consultant.id})`);
      
      await performUpdate(consultant.id, result, users, usuariosCliente, clients, setConsultants, consultant);
      
    } catch (err: any) {
      console.error('═══════════════════════════════════════════════════════');
      console.error('❌ ERRO CRÍTICO ao atualizar score:', err);
      console.error('═══════════════════════════════════════════════════════');
      alert(`Erro ao atualizar score do consultor: ${err.message}`);
    }
  };

  /**
   * ✅ v2.2: Função auxiliar para fazer o UPDATE no banco
   * Separada para permitir reuso com ID do estado local ou ID buscado do Supabase
   */
  const performUpdate = async (
    consultantId: number,
    result: AIAnalysisResult,
    users: User[],
    usuariosCliente: UsuarioCliente[],
    clients: Client[],
    setConsultants: React.Dispatch<React.SetStateAction<Consultant[]>>,
    localConsultant?: Consultant
  ) => {
    // Preparar campo do mês (parecer_1_consultor, parecer_2_consultor, etc)
    const monthField = `parecer_${result.reportMonth}_consultor`;
    const reportYear = (result as any).reportYear || new Date().getFullYear();
    
    console.log(`📝 Campo a atualizar: ${monthField} = ${result.riskScore}`);
    
    // ✅ v2.2: Validar que monthField é um campo válido
    const validFields = [
      'parecer_1_consultor', 'parecer_2_consultor', 'parecer_3_consultor',
      'parecer_4_consultor', 'parecer_5_consultor', 'parecer_6_consultor',
      'parecer_7_consultor', 'parecer_8_consultor', 'parecer_9_consultor',
      'parecer_10_consultor', 'parecer_11_consultor', 'parecer_12_consultor'
    ];
    
    if (!validFields.includes(monthField)) {
      console.error(`❌ Campo inválido: ${monthField}`);
      return;
    }
    
    // ✅ v2.2: Usar trechoOriginal da IA
    const conteudoOriginal = (result as any).trechoOriginal || result.details || result.summary;
    
    // ============================================================================
    // PASSO 1: Atualizar parecer no consultor
    // ============================================================================
    console.log('🔄 PASSO 1: Atualizando parecer na tabela consultants...');
    
    const updates: Record<string, any> = {
      [monthField]: result.riskScore,
      parecer_final_consultor: result.riskScore
    };
    
    console.log('📤 Dados do UPDATE:', JSON.stringify(updates));
    
    // ✅ v2.2: UPDATE SEM .single() para evitar erro se nenhuma linha for atualizada
    const { data: updateData, error: updateError } = await supabase
      .from('consultants')
      .update(updates)
      .eq('id', consultantId)
      .select('id, nome_consultores, ' + monthField + ', parecer_final_consultor');
    
    if (updateError) {
      console.error('❌ Erro no UPDATE:', updateError);
      throw updateError;
    }
    
    // ✅ v2.2: Verificar se o UPDATE realmente afetou alguma linha
    if (!updateData || updateData.length === 0) {
      console.error(`❌ UPDATE não afetou nenhuma linha! ID: ${consultantId}`);
      
      // Verificar se o consultor existe
      const { data: checkData } = await supabase
        .from('consultants')
        .select('id, nome_consultores')
        .eq('id', consultantId);
      
      if (!checkData || checkData.length === 0) {
        console.error(`❌ Consultor com ID ${consultantId} NÃO EXISTE na tabela!`);
      } else {
        console.error(`⚠️ Consultor existe mas UPDATE falhou. Possível problema de RLS/permissão.`);
      }
      throw new Error(`UPDATE falhou para consultor ID ${consultantId}`);
    }
    
    console.log('✅ UPDATE executado com sucesso!');
    console.log('📊 Dados retornados:', JSON.stringify(updateData[0]));
    
    // ============================================================================
    // PASSO 2: Salvar relatório na tabela consultant_reports
    // ============================================================================
    console.log('🔄 PASSO 2: Salvando relatório na tabela consultant_reports...');
    
    // Criar objeto de relatório
    const newReport: ConsultantReport = {
      id: `${consultantId}_${result.reportMonth}_${Date.now()}`,
      month: result.reportMonth,
      year: reportYear,
      riskScore: result.riskScore,
      summary: result.summary,
      negativePattern: result.negativePattern,
      predictiveAlert: result.predictiveAlert,
      recommendations: result.recommendations,
      content: conteudoOriginal,
      createdAt: new Date().toISOString(),
      generatedBy: 'manual',
      aiJustification: 'Análise baseada em relatório de atividades manual'
    };
    
    const { data: reportData, error: reportError } = await supabase
      .from('consultant_reports')
      .insert([{
        consultant_id: consultantId,
        month: newReport.month,
        year: newReport.year,
        risk_score: newReport.riskScore,
        summary: newReport.summary,
        negative_pattern: newReport.negativePattern,
        predictive_alert: newReport.predictiveAlert,
        recommendations: JSON.stringify(newReport.recommendations),
        content: newReport.content,
        generated_by: newReport.generatedBy,
        ai_justification: newReport.aiJustification
      }])
      .select('id');
    
    if (reportError) {
      console.error('❌ Erro ao salvar relatório:', reportError);
      throw reportError;
    }
    
    console.log(`✅ Relatório salvo! ID: ${reportData?.[0]?.id}`);
    
    // ============================================================================
    // PASSO 3: Salvar feedback para compliance
    // ============================================================================
    console.log('🔄 PASSO 3: Salvando feedback para compliance...');
    
    await saveFeedbackFromAnalysis(
      consultantId,
      result.riskScore,
      result.summary || 'Análise de relatório de atividades',
      result.reportMonth,
      reportYear
    );
    
    // ============================================================================
    // PASSO 3.1: Criar ação de RH se score for crítico (4 ou 5)
    // ============================================================================
    console.log('🔄 PASSO 3.1: Verificando necessidade de ação de RH...');
    
    await saveRHActionFromAnalysis(
      consultantId,
      result.consultantName,
      result.riskScore,
      result.summary || 'Situação identificada na análise de relatório'
    );
    
    // ============================================================================
    // PASSO 4: Atualizar estado local React
    // ============================================================================
    console.log('🔄 PASSO 4: Atualizando estado local...');
    
    // Atualizar estado local
    const updatedConsultant: Partial<Consultant> = {
      [monthField]: result.riskScore,
      parecer_final_consultor: result.riskScore
    };
    
    setConsultants(prev => prev.map(c => {
      if (c.id === consultantId) {
        return {
          ...c,
          ...updatedConsultant,
          reports: [...(c.reports || []), newReport],
          consultant_reports: [...(c.consultant_reports || []), newReport]
        };
      }
      return c;
    }));
    
    console.log('✅ Estado local atualizado');
    
    // ============================================================================
    // PASSO 5: Notificações de risco crítico
    // ============================================================================
    if (isCriticalRisk(result.riskScore)) {
      console.log('🚨 RISCO CRÍTICO DETECTADO! Enviando notificações...');
      
      try {
        // Buscar dados completos do consultor para notificação
        const { data: consultantData } = await supabase
          .from('consultants')
          .select('*')
          .eq('id', consultantId)
          .single();
        
        if (consultantData) {
          const notificationResult = await sendCriticalRiskNotifications(
            consultantData as Consultant,
            users,
            usuariosCliente,
            clients,
            result.summary || 'Análise de risco identificou situação crítica'
          );
          
          if (notificationResult.success) {
            console.log(`✅ Notificações enviadas: ${notificationResult.emailsSent} email(s)`);
          }
        }
      } catch (emailError: any) {
        console.error('❌ Erro ao enviar notificações:', emailError);
      }
    }
    
    // Verificar se deve ir para quarentena
    if (result.riskScore === 4 || result.riskScore === 5) {
      console.log(`⚠️ Consultor em QUARENTENA: Score ${result.riskScore}`);
    }
    
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ PROCESSAMENTO COMPLETO - Consultor ID: ${consultantId}`);
    console.log(`   Mês: ${result.reportMonth}/${reportYear} | Score: ${result.riskScore}`);
    console.log('═══════════════════════════════════════════════════════');
  };

  /**
   * Migração de dados anuais - Virada de Ano
   * 
   * REGRAS:
   * - Migra apenas consultores ATIVOS do ano anterior
   * - Cria NOVOS registros para o ano corrente (preserva histórico)
   * - P1 do novo ano = parecer_final do ano anterior
   * - P2 a P12 = null (novo ciclo)
   * - parecer_final = mesmo do ano anterior (base inicial)
   * 
   * @returns Objeto com estatísticas da migração
   */
  const migrateYearlyData = async (): Promise<{
    success: boolean;
    migrated: number;
    skipped: number;
    errors: string[];
    details: Array<{ nome: string; status: string }>;
  }> => {
    const anoAtual = new Date().getFullYear();
    const anoAnterior = anoAtual - 1;
    const errors: string[] = [];
    const details: Array<{ nome: string; status: string }> = [];
    let migrated = 0;
    let skipped = 0;

    console.log('═══════════════════════════════════════════════════════');
    console.log(`🔄 INICIANDO MIGRAÇÃO DE ANO: ${anoAnterior} → ${anoAtual}`);
    console.log('═══════════════════════════════════════════════════════');

    try {
      // 1. Buscar consultores ATIVOS do ano anterior
      const { data: consultoresAnoAnterior, error: fetchError } = await supabase
        .from('consultants')
        .select('*')
        .eq('ano_vigencia', anoAnterior)
        .eq('status', 'Ativo');

      if (fetchError) {
        throw new Error(`Erro ao buscar consultores de ${anoAnterior}: ${fetchError.message}`);
      }

      if (!consultoresAnoAnterior || consultoresAnoAnterior.length === 0) {
        console.log(`⚠️ Nenhum consultor ativo encontrado em ${anoAnterior}`);
        return {
          success: true,
          migrated: 0,
          skipped: 0,
          errors: [],
          details: [{ nome: 'N/A', status: `Nenhum consultor ativo em ${anoAnterior}` }]
        };
      }

      console.log(`📋 ${consultoresAnoAnterior.length} consultores ativos encontrados em ${anoAnterior}`);

      // 2. Verificar quais já foram migrados (evitar duplicatas)
      const { data: consultoresAnoAtual } = await supabase
        .from('consultants')
        .select('cpf, email_consultor')
        .eq('ano_vigencia', anoAtual);

      const jaMigrados = new Set<string>();
      (consultoresAnoAtual || []).forEach(c => {
        if (c.cpf) jaMigrados.add(`cpf:${c.cpf}`);
        if (c.email_consultor) jaMigrados.add(`email:${c.email_consultor}`);
      });

      // 3. Migrar cada consultor
      for (const consultor of consultoresAnoAnterior) {
        try {
          // Verificar se já foi migrado
          const cpfKey = consultor.cpf ? `cpf:${consultor.cpf}` : null;
          const emailKey = consultor.email_consultor ? `email:${consultor.email_consultor}` : null;
          
          if ((cpfKey && jaMigrados.has(cpfKey)) || (emailKey && jaMigrados.has(emailKey))) {
            console.log(`⏭️ ${consultor.nome_consultores} já migrado para ${anoAtual} - pulando`);
            details.push({ nome: consultor.nome_consultores, status: 'Já migrado' });
            skipped++;
            continue;
          }

          // Determinar o score inicial para P1 do novo ano
          const scoreInicial = consultor.parecer_final_consultor || consultor.parecer_12_consultor || 3;

          // Criar novo registro para o ano atual
          const novoConsultor = {
            // Dados básicos (copiados)
            nome_consultores: consultor.nome_consultores,
            email_consultor: consultor.email_consultor,
            celular: consultor.celular,
            cpf: consultor.cpf,
            cargo_consultores: consultor.cargo_consultores,
            data_inclusao_consultores: consultor.data_inclusao_consultores,
            status: 'Ativo',
            ativo_consultor: true,
            
            // Dados financeiros (copiados)
            valor_faturamento: consultor.valor_faturamento,
            valor_pagamento: consultor.valor_pagamento,
            
            // Relacionamentos (copiados)
            gestor_imediato_id: consultor.gestor_imediato_id,
            coordenador_id: consultor.coordenador_id,
            analista_rs_id: consultor.analista_rs_id,
            id_gestao_de_pessoas: consultor.id_gestao_de_pessoas,
            
            // Dados adicionais (copiados)
            especialidade: consultor.especialidade,
            dt_aniversario: consultor.dt_aniversario,
            cnpj_consultor: consultor.cnpj_consultor,
            empresa_consultor: consultor.empresa_consultor,
            
            // Vínculo com candidato (copiados)
            pessoa_id: consultor.pessoa_id,
            candidatura_id: consultor.candidatura_id,
            curriculo_url: consultor.curriculo_url,
            
            // ✅ ANO NOVO
            ano_vigencia: anoAtual,
            
            // ✅ PARECERES DO NOVO ANO
            parecer_1_consultor: scoreInicial, // P1 = score final do ano anterior
            parecer_2_consultor: null,
            parecer_3_consultor: null,
            parecer_4_consultor: null,
            parecer_5_consultor: null,
            parecer_6_consultor: null,
            parecer_7_consultor: null,
            parecer_8_consultor: null,
            parecer_9_consultor: null,
            parecer_10_consultor: null,
            parecer_11_consultor: null,
            parecer_12_consultor: null,
            parecer_final_consultor: scoreInicial, // Base inicial
            
            // Campos de controle
            data_ultima_alteracao: new Date().toISOString()
          };

          const { error: insertError } = await supabase
            .from('consultants')
            .insert([novoConsultor]);

          if (insertError) {
            throw new Error(`Erro ao inserir: ${insertError.message}`);
          }

          console.log(`✅ ${consultor.nome_consultores} migrado com P1=${scoreInicial}`);
          details.push({ 
            nome: consultor.nome_consultores, 
            status: `Migrado (P1=${scoreInicial})` 
          });
          migrated++;

          // Adicionar à lista de já migrados para evitar duplicatas no mesmo batch
          if (cpfKey) jaMigrados.add(cpfKey);
          if (emailKey) jaMigrados.add(emailKey);

        } catch (consultorError: any) {
          console.error(`❌ Erro ao migrar ${consultor.nome_consultores}:`, consultorError);
          errors.push(`${consultor.nome_consultores}: ${consultorError.message}`);
          details.push({ nome: consultor.nome_consultores, status: `Erro: ${consultorError.message}` });
        }
      }

      console.log('═══════════════════════════════════════════════════════');
      console.log(`✅ MIGRAÇÃO CONCLUÍDA: ${migrated} migrados, ${skipped} pulados, ${errors.length} erros`);
      console.log('═══════════════════════════════════════════════════════');

      return {
        success: errors.length === 0,
        migrated,
        skipped,
        errors,
        details
      };

    } catch (err: any) {
      console.error('❌ Erro fatal na migração:', err);
      return {
        success: false,
        migrated,
        skipped,
        errors: [err.message],
        details
      };
    }
  };

  return {
    processReportAnalysis,
    updateConsultantScore,
    migrateYearlyData,
    // ✅ Exportar helpers para uso externo se necessário
    deriveSentiment,
    deriveRiskLevel,
    saveFeedbackFromAnalysis,
    saveRHActionFromAnalysis  // ✅ v2.3: Criar ações de RH para scores críticos
  };
};
