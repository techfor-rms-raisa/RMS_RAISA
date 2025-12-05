/**
 * VAGA WORKFLOW SERVICE
 * Gerencia o fluxo completo de 10 etapas de uma vaga
 */

import { supabase } from '../lib/supabase';
import { improveJobDescription } from './geminiService';
import { notificacaoService } from './notificacaoService';

export interface VagaWorkflow {
  id: number;
  titulo: string;
  status_workflow: string;
  descricao_original?: string;
  descricao_melhorada?: string;
  descricao_aprovada_em?: string;
  descricao_aprovada_por?: number;
  prioridade_aprovada_em?: string;
  prioridade_aprovada_por?: number;
  criado_em: string;
  atualizado_em: string;
}

export interface DescricaoHistorico {
  id: number;
  vaga_id: number;
  descricao_original: string;
  descricao_melhorada: string;
  mudancas_sugeridas: any;
  acao: 'aprovado' | 'editado_e_aprovado' | 'rejeitado';
  descricao_final?: string;
  aprovado_por_usuario_id?: number;
  aprovado_por_nome?: string;
  aprovado_em?: string;
  criado_em: string;
}

export interface RedistribuicaoHistorico {
  id: number;
  vaga_id: number;
  analista_anterior_id?: number;
  analista_anterior_nome?: string;
  analista_novo_id: number;
  analista_novo_nome: string;
  motivo: string;
  redistribuido_por_usuario_id: number;
  redistribuido_por_nome: string;
  redistribuido_em: string;
}

class VagaWorkflowService {
  
  // ============================================
  // ETAPA 1: CRIAR VAGA (RASCUNHO)
  // ============================================
  
  async criarVagaRascunho(vagaData: any): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('vagas')
        .insert({
          ...vagaData,
          status_workflow: 'rascunho',
          descricao_original: vagaData.descricao
        })
        .select('id')
        .single();
      
      if (error) throw error;
      
      return data.id;
    } catch (error) {
      console.error('Erro ao criar vaga rascunho:', error);
      throw error;
    }
  }
  
  // ============================================
  // ETAPA 2: MELHORAR DESCRIÇÃO COM IA
  // ============================================
  
  async melhorarDescricaoVaga(vagaId: number): Promise<{
    descricao_melhorada: string;
    mudancas_sugeridas: any;
  }> {
    try {
      // Buscar vaga
      const { data: vaga, error: vagaError } = await supabase
        .from('vagas')
        .select('*')
        .eq('id', vagaId)
        .single();
      
      if (vagaError) throw vagaError;
      
      // Melhorar descrição com IA
      const resultado = await improveJobDescription(
        vaga.descricao_original || vaga.descricao,
        {
          titulo: vaga.titulo,
          nivel_senioridade: vaga.nivel_senioridade,
          tipo_contrato: vaga.tipo_contrato,
          salario_min: vaga.salario_min,
          salario_max: vaga.salario_max
        }
      );
      
      // Atualizar vaga
      const { error: updateError } = await supabase
        .from('vagas')
        .update({
          descricao_melhorada: resultado.descricao_melhorada,
          status_workflow: 'aguardando_aprovacao_descricao'
        })
        .eq('id', vagaId);
      
      if (updateError) throw updateError;
      
      // Notificar Gestor de R&S
      await notificacaoService.notificarDescricaoPronta(vagaId, vaga.titulo);
      
      return resultado;
    } catch (error) {
      console.error('Erro ao melhorar descrição:', error);
      throw error;
    }
  }
  
  // ============================================
  // ETAPA 3: APROVAR/EDITAR DESCRIÇÃO
  // ============================================
  
  async aprovarDescricao(
    vagaId: number,
    acao: 'aprovado' | 'editado_e_aprovado' | 'rejeitado',
    descricaoFinal: string | null,
    usuarioId: number,
    usuarioNome: string
  ): Promise<void> {
    try {
      // Buscar vaga
      const { data: vaga, error: vagaError } = await supabase
        .from('vagas')
        .select('*')
        .eq('id', vagaId)
        .single();
      
      if (vagaError) throw vagaError;
      
      // Salvar no histórico
      const { error: historicoError } = await supabase
        .from('vaga_descricao_historico')
        .insert({
          vaga_id: vagaId,
          descricao_original: vaga.descricao_original,
          descricao_melhorada: vaga.descricao_melhorada,
          mudancas_sugeridas: {}, // TODO: extrair do geminiService
          acao,
          descricao_final: descricaoFinal,
          aprovado_por_usuario_id: usuarioId,
          aprovado_por_nome: usuarioNome,
          aprovado_em: new Date().toISOString()
        });
      
      if (historicoError) throw historicoError;
      
      // Atualizar vaga
      const descricaoAprovada = descricaoFinal || vaga.descricao_melhorada;
      
      const { error: updateError } = await supabase
        .from('vagas')
        .update({
          descricao: descricaoAprovada,
          descricao_aprovada_em: new Date().toISOString(),
          descricao_aprovada_por: usuarioId,
          status_workflow: acao === 'rejeitado' ? 'rascunho' : 'descricao_aprovada'
        })
        .eq('id', vagaId);
      
      if (updateError) throw updateError;
      
    } catch (error) {
      console.error('Erro ao aprovar descrição:', error);
      throw error;
    }
  }
  
  // ============================================
  // ETAPA 4: PRIORIZAR VAGA (já existe)
  // ============================================
  // Implementado em vagaPriorizacaoService.ts
  
  // ============================================
  // ETAPA 5: APROVAR PRIORIZAÇÃO
  // ============================================
  
  async aprovarPriorizacao(
    vagaId: number,
    usuarioId: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('vagas')
        .update({
          prioridade_aprovada_em: new Date().toISOString(),
          prioridade_aprovada_por: usuarioId,
          status_workflow: 'priorizada_e_distribuida'
        })
        .eq('id', vagaId);
      
      if (error) throw error;
      
    } catch (error) {
      console.error('Erro ao aprovar priorização:', error);
      throw error;
    }
  }
  
  // ============================================
  // ETAPA 6: REDISTRIBUIR VAGA (MANUAL)
  // ============================================
  
  async redistribuirVaga(
    vagaId: number,
    novoAnalistaId: number,
    novoAnalistaNome: string,
    motivo: string,
    redistribuidoPorId: number,
    redistribuidoPorNome: string
  ): Promise<void> {
    try {
      // Buscar analista anterior
      const { data: vaga, error: vagaError } = await supabase
        .from('vagas')
        .select('analista_id, analista_nome')
        .eq('id', vagaId)
        .single();
      
      if (vagaError) throw vagaError;
      
      // Salvar no histórico
      const { error: historicoError } = await supabase
        .from('vaga_redistribuicao_historico')
        .insert({
          vaga_id: vagaId,
          analista_anterior_id: vaga.analista_id,
          analista_anterior_nome: vaga.analista_nome,
          analista_novo_id: novoAnalistaId,
          analista_novo_nome: novoAnalistaNome,
          motivo,
          redistribuido_por_usuario_id: redistribuidoPorId,
          redistribuido_por_nome: redistribuidoPorNome,
          redistribuido_em: new Date().toISOString()
        });
      
      if (historicoError) throw historicoError;
      
      // Atualizar vaga
      const { error: updateError } = await supabase
        .from('vagas')
        .update({
          analista_id: novoAnalistaId,
          analista_nome: novoAnalistaNome
        })
        .eq('id', vagaId);
      
      if (updateError) throw updateError;
      
      // Notificar novo analista
      await notificacaoService.notificarVagaRedistribuida(
        novoAnalistaId,
        vagaId,
        vaga.analista_nome || 'N/A'
      );
      
    } catch (error) {
      console.error('Erro ao redistribuir vaga:', error);
      throw error;
    }
  }
  
  // ============================================
  // ETAPA 7-10: AVANÇAR WORKFLOW
  // ============================================
  
  async avancarWorkflow(
    vagaId: number,
    novoStatus: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('vagas')
        .update({
          status_workflow: novoStatus
        })
        .eq('id', vagaId);
      
      if (error) throw error;
      
    } catch (error) {
      console.error('Erro ao avançar workflow:', error);
      throw error;
    }
  }
  
  // ============================================
  // CONSULTAS
  // ============================================
  
  async buscarVagasPorStatus(status: string): Promise<VagaWorkflow[]> {
    try {
      const { data, error } = await supabase
        .from('vagas')
        .select('*')
        .eq('status_workflow', status)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar vagas por status:', error);
      throw error;
    }
  }
  
  async buscarHistoricoDescricao(vagaId: number): Promise<DescricaoHistorico[]> {
    try {
      const { data, error } = await supabase
        .from('vaga_descricao_historico')
        .select('*')
        .eq('vaga_id', vagaId)
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar histórico de descrição:', error);
      throw error;
    }
  }
  
  async buscarHistoricoRedistribuicao(vagaId: number): Promise<RedistribuicaoHistorico[]> {
    try {
      const { data, error } = await supabase
        .from('vaga_redistribuicao_historico')
        .select('*')
        .eq('vaga_id', vagaId)
        .order('redistribuido_em', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Erro ao buscar histórico de redistribuição:', error);
      throw error;
    }
  }
}

export const vagaWorkflowService = new VagaWorkflowService();
