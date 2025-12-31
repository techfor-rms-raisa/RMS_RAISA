/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI para análise de riscos de consultores
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

// ✅ CORREÇÃO: Modelo que funciona com @google/genai
const AI_MODEL = 'gemini-2.0-flash-exp';

// Versão da API
const API_VERSION = 'v54.1';

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
      details: result.resumoSituacao || result.summary || '',
      // ✅ NOVO v53: Trecho original do relatório específico deste consultor
      trechoOriginal: result.trechoOriginal || result.originalText || ''
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
// ✅ v54: FUNÇÃO DE SANITIZAÇÃO DE JSON
// ========================================

/**
 * Sanitiza JSON malformado retornado pela IA
 * Trata aspas não escapadas dentro de strings
 */
function sanitizeJsonString(jsonStr: string): string {
  let sanitized = jsonStr;
  
  // 1. Substituir aspas curvas por aspas retas
  sanitized = sanitized.replace(/[""]/g, '"');
  sanitized = sanitized.replace(/['']/g, "'");
  
  // 2. Remover vírgulas extras antes de ] ou }
  sanitized = sanitized.replace(/,\s*([\]}])/g, '$1');
  
  // 3. Remover caracteres de controle inválidos (exceto \n, \r, \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // 4. ✅ CORREÇÃO PRINCIPAL: Substituir aspas duplas dentro de valores por aspas simples
  // Processa o JSON campo por campo para substituir aspas internas
  sanitized = sanitized.replace(
    /:\s*"((?:[^"\\]|\\.)*)"/g,
    (match, content) => {
      // Dentro do conteúdo, substituir aspas duplas não escapadas por simples
      // Mas preservar as aspas que já estão escapadas
      const fixedContent = content
        .replace(/(?<!\\)"/g, "'")  // Aspas não escapadas → simples
        .replace(/\\"/g, "'");      // Aspas escapadas → simples também
      return `: "${fixedContent}"`;
    }
  );
  
  // 5. Corrigir quebras de linha dentro de strings JSON
  sanitized = sanitized.replace(
    /:\s*"([^"]*)"/g,
    (match, content) => {
      const fixedContent = content
        .replace(/\r\n/g, '\\n')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\n')
        .replace(/\t/g, '\\t');
      return `: "${fixedContent}"`;
    }
  );
  
  return sanitized;
}

/**
 * Tenta fazer parse do JSON com múltiplas estratégias
 */
function safeJsonParse(jsonStr: string): any {
  // Tentativa 1: Parse direto
  try {
    return JSON.parse(jsonStr);
  } catch (e1: any) {
    console.log(`⚠️ Parse direto falhou: ${e1.message}`);
  }
  
  // Tentativa 2: Parse após sanitização básica
  try {
    const sanitized = sanitizeJsonString(jsonStr);
    return JSON.parse(sanitized);
  } catch (e2: any) {
    console.log(`⚠️ Parse com sanitização básica falhou: ${e2.message}`);
  }
  
  // Tentativa 3: Remover o campo trechoOriginal problemático e tentar novamente
  try {
    console.log('⚠️ Tentando remover campo trechoOriginal...');
    // Remove o campo trechoOriginal que geralmente causa problemas
    const withoutTrecho = jsonStr.replace(/"trechoOriginal"\s*:\s*"[^"]*(?:\\.[^"]*)*"\s*,?/g, '');
    const sanitized = sanitizeJsonString(withoutTrecho);
    return JSON.parse(sanitized);
  } catch (e3: any) {
    console.log(`⚠️ Parse sem trechoOriginal falhou: ${e3.message}`);
  }
  
  // Tentativa 4: Extrair campos manualmente com regex
  try {
    console.log('⚠️ Tentando extração manual com regex...');
    return extractConsultantsManually(jsonStr);
  } catch (e4: any) {
    console.error(`❌ Extração manual falhou: ${e4.message}`);
  }
  
  // Todas as tentativas falharam
  console.error('❌ Todas as tentativas de parse falharam');
  console.log('📄 JSON problemático (primeiros 1000 chars):', jsonStr.substring(0, 1000));
  throw new Error('Falha ao processar resposta da IA. JSON malformado.');
}

/**
 * Extração manual de consultores usando regex (fallback)
 */
function extractConsultantsManually(text: string): any[] {
  const consultants: any[] = [];
  
  // Regex para capturar campos
  const consultorNomeRegex = /"consultorNome"\s*:\s*"([^"]+)"/g;
  const clienteNomeRegex = /"clienteNome"\s*:\s*"([^"]*)"/g;
  const riscoRegex = /"riscoConfirmado"\s*:\s*(\d)/g;
  const resumoRegex = /"resumoSituacao"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const padraoRegex = /"padraoNegativoIdentificado"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const alertaRegex = /"alertaPreditivo"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  
  // Encontrar todos os nomes de consultores
  const nomes: string[] = [];
  let match;
  while ((match = consultorNomeRegex.exec(text)) !== null) {
    nomes.push(match[1]);
  }
  
  if (nomes.length === 0) {
    throw new Error('Nenhum nome de consultor encontrado na extração manual');
  }
  
  // Encontrar todos os clientes
  const clientes: string[] = [];
  while ((match = clienteNomeRegex.exec(text)) !== null) {
    clientes.push(match[1]);
  }
  
  // Encontrar todos os riscos
  const riscos: number[] = [];
  while ((match = riscoRegex.exec(text)) !== null) {
    riscos.push(parseInt(match[1], 10));
  }
  
  // Encontrar todos os resumos
  const resumos: string[] = [];
  while ((match = resumoRegex.exec(text)) !== null) {
    resumos.push(match[1].replace(/\\"/g, '"').replace(/\\n/g, ' '));
  }
  
  // Encontrar padrões negativos
  const padroes: string[] = [];
  while ((match = padraoRegex.exec(text)) !== null) {
    padroes.push(match[1].replace(/\\"/g, '"'));
  }
  
  // Encontrar alertas
  const alertas: string[] = [];
  while ((match = alertaRegex.exec(text)) !== null) {
    alertas.push(match[1].replace(/\\"/g, '"'));
  }
  
  // Montar objetos
  for (let i = 0; i < nomes.length; i++) {
    consultants.push({
      consultorNome: nomes[i] || '',
      clienteNome: clientes[i] || '',
      riscoConfirmado: riscos[i] || 3,
      resumoSituacao: resumos[i] || 'Análise parcial devido a erro de parsing',
      padraoNegativoIdentificado: padroes[i] || 'Verificar manualmente',
      alertaPreditivo: alertas[i] || 'Verificar manualmente',
      trechoOriginal: '',
      recomendacoes: []
    });
  }
  
  console.log(`✅ Extração manual encontrou ${consultants.length} consultores`);
  return consultants;
}

// ========================================
// FUNÇÃO DE ANÁLISE COM PROMPT APRIMORADO
// ========================================

async function analyzeReportWithAI(reportText: string): Promise<any[]> {
  if (!reportText || reportText.length < 5) {
    console.warn('⚠️ Texto do relatório muito curto ou vazio');
    return [];
  }

  // ✅ v54: Prompt atualizado para evitar aspas problemáticas
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
- Menção a assédio (moral, sexual, qualquer tipo)
- Rescisão solicitada ou confirmada
- Consultor quer sair / pediu demissão
- Conflito grave com cliente ou gestor
- Fraude, desonestidade, mentira comprovada

### RISCO 4 (ALTO) - Se qualquer um destes aparecer:
- Consultor descontente, insatisfeito, desmotivado
- Conflito com gestor ou equipe
- Situação descrita como grave ou preocupante
- Reclamação do gestor (reincidente)
- Comportamento inadequado

### RISCO 3 (MÉDIO) - Problemas operacionais:
- Atrasos pontuais
- Problemas de preenchimento de planilha
- Necessidade de ajustes em entregas
- Adaptação em andamento

### RISCO 2 (BOM) - Situação estável:
- Pequenos ajustes necessários
- Feedback positivo com ressalvas menores

### RISCO 1 (EXCELENTE) - Apenas se:
- Nenhum problema reportado
- Feedback 100% positivo

## REGRA DE OURO:
**Na dúvida, classifique com risco MAIOR, não menor.**

## RELATÓRIO PARA ANÁLISE:
\`\`\`
${reportText.substring(0, 8000)}
\`\`\`

## REGRAS CRÍTICAS PARA O JSON:
1. NUNCA use aspas duplas (") dentro de valores de string - isso quebra o JSON
2. Se precisar citar falas ou expressões, use aspas simples (') em vez de aspas duplas
3. Exemplo: em vez de ele disse "me manda embora", escreva: ele disse 'me manda embora'
4. O campo trechoOriginal deve conter o TEXTO COMPLETO do relatório referente ao consultor
5. Substitua TODAS as aspas duplas por aspas simples dentro dos valores de string

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

  console.log('📄 Chamando API Gemini com prompt aprimorado v54...');
  
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
  
  if (!jsonText) {
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
