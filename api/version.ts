/**
 * Arquivo de versionamento do RMS-RAISA
 * Atualizado em: 2025-12-18
 */

export const APP_VERSION = '1.0.50';
export const API_VERSION = 'v50';
export const AI_MODEL = 'gemini-2.5-flash';

export const CHANGELOG = {
  '1.0.50': {
    date: '2025-12-18',
    changes: [
      'Corrigida escala de risco (1=Excelente, 5=Crítico)',
      'Prompt aprimorado com critérios detalhados de classificação',
      'Adicionada detecção de sinais críticos: assédio, conflitos, descontentamento',
      'Adicionadas palavras-chave de alerta para classificação automática',
      'Regra de ouro: na dúvida, classificar com risco maior'
    ]
  },
  '1.0.49': {
    date: '2025-12-18',
    changes: [
      'Corrigido FUNCTION_INVOCATION_FAILED no Vercel',
      'Removidos imports problemáticos de Type/Schema',
      'Seguindo padrão do gemini-analyze.ts'
    ]
  },
  '1.0.48': {
    date: '2025-12-18',
    changes: [
      'Corrigido modelo Gemini (gemini-3-flash-preview -> gemini-2.5-flash)'
    ]
  }
};

export const FEATURES_TRACE = {
  aiModel: AI_MODEL,
  riskScoreScale: {
    1: 'Excelente - Consultor altamente satisfeito, engajado, produtivo',
    2: 'Bom - Consultor satisfeito, pequenos ajustes operacionais',
    3: 'Médio - Problemas operacionais menores, necessita acompanhamento',
    4: 'Alto - Problemas comportamentais, conflitos, insatisfação',
    5: 'Crítico - Risco iminente de saída, assédio, conflitos graves'
  },
  criticalKeywords: [
    'assédio', 'rescisão', 'demissão', 'processo', 'advogado',
    'grosseiro', 'mal-educado', 'debochado', 'ofendido', 'grave', 'preocupante',
    'descontente', 'insatisfeito', 'desmotivado', 'conflito'
  ]
};
