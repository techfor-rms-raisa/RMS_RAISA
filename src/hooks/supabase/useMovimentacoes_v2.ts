/**
 * useMovimentacoes.ts - Hook para Movimentações de Consultores
 * 
 * Funcionalidades:
 * - Buscar inclusões por mês
 * - Buscar exclusões por mês
 * - Buscar resumo mensal
 * - Buscar gestores comerciais
 * - Calcular totais
 * 
 * ============================================
 * IMPORTANTE: Este hook depende das Views do Supabase:
 * - vw_gestores_comerciais
 * - vw_movimentacoes_inclusoes
 * - vw_movimentacoes_exclusoes
 * - vw_movimentacoes_resumo_mensal
 * 
 * Execute o script SQL "corrigir_views_movimentacoes.sql" no Supabase
 * ============================================
 * 
 * Versão: 2.0
 * Data: 30/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';

// ============================================
// TIPOS
// ============================================

export interface InclusaoConsultor {
  consultor_id: number;
  nome_consultores: string;
  cargo_consultores: string;
  razao_social_cliente: string;
  tipo_de_vaga: string; // 'Nova Posição' | 'Reposição'
  regime_contratacao: string;
  valor_mensal: number;
  valor_anual: number;
  data_inclusao: string;
  gestor_comercial_nome: string;
}

export interface ExclusaoConsultor {
  consultor_id: number;
  nome_consultores: string;
  cargo_consultores: string;
  razao_social_cliente: string;
  label_substituicao: string; // 'Reposição' | 'Sem Reposição'
  regime_contratacao: string;
  valor_mensal: number;
  valor_anual: number;
  data_saida: string;
  motivo_desligamento: string;
  gestor_comercial_nome: string;
}

export interface ResumoMensal {
  mes: number;
  mes_label: string;
  qtd_inclusoes: number;
  valor_inclusoes: number;
  qtd_exclusoes: number;
  valor_exclusoes: number;
  saldo_liquido: number;
  valor_liquido: number;
}

export interface GestorComercial {
  id: number;
  nome_usuario: string;
}

export interface TotaisMovimentacao {
  totalInclusoes: number;
  valorTotalInclusoes: number;
  totalExclusoes: number;
  valorTotalExclusoes: number;
  saldoLiquido: number;
  valorLiquido: number;
}

// ============================================
// CONSTANTES
// ============================================

export const MESES = [
  { valor: 1, label: 'JAN', nome: 'Janeiro' },
  { valor: 2, label: 'FEV', nome: 'Fevereiro' },
  { valor: 3, label: 'MAR', nome: 'Março' },
  { valor: 4, label: 'ABR', nome: 'Abril' },
  { valor: 5, label: 'MAI', nome: 'Maio' },
  { valor: 6, label: 'JUN', nome: 'Junho' },
  { valor: 7, label: 'JUL', nome: 'Julho' },
  { valor: 8, label: 'AGO', nome: 'Agosto' },
  { valor: 9, label: 'SET', nome: 'Setembro' },
  { valor: 10, label: 'OUT', nome: 'Outubro' },
  { valor: 11, label: 'NOV', nome: 'Novembro' },
  { valor: 12, label: 'DEZ', nome: 'Dezembro' }
];

// ============================================
// HOOK
// ============================================

export function useMovimentacoes() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Estados dos dados
  const [inclusoes, setInclusoes] = useState<InclusaoConsultor[]>([]);
  const [exclusoes, setExclusoes] = useState<ExclusaoConsultor[]>([]);
  const [resumoMensal, setResumoMensal] = useState<ResumoMensal[]>([]);
  const [gestoresComerciais, setGestoresComerciais] = useState<GestorComercial[]>([]);

  // ============================================
  // BUSCAR INCLUSÕES (via View)
  // ============================================

  const buscarInclusoes = useCallback(async (
    mes?: number | null,
    ano?: number | null,
    gestorComercialId?: number | null
  ): Promise<InclusaoConsultor[]> => {
    setLoading(true);
    setError(null);

    try {
      const anoAtual = ano || new Date().getFullYear();
      
      // Usar a View otimizada do Supabase
      let query = supabase
        .from('vw_movimentacoes_inclusoes')
        .select('*')
        .eq('ano_inclusao', anoAtual);

      if (mes) {
        query = query.eq('mes_inclusao', mes);
      }
      
      if (gestorComercialId) {
        query = query.eq('id_gestao_comercial', gestorComercialId);
      }

      const { data, error: queryError } = await query.order('data_inclusao_consultores', { ascending: false });

      if (queryError) {
        console.error('Erro na view vw_movimentacoes_inclusoes:', queryError);
        throw new Error('View vw_movimentacoes_inclusoes não encontrada. Execute o script SQL de correção.');
      }

      const resultado = (data || []).map(item => ({
        consultor_id: item.consultor_id,
        nome_consultores: item.nome_consultores || '',
        cargo_consultores: item.cargo_consultores || '',
        razao_social_cliente: item.razao_social_cliente || 'Cliente não identificado',
        tipo_de_vaga: item.tipo_de_vaga || 'Nova Posição',
        regime_contratacao: item.regime_contratacao || 'PJ',
        valor_mensal: item.valor_mensal || 0,
        valor_anual: item.valor_anual || 0,
        data_inclusao: item.data_inclusao_consultores,
        gestor_comercial_nome: item.gestor_comercial_nome || ''
      }));

      setInclusoes(resultado);
      return resultado;

    } catch (err: any) {
      console.error('Erro ao buscar inclusões:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // BUSCAR EXCLUSÕES (via View)
  // ============================================

  const buscarExclusoes = useCallback(async (
    mes?: number | null,
    ano?: number | null,
    gestorComercialId?: number | null
  ): Promise<ExclusaoConsultor[]> => {
    setLoading(true);
    setError(null);

    try {
      const anoAtual = ano || new Date().getFullYear();
      
      // Usar a View otimizada do Supabase
      let query = supabase
        .from('vw_movimentacoes_exclusoes')
        .select('*')
        .eq('ano_exclusao', anoAtual);

      if (mes) {
        query = query.eq('mes_exclusao', mes);
      }
      
      if (gestorComercialId) {
        query = query.eq('id_gestao_comercial', gestorComercialId);
      }

      const { data, error: queryError } = await query.order('data_saida', { ascending: false });

      if (queryError) {
        console.error('Erro na view vw_movimentacoes_exclusoes:', queryError);
        throw new Error('View vw_movimentacoes_exclusoes não encontrada. Execute o script SQL de correção.');
      }

      const resultado = (data || []).map(item => ({
        consultor_id: item.consultor_id,
        nome_consultores: item.nome_consultores || '',
        cargo_consultores: item.cargo_consultores || '',
        razao_social_cliente: item.razao_social_cliente || 'Cliente não identificado',
        label_substituicao: item.label_substituicao || 'Sem Reposição',
        regime_contratacao: item.regime_contratacao || 'PJ',
        valor_mensal: item.valor_mensal || 0,
        valor_anual: item.valor_anual || 0,
        data_saida: item.data_saida,
        motivo_desligamento: item.motivo_desligamento || '',
        gestor_comercial_nome: item.gestor_comercial_nome || ''
      }));

      setExclusoes(resultado);
      return resultado;

    } catch (err: any) {
      console.error('Erro ao buscar exclusões:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // BUSCAR RESUMO MENSAL (via View)
  // ============================================

  const buscarResumoMensal = useCallback(async (): Promise<ResumoMensal[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_movimentacoes_resumo_mensal')
        .select('*')
        .order('mes');

      if (error) {
        console.warn('View vw_movimentacoes_resumo_mensal não encontrada, usando resumo vazio');
        const resumoVazio = MESES.map(m => ({
          mes: m.valor,
          mes_label: m.label,
          qtd_inclusoes: 0,
          valor_inclusoes: 0,
          qtd_exclusoes: 0,
          valor_exclusoes: 0,
          saldo_liquido: 0,
          valor_liquido: 0
        }));
        setResumoMensal(resumoVazio);
        return resumoVazio;
      }

      setResumoMensal(data || []);
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar resumo:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR GESTORES COMERCIAIS (via View)
  // ============================================

  const buscarGestoresComerciais = useCallback(async (): Promise<GestorComercial[]> => {
    try {
      // Usar a View otimizada do Supabase
      const { data, error } = await supabase
        .from('vw_gestores_comerciais')
        .select('*')
        .order('nome_usuario');

      if (error) {
        console.error('Erro na view vw_gestores_comerciais:', error);
        throw new Error('View vw_gestores_comerciais não encontrada. Execute o script SQL de correção.');
      }

      const gestores = data || [];
      console.log('✅ Gestores comerciais carregados:', gestores.map(g => g.nome_usuario));
      setGestoresComerciais(gestores);
      return gestores;

    } catch (err: any) {
      console.error('Erro ao buscar gestores:', err);
      setGestoresComerciais([]);
      return [];
    }
  }, []);

  // ============================================
  // CALCULAR TOTAIS
  // ============================================

  const calcularTotais = useCallback((
    listaInclusoes: InclusaoConsultor[],
    listaExclusoes: ExclusaoConsultor[]
  ): TotaisMovimentacao => {
    const totalInclusoes = listaInclusoes.length;
    const valorTotalInclusoes = listaInclusoes.reduce((sum, i) => sum + (i.valor_mensal || 0), 0);
    
    const totalExclusoes = listaExclusoes.length;
    const valorTotalExclusoes = listaExclusoes.reduce((sum, e) => sum + (e.valor_mensal || 0), 0);
    
    return {
      totalInclusoes,
      valorTotalInclusoes,
      totalExclusoes,
      valorTotalExclusoes,
      saldoLiquido: totalInclusoes - totalExclusoes,
      valorLiquido: valorTotalInclusoes - valorTotalExclusoes
    };
  }, []);

  // ============================================
  // CARREGAR TODOS OS DADOS
  // ============================================

  const carregarDados = useCallback(async (
    mes?: number | null,
    gestorComercialId?: number | null
  ) => {
    setLoading(true);
    
    const [inc, exc, resumo, gestores] = await Promise.all([
      buscarInclusoes(mes, null, gestorComercialId),
      buscarExclusoes(mes, null, gestorComercialId),
      buscarResumoMensal(),
      buscarGestoresComerciais()
    ]);

    setLoading(false);
    
    return {
      inclusoes: inc,
      exclusoes: exc,
      resumo,
      gestores,
      totais: calcularTotais(inc, exc)
    };
  }, [buscarInclusoes, buscarExclusoes, buscarResumoMensal, buscarGestoresComerciais, calcularTotais]);

  // ============================================
  // RETURN
  // ============================================

  return {
    loading,
    error,
    inclusoes,
    exclusoes,
    resumoMensal,
    gestoresComerciais,
    buscarInclusoes,
    buscarExclusoes,
    buscarResumoMensal,
    buscarGestoresComerciais,
    calcularTotais,
    carregarDados,
    MESES
  };
}

export default useMovimentacoes;
