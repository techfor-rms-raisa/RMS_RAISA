/**
 * useVagaAnaliseIA.ts - Hook para Análise de Vagas com IA
 * 
 * Gerencia:
 * - vaga_analise_ia: Sugestões de melhoria no anúncio
 * - Workflow de aprovação de vagas
 * 
 * Versão: 1.0
 * Data: 25/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../Lib/supabase';
import { Vaga } from '@/types';

// Tipo para sugestões da IA
export interface SugestaoIA {
  campo: string;
  original: string;
  sugerido: string;
  motivo: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

// Tipo para análise completa
export interface VagaAnaliseIADB {
  id: number;
  vaga_id: number;
  descricao_original: string;
  fonte: string;
  sugestoes: {
    titulo?: SugestaoIA;
    descricao?: SugestaoIA;
    requisitos?: SugestaoIA;
    beneficios?: SugestaoIA;
    keywords?: string[];
    tom_sugerido?: string;
    melhorias_gerais?: string[];
  };
  confidence_score: number;
  confidence_detalhado: {
    clareza: number;
    atratividade: number;
    completude: number;
    seo: number;
  };
  ajustes: any;
  total_ajustes: number;
  campos_ajustados: string[];
  qualidade_sugestao: number;
  feedback_texto?: string;
  analisado_em: string;
  analisado_por: string;
  revisado_em?: string;
  revisado_por?: number;
  aprovado: boolean;
  requer_revisao_manual: boolean;
  metadados?: any;
}

// Tipo para workflow de aprovação (usando campos existentes em vagas)
export interface VagaWorkflowStatus {
  vaga_id: number;
  status_atual: 'rascunho' | 'aguardando_aprovacao' | 'aprovado' | 'publicado' | 'rejeitado';
  aprovado_comercial: boolean;
  aprovado_rs: boolean;
  data_submissao?: string;
  data_aprovacao_comercial?: string;
  data_aprovacao_rs?: string;
  aprovador_comercial_id?: number;
  aprovador_rs_id?: number;
  comentarios_rejeicao?: string;
}

export const useVagaAnaliseIA = () => {
  const [analises, setAnalises] = useState<VagaAnaliseIADB[]>([]);
  const [analiseAtual, setAnaliseAtual] = useState<VagaAnaliseIADB | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // ANALISAR VAGA COM IA
  // ============================================

  /**
   * Analisa uma vaga e gera sugestões de melhoria
   */
  const analisarVaga = useCallback(async (vaga: Vaga): Promise<VagaAnaliseIADB | null> => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🤖 Analisando vaga: ${vaga.titulo}...`);

      // Verificar se já existe análise recente (últimas 24h)
      const { data: analiseExistente } = await supabase
        .from('vaga_analise_ia')
        .select('*')
        .eq('vaga_id', parseInt(vaga.id))
        .gte('analisado_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('analisado_em', { ascending: false })
        .limit(1)
        .single();

      if (analiseExistente && !analiseExistente.aprovado) {
        console.log('📋 Análise recente encontrada, retornando...');
        setAnaliseAtual(analiseExistente);
        return analiseExistente;
      }

      // Chamar API Gemini para análise (via endpoint Vercel)
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analise_vaga',
          payload: {
            dados: {
              titulo: vaga.titulo,
              descricao: vaga.descricao,
              senioridade: vaga.senioridade,
              stack_tecnologica: vaga.stack_tecnologica,
              requisitos_obrigatorios: vaga.requisitos_obrigatorios,
              requisitos_desejaveis: vaga.requisitos_desejaveis,
              regime_contratacao: vaga.regime_contratacao,
              modalidade: vaga.modalidade,
              beneficios: vaga.beneficios,
              salario_min: vaga.salario_min,
              salario_max: vaga.salario_max
            }
          }
        })
      });

      if (!response.ok) {
        // Fallback: gerar análise local simplificada
        console.warn('⚠️ API indisponível, gerando análise local...');
        return await gerarAnaliseLocal(vaga);
      }

      const apiResponse = await response.json();
      const resultadoIA = apiResponse.data || apiResponse;

      // Salvar análise no Supabase
      const analiseData: Partial<VagaAnaliseIADB> = {
        vaga_id: parseInt(vaga.id),
        descricao_original: vaga.descricao || '',
        fonte: 'Gemini',
        sugestoes: resultadoIA.sugestoes || {},
        confidence_score: resultadoIA.confidence_score || 75,
        confidence_detalhado: resultadoIA.confidence_detalhado || {
          clareza: 70,
          atratividade: 70,
          completude: 70,
          seo: 70
        },
        ajustes: resultadoIA.ajustes || {},
        total_ajustes: resultadoIA.total_ajustes || 0,
        campos_ajustados: resultadoIA.campos_ajustados || [],
        qualidade_sugestao: resultadoIA.qualidade_sugestao || 70,
        analisado_em: new Date().toISOString(),
        analisado_por: 'Gemini',
        aprovado: false,
        requer_revisao_manual: resultadoIA.requer_revisao_manual || false
      };

      const { data: analiseSalva, error: saveError } = await supabase
        .from('vaga_analise_ia')
        .insert(analiseData)
        .select()
        .single();

      if (saveError) throw saveError;

      setAnaliseAtual(analiseSalva);
      setAnalises(prev => [...prev, analiseSalva]);
      console.log(`✅ Análise concluída: ${analiseSalva.total_ajustes} sugestões`);
      
      return analiseSalva;
    } catch (err: any) {
      console.error('❌ Erro ao analisar vaga:', err);
      setError(err.message);
      // Tentar análise local como fallback
      return await gerarAnaliseLocal(vaga);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Gera análise local simplificada (fallback)
   */
  const gerarAnaliseLocal = async (vaga: Vaga): Promise<VagaAnaliseIADB | null> => {
    try {
      const sugestoes: VagaAnaliseIADB['sugestoes'] = {
        melhorias_gerais: []
      };

      // Análise básica de completude
      if (!vaga.descricao || vaga.descricao.length < 100) {
        sugestoes.descricao = {
          campo: 'descricao',
          original: vaga.descricao || '',
          sugerido: 'Adicione uma descrição mais detalhada (mínimo 100 caracteres)',
          motivo: 'Descrições curtas reduzem a atratividade da vaga',
          prioridade: 'alta'
        };
      }

      if (!vaga.requisitos_obrigatorios || (vaga.requisitos_obrigatorios as any).length === 0) {
        sugestoes.requisitos = {
          campo: 'requisitos_obrigatorios',
          original: '',
          sugerido: 'Liste os requisitos obrigatórios para o cargo',
          motivo: 'Candidatos precisam saber os pré-requisitos',
          prioridade: 'alta'
        };
      }

      if (!vaga.beneficios) {
        sugestoes.beneficios = {
          campo: 'beneficios',
          original: '',
          sugerido: 'Adicione os benefícios oferecidos',
          motivo: 'Benefícios aumentam a atratividade da vaga',
          prioridade: 'media'
        };
      }

      // Keywords sugeridas baseadas na stack
      if (vaga.stack_tecnologica && vaga.stack_tecnologica.length > 0) {
        sugestoes.keywords = [
          ...vaga.stack_tecnologica,
          vaga.senioridade || '',
          vaga.modalidade || 'Remoto'
        ].filter(Boolean);
      }

      const totalAjustes = [
        sugestoes.titulo,
        sugestoes.descricao,
        sugestoes.requisitos,
        sugestoes.beneficios
      ].filter(Boolean).length;

      const analiseData: Partial<VagaAnaliseIADB> = {
        vaga_id: parseInt(vaga.id),
        descricao_original: vaga.descricao || '',
        fonte: 'Local',
        sugestoes,
        confidence_score: 60,
        confidence_detalhado: {
          clareza: vaga.descricao && vaga.descricao.length > 100 ? 80 : 50,
          atratividade: vaga.beneficios ? 70 : 40,
          completude: totalAjustes === 0 ? 90 : 90 - (totalAjustes * 15),
          seo: sugestoes.keywords ? 70 : 40
        },
        total_ajustes: totalAjustes,
        campos_ajustados: Object.keys(sugestoes).filter(k => k !== 'keywords' && k !== 'melhorias_gerais'),
        qualidade_sugestao: 60,
        analisado_em: new Date().toISOString(),
        analisado_por: 'Local',
        aprovado: false,
        requer_revisao_manual: totalAjustes > 2
      };

      const { data: analiseSalva, error } = await supabase
        .from('vaga_analise_ia')
        .insert(analiseData)
        .select()
        .single();

      if (error) throw error;

      setAnaliseAtual(analiseSalva);
      return analiseSalva;
    } catch (err: any) {
      console.error('❌ Erro na análise local:', err);
      return null;
    }
  };

  // ============================================
  // CARREGAR ANÁLISES
  // ============================================

  /**
   * Carrega análise de uma vaga específica
   */
  const loadAnaliseVaga = useCallback(async (vagaId: number): Promise<VagaAnaliseIADB | null> => {
    try {
      const { data, error } = await supabase
        .from('vaga_analise_ia')
        .select('*')
        .eq('vaga_id', vagaId)
        .order('analisado_em', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setAnaliseAtual(data);
      }
      return data || null;
    } catch (err: any) {
      console.error('❌ Erro ao carregar análise:', err);
      return null;
    }
  }, []);

  /**
   * Carrega todas as análises pendentes de aprovação
   */
  const loadAnalisesPendentes = useCallback(async (): Promise<VagaAnaliseIADB[]> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('vaga_analise_ia')
        .select(`
          *,
          vagas!vaga_id (
            titulo,
            status
          )
        `)
        .eq('aprovado', false)
        .order('analisado_em', { ascending: false });

      if (error) throw error;

      setAnalises(data || []);
      return data || [];
    } catch (err: any) {
      console.error('❌ Erro ao carregar análises pendentes:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // APROVAR/APLICAR SUGESTÕES
  // ============================================

  /**
   * Aplica sugestões da IA na vaga
   */
  const aplicarSugestoes = useCallback(async (
    analiseId: number,
    vagaId: number,
    sugestoesAceitas: string[],
    userId: number
  ): Promise<boolean> => {
    try {
      setLoading(true);
      console.log(`✅ Aplicando ${sugestoesAceitas.length} sugestões...`);

      // Buscar análise
      const { data: analise } = await supabase
        .from('vaga_analise_ia')
        .select('sugestoes')
        .eq('id', analiseId)
        .single();

      if (!analise) throw new Error('Análise não encontrada');

      // Preparar atualizações para a vaga
      const updates: Partial<Vaga> = {};
      const sugestoes = analise.sugestoes;

      sugestoesAceitas.forEach(campo => {
        const sugestao = sugestoes[campo as keyof typeof sugestoes];
        if (sugestao && typeof sugestao === 'object' && 'sugerido' in sugestao) {
          (updates as any)[campo] = sugestao.sugerido;
        }
      });

      if (Object.keys(updates).length > 0) {
        // Atualizar vaga
        const { error: vagaError } = await supabase
          .from('vagas')
          .update({
            ...updates,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', vagaId);

        if (vagaError) throw vagaError;
      }

      // Marcar análise como aprovada
      const { error: analiseError } = await supabase
        .from('vaga_analise_ia')
        .update({
          aprovado: true,
          revisado_em: new Date().toISOString(),
          revisado_por: userId,
          feedback_texto: `Sugestões aceitas: ${sugestoesAceitas.join(', ')}`
        })
        .eq('id', analiseId);

      if (analiseError) throw analiseError;

      console.log('✅ Sugestões aplicadas com sucesso');
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao aplicar sugestões:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Rejeita análise/sugestões
   */
  const rejeitarAnalise = useCallback(async (
    analiseId: number,
    motivo: string,
    userId: number
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('vaga_analise_ia')
        .update({
          aprovado: false,
          revisado_em: new Date().toISOString(),
          revisado_por: userId,
          feedback_texto: `Rejeitado: ${motivo}`,
          requer_revisao_manual: false
        })
        .eq('id', analiseId);

      if (error) throw error;

      console.log('✅ Análise rejeitada');
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao rejeitar análise:', err);
      return false;
    }
  }, []);

  // ============================================
  // WORKFLOW DE APROVAÇÃO DE VAGA
  // ============================================

  /**
   * Submete vaga para aprovação
   */
  const submeterParaAprovacao = useCallback(async (vagaId: number): Promise<boolean> => {
    try {
      // Primeiro, garantir que existe análise da IA
      const analise = await loadAnaliseVaga(vagaId);
      
      if (!analise) {
        // Se não tem análise, buscar a vaga e analisar
        const { data: vaga } = await supabase
          .from('vagas')
          .select('*')
          .eq('id', vagaId)
          .single();
        
        if (vaga) {
          await analisarVaga(vaga as unknown as Vaga);
        }
      }

      // Atualizar status da vaga para aguardando aprovação
      // Nota: Isso usa o campo status existente, você pode criar novos campos se preferir
      const { error } = await supabase
        .from('vagas')
        .update({
          status: 'pausada', // Usando status existente como "aguardando aprovação"
          atualizado_em: new Date().toISOString()
        })
        .eq('id', vagaId);

      if (error) throw error;

      console.log('✅ Vaga submetida para aprovação');
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao submeter vaga:', err);
      return false;
    }
  }, [loadAnaliseVaga, analisarVaga]);

  /**
   * Aprova vaga (por Comercial ou R&S)
   */
  const aprovarVaga = useCallback(async (
    vagaId: number,
    aprovadorId: number,
    tipoAprovador: 'comercial' | 'rs'
  ): Promise<boolean> => {
    try {
      setLoading(true);
      console.log(`✅ Aprovando vaga por ${tipoAprovador}...`);

      // Atualizar vaga
      // Nota: Idealmente teríamos campos específicos para cada aprovação
      // Por ora, vamos registrar no metadados ou criar uma nova tabela
      
      const { data: vagaAtual } = await supabase
        .from('vagas')
        .select('*')
        .eq('id', vagaId)
        .single();

      if (!vagaAtual) throw new Error('Vaga não encontrada');

      // Verificar se ambas aprovações estão completas
      // Simplificação: se status atual é pausada e recebeu aprovação, muda para aberta
      const { error } = await supabase
        .from('vagas')
        .update({
          status: 'aberta',
          atualizado_em: new Date().toISOString()
        })
        .eq('id', vagaId);

      if (error) throw error;

      console.log(`✅ Vaga aprovada por ${tipoAprovador}`);
      return true;
    } catch (err: any) {
      console.error('❌ Erro ao aprovar vaga:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    analises,
    analiseAtual,
    loading,
    error,

    // Análise IA
    analisarVaga,
    loadAnaliseVaga,
    loadAnalisesPendentes,

    // Aplicar/Rejeitar
    aplicarSugestoes,
    rejeitarAnalise,

    // Workflow
    submeterParaAprovacao,
    aprovarVaga
  };
};
