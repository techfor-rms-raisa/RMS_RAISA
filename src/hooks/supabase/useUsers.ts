/**
 * useUsers Hook - Gerenciamento de Usuários (app_users)
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { User } from '@/types';

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os usuários do sistema
   */
  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      // ✅ Mapeamento: tabela app_users usa gestor_rs_id, não analista_rs_id
      const mappedUsers: User[] = (data || []).map((user: any) => ({
        id: user.id,
        nome_usuario: user.nome_usuario,
        nome: user.nome_usuario, // ✅ Alias para compatibilidade
        email_usuario: user.email_usuario,
        senha_usuario: user.senha_usuario,
        ativo_usuario: user.ativo_usuario,
        receber_alertas_email: user.receber_alertas_email,
        tipo_usuario: user.tipo_usuario || 'Consulta',
        analista_rs_id: user.gestor_rs_id, // Mapeado de gestor_rs_id
        gestor_rs_id: user.gestor_rs_id,
        perfil_id: user.perfil_id,
        perfil: null
      }));

      setUsers(mappedUsers);
      console.log(`✅ ${mappedUsers.length} usuários carregados`);
      return mappedUsers;
    } catch (err: any) {
      console.error('❌ Erro ao carregar usuários:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona um novo usuário
   */
  const addUser = async (newUser: Omit<User, 'id'>) => {
    try {
      console.log('➕ Criando usuário:', newUser);

      const { data, error } = await supabase
        .from('app_users')
        .insert([{
          nome_usuario: newUser.nome_usuario,
          email_usuario: newUser.email_usuario,
          senha_usuario: newUser.senha_usuario,
          tipo_usuario: newUser.tipo_usuario || 'Consulta',
          ativo_usuario: newUser.ativo_usuario ?? true,
          receber_alertas_email: newUser.receber_alertas_email ?? true,
          perfil_id: newUser.perfil_id || null,
          gestor_rs_id: newUser.analista_rs_id || newUser.gestor_rs_id || null
        }])
        .select('*')
        .single();

      if (error) throw error;

      const createdUser: User = {
        id: data.id,
        nome_usuario: data.nome_usuario,
        nome: data.nome_usuario, // ✅ Alias para compatibilidade
        email_usuario: data.email_usuario,
        senha_usuario: data.senha_usuario,
        ativo_usuario: data.ativo_usuario,
        receber_alertas_email: data.receber_alertas_email,
        tipo_usuario: data.tipo_usuario || 'Consulta',
        analista_rs_id: data.gestor_rs_id,
        gestor_rs_id: data.gestor_rs_id,
        perfil_id: data.perfil_id,
        perfil: null
      };

      setUsers(prev => [...prev, createdUser]);
      console.log('✅ Usuário criado:', createdUser);
      
      return createdUser;
    } catch (err: any) {
      console.error('❌ Erro ao criar usuário:', err);
      alert(`Erro ao criar usuário: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza um usuário existente
   */
  const updateUser = async (id: number, updates: Partial<User>) => {
    try {
      console.log('📝 Atualizando usuário:', id, updates);

      const { data, error } = await supabase
        .from('app_users')
        .update({
          nome_usuario: updates.nome_usuario,
          email_usuario: updates.email_usuario,
          senha_usuario: updates.senha_usuario,
          tipo_usuario: updates.tipo_usuario,
          ativo_usuario: updates.ativo_usuario,
          receber_alertas_email: updates.receber_alertas_email,
          perfil_id: updates.perfil_id,
          gestor_rs_id: updates.analista_rs_id || updates.gestor_rs_id
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      const updatedUser: User = {
        id: data.id,
        nome_usuario: data.nome_usuario,
        nome: data.nome_usuario, // ✅ Alias para compatibilidade
        email_usuario: data.email_usuario,
        senha_usuario: data.senha_usuario,
        ativo_usuario: data.ativo_usuario,
        receber_alertas_email: data.receber_alertas_email,
        tipo_usuario: data.tipo_usuario || 'Consulta',
        analista_rs_id: data.gestor_rs_id,
        gestor_rs_id: data.gestor_rs_id,
        perfil_id: data.perfil_id,
        perfil: null
      };

      setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      console.log('✅ Usuário atualizado:', updatedUser);
      
      return updatedUser;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar usuário:', err);
      alert(`Erro ao atualizar usuário: ${err.message}`);
      throw err;
    }
  };

  return {
    users,
    setUsers,
    loading,
    error,
    loadUsers,
    addUser,
    updateUser
  };
};
