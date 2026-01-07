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

      // ✅ NOVA ACTION: Extração de Requisitos e Stacks da Descrição
      case 'extrair_requisitos_vaga':
        result = await extrairRequisitosVaga(payload.descricao, payload.titulo);
        break;

      // ✅ OTIMIZADO: Extração de CV com IA (RAISA) - UMA ÚNICA CHAMADA
      case 'extrair_cv':
        result = await extrairDadosCV(payload.textoCV, payload.base64PDF);
        break;

      // ✅ NOVA ACTION: Análise de CV do Candidato com contexto da Vaga
      case 'analisar_cv_candidatura':
        result = await analisarCVCandidatura(payload);
        break;

      // ✅ NOVA ACTION: Triagem genérica de CV (sem contexto de vaga)
      case 'triagem_cv_generica':
        result = await triagemCVGenerica(payload.curriculo_texto);
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

  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
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

  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
  const text = result.text || '';

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response.');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}

async function generateContent(model: string, prompt: string) {
  const result = await ai.models.generateContent({ model: model || 'gemini-2.0-flash', contents: prompt });
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

**RESPONDA EM JSON:**
{
  "sugestoes": {
    "titulo": { "sugerido": "...", "motivo": "...", "prioridade": "alta|media|baixa" },
    "descricao": { "sugerido": "...", "motivo": "...", "prioridade": "alta|media|baixa" },
    "keywords": ["keyword1", "keyword2"],
    "melhorias_gerais": ["Sugestão 1", "Sugestão 2"]
  },
  "confidence_score": 75
}
`;

  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
  const text = result.text || '';

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    return {
      sugestoes: { melhorias_gerais: ['Não foi possível analisar a vaga automaticamente.'] },
      confidence_score: 50
    };
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}

// ========================================
// EXTRAÇÃO DE REQUISITOS DA VAGA
// ========================================

async function extrairRequisitosVaga(descricao: string, titulo?: string) {
  console.log('🤖 [Gemini] Extraindo requisitos da vaga...');

  if (!descricao || descricao.trim().length < 50) {
    return {
      sucesso: false,
      erro: 'Descrição muito curta. Forneça mais detalhes sobre a vaga.'
    };
  }

  const prompt = `Extraia requisitos desta vaga de TI.

${titulo ? `TÍTULO: ${titulo}` : ''}

DESCRIÇÃO:
${descricao}

RESPONDA EM JSON:
{
  "requisitos_obrigatorios": "• Req 1\\n• Req 2",
  "requisitos_desejaveis": "• Des 1\\n• Des 2",
  "stack_tecnologica": [{"nome": "Tech1", "categoria": "backend"}],
  "informacoes_extraidas": {
    "modalidade": "Remoto|Híbrido|Presencial",
    "regime_contratacao": "PJ|CLT",
    "senioridade_detectada": "Junior|Pleno|Senior"
  },
  "confianca_extracao": 85
}`;

  try {
    const result = await ai.models.generateContent({ 
      model: 'gemini-2.0-flash', 
      contents: prompt 
    });
    
    const text = result.text || '';
    const jsonClean = text.replace(/^```json\n?/i, '').replace(/```$/i, '').trim();

    try {
      const dadosExtraidos = JSON.parse(jsonClean);
      
      // Pós-processamento: Detectar módulos SAP do título/descrição
      const modulosSAPDetectados = detectarModulosSAP(titulo || '', descricao);
      
      // Formatar stacks
      let stacksFormatadas = dadosExtraidos.stack_tecnologica?.map((s: any) => 
        typeof s === 'string' ? s : s.nome
      ) || [];
      
      // Combinar com módulos detectados
      const stacksUnicas = [...new Set([...modulosSAPDetectados, ...stacksFormatadas])];
      
      return { 
        sucesso: true, 
        ...dadosExtraidos,
        stack_tecnologica: stacksUnicas
      };
    } catch {
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        return { sucesso: true, ...JSON.parse(jsonMatch[0]) };
      }
      throw new Error('Falha ao parsear resposta');
    }
  } catch (error: any) {
    console.error('❌ Erro na extração:', error);
    return { sucesso: false, erro: error.message };
  }
}

// ========================================
// DETECÇÃO DE MÓDULOS SAP (AUXILIAR)
// ========================================

function detectarModulosSAP(titulo: string, descricao: string): string[] {
  const textoCompleto = `${titulo} ${descricao}`.toUpperCase();
  
  const modulosSAP = [
    'PP', 'SD', 'MM', 'FI', 'CO', 'WM', 'EWM', 'QM', 'PM', 'PS', 'HR', 'HCM',
    'LE', 'CS', 'TR', 'RE', 'IM', 'EC', 'CA', 'IS',
    'ABAP', 'BASIS', 'BC', 'PI', 'PO', 'XI', 'BTP', 'CPI', 'FIORI',
    'BW', 'BI', 'BPC', 'BOBJ', 'SAC', 'HANA', 'BW/4HANA',
    'CRM', 'SRM', 'APO', 'SCM', 'TM', 'GTS', 'EHS', 'PLM', 'MES',
    'ARIBA', 'SUCCESSFACTORS', 'CONCUR', 'FIELDGLASS',
    'S/4HANA', 'S4HANA', 'ECC', 'R/3', 'R3'
  ];
  
  const detectados: string[] = [];
  
  for (const modulo of modulosSAP) {
    if (modulo.length <= 3) {
      if (textoCompleto.includes('SAP') && new RegExp(`\\b${modulo}\\b`).test(textoCompleto)) {
        const formatado = `SAP ${modulo}`;
        if (!detectados.includes(formatado)) detectados.push(formatado);
      }
    } else {
      const patterns = [
        new RegExp(`\\bSAP\\s*${modulo}\\b`, 'i'),
        new RegExp(`\\b${modulo}\\b`, 'i'),
      ];
      for (const pattern of patterns) {
        if (pattern.test(textoCompleto)) {
          let nome = modulo;
          if (modulo === 'S4HANA') nome = 'S/4HANA';
          if (modulo === 'R3') nome = 'R/3';
          if (modulo === 'SUCCESSFACTORS') nome = 'SuccessFactors';
          const formatado = modulo.length > 4 ? nome : `SAP ${nome}`;
          if (!detectados.includes(formatado)) detectados.push(formatado);
          break;
        }
      }
    }
  }
  
  return detectados;
}

// ========================================
// ✅ EXTRAÇÃO DE CV OTIMIZADA (UMA ÚNICA CHAMADA)
// ========================================

async function extrairDadosCV(textoCV?: string, base64PDF?: string) {
  console.log('🤖 [Gemini] Iniciando extração OTIMIZADA de CV...');
  const startTime = Date.now();

  // Estrutura padrão para retorno em caso de erro
  const dadosVazios = {
    dados_pessoais: {
      nome: '',
      email: '',
      telefone: '',
      linkedin_url: '',
      cidade: '',
      estado: ''
    },
    dados_profissionais: {
      titulo_profissional: '',
      senioridade: 'pleno',
      resumo_profissional: ''
    },
    skills: [],
    experiencias: [],
    formacao: [],
    idiomas: []
  };

  // Prompt para extração de dados estruturados (SEM texto completo para evitar JSON grande)
  const promptExtracao = `Você é um especialista em análise de currículos. Extraia os dados do CV abaixo em JSON.

RESPONDA APENAS EM JSON VÁLIDO (sem markdown, sem backticks):
{
  "dados_pessoais": {
    "nome": "Nome Completo",
    "email": "email@email.com",
    "telefone": "(11) 99999-9999",
    "linkedin_url": "https://linkedin.com/in/...",
    "cidade": "São Paulo",
    "estado": "SP"
  },
  "dados_profissionais": {
    "titulo_profissional": "Cargo atual ou mais recente",
    "senioridade": "junior|pleno|senior|especialista",
    "resumo_profissional": "Resumo em 1-2 frases"
  },
  "skills": [
    {"nome": "React", "categoria": "frontend", "nivel": "avancado", "anos_experiencia": 3}
  ],
  "experiencias": [
    {"empresa": "Empresa", "cargo": "Cargo", "data_inicio": "2020-01", "data_fim": null, "atual": true, "descricao": "Descrição breve", "tecnologias": ["Tech1"]}
  ],
  "formacao": [
    {"tipo": "graduacao", "curso": "Curso", "instituicao": "Instituição", "ano_conclusao": 2020, "em_andamento": false}
  ],
  "idiomas": [
    {"idioma": "Inglês", "nivel": "avancado"}
  ]
}

REGRAS: 
- Se não encontrar, use "" ou null
- Categorias: frontend, backend, database, devops, mobile, soft_skill, tool, cloud, sap, other
- Níveis: basico, intermediario, avancado, especialista`;

  try {
    let textoOriginal = '';

    // ETAPA 1: Se for PDF, primeiro extrair o texto puro
    if (base64PDF) {
      console.log('📄 Etapa 1: Extraindo texto puro do PDF...');
      
      try {
        const resultTexto = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [{
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64PDF
                }
              },
              {
                text: 'Extraia TODO o texto deste currículo/CV em PDF. Retorne APENAS o texto extraído, sem formatação especial, sem JSON, sem comentários. Preserve quebras de linha usando \\n.'
              }
            ]
          }]
        });
        
        textoOriginal = resultTexto.text || '';
        console.log(`✅ Texto extraído: ${textoOriginal.length} caracteres`);
      } catch (errTexto: any) {
        console.warn('⚠️ Erro ao extrair texto do PDF:', errTexto.message);
        textoOriginal = '[Não foi possível extrair o texto do PDF]';
      }
    }

    // ETAPA 2: Analisar e estruturar os dados
    console.log('📊 Etapa 2: Analisando e estruturando dados...');
    
    let result;
    
    if (base64PDF) {
      result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64PDF
              }
            },
            {
              text: promptExtracao
            }
          ]
        }]
      });
    } else if (textoCV) {
      textoOriginal = textoCV;
      result = await ai.models.generateContent({ 
        model: 'gemini-2.0-flash',
        contents: `${promptExtracao}\n\nCURRÍCULO:\n${textoCV}`
      });
    } else {
      console.error('❌ Nenhum dado para processar');
      return {
        sucesso: false,
        dados: dadosVazios,
        texto_original: '',
        erro: 'Nenhum dado para processar. Envie textoCV ou base64PDF.'
      };
    }

    const tempoProcessamento = Date.now() - startTime;
    console.log(`⏱️ Tempo de processamento: ${tempoProcessamento}ms`);

    const text = result.text || '';
    console.log('🤖 Resposta recebida, parseando JSON...');
    console.log('📝 Primeiros 500 chars da resposta:', text.substring(0, 500));

    // Limpar e parsear JSON
    let jsonClean = text
      .replace(/^```json\n?/gi, '')
      .replace(/^```\n?/gi, '')
      .replace(/\n```$/gi, '')
      .replace(/```$/gi, '')
      .trim();

    // Tentar encontrar JSON no texto
    const jsonMatch = jsonClean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonClean = jsonMatch[0];
    }

    try {
      const dadosExtraidos = JSON.parse(jsonClean);
      console.log('✅ CV extraído com sucesso:', dadosExtraidos.dados_pessoais?.nome);
      
      // Garantir que todos os campos existam
      const dadosCompletos = {
        dados_pessoais: { ...dadosVazios.dados_pessoais, ...dadosExtraidos.dados_pessoais },
        dados_profissionais: { ...dadosVazios.dados_profissionais, ...dadosExtraidos.dados_profissionais },
        skills: dadosExtraidos.skills || [],
        experiencias: dadosExtraidos.experiencias || [],
        formacao: dadosExtraidos.formacao || [],
        idiomas: dadosExtraidos.idiomas || []
      };
      
      return {
        sucesso: true,
        dados: dadosCompletos,
        texto_original: textoOriginal,
        tempo_processamento_ms: tempoProcessamento
      };
    } catch (parseError: any) {
      console.error('❌ Erro ao parsear JSON:', parseError.message);
      console.error('📝 JSON que tentou parsear:', jsonClean.substring(0, 1000));
      
      // Retorna estrutura válida mesmo com erro
      return {
        sucesso: false,
        dados: dadosVazios,
        texto_original: textoOriginal,
        erro: 'Falha ao parsear resposta da IA: ' + parseError.message,
        tempo_processamento_ms: tempoProcessamento
      };
    }
  } catch (error: any) {
    console.error('❌ Erro na extração de CV:', error);
    // SEMPRE retorna estrutura válida
    return {
      sucesso: false,
      dados: dadosVazios,
      texto_original: '',
      erro: error.message || 'Erro ao processar CV',
      tempo_processamento_ms: Date.now() - startTime
    };
  }
}

// ========================================
// ANÁLISE DE CV COM CONTEXTO DA VAGA
// ========================================

async function analisarCVCandidatura(payload: any) {
  const { curriculo_texto, vaga_titulo, vaga_requisitos, vaga_stack } = payload;
  
  console.log('🤖 [Gemini] Analisando CV para candidatura...');

  if (!curriculo_texto) {
    return { sucesso: false, erro: 'Texto do currículo não fornecido' };
  }

  const prompt = `Analise este CV para a vaga especificada.

VAGA: ${vaga_titulo || 'Não especificada'}
REQUISITOS: ${vaga_requisitos || 'Não especificados'}
STACK: ${JSON.stringify(vaga_stack || [])}

CV:
${curriculo_texto.substring(0, 8000)}

RESPONDA EM JSON:
{
  "score_compatibilidade": 75,
  "risco_reprovacao": 25,
  "nivel_risco": "Baixo|Médio|Alto|Crítico",
  "recomendacao": "aprovar|entrevistar|revisar|rejeitar",
  "justificativa": "Resumo da análise",
  "pontos_fortes": ["Ponto 1", "Ponto 2"],
  "pontos_atencao": ["Atenção 1"],
  "skills_match": {
    "atendidas": ["Skill1"],
    "faltantes": ["Skill2"]
  }
}`;

  try {
    const result = await ai.models.generateContent({ 
      model: 'gemini-2.0-flash', 
      contents: prompt 
    });
    
    const text = result.text || '';
    const jsonClean = text.replace(/^```json\n?/i, '').replace(/```$/i, '').trim();

    try {
      const analise = JSON.parse(jsonClean);
      return { sucesso: true, ...analise };
    } catch {
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        return { sucesso: true, ...JSON.parse(jsonMatch[0]) };
      }
      throw new Error('Falha ao parsear');
    }
  } catch (error: any) {
    console.error('❌ Erro na análise:', error);
    return { sucesso: false, erro: error.message };
  }
}

// ========================================
// TRIAGEM GENÉRICA DE CV
// ========================================

async function triagemCVGenerica(curriculo_texto: string) {
  console.log('🤖 [Gemini] Triagem genérica de CV...');

  if (!curriculo_texto || curriculo_texto.trim().length < 50) {
    return { sucesso: false, erro: 'Texto do currículo muito curto.' };
  }

  const prompt = `Faça triagem deste CV para banco de talentos de TI.

CV:
${curriculo_texto.substring(0, 8000)}

RESPONDA EM JSON:
{
  "sucesso": true,
  "score_geral": 75,
  "nivel_risco": "Baixo|Médio|Alto|Crítico",
  "recomendacao": "banco_talentos|analisar_mais|descartar",
  "justificativa": "Resumo",
  "pontos_fortes": ["Ponto 1"],
  "pontos_fracos": ["Fraco 1"],
  "skills_detectadas": ["Skill1", "Skill2"],
  "experiencia_anos": 5,
  "senioridade_estimada": "Pleno"
}`;

  try {
    const result = await ai.models.generateContent({ 
      model: 'gemini-2.0-flash', 
      contents: prompt 
    });
    
    const text = result.text || '';
    const jsonClean = text.replace(/^```json\n?/i, '').replace(/```$/i, '').trim();

    try {
      return JSON.parse(jsonClean);
    } catch {
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Falha ao parsear');
    }
  } catch (error: any) {
    console.error('❌ Erro na triagem:', error);
    return { sucesso: false, erro: error.message };
  }
}
