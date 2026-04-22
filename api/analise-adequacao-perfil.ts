// ============================================================
// ANÁLISE DE ADEQUAÇÃO DE PERFIL - API Backend (GEMINI)
// Endpoint: /api/analise-adequacao-perfil
// ============================================================
// v2.0 - Migrado de Claude para Gemini 2.0 Flash
// Análise profunda requisito a requisito entre Candidato × Vaga
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ============================================================
// CONFIGURAÇÃO VERCEL
// ============================================================
export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

// ============================================================
// AI — Lazy Initialization (NUNCA instanciar em escopo de módulo em serverless)
// Env vars podem estar indisponíveis no cold-start → causa 403/500
// Padrão idêntico ao gemini-analyze.ts
// ============================================================
let _aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_aiInstance) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('API_KEY não configurada. Configure a variável de ambiente API_KEY no Vercel.');
    }
    console.log('✅ API_KEY (Gemini) carregada com sucesso');
    _aiInstance = new GoogleGenAI({ apiKey });
  }
  return _aiInstance;
}

const GEMINI_MODEL = 'gemini-2.5-flash';

// ============================================================
// TIPOS
// ============================================================

interface RequisitoAnalisado {
  requisito: string;
  tipo: 'HARD_SKILL' | 'COMPETENCIA_FUNCIONAL' | 'EXPERIENCIA_SETOR' | 'FORMACAO' | 'SOFT_SKILL' | 'IDIOMA' | 'CERTIFICACAO';
  obrigatoriedade: 'IMPRESCINDIVEL' | 'MUITO_DESEJAVEL' | 'DESEJAVEL' | 'DIFERENCIAL';
  analise_candidato: {
    evidencias_encontradas: string[];
    evidencias_ausentes: string[];
    experiencias_relacionadas: string[];
  };
  nivel_adequacao: 'ATENDE' | 'ATENDE_PARCIALMENTE' | 'GAP_IDENTIFICADO' | 'NAO_AVALIAVEL';
  score_adequacao: number;
  justificativa: string;
  pergunta_investigacao?: string;
  como_mitigar?: string;
}

interface AnaliseAdequacaoPerfil {
  candidato_nome: string;
  vaga_titulo: string;
  data_analise: string;
  score_geral: number;
  nivel_adequacao_geral: 'MUITO_COMPATIVEL' | 'COMPATIVEL' | 'PARCIALMENTE_COMPATIVEL' | 'INCOMPATIVEL';
  confianca_analise: number;
  requisitos_imprescindiveis: RequisitoAnalisado[];
  requisitos_muito_desejaveis: RequisitoAnalisado[];
  requisitos_desejaveis: RequisitoAnalisado[];
  resumo_executivo: {
    principais_pontos_fortes: string[];
    gaps_criticos: string[];
    gaps_investigar: string[];
    diferenciais_candidato: string[];
  };
  perguntas_entrevista: any[];
  avaliacao_final: {
    recomendacao: 'APROVAR' | 'ENTREVISTAR' | 'REAVALIAR' | 'REPROVAR';
    justificativa: string;
    proximos_passos: string[];
    riscos_identificados: string[];
    pontos_atencao_entrevista: string[];
  };
}

// ============================================================
// SYSTEM PROMPT - ESPECIALISTA EM ANÁLISE DE PERFIL
// ============================================================

const SYSTEM_PROMPT = `Você é um **Especialista Sênior em Recrutamento e Seleção** com 25 anos de experiência em análise de perfis para vagas de tecnologia.

Sua especialidade é realizar **análises profundas de adequação** entre candidatos e vagas, indo muito além do simples match de palavras-chave.

## PRINCÍPIOS DA ANÁLISE:

### 1. ANÁLISE SEMÂNTICA DE REQUISITOS
- Não compare apenas palavras, mas **significados e contextos**
- "Análise de requisitos" pode atender parcialmente "escrever histórias de usuário"
- "Suporte técnico" pode evidenciar "capacidade de comunicação com usuários"
- Experiência em "sustentação de sistemas" demonstra conhecimento de "ciclo de vida"

### 2. EXTRAÇÃO DE EVIDÊNCIAS DO CV
- Busque evidências **explícitas** (mencionadas diretamente)
- Busque evidências **implícitas** (inferidas do contexto)
- Considere a **progressão de carreira** como evidência de competência
- Analise a **profundidade** da experiência, não apenas presença

### 3. NÍVEIS DE ADEQUAÇÃO
- **ATENDE**: Evidência clara e direta no CV que comprova a competência
- **ATENDE_PARCIALMENTE**: Experiência relacionada que pode suprir a necessidade com pequena adaptação
- **GAP_IDENTIFICADO**: Não há evidência suficiente, requer investigação ou é uma lacuna real
- **NAO_AVALIAVEL**: Impossível determinar apenas pelo CV

### 4. PERGUNTAS DE INVESTIGAÇÃO
Para cada gap ou adequação parcial, sugira perguntas que:
- Sejam específicas ao contexto do candidato
- Referenciem experiências mencionadas no CV
- Permitam ao candidato demonstrar a competência com exemplos reais
- Sigam o método STAR (Situação, Tarefa, Ação, Resultado)

### 5. ANÁLISE CONTEXTUAL
- Considere o **setor** de atuação (financeiro, varejo, etc.)
- Considere o **porte** das empresas anteriores
- Considere a **complexidade** dos projetos mencionados
- Considere a **senioridade** esperada vs demonstrada

## FORMATO DE RESPOSTA:
Responda SEMPRE em JSON válido, sem markdown, seguindo a estrutura exata solicitada.
Seja **analítico, justo e construtivo** em suas avaliações.`;

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { candidato, vaga, opcoes } = req.body;

    if (!candidato || !vaga) {
      return res.status(400).json({ error: 'Candidato e Vaga são obrigatórios' });
    }

    console.log(`🔍 [Gemini] Iniciando análise de adequação: ${candidato.nome} × ${vaga.titulo}`);
    const startTime = Date.now();

    // Construir prompt detalhado
    const userPrompt = buildAnalysisPrompt(candidato, vaga, opcoes);

    // Chamar Gemini com retry
    let response;
    let tentativas = 0;
    const maxTentativas = 2;
    
    while (tentativas < maxTentativas) {
      try {
        tentativas++;
        console.log(`🔄 [Gemini] Tentativa ${tentativas}/${maxTentativas}...`);
        
        response = await getAI().models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              role: 'user',
              parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }]
            }
          ],
          config: {
            temperature: 0.3,
            maxOutputTokens: 8192,  // 🔧 v2.2: Reduzido de 16384 → 8192 para evitar timeout 504
          }
        });
        
        // Se chegou aqui, sucesso - sair do loop
        break;
      } catch (retryError: any) {
        console.error(`❌ [Gemini] Erro na tentativa ${tentativas}:`, retryError.message);
        if (tentativas >= maxTentativas) {
          throw retryError;
        }
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Extrair resposta
    const responseText = response?.text || '';
    
    if (!responseText || responseText.trim().length < 50) {
      console.error('❌ Resposta vazia ou muito curta da API Gemini');
      return res.status(500).json({ 
        error: '❌ Erro na API Gemini (gemini-2.5-flash): Resposta vazia',
        tipo: 'EMPTY_RESPONSE',
        acao: 'A API não retornou dados. Tente novamente em alguns segundos.',
        raw: responseText
      });
    }

    // Parsear JSON com múltiplas tentativas de limpeza
    let result: AnaliseAdequacaoPerfil;
    try {
      // Tentativa 1: Limpeza padrão
      let cleanedText = responseText
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/gi, '')
        .trim();
      
      // Tentativa 2: Se ainda não é JSON válido, tentar extrair o objeto
      if (!cleanedText.startsWith('{')) {
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedText = jsonMatch[0];
        }
      }
      
      // Tentativa 3: Remover caracteres problemáticos
      cleanedText = cleanedText
        .replace(/[\x00-\x1F\x7F]/g, '') // Caracteres de controle
        .replace(/,\s*}/g, '}') // Vírgula antes de }
        .replace(/,\s*]/g, ']'); // Vírgula antes de ]
      
      result = JSON.parse(cleanedText);
      
    } catch (parseError) {
      console.error('❌ Erro ao parsear resposta Gemini:', parseError);
      console.error('Resposta bruta (primeiros 2000 chars):', responseText.substring(0, 2000));
      
      // 🔧 v2.1: Tentar recuperar JSON truncado
      try {
        // Tentar extrair dados parciais do JSON truncado
        const scoreMatch = responseText.match(/"score_geral"\s*:\s*(\d+)/);
        const nivelMatch = responseText.match(/"nivel_adequacao_geral"\s*:\s*"([^"]+)"/);
        const recomendacaoMatch = responseText.match(/"recomendacao"\s*:\s*"([^"]+)"/);
        
        if (scoreMatch && nivelMatch) {
          console.log('⚠️ Recuperando dados parciais do JSON truncado...');
          
          // Extrair pontos fortes e gaps do texto parcial
          const pontosFortes: string[] = [];
          const gapsCriticos: string[] = [];
          
          // Buscar evidências encontradas
          const evidenciasMatch = responseText.matchAll(/"evidencias_encontradas"\s*:\s*\[(.*?)\]/gs);
          for (const match of evidenciasMatch) {
            const evidencias = match[1].match(/"([^"]+)"/g);
            if (evidencias) {
              pontosFortes.push(...evidencias.slice(0, 2).map(e => e.replace(/"/g, '')));
            }
          }
          
          // Buscar evidências ausentes (gaps)
          const ausentesMatch = responseText.matchAll(/"evidencias_ausentes"\s*:\s*\[(.*?)\]/gs);
          for (const match of ausentesMatch) {
            const ausentes = match[1].match(/"([^"]+)"/g);
            if (ausentes) {
              gapsCriticos.push(...ausentes.slice(0, 2).map(e => e.replace(/"/g, '')));
            }
          }
          
          result = {
            candidato_nome: candidato.nome || 'Candidato',
            vaga_titulo: vaga.titulo || 'Vaga',
            data_analise: new Date().toISOString(),
            score_geral: parseInt(scoreMatch[1]),
            nivel_adequacao_geral: nivelMatch[1] as any,
            confianca_analise: 70,
            requisitos_imprescindiveis: [],
            requisitos_muito_desejaveis: [],
            requisitos_desejaveis: [],
            resumo_executivo: {
              principais_pontos_fortes: pontosFortes.length > 0 ? pontosFortes.slice(0, 3) : ['Análise parcial - verificar detalhes'],
              gaps_criticos: gapsCriticos.length > 0 ? gapsCriticos.slice(0, 3) : [],
              gaps_investigar: ['Validar competências na entrevista'],
              diferenciais_candidato: []
            },
            perguntas_entrevista: [{
              categoria: 'Validação Técnica',
              icone: '💻',
              perguntas: [{
                pergunta: 'Descreva sua experiência mais relevante para esta vaga.',
                objetivo: 'Validar fit técnico',
                o_que_avaliar: ['Experiência', 'Conhecimento técnico'],
                red_flags: ['Respostas vagas']
              }]
            }],
            avaliacao_final: {
              recomendacao: (recomendacaoMatch?.[1] as any) || 'ENTREVISTAR',
              justificativa: 'Análise parcial recuperada. Recomenda-se entrevista para validação completa.',
              proximos_passos: ['Agendar entrevista técnica'],
              riscos_identificados: ['Análise incompleta devido a limitação técnica'],
              pontos_atencao_entrevista: ['Validar requisitos principais']
            }
          };
          
          console.log(`✅ Dados parciais recuperados - Score: ${result.score_geral}%`);
        } else {
          // Fallback completo
          result = criarRespostaFallback(candidato, vaga);
          console.log('⚠️ Usando resposta fallback devido a erro de parse');
        }
      } catch {
        result = criarRespostaFallback(candidato, vaga);
        console.log('⚠️ Usando resposta fallback devido a erro de parse');
      }
    }

    const tempoMs = Date.now() - startTime;
    console.log(`✅ [Gemini] Análise concluída em ${tempoMs}ms - Score: ${result.score_geral}%`);

    // Adicionar metadados
    result.data_analise = new Date().toISOString();
    (result as any)._metadata = {
      modelo: GEMINI_MODEL,
      provider: 'Google Gemini',
      tempo_ms: tempoMs
    };

    return res.status(200).json({ 
      success: true, 
      data: result 
    });

  } catch (error: any) {
    console.error('❌ [Gemini] Erro na análise:', error);
    
    // Tratamento específico de erros Gemini
    const errorMessage = error.message || '';
    const errorStatus = error.status || 500;
    
    // API Key inválida ou revogada
    if (errorStatus === 401 || errorStatus === 403 || errorMessage.includes('API key')) {
      return res.status(500).json({ 
        error: '❌ Erro na API Gemini (gemini-2.5-flash): Chave de API inválida ou revogada',
        tipo: 'AUTH_ERROR',
        acao: 'Atualize a API_KEY no Vercel com uma chave válida do Google AI Studio',
        codigo: errorStatus
      });
    }
    
    // Créditos/Quota esgotada
    if (errorStatus === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
      return res.status(500).json({ 
        error: '❌ Erro na API Gemini (gemini-2.5-flash): Limite de requisições ou créditos esgotados',
        tipo: 'QUOTA_ERROR',
        acao: 'Aguarde alguns minutos ou verifique os créditos no Google Cloud Console',
        codigo: errorStatus
      });
    }
    
    // Erro genérico
    return res.status(500).json({ 
      error: `❌ Erro na API Gemini (gemini-2.5-flash): ${errorMessage || 'Erro interno'}`,
      tipo: 'SERVER_ERROR',
      acao: 'Tente novamente. Se persistir, contate o suporte.',
      codigo: errorStatus
    });
  }
}

// ============================================================
// CONSTRUIR PROMPT DE ANÁLISE
// ============================================================

// ============================================================
// FUNÇÃO FALLBACK - Quando o parse da resposta Gemini falha
// ============================================================

function criarRespostaFallback(candidato: any, vaga: any): AnaliseAdequacaoPerfil {
  console.log('⚠️ Criando resposta fallback para análise de adequação');
  
  return {
    candidato_nome: candidato.nome || 'Candidato',
    vaga_titulo: vaga.titulo || 'Vaga',
    data_analise: new Date().toISOString(),
    score_geral: 50,
    nivel_adequacao_geral: 'PARCIALMENTE_COMPATIVEL',
    confianca_analise: 30,
    requisitos_imprescindiveis: [{
      requisito: 'Análise automática indisponível',
      tipo: 'HARD_SKILL',
      obrigatoriedade: 'IMPRESCINDIVEL',
      analise_candidato: {
        evidencias_encontradas: ['Análise manual necessária'],
        evidencias_ausentes: [],
        experiencias_relacionadas: []
      },
      nivel_adequacao: 'NAO_AVALIAVEL',
      score_adequacao: 50,
      justificativa: 'A análise automática não pôde ser concluída. Recomenda-se análise manual do CV.',
      pergunta_investigacao: 'Valide manualmente as competências do candidato durante a entrevista.'
    }],
    requisitos_muito_desejaveis: [],
    requisitos_desejaveis: [],
    resumo_executivo: {
      principais_pontos_fortes: ['Análise manual recomendada'],
      gaps_criticos: ['Não foi possível analisar automaticamente'],
      gaps_investigar: ['Todas as competências devem ser validadas na entrevista'],
      diferenciais_candidato: []
    },
    perguntas_entrevista: [{
      categoria: 'Validação Geral',
      icone: '❓',
      perguntas: [{
        pergunta: 'Descreva sua experiência mais relevante para esta vaga.',
        objetivo: 'Validar fit com a posição',
        o_que_avaliar: ['Experiência técnica', 'Alinhamento com requisitos'],
        red_flags: ['Respostas vagas', 'Falta de exemplos concretos']
      }]
    }],
    avaliacao_final: {
      recomendacao: 'ENTREVISTAR',
      justificativa: 'A análise automática não pôde ser concluída devido a um erro técnico. Recomenda-se prosseguir com entrevista para avaliação manual.',
      proximos_passos: ['Agendar entrevista técnica', 'Avaliar CV manualmente'],
      riscos_identificados: ['Análise incompleta - validar requisitos na entrevista'],
      pontos_atencao_entrevista: ['Validar todas as competências técnicas manualmente']
    }
  };
}

// ============================================================
// CONSTRUIR PROMPT DE ANÁLISE
// ============================================================

function buildAnalysisPrompt(candidato: any, vaga: any, opcoes?: any): string {
  // Formatar experiências do candidato
  const experienciasFormatadas = (candidato.experiencias || [])
    .map((exp: any, i: number) => `
${i + 1}. **${exp.cargo}** na **${exp.empresa}**
   - Período: ${exp.periodo || `${exp.data_inicio || '?'} - ${exp.data_fim || 'Atual'}`}
   - Atividades: ${exp.descricao || 'Não detalhado'}
   - Tecnologias: ${(exp.tecnologias || []).join(', ') || 'Não especificado'}
`).join('\n');

  // Formatar formação
  const formacaoFormatada = (candidato.formacoes || candidato.formacao || [])
    .map((f: any) => `- ${f.curso} em ${f.instituicao} (${f.ano_conclusao || 'em andamento'})`)
    .join('\n');

  // Formatar skills
  const skillsFormatadas = (candidato.skills || [])
    .map((s: any) => typeof s === 'string' ? s : `${s.nome} (${s.nivel || 'N/A'})`)
    .join(', ');

  // 🆕 v2.1: Incluir texto completo do CV se disponível
  // Aceita tanto curriculo_texto (AnaliseRisco v5.0) quanto curriculo_texto_original (legado)
  const textoCV = candidato.curriculo_texto || candidato.curriculo_texto_original || '';
  const secaoCV = textoCV ? `
**📄 TEXTO COMPLETO DO CURRÍCULO:**
\`\`\`
${textoCV.substring(0, 8000)}
\`\`\`
` : '';

  return `
## ANÁLISE DE ADEQUAÇÃO DE PERFIL

Realize uma análise **profunda e detalhada** da adequação entre o candidato e a vaga.

---

## 📋 DADOS DA VAGA

**Título:** ${vaga.titulo}

**Descrição da Posição:**
${vaga.descricao || 'Não fornecida'}

**Requisitos Imprescindíveis (Hard Skills):**
${vaga.requisitos_obrigatorios || vaga.requisitos_imprescindiveis || 'Não especificados'}

**Requisitos Muito Desejáveis:**
${vaga.requisitos_desejaveis || vaga.requisitos_muito_desejaveis || 'Não especificados'}

**Stack Tecnológica:**
${Array.isArray(vaga.stack_tecnologica) ? vaga.stack_tecnologica.join(', ') : vaga.stack_tecnologica || 'Não especificada'}

**Senioridade Exigida:** ${vaga.senioridade || 'Não especificada'}

**Modalidade:** ${vaga.modalidade || 'Não especificada'}

**Setor/Cliente:** ${vaga.cliente_nome || vaga.setor || 'Não especificado'}

---

## 👤 DADOS DO CANDIDATO

**Nome:** ${candidato.nome}
**Título Profissional:** ${candidato.titulo_profissional || 'Não informado'}
**Senioridade Aparente:** ${candidato.senioridade || 'Não classificado'}

**Resumo Profissional:**
${candidato.resumo_profissional || 'Não fornecido'}

**Skills/Tecnologias:**
${skillsFormatadas || 'Não listadas'}

**Experiências Profissionais:**
${experienciasFormatadas || 'Não detalhadas'}

**Formação Acadêmica:**
${formacaoFormatada || 'Não informada'}

**Idiomas:**
${(candidato.idiomas || []).map((i: any) => `${i.idioma}: ${i.nivel}`).join(', ') || 'Não informados'}

**Certificações:**
${(candidato.certificacoes || []).map((c: any) => c.nome || c).join(', ') || 'Não informadas'}
${secaoCV}
---

## 🎯 SUA TAREFA

Analise **cada requisito** da vaga individualmente e avalie o nível de adequação do candidato.

Para requisitos que envolvem **competências funcionais** (como "escrever histórias de usuário", "conduzir homologação", etc.), busque evidências nas descrições das experiências, não apenas nas skills listadas.

${textoCV ? '**IMPORTANTE:** Analise também o TEXTO COMPLETO DO CURRÍCULO acima para encontrar evidências adicionais.' : ''}

Retorne um JSON com esta estrutura EXATA:

{
  "candidato_nome": "${candidato.nome}",
  "vaga_titulo": "${vaga.titulo}",
  "data_analise": "",
  
  "score_geral": 0-100,
  "nivel_adequacao_geral": "MUITO_COMPATIVEL|COMPATIVEL|PARCIALMENTE_COMPATIVEL|INCOMPATIVEL",
  "confianca_analise": 0-100,
  
  "requisitos_imprescindiveis": [
    {
      "requisito": "Nome do requisito analisado",
      "tipo": "HARD_SKILL|COMPETENCIA_FUNCIONAL|EXPERIENCIA_SETOR|FORMACAO|SOFT_SKILL|IDIOMA|CERTIFICACAO",
      "obrigatoriedade": "IMPRESCINDIVEL",
      "analise_candidato": {
        "evidencias_encontradas": ["Evidência 1 do CV", "Evidência 2"],
        "evidencias_ausentes": ["O que não foi encontrado"],
        "experiencias_relacionadas": ["Empresa X - atividade Y que demonstra..."]
      },
      "nivel_adequacao": "ATENDE|ATENDE_PARCIALMENTE|GAP_IDENTIFICADO|NAO_AVALIAVEL",
      "score_adequacao": 0-100,
      "justificativa": "Explicação detalhada da avaliação",
      "pergunta_investigacao": "Pergunta específica para entrevista (se aplicável)",
      "como_mitigar": "Como o gap poderia ser superado (se aplicável)"
    }
  ],
  
  "requisitos_muito_desejaveis": [
    // Mesma estrutura, com obrigatoriedade: "MUITO_DESEJAVEL"
  ],
  
  "requisitos_desejaveis": [
    // Mesma estrutura, com obrigatoriedade: "DESEJAVEL" ou "DIFERENCIAL"
  ],
  
  "resumo_executivo": {
    "principais_pontos_fortes": [
      "Ponto forte 1 com contexto",
      "Ponto forte 2 com contexto"
    ],
    "gaps_criticos": [
      "Gap crítico que pode ser eliminatório"
    ],
    "gaps_investigar": [
      "Gap que precisa ser investigado na entrevista"
    ],
    "diferenciais_candidato": [
      "Algo que o candidato tem além do exigido"
    ]
  },
  
  "perguntas_entrevista": [
    {
      "categoria": "Nome da Categoria (ex: Documentação de Requisitos)",
      "icone": "📝",
      "perguntas": [
        {
          "pergunta": "Pergunta específica referenciando o CV",
          "objetivo": "O que queremos descobrir",
          "o_que_avaliar": ["Aspecto 1", "Aspecto 2"],
          "red_flags": ["Sinal de alerta 1", "Sinal de alerta 2"]
        }
      ]
    }
  ],
  
  "avaliacao_final": {
    "recomendacao": "APROVAR|ENTREVISTAR|REAVALIAR|REPROVAR",
    "justificativa": "Justificativa detalhada da recomendação",
    "proximos_passos": [
      "Passo 1",
      "Passo 2"
    ],
    "riscos_identificados": [
      "Risco 1"
    ],
    "pontos_atencao_entrevista": [
      "Ponto 1 para observar na entrevista"
    ]
  }
}

## ⚠️ IMPORTANTE:

1. Analise no MÁXIMO 5 requisitos imprescindíveis e 3 desejáveis (os mais importantes)
2. Seja CONCISO nas justificativas (máximo 2 frases)
3. Liste no máximo 2 evidências por requisito
4. Crie no máximo 3 categorias de perguntas com 2 perguntas cada
5. O JSON deve ser COMPACTO - evite textos longos
6. Referencie experiências ESPECÍFICAS do candidato
7. Score geral deve refletir a média ponderada (imprescindíveis pesam mais)

Responda APENAS com o JSON, sem texto adicional ou markdown.
4. Crie perguntas que mencionem experiências do CV (ex: "Na sua atuação na DATINFO...")
5. Agrupe perguntas por TEMA (Documentação, Testes, Metodologias, APIs, etc.)
6. Seja justo: se há evidência parcial, classifique como ATENDE_PARCIALMENTE, não como GAP
7. Score geral deve refletir a média ponderada (imprescindíveis pesam mais)

Responda APENAS com o JSON, sem texto adicional.
`;
}
