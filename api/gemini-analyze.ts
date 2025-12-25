import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Usar API_KEY do ambiente Vercel (backend)
const apiKey = process.env.API_KEY || '';

if (!apiKey) {
  console.error('❌ API_KEY não encontrada no ambiente Vercel!');
} else {
  console.log('✅ API_KEY carregada com sucesso');
}

const ai = new GoogleGenAI({ apiKey });

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
      throw new Error('API key is missing. Please configure API_KEY in Vercel environment variables.');
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

      case 'analise_vaga':
        result = await analyzeJobDescription(payload.dados);
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

  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash-exp', contents: prompt });
  const text = result.text || '';

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

  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash-exp', contents: prompt });
  const text = result.text || '';

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response.');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}

async function generateContent(model: string, prompt: string) {
  const result = await ai.models.generateContent({ model: model || 'gemini-2.0-flash-exp', contents: prompt });
  const text = result.text || '';

  return { text };
}

// ========================================
// ANÁLISE DE VAGAS (RAISA)
// ========================================

async function analyzeJobDescription(dados: any) {
  const prompt = `
Você é um **Especialista em Recrutamento de TI** e **Copywriter de Vagas**.

Analise a seguinte vaga e sugira melhorias para torná-la mais atrativa e eficaz.

**VAGA ATUAL:**
- Título: ${dados.titulo}
- Descrição: ${dados.descricao || 'Não informada'}
- Senioridade: ${dados.senioridade || 'Não informada'}
- Stack: ${JSON.stringify(dados.stack_tecnologica || [])}
- Requisitos Obrigatórios: ${JSON.stringify(dados.requisitos_obrigatorios || [])}
- Requisitos Desejáveis: ${JSON.stringify(dados.requisitos_desejaveis || [])}
- Regime: ${dados.regime_contratacao || 'Não informado'}
- Modalidade: ${dados.modalidade || 'Não informada'}
- Benefícios: ${dados.beneficios || 'Não informados'}
- Faixa Salarial: ${dados.salario_min || 'N/A'} - ${dados.salario_max || 'N/A'}

**TAREFA:**
Analise cada campo e sugira melhorias quando necessário. Avalie:
1. **Clareza**: A vaga está clara e objetiva?
2. **Atratividade**: A vaga é atraente para candidatos?
3. **Completude**: Todos os campos importantes estão preenchidos?
4. **SEO**: A vaga usa termos que candidatos buscam?

**RESPONDA EM JSON:**
\`\`\`json
{
  "sugestoes": {
    "titulo": {
      "campo": "titulo",
      "original": "Título atual",
      "sugerido": "Título melhorado (ou null se OK)",
      "motivo": "Motivo da sugestão",
      "prioridade": "alta | media | baixa"
    },
    "descricao": {
      "campo": "descricao",
      "original": "Descrição atual",
      "sugerido": "Descrição melhorada (ou null se OK)",
      "motivo": "Motivo da sugestão",
      "prioridade": "alta | media | baixa"
    },
    "requisitos": {
      "campo": "requisitos_obrigatorios",
      "original": "Requisitos atuais",
      "sugerido": "Requisitos melhorados (ou null se OK)",
      "motivo": "Motivo da sugestão",
      "prioridade": "alta | media | baixa"
    },
    "beneficios": {
      "campo": "beneficios",
      "original": "Benefícios atuais",
      "sugerido": "Benefícios sugeridos (ou null se OK)",
      "motivo": "Motivo da sugestão",
      "prioridade": "alta | media | baixa"
    },
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "tom_sugerido": "Formal | Informal | Técnico",
    "melhorias_gerais": ["Sugestão 1", "Sugestão 2"]
  },
  "confidence_score": 75,
  "confidence_detalhado": {
    "clareza": 80,
    "atratividade": 70,
    "completude": 65,
    "seo": 60
  },
  "total_ajustes": 3,
  "campos_ajustados": ["descricao", "beneficios", "requisitos"],
  "qualidade_sugestao": 80,
  "requer_revisao_manual": false
}
\`\`\`

**REGRAS:**
- Se um campo está bom, não inclua sugestão para ele
- Seja específico nas sugestões
- Mantenha o core da vaga, apenas melhore a apresentação
- Prioridade "alta" para campos vazios ou confusos
- Prioridade "media" para melhorias de atratividade
- Prioridade "baixa" para otimizações menores
`;

  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash-exp', contents: prompt });
  const text = result.text || '';

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    // Retornar resposta padrão se parsing falhar
    return {
      sugestoes: {
        melhorias_gerais: ['Não foi possível analisar a vaga automaticamente. Revise manualmente.']
      },
      confidence_score: 50,
      confidence_detalhado: {
        clareza: 50,
        atratividade: 50,
        completude: 50,
        seo: 50
      },
      total_ajustes: 0,
      campos_ajustados: [],
      qualidade_sugestao: 50,
      requer_revisao_manual: true
    };
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}
