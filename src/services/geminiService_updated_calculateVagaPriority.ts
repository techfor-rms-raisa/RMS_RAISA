/**
 * FUNÇÃO ATUALIZADA: calculateVagaPriority
 * Agora recebe configuração como parâmetro
 */

export async function calculateVagaPriority(dados: any, config: any = null): Promise<any> {
    const model = AI_MODEL_NAME;

    // Usar configuração padrão se não fornecida
    const cfg = config || {
        peso_urgencia_prazo: 25,
        peso_faturamento: 25,
        peso_tempo_aberto: 25,
        peso_complexidade: 25,
        bonus_cliente_vip: 20,
        multiplicador_urgencia_baixa: 0.80,
        multiplicador_urgencia_normal: 1.00,
        multiplicador_urgencia_altissima: 1.50
    };

    const prompt = `
        Você é um **Especialista em Gestão de Recrutamento e Seleção**.
        
        Analise os dados da vaga abaixo e calcule um **Score de Prioridade** de 0 a 100, considerando:
        
        **DADOS DA VAGA:**
        - Título: ${dados.titulo_vaga}
        - Cliente: ${dados.cliente_nome} ${dados.cliente_vip ? '(VIP)' : ''}
        - Flag de Urgência: ${dados.flag_urgencia || 'Normal'}
        - Data Limite: ${dados.data_limite || 'Não definida'}
        - Dias até Data Limite: ${dados.dias_ate_data_limite !== null ? dados.dias_ate_data_limite + ' dias' : 'N/A'}
        - Prazo de Fechamento: ${dados.prazo_fechamento || 'Não definido'}
        - Faturamento Estimado: R$ ${dados.faturamento_estimado || 'Não informado'}
        - Stack Tecnológica: ${dados.stack_tecnologica.join(', ')}
        - Senioridade: ${dados.senioridade}
        - Dias em Aberto: ${dados.dias_vaga_aberta}
        - Média de Fechamento (vagas similares): ${dados.media_dias_vagas_similares || 'Sem histórico'} dias
        
        **CONFIGURAÇÃO DE PESOS:**
        - Peso Urgência do Prazo: ${cfg.peso_urgencia_prazo}%
        - Peso Faturamento: ${cfg.peso_faturamento}%
        - Peso Tempo em Aberto: ${cfg.peso_tempo_aberto}%
        - Peso Complexidade: ${cfg.peso_complexidade}%
        - Bônus Cliente VIP: +${cfg.bonus_cliente_vip} pontos
        
        **MULTIPLICADORES DE URGÊNCIA:**
        - Urgência Baixa: ${cfg.multiplicador_urgencia_baixa}x
        - Urgência Normal: ${cfg.multiplicador_urgencia_normal}x
        - Urgência Altíssima: ${cfg.multiplicador_urgencia_altissima}x
        
        **CRITÉRIOS DE PRIORIZAÇÃO:**
        1. **Urgência do Prazo (0-100):** 
           - Se Data Limite definida: Priorize pela proximidade da data limite
           - Quanto menor "dias_ate_data_limite", maior a urgência
           - Dias negativos = prazo vencido = urgência máxima (100)
           - Se não houver data limite, use o prazo_fechamento
           
        2. **Valor de Faturamento (0-100):** Maior faturamento = maior prioridade
        
        3. **Cliente VIP:** Se VIP, adicione ${cfg.bonus_cliente_vip} pontos ao score final
        
        4. **Tempo em Aberto (0-100):** Vagas abertas há muito tempo precisam de atenção
        
        5. **Complexidade da Stack (0-100):** Stacks complexas/raras precisam de mais tempo
        
        **CÁLCULO DO SCORE:**
        1. Calcule cada critério (0-100)
        2. Aplique os pesos configurados
        3. Some: score_base = (urgencia * peso_urgencia + faturamento * peso_faturamento + tempo * peso_tempo + complexidade * peso_complexidade) / 100
        4. Aplique multiplicador de urgência baseado em flag_urgencia
        5. Adicione bônus VIP se aplicável
        6. Limite o score final entre 0 e 120
        
        **CÁLCULO DO SLA (PRAZO SUGERIDO):**
        - Se data_limite definida: SLA = dias_ate_data_limite (mínimo 1 dia)
        - Senão, baseie-se na média histórica de vagas similares
        - Ajuste conforme a urgência e complexidade
        - Retorne em dias
        
        **NÍVEL DE PRIORIDADE:**
        - Score 80-120: "Alta"
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
 * FUNÇÃO ATUALIZADA: recommendAnalyst
 * Agora recebe configuração como parâmetro
 */
export async function recommendAnalyst(dados: any, config: any = null): Promise<any> {
    const model = AI_MODEL_NAME;

    // Usar configuração padrão se não fornecida
    const cfg = config || {
        peso_fit_stack: 40,
        peso_fit_cliente: 30,
        peso_disponibilidade: 20,
        peso_taxa_sucesso: 10,
        capacidade_maxima_default: 7
    };

    const analistasDesc = dados.analistas_disponiveis.map((a: any) => `
        - **${a.nome}** (ID: ${a.id})
          - Stack de Experiência: ${a.stack_experiencia.join(', ')}
          - Carga Atual: ${a.carga_trabalho_atual} vagas ativas
          - Capacidade Máxima: ${a.capacidade_maxima_vagas || cfg.capacidade_maxima_default} vagas
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
        - Quantidade Máxima de Distribuição: ${dados.vaga.qtde_maxima_distribuicao || 1}
        
        **ANALISTAS DISPONÍVEIS:**
        ${analistasDesc}
        
        **CONFIGURAÇÃO DE PESOS:**
        - Peso Fit Stack: ${cfg.peso_fit_stack}%
        - Peso Fit Cliente: ${cfg.peso_fit_cliente}%
        - Peso Disponibilidade: ${cfg.peso_disponibilidade}%
        - Peso Taxa Sucesso: ${cfg.peso_taxa_sucesso}%
        
        **CRITÉRIOS DE RECOMENDAÇÃO:**
        1. **Fit de Stack Tecnológica (0-100):** Quanto mais overlap entre a stack da vaga e a experiência do analista, melhor
        2. **Fit com Cliente (0-100):** Analistas com histórico de sucesso com o cliente têm prioridade
        3. **Disponibilidade (0-100):** Analistas com menos carga de trabalho atual (considere capacidade_maxima_vagas)
        4. **Taxa de Sucesso Histórica (0-100):** Taxa geral de aprovação do analista
        
        **CÁLCULO DO SCORE DE MATCH:**
        - Pondere: ${cfg.peso_fit_stack}% Fit Stack + ${cfg.peso_fit_cliente}% Fit Cliente + ${cfg.peso_disponibilidade}% Disponibilidade + ${cfg.peso_taxa_sucesso}% Taxa Sucesso
        
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
        
        **IMPORTANTE:** 
        - Retorne um ARRAY com o score de TODOS os analistas, ordenado do maior para o menor score.
        - O sistema limitará automaticamente pela qtde_maxima_distribuicao.
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
