// ============================================================
// HOOK: useAnaliseAdequacao
// Caminho: src/hooks/supabase/useAnaliseAdequacao.ts
// ============================================================
// Hook React para gerenciar análise de adequação de perfil
// Inclui cache, loading states e persistência opcional
// 
// 🆕 08/06/2026: Fallback de modelo_ia atualizado para 'gemini-2.5-flash'
//   - Cosmético: o fallback só é usado quando _metadata.modelo está ausente.
//   - 2 ocorrências atualizadas (bloco UPDATE linha 154 + bloco INSERT linha 187).
//
// 🔧 CORREÇÃO 19/02/2026:
// - salvarAnalise agora aceita resultado como 5º parâmetro
// 🔧 CORREÇÃO 25/02/2026:
// - Substituído .limit(1).maybeSingle() por .limit(1) + array[0]
// - Resolve erro 406 do PostgREST quando há múltiplos registros
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
  
  // Persistência - aceita resultado como 5º parâmetro
  salvarAnalise: (candidaturaId?: number, pessoaId?: number, vagaId?: number, userId?: number, resultadoAnalise?: AnaliseAdequacaoPerfil) => Promise<{ success: boolean; analiseId?: number }>;
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
  // 🔧 CORRIGIDO: Aceita resultadoAnalise como 5º parâmetro
  const salvarAnalise = useCallback(async (
    candidaturaId?: number,
    pessoaId?: number,
    vagaId?: number,
    userId?: number,
    resultadoAnalise?: AnaliseAdequacaoPerfil
  ): Promise<{ success: boolean; analiseId?: number }> => {
    
    // Usar o parâmetro se fornecido, senão usar o estado
    const analiseParaSalvar = resultadoAnalise || analise;
    
    if (!analiseParaSalvar) {
      console.warn('⚠️ [useAnaliseAdequacao] Nenhuma análise para salvar');
      return { success: false };
    }

    try {
      console.log(`💾 [useAnaliseAdequacao] Salvando análise...`);
      console.log(`   Score: ${analiseParaSalvar.score_geral}%`);

      // Verificar se já existe análise para esta candidatura
      // 🔧 FIX 25/02: .limit(1) + array[0] em vez de .maybeSingle()
      if (candidaturaId) {
        const { data: existenteArr } = await supabase
          .from('analise_adequacao')
          .select('id')
          .eq('candidatura_id', candidaturaId)
          .limit(1);

        const existente = existenteArr?.[0] || null;

        if (existente?.id) {
          // Atualizar registro existente
          const { error: updateError } = await supabase
            .from('analise_adequacao')
            .update({
              score_geral: analiseParaSalvar.score_geral,
              nivel_adequacao: analiseParaSalvar.nivel_adequacao_geral,
              confianca_analise: analiseParaSalvar.confianca_analise,
              recomendacao: analiseParaSalvar.avaliacao_final?.recomendacao,
              perguntas_entrevista: analiseParaSalvar.perguntas_entrevista,
              requisitos_analisados: [
                ...(analiseParaSalvar.requisitos_imprescindiveis || []),
                ...(analiseParaSalvar.requisitos_muito_desejaveis || []),
                ...(analiseParaSalvar.requisitos_desejaveis || [])
              ],
              resumo_executivo: analiseParaSalvar.resumo_executivo,
              avaliacao_final: analiseParaSalvar.avaliacao_final,
              resultado_completo: analiseParaSalvar,
              modelo_ia: (analiseParaSalvar as any)._metadata?.modelo || 'gemini-2.5-flash',
              tempo_processamento_ms: (analiseParaSalvar as any)._metadata?.tempo_ms,
              updated_at: new Date().toISOString()
            })
            .eq('id', existente.id);

          if (updateError) throw updateError;

          console.log(`✅ [useAnaliseAdequacao] Análise ATUALIZADA - ID: ${existente.id}`);
          return { success: true, analiseId: existente.id };
        }
      }

      // Inserir novo registro
      const { data, error: dbError } = await supabase
        .from('analise_adequacao')
        .insert({
          pessoa_id: pessoaId || null,
          vaga_id: vagaId || null,
          candidatura_id: candidaturaId || null,
          score_geral: analiseParaSalvar.score_geral,
          nivel_adequacao: analiseParaSalvar.nivel_adequacao_geral,
          confianca_analise: analiseParaSalvar.confianca_analise,
          recomendacao: analiseParaSalvar.avaliacao_final?.recomendacao,
          perguntas_entrevista: analiseParaSalvar.perguntas_entrevista,
          requisitos_analisados: [
            ...(analiseParaSalvar.requisitos_imprescindiveis || []),
            ...(analiseParaSalvar.requisitos_muito_desejaveis || []),
            ...(analiseParaSalvar.requisitos_desejaveis || [])
          ],
          resumo_executivo: analiseParaSalvar.resumo_executivo,
          avaliacao_final: analiseParaSalvar.avaliacao_final,
          resultado_completo: analiseParaSalvar,
          modelo_ia: (analiseParaSalvar as any)._metadata?.modelo || 'gemini-2.5-flash',
          tempo_processamento_ms: (analiseParaSalvar as any)._metadata?.tempo_ms,
          created_by: userId || null
        })
        .select('id')
        .single();

      if (dbError) {
        if (dbError.code === '23505') {
          console.warn('⚠️ Registro já existe, tentando atualizar...');
          return salvarAnalise(candidaturaId, pessoaId, vagaId, userId, analiseParaSalvar);
        }
        throw dbError;
      }

      console.log(`✅ [useAnaliseAdequacao] Análise INSERIDA - ID: ${data?.id}`);
      return { success: true, analiseId: data?.id };

    } catch (err: any) {
      console.error('❌ [useAnaliseAdequacao] Erro ao salvar:', err.message);
      return { success: false };
    }
  }, [analise]);

  // Carregar análise do banco de dados
  // 🔧 FIX 25/02: .limit(1) + array[0] em vez de .maybeSingle()
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

      if (candidaturaId) {
        query = query.eq('candidatura_id', candidaturaId);
      } else if (pessoaId && vagaId) {
        query = query.eq('pessoa_id', pessoaId).eq('vaga_id', vagaId);
      } else {
        console.warn('[useAnaliseAdequacao] Precisa de candidaturaId ou pessoaId+vagaId');
        return null;
      }

      const { data: dataArr, error: dbError } = await query
        .order('created_at', { ascending: false })
        .limit(1);

      if (dbError) {
        console.error('❌ [useAnaliseAdequacao] Erro ao carregar:', dbError.message);
        return null;
      }

      const data = dataArr?.[0] || null;

      if (!data) {
        console.log('[useAnaliseAdequacao] Nenhuma análise encontrada');
        return null;
      }

      const analiseCarregada = data.resultado_completo as AnaliseAdequacaoPerfil;
      
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

  // Buscar perguntas de entrevista
  // 🔧 FIX 25/02: .limit(1) + array[0] em vez de .maybeSingle()
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

      const { data: dataArr, error } = await query
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !dataArr?.length) return null;

      const data = dataArr[0];
      return data.perguntas_entrevista || [];
    } catch {
      return null;
    }
  }, []);

  return {
    analise,
    loading,
    error,
    analisar,
    limpar,
    estatisticas,
    desqualificacao,
    salvarAnalise,
    carregarAnalise,
    buscarPerguntasEntrevista
  };
}

// ============================================================
// HOOK SIMPLIFICADO
// ============================================================

// 🔧 FIX 25/02: .limit(1) + array[0] em vez de .maybeSingle()
export function useAnaliseAdequacaoExistente(candidaturaId: number | null) {
  const [analise, setAnalise] = useState<AnaliseAdequacaoPerfil | null>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!candidaturaId) return;

    setLoading(true);
    try {
      const { data: dataArr, error } = await supabase
        .from('analise_adequacao')
        .select('resultado_completo')
        .eq('candidatura_id', candidaturaId)
        .limit(1);

      const data = dataArr?.[0] || null;

      if (!error && data?.resultado_completo) {
        setAnalise(data.resultado_completo as AnaliseAdequacaoPerfil);
      }
    } catch {
      // Silenciar erro
    } finally {
      setLoading(false);
    }
  }, [candidaturaId]);

  return { analise, loading, carregar };
}

export default useAnaliseAdequacao;
