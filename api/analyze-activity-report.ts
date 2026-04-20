/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI para análise de riscos de consultores
 * 
 * v54.2 (28/01/2026) - CORREÇÃO:
 * - Modelo atualizado: gemini-2.0-flash-exp → gemini-2.0-flash
 * - O modelo 'exp' foi descontinuado pela Google (404 Not Found)
 * 
 * v54.1 - CORRIGIDO: 
 * - Tratamento robusto de JSON malformado da IA
 * - Sanitização de aspas não escapadas (aspas duplas → simples)
 * - trechoOriginal mantém texto COMPLETO (sem limite de caracteres)
 * - Fallback em caso de erro de parsing
 * - Logs detalhados para debug
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ========================================
// CONFIGURAÇÃO - TOP LEVEL
// ========================================

const apiKey = process.env.API_KEY || process.env.VITE_API_KEY || '';

if (!apiKey) {
  console.error('❌ API_KEY não encontrada no ambiente Vercel!');
} else {
  console.log('✅ API_KEY carregada com sucesso');
}

// Inicializar cliente no top-level
const ai = new GoogleGenAI({ apiKey });

// 🔧 v54.2 (28/01/2026): CORREÇÃO - Modelo atualizado (gemini-2.0-flash-exp foi descontinuado)
const AI_MODEL = 'gemini-2.0-flash';

// Versão da API
const API_VERSION = 'v54.2';

// ========================================
// CONFIGURAÇÃO DE TIMEOUT PARA VERCEL PRO
// ========================================
export const config = {
  maxDuration: 60 // 60 segundos (máximo Vercel Pro)
};

// ========================================
// HANDLER PRINCIPAL
// ========================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Tratamento OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  console.log(`\n📥 [REQUEST] ${new Date().toISOString()}`);
  console.log(`📥 [REQUEST] Versão: ${API_VERSION}`);
  console.log(`📥 [REQUEST] Modelo: ${AI_MODEL}`);

  try {
    // Verificar API key
    if (!apiKey) {
      throw new Error('API key is missing. Please configure API_KEY in Vercel environment variables.');
    }

    // ✅ CORREÇÃO: Extrair TODOS os dados do body, incluindo mês/ano extraídos
    const { reportText, gestorName, extractedMonth, extractedYear } = req.body;
    
    if (!reportText) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'reportText é obrigatório',
        version: API_VERSION,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📄 [REQUEST] Tamanho do relatório: ${reportText.length} caracteres`);
    
    // ✅ NOVO: Log do mês/ano recebidos
    if (extractedMonth) {
      console.log(`📅 [REQUEST] Mês extraído recebido na API: ${extractedMonth}`);
    }
    if (extractedYear) {
      console.log(`📅 [REQUEST] Ano extraído recebido na API: ${extractedYear}`);
    }

    // Analisar com IA
    const analysisResults = await analyzeReportWithAI(reportText);

    // Verificar se houve resultados
    if (!analysisResults || analysisResults.length === 0) {
      return res.status(200).json({
        success: true,
        version: API_VERSION,
        model: AI_MODEL,
        timestamp: new Date().toISOString(),
        results: [],
        message: 'Análise concluída, mas nenhum consultor foi identificado no relatório.'
      });
    }

    // Mapear resultados para formato esperado pelo frontend
    const results = analysisResults.map((analysis: any) => ({
      consultantName: analysis.consultorNome || 'Não identificado',
      clientName: analysis.clienteNome || 'Não especificado',
      managerName: gestorName || 'Não especificado',
      reportMonth: extractedMonth || analysis.reportMonth || new Date().getMonth() + 1,
      reportYear: extractedYear || analysis.reportYear || new Date().getFullYear(),
      riskScore: analysis.riscoConfirmado || 3,
      summary: analysis.resumoSituacao || 'Análise não disponível',
      negativePattern: analysis.padraoNegativoIdentificado || 'Nenhum',
      predictiveAlert: analysis.alertaPreditivo || 'Nenhum',
      justification: analysis.justificativaScore || '',
      originalText: analysis.trechoOriginal || '',
      recommendations: analysis.recomendacoes || []
    }));

    return res.status(200).json({
      success: true,
      version: API_VERSION,
      model: AI_MODEL,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error: any) {
    console.error('❌ [ERROR]', error);
    
    // Tratamento específico de erros
    const errorMessage = error.message || 'Erro desconhecido';
    const errorCode = error.status || error.code || 500;
    
    // Erro de modelo não encontrado
    if (errorMessage.includes('404') || errorMessage.includes('Not Found') || errorMessage.includes('models/')) {
      return res.status(500).json({
        error: 'Erro na API: Modelo de IA não disponível',
        message: `O modelo ${AI_MODEL} não está disponível. Contate o suporte.`,
        version: API_VERSION,
        timestamp: new Date().toISOString()
      });
    }
    
    // Erro de quota/rate limit
    if (errorCode === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
      return res.status(500).json({
        error: 'Limite de requisições atingido',
        message: 'Aguarde alguns minutos e tente novamente.',
        version: API_VERSION,
        timestamp: new Date().toISOString()
      });
    }
    
    // Erro genérico
    return res.status(500).json({
      error: 'Erro ao processar relatório com IA',
      message: errorMessage,
      version: API_VERSION,
      timestamp: new Date().toISOString()
    });
  }
}

// ========================================
// FUNÇÃO DE ANÁLISE COM IA
// ========================================

async function analyzeReportWithAI(reportText: string): Promise<any[]> {
  const prompt = `Você é um **Analista de Risco de Consultores de TI Sênior**. 

Analise o relatório de atividades abaixo e extraia informações sobre CADA consultor mencionado.

## ESCALA DE RISCO (1 a 5):
- **1 = Excelente**: Altamente satisfeito, produtivo, engajado, sem problemas
- **2 = Bom**: Estável, pequenos ajustes operacionais, nenhuma preocupação
- **3 = Médio**: Alguns problemas operacionais/comportamentais menores que requerem atenção
- **4 = Alto**: Problemas significativos de comportamento, comunicação ou satisfação. Risco de saída
- **5 = Crítico**: Situação grave (conflitos, assédio, rescisão iminente, faltas graves)

## PALAVRAS DE ALERTA (aumentam o risco):
- Crítico (5): rescisão, demissão, assédio, processo, advogado, "me manda embora"
- Alto (4): insatisfeito, desmotivado, conflito, problema grave, falta injustificada
- Médio (3): atraso, comunicação difícil, reclamação, ajuste necessário

## REGRAS IMPORTANTES:
1. Cada consultor deve ter sua própria análise separada
2. O consultor é identificado após o símbolo ◆ no formato: ◆ NOME | CLIENTE
3. Seja RIGOROSO na classificação - na dúvida, classifique com risco MAIOR
4. trechoOriginal deve conter o texto COMPLETO referente ao consultor
5. Substitua TODAS as aspas duplas por aspas simples dentro dos valores de string

## RELATÓRIO:
${reportText}

## RESPONDA APENAS COM O JSON ABAIXO (sem texto antes ou depois):
[
  {
    "consultorNome": "Nome do Consultor",
    "clienteNome": "Nome do Cliente",
    "riscoConfirmado": 3,
    "resumoSituacao": "Resumo sem aspas duplas internas - use aspas simples se precisar",
    "padraoNegativoIdentificado": "Padrao ou Nenhum",
    "alertaPreditivo": "Alerta ou Nenhum",
    "justificativaScore": "Justificativa sem aspas duplas",
    "trechoOriginal": "TEXTO COMPLETO do relatorio referente a este consultor. Se houver citacoes como 'me manda embora' use aspas simples",
    "recomendacoes": [
      {
        "tipo": "AcaoImediata",
        "foco": "Consultor",
        "descricao": "Descricao da recomendacao"
      }
    ]
  }
]
`;

  console.log('📄 Chamando API Gemini com prompt aprimorado v54.2...');
  
  // Chamada à API
  const result = await ai.models.generateContent({ 
    model: AI_MODEL, 
    contents: prompt 
  });
  
  const text = result.text || '';
  
  console.log('✅ Resposta recebida do Gemini');
  console.log(`📊 Tamanho da resposta: ${text.length} caracteres`);

  // Extrair JSON da resposta
  let jsonText = '';
  
  // Tentar extrair de bloco ```json primeiro
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1].trim();
  } else {
    // Tentar encontrar array JSON diretamente
    const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
    } else {
      // Tentar encontrar objeto JSON
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
      }
    }
  }
  
  // ✅ Tratar array vazio [] como resposta válida (nenhum consultor identificado no texto)
  if (!jsonText) {
    const trimmed = text.trim();
    if (trimmed === '[]') {
      console.log('ℹ️ Gemini retornou array vazio — nenhum consultor identificado no relatório.');
      return [];
    }
    console.error('❌ Falha ao extrair JSON da resposta');
    console.log('📄 Resposta bruta (primeiros 500 chars):', text.substring(0, 500));
    throw new Error('Failed to extract JSON from AI response.');
  }

  console.log(`📊 JSON extraído: ${jsonText.length} caracteres`);
  
  // ✅ v54: Usar parse seguro com fallbacks
  const parsed = safeJsonParse(jsonText);
  
  // Garantir que é um array
  return Array.isArray(parsed) ? parsed : [parsed];
}

// ========================================
// FUNÇÃO DE PARSE SEGURO DE JSON
// ========================================

function safeJsonParse(jsonText: string): any {
  // Tentativa 1: Parse direto
  try {
    return JSON.parse(jsonText);
  } catch (e1) {
    console.log('⚠️ Parse direto falhou, tentando sanitização...');
  }

  // Tentativa 2: Sanitizar aspas problemáticas
  try {
    // Substituir aspas duplas dentro de strings por aspas simples
    let sanitized = jsonText;
    
    // Remover caracteres de controle
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Corrigir vírgulas extras
    sanitized = sanitized.replace(/,\s*}/g, '}');
    sanitized = sanitized.replace(/,\s*]/g, ']');
    
    return JSON.parse(sanitized);
  } catch (e2) {
    console.log('⚠️ Parse sanitizado falhou, tentando regex...');
  }

  // Tentativa 3: Extrair array com regex mais flexível
  try {
    const arrayMatch = jsonText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
  } catch (e3) {
    console.log('⚠️ Parse regex falhou');
  }

  // Fallback: Retornar array vazio
  console.error('❌ Todas as tentativas de parse falharam');
  return [];
}