/**
 * useVagas Hook - Gerenciamento de Vagas (RAISA)
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { Vaga } from '@/types';

export const useVagas = () => {
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todas as vagas
   */
  const loadVagas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vagas')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;

      const mappedVagas: Vaga[] = (data || []).map((vaga: any) => ({
        id: String(vaga.id),
        titulo: vaga.titulo,
        descricao: vaga.descricao,
        senioridade: vaga.senioridade,
        stack_tecnologica: vaga.stack_tecnologica,
        salario_min: vaga.salario_min,
        salario_max: vaga.salario_max,
        status: vaga.status,
        requisitos_obrigatorios: vaga.requisitos_obrigatorios,
        requisitos_desejaveis: vaga.requisitos_desejaveis,
        regime_contratacao: vaga.regime_contratacao,
        modalidade: vaga.modalidade,
        beneficios: vaga.beneficios,
        analista_id: vaga.analista_id,
        cliente_id: vaga.cliente_id,
        urgente: vaga.urgente,
        prazo_fechamento: vaga.prazo_fechamento,
        faturamento_mensal: vaga.faturamento_mensal,
        criado_em: vaga.criado_em,
        atualizado_em: vaga.atualizado_em
      }));

      setVagas(mappedVagas);
      console.log(`✅ ${mappedVagas.length} vagas carregadas`);
      return mappedVagas;
    } catch (err: any) {
      console.error('❌ Erro ao carregar vagas:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona uma nova vaga
   */
  const addVaga = async (newVaga: Omit<Vaga, 'id'>) => {
    try {
      console.log('➕ Criando vaga:', newVaga);

      const { data, error } = await supabase
        .from('vagas')
        .insert([{
          titulo: newVaga.titulo,
          descricao: newVaga.descricao,
          senioridade: newVaga.senioridade,
          stack_tecnologica: newVaga.stack_tecnologica,
          salario_min: newVaga.salario_min,
          salario_max: newVaga.salario_max,
          status: newVaga.status || 'aberta',
          requisitos_obrigatorios: newVaga.requisitos_obrigatorios,
          requisitos_desejaveis: newVaga.requisitos_desejaveis,
          regime_contratacao: newVaga.regime_contratacao,
          modalidade: newVaga.modalidade,
          beneficios: newVaga.beneficios,
          analista_id: newVaga.analista_id,
          cliente_id: newVaga.cliente_id,
          urgente: newVaga.urgente || false,
          prazo_fechamento: newVaga.prazo_fechamento,
          faturamento_mensal: newVaga.faturamento_mensal
        }])
        .select()
        .single();

      if (error) throw error;

      const createdVaga: Vaga = {
        id: String(data.id),
        titulo: data.titulo,
        descricao: data.descricao,
        senioridade: data.senioridade,
        stack_tecnologica: data.stack_tecnologica,
        salario_min: data.salario_min,
        salario_max: data.salario_max,
        status: data.status,
        requisitos_obrigatorios: data.requisitos_obrigatorios,
        requisitos_desejaveis: data.requisitos_desejaveis,
        regime_contratacao: data.regime_contratacao,
        modalidade: data.modalidade,
        beneficios: data.beneficios,
        analista_id: data.analista_id,
        cliente_id: data.cliente_id,
        urgente: data.urgente,
        prazo_fechamento: data.prazo_fechamento,
        faturamento_mensal: data.faturamento_mensal,
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em
      };

      setVagas(prev => [createdVaga, ...prev]);
      console.log('✅ Vaga criada:', createdVaga);
      
      return createdVaga;
    } catch (err: any) {
      console.error('❌ Erro ao criar vaga:', err);
      alert(`Erro ao criar vaga: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza uma vaga existente
   */
  const updateVaga = async (id: string, updates: Partial<Vaga>) => {
    try {
      console.log('📝 Atualizando vaga:', id, updates);

      const { data, error } = await supabase
        .from('vagas')
        .update({
          titulo: updates.titulo,
          descricao: updates.descricao,
          senioridade: updates.senioridade,
          stack_tecnologica: updates.stack_tecnologica,
          salario_min: updates.salario_min,
          salario_max: updates.salario_max,
          status: updates.status,
          requisitos_obrigatorios: updates.requisitos_obrigatorios,
          requisitos_desejaveis: updates.requisitos_desejaveis,
          regime_contratacao: updates.regime_contratacao,
          modalidade: updates.modalidade,
          beneficios: updates.beneficios,
          analista_id: updates.analista_id,
          cliente_id: updates.cliente_id,
          urgente: updates.urgente,
          prazo_fechamento: updates.prazo_fechamento,
          faturamento_mensal: updates.faturamento_mensal,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      const updatedVaga: Vaga = {
        id: String(data.id),
        titulo: data.titulo,
        descricao: data.descricao,
        senioridade: data.senioridade,
        stack_tecnologica: data.stack_tecnologica,
        salario_min: data.salario_min,
        salario_max: data.salario_max,
        status: data.status,
        requisitos_obrigatorios: data.requisitos_obrigatorios,
        requisitos_desejaveis: data.requisitos_desejaveis,
        regime_contratacao: data.regime_contratacao,
        modalidade: data.modalidade,
        beneficios: data.beneficios,
        analista_id: data.analista_id,
        cliente_id: data.cliente_id,
        urgente: data.urgente,
        prazo_fechamento: data.prazo_fechamento,
        faturamento_mensal: data.faturamento_mensal,
        criado_em: data.criado_em,
        atualizado_em: data.atualizado_em
      };

      setVagas(prev => prev.map(v => v.id === id ? updatedVaga : v));
      console.log('✅ Vaga atualizada:', updatedVaga);
      
      return updatedVaga;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar vaga:', err);
      alert(`Erro ao atualizar vaga: ${err.message}`);
      throw err;
    }
  };

  /**
   * Deleta uma vaga
   */
  const deleteVaga = async (id: string) => {
    try {
      console.log('🗑️ Deletando vaga:', id);

      const { error } = await supabase
        .from('vagas')
        .delete()
        .eq('id', parseInt(id));

      if (error) throw error;

      setVagas(prev => prev.filter(v => v.id !== id));
      console.log('✅ Vaga deletada');
    } catch (err: any) {
      console.error('❌ Erro ao deletar vaga:', err);
      alert(`Erro ao deletar vaga: ${err.message}`);
      throw err;
    }
  };

  return {
    vagas,
    setVagas,
    loading,
    error,
    loadVagas,
    addVaga,
    updateVaga,
    deleteVaga
  };
};
