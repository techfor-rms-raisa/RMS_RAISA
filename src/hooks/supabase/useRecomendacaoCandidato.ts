/**
 * useRecomendacaoCandidato.ts - Hook para Recomendações de Candidatos (RAISA)
 * 
 * IMPORTANTE: Este hook gerencia recomendações da IA sobre CANDIDATOS em processo seletivo.
 * NÃO confundir com o módulo RMS de análise de risco de CONSULTORES já alocados.
 * 
 * Gerencia a tabela: recomendacoes_analista_ia
 * 
 * Funcionalidades:
 * - Carregar recomendação existente para uma candidatura
 * - Gerar nova recomendação via IA
 * - Registrar decisão do analista (concordou ou divergiu)
 * - Calcular métricas de acurácia da IA
 * - Detectar divergências automaticamente
 * 
 * Versão: 1.0
 * Data: 27/12/2024
 * Sprint: 2 - Integração Recomendação de Candidatos
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export type DecisaoRecomendacao = 'aprovar' | 'rejeitar' | 'reavaliar';
export type ResultadoFinal = 'aprovado_cliente' | 'reprovado_cliente' | 'pendente';

export interface RedFlag {
  tipo: string;
  descricao: string;
  severidade: 'baixa' | 'media' | 'alta' | 'critica';
  evidencia?: string;
}

export interface RecomendacaoCandidato {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  analista_id: number;
  
  // Recomendação da IA
  recomendacao: DecisaoRecomendacao;
  score_confianca: number;
  justificativa: string;
  red_flags?: RedFlag[];
  pontos_fortes?: string[];
  probabilidade_aprovacao_cliente?: number;
  
  // Scores detalhados
  score_tecnico?: number;
  score_comportamental?: number;
  score_cultural?: number;
  score_experiencia?: number;
  
  // Decisão do Analista
  decisao_analista?: DecisaoRecomendacao;
  justificativa_analista?: string;
  seguiu_recomendacao?: boolean;
  divergencia_detectada: boolean;
  data_decisao?: string;
  
  // Resultado Final (após cliente avaliar)
  resultado_final?: ResultadoFinal;
  motivo_resultado?: string;
  data_resultado?: string;
  ia_acertou?: boolean;
  tipo_erro?: string;
  
  // Metadados
  gerada_em: string;
  gerada_por: string;
  atualizada_em?: string;
  metadados?: Record<string, any>;
}

export interface RecomendacaoInput {
  candidatura_id: number;
  vaga_id: number;
  analista_id: number;
  recomendacao: DecisaoRecomendacao;
  score_confianca: number;
  justificativa: string;
  red_flags?: RedFlag[];
  pontos_fortes?: string[];
  probabilidade_aprovacao_cliente?: number;
  score_tecnico?: number;
  score_comportamental?: number;
  score_cultural?: number;
  score_experiencia?: number;
}

export interface MetricasIA {
  total_recomendacoes: number;
  total_acertos: number;
  total_erros: number;
  taxa_acerto: number;
  divergencias: number;
  taxa_concordancia: number;
  erros_por_tipo: Record<string, number>;
}

// ============================================
// HOOK
// ============================================

export const useRecomendacaoCandidato = () => {
  const [recomendacaoAtual, setRecomendacaoAtual] = useState<RecomendacaoCandidato | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega recomendação existente para uma candidatura
   */
  const loadRecomendacao = useCallback(async (candidaturaId: number): Promise<RecomendacaoCandidato | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('recomendacoes_analista_ia')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .order('gerada_em', { ascending: false })
        .limit(1)
        .single();

      if (err && err.code !== 'PGRST116') throw err;

      if (data) {
        const recomendacao = mapFromDB(data);
        setRecomendacaoAtual(recomendacao);
        console.log(`✅ Recomendação carregada: ${recomendacao.recomendacao} (${recomendacao.score_confianca}%)`);
        return recomendacao;
      }

      setRecomendacaoAtual(null);
      return null;

    } catch (err: any) {
      console.error('❌ Erro ao carregar recomendação:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Salva uma nova recomendação da IA
   */
  const saveRecomendacao = useCallback(async (input: RecomendacaoInput): Promise<RecomendacaoCandidato | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('recomendacoes_analista_ia')
        .insert({
          candidatura_id: input.candidatura_id,
          vaga_id: input.vaga_id,
          analista_id: input.analista_id,
          recomendacao: input.recomendacao,
          score_confianca: input.score_confianca,
          justificativa: input.justificativa,
          red_flags: input.red_flags,
          pontos_fortes: input.pontos_fortes,
          probabilidade_aprovacao_cliente: input.probabilidade_aprovacao_cliente,
          score_tecnico: input.score_tecnico,
          score_comportamental: input.score_comportamental,
          score_cultural: input.score_cultural,
          score_experiencia: input.score_experiencia,
          divergencia_detectada: false,
          gerada_por: 'Gemini'
        })
        .select()
        .single();

      if (err) throw err;

      const recomendacao = mapFromDB(data);
      setRecomendacaoAtual(recomendacao);
      console.log(`✅ Recomendação salva: ${recomendacao.recomendacao}`);

      return recomendacao;

    } catch (err: any) {
      console.error('❌ Erro ao salvar recomendação:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Registra a decisão do analista (concordou ou divergiu da IA)
   */
  const registrarDecisaoAnalista = useCallback(async (
    recomendacaoId: number,
    decisao: DecisaoRecomendacao,
    justificativa?: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Buscar recomendação atual para comparar
      const { data: recAtual, error: fetchErr } = await supabase
        .from('recomendacoes_analista_ia')
        .select('recomendacao')
        .eq('id', recomendacaoId)
        .single();

      if (fetchErr) throw fetchErr;

      const seguiuRecomendacao = recAtual.recomendacao === decisao;
      const divergenciaDetectada = !seguiuRecomendacao;

      const { data, error: err } = await supabase
        .from('recomendacoes_analista_ia')
        .update({
          decisao_analista: decisao,
          justificativa_analista: justificativa,
          seguiu_recomendacao: seguiuRecomendacao,
          divergencia_detectada: divergenciaDetectada,
          data_decisao: new Date().toISOString(),
          atualizada_em: new Date().toISOString()
        })
        .eq('id', recomendacaoId)
        .select()
        .single();

      if (err) throw err;

      setRecomendacaoAtual(mapFromDB(data));
      
      if (divergenciaDetectada) {
        console.log(`⚠️ Divergência detectada: IA recomendou ${recAtual.recomendacao}, analista decidiu ${decisao}`);
      } else {
        console.log(`✅ Analista concordou com IA: ${decisao}`);
      }

      return true;

    } catch (err: any) {
      console.error('❌ Erro ao registrar decisão:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Registra o resultado final (após cliente avaliar)
   */
  const registrarResultadoFinal = useCallback(async (
    recomendacaoId: number,
    resultado: ResultadoFinal,
    motivo?: string
  ): Promise<boolean> => {
    try {
      setLoading(true);

      // Buscar dados para calcular se IA acertou
      const { data: recAtual, error: fetchErr } = await supabase
        .from('recomendacoes_analista_ia')
        .select('recomendacao, decisao_analista')
        .eq('id', recomendacaoId)
        .single();

      if (fetchErr) throw fetchErr;

      // Determinar se IA acertou
      let iaAcertou: boolean | null = null;
      let tipoErro: string | null = null;

      if (resultado !== 'pendente') {
        const clienteAprovou = resultado === 'aprovado_cliente';
        const iaRecomendouAprovar = recAtual.recomendacao === 'aprovar';
        
        iaAcertou = clienteAprovou === iaRecomendouAprovar;
        
        if (!iaAcertou) {
          tipoErro = iaRecomendouAprovar 
            ? 'falso_positivo' // IA aprovou, cliente reprovou
            : 'falso_negativo'; // IA reprovou, cliente aprovou
        }
      }

      const { data, error: err } = await supabase
        .from('recomendacoes_analista_ia')
        .update({
          resultado_final: resultado,
          motivo_resultado: motivo,
          data_resultado: new Date().toISOString(),
          ia_acertou: iaAcertou,
          tipo_erro: tipoErro,
          atualizada_em: new Date().toISOString()
        })
        .eq('id', recomendacaoId)
        .select()
        .single();

      if (err) throw err;

      setRecomendacaoAtual(mapFromDB(data));
      console.log(`✅ Resultado registrado: ${resultado}${iaAcertou !== null ? ` (IA ${iaAcertou ? 'acertou' : 'errou'})` : ''}`);

      return true;

    } catch (err: any) {
      console.error('❌ Erro ao registrar resultado:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Busca recomendações por vaga
   */
  const loadRecomendacoesPorVaga = useCallback(async (vagaId: number): Promise<RecomendacaoCandidato[]> => {
    try {
      const { data, error: err } = await supabase
        .from('recomendacoes_analista_ia')
        .select('*')
        .eq('vaga_id', vagaId)
        .order('gerada_em', { ascending: false });

      if (err) throw err;

      return (data || []).map(mapFromDB);

    } catch (err: any) {
      console.error('❌ Erro ao buscar recomendações por vaga:', err);
      return [];
    }
  }, []);

  /**
   * Busca divergências pendentes de justificativa
   */
  const loadDivergenciasPendentes = useCallback(async (analistaId?: number): Promise<RecomendacaoCandidato[]> => {
    try {
      let query = supabase
        .from('recomendacoes_analista_ia')
        .select('*')
        .eq('divergencia_detectada', true)
        .is('justificativa_analista', null);

      if (analistaId) {
        query = query.eq('analista_id', analistaId);
      }

      const { data, error: err } = await query.order('data_decisao', { ascending: false });

      if (err) throw err;

      return (data || []).map(mapFromDB);

    } catch (err: any) {
      console.error('❌ Erro ao buscar divergências:', err);
      return [];
    }
  }, []);

  /**
   * Calcula métricas de acurácia da IA
   */
  const calcularMetricas = useCallback(async (filtros?: {
    vaga_id?: number;
    analista_id?: number;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<MetricasIA> => {
    try {
      let query = supabase
        .from('recomendacoes_analista_ia')
        .select('recomendacao, seguiu_recomendacao, divergencia_detectada, ia_acertou, tipo_erro, resultado_final');

      if (filtros?.vaga_id) query = query.eq('vaga_id', filtros.vaga_id);
      if (filtros?.analista_id) query = query.eq('analista_id', filtros.analista_id);
      if (filtros?.data_inicio) query = query.gte('gerada_em', filtros.data_inicio);
      if (filtros?.data_fim) query = query.lte('gerada_em', filtros.data_fim);

      const { data, error: err } = await query;

      if (err) throw err;

      const recomendacoes = data || [];
      const comResultado = recomendacoes.filter(r => r.resultado_final && r.resultado_final !== 'pendente');

      const total = comResultado.length;
      const acertos = comResultado.filter(r => r.ia_acertou === true).length;
      const erros = comResultado.filter(r => r.ia_acertou === false).length;
      const divergencias = recomendacoes.filter(r => r.divergencia_detectada === true).length;
      const concordancias = recomendacoes.filter(r => r.seguiu_recomendacao === true).length;

      const errosPorTipo: Record<string, number> = {};
      comResultado.filter(r => r.tipo_erro).forEach(r => {
        errosPorTipo[r.tipo_erro] = (errosPorTipo[r.tipo_erro] || 0) + 1;
      });

      return {
        total_recomendacoes: recomendacoes.length,
        total_acertos: acertos,
        total_erros: erros,
        taxa_acerto: total > 0 ? Math.round((acertos / total) * 100) : 0,
        divergencias,
        taxa_concordancia: recomendacoes.length > 0 
          ? Math.round((concordancias / recomendacoes.length) * 100) 
          : 0,
        erros_por_tipo: errosPorTipo
      };

    } catch (err: any) {
      console.error('❌ Erro ao calcular métricas:', err);
      return {
        total_recomendacoes: 0,
        total_acertos: 0,
        total_erros: 0,
        taxa_acerto: 0,
        divergencias: 0,
        taxa_concordancia: 0,
        erros_por_tipo: {}
      };
    }
  }, []);

  return {
    // Estado
    recomendacaoAtual,
    loading,
    error,

    // Métodos principais
    loadRecomendacao,
    saveRecomendacao,
    registrarDecisaoAnalista,
    registrarResultadoFinal,

    // Consultas
    loadRecomendacoesPorVaga,
    loadDivergenciasPendentes,
    calcularMetricas,

    // Utilitários
    setRecomendacaoAtual
  };
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function mapFromDB(data: any): RecomendacaoCandidato {
  return {
    id: data.id,
    candidatura_id: data.candidatura_id,
    vaga_id: data.vaga_id,
    analista_id: data.analista_id,
    recomendacao: data.recomendacao,
    score_confianca: data.score_confianca,
    justificativa: data.justificativa,
    red_flags: data.red_flags,
    pontos_fortes: data.pontos_fortes,
    probabilidade_aprovacao_cliente: data.probabilidade_aprovacao_cliente,
    score_tecnico: data.score_tecnico,
    score_comportamental: data.score_comportamental,
    score_cultural: data.score_cultural,
    score_experiencia: data.score_experiencia,
    decisao_analista: data.decisao_analista,
    justificativa_analista: data.justificativa_analista,
    seguiu_recomendacao: data.seguiu_recomendacao,
    divergencia_detectada: data.divergencia_detectada ?? false,
    data_decisao: data.data_decisao,
    resultado_final: data.resultado_final,
    motivo_resultado: data.motivo_resultado,
    data_resultado: data.data_resultado,
    ia_acertou: data.ia_acertou,
    tipo_erro: data.tipo_erro,
    gerada_em: data.gerada_em,
    gerada_por: data.gerada_por || 'Gemini',
    atualizada_em: data.atualizada_em,
    metadados: data.metadados
  };
}
