/**
 * useMLLearning.ts - Hook para Sistema de Machine Learning
 * 
 * Funcionalidades:
 * - Registrar feedback (aprovação/reprovação)
 * - Calcular score ML
 * - Treinar modelo
 * - Visualizar métricas
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface FeedbackML {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  candidato_id: number;
  cliente_id: number;
  resultado: 'aprovado' | 'reprovado' | 'desistencia';
  motivo_reprovacao?: string;
  features_candidato: Record<string, any>;
  score_ia_pre_decisao: number;
  data_feedback: string;
}

export interface ModeloML {
  id: number;
  modelo_nome: string;
  versao: number;
  ativo: boolean;
  cliente_id: number | null;
  pesos: Record<string, number>;
  metricas: {
    total_amostras: number;
    taxa_acerto: number;
    precisao_aprovados: number;
    precisao_reprovados: number;
    ultima_avaliacao: string | null;
  };
  treinado_em: string;
}

export interface PerformanceModelo {
  modelo_id: number;
  modelo_nome: string;
  versao: number;
  cliente_id: number | null;
  cliente_nome: string | null;
  ativo: boolean;
  total_feedbacks: number;
  total_aprovados: number;
  total_reprovados: number;
  taxa_acerto: number;
  precisao_aprovados: number;
  precisao_reprovados: number;
  peso_skills: number;
  peso_senioridade: number;
  peso_experiencia: number;
}

export interface ScoreMLResult {
  score: number;
  recomendacao: 'forte_sim' | 'sim' | 'talvez' | 'nao';
  confianca: number;
  modelo_usado: number | null;
}

export interface FeaturesInput {
  skills_match_percent: number;
  senioridade_match: boolean;
  anos_experiencia: number;
  salario_dentro_faixa: boolean;
  localizacao_match: boolean;
  formacao_relevante: boolean;
  ultima_experiencia_relevante: boolean;
  [key: string]: any;
}

// ============================================
// HOOK
// ============================================

export function useMLLearning() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // REGISTRAR FEEDBACK
  // ============================================

  const registrarFeedback = useCallback(async (
    candidaturaId: number,
    resultado: 'aprovado' | 'reprovado' | 'desistencia',
    motivo?: string,
    featuresExtras?: Record<string, any>
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Buscar dados da candidatura
      const { data: candidatura, error: candError } = await supabase
        .from('candidaturas')
        .select(`
          *,
          vaga:vagas(id, cliente_id, analista_id, stack_tecnologica, senioridade),
          candidato:consultants(id, nome_consultores, especialidade)
        `)
        .eq('id', candidaturaId)
        .single();

      if (candError) throw candError;

      // Montar features do candidato
      const features: Record<string, any> = {
        score_ia_original: candidatura.score_ia || 0,
        ...featuresExtras
      };

      // Inserir feedback
      const { error: insertError } = await supabase
        .from('ml_feedback_candidatura')
        .insert({
          candidatura_id: candidaturaId,
          vaga_id: candidatura.vaga_id,
          candidato_id: candidatura.candidato_id,
          cliente_id: candidatura.vaga?.cliente_id,
          analista_id: candidatura.vaga?.analista_id,
          resultado,
          motivo_reprovacao: resultado === 'reprovado' ? motivo : null,
          features_candidato: features,
          score_ia_pre_decisao: candidatura.score_ia
        });

      if (insertError) throw insertError;

      console.log('✅ Feedback ML registrado:', { candidaturaId, resultado });
      return true;

    } catch (err: any) {
      console.error('Erro ao registrar feedback:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // CALCULAR SCORE ML
  // ============================================

  const calcularScoreML = useCallback(async (
    features: FeaturesInput,
    clienteId?: number
  ): Promise<ScoreMLResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .rpc('fn_calcular_score_ml', {
          p_features: features,
          p_cliente_id: clienteId || null
        });

      if (error) throw error;

      if (data && data.length > 0) {
        return {
          score: data[0].score,
          recomendacao: data[0].recomendacao,
          confianca: data[0].confianca,
          modelo_usado: data[0].modelo_usado
        };
      }

      return null;

    } catch (err: any) {
      console.error('Erro ao calcular score ML:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // BUSCAR MODELOS
  // ============================================

  const buscarModelos = useCallback(async (): Promise<ModeloML[]> => {
    try {
      const { data, error } = await supabase
        .from('ml_model_weights')
        .select('*')
        .order('ativo', { ascending: false })
        .order('treinado_em', { ascending: false });

      if (error) throw error;
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar modelos:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR PERFORMANCE DOS MODELOS
  // ============================================

  const buscarPerformanceModelos = useCallback(async (): Promise<PerformanceModelo[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_ml_performance')
        .select('*');

      if (error) throw error;
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar performance:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR FEEDBACKS
  // ============================================

  const buscarFeedbacks = useCallback(async (
    filtros?: {
      clienteId?: number;
      resultado?: string;
      dataInicio?: string;
      dataFim?: string;
      limite?: number;
    }
  ): Promise<FeedbackML[]> => {
    try {
      let query = supabase
        .from('ml_feedback_candidatura')
        .select('*')
        .order('data_feedback', { ascending: false });

      if (filtros?.clienteId) {
        query = query.eq('cliente_id', filtros.clienteId);
      }
      if (filtros?.resultado) {
        query = query.eq('resultado', filtros.resultado);
      }
      if (filtros?.dataInicio) {
        query = query.gte('data_feedback', filtros.dataInicio);
      }
      if (filtros?.dataFim) {
        query = query.lte('data_feedback', filtros.dataFim);
      }
      if (filtros?.limite) {
        query = query.limit(filtros.limite);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar feedbacks:', err);
      return [];
    }
  }, []);

  // ============================================
  // TREINAR MODELO (Simplificado)
  // ============================================

  const treinarModelo = useCallback(async (
    clienteId?: number
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    setLoading(true);
    setError(null);

    try {
      // Buscar feedbacks para treino
      const { data: feedbacks, error: feedError } = await supabase
        .from('ml_feedback_candidatura')
        .select('*')
        .eq(clienteId ? 'cliente_id' : 'id', clienteId || 0)
        .or(clienteId ? `cliente_id.eq.${clienteId}` : 'id.gt.0');

      if (feedError) throw feedError;

      if (!feedbacks || feedbacks.length < 10) {
        return {
          sucesso: false,
          mensagem: 'Mínimo de 10 feedbacks necessários para treinar o modelo'
        };
      }

      // Calcular novos pesos baseado nos feedbacks
      // (Algoritmo simplificado - em produção seria mais sofisticado)
      const aprovados = feedbacks.filter(f => f.resultado === 'aprovado');
      const reprovados = feedbacks.filter(f => f.resultado === 'reprovado');

      const novosPesos: Record<string, number> = {
        skills_match_percent: 30,
        senioridade_match: 25,
        anos_experiencia: 15,
        salario_dentro_faixa: 10,
        localizacao_match: 5,
        formacao_relevante: 8,
        ultima_experiencia_relevante: 7
      };

      // Ajustar pesos baseado nos padrões dos aprovados
      // (Lógica simplificada para demonstração)
      if (aprovados.length > 0) {
        const mediaScoreAprovados = aprovados.reduce((sum, f) => sum + (f.score_ia_pre_decisao || 0), 0) / aprovados.length;
        
        // Se aprovados tinham score alto, aumentar peso de skills
        if (mediaScoreAprovados > 70) {
          novosPesos.skills_match_percent = Math.min(40, novosPesos.skills_match_percent + 5);
        }
      }

      // Buscar modelo atual
      const { data: modeloAtual } = await supabase
        .from('ml_model_weights')
        .select('*')
        .eq('ativo', true)
        .eq('cliente_id', clienteId || null)
        .single();

      const novaVersao = modeloAtual ? modeloAtual.versao + 1 : 1;

      // Desativar modelo anterior
      if (modeloAtual) {
        await supabase
          .from('ml_model_weights')
          .update({ ativo: false })
          .eq('id', modeloAtual.id);
      }

      // Criar novo modelo
      const { error: insertError } = await supabase
        .from('ml_model_weights')
        .insert({
          modelo_nome: clienteId ? `modelo_cliente_${clienteId}` : 'modelo_geral',
          versao: novaVersao,
          ativo: true,
          cliente_id: clienteId || null,
          pesos: novosPesos,
          metricas: {
            total_amostras: feedbacks.length,
            taxa_acerto: 0, // Seria calculado com validação cruzada
            precisao_aprovados: aprovados.length / feedbacks.length * 100,
            precisao_reprovados: reprovados.length / feedbacks.length * 100,
            ultima_avaliacao: new Date().toISOString()
          }
        });

      if (insertError) throw insertError;

      // Registrar no histórico
      await supabase
        .from('ml_training_history')
        .insert({
          versao_anterior: modeloAtual?.versao || 0,
          versao_nova: novaVersao,
          total_amostras: feedbacks.length,
          amostras_aprovados: aprovados.length,
          amostras_reprovados: reprovados.length,
          pesos_anteriores: modeloAtual?.pesos || {},
          pesos_novos: novosPesos
        });

      return {
        sucesso: true,
        mensagem: `Modelo treinado com sucesso! Versão ${novaVersao} criada com ${feedbacks.length} amostras.`
      };

    } catch (err: any) {
      console.error('Erro ao treinar modelo:', err);
      setError(err.message);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // ESTATÍSTICAS DO ML
  // ============================================

  const buscarEstatisticas = useCallback(async (clienteId?: number): Promise<{
    totalFeedbacks: number;
    aprovados: number;
    reprovados: number;
    taxaAprovacao: number;
    modeloAtivo: ModeloML | null;
  }> => {
    try {
      // Buscar feedbacks
      let query = supabase
        .from('ml_feedback_candidatura')
        .select('resultado', { count: 'exact' });

      if (clienteId) {
        query = query.eq('cliente_id', clienteId);
      }

      const { data: feedbacks, count } = await query;

      const aprovados = feedbacks?.filter(f => f.resultado === 'aprovado').length || 0;
      const reprovados = feedbacks?.filter(f => f.resultado === 'reprovado').length || 0;

      // Buscar modelo ativo
      const { data: modelo } = await supabase
        .from('ml_model_weights')
        .select('*')
        .eq('ativo', true)
        .eq('cliente_id', clienteId || null)
        .single();

      return {
        totalFeedbacks: count || 0,
        aprovados,
        reprovados,
        taxaAprovacao: (count && count > 0) ? (aprovados / count) * 100 : 0,
        modeloAtivo: modelo || null
      };

    } catch (err: any) {
      console.error('Erro ao buscar estatísticas:', err);
      return {
        totalFeedbacks: 0,
        aprovados: 0,
        reprovados: 0,
        taxaAprovacao: 0,
        modeloAtivo: null
      };
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    loading,
    error,
    registrarFeedback,
    calcularScoreML,
    buscarModelos,
    buscarPerformanceModelos,
    buscarFeedbacks,
    treinarModelo,
    buscarEstatisticas
  };
}

export default useMLLearning;
