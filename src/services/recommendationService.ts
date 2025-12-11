import { GoogleGenerativeAI } from '@google/generative-ai';
import { Consultant, ConsultantReport, UsuarioCliente, Client } from './types';

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export interface IntelligentRecommendation {
  tipo: 'AÇÃO IMEDIATA' | 'PREVENTIVO' | 'DESENVOLVIMENTO' | 'RECONHECIMENTO' | 'SUPORTE' | 'OBSERVAÇÃO';
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
 * Gera recomendações inteligentes usando Gemini 2.5 Flash
 * com dados específicos do consultor
 */
export async function generateIntelligentRecommendations(
  consultant: Consultant,
  reports: ConsultantReport[],
  manager: UsuarioCliente | undefined,
  client: Client | undefined
): Promise<IntelligentAnalysis> {
  try {
    // Validar dados de entrada
    if (!consultant || !reports || reports.length === 0) {
      return getFallbackRecommendations(consultant.parecer_final_consultor || 3);
    }

    // Preparar dados para o prompt
    const reportsText = reports
      .slice(0, 3)
      .map((r, idx) => {
        const monthNames = [
          'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return `
Relatório ${idx + 1} (${monthNames[r.month - 1]} ${r.year}):
- Score de Risco: ${r.riskScore} (1=Excelente, 5=Crítico)
- Resumo: ${r.summary || 'N/A'}
- Padrão Negativo: ${r.negativePattern || 'Nenhum identificado'}
- Alerta Preditivo: ${r.predictiveAlert || 'Nenhum'}
- Conteúdo: ${r.content || 'N/A'}`;
      })
      .join('\n');

    // Analisar tendência de scores
    const scoresTrend = reports.slice(0, 3).map(r => r.riskScore);
    let tendencia = 'Estável';
    if (scoresTrend.length >= 2) {
      if (scoresTrend[0] > scoresTrend[scoresTrend.length - 1]) {
        tendencia = 'Melhorando';
      } else if (scoresTrend[0] < scoresTrend[scoresTrend.length - 1]) {
        tendencia = 'Piorando';
      }
    }

    // Construir prompt estruturado
    const prompt = `Você é um especialista sênior em gestão de talentos, análise de risco e desenvolvimento organizacional.

DADOS DO CONSULTOR:
- Nome: ${consultant.nome_consultores}
- Cargo: ${consultant.cargo_consultores}
- Cliente: ${client?.razao_social_cliente || 'N/A'}
- Gestor: ${manager?.nome_gestor_cliente || 'N/A'}
- Score de Risco Atual: ${consultant.parecer_final_consultor} (1=Excelente, 5=Crítico)
- Data de Inclusão: ${consultant.data_inclusao_consultores}
- Faturamento: R$ ${consultant.valor_faturamento?.toLocaleString('pt-BR') || 'N/A'}
- Tendência: ${tendencia}

HISTÓRICO DE RELATÓRIOS (últimos 90 dias):
${reportsText}

TAREFA:
Analise a situação deste consultor e gere:

1. Um resumo de análise (2-3 linhas) explicando especificamente a situação atual
   - Deve mencionar dados concretos (scores, padrões, tendência)
   - Deve ser personalizado para este consultor
   - Deve ser profissional e objetivo

2. Exatamente 4 recomendações específicas e acionáveis
   - Cada recomendação DEVE mencionar dados concretos deste consultor
   - Cada recomendação DEVE incluir um prazo específico
   - Cada recomendação DEVE ser acionável (não genérica)
   - Cada recomendação DEVE designar um responsável

ESCALA DE RISCO:
- 1 = Excelente (verde): Performance excepcional
- 2 = Bom (azul): Performance satisfatória
- 3 = Médio (amarelo): Pontos de atenção
- 4 = Alto (laranja): Problemas significativos
- 5 = Crítico (vermelho): Situação grave

TIPOS DE RECOMENDAÇÃO (escolha os mais apropriados):
- AÇÃO IMEDIATA: Para situações críticas (score 4-5)
- PREVENTIVO: Para evitar deterioração (score 3)
- DESENVOLVIMENTO: Para melhorar skills (score 2-3)
- RECONHECIMENTO: Para performance excelente (score 1-2)
- SUPORTE: Para oferecer recursos (score 3-4)
- OBSERVAÇÃO: Para monitorar (score 2-3)

Retorne APENAS um JSON válido, sem explicações adicionais:
{
  "resumo": "string (2-3 linhas, específico para este consultor)",
  "recomendacoes": [
    {
      "tipo": "AÇÃO IMEDIATA|PREVENTIVO|DESENVOLVIMENTO|RECONHECIMENTO|SUPORTE|OBSERVAÇÃO",
      "descricao": "string específica e acionável (mencionar dados concretos)",
      "prazo": "string (ex: 48h, 1 semana, 2 semanas, mensal)",
      "responsavel": "Gestor|RH|Coordenador"
    }
  ],
  "padroes": ["array de padrões identificados"],
  "alertas": ["array de alertas se houver"]
}`;

    // Chamar Gemini
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extrair JSON da resposta
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ Não foi possível extrair JSON da resposta do Gemini');
      return getFallbackRecommendations(consultant.parecer_final_consultor || 3);
    }

    const analysis = JSON.parse(jsonMatch[0]) as IntelligentAnalysis;

    // Validar resposta
    if (!analysis.resumo || !Array.isArray(analysis.recomendacoes) || analysis.recomendacoes.length === 0) {
      console.warn('⚠️ Resposta do Gemini inválida ou incompleta');
      return getFallbackRecommendations(consultant.parecer_final_consultor || 3);
    }

    // Garantir que temos exatamente 4 recomendações
    if (analysis.recomendacoes.length > 4) {
      analysis.recomendacoes = analysis.recomendacoes.slice(0, 4);
    } else if (analysis.recomendacoes.length < 4) {
      // Completar com recomendações padrão se necessário
      const remaining = 4 - analysis.recomendacoes.length;
      for (let i = 0; i < remaining; i++) {
        analysis.recomendacoes.push({
          tipo: 'OBSERVAÇÃO',
          descricao: 'Continuar monitorando o desempenho do consultor',
          prazo: 'Mensal',
          responsavel: 'Gestor'
        });
      }
    }

    return analysis;
  } catch (error) {
    console.error('❌ Erro ao gerar recomendações inteligentes:', error);
    return getFallbackRecommendations(consultant.parecer_final_consultor || 3);
  }
}

/**
 * Recomendações fallback em caso de erro na IA
 */
function getFallbackRecommendations(score: number): IntelligentAnalysis {
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
          tipo: 'SUPORTE',
          descricao: 'Manter nível de suporte e recursos atuais',
          prazo: 'Contínuo',
          responsavel: 'Gestor'
        }
      ]
    },
    2: {
      resumo: 'Consultor com desempenho satisfatório. Manter acompanhamento regular e explorar oportunidades de desenvolvimento.',
      recomendacoes: [
        {
          tipo: 'OBSERVAÇÃO',
          descricao: 'Manter acompanhamento regular do desempenho',
          prazo: 'Mensal',
          responsavel: 'Gestor'
        },
        {
          tipo: 'DESENVOLVIMENTO',
          descricao: 'Oferecer oportunidades de desenvolvimento profissional',
          prazo: '2 semanas',
          responsavel: 'RH'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Disponibilizar recursos de suporte conforme necessário',
          prazo: 'Contínuo',
          responsavel: 'Gestor'
        },
        {
          tipo: 'PREVENTIVO',
          descricao: 'Monitoramento mensal para evitar deterioração',
          prazo: 'Mensal',
          responsavel: 'Gestor'
        }
      ]
    },
    3: {
      resumo: 'Consultor com desempenho moderado. Recomenda-se conversa com gestor e plano de desenvolvimento.',
      recomendacoes: [
        {
          tipo: 'OBSERVAÇÃO',
          descricao: 'Conversa informal com gestor para entender dificuldades',
          prazo: '1 semana',
          responsavel: 'Gestor'
        },
        {
          tipo: 'DESENVOLVIMENTO',
          descricao: 'Oferecer oportunidades de melhoria e desenvolvimento',
          prazo: '2 semanas',
          responsavel: 'RH'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Disponibilizar recursos adicionais conforme necessário',
          prazo: 'Imediato',
          responsavel: 'Gestor'
        },
        {
          tipo: 'PREVENTIVO',
          descricao: 'Monitoramento mensal para evitar piora',
          prazo: 'Mensal',
          responsavel: 'Gestor'
        }
      ]
    },
    4: {
      resumo: 'Consultor com desempenho problemático. Recomenda-se ação imediata com plano de recuperação.',
      recomendacoes: [
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Agendar reunião com gestor para discussão urgente',
          prazo: '48 horas',
          responsavel: 'Gestor'
        },
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Criar plano de recuperação estruturado',
          prazo: '1 semana',
          responsavel: 'RH'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Alocar mentor ou coach especializado',
          prazo: '2 semanas',
          responsavel: 'RH'
        },
        {
          tipo: 'PREVENTIVO',
          descricao: 'Acompanhamento semanal obrigatório',
          prazo: 'Semanal',
          responsavel: 'Gestor'
        }
      ]
    },
    5: {
      resumo: 'Consultor em situação crítica. Recomenda-se ação urgente e escalação para RH.',
      recomendacoes: [
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Reunião urgente com gestor, RH e coordenador',
          prazo: '24 horas',
          responsavel: 'RH'
        },
        {
          tipo: 'AÇÃO IMEDIATA',
          descricao: 'Criar plano de ação de recuperação em 48 horas',
          prazo: '48 horas',
          responsavel: 'RH'
        },
        {
          tipo: 'SUPORTE',
          descricao: 'Coaching intensivo e suporte estruturado',
          prazo: 'Imediato',
          responsavel: 'RH'
        },
        {
          tipo: 'PREVENTIVO',
          descricao: 'Acompanhamento diário obrigatório',
          prazo: 'Diário',
          responsavel: 'Gestor'
        }
      ]
    }
  };

  return recommendations[score] || recommendations[3];
}

/**
 * Analisa padrões nos últimos 90 dias
 */
export function analyzePatterns(reports: ConsultantReport[]): {
  tendencia: 'Melhorando' | 'Piorando' | 'Estável';
  padroes: string[];
  alertas: string[];
} {
  const tendencia: 'Melhorando' | 'Piorando' | 'Estável' = 'Estável';
  const padroes: string[] = [];
  const alertas: string[] = [];

  if (reports.length === 0) {
    return { tendencia, padroes, alertas };
  }

  // Analisar tendência de scores
  const scores = reports.slice(0, 3).map(r => r.riskScore);
  if (scores.length >= 2) {
    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    if (firstScore > lastScore) {
      return {
        tendencia: 'Melhorando',
        padroes: [`Score melhorou de ${firstScore} para ${lastScore}`],
        alertas: []
      };
    } else if (firstScore < lastScore) {
      return {
        tendencia: 'Piorando',
        padroes: [`Score piorou de ${firstScore} para ${lastScore}`],
        alertas: [`⚠️ Tendência de piora identificada`]
      };
    }
  }

  // Analisar padrões negativos
  reports.forEach(r => {
    if (r.negativePattern) {
      padroes.push(r.negativePattern);
    }
    if (r.predictiveAlert) {
      alertas.push(r.predictiveAlert);
    }
  });

  // Verificar frequência de scores altos
  const highScoreCount = scores.filter(s => s >= 4).length;
  if (highScoreCount > 0) {
    alertas.push(`⚠️ ${highScoreCount} relatório(s) com score crítico/alto nos últimos 90 dias`);
  }

  return { tendencia, padroes, alertas };
}
