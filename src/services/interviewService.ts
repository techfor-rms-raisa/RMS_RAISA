/**
 * Interview Service - CRUD e operações com entrevistas
 * Integração com Supabase para gerenciamento de entrevistas
 */

import { supabase } from './supabaseClient';

// ============================================
// INTERFACES
// ============================================

export interface Entrevista {
    id?: number;
    candidatura_id: number;
    vaga_id: number;
    analista_id: number;
    
    // Informações da Entrevista
    data_entrevista: string;
    tipo_entrevista: 'comportamental' | 'tecnica' | 'cliente' | 'mista';
    plataforma: 'Teams' | 'Zoom' | 'Meet' | 'Presencial' | 'Outra';
    duracao_minutos?: number;
    participantes?: string[];
    
    // Arquivos de Mídia
    media_url?: string;
    media_filename?: string;
    media_size_mb?: number;
    media_duration_seconds?: number;
    
    // Transcrição
    transcricao_texto?: string;
    transcricao_fonte?: 'manual' | 'teams' | 'google_stt' | 'outro';
    transcricao_url?: string;
    
    // Sumarização IA
    sumario_ia?: InterviewSummary;
    sumario_narrativo?: string;
    pontos_fortes?: string[];
    areas_desenvolvimento?: string[];
    fit_cultural_score?: number;
    citacoes_chave?: Array<{ quote: string; speaker: string }>;
    recomendacao_proxima_etapa?: string;
    
    // Metadados
    status?: 'agendada' | 'realizada' | 'transcrita' | 'sumarizada' | 'erro' | 'cancelada';
    sumarizado_em?: string;
    observacoes_analista?: string;
    
    // Auditoria
    criado_em?: string;
    criado_por?: number;
    atualizado_em?: string;
    atualizado_por?: number;
    ativo?: boolean;
}

export interface InterviewSummary {
    narrativeSummary: string;
    strengths: string[];
    areasForDevelopment: string[];
    culturalFitScore: 1 | 2 | 3 | 4 | 5;
    keyQuotes: Array<{ quote: string; speaker: 'Analista' | 'Candidato' }>;
    nextStepRecommendation: 'Avançar para a próxima fase' | 'Rejeitar' | 'Reentrevista' | 'Aguardando Cliente';
}

export interface EntrevistaCompleta extends Entrevista {
    candidato_nome?: string;
    candidato_email?: string;
    candidatura_status?: string;
    vaga_titulo?: string;
    vaga_senioridade?: string;
    cliente_id?: number;
    cliente_nome?: string;
    analista_nome?: string;
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Criar nova entrevista
 */
export async function criarEntrevista(entrevista: Entrevista): Promise<Entrevista | null> {
    try {
        const { data, error } = await supabase
            .from('entrevistas')
            .insert([entrevista])
            .select()
            .single();

        if (error) {
            console.error('Erro ao criar entrevista:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Erro ao criar entrevista:', error);
        return null;
    }
}

/**
 * Buscar entrevista por ID
 */
export async function buscarEntrevistaPorId(id: number): Promise<Entrevista | null> {
    try {
        const { data, error } = await supabase
            .from('entrevistas')
            .select('*')
            .eq('id', id)
            .eq('ativo', true)
            .single();

        if (error) {
            console.error('Erro ao buscar entrevista:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Erro ao buscar entrevista:', error);
        return null;
    }
}

/**
 * Buscar entrevistas por candidatura
 */
export async function buscarEntrevistasPorCandidatura(candidatura_id: number): Promise<Entrevista[]> {
    try {
        const { data, error } = await supabase
            .from('entrevistas')
            .select('*')
            .eq('candidatura_id', candidatura_id)
            .eq('ativo', true)
            .order('data_entrevista', { ascending: false });

        if (error) {
            console.error('Erro ao buscar entrevistas:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Erro ao buscar entrevistas:', error);
        return [];
    }
}

/**
 * Buscar entrevistas completas (com joins)
 */
export async function buscarEntrevistasCompletas(filtros?: {
    analista_id?: number;
    vaga_id?: number;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
}): Promise<EntrevistaCompleta[]> {
    try {
        let query = supabase
            .from('vw_entrevistas_completas')
            .select('*');

        if (filtros?.analista_id) {
            query = query.eq('analista_id', filtros.analista_id);
        }
        if (filtros?.vaga_id) {
            query = query.eq('vaga_id', filtros.vaga_id);
        }
        if (filtros?.status) {
            query = query.eq('status', filtros.status);
        }
        if (filtros?.data_inicio) {
            query = query.gte('data_entrevista', filtros.data_inicio);
        }
        if (filtros?.data_fim) {
            query = query.lte('data_entrevista', filtros.data_fim);
        }

        query = query.order('data_entrevista', { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error('Erro ao buscar entrevistas completas:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Erro ao buscar entrevistas completas:', error);
        return [];
    }
}

/**
 * Atualizar entrevista
 */
export async function atualizarEntrevista(id: number, updates: Partial<Entrevista>): Promise<Entrevista | null> {
    try {
        const { data, error } = await supabase
            .from('entrevistas')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Erro ao atualizar entrevista:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Erro ao atualizar entrevista:', error);
        return null;
    }
}

/**
 * Atualizar transcrição
 */
export async function atualizarTranscricao(
    id: number,
    transcricao_texto: string,
    transcricao_fonte: string = 'manual'
): Promise<Entrevista | null> {
    try {
        const { data, error } = await supabase
            .from('entrevistas')
            .update({
                transcricao_texto,
                transcricao_fonte,
                status: 'transcrita'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Erro ao atualizar transcrição:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Erro ao atualizar transcrição:', error);
        return null;
    }
}

/**
 * Atualizar sumário IA
 */
export async function atualizarSumarioIA(
    id: number,
    sumario_ia: InterviewSummary
): Promise<Entrevista | null> {
    try {
        const { data, error } = await supabase
            .from('entrevistas')
            .update({
                sumario_ia,
                status: 'sumarizada'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Erro ao atualizar sumário IA:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Erro ao atualizar sumário IA:', error);
        return null;
    }
}

/**
 * Deletar entrevista (soft delete)
 */
export async function deletarEntrevista(id: number): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('entrevistas')
            .update({ ativo: false })
            .eq('id', id);

        if (error) {
            console.error('Erro ao deletar entrevista:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Erro ao deletar entrevista:', error);
        return false;
    }
}

/**
 * Buscar entrevistas pendentes de sumarização
 */
export async function buscarEntrevistasPendentesSumario(): Promise<EntrevistaCompleta[]> {
    try {
        const { data, error } = await supabase
            .from('vw_entrevistas_pendentes_sumario')
            .select('*')
            .order('dias_desde_entrevista', { ascending: false });

        if (error) {
            console.error('Erro ao buscar entrevistas pendentes:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Erro ao buscar entrevistas pendentes:', error);
        return [];
    }
}

/**
 * Buscar estatísticas de entrevistas por analista
 */
export async function buscarEstatisticasAnalista(analista_id?: number): Promise<any[]> {
    try {
        let query = supabase
            .from('vw_entrevistas_stats_analista')
            .select('*');

        if (analista_id) {
            query = query.eq('analista_id', analista_id);
        }

        query = query.order('total_entrevistas', { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        return [];
    }
}

/**
 * Upload de arquivo de mídia para Supabase Storage
 */
export async function uploadMediaFile(
    file: File,
    candidatura_id: number
): Promise<{ url: string; filename: string; size_mb: number } | null> {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `entrevista_${candidatura_id}_${Date.now()}.${fileExt}`;
        const filePath = `entrevistas/${fileName}`;

        const { data, error } = await supabase.storage
            .from('media')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Erro ao fazer upload:', error);
            return null;
        }

        const { data: publicUrlData } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);

        return {
            url: publicUrlData.publicUrl,
            filename: fileName,
            size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2))
        };
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        return null;
    }
}
