/**
 * useDashboardRAISA.ts - Hook centralizado para Dashboards RAISA
 * 
 * Centraliza todos os dados de dashboard em um único hook com:
 * - Fallbacks robustos quando views não existem
 * - Cache de dados
 * - Filtros temporais
 * - Atualização automática
 * 
 * Versão: 1.0
 * Data: 27/12/2024
 * Sprint: 3 - Dashboards
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface FiltroTemporal {
  periodo: 'hoje' | 'semana' | 'mes' | 'trimestre' | 'ano' | 'custom';
  dataInicio?: Date;
  dataFim?: Date;
}

export interface ResumoGeral {
  vagas_abertas: number;
  vagas_urgentes: number;
  vagas_proximas_prazo: number;
  vagas_fechadas_mes: number;
  candidaturas_mes: number;
  aprovados_mes: number;
  reprovados_mes: number;
  taxa_aprovacao_mes: number;
  tempo_medio_fechamento_dias: number;
}

export interface VagaSombra {
  id: number;
  titulo: string;
  status: string;
  urgente: boolean;
  nome_cliente: string;
  analista_nome: string;
  dias_sem_movimentacao: number;
  total_candidatos: number;
  motivo_alerta: string;
  nivel_criticidade: 'critico' | 'alto' | 'medio' | 'baixo';
}

export interface PerformanceAnalista {
  analista_id: number;
  analista_nome: string;
  vagas_ativas: number;
  candidaturas_mes: number;
  aprovados_mes: number;
  taxa_aprovacao: number;
  vagas_fechadas_mes: number;
}

export interface PerformanceCliente {
  cliente_id: number;
  nome_cliente: string;
  vagas_ativas: number;
  aprovados_mes: number;
  taxa_aprovacao: number;
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

export interface PerformanceIA {
  taxa_sucesso_ia: number;
  taxa_sucesso_manual: number;
  decisoes_ia: number;
  decisoes_manual: number;
  ia_performa_melhor: boolean;
}

export interface Alerta {
  tipo_alerta: string;
  severidade: 'critical' | 'warning' | 'info';
  referencia_id: number;
  referencia_tipo: string;
  mensagem: string;
}

// ============================================
// HOOK
// ============================================

export function useDashboardRAISA() {
  // Estados
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroTemporal>({ periodo: 'mes' });

  // Dados
  const [resumo, setResumo] = useState<ResumoGeral | null>(null);
  const [vagasSombra, setVagasSombra] = useState<VagaSombra[]>([]);
  const [performanceAnalistas, setPerformanceAnalistas] = useState<PerformanceAnalista[]>([]);
  const [performanceClientes, setPerformanceClientes] = useState<PerformanceCliente[]>([]);
  const [funil, setFunil] = useState<EtapaFunil[]>([]);
  const [evolucao, setEvolucao] = useState<EvolucaoMensal[]>([]);
  const [performanceIA, setPerformanceIA] = useState<PerformanceIA | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  // Cache
  const cacheRef = useRef<{ timestamp: number; data: any } | null>(null);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  // ============================================
  // FUNÇÕES DE DATA
  // ============================================

  const getDataRange = useCallback(() => {
    const now = new Date();
    let dataInicio: Date;
    let dataFim = now;

    switch (filtro.periodo) {
      case 'hoje':
        dataInicio = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'semana':
        dataInicio = new Date(now);
        dataInicio.setDate(dataInicio.getDate() - 7);
        break;
      case 'mes':
        dataInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'trimestre':
        dataInicio = new Date(now);
        dataInicio.setMonth(dataInicio.getMonth() - 3);
        break;
      case 'ano':
        dataInicio = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        dataInicio = filtro.dataInicio || new Date(now.getFullYear(), now.getMonth(), 1);
        dataFim = filtro.dataFim || now;
        break;
      default:
        dataInicio = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { dataInicio, dataFim };
  }, [filtro]);

  // ============================================
  // BUSCAR RESUMO GERAL
  // ============================================

  const buscarResumo = useCallback(async (): Promise<ResumoGeral | null> => {
    try {
      // Tentar view primeiro
      const { data, error: viewError } = await supabase
        .from('vw_dashboard_resumo')
        .select('*')
        .single();

      if (!viewError && data) {
        setResumo(data);
        return data;
      }

      // Fallback: buscar direto
      console.log('📊 View não encontrada, usando fallback para resumo');
      
      const { dataInicio } = getDataRange();
      
      const [vagasRes, candRes] = await Promise.all([
        supabase.from('vagas').select('id, status, urgente, prazo_fechamento, criado_em, atualizado_em'),
        supabase.from('candidaturas').select('id, status, criado_em, atualizado_em')
      ]);

      const vagas = vagasRes.data || [];
      const candidaturas = candRes.data || [];

      const vagasAbertas = vagas.filter(v => v.status === 'aberta').length;
      const vagasUrgentes = vagas.filter(v => v.status === 'aberta' && v.urgente).length;
      const vagasProximasPrazo = vagas.filter(v => {
        if (v.status !== 'aberta' || !v.prazo_fechamento) return false;
        const prazo = new Date(v.prazo_fechamento);
        const hoje = new Date();
        const diffDias = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        return diffDias >= 0 && diffDias <= 7;
      }).length;
      
      const vagasFechadasMes = vagas.filter(v => 
        v.status === 'fechada' && new Date(v.atualizado_em) >= dataInicio
      ).length;

      const candidaturasMes = candidaturas.filter(c => 
        new Date(c.criado_em) >= dataInicio
      ).length;
      
      const aprovadosMes = candidaturas.filter(c => 
        c.status === 'aprovado' && new Date(c.atualizado_em) >= dataInicio
      ).length;
      
      const reprovadosMes = candidaturas.filter(c => 
        (c.status === 'reprovado' || c.status === 'rejeitado') && 
        new Date(c.atualizado_em) >= dataInicio
      ).length;

      const taxaAprovacao = (aprovadosMes + reprovadosMes) > 0 
        ? Math.round((aprovadosMes / (aprovadosMes + reprovadosMes)) * 100)
        : 0;

      const resumoData: ResumoGeral = {
        vagas_abertas: vagasAbertas,
        vagas_urgentes: vagasUrgentes,
        vagas_proximas_prazo: vagasProximasPrazo,
        vagas_fechadas_mes: vagasFechadasMes,
        candidaturas_mes: candidaturasMes,
        aprovados_mes: aprovadosMes,
        reprovados_mes: reprovadosMes,
        taxa_aprovacao_mes: taxaAprovacao,
        tempo_medio_fechamento_dias: 0
      };

      setResumo(resumoData);
      return resumoData;

    } catch (err: any) {
      console.error('❌ Erro ao buscar resumo:', err);
      return null;
    }
  }, [getDataRange]);

  // ============================================
  // BUSCAR VAGAS NA SOMBRA
  // ============================================

  const buscarVagasSombra = useCallback(async (): Promise<VagaSombra[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_vagas_sombra')
        .select('*')
        .limit(20);

      if (!viewError && data) {
        setVagasSombra(data);
        return data;
      }

      // Fallback
      console.log('📊 View não encontrada, usando fallback para vagas sombra');
      
      const { data: vagas } = await supabase
        .from('vagas')
        .select(`
          id, titulo, status, urgente, prazo_fechamento, criado_em,
          cliente_id, analista_responsavel_id
        `)
        .eq('status', 'aberta')
        .order('criado_em', { ascending: true })
        .limit(20);

      const vagasSombraData: VagaSombra[] = (vagas || []).map(v => ({
        id: v.id,
        titulo: v.titulo,
        status: v.status,
        urgente: v.urgente,
        nome_cliente: `Cliente #${v.cliente_id}`,
        analista_nome: `Analista #${v.analista_responsavel_id}`,
        dias_sem_movimentacao: Math.floor((Date.now() - new Date(v.criado_em).getTime()) / (1000 * 60 * 60 * 24)),
        total_candidatos: 0,
        motivo_alerta: 'Verificar movimentação',
        nivel_criticidade: v.urgente ? 'alto' : 'medio'
      }));

      setVagasSombra(vagasSombraData);
      return vagasSombraData;

    } catch (err: any) {
      console.error('❌ Erro ao buscar vagas sombra:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR PERFORMANCE ANALISTAS
  // ============================================

  const buscarPerformanceAnalistas = useCallback(async (): Promise<PerformanceAnalista[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_performance_analista')
        .select('*')
        .order('vagas_ativas', { ascending: false });

      if (!viewError && data) {
        setPerformanceAnalistas(data);
        return data;
      }

      console.log('📊 View não encontrada, usando fallback para performance analistas');
      setPerformanceAnalistas([]);
      return [];

    } catch (err: any) {
      console.error('❌ Erro ao buscar performance analistas:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR FUNIL DE CONVERSÃO
  // ============================================

  const buscarFunil = useCallback(async (): Promise<EtapaFunil[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_funil_conversao')
        .select('*')
        .order('ordem');

      if (!viewError && data) {
        setFunil(data);
        return data;
      }

      // Fallback
      console.log('📊 View não encontrada, usando fallback para funil');
      
      const { dataInicio } = getDataRange();
      
      const { data: candidaturas } = await supabase
        .from('candidaturas')
        .select('status')
        .gte('criado_em', dataInicio.toISOString());

      const cands = candidaturas || [];
      const total = cands.length;

      const etapas: EtapaFunil[] = [
        { etapa: 'Candidaturas', ordem: 1, quantidade: total, percentual: 100 },
        { etapa: 'Triagem', ordem: 2, quantidade: cands.filter(c => c.status === 'triagem').length, percentual: 0 },
        { etapa: 'Qualificados', ordem: 3, quantidade: cands.filter(c => c.status === 'qualificado').length, percentual: 0 },
        { etapa: 'Entrevista', ordem: 4, quantidade: cands.filter(c => c.status === 'entrevista_interna').length, percentual: 0 },
        { etapa: 'Enviados', ordem: 5, quantidade: cands.filter(c => c.status === 'enviado_cliente').length, percentual: 0 },
        { etapa: 'Aprovados', ordem: 6, quantidade: cands.filter(c => c.status === 'aprovado').length, percentual: 0 }
      ].map(e => ({
        ...e,
        percentual: total > 0 ? Math.round((e.quantidade / total) * 100) : 0
      }));

      setFunil(etapas);
      return etapas;

    } catch (err: any) {
      console.error('❌ Erro ao buscar funil:', err);
      return [];
    }
  }, [getDataRange]);

  // ============================================
  // BUSCAR EVOLUÇÃO MENSAL
  // ============================================

  const buscarEvolucao = useCallback(async (): Promise<EvolucaoMensal[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_evolucao_mensal')
        .select('*')
        .order('mes');

      if (!viewError && data) {
        setEvolucao(data);
        return data;
      }

      console.log('📊 View não encontrada, usando fallback para evolução');
      
      // Gerar últimos 6 meses com dados vazios
      const evolucaoData: EvolucaoMensal[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        evolucaoData.push({
          mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          mes_label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          vagas_abertas: 0,
          vagas_fechadas: 0,
          candidaturas: 0,
          aprovacoes: 0,
          taxa_aprovacao: 0
        });
      }

      setEvolucao(evolucaoData);
      return evolucaoData;

    } catch (err: any) {
      console.error('❌ Erro ao buscar evolução:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR PERFORMANCE IA
  // ============================================

  const buscarPerformanceIA = useCallback(async (): Promise<PerformanceIA | null> => {
    try {
      const { data, error: viewError } = await supabase
        .from('recomendacoes_analista_ia')
        .select('seguiu_recomendacao, ia_acertou, resultado_final')
        .not('resultado_final', 'is', null);

      if (viewError) throw viewError;

      const recs = data || [];
      const comResultado = recs.filter(r => r.resultado_final && r.resultado_final !== 'pendente');
      
      const decisoesIA = recs.filter(r => r.seguiu_recomendacao === true).length;
      const decisoesManual = recs.filter(r => r.seguiu_recomendacao === false).length;
      const acertosIA = comResultado.filter(r => r.seguiu_recomendacao === true && r.ia_acertou === true).length;
      const acertosManual = comResultado.filter(r => r.seguiu_recomendacao === false && r.ia_acertou === false).length;

      const perfIA: PerformanceIA = {
        taxa_sucesso_ia: decisoesIA > 0 ? Math.round((acertosIA / decisoesIA) * 100) : 0,
        taxa_sucesso_manual: decisoesManual > 0 ? Math.round((acertosManual / decisoesManual) * 100) : 0,
        decisoes_ia: decisoesIA,
        decisoes_manual: decisoesManual,
        ia_performa_melhor: acertosIA > acertosManual
      };

      setPerformanceIA(perfIA);
      return perfIA;

    } catch (err: any) {
      console.error('❌ Erro ao buscar performance IA:', err);
      return null;
    }
  }, []);

  // ============================================
  // BUSCAR ALERTAS
  // ============================================

  const buscarAlertas = useCallback(async (): Promise<Alerta[]> => {
    try {
      const { data, error: viewError } = await supabase
        .from('vw_alertas_ativos')
        .select('*')
        .limit(10);

      if (!viewError && data) {
        setAlertas(data);
        return data;
      }

      console.log('📊 View não encontrada, usando fallback para alertas');
      setAlertas([]);
      return [];

    } catch (err: any) {
      console.error('❌ Erro ao buscar alertas:', err);
      return [];
    }
  }, []);

  // ============================================
  // CARREGAR TUDO
  // ============================================

  const carregarTudo = useCallback(async (forceRefresh = false) => {
    // Verificar cache
    if (!forceRefresh && cacheRef.current && (Date.now() - cacheRef.current.timestamp) < CACHE_TTL) {
      console.log('📦 Usando dados em cache');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📊 Carregando dados dos dashboards...');

      await Promise.all([
        buscarResumo(),
        buscarVagasSombra(),
        buscarPerformanceAnalistas(),
        buscarFunil(),
        buscarEvolucao(),
        buscarPerformanceIA(),
        buscarAlertas()
      ]);

      // Atualizar cache
      cacheRef.current = {
        timestamp: Date.now(),
        data: { resumo, vagasSombra, performanceAnalistas, funil, evolucao, performanceIA, alertas }
      };

      console.log('✅ Dados carregados com sucesso!');

    } catch (err: any) {
      console.error('❌ Erro ao carregar dashboards:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [buscarResumo, buscarVagasSombra, buscarPerformanceAnalistas, buscarFunil, buscarEvolucao, buscarPerformanceIA, buscarAlertas]);

  // ============================================
  // AUTO-REFRESH
  // ============================================

  useEffect(() => {
    const interval = setInterval(() => {
      carregarTudo(true);
    }, 5 * 60 * 1000); // A cada 5 minutos

    return () => clearInterval(interval);
  }, [carregarTudo]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estados
    loading,
    error,
    filtro,
    setFiltro,

    // Dados
    resumo,
    vagasSombra,
    performanceAnalistas,
    performanceClientes,
    funil,
    evolucao,
    performanceIA,
    alertas,

    // Métodos
    carregarTudo,
    buscarResumo,
    buscarVagasSombra,
    buscarPerformanceAnalistas,
    buscarFunil,
    buscarEvolucao,
    buscarPerformanceIA,
    buscarAlertas
  };
}
