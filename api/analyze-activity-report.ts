/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI para análise de riscos de consultores
 * 
 * v49 - CORRIGIDO: Seguindo padrão do gemini-analyze.ts que funciona
 * - Removido import de Type/Schema que causava erro no Vercel
 * - Adicionado CORS headers
 * - Adicionado tratamento OPTIONS
 * - Cliente AI inicializado no top-level
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ========================================
// CONFIGURAÇÃO - TOP LEVEL (como no gemini-analyze.ts)
// ========================================

const apiKey = process.env.API_KEY || process.env.VITE_API_KEY || '';

if (!apiKey) {
  console.error('❌ API_KEY não encontrada no ambiente Vercel!');
} else {
  console.log('✅ API_KEY carregada com sucesso');
}

// Inicializar cliente no top-level (como no arquivo que funciona)
const ai = new GoogleGenAI({ apiKey });

// Modelo a ser usado
const AI_MODEL = 'gemini-2.5-flash';

// Versão da API
const API_VERSION = 'v49';

// ========================================
// HANDLER PRINCIPAL
// ========================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers (como no gemini-analyze.ts)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Tratamento OPTIONS (como no gemini-analyze.ts)
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

    // Extrair dados do body
    const { reportText, gestorName } = req.body;
    
    if (!reportText) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'reportText é obrigatório',
        version: API_VERSION,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📄 [REQUEST] Tamanho do relatório: ${reportText.length} caracteres`);

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

    // Mapear para formato interno
    const results = analysisResults.map((result: any) => ({
      consultantName: result.consultorNome || result.consultantName || '',
      clientName: result.clienteNome || result.clientName || '',
      managerName: gestorName || '',
      reportMonth: new Date().getMonth() + 1,
      riskScore: parseInt(result.riscoConfirmado || result.riskScore || '3', 10),
      summary: result.resumoSituacao || result.summary || '',
      negativePattern: result.padraoNegativoIdentificado || result.negativePattern || 'Nenhum',
      predictiveAlert: result.alertaPreditivo || result.predictiveAlert || 'Nenhum',
      recommendations: result.recomendacoes || result.recommendations || [],
      details: result.resumoSituacao || result.summary || ''
    }));

    console.log(`✅ [RESPONSE] ${results.length} consultores analisados`);

    return res.status(200).json({
      success: true,
      version: API_VERSION,
      model: AI_MODEL,
      timestamp: new Date().toISOString(),
      results: results
    });

  } catch (error: any) {
    console.error('❌ [ERROR]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar requisição',
      version: API_VERSION,
      timestamp: new Date().toISOString()
    });
  }
}

// ========================================
// FUNÇÃO DE ANÁLISE (seguindo padrão do gemini-analyze.ts)
// ========================================

async function analyzeReportWithAI(reportText: string): Promise<any[]> {
  if (!reportText || reportText.length < 5) {
    console.warn('⚠️ Texto do relatório muito curto ou vazio');
    return [];
  }

  const prompt = `
Você é um Analista de Risco Contratual Sênior especializado em TI.
Sua tarefa é ler o relatório de atividades abaixo e identificar:
- Nível de Risco (1: Crítico, 2: Moderado, 3: Baixo, 4: Excelente)
- Padrões de comportamento negativos
- Recomendações estratégicas de retenção

**ESCALA DE RISCO:**
- **1 (Crítico):** Saída confirmada ou iminente
- **2 (Moderado):** Alta probabilidade de problemas
- **3 (Baixo):** Problemas operacionais menores
- **4 (Excelente):** Altamente satisfeito, engajado, produtivo

**RELATÓRIO:**
\`\`\`
${reportText.substring(0, 8000)}
\`\`\`

**RESPONDA EM JSON (array de consultores):**
\`\`\`json
[
  {
    "consultorNome": "Nome do Consultor",
    "clienteNome": "Nome do Cliente",
    "riscoConfirmado": 1-4,
    "resumoSituacao": "Resumo em 1-2 frases",
    "padraoNegativoIdentificado": "Padrão negativo ou 'Nenhum'",
    "alertaPreditivo": "Alerta preditivo ou 'Nenhum'",
    "recomendacoes": [
      {
        "tipo": "AcaoImediata | QuestaoSondagem | RecomendacaoEstrategica",
        "foco": "Consultor | Cliente | ProcessoInterno",
        "descricao": "Descrição da recomendação"
      }
    ]
  }
]
\`\`\`
`;

  console.log('🔄 Chamando API Gemini...');
  
  // Chamada seguindo o padrão do gemini-analyze.ts
  const result = await ai.models.generateContent({ 
    model: AI_MODEL, 
    contents: prompt 
  });
  
  const text = result.text || '';
  
  console.log('✅ Resposta recebida do Gemini');

  // Extrair JSON da resposta (mesmo padrão do gemini-analyze.ts)
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    console.error('❌ Falha ao extrair JSON da resposta');
    throw new Error('Failed to parse AI response.');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  const parsed = JSON.parse(jsonText);
  
  // Garantir que é um array
  return Array.isArray(parsed) ? parsed : [parsed];
}
