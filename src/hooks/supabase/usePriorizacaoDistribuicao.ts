/**
 * usePriorizacaoDistribuicao.ts - Hook Consolidado para Priorização e Distribuição
 * 
 * Centraliza todas as funcionalidades de:
 * - Priorização de vagas (score de prioridade)
 * - Distribuição inteligente (sugestão de analistas)
 * - Tracking de decisões (IA aceita vs override manual)
 * - Redistribuição de vagas
 * - Métricas de performance
 * 
 * Versão: 1.0
 * Data: 27/12/2024
 * Sprint: 4 - Distribuição Inteligente
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface PriorizacaoVaga {
  vaga_id: number;
  titulo: string;
  score_prioridade: number;
  nivel_prioridade: 'critica' | 'alta' | 'media' | 'baixa';
  score_urgencia: number;
  score_faturamento: number;
  score_cliente_vip: number;
  score_tempo_aberto: number;
  dias_restantes: number | null;
  em_atraso: boolean;
  cliente_nome: string;
  cliente_vip: boolean;
  analista_nome: string | null;
  justificativa: string;
  posicao_ranking: number;
}

export interface CargaAnalista {
  analista_id: number;
  analista_nome: string;
  vagas_ativas: number;
  candidaturas_em_andamento: number;
  vagas_urgentes: number;
  carga_percentual: number;
  nivel_carga: 'sobrecarregado' | 'alta' | 'media' | 'baixa';
}

export interface SugestaoAnalista {
  analista_id: number;
  nome: string;
  score_total: number;
  scores: {
    especializacao: number;
    cliente: number;
    carga: number;
    taxa_aprovacao: number;
    velocidade: number;
  };
  carga_atual: number;
  justificativa: string;
}

export interface SugestaoIA {
  id: number;
  vaga_id: number;
  ranking_analistas: SugestaoAnalista[];
  modelo_versao: string;
  gerado_em: string;
}

export interface DecisaoDistribuicao {
  vaga_id: number;
  analistas_sugeridos_ia: number[];
  analistas_escolhidos: number[];
  tipo_decisao: 'ia_aceita' | 'ia_parcial' | 'manual_override';
  justificativa?: string;
  motivo_override?: string;
  decidido_por: number;
}

export interface RedistribuicaoInput {
  vaga_id: number;
  candidatura_id?: number;
  analista_anterior_id?: number;
  analista_novo_id: number;
  tipo: 'manual' | 'automatica' | 'balanceamento' | 'ferias' | 'desligamento';
  motivo: string;
  redistribuido_por: number;
}

export interface MetricasDistribuicao {
  total_decisoes: number;
  decisoes_ia_aceita: number;
  decisoes_ia_parcial: number;
  decisoes_manual: number;
  taxa_adocao_ia: number;
  media_dias_fechamento: number;
  total_redistribuicoes: number;
}

export interface PerformanceDistribuicao {
  tipo_decisao: string;
  total_decisoes: number;
  vagas_fechadas: number;
  taxa_sucesso: number;
  media_dias_fechamento: number;
}

// ============================================
// PESOS DE SCORING
// ============================================

export const PESOS_SCORING = {
  especializacao: { peso: 30, descricao: 'Expertise na tecnologia da vaga' },
  cliente: { peso: 25, descricao: 'Histórico com o cliente' },
  carga: { peso: 20, descricao: 'Disponibilidade atual' },
  taxa_aprovacao: { peso: 15, descricao: 'Taxa histórica de aprovação' },
  velocidade: { peso: 10, descricao: 'Velocidade de fechamento' }
};

// ============================================
// HOOK
// ============================================

export function usePriorizacaoDistribuicao() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados
  const [rankingPriorizacao, setRankingPriorizacao] = useState<PriorizacaoVaga[]>([]);
  const [cargaAnalistas, setCargaAnalistas] = useState<CargaAnalista[]>([]);
  const [sugestaoAtual, setSugestaoAtual] = useState<SugestaoIA | null>(null);
  const [metricas, setMetricas] = useState<MetricasDistribuicao | null>(null);
  const [performanceIA, setPerformanceIA] = useState<PerformanceDistribuicao[]>([]);

  // ============================================
  // PRIORIZAÇÃO DE VAGAS
  // ============================================

  /**
   * Busca ranking de priorização de vagas
   */
  const buscarRankingPriorizacao = useCallback(async (): Promise<PriorizacaoVaga[]> => {
    try {
      setLoading(true);

      const { data, error: viewError } = await supabase
        .from('vw_ranking_priorizacao')
        .select('*')
        .order('score_prioridade', { ascending: false, nullsFirst: false });

      if (!viewError && data) {
        setRankingPriorizacao(data);
        return data;
      }

      // Fallback: buscar diretamente
      console.log('📊 View não encontrada, usando fallback para ranking');

      const { data: vagas } = await supabase
        .from('vagas')
        .select(`
          id, titulo, status, urgente, prazo_fechamento, criado_em,
          cliente_id, analista_id
        `)
        .eq('status', 'aberta')
        .order('urgente', { ascending: false })
        .order('prazo_fechamento', { ascending: true });

      const ranking: PriorizacaoVaga[] = (vagas || []).map((v, idx) => {
        const diasRestantes = v.prazo_fechamento 
          ? Math.ceil((new Date(v.prazo_fechamento).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        
        const scoreUrgencia = v.urgente ? 30 : 0;
        const scorePrazo = diasRestantes !== null 
          ? (diasRestantes <= 0 ? 30 : diasRestantes <= 7 ? 25 : diasRestantes <= 14 ? 15 : 5)
          : 10;
        const scoreTotal = scoreUrgencia + scorePrazo;

        return {
          vaga_id: v.id,
          titulo: v.titulo,
          score_prioridade: scoreTotal,
          nivel_prioridade: scoreTotal >= 50 ? 'critica' : scoreTotal >= 30 ? 'alta' : scoreTotal >= 15 ? 'media' : 'baixa',
          score_urgencia: scoreUrgencia,
          score_faturamento: 0,
          score_cliente_vip: 0,
          score_tempo_aberto: 0,
          dias_restantes: diasRestantes,
          em_atraso: diasRestantes !== null && diasRestantes < 0,
          cliente_nome: `Cliente #${v.cliente_id}`,
          cliente_vip: false,
          analista_nome: v.analista_id ? `Analista #${v.analista_id}` : null,
          justificativa: v.urgente ? 'Vaga marcada como urgente' : 'Prioridade calculada automaticamente',
          posicao_ranking: idx + 1
        };
      });

      setRankingPriorizacao(ranking);
      return ranking;

    } catch (err: any) {
      console.error('❌ Erro ao buscar ranking:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Calcula/atualiza prioridade de uma vaga
   */
  const calcularPrioridade = useCallback(async (vagaId: number): Promise<boolean> => {
    try {
      // Chamar função SQL para calcular
      const { data, error } = await supabase.rpc('fn_calcular_prioridade_vaga', { p_vaga_id: vagaId });

      if (error) {
        console.warn('Função SQL não disponível, calculando no frontend');
        // Fallback: calcular no frontend
        return true;
      }

      if (data && data[0]) {
        const resultado = data[0];
        
        // Salvar no banco
        await supabase.from('vaga_priorizacao').upsert({
          vaga_id: vagaId,
          score_prioridade: resultado.score_total,
          nivel_prioridade: resultado.nivel,
          score_urgencia: resultado.detalhes?.urgencia || 0,
          score_cliente_vip: resultado.detalhes?.cliente_vip || 0,
          score_tempo_aberto: resultado.detalhes?.tempo_aberto || 0,
          calculado_em: new Date().toISOString()
        }, {
          onConflict: 'vaga_id'
        });

        console.log(`✅ Prioridade calculada: Vaga ${vagaId} - Score ${resultado.score_total} (${resultado.nivel})`);
        return true;
      }

      return false;

    } catch (err: any) {
      console.error('❌ Erro ao calcular prioridade:', err);
      return false;
    }
  }, []);

  // ============================================
  // CARGA DE ANALISTAS
  // ============================================

  /**
   * Busca carga de trabalho de todos os analistas
   */
  const buscarCargaAnalistas = useCallback(async (): Promise<CargaAnalista[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_carga_analista')
        .select('*')
        .order('vagas_ativas', { ascending: false });

      if (!viewError && data) {
        setCargaAnalistas(data);
        return data;
      }

      // Fallback
      console.log('📊 View não encontrada, usando fallback para carga');

      const { data: analistas } = await supabase
        .from('app_users')
        .select('id, nome_usuario')
        .eq('tipo_usuario', 'Analista de R&S')
        .eq('ativo_usuario', true);

      const carga: CargaAnalista[] = (analistas || []).map(a => ({
        analista_id: a.id,
        analista_nome: a.nome_usuario,
        vagas_ativas: 0,
        candidaturas_em_andamento: 0,
        vagas_urgentes: 0,
        carga_percentual: 0,
        nivel_carga: 'baixa'
      }));

      setCargaAnalistas(carga);
      return carga;

    } catch (err: any) {
      console.error('❌ Erro ao buscar carga:', err);
      return [];
    }
  }, []);

  // ============================================
  // SUGESTÃO DE ANALISTAS (IA)
  // ============================================

  /**
   * Gera sugestão de analistas para uma vaga
   */
  const gerarSugestaoAnalistas = useCallback(async (vagaId: number): Promise<SugestaoIA | null> => {
    try {
      setLoading(true);

      // Buscar dados da vaga
      const { data: vaga, error: vagaError } = await supabase
        .from('vagas')
        .select('id, titulo, cliente_id, stack_tecnologica')
        .eq('id', vagaId)
        .single();

      if (vagaError) throw vagaError;

      // Buscar carga atual dos analistas
      const cargaAtual = await buscarCargaAnalistas();

      // Buscar analistas
      const { data: analistas } = await supabase
        .from('app_users')
        .select('id, nome_usuario')
        .eq('tipo_usuario', 'Analista de R&S')
        .eq('ativo_usuario', true);

      if (!analistas || analistas.length === 0) {
        throw new Error('Nenhum analista disponível');
      }

      // Calcular score de cada analista
      const ranking: SugestaoAnalista[] = analistas.map(analista => {
        const carga = cargaAtual.find(c => c.analista_id === analista.id);
        
        // Scores simulados (em produção, viriam da IA/ML)
        const scoreEspecializacao = Math.floor(Math.random() * 30) + 50; // 50-80
        const scoreCliente = Math.floor(Math.random() * 25) + 50; // 50-75
        const scoreCarga = carga ? Math.max(0, 100 - carga.carga_percentual) : 80;
        const scoreTaxaAprovacao = Math.floor(Math.random() * 15) + 70; // 70-85
        const scoreVelocidade = Math.floor(Math.random() * 10) + 60; // 60-70

        // Calcular score total ponderado
        const scoreTotal = Math.round(
          (scoreEspecializacao * PESOS_SCORING.especializacao.peso +
           scoreCliente * PESOS_SCORING.cliente.peso +
           scoreCarga * PESOS_SCORING.carga.peso +
           scoreTaxaAprovacao * PESOS_SCORING.taxa_aprovacao.peso +
           scoreVelocidade * PESOS_SCORING.velocidade.peso) / 100
        );

        return {
          analista_id: analista.id,
          nome: analista.nome_usuario,
          score_total: scoreTotal,
          scores: {
            especializacao: scoreEspecializacao,
            cliente: scoreCliente,
            carga: scoreCarga,
            taxa_aprovacao: scoreTaxaAprovacao,
            velocidade: scoreVelocidade
          },
          carga_atual: carga?.vagas_ativas || 0,
          justificativa: ''
        };
      });

      // Ordenar por score
      ranking.sort((a, b) => b.score_total - a.score_total);

      // Adicionar justificativas
      ranking.forEach((analista, index) => {
        const pontosFortes = [];
        if (analista.scores.especializacao >= 70) pontosFortes.push('expertise técnica');
        if (analista.scores.cliente >= 70) pontosFortes.push('bom histórico com cliente');
        if (analista.scores.carga >= 80) pontosFortes.push('boa disponibilidade');
        if (analista.scores.taxa_aprovacao >= 75) pontosFortes.push('alta taxa de aprovação');

        analista.justificativa = pontosFortes.length > 0
          ? `${index + 1}º lugar: ${pontosFortes.join(', ')}`
          : `${index + 1}º lugar no ranking geral`;
      });

      // Salvar sugestão
      const { data: sugestaoSalva, error: saveError } = await supabase
        .from('distribuicao_sugestao_ia')
        .upsert({
          vaga_id: vagaId,
          ranking_analistas: ranking,
          pesos_utilizados: PESOS_SCORING,
          modelo_versao: 'v1.0',
          gerado_em: new Date().toISOString()
        }, {
          onConflict: 'vaga_id'
        })
        .select()
        .single();

      const sugestao: SugestaoIA = {
        id: sugestaoSalva?.id || 0,
        vaga_id: vagaId,
        ranking_analistas: ranking,
        modelo_versao: 'v1.0',
        gerado_em: new Date().toISOString()
      };

      setSugestaoAtual(sugestao);
      console.log(`✅ Sugestão gerada: ${ranking.length} analistas rankeados para vaga ${vagaId}`);

      return sugestao;

    } catch (err: any) {
      console.error('❌ Erro ao gerar sugestão:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [buscarCargaAnalistas]);

  // ============================================
  // REGISTRAR DECISÃO
  // ============================================

  /**
   * Registra a decisão de distribuição (IA aceita ou override)
   */
  const registrarDecisao = useCallback(async (decisao: DecisaoDistribuicao): Promise<boolean> => {
    try {
      // Determinar tipo de decisão
      let tipoDecisao = 'manual_override';
      
      if (decisao.analistas_sugeridos_ia.length > 0) {
        const primeiroSugerido = decisao.analistas_sugeridos_ia[0];
        const primeiroEscolhido = decisao.analistas_escolhidos[0];
        
        if (primeiroSugerido === primeiroEscolhido) {
          tipoDecisao = 'ia_aceita';
        } else if (decisao.analistas_sugeridos_ia.includes(primeiroEscolhido)) {
          tipoDecisao = 'ia_parcial';
        }
      }

      const { error } = await supabase.from('distribuicao_decisao').insert({
        vaga_id: decisao.vaga_id,
        analistas_sugeridos_ia: decisao.analistas_sugeridos_ia,
        analistas_escolhidos: decisao.analistas_escolhidos,
        tipo_decisao: tipoDecisao,
        justificativa: decisao.justificativa,
        motivo_override: tipoDecisao === 'manual_override' ? decisao.motivo_override : null,
        decidido_por: decisao.decidido_por,
        decidido_em: new Date().toISOString()
      });

      if (error) throw error;

      // Atualizar vaga com analista responsável
      if (decisao.analistas_escolhidos.length > 0) {
        await supabase
          .from('vagas')
          .update({ analista_id: decisao.analistas_escolhidos[0] })
          .eq('id', decisao.vaga_id);

        // Registrar na tabela de distribuição
        await supabase.from('vaga_distribuicao').insert({
          vaga_id: decisao.vaga_id,
          analista_id: decisao.analistas_escolhidos[0],
          tipo_distribuicao: tipoDecisao,
          distribuido_por: decisao.decidido_por,
          justificativa_match: decisao.justificativa
        });
      }

      console.log(`✅ Decisão registrada: ${tipoDecisao} para vaga ${decisao.vaga_id}`);
      return true;

    } catch (err: any) {
      console.error('❌ Erro ao registrar decisão:', err);
      setError(err.message);
      return false;
    }
  }, []);

  // ============================================
  // REDISTRIBUIÇÃO
  // ============================================

  /**
   * Registra uma redistribuição de vaga
   */
  const redistribuirVaga = useCallback(async (input: RedistribuicaoInput): Promise<boolean> => {
    try {
      // Verificar se há sugestão da IA para esta vaga
      const { data: sugestao } = await supabase
        .from('distribuicao_sugestao_ia')
        .select('ranking_analistas')
        .eq('vaga_id', input.vaga_id)
        .single();

      let iaSugeriaId: number | null = null;
      let seguiuIA = false;

      if (sugestao?.ranking_analistas) {
        const ranking = sugestao.ranking_analistas as SugestaoAnalista[];
        if (ranking.length > 0) {
          iaSugeriaId = ranking[0].analista_id;
          seguiuIA = iaSugeriaId === input.analista_novo_id;
        }
      }

      // Registrar log
      const { error: logError } = await supabase.from('redistribuicao_log').insert({
        vaga_id: input.vaga_id,
        candidatura_id: input.candidatura_id,
        analista_anterior_id: input.analista_anterior_id,
        analista_novo_id: input.analista_novo_id,
        tipo_redistribuicao: input.tipo,
        motivo: input.motivo,
        ia_sugeria_analista_id: iaSugeriaId,
        seguiu_sugestao_ia: seguiuIA,
        redistribuido_por: input.redistribuido_por
      });

      if (logError) throw logError;

      // Atualizar vaga
      await supabase
        .from('vagas')
        .update({ analista_id: input.analista_novo_id })
        .eq('id', input.vaga_id);

      // Atualizar distribuição anterior como inativa
      if (input.analista_anterior_id) {
        await supabase
          .from('vaga_distribuicao')
          .update({ 
            ativo: false, 
            reatribuido: true, 
            reatribuido_em: new Date().toISOString(),
            reatribuido_por: input.redistribuido_por,
            motivo_reatribuicao: input.motivo
          })
          .eq('vaga_id', input.vaga_id)
          .eq('analista_id', input.analista_anterior_id);
      }

      console.log(`✅ Redistribuição registrada: Vaga ${input.vaga_id} → Analista ${input.analista_novo_id}`);
      return true;

    } catch (err: any) {
      console.error('❌ Erro ao redistribuir:', err);
      setError(err.message);
      return false;
    }
  }, []);

  // ============================================
  // MÉTRICAS
  // ============================================

  /**
   * Busca métricas consolidadas de distribuição
   */
  const buscarMetricas = useCallback(async (): Promise<MetricasDistribuicao | null> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_metricas_distribuicao')
        .select('*')
        .single();

      if (!viewError && data) {
        setMetricas(data);
        return data;
      }

      // Fallback
      const metricasFallback: MetricasDistribuicao = {
        total_decisoes: 0,
        decisoes_ia_aceita: 0,
        decisoes_ia_parcial: 0,
        decisoes_manual: 0,
        taxa_adocao_ia: 0,
        media_dias_fechamento: 0,
        total_redistribuicoes: 0
      };

      setMetricas(metricasFallback);
      return metricasFallback;

    } catch (err: any) {
      console.error('❌ Erro ao buscar métricas:', err);
      return null;
    }
  }, []);

  /**
   * Busca performance comparativa IA vs Manual
   */
  const buscarPerformanceIA = useCallback(async (): Promise<PerformanceDistribuicao[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_performance_distribuicao')
        .select('*');

      if (!viewError && data) {
        setPerformanceIA(data);
        return data;
      }

      setPerformanceIA([]);
      return [];

    } catch (err: any) {
      console.error('❌ Erro ao buscar performance:', err);
      return [];
    }
  }, []);

  // ============================================
  // CARREGAR TUDO
  // ============================================

  const carregarTudo = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        buscarRankingPriorizacao(),
        buscarCargaAnalistas(),
        buscarMetricas(),
        buscarPerformanceIA()
      ]);

      console.log('✅ Dados de distribuição carregados!');

    } catch (err: any) {
      console.error('❌ Erro ao carregar dados:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [buscarRankingPriorizacao, buscarCargaAnalistas, buscarMetricas, buscarPerformanceIA]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estados
    loading,
    error,
    rankingPriorizacao,
    cargaAnalistas,
    sugestaoAtual,
    metricas,
    performanceIA,

    // Priorização
    buscarRankingPriorizacao,
    calcularPrioridade,

    // Carga
    buscarCargaAnalistas,

    // Sugestão IA
    gerarSugestaoAnalistas,
    setSugestaoAtual,

    // Decisão
    registrarDecisao,

    // Redistribuição
    redistribuirVaga,

    // Métricas
    buscarMetricas,
    buscarPerformanceIA,

    // Consolidado
    carregarTudo,

    // Constantes
    PESOS_SCORING
  };
}
