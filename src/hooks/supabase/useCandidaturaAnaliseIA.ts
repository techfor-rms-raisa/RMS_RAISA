/**
 * useCandidaturaAnaliseIA.ts - Hook para Análise de CV com IA
 * 
 * Gerencia análise de currículo do candidato com contexto da vaga
 * Salva resultados na tabela ia_recomendacoes_candidato
 * 
 * Versão: 1.0
 * Data: 06/01/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { Candidatura, Vaga } from '@/types';

// ============================================
// TIPOS
// ============================================

export interface FatorRisco {
  tipo: string;
  nivel: 'low' | 'medium' | 'high' | 'critical';
  descricao: string;
  evidencia?: string;
  peso?: number;
}

export interface SkillsMatch {
  atendidas: string[];
  parciais: string[];
  faltantes: string[];
}

export interface AnaliseCV {
  id?: number;
  candidatura_id: number;
  vaga_id: number;
  candidato_id?: number;
  
  // Scores
  score_compatibilidade: number;
  risco_reprovacao: number;
  nivel_risco: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  
  // Recomendação
  recomendacao: 'aprovar' | 'entrevistar' | 'revisar' | 'rejeitar';
  justificativa: string;
  
  // Detalhes
  fatores_risco: FatorRisco[];
  pontos_fortes: string[];
  pontos_atencao: string[];
  skills_match: SkillsMatch;
  perguntas_entrevista?: string[];
  
  // Metadados
  confianca_analise: number;
  tempo_analise_ms?: number;
  modelo_ia?: string;
  criado_em?: string;
}

// ============================================
// HOOK
// ============================================

export function useCandidaturaAnaliseIA() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analiseAtual, setAnaliseAtual] = useState<AnaliseCV | null>(null);

  // ============================================
  // CARREGAR ANÁLISE EXISTENTE
  // ============================================
  
  const carregarAnalise = useCallback(async (candidaturaId: number): Promise<AnaliseCV | null> => {
    try {
      const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .eq('tipo_recomendacao', 'analise_cv')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar análise:', error);
        return null;
      }

      if (data) {
        const analise: AnaliseCV = {
          id: data.id,
          candidatura_id: data.candidatura_id,
          vaga_id: data.vaga_id,
          candidato_id: data.candidato_id,
          score_compatibilidade: data.score_compatibilidade || 0,
          risco_reprovacao: data.risco_reprovacao || 0,
          nivel_risco: data.analise_detalhada?.nivel_risco || 'Médio',
          recomendacao: data.recomendacao || 'revisar',
          justificativa: data.justificativa || '',
          fatores_risco: data.analise_detalhada?.fatores_risco || [],
          pontos_fortes: data.analise_detalhada?.pontos_fortes || [],
          pontos_atencao: data.analise_detalhada?.pontos_atencao || [],
          skills_match: data.analise_detalhada?.skills_match || { atendidas: [], parciais: [], faltantes: [] },
          perguntas_entrevista: data.analise_detalhada?.perguntas_entrevista || [],
          confianca_analise: data.score_confianca || 0,
          tempo_analise_ms: data.tempo_analise_ms,
          modelo_ia: data.modelo_ia,
          criado_em: data.criado_em
        };
        setAnaliseAtual(analise);
        return analise;
      }

      return null;
    } catch (err) {
      console.error('Erro ao carregar análise:', err);
      return null;
    }
  }, []);

  // ============================================
  // ANALISAR CV COM IA
  // ============================================

  const analisarCV = useCallback(async (
    candidatura: Candidatura,
    vaga: Vaga,
    userId?: number
  ): Promise<AnaliseCV | null> => {
    setLoading(true);
    setError(null);

    try {
      // Verificar se tem texto do CV
      const curriculoTexto = (candidatura as any).curriculo_texto;
      
      if (!curriculoTexto || curriculoTexto.trim().length < 50) {
        throw new Error('Currículo não disponível ou muito curto para análise.');
      }

      console.log('🤖 Chamando API para análise de CV...');

      // Chamar backend
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analisar_cv_candidatura',
          payload: {
            curriculo_texto: curriculoTexto,
            vaga: {
              titulo: vaga.titulo,
              descricao: vaga.descricao,
              requisitos_obrigatorios: vaga.requisitos_obrigatorios,
              requisitos_desejaveis: vaga.requisitos_desejaveis,
              stack_tecnologica: vaga.stack_tecnologica,
              senioridade: vaga.senioridade,
              modalidade: vaga.modalidade
            },
            candidato: {
              nome: candidatura.candidato_nome,
              email: candidatura.candidato_email
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success || !result.data?.sucesso) {
        throw new Error(result.data?.erro || result.error || 'Erro na análise');
      }

      const dadosIA = result.data;
      console.log('✅ Análise recebida do backend');

      // Montar objeto de análise
      const analise: AnaliseCV = {
        candidatura_id: parseInt(candidatura.id),
        vaga_id: parseInt(vaga.id),
        candidato_id: candidatura.pessoa_id ? parseInt(String(candidatura.pessoa_id)) : undefined,
        score_compatibilidade: dadosIA.score_compatibilidade || 0,
        risco_reprovacao: dadosIA.risco_reprovacao || 0,
        nivel_risco: dadosIA.nivel_risco || 'Médio',
        recomendacao: dadosIA.recomendacao || 'revisar',
        justificativa: dadosIA.justificativa || '',
        fatores_risco: dadosIA.fatores_risco || [],
        pontos_fortes: dadosIA.pontos_fortes || [],
        pontos_atencao: dadosIA.pontos_atencao || [],
        skills_match: dadosIA.skills_match || { atendidas: [], parciais: [], faltantes: [] },
        perguntas_entrevista: dadosIA.perguntas_entrevista || [],
        confianca_analise: dadosIA.confianca_analise || 70,
        tempo_analise_ms: dadosIA.tempo_analise_ms,
        modelo_ia: dadosIA.modelo_ia || 'Gemini 2.0 Flash'
      };

      // Salvar no banco
      const analiseSalva = await salvarAnalise(analise, curriculoTexto, userId);
      
      if (analiseSalva) {
        setAnaliseAtual(analiseSalva);
        return analiseSalva;
      }

      setAnaliseAtual(analise);
      return analise;

    } catch (err: any) {
      console.error('Erro na análise de CV:', err);
      setError(err.message || 'Erro ao analisar currículo');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // SALVAR ANÁLISE NO BANCO
  // ============================================

  const salvarAnalise = async (
    analise: AnaliseCV,
    curriculoTexto: string,
    userId?: number
  ): Promise<AnaliseCV | null> => {
    try {
      // Gerar hash do CV para evitar reanálises duplicadas
      const cvHash = await gerarHashCV(curriculoTexto);

      const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .insert({
          candidatura_id: analise.candidatura_id,
          vaga_id: analise.vaga_id,
          candidato_id: analise.candidato_id,
          tipo_recomendacao: 'analise_cv',
          recomendacao: analise.recomendacao,
          score_confianca: analise.confianca_analise,
          score_compatibilidade: analise.score_compatibilidade,
          risco_reprovacao: analise.risco_reprovacao,
          justificativa: analise.justificativa,
          analise_detalhada: {
            nivel_risco: analise.nivel_risco,
            fatores_risco: analise.fatores_risco,
            pontos_fortes: analise.pontos_fortes,
            pontos_atencao: analise.pontos_atencao,
            skills_match: analise.skills_match,
            perguntas_entrevista: analise.perguntas_entrevista
          },
          cv_texto_analisado: curriculoTexto.substring(0, 10000), // Limitar tamanho
          cv_hash: cvHash,
          modelo_ia: analise.modelo_ia,
          tempo_analise_ms: analise.tempo_analise_ms,
          criado_por: userId,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao salvar análise:', error);
        return null;
      }

      return { ...analise, id: data.id, criado_em: data.criado_em };
    } catch (err) {
      console.error('Erro ao salvar análise:', err);
      return null;
    }
  };

  // ============================================
  // REGISTRAR FEEDBACK
  // ============================================

  const registrarFeedback = useCallback(async (
    analiseId: number,
    util: boolean,
    texto?: string,
    userId?: number
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('ia_recomendacoes_candidato')
        .update({
          feedback_util: util,
          feedback_texto: texto,
          feedback_por: userId,
          feedback_em: new Date().toISOString()
        })
        .eq('id', analiseId);

      if (error) {
        console.error('Erro ao registrar feedback:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Erro ao registrar feedback:', err);
      return false;
    }
  }, []);

  // ============================================
  // REGISTRAR RESULTADO REAL (Para métricas)
  // ============================================

  const registrarResultadoReal = useCallback(async (
    analiseId: number,
    resultadoReal: string
  ): Promise<boolean> => {
    try {
      // Buscar análise para comparar predição
      const { data: analise } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('recomendacao')
        .eq('id', analiseId)
        .single();

      // Determinar se predição foi correta
      const predicaoCorreta = verificarPredicao(analise?.recomendacao, resultadoReal);

      const { error } = await supabase
        .from('ia_recomendacoes_candidato')
        .update({
          resultado_real: resultadoReal,
          predicao_correta: predicaoCorreta,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', analiseId);

      if (error) {
        console.error('Erro ao registrar resultado:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Erro ao registrar resultado:', err);
      return false;
    }
  }, []);

  // ============================================
  // UTILITÁRIOS
  // ============================================

  const gerarHashCV = async (texto: string): Promise<string> => {
    // Simplificado - em produção usar crypto
    const str = texto.substring(0, 1000);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  };

  const verificarPredicao = (recomendacao: string, resultadoReal: string): boolean => {
    // Mapeamento de resultados
    const resultadosPositivos = ['contratado', 'aprovado_cliente'];
    const resultadosNegativos = ['reprovado', 'reprovado_cliente', 'desistencia'];
    
    const foiAprovado = resultadosPositivos.includes(resultadoReal);
    const iaRecomendou = ['aprovar', 'entrevistar'].includes(recomendacao);
    
    return foiAprovado === iaRecomendou;
  };

  // ============================================
  // LIMPAR ESTADO
  // ============================================

  const limparAnalise = useCallback(() => {
    setAnaliseAtual(null);
    setError(null);
  }, []);

  return {
    loading,
    error,
    analiseAtual,
    carregarAnalise,
    analisarCV,
    registrarFeedback,
    registrarResultadoReal,
    limparAnalise
  };
}

export default useCandidaturaAnaliseIA;
