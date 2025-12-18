/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI com Schema estruturado para análise de riscos
 * 
 * v48 - CORRIGIDO: Modelo e sintaxe do SDK @google/genai
 */

import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { APP_VERSION, FEATURES_TRACE, ENV_TRACE, initializeTraces } from '../version';

/**
 * 1. INICIALIZAR TRACES NA PRIMEIRA EXECUÇÃO
 */
let tracesInitialized = false;

/**
 * 2. CONFIGURAÇÃO DO CLIENTE
 * Recupera a chave de API das variáveis de ambiente
 */
const getAIClient = () => {
  // Inicializar traces na primeira requisição
  if (!tracesInitialized) {
    console.log('\n🚀 PRIMEIRA REQUISIÇÃO - INICIALIZANDO TRACES\n');
    initializeTraces();
    tracesInitialized = true;
  }

  const apiKey = process.env.VITE_API_KEY || process.env.API_KEY;
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           📋 REQUISIÇÃO PARA ANÁLISE DE RELATÓRIO          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ Versão da App:         ${APP_VERSION.toString().padEnd(40)} ║`);
  console.log(`║ NODE_ENV:              ${process.env.NODE_ENV?.padEnd(40) || 'unknown'.padEnd(40)} ║`);
  console.log(`║ VITE_API_KEY presente: ${(!!process.env.VITE_API_KEY ? '✅ SIM' : '❌ NÃO').padEnd(40)} ║`);
  console.log(`║ API_KEY presente:      ${(!!process.env.API_KEY ? '✅ SIM' : '❌ NÃO').padEnd(40)} ║`);
  console.log(`║ API_KEY final:         ${(!!apiKey ? '✅ DISPONÍVEL' : '❌ NÃO DISPONÍVEL').padEnd(40)} ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  if (!apiKey) {
    console.error('❌ [ERRO CRÍTICO] API_KEY não configurada!');
    console.error('   Configure VITE_API_KEY ou API_KEY no Vercel');
    throw new Error("API_KEY não configurada no ambiente.");
  }
  
  console.log(`✅ [SUCESSO] API_KEY encontrada! Tamanho: ${apiKey.length} caracteres`);
  return new GoogleGenAI({ apiKey });
};

/**
 * 3. DEFINIÇÃO DO SCHEMA (JSON ESTRUTURADO)
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
 * 4. MODELO GEMINI A SER USADO
 * CORRIGIDO: gemini-2.5-flash é o modelo correto e disponível
 */
const AI_MODEL_NAME = 'gemini-2.5-flash';

/**
 * 5. FUNÇÃO PRINCIPAL DE ANÁLISE
 */
async function analyzeReportWithAI(reportText: string): Promise<any[]> {
  if (!reportText || reportText.length < 5) {
    console.warn('⚠️ [ANALYSIS] Texto do relatório muito curto ou vazio');
    return [];
  }

  try {
    console.log('🤖 [ANALYSIS] Inicializando cliente Gemini...');
    const ai = getAIClient();
    
    console.log(`📌 [ANALYSIS] Modelo: ${AI_MODEL_NAME}`);
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
    
    // CORRIGIDO: Sintaxe correta do SDK @google/genai
    const response = await ai.models.generateContent({
      model: AI_MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      }
    });

    console.log('✅ [ANALYSIS] Resposta recebida do Gemini!');
    
    // CORRIGIDO: Acesso correto à resposta
    const text = response.text;
    
    if (!text) {
      console.error('❌ [ANALYSIS] Resposta vazia do Gemini');
      return [];
    }
    
    // Limpar possíveis marcadores de código
    const cleanText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    
    const data = JSON.parse(cleanText);
    
    console.log(`📊 [ANALYSIS] ${Array.isArray(data) ? data.length : 1} consultores analisados`);
    console.log('✅ [ANALYSIS] Análise concluída com sucesso!\n');
    
    return Array.isArray(data) ? data : [data];
    
  } catch (error: any) {
    console.error('❌ [ANALYSIS] Erro ao analisar relatório:', error.message);
    console.error('📋 [ANALYSIS] Stack:', error.stack);
    
    // Log adicional para debug
    if (error.response) {
      console.error('📋 [ANALYSIS] Response status:', error.response.status);
      console.error('📋 [ANALYSIS] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    return [];
  }
}

/**
 * 6. HANDLER PRINCIPAL DA API
 */
export default async function handler(req: any, res: any) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📥 [REQUEST] ${new Date().toISOString()}`);
  console.log(`📥 [REQUEST] Método: ${req.method}`);
  console.log(`📥 [REQUEST] Versão da App: ${APP_VERSION.toString()}`);
  console.log(`📥 [REQUEST] Modelo Gemini: ${AI_MODEL_NAME}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ✅ Verificar método HTTP
  if (req.method !== 'POST') {
    console.warn('⚠️ [REQUEST] Método não permitido:', req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // ✅ Extrair texto do relatório
    const { reportText, gestorName } = req.body;
    
    if (!reportText) {
      console.error('❌ [REQUEST] reportText não fornecido');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'reportText é obrigatório',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📄 [REQUEST] Tamanho do relatório: ${reportText.length} caracteres`);

    // ✅ Analisar com IA
    const analysisResults = await analyzeReportWithAI(reportText);

    // ✅ Verificar se houve resultados
    if (!analysisResults || analysisResults.length === 0) {
      console.warn('⚠️ [REQUEST] Nenhum resultado da análise');
      return res.status(200).json({
        success: true,
        version: APP_VERSION.toString(),
        model: AI_MODEL_NAME,
        timestamp: new Date().toISOString(),
        results: [],
        message: 'Análise concluída, mas nenhum consultor foi identificado no relatório.'
      });
    }

    // ✅ Mapear para formato interno
    const results = analysisResults.map((result: any) => ({
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

    // ✅ Retornar resultado
    console.log('📤 [RESPONSE] Enviando resultado ao cliente...');
    return res.status(200).json({
      success: true,
      version: APP_VERSION.toString(),
      model: AI_MODEL_NAME,
      timestamp: new Date().toISOString(),
      results: results
    });

  } catch (error: any) {
    console.error('❌ [ERROR] Erro na API:', error.message);
    console.error('📋 [ERROR] Stack:', error.stack);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      version: APP_VERSION.toString(),
      model: AI_MODEL_NAME,
      timestamp: new Date().toISOString()
    });
  } finally {
    console.log('═══════════════════════════════════════════════════════════\n');
  }
}
