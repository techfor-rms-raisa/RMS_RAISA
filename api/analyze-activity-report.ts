/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI com Schema estruturado para análise de riscos
 * 
 * v46 - CORRIGIDO: Usando @google/genai com Schema (Google AI Studio)
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";

/**
 * 1. CONFIGURAÇÃO DO CLIENTE
 * Recupera a chave de API das variáveis de ambiente
 */
const getAIClient = () => {
  const apiKey = process.env.VITE_API_KEY || process.env.API_KEY;
  
  console.log('🔍 [REQUEST] Verificando API_KEY...');
  console.log('🔍 [REQUEST] NODE_ENV:', process.env.NODE_ENV);
  console.log('🔍 [REQUEST] VITE_API_KEY presente?', !!process.env.VITE_API_KEY);
  console.log('🔍 [REQUEST] API_KEY presente?', !!process.env.API_KEY);
  console.log('🔍 [REQUEST] apiKey final presente?', !!apiKey);
  
  if (!apiKey) {
    console.error('❌ [REQUEST] API_KEY não configurada!');
    throw new Error("API_KEY não configurada no ambiente.");
  }
  
  console.log('✅ [REQUEST] API_KEY encontrada! Tamanho:', apiKey.length, 'caracteres');
  return new GoogleGenAI({ apiKey });
};

/**
 * 2. DEFINIÇÃO DO SCHEMA (JSON ESTRUTURADO)
 * Diz ao Gemini exatamente quais campos deve retornar
 */
const analysisSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      consultorNome: { type: Type.STRING },
      clienteNome: { type: Type.STRING },
      riscoConfirmado: { type: Type.INTEGER },
      resumoSituacao: { type: Type.STRING },
      padraoNegativoIdentificado: { type: Type.STRING },
      alertaPreditivo: { type: Type.STRING },
      recomendacoes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            tipo: { type: Type.STRING },
            foco: { type: Type.STRING },
            descricao: { type: Type.STRING }
          },
          required: ["tipo", "foco", "descricao"]
        }
      }
    },
    required: ["consultorNome", "clienteNome", "riscoConfirmado", "resumoSituacao", "padraoNegativoIdentificado", "alertaPreditivo", "recomendacoes"]
  }
};

/**
 * 3. FUNÇÃO PRINCIPAL DE ANÁLISE
 */
async function analyzeReportWithAI(reportText: string): Promise<any[]> {
  if (!reportText || reportText.length < 5) {
    console.warn('⚠️ [ANALYSIS] Texto do relatório muito curto ou vazio');
    return [];
  }

  try {
    console.log('🤖 [ANALYSIS] Inicializando cliente Gemini...');
    const ai = getAIClient();
    const model = 'gemini-3-flash-preview';
    
    console.log('📝 [ANALYSIS] Preparando prompt...');
    const prompt = `
Você é um Analista de Risco Contratual Sênior especializado em TI.
Sua tarefa é ler o relatório de atividades abaixo e identificar:
- Nível de Risco (1: Crítico, 2: Moderado, 3: Baixo, 4: Excelente)
- Padrões de comportamento negativos
- Recomendações estratégicas de retenção

IMPORTANTE: Retorne apenas o JSON estruturado conforme o schema.

RELATÓRIO:
${reportText.substring(0, 8000)}
    `;

    console.log('🔄 [ANALYSIS] Chamando API Gemini...');
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      }
    });

    console.log('✅ [ANALYSIS] Resposta recebida da API!');
    const responseText = response.text;
    
    if (!responseText) {
      console.error('❌ [ANALYSIS] Resposta vazia da IA');
      throw new Error("Resposta da IA vazia");
    }
    
    console.log('📝 [ANALYSIS] Parseando JSON...');
    const rawResults = JSON.parse(responseText.trim());
    
    console.log(`✅ [ANALYSIS] ${rawResults.length} consultores identificados`);
    return rawResults;

  } catch (error: any) {
    console.error('❌ [ANALYSIS] Erro ao analisar relatório:', error.message);
    console.error('📋 [ANALYSIS] Stack:', error.stack);
    throw error;
  }
}

/**
 * 4. HANDLER DA API (Vercel Serverless Function)
 */
export default async function handler(req: any, res: any) {
  // ✅ Verificar método HTTP
  if (req.method !== 'POST') {
    console.warn('⚠️ [REQUEST] Método não permitido:', req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('📥 [REQUEST] Requisição recebida');
    
    // ✅ Extrair dados da requisição
    const { reportText, gestorName } = req.body;

    if (!reportText) {
      console.error('❌ [REQUEST] reportText não fornecido');
      return res.status(400).json({ error: 'reportText é obrigatório' });
    }

    console.log('📊 [REQUEST] Tamanho do texto:', reportText.length, 'caracteres');

    // ✅ Analisar relatório com IA
    const rawResults = await analyzeReportWithAI(reportText);

    // ✅ Mapear para formato interno do sistema
    const results = rawResults.map((result: any) => ({
      consultantName: result.consultorNome,
      clientName: result.clienteNome,
      managerName: gestorName || "",
      reportMonth: new Date().getMonth() + 1,
      riskScore: parseInt(result.riscoConfirmado, 10),
      summary: result.resumoSituacao,
      negativePattern: result.padraoNegativoIdentificado,
      predictiveAlert: result.alertaPreditivo,
      recommendations: result.recomendacoes || [],
      details: result.resumoSituacao
    }));

    console.log('✅ [RESPONSE] Retornando resultados...');
    return res.status(200).json({ results });

  } catch (error: any) {
    console.error('❌ [ERROR] Erro geral:', error.message);
    console.error('📋 [ERROR] Stack:', error.stack);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Erro ao processar relatório',
      details: error.toString(),
      timestamp: new Date().toISOString()
    });
  }
}
