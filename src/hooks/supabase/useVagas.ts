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
        status_posicao: vaga.status_posicao || 'triagem', // 🆕 Posição no funil
        requisitos_obrigatorios: vaga.requisitos_obrigatorios,
        requisitos_desejaveis: vaga.requisitos_desejaveis,
        regime_contratacao: vaga.regime_contratacao,
        modalidade: vaga.modalidade,
        tipo_remuneracao: vaga.tipo_remuneracao,
        beneficios: vaga.beneficios,
        analista_id: vaga.analista_id,
        cliente_id: vaga.cliente_id,
        urgente: vaga.urgente,
        prazo_fechamento: vaga.prazo_fechamento,
        faturamento_mensal: vaga.faturamento_mensal,
        // ✅ CAMPOS FALTANTES
        ocorrencia: vaga.ocorrencia,
        tipo_de_vaga: vaga.tipo_de_vaga,
        vaga_faturavel: vaga.vaga_faturavel,
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
          status_posicao: newVaga.status_posicao || 'triagem', // 🆕 Posição no funil
          requisitos_obrigatorios: newVaga.requisitos_obrigatorios,
          requisitos_desejaveis: newVaga.requisitos_desejaveis,
          regime_contratacao: newVaga.regime_contratacao,
          modalidade: newVaga.modalidade,
          tipo_remuneracao: (newVaga as any).tipo_remuneracao || 'Hora Aberta',
          beneficios: newVaga.beneficios,
          analista_id: newVaga.analista_id,
          cliente_id: newVaga.cliente_id,
          urgente: newVaga.urgente || false,
          prazo_fechamento: newVaga.prazo_fechamento,
          faturamento_mensal: newVaga.faturamento_mensal,
          // ✅ CAMPOS FALTANTES
          ocorrencia: (newVaga as any).ocorrencia || null,
          tipo_de_vaga: (newVaga as any).tipo_de_vaga || 'Nova Posição',
          vaga_faturavel: (newVaga as any).vaga_faturavel !== false
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
        status_posicao: data.status_posicao || 'triagem', // 🆕 Posição no funil
        requisitos_obrigatorios: data.requisitos_obrigatorios,
        requisitos_desejaveis: data.requisitos_desejaveis,
        regime_contratacao: data.regime_contratacao,
        modalidade: data.modalidade,
        tipo_remuneracao: data.tipo_remuneracao,
        beneficios: data.beneficios,
        analista_id: data.analista_id,
        cliente_id: data.cliente_id,
        urgente: data.urgente,
        prazo_fechamento: data.prazo_fechamento,
        faturamento_mensal: data.faturamento_mensal,
        // ✅ CAMPOS FALTANTES
        ocorrencia: data.ocorrencia,
        tipo_de_vaga: data.tipo_de_vaga,
        vaga_faturavel: data.vaga_faturavel,
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
          status_posicao: updates.status_posicao, // 🆕 Posição no funil
          requisitos_obrigatorios: updates.requisitos_obrigatorios,
          requisitos_desejaveis: updates.requisitos_desejaveis,
          regime_contratacao: updates.regime_contratacao,
          modalidade: updates.modalidade,
          tipo_remuneracao: (updates as any).tipo_remuneracao,
          beneficios: updates.beneficios,
          analista_id: updates.analista_id,
          cliente_id: updates.cliente_id,
          urgente: updates.urgente,
          prazo_fechamento: updates.prazo_fechamento,
          faturamento_mensal: updates.faturamento_mensal,
          // ✅ CAMPOS FALTANTES
          ocorrencia: (updates as any).ocorrencia,
          tipo_de_vaga: (updates as any).tipo_de_vaga,
          vaga_faturavel: (updates as any).vaga_faturavel,
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
        status_posicao: data.status_posicao || 'triagem', // 🆕 Posição no funil
        requisitos_obrigatorios: data.requisitos_obrigatorios,
        requisitos_desejaveis: data.requisitos_desejaveis,
        regime_contratacao: data.regime_contratacao,
        modalidade: data.modalidade,
        tipo_remuneracao: data.tipo_remuneracao,
        beneficios: data.beneficios,
        analista_id: data.analista_id,
        cliente_id: data.cliente_id,
        urgente: data.urgente,
        prazo_fechamento: data.prazo_fechamento,
        faturamento_mensal: data.faturamento_mensal,
        // ✅ CAMPOS FALTANTES
        ocorrencia: data.ocorrencia,
        tipo_de_vaga: data.tipo_de_vaga,
        vaga_faturavel: data.vaga_faturavel,
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
