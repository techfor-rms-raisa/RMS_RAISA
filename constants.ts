import { RiskScore } from './components/types';

// ========================================
// ESCALA DE RISCO: 5 NÍVEIS
// ========================================
// 1 = Excelente (Verde)
// 2 = Bom (Azul)
// 3 = Médio (Amarelo)
// 4 = Alto (Laranja)
// 5 = Crítico (Vermelho)
// ========================================

export const RISK_COLORS: { [key in RiskScore | 0]: string } = {
  1: 'bg-green-500',   // 🟢 Verde #34A853 - Excelente
  2: 'bg-blue-500',    // 🔵 Azul #4285F4 - Bom
  3: 'bg-yellow-500',  // 🟡 Amarelo #FBBC05 - Médio
  4: 'bg-orange-600',  // 🟠 Laranja #FF6D00 - Alto
  5: 'bg-red-500',     // 🔴 Vermelho #EA4335 - Crítico
  0: 'bg-gray-200',    // Cinza (não usado, compatibilidade)
};

export const RISK_MEANING: { [key in RiskScore]: string } = {
  1: 'Excelente - Performance excepcional',
  2: 'Bom - Performance satisfatória',
  3: 'Médio - Pontos de atenção',
  4: 'Alto - Problemas significativos',
  5: 'Crítico - Situação grave',
};

export const RISK_LABELS: { [key in RiskScore]: string } = {
  1: 'Excelente',
  2: 'Bom',
  3: 'Médio',
  4: 'Alto',
  5: 'Crítico',
};

// --- APP IDENTITY & CONFIGURATION ---
export const APP_TITLE = "ORBIT.ai";
export const APP_SUBTITLE = "AI-Powered Talent Management";
export const APP_VERSION = "V2.0";
// Variable AI Model
export const AI_MODEL_NAME = "gemini-2.5-flash"; 

// export const LOGO_BASE64 = 'data:image/png;base64,...'; // Removido para corrigir ERR_INVALID_URL

