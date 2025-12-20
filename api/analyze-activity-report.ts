/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI para análise de riscos de consultores
 * 
 * v51 - CORRIGIDO: 
 * - Modelo Gemini corrigido para gemini-1.5-flash (válido)
 * - Agora usa extractedMonth e extractedYear do frontend
 * - Timeout aumentado para requisições longas
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

// ✅ CORREÇÃO: Modelo válido do Gemini
const AI_MODEL = 'gemini-1.5-flash';

// Versão da API
const API_VERSION = 'v51';

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

    // ✅ CORREÇÃO: Usar o mês/ano extraídos do frontend, não o mês atual
    const finalMonth = extractedMonth || (new Date().getMonth() + 1);
    const finalYear = extractedYear || new Date().getFullYear();
    
    console.log(`📅 [RESPONSE] Usando Mês: ${finalMonth}, Ano: ${finalYear}`);

    // Mapear para formato interno
    const results = analysisResults.map((result: any) => ({
      consultantName: result.consultorNome || result.consultantName || '',
      clientName: result.clienteNome || result.clientName || '',
      managerName: gestorName || '',
      reportMonth: finalMonth,      // ✅ CORREÇÃO: Usa mês extraído
      reportYear: finalYear,        // ✅ NOVO: Inclui ano extraído
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
// FUNÇÃO DE ANÁLISE COM PROMPT APRIMORADO
// ========================================

async function analyzeReportWithAI(reportText: string): Promise<any[]> {
  if (!reportText || reportText.length < 5) {
    console.warn('⚠️ Texto do relatório muito curto ou vazio');
    return [];
  }

  const prompt = `
Você é um Analista de Risco Contratual Sênior especializado em Gestão de Pessoas em TI.
Sua tarefa é analisar relatórios de atividades de consultores e classificar o RISCO DE RETENÇÃO.

## ESCALA DE RISCO (IMPORTANTE - SIGA RIGOROSAMENTE):

| Score | Classificação | Critérios |
|-------|---------------|-----------|
| **1** | **Excelente** | Consultor altamente satisfeito, engajado, produtivo, sem nenhum problema reportado |
| **2** | **Bom** | Consultor satisfeito, pequenos ajustes operacionais, sem riscos |
| **3** | **Médio** | Problemas operacionais menores, necessita acompanhamento, alertas leves |
| **4** | **Alto** | Problemas comportamentais, conflitos, insatisfação, requer intervenção |
| **5** | **Crítico** | Risco iminente de saída, assédio, conflitos graves, rescisão provável |

## SINAIS QUE ELEVAM O RISCO AUTOMATICAMENTE:

### RISCO 5 (CRÍTICO) - Se qualquer um destes aparecer:
- Menção a "assédio" (moral, sexual, qualquer tipo)
- Rescisão solicitada ou confirmada
- Consultor quer sair / pediu demissão
- Conflito grave com cliente ou gestor
- Fraude, desonestidade, mentira comprovada
- Palavras: "rescisão", "demissão", "assédio", "processo", "advogado"

### RISCO 4 (ALTO) - Se qualquer um destes aparecer:
- Consultor "descontente", "insatisfeito", "desmotivado"
- Conflito com gestor ou equipe
- Situação descrita como "grave" ou "preocupante"
- Não abre câmera nas reuniões (reincidente)
- Reclamação do gestor (reincidente)
- Comportamento inadequado
- Palavras: "grosseiro", "mal-educado", "debochado", "ofendido", "grave", "preocupante"

### RISCO 3 (MÉDIO) - Problemas operacionais:
- Atrasos pontuais
- Problemas de preenchimento de planilha
- Necessidade de ajustes em entregas
- Adaptação em andamento

### RISCO 2 (BOM) - Situação estável:
- Pequenos ajustes necessários
- Feedback positivo com ressalvas menores
- Em evolução positiva

### RISCO 1 (EXCELENTE) - Apenas se:
- Nenhum problema reportado
- Feedback 100% positivo
- Consultor elogiado
- Altamente produtivo e engajado

## REGRA DE OURO:
**Na dúvida, classifique com risco MAIOR, não menor.**
**Se houver qualquer sinal negativo, NÃO classifique como Excelente (1) ou Bom (2).**

## RELATÓRIO PARA ANÁLISE:
\`\`\`
${reportText.substring(0, 8000)}
\`\`\`

## RESPONDA EM JSON (array de consultores identificados):
\`\`\`json
[
  {
    "consultorNome": "Nome do Consultor",
    "clienteNome": "Nome do Cliente (se mencionado)",
    "riscoConfirmado": 1-5,
    "resumoSituacao": "Resumo objetivo em 2-3 frases",
    "padraoNegativoIdentificado": "Descreva o padrão negativo ou 'Nenhum'",
    "alertaPreditivo": "Risco futuro identificado ou 'Nenhum'",
    "justificativaScore": "Explique por que atribuiu este score",
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

IMPORTANTE: Analise cuidadosamente o texto. Se houver menção a conflitos, assédio, descontentamento ou situações graves, o score DEVE ser 4 ou 5.
`;

  console.log('📄 Chamando API Gemini com prompt aprimorado v51...');
  
  // Chamada à API
  const result = await ai.models.generateContent({ 
    model: AI_MODEL, 
    contents: prompt 
  });
  
  const text = result.text || '';
  
  console.log('✅ Resposta recebida do Gemini');

  // Extrair JSON da resposta
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
