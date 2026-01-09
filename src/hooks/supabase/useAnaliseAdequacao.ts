// ============================================================
// HOOK: useAnaliseAdequacao
// Caminho: src/hooks/supabase/useAnaliseAdequacao.ts
// ============================================================
// Hook React para gerenciar análise de adequação de perfil
// Inclui cache, loading states e persistência opcional
// ============================================================

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import {
  analisarAdequacaoPerfil,
  calcularEstatisticas,
  verificarDesqualificacao,
  type AnaliseAdequacaoPerfil,
  type DadosCandidatoAnalise,
  type DadosVagaAnalise
} from '@/services/analiseAdequacaoService';

// Re-export do tipo principal com alias para compatibilidade
export type AnaliseAdequacaoResultado = AnaliseAdequacaoPerfil;

// ============================================================
// TIPOS
// ============================================================

export interface UseAnaliseAdequacaoReturn {
  // Estado
  analise: AnaliseAdequacaoPerfil | null;
  loading: boolean;
  error: string | null;
  
  // Ações
  analisar: (candidato: DadosCandidatoAnalise, vaga: DadosVagaAnalise) => Promise<AnaliseAdequacaoPerfil | null>;
  limpar: () => void;
  
  // Helpers
  estatisticas: ReturnType<typeof calcularEstatisticas> | null;
  desqualificacao: ReturnType<typeof verificarDesqualificacao> | null;
  
  // Persistência
  salvarAnalise: (candidaturaId?: number, pessoaId?: number, vagaId?: number, userId?: number) => Promise<{ success: boolean; analiseId?: number }>;
  carregarAnalise: (candidaturaId?: number, pessoaId?: number, vagaId?: number) => Promise<AnaliseAdequacaoPerfil | null>;
  buscarPerguntasEntrevista: (candidaturaId?: number, pessoaId?: number, vagaId?: number) => Promise<any[] | null>;
}

interface OpcoesHook {
  persistir?: boolean;
  cacheKey?: string;
}

// ============================================================
// HOOK
// ============================================================

export function useAnaliseAdequacao(opcoes?: OpcoesHook): UseAnaliseAdequacaoReturn {
  const [analise, setAnalise] = useState<AnaliseAdequacaoPerfil | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analisar candidato vs vaga
  const analisar = useCallback(async (
    candidato: DadosCandidatoAnalise,
    vaga: DadosVagaAnalise
  ): Promise<AnaliseAdequacaoPerfil | null> => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 [useAnaliseAdequacao] Iniciando análise...');
      
      const resultado = await analisarAdequacaoPerfil(candidato, vaga);
      
      setAnalise(resultado);
      
      console.log(`✅ [useAnaliseAdequacao] Análise concluída - Score: ${resultado.score_geral}%`);
      
      return resultado;

    } catch (err: any) {
      const mensagem = err.message || 'Erro ao analisar adequação';
      console.error('❌ [useAnaliseAdequacao] Erro:', mensagem);
      setError(mensagem);
      return null;

    } finally {
      setLoading(false);
    }
  }, []);

  // Limpar estado
  const limpar = useCallback(() => {
    setAnalise(null);
    setError(null);
  }, []);

  // Salvar análise no banco de dados (tabela analise_adequacao)
  const salvarAnalise = useCallback(async (
    candidaturaId?: number,
    pessoaId?: number,
    vagaId?: number,
    userId?: number
  ): Promise<{ success: boolean; analiseId?: number }> => {
    if (!analise) {
      console.warn('[useAnaliseAdequacao] Nenhuma análise para salvar');
      return { success: false };
    }

    try {
      console.log(`💾 [useAnaliseAdequacao] Salvando análise...`);

      // Salvar na nova tabela analise_adequacao
      const { data, error: dbError } = await supabase
        .from('analise_adequacao')
        .insert({
          pessoa_id: pessoaId || null,
          vaga_id: vagaId || null,
          candidatura_id: candidaturaId || null,
          score_geral: analise.score_geral,
          nivel_adequacao: analise.nivel_adequacao_geral,
          confianca_analise: analise.confianca_analise,
          recomendacao: analise.avaliacao_final?.recomendacao,
          perguntas_entrevista: analise.perguntas_entrevista,
          requisitos_analisados: [
            ...(analise.requisitos_imprescindiveis || []),
            ...(analise.requisitos_muito_desejaveis || []),
            ...(analise.requisitos_desejaveis || [])
          ],
          resumo_executivo: analise.resumo_executivo,
          avaliacao_final: analise.avaliacao_final,
          resultado_completo: analise,
          modelo_ia: (analise as any)._metadata?.modelo || 'gemini-2.0-flash',
          tempo_processamento_ms: (analise as any)._metadata?.tempo_ms,
          created_by: userId || null
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      console.log(`✅ [useAnaliseAdequacao] Análise salva com ID: ${data?.id}`);
      return { success: true, analiseId: data?.id };

    } catch (err: any) {
      console.error('❌ [useAnaliseAdequacao] Erro ao salvar:', err.message);
      return { success: false };
    }
  }, [analise]);

  // Carregar análise do banco de dados
  const carregarAnalise = useCallback(async (
    candidaturaId?: number,
    pessoaId?: number,
    vagaId?: number
  ): Promise<AnaliseAdequacaoPerfil | null> => {
    try {
      console.log(`📂 [useAnaliseAdequacao] Carregando análise...`);

      let query = supabase
        .from('analise_adequacao')
        .select('*');

      // Buscar por candidatura OU por pessoa+vaga
      if (candidaturaId) {
        query = query.eq('candidatura_id', candidaturaId);
      } else if (pessoaId && vagaId) {
        query = query.eq('pessoa_id', pessoaId).eq('vaga_id', vagaId);
      } else {
        console.warn('[useAnaliseAdequacao] Precisa de candidaturaId ou pessoaId+vagaId');
        return null;
      }

      const { data, error: dbError } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (dbError) {
        if (dbError.code === 'PGRST116') {
          console.log('[useAnaliseAdequacao] Nenhuma análise encontrada');
          return null;
        }
        throw dbError;
      }

      const analiseCarregada = data?.resultado_completo as AnaliseAdequacaoPerfil;
      
      if (analiseCarregada) {
        setAnalise(analiseCarregada);
        console.log('✅ [useAnaliseAdequacao] Análise carregada');
      }

      return analiseCarregada || null;

    } catch (err: any) {
      console.error('❌ [useAnaliseAdequacao] Erro ao carregar:', err.message);
      return null;
    }
  }, []);

  // Calcular estatísticas derivadas
  const estatisticas = analise ? calcularEstatisticas(analise) : null;
  const desqualificacao = analise ? verificarDesqualificacao(analise) : null;

  // Buscar perguntas de entrevista de uma análise salva
  const buscarPerguntasEntrevista = useCallback(async (
    candidaturaId?: number,
    pessoaId?: number,
    vagaId?: number
  ): Promise<any[] | null> => {
    try {
      let query = supabase
        .from('analise_adequacao')
        .select('perguntas_entrevista, score_geral, recomendacao');

      if (candidaturaId) {
        query = query.eq('candidatura_id', candidaturaId);
      } else if (pessoaId && vagaId) {
        query = query.eq('pessoa_id', pessoaId).eq('vaga_id', vagaId);
      } else {
        return null;
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return null;

      return data.perguntas_entrevista || [];
    } catch {
      return null;
    }
  }, []);

  return {
    // Estado
    analise,
    loading,
    error,
    
    // Ações
    analisar,
    limpar,
    
    // Helpers
    estatisticas,
    desqualificacao,
    
    // Persistência
    salvarAnalise,
    carregarAnalise,
    buscarPerguntasEntrevista
  };
}

// ============================================================
// HOOK SIMPLIFICADO: Apenas buscar análise existente
// ============================================================

export function useAnaliseAdequacaoExistente(candidaturaId: number | null) {
  const [analise, setAnalise] = useState<AnaliseAdequacaoPerfil | null>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!candidaturaId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('candidatura_analises')
        .select('analise_completa')
        .eq('candidatura_id', candidaturaId)
        .eq('tipo_analise', 'adequacao_perfil')
        .single();

      if (!error && data?.analise_completa) {
        setAnalise(data.analise_completa as AnaliseAdequacaoPerfil);
      }
    } catch {
      // Silenciar erro se não encontrar
    } finally {
      setLoading(false);
    }
  }, [candidaturaId]);

  return { analise, loading, carregar };
}

// ============================================================
// EXPORT DEFAULT
// ============================================================

export default useAnaliseAdequacao;
