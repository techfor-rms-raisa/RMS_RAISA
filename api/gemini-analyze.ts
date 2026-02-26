import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ============================================================
// CONFIGURAÇÃO - Lazy Initialization
// ============================================================

// Lazy initialization para garantir que a variável de ambiente esteja disponível
let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    
    if (!apiKey) {
      console.error('❌ API_KEY não encontrada no ambiente Vercel!');
      throw new Error('API_KEY não configurada. Configure a variável de ambiente API_KEY.');
    }
    
    console.log('✅ API_KEY carregada com sucesso');
    console.log(`🔑 API_KEY preview: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ============================================================
// CONFIGURAÇÃO VERCEL - Timeout estendido para processamento de PDF
// ============================================================
export const config = {
  maxDuration: 60, // 60 segundos (máximo do plano Pro)
};

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

    // A verificação de API_KEY é feita no getAI()

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

      // ✅ NOVA ACTION: Classificar email de candidatura (webhook Resend)
      case 'classificar_email_candidatura':
        result = await classificarEmailCandidatura(payload);
        break;

      // ✅ NOVA ACTION: Classificar resposta do cliente (webhook Resend)
      case 'classificar_resposta_cliente':
        result = await classificarRespostaCliente(payload);
        break;

      // ✅ NOVA ACTION (12/01/2026): Gerar perguntas técnicas personalizadas para entrevista
      case 'generateInterviewQuestions':
        result = await generateInterviewQuestions(payload);
        break;

      case 'analisar_respostas_escritas':
        result = await analisarRespostasEscritas(payload);
        break;

      case 'extrair_texto_docx':
        result = await extrairTextoDocx(payload);
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

  const result = await getAI().models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
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

  const result = await getAI().models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
  const text = result.text || '';

  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response.');
  }

  const jsonText = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonText);
}

async function generateContent(model: string, prompt: string) {
  const result = await getAI().models.generateContent({ model: model || 'gemini-2.0-flash', contents: prompt });
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

  const result = await getAI().models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
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
    const result = await getAI().models.generateContent({ 
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
// 🆕 v57.6 - Prompt de Skills EXPANDIDO
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
        const resultTexto = await getAI().models.generateContent({
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

    // ✅ OTIMIZAÇÃO: Após extrair texto na Etapa 1, SEMPRE usar texto nas etapas seguintes
    // Isso evita enviar o PDF base64 (~3MB) mais 3 vezes à Gemini
    // Se a Etapa 1 falhou e não temos texto, aí sim usa o PDF como fallback
    const usarPDFComoFallback = base64PDF && !textoOriginal;
    
    if (usarPDFComoFallback) {
      console.log('⚠️ Texto não extraído na Etapa 1, usando PDF como fallback nas etapas 2-4');
    } else {
      console.log(`✅ Usando texto extraído (${textoOriginal.length} chars) nas etapas 2-4 (mais rápido)`);
    }

    // Conteúdo para análise (texto extraído ou PDF como fallback)
    const criarConteudo = (prompt: string) => {
      if (usarPDFComoFallback) {
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

    // ========================================
    // 🆕 v57.6 - ETAPA 3: Skills/tecnologias - PROMPT EXPANDIDO
    // ========================================
    const promptSkills = `Analise este currículo e extraia TODAS as competências, habilidades e tecnologias em JSON válido (sem markdown, sem backticks).

⚠️ EXTRAIA TUDO - não apenas tecnologias de programação:

1. TECNOLOGIAS DE TI:
   - Linguagens: Java, Python, C#, JavaScript, TypeScript, PHP, Ruby, Go, Rust, etc.
   - Frameworks: Spring, React, Angular, Vue, Node.js, Django, Laravel, .NET, etc.
   - Bancos de Dados: Oracle, SQL Server, PostgreSQL, MySQL, MongoDB, Redis, etc.
   - Cloud: AWS, Azure, GCP (e serviços específicos como S3, Lambda, EC2)
   - DevOps: Docker, Kubernetes, Jenkins, GitLab CI, Terraform, Ansible
   - Mobile: React Native, Flutter, Swift, Kotlin

2. FERRAMENTAS CORPORATIVAS:
   - ERP/CRM: SAP (todos módulos), Salesforce, Oracle EBS, TOTVS
   - BI/Analytics: Power BI, Tableau, Qlik, Looker, Excel Avançado
   - Gestão: Jira, Confluence, Azure DevOps, ServiceNow, MS Project
   - Office: Excel, Word, PowerPoint, Access (se mencionado como skill)

3. METODOLOGIAS E FRAMEWORKS:
   - Ágil: Scrum, Kanban, SAFe, XP, Lean
   - Gestão: PMBOK, PRINCE2, ITIL, COBIT
   - Qualidade: Six Sigma, ISO, CMMI

4. SOFT SKILLS (extrair se mencionadas explícita ou implicitamente):
   - Liderança, Gestão de Equipes, Gestão de Projetos
   - Comunicação, Negociação, Apresentação
   - Análise Crítica, Resolução de Problemas, Tomada de Decisão
   - Trabalho em Equipe, Colaboração, Mentoria

5. COMPETÊNCIAS DE NEGÓCIO:
   - Gestão Financeira, Controladoria, FP&A
   - Gestão de Pessoas, RH, Recrutamento
   - Vendas, Marketing, CRM, Atendimento ao Cliente
   - Operações, Supply Chain, Logística

CATEGORIAS DISPONÍVEIS:
- frontend, backend, database, devops, cloud, mobile
- sap (para qualquer módulo SAP)
- tool (ferramentas como Jira, Excel, Power BI)
- methodology (Scrum, PMBOK, ITIL)
- soft_skill (liderança, comunicação, gestão de equipes)
- other (qualquer outra competência relevante)

Retorne APENAS este JSON:
{
  "skills": [
    {"nome":"Excel Avançado","categoria":"tool","nivel":"avancado","anos_experiencia":5},
    {"nome":"Gestão de Projetos","categoria":"soft_skill","nivel":"avancado","anos_experiencia":8},
    {"nome":"SAP FI","categoria":"sap","nivel":"intermediario","anos_experiencia":3},
    {"nome":"Scrum","categoria":"methodology","nivel":"avancado","anos_experiencia":4},
    {"nome":"Liderança","categoria":"soft_skill","nivel":"avancado","anos_experiencia":6}
  ]
}

REGRAS IMPORTANTES:
1. Extraia PELO MENOS 5 skills (se o CV tiver conteúdo suficiente)
2. Se não encontrar tecnologias de programação, extraia competências de negócio e soft skills
3. Use anos_experiencia baseado no tempo total do profissional com aquela skill
4. Nível: basico (<2 anos), intermediario (2-4 anos), avancado (5-8 anos), especialista (>8 anos)
5. NUNCA retorne skills: [] vazio - sempre encontre algo relevante no currículo
6. Infira soft skills dos cargos ocupados (ex: "Gerente" = Liderança, Gestão de Equipes)`;

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
      getAI().models.generateContent({ model: 'gemini-2.0-flash', contents: criarConteudo(promptPessoais) }),
      getAI().models.generateContent({ model: 'gemini-2.0-flash', contents: criarConteudo(promptSkills) }),
      getAI().models.generateContent({ model: 'gemini-2.0-flash', contents: criarConteudo(promptExperiencias) })
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
    const result = await getAI().models.generateContent({ 
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

RESPONDA EM JSON (sem markdown, sem backticks):
{
  "sucesso": true,
  "score_geral": 75,
  "nivel_risco": "Baixo|Médio|Alto|Crítico",
  "recomendacao": "banco_talentos|analisar_mais|descartar",
  "justificativa": "Resumo explicando a recomendação",
  "pontos_fortes": ["Ponto forte 1", "Ponto forte 2"],
  "pontos_fracos": ["Ponto fraco 1", "Ponto fraco 2"],
  "fatores_risco": [{"tipo": "job_hopping|gap_emprego|skills_desatualizadas|experiencia_insuficiente", "nivel": "Baixo|Médio|Alto", "descricao": "Descrição do risco", "evidencia": "Evidência no CV"}],
  "skills_detectadas": ["Skill1", "Skill2", "Skill3"],
  "experiencia_anos": 5,
  "senioridade_estimada": "Junior|Pleno|Senior|Especialista",
  "areas_atuacao": ["Backend", "DevOps", "Cloud"]
}`;

  try {
    const result = await getAI().models.generateContent({ 
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

// ========================================
// CLASSIFICAÇÃO DE EMAILS (WEBHOOK RESEND)
// ========================================

/**
 * Classifica email recebido via webhook
 * Identifica: tipo de email, candidato, vaga, cliente
 */
async function classificarEmailCandidatura(payload: any) {
  console.log('🤖 [Gemini] Classificando email de candidatura...');

  const { from, to, cc, subject, body } = payload;

  const prompt = `Você é um especialista em análise de emails corporativos de RH/Recrutamento.

ANALISE ESTE EMAIL e extraia informações sobre candidatura/vaga:

**REMETENTE:** ${from}
**DESTINATÁRIO:** ${to}
**CC:** ${cc || 'Nenhum'}
**ASSUNTO:** ${subject}
**CORPO DO EMAIL:**
${body?.substring(0, 3000) || '(vazio)'}

CLASSIFIQUE O EMAIL:
1. **tipo_email**: Qual é o propósito principal?
   - "envio_cv" = Está enviando/encaminhando um CV para análise do cliente
   - "resposta_cliente" = É uma resposta do cliente sobre um candidato (aprovação, reprovação, dúvida, agendamento)
   - "outro" = Não se encaixa nas categorias acima

2. **candidato_nome**: Nome COMPLETO do candidato mencionado (extraia do assunto ou corpo)
3. **vaga_titulo**: Título/código da vaga (ex: "VTI-210 Product Owner Senior")
4. **cliente_nome**: Nome da empresa cliente (se mencionado)
5. **destinatario_email**: Email do destinatário principal

RESPONDA APENAS EM JSON (sem markdown):
{
  "sucesso": true,
  "tipo_email": "envio_cv|resposta_cliente|outro",
  "candidato_nome": "Nome Completo do Candidato",
  "candidato_nome_alternativas": ["Variação 1", "Variação 2"],
  "vaga_titulo": "Código e Título da Vaga",
  "vaga_titulo_alternativas": ["VTI-210", "Product Owner"],
  "cliente_nome": "Nome do Cliente",
  "cliente_nome_alternativas": [],
  "destinatario_email": "email@destino.com",
  "confianca": 85
}`;

  try {
    const result = await getAI().models.generateContent({ 
      model: 'gemini-2.0-flash', 
      contents: prompt 
    });
    
    const text = result.text || '';
    console.log('📧 [Gemini] Resposta classificação:', text.substring(0, 500));
    
    const jsonClean = text.replace(/^```json\n?/gi, '').replace(/```$/gi, '').trim();

    try {
      const parsed = JSON.parse(jsonClean);
      return { ...parsed, sucesso: true };
    } catch {
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...parsed, sucesso: true };
      }
      throw new Error('Falha ao parsear resposta da IA');
    }
  } catch (error: any) {
    console.error('❌ Erro na classificação de email:', error);
    return { 
      sucesso: false, 
      tipo_email: 'outro',
      confianca: 0,
      erro: error.message 
    };
  }
}

/**
 * Classifica resposta do cliente sobre um candidato
 * Identifica: aprovação, reprovação, agendamento, dúvida, etc.
 */
async function classificarRespostaCliente(payload: any) {
  console.log('🤖 [Gemini] Classificando resposta do cliente...');

  const { from, to, cc, subject, body, candidato_nome, vaga_titulo, cliente_nome } = payload;

  const prompt = `Você é um especialista em análise de emails de resposta de clientes sobre candidatos.

CONTEXTO:
- Candidato: ${candidato_nome || 'Não identificado'}
- Vaga: ${vaga_titulo || 'Não identificada'}
- Cliente: ${cliente_nome || 'Não identificado'}

EMAIL DE RESPOSTA DO CLIENTE:
**DE:** ${from}
**PARA:** ${to}
**CC:** ${cc || 'Nenhum'}
**ASSUNTO:** ${subject}
**CORPO:**
${body?.substring(0, 3000) || '(vazio)'}

CLASSIFIQUE A RESPOSTA DO CLIENTE:

1. **tipo_resposta**: Qual é a decisão/status?
   - "visualizado" = Cliente apenas confirmou recebimento, vai analisar
   - "em_analise" = Cliente está avaliando, sem decisão ainda
   - "agendamento" = Cliente quer agendar entrevista
   - "aprovado" = Cliente APROVOU o candidato
   - "reprovado" = Cliente REPROVOU o candidato
   - "duvida" = Cliente tem dúvidas/perguntas
   - "outro" = Não se encaixa

2. **feedback_cliente**: Resumo do feedback do cliente (1-2 frases)

3. **agendamento** (se tipo_resposta = "agendamento"):
   - data_sugerida: "YYYY-MM-DD" (se mencionada)
   - hora_sugerida: "HH:MM" (se mencionada)
   - formato: "presencial|remoto|hibrido"

4. **reprovacao** (se tipo_resposta = "reprovado"):
   - motivo: Motivo da reprovação
   - categoria: "perfil_tecnico|experiencia|pretensao_salarial|fit_cultural|disponibilidade|outro"

RESPONDA APENAS EM JSON (sem markdown):
{
  "sucesso": true,
  "tipo_resposta": "visualizado|em_analise|agendamento|aprovado|reprovado|duvida|outro",
  "feedback_cliente": "Resumo do feedback",
  "agendamento": {
    "data_sugerida": null,
    "hora_sugerida": null,
    "formato": null
  },
  "reprovacao": {
    "motivo": null,
    "categoria": null
  },
  "confianca": 90
}`;

  try {
    const result = await getAI().models.generateContent({ 
      model: 'gemini-2.0-flash', 
      contents: prompt 
    });
    
    const text = result.text || '';
    console.log('📬 [Gemini] Resposta classificação cliente:', text.substring(0, 500));
    
    const jsonClean = text.replace(/^```json\n?/gi, '').replace(/```$/gi, '').trim();

    try {
      const parsed = JSON.parse(jsonClean);
      return { ...parsed, sucesso: true };
    } catch {
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...parsed, sucesso: true };
      }
      throw new Error('Falha ao parsear resposta da IA');
    }
  } catch (error: any) {
    console.error('❌ Erro na classificação de resposta:', error);
    return { 
      sucesso: false, 
      tipo_resposta: 'outro',
      confianca: 0,
      erro: error.message 
    };
  }
}

// ============================================================
// 🆕 GERAR PERGUNTAS TÉCNICAS PERSONALIZADAS PARA ENTREVISTA
// Versão: 1.0 - 12/01/2026
// ============================================================

async function generateInterviewQuestions(payload: {
  vaga: {
    titulo: string;
    requisitos_obrigatorios?: string | string[];
    requisitos_desejaveis?: string | string[];
    stack_tecnologica?: string[];
    descricao?: string;
    nivel_senioridade?: string;
  };
  candidato: {
    nome: string;
    titulo_profissional?: string;
    senioridade?: string;
    resumo_profissional?: string;
    cv_texto?: string;
    experiencias?: string[];
    skills?: string[];
  };
}) {
  console.log('🎯 [generateInterviewQuestions] Gerando perguntas personalizadas...');

  const { vaga, candidato } = payload;

  // Função helper para formatar arrays ou strings
  const formatarLista = (valor: string | string[] | undefined | null, fallback: string = ''): string => {
    if (!valor) return fallback;
    if (Array.isArray(valor)) return valor.join(', ');
    return String(valor);
  };

  // Formatar requisitos
  const requisitosObrigatorios = formatarLista(vaga.requisitos_obrigatorios, 'Não especificados');
  const requisitosDesejaveis = formatarLista(vaga.requisitos_desejaveis, '');
  const stackTecnologica = formatarLista(vaga.stack_tecnologica, 'Não especificada');

  // Informações do candidato
  const cvResumo = candidato.cv_texto 
    ? candidato.cv_texto.substring(0, 3000) // Limitar para não exceder tokens
    : candidato.resumo_profissional || 'Não disponível';

  const skillsCandidato = formatarLista(candidato.skills) || formatarLista(candidato.experiencias) || '';

  const prompt = `Você é um **Recrutador Técnico Sênior** especializado em validar experiências de candidatos em entrevistas.

## CONTEXTO DA VAGA

**Título:** ${vaga.titulo}
**Nível:** ${vaga.nivel_senioridade || 'Não especificado'}
**Requisitos Obrigatórios:** ${requisitosObrigatorios}
**Requisitos Desejáveis:** ${requisitosDesejaveis}
**Stack Tecnológica:** ${stackTecnologica}
**Descrição:** ${vaga.descricao || 'Não disponível'}

## PERFIL DO CANDIDATO

**Nome:** ${candidato.nome}
**Título:** ${candidato.titulo_profissional || 'Não informado'}
**Senioridade declarada:** ${candidato.senioridade || 'Não informada'}
**Skills declaradas:** ${skillsCandidato}

**Resumo/CV do Candidato:**
${cvResumo}

---

## SUA TAREFA

Gere perguntas técnicas PERSONALIZADAS para validar se o candidato realmente possui as experiências que declara ter. 

### REGRAS IMPORTANTES:
1. **NÃO faça perguntas genéricas** como "conte sobre você" ou "por que quer trabalhar aqui"
2. **CADA pergunta deve validar um requisito OBRIGATÓRIO da vaga** mencionado no CV do candidato
3. **Perguntas devem ser TÉCNICAS e ESPECÍFICAS** que apenas quem realmente trabalhou consegue responder
4. **Identifique GAPS** - tecnologias exigidas que o candidato NÃO menciona no CV
5. **Verifique CONGRUÊNCIA** - se tempo de experiência declarado é compatível com profundidade esperada
6. **Inclua RED FLAGS** que indicam que o candidato está mentindo ou exagerando

### ESTRUTURA DE CADA PERGUNTA:
- Deve ser relacionada a um requisito OBRIGATÓRIO da vaga
- Deve validar uma experiência declarada pelo candidato
- Deve ter critérios claros de avaliação
- Deve incluir sinais de alerta (red flags)

Retorne um JSON com esta estrutura EXATA:

{
  "analise_previa": {
    "gaps_identificados": ["Gap 1 - tecnologia exigida que candidato não menciona", "Gap 2"],
    "pontos_validar": ["Experiência X declarada - precisa validar profundidade", "Tempo em Y"],
    "alertas": ["Possível inconsistência entre X e Y"]
  },
  "perguntas": [
    {
      "categoria": "Requisito Obrigatório - [Nome da tecnologia/skill]",
      "icone": "💻",
      "perguntas": [
        {
          "pergunta": "Pergunta técnica específica aqui",
          "objetivo": "O que essa pergunta valida",
          "requisito_validado": "Qual requisito obrigatório está sendo validado",
          "o_que_avaliar": ["Critério 1", "Critério 2", "Critério 3"],
          "resposta_esperada_nivel_senior": "O que um profissional sênior responderia",
          "red_flags": ["Sinal de alerta 1", "Sinal de alerta 2"]
        }
      ]
    },
    {
      "categoria": "GAP Identificado - [Tecnologia que falta]",
      "icone": "⚠️",
      "perguntas": [
        {
          "pergunta": "Pergunta para entender o gap",
          "objetivo": "Avaliar se é um gap crítico ou se há experiência não documentada",
          "requisito_validado": "Requisito obrigatório relacionado",
          "o_que_avaliar": ["Critério 1", "Critério 2"],
          "resposta_esperada_nivel_senior": "O que esperamos ouvir",
          "red_flags": ["Sinais de que não tem a experiência"]
        }
      ]
    }
  ],
  "recomendacao_foco": "Resumo do que o entrevistador deve focar na entrevista"
}

### QUANTIDADE DE PERGUNTAS:
- Mínimo 5, máximo 10 perguntas
- Pelo menos 1 pergunta por requisito obrigatório principal
- Pelo menos 1 pergunta sobre cada gap identificado

Responda APENAS com o JSON, sem texto adicional.`;

  try {
    const result = await getAI().models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt
    });

    const text = result.text || '';
    const jsonClean = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

    try {
      const parsed = JSON.parse(jsonClean);
      console.log(`✅ Perguntas geradas: ${parsed.perguntas?.length || 0} categorias`);
      return {
        sucesso: true,
        ...parsed
      };
    } catch {
      const jsonMatch = jsonClean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { sucesso: true, ...parsed };
      }
      throw new Error('Falha ao parsear perguntas');
    }
  } catch (error: any) {
    console.error('❌ Erro ao gerar perguntas:', error);
    
    // Fallback: retornar perguntas mínimas baseadas nos requisitos
    return {
      sucesso: false,
      erro: error.message,
      perguntas: [{
        categoria: `Validação Técnica - ${vaga.titulo}`,
        icone: '💻',
        perguntas: [
          {
            pergunta: `Descreva em detalhes um projeto onde você utilizou ${stackTecnologica}. Qual foi seu papel específico e quais decisões técnicas você tomou?`,
            objetivo: 'Validar experiência prática com a stack',
            requisito_validado: stackTecnologica,
            o_que_avaliar: ['Profundidade técnica', 'Decisões de arquitetura', 'Resultados mensuráveis'],
            resposta_esperada_nivel_senior: 'Detalhes específicos sobre implementação, trade-offs considerados, métricas de sucesso',
            red_flags: ['Respostas vagas', 'Não cita tecnologias específicas', 'Não menciona desafios superados']
          }
        ]
      }]
    };
  }
}

// ========================================
// 🆕 ANALISAR RESPOSTAS ESCRITAS + DETECÇÃO DE IA
// ========================================

async function analisarRespostasEscritas(payload: {
  respostas_texto: string;
  perguntas: { pergunta: string; categoria: string; peso: number }[];
  vaga: { titulo: string; requisitos_obrigatorios?: string; stack_tecnologica?: string[] } | null;
  candidato: { nome: string };
}) {
  const { respostas_texto, perguntas, vaga, candidato } = payload;

  console.log('📝 [analisarRespostasEscritas] Iniciando análise de respostas escritas...');
  console.log(`   Candidato: ${candidato.nome}`);
  console.log(`   Vaga: ${vaga?.titulo || 'N/A'}`);
  console.log(`   Texto: ${respostas_texto.length} caracteres`);
  console.log(`   Perguntas: ${perguntas.length}`);

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error('GEMINI_API_KEY não configurada');

  const perguntasFormatadas = perguntas.map((p, i) => 
    `${i + 1}. [${p.categoria}] ${p.pergunta}`
  ).join('\n');

  const prompt = `Você é um especialista sênior em recrutamento técnico de TI e também um especialista em detecção de textos gerados por IA.

TAREFA: Analisar as respostas escritas de um candidato a uma entrevista técnica, avaliando qualidade técnica E autenticidade.

## DADOS DA VAGA
- Título: ${vaga?.titulo || 'N/A'}
- Requisitos: ${vaga?.requisitos_obrigatorios || 'N/A'}
- Stack: ${vaga?.stack_tecnologica?.join(', ') || 'N/A'}

## CANDIDATO
- Nome: ${candidato.nome}

## PERGUNTAS DA ENTREVISTA
${perguntasFormatadas}

## RESPOSTAS DO CANDIDATO
${respostas_texto}

---

## INSTRUÇÕES DE ANÁLISE

### PARTE 1: DETECÇÃO DE IA
Analise o texto procurando sinais de que foi gerado por IA (ChatGPT, Gemini, Claude, etc):

**Sinais de texto gerado por IA:**
- Linguagem excessivamente polida, formal ou "perfeita" sem naturalidade
- Estrutura muito organizada (intro → desenvolvimento → conclusão em TODAS as respostas)
- Ausência de erros gramaticais/digitação que seriam naturais em texto humano
- Vocabulário sofisticado demais para o contexto ou nível declarado
- Respostas genéricas que poderiam servir para qualquer candidato
- Falta de exemplos pessoais específicos (nomes de projetos, empresas, colegas, datas)
- Uso excessivo de bullet points ou enumerações perfeitas
- Transições artificialmente suaves entre tópicos
- Frases como "é importante notar", "vale ressaltar", "além disso", "em resumo" repetidamente
- Respostas longas demais e excessivamente completas para cada pergunta
- Tom consistentemente neutro sem demonstrar emoção ou personalidade
- Não menciona dificuldades reais, erros cometidos ou limitações pessoais

**Sinais de texto humano autêntico:**
- Erros de digitação ou gramática ocasionais
- Linguagem coloquial ou gírias técnicas
- Exemplos específicos com nomes de projetos, empresas, tecnologias com versões
- Menção de dificuldades reais e como foram superadas
- Tom pessoal com opiniões subjetivas
- Respostas de tamanho variável (algumas mais curtas, outras mais longas)
- Referências a contexto específico da experiência declarada no CV

### PARTE 2: ANÁLISE TÉCNICA
Para cada pergunta, identifique a resposta correspondente e avalie:
- Qualidade técnica (excelente/boa/regular/fraca/nao_respondeu)
- Score de 0-100
- Observação sobre a resposta

### PARTE 3: AVALIAÇÃO GERAL
- Score técnico (0-100)
- Score de comunicação escrita (0-100) 
- Score geral (0-100)
- Pontos fortes
- Pontos de atenção
- Red flags
- Recomendação: APROVAR / REPROVAR / REAVALIAR
- Se detecção de IA >= 75%, a recomendação DEVE ser REPROVAR com justificativa clara

---

RESPONDA EXCLUSIVAMENTE em JSON válido (sem markdown, sem backticks):
{
  "deteccao_ia": {
    "probabilidade": <número 0-100>,
    "veredicto": "<texto explicativo do resultado da análise de autenticidade>",
    "evidencias": ["<evidência 1>", "<evidência 2>", "..."]
  },
  "respostas_identificadas": [
    {
      "pergunta_relacionada": "<pergunta original>",
      "resposta_extraida": "<trecho da resposta identificada>",
      "qualidade": "excelente|boa|regular|fraca|nao_respondeu",
      "score": <0-100>,
      "observacao": "<análise da resposta>"
    }
  ],
  "resumo": "<resumo geral da entrevista>",
  "pontos_fortes": ["<ponto 1>", "..."],
  "pontos_atencao": ["<ponto 1>", "..."],
  "red_flags": ["<flag 1>", "..."],
  "score_tecnico": <0-100>,
  "score_comunicacao": <0-100>,
  "score_geral": <0-100>,
  "recomendacao": "APROVAR|REPROVAR|REAVALIAR",
  "justificativa": "<justificativa detalhada da recomendação>"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [analisarRespostasEscritas] Erro Gemini:', errorText);
      throw new Error(`Erro na API Gemini: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Resposta vazia da Gemini');
    }

    // Limpar e parsear JSON
    const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const resultado = JSON.parse(cleanText);

    console.log('✅ [analisarRespostasEscritas] Análise concluída!');
    console.log(`   Score Geral: ${resultado.score_geral}%`);
    console.log(`   Detecção IA: ${resultado.deteccao_ia?.probabilidade}%`);
    console.log(`   Recomendação: ${resultado.recomendacao}`);

    return resultado;

  } catch (error: any) {
    console.error('❌ [analisarRespostasEscritas] Erro:', error.message);
    throw new Error(`Erro ao analisar respostas escritas: ${error.message}`);
  }
}

// ========================================
// 🆕 EXTRAIR TEXTO DE DOCX VIA MAMMOTH
// ========================================

async function extrairTextoDocx(payload: { base64Docx: string }) {
  const { base64Docx } = payload;

  console.log('📄 [extrairTextoDocx] Extraindo texto de DOCX...');
  console.log(`   Base64 length: ${base64Docx.length} chars`);

  try {
    // Importar mammoth dinamicamente
    const mammoth = await import('mammoth');
    
    // Converter base64 para Buffer
    const buffer = Buffer.from(base64Docx, 'base64');
    
    // Extrair texto do DOCX
    const result = await mammoth.extractRawText({ buffer });
    const texto = result.value;

    if (!texto || texto.trim().length === 0) {
      throw new Error('Documento DOCX vazio ou sem texto extraível');
    }

    console.log(`✅ [extrairTextoDocx] Texto extraído: ${texto.length} caracteres`);

    return { texto: texto.trim() };

  } catch (error: any) {
    console.error('❌ [extrairTextoDocx] Erro:', error.message);
    throw new Error(`Erro ao extrair texto do DOCX: ${error.message}`);
  }
}
