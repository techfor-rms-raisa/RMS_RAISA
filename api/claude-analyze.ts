// ============================================================
// CLAUDE ANALYZE API - Vercel Serverless Function
// Endpoint: /api/claude-analyze
// ============================================================
// Caminho: api/claude-analyze.ts
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const apiKey = process.env.ANTHROPIC_API_KEY || '';

if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY não encontrada no ambiente Vercel!');
} else {
  console.log('✅ ANTHROPIC_API_KEY carregada com sucesso');
}

const anthropic = new Anthropic({ apiKey });

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'; // Haiku 4.5 - mais econômico
const MAX_TOKENS = 4096;

// ============================================================
// AÇÕES PERMITIDAS
// ============================================================

const ALLOWED_ACTIONS = [
  'recomendar_decisao_final',
  'analisar_risco',
  'avaliar_entrevista',
  'gerar_perguntas_tecnicas',
  'match_detalhado',
  'justificativa_cliente',
  'analisar_fit_cultural',
  'analisar_gaps'
];

// ============================================================
// SYSTEM PROMPTS POR AÇÃO
// ============================================================

const SYSTEM_PROMPTS: Record<string, string> = {
  recomendar_decisao_final: `Você é um consultor sênior de Recrutamento e Seleção com 20 anos de experiência.

Sua tarefa é analisar o match entre candidato e vaga de forma criteriosa e profissional.

FOCO PRINCIPAL: Identificar GAPs (lacunas) entre o que a vaga exige e o que o candidato oferece.

Para cada GAP identificado, classifique:
- ELIMINATORIO: Requisito obrigatório que o candidato não atende (ex: não tem a certificação exigida)
- IMPORTANTE: Gap significativo que precisa ser avaliado pelo analista
- DESEJAVEL: Requisito "nice to have" não atendido
- MENOR: Pequena lacuna que não impacta significativamente

Para GAPs IMPORTANTES, sempre sugira uma pergunta que o analista pode fazer para investigar melhor.

Seja honesto, equilibrado e forneça justificativas claras.
Responda APENAS em JSON válido, sem markdown.`,

  analisar_risco: `Você é um analista de riscos especializado em recrutamento e seleção.

Identifique riscos potenciais de forma equilibrada - nem alarmista, nem negligente.

Considere:
- Histórico profissional (gaps, mudanças frequentes, progressão de carreira)
- Red flags em experiências anteriores
- Fit cultural e expectativas
- Riscos de retenção
- Questões de compliance

Seja justo e objetivo. Responda APENAS em JSON válido, sem markdown.`,

  avaliar_entrevista: `Você é um especialista em avaliação de entrevistas com vasta experiência em R&S.

Analise as respostas do candidato considerando:
- Clareza e objetividade nas respostas
- Profundidade técnica demonstrada
- Exemplos concretos e situações reais (método STAR)
- Habilidades de comunicação
- Fit cultural e alinhamento de valores
- Sinais comportamentais (entusiasmo, motivação, red flags)

Identifique também GAPs revelados durante a entrevista.

Seja justo e construtivo. Responda APENAS em JSON válido, sem markdown.`,

  gerar_perguntas_tecnicas: `Você é um tech lead experiente que conduz entrevistas técnicas.

Crie perguntas relevantes e progressivas (fácil → difícil) que avaliem:
- Conhecimento técnico nas tecnologias da vaga
- Capacidade de raciocínio e resolução de problemas
- Experiência prática (não apenas teoria)
- Soft skills relevantes para a posição

IMPORTANTE: Se houver GAPs identificados no perfil do candidato, inclua perguntas específicas para investigar esses GAPs.

Inclua perguntas situacionais baseadas na experiência do candidato.
Responda APENAS em JSON válido, sem markdown.`,

  match_detalhado: `Você é um consultor sênior de R&S especializado em análise de compatibilidade.

Realize um match detalhado entre candidato e vaga, identificando:
- Pontos de total compatibilidade
- GAPs (lacunas) com classificação de severidade
- Potencial de desenvolvimento
- Riscos de mismatch

Para cada GAP, indique se é eliminatório ou se pode ser investigado/mitigado.

Seja analítico e objetivo. Responda APENAS em JSON válido, sem markdown.`,

  justificativa_cliente: `Você é um consultor de R&S que se comunica com clientes corporativos.

Escreva de forma profissional, clara e convincente.
Destaque o valor do candidato e seja transparente sobre limitações.

Se houver GAPs relevantes, mencione-os de forma construtiva, explicando como podem ser mitigados ou por que não são impeditivos.

Responda APENAS em JSON válido, sem markdown.`,

  analisar_fit_cultural: `Você é um especialista em cultura organizacional e fit cultural.

Analise a compatibilidade considerando:
- Valores pessoais vs valores da empresa
- Estilo de trabalho preferido
- Expectativas de carreira
- Ambiente de trabalho ideal
- Dinâmicas de equipe

Seja nuançado e evite generalizações.
Responda APENAS em JSON válido, sem markdown.`,

  analisar_gaps: `Você é um analista especializado em identificação de GAPs em processos de R&S.

Sua única tarefa é identificar e classificar GAPs (lacunas) entre candidato e vaga.

Para cada GAP encontrado, forneça:
- Categoria (TECNICO, EXPERIENCIA, FORMACAO, IDIOMA, SOFT_SKILL, CULTURAL, LOGISTICO)
- O que a vaga exige
- O que o candidato oferece
- Severidade (ELIMINATORIO, IMPORTANTE, DESEJAVEL, MENOR)
- Impacto (DESQUALIFICA, REQUER_AVALIACAO, ACEITAVEL)
- Justificativa clara
- Pergunta sugerida para o analista investigar (se aplicável)
- Possível mitigação (se aplicável)

Seja analítico e objetivo. Responda APENAS em JSON válido, sem markdown.`
};

// ============================================================
// PROMPTS DE USUÁRIO POR AÇÃO
// ============================================================

function buildUserPrompt(action: string, payload: any): string {
  switch (action) {
    case 'recomendar_decisao_final':
      return `Analise este candidato para a vaga:

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

SCORE INICIAL (triagem automática): ${payload.scoreInicial || 0}%

Retorne um JSON com esta estrutura EXATA:
{
  "recomendacao": "APROVAR" | "REPROVAR" | "REAVALIAR",
  "score_final": 0-100,
  "confianca": 0-100,
  "pontos_fortes": ["string"],
  "pontos_atencao": ["string"],
  "justificativa": "string",
  "proximos_passos": "string",
  "analise_gaps": {
    "total_gaps": number,
    "gaps_eliminatorios": [
      {
        "categoria": "TECNICO" | "EXPERIENCIA" | "FORMACAO" | "IDIOMA" | "SOFT_SKILL" | "CULTURAL" | "LOGISTICO",
        "requisito_vaga": "string",
        "situacao_candidato": "string",
        "severidade": "ELIMINATORIO",
        "impacto": "DESQUALIFICA",
        "justificativa": "string"
      }
    ],
    "gaps_para_avaliar": [
      {
        "categoria": "string",
        "requisito_vaga": "string",
        "situacao_candidato": "string",
        "severidade": "IMPORTANTE",
        "impacto": "REQUER_AVALIACAO",
        "justificativa": "string",
        "pergunta_sugerida": "string",
        "possivel_mitigacao": "string"
      }
    ],
    "gaps_aceitaveis": [
      {
        "categoria": "string",
        "requisito_vaga": "string",
        "situacao_candidato": "string",
        "severidade": "DESEJAVEL" | "MENOR",
        "impacto": "ACEITAVEL",
        "justificativa": "string"
      }
    ],
    "resumo_gaps": "string",
    "recomendacao_analista": "string"
  }
}`;

    case 'analisar_risco':
      return `Analise os riscos deste candidato para a vaga:

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

Retorne um JSON com esta estrutura:
{
  "nivel_risco": "BAIXO" | "MEDIO" | "ALTO",
  "score_risco": 0-100,
  "riscos_identificados": [
    {
      "tipo": "string",
      "descricao": "string",
      "severidade": "BAIXA" | "MEDIA" | "ALTA",
      "mitigacao": "string"
    }
  ],
  "red_flags": ["string"],
  "pontos_positivos": ["string"],
  "recomendacao": "string"
}`;

    case 'avaliar_entrevista':
      return `Avalie esta entrevista:

TRANSCRIÇÃO:
${payload.transcricao}

PERGUNTAS PLANEJADAS:
${JSON.stringify(payload.perguntas, null, 2)}

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

${payload.candidato ? `CANDIDATO:\n${JSON.stringify(payload.candidato, null, 2)}` : ''}

Retorne um JSON com esta estrutura:
{
  "score_geral": 0-100,
  "scores_por_competencia": {
    "tecnico": 0-100,
    "comunicacao": 0-100,
    "problema_solving": 0-100,
    "fit_cultural": 0-100
  },
  "destaques_positivos": ["string"],
  "areas_preocupacao": ["string"],
  "analise_comportamental": "string",
  "recomendacao": "APROVAR" | "REPROVAR" | "SEGUNDA_ENTREVISTA",
  "justificativa": "string",
  "perguntas_followup": ["string"],
  "gaps_identificados_entrevista": [
    {
      "categoria": "string",
      "requisito_vaga": "string",
      "situacao_candidato": "string",
      "severidade": "string",
      "impacto": "string",
      "justificativa": "string"
    }
  ]
}`;

    case 'gerar_perguntas_tecnicas':
      return `Gere ${payload.quantidade || 10} perguntas técnicas para esta entrevista:

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

${payload.focalizarGaps ? 'IMPORTANTE: Inclua perguntas específicas para investigar possíveis GAPs no perfil do candidato.' : ''}

Retorne um JSON array com esta estrutura:
[
  {
    "pergunta": "string",
    "tipo": "TECNICA" | "COMPORTAMENTAL" | "SITUACIONAL",
    "dificuldade": "FACIL" | "MEDIA" | "DIFICIL",
    "competencia_avaliada": "string",
    "resposta_esperada": "string",
    "red_flags": ["string"]
  }
]`;

    case 'match_detalhado':
      return `Realize um match detalhado entre candidato e vaga:

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

Retorne um JSON com a mesma estrutura de "recomendar_decisao_final" (inclui análise de GAPs completa).`;

    case 'justificativa_cliente':
      return `Gere uma justificativa profissional para o cliente:

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

DECISÃO: ${payload.decisao}
MOTIVOS INTERNOS: ${payload.motivos?.join(', ') || 'Não especificados'}

${payload.gapsRelevantes ? `GAPS RELEVANTES:\n${JSON.stringify(payload.gapsRelevantes, null, 2)}` : ''}

Retorne um JSON com esta estrutura:
{
  "resumo_executivo": "string (2-3 frases)",
  "pontos_destaque": ["string"],
  "consideracoes": ["string"],
  "gaps_relevantes": ["string"],
  "recomendacao_cliente": "string",
  "texto_email": "string (texto completo pronto para enviar)"
}`;

    case 'analisar_fit_cultural':
      return `Analise o fit cultural:

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

EMPRESA:
${JSON.stringify(payload.empresa, null, 2)}

Retorne um JSON com esta estrutura:
{
  "score_fit": 0-100,
  "compatibilidades": ["string"],
  "potenciais_conflitos": ["string"],
  "recomendacoes_onboarding": ["string"],
  "analise_detalhada": "string"
}`;

    case 'analisar_gaps':
      return `Analise APENAS os GAPs entre candidato e vaga:

CANDIDATO:
${JSON.stringify(payload.candidato, null, 2)}

VAGA:
${JSON.stringify(payload.vaga, null, 2)}

Retorne um JSON com esta estrutura:
{
  "total_gaps": number,
  "gaps_eliminatorios": [
    {
      "categoria": "TECNICO" | "EXPERIENCIA" | "FORMACAO" | "IDIOMA" | "SOFT_SKILL" | "CULTURAL" | "LOGISTICO",
      "requisito_vaga": "string",
      "situacao_candidato": "string",
      "severidade": "ELIMINATORIO",
      "impacto": "DESQUALIFICA",
      "justificativa": "string"
    }
  ],
  "gaps_para_avaliar": [
    {
      "categoria": "string",
      "requisito_vaga": "string",
      "situacao_candidato": "string",
      "severidade": "IMPORTANTE",
      "impacto": "REQUER_AVALIACAO",
      "justificativa": "string",
      "pergunta_sugerida": "string para o analista investigar",
      "possivel_mitigacao": "string"
    }
  ],
  "gaps_aceitaveis": [
    {
      "categoria": "string",
      "requisito_vaga": "string",
      "situacao_candidato": "string",
      "severidade": "DESEJAVEL" | "MENOR",
      "impacto": "ACEITAVEL",
      "justificativa": "string"
    }
  ],
  "resumo_gaps": "string resumindo a situação geral",
  "recomendacao_analista": "string com orientação clara para o analista"
}`;

    default:
      throw new Error(`Ação não suportada: ${action}`);
  }
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar API key
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY não configurada');
    return res.status(500).json({ 
      error: 'ANTHROPIC_API_KEY não configurada no servidor' 
    });
  }

  try {
    const { action, payload } = req.body;

    // Validar ação
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({ 
        error: `Ação inválida: ${action}. Permitidas: ${ALLOWED_ACTIONS.join(', ')}` 
      });
    }

    // Validar payload
    if (!payload) {
      return res.status(400).json({ error: 'Payload é obrigatório' });
    }

    console.log(`🔵 Claude API: Processando ação "${action}"`);
    const startTime = Date.now();

    // Chamar Claude
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPTS[action],
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(action, payload)
        }
      ]
    });

    // Extrair texto da resposta
    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    // Limpar e parsear JSON
    let result;
    try {
      // Remover possíveis marcadores de código
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      result = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Erro ao parsear resposta Claude:', parseError);
      console.error('Resposta bruta:', responseText.substring(0, 500));
      
      return res.status(500).json({ 
        error: 'Erro ao processar resposta da IA',
        raw: responseText.substring(0, 1000)
      });
    }

    const tempoMs = Date.now() - startTime;
    console.log(`✅ Claude API: Ação "${action}" concluída em ${tempoMs}ms`);

    // Adicionar metadados
    result._metadata = {
      action,
      model: CLAUDE_MODEL,
      tempoMs,
      tokens_input: response.usage?.input_tokens,
      tokens_output: response.usage?.output_tokens
    };

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Erro Claude API:', error);

    // Erro específico da Anthropic
    if (error.status) {
      return res.status(error.status).json({ 
        error: error.message,
        status: error.status 
      });
    }

    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor' 
    });
  }
}
