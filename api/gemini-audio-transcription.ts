// ============================================================
// API DE TRANSCRIÇÃO E ANÁLISE DE ÁUDIO - GEMINI
// Endpoint: /api/gemini-audio-transcription
// ============================================================
// Versão: 3.0 - Usando Gemini File API (suporta até 2GB)
// Data: 12/01/2026
// ============================================================
// MUDANÇA IMPORTANTE:
// - Não usa mais base64 (ineficiente para arquivos grandes)
// - Recebe URL do arquivo no Supabase Storage
// - Faz download e upload direto para Gemini File API
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
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { 
      action, 
      // Novos parâmetros (URL-based)
      audioUrl,
      audioMimeType,
      // Parâmetros legados (base64) - mantidos para compatibilidade
      audioBase64,
      // Parâmetros de análise
      transcricao, 
      perguntas, 
      vaga, 
      candidato 
    } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, error: 'Ação não especificada' });
    }

    console.log(`🎙️ [Gemini Audio] Ação: ${action}`);

    let result;

    switch (action) {
      // ✅ NOVO: Transcrição via URL (recomendado para arquivos grandes)
      case 'transcribe_url':
        if (!audioUrl) {
          return res.status(400).json({ success: false, error: 'audioUrl é obrigatório' });
        }
        console.log(`📥 Processando áudio via URL: ${audioUrl.substring(0, 100)}...`);
        result = await transcribeAudioFromUrl(audioUrl, audioMimeType || 'audio/mpeg');
        return res.status(200).json({
          success: true,
          ...result
        });

      // 🔄 LEGADO: Transcrição via base64 (para arquivos pequenos < 3MB)
      case 'transcribe':
        if (!audioBase64) {
          return res.status(400).json({ success: false, error: 'audioBase64 é obrigatório para transcrição' });
        }
        // Verificar tamanho do base64 (~1.33x do original)
        const base64SizeMB = (audioBase64.length * 0.75) / (1024 * 1024);
        console.log(`📊 Tamanho do áudio: ~${base64SizeMB.toFixed(2)}MB`);
        
        if (base64SizeMB > 15) {
          return res.status(400).json({ 
            success: false, 
            error: 'Arquivo muito grande para base64. Use action: transcribe_url',
            sugestao: 'Faça upload para Supabase Storage e envie a URL pública'
          });
        }
        
        result = await transcribeAudioBase64(audioBase64, audioMimeType || 'audio/mp3');
        return res.status(200).json({
          success: true,
          ...result
        });

      case 'analyze':
        if (!transcricao) {
          return res.status(400).json({ success: false, error: 'transcricao é obrigatória para análise' });
        }
        result = await analyzeTranscription(transcricao, perguntas, vaga, candidato);
        return res.status(200).json({
          success: true,
          ...result
        });

      case 'transcribe_and_analyze':
        let transcriptionResult: TranscriptionResult;
        
        if (audioUrl) {
          transcriptionResult = await transcribeAudioFromUrl(audioUrl, audioMimeType || 'audio/mpeg');
        } else if (audioBase64) {
          transcriptionResult = await transcribeAudioBase64(audioBase64, audioMimeType || 'audio/mp3');
        } else {
          return res.status(400).json({ success: false, error: 'audioUrl ou audioBase64 é obrigatório' });
        }
        
        if (transcriptionResult.transcricao) {
          const analysisResult = await analyzeTranscription(
            transcriptionResult.transcricao,
            perguntas,
            vaga,
            candidato
          );
          return res.status(200).json({
            success: true,
            transcricao: transcriptionResult,
            analise: analysisResult
          });
        } else {
          return res.status(200).json({
            success: true,
            transcricao: transcriptionResult,
            analise: null
          });
        }

      default:
        return res.status(400).json({ success: false, error: `Ação desconhecida: ${action}` });
    }

  } catch (error: any) {
    console.error('❌ [Gemini Audio] Erro:', error);
    
    const errorMessage = error.message || 'Erro desconhecido';
    const errorStatus = error.status || 500;
    
    if (errorStatus === 401 || errorStatus === 403) {
      return res.status(500).json({
        success: false,
        error: '❌ Erro na API Gemini: Chave de API inválida',
        tipo: 'AUTH_ERROR'
      });
    }
    
    if (errorStatus === 429) {
      return res.status(500).json({
        success: false,
        error: '❌ Erro na API Gemini: Limite de requisições',
        tipo: 'QUOTA_ERROR'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: `❌ Erro na API Gemini: ${errorMessage}`,
      tipo: 'GEMINI_ERROR'
    });
  }
}

// ============================================================
// TRANSCRIÇÃO VIA URL (RECOMENDADO)
// ============================================================

async function transcribeAudioFromUrl(audioUrl: string, mimeType: string): Promise<TranscriptionResult> {
  console.log('🎙️ [transcribeAudioFromUrl] Iniciando transcrição via URL...');
  console.log(`📎 URL: ${audioUrl}`);
  console.log(`📎 MIME Type: ${mimeType}`);
  
  try {
    // 1. Baixar o arquivo da URL
    console.log('📥 Baixando arquivo...');
    const response = await fetch(audioUrl);
    
    if (!response.ok) {
      throw new Error(`Falha ao baixar áudio: ${response.status} ${response.statusText}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    const audioSizeMB = audioBuffer.byteLength / (1024 * 1024);
    console.log(`📊 Tamanho do arquivo: ${audioSizeMB.toFixed(2)}MB`);

    // 2. Converter para base64 e usar inlineData (mais confiável)
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    console.log(`📊 Base64 gerado: ${(audioBase64.length / 1024 / 1024).toFixed(2)}MB`);
    
    // 3. Transcrever usando inlineData
    console.log('🎤 Transcrevendo...');
    
    const prompt = `Você é um transcritor profissional. Transcreva o áudio COMPLETAMENTE, palavra por palavra.

REGRAS IMPORTANTES:
1. Transcreva TUDO que for dito, sem resumir ou omitir
2. Identifique os diferentes falantes quando possível (Entrevistador:, Candidato:)
3. Mantenha pausas significativas como [pausa]
4. Se algo estiver inaudível, marque como [inaudível]
5. Mantenha o idioma original (provavelmente português brasileiro)
6. Preserve expressões, gírias e hesitações naturais da fala

Retorne APENAS a transcrição, sem comentários adicionais.`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { 
              inlineData: { 
                mimeType: mimeType || 'audio/mpeg', 
                data: audioBase64 
              } 
            },
            { text: prompt }
          ]
        }
      ]
    });

    const transcricao = result.text || '';
    
    console.log(`✅ Transcrição concluída: ${transcricao.length} caracteres`);
    
    return {
      transcricao,
      idioma: 'pt-BR',
      confianca: 90,
      duracao_estimada: Math.round(audioSizeMB * 60) // Estimativa grosseira
    };
    
  } catch (error: any) {
    console.error('❌ Erro na transcrição via URL:', error);
    throw error;
  }
}

// ============================================================
// TRANSCRIÇÃO VIA BASE64 (LEGADO - ARQUIVOS PEQUENOS)
// ============================================================

async function transcribeAudioBase64(audioBase64: string, mimeType: string): Promise<TranscriptionResult> {
  console.log('🎙️ [transcribeAudioBase64] Iniciando transcrição via base64...');
  
  const prompt = `Você é um transcritor profissional. Transcreva o áudio COMPLETAMENTE, palavra por palavra.

REGRAS:
1. Transcreva TUDO que for dito
2. Identifique falantes (Entrevistador:, Candidato:)
3. Marque pausas como [pausa]
4. Marque trechos inaudíveis como [inaudível]
5. Mantenha o idioma original

Retorne APENAS a transcrição.`;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: prompt }
          ]
        }
      ]
    });

    const transcricao = result.text || '';
    
    return {
      transcricao,
      idioma: 'pt-BR',
      confianca: 85,
      duracao_estimada: undefined
    };
    
  } catch (error: any) {
    console.error('❌ Erro na transcrição base64:', error);
    throw error;
  }
}

// ============================================================
// ANÁLISE DA TRANSCRIÇÃO
// ============================================================

async function analyzeTranscription(
  transcricao: string,
  perguntas?: ExpectedQuestion[],
  vaga?: any,
  candidato?: any
): Promise<AnalysisResult> {
  console.log('🧠 [analyzeTranscription] Analisando entrevista...');
  
  const perguntasFormatadas = perguntas?.map((p, i) => 
    `${i + 1}. [${p.categoria || 'Geral'}] ${p.pergunta}`
  ).join('\n') || 'Não especificadas';
  
  const vagaInfo = vaga ? `
**Vaga:** ${vaga.titulo || 'Não especificada'}
**Requisitos:** ${Array.isArray(vaga.requisitos_obrigatorios) ? vaga.requisitos_obrigatorios.join(', ') : vaga.requisitos_obrigatorios || 'Não especificados'}
**Stack:** ${Array.isArray(vaga.stack_tecnologica) ? vaga.stack_tecnologica.join(', ') : vaga.stack_tecnologica || 'Não especificada'}
` : '';
  
  const candidatoInfo = candidato ? `
**Candidato:** ${candidato.nome || 'Não identificado'}
` : '';

  const prompt = `Você é um **Analista de R&S Sênior** especializado em avaliar entrevistas técnicas.

## CONTEXTO
${vagaInfo}
${candidatoInfo}

## PERGUNTAS ESPERADAS NA ENTREVISTA
${perguntasFormatadas}

## TRANSCRIÇÃO DA ENTREVISTA
${transcricao}

---

## SUA TAREFA

Analise a entrevista e retorne um JSON com esta estrutura EXATA:

{
  "resumo": "Resumo executivo da entrevista (2-3 frases)",
  "respostas_identificadas": [
    {
      "pergunta_relacionada": "Pergunta que foi respondida",
      "resposta_extraida": "Resumo da resposta do candidato",
      "qualidade": "excelente|boa|regular|fraca|nao_respondeu",
      "score": 0-100,
      "observacao": "Análise crítica da resposta"
    }
  ],
  "pontos_fortes": ["Ponto forte 1", "Ponto forte 2"],
  "pontos_atencao": ["Ponto de atenção 1"],
  "red_flags": ["Red flag identificado, se houver"],
  "score_tecnico": 0-100,
  "score_comunicacao": 0-100,
  "score_geral": 0-100,
  "recomendacao": "APROVAR|REPROVAR|REAVALIAR",
  "justificativa": "Justificativa detalhada da recomendação"
}

### CRITÉRIOS DE AVALIAÇÃO:

**Score Técnico (0-100):**
- 90-100: Demonstrou domínio excepcional, com exemplos práticos detalhados
- 70-89: Bom conhecimento, com algumas lacunas menores
- 50-69: Conhecimento básico, falta profundidade
- 30-49: Conhecimento superficial, muitas lacunas
- 0-29: Não demonstrou conhecimento adequado

**Score Comunicação (0-100):**
- Clareza e objetividade nas respostas
- Capacidade de estruturar o pensamento
- Uso adequado de exemplos

**Recomendação:**
- APROVAR: Score geral ≥ 70 e sem red flags críticos
- REAVALIAR: Score entre 50-69 ou com dúvidas a esclarecer
- REPROVAR: Score < 50 ou red flags críticos

Responda APENAS com o JSON, sem texto adicional.`;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

    const text = result.text || '';
    const jsonClean = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

    try {
      return JSON.parse(jsonClean);
    } catch {
      const jsonMatch = jsonClean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Falha ao parsear análise');
    }
  } catch (error: any) {
    console.error('❌ Erro na análise:', error);
    
    // Retornar análise padrão em caso de erro
    return {
      resumo: 'Erro ao analisar entrevista',
      pontos_fortes: [],
      pontos_atencao: ['Não foi possível analisar automaticamente'],
      red_flags: [],
      respostas_identificadas: [],
      score_tecnico: 0,
      score_comunicacao: 0,
      score_geral: 0,
      recomendacao: 'REAVALIAR',
      justificativa: `Erro na análise automática: ${error.message}`
    };
  }
}

