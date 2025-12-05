import type { Type, Schema } from "@google/genai";
import { RiskFactor } from '../src/components/types';
import { AI_MODEL_NAME } from '../constants';

// Import dinâmico para evitar erro de build
let GoogleGenAI: any;
let ai: any;

async function initializeAI() {
  if (!GoogleGenAI) {
    const module = await import('@google/genai');
    GoogleGenAI = module.GoogleGenAI;
    const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
    
    if (!apiKey) {
      console.warn("API Key is missing for RAISA Service.");
    }
    
    ai = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return ai;
}

export const analyzeCandidate = async (curriculoTexto: string): Promise<RiskFactor[]> => {
  const model = AI_MODEL_NAME;

  const prompt = `
    Você é um especialista em análise de risco de candidatos para recrutamento em TI.
    Analise o currículo abaixo e identifique FATORES DE RISCO que podem indicar problemas futuros (Job Hopping, Gaps, Skills desatualizadas, etc.).
    
    CURRÍCULO:
    ${curriculoTexto}
    
    Retorne um JSON Array com fatores de risco.
  `;

  const schema: Schema = {
      type: Type.ARRAY,
      items: {
          type: Type.OBJECT,
          properties: {
            risk_type: { type: Type.STRING },
            risk_level: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            detected_pattern: { type: Type.STRING },
            evidence: { type: Type.STRING },
            ai_confidence: { type: Type.NUMBER },
          },
          required: ["risk_type", "risk_level", "detected_pattern", "evidence", "ai_confidence"]
      }
  };

  try {
    const aiInstance = await initializeAI();
    const response = await aiInstance.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(text || '[]');
  } catch (error) {
    console.error('Erro na análise RAISA:', error);
    return [];
  }
};
