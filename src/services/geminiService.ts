import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIAnalysisResult, RiskScore, Recommendation, BehavioralFlag } from '../components/types';
import { AI_MODEL_NAME } from '../../constants';

// Access API Key - supporting Vercel/Vite environment variables
const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;

if (!apiKey) {
    console.warn("API Key is missing. Please check your environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

// Existing Schema for Full Analysis (Legacy/Fallback)
const analysisSchema: Schema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            consultorNome: { type: Type.STRING },
            clienteNome: { type: Type.STRING },
            riscoConfirmado: { type: Type.INTEGER },
            resumoSituacao: { type: Type.STRING },
            padraoNegativoIdentificado: { type: Type.STRING },
            alertaPreditivo: { type: Type.STRING },
            recomendacoes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        tipo: { type: Type.STRING, enum: ["AcaoImediata", "QuestaoSondagem", "RecomendacaoEstrategica"] },
                        foco: { type: Type.STRING, enum: ["Consultor", "Cliente", "ProcessoInterno"] },
                        descricao: { type: Type.STRING }
                    },
                    required: ["tipo", "foco", "descricao"]
                }
            }
        },
        required: ["consultorNome", "clienteNome", "riscoConfirmado", "resumoSituacao", "padraoNegativoIdentificado", "alertaPreditivo", "recomendacoes"]
    }
};

// --- STEP 1: BEHAVIORAL FLAG EXTRACTION ---
export async function extractBehavioralFlags(reportText: string): Promise<Omit<BehavioralFlag, 'id' | 'consultantId'>[]> {
    const model = AI_MODEL_NAME;
    const prompt = `
        Você é um **Analista de People Analytics**. 
        Analise o seguinte relatório mensal e extraia todos os sinais de comportamento negativo em formato JSON. 
        Procure por problemas de frequência (ATTENDANCE), comunicação (COMMUNICATION), qualidade técnica (QUALITY) e engajamento (ENGAGEMENT).

        Relatório: 
        "${reportText}"

        Retorne um array de objetos JSON, cada um com: 
        - flagType (ATTENDANCE, COMMUNICATION, QUALITY, ENGAGEMENT, OTHER)
        - description (seja conciso)
        - flagDate (use a data de hoje YYYY-MM-DD se não houver data explícita no texto)
    `;

    const schema: Schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                flagType: { type: Type.STRING, enum: ['ATTENDANCE', 'COMMUNICATION', 'QUALITY', 'ENGAGEMENT', 'OTHER'] },
                description: { type: Type.STRING },
                flagDate: { type: Type.STRING }
            },
            required: ["flagType", "description", "flagDate"]
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '[]');
    } catch (error) {
        console.error("Error extracting flags:", error);
        return [];
    }
}

// --- STEP 2: PREDICTIVE ALERT GENERATION ---
export async function generatePredictiveAlert(recentFlags: BehavioralFlag[]): Promise<string> {
    const model = AI_MODEL_NAME;
    
    if (recentFlags.length === 0) return "Nenhum padrão de risco imediato detectado com base no histórico recente.";

    const flagsDesc = recentFlags.map(f => `- [${f.flagType}] ${f.description} (${f.flagDate})`).join('\n');

    const prompt = `
        Você é um **Analista de Risco de Retenção**. 
        Nos últimos 30 dias, o consultor acumulou as seguintes flags comportamentais:
        
        ${flagsDesc}

        Analise a frequência e a combinação dessas flags para gerar um 'predictiveAlert' (texto curto) sobre o risco de desengajamento. 
        Seja específico sobre o motivo do risco (ex: 'Risco Alto: Combinação de queda na qualidade e problemas de comunicação').
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt
        });
        return response.text || "Análise preditiva inconclusiva.";
    } catch (error) {
        console.error("Error generating alert:", error);
        return "Erro na geração do alerta preditivo.";
    }
}


export async function analyzeReport(reportText: string): Promise<AIAnalysisResult[]> {
  const model = AI_MODEL_NAME;
  
  const prompt = `
    Você é um **Analista de Risco Contratual Sênior**. Analise o Relatório de Acompanhamento.
    
    **Instruções:**
    1. Análise Contextual proativa.
    2. Foco rigoroso na Quarentena.
    3. Avaliação de Risco (1=Crítico/Vermelho, 2=Moderado/Amarelo, 3=Baixo/Verde, 4=Excelente/Azul).
    4. Gere Questões de Sondagem para riscos 1 e 2.
    5. Identifique padrões sutis.

    Analise o texto e retorne um JSON Array:
    ---
    ${reportText}
    ---
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      }
    });
    
    const jsonString = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const rawResults = JSON.parse(jsonString || '[]');

    if (!Array.isArray(rawResults)) {
        throw new Error("AI response format error: Expected an array of results.");
    }

    return rawResults.map((result: any) => ({
        consultantName: result.consultorNome,
        managerName: "",
        reportMonth: new Date().getMonth() + 1,
        riskScore: parseInt(result.riscoConfirmado, 10) as RiskScore,
        summary: result.resumoSituacao,
        negativePattern: result.padraoNegativoIdentificado,
        predictiveAlert: result.alertaPreditivo, // Default from main analysis, will be overwritten by Step 2 in Hook
        recommendations: result.recomendacoes,
        details: result.resumoSituacao
    }));

  } catch (error) {
    console.error("Error analyzing report with Gemini API:", error);
    throw new Error("Failed to parse AI response.");
  }
}

export async function generateTemplateContent(context: string): Promise<{ subject: string; body: string }> {
    const model = AI_MODEL_NAME;
    const prompt = `
        Você é um Especialista em Comunicação Corporativa.
        Crie um template de e-mail profissional para consultores de TI.
        **Contexto:** ${context}
        Retorne JSON com "subject" e "body". Use {{nome_consultor}} como variável.
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING }
        },
        required: ["subject", "body"]
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{"subject": "", "body": ""}');
    } catch (error) {
        console.error("Template Gen Error", error);
        return { subject: "Erro na geração", body: "Não foi possível gerar o template." };
    }
}

export async function analyzeFeedback(feedbackText: string, score: number): Promise<any> {
    const model = AI_MODEL_NAME;
    const prompt = `
        Analise este feedback de consultor. NPS: ${score}. Comentário: "${feedbackText}"
        Retorne JSON: sentiment (Positivo/Neutro/Negativo), riskLevel (Baixo/Médio/Alto), keyPoints (array string), suggestedAction (string).
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            sentiment: { type: Type.STRING, enum: ["Positivo", "Neutro", "Negativo"] },
            riskLevel: { type: Type.STRING, enum: ["Baixo", "Médio", "Alto"] },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedAction: { type: Type.STRING }
        },
        required: ["sentiment", "riskLevel", "keyPoints", "suggestedAction"]
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Feedback Analysis Error", error);
        return { sentiment: "Neutro", riskLevel: "Baixo", keyPoints: [], suggestedAction: "Revisar manualmente" };
    }
}
// Tipos locais (TODO: Mover para types.ts)
interface InterviewSummary {
    narrativeSummary: string;
    strengths: string[];
    areasForDevelopment: string[];
    culturalFitScore: number;
    keyQuotes: Array<{ quote: string; speaker: string }>;
    nextStepRecommendation: string;
}

// --- RAISA: INTERVIEW SUMMARIZATION ---
export async function summarizeInterview(transcript: string, jobDescription: string): Promise<InterviewSummary> {
    const model = AI_MODEL_NAME;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            narrativeSummary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            areasForDevelopment: { type: Type.ARRAY, items: { type: Type.STRING } },
            culturalFitScore: { type: Type.INTEGER, minimum: 1, maximum: 5 },
            keyQuotes: { 
                type: Type.ARRAY, 
                items: { 
                    type: Type.OBJECT, 
                    properties: { 
                        quote: { type: Type.STRING }, 
                        speaker: { type: Type.STRING, enum: ['Analista', 'Candidato'] } 
                    },
                    required: ['quote', 'speaker']
                } 
            },
            nextStepRecommendation: { type: Type.STRING, enum: ['Avançar para a próxima fase', 'Rejeitar', 'Reentrevista', 'Aguardando Cliente'] }
        },
        required: ["narrativeSummary", "strengths", "areasForDevelopment", "culturalFitScore", "keyQuotes", "nextStepRecommendation"]
    };

    const prompt = `
        Você é um **Analista de People Analytics Sênior** especializado em Recrutamento e Seleção. Sua tarefa é analisar a transcrição de uma entrevista de emprego e gerar um resumo estruturado em JSON, focado na adequação do candidato à vaga.

        **Contexto da Vaga:**
        ${jobDescription}

        **Transcrição da Entrevista:**
        ${transcript}

        **Instruções:**
        1. Gere um 'narrativeSummary' conciso e objetivo.
        2. Identifique 3 a 5 'strengths' e 'areasForDevelopment' **diretamente relacionados** aos requisitos da vaga e ao diálogo.
        3. Atribua um 'culturalFitScore' de 1 (Baixo) a 5 (Alto) com base no tom e nas respostas comportamentais.
        4. Selecione 2 a 3 'keyQuotes' (citações diretas) que sejam evidências fortes dos pontos fortes ou fracos.
        5. Forneça uma 'nextStepRecommendation' clara.

        Retorne **apenas** o objeto JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}') as InterviewSummary;
    } catch (error) {
        console.error("Interview Summarization Error:", error);
        throw new Error("Failed to generate interview summary.");
    }
}

import { Vaga, Candidatura } from '../components/types';

// Tipos locais (TODO: Mover para types.ts)
interface FinalAssessment {
    overallScore: number;
    recommendation: string;
    justification: string;
    strengths: string[];
    concerns: string[];
}

// --- RAISA: FINAL ASSESSMENT (CV + INTERVIEW) ---
export async function generateFinalAssessment(
    jobDescription: Vaga, 
    candidateData: Candidatura, 
    interviewSummary: InterviewSummary
): Promise<FinalAssessment> {
    const model = AI_MODEL_NAME;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            overallScore: { type: Type.INTEGER, minimum: 0, maximum: 100 },
            suitabilityRating: { type: Type.STRING, enum: ['Excelente', 'Bom', 'Mediano', 'Baixo'] },
            keyStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
            culturalFitSummary: { type: Type.STRING },
            technicalFitSummary: { type: Type.STRING },
            finalRecommendation: { type: Type.STRING, enum: ['Contratar', 'Rejeitar', 'Revisão Adicional'] },
            justification: { type: Type.STRING }
        },
        required: ["overallScore", "suitabilityRating", "keyStrengths", "keyGaps", "culturalFitSummary", "technicalFitSummary", "finalRecommendation", "justification"]
    };

    const prompt = `
        Você é um **Algoritmo de Avaliação de Candidatos Sênior** do Corbit.ai. Sua tarefa é realizar uma avaliação final de adequação do candidato à vaga, combinando os dados do currículo (CV) e o resumo da entrevista.

        **1. Contexto da Vaga:**
        Título: ${jobDescription.titulo}
        Descrição: ${jobDescription.descricao}
        Requisitos Obrigatórios: ${jobDescription.requisitos_obrigatorios?.join(', ') || 'N/A'}
        Stack Tecnológica: ${jobDescription.stack_tecnologica.join(', ')}

        **2. Dados do Candidato (CV):**
        Texto do Currículo (Análise Prévia): ${candidateData.curriculo_texto || 'N/A'}

        **3. Resumo da Entrevista (IA):**
        Resumo Narrativo: ${interviewSummary.narrativeSummary}
        Pontos Fortes: ${interviewSummary.strengths.join(', ')}
        Pontos de Desenvolvimento: ${interviewSummary.areasForDevelopment.join(', ')}
        Score de Fit Cultural (1-5): ${interviewSummary.culturalFitScore}
        Recomendação da Entrevista: ${interviewSummary.nextStepRecommendation}

        **Instruções para a Avaliação Final:**
        1.  **overallScore (0-100):** Calcule uma pontuação de adequação. Pondere 60% para o Fit Técnico (CV + Entrevista) e 40% para o Fit Comportamental/Cultural.
        2.  **suitabilityRating:** Classifique a adequação geral.
        3.  **keyStrengths/keyGaps:** Combine os dados do CV e da entrevista para listar os pontos mais relevantes.
        4.  **culturalFitSummary/technicalFitSummary:** Justifique os fits.
        5.  **finalRecommendation:** Forneça uma recomendação clara.
        6.  **justification:** Uma justificativa concisa para a recomendação final.

        Retorne **apenas** o objeto JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}') as FinalAssessment;
    } catch (error) {
        console.error("Final Assessment Error:", error);
        throw new Error("Failed to generate final assessment.");
    }
}


// ============================================
// RAISA ADVANCED: PRIORIZAÇÃO E DISTRIBUIÇÃO
// ============================================

/**
 * Calcula o Score de Prioridade de uma Vaga usando IA
 * Considera: urgência, faturamento, cliente VIP, tempo aberto, complexidade
 */
export async function calculateVagaPriority(dados: any): Promise<any> {
    const model = AI_MODEL_NAME;

    const prompt = `
        Você é um **Especialista em Gestão de Recrutamento e Seleção**.
        
        Analise os dados da vaga abaixo e calcule um **Score de Prioridade** de 0 a 100, considerando:
        
        **DADOS DA VAGA:**
        - Título: ${dados.titulo_vaga}
        - Cliente: ${dados.cliente_nome} ${dados.cliente_vip ? '(VIP)' : ''}
        - Prazo de Fechamento: ${dados.prazo_fechamento || 'Não definido'}
        - Faturamento Estimado: R$ ${dados.faturamento_estimado || 'Não informado'}
        - Stack Tecnológica: ${dados.stack_tecnologica.join(', ')}
        - Senioridade: ${dados.senioridade}
        - Dias em Aberto: ${dados.dias_vaga_aberta}
        - Média de Fechamento (vagas similares): ${dados.media_dias_vagas_similares || 'Sem histórico'} dias
        
        **CRITÉRIOS DE PRIORIZAÇÃO:**
        1. **Urgência do Prazo (0-100):** Quanto mais próximo o prazo, maior a urgência
        2. **Valor de Faturamento (0-100):** Maior faturamento = maior prioridade
        3. **Cliente VIP:** Se VIP, adicione 20 pontos ao score final
        4. **Tempo em Aberto (0-100):** Vagas abertas há muito tempo precisam de atenção
        5. **Complexidade da Stack (0-100):** Stacks complexas/raras precisam de mais tempo
        
        **CÁLCULO DO SLA (PRAZO SUGERIDO):**
        - Baseie-se na média histórica de vagas similares
        - Ajuste conforme a urgência e complexidade
        - Retorne em dias
        
        **NÍVEL DE PRIORIDADE:**
        - Score 80-100: "Alta"
        - Score 50-79: "Média"
        - Score 0-49: "Baixa"
        
        Retorne um JSON com a estrutura especificada.
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            score_prioridade: { type: Type.INTEGER },
            nivel_prioridade: { type: Type.STRING, enum: ['Alta', 'Média', 'Baixa'] },
            sla_dias: { type: Type.INTEGER },
            justificativa: { type: Type.STRING },
            fatores_considerados: {
                type: Type.OBJECT,
                properties: {
                    urgencia_prazo: { type: Type.INTEGER },
                    valor_faturamento: { type: Type.INTEGER },
                    cliente_vip: { type: Type.BOOLEAN },
                    tempo_vaga_aberta: { type: Type.INTEGER },
                    complexidade_stack: { type: Type.INTEGER }
                },
                required: ['urgencia_prazo', 'valor_faturamento', 'cliente_vip', 'tempo_vaga_aberta', 'complexidade_stack']
            }
        },
        required: ['score_prioridade', 'nivel_prioridade', 'sla_dias', 'justificativa', 'fatores_considerados']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Erro ao calcular prioridade da vaga:", error);
        throw new Error("Falha ao calcular prioridade da vaga.");
    }
}

/**
 * Recomenda o Analista mais adequado para uma Vaga usando IA
 * Considera: fit de stack, histórico com cliente, carga de trabalho, taxa de sucesso
 */
export async function recommendAnalyst(dados: any): Promise<any> {
    const model = AI_MODEL_NAME;

    const analistasDesc = dados.analistas_disponiveis.map((a: any) => `
        - **${a.nome}** (ID: ${a.id})
          - Stack de Experiência: ${a.stack_experiencia.join(', ')}
          - Carga Atual: ${a.carga_trabalho_atual} vagas ativas
          - Taxa de Aprovação Geral: ${a.taxa_aprovacao_geral}%
          - Tempo Médio de Fechamento: ${a.tempo_medio_fechamento_dias} dias
          - Histórico com Cliente: ${a.historico_aprovacao_cliente.find((h: any) => h.cliente_id === dados.vaga.cliente_id)?.taxa_aprovacao || 'Sem histórico'}%
    `).join('\n');

    const prompt = `
        Você é um **Especialista em Alocação de Recursos de R&S**.
        
        **VAGA A SER PREENCHIDA:**
        - Título: ${dados.vaga.titulo_vaga}
        - Cliente: ${dados.vaga.cliente_nome}
        - Stack Necessária: ${dados.vaga.stack_tecnologica.join(', ')}
        - Senioridade: ${dados.vaga.senioridade}
        - Prioridade: ${dados.prioridade_vaga.nivel_prioridade} (Score: ${dados.prioridade_vaga.score_prioridade})
        - SLA Sugerido: ${dados.prioridade_vaga.sla_dias} dias
        
        **ANALISTAS DISPONÍVEIS:**
        ${analistasDesc}
        
        **CRITÉRIOS DE RECOMENDAÇÃO:**
        1. **Fit de Stack Tecnológica (0-100):** Quanto mais overlap entre a stack da vaga e a experiência do analista, melhor
        2. **Fit com Cliente (0-100):** Analistas com histórico de sucesso com o cliente têm prioridade
        3. **Disponibilidade (0-100):** Analistas com menos carga de trabalho atual
        4. **Taxa de Sucesso Histórica (0-100):** Taxa geral de aprovação do analista
        
        **CÁLCULO DO SCORE DE MATCH:**
        - Pondere: 40% Fit Stack + 30% Fit Cliente + 20% Disponibilidade + 10% Taxa Sucesso
        
        **NÍVEL DE ADEQUAÇÃO:**
        - Score 85-100: "Excelente"
        - Score 70-84: "Bom"
        - Score 50-69: "Regular"
        - Score 0-49: "Baixo"
        
        **RECOMENDAÇÃO:**
        - Score 85-100: "Altamente Recomendado"
        - Score 70-84: "Recomendado"
        - Score 50-69: "Adequado"
        - Score 0-49: "Não Recomendado"
        
        **IMPORTANTE:** Retorne um ARRAY com o score de TODOS os analistas, ordenado do maior para o menor score.
    `;

    const schema: Schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                analista_id: { type: Type.INTEGER },
                analista_nome: { type: Type.STRING },
                score_match: { type: Type.INTEGER },
                nivel_adequacao: { type: Type.STRING, enum: ['Excelente', 'Bom', 'Regular', 'Baixo'] },
                justificativa_match: { type: Type.STRING },
                fatores_match: {
                    type: Type.OBJECT,
                    properties: {
                        fit_stack_tecnologica: { type: Type.INTEGER },
                        fit_cliente: { type: Type.INTEGER },
                        disponibilidade: { type: Type.INTEGER },
                        taxa_sucesso_historica: { type: Type.INTEGER }
                    },
                    required: ['fit_stack_tecnologica', 'fit_cliente', 'disponibilidade', 'taxa_sucesso_historica']
                },
                tempo_estimado_fechamento_dias: { type: Type.INTEGER },
                recomendacao: { type: Type.STRING, enum: ['Altamente Recomendado', 'Recomendado', 'Adequado', 'Não Recomendado'] }
            },
            required: ['analista_id', 'analista_nome', 'score_match', 'nivel_adequacao', 'justificativa_match', 'fatores_match', 'tempo_estimado_fechamento_dias', 'recomendacao']
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '[]');
    } catch (error) {
        console.error("Erro ao recomendar analista:", error);
        throw new Error("Falha ao recomendar analista.");
    }
}

// ============================================
// RAISA WORKFLOW: MELHORIA DE DESCRIÇÃO DE VAGA
// ============================================

/**
 * Melhora a descrição de uma vaga usando IA
 * Considera: clareza, atratividade, requisitos, benefícios, SEO
 */
export async function improveJobDescription(
    descricaoOriginal: string,
    contexto: {
        titulo: string;
        nivel_senioridade?: string;
        tipo_contrato?: string;
        salario_min?: number;
        salario_max?: number;
    }
): Promise<{
    descricao_melhorada: string;
    mudancas_sugeridas: {
        tipo: string;
        antes: string;
        depois: string;
        motivo: string;
    }[];
}> {
    const model = AI_MODEL_NAME;

    const prompt = `
        Você é um **Especialista em Copywriting para Recrutamento e Seleção**.
        
        **CONTEXTO DA VAGA:**
        - Título: ${contexto.titulo}
        - Senioridade: ${contexto.nivel_senioridade || 'Não especificado'}
        - Tipo de Contrato: ${contexto.tipo_contrato || 'Não especificado'}
        - Faixa Salarial: ${contexto.salario_min && contexto.salario_max ? `R$ ${contexto.salario_min.toLocaleString('pt-BR')} - R$ ${contexto.salario_max.toLocaleString('pt-BR')}` : 'Não informado'}
        
        **DESCRIÇÃO ORIGINAL:**
        ${descricaoOriginal}
        
        **SUA TAREFA:**
        Melhore a descrição da vaga seguindo as melhores práticas de recrutamento:
        
        **1. ESTRUTURA CLARA:**
        - Introdução atrativa sobre a empresa/vaga
        - Responsabilidades principais (bullet points)
        - Requisitos obrigatórios (bullet points)
        - Requisitos desejáveis (bullet points)
        - Benefícios e diferenciais
        - Call-to-action para candidatura
        
        **2. LINGUAGEM:**
        - Use tom profissional mas acolhedor
        - Evite jargões excessivos
        - Seja específico e objetivo
        - Use verbos de ação
        - Destaque o que torna a vaga atrativa
        
        **3. OTIMIZAÇÃO:**
        - Inclua palavras-chave relevantes para SEO
        - Destaque tecnologias e ferramentas específicas
        - Mencione oportunidades de crescimento
        - Seja transparente sobre expectativas
        
        **4. INCLUSÃO:**
        - Use linguagem neutra de gênero
        - Evite requisitos discriminatórios
        - Foque em competências reais
        
        **IMPORTANTE:**
        - Mantenha informações factuais da descrição original
        - NÃO invente benefícios ou requisitos que não estão na descrição original
        - Apenas reorganize, clarify e torne mais atrativa
        - Se a descrição original for muito curta, sugira estrutura mas indique "a completar"
        
        Retorne um JSON com:
        1. 'descricao_melhorada': A descrição otimizada completa
        2. 'mudancas_sugeridas': Array de objetos com tipo, antes, depois e motivo de cada mudança significativa
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            descricao_melhorada: { type: Type.STRING },
            mudancas_sugeridas: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        tipo: { type: Type.STRING, enum: ['Estrutura', 'Linguagem', 'Clareza', 'Atratividade', 'SEO', 'Inclusão'] },
                        antes: { type: Type.STRING },
                        depois: { type: Type.STRING },
                        motivo: { type: Type.STRING }
                    },
                    required: ['tipo', 'antes', 'depois', 'motivo']
                }
            }
        },
        required: ['descricao_melhorada', 'mudancas_sugeridas']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{"descricao_melhorada": "", "mudancas_sugeridas": []}');
    } catch (error) {
        console.error("Erro ao melhorar descrição da vaga:", error);
        throw new Error("Falha ao melhorar descrição da vaga.");
    }
}

/**
 * Sugere repriorização de vaga com base em análise dinâmica
 * Usado pelo cron job de 4 horas
 */
export async function suggestReprioritization(dados: {
    vaga_id: number;
    titulo_vaga: string;
    score_atual: number;
    nivel_atual: string;
    sla_atual: number;
    dias_vaga_aberta: number;
    candidaturas_recebidas: number;
    candidatos_em_processo: number;
    ultima_atualizacao_dias: number;
    media_mercado_dias: number;
}): Promise<{
    deve_reprioritizar: boolean;
    score_sugerido?: number;
    nivel_sugerido?: string;
    sla_sugerido?: number;
    motivo_mudanca?: string;
    urgencia?: 'Alta' | 'Média' | 'Baixa';
}> {
    const model = AI_MODEL_NAME;

    const prompt = `
        Você é um **Especialista em Gestão Dinâmica de Vagas**.
        
        **SITUAÇÃO ATUAL DA VAGA:**
        - Título: ${dados.titulo_vaga}
        - Score de Prioridade Atual: ${dados.score_atual}/100
        - Nível de Prioridade Atual: ${dados.nivel_atual}
        - SLA Atual: ${dados.sla_atual} dias
        - Dias em Aberto: ${dados.dias_vaga_aberta}
        - Candidaturas Recebidas: ${dados.candidaturas_recebidas}
        - Candidatos em Processo: ${dados.candidatos_em_processo}
        - Última Atualização: ${dados.ultima_atualizacao_dias} dias atrás
        - Média de Mercado (vagas similares): ${dados.media_mercado_dias} dias
        
        **CRITÉRIOS DE REPRIORIZAÇÃO:**
        
        **AUMENTAR PRIORIDADE SE:**
        1. Vaga está aberta há muito tempo (> 80% do SLA) sem candidatos qualificados
        2. Pouquíssimas candidaturas recebidas (< 3) após muitos dias
        3. Todos os candidatos foram rejeitados e precisa reabrir
        4. Vaga está demorando mais que a média de mercado
        
        **DIMINUIR PRIORIDADE SE:**
        1. Vaga tem muitos candidatos qualificados em processo
        2. Está dentro do SLA e com bom andamento
        3. Cliente está demorando para dar feedback
        
        **MANTER PRIORIDADE SE:**
        1. Vaga está progredindo conforme esperado
        2. Dentro do SLA com candidatos em processo
        
        **SUA TAREFA:**
        Analise se a vaga precisa ser repriorizada. Se sim, sugira novo score, nível, SLA e justifique.
        Se não, retorne 'deve_reprioritizar: false'.
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            deve_reprioritizar: { type: Type.BOOLEAN },
            score_sugerido: { type: Type.INTEGER },
            nivel_sugerido: { type: Type.STRING, enum: ['Alta', 'Média', 'Baixa'] },
            sla_sugerido: { type: Type.INTEGER },
            motivo_mudanca: { type: Type.STRING },
            urgencia: { type: Type.STRING, enum: ['Alta', 'Média', 'Baixa'] }
        },
        required: ['deve_reprioritizar']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{"deve_reprioritizar": false}');
    } catch (error) {
        console.error("Erro ao sugerir repriorização:", error);
        return { deve_reprioritizar: false };
    }
}

// ============================================
// FLUXO DO ANALISTA DE R&S: QUESTÕES INTELIGENTES
// ============================================

/**
 * Recomenda 5-10 questões personalizadas para uma vaga
 * Baseado em: perfil da vaga, stack, histórico de reprovações
 */
export async function recommendQuestionsForVaga(dados: {
    vaga: {
        titulo: string;
        descricao: string;
        stack_tecnologica: string[];
        nivel_senioridade: string;
        requisitos_obrigatorios?: string[];
    };
    historicoReprovacoes: Array<{
        motivo: string;
        categoria: string;
        detalhes?: string;
    }>;
}): Promise<{
    questoes: Array<{
        questao: string;
        categoria: 'tecnica' | 'comportamental' | 'cultural';
        subcategoria: string;
        relevancia: number;
        motivo: string;
        baseado_em_reprovacao: boolean;
    }>;
    insights: string[];
}> {
    const model = AI_MODEL_NAME;

    const reprovacoesDesc = dados.historicoReprovacoes.length > 0
        ? dados.historicoReprovacoes.map(r => `- ${r.categoria}: ${r.motivo}`).join('\n')
        : 'Nenhum histórico de reprovação disponível';

    const prompt = `
        Você é um **Especialista em Recrutamento Técnico e Avaliação de Candidatos**.
        
        **VAGA:**
        - Título: ${dados.vaga.titulo}
        - Descrição: ${dados.vaga.descricao}
        - Stack Tecnológica: ${dados.vaga.stack_tecnologica.join(', ')}
        - Senioridade: ${dados.vaga.nivel_senioridade}
        - Requisitos Obrigatórios: ${dados.vaga.requisitos_obrigatorios?.join(', ') || 'N/A'}
        
        **HISTÓRICO DE REPROVAÇÕES EM VAGAS SIMILARES:**
        ${reprovacoesDesc}
        
        **SUA TAREFA:**
        Recomende **5 a 10 questões** para entrevista que:
        1. Avaliem competências técnicas essenciais da stack
        2. Identifiquem red flags baseados no histórico de reprovações
        3. Avaliem soft skills e fit cultural
        4. Sejam específicas e acionáveis (não genéricas)
        
        **CATEGORIAS:**
        - **Técnica:** Conhecimentos específicos da stack
        - **Comportamental:** Soft skills, comunicação, trabalho em equipe
        - **Cultural:** Valores, motivações, fit com a empresa
        
        **FORMATO:**
        - Questões abertas que exigem exemplos concretos
        - Evite perguntas sim/não
        - Foque em situações reais e experiências passadas
        
        **IMPORTANTE:**
        - Se houver reprovações recorrentes, crie questões específicas para identificar esses problemas
        - Atribua relevância (0-100) baseada na importância para o sucesso na vaga
        - Indique se a questão foi baseada em reprovação anterior
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            questoes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        questao: { type: Type.STRING },
                        categoria: { type: Type.STRING, enum: ['tecnica', 'comportamental', 'cultural'] },
                        subcategoria: { type: Type.STRING },
                        relevancia: { type: Type.INTEGER, minimum: 0, maximum: 100 },
                        motivo: { type: Type.STRING },
                        baseado_em_reprovacao: { type: Type.BOOLEAN }
                    },
                    required: ['questao', 'categoria', 'subcategoria', 'relevancia', 'motivo', 'baseado_em_reprovacao']
                }
            },
            insights: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        },
        required: ['questoes', 'insights']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{"questoes": [], "insights": []}');
    } catch (error) {
        console.error("Erro ao recomendar questões:", error);
        throw new Error("Falha ao recomendar questões para a vaga.");
    }
}

// ============================================
// FLUXO DO ANALISTA: RECOMENDAÇÃO DE DECISÃO
// ============================================

/**
 * Recomenda decisão sobre candidato (Aprovar/Rejeitar/Reavaliar)
 * Considera: CV, respostas, entrevista, padrões de reprovação
 */
export async function recommendCandidateDecision(dados: {
    vaga: any;
    candidato: any;
    respostasQuestoes: Array<{
        questao: string;
        resposta: string;
        categoria: string;
    }>;
    entrevistaResumo: any;
    parecerAnalista?: string;
    padroesReprovacao: any[];
}): Promise<{
    recomendacao: 'aprovar' | 'rejeitar' | 'reavaliar';
    score_confianca: number;
    justificativa: string;
    red_flags: Array<{
        tipo: string;
        descricao: string;
        severidade: number;
    }>;
    pontos_fortes: string[];
    probabilidade_aprovacao_cliente: number;
}> {
    const model = AI_MODEL_NAME;

    const respostasDesc = dados.respostasQuestoes.map(r => 
        `Q: ${r.questao}\nR: ${r.resposta}\n`
    ).join('\n');

    const padroesDesc = dados.padroesReprovacao.length > 0
        ? dados.padroesReprovacao.map(p => `- ${p.categoria}: ${p.descricao}`).join('\n')
        : 'Nenhum padrão de reprovação conhecido';

    const prompt = `
        Você é um **Algoritmo de Avaliação de Candidatos Sênior** com capacidade preditiva.
        
        **VAGA:**
        - Título: ${dados.vaga.titulo}
        - Stack: ${dados.vaga.stack_tecnologica?.join(', ')}
        - Requisitos: ${dados.vaga.requisitos_obrigatorios?.join(', ')}
        
        **CANDIDATO:**
        - Nome: ${dados.candidato.nome}
        - Experiência: ${dados.candidato.anos_experiencia || 'N/A'} anos
        - CV: ${dados.candidato.curriculo_texto || 'N/A'}
        
        **RESPOSTAS DAS QUESTÕES:**
        ${respostasDesc}
        
        **RESUMO DA ENTREVISTA:**
        ${JSON.stringify(dados.entrevistaResumo, null, 2)}
        
        **PARECER DO ANALISTA:**
        ${dados.parecerAnalista || 'Sem parecer adicional'}
        
        **PADRÕES DE REPROVAÇÃO CONHECIDOS:**
        ${padroesDesc}
        
        **SUA TAREFA:**
        Analise profundamente e recomende:
        - **aprovar**: Enviar CV ao cliente (alta probabilidade de sucesso)
        - **rejeitar**: Não enviar (red flags críticos ou fit baixo)
        - **reavaliar**: Necessita mais informações ou segunda entrevista
        
        **CRITÉRIOS:**
        1. **Fit Técnico (40%):** Domínio da stack e requisitos
        2. **Fit Comportamental (30%):** Comunicação, proatividade, trabalho em equipe
        3. **Fit Cultural (20%):** Valores, motivações, alinhamento
        4. **Ausência de Red Flags (10%):** Sem sinais de alerta críticos
        
        **RED FLAGS CRÍTICOS:**
        - Gaps de experiência não explicados
        - Respostas evasivas ou inconsistentes
        - Falta de conhecimento em requisitos obrigatórios
        - Padrões similares a reprovações anteriores
        - Comunicação confusa ou problemática
        
        **IMPORTANTE:**
        - Score de confiança: 0-100 (quão confiante você está na recomendação)
        - Probabilidade de aprovação pelo cliente: 0-100
        - Seja específico nos red flags (tipo, descrição, severidade 1-5)
        - Liste 3-5 pontos fortes concretos
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            recomendacao: { type: Type.STRING, enum: ['aprovar', 'rejeitar', 'reavaliar'] },
            score_confianca: { type: Type.INTEGER, minimum: 0, maximum: 100 },
            justificativa: { type: Type.STRING },
            red_flags: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        tipo: { type: Type.STRING },
                        descricao: { type: Type.STRING },
                        severidade: { type: Type.INTEGER, minimum: 1, maximum: 5 }
                    },
                    required: ['tipo', 'descricao', 'severidade']
                }
            },
            pontos_fortes: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            probabilidade_aprovacao_cliente: { type: Type.INTEGER, minimum: 0, maximum: 100 }
        },
        required: ['recomendacao', 'score_confianca', 'justificativa', 'red_flags', 'pontos_fortes', 'probabilidade_aprovacao_cliente']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Erro ao recomendar decisão:", error);
        throw new Error("Falha ao recomendar decisão sobre candidato.");
    }
}

// ============================================
// FLUXO DO ANALISTA: IDENTIFICAÇÃO DE RED FLAGS
// ============================================

/**
 * Identifica red flags em CV, entrevista interna e feedback do cliente
 */
export async function identifyRedFlags(dados: {
    cv: string;
    entrevistaInterna?: string;
    entrevistaCliente?: string;
    feedbackCliente?: string;
}): Promise<{
    flags: Array<{
        tipo: 'tecnico' | 'comportamental' | 'comunicacao' | 'experiencia' | 'cultural';
        descricao: string;
        severidade: number;
        fonte: string;
        trecho_original: string;
    }>;
}> {
    const model = AI_MODEL_NAME;

    const prompt = `
        Você é um **Especialista em Identificação de Riscos em Candidatos**.
        
        **CV DO CANDIDATO:**
        ${dados.cv}
        
        ${dados.entrevistaInterna ? `**ENTREVISTA INTERNA:**\n${dados.entrevistaInterna}\n` : ''}
        ${dados.entrevistaCliente ? `**ENTREVISTA COM CLIENTE:**\n${dados.entrevistaCliente}\n` : ''}
        ${dados.feedbackCliente ? `**FEEDBACK DO CLIENTE:**\n${dados.feedbackCliente}\n` : ''}
        
        **SUA TAREFA:**
        Identifique **red flags** (sinais de alerta) que possam indicar:
        - Problemas técnicos (falta de conhecimento, experiência superficial)
        - Problemas comportamentais (atitude, proatividade, trabalho em equipe)
        - Problemas de comunicação (respostas vagas, dificuldade de expressão)
        - Problemas de experiência (gaps não explicados, mudanças frequentes)
        - Problemas culturais (valores desalinhados, motivações incompatíveis)
        
        **SEVERIDADE:**
        - 1: Baixa (ponto de atenção, não crítico)
        - 2: Média-Baixa (pode ser problema se combinado com outros)
        - 3: Média (requer atenção, pode impactar resultado)
        - 4: Alta (problema sério, alta chance de reprovação)
        - 5: Crítica (eliminatório, não deve ser enviado ao cliente)
        
        **IMPORTANTE:**
        - Seja específico e objetivo
        - Cite o trecho original que gerou o flag
        - Indique a fonte (cv, entrevista_interna, entrevista_cliente, feedback_cliente)
        - Não invente problemas, apenas identifique padrões reais
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            flags: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        tipo: { type: Type.STRING, enum: ['tecnico', 'comportamental', 'comunicacao', 'experiencia', 'cultural'] },
                        descricao: { type: Type.STRING },
                        severidade: { type: Type.INTEGER, minimum: 1, maximum: 5 },
                        fonte: { type: Type.STRING },
                        trecho_original: { type: Type.STRING }
                    },
                    required: ['tipo', 'descricao', 'severidade', 'fonte', 'trecho_original']
                }
            }
        },
        required: ['flags']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{"flags": []}');
    } catch (error) {
        console.error("Erro ao identificar red flags:", error);
        return { flags: [] };
    }
}

// ============================================
// APRENDIZADO: ANÁLISE DE PADRÕES DE REPROVAÇÃO
// ============================================

/**
 * Analisa reprovações do mês e identifica padrões
 */
export async function analyzeRejectionPatterns(dados: {
    reprovacoes: Array<{
        vaga_titulo: string;
        candidato_nome: string;
        motivo_reprovacao: string;
        categoria_reprovacao: string;
        feedback_cliente: string;
        questoes_usadas: string[];
    }>;
    periodo: string;
}): Promise<{
    padroes_tecnicos: Array<{ padrao: string; frequencia: number; exemplos: string[] }>;
    padroes_comportamentais: Array<{ padrao: string; frequencia: number; exemplos: string[] }>;
    padroes_culturais: Array<{ padrao: string; frequencia: number; exemplos: string[] }>;
    questoes_ineficazes: Array<{ questao: string; motivo: string }>;
    questoes_novas_sugeridas: Array<{ questao: string; categoria: string; motivo: string }>;
    recomendacoes_melhoria: string[];
    insights: string[];
}> {
    const model = AI_MODEL_NAME;

    const reprovacoesDesc = dados.reprovacoes.map((r, i) => `
        ${i + 1}. Vaga: ${r.vaga_titulo}
           Categoria: ${r.categoria_reprovacao}
           Motivo: ${r.motivo_reprovacao}
           Feedback: ${r.feedback_cliente}
           Questões usadas: ${r.questoes_usadas.join(', ')}
    `).join('\n');

    const prompt = `
        Você é um **Analista de Dados de Recrutamento** especializado em identificar padrões.
        
        **PERÍODO:** ${dados.periodo}
        **TOTAL DE REPROVAÇÕES:** ${dados.reprovacoes.length}
        
        **REPROVAÇÕES DETALHADAS:**
        ${reprovacoesDesc}
        
        **SUA TAREFA:**
        Analise profundamente e identifique:
        
        1. **Padrões Técnicos Recorrentes:**
           - Quais competências técnicas faltaram?
           - Quais tecnologias/ferramentas foram problemáticas?
           - Quantas vezes cada padrão apareceu?
        
        2. **Padrões Comportamentais Recorrentes:**
           - Quais soft skills faltaram?
           - Quais comportamentos foram problemáticos?
           - Problemas de comunicação, proatividade, etc.
        
        3. **Padrões Culturais:**
           - Desalinhamento de valores
           - Motivações incompatíveis
           - Fit cultural baixo
        
        4. **Questões Ineficazes:**
           - Questões que foram usadas mas não identificaram o problema
           - Por que falharam em prever a reprovação?
        
        5. **Questões Novas Sugeridas:**
           - Questões que poderiam ter identificado os problemas
           - Baseadas nos padrões encontrados
        
        6. **Recomendações de Melhoria:**
           - Ações concretas para reduzir reprovações
           - Ajustes no processo de triagem
           - Melhorias nas entrevistas
        
        **IMPORTANTE:**
        - Seja quantitativo (frequências, percentuais)
        - Dê exemplos concretos
        - Foque em padrões acionáveis
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            padroes_tecnicos: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        padrao: { type: Type.STRING },
                        frequencia: { type: Type.INTEGER },
                        exemplos: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ['padrao', 'frequencia', 'exemplos']
                }
            },
            padroes_comportamentais: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        padrao: { type: Type.STRING },
                        frequencia: { type: Type.INTEGER },
                        exemplos: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ['padrao', 'frequencia', 'exemplos']
                }
            },
            padroes_culturais: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        padrao: { type: Type.STRING },
                        frequencia: { type: Type.INTEGER },
                        exemplos: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ['padrao', 'frequencia', 'exemplos']
                }
            },
            questoes_ineficazes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        questao: { type: Type.STRING },
                        motivo: { type: Type.STRING }
                    },
                    required: ['questao', 'motivo']
                }
            },
            questoes_novas_sugeridas: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        questao: { type: Type.STRING },
                        categoria: { type: Type.STRING },
                        motivo: { type: Type.STRING }
                    },
                    required: ['questao', 'categoria', 'motivo']
                }
            },
            recomendacoes_melhoria: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            insights: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        },
        required: ['padroes_tecnicos', 'padroes_comportamentais', 'padroes_culturais', 'questoes_ineficazes', 'questoes_novas_sugeridas', 'recomendacoes_melhoria', 'insights']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Erro ao analisar padrões de reprovação:", error);
        throw new Error("Falha ao analisar padrões de reprovação.");
    }
}

// ============================================
// PREDIÇÃO: RISCO DE REPROVAÇÃO
// ============================================

/**
 * Prevê risco de reprovação antes de enviar ao cliente
 */
export async function predictCandidateRisk(dados: {
    vaga: any;
    candidato: any;
    recomendacaoIA: any;
    vagasSimilares: Array<{
        titulo: string;
        candidatos_enviados: number;
        candidatos_aprovados: number;
        padroes_reprovacao: string[];
    }>;
}): Promise<{
    risco_reprovacao: number;
    nivel_risco: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    motivos_risco: string[];
    recomendacoes_preparacao: string[];
    deve_enviar: boolean;
}> {
    const model = AI_MODEL_NAME;

    const similaresDesc = dados.vagasSimilares.map(v => `
        - ${v.titulo}: ${v.candidatos_aprovados}/${v.candidatos_enviados} aprovados (${Math.round((v.candidatos_aprovados / v.candidatos_enviados) * 100)}%)
          Padrões de reprovação: ${v.padroes_reprovacao.join(', ')}
    `).join('\n');

    const prompt = `
        Você é um **Sistema Preditivo de Sucesso de Candidatos**.
        
        **VAGA ATUAL:**
        ${JSON.stringify(dados.vaga, null, 2)}
        
        **CANDIDATO:**
        ${JSON.stringify(dados.candidato, null, 2)}
        
        **RECOMENDAÇÃO DA IA:**
        ${JSON.stringify(dados.recomendacaoIA, null, 2)}
        
        **HISTÓRICO DE VAGAS SIMILARES:**
        ${similaresDesc}
        
        **SUA TAREFA:**
        Preveja o risco de reprovação (0-100%) baseado em:
        1. Análise do candidato vs requisitos da vaga
        2. Red flags identificados
        3. Padrões de reprovação em vagas similares
        4. Taxa de aprovação histórica do cliente
        
        **NÍVEIS DE RISCO:**
        - 0-25%: Baixo (alta chance de aprovação)
        - 26-50%: Médio (chance moderada)
        - 51-75%: Alto (baixa chance de aprovação)
        - 76-100%: Crítico (não recomendado enviar)
        
        **RECOMENDAÇÕES:**
        - Se risco > 50%: Sugira preparação do candidato
        - Se risco > 75%: Recomende não enviar
        - Seja específico nas ações de preparação
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            risco_reprovacao: { type: Type.INTEGER, minimum: 0, maximum: 100 },
            nivel_risco: { type: Type.STRING, enum: ['Baixo', 'Médio', 'Alto', 'Crítico'] },
            motivos_risco: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            recomendacoes_preparacao: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            deve_enviar: { type: Type.BOOLEAN }
        },
        required: ['risco_reprovacao', 'nivel_risco', 'motivos_risco', 'recomendacoes_preparacao', 'deve_enviar']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        const text = response.text?.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        return JSON.parse(text || '{}');
    } catch (error) {
        console.error("Erro ao prever risco:", error);
        throw new Error("Falha ao prever risco de reprovação.");
    }
}
