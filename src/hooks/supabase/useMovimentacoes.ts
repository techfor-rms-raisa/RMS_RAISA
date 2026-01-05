/**
 * useMovimentacoes.ts - Hook para Movimentações de Consultores
 * 
 * ============================================
 * VERSÃO 4.1 - CORREÇÕES:
 * 1. Cliente: Busca via cliente_id OU via gestor_imediato_id
 * 2. Exclusões: MOTIVAÇÃO mostra motivo_desligamento
 * 3. Exclusões: Nova coluna SUBSTITUIÇÃO (Sim/Não)
 * 4. Valor Mensal: PJ = valor_faturamento * 168, CLT = 0
 * ============================================
 * 
 * Data: 05/01/2026
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
  nome_substituido?: string;
}

export interface ExclusaoConsultor {
  consultor_id: number;
  nome_consultores: string;
  cargo_consultores: string;
  razao_social_cliente: string;
  motivo_desligamento: string;      // ✅ CORREÇÃO 2: Agora é motivo_desligamento
  substituicao_label: string;        // ✅ CORREÇÃO 3: "Sim" ou "Não"
  regime_contratacao: string;
  valor_mensal: number;
  valor_anual: number;
  data_saida: string;
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
  
  const [inclusoes, setInclusoes] = useState<InclusaoConsultor[]>([]);
  const [exclusoes, setExclusoes] = useState<ExclusaoConsultor[]>([]);
  const [resumoMensal, setResumoMensal] = useState<ResumoMensal[]>([]);
  const [gestoresComerciais, setGestoresComerciais] = useState<GestorComercial[]>([]);

  // ============================================
  // HELPER: Buscar nome do cliente
  // ============================================
  const buscarNomeCliente = async (
    clienteId: number | null,
    gestorImediatoId: number | null,
    clientsMap: Map<number, any>,
    usuariosClienteMap: Map<number, any>
  ): Promise<{ razaoSocial: string; idGestaoComercial: number | null }> => {
    
    // 1. Se tem cliente_id direto, usar ele
    if (clienteId) {
      const cliente = clientsMap.get(clienteId);
      if (cliente) {
        return {
          razaoSocial: cliente.razao_social_cliente,
          idGestaoComercial: cliente.id_gestao_comercial
        };
      }
    }
    
    // 2. Se não tem cliente_id, buscar via gestor_imediato_id → usuarios_cliente → clients
    if (gestorImediatoId) {
      const usuarioCliente = usuariosClienteMap.get(gestorImediatoId);
      if (usuarioCliente && usuarioCliente.id_cliente) {
        const cliente = clientsMap.get(usuarioCliente.id_cliente);
        if (cliente) {
          return {
            razaoSocial: cliente.razao_social_cliente,
            idGestaoComercial: cliente.id_gestao_comercial
          };
        }
      }
    }
    
    return { razaoSocial: 'Cliente não identificado', idGestaoComercial: null };
  };

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
      const anoSelecionado = ano || new Date().getFullYear();
      
      console.log(`🔍 Buscando INCLUSÕES: ano_vigencia=${anoSelecionado}, mes=${mes || 'todos'}`);

      // Query principal
      const { data: consultantsData, error: queryError } = await supabase
        .from('consultants')
        .select(`
          id,
          nome_consultores,
          cargo_consultores,
          status,
          ano_vigencia,
          data_inclusao_consultores,
          valor_faturamento,
          valor_pagamento,
          gestor_imediato_id,
          substituicao,
          nome_substituido,
          modalidade_contrato,
          cliente_id
        `)
        .eq('status', 'Ativo')
        .eq('ano_vigencia', anoSelecionado)
        .not('data_inclusao_consultores', 'is', null);

      if (queryError) throw queryError;

      // ============================================
      // CORREÇÃO 1: Buscar dados para resolver cliente
      // ============================================
      
      // Buscar TODOS os clientes
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, razao_social_cliente, id_gestao_comercial');
      
      const clientsMap = new Map((clientsData || []).map(c => [c.id, c]));

      // Buscar usuarios_cliente para mapear gestor_imediato_id → cliente
      const { data: usuariosClienteData } = await supabase
        .from('usuarios_cliente')
        .select('id, id_cliente, nome_gestor_cliente');
      
      const usuariosClienteMap = new Map((usuariosClienteData || []).map(u => [u.id, u]));

      // Buscar gestores comerciais (app_users)
      const { data: gestoresData } = await supabase
        .from('app_users')
        .select('id, nome_usuario');
      
      const gestoresMap = new Map((gestoresData || []).map(g => [g.id, g]));

      // Filtrar por mês/ano da data_inclusao
      let resultado = (consultantsData || []).filter(c => {
        if (!c.data_inclusao_consultores) return false;
        
        const dataInc = new Date(c.data_inclusao_consultores);
        const anoInclusao = dataInc.getFullYear();
        const mesInclusao = dataInc.getMonth() + 1;
        
        if (anoInclusao !== anoSelecionado) return false;
        if (mes && mesInclusao !== mes) return false;
        
        return true;
      });

      // Remover duplicatas
      const consultorIdsVistos = new Set<number>();
      resultado = resultado.filter(c => {
        if (consultorIdsVistos.has(c.id)) return false;
        consultorIdsVistos.add(c.id);
        return true;
      });

      // Mapear para o formato esperado
      const inclusoesFinal: InclusaoConsultor[] = await Promise.all(
        resultado.map(async c => {
          // ✅ CORREÇÃO 1: Buscar cliente corretamente
          const { razaoSocial, idGestaoComercial } = await buscarNomeCliente(
            c.cliente_id,
            c.gestor_imediato_id,
            clientsMap,
            usuariosClienteMap
          );
          
          const gestorComercial = idGestaoComercial ? gestoresMap.get(idGestaoComercial) : null;
          
          // ✅ CORREÇÃO: Cálculo do valor mensal
          // PJ = valor_faturamento * 168
          // CLT = 0
          const modalidade = c.modalidade_contrato || 'PJ';
          const valorMensal = modalidade === 'CLT' ? 0 : (c.valor_faturamento || 0) * 168;
          
          return {
            consultor_id: c.id,
            nome_consultores: c.nome_consultores || '',
            cargo_consultores: c.cargo_consultores || '',
            razao_social_cliente: razaoSocial,
            tipo_de_vaga: c.substituicao === true ? 'Reposição' : 'Nova Posição',
            regime_contratacao: modalidade,
            valor_mensal: valorMensal,
            valor_anual: valorMensal * 12,
            data_inclusao: c.data_inclusao_consultores,
            gestor_comercial_nome: gestorComercial?.nome_usuario || '',
            nome_substituido: c.nome_substituido || undefined
          };
        })
      );

      // Filtrar por gestor comercial se especificado
      let inclusoesFiltradas = inclusoesFinal;
      if (gestorComercialId) {
        // Precisamos refiltrar baseado no gestor comercial
        inclusoesFiltradas = await Promise.all(
          resultado.map(async c => {
            const { idGestaoComercial } = await buscarNomeCliente(
              c.cliente_id,
              c.gestor_imediato_id,
              clientsMap,
              usuariosClienteMap
            );
            return { ...c, idGestaoComercial };
          })
        ).then(items => 
          items
            .filter(c => c.idGestaoComercial === gestorComercialId)
            .map(c => inclusoesFinal.find(i => i.consultor_id === c.id)!)
            .filter(Boolean)
        );
      }

      console.log(`✅ INCLUSÕES finais: ${inclusoesFiltradas.length}`);
      
      setInclusoes(gestorComercialId ? inclusoesFiltradas : inclusoesFinal);
      return gestorComercialId ? inclusoesFiltradas : inclusoesFinal;

    } catch (err: any) {
      console.error('Erro ao buscar inclusões:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

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
      const anoSelecionado = ano || new Date().getFullYear();
      
      console.log(`🔍 Buscando EXCLUSÕES: ano=${anoSelecionado}, mes=${mes || 'todos'}`);

      const { data: consultantsData, error: queryError } = await supabase
        .from('consultants')
        .select(`
          id,
          nome_consultores,
          cargo_consultores,
          status,
          ano_vigencia,
          data_saida,
          motivo_desligamento,
          valor_faturamento,
          valor_pagamento,
          gestor_imediato_id,
          substituicao,
          modalidade_contrato,
          cliente_id
        `)
        .in('status', ['Perdido', 'Encerrado'])
        .eq('ano_vigencia', anoSelecionado)
        .not('data_saida', 'is', null);

      if (queryError) throw queryError;

      // Buscar dados auxiliares
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, razao_social_cliente, id_gestao_comercial');
      
      const clientsMap = new Map((clientsData || []).map(c => [c.id, c]));

      const { data: usuariosClienteData } = await supabase
        .from('usuarios_cliente')
        .select('id, id_cliente, nome_gestor_cliente');
      
      const usuariosClienteMap = new Map((usuariosClienteData || []).map(u => [u.id, u]));

      const { data: gestoresData } = await supabase
        .from('app_users')
        .select('id, nome_usuario');
      
      const gestoresMap = new Map((gestoresData || []).map(g => [g.id, g]));

      // Filtrar por mês/ano da data_saida
      let resultado = (consultantsData || []).filter(c => {
        if (!c.data_saida) return false;
        
        const dataSaida = new Date(c.data_saida);
        const anoSaida = dataSaida.getFullYear();
        const mesSaida = dataSaida.getMonth() + 1;
        
        if (anoSaida !== anoSelecionado) return false;
        if (mes && mesSaida !== mes) return false;
        
        return true;
      });

      // Remover duplicatas
      const consultorIdsVistos = new Set<number>();
      resultado = resultado.filter(c => {
        if (consultorIdsVistos.has(c.id)) return false;
        consultorIdsVistos.add(c.id);
        return true;
      });

      // Mapear para o formato esperado
      const exclusoesFinal: ExclusaoConsultor[] = await Promise.all(
        resultado.map(async c => {
          // ✅ CORREÇÃO 1: Buscar cliente corretamente
          const { razaoSocial, idGestaoComercial } = await buscarNomeCliente(
            c.cliente_id,
            c.gestor_imediato_id,
            clientsMap,
            usuariosClienteMap
          );
          
          const gestorComercial = idGestaoComercial ? gestoresMap.get(idGestaoComercial) : null;
          
          // ✅ CORREÇÃO: Cálculo do valor mensal
          // PJ = valor_faturamento * 168
          // CLT = 0
          const modalidade = c.modalidade_contrato || 'PJ';
          const valorMensal = modalidade === 'CLT' ? 0 : (c.valor_faturamento || 0) * 168;
          
          return {
            consultor_id: c.id,
            nome_consultores: c.nome_consultores || '',
            cargo_consultores: c.cargo_consultores || '',
            razao_social_cliente: razaoSocial,
            // ✅ CORREÇÃO 2: MOTIVAÇÃO agora é motivo_desligamento
            motivo_desligamento: c.motivo_desligamento || 'Não informado',
            // ✅ CORREÇÃO 3: SUBSTITUIÇÃO como "Sim" ou "Não"
            substituicao_label: c.substituicao === true ? 'Sim' : 'Não',
            regime_contratacao: modalidade,
            valor_mensal: valorMensal,
            valor_anual: valorMensal * 12,
            data_saida: c.data_saida,
            gestor_comercial_nome: gestorComercial?.nome_usuario || ''
          };
        })
      );

      // Filtrar por gestor comercial se especificado
      let exclusoesFiltradas = exclusoesFinal;
      if (gestorComercialId) {
        exclusoesFiltradas = await Promise.all(
          resultado.map(async c => {
            const { idGestaoComercial } = await buscarNomeCliente(
              c.cliente_id,
              c.gestor_imediato_id,
              clientsMap,
              usuariosClienteMap
            );
            return { ...c, idGestaoComercial };
          })
        ).then(items => 
          items
            .filter(c => c.idGestaoComercial === gestorComercialId)
            .map(c => exclusoesFinal.find(e => e.consultor_id === c.id)!)
            .filter(Boolean)
        );
      }

      console.log(`✅ EXCLUSÕES finais: ${exclusoesFiltradas.length}`);
      
      setExclusoes(gestorComercialId ? exclusoesFiltradas : exclusoesFinal);
      return gestorComercialId ? exclusoesFiltradas : exclusoesFinal;

    } catch (err: any) {
      console.error('Erro ao buscar exclusões:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // BUSCAR RESUMO MENSAL
  // ============================================

  const buscarResumoMensal = useCallback(async (ano?: number): Promise<ResumoMensal[]> => {
    try {
      const anoSelecionado = ano || new Date().getFullYear();
      
      const [todasInclusoes, todasExclusoes] = await Promise.all([
        buscarInclusoes(null, anoSelecionado, null),
        buscarExclusoes(null, anoSelecionado, null)
      ]);

      const resumo: ResumoMensal[] = MESES.map(m => {
        const inclusoesMes = todasInclusoes.filter(i => {
          const data = new Date(i.data_inclusao);
          return data.getMonth() + 1 === m.valor;
        });
        
        const exclusoesMes = todasExclusoes.filter(e => {
          const data = new Date(e.data_saida);
          return data.getMonth() + 1 === m.valor;
        });

        const qtdInc = inclusoesMes.length;
        const valorInc = inclusoesMes.reduce((sum, i) => sum + i.valor_mensal, 0);
        const qtdExc = exclusoesMes.length;
        const valorExc = exclusoesMes.reduce((sum, e) => sum + e.valor_mensal, 0);

        return {
          mes: m.valor,
          mes_label: m.label,
          qtd_inclusoes: qtdInc,
          valor_inclusoes: valorInc,
          qtd_exclusoes: qtdExc,
          valor_exclusoes: valorExc,
          saldo_liquido: qtdInc - qtdExc,
          valor_liquido: valorInc - valorExc
        };
      });

      setResumoMensal(resumo);
      return resumo;

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
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id_gestao_comercial')
        .eq('ativo_cliente', true)
        .not('id_gestao_comercial', 'is', null);
      
      if (!clientsData || clientsData.length === 0) {
        setGestoresComerciais([]);
        return [];
      }
      
      const idsUnicos = [...new Set(clientsData.map(c => c.id_gestao_comercial))];
      
      const { data: users } = await supabase
        .from('app_users')
        .select('id, nome_usuario')
        .in('id', idsUnicos)
        .eq('ativo_usuario', true)
        .order('nome_usuario');

      const gestores = users || [];
      setGestoresComerciais(gestores);
      return gestores;

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
    ano?: number | null,
    gestorComercialId?: number | null
  ) => {
    setLoading(true);
    
    const [inc, exc, gestores] = await Promise.all([
      buscarInclusoes(mes, ano, gestorComercialId),
      buscarExclusoes(mes, ano, gestorComercialId),
      buscarGestoresComerciais()
    ]);

    setLoading(false);
    
    return {
      inclusoes: inc,
      exclusoes: exc,
      gestores,
      totais: calcularTotais(inc, exc)
    };
  }, [buscarInclusoes, buscarExclusoes, buscarGestoresComerciais, calcularTotais]);

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
