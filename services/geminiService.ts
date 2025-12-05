/**
 * GEMINI SERVICE - FRONTEND CLIENT
 * 
 * Este serviço chama a API backend (/api/gemini-analyze) ao invés de chamar Gemini diretamente.
 * Isso mantém a API key segura no servidor.
 */

import { AIAnalysisResult, RiskScore, Recommendation, BehavioralFlag } from '../src/components/types';

// URL da API backend (Vercel)
const API_BASE_URL = '/api/gemini-analyze';

/**
 * Função auxiliar para chamar a API backend
 */
async function callBackendAPI(action: string, payload: any): Promise<any> {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Unknown error from backend');
    }

    return result.data;
  } catch (error: any) {
    console.error(`[geminiService] Erro ao chamar backend (${action}):`, error);
    throw error;
  }
}

// ========================================
// STEP 1: BEHAVIORAL FLAG EXTRACTION
// ========================================

export async function extractBehavioralFlags(reportText: string): Promise<Omit<BehavioralFlag, 'id' | 'consultantId'>[]> {
  try {
    console.log('🔍 Extraindo flags comportamentais via API backend...');
    
    const result = await callBackendAPI('extractBehavioralFlags', { reportText });
    
    if (result && result.flags && Array.isArray(result.flags)) {
      // Converter formato da API para formato esperado
      return result.flags.map((flag: any) => ({
        flagType: flag.type,
        description: flag.description,
        flagDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      }));
    }
    
    return [];
  } catch (error) {
    console.error('❌ Erro ao extrair flags:', error);
    return [];
  }
}

// ========================================
// STEP 2: FULL REPORT ANALYSIS
// ========================================

export async function analyzeReport(
  consultantName: string,
  reportText: string,
  month: number,
  year: number
): Promise<AIAnalysisResult> {
  try {
    console.log(`🔍 Analisando relatório de ${consultantName} via API backend...`);
    
    const result = await callBackendAPI('analyzeReport', {
      reportText,
      consultantName,
    });

    // Converter resultado da API para AIAnalysisResult
    const analysis: AIAnalysisResult = {
      consultantName: consultantName,
      clientName: extractClientName(reportText) || 'Não informado',
      month: month,
      year: year,
      riskScore: result.riskScore as RiskScore,
      summary: result.summary || 'Análise não disponível',
      negativePattern: result.negativePattern || 'Nenhum',
      predictiveAlert: result.predictiveAlert || 'Nenhum',
      recommendations: result.recommendations || [],
      behavioralFlags: [], // Será preenchido separadamente se necessário
    };

    console.log(`✅ Análise concluída: ${consultantName} - Risco ${analysis.riskScore}`);
    
    return analysis;
  } catch (error: any) {
    console.error(`❌ Erro ao analisar relatório de ${consultantName}:`, error);
    
    // Retornar análise padrão em caso de erro
    return {
      consultantName: consultantName,
      clientName: 'Não informado',
      month: month,
      year: year,
      riskScore: 3 as RiskScore,
      summary: `Erro ao analisar: ${error.message}`,
      negativePattern: 'Erro na análise',
      predictiveAlert: 'Análise indisponível',
      recommendations: [],
      behavioralFlags: [],
    };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Extrai nome do cliente do texto do relatório
 */
function extractClientName(reportText: string): string | null {
  // Tentar extrair cliente de padrões comuns
  const patterns = [
    /Cliente:\s*([^\n]+)/i,
    /Empresa:\s*([^\n]+)/i,
    /\|\s*([A-Z][a-zA-Z\s&]+)\s*$/m, // Padrão: Nome | Cliente
  ];

  for (const pattern of patterns) {
    const match = reportText.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

// ========================================
// ANÁLISE COMPLETA (WRAPPER)
// ========================================

/**
 * Analisa relatório completo: extrai flags + faz análise de risco
 */
export async function analyzeFullReport(
  consultantName: string,
  reportText: string,
  month: number,
  year: number
): Promise<AIAnalysisResult> {
  try {
    // 1. Extrair flags comportamentais
    const flags = await extractBehavioralFlags(reportText);
    
    // 2. Fazer análise de risco
    const analysis = await analyzeReport(consultantName, reportText, month, year);
    
    // 3. Combinar resultados
    analysis.behavioralFlags = flags;
    
    return analysis;
  } catch (error: any) {
    console.error('❌ Erro na análise completa:', error);
    throw error;
  }
}

// ========================================
// EXPORT DEFAULT
// ========================================

export default {
  extractBehavioralFlags,
  analyzeReport,
  analyzeFullReport,
};
