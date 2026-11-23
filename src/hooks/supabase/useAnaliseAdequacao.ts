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
//
// 🆕 v1.1 — 2026-11-23: PARIDADE com AnaliseRisco (Análise de Currículo AI)
// - Cache compartilhado: carregarAnalise/salvarAnalise passam a usar também a chave
//   cv_hash + vaga_id (a mesma do AnaliseRisco v4.6). Assim a análise feita em uma
//   tela é reaproveitada na outra, sem nova chamada à IA.
// - Gate CONF-01 (CONFIANCA_MINIMA_VEREDICTO): análise degradada
//   (veredicto_confiavel=false / confiança < 80 / parcial) NÃO é persistida nem servida
//   do cache — antes o modal gravava qualquer resultado.
// - Vínculo automático: linha de cache criada pelo AnaliseRisco (candidatura_id NULL)
//   é vinculada à candidatura (UPDATE) em vez de gerar linha duplicada.
// - status: 'concluida' gravado explicitamente (o cache do AnaliseRisco filtra por ele).
// ============================================================

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import {
  analisarAdequacaoPerfil,
  calcularEstatisticas,
  verificarDesqualificacao,
  CONFIANCA_MINIMA_VEREDICTO,
  type AnaliseAdequacaoPerfil,
  type DadosCandidatoAnalise,
  type DadosVagaAnalise
} from '@/services/analiseAdequacaoService';

/** v1.1 — Resolve o modelo real usado (backend v2.4 envia modelo_ia; _metadata.modelo é o legado). */
const resolverModeloIA = (a: AnaliseAdequacaoPerfil): string =>
  a.modelo_ia || (a as any)._metadata?.modelo || 'gemini';

/** v1.1 — CONF-01: a análise tem veredicto confiável? (fallback para linhas/respostas antigas sem o campo) */
export const analiseEhConfiavel = (a: AnaliseAdequacaoPerfil | null | undefined): boolean => {
  if (!a) return false;
  if (typeof a.veredicto_confiavel === 'boolean') return a.veredicto_confiavel;
  return a.analise_parcial !== true && (a.confianca_analise || 0) >= CONFIANCA_MINIMA_VEREDICTO;
};

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
  
  // Persistência - aceita resultado como 5º parâmetro e cv_hash como 6º (v1.1)
  salvarAnalise: (candidaturaId?: number, pessoaId?: number, vagaId?: number, userId?: number, resultadoAnalise?: AnaliseAdequacaoPerfil, cvHash?: string) => Promise<{ success: boolean; analiseId?: number; motivo?: string }>;
  // v1.1: cvHash opcional — quando informado junto com vagaId, busca também no cache compartilhado (cv_hash + vaga_id)
  carregarAnalise: (candidaturaId?: number, pessoaId?: number, vagaId?: number, cvHash?: string) => Promise<AnaliseAdequacaoPerfil | null>;
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
    resultadoAnalise?: AnaliseAdequacaoPerfil,
    cvHash?: string
  ): Promise<{ success: boolean; analiseId?: number; motivo?: string }> => {

    // Usar o parâmetro se fornecido, senão usar o estado
    const analiseParaSalvar = resultadoAnalise || analise;

    if (!analiseParaSalvar) {
      console.warn('⚠️ [useAnaliseAdequacao] Nenhuma análise para salvar');
      return { success: false, motivo: 'sem_analise' };
    }

    // 🆕 v1.1 — CONF-01: análise degradada NÃO entra no cache (mesma regra do AnaliseRisco v5.1).
    // Se entrasse, o mesmo CV+vaga devolveria o resultado ruim para sempre sem nova chamada à IA.
    if (!analiseEhConfiavel(analiseParaSalvar)) {
      console.warn(`⚠️ [useAnaliseAdequacao][CONF-01] Análise sem veredicto confiável — NÃO será persistida | parcial=${analiseParaSalvar.analise_parcial === true} | confiança=${analiseParaSalvar.confianca_analise}% | motivo=${analiseParaSalvar.motivo_parcial ?? '-'}`);
      return { success: false, motivo: 'veredicto_nao_confiavel' };
    }

    try {
      console.log(`💾 [useAnaliseAdequacao] Salvando análise...`);
      console.log(`   Score: ${analiseParaSalvar.score_geral}% | cv_hash: ${cvHash || '-'} | vaga: ${vagaId || '-'} | candidatura: ${candidaturaId || '-'}`);

      // v1.1 — Payload único para UPDATE e INSERT (evita divergência entre os dois caminhos)
      const dadosAnalise: Record<string, any> = {
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
        modelo_ia: resolverModeloIA(analiseParaSalvar),
        tempo_processamento_ms: (analiseParaSalvar as any)._metadata?.tempo_ms,
        status: 'concluida',                       // v1.1: o cache do AnaliseRisco filtra por status
        updated_at: new Date().toISOString()
      };
      if (cvHash) dadosAnalise.cv_hash = cvHash;   // v1.1: chave do cache compartilhado

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
            .update(dadosAnalise)
            .eq('id', existente.id);

          if (updateError) throw updateError;

          console.log(`✅ [useAnaliseAdequacao] Análise ATUALIZADA - ID: ${existente.id}`);
          return { success: true, analiseId: existente.id };
        }
      }

      // 🆕 v1.1 — Linha do cache compartilhado criada pelo AnaliseRisco (candidatura_id NULL)?
      // Vincula à candidatura/pessoa em vez de duplicar.
      if (cvHash && vagaId) {
        const { data: cacheArr } = await supabase
          .from('analise_adequacao')
          .select('id, candidatura_id')
          .eq('cv_hash', cvHash)
          .eq('vaga_id', vagaId)
          .is('candidatura_id', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const linhaCache = cacheArr?.[0] || null;

        if (linhaCache?.id) {
          const { error: vincError } = await supabase
            .from('analise_adequacao')
            .update({
              ...dadosAnalise,
              candidatura_id: candidaturaId || null,
              pessoa_id: pessoaId || null
            })
            .eq('id', linhaCache.id);

          if (vincError) throw vincError;

          console.log(`🔗 [useAnaliseAdequacao] Linha do cache ${linhaCache.id} vinculada à candidatura ${candidaturaId}`);
          return { success: true, analiseId: linhaCache.id };
        }
      }

      // Inserir novo registro
      const { data, error: dbError } = await supabase
        .from('analise_adequacao')
        .insert({
          pessoa_id: pessoaId || null,
          vaga_id: vagaId || null,
          candidatura_id: candidaturaId || null,
          ...dadosAnalise,
          created_by: userId || null
        })
        .select('id')
        .single();

      if (dbError) {
        if (dbError.code === '23505') {
          console.warn('⚠️ Registro já existe, tentando atualizar...');
          return salvarAnalise(candidaturaId, pessoaId, vagaId, userId, analiseParaSalvar, cvHash);
        }
        throw dbError;
      }

      console.log(`✅ [useAnaliseAdequacao] Análise INSERIDA - ID: ${data?.id}`);
      return { success: true, analiseId: data?.id };

    } catch (err: any) {
      console.error('❌ [useAnaliseAdequacao] Erro ao salvar:', err.message);
      return { success: false, motivo: err.message };
    }
  }, [analise]);

  // Carregar análise do banco de dados
  // 🔧 FIX 25/02: .limit(1) + array[0] em vez de .maybeSingle()
  // 🆕 v1.1: ordem de busca — (1) candidatura_id, (2) cv_hash + vaga_id (cache compartilhado
  //          com o AnaliseRisco), (3) pessoa_id + vaga_id. Em todas, só linhas 'concluida'
  //          com confiança >= CONFIANCA_MINIMA_VEREDICTO (CONF-01: cache nunca serve análise degradada).
  const carregarAnalise = useCallback(async (
    candidaturaId?: number,
    pessoaId?: number,
    vagaId?: number,
    cvHash?: string
  ): Promise<AnaliseAdequacaoPerfil | null> => {
    try {
      console.log(`📂 [useAnaliseAdequacao] Carregando análise... (candidatura=${candidaturaId || '-'} | cv_hash=${cvHash || '-'} | vaga=${vagaId || '-'})`);

      const criterios: Array<{ rotulo: string; aplicar: (q: any) => any }> = [];
      if (candidaturaId) {
        criterios.push({ rotulo: 'candidatura_id', aplicar: q => q.eq('candidatura_id', candidaturaId) });
      }
      if (cvHash && vagaId) {
        criterios.push({ rotulo: 'cv_hash+vaga_id', aplicar: q => q.eq('cv_hash', cvHash).eq('vaga_id', vagaId) });
      }
      if (pessoaId && vagaId) {
        criterios.push({ rotulo: 'pessoa_id+vaga_id', aplicar: q => q.eq('pessoa_id', pessoaId).eq('vaga_id', vagaId) });
      }

      if (criterios.length === 0) {
        console.warn('[useAnaliseAdequacao] Precisa de candidaturaId, cvHash+vagaId ou pessoaId+vagaId');
        return null;
      }

      let data: any = null;
      for (const criterio of criterios) {
        const query = criterio.aplicar(
          supabase
            .from('analise_adequacao')
            .select('*')
            .eq('status', 'concluida')
            .gte('confianca_analise', CONFIANCA_MINIMA_VEREDICTO)
        );

        const { data: dataArr, error: dbError } = await query
          .order('created_at', { ascending: false })
          .limit(1);

        if (dbError) {
          console.error(`❌ [useAnaliseAdequacao] Erro ao carregar (${criterio.rotulo}):`, dbError.message);
          continue;
        }

        if (dataArr?.[0]) {
          data = dataArr[0];
          console.log(`✅ [useAnaliseAdequacao] Análise encontrada por ${criterio.rotulo} (ID: ${data.id})`);
          break;
        }
      }

      if (!data) {
        console.log('[useAnaliseAdequacao] Nenhuma análise encontrada');
        return null;
      }

      const analiseCarregada = data.resultado_completo as AnaliseAdequacaoPerfil;

      // CONF-01: linhas antigas podem não ter veredicto_confiavel no JSON → derivar da linha
      if (analiseCarregada && !analiseEhConfiavel(analiseCarregada)) {
        console.warn('⚠️ [useAnaliseAdequacao][CONF-01] Linha do cache sem veredicto confiável — ignorada');
        return null;
      }

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
