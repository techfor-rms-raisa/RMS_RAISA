/**
 * SERVIÇO: APRENDIZADO COM REPROVAÇÕES
 * Analisa padrões de reprovação e melhora questões
 */

import { supabase } from '../config/supabase';
import { analyzeRejectionPatterns } from './geminiService';
import { atualizarBancoQuestoes } from './questoesInteligentesService';
import { aiConfig, checkDataSufficiency } from '../config/aiConfig';

export interface AnaliseReprovacao {
    id?: number;
    periodo: string;
    total_candidaturas: number;
    total_reprovacoes: number;
    taxa_reprovacao: number;
    padroes_tecnicos: any[];
    padroes_comportamentais: any[];
    padroes_culturais: any[];
    questoes_eficazes: any[];
    questoes_ineficazes: any[];
    questoes_novas_sugeridas: any[];
    recomendacoes_melhoria: string[];
    insights: string[];
    taxa_acuracia?: number;
}

/**
 * Executa análise mensal de reprovações
 */
export async function executarAnaliseMensal(
    periodo?: string
): Promise<AnaliseReprovacao | null> {
    try {
        // 1. Verificar se funcionalidade está ativa
        if (!aiConfig.ENABLE_AI_REJECTION_ANALYSIS) {
            console.log('[Aprendizado] Análise de reprovações desativada por configuração');
            return null;
        }

        // 2. Verificar se há dados suficientes
        const dataCheck = await checkDataSufficiency('ENABLE_AI_REJECTION_ANALYSIS');
        if (!dataCheck.hasEnoughData) {
            console.log(`[Aprendizado] Dados insuficientes: ${dataCheck.message}`);
            return null;
        }

        // 3. Definir período (padrão: mês anterior)
        const periodoAnalise = periodo || obterPeriodoAnterior();
        const [ano, mes] = periodoAnalise.split('-');

        console.log(`[Aprendizado] Iniciando análise mensal: ${periodoAnalise}`);

        // 4. Buscar reprovações do período
        const { data: reprovacoes, error: errorReprov } = await supabase
            .from('candidaturas')
            .select(`
                id,
                status,
                feedback_cliente,
                feedback_cliente_categoria,
                criado_em,
                vagas!inner(titulo, stack_tecnologica, nivel_senioridade),
                candidatos!inner(nome)
            `)
            .eq('status', 'rejeitado')
            .gte('feedback_cliente_registrado_em', `${ano}-${mes}-01`)
            .lt('feedback_cliente_registrado_em', obterProximoPeriodo(periodoAnalise))
            .not('feedback_cliente', 'is', null);

        if (errorReprov) throw errorReprov;

        if (!reprovacoes || reprovacoes.length === 0) {
            console.log(`[Aprendizado] Nenhuma reprovação encontrada para ${periodoAnalise}`);
            return criarAnaliseVazia(periodoAnalise);
        }

        // 3. Buscar questões usadas em cada reprovação
        const reprovacoesIdsArray = reprovacoes.map((r: any) => r.id);
        const { data: questoesUsadas } = await supabase
            .from('candidato_respostas_questoes')
            .select('candidatura_id, questao_texto')
            .in('candidatura_id', reprovacoesIdsArray);

        const questoesPorCandidatura: Record<number, string[]> = {};
        (questoesUsadas || []).forEach((q: any) => {
            if (!questoesPorCandidatura[q.candidatura_id]) {
                questoesPorCandidatura[q.candidatura_id] = [];
            }
            questoesPorCandidatura[q.candidatura_id].push(q.questao_texto);
        });

        // 4. Preparar dados para IA
        const dadosReprovacoes = reprovacoes.map((r: any) => ({
            vaga_titulo: r.vagas.titulo,
            candidato_nome: r.candidatos.nome,
            motivo_reprovacao: r.feedback_cliente,
            categoria_reprovacao: r.feedback_cliente_categoria || 'outro',
            feedback_cliente: r.feedback_cliente,
            questoes_usadas: questoesPorCandidatura[r.id] || []
        }));

        // 5. Chamar IA para analisar padrões
        const analiseIA = await analyzeRejectionPatterns({
            reprovacoes: dadosReprovacoes,
            periodo: periodoAnalise
        });

        // 6. Calcular estatísticas
        const { count: totalCandidaturas } = await supabase
            .from('candidaturas')
            .select('id', { count: 'exact', head: true })
            .gte('criado_em', `${ano}-${mes}-01`)
            .lt('criado_em', obterProximoPeriodo(periodoAnalise));

        const total = totalCandidaturas || 0;
        const taxaReprovacao = total > 0 ? (reprovacoes.length / total) * 100 : 0;

        // 7. Calcular acurácia da IA
        const taxaAcuracia = await calcularAcuraciaIA(periodoAnalise);

        // 8. Salvar análise no banco
        const { data: analiseSalva, error: errorSave } = await supabase
            .from('analise_reprovacoes')
            .insert({
                periodo: periodoAnalise,
                total_candidaturas: total,
                total_reprovacoes: reprovacoes.length,
                taxa_reprovacao: taxaReprovacao,
                padroes_tecnicos: analiseIA.padroes_tecnicos,
                padroes_comportamentais: analiseIA.padroes_comportamentais,
                padroes_culturais: analiseIA.padroes_culturais,
                questoes_eficazes: [],
                questoes_ineficazes: analiseIA.questoes_ineficazes,
                questoes_novas_sugeridas: analiseIA.questoes_novas_sugeridas,
                recomendacoes_melhoria: analiseIA.recomendacoes_melhoria,
                insights: analiseIA.insights,
                taxa_acuracia: taxaAcuracia
            })
            .select()
            .single();

        if (errorSave) throw errorSave;

        // 9. Atualizar banco de questões
        await atualizarBancoQuestoes(
            analiseIA.questoes_ineficazes,
            analiseIA.questoes_novas_sugeridas
        );

        console.log(`[Aprendizado] Análise mensal concluída: ${periodoAnalise}`);
        console.log(`[Aprendizado] Taxa de reprovação: ${taxaReprovacao.toFixed(2)}%`);
        console.log(`[Aprendizado] Acurácia da IA: ${taxaAcuracia.toFixed(2)}%`);

        return analiseSalva;

    } catch (error) {
        console.error('[Aprendizado] Erro ao executar análise mensal:', error);
        throw error;
    }
}

/**
 * Calcula acurácia da IA no período
 */
async function calcularAcuraciaIA(periodo: string): Promise<number> {
    const [ano, mes] = periodo.split('-');

    const { data: recomendacoes } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('recomendacao, resultado_final')
        .gte('criado_em', `${ano}-${mes}-01`)
        .lt('criado_em', obterProximoPeriodo(periodo))
        .eq('tipo_recomendacao', 'decisao')
        .not('resultado_final', 'is', null);

    if (!recomendacoes || recomendacoes.length === 0) return 0;

    const acertos = recomendacoes.filter((r: any) => {
        if (r.recomendacao === 'aprovar' && r.resultado_final === 'aprovado_cliente') return true;
        if (r.recomendacao === 'rejeitar' && r.resultado_final === 'reprovado_cliente') return true;
        return false;
    }).length;

    return (acertos / recomendacoes.length) * 100;
}

/**
 * Busca análises anteriores
 */
export async function buscarAnalises(limite: number = 12): Promise<AnaliseReprovacao[]> {
    const { data, error } = await supabase
        .from('analise_reprovacoes')
        .select('*')
        .order('periodo', { ascending: false })
        .limit(limite);

    if (error) throw error;
    return data || [];
}

/**
 * Busca análise de um período específico
 */
export async function buscarAnalisePeriodo(periodo: string): Promise<AnaliseReprovacao | null> {
    const { data, error } = await supabase
        .from('analise_reprovacoes')
        .select('*')
        .eq('periodo', periodo)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

/**
 * Identifica padrões recorrentes (últimos 3 meses)
 */
export async function identificarPadroesRecorrentes(): Promise<{
    padroes_tecnicos_recorrentes: any[];
    padroes_comportamentais_recorrentes: any[];
    tendencias: string[];
}> {
    const { data: analises } = await supabase
        .from('analise_reprovacoes')
        .select('*')
        .order('periodo', { ascending: false })
        .limit(3);

    if (!analises || analises.length === 0) {
        return {
            padroes_tecnicos_recorrentes: [],
            padroes_comportamentais_recorrentes: [],
            tendencias: []
        };
    }

    // Agregar padrões que aparecem em múltiplos meses
    const padroesAgregados: Record<string, number> = {};
    const comportamentaisAgregados: Record<string, number> = {};

    analises.forEach((analise: any) => {
        (analise.padroes_tecnicos || []).forEach((p: any) => {
            padroesAgregados[p.padrao] = (padroesAgregados[p.padrao] || 0) + 1;
        });
        (analise.padroes_comportamentais || []).forEach((p: any) => {
            comportamentaisAgregados[p.padrao] = (comportamentaisAgregados[p.padrao] || 0) + 1;
        });
    });

    // Filtrar padrões que aparecem em 2+ meses
    const tecnicosRecorrentes = Object.entries(padroesAgregados)
        .filter(([_, freq]) => freq >= 2)
        .map(([padrao, freq]) => ({ padrao, frequencia: freq }));

    const comportamentaisRecorrentes = Object.entries(comportamentaisAgregados)
        .filter(([_, freq]) => freq >= 2)
        .map(([padrao, freq]) => ({ padrao, frequencia: freq }));

    // Gerar tendências
    const tendencias: string[] = [];
    if (analises[0].taxa_reprovacao > analises[analises.length - 1].taxa_reprovacao) {
        tendencias.push('Taxa de reprovação aumentando');
    } else {
        tendencias.push('Taxa de reprovação diminuindo');
    }

    if (analises[0].taxa_acuracia && analises[0].taxa_acuracia > 70) {
        tendencias.push('IA está aprendendo e melhorando');
    }

    return {
        padroes_tecnicos_recorrentes: tecnicosRecorrentes,
        padroes_comportamentais_recorrentes: comportamentaisRecorrentes,
        tendencias
    };
}

/**
 * Gera relatório de aprendizado
 */
export async function gerarRelatorioAprendizado(periodo: string): Promise<any> {
    const analise = await buscarAnalisePeriodo(periodo);
    if (!analise) throw new Error('Análise não encontrada para o período');

    const padroesRecorrentes = await identificarPadroesRecorrentes();

    return {
        periodo: analise.periodo,
        resumo: {
            total_candidaturas: analise.total_candidaturas,
            total_reprovacoes: analise.total_reprovacoes,
            taxa_reprovacao: analise.taxa_reprovacao,
            taxa_acuracia_ia: analise.taxa_acuracia
        },
        padroes: {
            tecnicos: analise.padroes_tecnicos,
            comportamentais: analise.padroes_comportamentais,
            culturais: analise.padroes_culturais
        },
        questoes: {
            eficazes: analise.questoes_eficazes,
            ineficazes: analise.questoes_ineficazes,
            novas_sugeridas: analise.questoes_novas_sugeridas
        },
        recomendacoes: analise.recomendacoes_melhoria,
        insights: analise.insights,
        padroes_recorrentes: padroesRecorrentes
    };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function obterPeriodoAnterior(): string {
    const hoje = new Date();
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ano = mesAnterior.getFullYear();
    const mes = String(mesAnterior.getMonth() + 1).padStart(2, '0');
    return `${ano}-${mes}`;
}

function obterProximoPeriodo(periodo: string): string {
    const [ano, mes] = periodo.split('-').map(Number);
    const proximoMes = new Date(ano, mes, 1);
    return `${proximoMes.getFullYear()}-${String(proximoMes.getMonth() + 1).padStart(2, '0')}-01`;
}

function criarAnaliseVazia(periodo: string): AnaliseReprovacao {
    return {
        periodo,
        total_candidaturas: 0,
        total_reprovacoes: 0,
        taxa_reprovacao: 0,
        padroes_tecnicos: [],
        padroes_comportamentais: [],
        padroes_culturais: [],
        questoes_eficazes: [],
        questoes_ineficazes: [],
        questoes_novas_sugeridas: [],
        recomendacoes_melhoria: [],
        insights: ['Nenhuma reprovação registrada no período'],
        taxa_acuracia: 0
    };
}
