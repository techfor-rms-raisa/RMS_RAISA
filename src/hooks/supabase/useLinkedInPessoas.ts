/**
 * useLinkedInPessoas.ts - Hook para gerenciar pessoas importadas do LinkedIn
 * 
 * Este hook busca diretamente da tabela PESSOAS (não de tabela separada)
 * permitindo visualizar, filtrar e gerenciar candidatos importados via LinkedIn
 * 
 * Versão: 2.0
 * Data: 09/01/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

export interface PessoaLinkedIn {
  id: number;
  nome: string;
  email?: string;
  telefone?: string;
  titulo_profissional?: string;
  linkedin_url?: string;
  cidade?: string;
  estado?: string;
  senioridade?: string;
  resumo_profissional?: string;
  disponibilidade?: string;
  modalidade_preferida?: string;
  ativo: boolean;
  origem: string;
  criado_em: string;
  atualizado_em?: string;
  importado_em?: string;
  total_skills?: number;
  total_experiencias?: number;
  total_formacoes?: number;
  skills_lista?: string[];
  // 🆕 Campos de exclusividade
  id_analista_rs?: number | null;
  periodo_exclusividade?: number;
  data_inicio_exclusividade?: string;
  data_final_exclusividade?: string;
  qtd_renovacoes?: number;
  max_renovacoes?: number;
  analista_nome?: string;
}

export interface EstatisticasOrigem {
  origem: string;
  total: number;
  ativos: number;
  ultimos_30_dias: number;
  ultimos_7_dias: number;
  ultimo_cadastro?: string;
}

export interface FiltrosPessoas {
  origem?: string;
  termo?: string;
  senioridade?: string;
  limite?: number;
  offset?: number;
}

// ============================================
// HOOK
// ============================================

export function useLinkedInPessoas() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaLinkedIn[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasOrigem[]>([]);

  // ============================================
  // BUSCAR PESSOAS POR ORIGEM
  // ============================================

  const buscarPessoas = useCallback(async (filtros?: FiltrosPessoas): Promise<PessoaLinkedIn[]> => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('pessoas')
        .select(`
          id,
          nome,
          email,
          telefone,
          titulo_profissional,
          linkedin_url,
          cidade,
          estado,
          senioridade,
          resumo_profissional,
          disponibilidade,
          modalidade_preferida,
          ativo,
          origem,
          criado_em,
          atualizado_em,
          id_analista_rs,
          periodo_exclusividade,
          data_inicio_exclusividade,
          data_final_exclusividade,
          qtd_renovacoes,
          max_renovacoes
        `)
        .eq('ativo', true)
        .order('criado_em', { ascending: false });

      // Filtrar por origem
      if (filtros?.origem) {
        query = query.eq('origem', filtros.origem);
      }

      // Filtrar por termo (nome ou email)
      if (filtros?.termo) {
        query = query.or(`nome.ilike.%${filtros.termo}%,email.ilike.%${filtros.termo}%`);
      }

      // Filtrar por senioridade
      if (filtros?.senioridade) {
        query = query.eq('senioridade', filtros.senioridade);
      }

      // Limite e offset
      if (filtros?.limite) {
        query = query.limit(filtros.limite);
      }

      if (filtros?.offset) {
        query = query.range(filtros.offset, filtros.offset + (filtros.limite || 50) - 1);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Buscar skills para cada pessoa
      const pessoasComSkills: PessoaLinkedIn[] = await Promise.all(
        (data || []).map(async (pessoa) => {
          const { data: skills } = await supabase
            .from('pessoa_skills')
            .select('skill_nome')
            .eq('pessoa_id', pessoa.id)
            .limit(10);

          const { count: totalSkills } = await supabase
            .from('pessoa_skills')
            .select('*', { count: 'exact', head: true })
            .eq('pessoa_id', pessoa.id);

          const { count: totalExp } = await supabase
            .from('pessoa_experiencias')
            .select('*', { count: 'exact', head: true })
            .eq('pessoa_id', pessoa.id);

          const { count: totalForm } = await supabase
            .from('pessoa_formacao')
            .select('*', { count: 'exact', head: true })
            .eq('pessoa_id', pessoa.id);

          return {
            ...pessoa,
            skills_lista: skills?.map(s => s.skill_nome) || [],
            total_skills: totalSkills || 0,
            total_experiencias: totalExp || 0,
            total_formacoes: totalForm || 0
          };
        })
      );

      setPessoas(pessoasComSkills);
      return pessoasComSkills;

    } catch (err: any) {
      console.error('Erro ao buscar pessoas:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // BUSCAR APENAS DO LINKEDIN
  // ============================================

  const buscarPessoasLinkedIn = useCallback(async (filtros?: Omit<FiltrosPessoas, 'origem'>): Promise<PessoaLinkedIn[]> => {
    return buscarPessoas({ ...filtros, origem: 'linkedin' });
  }, [buscarPessoas]);

  // ============================================
  // BUSCAR ESTATÍSTICAS POR ORIGEM
  // ============================================

  const buscarEstatisticas = useCallback(async (): Promise<EstatisticasOrigem[]> => {
    try {
      // Estatísticas gerais
      const { data: stats } = await supabase
        .from('pessoas')
        .select('origem')
        .eq('ativo', true);

      if (!stats) return [];

      // Agrupar por origem
      const agrupado: Record<string, EstatisticasOrigem> = {};
      
      for (const pessoa of stats) {
        const origem = pessoa.origem || 'manual';
        if (!agrupado[origem]) {
          agrupado[origem] = {
            origem,
            total: 0,
            ativos: 0,
            ultimos_30_dias: 0,
            ultimos_7_dias: 0
          };
        }
        agrupado[origem].total++;
        agrupado[origem].ativos++;
      }

      // Buscar contagens específicas
      for (const origem of Object.keys(agrupado)) {
        // Últimos 30 dias
        const { count: count30 } = await supabase
          .from('pessoas')
          .select('*', { count: 'exact', head: true })
          .eq('origem', origem)
          .eq('ativo', true)
          .gte('criado_em', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        
        agrupado[origem].ultimos_30_dias = count30 || 0;

        // Últimos 7 dias
        const { count: count7 } = await supabase
          .from('pessoas')
          .select('*', { count: 'exact', head: true })
          .eq('origem', origem)
          .eq('ativo', true)
          .gte('criado_em', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        
        agrupado[origem].ultimos_7_dias = count7 || 0;
      }

      const resultado = Object.values(agrupado).sort((a, b) => b.total - a.total);
      setEstatisticas(resultado);
      return resultado;

    } catch (err: any) {
      console.error('Erro ao buscar estatísticas:', err);
      return [];
    }
  }, []);

  // ============================================
  // BUSCAR ESTATÍSTICAS LINKEDIN ESPECÍFICAS
  // ============================================

  const buscarEstatisticasLinkedIn = useCallback(async (): Promise<{
    totalImportados: number;
    importadosHoje: number;
    importadosSemana: number;
    importadosMes: number;
  }> => {
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const mesAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Total
      const { count: total } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('origem', 'linkedin')
        .eq('ativo', true);

      // Hoje
      const { count: countHoje } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('origem', 'linkedin')
        .gte('criado_em', hoje.toISOString());

      // Semana
      const { count: countSemana } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('origem', 'linkedin')
        .gte('criado_em', semanaAtras.toISOString());

      // Mês
      const { count: countMes } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('origem', 'linkedin')
        .gte('criado_em', mesAtras.toISOString());

      return {
        totalImportados: total || 0,
        importadosHoje: countHoje || 0,
        importadosSemana: countSemana || 0,
        importadosMes: countMes || 0
      };

    } catch (err: any) {
      console.error('Erro ao buscar estatísticas LinkedIn:', err);
      return {
        totalImportados: 0,
        importadosHoje: 0,
        importadosSemana: 0,
        importadosMes: 0
      };
    }
  }, []);

  // ============================================
  // ATUALIZAR PERFIL (Re-importar do LinkedIn)
  // ============================================

  const atualizarPerfil = useCallback(async (
    pessoaId: number,
    dadosAtualizados: Partial<PessoaLinkedIn>
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('pessoas')
        .update({
          ...dadosAtualizados,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pessoaId);

      if (updateError) throw updateError;

      return {
        sucesso: true,
        mensagem: 'Perfil atualizado com sucesso!'
      };

    } catch (err: any) {
      console.error('Erro ao atualizar perfil:', err);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // 🆕 ATRIBUIR ANALISTA RESPONSÁVEL (EXCLUSIVIDADE)
  // ============================================

  const atribuirAnalista = useCallback(async (
    pessoaId: number,
    analistaId: number,
    periodoExclusividade: number = 60
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    setLoading(true);

    try {
      const dataInicio = new Date();
      const dataFinal = new Date();
      dataFinal.setDate(dataFinal.getDate() + periodoExclusividade);

      const { error: updateError } = await supabase
        .from('pessoas')
        .update({
          id_analista_rs: analistaId,
          periodo_exclusividade: periodoExclusividade,
          data_inicio_exclusividade: dataInicio.toISOString(),
          data_final_exclusividade: dataFinal.toISOString(),
          qtd_renovacoes: 0,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pessoaId);

      if (updateError) throw updateError;

      return {
        sucesso: true,
        mensagem: `Exclusividade de ${periodoExclusividade} dias atribuída com sucesso!`
      };

    } catch (err: any) {
      console.error('Erro ao atribuir analista:', err);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // 🆕 REMOVER EXCLUSIVIDADE
  // ============================================

  const removerExclusividade = useCallback(async (
    pessoaId: number
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('pessoas')
        .update({
          id_analista_rs: null,
          periodo_exclusividade: null,
          data_inicio_exclusividade: null,
          data_final_exclusividade: null,
          qtd_renovacoes: 0,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pessoaId);

      if (updateError) throw updateError;

      return {
        sucesso: true,
        mensagem: 'Exclusividade removida com sucesso!'
      };

    } catch (err: any) {
      console.error('Erro ao remover exclusividade:', err);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // 🆕 DELETAR PESSOA (Inativar)
  // ============================================

  const deletarPessoa = useCallback(async (
    pessoaId: number
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    setLoading(true);

    try {
      // Soft delete - apenas inativa a pessoa
      const { error: updateError } = await supabase
        .from('pessoas')
        .update({
          ativo: false,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pessoaId);

      if (updateError) throw updateError;

      // Remover da lista local
      setPessoas(prev => prev.filter(p => p.id !== pessoaId));

      return {
        sucesso: true,
        mensagem: 'Candidato removido com sucesso!'
      };

    } catch (err: any) {
      console.error('Erro ao deletar pessoa:', err);
      return {
        sucesso: false,
        mensagem: err.message
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // 🆕 BUSCAR PESSOA POR ID (para edição)
  // ============================================

  const buscarPessoaPorId = useCallback(async (
    pessoaId: number
  ): Promise<PessoaLinkedIn | null> => {
    try {
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .eq('id', pessoaId)
        .single();

      if (error) throw error;
      return data;

    } catch (err: any) {
      console.error('Erro ao buscar pessoa:', err);
      return null;
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    loading,
    error,
    pessoas,
    estatisticas,
    buscarPessoas,
    buscarPessoasLinkedIn,
    buscarEstatisticas,
    buscarEstatisticasLinkedIn,
    atualizarPerfil,
    // 🆕 Novas funções CRUD
    atribuirAnalista,
    removerExclusividade,
    deletarPessoa,
    buscarPessoaPorId
  };
}

export default useLinkedInPessoas;
