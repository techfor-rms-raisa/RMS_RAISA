/**
 * Service de Priorização e Distribuição Inteligente de Vagas
 * RAISA Advanced Module
 * 
 * Orquestra o cálculo de prioridade de vagas e a recomendação de analistas
 * usando IA (Gemini) e dados históricos do Supabase
 */

import { supabase } from './supabaseClient';
import { calculateVagaPriority, recommendAnalyst } from './geminiService';
import {
    VagaPriorizacaoScore,
    AnalistaFitScore,
    Analista,
    DadosVagaPrioridade,
    DadosRecomendacaoAnalista
} from '@/types';

// ============================================
// FUNÇÕES DE COLETA DE DADOS
// ============================================

/**
 * Busca dados completos da vaga para cálculo de prioridade
 */
export async function coletarDadosVaga(vagaId: string): Promise<DadosVagaPrioridade | null> {
    try {
        // Buscar dados da vaga
        const { data: vaga, error: vagaError } = await supabase
            .from('vagas')
            .select(`
                *,
                clients (
                    id,
                    razao_social_cliente,
                    vip
                )
            `)
            .eq('id', vagaId)
            .single();

        if (vagaError || !vaga) {
            console.error('Erro ao buscar vaga:', vagaError);
            return null;
        }

        // Calcular dias em aberto
        const diasAberta = Math.floor(
            (new Date().getTime() - new Date(vaga.created_at || vaga.criado_em).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Buscar média de dias para fechar vagas similares (mesmo stack/senioridade)
        const { data: historicoVagas } = await supabase
            .from('vw_raisa_analise_tempo')
            .select('tempo_medio_fechamento_dias')
            .eq('senioridade', vaga.senioridade)
            .limit(1)
            .single();

        // Calcular dias até data limite
        let diasAteDataLimite = null;
        if (vaga.prazo_fechamento) {
            const dataLimite = new Date(vaga.prazo_fechamento);
            const hoje = new Date();
            diasAteDataLimite = Math.floor((dataLimite.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
            vaga_id: vaga.id,
            titulo_vaga: vaga.titulo,
            cliente_id: vaga.clients?.id || vaga.cliente_id || 0,
            cliente_nome: vaga.clients?.razao_social_cliente || 'Cliente desconhecido',
            cliente_vip: vaga.clients?.vip || false,
            prazo_fechamento: vaga.prazo_fechamento,
            faturamento_estimado: vaga.faturamento_mensal,
            stack_tecnologica: vaga.stack_tecnologica || [],
            senioridade: vaga.senioridade,
            dias_vaga_aberta: diasAberta,
            media_dias_vagas_similares: historicoVagas?.tempo_medio_fechamento_dias,
            flag_urgencia: vaga.urgente ? 'Urgente' : 'Normal',
            data_limite: vaga.prazo_fechamento,
            dias_ate_data_limite: diasAteDataLimite,
            qtde_maxima_distribuicao: 1 // Valor padrão
        };
    } catch (error) {
        console.error('Erro ao coletar dados da vaga:', error);
        return null;
    }
}

/**
 * Busca lista de analistas disponíveis com seus perfis
 */
export async function coletarAnalistasDisponiveis(): Promise<Analista[]> {
    try {
        // Buscar analistas ativos
        const { data: usuarios, error } = await supabase
            .from('app_users')
            .select('*')
            .eq('tipo_usuario', 'Analista de R&S')
            .eq('ativo_usuario', true);

        if (error || !usuarios) {
            console.error('Erro ao buscar analistas:', error);
            return [];
        }

        // Para cada analista, buscar dados adicionais
        const analistas: Analista[] = await Promise.all(
            usuarios.map(async (user) => {
                // Contar vagas ativas atribuídas
                const { count: cargaAtual } = await supabase
                    .from('vagas')
                    .select('*', { count: 'exact', head: true })
                    .eq('analista_id', user.id)
                    .in('status', ['aberta', 'em_andamento']);

                // Buscar taxa de aprovação geral
                const { data: aprovacoes } = await supabase
                    .from('vw_raisa_performance_analista')
                    .select('taxa_aprovacao')
                    .eq('analista_id', user.id)
                    .single();

                // Buscar tempo médio de fechamento
                const { data: tempo } = await supabase
                    .from('vw_raisa_analise_tempo')
                    .select('tempo_medio_fechamento_dias')
                    .eq('analista_id', user.id)
                    .single();

                // Buscar histórico por cliente
                const { data: historicoClientes } = await supabase
                    .from('vw_raisa_performance_cliente')
                    .select('cliente_id, taxa_aprovacao, total_candidatos')
                    .eq('analista_id', user.id);

                return {
                    id: user.id,
                    nome: user.nome_usuario,
                    email: user.email_usuario,
                    stack_experiencia: user.stack_experiencia || [], // Assumindo que existe este campo
                    carga_trabalho_atual: cargaAtual || 0,
                    historico_aprovacao_cliente: (historicoClientes || []).map(h => ({
                        cliente_id: h.cliente_id,
                        taxa_aprovacao: h.taxa_aprovacao,
                        vagas_fechadas: h.total_candidatos
                    })),
                    taxa_aprovacao_geral: aprovacoes?.taxa_aprovacao || 0,
                    tempo_medio_fechamento_dias: tempo?.tempo_medio_fechamento_dias || 30
                };
            })
        );

        return analistas;
    } catch (error) {
        console.error('Erro ao coletar analistas:', error);
        return [];
    }
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Calcula e salva a prioridade de uma vaga
 */
export async function calcularPrioridadeVaga(vagaId: string): Promise<VagaPriorizacaoScore | null> {
    try {
        // 1. Coletar dados da vaga
        const dadosVaga = await coletarDadosVaga(vagaId);
        if (!dadosVaga) {
            throw new Error('Não foi possível coletar dados da vaga');
        }

        // 2. Buscar configuração ativa (opcional, para uso futuro)
        const { data: config } = await supabase
            .from('config_priorizacao')
            .select('*')
            .eq('ativa', true)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        // 3. Chamar IA para calcular prioridade (função recebe apenas 1 argumento)
        const resultado = await calculateVagaPriority(dadosVaga);

        // 4. Montar objeto completo
        const prioridade: VagaPriorizacaoScore = {
            vaga_id: vagaId,
            score_prioridade: resultado.score_prioridade,
            nivel_prioridade: resultado.nivel_prioridade,
            sla_dias: resultado.sla_dias,
            justificativa: resultado.justificativa,
            fatores_considerados: resultado.fatores_considerados,
            calculado_em: new Date().toISOString()
        };

        // 5. Salvar no Supabase
        const { error } = await supabase
            .from('vaga_priorizacao')
            .upsert({
                vaga_id: vagaId,
                score_prioridade: prioridade.score_prioridade,
                nivel_prioridade: prioridade.nivel_prioridade,
                sla_dias: prioridade.sla_dias,
                justificativa: prioridade.justificativa,
                fatores_considerados: prioridade.fatores_considerados,
                calculado_em: prioridade.calculado_em
            });

        if (error) {
            console.error('Erro ao salvar prioridade:', error);
        }

        return prioridade;
    } catch (error) {
        console.error('Erro ao calcular prioridade da vaga:', error);
        return null;
    }
}

/**
 * Recomenda analistas para uma vaga
 */
export async function recomendarAnalistasParaVaga(vagaId: string): Promise<AnalistaFitScore[]> {
    try {
        // 1. Buscar ou calcular prioridade da vaga
        let prioridade = await buscarPrioridadeVaga(vagaId);
        if (!prioridade) {
            prioridade = await calcularPrioridadeVaga(vagaId);
            if (!prioridade) {
                throw new Error('Não foi possível calcular prioridade da vaga');
            }
        }

        // 2. Coletar dados da vaga e analistas
        const dadosVaga = await coletarDadosVaga(vagaId);
        const analistas = await coletarAnalistasDisponiveis();

        if (!dadosVaga || analistas.length === 0) {
            throw new Error('Dados insuficientes para recomendação');
        }

        // 3. Buscar configuração ativa (opcional, para uso futuro)
        const { data: config } = await supabase
            .from('config_distribuicao')
            .select('*')
            .eq('ativa', true)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        // 4. Chamar IA para recomendar analistas (função recebe apenas 1 argumento)
        const dadosRecomendacao: DadosRecomendacaoAnalista = {
            vaga: dadosVaga,
            analistas_disponiveis: analistas,
            prioridade_vaga: prioridade
        };

        const resultados = await recommendAnalyst(dadosRecomendacao);

        // 5. Limitar pela quantidade máxima de distribuição
        const qtdeMaxima = dadosVaga.qtde_maxima_distribuicao || 1;
        const resultadosLimitados = resultados.slice(0, qtdeMaxima);

        // 6. Montar objetos completos
        const recomendacoes: AnalistaFitScore[] = resultadosLimitados.map((r: any) => ({
            vaga_id: vagaId,
            analista_id: r.analista_id,
            analista_nome: r.analista_nome,
            score_match: r.score_match,
            nivel_adequacao: r.nivel_adequacao,
            justificativa_match: r.justificativa_match,
            fatores_match: r.fatores_match,
            tempo_estimado_fechamento_dias: r.tempo_estimado_fechamento_dias,
            recomendacao: r.recomendacao,
            calculado_em: new Date().toISOString()
        }));

        // 7. Salvar no Supabase
        for (const rec of recomendacoes) {
            await supabase
                .from('vaga_distribuicao')
                .upsert({
                    vaga_id: rec.vaga_id,
                    analista_id: rec.analista_id,
                    score_match: rec.score_match,
                    nivel_adequacao: rec.nivel_adequacao,
                    justificativa_match: rec.justificativa_match,
                    fatores_match: rec.fatores_match,
                    tempo_estimado_fechamento_dias: rec.tempo_estimado_fechamento_dias,
                    recomendacao: rec.recomendacao,
                    calculado_em: rec.calculado_em
                });
        }

        return recomendacoes;
    } catch (error) {
        console.error('Erro ao recomendar analistas:', error);
        return [];
    }
}

/**
 * Busca prioridade já calculada de uma vaga
 */
export async function buscarPrioridadeVaga(vagaId: string): Promise<VagaPriorizacaoScore | null> {
    try {
        const { data, error } = await supabase
            .from('vaga_priorizacao')
            .select('*')
            .eq('vaga_id', vagaId)
            .single();

        if (error || !data) {
            return null;
        }

        return data as VagaPriorizacaoScore;
    } catch (error) {
        return null;
    }
}

/**
 * Busca recomendações de analistas para uma vaga
 */
export async function buscarRecomendacoesAnalistas(vagaId: string): Promise<AnalistaFitScore[]> {
    try {
        const { data, error } = await supabase
            .from('vaga_distribuicao')
            .select('*')
            .eq('vaga_id', vagaId)
            .order('score_match', { ascending: false });

        if (error || !data) {
            return [];
        }

        return data as AnalistaFitScore[];
    } catch (error) {
        return [];
    }
}

/**
 * Atribui um analista a uma vaga
 */
export async function atribuirAnalistaVaga(vagaId: string, analistaId: number): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('vagas')
            .update({ analista_id: analistaId })
            .eq('id', vagaId);

        return !error;
    } catch (error) {
        console.error('Erro ao atribuir analista:', error);
        return false;
    }
}
