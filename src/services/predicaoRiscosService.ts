/**
 * SERVIÇO: PREDIÇÃO DE RISCOS
 * Prevê risco de reprovação e sugere preparação
 */

import { supabase } from '../config/supabase';
import { predictCandidateRisk } from './geminiService';
import { aiConfig, checkDataSufficiency } from '../config/aiConfig';

export interface PredicaoRisco {
    risco_reprovacao: number;
    nivel_risco: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
    motivos_risco: string[];
    recomendacoes_preparacao: string[];
    deve_enviar: boolean;
}

/**
 * Prevê risco de reprovação de um candidato
 */
export async function preverRiscoCandidato(
    candidaturaId: number
): Promise<PredicaoRisco | null> {
    try {
        // 1. Verificar se funcionalidade está ativa
        if (!aiConfig.ENABLE_AI_RISK_PREDICTION) {
            console.log('[Predição] Predição de riscos desativada por configuração');
            return null;
        }

        // 2. Verificar se há dados suficientes
        const dataCheck = await checkDataSufficiency('ENABLE_AI_RISK_PREDICTION');
        if (!dataCheck.hasEnoughData) {
            console.log(`[Predição] Dados insuficientes: ${dataCheck.message}`);
            return null;
        }

        // 3. Buscar dados da candidatura
        const { data: candidatura, error: errorCand } = await supabase
            .from('candidaturas')
            .select(`
                id,
                vaga_id,
                candidato_id,
                vagas!inner(*),
                candidatos!inner(*)
            `)
            .eq('id', candidaturaId)
            .single();

        if (errorCand) throw errorCand;

        // 2. Buscar recomendação da IA
        const { data: recomendacao } = await supabase
            .from('ia_recomendacoes_candidato')
            .select('*')
            .eq('candidatura_id', candidaturaId)
            .eq('tipo_recomendacao', 'decisao')
            .order('criado_em', { ascending: false })
            .limit(1)
            .single();

        // 3. Buscar vagas similares e seus resultados
        const vagasSimilares = await buscarVagasSimilares(candidatura.vagas);

        // 4. Chamar IA para prever risco
        const predicao = await predictCandidateRisk({
            vaga: candidatura.vagas,
            candidato: candidatura.candidatos,
            recomendacaoIA: recomendacao || {},
            vagasSimilares
        });

        // 5. Salvar predição no banco
        await supabase
            .from('ia_recomendacoes_candidato')
            .insert({
                candidatura_id: candidaturaId,
                vaga_id: candidatura.vaga_id,
                candidato_id: candidatura.candidato_id,
                tipo_recomendacao: 'predicao_risco',
                recomendacao: predicao.deve_enviar ? 'aprovar' : 'rejeitar',
                score_confianca: 100 - predicao.risco_reprovacao,
                justificativa: `Risco de reprovação: ${predicao.risco_reprovacao}% (${predicao.nivel_risco})`,
                analise_detalhada: {
                    risco_reprovacao: predicao.risco_reprovacao,
                    nivel_risco: predicao.nivel_risco,
                    motivos_risco: predicao.motivos_risco,
                    recomendacoes_preparacao: predicao.recomendacoes_preparacao
                }
            });

        console.log(`[Predição] Risco de reprovação: ${predicao.risco_reprovacao}% (${predicao.nivel_risco})`);

        return predicao;

    } catch (error) {
        console.error('[Predição] Erro ao prever risco:', error);
        throw error;
    }
}

/**
 * Busca vagas similares e seus resultados
 */
async function buscarVagasSimilares(vaga: any): Promise<any[]> {
    try {
        // Buscar vagas com stack similar
        const { data: vagasSimilares } = await supabase
            .from('vagas')
            .select(`
                id,
                titulo,
                candidaturas(
                    id,
                    status
                )
            `)
            .eq('nivel_senioridade', vaga.nivel_senioridade)
            .neq('id', vaga.id)
            .limit(10);

        if (!vagasSimilares) return [];

        // Calcular estatísticas de cada vaga
        const resultado = vagasSimilares.map((v: any) => {
            const candidaturas = v.candidaturas || [];
            const enviados = candidaturas.filter((c: any) => 
                ['em_processo', 'aprovado', 'rejeitado'].includes(c.status)
            ).length;
            const aprovados = candidaturas.filter((c: any) => c.status === 'aprovado').length;

            return {
                titulo: v.titulo,
                candidatos_enviados: enviados,
                candidatos_aprovados: aprovados,
                padroes_reprovacao: [] // Será preenchido pela IA
            };
        }).filter(v => v.candidatos_enviados > 0);

        return resultado;

    } catch (error) {
        console.error('[Predição] Erro ao buscar vagas similares:', error);
        return [];
    }
}

/**
 * Gera alertas proativos para analistas
 */
export async function gerarAlertasProativos(): Promise<any[]> {
    try {
        // Buscar candidaturas em processo com alto risco
        const { data: predicoes } = await supabase
            .from('ia_recomendacoes_candidato')
            .select(`
                id,
                candidatura_id,
                analise_detalhada,
                candidaturas!inner(
                    id,
                    status,
                    vagas!inner(titulo),
                    candidatos!inner(nome)
                )
            `)
            .eq('tipo_recomendacao', 'predição_risco')
            .in('candidaturas.status', ['triagem', 'em_analise'])
            .order('criado_em', { ascending: false })
            .limit(50);

        if (!predicoes) return [];

        // Filtrar apenas riscos altos e críticos
        const alertas = predicoes
            .filter((p: any) => {
                const risco = p.analise_detalhada?.risco_reprovacao || 0;
                return risco >= 50; // Alto ou Crítico
            })
            .map((p: any) => ({
                candidatura_id: p.candidatura_id,
                vaga_titulo: p.candidaturas.vagas.titulo,
                candidato_nome: p.candidaturas.candidatos.nome,
                risco_reprovacao: p.analise_detalhada.risco_reprovacao,
                nivel_risco: p.analise_detalhada.nivel_risco,
                motivos: p.analise_detalhada.motivos_risco,
                recomendacoes: p.analise_detalhada.recomendacoes_preparacao
            }));

        return alertas;

    } catch (error) {
        console.error('[Predição] Erro ao gerar alertas:', error);
        return [];
    }
}

/**
 * Sugere preparação específica para candidato
 */
export async function sugerirPreparacaoCandidato(
    candidaturaId: number
): Promise<{
    areas_melhorar: string[];
    recursos_estudo: string[];
    questoes_pratica: string[];
}> {
    try {
        // Buscar predição de risco
        const { data: predicao } = await supabase
            .from('ia_recomendacoes_candidato')
            .select('analise_detalhada')
            .eq('candidatura_id', candidaturaId)
            .eq('tipo_recomendacao', 'predicao_risco')
            .order('criado_em', { ascending: false })
            .limit(1)
            .single();

        if (!predicao || !predicao.analise_detalhada) {
            return {
                areas_melhorar: [],
                recursos_estudo: [],
                questoes_pratica: []
            };
        }

        // Extrair áreas de melhoria dos motivos de risco
        const motivos = predicao.analise_detalhada.motivos_risco || [];
        const areas_melhorar = motivos.map((m: string) => 
            m.replace('Falta de ', '').replace('Conhecimento superficial de ', '')
        );

        // Gerar sugestões de recursos (simplificado)
        const recursos_estudo = areas_melhorar.map((area: string) => 
            `Estudar documentação oficial de ${area}`
        );

        // Buscar questões relacionadas às áreas
        const { data: questoes } = await supabase
            .from('vaga_questoes_recomendadas')
            .select('questao')
            .ilike('subcategoria', `%${areas_melhorar[0]}%`)
            .eq('ativa', true)
            .limit(5);

        const questoes_pratica = (questoes || []).map((q: any) => q.questao);

        return {
            areas_melhorar,
            recursos_estudo,
            questoes_pratica
        };

    } catch (error) {
        console.error('[Predição] Erro ao sugerir preparação:', error);
        return {
            areas_melhorar: [],
            recursos_estudo: [],
            questoes_pratica: []
        };
    }
}

/**
 * Calcula taxa de sucesso de predições (validação do modelo)
 */
export async function calcularTaxaSucessoPredicoes(): Promise<{
    total_predicoes: number;
    predicoes_corretas: number;
    taxa_sucesso: number;
    detalhes: any[];
}> {
    try {
        // Buscar predições com resultado final conhecido
        const { data: predicoes } = await supabase
            .from('ia_recomendacoes_candidato')
            .select(`
                id,
                analise_detalhada,
                candidaturas!inner(status)
            `)
            .eq('tipo_recomendacao', 'predicao_risco')
            .in('candidaturas.status', ['aprovado', 'rejeitado']);

        if (!predicoes || predicoes.length === 0) {
            return {
                total_predicoes: 0,
                predicoes_corretas: 0,
                taxa_sucesso: 0,
                detalhes: []
            };
        }

        // Validar cada predição
        const detalhes = predicoes.map((p: any) => {
            const risco = p.analise_detalhada?.risco_reprovacao || 0;
            const resultado = p.candidaturas.status;
            
            // Predição correta se:
            // - Risco alto (>50%) e foi reprovado
            // - Risco baixo (<=50%) e foi aprovado
            const correta = (risco > 50 && resultado === 'rejeitado') ||
                           (risco <= 50 && resultado === 'aprovado');

            return {
                risco_previsto: risco,
                resultado_real: resultado,
                predicao_correta: correta
            };
        });

        const corretas = detalhes.filter(d => d.predicao_correta).length;
        const taxa = (corretas / predicoes.length) * 100;

        return {
            total_predicoes: predicoes.length,
            predicoes_corretas: corretas,
            taxa_sucesso: taxa,
            detalhes
        };

    } catch (error) {
        console.error('[Predição] Erro ao calcular taxa de sucesso:', error);
        return {
            total_predicoes: 0,
            predicoes_corretas: 0,
            taxa_sucesso: 0,
            detalhes: []
        };
    }
}
