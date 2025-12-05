/**
 * SERVIÇO: QUESTÕES INTELIGENTES
 * Gerencia recomendação e eficácia de questões por vaga
 */

import { supabase } from '../config/supabase';
import { recommendQuestionsForVaga } from '../../services/geminiService';
import { aiConfig } from '../config/aiConfig';

export interface Questao {
    id?: number;
    vaga_id: number;
    questao: string;
    categoria: 'tecnica' | 'comportamental' | 'cultural';
    subcategoria: string;
    relevancia_score: number;
    baseado_em_reprovacoes: boolean;
    reprovacoes_relacionadas?: number;
    poder_preditivo?: number;
    ativa: boolean;
    aprovada_por_analista: boolean;
}

/**
 * Gera questões recomendadas pela IA para uma vaga
 */
export async function gerarQuestoesParaVaga(
    vagaId: number,
    vaga: any
): Promise<Questao[]> {
    try {
        // 1. Verificar se funcionalidade está ativa
        if (!aiConfig.ENABLE_AI_QUESTIONS) {
            console.log('[Questões] Geração de questões desativada por configuração');
            return [];
        }

        // 2. Buscar histórico de reprovações em vagas similares
        const { data: reprovacoes, error: errorReprov } = await supabase
            .from('candidaturas')
            .select(`
                id,
                status,
                feedback_cliente,
                feedback_cliente_categoria,
                vagas!inner(titulo, stack_tecnologica, nivel_senioridade)
            `)
            .eq('status', 'rejeitado')
            .not('feedback_cliente', 'is', null)
            .limit(20);

        if (errorReprov) throw errorReprov;

        const historicoReprovacoes = (reprovacoes || []).map((r: any) => ({
            motivo: r.feedback_cliente || 'Não especificado',
            categoria: r.feedback_cliente_categoria || 'outro',
            detalhes: r.feedback_cliente
        }));

        // 2. Chamar IA para recomendar questões
        const resultado = await recommendQuestionsForVaga({
            vaga: {
                titulo: vaga.titulo,
                descricao: vaga.descricao,
                stack_tecnologica: vaga.stack_tecnologica || [],
                nivel_senioridade: vaga.nivel_senioridade || 'Pleno',
                requisitos_obrigatorios: vaga.requisitos_obrigatorios || []
            },
            historicoReprovacoes
        });

        // 3. Salvar questões no banco
        const questoesParaSalvar = resultado.questoes.map(q => ({
            vaga_id: vagaId,
            questao: q.questao,
            categoria: q.categoria,
            subcategoria: q.subcategoria,
            relevancia_score: q.relevancia,
            baseado_em_reprovacoes: q.baseado_em_reprovacao,
            reprovacoes_relacionadas: q.baseado_em_reprovacao ? historicoReprovacoes.length : 0,
            ativa: true,
            aprovada_por_analista: false
        }));

        const { data: questoesSalvas, error: errorSave } = await supabase
            .from('vaga_questoes_recomendadas')
            .insert(questoesParaSalvar)
            .select();

        if (errorSave) throw errorSave;

        console.log(`[Questões] ${questoesSalvas?.length} questões geradas para vaga ${vagaId}`);
        console.log(`[Questões] Insights:`, resultado.insights);

        return questoesSalvas || [];

    } catch (error) {
        console.error('[Questões] Erro ao gerar questões:', error);
        throw error;
    }
}

/**
 * Busca questões recomendadas para uma vaga
 */
export async function buscarQuestoesVaga(vagaId: number): Promise<Questao[]> {
    const { data, error } = await supabase
        .from('vaga_questoes_recomendadas')
        .select('*')
        .eq('vaga_id', vagaId)
        .eq('ativa', true)
        .order('relevancia_score', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Analista aprova/rejeita questões recomendadas
 */
export async function aprovarQuestoes(
    questoesIds: number[],
    aprovadas: boolean
): Promise<void> {
    const { error } = await supabase
        .from('vaga_questoes_recomendadas')
        .update({ 
            aprovada_por_analista: aprovadas,
            ativa: aprovadas 
        })
        .in('id', questoesIds);

    if (error) throw error;
}

/**
 * Adiciona questão customizada pelo analista
 */
export async function adicionarQuestaoCustomizada(
    vagaId: number,
    questao: Partial<Questao>
): Promise<Questao> {
    const { data, error } = await supabase
        .from('vaga_questoes_recomendadas')
        .insert({
            vaga_id: vagaId,
            questao: questao.questao,
            categoria: questao.categoria,
            subcategoria: questao.subcategoria || 'customizada',
            relevancia_score: questao.relevancia_score || 50,
            baseado_em_reprovacoes: false,
            ativa: true,
            aprovada_por_analista: true
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Registra respostas do candidato às questões
 */
export async function registrarRespostasCandidato(
    candidaturaId: number,
    respostas: Array<{
        questao_id?: number;
        questao_texto: string;
        resposta_texto: string;
        fonte: 'entrevista_transcrita' | 'digitacao_manual';
    }>
): Promise<void> {
    const { error } = await supabase
        .from('candidato_respostas_questoes')
        .insert(
            respostas.map(r => ({
                candidatura_id: candidaturaId,
                questao_id: r.questao_id,
                questao_texto: r.questao_texto,
                resposta_texto: r.resposta_texto,
                fonte: r.fonte
            }))
        );

    if (error) throw error;

    // Atualizar contador "vezes_usada" das questões
    const questoesIds = respostas
        .filter(r => r.questao_id)
        .map(r => r.questao_id!);

    if (questoesIds.length > 0) {
        await supabase.rpc('incrementar_uso_questoes', { questoes_ids: questoesIds });
    }
}

/**
 * Avalia eficácia das questões (poder preditivo)
 */
export async function avaliarEficaciaQuestoes(vagaId?: number): Promise<any[]> {
    let query = supabase
        .from('vw_eficacia_questoes')
        .select('*')
        .order('poder_preditivo', { ascending: false });

    if (vagaId) {
        query = query.eq('vaga_id', vagaId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
}

/**
 * Atualiza banco de questões baseado em análise mensal
 */
export async function atualizarBancoQuestoes(
    questoesIneficazes: any[],
    questoesNovasSugeridas: any[]
): Promise<void> {
    try {
        // 1. Desativar questões ineficazes
        if (questoesIneficazes.length > 0) {
            const questoesTexto = questoesIneficazes.map(q => q.questao);
            
            await supabase
                .from('vaga_questoes_recomendadas')
                .update({ ativa: false })
                .in('questao', questoesTexto);

            console.log(`[Questões] ${questoesIneficazes.length} questões desativadas por baixa eficácia`);
        }

        // 2. Adicionar novas questões sugeridas
        if (questoesNovasSugeridas.length > 0) {
            // Buscar vagas ativas para adicionar questões genéricas
            const { data: vagasAtivas } = await supabase
                .from('vagas')
                .select('id')
                .eq('status', 'aberta')
                .limit(10);

            if (vagasAtivas && vagasAtivas.length > 0) {
                const novasQuestoes = vagasAtivas.flatMap(vaga =>
                    questoesNovasSugeridas.map(q => ({
                        vaga_id: vaga.id,
                        questao: q.questao,
                        categoria: q.categoria,
                        subcategoria: q.motivo,
                        relevancia_score: 80,
                        baseado_em_reprovacoes: true,
                        ativa: true,
                        aprovada_por_analista: false
                    }))
                );

                await supabase
                    .from('vaga_questoes_recomendadas')
                    .insert(novasQuestoes);

                console.log(`[Questões] ${questoesNovasSugeridas.length} novas questões adicionadas`);
            }
        }

    } catch (error) {
        console.error('[Questões] Erro ao atualizar banco de questões:', error);
        throw error;
    }
}
