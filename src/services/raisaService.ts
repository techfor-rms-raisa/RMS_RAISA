import { GoogleGenerativeAI } from "@google/generative-ai";
import { RiskFactor } from '../components/types';
import { AI_MODEL_NAME } from '../constants';

// Access API Key - supporting both Backend (Vercel) and Frontend (Vite)
const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
               import.meta.env?.VITE_GEMINI_API_KEY ||
               import.meta.env?.VITE_API_KEY ||
               "";

if (!apiKey) {
    console.warn("API Key is missing for RAISA Service.");
}

const ai = new GoogleGenerativeAI(apiKey);

export const analyzeCandidate = async (curriculoTexto: string): Promise<RiskFactor[]> => {
  const model = AI_MODEL_NAME;

  const prompt = `
    Você é um especialista em análise de risco de candidatos para recrutamento em TI.
    Analise o currículo abaixo e identifique FATORES DE RISCO que podem indicar problemas futuros (Job Hopping, Gaps, Skills desatualizadas, etc.).
    
    CURRÍCULO:
    ${curriculoTexto}
    
    Retorne um JSON Array com fatores de risco.
  `;

    // Schema removed - not supported by @google/generative-ai

  try {
    const result = await ai.getGenerativeModel({ model: AI_MODEL_NAME }).generateContent(prompt);

    const response = await result.response;

    const text = response.text().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(text || '[]');
  } catch (error) {
    console.error('Erro na análise RAISA:', error);
    return [];
  }
};
