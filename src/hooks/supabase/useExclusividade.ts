/**
 * useExclusividade.ts - Hook para gerenciar configurações de exclusividade
 * 
 * 🆕 v56.0: Sistema de Exclusividade de Candidatos
 * 
 * Data: 11/01/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { ConfigExclusividade, NotificacaoExclusividade } from '@/types';

// ============================================
// HOOK PRINCIPAL
// ============================================

export function useExclusividade() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigExclusividade | null>(null);
  const [notificacoes, setNotificacoes] = useState<NotificacaoExclusividade[]>([]);

  // ============================================
  // CONFIGURAÇÃO
  // ============================================

  /**
   * Busca configuração ativa de exclusividade
   */
  const buscarConfigExclusividade = useCallback(async (): Promise<ConfigExclusividade | null> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('config_exclusividade')
        .select('*')
        .eq('ativa', true)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setConfig(data);
      return data;
    } catch (err: any) {
      console.error('Erro ao buscar config exclusividade:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Atualiza configuração de exclusividade
   */
  const atualizarConfigExclusividade = useCallback(async (
    configAtualizada: Partial<ConfigExclusividade>,
    usuarioId: number
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    try {
      setLoading(true);

      // Validações
      if (configAtualizada.periodo_exclusividade_default !== undefined) {
        if (configAtualizada.periodo_exclusividade_default < 30 || configAtualizada.periodo_exclusividade_default > 90) {
          return { sucesso: false, mensagem: 'Período de exclusividade deve ser entre 30 e 90 dias' };
        }
      }

      if (configAtualizada.periodo_renovacao !== undefined) {
        if (configAtualizada.periodo_renovacao < 15 || configAtualizada.periodo_renovacao > 60) {
          return { sucesso: false, mensagem: 'Período de renovação deve ser entre 15 e 60 dias' };
        }
      }

      if (configAtualizada.max_renovacoes !== undefined) {
        if (configAtualizada.max_renovacoes < 1 || configAtualizada.max_renovacoes > 3) {
          return { sucesso: false, mensagem: 'Máximo de renovações deve ser entre 1 e 3' };
        }
      }

      // Buscar config atual
      const configAtual = await buscarConfigExclusividade();
      if (!configAtual) {
        return { sucesso: false, mensagem: 'Configuração ativa não encontrada' };
      }

      // Atualizar
      const { data, error } = await supabase
        .from('config_exclusividade')
        .update({
          ...configAtualizada,
          atualizado_em: new Date().toISOString(),
          atualizado_por: usuarioId
        })
        .eq('id', configAtual.id)
        .select()
        .single();

      if (error) throw error;
      
      setConfig(data);
      return { sucesso: true, mensagem: 'Configuração atualizada com sucesso!' };
    } catch (err: any) {
      console.error('Erro ao atualizar config:', err);
      return { sucesso: false, mensagem: err.message };
    } finally {
      setLoading(false);
    }
  }, [buscarConfigExclusividade]);

  // ============================================
  // NOTIFICAÇÕES
  // ============================================

  /**
   * Busca notificações de exclusividade do analista
   */
  const buscarNotificacoesExclusividade = useCallback(async (
    analistaId: number,
    apenasNaoLidas: boolean = true
  ): Promise<NotificacaoExclusividade[]> => {
    try {
      let query = supabase
        .from('notificacoes_exclusividade')
        .select(`
          *,
          pessoa:pessoas(nome)
        `)
        .eq('analista_id', analistaId)
        .order('criado_em', { ascending: false })
        .limit(50);

      if (apenasNaoLidas) {
        query = query.eq('lida', false);
      }

      const { data, error } = await query;

      if (error) throw error;

      const notifs = (data || []).map((n: any) => ({
        ...n,
        pessoa_nome: n.pessoa?.nome
      }));

      setNotificacoes(notifs);
      return notifs;
    } catch (err: any) {
      console.error('Erro ao buscar notificações:', err);
      return [];
    }
  }, []);

  /**
   * Marca notificação como lida
   */
  const marcarNotificacaoLida = useCallback(async (
    notificacaoId: number,
    acaoTomada?: 'renovado' | 'liberado' | 'ignorado'
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('notificacoes_exclusividade')
        .update({
          lida: true,
          lida_em: new Date().toISOString(),
          acao_tomada: acaoTomada
        })
        .eq('id', notificacaoId);

      if (error) throw error;

      // Atualizar estado local
      setNotificacoes(prev => prev.map(n => 
        n.id === notificacaoId 
          ? { ...n, lida: true, lida_em: new Date().toISOString(), acao_tomada: acaoTomada }
          : n
      ));

      return true;
    } catch (err: any) {
      console.error('Erro ao marcar notificação:', err);
      return false;
    }
  }, []);

  /**
   * Conta notificações não lidas
   */
  const contarNotificacoesNaoLidas = useCallback(async (
    analistaId: number
  ): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('notificacoes_exclusividade')
        .select('*', { count: 'exact', head: true })
        .eq('analista_id', analistaId)
        .eq('lida', false);

      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error('Erro ao contar notificações:', err);
      return 0;
    }
  }, []);

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  /**
   * Busca estatísticas de exclusividade do analista
   */
  const buscarEstatisticasAnalista = useCallback(async (
    analistaId: number
  ): Promise<{
    totalCandidatos: number;
    expirando15Dias: number;
    expirando5Dias: number;
    expirados: number;
    renovacoesDisponiveis: number;
  }> => {
    try {
      const agora = new Date();
      const em5Dias = new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000);
      const em15Dias = new Date(agora.getTime() + 15 * 24 * 60 * 60 * 1000);

      // Total de candidatos
      const { count: total } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('id_analista_rs', analistaId)
        .eq('ativo', true);

      // Expirando em 15 dias
      const { count: exp15 } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('id_analista_rs', analistaId)
        .eq('ativo', true)
        .lte('data_final_exclusividade', em15Dias.toISOString())
        .gt('data_final_exclusividade', agora.toISOString());

      // Expirando em 5 dias
      const { count: exp5 } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('id_analista_rs', analistaId)
        .eq('ativo', true)
        .lte('data_final_exclusividade', em5Dias.toISOString())
        .gt('data_final_exclusividade', agora.toISOString());

      // Expirados
      const { count: expirados } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('id_analista_rs', analistaId)
        .eq('ativo', true)
        .lt('data_final_exclusividade', agora.toISOString());

      // Podem renovar
      const { count: renovaveis } = await supabase
        .from('pessoas')
        .select('*', { count: 'exact', head: true })
        .eq('id_analista_rs', analistaId)
        .eq('ativo', true)
        .lt('qtd_renovacoes', 2); // max_renovacoes default

      return {
        totalCandidatos: total || 0,
        expirando15Dias: exp15 || 0,
        expirando5Dias: exp5 || 0,
        expirados: expirados || 0,
        renovacoesDisponiveis: renovaveis || 0
      };
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
      return {
        totalCandidatos: 0,
        expirando15Dias: 0,
        expirando5Dias: 0,
        expirados: 0,
        renovacoesDisponiveis: 0
      };
    }
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    loading,
    error,
    config,
    notificacoes,
    buscarConfigExclusividade,
    atualizarConfigExclusividade,
    buscarNotificacoesExclusividade,
    marcarNotificacaoLida,
    contarNotificacoesNaoLidas,
    buscarEstatisticasAnalista
  };
}

export default useExclusividade;
