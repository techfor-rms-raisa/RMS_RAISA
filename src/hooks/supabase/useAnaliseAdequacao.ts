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
  salvarAnalise: (candidaturaId: number) => Promise<boolean>;
  carregarAnalise: (candidaturaId: number) => Promise<AnaliseAdequacaoPerfil | null>;
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

  // Salvar análise no banco de dados
  const salvarAnalise = useCallback(async (candidaturaId: number): Promise<boolean> => {
    if (!analise) {
      console.warn('[useAnaliseAdequacao] Nenhuma análise para salvar');
      return false;
    }

    try {
      console.log(`💾 [useAnaliseAdequacao] Salvando análise para candidatura ${candidaturaId}...`);

      const { error: dbError } = await supabase
        .from('candidatura_analises')
        .upsert({
          candidatura_id: candidaturaId,
          tipo_analise: 'adequacao_perfil',
          score_geral: analise.score_geral,
          nivel_adequacao: analise.nivel_adequacao_geral,
          recomendacao: analise.avaliacao_final.recomendacao,
          analise_completa: analise,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString()
        }, {
          onConflict: 'candidatura_id,tipo_analise'
        });

      if (dbError) throw dbError;

      console.log('✅ [useAnaliseAdequacao] Análise salva com sucesso');
      return true;

    } catch (err: any) {
      console.error('❌ [useAnaliseAdequacao] Erro ao salvar:', err.message);
      return false;
    }
  }, [analise]);

  // Carregar análise do banco de dados
  const carregarAnalise = useCallback(async (candidaturaId: number): Promise<AnaliseAdequacaoPerfil | null> => {
    try {
      console.log(`📂 [useAnaliseAdequacao] Carregando análise da candidatura ${candidaturaId}...`);

      const { data, error: dbError } = await supabase
        .from('candidatura_analises')
        .select('analise_completa')
        .eq('candidatura_id', candidaturaId)
        .eq('tipo_analise', 'adequacao_perfil')
        .single();

      if (dbError) {
        if (dbError.code === 'PGRST116') {
          console.log('[useAnaliseAdequacao] Nenhuma análise encontrada');
          return null;
        }
        throw dbError;
      }

      const analiseCarregada = data?.analise_completa as AnaliseAdequacaoPerfil;
      
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
    carregarAnalise
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
