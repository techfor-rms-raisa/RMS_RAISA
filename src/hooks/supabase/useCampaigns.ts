/**
 * useCampaigns Hook - Gerenciamento de Campanhas de Compliance
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { ComplianceCampaign, FeedbackResponse, RHAction } from '@/types';

export const useCampaigns = () => {
  const [campaigns, setCampaigns] = useState<ComplianceCampaign[]>([]);
  const [feedbackResponses, setFeedbackResponses] = useState<FeedbackResponse[]>([]);
  const [rhActions, setRhActions] = useState<RHAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todas as campanhas de compliance
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
      console.log(`✅ ${mappedCampaigns.length} campanhas carregadas`);
      return mappedCampaigns;
    } catch (err: any) {
      console.error('❌ Erro ao carregar campanhas:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona uma nova campanha
   */
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
      alert(`Erro ao criar campanha: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza uma campanha existente
   */
  const updateCampaign = async (id: string, updates: Partial<ComplianceCampaign>) => {
    try {
      console.log('📝 Atualizando campanha:', id, updates);

      const { data, error } = await supabase
        .from('compliance_campaigns')
        .update({
          name: updates.name,
          target_filter: updates.target_filter,
          interval_days: updates.interval_days,
          start_date: updates.start_date,
          status: updates.status
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedCampaign: ComplianceCampaign = {
        id: data.id,
        name: data.name,
        target_filter: data.target_filter,
        interval_days: data.interval_days,
        start_date: data.start_date,
        status: data.status,
        created_at: data.created_at
      };

      setCampaigns(prev => prev.map(c => c.id === id ? updatedCampaign : c));
      console.log('✅ Campanha atualizada:', updatedCampaign);
      
      return updatedCampaign;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar campanha:', err);
      alert(`Erro ao atualizar campanha: ${err.message}`);
      throw err;
    }
  };

  /**
   * Adiciona uma resposta de feedback (stub - não implementado no banco)
   */
  const addFeedbackResponse = async (response: FeedbackResponse) => {
    console.warn('⚠️ addFeedbackResponse: Não implementado no banco de dados');
    setFeedbackResponses(prev => [...prev, response]);
    return response;
  };

  /**
   * Adiciona uma ação de RH (stub - não implementado no banco)
   */
  const addRHAction = async (action: RHAction) => {
    console.warn('⚠️ addRHAction: Não implementado no banco de dados');
    setRhActions(prev => [...prev, action]);
    return action;
  };

  return {
    campaigns,
    setCampaigns,
    feedbackResponses,
    setFeedbackResponses,
    rhActions,
    setRhActions,
    loading,
    error,
    loadCampaigns,
    addCampaign,
    updateCampaign,
    addFeedbackResponse,
    addRHAction
  };
};
