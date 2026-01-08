// ============================================================
// ANÁLISE DE ADEQUAÇÃO DE PERFIL - API Backend
// Endpoint: /api/analise-adequacao-perfil
// ============================================================
// Análise profunda requisito a requisito entre Candidato × Vaga
// Vai além do match de skills - analisa competências e experiências
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

// Debug: listar variáveis de ambiente disponíveis (sem valores)
console.log('🔍 Verificando variáveis de ambiente...');
console.log('📋 ANTHROPIC_API_KEY presente:', !!process.env.ANTHROPIC_API_KEY);
console.log('📋 API_KEY presente:', !!process.env.API_KEY);

// Tentar múltiplas fontes para a API key
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.API_KEY || '';

if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY não encontrada no ambiente Vercel!');
  console.error('📋 Variáveis disponíveis:', Object.keys(process.env).filter(k => k.includes('API') || k.includes('KEY')).join(', '));
} else {
  console.log('✅ API Key carregada, comprimento:', apiKey.length);
}

const anthropic = new Anthropic({ apiKey });

const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022'; // Usando Sonnet para análise mais profunda
const MAX_TOKENS = 8192;

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
  score_adequacao: number; // 0-100
  justificativa: string;
  pergunta_investigacao?: string;
  como_mitigar?: string;
}

interface CategoriaPerguntas {
  categoria: string;
  icone: string;
  perguntas: {
    pergunta: string;
    objetivo: string;
    o_que_avaliar: string[];
    red_flags: string[];
  }[];
}

interface AnaliseAdequacaoPerfil {
  // Metadados
  candidato_nome: string;
  vaga_titulo: string;
  data_analise: string;
  
  // Scores gerais
  score_geral: number;
  nivel_adequacao_geral: 'MUITO_COMPATIVEL' | 'COMPATIVEL' | 'PARCIALMENTE_COMPATIVEL' | 'INCOMPATIVEL';
  confianca_analise: number;
  
  // Análise detalhada por requisito
  requisitos_imprescindiveis: RequisitoAnalisado[];
  requisitos_muito_desejaveis: RequisitoAnalisado[];
  requisitos_desejaveis: RequisitoAnalisado[];
  
  // Resumo executivo
  resumo_executivo: {
    principais_pontos_fortes: string[];
    gaps_criticos: string[];
    gaps_investigar: string[];
    diferenciais_candidato: string[];
  };
  
  // Perguntas organizadas por tema
  perguntas_entrevista: CategoriaPerguntas[];
  
  // Avaliação final
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

  if (!apiKey) {
    console.error('❌ API Key não disponível no momento da requisição');
    return res.status(500).json({ 
      error: 'ANTHROPIC_API_KEY não configurada',
      debug: {
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasApiKey: !!process.env.API_KEY,
        envKeysWithApi: Object.keys(process.env).filter(k => k.toLowerCase().includes('api') || k.toLowerCase().includes('key')).length
      }
    });
  }

  try {
    const { candidato, vaga, opcoes } = req.body;

    if (!candidato || !vaga) {
      return res.status(400).json({ error: 'Candidato e Vaga são obrigatórios' });
    }

    console.log(`🔍 Iniciando análise de adequação: ${candidato.nome} × ${vaga.titulo}`);
    const startTime = Date.now();

    // Construir prompt detalhado
    const userPrompt = buildAnalysisPrompt(candidato, vaga, opcoes);

    // Chamar Claude
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    // Extrair resposta
    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    // Parsear JSON
    let result: AnaliseAdequacaoPerfil;
    try {
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      result = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Erro ao parsear resposta:', parseError);
      return res.status(500).json({ 
        error: 'Erro ao processar resposta da IA',
        raw: responseText.substring(0, 2000)
      });
    }

    const tempoMs = Date.now() - startTime;
    console.log(`✅ Análise concluída em ${tempoMs}ms - Score: ${result.score_geral}%`);

    // Adicionar metadados
    result.data_analise = new Date().toISOString();
    (result as any)._metadata = {
      modelo: CLAUDE_MODEL,
      tempo_ms: tempoMs,
      tokens_input: response.usage?.input_tokens,
      tokens_output: response.usage?.output_tokens
    };

    return res.status(200).json({ 
      success: true, 
      data: result 
    });

  } catch (error: any) {
    console.error('❌ Erro na análise:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro interno' 
    });
  }
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

---

## 🎯 SUA TAREFA

Analise **cada requisito** da vaga individualmente e avalie o nível de adequação do candidato.

Para requisitos que envolvem **competências funcionais** (como "escrever histórias de usuário", "conduzir homologação", etc.), busque evidências nas descrições das experiências, não apenas nas skills listadas.

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

1. Analise CADA requisito mencionado na vaga (imprescindíveis E desejáveis)
2. Para competências funcionais, busque evidências nas DESCRIÇÕES das experiências
3. Referencie experiências ESPECÍFICAS do candidato nas evidências
4. Crie perguntas que mencionem experiências do CV (ex: "Na sua atuação na DATINFO...")
5. Agrupe perguntas por TEMA (Documentação, Testes, Metodologias, APIs, etc.)
6. Seja justo: se há evidência parcial, classifique como ATENDE_PARCIALMENTE, não como GAP
7. Score geral deve refletir a média ponderada (imprescindíveis pesam mais)

Responda APENAS com o JSON, sem texto adicional.
`;
}
