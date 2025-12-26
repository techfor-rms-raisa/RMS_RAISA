/**
 * useRaisaMetrics.ts - Hook para métricas e KPIs do RAISA
 * 
 * Funcionalidades:
 * - Resumo geral (cards)
 * - Vagas na sombra (esquecidas)
 * - Performance por analista
 * - Performance por cliente
 * - Funil de conversão
 * - Evolução mensal
 * - Alertas ativos
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface DashboardResumo {
  vagas_abertas: number;
  vagas_urgentes: number;
  vagas_proximas_prazo: number;
  vagas_fechadas_mes: number;
  vagas_canceladas_mes: number;
  candidaturas_mes: number;
  aprovados_mes: number;
  reprovados_mes: number;
  taxa_aprovacao_mes: number;
  tempo_medio_fechamento_dias: number;
  atualizado_em: string;
}

export interface VagaSombra {
  id: number;
  titulo: string;
  status: string;
  urgente: boolean;
  prazo_fechamento: string | null;
  criado_em: string;
  cliente_id: number;
  nome_cliente: string;
  analista_id: number;
  analista_nome: string;
  dias_sem_movimentacao: number;
  ultima_candidatura: string | null;
  total_candidatos: number;
  enviados_cliente: number;
  motivo_alerta: string;
  nivel_criticidade: 'critico' | 'alto' | 'medio' | 'baixo';
}

export interface PerformanceAnalista {
  analista_id: number;
  analista_nome: string;
  vagas_ativas: number;
  candidaturas_mes: number;
  enviados_cliente_mes: number;
  aprovados_mes: number;
  reprovados_mes: number;
  taxa_aprovacao: number;
  tempo_medio_dias: number;
  vagas_fechadas_mes: number;
}

export interface PerformanceCliente {
  cliente_id: number;
  nome_cliente: string;
  vagas_ativas: number;
  total_vagas: number;
  enviados_mes: number;
  aprovados_mes: number;
  taxa_aprovacao: number;
  tempo_medio_resposta_dias: number;
}

export interface EtapaFunil {
  etapa: string;
  ordem: number;
  quantidade: number;
  percentual: number;
}

export interface EvolucaoMensal {
  mes: string;
  mes_label: string;
  vagas_abertas: number;
  vagas_fechadas: number;
  candidaturas: number;
  aprovacoes: number;
  taxa_aprovacao: number;
}

export interface Alerta {
  tipo_alerta: string;
  severidade: 'critical' | 'warning' | 'info';
  referencia_id: number;
  referencia_tipo: string;
  mensagem: string;
  data_criacao: string;
  analista_id: number;
  analista_nome: string;
}

// ============================================
// HOOK
// ============================================

export function useRaisaMetrics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados dos dados
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [vagasSombra, setVagasSombra] = useState<VagaSombra[]>([]);
  const [performanceAnalistas, setPerformanceAnalistas] = useState<PerformanceAnalista[]>([]);
  const [performanceClientes, setPerformanceClientes] = useState<PerformanceCliente[]>([]);
  const [funil, setFunil] = useState<EtapaFunil[]>([]);
  const [evolucao, setEvolucao] = useState<EvolucaoMensal[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  // ============================================
  // BUSCAR RESUMO GERAL
  // ============================================

  const buscarResumo = useCallback(async (): Promise<DashboardResumo | null> => {
    try {
      const { data, error } = await supabase
        .from('vw_dashboard_resumo')
        .select('*')
        .single();

      if (error) throw error;
      setResumo(data);
      return data;
    } catch (err: any) {
      console.error('Erro ao buscar resumo:', err);
      // Se a view não existir, buscar dados diretamente
      return await buscarResumoDireto();
    }
  }, []);

  // Fallback se a view não existir
  const buscarResumoDireto = async (): Promise<DashboardResumo | null> => {
    try {
      const mesAtual = new Date();
      mesAtual.setDate(1);
      mesAtual.setHours(0, 0, 0, 0);

      // Buscar vagas
      const { data: vagas } = await supabase.from('vagas').select('id, status, urgente, prazo_fechamento, criado_em, atualizado_em');
      
      // Buscar candidaturas
      const { data: candidaturas } = await supabase.from('candidaturas').select('id, status, criado_em, atualizado_em');

      const vagasArr = vagas || [];
      const candArr = candidaturas || [];

      const vagasAbertas = vagasArr.filter(v => v.status === 'aberta').length;
      const vagasUrgentes = vagasArr.filter(v => v.status === 'aberta' && v.urgente).length;
      
      const aprovadosMes = candArr.filter(c => 
        c.status === 'aprovado' && 
        new Date(c.atualizado_em) >= mesAtual
      ).length;

      const reprovadosMes = candArr.filter(c => 
        c.status === 'reprovado' && 
        new Date(c.atualizado_em) >= mesAtual
      ).length;

      const taxaAprovacao = (aprovadosMes + reprovadosMes) > 0 
        ? Math.round((aprovadosMes / (aprovadosMes + reprovadosMes)) * 100 * 10) / 10
        : 0;

      const resumoData: DashboardResumo = {
        vagas_abertas: vagasAbertas,
        vagas_urgentes: vagasUrgentes,
        vagas_proximas_prazo: 0,
        vagas_fechadas_mes: vagasArr.filter(v => v.status === 'fechada' && new Date(v.atualizado_em) >= mesAtual).length,
        vagas_canceladas_mes: vagasArr.filter(v => v.status === 'cancelada' && new Date(v.atualizado_em) >= mesAtual).length,
        candidaturas_mes: candArr.filter(c => new Date(c.criado_em) >= mesAtual).length,
        aprovados_mes: aprovadosMes,
        reprovados_mes: reprovadosMes,
        taxa_aprovacao_mes: taxaAprovacao,
        tempo_medio_fechamento_dias: 0,
        atualizado_em: new Date().toISOString()
      };

      setResumo(resumoData);
      return resumoData;
    } catch (err) {
      console.error('Erro no fallback:', err);
      return null;
    }
  };

  // ============================================
  // BUSCAR VAGAS NA SOMBRA
  // ============================================

  const buscarVagasSombra = useCallback(async (): Promise<VagaSombra[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_vagas_sombra')
        .select('*')
        .order('nivel_criticidade')
        .limit(20);

      if (error) throw error;
      setVagasSombra(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar vagas sombra:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR PERFORMANCE ANALISTAS
  // ============================================

  const buscarPerformanceAnalistas = useCallback(async (): Promise<PerformanceAnalista[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_performance_analista')
        .select('*')
        .order('taxa_aprovacao', { ascending: false });

      if (error) throw error;
      setPerformanceAnalistas(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar performance analistas:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR PERFORMANCE CLIENTES
  // ============================================

  const buscarPerformanceClientes = useCallback(async (): Promise<PerformanceCliente[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_performance_cliente')
        .select('*')
        .order('vagas_ativas', { ascending: false });

      if (error) throw error;
      setPerformanceClientes(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar performance clientes:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR FUNIL DE CONVERSÃO
  // ============================================

  const buscarFunil = useCallback(async (): Promise<EtapaFunil[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_funil_conversao')
        .select('*')
        .order('ordem');

      if (error) throw error;
      setFunil(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar funil:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR EVOLUÇÃO MENSAL
  // ============================================

  const buscarEvolucao = useCallback(async (): Promise<EvolucaoMensal[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_evolucao_mensal')
        .select('*')
        .order('mes');

      if (error) throw error;
      setEvolucao(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar evolução:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR ALERTAS
  // ============================================

  const buscarAlertas = useCallback(async (): Promise<Alerta[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_alertas_ativos')
        .select('*')
        .limit(50);

      if (error) throw error;
      setAlertas(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Erro ao buscar alertas:', err);
      return [];
    }
  }, []);

  // ============================================
  // CARREGAR TODOS OS DADOS
  // ============================================

  const carregarTudo = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        buscarResumo(),
        buscarVagasSombra(),
        buscarPerformanceAnalistas(),
        buscarPerformanceClientes(),
        buscarFunil(),
        buscarEvolucao(),
        buscarAlertas()
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [buscarResumo, buscarVagasSombra, buscarPerformanceAnalistas, buscarPerformanceClientes, buscarFunil, buscarEvolucao, buscarAlertas]);

  // ============================================
  // MARCAR ALERTA COMO LIDO
  // ============================================

  const marcarAlertaLido = useCallback(async (alertaId: number, tipo: string) => {
    // Implementar se tiver tabela de alertas lidos
    console.log('Alerta marcado como lido:', alertaId, tipo);
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    loading,
    error,

    // Dados
    resumo,
    vagasSombra,
    performanceAnalistas,
    performanceClientes,
    funil,
    evolucao,
    alertas,

    // Ações
    buscarResumo,
    buscarVagasSombra,
    buscarPerformanceAnalistas,
    buscarPerformanceClientes,
    buscarFunil,
    buscarEvolucao,
    buscarAlertas,
    carregarTudo,
    marcarAlertaLido
  };
}

export default useRaisaMetrics;
