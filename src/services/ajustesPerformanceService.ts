/**
 * SERVIÇO: AJUSTES MANUAIS E MÉTRICAS DE PERFORMANCE
 * Gerencia ajustes manuais e mede impacto na distribuição
 */

import { supabase } from '../config/supabase';

// ============================================
// INTERFACES
// ============================================

export interface AjusteAnalista {
    analista_id: number;
    fit_stack_override?: number | null;
    fit_cliente_override?: number | null;
    multiplicador_performance?: number;
    bonus_experiencia?: number;
    prioridade_distribuicao?: 'Alta' | 'Normal' | 'Baixa';
    ativo_para_distribuicao?: boolean;
    capacidade_maxima_vagas?: number;
    observacoes_distribuicao?: string;
}

export interface AjusteVaga {
    vaga_id: number;
    peso_fit_stack_custom?: number | null;
    peso_fit_cliente_custom?: number | null;
    peso_disponibilidade_custom?: number | null;
    peso_taxa_sucesso_custom?: number | null;
    analistas_priorizados?: number[];
    analistas_excluidos?: number[];
    requer_aprovacao_manual?: boolean;
    observacoes_distribuicao?: string;
}

export interface Experimento {
    id?: number;
    nome_experimento: string;
    descricao?: string;
    tipo: 'pesos' | 'analista' | 'vaga' | 'global';
    config_antes: any;
    config_depois: any;
    data_inicio: string;
    data_fim?: string;
    ativo: boolean;
    criado_por: number;
}

export interface MetricaDistribuicao {
    vaga_id: number;
    analista_id: number;
    score_match_calculado: number;
    score_match_ajustado: number;
    fit_stack_calculado: number;
    fit_stack_override?: number;
    fit_stack_final: number;
    fit_cliente_calculado: number;
    fit_cliente_override?: number;
    fit_cliente_final: number;
    disponibilidade_calculada: number;
    taxa_sucesso_calculada: number;
    multiplicador_aplicado: number;
    bonus_aplicado: number;
    peso_fit_stack: number;
    peso_fit_cliente: number;
    peso_disponibilidade: number;
    peso_taxa_sucesso: number;
    foi_distribuido: boolean;
    motivo_nao_distribuicao?: string;
    experimento_id?: number;
}

// ============================================
// AJUSTES POR ANALISTA
// ============================================

/**
 * Busca ajustes do analista
 */
export async function buscarAjustesAnalista(analistaId: number): Promise<AjusteAnalista | null> {
    try {
        const { data, error } = await supabase
            .from('app_users')
            .select(`
                id,
                fit_stack_override,
                fit_cliente_override,
                multiplicador_performance,
                bonus_experiencia,
                prioridade_distribuicao,
                ativo_para_distribuicao,
                capacidade_maxima_vagas,
                observacoes_distribuicao
            `)
            .eq('id', analistaId)
            .single();

        if (error) throw error;
        
        return {
            analista_id: data.id,
            ...data
        };
    } catch (error) {
        console.error('Erro ao buscar ajustes do analista:', error);
        return null;
    }
}

/**
 * Atualiza ajustes do analista
 */
export async function atualizarAjustesAnalista(
    ajustes: AjusteAnalista,
    usuarioId: number,
    motivo?: string
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('app_users')
            .update({
                fit_stack_override: ajustes.fit_stack_override,
                fit_cliente_override: ajustes.fit_cliente_override,
                multiplicador_performance: ajustes.multiplicador_performance,
                bonus_experiencia: ajustes.bonus_experiencia,
                prioridade_distribuicao: ajustes.prioridade_distribuicao,
                ativo_para_distribuicao: ajustes.ativo_para_distribuicao,
                capacidade_maxima_vagas: ajustes.capacidade_maxima_vagas,
                observacoes_distribuicao: ajustes.observacoes_distribuicao
            })
            .eq('id', ajustes.analista_id);

        if (error) throw error;

        // Registrar no histórico
        if (motivo) {
            await registrarAjusteHistorico(
                'analista',
                ajustes.analista_id,
                'ajuste_manual',
                JSON.stringify(ajustes),
                motivo,
                usuarioId
            );
        }

        return true;
    } catch (error) {
        console.error('Erro ao atualizar ajustes do analista:', error);
        return false;
    }
}

/**
 * Resetar ajustes do analista
 */
export async function resetarAjustesAnalista(analistaId: number, usuarioId: number): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('app_users')
            .update({
                fit_stack_override: null,
                fit_cliente_override: null,
                multiplicador_performance: 1.00,
                bonus_experiencia: 0,
                prioridade_distribuicao: 'Normal',
                ativo_para_distribuicao: true,
                observacoes_distribuicao: null
            })
            .eq('id', analistaId);

        if (error) throw error;

        await registrarAjusteHistorico(
            'analista',
            analistaId,
            'reset',
            'null',
            'Resetar ajustes para padrão',
            usuarioId
        );

        return true;
    } catch (error) {
        console.error('Erro ao resetar ajustes do analista:', error);
        return false;
    }
}

// ============================================
// AJUSTES POR VAGA
// ============================================

/**
 * Busca ajustes da vaga
 */
export async function buscarAjustesVaga(vagaId: number): Promise<AjusteVaga | null> {
    try {
        const { data, error } = await supabase
            .from('vagas')
            .select(`
                id,
                peso_fit_stack_custom,
                peso_fit_cliente_custom,
                peso_disponibilidade_custom,
                peso_taxa_sucesso_custom,
                analistas_priorizados,
                analistas_excluidos,
                requer_aprovacao_manual,
                observacoes_distribuicao
            `)
            .eq('id', vagaId)
            .single();

        if (error) throw error;
        
        return {
            vaga_id: data.id,
            ...data
        };
    } catch (error) {
        console.error('Erro ao buscar ajustes da vaga:', error);
        return null;
    }
}

/**
 * Atualiza ajustes da vaga
 */
export async function atualizarAjustesVaga(
    ajustes: AjusteVaga,
    usuarioId: number,
    motivo?: string
): Promise<boolean> {
    try {
        // Validar soma dos pesos se customizados
        if (
            ajustes.peso_fit_stack_custom !== undefined &&
            ajustes.peso_fit_cliente_custom !== undefined &&
            ajustes.peso_disponibilidade_custom !== undefined &&
            ajustes.peso_taxa_sucesso_custom !== undefined
        ) {
            const soma = 
                (ajustes.peso_fit_stack_custom || 0) +
                (ajustes.peso_fit_cliente_custom || 0) +
                (ajustes.peso_disponibilidade_custom || 0) +
                (ajustes.peso_taxa_sucesso_custom || 0);

            if (soma !== 100 && soma !== 0) {
                throw new Error(`Soma dos pesos deve ser 100. Atual: ${soma}`);
            }
        }

        const { error } = await supabase
            .from('vagas')
            .update({
                peso_fit_stack_custom: ajustes.peso_fit_stack_custom,
                peso_fit_cliente_custom: ajustes.peso_fit_cliente_custom,
                peso_disponibilidade_custom: ajustes.peso_disponibilidade_custom,
                peso_taxa_sucesso_custom: ajustes.peso_taxa_sucesso_custom,
                analistas_priorizados: ajustes.analistas_priorizados,
                analistas_excluidos: ajustes.analistas_excluidos,
                requer_aprovacao_manual: ajustes.requer_aprovacao_manual,
                observacoes_distribuicao: ajustes.observacoes_distribuicao
            })
            .eq('id', ajustes.vaga_id);

        if (error) throw error;

        // Registrar no histórico
        if (motivo) {
            await registrarAjusteHistorico(
                'vaga',
                ajustes.vaga_id,
                'ajuste_manual',
                JSON.stringify(ajustes),
                motivo,
                usuarioId
            );
        }

        return true;
    } catch (error) {
        console.error('Erro ao atualizar ajustes da vaga:', error);
        throw error;
    }
}

// ============================================
// EXPERIMENTOS A/B
// ============================================

/**
 * Criar experimento
 */
export async function criarExperimento(experimento: Experimento): Promise<number | null> {
    try {
        const { data, error } = await supabase
            .from('experimentos_distribuicao')
            .insert({
                nome_experimento: experimento.nome_experimento,
                descricao: experimento.descricao,
                tipo: experimento.tipo,
                config_antes: experimento.config_antes,
                config_depois: experimento.config_depois,
                data_inicio: experimento.data_inicio,
                data_fim: experimento.data_fim,
                ativo: experimento.ativo,
                criado_por: experimento.criado_por
            })
            .select()
            .single();

        if (error) throw error;
        return data.id;
    } catch (error) {
        console.error('Erro ao criar experimento:', error);
        return null;
    }
}

/**
 * Buscar experimentos ativos
 */
export async function buscarExperimentosAtivos() {
    try {
        const { data, error } = await supabase
            .from('vw_experimentos_ativos')
            .select('*')
            .order('criado_em', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar experimentos:', error);
        return [];
    }
}

/**
 * Finalizar experimento
 */
export async function finalizarExperimento(
    experimentoId: number,
    resultado: 'sucesso' | 'fracasso' | 'inconclusivo',
    conclusoes: string
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('experimentos_distribuicao')
            .update({
                ativo: false,
                data_fim: new Date().toISOString(),
                resultado,
                conclusoes,
                atualizado_em: new Date().toISOString()
            })
            .eq('id', experimentoId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao finalizar experimento:', error);
        return false;
    }
}

// ============================================
// MÉTRICAS
// ============================================

/**
 * Registrar métrica de distribuição
 */
export async function registrarMetrica(metrica: MetricaDistribuicao): Promise<boolean> {
    try {
        const { error } = await supabase.rpc('registrar_metrica_distribuicao', {
            p_vaga_id: metrica.vaga_id,
            p_analista_id: metrica.analista_id,
            p_scores: {
                score_match_calculado: metrica.score_match_calculado,
                score_match_ajustado: metrica.score_match_ajustado,
                fit_stack_calculado: metrica.fit_stack_calculado,
                fit_stack_override: metrica.fit_stack_override,
                fit_stack_final: metrica.fit_stack_final,
                fit_cliente_calculado: metrica.fit_cliente_calculado,
                fit_cliente_override: metrica.fit_cliente_override,
                fit_cliente_final: metrica.fit_cliente_final,
                disponibilidade_calculada: metrica.disponibilidade_calculada,
                taxa_sucesso_calculada: metrica.taxa_sucesso_calculada,
                multiplicador_aplicado: metrica.multiplicador_aplicado,
                bonus_aplicado: metrica.bonus_aplicado,
                peso_fit_stack: metrica.peso_fit_stack,
                peso_fit_cliente: metrica.peso_fit_cliente,
                peso_disponibilidade: metrica.peso_disponibilidade,
                peso_taxa_sucesso: metrica.peso_taxa_sucesso
            },
            p_foi_distribuido: metrica.foi_distribuido,
            p_experimento_id: metrica.experimento_id
        });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao registrar métrica:', error);
        return false;
    }
}

/**
 * Buscar métricas por analista
 */
export async function buscarMetricasAnalista(analistaId: number, limit: number = 50) {
    try {
        const { data, error } = await supabase
            .from('metricas_distribuicao')
            .select('*')
            .eq('analista_id', analistaId)
            .order('calculado_em', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar métricas do analista:', error);
        return [];
    }
}

/**
 * Buscar performance por analista
 */
export async function buscarPerformanceAnalistas() {
    try {
        const { data, error } = await supabase
            .from('vw_performance_analista_distribuicao')
            .select('*')
            .order('score_medio', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar performance dos analistas:', error);
        return [];
    }
}

/**
 * Buscar impacto de ajustes
 */
export async function buscarImpactoAjustes(limit: number = 20) {
    try {
        const { data, error } = await supabase
            .from('vw_impacto_ajustes')
            .select('*')
            .order('alterado_em', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar impacto de ajustes:', error);
        return [];
    }
}

/**
 * Calcular impacto de ajuste
 */
export async function calcularImpactoAjuste(historicoId: number): Promise<string | null> {
    try {
        const { data, error } = await supabase.rpc('calcular_impacto_ajuste', {
            p_historico_id: historicoId
        });

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao calcular impacto:', error);
        return null;
    }
}

// ============================================
// HISTÓRICO
// ============================================

/**
 * Registrar ajuste no histórico
 */
async function registrarAjusteHistorico(
    tipoEntidade: 'analista' | 'vaga' | 'global',
    entidadeId: number,
    campoAlterado: string,
    valorNovo: string,
    motivo: string,
    usuarioId: number
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('historico_ajustes_distribuicao')
            .insert({
                tipo_entidade: tipoEntidade,
                entidade_id: entidadeId,
                campo_alterado: campoAlterado,
                valor_novo: valorNovo,
                motivo,
                alterado_por: usuarioId
            });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao registrar histórico:', error);
        return false;
    }
}

/**
 * Buscar histórico de ajustes
 */
export async function buscarHistoricoAjustes(
    tipoEntidade?: 'analista' | 'vaga' | 'global',
    entidadeId?: number,
    limit: number = 50
) {
    try {
        let query = supabase
            .from('historico_ajustes_distribuicao')
            .select(`
                *,
                app_users!alterado_por(nome_usuario)
            `)
            .order('alterado_em', { ascending: false })
            .limit(limit);

        if (tipoEntidade) {
            query = query.eq('tipo_entidade', tipoEntidade);
        }

        if (entidadeId) {
            query = query.eq('entidade_id', entidadeId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
    }
}
