/**
 * SERVIÇO: RECOMENDAÇÃO DE CANDIDATOS
 * Gerencia recomendações da IA e detecção de divergências
 */

import { supabase } from '../config/supabase';
import { 
    recommendCandidateDecision, 
    identifyRedFlags 
} from './geminiService';
import { aiConfig } from '../config/aiConfig';

export interface RecomendacaoIA {
    id?: number;
    candidatura_id: number;
    vaga_id: number;
    candidato_id: number;
    tipo_recomendacao: 'decisao' | 'red_flags';
    recomendacao: 'aprovar' | 'rejeitar' | 'reavaliar';
    score_confianca: number;
    justificativa: string;
    red_flags?: any[];
    pontos_fortes?: string[];
    analise_detalhada?: any;
    acatada_por_analista?: boolean;
    motivo_divergencia?: string;
    resultado_final?: 'aprovado_cliente' | 'reprovado_cliente' | 'pendente';
}

/**
 * Gera recomendação da IA sobre um candidato
 */
export async function recomendarDecisaoCandidato(
    candidaturaId: number
): Promise<RecomendacaoIA | null> {
    try {
        // 1. Verificar se funcionalidade está ativa
        if (!aiConfig.ENABLE_AI_CANDIDATE_RECOMMENDATION) {
            console.log('[Recomendação] Recomendação de candidatos desativada por configuração');
            return null;
        }

        // 2. Buscar dados da candidatura
        const { data: candidatura, error: errorCand } = await supabase
            .from('candidaturas')
            .select(`
                id,
                vaga_id,
                candidato_id,
                vagas!inner(titulo, descricao, stack_tecnologica, nivel_senioridade, requisitos_obrigatorios),
                candidatos!inner(nome, email, curriculo_texto, anos_experiencia)
            `)
            .eq('id', candidaturaId)
            .single();

        if (errorCand) throw errorCand;

        // 2. Buscar respostas das questões
        const { data: respostas, error: errorResp } = await supabase
            .from('candidato_respostas_questoes')
            .select('*')
            .eq('candidatura_id', candidaturaId);

        if (errorResp) throw errorResp;

        // 3. Buscar resumo da entrevista
        const { data: entrevista } = await supabase
            .from('entrevistas')
            .select('*')
            .eq('candidatura_id', candidaturaId)
            .order('criado_em', { ascending: false })
            .limit(1)
            .single();

        // 4. Buscar padrões de reprovação
        const { data: padroesReprov } = await supabase
            .from('candidaturas')
            .select('feedback_cliente, feedback_cliente_categoria')
            .eq('status', 'rejeitado')
            .not('feedback_cliente', 'is', null)
            .limit(10);

        const padroesReprovacao = (padroesReprov || []).map((p: any) => ({
            categoria: p.feedback_cliente_categoria || 'outro',
            descricao: p.feedback_cliente
        }));

        // 5. Chamar IA para recomendar
        const recomendacao = await recommendCandidateDecision({
            vaga: candidatura.vagas,
            candidato: candidatura.candidatos,
            respostasQuestoes: (respostas || []).map((r: any) => ({
                questao: r.questao_texto,
                resposta: r.resposta_texto,
                categoria: r.categoria || 'tecnica'
            })),
            entrevistaResumo: entrevista || {},
            parecerAnalista: entrevista?.parecer_analista,
            padroesReprovacao
        });

        // 6. Salvar recomendação no banco
        const { data: recomendacaoSalva, error: errorSave } = await supabase
            .from('ia_recomendacoes_candidato')
            .insert({
                candidatura_id: candidaturaId,
                vaga_id: candidatura.vaga_id,
                candidato_id: candidatura.candidato_id,
                tipo_recomendacao: 'decisao',
                recomendacao: recomendacao.recomendacao,
                score_confianca: recomendacao.score_confianca,
                justificativa: recomendacao.justificativa,
                red_flags: recomendacao.red_flags,
                pontos_fortes: recomendacao.pontos_fortes,
                analise_detalhada: {
                    probabilidade_aprovacao_cliente: recomendacao.probabilidade_aprovacao_cliente
                },
                resultado_final: 'pendente'
            })
            .select()
            .single();

        if (errorSave) throw errorSave;

        // 7. Salvar red flags identificados
        if (recomendacao.red_flags && recomendacao.red_flags.length > 0) {
            await salvarRedFlags(
                candidatura.candidato_id,
                candidaturaId,
                recomendacao.red_flags.map(rf => ({
                    ...rf,
                    identificado_em: 'entrevista_interna',
                    trecho_original: rf.descricao
                }))
            );
        }

        console.log(`[Recomendação] IA recomendou: ${recomendacao.recomendacao} (${recomendacao.score_confianca}% confiança)`);

        return recomendacaoSalva;

    } catch (error) {
        console.error('[Recomendação] Erro ao recomendar decisão:', error);
        throw error;
    }
}

/**
 * Registra quando analista envia CV (detecta divergência automaticamente)
 */
export async function registrarEnvioCVAoCliente(
    candidaturaId: number,
    analistaId: number
): Promise<void> {
    try {
        // 1. Buscar recomendação da IA
        const { data: recomendacao, error: errorRec } = await supabase
            .from('ia_recomendacoes_candidato')
            .select('*')
            .eq('candidatura_id', candidaturaId)
            .eq('tipo_recomendacao', 'decisao')
            .order('criado_em', { ascending: false })
            .limit(1)
            .single();

        if (errorRec && errorRec.code !== 'PGRST116') throw errorRec;

        // 2. Detectar se acatou ou divergiu
        const acatouRecomendacao = !recomendacao || recomendacao.recomendacao === 'aprovar';

        // 3. Atualizar candidatura
        const { error: errorUpdate } = await supabase
            .from('candidaturas')
            .update({
                cv_enviado_em: new Date().toISOString(),
                cv_enviado_por: analistaId,
                ia_recomendacao_acatada: acatouRecomendacao,
                motivo_divergencia: acatouRecomendacao ? null : 'PENDENTE',
                status: 'em_processo'
            })
            .eq('id', candidaturaId);

        if (errorUpdate) throw errorUpdate;

        // 4. Atualizar recomendação da IA
        if (recomendacao) {
            await supabase
                .from('ia_recomendacoes_candidato')
                .update({
                    acatada_por_analista: acatouRecomendacao
                })
                .eq('id', recomendacao.id);
        }

        console.log(`[Recomendação] CV enviado. Acatou IA: ${acatouRecomendacao}`);

    } catch (error) {
        console.error('[Recomendação] Erro ao registrar envio de CV:', error);
        throw error;
    }
}

/**
 * Registra motivo da divergência (quando analista discordou da IA)
 */
export async function registrarDivergenciaAnalista(
    candidaturaId: number,
    motivoDivergencia: string
): Promise<void> {
    try {
        // 1. Atualizar candidatura
        await supabase
            .from('candidaturas')
            .update({
                motivo_divergencia: motivoDivergencia
            })
            .eq('id', candidaturaId);

        // 2. Atualizar recomendação da IA
        const { data: recomendacao } = await supabase
            .from('ia_recomendacoes_candidato')
            .select('id')
            .eq('candidatura_id', candidaturaId)
            .eq('tipo_recomendacao', 'decisao')
            .order('criado_em', { ascending: false })
            .limit(1)
            .single();

        if (recomendacao) {
            await supabase
                .from('ia_recomendacoes_candidato')
                .update({
                    motivo_divergencia: motivoDivergencia
                })
                .eq('id', recomendacao.id);
        }

        console.log(`[Recomendação] Divergência registrada: ${motivoDivergencia}`);

    } catch (error) {
        console.error('[Recomendação] Erro ao registrar divergência:', error);
        throw error;
    }
}

/**
 * Registra feedback do cliente (fecha ciclo de aprendizado)
 */
export async function registrarFeedbackCliente(
    candidaturaId: number,
    feedback: {
        feedback_texto: string;
        categoria: 'tecnico' | 'comportamental' | 'cultural' | 'salario' | 'outro';
        aprovado: boolean;
    },
    analistaId: number
): Promise<void> {
    try {
        // 1. Atualizar candidatura
        await supabase
            .from('candidaturas')
            .update({
                feedback_cliente: feedback.feedback_texto,
                feedback_cliente_categoria: feedback.categoria,
                feedback_cliente_registrado_em: new Date().toISOString(),
                feedback_cliente_registrado_por: analistaId,
                status: feedback.aprovado ? 'aprovado' : 'rejeitado'
            })
            .eq('id', candidaturaId);

        // 2. Atualizar resultado final na recomendação da IA
        await supabase
            .from('ia_recomendacoes_candidato')
            .update({
                resultado_final: feedback.aprovado ? 'aprovado_cliente' : 'reprovado_cliente'
            })
            .eq('candidatura_id', candidaturaId);

        // 3. Se reprovado, identificar red flags no feedback
        if (!feedback.aprovado) {
            const { data: candidatura } = await supabase
                .from('candidaturas')
                .select('candidato_id')
                .eq('id', candidaturaId)
                .single();

            if (candidatura) {
                const redFlags = await identifyRedFlags({
                    cv: '',
                    feedbackCliente: feedback.feedback_texto
                });

                if (redFlags.flags.length > 0) {
                    await salvarRedFlags(
                        candidatura.candidato_id,
                        candidaturaId,
                        redFlags.flags.map(rf => ({
                            ...rf,
                            identificado_em: 'feedback_cliente'
                        }))
                    );
                }
            }
        }

        console.log(`[Recomendação] Feedback do cliente registrado: ${feedback.aprovado ? 'Aprovado' : 'Reprovado'}`);

    } catch (error) {
        console.error('[Recomendação] Erro ao registrar feedback:', error);
        throw error;
    }
}

/**
 * Salva red flags identificados
 */
async function salvarRedFlags(
    candidatoId: number,
    candidaturaId: number,
    flags: any[]
): Promise<void> {
    const { error } = await supabase
        .from('candidato_red_flags')
        .insert(
            flags.map(f => ({
                candidato_id: candidatoId,
                candidatura_id: candidaturaId,
                tipo_flag: f.tipo,
                descricao: f.descricao,
                severidade: f.severidade,
                identificado_em: f.identificado_em || f.fonte,
                trecho_original: f.trecho_original
            }))
        );

    if (error) throw error;
}

/**
 * Busca recomendação da IA para uma candidatura
 */
export async function buscarRecomendacaoIA(candidaturaId: number): Promise<RecomendacaoIA | null> {
    const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('*')
        .eq('candidatura_id', candidaturaId)
        .eq('tipo_recomendacao', 'decisao')
        .order('criado_em', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

/**
 * Analisa acurácia das recomendações da IA
 */
export async function analisarAcuraciaRecomendacoes(periodo?: string): Promise<any> {
    let query = supabase
        .from('vw_dashboard_recomendacoes_ia')
        .select('*')
        .order('mes', { ascending: false });

    if (periodo) {
        query = query.eq('mes', periodo);
    }

    const { data, error } = await query.limit(12);

    if (error) throw error;
    return data || [];
}

/**
 * Busca divergências entre IA e Analista
 */
export async function buscarDivergencias(): Promise<any[]> {
    const { data, error } = await supabase
        .from('vw_divergencias_ia_analista')
        .select('*')
        .order('id', { ascending: false })
        .limit(50);

    if (error) throw error;
    return data || [];
}
