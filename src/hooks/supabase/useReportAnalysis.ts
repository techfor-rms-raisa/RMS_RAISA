/**
 * useReportAnalysis Hook - Análise de Relatórios com IA
 * Módulo separado do useSupabaseData para melhor organização
 * Inclui integração com Gemini AI e notificações de risco crítico
 * 
 * ✅ VERSÃO 2.1 - FIX TRECHO ORIGINAL
 * - Usa trechoOriginal retornado pela IA (não o relatório completo)
 * - Salva apenas a parte do relatório que compete ao consultor
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
   * ✅ v2.1: Usa trechoOriginal da IA (não o relatório completo)
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
      console.log(`📊 Atualizando score do consultor: ${result.consultantName}`);
      console.log(`📅 Mês do relatório: ${result.reportMonth}, Ano: ${(result as any).reportYear || new Date().getFullYear()}`);
      
      // Buscar consultor pelo nome (case insensitive e trim)
      const consultant = consultants.find(c => 
        c.nome_consultores.toLowerCase().trim() === result.consultantName.toLowerCase().trim()
      );
      
      if (!consultant) {
        console.warn(`⚠️ Consultor não encontrado: ${result.consultantName}`);
        return;
      }
      
      // Preparar campo do mês (parecer_1_consultor, parecer_2_consultor, etc)
      const monthField = `parecer_${result.reportMonth}_consultor` as keyof Consultant;
      
      // ✅ CORREÇÃO: Usa o ano do resultado se disponível
      const reportYear = (result as any).reportYear || new Date().getFullYear();
      
      // ✅ CORREÇÃO v2.1: Usar trechoOriginal da IA, NÃO o relatório completo
      // Prioridade: 1) trechoOriginal da IA, 2) details, 3) summary
      const conteudoOriginal = (result as any).trechoOriginal || result.details || result.summary;
      
      console.log(`📝 Conteúdo a salvar (${conteudoOriginal?.length || 0} chars): ${conteudoOriginal?.substring(0, 100)}...`);
      
      // Criar objeto de relatório
      const newReport: ConsultantReport = {
        id: `${consultant.id}_${result.reportMonth}_${Date.now()}`,
        month: result.reportMonth,
        year: reportYear,
        riskScore: result.riskScore,
        summary: result.summary, // Resumo gerado pela IA
        negativePattern: result.negativePattern,
        predictiveAlert: result.predictiveAlert,
        recommendations: result.recommendations,
        content: conteudoOriginal, // ✅ CORREÇÃO: Trecho original do consultor (não relatório inteiro)
        createdAt: new Date().toISOString(),
        generatedBy: 'manual',
        aiJustification: 'Análise baseada em relatório de atividades manual'
      };
      
      // Atualizar consultor no Supabase
      const updates: any = {
        [monthField]: result.riskScore,
        parecer_final_consultor: result.riskScore
      };
      
      const { data, error } = await supabase
        .from('consultants')
        .update(updates)
        .eq('id', consultant.id)
        .select()
        .single();
      
      if (error) throw error;
      
      // ✅ Salvar relatório integral na tabela consultant_reports (ACUMULATIVO)
      const { error: reportError } = await supabase
        .from('consultant_reports')
        .insert([{
          consultant_id: consultant.id,
          month: newReport.month,
          year: newReport.year,
          risk_score: newReport.riskScore,
          summary: newReport.summary,
          negative_pattern: newReport.negativePattern,
          predictive_alert: newReport.predictiveAlert,
          recommendations: JSON.stringify(newReport.recommendations),
          content: newReport.content, // ✅ CORREÇÃO: Trecho original do consultor
          generated_by: newReport.generatedBy,
          ai_justification: newReport.aiJustification
        }]);
      
      if (reportError) {
        console.error('❌ Erro ao salvar relatório:', reportError);
        throw reportError;
      }
      
      console.log(`✅ Relatório salvo (trecho específico): ${consultant.nome_consultores} - Mês ${newReport.month}/${newReport.year}`);
      
      // ✅ NOVO v2.0: Salvar feedback para análise de compliance
      await saveFeedbackFromAnalysis(
        consultant.id,
        result.riskScore,
        result.summary || 'Análise de relatório de atividades',
        result.reportMonth,
        reportYear
      );
      
      // Atualizar estado local
      const updatedConsultant: Consultant = {
        ...consultant,
        ...updates,
        reports: [...(consultant.reports || []), newReport]
      };
      
      setConsultants(prev => prev.map(c => 
        c.id === consultant.id ? updatedConsultant : c
      ));
      
      console.log(`✅ Score atualizado: ${result.consultantName} - Mês ${result.reportMonth}/${reportYear} - Risco ${result.riskScore}`);
      
      // 🚨 Verificar se é Risco Crítico (Score 5) e disparar notificações via Resend
      if (isCriticalRisk(result.riskScore)) {
        console.log(`🚨 RISCO CRÍTICO DETECTADO: ${result.consultantName} - Disparando notificações...`);
        
        try {
          const notificationResult = await sendCriticalRiskNotifications(
            consultant,
            users,
            usuariosCliente,
            clients,
            result.summary || 'Análise de risco identificou situação crítica'
          );
          
          if (notificationResult.success) {
            console.log(`✅ Notificações enviadas: ${notificationResult.emailsSent} email(s) para: ${notificationResult.recipients.join(', ')}`);
          } else {
            console.warn(`⚠️ Falha ao enviar notificações: ${notificationResult.errors.join(', ')}`);
          }
        } catch (emailError: any) {
          console.error('❌ Erro ao enviar notificações de risco crítico:', emailError);
          // Não interrompe o fluxo principal - apenas loga o erro
        }
      }
      
      // Verificar se deve ir para quarentena
      if (result.riskScore === 4 || result.riskScore === 5) {
        console.log(`⚠️ Consultor em QUARENTENA: ${result.consultantName}`);
      }
      
    } catch (err: any) {
      console.error('❌ Erro ao atualizar score:', err);
      alert(`Erro ao atualizar score do consultor: ${err.message}`);
    }
  };

  /**
   * Migração de dados anuais (stub - não implementado)
   */
  const migrateYearlyData = async () => {
    console.warn('⚠️ migrateYearlyData: Não implementado');
  };

  return {
    processReportAnalysis,
    updateConsultantScore,
    migrateYearlyData,
    // ✅ Exportar helpers para uso externo se necessário
    deriveSentiment,
    deriveRiskLevel,
    saveFeedbackFromAnalysis
  };
};
