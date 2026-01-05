/**
 * useMovimentacoes.ts - Hook para Movimentações de Consultores
 * 
 * ============================================
 * LÓGICA CORRETA:
 * 
 * INCLUSÕES = Consultores ATIVOS cuja data_inclusao_consultores
 *             está dentro do mês/ano selecionado
 *             
 * EXCLUSÕES = Consultores PERDIDOS/ENCERRADOS cuja data_saida
 *             está dentro do mês/ano selecionado
 * 
 * TIPO DE VAGA:
 * - substituicao = true  → "Reposição"
 * - substituicao = false → "Nova Posição"
 * ============================================
 * 
 * Versão: 3.0 - CORRIGIDA
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
  nome_substituido?: string; // Quem foi substituído (se reposição)
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
  // Lógica: Consultores ATIVOS com data_inclusao no mês/ano
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

      // ============================================
      // QUERY CORRETA:
      // - status = 'Ativo'
      // - ano_vigencia = ano selecionado (para evitar duplicatas de anos anteriores)
      // - data_inclusao_consultores filtrada por mês/ano
      // ============================================
      
      let query = supabase
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

      const { data: consultantsData, error: queryError } = await query;

      if (queryError) {
        console.error('Erro na query de inclusões:', queryError);
        throw queryError;
      }

      console.log(`📊 Consultores ativos encontrados: ${consultantsData?.length || 0}`);

      // Buscar dados auxiliares para montar o resultado
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, razao_social_cliente, id_gestao_comercial');
      
      const clientsMap = new Map((clientsData || []).map(c => [c.id, c]));

      const { data: gestoresData } = await supabase
        .from('app_users')
        .select('id, nome_usuario');
      
      const gestoresMap = new Map((gestoresData || []).map(g => [g.id, g]));

      // ============================================
      // FILTRAR POR MÊS/ANO DA DATA_INCLUSAO
      // ============================================
      let resultado = (consultantsData || []).filter(c => {
        if (!c.data_inclusao_consultores) return false;
        
        const dataInc = new Date(c.data_inclusao_consultores);
        const anoInclusao = dataInc.getFullYear();
        const mesInclusao = dataInc.getMonth() + 1;
        
        // Filtrar por ano da data de inclusão
        if (anoInclusao !== anoSelecionado) return false;
        
        // Filtrar por mês se especificado
        if (mes && mesInclusao !== mes) return false;
        
        return true;
      });

      console.log(`📊 Após filtro de data: ${resultado.length} inclusões`);

      // Filtrar por gestor comercial se especificado
      if (gestorComercialId) {
        resultado = resultado.filter(c => {
          const cliente = clientsMap.get(c.cliente_id);
          return cliente?.id_gestao_comercial === gestorComercialId;
        });
        console.log(`📊 Após filtro de gestor: ${resultado.length} inclusões`);
      }

      // ============================================
      // REMOVER DUPLICATAS (mesmo consultor_id)
      // ============================================
      const consultorIdsVistos = new Set<number>();
      const resultadoUnico = resultado.filter(c => {
        if (consultorIdsVistos.has(c.id)) {
          return false;
        }
        consultorIdsVistos.add(c.id);
        return true;
      });

      // Mapear para o formato esperado
      const inclusoesFinal: InclusaoConsultor[] = resultadoUnico.map(c => {
        const cliente = clientsMap.get(c.cliente_id);
        const gestorComercial = cliente ? gestoresMap.get(cliente.id_gestao_comercial) : null;
        
        return {
          consultor_id: c.id,
          nome_consultores: c.nome_consultores || '',
          cargo_consultores: c.cargo_consultores || '',
          razao_social_cliente: cliente?.razao_social_cliente || 'Cliente não identificado',
          // ✅ CORREÇÃO: Usar campo substituicao (boolean)
          tipo_de_vaga: c.substituicao === true ? 'Reposição' : 'Nova Posição',
          regime_contratacao: c.modalidade_contrato || 'PJ',
          valor_mensal: c.valor_faturamento || c.valor_pagamento || 0,
          valor_anual: (c.valor_faturamento || c.valor_pagamento || 0) * 12,
          data_inclusao: c.data_inclusao_consultores,
          gestor_comercial_nome: gestorComercial?.nome_usuario || '',
          nome_substituido: c.nome_substituido || undefined
        };
      });

      console.log(`✅ INCLUSÕES finais: ${inclusoesFinal.length}`);
      
      setInclusoes(inclusoesFinal);
      return inclusoesFinal;

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
  // Lógica: Consultores PERDIDOS/ENCERRADOS com data_saida no mês/ano
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

      // ============================================
      // QUERY CORRETA:
      // - status IN ('Perdido', 'Encerrado')
      // - ano_vigencia = ano selecionado
      // - data_saida filtrada por mês/ano
      // ============================================
      
      let query = supabase
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

      const { data: consultantsData, error: queryError } = await query;

      if (queryError) {
        console.error('Erro na query de exclusões:', queryError);
        throw queryError;
      }

      console.log(`📊 Consultores perdidos/encerrados encontrados: ${consultantsData?.length || 0}`);

      // Buscar dados auxiliares
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, razao_social_cliente, id_gestao_comercial');
      
      const clientsMap = new Map((clientsData || []).map(c => [c.id, c]));

      const { data: gestoresData } = await supabase
        .from('app_users')
        .select('id, nome_usuario');
      
      const gestoresMap = new Map((gestoresData || []).map(g => [g.id, g]));

      // ============================================
      // FILTRAR POR MÊS/ANO DA DATA_SAIDA
      // ============================================
      let resultado = (consultantsData || []).filter(c => {
        if (!c.data_saida) return false;
        
        const dataSaida = new Date(c.data_saida);
        const anoSaida = dataSaida.getFullYear();
        const mesSaida = dataSaida.getMonth() + 1;
        
        // Filtrar por ano da data de saída
        if (anoSaida !== anoSelecionado) return false;
        
        // Filtrar por mês se especificado
        if (mes && mesSaida !== mes) return false;
        
        return true;
      });

      console.log(`📊 Após filtro de data: ${resultado.length} exclusões`);

      // Filtrar por gestor comercial se especificado
      if (gestorComercialId) {
        resultado = resultado.filter(c => {
          const cliente = clientsMap.get(c.cliente_id);
          return cliente?.id_gestao_comercial === gestorComercialId;
        });
        console.log(`📊 Após filtro de gestor: ${resultado.length} exclusões`);
      }

      // ============================================
      // REMOVER DUPLICATAS
      // ============================================
      const consultorIdsVistos = new Set<number>();
      const resultadoUnico = resultado.filter(c => {
        if (consultorIdsVistos.has(c.id)) {
          return false;
        }
        consultorIdsVistos.add(c.id);
        return true;
      });

      // Mapear para o formato esperado
      const exclusoesFinal: ExclusaoConsultor[] = resultadoUnico.map(c => {
        const cliente = clientsMap.get(c.cliente_id);
        const gestorComercial = cliente ? gestoresMap.get(cliente.id_gestao_comercial) : null;
        
        return {
          consultor_id: c.id,
          nome_consultores: c.nome_consultores || '',
          cargo_consultores: c.cargo_consultores || '',
          razao_social_cliente: cliente?.razao_social_cliente || 'Cliente não identificado',
          // Para exclusões: se teve substituição = "Reposição" (alguém entrou no lugar)
          // Se não teve = "Sem Reposição"
          label_substituicao: c.substituicao === true ? 'Reposição' : 'Sem Reposição',
          regime_contratacao: c.modalidade_contrato || 'PJ',
          valor_mensal: c.valor_faturamento || c.valor_pagamento || 0,
          valor_anual: (c.valor_faturamento || c.valor_pagamento || 0) * 12,
          data_saida: c.data_saida,
          motivo_desligamento: c.motivo_desligamento || '',
          gestor_comercial_nome: gestorComercial?.nome_usuario || ''
        };
      });

      console.log(`✅ EXCLUSÕES finais: ${exclusoesFinal.length}`);
      
      setExclusoes(exclusoesFinal);
      return exclusoesFinal;

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
      
      // Buscar todas as inclusões e exclusões do ano
      const [todasInclusoes, todasExclusoes] = await Promise.all([
        buscarInclusoes(null, anoSelecionado, null),
        buscarExclusoes(null, anoSelecionado, null)
      ]);

      // Agrupar por mês
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
      // Buscar IDs únicos de gestores comerciais nos clientes ativos
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id_gestao_comercial')
        .eq('ativo_cliente', true)
        .not('id_gestao_comercial', 'is', null);
      
      if (!clientsData || clientsData.length === 0) {
        setGestoresComerciais([]);
        return [];
      }
      
      // Extrair IDs únicos
      const idsUnicos = [...new Set(clientsData.map(c => c.id_gestao_comercial))];
      
      // Buscar dados dos usuários correspondentes
      const { data: users } = await supabase
        .from('app_users')
        .select('id, nome_usuario')
        .in('id', idsUnicos)
        .eq('ativo_usuario', true)
        .order('nome_usuario');

      const gestores = users || [];
      console.log('✅ Gestores comerciais carregados:', gestores.map(g => g.nome_usuario));
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
