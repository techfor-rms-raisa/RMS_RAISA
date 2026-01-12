/**
 * useDistribuicaoIA.ts - Hook de Distribuição Inteligente com IA
 * 
 * Funcionalidades:
 * - Gerar ranking de analistas baseado em scores
 * - Registrar decisões (IA aceita vs Manual override)
 * - Log de redistribuições com justificativa
 * - Métricas de acurácia IA vs Manual
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface AnalistaScore {
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
  justificativa?: string;
}

export interface SugestaoIA {
  id?: number;
  vaga_id: number;
  ranking_analistas: AnalistaScore[];
  gerado_em: string;
  modelo_versao: string;
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

export interface RedistribuicaoLog {
  vaga_id: number;
  candidatura_id?: number;
  analista_anterior_id?: number;
  analista_novo_id: number;
  tipo_redistribuicao: 'manual' | 'automatica' | 'balanceamento' | 'ferias' | 'desligamento';
  motivo: string;
  ia_sugeria_analista_id?: number;
  seguiu_sugestao_ia: boolean;
  redistribuido_por: number;
}

export interface MetricasIAvsManual {
  tipo_decisao: string;
  total_decisoes: number;
  sucessos: number;
  insucessos: number;
  taxa_sucesso: number;
  media_dias_fechamento: number;
  media_aprovados: number;
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

export function useDistribuicaoIA() {
  const [sugestaoAtual, setSugestaoAtual] = useState<SugestaoIA | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // GERAR RANKING DE ANALISTAS PARA UMA VAGA
  // ============================================

  const gerarRankingAnalistas = useCallback(async (vagaId: number): Promise<SugestaoIA | null> => {
    setLoading(true);
    setError(null);

    try {
      // Buscar dados da vaga
      const { data: vaga, error: vagaError } = await supabase
        .from('vagas')
        .select('id, titulo, cliente_id, stack_tecnologica')
        .eq('id', vagaId)
        .maybeSingle();

      if (vagaError) throw vagaError;
      if (!vaga) throw new Error('Vaga não encontrada');

      // 🆕 Buscar analistas já atribuídos a esta vaga
      const { data: analistasJaAtribuidos } = await supabase
        .from('vaga_analista_distribuicao')
        .select('analista_id')
        .eq('vaga_id', vagaId)
        .eq('ativo', true);

      const idsJaAtribuidos = new Set((analistasJaAtribuidos || []).map(a => a.analista_id));

      // Buscar analistas de R&S ativos
      const { data: analistas, error: analistasError } = await supabase
        .from('app_users')
        .select('id, nome_usuario, email_usuario')
        .eq('tipo_usuario', 'Analista de R&S')
        .eq('ativo_usuario', true);

      if (analistasError) throw analistasError;

      // 🆕 Filtrar analistas que já estão atribuídos
      const analistasDisponiveis = (analistas || []).filter(a => !idsJaAtribuidos.has(a.id));

      // Calcular score de cada analista
      const ranking: AnalistaScore[] = await Promise.all(
        analistasDisponiveis.map(async (analista) => {
          const score = await calcularScoreAnalista(
            analista.id,
            vagaId,
            vaga.cliente_id,
            vaga.stack_tecnologica
          );

          return {
            analista_id: analista.id,
            nome: analista.nome_usuario,
            ...score
          };
        })
      );

      // Ordenar por score total (maior primeiro)
      ranking.sort((a, b) => b.score_total - a.score_total);

      // Adicionar justificativas
      ranking.forEach((analista, index) => {
        analista.justificativa = gerarJustificativa(analista, index + 1);
      });

      // Salvar sugestão no banco
      const sugestao: SugestaoIA = {
        vaga_id: vagaId,
        ranking_analistas: ranking,
        gerado_em: new Date().toISOString(),
        modelo_versao: 'v1.0'
      };

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
        .maybeSingle();

      if (saveError) {
        console.warn('Aviso ao salvar sugestão:', saveError);
      } else if (sugestaoSalva) {
        sugestao.id = sugestaoSalva.id;
      }

      setSugestaoAtual(sugestao);
      return sugestao;
    } catch (err: any) {
      console.error('Erro ao gerar ranking:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // CALCULAR SCORE DE UM ANALISTA
  // ============================================

  const calcularScoreAnalista = async (
    analistaId: number,
    vagaId: number,
    clienteId: number,
    tecnologia?: string
  ): Promise<Omit<AnalistaScore, 'analista_id' | 'nome' | 'justificativa'>> => {
    let scoreEspecializacao = 0;
    let scoreCliente = 0;
    let scoreCarga = 20; // Default: disponível
    let scoreTaxaAprovacao = 0;
    let scoreVelocidade = 5; // Default médio

    // 1. Score Especialização (max 30)
    if (tecnologia) {
      const { data: esp } = await supabase
        .from('analista_especializacao')
        .select('nivel_expertise, taxa_aprovacao')
        .eq('analista_id', analistaId)
        .ilike('tecnologia', `%${tecnologia.split(',')[0].trim()}%`)
        .limit(1)
        .maybeSingle();

      if (esp) {
        switch (esp.nivel_expertise) {
          case 'especialista': scoreEspecializacao = 30; break;
          case 'alto': scoreEspecializacao = 24; break;
          case 'medio': scoreEspecializacao = 15; break;
          case 'baixo': scoreEspecializacao = 8; break;
          default: scoreEspecializacao = 10;
        }
      }
    }

    // 2. Score Cliente (max 25)
    if (clienteId) {
      const { data: cli } = await supabase
        .from('analista_cliente_historico')
        .select('nivel_relacionamento, taxa_aprovacao')
        .eq('analista_id', analistaId)
        .eq('cliente_id', clienteId)
        .maybeSingle();

      if (cli) {
        switch (cli.nivel_relacionamento) {
          case 'excelente': scoreCliente = 25; break;
          case 'bom': scoreCliente = 20; break;
          case 'neutro': scoreCliente = 10; break;
          case 'ruim': scoreCliente = 0; break;
          default: scoreCliente = 5;
        }
        // Bonus por taxa alta
        if (cli.taxa_aprovacao > 80) scoreCliente = Math.min(25, scoreCliente + 5);
      }
    }

    // 3. Score Carga (max 20) - Menos carga = mais score
    const { count: cargaAtual } = await supabase
      .from('vaga_analista_distribuicao')
      .select('*', { count: 'exact', head: true })
      .eq('analista_id', analistaId)
      .eq('ativo', true);

    scoreCarga = Math.max(0, 20 - ((cargaAtual || 0) * 4));

    // 4. Score Taxa Aprovação Geral (max 15)
    const { data: taxas } = await supabase
      .from('analista_especializacao')
      .select('taxa_aprovacao')
      .eq('analista_id', analistaId);

    if (taxas && taxas.length > 0) {
      const mediaTaxa = taxas.reduce((sum, t) => sum + (t.taxa_aprovacao || 0), 0) / taxas.length;
      scoreTaxaAprovacao = Math.min(15, Math.round(mediaTaxa * 0.15));
    }

    // 5. Score Velocidade (max 10) - Baseado em tempo médio de processamento
    // ✅ Calcula baseado em histórico real de candidaturas processadas
    try {
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
      
      const { data: candidaturasProcessadas } = await supabase
        .from('candidaturas')
        .select('enviado_em, decidido_em')
        .eq('analista_id', analistaId)
        .not('decidido_em', 'is', null)
        .gte('decidido_em', trintaDiasAtras.toISOString())
        .limit(50);

      if (candidaturasProcessadas && candidaturasProcessadas.length >= 5) {
        // Calcular tempo médio de processamento em dias
        const temposProcessamento = candidaturasProcessadas.map(c => {
          const inicio = new Date(c.enviado_em).getTime();
          const fim = new Date(c.decidido_em).getTime();
          return (fim - inicio) / (1000 * 60 * 60 * 24); // dias
        });
        
        const mediaTempoProcessamento = temposProcessamento.reduce((a, b) => a + b, 0) / temposProcessamento.length;
        
        // Quanto menor o tempo, maior o score (invertido)
        // < 2 dias = 10 pontos, > 10 dias = 2 pontos
        if (mediaTempoProcessamento <= 2) scoreVelocidade = 10;
        else if (mediaTempoProcessamento <= 4) scoreVelocidade = 8;
        else if (mediaTempoProcessamento <= 6) scoreVelocidade = 6;
        else if (mediaTempoProcessamento <= 8) scoreVelocidade = 4;
        else scoreVelocidade = 2;
      } else {
        // Sem histórico suficiente, usar score neutro
        scoreVelocidade = 5;
      }
    } catch (e) {
      console.warn('⚠️ Usando fallback para score velocidade');
      scoreVelocidade = 5;
    }

    const scoreTotal = scoreEspecializacao + scoreCliente + scoreCarga + scoreTaxaAprovacao + scoreVelocidade;

    return {
      score_total: scoreTotal,
      scores: {
        especializacao: scoreEspecializacao,
        cliente: scoreCliente,
        carga: scoreCarga,
        taxa_aprovacao: scoreTaxaAprovacao,
        velocidade: scoreVelocidade
      },
      carga_atual: cargaAtual || 0
    };
  };

  // ============================================
  // GERAR JUSTIFICATIVA TEXTUAL
  // ============================================

  const gerarJustificativa = (analista: AnalistaScore, posicao: number): string => {
    const partes: string[] = [];

    if (analista.scores.especializacao >= 24) {
      partes.push('especialista na tecnologia');
    } else if (analista.scores.especializacao >= 15) {
      partes.push('experiência na tecnologia');
    }

    if (analista.scores.cliente >= 20) {
      partes.push('excelente relacionamento com o cliente');
    } else if (analista.scores.cliente >= 10) {
      partes.push('conhece o cliente');
    }

    if (analista.scores.carga >= 16) {
      partes.push('boa disponibilidade');
    } else if (analista.scores.carga <= 8) {
      partes.push('carga alta atual');
    }

    if (analista.scores.taxa_aprovacao >= 12) {
      partes.push('alta taxa de aprovação');
    }

    if (partes.length === 0) {
      return `${posicao}º no ranking geral`;
    }

    return `${posicao}º - ${partes.join(', ')}`;
  };

  // ============================================
  // REGISTRAR DECISÃO (IA vs MANUAL)
  // ============================================

  const registrarDecisao = useCallback(async (decisao: DecisaoDistribuicao): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Determinar tipo de decisão
      const sugeridosSet = new Set(decisao.analistas_sugeridos_ia);
      const escolhidosSet = new Set(decisao.analistas_escolhidos);
      
      let tipo_decisao: 'ia_aceita' | 'ia_parcial' | 'manual_override';
      
      // Verifica se os escolhidos são exatamente os top sugeridos
      const topSugeridos = decisao.analistas_sugeridos_ia.slice(0, decisao.analistas_escolhidos.length);
      const escolheuTopIA = decisao.analistas_escolhidos.every(id => topSugeridos.includes(id));
      
      if (escolheuTopIA && decisao.analistas_escolhidos.length === topSugeridos.length) {
        tipo_decisao = 'ia_aceita';
      } else if (decisao.analistas_escolhidos.some(id => sugeridosSet.has(id))) {
        tipo_decisao = 'ia_parcial';
      } else {
        tipo_decisao = 'manual_override';
      }

      // Buscar ID da sugestão (pode não existir ainda)
      const { data: sugestao } = await supabase
        .from('distribuicao_sugestao_ia')
        .select('id')
        .eq('vaga_id', decisao.vaga_id)
        .maybeSingle();

      // Inserir log completo para aprendizado da IA
      const { error: insertError } = await supabase
        .from('distribuicao_decisao_log')
        .insert({
          vaga_id: decisao.vaga_id,
          sugestao_ia_id: sugestao?.id,
          analistas_sugeridos_ia: decisao.analistas_sugeridos_ia,
          analistas_escolhidos: decisao.analistas_escolhidos,
          tipo_decisao: tipo_decisao,
          justificativa: decisao.justificativa,
          motivo_override: decisao.motivo_override,
          decidido_por: decisao.decidido_por,
          decidido_em: new Date().toISOString(),
          // Campos adicionais para análise de aprendizado
          qtd_sugeridos: decisao.analistas_sugeridos_ia.length,
          qtd_escolhidos: decisao.analistas_escolhidos.length
        });

      if (insertError) throw insertError;

      console.log(`✅ Decisão registrada: ${tipo_decisao}`);
      return true;
    } catch (err: any) {
      console.error('Erro ao registrar decisão:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // REGISTRAR REDISTRIBUIÇÃO
  // ============================================

  const registrarRedistribuicao = useCallback(async (log: RedistribuicaoLog): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('redistribuicao_log')
        .insert({
          ...log,
          redistribuido_em: new Date().toISOString()
        });

      if (error) throw error;

      console.log('✅ Redistribuição registrada');
      return true;
    } catch (err: any) {
      console.error('Erro ao registrar redistribuição:', err);
      setError(err.message);
      return false;
    }
  }, []);

  // ============================================
  // BUSCAR MÉTRICAS IA vs MANUAL
  // ============================================

  const buscarMetricas = useCallback(async (): Promise<MetricasIAvsManual[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_performance_ia_vs_manual')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar métricas:', err);
      return [];
    }
  }, []);

  // ============================================
  // ATUALIZAR RESULTADO DA VAGA (APÓS FECHAMENTO)
  // ============================================

  const atualizarResultadoVaga = useCallback(async (
    vagaId: number,
    resultado: 'sucesso' | 'parcial' | 'insucesso',
    diasParaFechar: number,
    candidatosAprovados: number
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('distribuicao_decisao_log')
        .update({
          resultado,
          dias_para_fechar: diasParaFechar,
          candidatos_aprovados: candidatosAprovados,
          avaliado_em: new Date().toISOString()
        })
        .eq('vaga_id', vagaId);

      if (error) throw error;

      console.log('✅ Resultado da vaga atualizado');
      return true;
    } catch (err: any) {
      console.error('Erro ao atualizar resultado:', err);
      return false;
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    sugestaoAtual,
    loading,
    error,

    // Ações principais
    gerarRankingAnalistas,
    registrarDecisao,
    registrarRedistribuicao,
    atualizarResultadoVaga,

    // Consultas
    buscarMetricas,

    // Constantes
    PESOS_SCORING
  };
}

export default useDistribuicaoIA;
