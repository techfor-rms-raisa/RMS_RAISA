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
  console.log('🤖 [Gemini] Iniciando extração de CV em múltiplas etapas...');
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
    certificacoes: [],
    idiomas: []
  };

  try {
    let textoOriginal = '';

    // ========================================
    // ETAPA 1: Extrair texto do PDF (para salvar)
    // ========================================
    if (base64PDF) {
      console.log('📄 ETAPA 1: Extraindo texto do PDF...');
      
      try {
        const resultTexto = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: base64PDF } },
              { text: 'Extraia TODO o texto deste currículo. Retorne APENAS o texto, sem formatação, sem JSON.' }
            ]
          }]
        });
        
        textoOriginal = resultTexto.text || '';
        console.log(`✅ Texto extraído: ${textoOriginal.length} caracteres`);
      } catch (errTexto: any) {
        console.warn('⚠️ Erro ao extrair texto:', errTexto.message);
        textoOriginal = '';
      }
    } else if (textoCV) {
      textoOriginal = textoCV;
    } else {
      return { sucesso: false, dados: dadosVazios, texto_original: '', erro: 'Nenhum dado para processar.' };
    }

    // ========================================
    // ETAPAS 2, 3, 4: Extrações PARALELAS
    // ========================================
    console.log('🚀 ETAPAS 2-4: Extraindo dados em paralelo...');

    // Conteúdo para análise (PDF ou texto)
    const criarConteudo = (prompt: string) => {
      if (base64PDF) {
        return [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64PDF } },
            { text: prompt }
          ]
        }];
      } else {
        return prompt + '\n\nCURRÍCULO:\n' + textoOriginal;
      }
    };

    // ETAPA 2: Dados pessoais + profissionais + idiomas
    const promptPessoais = `Analise este currículo e extraia dados pessoais, profissionais e idiomas em JSON válido (sem markdown, sem backticks).

Retorne APENAS este JSON:
{
  "dados_pessoais": {"nome":"","email":"","telefone":"","linkedin_url":"","cidade":"","estado":""},
  "dados_profissionais": {"titulo_profissional":"","senioridade":"junior|pleno|senior|especialista","resumo_profissional":""},
  "idiomas": [{"idioma":"","nivel":"basico|intermediario|avancado|fluente"}]
}`;

    // ETAPA 3: Skills/tecnologias
    const promptSkills = `Analise este currículo e extraia TODAS as skills e tecnologias em JSON válido (sem markdown, sem backticks).

Extraia TODAS: linguagens (Java, Python, C#), frameworks (Spring, React), clouds (AWS, GCP, Azure e serviços), bancos de dados, ferramentas, metodologias.

Retorne APENAS este JSON:
{
  "skills": [{"nome":"","categoria":"frontend|backend|database|devops|cloud|mobile|sap|methodology|tool|other","nivel":"basico|intermediario|avancado|especialista","anos_experiencia":0}]
}`;

    // ETAPA 4: Experiências + Formação + Certificações
    const promptExperiencias = `Analise este currículo e extraia TODAS as experiências profissionais, formação e certificações em JSON válido (sem markdown, sem backticks).

⚠️ MUITO IMPORTANTE: 
- Liste CADA experiência profissional SEPARADAMENTE
- Inclua TODAS as empresas onde trabalhou
- Use formato de data YYYY-MM (ex: 2021-09)
- Se "Atual", use data_fim: null e atual: true

Retorne APENAS este JSON:
{
  "experiencias": [
    {"empresa":"Banco BV","cargo":"Arquiteto de Tecnologia Sênior","data_inicio":"2021-09","data_fim":null,"atual":true,"descricao":"Descrição das atividades","tecnologias":["GCP","Apigee"]},
    {"empresa":"Itaú Unibanco","cargo":"Tech Lead","data_inicio":"2020-10","data_fim":"2021-08","atual":false,"descricao":"Descrição","tecnologias":["AWS"]}
  ],
  "formacao": [{"tipo":"graduacao|pos_graduacao|mba|mestrado|tecnico|bootcamp","curso":"","instituicao":"","ano_conclusao":2020,"em_andamento":false}],
  "certificacoes": [{"nome":"","emissor":"","ano":2023}]
}`;

    // Executar em PARALELO
    const [resultPessoais, resultSkills, resultExperiencias] = await Promise.all([
      ai.models.generateContent({ model: 'gemini-2.0-flash', contents: criarConteudo(promptPessoais) }),
      ai.models.generateContent({ model: 'gemini-2.0-flash', contents: criarConteudo(promptSkills) }),
      ai.models.generateContent({ model: 'gemini-2.0-flash', contents: criarConteudo(promptExperiencias) })
    ]);

    const tempoProcessamento = Date.now() - startTime;
    console.log(`⏱️ Tempo total: ${tempoProcessamento}ms`);

    // ========================================
    // ETAPA 5: Combinar resultados
    // ========================================
    console.log('🔗 ETAPA 5: Combinando resultados...');

    const parseJSON = (text: string, fallback: any, label: string) => {
      try {
        console.log(`📝 [${label}] Resposta (primeiros 300 chars):`, text?.substring(0, 300));
        const clean = text.replace(/```json\n?/gi, '').replace(/```/gi, '').trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          console.log(`✅ [${label}] JSON parseado com sucesso`);
          return parsed;
        }
        console.warn(`⚠️ [${label}] Não encontrou JSON válido`);
        return fallback;
      } catch (err: any) {
        console.error(`❌ [${label}] Erro ao parsear:`, err.message);
        return fallback;
      }
    };

    const dadosPessoais = parseJSON(resultPessoais.text || '', {}, 'Pessoais');
    const dadosSkills = parseJSON(resultSkills.text || '', {}, 'Skills');
    const dadosExp = parseJSON(resultExperiencias.text || '', {}, 'Experiências');

    // Log detalhado
    console.log('📊 Resultados extraídos:');
    console.log('   - Nome:', dadosPessoais.dados_pessoais?.nome || '(vazio)');
    console.log('   - Skills:', dadosSkills.skills?.length || 0);
    console.log('   - Experiências:', dadosExp.experiencias?.length || 0);
    if (dadosExp.experiencias?.length > 0) {
      console.log('   - Primeira exp:', JSON.stringify(dadosExp.experiencias[0]));
    } else {
      console.warn('   ⚠️ NENHUMA EXPERIÊNCIA EXTRAÍDA!');
    }
    console.log('   - Formação:', dadosExp.formacao?.length || 0);
    console.log('   - Certificações:', dadosExp.certificacoes?.length || 0);
    console.log('   - Idiomas:', dadosPessoais.idiomas?.length || 0);

    // Combinar tudo
    const dadosCompletos = {
      dados_pessoais: { ...dadosVazios.dados_pessoais, ...dadosPessoais.dados_pessoais },
      dados_profissionais: { ...dadosVazios.dados_profissionais, ...dadosPessoais.dados_profissionais },
      skills: dadosSkills.skills || [],
      experiencias: dadosExp.experiencias || [],
      formacao: dadosExp.formacao || [],
      certificacoes: dadosExp.certificacoes || [],
      idiomas: dadosPessoais.idiomas || []
    };

    return {
      sucesso: true,
      dados: dadosCompletos,
      texto_original: textoOriginal,
      tempo_processamento_ms: tempoProcessamento
    };

  } catch (error: any) {
    console.error('❌ Erro na extração de CV:', error);
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
