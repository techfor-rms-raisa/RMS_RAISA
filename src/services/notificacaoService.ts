/**
 * NOTIFICAÇÃO SERVICE
 * Gerencia notificações para usuários
 */

import { supabase } from '../config/supabase';

export interface Notificacao {
  id: number;
  usuario_id: number;
  tipo_notificacao: string;
  titulo: string;
  mensagem: string;
  link_relacionado?: string;
  dados_adicionais?: any;
  lida: boolean;
  lida_em?: string;
  criado_em: string;
}

class NotificacaoService {
  
  // ============================================
  // CRIAR NOTIFICAÇÕES
  // ============================================
  
  async criar(
    usuarioId: number,
    tipo: string,
    titulo: string,
    mensagem: string,
    link?: string,
    dados?: any
  ): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('notificacoes')
        .insert({
          usuario_id: usuarioId,
          tipo_notificacao: tipo,
          titulo,
          mensagem,
          link_relacionado: link,
          dados_adicionais: dados
        })
        .select('id')
        .single();
      
      if (error) throw error;
      
      return data.id;
    } catch (error) {
      console.error('Erro ao criar notificação:', error);
      throw error;
    }
  }
  
  // ============================================
  // NOTIFICAÇÕES ESPECÍFICAS
  // ============================================
  
  async notificarNovaVaga(gestorId: number, vagaId: number, vagaTitulo: string): Promise<void> {
    await this.criar(
      gestorId,
      'nova_vaga',
      '📋 Nova vaga criada',
      `A vaga "${vagaTitulo}" foi criada e está aguardando revisão pela IA.`,
      `/vagas/${vagaId}`
    );
  }
  
  async notificarDescricaoPronta(vagaId: number, vagaTitulo: string): Promise<void> {
    // Buscar gestor de R&S
    const { data: gestores } = await supabase
      .from('app_users')
      .select('id')
      .eq('role', 'Gestão de Pessoas')
      .eq('ativo', true);
    
    if (!gestores || gestores.length === 0) return;
    
    for (const gestor of gestores) {
      await this.criar(
        gestor.id,
        'descricao_pronta',
        '✨ Descrição melhorada pela IA',
        `A descrição da vaga "${vagaTitulo}" foi melhorada pela IA e está aguardando sua aprovação.`,
        `/vagas/${vagaId}/aprovar-descricao`
      );
    }
  }
  
  async notificarPriorizacaoPronta(gestorId: number, vagaId: number, vagaTitulo: string): Promise<void> {
    await this.criar(
      gestorId,
      'priorizacao_pronta',
      '🎯 Priorização calculada',
      `A vaga "${vagaTitulo}" foi priorizada pela IA e está aguardando sua aprovação.`,
      `/vagas/${vagaId}/aprovar-priorizacao`
    );
  }
  
  async notificarSugestaoRepriorizacao(
    gestorId: number,
    vagaId: number,
    vagaTitulo: string,
    nivelAtual: string,
    nivelSugerido: string
  ): Promise<void> {
    await this.criar(
      gestorId,
      'sugestao_repriorizacao',
      '🔄 Sugestão de repriorização',
      `A IA sugere alterar a prioridade da vaga "${vagaTitulo}" de ${nivelAtual} para ${nivelSugerido}.`,
      `/vagas/${vagaId}/repriorizacao`,
      {
        nivel_atual: nivelAtual,
        nivel_sugerido: nivelSugerido
      }
    );
  }
  
  async notificarVagaRedistribuida(
    analistaId: number,
    vagaId: number,
    analistaAnterior: string
  ): Promise<void> {
    await this.criar(
      analistaId,
      'vaga_redistribuida',
      '📬 Nova vaga atribuída',
      `Uma vaga foi redistribuída de ${analistaAnterior} para você.`,
      `/vagas/${vagaId}`
    );
  }
  
  // ============================================
  // CONSULTAR NOTIFICAÇÕES
  // ============================================
  
  async buscarPorUsuario(usuarioId: number, apenasNaoLidas: boolean = false): Promise<Notificacao[]> {
    try {
      let query = supabase
        .from('notificacoes')
        .select('*')
        .eq('usuario_id', usuarioId);
      
      if (apenasNaoLidas) {
        query = query.eq('lida', false);
      }
      
      const { data, error } = await query
        .order('criado_em', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      throw error;
    }
  }
  
  async contarNaoLidas(usuarioId: number): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('notificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId)
        .eq('lida', false);
      
      if (error) throw error;
      
      return count || 0;
    } catch (error) {
      console.error('Erro ao contar notificações não lidas:', error);
      return 0;
    }
  }
  
  // ============================================
  // MARCAR COMO LIDA
  // ============================================
  
  async marcarComoLida(notificacaoId: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('notificacoes')
        .update({
          lida: true,
          lida_em: new Date().toISOString()
        })
        .eq('id', notificacaoId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      throw error;
    }
  }
  
  async marcarTodasComoLidas(usuarioId: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('notificacoes')
        .update({
          lida: true,
          lida_em: new Date().toISOString()
        })
        .eq('usuario_id', usuarioId)
        .eq('lida', false);
      
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao marcar todas notificações como lidas:', error);
      throw error;
    }
  }
  
  // ============================================
  // LIMPAR NOTIFICAÇÕES ANTIGAS
  // ============================================
  
  async limparAntigas(diasRetencao: number = 30): Promise<void> {
    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - diasRetencao);
      
      const { error } = await supabase
        .from('notificacoes')
        .delete()
        .eq('lida', true)
        .lt('criado_em', dataLimite.toISOString());
      
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao limpar notificações antigas:', error);
      throw error;
    }
  }
}

export const notificacaoService = new NotificacaoService();
