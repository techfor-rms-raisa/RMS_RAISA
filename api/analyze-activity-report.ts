/**
 * API ENDPOINT: ANÁLISE DE RELATÓRIOS DE ATIVIDADES
 * Usa Gemini AI para identificar consultores e analisar riscos automaticamente
 * 
 * v41 - Com logs de debug detalhados + fallback temporário
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// DEBUG: Verificar TODAS as variáveis de ambiente
console.log('🔍 [DEBUG] Verificando variáveis de ambiente:');
console.log('  - process.env.GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `✅ Existe (${process.env.GEMINI_API_KEY.substring(0, 10)}...)` : '❌ Não existe');
console.log('  - process.env.VITE_GEMINI_API_KEY:', process.env.VITE_GEMINI_API_KEY ? `✅ Existe` : '❌ Não existe');
console.log('  - process.env.VITE_GEMINI_API:', process.env.VITE_GEMINI_API ? `✅ Existe` : '❌ Não existe');
console.log('  - process.env.NEXT_PUBLIC_GEMINI_API_KEY:', process.env.NEXT_PUBLIC_GEMINI_API_KEY ? `✅ Existe` : '❌ Não existe');

// Priorizar GEMINI_API_KEY (configurada no Vercel)
const apiKey = process.env.GEMINI_API_KEY || 
               process.env.VITE_GEMINI_API_KEY || 
               process.env.VITE_GEMINI_API ||
               process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
               // FALLBACK TEMPORÁRIO (remover após debug)
               'AIzaSyB0qAQbSdym6tLTsYbWMaNb1gnnNTdzW7k';

console.log('🔑 [DEBUG] API Key final:', apiKey ? `✅ Carregada (${apiKey.length} caracteres, começa com: ${apiKey.substring(0, 10)}...)` : '❌ VAZIA!');

if (!apiKey || apiKey.length < 30) {
  console.error('❌ ERRO CRÍTICO: API Key inválida ou não configurada!');
  console.error('📋 Verifique se GEMINI_API_KEY está configurada no Vercel em Production');
}

// Inicializar com STRING DIRETA (sintaxe correta)
const genAI = new GoogleGenerativeAI(apiKey);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { reportText, gestorName } = req.body;

    if (!reportText) {
      return res.status(400).json({ error: 'reportText é obrigatório' });
    }

    console.log('🤖 Iniciando análise de relatório com Gemini AI...');
    console.log('📝 Tamanho do texto:', reportText.length, 'caracteres');

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

    console.log('🔑 API Key presente?', !!apiKey);
    console.log('🤖 Chamando Gemini API...');
    
    // Sintaxe CORRETA do @google/generative-ai
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Resposta recebida da API!');
    console.log('📝 Resposta da IA (primeiros 200 caracteres):', text.substring(0, 200) + '...');

    // Extrair JSON da resposta
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
    
    if (!jsonMatch) {
      console.error('❌ Resposta da IA não contém JSON válido!');
      console.error('📄 Resposta completa:', text);
      throw new Error('Resposta da IA não contém JSON válido');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const analysis = JSON.parse(jsonText);

    console.log(`✅ ${analysis.results.length} consultores identificados pela IA Gemini`);

    return res.status(200).json(analysis);

  } catch (error: any) {
    console.error('❌ Erro ao analisar relatório:', error);
    console.error('📋 Mensagem:', error.message);
    console.error('📋 Stack:', error.stack);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Erro ao processar relatório',
      details: error.toString(),
      timestamp: new Date().toISOString()
    });
  }
}
