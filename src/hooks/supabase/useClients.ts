/**
 * useClients Hook - Gerenciamento de Clientes
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { Client } from '@/types';

export const useClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os clientes
   */
  const loadClients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedClients: Client[] = (data || []).map((client: any) => ({
        id: client.id,
        razao_social_cliente: client.razao_social_cliente,
        ativo_cliente: client.ativo_cliente,
        vip: client.vip,
        id_gestao_comercial: client.id_gestao_comercial,
        id_gestao_de_pessoas: client.id_gestao_de_pessoas,
        id_gestor_rs: client.id_gestor_rs
      }));

      setClients(mappedClients);
      console.log(`✅ ${mappedClients.length} clientes carregados`);
      return mappedClients;
    } catch (err: any) {
      console.error('❌ Erro ao carregar clientes:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona um novo cliente
   */
  const addClient = async (newClient: Omit<Client, 'id'>) => {
    try {
      console.log('➕ Criando cliente:', newClient);

      const { data, error } = await supabase
        .from('clients')
        .insert([{
          razao_social_cliente: newClient.razao_social_cliente,
          ativo_cliente: newClient.ativo_cliente ?? true,
          vip: newClient.vip ?? false,
          id_gestao_comercial: newClient.id_gestao_comercial || null,
          id_gestao_de_pessoas: newClient.id_gestao_de_pessoas || null,
          id_gestor_rs: newClient.id_gestor_rs || null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdClient: Client = {
        id: data.id,
        razao_social_cliente: data.razao_social_cliente,
        ativo_cliente: data.ativo_cliente,
        vip: data.vip,
        id_gestao_comercial: data.id_gestao_comercial,
        id_gestao_de_pessoas: data.id_gestao_de_pessoas,
        id_gestor_rs: data.id_gestor_rs
      };

      setClients(prev => [...prev, createdClient]);
      console.log('✅ Cliente criado:', createdClient);
      
      return createdClient;
    } catch (err: any) {
      console.error('❌ Erro ao criar cliente:', err);
      alert(`Erro ao criar cliente: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza um cliente existente
   */
  const updateClient = async (id: number, updates: Partial<Client>) => {
    try {
      console.log('📝 Atualizando cliente:', id, updates);

      const { data, error } = await supabase
        .from('clients')
        .update({
          razao_social_cliente: updates.razao_social_cliente,
          ativo_cliente: updates.ativo_cliente,
          vip: updates.vip,
          id_gestao_comercial: updates.id_gestao_comercial,
          id_gestao_de_pessoas: updates.id_gestao_de_pessoas,
          id_gestor_rs: updates.id_gestor_rs
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedClient: Client = {
        id: data.id,
        razao_social_cliente: data.razao_social_cliente,
        ativo_cliente: data.ativo_cliente,
        vip: data.vip,
        id_gestao_comercial: data.id_gestao_comercial,
        id_gestao_de_pessoas: data.id_gestao_de_pessoas,
        id_gestor_rs: data.id_gestor_rs
      };

      setClients(prev => prev.map(c => c.id === id ? updatedClient : c));
      console.log('✅ Cliente atualizado:', updatedClient);
      
      return updatedClient;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar cliente:', err);
      alert(`Erro ao atualizar cliente: ${err.message}`);
      throw err;
    }
  };

  /**
   * Adiciona múltiplos clientes em lote
   */
  const batchAddClients = async (newClients: Omit<Client, 'id'>[]) => {
    try {
      console.log(`➕ Criando ${newClients.length} clientes em lote...`);

      const { data, error } = await supabase
        .from('clients')
        .insert(newClients.map(c => ({
          razao_social_cliente: c.razao_social_cliente,
          ativo_cliente: c.ativo_cliente ?? true,
          vip: c.vip ?? false,
          id_gestao_comercial: c.id_gestao_comercial || null,
          id_gestao_de_pessoas: c.id_gestao_de_pessoas || null,
          id_gestor_rs: c.id_gestor_rs || null
        })))
        .select();

      if (error) throw error;

      const createdClients: Client[] = (data || []).map((client: any) => ({
        id: client.id,
        razao_social_cliente: client.razao_social_cliente,
        ativo_cliente: client.ativo_cliente,
        vip: client.vip,
        id_gestao_comercial: client.id_gestao_comercial,
        id_gestao_de_pessoas: client.id_gestao_de_pessoas,
        id_gestor_rs: client.id_gestor_rs
      }));

      setClients(prev => [...prev, ...createdClients]);
      console.log(`✅ ${createdClients.length} clientes criados em lote`);
      
      return createdClients;
    } catch (err: any) {
      console.error('❌ Erro ao criar clientes em lote:', err);
      alert(`Erro ao criar clientes: ${err.message}`);
      throw err;
    }
  };

  return {
    clients,
    setClients,
    loading,
    error,
    loadClients,
    addClient,
    updateClient,
    batchAddClients
  };
};
