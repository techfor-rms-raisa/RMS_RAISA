/**
 * useCampaigns Hook - Gerenciamento de Compliance e Feedbacks
 * Módulo separado do useSupabaseData para melhor organização
 * 
 * ✅ v3.0 - COMPLIANCE TEMPORAL ANALYSIS
 * - Carrega feedbacks com month/year
 * - Análise de sentimento por período
 * - Comparação ano atual vs ano anterior
 * - Campanhas suspensas (não utilizadas nesta fase)
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { ComplianceCampaign, FeedbackResponse, RHAction } from '@/types';

// ============================================================================
// TIPOS AUXILIARES
// ============================================================================

export interface FeedbackWithTemporal extends FeedbackResponse {
  month?: number;
  year?: number;
  source?: 'ai_analysis' | 'manual' | 'campaign';
}

export interface SentimentByMonth {
  month: number;
  monthName: string;
  positivo: number;
  neutro: number;
  negativo: number;
  total: number;
  percentPositivo: number;
}

export interface YearComparison {
  month: number;
  monthName: string;
  currentYear: number;
  previousYear: number;
  currentYearPercent: number;
  previousYearPercent: number;
}

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

export const useCampaigns = () => {
  const [campaigns, setCampaigns] = useState<ComplianceCampaign[]>([]);
  const [feedbackResponses, setFeedbackResponses] = useState<FeedbackWithTemporal[]>([]);
  const [rhActions, setRhActions] = useState<RHAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // HELPERS: Cálculo de Sentiment
  // ============================================================================
  
  const calculateSentiment = (score: number): 'Positivo' | 'Neutro' | 'Negativo' => {
    // Score de feedback (0-10) → Sentiment
    if (score >= 7) return 'Positivo';
    if (score >= 4) return 'Neutro';
    return 'Negativo';
  };

  const calculateRiskLevel = (score: number): 'Baixo' | 'Médio' | 'Alto' => {
    if (score >= 7) return 'Baixo';
    if (score >= 4) return 'Médio';
    return 'Alto';
  };

  const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // ============================================================================
  // CARREGAMENTO DE DADOS
  // ============================================================================

  /**
   * Carrega campanhas (suspensas nesta fase, mas mantido para compatibilidade)
   */
  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('compliance_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedCampaigns: ComplianceCampaign[] = (data || []).map((campaign: any) => ({
        id: campaign.id,
        name: campaign.name,
        target_filter: campaign.target_filter,
        interval_days: campaign.interval_days,
        start_date: campaign.start_date,
        status: campaign.status,
        created_at: campaign.created_at
      }));

      setCampaigns(mappedCampaigns);
      console.log(`✅ ${mappedCampaigns.length} campanhas carregadas (suspensas)`);
      return mappedCampaigns;
    } catch (err: any) {
      console.error('❌ Erro ao carregar campanhas:', err);
      setCampaigns([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ v3.0: Carrega feedbacks com suporte a campos temporais
   */
  const loadFeedbackResponses = async () => {
    try {
      setLoading(true);
      console.log('📊 Carregando feedback_responses do Supabase...');
      
      const { data, error } = await supabase
        .from('feedback_responses')
        .select('*')
        .order('answered_at', { ascending: false });

      if (error) throw error;

      const mappedFeedbacks: FeedbackWithTemporal[] = (data || []).map((fb: any) => {
        // Se não tiver sentiment no banco, calcula baseado no score
        const sentiment = fb.sentiment || calculateSentiment(fb.score);
        const riskLevel = fb.risk_level || calculateRiskLevel(fb.score);
        
        // Se não tiver month/year, extrai da data de resposta
        const answeredDate = new Date(fb.answered_at);
        const month = fb.month || (answeredDate.getMonth() + 1);
        const year = fb.year || answeredDate.getFullYear();

        return {
          id: fb.id,
          requestId: fb.request_id || '',
          consultantId: fb.consultant_id,
          score: fb.score,
          comment: fb.comment || '',
          answeredAt: fb.answered_at,
          sentiment: sentiment,
          riskLevel: riskLevel,
          keyPoints: [],
          suggestedAction: '',
          month: month,
          year: year,
          source: fb.source || 'ai_analysis'
        };
      });

      setFeedbackResponses(mappedFeedbacks);
      console.log(`✅ ${mappedFeedbacks.length} feedbacks carregados`);
      return mappedFeedbacks;
    } catch (err: any) {
      console.error('❌ Erro ao carregar feedbacks:', err);
      setFeedbackResponses([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  /**
   * Carrega ações de RH
   */
  const loadRHActions = async () => {
    try {
      setLoading(true);
      console.log('📋 Carregando rh_actions do Supabase...');
      
      const { data, error } = await supabase
        .from('rh_actions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedActions: RHAction[] = (data || []).map((action: any) => ({
        id: action.id,
        consultantId: action.consultant_id,
        description: action.descricao || action.description,  // ✅ Suporta ambos os nomes
        status: action.status || 'pendente',
        priority: action.priority || 'media',
        origin: action.origin || 'manual',
        createdAt: action.created_at
      }));

      setRhActions(mappedActions);
      console.log(`✅ ${mappedActions.length} ações de RH carregadas`);
      return mappedActions;
    } catch (err: any) {
      console.error('❌ Erro ao carregar ações de RH:', err);
      setRhActions([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // ✅ NOVO: ANÁLISE TEMPORAL DE SENTIMENTO
  // ============================================================================

  /**
   * Retorna dados de sentimento agrupados por mês para um ano específico
   */
  const getSentimentByMonth = (year: number): SentimentByMonth[] => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const monthFeedbacks = feedbackResponses.filter(
        fb => fb.year === year && fb.month === month
      );

      const positivo = monthFeedbacks.filter(fb => fb.sentiment === 'Positivo').length;
      const neutro = monthFeedbacks.filter(fb => fb.sentiment === 'Neutro').length;
      const negativo = monthFeedbacks.filter(fb => fb.sentiment === 'Negativo').length;
      const total = monthFeedbacks.length;
      const percentPositivo = total > 0 ? Math.round((positivo / total) * 100) : 0;

      return {
        month,
        monthName: MONTH_NAMES[i],
        positivo,
        neutro,
        negativo,
        total,
        percentPositivo
      };
    });
  };

  /**
   * ✅ NOVO: Comparação Ano Atual vs Ano Anterior
   * Retorna dados para o gráfico de linhas comparativo
   */
  const getYearComparison = (currentYear: number): YearComparison[] => {
    const previousYear = currentYear - 1;
    const currentYearData = getSentimentByMonth(currentYear);
    const previousYearData = getSentimentByMonth(previousYear);

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const current = currentYearData[i];
      const previous = previousYearData[i];

      return {
        month,
        monthName: MONTH_NAMES[i],
        currentYear: current.percentPositivo,
        previousYear: previous.percentPositivo,
        currentYearPercent: current.percentPositivo,
        previousYearPercent: previous.percentPositivo
      };
    });
  };

  /**
   * ✅ NOVO: KPIs de Compliance
   */
  const getComplianceKPIs = (year: number) => {
    const yearFeedbacks = feedbackResponses.filter(fb => fb.year === year);
    const totalFeedbacks = yearFeedbacks.length;
    
    const positivos = yearFeedbacks.filter(fb => fb.sentiment === 'Positivo').length;
    const neutros = yearFeedbacks.filter(fb => fb.sentiment === 'Neutro').length;
    const negativos = yearFeedbacks.filter(fb => fb.sentiment === 'Negativo').length;
    
    const riscoAlto = yearFeedbacks.filter(fb => fb.riskLevel === 'Alto').length;
    const pendingActions = rhActions.filter(a => a.status === 'pendente').length;

    // Calcular tendência (comparando últimos 3 meses com 3 meses anteriores)
    const currentMonth = new Date().getMonth() + 1;
    const last3Months = yearFeedbacks.filter(
      fb => fb.month && fb.month >= currentMonth - 2 && fb.month <= currentMonth
    );
    const prev3Months = yearFeedbacks.filter(
      fb => fb.month && fb.month >= currentMonth - 5 && fb.month <= currentMonth - 3
    );

    const last3PositiveRate = last3Months.length > 0 
      ? last3Months.filter(fb => fb.sentiment === 'Positivo').length / last3Months.length 
      : 0;
    const prev3PositiveRate = prev3Months.length > 0 
      ? prev3Months.filter(fb => fb.sentiment === 'Positivo').length / prev3Months.length 
      : 0;

    const trend = last3PositiveRate > prev3PositiveRate ? 'improving' 
                : last3PositiveRate < prev3PositiveRate ? 'declining' 
                : 'stable';

    return {
      totalFeedbacks,
      positivos,
      neutros,
      negativos,
      riscoAlto,
      pendingActions,
      percentPositivo: totalFeedbacks > 0 ? Math.round((positivos / totalFeedbacks) * 100) : 0,
      percentNegativo: totalFeedbacks > 0 ? Math.round((negativos / totalFeedbacks) * 100) : 0,
      trend
    };
  };

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  const addCampaign = async (newCampaign: Omit<ComplianceCampaign, 'id'>) => {
    try {
      console.log('➕ Criando campanha:', newCampaign);
      const { data, error } = await supabase
        .from('compliance_campaigns')
        .insert([{
          name: newCampaign.name,
          target_filter: newCampaign.target_filter,
          interval_days: newCampaign.interval_days,
          start_date: newCampaign.start_date,
          status: newCampaign.status || 'paused'
        }])
        .select()
        .single();

      if (error) throw error;

      const createdCampaign: ComplianceCampaign = {
        id: data.id,
        name: data.name,
        target_filter: data.target_filter,
        interval_days: data.interval_days,
        start_date: data.start_date,
        status: data.status,
        created_at: data.created_at
      };

      setCampaigns(prev => [createdCampaign, ...prev]);
      console.log('✅ Campanha criada:', createdCampaign);
      return createdCampaign;
    } catch (err: any) {
      console.error('❌ Erro ao criar campanha:', err);
      throw err;
    }
  };

  const updateCampaign = async (id: string, updates: Partial<ComplianceCampaign>) => {
    try {
      const { data, error } = await supabase
        .from('compliance_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
      console.log('✅ Campanha atualizada');
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar campanha:', err);
      throw err;
    }
  };

  const addFeedbackResponse = async (response: Partial<FeedbackWithTemporal>) => {
    try {
      console.log('➕ Adicionando feedback:', response);
      
      const sentiment = response.sentiment || calculateSentiment(response.score || 5);
      const riskLevel = response.riskLevel || calculateRiskLevel(response.score || 5);

      const { data, error } = await supabase
        .from('feedback_responses')
        .insert([{
          request_id: response.requestId || null,
          consultant_id: response.consultantId,
          score: response.score,
          comment: response.comment,
          month: response.month,
          year: response.year,
          sentiment: sentiment,
          risk_level: riskLevel,
          source: response.source || 'manual'
        }])
        .select()
        .single();

      if (error) {
        // Fallback se campos novos não existirem
        if (error.message.includes('column')) {
          const { data: basicData, error: basicError } = await supabase
            .from('feedback_responses')
            .insert([{
              consultant_id: response.consultantId,
              score: response.score,
              comment: response.comment
            }])
            .select()
            .single();
          
          if (basicError) throw basicError;
          
          const createdFeedback: FeedbackWithTemporal = {
            id: basicData.id,
            requestId: '',
            consultantId: basicData.consultant_id,
            score: basicData.score,
            comment: basicData.comment || '',
            answeredAt: basicData.answered_at,
            sentiment: sentiment,
            riskLevel: riskLevel,
            month: response.month,
            year: response.year
          };
          
          setFeedbackResponses(prev => [createdFeedback, ...prev]);
          return createdFeedback;
        }
        throw error;
      }

      const createdFeedback: FeedbackWithTemporal = {
        id: data.id,
        requestId: data.request_id || '',
        consultantId: data.consultant_id,
        score: data.score,
        comment: data.comment || '',
        answeredAt: data.answered_at,
        sentiment: data.sentiment || sentiment,
        riskLevel: data.risk_level || riskLevel,
        month: data.month,
        year: data.year,
        source: data.source
      };

      setFeedbackResponses(prev => [createdFeedback, ...prev]);
      console.log('✅ Feedback adicionado:', createdFeedback);
      return createdFeedback;
    } catch (err: any) {
      console.error('❌ Erro ao adicionar feedback:', err);
      throw err;
    }
  };

  const addRHAction = async (action: Omit<RHAction, 'id' | 'createdAt'>) => {
    try {
      console.log('➕ Adicionando ação de RH:', action);
      const { data, error } = await supabase
        .from('rh_actions')
        .insert([{
          consultant_id: action.consultantId,
          descricao: action.description,  // ✅ Nome real da coluna
          status: action.status || 'pendente',
          priority: action.priority || 'media',
          origin: action.origin
        }])
        .select()
        .single();

      if (error) throw error;

      const createdAction: RHAction = {
        id: data.id,
        consultantId: data.consultant_id,
        description: data.descricao || data.description,  // ✅ Suporta ambos
        status: data.status,
        priority: data.priority,
        origin: data.origin,
        createdAt: data.created_at
      };

      setRhActions(prev => [createdAction, ...prev]);
      console.log('✅ Ação de RH adicionada');
      return createdAction;
    } catch (err: any) {
      console.error('❌ Erro ao adicionar ação de RH:', err);
      throw err;
    }
  };

  const updateRHActionStatus = async (id: string, status: 'pendente' | 'concluido') => {
    try {
      const { error } = await supabase
        .from('rh_actions')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      setRhActions(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      console.log('✅ Status da ação atualizado');
    } catch (err: any) {
      console.error('❌ Erro ao atualizar status:', err);
      throw err;
    }
  };

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // Estados
    campaigns,
    setCampaigns,
    feedbackResponses,
    setFeedbackResponses,
    rhActions,
    setRhActions,
    loading,
    error,
    
    // Carregamento
    loadCampaigns,
    loadFeedbackResponses,
    loadRHActions,
    
    // CRUD
    addCampaign,
    updateCampaign,
    addFeedbackResponse,
    addRHAction,
    updateRHActionStatus,
    
    // ✅ NOVO: Análise Temporal
    getSentimentByMonth,
    getYearComparison,
    getComplianceKPIs,
    
    // Helpers
    calculateSentiment,
    calculateRiskLevel
  };
};
