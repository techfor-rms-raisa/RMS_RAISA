/**
 * usePosicaoComercial.ts - Hook para Posição Comercial
 * 
 * Funcionalidades:
 * - Buscar posição comercial das vagas
 * - Filtrar por gestor, cliente, faturável
 * - Calcular totais por semana
 * - Resumo por status
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface PosicaoComercialItem {
  vaga_id: number;
  titulo: string;
  status: string;
  status_label: string;
  status_ordem: number;
  data_abertura: string;
  ocorrencia: number;
  vaga_faturavel: boolean;
  cliente_id: number;
  razao_social_cliente: string;
  gestor_comercial_nome: string;
  quantidade: number;
  enviados_mes_anterior: number;
  enviados_semana1: number;
  enviados_semana2: number;
  enviados_semana3: number;
  enviados_semana4: number;
  enviados_semana5: number;
  total_enviados: number;
  total_reprovados: number;
  total_aguardando: number;
}

export interface ResumoStatus {
  status_label: string;
  status_ordem: number;
  total_vagas: number;
  total_cvs_enviados: number;
  total_cvs_reprovados: number;
  total_cvs_aguardando: number;
}

export interface GestorComercial {
  id: number;
  nome_usuario: string;
}

export interface ClienteAtivo {
  id: number;
  razao_social_cliente: string;
  id_gestao_comercial: number;
}

export interface FiltrosPosicao {
  gestorComercialId?: number | null;
  clienteId?: number | null;
  faturavel?: boolean | null;
}

export interface TotaisPosicao {
  totalVagas: number;
  totalEnviados: number;
  totalReprovados: number;
  totalAguardando: number;
  enviadosSemana1: number;
  enviadosSemana2: number;
  enviadosSemana3: number;
  enviadosSemana4: number;
  enviadosSemana5: number;
}

// ============================================
// CONSTANTES
// ============================================

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ============================================
// HOOK
// ============================================

export function usePosicaoComercial() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Estados dos dados
  const [posicoes, setPosicoes] = useState<PosicaoComercialItem[]>([]);
  const [resumoPorStatus, setResumoPorStatus] = useState<ResumoStatus[]>([]);
  const [gestoresComerciais, setGestoresComerciais] = useState<GestorComercial[]>([]);
  const [clientes, setClientes] = useState<ClienteAtivo[]>([]);

  // ============================================
  // BUSCAR POSIÇÃO COMERCIAL
  // ============================================

  const buscarPosicaoComercial = useCallback(async (
    filtros?: FiltrosPosicao
  ): Promise<PosicaoComercialItem[]> => {
    setLoading(true);
    setError(null);

    try {
      // Tentar usar a view
      let query = supabase
        .from('vw_posicao_comercial')
        .select('*');

      if (filtros?.gestorComercialId) {
        query = query.eq('id_gestao_comercial', filtros.gestorComercialId);
      }
      if (filtros?.clienteId) {
        query = query.eq('cliente_id', filtros.clienteId);
      }
      if (filtros?.faturavel !== null && filtros?.faturavel !== undefined) {
        query = query.eq('vaga_faturavel', filtros.faturavel);
      }

      const { data, error: queryError } = await query.order('status_ordem').order('data_abertura', { ascending: false });

      if (queryError) {
        console.warn('View não encontrada, usando fallback');
        return await buscarPosicaoFallback(filtros);
      }

      const resultado = (data || []).map(item => ({
        vaga_id: item.vaga_id,
        titulo: item.titulo || '',
        status: item.status || '',
        status_label: item.status_label || '',
        status_ordem: item.status_ordem || 0,
        data_abertura: item.data_abertura,
        ocorrencia: item.ocorrencia || 0,
        vaga_faturavel: item.vaga_faturavel ?? true,
        cliente_id: item.cliente_id,
        razao_social_cliente: item.razao_social_cliente || 'N/A',
        gestor_comercial_nome: item.gestor_comercial_nome || '',
        quantidade: item.quantidade || 1,
        enviados_mes_anterior: item.enviados_mes_anterior || 0,
        enviados_semana1: item.enviados_semana1 || 0,
        enviados_semana2: item.enviados_semana2 || 0,
        enviados_semana3: item.enviados_semana3 || 0,
        enviados_semana4: item.enviados_semana4 || 0,
        enviados_semana5: item.enviados_semana5 || 0,
        total_enviados: item.total_enviados || 0,
        total_reprovados: item.total_reprovados || 0,
        total_aguardando: item.total_aguardando || 0
      }));

      setPosicoes(resultado);
      return resultado;

    } catch (err: any) {
      console.error('Erro ao buscar posição comercial:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fallback para buscar diretamente das tabelas
  const buscarPosicaoFallback = async (
    filtros?: FiltrosPosicao
  ): Promise<PosicaoComercialItem[]> => {
    try {
      let query = supabase
        .from('vagas')
        .select(`
          id,
          titulo,
          status,
          criado_em,
          ocorrencia,
          vaga_faturavel,
          cliente_id,
          clients!inner(id, razao_social_cliente, id_gestao_comercial)
        `);

      if (filtros?.clienteId) {
        query = query.eq('cliente_id', filtros.clienteId);
      }
      if (filtros?.faturavel !== null && filtros?.faturavel !== undefined) {
        query = query.eq('vaga_faturavel', filtros.faturavel);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Mapear status para ordem
      const statusOrdem: Record<string, number> = {
        'cancelada': 1,
        'perdida': 2,
        'fechada': 3,
        'em_andamento': 4,
        'aberta': 5
      };

      const statusLabel: Record<string, string> = {
        'cancelada': 'CANCELADA',
        'perdida': 'PERDIDA',
        'fechada': 'APROVADA',
        'em_andamento': 'EM ANDAMENTO',
        'aberta': 'ABERTA'
      };

      let resultado = (data || []).map((v: any) => ({
        vaga_id: v.id,
        titulo: v.titulo || '',
        status: v.status || '',
        status_label: statusLabel[v.status] || v.status?.toUpperCase() || '',
        status_ordem: statusOrdem[v.status] || 6,
        data_abertura: v.criado_em,
        ocorrencia: v.ocorrencia || 0,
        vaga_faturavel: v.vaga_faturavel ?? true,
        cliente_id: v.cliente_id,
        razao_social_cliente: v.clients?.razao_social_cliente || 'N/A',
        gestor_comercial_nome: '',
        quantidade: 1,
        enviados_mes_anterior: 0,
        enviados_semana1: 0,
        enviados_semana2: 0,
        enviados_semana3: 0,
        enviados_semana4: 0,
        enviados_semana5: 0,
        total_enviados: 0,
        total_reprovados: 0,
        total_aguardando: 0
      }));

      // Filtrar por gestor comercial se necessário
      if (filtros?.gestorComercialId) {
        resultado = resultado.filter((r: any) => 
          data?.find((v: any) => v.id === r.vaga_id)?.clients?.id_gestao_comercial === filtros.gestorComercialId
        );
      }

      // Ordenar
      resultado.sort((a: any, b: any) => {
        if (a.status_ordem !== b.status_ordem) return a.status_ordem - b.status_ordem;
        return new Date(b.data_abertura).getTime() - new Date(a.data_abertura).getTime();
      });

      setPosicoes(resultado);
      return resultado;

    } catch (err) {
      console.error('Fallback error:', err);
      return [];
    }
  };

  // ============================================
  // BUSCAR RESUMO POR STATUS
  // ============================================

  const buscarResumoPorStatus = useCallback(async (): Promise<ResumoStatus[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_posicao_comercial_resumo')
        .select('*')
        .order('status_ordem');

      if (error) {
        // Fallback: calcular do array de posições
        const resumo = calcularResumoDePosicoes(posicoes);
        setResumoPorStatus(resumo);
        return resumo;
      }

      setResumoPorStatus(data || []);
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar resumo:', err);
      return [];
    }
  }, [posicoes]);

  // Calcular resumo a partir das posições
  const calcularResumoDePosicoes = (lista: PosicaoComercialItem[]): ResumoStatus[] => {
    const agrupado: Record<string, ResumoStatus> = {};

    lista.forEach(item => {
      const key = item.status_label;
      if (!agrupado[key]) {
        agrupado[key] = {
          status_label: item.status_label,
          status_ordem: item.status_ordem,
          total_vagas: 0,
          total_cvs_enviados: 0,
          total_cvs_reprovados: 0,
          total_cvs_aguardando: 0
        };
      }
      agrupado[key].total_vagas++;
      agrupado[key].total_cvs_enviados += item.total_enviados;
      agrupado[key].total_cvs_reprovados += item.total_reprovados;
      agrupado[key].total_cvs_aguardando += item.total_aguardando;
    });

    return Object.values(agrupado).sort((a, b) => a.status_ordem - b.status_ordem);
  };

  // ============================================
  // BUSCAR GESTORES COMERCIAIS
  // ============================================

  const buscarGestoresComerciais = useCallback(async (): Promise<GestorComercial[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_gestores_comerciais')
        .select('*')
        .order('nome_usuario');

      if (error) {
        // Fallback
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
  // BUSCAR CLIENTES
  // ============================================

  const buscarClientes = useCallback(async (): Promise<ClienteAtivo[]> => {
    try {
      const { data, error } = await supabase
        .from('vw_clientes_ativos')
        .select('*')
        .order('razao_social_cliente');

      if (error) {
        // Fallback
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, razao_social_cliente, id_gestao_comercial')
          .eq('ativo_cliente', true)
          .order('razao_social_cliente');

        const clientesList = clientsData || [];
        setClientes(clientesList);
        return clientesList;
      }

      setClientes(data || []);
      return data || [];

    } catch (err: any) {
      console.error('Erro ao buscar clientes:', err);
      return [];
    }
  }, []);

  // ============================================
  // CALCULAR TOTAIS
  // ============================================

  const calcularTotais = useCallback((lista: PosicaoComercialItem[]): TotaisPosicao => {
    return lista.reduce((acc, item) => ({
      totalVagas: acc.totalVagas + 1,
      totalEnviados: acc.totalEnviados + item.total_enviados,
      totalReprovados: acc.totalReprovados + item.total_reprovados,
      totalAguardando: acc.totalAguardando + item.total_aguardando,
      enviadosSemana1: acc.enviadosSemana1 + item.enviados_semana1,
      enviadosSemana2: acc.enviadosSemana2 + item.enviados_semana2,
      enviadosSemana3: acc.enviadosSemana3 + item.enviados_semana3,
      enviadosSemana4: acc.enviadosSemana4 + item.enviados_semana4,
      enviadosSemana5: acc.enviadosSemana5 + item.enviados_semana5
    }), {
      totalVagas: 0,
      totalEnviados: 0,
      totalReprovados: 0,
      totalAguardando: 0,
      enviadosSemana1: 0,
      enviadosSemana2: 0,
      enviadosSemana3: 0,
      enviadosSemana4: 0,
      enviadosSemana5: 0
    });
  }, []);

  // ============================================
  // CARREGAR TODOS OS DADOS
  // ============================================

  const carregarDados = useCallback(async (filtros?: FiltrosPosicao) => {
    setLoading(true);
    
    const [posData, gestores, clientesData] = await Promise.all([
      buscarPosicaoComercial(filtros),
      buscarGestoresComerciais(),
      buscarClientes()
    ]);

    const resumo = calcularResumoDePosicoes(posData);
    setResumoPorStatus(resumo);

    setLoading(false);
    
    return {
      posicoes: posData,
      gestores,
      clientes: clientesData,
      resumo,
      totais: calcularTotais(posData)
    };
  }, [buscarPosicaoComercial, buscarGestoresComerciais, buscarClientes, calcularTotais]);

  // ============================================
  // OBTER MÊS CORRENTE
  // ============================================

  const getMesCorrente = (): { mes: string; ano: number } => {
    const agora = new Date();
    return {
      mes: MESES[agora.getMonth()],
      ano: agora.getFullYear()
    };
  };

  const getMesAnterior = (): { mes: string; ano: number } => {
    const agora = new Date();
    const mesAnterior = agora.getMonth() === 0 ? 11 : agora.getMonth() - 1;
    const anoAnterior = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear();
    return {
      mes: MESES[mesAnterior],
      ano: anoAnterior
    };
  };

  // ============================================
  // RETURN
  // ============================================

  return {
    loading,
    error,
    posicoes,
    resumoPorStatus,
    gestoresComerciais,
    clientes,
    buscarPosicaoComercial,
    buscarResumoPorStatus,
    buscarGestoresComerciais,
    buscarClientes,
    calcularTotais,
    carregarDados,
    getMesCorrente,
    getMesAnterior,
    MESES
  };
}

export default usePosicaoComercial;
