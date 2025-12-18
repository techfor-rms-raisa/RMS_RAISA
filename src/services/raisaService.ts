import { GoogleGenAI } from "@google/genai";
import { RiskFactor } from '../components/types';
import { AI_MODEL_NAME } from '../constants';

// Usar API_KEY (configurada no Vercel)
const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) ||
               import.meta.env?.API_KEY ||
               "";

if (!apiKey) {
    console.warn("API Key is missing for RAISA Service.");
}

const ai = new GoogleGenAI({ apiKey });

export const analyzeCandidate = async (curriculoTexto: string): Promise<RiskFactor[]> => {
  const prompt = `
    Você é um especialista em análise de risco de candidatos para recrutamento em TI.
    Analise o currículo abaixo e identifique FATORES DE RISCO que podem indicar problemas futuros (Job Hopping, Gaps, Skills desatualizadas, etc.).
    
    CURRÍCULO:
    ${curriculoTexto}
    
    Retorne um JSON Array com fatores de risco.
  `;

  try {
    const result = await ai.models.generateContent({ model: AI_MODEL_NAME, contents: prompt });

    const text = (result.text || '').replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(text || '[]');
  } catch (error) {
    console.error('Erro na análise RAISA:', error);
    return [];
  }
};
