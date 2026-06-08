/**
 * perguntasTecnicasService.ts
 * Serviço de geração de perguntas técnicas e avaliação de candidatos via Gemini AI
 *
 * 🆕 v1.1 (08/06/2026): Migração Gemini — 'gemini-3-flash-preview' (modelo INEXISTENTE, retornava 404)
 *                       → 'gemini-2.5-flash' (estável, ativo)
 *                       Aplicado nos 2 callsites: gerarPerguntas() e avaliarCandidato().
 *                       Re-aplicação da entrega da sessão 05/06/2026 cujo commit foi perdido.
 *
 * Caminho: src/services/perguntasTecnicasService.ts
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AI_MODEL_NAME } from '../constants';
import { Vaga, PerguntaTecnica, MatrizQualificacao, RespostaCandidato } from '@/types';

/**
 * Helper: Normalizar stack_tecnologica para string
 */
function normalizeStackToString(stack: any): string {
  if (!stack) return 'Não informado';
  if (Array.isArray(stack)) return stack.join(', ');
  if (typeof stack === 'string') {
    const trimmed = stack.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.join(', ');
      } catch (e) { /* ignore */ }
    }
    return trimmed;
  }
  return String(stack);
}

/**
 * Configuração do cliente Gemini
 * Recupera API_KEY das variáveis de ambiente
 */
const getAIClient = () => {
  const apiKey = (typeof process !== 'undefined' && (process.env?.VITE_API_KEY || process.env?.API_KEY)) ||
                 import.meta.env?.VITE_API_KEY ||
                 "";
  
  if (!apiKey) {
    console.error("❌ API_KEY não configurada! Configure VITE_API_KEY");
    throw new Error("API_KEY não configurada");
  }
  
  return new GoogleGenAI({ apiKey });
};

/**
 * Schema para geração de perguntas técnicas
 */
const perguntasSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      pergunta: { type: Type.STRING },
      tipo: { type: Type.STRING },
      nivel_dificuldade: { type: Type.STRING },
      resposta_esperada: { type: Type.STRING },
      criterios_avaliacao: { type: Type.STRING }
    },
    required: ["pergunta", "tipo", "nivel_dificuldade", "resposta_esperada", "criterios_avaliacao"]
  }
};

/**
 * Schema para avaliação de candidatos
 */
const avaliacaoSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    candidato_nome: { type: Type.STRING },
    score_geral: { type: Type.NUMBER },
    score_tecnico: { type: Type.NUMBER },
    score_comportamental: { type: Type.NUMBER },
    recomendacao: { type: Type.STRING },
    pontos_fortes: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    pontos_fracos: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    parecer_final: { type: Type.STRING }
  },
  required: ["candidato_nome", "score_geral", "recomendacao", "parecer_final"]
};

export const perguntasTecnicasService = {
  
  /**
   * Gera perguntas técnicas para uma vaga
   */
  async gerarPerguntas(vaga: Vaga): Promise<Omit<PerguntaTecnica, 'id'>[]> {
    try {
      console.log('🤖 [PERGUNTAS] Gerando perguntas técnicas...');
      
      const ai = getAIClient();
      const model = 'gemini-2.5-flash';
      
      const prompt = `
Você é um especialista em recrutamento técnico de TI. Gere perguntas técnicas para entrevista.

**CONTEXTO DA VAGA:**
- Título: ${vaga.titulo}
- Senioridade: ${vaga.senioridade}
- Stack: ${normalizeStackToString(vaga.stack_tecnologica)}
- Requisitos Obrigatórios: ${vaga.requisitos_obrigatorios?.join(', ')}
- Requisitos Desejáveis: ${vaga.requisitos_desejaveis?.join(', ')}

**TAREFA:**
Gere 5 perguntas técnicas estruturadas:
- 3 perguntas técnicas (sobre tecnologias específicas)
- 1 pergunta de experiência (sobre projetos anteriores)
- 1 pergunta comportamental (sobre trabalho em equipe)

Para cada pergunta, forneça:
- pergunta: A pergunta em si
- tipo: "técnica", "experiência" ou "comportamental"
- nivel_dificuldade: "junior", "pleno" ou "senior"
- resposta_esperada: O que se espera na resposta
- criterios_avaliacao: Como avaliar a resposta

Retorne um array de perguntas estruturadas.
`;

      console.log('📝 [PERGUNTAS] Chamando API Gemini...');
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: perguntasSchema,
        }
      });

      console.log('✅ [PERGUNTAS] Resposta recebida!');
      const text = response.text;
      const data = JSON.parse(text);
      
      console.log(`✅ [PERGUNTAS] ${data.length} perguntas geradas`);
      
      return data.map((p: any, index: number) => ({
        vaga_id: vaga.id,
        pergunta: p.pergunta,
        tipo: p.tipo,
        nivel_dificuldade: p.nivel_dificuldade,
        resposta_esperada: p.resposta_esperada,
        criterios_avaliacao: p.criterios_avaliacao,
        ordem: index + 1
      }));
      
    } catch (error: any) {
      console.error("❌ Erro ao gerar perguntas:", error.message);
      return [];
    }
  },

  /**
   * Avalia um candidato com base nas respostas
   */
  async avaliarCandidato(
      vaga: Vaga, 
      candidatoNome: string, 
      matriz: MatrizQualificacao, 
      respostas: (RespostaCandidato & { pergunta_texto: string, resposta_esperada: string })[]
  ): Promise<any> {
    try {
      console.log('🤖 [AVALIACAO] Avaliando candidato...');
      
      const ai = getAIClient();
      const model = 'gemini-2.5-flash';
      
      const prompt = `
Você é um especialista em avaliação técnica de candidatos. Analise o candidato abaixo.

**VAGA:**
- Título: ${vaga.titulo}
- Senioridade: ${vaga.senioridade}
- Stack: ${normalizeStackToString(vaga.stack_tecnologica)}

**CANDIDATO:**
- Nome: ${candidatoNome}

**MATRIZ DE QUALIFICAÇÕES:**
${JSON.stringify(matriz.qualificacoes, null, 2)}

**RESPOSTAS DA ENTREVISTA:**
${respostas.map(r => `
Pergunta: ${r.pergunta_texto}
Resposta do Candidato: ${r.resposta_texto}
Impressão do Analista: ${r.impressao_analista}
Resposta Esperada: ${r.resposta_esperada}
`).join('\n')}

**TAREFA:**
Avalie o candidato e retorne:
- candidato_nome: Nome do candidato
- score_geral: Score de 0 a 100
- score_tecnico: Score técnico de 0 a 100
- score_comportamental: Score comportamental de 0 a 100
- recomendacao: "Contratar", "Entrevista Adicional" ou "Rejeitar"
- pontos_fortes: Array com pontos fortes
- pontos_fracos: Array com pontos fracos
- parecer_final: Parecer detalhado

Seja justo e objetivo na avaliação.
`;

      console.log('📝 [AVALIACAO] Chamando API Gemini...');
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: avaliacaoSchema,
        }
      });

      console.log('✅ [AVALIACAO] Resposta recebida!');
      const text = response.text;
      const data = JSON.parse(text);
      
      console.log(`✅ [AVALIACAO] Candidato avaliado com score ${data.score_geral}`);
      return data;
      
    } catch (error: any) {
      console.error("❌ Erro na avaliação:", error.message);
      return {
        candidato_nome: candidatoNome,
        score_geral: 0,
        recomendacao: "Erro na Avaliação",
        parecer_final: "Não foi possível avaliar o candidato. Tente novamente.",
        pontos_fortes: [],
        pontos_fracos: []
      };
    }
  }
};
