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

      // ✅ NOVA ACTION: Extração de CV com IA (RAISA)
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

// ========================================
// EXTRAÇÃO DE CV (RAISA - Banco de Talentos)
// ========================================

// ========================================
// EXTRAÇÃO DE REQUISITOS E STACKS DA VAGA (NOVO!)
// ========================================

async function extrairRequisitosVaga(descricao: string, titulo?: string) {
  console.log('🤖 [Gemini] Extraindo requisitos da vaga...');
  console.log('📌 Título:', titulo || '(não informado)');

  if (!descricao || descricao.trim().length < 50) {
    return {
      sucesso: false,
      erro: 'Descrição muito curta. Forneça mais detalhes sobre a vaga.'
    };
  }

  // ✅ Combinar título + descrição para análise completa
  const textoCompleto = `${titulo || ''}\n\n${descricao}`;

  const prompt = `Você é um **Especialista em Análise de Vagas de TI** com 15 anos de experiência em recrutamento SAP e tecnologias.

TAREFA: Analise a descrição da vaga e extraia informações estruturadas.

${titulo ? `**TÍTULO DA VAGA:** ${titulo}` : ''}

**DESCRIÇÃO COMPLETA DA VAGA:**
==================
${descricao}
==================

**INSTRUÇÕES DETALHADAS:**

1. **REQUISITOS OBRIGATÓRIOS:**
   - Identifique TODOS os requisitos que são obrigatórios/mandatórios
   - Inclua experiências mínimas exigidas (anos, certificações)
   - Inclua formação acadêmica se exigida
   - Inclua soft skills mandatórias
   - Formate como lista clara e concisa

2. **REQUISITOS DESEJÁVEIS:**
   - Identifique requisitos que são diferenciais/desejáveis
   - Experiências que agregam mas não eliminam
   - Certificações adicionais
   - Conhecimentos complementares

3. **STACK TECNOLÓGICA (MUITO IMPORTANTE):**
   - Liste TODAS as tecnologias, ferramentas, linguagens, frameworks mencionados
   - **ATENÇÃO ESPECIAL PARA MÓDULOS SAP:** Extraia do TÍTULO e da DESCRIÇÃO todos os módulos SAP mencionados
   - **MÓDULOS SAP COMUNS:** PP, SD, MM, FI, CO, WM, EWM, QM, PM, PS, HR/HCM, ABAP, BASIS, HANA, BW, BI, CRM, SRM, APO, TM, GTS, LE, CS, Ariba, SuccessFactors, S/4HANA, ECC, R/3
   - Se o título menciona "SAP PP" ou "Analista SAP MM", extraia "SAP PP" ou "SAP MM" como stack
   - Normalize os nomes: "sap pp" -> "SAP PP", "sap-mm" -> "SAP MM"
   - Inclua variações: "SAP PP/MM" deve gerar ["SAP PP", "SAP MM"]
   
4. **INFORMAÇÕES ADICIONAIS:**
   - Modalidade (Remoto/Híbrido/Presencial)
   - Regime de contratação (PJ/CLT)
   - Valor/Hora ou Salário se mencionado
   - Prazo de entrega/Data limite
   - Tipo de projeto (Sustentação, Novo Projeto, Roll out, etc.)

**RESPONDA APENAS EM JSON VÁLIDO:**
{
  "requisitos_obrigatorios": "• Requisito 1\\n• Requisito 2\\n• Requisito 3",
  "requisitos_desejaveis": "• Desejável 1\\n• Desejável 2",
  "stack_tecnologica": [
    {"nome": "SAP PP", "categoria": "sap_modulo"},
    {"nome": "SAP MM", "categoria": "sap_modulo"},
    {"nome": "S/4HANA", "categoria": "sap_plataforma"},
    {"nome": "ABAP", "categoria": "sap_linguagem"},
    {"nome": "React", "categoria": "frontend"},
    {"nome": "Node.js", "categoria": "backend"}
  ],
  "informacoes_extraidas": {
    "modalidade": "Remoto",
    "regime_contratacao": "PJ",
    "valor_hora": 110.00,
    "prazo_fechamento": "2025-01-28",
    "tipo_projeto": "Roll out",
    "senioridade_detectada": "Senior"
  },
  "confianca_extracao": 85,
  "observacoes": ["Descrição bem detalhada", "Módulo SAP PP identificado no título"]
}

**REGRAS IMPORTANTES:**
- Se não encontrar informação, use null (não invente)
- Separe claramente obrigatórios de desejáveis
- **PRIORIZE a extração de módulos SAP do título e descrição**
- Normalize nomes de tecnologias (capitalização correta)
- Use bullet points (•) nos requisitos para melhor formatação
- Valor/hora deve ser número, não string`;

  try {
    const result = await ai.models.generateContent({ 
      model: 'gemini-2.0-flash-exp', 
      contents: prompt 
    });
    
    const text = result.text || '';
    console.log('🤖 Resposta da IA recebida');

    // Limpar e parsear JSON
    const jsonClean = text
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const dadosExtraidos = JSON.parse(jsonClean);
      console.log('✅ Requisitos extraídos com sucesso');
      
      // Formatar stacks como array simples de strings para compatibilidade
      let stacksFormatadas = dadosExtraidos.stack_tecnologica?.map((s: any) => 
        typeof s === 'string' ? s : s.nome
      ) || [];

      // ✅ PÓS-PROCESSAMENTO: Detectar módulos SAP do título e descrição
      const modulosSAPDetectados = detectarModulosSAP(titulo || '', descricao);
      console.log('🔍 Módulos SAP detectados por regex:', modulosSAPDetectados);
      
      // Combinar módulos detectados com stacks da IA (sem duplicatas)
      const stacksUnicas = [...new Set([...modulosSAPDetectados, ...stacksFormatadas])];
      
      return {
        sucesso: true,
        requisitos_obrigatorios: dadosExtraidos.requisitos_obrigatorios || null,
        requisitos_desejaveis: dadosExtraidos.requisitos_desejaveis || null,
        stack_tecnologica: stacksUnicas,
        stack_detalhada: dadosExtraidos.stack_tecnologica || [],
        informacoes_extraidas: dadosExtraidos.informacoes_extraidas || {},
        confianca: dadosExtraidos.confianca_extracao || 70,
        observacoes: dadosExtraidos.observacoes || [],
        modulos_sap_detectados: modulosSAPDetectados
      };
    } catch (parseError) {
      console.error('❌ Erro ao parsear JSON:', parseError);
      
      // Tentar extrair JSON do texto
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const dadosExtraidos = JSON.parse(jsonMatch[0]);
        let stacksFormatadas = dadosExtraidos.stack_tecnologica?.map((s: any) => 
          typeof s === 'string' ? s : s.nome
        ) || [];

        // ✅ PÓS-PROCESSAMENTO: Detectar módulos SAP do título e descrição
        const modulosSAPDetectados = detectarModulosSAP(titulo || '', descricao);
        const stacksUnicas = [...new Set([...modulosSAPDetectados, ...stacksFormatadas])];

        return {
          sucesso: true,
          requisitos_obrigatorios: dadosExtraidos.requisitos_obrigatorios || null,
          requisitos_desejaveis: dadosExtraidos.requisitos_desejaveis || null,
          stack_tecnologica: stacksUnicas,
          stack_detalhada: dadosExtraidos.stack_tecnologica || [],
          informacoes_extraidas: dadosExtraidos.informacoes_extraidas || {},
          confianca: dadosExtraidos.confianca_extracao || 60,
          observacoes: ['Parsing com fallback'],
          modulos_sap_detectados: modulosSAPDetectados
        };
      }
      
      throw new Error('Falha ao parsear resposta da IA');
    }
  } catch (error: any) {
    console.error('❌ Erro na extração:', error);
    
    // ✅ FALLBACK: Mesmo com erro da IA, tentar detectar módulos SAP
    const modulosSAPDetectados = detectarModulosSAP(titulo || '', descricao);
    if (modulosSAPDetectados.length > 0) {
      return {
        sucesso: true,
        requisitos_obrigatorios: null,
        requisitos_desejaveis: null,
        stack_tecnologica: modulosSAPDetectados,
        stack_detalhada: [],
        informacoes_extraidas: {},
        confianca: 40,
        observacoes: ['Extração parcial - apenas módulos SAP detectados'],
        modulos_sap_detectados: modulosSAPDetectados
      };
    }
    
    return {
      sucesso: false,
      erro: error.message || 'Erro ao processar descrição'
    };
  }
}

/**
 * ✅ FUNÇÃO AUXILIAR: Detecta módulos SAP do título e descrição usando regex
 */
function detectarModulosSAP(titulo: string, descricao: string): string[] {
  const textoCompleto = `${titulo} ${descricao}`.toUpperCase();
  
  // Lista completa de módulos SAP
  const modulosSAP = [
    // Módulos principais ECC/S4
    'PP', 'SD', 'MM', 'FI', 'CO', 'WM', 'EWM', 'QM', 'PM', 'PS', 'HR', 'HCM',
    'LE', 'CS', 'TR', 'RE', 'IM', 'EC', 'CA', 'IS',
    // Técnicos
    'ABAP', 'BASIS', 'BC', 'PI', 'PO', 'XI', 'BTP', 'CPI', 'FIORI',
    // Analytics & Data
    'BW', 'BI', 'BPC', 'BOBJ', 'SAC', 'HANA', 'BW/4HANA',
    // Cloud & Específicos
    'CRM', 'SRM', 'APO', 'SCM', 'TM', 'GTS', 'EHS', 'PLM', 'MES',
    'ARIBA', 'SUCCESSFACTORS', 'CONCUR', 'FIELDGLASS',
    // Plataformas
    'S/4HANA', 'S4HANA', 'ECC', 'R/3', 'R3'
  ];
  
  const detectados: string[] = [];
  
  for (const modulo of modulosSAP) {
    // Padrões de busca mais flexíveis
    const patterns = [
      new RegExp(`\\bSAP\\s*${modulo}\\b`, 'i'),           // "SAP PP", "SAP MM"
      new RegExp(`\\bSAP[\\s-]*${modulo}\\b`, 'i'),        // "SAP-PP", "SAP PP"
      new RegExp(`\\b${modulo}[\\s-]*SAP\\b`, 'i'),        // "PP SAP"
      new RegExp(`\\b${modulo}\\b(?=.*SAP|SAP.*)`, 'i'),   // PP em contexto SAP
    ];
    
    // Para módulos de 2-3 letras, exigir contexto SAP
    if (modulo.length <= 3) {
      // Verificar se SAP está no texto e o módulo aparece
      if (textoCompleto.includes('SAP') && 
          new RegExp(`\\b${modulo}\\b`).test(textoCompleto)) {
        const formatado = `SAP ${modulo}`;
        if (!detectados.includes(formatado)) {
          detectados.push(formatado);
        }
      }
    } else {
      // Módulos maiores podem ser detectados diretamente
      for (const pattern of patterns) {
        if (pattern.test(textoCompleto)) {
          // Normalizar nome
          let nomeNormalizado = modulo;
          if (modulo === 'S4HANA') nomeNormalizado = 'S/4HANA';
          if (modulo === 'R3') nomeNormalizado = 'R/3';
          if (modulo === 'SUCCESSFACTORS') nomeNormalizado = 'SuccessFactors';
          if (modulo === 'BW/4HANA') nomeNormalizado = 'BW/4HANA';
          
          const formatado = modulo.length > 4 ? nomeNormalizado : `SAP ${nomeNormalizado}`;
          if (!detectados.includes(formatado) && !detectados.includes(`SAP ${nomeNormalizado}`)) {
            detectados.push(formatado);
          }
          break;
        }
      }
    }
  }
  
  // Detectar combinações como "PP/MM" ou "FI/CO"
  const combos = textoCompleto.match(/\b(PP|SD|MM|FI|CO|WM|QM|PM|PS|HR)\s*[\/]\s*(PP|SD|MM|FI|CO|WM|QM|PM|PS|HR)\b/gi);
  if (combos) {
    for (const combo of combos) {
      const partes = combo.toUpperCase().split(/\s*\/\s*/);
      for (const parte of partes) {
        const formatado = `SAP ${parte}`;
        if (!detectados.includes(formatado)) {
          detectados.push(formatado);
        }
      }
    }
  }
  
  console.log(`🔍 Módulos SAP encontrados: ${detectados.join(', ') || 'nenhum'}`);
  return detectados;
}

async function extrairDadosCV(textoCV?: string, base64PDF?: string) {
  console.log('🤖 [Gemini] Iniciando extração de CV...');

  let textoParaAnalisar = textoCV || '';

  // Se recebeu PDF em base64, primeiro extrair o texto
  if (base64PDF && !textoCV) {
    console.log('📄 Extraindo texto do PDF...');
    
    const resultPDF = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
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
            text: 'Extraia todo o texto deste currículo/CV em PDF. Mantenha a estrutura e formatação. Retorne apenas o texto extraído, sem comentários adicionais.'
          }
        ]
      }]
    });

    textoParaAnalisar = resultPDF.text || '';
    console.log(`📄 Texto extraído: ${textoParaAnalisar.substring(0, 200)}...`);
  }

  if (!textoParaAnalisar) {
    throw new Error('Nenhum texto para analisar. Envie textoCV ou base64PDF.');
  }

  // Prompt para extração estruturada
  const prompt = `Você é um especialista em análise de currículos de TI. Analise o CV abaixo e extraia TODAS as informações estruturadas.

CURRÍCULO:
==================
${textoParaAnalisar}
==================

INSTRUÇÕES:
1. Extraia dados pessoais com cuidado (nome completo, email, telefone, LinkedIn)
2. Identifique o título profissional mais adequado
3. Detecte a senioridade baseada nas experiências (junior, pleno, senior, especialista)
4. Extraia TODAS as skills técnicas mencionadas
5. Liste todas as experiências profissionais
6. Liste toda formação acadêmica e certificações
7. Identifique idiomas e níveis

RESPONDA APENAS EM JSON VÁLIDO (sem markdown, sem backticks):
{
  "dados_pessoais": {
    "nome": "Nome Completo",
    "email": "email@exemplo.com",
    "telefone": "(11) 99999-9999",
    "linkedin_url": "https://linkedin.com/in/perfil",
    "cidade": "São Paulo",
    "estado": "SP"
  },
  "dados_profissionais": {
    "titulo_profissional": "Desenvolvedor Full Stack Senior",
    "senioridade": "senior",
    "resumo_profissional": "Resumo do perfil profissional em 2-3 frases"
  },
  "skills": [
    {
      "nome": "React",
      "categoria": "frontend",
      "nivel": "avancado",
      "anos_experiencia": 4
    }
  ],
  "experiencias": [
    {
      "empresa": "Nome da Empresa",
      "cargo": "Cargo Ocupado",
      "data_inicio": "2020-01",
      "data_fim": null,
      "atual": true,
      "descricao": "Descrição das atividades",
      "tecnologias": ["React", "Node.js"]
    }
  ],
  "formacao": [
    {
      "tipo": "graduacao",
      "curso": "Ciência da Computação",
      "instituicao": "Universidade XYZ",
      "ano_conclusao": 2018,
      "em_andamento": false
    }
  ],
  "idiomas": [
    {
      "idioma": "Inglês",
      "nivel": "avancado"
    }
  ]
}

REGRAS:
- Se não encontrar um dado, use string vazia "" ou null
- Categorias de skill: frontend, backend, database, devops, mobile, soft_skill, tool, other
- Níveis de skill: basico, intermediario, avancado, especialista
- Níveis de idioma: basico, intermediario, avancado, fluente, nativo
- Tipos de formação: graduacao, pos_graduacao, mba, mestrado, doutorado, tecnico, certificacao, curso_livre`;

  const result = await ai.models.generateContent({ 
    model: 'gemini-2.0-flash-exp', 
    contents: prompt 
  });
  
  const text = result.text || '';
  console.log('🤖 Resposta da IA recebida');

  // Limpar e parsear JSON
  const jsonClean = text
    .replace(/^```json\n?/i, '')
    .replace(/^```\n?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    const dadosExtraidos = JSON.parse(jsonClean);
    console.log('✅ CV extraído com sucesso:', dadosExtraidos.dados_pessoais?.nome);
    
    return {
      sucesso: true,
      dados: dadosExtraidos,
      texto_original: textoParaAnalisar
    };
  } catch (parseError) {
    console.error('❌ Erro ao parsear JSON:', parseError);
    
    // Tentar extrair JSON do texto
    const jsonMatch = text.match(/{[\s\S]*}/);
    if (jsonMatch) {
      const dadosExtraidos = JSON.parse(jsonMatch[0]);
      return {
        sucesso: true,
        dados: dadosExtraidos,
        texto_original: textoParaAnalisar
      };
    }
    
    throw new Error('Falha ao parsear resposta da IA');
  }
}

// ============================================
// ANÁLISE DE CV DO CANDIDATO COM CONTEXTO DA VAGA
// ============================================

interface AnaliseCVPayload {
  curriculo_texto: string;
  vaga: {
    titulo: string;
    descricao?: string;
    requisitos_obrigatorios?: string;
    requisitos_desejaveis?: string;
    stack_tecnologica?: string[];
    senioridade?: string;
    modalidade?: string;
  };
  candidato?: {
    nome: string;
    email?: string;
  };
}

async function analisarCVCandidatura(payload: AnaliseCVPayload) {
  console.log('🤖 [Gemini] Analisando CV do candidato com contexto da vaga...');

  const { curriculo_texto, vaga, candidato } = payload;

  if (!curriculo_texto || curriculo_texto.trim().length < 50) {
    return {
      sucesso: false,
      erro: 'Texto do currículo muito curto ou não disponível.'
    };
  }

  const prompt = `Você é um **Especialista Sênior em Recrutamento de TI** com 15 anos de experiência.

TAREFA: Analise o currículo do candidato em relação à vaga específica e forneça uma análise completa.

============================================
DADOS DA VAGA
============================================
**Título:** ${vaga.titulo}
**Senioridade Esperada:** ${vaga.senioridade || 'Não especificada'}
**Modalidade:** ${vaga.modalidade || 'Não especificada'}

**Descrição:**
${vaga.descricao || 'Não informada'}

**Requisitos Obrigatórios:**
${vaga.requisitos_obrigatorios || 'Não especificados'}

**Requisitos Desejáveis:**
${vaga.requisitos_desejaveis || 'Não especificados'}

**Stack Tecnológica:**
${vaga.stack_tecnologica?.join(', ') || 'Não especificada'}

============================================
CURRÍCULO DO CANDIDATO
============================================
${candidato?.nome ? `**Nome:** ${candidato.nome}` : ''}

${curriculo_texto}

============================================
INSTRUÇÕES DE ANÁLISE
============================================

1. **SCORE DE COMPATIBILIDADE (0-100):**
   - Avalie o quanto o candidato atende aos requisitos da vaga
   - Considere: skills técnicas, experiência, senioridade, soft skills

2. **RISCO DE REPROVAÇÃO (0-100):**
   - Estime a probabilidade do candidato ser reprovado
   - Considere: gaps no CV, job hopping, skills desatualizadas, senioridade inadequada

3. **FATORES DE RISCO:**
   - Identifique padrões preocupantes no CV
   - Tipos: job_hopping, gap_emprego, skills_desatualizadas, senioridade_inadequada, experiencia_insuficiente, formacao_inadequada, inconsistencias

4. **PONTOS FORTES:**
   - Liste as qualidades que se destacam para esta vaga específica

5. **PONTOS DE ATENÇÃO:**
   - Liste aspectos que precisam ser verificados na entrevista

6. **SKILLS MATCH:**
   - Compare as skills do candidato com as exigidas pela vaga
   - Liste matches e gaps

7. **RECOMENDAÇÃO FINAL:**
   - aprovar: Candidato adequado para a vaga
   - entrevistar: Potencial, mas precisa de entrevista para confirmar
   - revisar: Algumas ressalvas importantes
   - rejeitar: Não atende os requisitos mínimos

**RESPONDA APENAS EM JSON VÁLIDO:**
{
  "score_compatibilidade": 75,
  "risco_reprovacao": 25,
  "nivel_risco": "Baixo",
  "recomendacao": "entrevistar",
  "justificativa": "Candidato possui boa experiência em...",
  "fatores_risco": [
    {
      "tipo": "gap_emprego",
      "nivel": "medium",
      "descricao": "Gap de 8 meses entre 2022-2023",
      "evidencia": "Último emprego encerrou em março/2022...",
      "peso": 15
    }
  ],
  "pontos_fortes": [
    "5 anos de experiência com React",
    "Trabalhou em projetos de grande escala",
    "Certificação AWS"
  ],
  "pontos_atencao": [
    "Verificar motivo do gap de emprego",
    "Confirmar nível de inglês"
  ],
  "skills_match": {
    "atendidas": ["React", "Node.js", "TypeScript"],
    "parciais": ["AWS - certificação mas pouca prática"],
    "faltantes": ["Kubernetes", "GraphQL"]
  },
  "senioridade_analise": {
    "esperada": "Senior",
    "detectada": "Pleno-Senior",
    "compativel": true
  },
  "experiencia_relevante": {
    "anos_total": 6,
    "anos_relevantes": 4,
    "projetos_similares": true
  },
  "perguntas_entrevista": [
    "Qual foi o motivo da saída da empresa X?",
    "Pode detalhar sua experiência com AWS em produção?"
  ],
  "confianca_analise": 85
}

**REGRAS:**
- Scores devem ser números inteiros de 0 a 100
- nivel_risco: "Baixo" (0-30), "Médio" (31-50), "Alto" (51-70), "Crítico" (71-100)
- recomendacao: "aprovar", "entrevistar", "revisar" ou "rejeitar"
- Se não identificar riscos, retorne array vazio em fatores_risco
- Seja específico nas evidências, citando partes do CV`;

  try {
    const startTime = Date.now();
    
    const result = await ai.models.generateContent({ 
      model: 'gemini-2.0-flash-exp', 
      contents: prompt 
    });
    
    const tempoAnalise = Date.now() - startTime;
    const text = result.text || '';
    console.log(`🤖 Análise concluída em ${tempoAnalise}ms`);

    // Limpar e parsear JSON
    const jsonClean = text
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const analise = JSON.parse(jsonClean);
      console.log('✅ Análise de CV parseada com sucesso');
      
      return {
        sucesso: true,
        ...analise,
        tempo_analise_ms: tempoAnalise,
        modelo_ia: 'Gemini 2.0 Flash'
      };
    } catch (parseError) {
      console.error('❌ Erro ao parsear JSON:', parseError);
      
      // Tentar extrair JSON do texto
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const analise = JSON.parse(jsonMatch[0]);
        return {
          sucesso: true,
          ...analise,
          tempo_analise_ms: tempoAnalise,
          modelo_ia: 'Gemini 2.0 Flash'
        };
      }
      
      throw new Error('Falha ao parsear resposta da IA');
    }
  } catch (error: any) {
    console.error('❌ Erro na análise de CV:', error);
    return {
      sucesso: false,
      erro: error.message || 'Erro ao analisar currículo'
    };
  }
}

// ============================================
// TRIAGEM GENÉRICA DE CV (SEM CONTEXTO DE VAGA)
// ============================================

async function triagemCVGenerica(curriculo_texto: string) {
  console.log('🤖 [Gemini] Triagem genérica de CV...');

  if (!curriculo_texto || curriculo_texto.trim().length < 50) {
    return {
      sucesso: false,
      erro: 'Texto do currículo muito curto ou não disponível.'
    };
  }

  const prompt = `Você é um **Especialista Sênior em Recrutamento de TI** com 15 anos de experiência.

TAREFA: Analise o currículo abaixo e forneça uma triagem completa para determinar se o candidato deve ser adicionado ao banco de talentos.

============================================
CURRÍCULO
============================================
${curriculo_texto}

============================================
INSTRUÇÕES DE ANÁLISE
============================================

1. **SCORE GERAL (0-100):**
   - Avalie a qualidade geral do perfil
   - Considere: clareza do CV, experiência, skills, formação

2. **NÍVEL DE RISCO:**
   - Baixo (0-30), Médio (31-50), Alto (51-70), Crítico (71-100)

3. **FATORES DE RISCO:**
   - Identifique padrões preocupantes
   - Tipos: job_hopping, gap_emprego, skills_desatualizadas, experiencia_curta, inconsistencias

4. **INFORMAÇÕES DETECTADAS:**
   - Senioridade estimada
   - Anos de experiência
   - Áreas de atuação
   - Skills técnicas

5. **PONTOS FORTES E FRACOS**

6. **RECOMENDAÇÃO:**
   - banco_talentos: Perfil bom, adicionar à base (score >= 70)
   - analisar_mais: Potencial, mas precisa de mais informações (score 50-69)
   - descartar: Não atende requisitos mínimos (score < 50)

**RESPONDA APENAS EM JSON VÁLIDO:**
{
  "sucesso": true,
  "score_geral": 75,
  "nivel_risco": "Baixo",
  "recomendacao": "banco_talentos",
  "justificativa": "Candidato com perfil sólido em desenvolvimento...",
  "fatores_risco": [
    {
      "tipo": "gap_emprego",
      "nivel": "low",
      "descricao": "Pequeno gap de 3 meses em 2022",
      "evidencia": "Entre empresa X e Y"
    }
  ],
  "pontos_fortes": [
    "5 anos de experiência com tecnologias modernas",
    "Progressão de carreira consistente"
  ],
  "pontos_fracos": [
    "Falta certificações oficiais",
    "Inglês não mencionado"
  ],
  "skills_detectadas": ["React", "Node.js", "TypeScript", "AWS"],
  "experiencia_anos": 5,
  "senioridade_estimada": "Pleno",
  "areas_atuacao": ["Desenvolvimento Web", "Backend", "Cloud"]
}

**REGRAS:**
- score_geral: número inteiro de 0 a 100
- nivel_risco: "Baixo", "Médio", "Alto" ou "Crítico"
- recomendacao: "banco_talentos", "analisar_mais" ou "descartar"
- Se não identificar riscos, retorne array vazio em fatores_risco
- Seja específico e objetivo`;

  try {
    const startTime = Date.now();
    
    const result = await ai.models.generateContent({ 
      model: 'gemini-2.0-flash-exp', 
      contents: prompt 
    });
    
    const tempoAnalise = Date.now() - startTime;
    const text = result.text || '';
    console.log(`🤖 Triagem concluída em ${tempoAnalise}ms`);

    // Limpar e parsear JSON
    const jsonClean = text
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const analise = JSON.parse(jsonClean);
      console.log('✅ Triagem de CV parseada com sucesso');
      
      return {
        sucesso: true,
        ...analise,
        tempo_analise_ms: tempoAnalise,
        modelo_ia: 'Gemini 2.0 Flash'
      };
    } catch (parseError) {
      console.error('❌ Erro ao parsear JSON:', parseError);
      
      // Tentar extrair JSON do texto
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const analise = JSON.parse(jsonMatch[0]);
        return {
          sucesso: true,
          ...analise,
          tempo_analise_ms: tempoAnalise,
          modelo_ia: 'Gemini 2.0 Flash'
        };
      }
      
      throw new Error('Falha ao parsear resposta da IA');
    }
  } catch (error: any) {
    console.error('❌ Erro na triagem de CV:', error);
    return {
      sucesso: false,
      erro: error.message || 'Erro ao analisar currículo'
    };
  }
}
