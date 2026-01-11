/**
 * SERVIÇO: CONFIGURAÇÃO DE PRIORIZAÇÃO E DISTRIBUIÇÃO
 * Gerencia configurações ajustáveis de pesos
 */

import { supabase } from '../config/supabase';

export interface ConfigPriorizacao {
    id?: number;
    nome_config: string;
    peso_urgencia_prazo: number;
    peso_faturamento: number;
    peso_tempo_aberto: number;
    peso_complexidade: number;
    bonus_cliente_vip: number;
    multiplicador_urgencia_baixa: number;
    multiplicador_urgencia_normal: number;
    multiplicador_urgencia_altissima: number;
    faixa_prioridade_alta_min: number;
    faixa_prioridade_media_min: number;
    ativa: boolean;
    atualizado_em?: string;
    atualizado_por?: number;
}

export interface ConfigDistribuicao {
    id?: number;
    nome_config: string;
    peso_fit_stack: number;
    peso_fit_cliente: number;
    peso_disponibilidade: number;
    peso_taxa_sucesso: number;
    capacidade_maxima_default: number;
    carga_ideal_min: number;
    carga_ideal_max: number;
    carga_alta_max: number;
    carga_critica_max: number;
    faixa_excelente_min: number;
    faixa_bom_min: number;
    faixa_regular_min: number;
    ativa: boolean;
    atualizado_em?: string;
    atualizado_por?: number;
}

/**
 * Busca configuração ativa de priorização
 */
export async function buscarConfigPriorizacaoAtiva(): Promise<ConfigPriorizacao | null> {
    try {
        const { data, error } = await supabase
            .from('config_priorizacao')
            .select('*')
            .eq('ativa', true)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao buscar configuração de priorização:', error);
        return null;
    }
}

/**
 * Busca configuração ativa de distribuição
 */
export async function buscarConfigDistribuicaoAtiva(): Promise<ConfigDistribuicao | null> {
    try {
        const { data, error } = await supabase
            .from('config_distribuicao')
            .select('*')
            .eq('ativa', true)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao buscar configuração de distribuição:', error);
        return null;
    }
}

/**
 * Atualiza configuração de priorização
 */
export async function atualizarConfigPriorizacao(
    config: Partial<ConfigPriorizacao>,
    usuarioId: number
): Promise<ConfigPriorizacao | null> {
    try {
        // Validar soma dos pesos = 100
        const somaPesos = 
            (config.peso_urgencia_prazo || 0) +
            (config.peso_faturamento || 0) +
            (config.peso_tempo_aberto || 0) +
            (config.peso_complexidade || 0);

        if (somaPesos !== 100) {
            throw new Error(`Soma dos pesos deve ser 100. Atual: ${somaPesos}`);
        }

        // Buscar configuração atual
        const configAtual = await buscarConfigPriorizacaoAtiva();
        if (!configAtual) {
            throw new Error('Configuração ativa não encontrada');
        }

        // Atualizar
        const { data, error } = await supabase
            .from('config_priorizacao')
            .update({
                ...config,
                atualizado_em: new Date().toISOString(),
                atualizado_por: usuarioId
            })
            .eq('id', configAtual.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao atualizar configuração de priorização:', error);
        throw error;
    }
}

/**
 * Atualiza configuração de distribuição
 */
export async function atualizarConfigDistribuicao(
    config: Partial<ConfigDistribuicao>,
    usuarioId: number
): Promise<ConfigDistribuicao | null> {
    try {
        // Validar soma dos pesos = 100
        const somaPesos = 
            (config.peso_fit_stack || 0) +
            (config.peso_fit_cliente || 0) +
            (config.peso_disponibilidade || 0) +
            (config.peso_taxa_sucesso || 0);

        if (somaPesos !== 100) {
            throw new Error(`Soma dos pesos deve ser 100. Atual: ${somaPesos}`);
        }

        // Buscar configuração atual
        const configAtual = await buscarConfigDistribuicaoAtiva();
        if (!configAtual) {
            throw new Error('Configuração ativa não encontrada');
        }

        // Atualizar
        const { data, error } = await supabase
            .from('config_distribuicao')
            .update({
                ...config,
                atualizado_em: new Date().toISOString(),
                atualizado_por: usuarioId
            })
            .eq('id', configAtual.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao atualizar configuração de distribuição:', error);
        throw error;
    }
}

/**
 * Busca histórico de mudanças de configuração de priorização
 */
export async function buscarHistoricoConfigPriorizacao(limit: number = 50) {
    try {
        const { data, error } = await supabase
            .from('historico_config_priorizacao')
            .select(`
                *,
                app_users!alterado_por(nome_usuario)
            `)
            .order('alterado_em', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
    }
}

/**
 * Busca histórico de mudanças de configuração de distribuição
 */
export async function buscarHistoricoConfigDistribuicao(limit: number = 50) {
    try {
        const { data, error } = await supabase
            .from('historico_config_distribuicao')
            .select(`
                *,
                app_users!alterado_por(nome_usuario)
            `)
            .order('alterado_em', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
    }
}

/**
 * Valida configuração de priorização
 */
export function validarConfigPriorizacao(config: Partial<ConfigPriorizacao>): {
    valido: boolean;
    erros: string[];
} {
    const erros: string[] = [];

    // Validar pesos
    if (config.peso_urgencia_prazo !== undefined) {
        if (config.peso_urgencia_prazo < 0 || config.peso_urgencia_prazo > 100) {
            erros.push('Peso de urgência deve estar entre 0 e 100');
        }
    }

    if (config.peso_faturamento !== undefined) {
        if (config.peso_faturamento < 0 || config.peso_faturamento > 100) {
            erros.push('Peso de faturamento deve estar entre 0 e 100');
        }
    }

    if (config.peso_tempo_aberto !== undefined) {
        if (config.peso_tempo_aberto < 0 || config.peso_tempo_aberto > 100) {
            erros.push('Peso de tempo aberto deve estar entre 0 e 100');
        }
    }

    if (config.peso_complexidade !== undefined) {
        if (config.peso_complexidade < 0 || config.peso_complexidade > 100) {
            erros.push('Peso de complexidade deve estar entre 0 e 100');
        }
    }

    // Validar soma dos pesos
    const somaPesos = 
        (config.peso_urgencia_prazo || 0) +
        (config.peso_faturamento || 0) +
        (config.peso_tempo_aberto || 0) +
        (config.peso_complexidade || 0);

    if (somaPesos !== 100 && somaPesos !== 0) {
        erros.push(`Soma dos pesos deve ser 100. Atual: ${somaPesos}`);
    }

    // Validar bônus VIP
    if (config.bonus_cliente_vip !== undefined) {
        if (config.bonus_cliente_vip < 0 || config.bonus_cliente_vip > 50) {
            erros.push('Bônus VIP deve estar entre 0 e 50');
        }
    }

    // Validar multiplicadores
    if (config.multiplicador_urgencia_baixa !== undefined) {
        if (config.multiplicador_urgencia_baixa <= 0) {
            erros.push('Multiplicador de urgência baixa deve ser maior que 0');
        }
    }

    return {
        valido: erros.length === 0,
        erros
    };
}

/**
 * Valida configuração de distribuição
 */
export function validarConfigDistribuicao(config: Partial<ConfigDistribuicao>): {
    valido: boolean;
    erros: string[];
} {
    const erros: string[] = [];

    // Validar pesos
    if (config.peso_fit_stack !== undefined) {
        if (config.peso_fit_stack < 0 || config.peso_fit_stack > 100) {
            erros.push('Peso de fit de stack deve estar entre 0 e 100');
        }
    }

    if (config.peso_fit_cliente !== undefined) {
        if (config.peso_fit_cliente < 0 || config.peso_fit_cliente > 100) {
            erros.push('Peso de fit com cliente deve estar entre 0 e 100');
        }
    }

    if (config.peso_disponibilidade !== undefined) {
        if (config.peso_disponibilidade < 0 || config.peso_disponibilidade > 100) {
            erros.push('Peso de disponibilidade deve estar entre 0 e 100');
        }
    }

    if (config.peso_taxa_sucesso !== undefined) {
        if (config.peso_taxa_sucesso < 0 || config.peso_taxa_sucesso > 100) {
            erros.push('Peso de taxa de sucesso deve estar entre 0 e 100');
        }
    }

    // Validar soma dos pesos
    const somaPesos = 
        (config.peso_fit_stack || 0) +
        (config.peso_fit_cliente || 0) +
        (config.peso_disponibilidade || 0) +
        (config.peso_taxa_sucesso || 0);

    if (somaPesos !== 100 && somaPesos !== 0) {
        erros.push(`Soma dos pesos deve ser 100. Atual: ${somaPesos}`);
    }

    // Validar capacidade máxima
    if (config.capacidade_maxima_default !== undefined) {
        if (config.capacidade_maxima_default < 1) {
            erros.push('Capacidade máxima deve ser no mínimo 1');
        }
    }

    return {
        valido: erros.length === 0,
        erros
    };
}

// ============================================
// 🆕 v56.0: CONFIGURAÇÃO DE EXCLUSIVIDADE
// ============================================

export interface ConfigExclusividade {
    id?: number;
    nome_config: string;
    periodo_exclusividade_default: number;  // Default 60
    periodo_renovacao: number;              // Default 30
    max_renovacoes: number;                 // Default 2
    dias_aviso_vencimento: number;          // Default 15
    dias_aviso_urgente: number;             // Default 5
    permitir_auto_renovacao: boolean;
    ativa: boolean;
    atualizado_em?: string;
    atualizado_por?: number;
}

/**
 * Busca configuração ativa de exclusividade
 */
export async function buscarConfigExclusividadeAtiva(): Promise<ConfigExclusividade | null> {
    try {
        const { data, error } = await supabase
            .from('config_exclusividade')
            .select('*')
            .eq('ativa', true)
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao buscar configuração de exclusividade:', error);
        return null;
    }
}

/**
 * Atualiza configuração de exclusividade
 */
export async function atualizarConfigExclusividade(
    config: Partial<ConfigExclusividade>,
    usuarioId: number
): Promise<ConfigExclusividade | null> {
    try {
        // Validações
        const validacao = validarConfigExclusividade(config);
        if (!validacao.valido) {
            throw new Error(validacao.erros.join(', '));
        }

        // Buscar configuração atual
        const configAtual = await buscarConfigExclusividadeAtiva();
        if (!configAtual) {
            throw new Error('Configuração ativa não encontrada');
        }

        // Atualizar
        const { data, error } = await supabase
            .from('config_exclusividade')
            .update({
                ...config,
                atualizado_em: new Date().toISOString(),
                atualizado_por: usuarioId
            })
            .eq('id', configAtual.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao atualizar configuração de exclusividade:', error);
        throw error;
    }
}

/**
 * Valida configuração de exclusividade
 */
export function validarConfigExclusividade(config: Partial<ConfigExclusividade>): {
    valido: boolean;
    erros: string[];
} {
    const erros: string[] = [];

    // Validar período de exclusividade (30-90 dias)
    if (config.periodo_exclusividade_default !== undefined) {
        if (config.periodo_exclusividade_default < 30 || config.periodo_exclusividade_default > 90) {
            erros.push('Período de exclusividade deve ser entre 30 e 90 dias');
        }
    }

    // Validar período de renovação (15-60 dias)
    if (config.periodo_renovacao !== undefined) {
        if (config.periodo_renovacao < 15 || config.periodo_renovacao > 60) {
            erros.push('Período de renovação deve ser entre 15 e 60 dias');
        }
    }

    // Validar máximo de renovações (1-3)
    if (config.max_renovacoes !== undefined) {
        if (config.max_renovacoes < 1 || config.max_renovacoes > 3) {
            erros.push('Máximo de renovações deve ser entre 1 e 3');
        }
    }

    // Validar dias de aviso (5-30 dias)
    if (config.dias_aviso_vencimento !== undefined) {
        if (config.dias_aviso_vencimento < 5 || config.dias_aviso_vencimento > 30) {
            erros.push('Dias de aviso de vencimento deve ser entre 5 e 30');
        }
    }

    // Validar dias de aviso urgente (1-15 dias)
    if (config.dias_aviso_urgente !== undefined) {
        if (config.dias_aviso_urgente < 1 || config.dias_aviso_urgente > 15) {
            erros.push('Dias de aviso urgente deve ser entre 1 e 15');
        }
    }

    // Validar coerência entre avisos
    if (config.dias_aviso_vencimento !== undefined && config.dias_aviso_urgente !== undefined) {
        if (config.dias_aviso_urgente >= config.dias_aviso_vencimento) {
            erros.push('Dias de aviso urgente deve ser menor que dias de aviso de vencimento');
        }
    }

    return {
        valido: erros.length === 0,
        erros
    };
}
