/**
 * useVagaAnaliseIA.ts - Hook para Análise de Vagas com IA
 * 
 * Funcionalidades:
 * - Analisar qualidade do anúncio da vaga
 * - Gerar sugestões de melhoria
 * - Extrair keywords e stacks
 * - Salvar histórico de análises
 * 
 * Versão: 1.0
 * Data: 27/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { Vaga } from '../../types/types_models';

// ============================================
// TIPOS
// ============================================

export interface SugestaoIA {
  original: string | null;
  sugerido: string;
  motivo: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

export interface SugestoesVaga {
  titulo?: SugestaoIA;
  descricao?: SugestaoIA;
  requisitos_obrigatorios?: SugestaoIA;
  requisitos_desejaveis?: SugestaoIA;
  beneficios?: SugestaoIA;
  keywords?: string[];
  stacks_identificadas?: string[];
  melhorias_gerais?: string[];
}

export interface ConfidenceDetalhado {
  clareza: number;
  atratividade: number;
  completude: number;
  seo: number;
}

export interface VagaAnaliseIADB {
  id: number;
  vaga_id: number;
  confidence_score: number;
  confidence_detalhado: ConfidenceDetalhado;
  sugestoes: SugestoesVaga;
  analisado_por: string;
  analisado_em: string;
  aprovado: boolean;
  aprovado_por?: number;
  aprovado_em?: string;
  rejeitado: boolean;
  rejeitado_por?: number;
  rejeitado_em?: string;
  motivo_rejeicao?: string;
  campos_aplicados?: string[];
}

// ============================================
// PROMPT PARA GEMINI
// ============================================

const buildAnalysisPrompt = (vaga: Vaga): string => {
  return `Você é um especialista em recrutamento e seleção de TI. Analise esta vaga e forneça sugestões de melhoria.

VAGA PARA ANÁLISE:
==================
Título: ${vaga.titulo || 'Não informado'}
Senioridade: ${vaga.senioridade || 'Não informado'}
Descrição: ${vaga.descricao || 'Não informado'}
Requisitos Obrigatórios: ${vaga.requisitos_obrigatorios || 'Não informado'}
Requisitos Desejáveis: ${vaga.requisitos_desejaveis || 'Não informado'}
Benefícios: ${vaga.beneficios || 'Não informado'}
Modalidade: ${vaga.modalidade || 'Não informado'}
Regime: ${vaga.regime_contratacao || 'Não informado'}

INSTRUÇÕES:
===========
1. Avalie a qualidade geral do anúncio (0-100)
2. Identifique pontos de melhoria
3. Sugira um título mais atrativo (se necessário)
4. Sugira melhorias na descrição
5. Extraia as tecnologias/stacks mencionadas
6. Sugira keywords para SEO

RESPONDA APENAS EM JSON VÁLIDO (sem markdown, sem backticks):
{
  "confidence_score": <número 0-100>,
  "confidence_detalhado": {
    "clareza": <0-100>,
    "atratividade": <0-100>,
    "completude": <0-100>,
    "seo": <0-100>
  },
  "sugestoes": {
    "titulo": {
      "original": "<título atual>",
      "sugerido": "<título melhorado ou null se ok>",
      "motivo": "<explicação>",
      "prioridade": "alta|media|baixa"
    },
    "descricao": {
      "original": "<resumo do atual>",
      "sugerido": "<sugestão de melhoria ou null se ok>",
      "motivo": "<explicação>",
      "prioridade": "alta|media|baixa"
    },
    "requisitos_obrigatorios": {
      "original": "<resumo>",
      "sugerido": "<sugestão ou null>",
      "motivo": "<explicação>",
      "prioridade": "alta|media|baixa"
    },
    "keywords": ["keyword1", "keyword2", ...],
    "stacks_identificadas": ["React", "Node.js", ...],
    "melhorias_gerais": ["dica1", "dica2", ...]
  }
}`;
};

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useVagaAnaliseIA = () => {
  const [analiseAtual, setAnaliseAtual] = useState<VagaAnaliseIADB | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARREGAR ANÁLISE EXISTENTE
  // ============================================
  
  const loadAnaliseVaga = useCallback(async (vagaId: number): Promise<VagaAnaliseIADB | null> => {
    try {
      const { data, error } = await supabase
        .from('vaga_analise_ia')
        .select('*')
        .eq('vaga_id', vagaId)
        .eq('rejeitado', false)
        .order('analisado_em', { ascending: false })
        .limit(1)
        .maybeSingle();  // ✅ CORRIGIDO: maybeSingle em vez de single (evita erro 406 quando não há dados)

      if (error) {
        console.error('Erro ao carregar análise:', error);
        return null;
      }

      if (data) {
        setAnaliseAtual(data);
        return data;
      }

      return null;
    } catch (err) {
      console.error('Erro ao carregar análise:', err);
      return null;
    }
  }, []);

  // ============================================
  // ANALISAR VAGA COM IA (VIA BACKEND)
  // ============================================

  const analisarVaga = useCallback(async (vaga: Vaga): Promise<VagaAnaliseIADB | null> => {
    setLoading(true);
    setError(null);

    try {
      // ✅ CORRIGIDO: Chamar backend em vez de API direta
      console.log('🤖 Chamando backend para análise de vaga...');
      
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
        throw new Error(`Erro na API: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao analisar vaga');
      }

      const analise = result.data;
      console.log('✅ Análise recebida do backend');

      // Salvar no banco - incluindo descrição original
      const analiseDB = await salvarAnalise(vaga.id, analise, 'Gemini 2.0 Flash', vaga.descricao);
      
      if (analiseDB) {
        setAnaliseAtual(analiseDB);
        return analiseDB;
      }

      return null;

    } catch (err: any) {
      console.error('Erro na análise IA:', err);
      setError(err.message || 'Erro ao analisar vaga');
      
      // Tentar análise local como fallback
      try {
        console.log('⚠️ Usando análise local como fallback...');
        return await analisarVagaLocal(vaga);
      } catch {
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // ANÁLISE LOCAL (FALLBACK)
  // ============================================

  const analisarVagaLocal = async (vaga: Vaga): Promise<VagaAnaliseIADB | null> => {
    console.log('📊 Executando análise local...');

    // Calcular scores baseado em heurísticas
    const temTitulo = (vaga.titulo?.length || 0) > 10;
    const temDescricao = (vaga.descricao?.length || 0) > 50;
    const temRequisitos = (vaga.requisitos_obrigatorios?.length || 0) > 20;
    const temBeneficios = (vaga.beneficios?.length || 0) > 10;
    const temModalidade = !!vaga.modalidade;
    const temSalario = !!vaga.salario_min || !!vaga.salario_max;

    const clareza = temDescricao ? (temRequisitos ? 80 : 60) : 30;
    const atratividade = temBeneficios ? (temSalario ? 85 : 65) : 40;
    const completude = [temTitulo, temDescricao, temRequisitos, temBeneficios, temModalidade].filter(Boolean).length * 20;
    const seo = temTitulo && (vaga.titulo?.length || 0) > 20 ? 70 : 50;

    const confidence_score = Math.round((clareza + atratividade + completude + seo) / 4);

    // Extrair stacks do texto
    const textoCompleto = `${vaga.descricao || ''} ${vaga.requisitos_obrigatorios || ''} ${vaga.requisitos_desejaveis || ''}`.toLowerCase();
    
    const stacksComuns = [
      'React', 'Angular', 'Vue', 'Node.js', 'Python', 'Java', 'C#', '.NET',
      'JavaScript', 'TypeScript', 'PHP', 'Laravel', 'Django', 'Spring',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP',
      'Docker', 'Kubernetes', 'Git', 'CI/CD', 'Agile', 'Scrum',
      'REST', 'API', 'GraphQL', 'SQL', 'Linux', 'DevOps'
    ];

    const stacks_identificadas = stacksComuns.filter(s => 
      textoCompleto.includes(s.toLowerCase())
    );

    // Gerar sugestões
    const sugestoes: SugestoesVaga = {
      stacks_identificadas,
      keywords: stacks_identificadas.slice(0, 5),
      melhorias_gerais: []
    };

    if (!temDescricao || (vaga.descricao?.length || 0) < 100) {
      sugestoes.descricao = {
        original: vaga.descricao?.substring(0, 50) || null,
        sugerido: 'Adicione uma descrição mais detalhada com responsabilidades, desafios e contexto do projeto.',
        motivo: 'Descrições completas aumentam em 40% a taxa de candidaturas qualificadas.',
        prioridade: 'alta'
      };
      sugestoes.melhorias_gerais?.push('Descrição precisa de mais detalhes');
    }

    if (!temBeneficios) {
      sugestoes.beneficios = {
        original: null,
        sugerido: 'Liste benefícios como: flexibilidade de horário, plano de carreira, ambiente de trabalho, ferramentas modernas.',
        motivo: 'Vagas com benefícios claros atraem 60% mais candidatos.',
        prioridade: 'media'
      };
      sugestoes.melhorias_gerais?.push('Adicione benefícios para atrair candidatos');
    }

    if (!temSalario) {
      sugestoes.melhorias_gerais?.push('Considere informar faixa salarial para filtrar candidatos');
    }

    const analise = {
      confidence_score,
      confidence_detalhado: { clareza, atratividade, completude, seo },
      sugestoes
    };

    // Salvar no banco - incluindo descrição original
    return await salvarAnalise(vaga.id, analise, 'Análise Local', vaga.descricao);
  };

  // ============================================
  // SALVAR ANÁLISE NO BANCO
  // ============================================

  const salvarAnalise = async (
    vagaId: string | number, 
    analise: any, 
    analisadoPor: string,
    descricaoOriginal?: string  // ✅ NOVO: Descrição original da vaga
  ): Promise<VagaAnaliseIADB | null> => {
    try {
      const { data, error } = await supabase
        .from('vaga_analise_ia')
        .insert({
          vaga_id: typeof vagaId === 'string' ? parseInt(vagaId) : vagaId,
          confidence_score: analise.confidence_score,
          confidence_detalhado: analise.confidence_detalhado,
          sugestoes: analise.sugestoes,
          analisado_por: analisadoPor,
          analisado_em: new Date().toISOString(),
          aprovado: false,
          rejeitado: false,
          descricao_original: descricaoOriginal || null  // ✅ NOVO: Salvar descrição original
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao salvar análise:', error);
        // Se a tabela não existe, retornar objeto em memória
        if (error.code === '42P01') {
          console.warn('⚠️ Tabela vaga_analise_ia não existe. Retornando análise em memória.');
          return {
            id: Date.now(),
            vaga_id: typeof vagaId === 'string' ? parseInt(vagaId) : vagaId,
            confidence_score: analise.confidence_score,
            confidence_detalhado: analise.confidence_detalhado,
            sugestoes: analise.sugestoes,
            analisado_por: analisadoPor,
            analisado_em: new Date().toISOString(),
            aprovado: false,
            rejeitado: false
          };
        }
        return null;
      }

      return data;
    } catch (err) {
      console.error('Erro ao salvar análise:', err);
      return null;
    }
  };

  // ============================================
  // APLICAR SUGESTÕES
  // ============================================

  const aplicarSugestoes = useCallback(async (
    analiseId: number,
    vagaId: number,
    camposAplicados: string[],
    userId: number
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('vaga_analise_ia')
        .update({
          aprovado: true,
          aprovado_por: userId,
          aprovado_em: new Date().toISOString(),
          campos_aplicados: camposAplicados
        })
        .eq('id', analiseId);

      if (error) {
        console.error('Erro ao aplicar sugestões:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Erro ao aplicar sugestões:', err);
      return false;
    }
  }, []);

  // ============================================
  // REJEITAR ANÁLISE
  // ============================================

  const rejeitarAnalise = useCallback(async (
    analiseId: number,
    motivo: string,
    userId: number
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('vaga_analise_ia')
        .update({
          rejeitado: true,
          rejeitado_por: userId,
          rejeitado_em: new Date().toISOString(),
          motivo_rejeicao: motivo
        })
        .eq('id', analiseId);

      if (error) {
        console.error('Erro ao rejeitar análise:', error);
        return false;
      }

      setAnaliseAtual(null);
      return true;
    } catch (err) {
      console.error('Erro ao rejeitar análise:', err);
      return false;
    }
  }, []);

  // ============================================
  // LIMPAR ESTADO
  // ============================================

  const limparAnalise = useCallback(() => {
    setAnaliseAtual(null);
    setError(null);
  }, []);

  return {
    analiseAtual,
    loading,
    error,
    analisarVaga,
    loadAnaliseVaga,
    aplicarSugestoes,
    rejeitarAnalise,
    limparAnalise
  };
};

export default useVagaAnaliseIA;
