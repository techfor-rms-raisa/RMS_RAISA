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
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

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
  // BUSCAR INCLUSÕES
  // ============================================

  const buscarInclusoes = useCallback(async (
    mes?: number | null,
    ano?: number | null,
    gestorComercialId?: number | null
  ): Promise<InclusaoConsultor[]> => {
    setLoading(true);
    setError(null);

    try {
      // Usar a função SQL se disponível, senão usar a view diretamente
      const anoAtual = ano || new Date().getFullYear();
      
      let query = supabase
        .from('vw_movimentacoes_inclusoes')
        .select('*');

      if (mes) {
        query = query.eq('mes_inclusao', mes);
      }
      
      if (gestorComercialId) {
        query = query.eq('id_gestao_comercial', gestorComercialId);
      }

      const { data, error: queryError } = await query.order('data_inclusao_consultores', { ascending: false });

      if (queryError) {
        // Fallback: buscar direto da tabela consultants
        console.warn('View não encontrada, usando fallback');
        return await buscarInclusoesFallback(mes, anoAtual, gestorComercialId);
      }

      const resultado = (data || []).map(item => ({
        consultor_id: item.consultor_id,
        nome_consultores: item.nome_consultores || '',
        cargo_consultores: item.cargo_consultores || '',
        razao_social_cliente: item.razao_social_cliente || 'N/A',
        tipo_de_vaga: item.tipo_de_vaga || 'Nova Posição',
        regime_contratacao: item.regime_contratacao || 'CLT',
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

  // Fallback para buscar inclusões diretamente da tabela
  const buscarInclusoesFallback = async (
    mes?: number | null,
    ano?: number,
    gestorComercialId?: number | null
  ): Promise<InclusaoConsultor[]> => {
    try {
      let query = supabase
        .from('consultants')
        .select(`
          id,
          nome_consultores,
          cargo_consultores,
          status,
          data_inclusao_consultores,
          valor_pagamento,
          cliente_id,
          candidatura_id
        `)
        .eq('status', 'Ativo')
        .not('data_inclusao_consultores', 'is', null);

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar por mês/ano no JavaScript
      const anoAtual = ano || new Date().getFullYear();
      let resultado = (data || []).filter(c => {
        if (!c.data_inclusao_consultores) return false;
        const dataInc = new Date(c.data_inclusao_consultores);
        const mesMatch = mes ? dataInc.getMonth() + 1 === mes : true;
        const anoMatch = dataInc.getFullYear() === anoAtual;
        return mesMatch && anoMatch;
      });

      return resultado.map(c => ({
        consultor_id: c.id,
        nome_consultores: c.nome_consultores || '',
        cargo_consultores: c.cargo_consultores || '',
        razao_social_cliente: 'N/A',
        tipo_de_vaga: 'Nova Posição',
        regime_contratacao: 'CLT',
        valor_mensal: c.valor_pagamento || 0,
        valor_anual: (c.valor_pagamento || 0) * 12,
        data_inclusao: c.data_inclusao_consultores,
        gestor_comercial_nome: ''
      }));

    } catch (err) {
      console.error('Fallback error:', err);
      return [];
    }
  };

  // ============================================
  // BUSCAR EXCLUSÕES
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
      
      let query = supabase
        .from('vw_movimentacoes_exclusoes')
        .select('*');

      if (mes) {
        query = query.eq('mes_exclusao', mes);
      }
      
      if (gestorComercialId) {
        query = query.eq('id_gestao_comercial', gestorComercialId);
      }

      const { data, error: queryError } = await query.order('data_saida', { ascending: false });

      if (queryError) {
        console.warn('View não encontrada, usando fallback');
        return await buscarExclusoesFallback(mes, anoAtual, gestorComercialId);
      }

      const resultado = (data || []).map(item => ({
        consultor_id: item.consultor_id,
        nome_consultores: item.nome_consultores || '',
        cargo_consultores: item.cargo_consultores || '',
        razao_social_cliente: item.razao_social_cliente || 'N/A',
        label_substituicao: item.label_substituicao || 'Sem Reposição',
        regime_contratacao: item.regime_contratacao || 'CLT',
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

  // Fallback para buscar exclusões diretamente da tabela
  const buscarExclusoesFallback = async (
    mes?: number | null,
    ano?: number,
    gestorComercialId?: number | null
  ): Promise<ExclusaoConsultor[]> => {
    try {
      let query = supabase
        .from('consultants')
        .select(`
          id,
          nome_consultores,
          cargo_consultores,
          status,
          data_saida,
          motivo_desligamento,
          substituicao,
          valor_pagamento
        `)
        .in('status', ['Perdido', 'Encerrado'])
        .not('data_saida', 'is', null);

      const { data, error } = await query;

      if (error) throw error;

      const anoAtual = ano || new Date().getFullYear();
      let resultado = (data || []).filter(c => {
        if (!c.data_saida) return false;
        const dataSaida = new Date(c.data_saida);
        const mesMatch = mes ? dataSaida.getMonth() + 1 === mes : true;
        const anoMatch = dataSaida.getFullYear() === anoAtual;
        return mesMatch && anoMatch;
      });

      return resultado.map(c => ({
        consultor_id: c.id,
        nome_consultores: c.nome_consultores || '',
        cargo_consultores: c.cargo_consultores || '',
        razao_social_cliente: 'N/A',
        label_substituicao: c.substituicao ? 'Reposição' : 'Sem Reposição',
        regime_contratacao: 'CLT',
        valor_mensal: c.valor_pagamento || 0,
        valor_anual: (c.valor_pagamento || 0) * 12,
        data_saida: c.data_saida,
        motivo_desligamento: c.motivo_desligamento || '',
        gestor_comercial_nome: ''
      }));

    } catch (err) {
      console.error('Fallback error:', err);
      return [];
    }
  };

  // ============================================
  // BUSCAR RESUMO MENSAL
  // ============================================

  const buscarResumoMensal = useCallback(async (): Promise<ResumoMensal[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_movimentacoes_resumo_mensal')
        .select('*')
        .order('mes');

      if (error) {
        // Fallback: criar resumo vazio
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
  // BUSCAR GESTORES COMERCIAIS
  // ============================================

  const buscarGestoresComerciais = useCallback(async (): Promise<GestorComercial[]> => {
    try {
      // Primeiro tentar a view
      const { data, error } = await supabase
        .from('vw_gestores_comerciais')
        .select('*')
        .order('nome_usuario');

      if (error) {
        // Fallback: buscar de app_users
        const { data: users } = await supabase
          .from('app_users')
          .select('id, nome_usuario')
          .eq('ativo_usuario', true)
          .order('nome_usuario');

        const gestores = users || [];
        setGestoresComerciais(gestores);
        return gestores;
      }

      setGestoresComerciais(data || []);
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar gestores:', err);
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
