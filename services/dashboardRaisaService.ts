/**
 * Service para buscar dados dos Dashboards RAISA
 * Integra com as views do Supabase para métricas de recrutamento
 */

import { supabase } from './supabaseClient';

// ============================================
// INTERFACES TYPESCRIPT
// ============================================

export interface DadosFunilConversao {
  periodo: string;
  periodo_formatado: string;
  vagas_abertas: number;
  cvs_enviados: number;
  aprovacoes: number;
  taxa_conversao: number;
}

export interface DadosAprovacaoReprovacao {
  periodo: string;
  periodo_formatado: string;
  total_respostas: number;
  aprovacoes: number;
  reprovacoes: number;
  taxa_aprovacao: number;
  taxa_reprovacao: number;
}

export interface DadosPerformanceAnalista {
  analista_id: number;
  analista_nome: string;
  total_envios: number;
  total_aprovacoes: number;
  total_reprovacoes: number;
  taxa_aprovacao: number;
  tempo_medio_resposta: number;
}

export interface DadosKPIPrincipais {
  total_vagas_abertas: number;
  total_cvs_enviados: number;
  total_aprovacoes: number;
  total_reprovacoes: number;
  taxa_conversao_geral: number;
  taxa_aprovacao_geral: number;
  tempo_medio_resposta_dias: number;
  percentual_no_prazo: number;
}

export interface DadosTopClientes {
  cliente_id: number;
  cliente_nome: string;
  total_vagas: number;
  total_envios: number;
  total_aprovacoes: number;
  taxa_aprovacao: number;
}

export interface DadosTopAnalistas {
  analista_id: number;
  analista_nome: string;
  total_envios: number;
  total_aprovacoes: number;
  taxa_aprovacao: number;
  ranking: number;
}

export interface DadosMotivosReprovacao {
  motivo: string;
  quantidade: number;
  percentual: number;
}

export interface DadosPerformanceCliente {
  cliente_id: number;
  cliente_nome: string;
  total_vagas: number;
  total_envios: number;
  total_aprovacoes: number;
  total_reprovacoes: number;
  taxa_aprovacao: number;
  tempo_medio_resposta: number;
}

export interface DadosAnaliseTempo {
  periodo: string;
  periodo_formatado: string;
  tempo_medio_resposta_dias: number;
  tempo_minimo_dias: number;
  tempo_maximo_dias: number;
  percentual_no_prazo: number;
  total_respostas: number;
}

// ============================================
// FUNÇÕES DE BUSCA DE DADOS
// ============================================

/**
 * Busca dados do funil de conversão
 */
export async function buscarFunilConversao(): Promise<DadosFunilConversao[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_funil_conversao')
      .select('*')
      .order('periodo', { ascending: false })
      .limit(12);

    if (error) {
      console.error('Erro ao buscar funil de conversão:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar funil de conversão:', error);
    return [];
  }
}

/**
 * Busca dados de aprovação vs reprovação
 */
export async function buscarAprovacaoReprovacao(): Promise<DadosAprovacaoReprovacao[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_aprovacao_reprovacao')
      .select('*')
      .order('periodo', { ascending: false })
      .limit(12);

    if (error) {
      console.error('Erro ao buscar aprovação/reprovação:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar aprovação/reprovação:', error);
    return [];
  }
}

/**
 * Busca dados de performance por analista
 */
export async function buscarPerformanceAnalista(): Promise<DadosPerformanceAnalista[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_performance_analista')
      .select('*')
      .order('taxa_aprovacao', { ascending: false });

    if (error) {
      console.error('Erro ao buscar performance de analistas:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar performance de analistas:', error);
    return [];
  }
}

/**
 * Busca KPIs principais
 */
export async function buscarKPIsPrincipais(): Promise<DadosKPIPrincipais | null> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_kpis_principais')
      .select('*')
      .single();

    if (error) {
      console.error('Erro ao buscar KPIs principais:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Erro ao buscar KPIs principais:', error);
    return null;
  }
}

/**
 * Busca top 5 clientes
 */
export async function buscarTopClientes(): Promise<DadosTopClientes[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_top_clientes')
      .select('*')
      .order('total_aprovacoes', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Erro ao buscar top clientes:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar top clientes:', error);
    return [];
  }
}

/**
 * Busca top 5 analistas
 */
export async function buscarTopAnalistas(): Promise<DadosTopAnalistas[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_top_analistas')
      .select('*')
      .order('ranking', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Erro ao buscar top analistas:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar top analistas:', error);
    return [];
  }
}

/**
 * Busca motivos de reprovação
 */
export async function buscarMotivosReprovacao(): Promise<DadosMotivosReprovacao[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_motivos_reprovacao')
      .select('*')
      .order('quantidade', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao buscar motivos de reprovação:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar motivos de reprovação:', error);
    return [];
  }
}

/**
 * Busca performance por cliente
 */
export async function buscarPerformanceCliente(): Promise<DadosPerformanceCliente[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_performance_cliente')
      .select('*')
      .order('taxa_aprovacao', { ascending: false });

    if (error) {
      console.error('Erro ao buscar performance de clientes:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar performance de clientes:', error);
    return [];
  }
}

/**
 * Busca dados de análise de tempo
 */
export async function buscarAnaliseTempo(): Promise<DadosAnaliseTempo[]> {
  try {
    const { data, error } = await supabase
      .from('vw_raisa_analise_tempo')
      .select('*')
      .order('periodo', { ascending: false })
      .limit(12);

    if (error) {
      console.error('Erro ao buscar análise de tempo:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro ao buscar análise de tempo:', error);
    return [];
  }
}
