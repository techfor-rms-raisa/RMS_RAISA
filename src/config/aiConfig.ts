/**
 * CONFIGURAÇÃO DE FUNCIONALIDADES DE IA
 * 
 * Este arquivo controla quais funcionalidades de IA estão ativas.
 * Permite ativar/desativar gradualmente conforme acumula histórico.
 */

/// <reference types="vite/client" />

export interface AIConfig {
  // Questões Inteligentes
  ENABLE_AI_QUESTIONS: boolean;
  MIN_QUESTIONS_HISTORY: number;

  // Recomendação de Candidato
  ENABLE_AI_CANDIDATE_RECOMMENDATION: boolean;
  MIN_INTERVIEWS_FOR_RECOMMENDATION: number;

  // Red Flags Automáticos
  ENABLE_AI_RED_FLAGS: boolean;

  // Análise de Reprovações
  ENABLE_AI_REJECTION_ANALYSIS: boolean;
  MIN_REJECTIONS_FOR_ANALYSIS: number;

  // Predição de Riscos
  ENABLE_AI_RISK_PREDICTION: boolean;
  MIN_APPLICATIONS_FOR_PREDICTION: number;

  // Melhoria de Questões
  ENABLE_AI_QUESTION_IMPROVEMENT: boolean;
  MIN_APPLICATIONS_FOR_IMPROVEMENT: number;

  // Repriorização Automática
  ENABLE_AI_AUTO_REPRIORITIZATION: boolean;

  // E-mails Automáticos
  ENABLE_EMAIL_NOTIFICATIONS: boolean;
}

/**
 * CONFIGURAÇÃO PADRÃO
 * 
 * FASE 1 (Dia 1-30): Apenas funcionalidades que não dependem de histórico
 * - Questões: SIM (usa apenas descrição da vaga)
 * - Recomendação: SIM (análise básica funciona)
 * - Red Flags: SIM (padrões gerais)
 * - Análise de Reprovações: NÃO (precisa de dados)
 * - Predição de Riscos: NÃO (precisa de dados)
 * - Melhoria de Questões: NÃO (precisa de dados)
 * - Repriorização: SIM (usa dados em tempo real)
 */
const defaultConfig: AIConfig = {
  // ✅ ATIVO desde o início (não depende de histórico)
  ENABLE_AI_QUESTIONS: true,
  MIN_QUESTIONS_HISTORY: 0,

  // ✅ ATIVO desde o início (análise básica funciona)
  ENABLE_AI_CANDIDATE_RECOMMENDATION: true,
  MIN_INTERVIEWS_FOR_RECOMMENDATION: 0,

  // ✅ ATIVO desde o início (padrões gerais)
  ENABLE_AI_RED_FLAGS: true,

  // ❌ INATIVO por padrão (precisa de 15+ reprovações)
  ENABLE_AI_REJECTION_ANALYSIS: false,
  MIN_REJECTIONS_FOR_ANALYSIS: 15,

  // ❌ INATIVO por padrão (precisa de 30+ candidaturas)
  ENABLE_AI_RISK_PREDICTION: false,
  MIN_APPLICATIONS_FOR_PREDICTION: 30,

  // ❌ INATIVO por padrão (precisa de 20+ candidaturas)
  ENABLE_AI_QUESTION_IMPROVEMENT: false,
  MIN_APPLICATIONS_FOR_IMPROVEMENT: 20,

  // ✅ ATIVO desde o início (usa dados em tempo real)
  ENABLE_AI_AUTO_REPRIORITIZATION: true,

  // ❌ INATIVO por padrão (configurar SMTP primeiro)
  ENABLE_EMAIL_NOTIFICATIONS: false
};

/**
 * Carrega configuração do ambiente ou usa padrão
 */
function loadConfig(): AIConfig {
  if (typeof window === 'undefined') {
    // Node.js (server-side)
    return {
      ENABLE_AI_QUESTIONS: process.env.ENABLE_AI_QUESTIONS === 'true' || defaultConfig.ENABLE_AI_QUESTIONS,
      MIN_QUESTIONS_HISTORY: parseInt(process.env.MIN_QUESTIONS_HISTORY || String(defaultConfig.MIN_QUESTIONS_HISTORY)),

      ENABLE_AI_CANDIDATE_RECOMMENDATION: process.env.ENABLE_AI_CANDIDATE_RECOMMENDATION === 'true' || defaultConfig.ENABLE_AI_CANDIDATE_RECOMMENDATION,
      MIN_INTERVIEWS_FOR_RECOMMENDATION: parseInt(process.env.MIN_INTERVIEWS_FOR_RECOMMENDATION || String(defaultConfig.MIN_INTERVIEWS_FOR_RECOMMENDATION)),

      ENABLE_AI_RED_FLAGS: process.env.ENABLE_AI_RED_FLAGS === 'true' || defaultConfig.ENABLE_AI_RED_FLAGS,

      ENABLE_AI_REJECTION_ANALYSIS: process.env.ENABLE_AI_REJECTION_ANALYSIS === 'true' || defaultConfig.ENABLE_AI_REJECTION_ANALYSIS,
      MIN_REJECTIONS_FOR_ANALYSIS: parseInt(process.env.MIN_REJECTIONS_FOR_ANALYSIS || String(defaultConfig.MIN_REJECTIONS_FOR_ANALYSIS)),

      ENABLE_AI_RISK_PREDICTION: process.env.ENABLE_AI_RISK_PREDICTION === 'true' || defaultConfig.ENABLE_AI_RISK_PREDICTION,
      MIN_APPLICATIONS_FOR_PREDICTION: parseInt(process.env.MIN_APPLICATIONS_FOR_PREDICTION || String(defaultConfig.MIN_APPLICATIONS_FOR_PREDICTION)),

      ENABLE_AI_QUESTION_IMPROVEMENT: process.env.ENABLE_AI_QUESTION_IMPROVEMENT === 'true' || defaultConfig.ENABLE_AI_QUESTION_IMPROVEMENT,
      MIN_APPLICATIONS_FOR_IMPROVEMENT: parseInt(process.env.MIN_APPLICATIONS_FOR_IMPROVEMENT || String(defaultConfig.MIN_APPLICATIONS_FOR_IMPROVEMENT)),

      ENABLE_AI_AUTO_REPRIORITIZATION: process.env.ENABLE_AI_AUTO_REPRIORITIZATION === 'true' || defaultConfig.ENABLE_AI_AUTO_REPRIORITIZATION,

      ENABLE_EMAIL_NOTIFICATIONS: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true' || defaultConfig.ENABLE_EMAIL_NOTIFICATIONS
    };
  } else {
    // Browser (client-side) - usa variáveis VITE_
    return {
      ENABLE_AI_QUESTIONS: import.meta.env.VITE_ENABLE_AI_QUESTIONS === 'true' || defaultConfig.ENABLE_AI_QUESTIONS,
      MIN_QUESTIONS_HISTORY: parseInt(import.meta.env.VITE_MIN_QUESTIONS_HISTORY || String(defaultConfig.MIN_QUESTIONS_HISTORY)),

      ENABLE_AI_CANDIDATE_RECOMMENDATION: import.meta.env.VITE_ENABLE_AI_CANDIDATE_RECOMMENDATION === 'true' || defaultConfig.ENABLE_AI_CANDIDATE_RECOMMENDATION,
      MIN_INTERVIEWS_FOR_RECOMMENDATION: parseInt(import.meta.env.VITE_MIN_INTERVIEWS_FOR_RECOMMENDATION || String(defaultConfig.MIN_INTERVIEWS_FOR_RECOMMENDATION)),

      ENABLE_AI_RED_FLAGS: import.meta.env.VITE_ENABLE_AI_RED_FLAGS === 'true' || defaultConfig.ENABLE_AI_RED_FLAGS,

      ENABLE_AI_REJECTION_ANALYSIS: import.meta.env.VITE_ENABLE_AI_REJECTION_ANALYSIS === 'true' || defaultConfig.ENABLE_AI_REJECTION_ANALYSIS,
      MIN_REJECTIONS_FOR_ANALYSIS: parseInt(import.meta.env.VITE_MIN_REJECTIONS_FOR_ANALYSIS || String(defaultConfig.MIN_REJECTIONS_FOR_ANALYSIS)),

      ENABLE_AI_RISK_PREDICTION: import.meta.env.VITE_ENABLE_AI_RISK_PREDICTION === 'true' || defaultConfig.ENABLE_AI_RISK_PREDICTION,
      MIN_APPLICATIONS_FOR_PREDICTION: parseInt(import.meta.env.VITE_MIN_APPLICATIONS_FOR_PREDICTION || String(defaultConfig.MIN_APPLICATIONS_FOR_PREDICTION)),

      ENABLE_AI_QUESTION_IMPROVEMENT: import.meta.env.VITE_ENABLE_AI_QUESTION_IMPROVEMENT === 'true' || defaultConfig.ENABLE_AI_QUESTION_IMPROVEMENT,
      MIN_APPLICATIONS_FOR_IMPROVEMENT: parseInt(import.meta.env.VITE_MIN_APPLICATIONS_FOR_IMPROVEMENT || String(defaultConfig.MIN_APPLICATIONS_FOR_IMPROVEMENT)),

      ENABLE_AI_AUTO_REPRIORITIZATION: import.meta.env.VITE_ENABLE_AI_AUTO_REPRIORITIZATION === 'true' || defaultConfig.ENABLE_AI_AUTO_REPRIORITIZATION,

      ENABLE_EMAIL_NOTIFICATIONS: import.meta.env.VITE_ENABLE_EMAIL_NOTIFICATIONS === 'true' || defaultConfig.ENABLE_EMAIL_NOTIFICATIONS
    };
  }
}

/**
 * Configuração global de IA
 */
export const aiConfig: AIConfig = loadConfig();

/**
 * Verifica se há dados suficientes para executar uma funcionalidade
 */
export async function checkDataSufficiency(feature: keyof AIConfig): Promise<{
  enabled: boolean;
  hasEnoughData: boolean;
  currentCount: number;
  requiredCount: number;
  message: string;
}> {
  const { supabase } = await import('../config/supabase');

  switch (feature) {
    case 'ENABLE_AI_REJECTION_ANALYSIS': {
      const { count } = await supabase
        .from('candidaturas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejeitado')
        .not('feedback_cliente', 'is', null);

      const currentCount = count || 0;
      const requiredCount = aiConfig.MIN_REJECTIONS_FOR_ANALYSIS;
      const hasEnoughData = currentCount >= requiredCount;

      return {
        enabled: aiConfig.ENABLE_AI_REJECTION_ANALYSIS,
        hasEnoughData,
        currentCount,
        requiredCount,
        message: hasEnoughData
          ? `✅ Dados suficientes (${currentCount}/${requiredCount})`
          : `⏳ Acumulando dados (${currentCount}/${requiredCount})`
      };
    }

    case 'ENABLE_AI_RISK_PREDICTION': {
      const { count } = await supabase
        .from('candidaturas')
        .select('*', { count: 'exact', head: true })
        .in('status', ['aprovado', 'rejeitado']);

      const currentCount = count || 0;
      const requiredCount = aiConfig.MIN_APPLICATIONS_FOR_PREDICTION;
      const hasEnoughData = currentCount >= requiredCount;

      return {
        enabled: aiConfig.ENABLE_AI_RISK_PREDICTION,
        hasEnoughData,
        currentCount,
        requiredCount,
        message: hasEnoughData
          ? `✅ Dados suficientes (${currentCount}/${requiredCount})`
          : `⏳ Acumulando dados (${currentCount}/${requiredCount})`
      };
    }

    case 'ENABLE_AI_QUESTION_IMPROVEMENT': {
      const { count } = await supabase
        .from('candidato_respostas_questoes')
        .select('candidatura_id', { count: 'exact', head: true });

      const currentCount = count || 0;
      const requiredCount = aiConfig.MIN_APPLICATIONS_FOR_IMPROVEMENT;
      const hasEnoughData = currentCount >= requiredCount;

      return {
        enabled: aiConfig.ENABLE_AI_QUESTION_IMPROVEMENT,
        hasEnoughData,
        currentCount,
        requiredCount,
        message: hasEnoughData
          ? `✅ Dados suficientes (${currentCount}/${requiredCount})`
          : `⏳ Acumulando dados (${currentCount}/${requiredCount})`
      };
    }

    default:
      return {
        enabled: true,
        hasEnoughData: true,
        currentCount: 0,
        requiredCount: 0,
        message: '✅ Sempre disponível'
      };
  }
}

/**
 * Retorna status de todas as funcionalidades
 */
export async function getAIFeaturesStatus() {
  const [rejectionAnalysis, riskPrediction, questionImprovement] = await Promise.all([
    checkDataSufficiency('ENABLE_AI_REJECTION_ANALYSIS'),
    checkDataSufficiency('ENABLE_AI_RISK_PREDICTION'),
    checkDataSufficiency('ENABLE_AI_QUESTION_IMPROVEMENT')
  ]);

  return {
    questions: {
      name: 'Questões Inteligentes',
      enabled: aiConfig.ENABLE_AI_QUESTIONS,
      status: aiConfig.ENABLE_AI_QUESTIONS ? 'active' : 'inactive',
      message: '✅ Sempre disponível'
    },
    candidateRecommendation: {
      name: 'Recomendação de Candidato',
      enabled: aiConfig.ENABLE_AI_CANDIDATE_RECOMMENDATION,
      status: aiConfig.ENABLE_AI_CANDIDATE_RECOMMENDATION ? 'active' : 'inactive',
      message: '✅ Sempre disponível'
    },
    redFlags: {
      name: 'Red Flags Automáticos',
      enabled: aiConfig.ENABLE_AI_RED_FLAGS,
      status: aiConfig.ENABLE_AI_RED_FLAGS ? 'active' : 'inactive',
      message: '✅ Sempre disponível'
    },
    rejectionAnalysis: {
      name: 'Análise de Reprovações',
      enabled: rejectionAnalysis.enabled,
      status: rejectionAnalysis.enabled && rejectionAnalysis.hasEnoughData ? 'active' : 
              rejectionAnalysis.enabled && !rejectionAnalysis.hasEnoughData ? 'waiting' : 'inactive',
      ...rejectionAnalysis
    },
    riskPrediction: {
      name: 'Predição de Riscos',
      enabled: riskPrediction.enabled,
      status: riskPrediction.enabled && riskPrediction.hasEnoughData ? 'active' : 
              riskPrediction.enabled && !riskPrediction.hasEnoughData ? 'waiting' : 'inactive',
      ...riskPrediction
    },
    questionImprovement: {
      name: 'Melhoria de Questões',
      enabled: questionImprovement.enabled,
      status: questionImprovement.enabled && questionImprovement.hasEnoughData ? 'active' : 
              questionImprovement.enabled && !questionImprovement.hasEnoughData ? 'waiting' : 'inactive',
      ...questionImprovement
    },
    autoReprioritization: {
      name: 'Repriorização Automática',
      enabled: aiConfig.ENABLE_AI_AUTO_REPRIORITIZATION,
      status: aiConfig.ENABLE_AI_AUTO_REPRIORITIZATION ? 'active' : 'inactive',
      message: '✅ Sempre disponível'
    }
  };
}

/**
 * Exporta configuração padrão para referência
 */
export { defaultConfig };
