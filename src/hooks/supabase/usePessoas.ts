/**
 * usePessoas Hook - Gerenciamento de Pessoas/Talentos (RAISA)
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { Pessoa } from '@/types';

export const usePessoas = () => {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todas as pessoas do banco de talentos
   */
  const loadPessoas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedPessoas: Pessoa[] = (data || []).map((pessoa: any) => ({
        id: String(pessoa.id),
        nome: pessoa.nome,
        email: pessoa.email,
        telefone: pessoa.telefone,
        cpf: pessoa.cpf,
        linkedin_url: pessoa.linkedin_url,
        curriculo_url: pessoa.curriculo_url,
        observacoes: pessoa.observacoes,
        created_at: pessoa.created_at
      }));

      setPessoas(mappedPessoas);
      console.log(`✅ ${mappedPessoas.length} pessoas carregadas`);
      return mappedPessoas;
    } catch (err: any) {
      console.error('❌ Erro ao carregar pessoas:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona uma nova pessoa ao banco de talentos
   */
  const addPessoa = async (newPessoa: Omit<Pessoa, 'id'>) => {
    try {
      console.log('➕ Criando pessoa:', newPessoa);

      const { data, error } = await supabase
        .from('pessoas')
        .insert([{
          nome: newPessoa.nome,
          email: newPessoa.email,
          telefone: newPessoa.telefone,
          cpf: newPessoa.cpf,
          linkedin_url: newPessoa.linkedin_url,
          curriculo_url: newPessoa.curriculo_url,
          observacoes: newPessoa.observacoes
        }])
        .select()
        .single();

      if (error) throw error;

      const createdPessoa: Pessoa = {
        id: String(data.id),
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        linkedin_url: data.linkedin_url,
        curriculo_url: data.curriculo_url,
        observacoes: data.observacoes,
        created_at: data.created_at
      };

      setPessoas(prev => [createdPessoa, ...prev]);
      console.log('✅ Pessoa criada:', createdPessoa);
      
      return createdPessoa;
    } catch (err: any) {
      console.error('❌ Erro ao criar pessoa:', err);
      alert(`Erro ao criar pessoa: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza uma pessoa existente
   */
  const updatePessoa = async (id: string, updates: Partial<Pessoa>) => {
    try {
      console.log('📝 Atualizando pessoa:', id, updates);

      const { data, error } = await supabase
        .from('pessoas')
        .update({
          nome: updates.nome,
          email: updates.email,
          telefone: updates.telefone,
          cpf: updates.cpf,
          linkedin_url: updates.linkedin_url,
          curriculo_url: updates.curriculo_url,
          observacoes: updates.observacoes
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      const updatedPessoa: Pessoa = {
        id: String(data.id),
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        linkedin_url: data.linkedin_url,
        curriculo_url: data.curriculo_url,
        observacoes: data.observacoes,
        created_at: data.created_at
      };

      setPessoas(prev => prev.map(p => p.id === id ? updatedPessoa : p));
      console.log('✅ Pessoa atualizada:', updatedPessoa);
      
      return updatedPessoa;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar pessoa:', err);
      alert(`Erro ao atualizar pessoa: ${err.message}`);
      throw err;
    }
  };

  /**
   * Busca pessoa por CPF ou Email
   */
  const findPessoaByCpfOrEmail = async (cpf?: string, email?: string): Promise<Pessoa | null> => {
    try {
      let query = supabase.from('pessoas').select('*');
      
      if (cpf) {
        query = query.eq('cpf', cpf);
      } else if (email) {
        query = query.eq('email', email);
      } else {
        return null;
      }
      
      const { data, error } = await query.single();
      
      if (error || !data) return null;
      
      return {
        id: String(data.id),
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        linkedin_url: data.linkedin_url,
        curriculo_url: data.curriculo_url,
        observacoes: data.observacoes,
        created_at: data.created_at
      };
    } catch (err) {
      console.error('❌ Erro ao buscar pessoa:', err);
      return null;
    }
  };

  return {
    pessoas,
    setPessoas,
    loading,
    error,
    loadPessoas,
    addPessoa,
    updatePessoa,
    findPessoaByCpfOrEmail
  };
};
