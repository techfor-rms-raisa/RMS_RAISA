
import type { Type, Schema } from "@google/genai";

// Dynamic import to avoid Rollup bundling issues
let GoogleGenAI: any;
if (typeof window !== 'undefined') {
    GoogleGenAI = (await import('@google/genai')).GoogleGenAI;
}
import { AI_MODEL_NAME } from '../constants';
import { Vaga, PerguntaTecnica, MatrizQualificacao, RespostaCandidato } from '../components/types';

const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const perguntasTecnicasService = {
  
  async gerarPerguntas(vaga: Vaga): Promise<Omit<PerguntaTecnica, 'id'>[]> {
    const model = AI_MODEL_NAME;
    const prompt = `
Você é um especialista em recrutamento técnico de TI. Gere perguntas técnicas para entrevista.

**CONTEXTO DA VAGA:**
- Título: ${vaga.titulo}
- Senioridade: ${vaga.senioridade}
- Stack: ${vaga.stack_tecnologica?.join(', ')}
- Requisitos Obrigatórios: ${vaga.requisitos_obrigatorios?.join(', ')}
- Requisitos Desejáveis: ${vaga.requisitos_desejaveis?.join(', ')}

**TAREFA:**
Gere 5 perguntas técnicas:
- 3 perguntas técnicas (sobre tecnologias específicas)
- 1 pergunta de experiência (sobre projetos anteriores)
- 1 pergunta comportamental (sobre trabalho em equipe, resolução de problemas)

Retorne JSON com "perguntas".
`;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            perguntas: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        pergunta_texto: { type: Type.STRING },
                        categoria: { type: Type.STRING, enum: ["tecnica", "comportamental", "experiencia"] },
                        tecnologia_relacionada: { type: Type.STRING },
                        nivel_dificuldade: { type: Type.STRING, enum: ["junior", "pleno", "senior"] },
                        resposta_esperada: { type: Type.STRING },
                        pontos_chave: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    ponto: { type: Type.STRING },
                                    importancia: { type: Type.STRING, enum: ["alta", "media", "baixa"] }
                                },
                                required: ["ponto", "importancia"]
                            }
                        }
                    },
                    required: ["pergunta_texto", "categoria", "resposta_esperada"]
                }
            }
        },
        required: ["perguntas"]
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema }
        });
        
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const data = JSON.parse(text || '{ "perguntas": [] }');
        
        return data.perguntas.map((p: any, index: number) => ({
            vaga_id: vaga.id,
            ...p,
            ordem: index + 1
        }));

    } catch (error) {
        console.error("Erro ao gerar perguntas:", error);
        return [];
    }
  },

  async avaliarCandidato(
      vaga: Vaga, 
      candidatoNome: string, 
      matriz: MatrizQualificacao, 
      respostas: (RespostaCandidato & { pergunta_texto: string, resposta_esperada: string })[]
  ): Promise<any> {
    const model = AI_MODEL_NAME;
    const prompt = `
Você é um especialista em avaliação técnica de candidatos. Analise o candidato abaixo.

**VAGA:**
- Título: ${vaga.titulo}
- Senioridade: ${vaga.senioridade}
- Stack: ${vaga.stack_tecnologica?.join(', ')}

**CANDIDATO:**
- Nome: ${candidatoNome}

**MATRIZ DE QUALIFICAÇÕES:**
${JSON.stringify(matriz.qualificacoes, null, 2)}

**RESPOSTAS DA ENTREVISTA:**
${respostas.map(r => `
Pergunta: ${r.pergunta_texto}
Resposta: ${r.resposta_texto}
Analista (Impressão): ${r.impressao_analista}
Resposta Esperada: ${r.resposta_esperada}
`).join('\n')}

**TAREFA:**
Avalie o candidato e retorne JSON.
`;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            score_geral: { type: Type.INTEGER },
            score_tecnico: { type: Type.INTEGER },
            score_experiencia: { type: Type.INTEGER },
            score_fit_cultural: { type: Type.INTEGER },
            recomendacao: { type: Type.STRING, enum: ["aprovado", "reprovado", "condicional"] },
            pontos_fortes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { aspecto: { type: Type.STRING }, justificativa: { type: Type.STRING } } } },
            gaps_identificados: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { gap: { type: Type.STRING }, severidade: { type: Type.STRING }, impacto: { type: Type.STRING } } } },
            requisitos_atendidos: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { requisito: { type: Type.STRING }, atendido: { type: Type.BOOLEAN }, justificativa: { type: Type.STRING } } } },
            taxa_atendimento: { type: Type.INTEGER },
            justificativa: { type: Type.STRING }
        },
        required: ["score_geral", "recomendacao", "justificativa", "pontos_fortes", "gaps_identificados"]
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema }
        });
        
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Erro na avaliação:", error);
        throw error;
    }
  }
};
