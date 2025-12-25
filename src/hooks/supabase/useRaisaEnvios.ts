/**
 * useRaisaEnvios.ts - Hook para Controle de Envios RAISA
 * 
 * Gerencia:
 * - candidatura_envios: Envio de CVs para clientes
 * - candidatura_aprovacoes: Decisões dos clientes
 * 
 * Versão: 1.0
 * Data: 25/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../Lib/supabase';

// Tipos específicos para o banco de dados
export interface CandidaturaEnvioDB {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  analista_id: number;
  cliente_id: number;
  enviado_em: string;
  enviado_por: number;
  meio_envio: 'email' | 'portal_cliente' | 'whatsapp' | 'outro';
  destinatario_email: string;
  destinatario_nome: string;
  cv_anexado_url?: string;
  cv_versao: 'original' | 'padronizado';
  observacoes?: string;
  status: 'enviado' | 'visualizado' | 'em_analise';
  visualizado_em?: string;
  ativo: boolean;
  created_at?: string;
}

export interface CandidaturaAprovacaoDB {
  id: number;
  candidatura_id: number;
  candidatura_envio_id: number;
  vaga_id: number;
  cliente_id: number;
  analista_id: number;
  decisao: 'aprovado' | 'reprovado' | 'em_analise' | 'aguardando_resposta';
  decidido_em?: string;
  decidido_por?: string;
  motivo_reprovacao?: string;
  categoria_reprovacao?: 'tecnico' | 'comportamental' | 'salario' | 'disponibilidade' | 'outro';
  feedback_cliente?: string;
  prazo_resposta_dias: number;
  respondido_no_prazo?: boolean;
  dias_para_resposta?: number;
  registrado_em: string;
  ativo: boolean;
}

// Tipo enriquecido para exibição
export interface EnvioEnriquecido extends CandidaturaEnvioDB {
  candidato_nome?: string;
  candidato_email?: string;
  vaga_titulo?: string;
  cliente_nome?: string;
  aprovacao?: CandidaturaAprovacaoDB;
}

// Métricas do dashboard
export interface MetricasEnvios {
  total_envios: number;
  total_visualizados: number;
  total_aprovados: number;
  total_reprovados: number;
  total_aguardando: number;
  taxa_aprovacao: number;
  taxa_visualizacao: number;
  tempo_medio_resposta_dias: number;
}

export const useRaisaEnvios = () => {
  const [envios, setEnvios] = useState<EnvioEnriquecido[]>([]);
  const [aprovacoes, setAprovacoes] = useState<CandidaturaAprovacaoDB[]>([]);
  const [metricas, setMetricas] = useState<MetricasEnvios>({
    total_envios: 0,
    total_visualizados: 0,
    total_aprovados: 0,
    total_reprovados: 0,
    total_aguardando: 0,
    taxa_aprovacao: 0,
    taxa_visualizacao: 0,
    tempo_medio_resposta_dias: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARREGAR ENVIOS
  // ============================================

  /**
   * Carrega todos os envios com dados relacionados
   */
  const loadEnvios = useCallback(async (filtros?: {
    analista_id?: number;
    cliente_id?: number;
    vaga_id?: number;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<EnvioEnriquecido[]> => {
    try {
      setLoading(true);
      console.log('📤 Carregando envios do Supabase...');

      // Query base
      let query = supabase
        .from('candidatura_envios')
        .select(`
          *,
          candidaturas!candidatura_id (
            candidato_nome,
            candidato_email
          ),
          vagas!vaga_id (
            titulo
          ),
          clients!cliente_id (
            razao_social_cliente
          )
        `)
        .eq('ativo', true)
        .order('enviado_em', { ascending: false });

      // Aplicar filtros
      if (filtros?.analista_id) {
        query = query.eq('analista_id', filtros.analista_id);
      }
      if (filtros?.cliente_id) {
        query = query.eq('cliente_id', filtros.cliente_id);
      }
      if (filtros?.vaga_id) {
        query = query.eq('vaga_id', filtros.vaga_id);
      }
      if (filtros?.status) {
        query = query.eq('status', filtros.status);
      }
      if (filtros?.data_inicio) {
        query = query.gte('enviado_em', filtros.data_inicio);
      }
      if (filtros?.data_fim) {
        query = query.lte('enviado_em', filtros.data_fim);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Enriquecer dados
      const enviosEnriquecidos: EnvioEnriquecido[] = (data || []).map((e: any) => ({
        ...e,
        candidato_nome: e.candidaturas?.candidato_nome || 'N/A',
        candidato_email: e.candidaturas?.candidato_email || '',
        vaga_titulo: e.vagas?.titulo || 'N/A',
        cliente_nome: e.clients?.razao_social_cliente || 'N/A'
      }));

      setEnvios(enviosEnriquecidos);
      console.log(`✅ ${enviosEnriquecidos.length} envios carregados`);

      // Calcular métricas
      await calcularMetricas(enviosEnriquecidos);

      return enviosEnriquecidos;
    } catch (err: any) {
      console.error('❌ Erro ao carregar envios:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Carrega aprovações relacionadas aos envios
   */
  const loadAprovacoes = useCallback(async (): Promise<CandidaturaAprovacaoDB[]> => {
    try {
      const { data, error } = await supabase
        .from('candidatura_aprovacoes')
        .select('*')
        .eq('ativo', true)
        .order('registrado_em', { ascending: false });

      if (error) throw error;

      setAprovacoes(data || []);
      return data || [];
    } catch (err: any) {
      console.error('❌ Erro ao carregar aprovações:', err);
      return [];
    }
  }, []);

  // ============================================
  // REGISTRAR ENVIO
  // ============================================

  /**
   * Registra novo envio de CV para cliente
   */
  const registrarEnvio = useCallback(async (dados: {
    candidatura_id: number;
    vaga_id: number;
    analista_id: number;
    cliente_id: number;
    enviado_por: number;
    meio_envio: 'email' | 'portal_cliente' | 'whatsapp' | 'outro';
    destinatario_email: string;
    destinatario_nome: string;
    cv_anexado_url?: string;
    cv_versao?: 'original' | 'padronizado';
    observacoes?: string;
  }): Promise<CandidaturaEnvioDB | null> => {
    try {
      setLoading(true);
      console.log('📤 Registrando envio...');

      const envioData = {
        ...dados,
        cv_versao: dados.cv_versao || 'original',
        enviado_em: new Date().toISOString(),
        status: 'enviado',
        ativo: true
      };

      const { data, error } = await supabase
        .from('candidatura_envios')
        .insert(envioData)
        .select()
        .single();

      if (error) throw error;

      // Atualizar status da candidatura
      await supabase
        .from('candidaturas')
        .update({ 
          status: 'enviado_cliente',
          enviado_ao_cliente: true,
          data_envio_cliente: new Date().toISOString()
        })
        .eq('id', dados.candidatura_id);

      console.log(`✅ Envio registrado: ID ${data.id}`);
      
      // Recarregar lista
      await loadEnvios();
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao registrar envio:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadEnvios]);

  // ============================================
  // REGISTRAR APROVAÇÃO/REPROVAÇÃO
  // ============================================

  /**
   * Registra decisão do cliente (aprovação/reprovação)
   */
  const registrarAprovacao = useCallback(async (dados: {
    candidatura_id: number;
    candidatura_envio_id: number;
    vaga_id: number;
    cliente_id: number;
    analista_id: number;
    decisao: 'aprovado' | 'reprovado' | 'em_analise';
    decidido_por?: string;
    motivo_reprovacao?: string;
    categoria_reprovacao?: 'tecnico' | 'comportamental' | 'salario' | 'disponibilidade' | 'outro';
    feedback_cliente?: string;
    prazo_resposta_dias?: number;
  }): Promise<CandidaturaAprovacaoDB | null> => {
    try {
      setLoading(true);
      console.log(`📋 Registrando decisão: ${dados.decisao}...`);

      // Buscar data do envio para calcular dias de resposta
      const { data: envioData } = await supabase
        .from('candidatura_envios')
        .select('enviado_em')
        .eq('id', dados.candidatura_envio_id)
        .single();

      const diasParaResposta = envioData 
        ? Math.ceil((new Date().getTime() - new Date(envioData.enviado_em).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const prazoResposta = dados.prazo_resposta_dias || 5;
      const respondidoNoPrazo = diasParaResposta <= prazoResposta;

      const aprovacaoData = {
        candidatura_id: dados.candidatura_id,
        candidatura_envio_id: dados.candidatura_envio_id,
        vaga_id: dados.vaga_id,
        cliente_id: dados.cliente_id,
        analista_id: dados.analista_id,
        decisao: dados.decisao,
        decidido_em: new Date().toISOString(),
        decidido_por: dados.decidido_por,
        motivo_reprovacao: dados.motivo_reprovacao,
        categoria_reprovacao: dados.categoria_reprovacao,
        feedback_cliente: dados.feedback_cliente,
        prazo_resposta_dias: prazoResposta,
        respondido_no_prazo: respondidoNoPrazo,
        dias_para_resposta: diasParaResposta,
        registrado_em: new Date().toISOString(),
        ativo: true
      };

      const { data, error } = await supabase
        .from('candidatura_aprovacoes')
        .insert(aprovacaoData)
        .select()
        .single();

      if (error) throw error;

      // Atualizar status da candidatura
      let novoStatus = 'aguardando_cliente';
      if (dados.decisao === 'aprovado') novoStatus = 'aprovado_cliente';
      if (dados.decisao === 'reprovado') novoStatus = 'reprovado_cliente';

      await supabase
        .from('candidaturas')
        .update({ 
          status: novoStatus,
          feedback_cliente: dados.feedback_cliente,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', dados.candidatura_id);

      // Atualizar status do envio
      await supabase
        .from('candidatura_envios')
        .update({ status: 'em_analise' })
        .eq('id', dados.candidatura_envio_id);

      console.log(`✅ Aprovação registrada: ${dados.decisao}`);
      
      // Recarregar dados
      await loadEnvios();
      await loadAprovacoes();
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao registrar aprovação:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadEnvios, loadAprovacoes]);

  // ============================================
  // ATUALIZAR STATUS DE VISUALIZAÇÃO
  // ============================================

  /**
   * Marca envio como visualizado
   */
  const marcarComoVisualizado = useCallback(async (envioId: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('candidatura_envios')
        .update({ 
          status: 'visualizado',
          visualizado_em: new Date().toISOString()
        })
        .eq('id', envioId);

      if (error) throw error;

      // Atualizar estado local
      setEnvios(prev => prev.map(e => 
        e.id === envioId 
          ? { ...e, status: 'visualizado' as const, visualizado_em: new Date().toISOString() }
          : e
      ));

      return true;
    } catch (err: any) {
      console.error('❌ Erro ao marcar como visualizado:', err);
      return false;
    }
  }, []);

  // ============================================
  // MÉTRICAS E DASHBOARDS
  // ============================================

  /**
   * Calcula métricas de envios
   */
  const calcularMetricas = useCallback(async (enviosData?: EnvioEnriquecido[]) => {
    try {
      const enviosParaCalculo = enviosData || envios;
      
      // Buscar aprovações
      const { data: aprovacoesData } = await supabase
        .from('candidatura_aprovacoes')
        .select('*')
        .eq('ativo', true);

      const aprovacoesList = aprovacoesData || [];

      const total = enviosParaCalculo.length;
      const visualizados = enviosParaCalculo.filter(e => e.status === 'visualizado' || e.status === 'em_analise').length;
      const aprovados = aprovacoesList.filter(a => a.decisao === 'aprovado').length;
      const reprovados = aprovacoesList.filter(a => a.decisao === 'reprovado').length;
      const aguardando = aprovacoesList.filter(a => a.decisao === 'em_analise' || a.decisao === 'aguardando_resposta').length;

      // Calcular tempo médio de resposta
      const temposResposta = aprovacoesList
        .filter(a => a.dias_para_resposta !== null)
        .map(a => a.dias_para_resposta || 0);
      
      const tempoMedio = temposResposta.length > 0
        ? temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length
        : 0;

      const novasMetricas: MetricasEnvios = {
        total_envios: total,
        total_visualizados: visualizados,
        total_aprovados: aprovados,
        total_reprovados: reprovados,
        total_aguardando: aguardando,
        taxa_aprovacao: total > 0 ? Math.round((aprovados / total) * 100) : 0,
        taxa_visualizacao: total > 0 ? Math.round((visualizados / total) * 100) : 0,
        tempo_medio_resposta_dias: Math.round(tempoMedio * 10) / 10
      };

      setMetricas(novasMetricas);
      return novasMetricas;
    } catch (err) {
      console.error('❌ Erro ao calcular métricas:', err);
      return metricas;
    }
  }, [envios, metricas]);

  /**
   * Busca métricas por período
   */
  const getMetricasPorPeriodo = useCallback(async (dataInicio: string, dataFim: string): Promise<MetricasEnvios> => {
    const enviosFiltrados = await loadEnvios({ data_inicio: dataInicio, data_fim: dataFim });
    return calcularMetricas(enviosFiltrados);
  }, [loadEnvios, calcularMetricas]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    envios,
    aprovacoes,
    metricas,
    loading,
    error,

    // Carregar dados
    loadEnvios,
    loadAprovacoes,

    // Operações
    registrarEnvio,
    registrarAprovacao,
    marcarComoVisualizado,

    // Métricas
    calcularMetricas,
    getMetricasPorPeriodo
  };
};
