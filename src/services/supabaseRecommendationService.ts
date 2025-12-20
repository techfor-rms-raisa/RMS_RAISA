/**
 * Serviço para carregar recomendações persistidas no Supabase
 * Evita chamadas repetidas à API Gemini causando looping
 */

import { Consultant, ConsultantReport } from '@/types';

export interface IntelligentRecommendation {
  tipo: 'AÇÃO IMEDIATA' | 'PREVENTIVO' | 'DESENVOLVIMENTO' | 'RECONHECIMENTO' | 'SUPORTE' | 'OBSERVAÇÃO' | 'FEEDBACK';
  descricao: string;
  prazo: string;
  responsavel: 'Gestor' | 'RH' | 'Coordenador';
}

export interface IntelligentAnalysis {
  resumo: string;
  recomendacoes: IntelligentRecommendation[];
  padroes?: string[];
  alertas?: string[];
}

/**
 * Carrega recomendações persistidas do Supabase
 * Prioriza recommendations_v2, depois recommendations
 */
export function loadRecommendationsFromSupabase(
  consultant: Consultant,
  reports: ConsultantReport[]
): IntelligentAnalysis {
  try {
    // 1️⃣ Tentar carregar do relatório mais recente
    if (reports && reports.length > 0) {
      const latestReport = reports[0]; // Já vem ordenado por data

      // Priorizar recommendations_v2
      if ((latestReport as any).recommendations_v2) {
        const parsed = typeof (latestReport as any).recommendations_v2 === 'string'
          ? JSON.parse((latestReport as any).recommendations_v2)
          : (latestReport as any).recommendations_v2;

        if (parsed && parsed.resumo && Array.isArray(parsed.recomendacoes)) {
          console.log(`✅ Recomendações carregadas de recommendations_v2 para ${consultant.nome_consultores}`);
          return parsed as IntelligentAnalysis;
        }
      }

      // Fallback para recommendations
      if (latestReport.recommendations) {
        const parsed = typeof latestReport.recommendations === 'string'
          ? JSON.parse(latestReport.recommendations as unknown as string)
          : latestReport.recommendations;

        if (parsed && (parsed as any).resumo && Array.isArray((parsed as any).recomendacoes)) {
          console.log(`✅ Recomendações carregadas de recommendations para ${consultant.nome_consultores}`);
          return parsed as IntelligentAnalysis;
        }
      }
    }

    // 2️⃣ Se não encontrou, gerar recomendações baseadas no score
    console.log(`⚠️ Nenhuma recomendação persistida encontrada para ${consultant.nome_consultores}, usando fallback`);
    return generateFallbackRecommendations(consultant.parecer_final_consultor || 3);
  } catch (error) {
    console.error(`❌ Erro ao carregar recomendações do Supabase:`, error);
    return generateFallbackRecommendations(consultant.parecer_final_consultor || 3);
  }
}

/**
 * Gera recomendações fallback baseadas no score de risco
 */
function generateFallbackRecommendations(score: number): IntelligentAnalysis {
  const scoreLabel = {
    1: 'EXCELENTE',
    2: 'BOM',
    3: 'MÉDIO',
    4: 'ALTO',
    5: 'CRÍTICO'
  }[score] || 'INDEFINIDO';

  const recommendations: Record<number, IntelligentAnalysis> = {
    1: {
      resumo: 'Consultor com desempenho excepcional. Recomenda-se reconhecimento e consideração para posições de liderança.',
      recomendacoes: [
        {
          tipo: 'RECONHECIMENTO',
          descricao: 'Reconhecer publicamente o desempenho excepcional do consultor',
          prazo: 'Imediato',
          responsavel: 'Gestor'
        },
        {
          tipo: 'DESENVOLVIMENTO',
          descricao: 'Explorar oportunidades de crescimento e desenvolvimento de carreira',
          prazo: '2 semanas',
          responsavel: 'RH'
        },
        {
          tipo: 'DESENVOLVIMENTO',
          descricao: 'Considerar para posições de mentoria e liderança',
          prazo: '1 mês',
          responsavel: 'RH'
        },
        {
          tipo: 'RECONHECIMENTO',
          descricao: 'Incluir em programa de retenção de talentos',
          prazo: '1 mês',
          responsavel: 'Gestor'
        }
      ]
    },
    2: {
      resumo: 'Consultor com bom desempenho. Manter acompanhamento regular e explorar oportunidades de desenvolvimento.',
      recomendacoes: [
        {
          tipo: 'DESENVOLVIMENTO',
          descricao: 'Identificar áreas de melhoria e oferecer treinamento específico',
          prazo: '2 semanas',
          responsavel: 'Gestor'
        },
        {
          tipo: 'OBSERVAÇÃO',
          descricao: 'Monitorar desempenho mensalmente',
          prazo: 'Mensal',
          responsavel: 'Gestor'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Oferecer recursos adicionais se necessário',
          prazo: 'Sob demanda',
          responsavel: 'RH'
        },
        {
          tipo: 'DESENVOLVIMENTO',
          descricao: 'Planejar desenvolvimento de carreira',
          prazo: '1 mês',
          responsavel: 'RH'
        }
      ]
    },
    3: {
      resumo: 'Consultor com desempenho moderado. Recomenda-se acompanhamento mais próximo e plano de desenvolvimento.',
      recomendacoes: [
        {
          tipo: 'PREVENTIVO',
          descricao: 'Implementar plano de desenvolvimento estruturado',
          prazo: '1 semana',
          responsavel: 'Gestor'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Oferecer mentoria ou coaching especializado',
          prazo: '2 semanas',
          responsavel: 'RH'
        },
        {
          tipo: 'OBSERVAÇÃO',
          descricao: 'Acompanhamento quinzenal do progresso',
          prazo: 'Quinzenal',
          responsavel: 'Gestor'
        },
        {
          tipo: 'FEEDBACK',
          descricao: 'Realizar feedback estruturado sobre áreas de melhoria',
          prazo: '1 semana',
          responsavel: 'Gestor'
        }
      ]
    },
    4: {
      resumo: 'Consultor com desempenho alto risco. Ação imediata necessária com acompanhamento intensivo.',
      recomendacoes: [
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Reunião urgente com gestor para discussão de situação',
          prazo: '48 horas',
          responsavel: 'Gestor'
        },
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Criar plano de ação com metas claras e prazos',
          prazo: '3 dias',
          responsavel: 'Gestor'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Alocação de recursos de RH para suporte intensivo',
          prazo: 'Imediato',
          responsavel: 'RH'
        },
        {
          tipo: 'OBSERVAÇÃO',
          descricao: 'Acompanhamento semanal do progresso',
          prazo: 'Semanal',
          responsavel: 'Gestor'
        }
      ]
    },
    5: {
      resumo: 'Consultor em situação crítica. Ação imediata e intervenção urgente necessárias.',
      recomendacoes: [
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Reunião emergencial com gestor, RH e coordenador',
          prazo: '24 horas',
          responsavel: 'RH'
        },
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Avaliar continuidade do contrato e condições',
          prazo: '48 horas',
          responsavel: 'RH'
        },
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Implementar plano de recuperação ou desligamento',
          prazo: '3 dias',
          responsavel: 'Gestor'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Acompanhamento diário até resolução',
          prazo: 'Diário',
          responsavel: 'Gestor'
        }
      ]
    }
  };

  return recommendations[score] || recommendations[3];
}
