/**
 * useRaisaInterview.ts - Hook para Entrevistas Técnicas RAISA
 * 
 * Gerencia:
 * - vaga_perguntas_tecnicas: Perguntas geradas por IA
 * - candidatura_respostas: Respostas dos candidatos
 * - candidatura_matriz_qualificacoes: Matriz de qualificações
 * - candidatura_avaliacao_ia: Avaliações da IA
 * 
 * Versão: 1.0
 * Data: 25/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { Vaga, PerguntaTecnica, AvaliacaoIA } from '@/types';
import { perguntasTecnicasService } from '../../services/perguntasTecnicasService';

// Tipos específicos para o banco de dados
export interface PerguntaTecnicaDB {
  id: number;
  vaga_id: number;
  pergunta_texto: string;
  categoria: 'tecnica' | 'comportamental' | 'experiencia';
  tecnologia_relacionada?: string;
  nivel_dificuldade: 'junior' | 'pleno' | 'senior';
  resposta_esperada?: string;
  pontos_chave?: any;
  ordem: number;
  gerada_em?: string;
  gerada_por?: string;
  ativa: boolean;
  metadados?: any;
}

export interface CandidaturaRespostaDB {
  id: number;
  candidatura_id: number;
  pergunta_id: number;
  vaga_id: number;
  analista_id?: number;
  resposta_texto: string;
  coletada_em?: string;
  observacoes_analista?: string;
  impressao_analista?: 'excelente' | 'boa' | 'regular' | 'fraca';
  metadados?: any;
}

export interface MatrizQualificacaoDB {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  analista_id?: number;
  qualificacoes: any;
  preenchida_em?: string;
  preenchida_por?: number;
  metadados?: any;
}

export interface AvaliacaoIADB {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  analista_id?: number;
  score_geral: number;
  recomendacao: 'aprovado' | 'reprovado' | 'condicional';
  pontos_fortes?: any;
  gaps_identificados?: any;
  score_tecnico?: number;
  score_experiencia?: number;
  score_fit_cultural?: number;
  justificativa?: string;
  requisitos_atendidos?: any;
  taxa_atendimento?: number;
  decisao_final?: string;
  decisao_justificativa?: string;
  decidido_por?: number;
  decidido_em?: string;
  concordancia?: boolean;
  avaliado_em?: string;
  avaliado_por?: string;
  metadados?: any;
}

export const useRaisaInterview = () => {
  const [perguntasTecnicas, setPerguntasTecnicas] = useState<PerguntaTecnicaDB[]>([]);
  const [respostasCandidatos, setRespostasCandidatos] = useState<CandidaturaRespostaDB[]>([]);
  const [matrizesQualificacao, setMatrizesQualificacao] = useState<MatrizQualificacaoDB[]>([]);
  const [avaliacoesIA, setAvaliacoesIA] = useState<AvaliacaoIADB[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // PERGUNTAS TÉCNICAS
  // ============================================

  /**
   * Carrega perguntas técnicas de uma vaga específica
   */
  const loadPerguntasVaga = useCallback(async (vagaId: number): Promise<PerguntaTecnicaDB[]> => {
    try {
      setLoading(true);
      console.log(`📚 Carregando perguntas da vaga ${vagaId}...`);

      const { data, error } = await supabase
        .from('vaga_perguntas_tecnicas')
        .select('*')
        .eq('vaga_id', vagaId)
        .eq('ativa', true)
        .order('ordem', { ascending: true });

      if (error) throw error;

      const perguntas = data || [];
      setPerguntasTecnicas(perguntas);
      console.log(`✅ ${perguntas.length} perguntas carregadas`);
      return perguntas;
    } catch (err: any) {
      console.error('❌ Erro ao carregar perguntas:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Gera e salva perguntas técnicas via IA
   */
  const generateAndSaveQuestions = useCallback(async (vaga: Vaga): Promise<PerguntaTecnicaDB[]> => {
    try {
      setLoading(true);
      console.log(`🤖 Gerando perguntas para vaga: ${vaga.titulo}...`);

      // Gerar perguntas via Gemini
      const questionsFromIA = await perguntasTecnicasService.gerarPerguntas(vaga);
      
      if (questionsFromIA.length === 0) {
        throw new Error('IA não retornou perguntas');
      }

      // Preparar dados para inserção
      const perguntasParaInserir = questionsFromIA.map((q: any, index: number) => ({
        vaga_id: parseInt(vaga.id),
        pergunta_texto: q.pergunta,
        categoria: mapCategoria(q.tipo),
        nivel_dificuldade: mapNivelDificuldade(q.nivel_dificuldade),
        resposta_esperada: q.resposta_esperada,
        pontos_chave: { criterios: q.criterios_avaliacao },
        ordem: index + 1,
        gerada_em: new Date().toISOString(),
        gerada_por: 'Gemini',
        ativa: true
      }));

      // Inserir no Supabase
      const { data, error } = await supabase
        .from('vaga_perguntas_tecnicas')
        .insert(perguntasParaInserir)
        .select();

      if (error) throw error;

      const savedQuestions = data || [];
      setPerguntasTecnicas(savedQuestions);
      console.log(`✅ ${savedQuestions.length} perguntas salvas no Supabase`);
      return savedQuestions;
    } catch (err: any) {
      console.error('❌ Erro ao gerar perguntas:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // RESPOSTAS DOS CANDIDATOS
  // ============================================

  /**
   * Carrega respostas de uma candidatura
   */
  const loadRespostasCandidatura = useCallback(async (candidaturaId: number): Promise<CandidaturaRespostaDB[]> => {
    try {
      const { data, error } = await supabase
        .from('candidatura_respostas')
        .select('*')
        .eq('candidatura_id', candidaturaId);

      if (error) throw error;
      
      const respostas = data || [];
      setRespostasCandidatos(respostas);
      return respostas;
    } catch (err: any) {
      console.error('❌ Erro ao carregar respostas:', err);
      return [];
    }
  }, []);

  /**
   * Salva respostas do candidato
   */
  const saveCandidateAnswers = useCallback(async (
    candidaturaId: number,
    vagaId: number,
    analistaId: number,
    respostas: Array<{
      pergunta_id: number;
      resposta_texto: string;
      impressao_analista?: 'excelente' | 'boa' | 'regular' | 'fraca';
      observacoes_analista?: string;
    }>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      console.log(`💾 Salvando ${respostas.length} respostas...`);

      const respostasParaInserir = respostas.map(r => ({
        candidatura_id: candidaturaId,
        pergunta_id: r.pergunta_id,
        vaga_id: vagaId,
        analista_id: analistaId,
        resposta_texto: r.resposta_texto,
        impressao_analista: r.impressao_analista,
        observacoes_analista: r.observacoes_analista,
        coletada_em: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('candidatura_respostas')
        .insert(respostasParaInserir);

      if (error) throw error;

      console.log('✅ Respostas salvas com sucesso');
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao salvar respostas:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // MATRIZ DE QUALIFICAÇÕES
  // ============================================

  /**
   * Salva matriz de qualificações
   */
  const saveQualificationMatrix = useCallback(async (
    candidaturaId: number,
    vagaId: number,
    analistaId: number,
    qualificacoes: Array<{ tecnologia: string; tempo: number; nivel: string }>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('💾 Salvando matriz de qualificações...');

      // Verificar se já existe matriz para esta candidatura
      const { data: existing } = await supabase
        .from('candidatura_matriz_qualificacoes')
        .select('id')
        .eq('candidatura_id', candidaturaId)
        .single();

      const matrizData = {
        candidatura_id: candidaturaId,
        vaga_id: vagaId,
        analista_id: analistaId,
        qualificacoes: { items: qualificacoes },
        preenchida_em: new Date().toISOString(),
        preenchida_por: analistaId
      };

      if (existing) {
        // Atualizar existente
        const { error } = await supabase
          .from('candidatura_matriz_qualificacoes')
          .update(matrizData)
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        // Inserir nova
        const { error } = await supabase
          .from('candidatura_matriz_qualificacoes')
          .insert(matrizData);
        
        if (error) throw error;
      }

      console.log('✅ Matriz de qualificações salva');
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao salvar matriz:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // AVALIAÇÃO IA
  // ============================================

  /**
   * Executa avaliação IA do candidato
   */
  const runAIAssessment = useCallback(async (
    candidaturaId: number,
    vagaId: number,
    analistaId: number,
    vaga: Vaga,
    candidatoNome: string
  ): Promise<AvaliacaoIADB | null> => {
    try {
      setLoading(true);
      console.log(`🤖 Executando avaliação IA para ${candidatoNome}...`);

      // Carregar matriz de qualificações
      const { data: matrizData } = await supabase
        .from('candidatura_matriz_qualificacoes')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .single();

      // Carregar respostas com perguntas
      const { data: respostasData } = await supabase
        .from('candidatura_respostas')
        .select(`
          *,
          vaga_perguntas_tecnicas!pergunta_id (
            pergunta_texto,
            resposta_esperada
          )
        `)
        .eq('candidatura_id', candidaturaId);

      if (!matrizData) {
        throw new Error('Matriz de qualificações não encontrada');
      }

      // Formatar respostas para a IA
      const respostasFormatadas = (respostasData || []).map((r: any) => ({
        ...r,
        pergunta_texto: r.vaga_perguntas_tecnicas?.pergunta_texto || '',
        resposta_esperada: r.vaga_perguntas_tecnicas?.resposta_esperada || ''
      }));

      // Chamar serviço de avaliação
      const resultado = await perguntasTecnicasService.avaliarCandidato(
        vaga,
        candidatoNome,
        { candidatura_id: candidaturaId.toString(), qualificacoes: matrizData.qualificacoes?.items || [] },
        respostasFormatadas
      );

      // Mapear recomendação
      const recomendacao = mapRecomendacao(resultado.recomendacao);

      // Salvar avaliação no Supabase
      const avaliacaoData = {
        candidatura_id: candidaturaId,
        vaga_id: vagaId,
        analista_id: analistaId,
        score_geral: resultado.score_geral || 0,
        recomendacao: recomendacao,
        pontos_fortes: resultado.pontos_fortes || [],
        gaps_identificados: resultado.pontos_fracos?.map((p: string) => ({ gap: p, impacto: 'médio' })) || [],
        score_tecnico: resultado.score_tecnico || null,
        score_experiencia: resultado.score_experiencia || null,
        justificativa: resultado.parecer_final,
        taxa_atendimento: resultado.score_geral || 0,
        avaliado_em: new Date().toISOString(),
        avaliado_por: 'Gemini'
      };

      const { data: avaliacaoSalva, error } = await supabase
        .from('candidatura_avaliacao_ia')
        .insert(avaliacaoData)
        .select()
        .single();

      if (error) throw error;

      setAvaliacoesIA(prev => [...prev.filter(a => a.candidatura_id !== candidaturaId), avaliacaoSalva]);
      console.log(`✅ Avaliação IA concluída: Score ${avaliacaoSalva.score_geral}/100`);
      return avaliacaoSalva;
    } catch (err: any) {
      console.error('❌ Erro na avaliação IA:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Carrega avaliação existente de uma candidatura
   */
  const loadAvaliacaoCandidatura = useCallback(async (candidaturaId: number): Promise<AvaliacaoIADB | null> => {
    try {
      const { data, error } = await supabase
        .from('candidatura_avaliacao_ia')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .order('avaliado_em', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setAvaliacoesIA(prev => {
          const filtered = prev.filter(a => a.candidatura_id !== candidaturaId);
          return [...filtered, data];
        });
      }
      
      return data || null;
    } catch (err: any) {
      console.error('❌ Erro ao carregar avaliação:', err);
      return null;
    }
  }, []);

  /**
   * Salva decisão final do analista
   */
  const saveFinalDecision = useCallback(async (
    candidaturaId: number,
    decisao: 'aprovado' | 'reprovado',
    justificativa: string,
    analistaId: number
  ): Promise<boolean> => {
    try {
      setLoading(true);
      console.log(`💾 Salvando decisão final: ${decisao}...`);

      // Atualizar avaliação IA com decisão
      const { error: avaliacaoError } = await supabase
        .from('candidatura_avaliacao_ia')
        .update({
          decisao_final: decisao,
          decisao_justificativa: justificativa,
          decidido_por: analistaId,
          decidido_em: new Date().toISOString()
        })
        .eq('candidatura_id', candidaturaId);

      if (avaliacaoError) throw avaliacaoError;

      // Atualizar status da candidatura
      const novoStatus = decisao === 'aprovado' ? 'aprovado_interno' : 'reprovado_interno';
      
      const { error: candidaturaError } = await supabase
        .from('candidaturas')
        .update({ 
          status: novoStatus,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', candidaturaId);

      if (candidaturaError) throw candidaturaError;

      console.log(`✅ Decisão salva: ${decisao}`);
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao salvar decisão:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // HELPERS
  // ============================================

  const mapCategoria = (tipo: string): 'tecnica' | 'comportamental' | 'experiencia' => {
    const lower = tipo?.toLowerCase() || '';
    if (lower.includes('tecn')) return 'tecnica';
    if (lower.includes('comport')) return 'comportamental';
    if (lower.includes('experi')) return 'experiencia';
    return 'tecnica';
  };

  const mapNivelDificuldade = (nivel: string): 'junior' | 'pleno' | 'senior' => {
    const lower = nivel?.toLowerCase() || '';
    if (lower.includes('jun')) return 'junior';
    if (lower.includes('plen')) return 'pleno';
    if (lower.includes('sen') || lower.includes('sên')) return 'senior';
    return 'pleno';
  };

  const mapRecomendacao = (rec: string): 'aprovado' | 'reprovado' | 'condicional' => {
    const lower = rec?.toLowerCase() || '';
    if (lower.includes('contrat') || lower.includes('aprov')) return 'aprovado';
    if (lower.includes('rejeit') || lower.includes('reprov')) return 'reprovado';
    return 'condicional';
  };

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    perguntasTecnicas,
    respostasCandidatos,
    matrizesQualificacao,
    avaliacoesIA,
    loading,
    error,

    // Perguntas
    loadPerguntasVaga,
    generateAndSaveQuestions,

    // Respostas
    loadRespostasCandidatura,
    saveCandidateAnswers,

    // Matriz
    saveQualificationMatrix,

    // Avaliação
    runAIAssessment,
    loadAvaliacaoCandidatura,
    saveFinalDecision
  };
};
