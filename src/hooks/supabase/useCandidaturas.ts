/**
 * useCandidaturas Hook - Gerenciamento de Candidaturas (RAISA)
 * Módulo separado do useSupabaseData para melhor organização
 * 
 * 🆕 v2.1 (25/02/2026): Vinculação com analise_adequacao
 *   • Ao criar candidatura, atualiza candidatura_id na analise_adequacao existente (pessoa+vaga)
 *   • Garante que perguntas de entrevista geradas na Análise de Currículo fiquem acessíveis
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { Candidatura } from '@/types';

export const useCandidaturas = () => {
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todas as candidaturas
   */
  const loadCandidaturas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('candidaturas')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;

      const mappedCandidaturas: Candidatura[] = (data || []).map((candidatura: any) => ({
        id: String(candidatura.id),
        vaga_id: candidatura.vaga_id,
        pessoa_id: candidatura.pessoa_id,
        candidato_nome: candidatura.candidato_nome,
        candidato_email: candidatura.candidato_email,
        candidato_cpf: candidatura.candidato_cpf,
        analista_id: candidatura.analista_id,
        status: candidatura.status,
        curriculo_texto: candidatura.curriculo_texto,
        cv_url: candidatura.cv_url,
        observacoes: candidatura.observacoes,
        feedback_cliente: candidatura.feedback_cliente,
        data_envio_cliente: candidatura.data_envio_cliente,
        enviado_ao_cliente: candidatura.enviado_ao_cliente,
        criado_em: candidatura.criado_em,
        atualizado_em: candidatura.atualizado_em,
        // Campos de indicação (NOVO)
        origem: candidatura.origem || 'aquisicao',
        indicado_por_nome: candidatura.indicado_por_nome,
        indicado_por_cargo: candidatura.indicado_por_cargo,
        indicacao_data: candidatura.indicacao_data,
        indicacao_observacoes: candidatura.indicacao_observacoes
      }));

      setCandidaturas(mappedCandidaturas);
      console.log(`✅ ${mappedCandidaturas.length} candidaturas carregadas`);
      return mappedCandidaturas;
    } catch (err: any) {
      console.error('❌ Erro ao carregar candidaturas:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona uma nova candidatura
   * 🆕 v2.0: Atualiza automaticamente o status da vaga para 'em_andamento'
   * 🆕 v57.0: Status padrão alterado para 'entrevista' (não mais 'triagem')
   */
  const addCandidatura = async (newCandidatura: Omit<Candidatura, 'id'>) => {
    try {
      console.log('➕ Criando candidatura:', newCandidatura);

      const { data, error } = await supabase
        .from('candidaturas')
        .insert([{
          vaga_id: newCandidatura.vaga_id,
          pessoa_id: newCandidatura.pessoa_id,
          candidato_nome: newCandidatura.candidato_nome,
          candidato_email: newCandidatura.candidato_email,
          candidato_cpf: newCandidatura.candidato_cpf,
          analista_id: newCandidatura.analista_id,
          // 🆕 v57.0: Status padrão agora é 'entrevista'
          status: newCandidatura.status || 'entrevista',
          curriculo_texto: newCandidatura.curriculo_texto,
          cv_url: newCandidatura.cv_url,
          observacoes: newCandidatura.observacoes,
          feedback_cliente: newCandidatura.feedback_cliente,
          data_envio_cliente: newCandidatura.data_envio_cliente,
          enviado_ao_cliente: newCandidatura.enviado_ao_cliente || false,
          // Campos de indicação (NOVO)
          origem: newCandidatura.origem || 'aquisicao',
          indicado_por_nome: newCandidatura.indicado_por_nome,
          indicado_por_cargo: newCandidatura.indicado_por_cargo,
          indicacao_data: newCandidatura.indicacao_data,
          indicacao_observacoes: newCandidatura.indicacao_observacoes
        }])
        .select()
        .single();

      if (error) throw error;

      // 🆕 ATUALIZAR STATUS DA VAGA PARA 'em_andamento'
      if (newCandidatura.vaga_id) {
        const { data: vagaAtual } = await supabase
          .from('vagas')
          .select('status')
          .eq('id', newCandidatura.vaga_id)
          .single();

        // Só atualiza se a vaga estiver 'aberta'
        if (vagaAtual?.status === 'aberta') {
          const { error: vagaError } = await supabase
            .from('vagas')
            .update({ 
              status: 'em_andamento',
              atualizado_em: new Date().toISOString()
            })
            .eq('id', newCandidatura.vaga_id);

          if (vagaError) {
            console.warn('⚠️ Erro ao atualizar status da vaga:', vagaError);
          } else {
            console.log('✅ Status da vaga atualizado para em_andamento');
          }
        }
      }

      const createdCandidatura: Candidatura = {
        id: String(data.id),
        vaga_id: data.vaga_id,
        pessoa_id: data.pessoa_id,
        candidato_nome: data.candidato_nome,
        candidato_email: data.candidato_email,
        candidato_cpf: data.candidato_cpf,
        analista_id: data.analista_id,
        status: data.status,
        curriculo_texto: data.curriculo_texto,
        cv_url: data.cv_url,
        observacoes: data.observacoes,
        feedback_cliente: data.feedback_cliente,
        data_envio_cliente: data.data_envio_cliente,
        enviado_ao_cliente: data.enviado_ao_cliente,
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em,
        // Campos de indicação (NOVO)
        origem: data.origem || 'aquisicao',
        indicado_por_nome: data.indicado_por_nome,
        indicado_por_cargo: data.indicado_por_cargo,
        indicacao_data: data.indicacao_data,
        indicacao_observacoes: data.indicacao_observacoes
      };

      setCandidaturas(prev => [createdCandidatura, ...prev]);
      console.log('✅ Candidatura criada:', createdCandidatura);
      
      // 🆕 v2.1: Vincular candidatura_id na analise_adequacao existente (pessoa+vaga)
      if (data.pessoa_id && data.vaga_id) {
        try {
          const { data: analiseExistente, error: analiseErr } = await supabase
            .from('analise_adequacao')
            .select('id')
            .eq('pessoa_id', data.pessoa_id)
            .eq('vaga_id', data.vaga_id)
            .is('candidatura_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!analiseErr && analiseExistente?.id) {
            await supabase
              .from('analise_adequacao')
              .update({ 
                candidatura_id: data.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', analiseExistente.id);

            console.log(`✅ analise_adequacao (ID: ${analiseExistente.id}) vinculada à candidatura ${data.id}`);
          }
        } catch (errVinculo: any) {
          console.warn('⚠️ Erro ao vincular analise_adequacao:', errVinculo.message);
        }
      }

      return createdCandidatura;
    } catch (err: any) {
      console.error('❌ Erro ao criar candidatura:', err);
      alert(`Erro ao criar candidatura: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza o status de uma candidatura
   */
  const updateCandidaturaStatus = async (id: string, status: string) => {
    try {
      console.log('📝 Atualizando status da candidatura:', id, status);

      const { data, error } = await supabase
        .from('candidaturas')
        .update({
          status,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      const updatedCandidatura: Candidatura = {
        id: String(data.id),
        vaga_id: data.vaga_id,
        pessoa_id: data.pessoa_id,
        candidato_nome: data.candidato_nome,
        candidato_email: data.candidato_email,
        candidato_cpf: data.candidato_cpf,
        analista_id: data.analista_id,
        status: data.status,
        curriculo_texto: data.curriculo_texto,
        cv_url: data.cv_url,
        observacoes: data.observacoes,
        feedback_cliente: data.feedback_cliente,
        data_envio_cliente: data.data_envio_cliente,
        enviado_ao_cliente: data.enviado_ao_cliente,
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em,
        // Campos de indicação
        origem: data.origem || 'aquisicao',
        indicado_por_nome: data.indicado_por_nome,
        indicado_por_cargo: data.indicado_por_cargo,
        indicacao_data: data.indicacao_data,
        indicacao_observacoes: data.indicacao_observacoes
      };

      setCandidaturas(prev => prev.map(c => c.id === id ? updatedCandidatura : c));
      console.log('✅ Status da candidatura atualizado:', updatedCandidatura);
      
      return updatedCandidatura;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar status da candidatura:', err);
      alert(`Erro ao atualizar candidatura: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza uma candidatura completa
   */
  const updateCandidatura = async (id: string, updates: Partial<Candidatura>) => {
    try {
      console.log('📝 Atualizando candidatura:', id, updates);

      const { data, error } = await supabase
        .from('candidaturas')
        .update({
          vaga_id: updates.vaga_id,
          pessoa_id: updates.pessoa_id,
          candidato_nome: updates.candidato_nome,
          candidato_email: updates.candidato_email,
          candidato_cpf: updates.candidato_cpf,
          analista_id: updates.analista_id,
          status: updates.status,
          curriculo_texto: updates.curriculo_texto,
          cv_url: updates.cv_url,
          observacoes: updates.observacoes,
          feedback_cliente: updates.feedback_cliente,
          data_envio_cliente: updates.data_envio_cliente,
          enviado_ao_cliente: updates.enviado_ao_cliente,
          // Campos de indicação (NOVO)
          origem: updates.origem,
          indicado_por_nome: updates.indicado_por_nome,
          indicado_por_cargo: updates.indicado_por_cargo,
          indicacao_data: updates.indicacao_data,
          indicacao_observacoes: updates.indicacao_observacoes,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      const updatedCandidatura: Candidatura = {
        id: String(data.id),
        vaga_id: data.vaga_id,
        pessoa_id: data.pessoa_id,
        candidato_nome: data.candidato_nome,
        candidato_email: data.candidato_email,
        candidato_cpf: data.candidato_cpf,
        analista_id: data.analista_id,
        status: data.status,
        curriculo_texto: data.curriculo_texto,
        cv_url: data.cv_url,
        observacoes: data.observacoes,
        feedback_cliente: data.feedback_cliente,
        data_envio_cliente: data.data_envio_cliente,
        enviado_ao_cliente: data.enviado_ao_cliente,
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em,
        // Campos de indicação
        origem: data.origem || 'aquisicao',
        indicado_por_nome: data.indicado_por_nome,
        indicado_por_cargo: data.indicado_por_cargo,
        indicacao_data: data.indicacao_data,
        indicacao_observacoes: data.indicacao_observacoes
      };

      setCandidaturas(prev => prev.map(c => c.id === id ? updatedCandidatura : c));
      console.log('✅ Candidatura atualizada:', updatedCandidatura);
      
      return updatedCandidatura;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar candidatura:', err);
      alert(`Erro ao atualizar candidatura: ${err.message}`);
      throw err;
    }
  };

  /**
   * Busca candidaturas por vaga
   */
  const getCandidaturasByVaga = (vagaId: string): Candidatura[] => {
    return candidaturas.filter(c => c.vaga_id === vagaId);
  };

  /**
   * Busca candidaturas por pessoa
   */
  const getCandidaturasByPessoa = (pessoaId: string): Candidatura[] => {
    return candidaturas.filter(c => c.pessoa_id === pessoaId);
  };

  return {
    candidaturas,
    setCandidaturas,
    loading,
    error,
    loadCandidaturas,
    addCandidatura,
    updateCandidaturaStatus,
    updateCandidatura,
    getCandidaturasByVaga,
    getCandidaturasByPessoa
  };
};

