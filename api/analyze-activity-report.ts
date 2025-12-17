/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI para identificar consultores e analisar riscos automaticamente
 * 
 * v45 - CORRIGIDO: Usar VITE_API_KEY (disponível no Vercel)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  // ✅ Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // ✅ CORRETO: Usar VITE_API_KEY (que está configurada no Vercel)
    // Fallback para API_KEY se VITE_API_KEY não existir
    const apiKey = process.env.VITE_API_KEY || process.env.API_KEY;

    console.log('🔍 [REQUEST] Verificando API_KEY...');
    console.log('🔍 [REQUEST] NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 [REQUEST] VITE_API_KEY presente?', !!process.env.VITE_API_KEY);
    console.log('🔍 [REQUEST] API_KEY presente?', !!process.env.API_KEY);
    console.log('🔍 [REQUEST] apiKey final presente?', !!apiKey);
    if (apiKey) {
      console.log('🔍 [REQUEST] apiKey tamanho:', apiKey.length, 'caracteres');
    }

    // ✅ Validar se API_KEY existe
    if (!apiKey) {
      console.error('❌ [REQUEST] API_KEY não configurada!');
      console.error('❌ [REQUEST] Variáveis disponíveis:');
      console.error('   - VITE_API_KEY:', !!process.env.VITE_API_KEY);
      console.error('   - API_KEY:', !!process.env.API_KEY);
      return res.status(500).json({
        error: 'API não configurada',
        message: 'Chave de API Gemini não configurada. Configure VITE_API_KEY no Vercel',
        timestamp: new Date().toISOString()
      });
    }

    // ✅ Inicializar Gemini com API_KEY
    let genAI: GoogleGenerativeAI;
    try {
      genAI = new GoogleGenerativeAI(apiKey);
      console.log('✅ [REQUEST] GoogleGenerativeAI inicializado com sucesso!');
    } catch (err: any) {
      console.error('❌ [REQUEST] Erro ao inicializar GoogleGenerativeAI:', err.message);
      return res.status(500).json({
        error: 'Erro ao inicializar API',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }

    // ✅ Extrair dados da requisição
    const { reportText, gestorName } = req.body;

    if (!reportText) {
      return res.status(400).json({ error: 'reportText é obrigatório' });
    }

    console.log('🤖 [ANALYSIS] Iniciando análise de relatório com Gemini AI...');
    console.log('📝 [ANALYSIS] Tamanho do texto:', reportText.length, 'caracteres');

    const prompt = `
Você é um especialista em análise de relatórios de atividades de consultores de TI.

**TAREFA:**
Analise o relatório abaixo e identifique TODOS os consultores mencionados, extraindo:
1. Nome completo do consultor
2. Cliente/empresa onde trabalha
3. Nível de risco (1-5) baseado no tom e conteúdo
4. Resumo da situação
5. Padrões negativos identificados
6. Alertas preditivos
7. Recomendações

**FORMATO DO RELATÓRIO:**
O relatório segue o padrão:
\`\`\`
◆ [NOME DO CONSULTOR] | [CLIENTE]
[Texto livre descrevendo atividades e situação...]
\`\`\`

**ESCALA DE RISCO:**
- **1 (Muito Baixo):** Consultor altamente satisfeito, engajado, produtivo. Palavras-chave: "satisfeito", "excelente", "positiva", "colaborativo", "boa sintonia", "entregando bem", "motivado"

- **2 (Baixo):** Consultor estável, enfrentando desafios normais. Palavras-chave: "apesar", "desafiador", "cobranças", "métricas exigentes", "adaptação"

- **3 (Médio):** Consultor com problemas operacionais ou comportamentais. Palavras-chave: "atraso", "impactando", "problemas", "ausente", "sem justificativa", "vamos monitorar"

- **4 (Alto):** Consultor com alta probabilidade de saída. Palavras-chave: "insatisfeito", "desmotivado", "buscando oportunidades", "proposta"

- **5 (Crítico):** Saída confirmada ou iminente. Palavras-chave: "rescisão", "saída", "último dia", "proposta de mercado aceita", "não faria mais sentido", "optou sua saída"

**RELATÓRIO:**
\`\`\`
${reportText}
\`\`\`

**GESTOR:** ${gestorName}

**RESPONDA EM JSON:**
\`\`\`json
{
  "results": [
    {
      "consultantName": "Nome Completo",
      "clientName": "Nome do Cliente",
      "managerName": "${gestorName}",
      "reportMonth": 11,
      "riskScore": 1-5,
      "summary": "Resumo em 1-2 frases",
      "negativePattern": "Padrão negativo identificado ou 'Nenhum'",
      "predictiveAlert": "Alerta preditivo ou 'Nenhum'",
      "recommendations": "Recomendações de ação",
      "details": "Texto completo das atividades"
    }
  ]
}
\`\`\`

**IMPORTANTE:**
- Identifique TODOS os consultores mencionados (pode haver vários)
- Extraia o mês do cabeçalho do relatório (ex: "03.11.2025 a 07.11.2025" → mês 11)
- Analise o TOM do texto, não apenas palavras isoladas
- Se houver coordenadores ou gestores mencionados, NÃO os inclua como consultores
- Retorne APENAS o JSON, sem texto adicional
`;

    console.log('🤖 [ANALYSIS] Chamando Gemini API com modelo gemini-3-flash-preview...');
    
    // ✅ CORRETO: Usar gemini-3-flash-preview
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ [ANALYSIS] Resposta recebida da API Gemini!');
    console.log('📝 [ANALYSIS] Resposta (primeiros 200 caracteres):', text.substring(0, 200) + '...');

    // ✅ Extrair JSON da resposta
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
    
    if (!jsonMatch) {
      console.error('❌ [ANALYSIS] Resposta da IA não contém JSON válido!');
      console.error('📄 [ANALYSIS] Resposta completa:', text);
      throw new Error('Resposta da IA não contém JSON válido');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const analysis = JSON.parse(jsonText);

    console.log(`✅ [ANALYSIS] ${analysis.results.length} consultores identificados pela IA Gemini`);

    return res.status(200).json(analysis);

  } catch (error: any) {
    console.error('❌ [ERROR] Erro ao analisar relatório:', error);
    console.error('📋 [ERROR] Mensagem:', error.message);
    console.error('📋 [ERROR] Stack:', error.stack);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Erro ao processar relatório',
      details: error.toString(),
      timestamp: new Date().toISOString()
    });
  }
}
