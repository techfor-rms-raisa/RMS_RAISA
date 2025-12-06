
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_MODEL_NAME } from '../constants';
import { Vaga, PerguntaTecnica, MatrizQualificacao, RespostaCandidato } from '../components/types';

const apiKey = import.meta.env?.VITE_API_KEY || "";
const ai = new GoogleGenerativeAI({ apiKey });

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

    // Schema removed - not supported by @google/generative-ai

    try {
        const response = await ai.models.generateContent({ model: AI_MODEL_NAME, contents: prompt });
        
        const text = response.text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
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

    // Schema removed - not supported by @google/generative-ai

    try {
        const response = await ai.models.generateContent({ model: AI_MODEL_NAME, contents: prompt });
        
        const text = response.text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Erro na avaliação:", error);
        throw error;
    }
  }
};
