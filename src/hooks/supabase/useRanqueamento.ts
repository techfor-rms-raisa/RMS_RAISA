/**
 * useRanqueamento.ts - Hook do Módulo de Ranqueamento (RAISA)
 *
 * Caminho: src/hooks/supabase/useRanqueamento.ts
 *
 * Consome o RPC `ranquear_candidatos_vaga(p_vaga_id)` que faz TODO
 * o cálculo no Postgres (JOIN + ponderação + ordenação), evitando o
 * limite silencioso de 1000 linhas do client Supabase JS.
 *
 * O RPC já entrega os candidatos ordenados e com a flag `tem_entrevista`,
 * permitindo o split em dois blocos no dashboard:
 *   - Ranqueados (com entrevista concluída) -> score_ranking
 *   - Pré-ranking (só CV)                    -> score_cv
 *
 * Versão: 1.0
 * Data: 21/07/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface CandidatoRanqueado {
  candidatura_id: number;
  pessoa_id: number;
  candidato_nome: string;
  candidatura_status: string;
  score_cv: number;
  tem_entrevista: boolean;
  score_tecnico: number | null;
  score_comunicacao: number | null;
  score_geral_entrevista: number | null;
  recomendacao_ia: string | null;
  decisao_analista: string | null;
  score_ranking: number | null;
  entrevista_data: string | null;
}

interface UseRanqueamentoReturn {
  ranking: CandidatoRanqueado[];
  loading: boolean;
  error: string | null;
  carregarRanking: (vagaId: number) => Promise<void>;
  limpar: () => void;
}

// ============================================
// HOOK
// ============================================

export function useRanqueamento(): UseRanqueamentoReturn {
  const [ranking, setRanking] = useState<CandidatoRanqueado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregarRanking = useCallback(async (vagaId: number) => {
    if (!vagaId || Number.isNaN(vagaId)) {
      setError('Vaga inválida para ranqueamento.');
      setRanking([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('ranquear_candidatos_vaga', {
        p_vaga_id: vagaId,
      });

      if (rpcError) throw rpcError;

      setRanking((data || []) as CandidatoRanqueado[]);
      console.log(`✅ [useRanqueamento] Vaga ${vagaId}: ${data?.length || 0} candidato(s) ranqueado(s)`);
    } catch (err: any) {
      console.error('❌ [useRanqueamento] Erro:', err);
      setError(err?.message || 'Erro ao carregar o ranqueamento.');
      setRanking([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const limpar = useCallback(() => {
    setRanking([]);
    setError(null);
  }, []);

  return { ranking, loading, error, carregarRanking, limpar };
}

export default useRanqueamento;
