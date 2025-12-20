/**
 * useReportAnalysis Hook - Análise de Relatórios com IA
 * Módulo separado do useSupabaseData para melhor organização
 * Inclui integração com Gemini AI e notificações de risco crítico
 */

import { supabase } from '../../config/supabase';
import { sendCriticalRiskNotifications, isCriticalRisk } from '../../services/emailService';
import { 
  Consultant, ConsultantReport, AIAnalysisResult, 
  User, UsuarioCliente, Client 
} from '@/types';

export const useReportAnalysis = () => {

  /**
   * Processa análise de relatório com IA Gemini
   * Chama a API backend que tem acesso à API_KEY
   */
  const processReportAnalysis = async (text: string, gestorName?: string): Promise<AIAnalysisResult[]> => {
    try {
      console.log('🤖 Processando análise de relatório com IA Gemini...');
      console.log('📝 Tamanho do texto:', text.length, 'caracteres');
      console.log('📋 Primeiros 100 caracteres:', text.substring(0, 100));
      
      console.log('📡 Enviando requisição para API Backend...');
      
      const response = await fetch('/api/analyze-activity-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText: text, gestorName })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Erro na API: ${response.status} - ${errorData.message || response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Resposta recebida da API Backend');
      
      const analysisResults = data.results || [];
      console.log(`✅ ${analysisResults.length} relatório(s) analisado(s) pela IA Gemini`);
      
      // Mapear resultados para AIAnalysisResult
      const results: AIAnalysisResult[] = analysisResults.map((analysis: any) => ({
        consultantName: analysis.consultantName,
        managerName: analysis.managerName,
        reportMonth: analysis.reportMonth || new Date().getMonth() + 1,
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
        details: analysis.details || analysis.summary
      }));
      
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
   */
  const updateConsultantScore = async (
    result: AIAnalysisResult,
    consultants: Consultant[],
    setConsultants: React.Dispatch<React.SetStateAction<Consultant[]>>,
    users: User[],
    usuariosCliente: UsuarioCliente[],
    clients: Client[]
  ) => {
    try {
      console.log(`📊 Atualizando score do consultor: ${result.consultantName}`);
      
      // Buscar consultor pelo nome
      const consultant = consultants.find(c => 
        c.nome_consultores.toLowerCase() === result.consultantName.toLowerCase()
      );
      
      if (!consultant) {
        console.warn(`⚠️ Consultor não encontrado: ${result.consultantName}`);
        return;
      }
      
      // Preparar campo do mês (parecer_1_consultor, parecer_2_consultor, etc)
      const monthField = `parecer_${result.reportMonth}_consultor` as keyof Consultant;
      
      // Criar objeto de relatório
      const newReport: ConsultantReport = {
        id: `${consultant.id}_${result.reportMonth}_${Date.now()}`,
        month: result.reportMonth,
        year: new Date().getFullYear(),
        riskScore: result.riskScore,
        summary: result.summary,
        negativePattern: result.negativePattern,
        predictiveAlert: result.predictiveAlert,
        recommendations: result.recommendations,
        content: result.details,
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
          content: newReport.content,
          generated_by: newReport.generatedBy,
          ai_justification: newReport.aiJustification
        }]);
      
      if (reportError) {
        console.error('❌ Erro ao salvar relatório:', reportError);
        throw reportError;
      }
      
      console.log(`✅ Relatório salvo (acumulativo): ${consultant.nome_consultores} - Mês ${newReport.month}`);
      
      // Atualizar estado local
      const updatedConsultant: Consultant = {
        ...consultant,
        ...updates,
        reports: [...(consultant.reports || []), newReport]
      };
      
      setConsultants(prev => prev.map(c => 
        c.id === consultant.id ? updatedConsultant : c
      ));
      
      console.log(`✅ Score atualizado: ${result.consultantName} - Mês ${result.reportMonth} - Risco ${result.riskScore}`);
      
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
      if (result.riskScore === 1 || result.riskScore === 2) {
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
    migrateYearlyData
  };
};
