// ============================================================
// API DE TRANSCRIÇÃO E ANÁLISE DE ÁUDIO - GEMINI
// Endpoint: /api/gemini-audio-transcription
// ============================================================
// Suporta transcrição de áudio de entrevistas e análise das respostas
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('❌ API_KEY (Gemini) não encontrada!');
} else {
  console.log('✅ API_KEY (Gemini) carregada');
}

const ai = new GoogleGenAI({ apiKey });
const GEMINI_MODEL = 'gemini-2.0-flash';

// ============================================================
// TIPOS
// ============================================================

interface TranscriptionResult {
  transcricao: string;
  idioma: string;
  confianca: number;
  duracao_estimada?: number;
  segmentos?: TranscriptionSegment[];
}

interface TranscriptionSegment {
  inicio_segundos: number;
  fim_segundos: number;
  texto: string;
}

interface AnalysisResult {
  resumo: string;
  pontos_fortes: string[];
  pontos_atencao: string[];
  red_flags: string[];
  respostas_identificadas: IdentifiedAnswer[];
  score_tecnico: number;
  score_comunicacao: number;
  score_geral: number;
  recomendacao: 'APROVAR' | 'REPROVAR' | 'REAVALIAR';
  justificativa: string;
}

interface IdentifiedAnswer {
  pergunta_relacionada?: string;
  resposta_extraida: string;
  qualidade: 'excelente' | 'boa' | 'regular' | 'fraca' | 'nao_respondeu';
  score: number;
  observacao: string;
}

interface ExpectedQuestion {
  pergunta: string;
  categoria?: string;
  peso?: number;
}

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
    return res.status(500).json({
      error: '❌ Erro na API Gemini: API_KEY não configurada',
      tipo: 'CONFIG_ERROR',
      acao: 'Configure a variável API_KEY no Vercel'
    });
  }

  try {
    const { action, audioBase64, audioMimeType, transcricao, perguntas, vaga, candidato } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action é obrigatório' });
    }

    console.log(`🎙️ [Gemini Audio] Ação: ${action}`);

    let result;

    switch (action) {
      case 'transcribe':
        if (!audioBase64) {
          return res.status(400).json({ error: 'audioBase64 é obrigatório para transcrição' });
        }
        result = await transcribeAudio(audioBase64, audioMimeType);
        break;

      case 'analyze':
        if (!transcricao) {
          return res.status(400).json({ error: 'transcricao é obrigatória para análise' });
        }
        result = await analyzeTranscription(transcricao, perguntas, vaga, candidato);
        break;

      case 'transcribe_and_analyze':
        if (!audioBase64) {
          return res.status(400).json({ error: 'audioBase64 é obrigatório' });
        }
        const transcriptionResult = await transcribeAudio(audioBase64, audioMimeType);
        if (transcriptionResult.transcricao) {
          const analysisResult = await analyzeTranscription(
            transcriptionResult.transcricao,
            perguntas,
            vaga,
            candidato
          );
          result = {
            transcricao: transcriptionResult,
            analise: analysisResult
          };
        } else {
          result = { transcricao: transcriptionResult, analise: null };
        }
        break;

      default:
        return res.status(400).json({ error: `Ação desconhecida: ${action}` });
    }

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('❌ [Gemini Audio] Erro:', error);
    
    const errorMessage = error.message || '';
    const errorStatus = error.status || 500;
    
    if (errorStatus === 401 || errorStatus === 403) {
      return res.status(500).json({
        error: '❌ Erro na API Gemini (gemini-2.0-flash): Chave de API inválida',
        tipo: 'AUTH_ERROR',
        acao: 'Atualize a API_KEY no Vercel'
      });
    }
    
    if (errorStatus === 429) {
      return res.status(500).json({
        error: '❌ Erro na API Gemini (gemini-2.0-flash): Limite de requisições',
        tipo: 'QUOTA_ERROR',
        acao: 'Aguarde alguns minutos'
      });
    }
    
    return res.status(500).json({
      error: `❌ Erro na API Gemini: ${errorMessage}`,
      tipo: 'SERVER_ERROR'
    });
  }
}

// ============================================================
// TRANSCRIÇÃO DE ÁUDIO
// ============================================================

async function transcribeAudio(audioBase64: string, mimeType: string = 'audio/mp3'): Promise<TranscriptionResult> {
  console.log(`🎙️ Iniciando transcrição... (${(audioBase64.length / 1024).toFixed(0)}KB)`);
  const startTime = Date.now();

  const prompt = `Você é um transcritor profissional. Transcreva o áudio a seguir para texto em português brasileiro.

INSTRUÇÕES:
1. Transcreva FIELMENTE o que foi dito, sem resumir ou interpretar
2. Mantenha as pausas como "..." quando houver hesitação
3. Preserve expressões como "né", "tipo", "então" etc
4. Se houver múltiplas vozes, indique como [Entrevistador] e [Candidato]
5. Se algo não for audível, marque como [inaudível]

FORMATO DE RESPOSTA (JSON):
{
  "transcricao": "texto completo da transcrição",
  "idioma": "pt-BR",
  "confianca": 0-100,
  "observacoes": "qualquer observação relevante sobre o áudio"
}

Responda APENAS com o JSON, sem texto adicional.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: audioBase64
              }
            },
            { text: prompt }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    });

    const responseText = response.text || '';
    
    // Parsear JSON
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const result = JSON.parse(cleanedText);
    
    const tempoMs = Date.now() - startTime;
    console.log(`✅ Transcrição concluída em ${tempoMs}ms`);

    return {
      transcricao: result.transcricao,
      idioma: result.idioma || 'pt-BR',
      confianca: result.confianca || 85
    };

  } catch (error: any) {
    console.error('❌ Erro na transcrição:', error);
    throw error;
  }
}

// ============================================================
// ANÁLISE DE TRANSCRIÇÃO
// ============================================================

async function analyzeTranscription(
  transcricao: string,
  perguntas?: ExpectedQuestion[],
  vaga?: any,
  candidato?: any
): Promise<AnalysisResult> {
  console.log(`🔍 Iniciando análise da transcrição...`);
  const startTime = Date.now();

  const perguntasFormatadas = perguntas && perguntas.length > 0
    ? perguntas.map((p, i) => `${i + 1}. ${p.pergunta} (Categoria: ${p.categoria || 'Geral'}, Peso: ${p.peso || 1})`).join('\n')
    : 'Não foram fornecidas perguntas específicas. Analise o conteúdo geral da entrevista.';

  const vagaInfo = vaga
    ? `
**Vaga:** ${vaga.titulo || 'Não especificada'}
**Requisitos:** ${vaga.requisitos_obrigatorios || vaga.requisitos || 'Não especificados'}
**Stack:** ${Array.isArray(vaga.stack_tecnologica) ? vaga.stack_tecnologica.join(', ') : vaga.stack_tecnologica || 'Não especificada'}
`
    : 'Informações da vaga não disponíveis.';

  const candidatoInfo = candidato
    ? `**Candidato:** ${candidato.nome || 'Não identificado'}`
    : '';

  const prompt = `Você é um especialista em recrutamento analisando uma transcrição de entrevista técnica.

## CONTEXTO DA VAGA
${vagaInfo}

## CANDIDATO
${candidatoInfo}

## PERGUNTAS ESPERADAS NA ENTREVISTA
${perguntasFormatadas}

## TRANSCRIÇÃO DA ENTREVISTA
${transcricao}

---

## SUA TAREFA

Analise a transcrição da entrevista e avalie:

1. **Identificação de Respostas**: Para cada pergunta esperada, identifique se foi respondida e extraia a resposta
2. **Qualidade Técnica**: Avalie a profundidade e precisão das respostas técnicas
3. **Comunicação**: Avalie clareza, objetividade e articulação
4. **Red Flags**: Identifique inconsistências, evasões ou sinais de alerta
5. **Pontos Fortes**: Destaque o que o candidato demonstrou de positivo

Retorne um JSON com esta estrutura EXATA:

{
  "resumo": "Resumo geral da entrevista em 2-3 frases",
  
  "pontos_fortes": [
    "Ponto forte 1 com contexto",
    "Ponto forte 2 com contexto"
  ],
  
  "pontos_atencao": [
    "Ponto que precisa ser verificado"
  ],
  
  "red_flags": [
    "Sinal de alerta identificado (se houver)"
  ],
  
  "respostas_identificadas": [
    {
      "pergunta_relacionada": "Pergunta que foi respondida",
      "resposta_extraida": "Resumo da resposta dada",
      "qualidade": "excelente|boa|regular|fraca|nao_respondeu",
      "score": 0-100,
      "observacao": "Observação sobre a resposta"
    }
  ],
  
  "score_tecnico": 0-100,
  "score_comunicacao": 0-100,
  "score_geral": 0-100,
  
  "recomendacao": "APROVAR|REPROVAR|REAVALIAR",
  "justificativa": "Justificativa detalhada da recomendação"
}

## CRITÉRIOS DE AVALIAÇÃO:

- **APROVAR** (score >= 70): Candidato demonstrou competência técnica e boa comunicação
- **REAVALIAR** (score 50-69): Alguns pontos precisam ser melhor investigados
- **REPROVAR** (score < 50): Gaps críticos ou red flags significativos

Responda APENAS com o JSON, sem texto adicional.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      }
    });

    const responseText = response.text || '';
    
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const result = JSON.parse(cleanedText);
    
    const tempoMs = Date.now() - startTime;
    console.log(`✅ Análise concluída em ${tempoMs}ms - Score: ${result.score_geral}%`);

    return result;

  } catch (error: any) {
    console.error('❌ Erro na análise:', error);
    throw error;
  }
}
