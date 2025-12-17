import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Usar VITE_GEMINI_API do ambiente Vercel (backend)
const apiKey = process.env.VITE_GEMINI_API || '';

if (!apiKey) {
  console.error('❌ VITE_GEMINI_API não encontrada no ambiente Vercel!');
} else {
  console.log('✅ VITE_GEMINI_API carregada com sucesso');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, payload } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action é obrigatório' });
    }

    console.log(`🤖 [Gemini API] Ação: ${action}`);

    // Verificar se API key está disponível
    if (!apiKey) {
      throw new Error('API key is missing. Please configure VITE_GEMINI_API in Vercel environment variables.');}
    }

    let result;

    switch (action) {
      case 'extractBehavioralFlags':
        result = await extractBehavioralFlags(payload.reportText);
        break;

      case 'analyzeReport':
        result = await analyzeReport(payload.reportText, payload.consultantName);
        break;

      case 'generateContent':
        result = await generateContent(payload.model, payload.prompt);
        break;

      default:
        return res.status(400).json({ error: `Ação desconhecida: ${action}` });
    }

    return res.status(200).json({ success: true, data: result });

  } catch (error: any) {
    console.error('[Gemini API] Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar requisição',
      timestamp: new Date().toISOString()
    });
  }
}

// ========================================
// FUNÇÕES DE ANÁLISE
// ========================================

async function extractBehavioralFlags(reportText: string) {
  const prompt = `
Você é um **Analista de People Analytics**. 
Analise o seguinte relatório mensal e extraia todos os sinais de comportamento negativo em formato JSON. 
Procure por problemas de frequência (ATTENDANCE), comunicação (COMMUNICATION), qualidade técnica (QUALITY) e engajamento (ENGAGEMENT).

**RELATÓRIO:**
\`\`\`
${reportText}
\`\`\`

**RESPONDA EM JSON:**
\`\`\`json
{
  "flags": [
    {
      "type": "ATTENDANCE | COMMUNICATION | QUALITY | ENGAGEMENT",
      "severity": "LOW | MEDIUM | HIGH",
      "description": "Descrição do problema",
      "evidence": "Trecho do relatório que evidencia"
    }
  ]
}
\`\`\`
`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response.');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}

async function analyzeReport(reportText: string, consultantName: string) {
  const prompt = `
Você é um especialista em análise de relatórios de atividades de consultores de TI.

**TAREFA:**
Analise o relatório do consultor **${consultantName}** e forneça:
1. Nível de risco (1-5)
2. Resumo da situação
3. Padrões negativos identificados
4. Alertas preditivos
5. Recomendações

**ESCALA DE RISCO:**
- **1 (Muito Baixo):** Altamente satisfeito, engajado, produtivo
- **2 (Baixo):** Estável, desafios normais
- **3 (Médio):** Problemas operacionais ou comportamentais
- **4 (Alto):** Alta probabilidade de saída
- **5 (Crítico):** Saída confirmada ou iminente

**RELATÓRIO:**
\`\`\`
${reportText}
\`\`\`

**RESPONDA EM JSON:**
\`\`\`json
{
  "riskScore": 1-5,
  "summary": "Resumo em 1-2 frases",
  "negativePattern": "Padrão negativo ou 'Nenhum'",
  "predictiveAlert": "Alerta preditivo ou 'Nenhum'",
  "recommendations": [
    {
      "type": "AcaoImediata | QuestaoSondagem | RecomendacaoEstrategica",
      "focus": "Consultor | Cliente | ProcessoInterno",
      "description": "Descrição da recomendação"
    }
  ]
}
\`\`\`
`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response.');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}

async function generateContent(model: string, prompt: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash-exp' });
  
  const result = await geminiModel.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  return { text };
}
