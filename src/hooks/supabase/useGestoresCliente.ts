/**
 * useGestoresCliente Hook - Gerenciamento de Gestores de Clientes (usuarios_cliente)
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { UsuarioCliente } from '@/types';

export const useGestoresCliente = () => {
  const [usuariosCliente, setUsuariosCliente] = useState<UsuarioCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os gestores de clientes
   */
  const loadUsuariosCliente = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('usuarios_cliente')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedUsuarios: UsuarioCliente[] = (data || []).map((uc: any) => ({
        id: uc.id,
        id_cliente: uc.id_cliente,
        nome_gestor_cliente: uc.nome_gestor_cliente,
        cargo_gestor: uc.cargo_gestor,
        email_gestor: uc.email_gestor,
        celular: uc.celular,
        ativo: uc.ativo,
        analista_rs_id: uc.analista_rs_id,
        cliente: undefined,
        gestor_rs: undefined
      }));

      setUsuariosCliente(mappedUsuarios);
      console.log(`✅ ${mappedUsuarios.length} gestores de clientes carregados`);
      return mappedUsuarios;
    } catch (err: any) {
      console.error('❌ Erro ao carregar gestores de clientes:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona um novo gestor de cliente
   */
  const addUsuarioCliente = async (newUsuario: Omit<UsuarioCliente, 'id'>) => {
    try {
      console.log('➕ Criando gestor de cliente:', newUsuario);

      const { data, error } = await supabase
        .from('usuarios_cliente')
        .insert([{
          id_cliente: newUsuario.id_cliente,
          nome_gestor_cliente: newUsuario.nome_gestor_cliente,
          cargo_gestor: newUsuario.cargo_gestor || 'Gestor',
          email_gestor: newUsuario.email_gestor || null,
          celular: newUsuario.celular || null,
          ativo: newUsuario.ativo ?? true,
          analista_rs_id: newUsuario.analista_rs_id || null
        }])
        .select('*')
        .single();

      if (error) throw error;

      const createdUsuario: UsuarioCliente = {
        id: data.id,
        id_cliente: data.id_cliente,
        nome_gestor_cliente: data.nome_gestor_cliente,
        cargo_gestor: data.cargo_gestor,
        email_gestor: data.email_gestor,
        celular: data.celular,
        ativo: data.ativo,
        analista_rs_id: data.analista_rs_id,
        cliente: undefined,
        gestor_rs: undefined
      };

      setUsuariosCliente(prev => [...prev, createdUsuario]);
      console.log('✅ Gestor de cliente criado:', createdUsuario);
      
      return createdUsuario;
    } catch (err: any) {
      console.error('❌ Erro ao criar gestor de cliente:', err);
      alert(`Erro ao criar gestor: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza um gestor de cliente existente
   */
  const updateUsuarioCliente = async (updates: UsuarioCliente) => {
    try {
      console.log('📝 Atualizando gestor de cliente:', updates.id, updates);

      const { data, error } = await supabase
        .from('usuarios_cliente')
        .update({
          nome_gestor_cliente: updates.nome_gestor_cliente,
          cargo_gestor: updates.cargo_gestor,
          email_gestor: updates.email_gestor,
          celular: updates.celular,
          ativo: updates.ativo,
          analista_rs_id: updates.analista_rs_id
        })
        .eq('id', updates.id)
        .select('*')
        .single();

      if (error) throw error;

      const updatedUsuario: UsuarioCliente = {
        id: data.id,
        id_cliente: data.id_cliente,
        nome_gestor_cliente: data.nome_gestor_cliente,
        cargo_gestor: data.cargo_gestor,
        email_gestor: data.email_gestor,
        celular: data.celular,
        ativo: data.ativo,
        analista_rs_id: data.analista_rs_id,
        cliente: undefined,
        gestor_rs: undefined
      };

      setUsuariosCliente(prev => prev.map(u => u.id === updates.id ? updatedUsuario : u));
      console.log('✅ Gestor de cliente atualizado:', updatedUsuario);
      
      return updatedUsuario;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar gestor de cliente:', err);
      alert(`Erro ao atualizar gestor: ${err.message}`);
      throw err;
    }
  };

  /**
   * Adiciona múltiplos gestores em lote
   */
  const batchAddManagers = async (newManagers: Omit<UsuarioCliente, 'id'>[]) => {
    try {
      console.log(`➕ Criando ${newManagers.length} gestores em lote...`);

      const insertData = newManagers.map(m => ({
        id_cliente: m.id_cliente,
        nome_gestor_cliente: m.nome_gestor_cliente,
        cargo_gestor: m.cargo_gestor || 'Gestor',
        email_gestor: m.email_gestor || null,
        celular: m.celular || null,
        ativo: m.ativo ?? true,
        analista_rs_id: m.analista_rs_id || null
      }));

      const { data, error } = await supabase
        .from('usuarios_cliente')
        .insert(insertData)
        .select();

      if (error) throw error;

      const createdManagers: UsuarioCliente[] = (data || []).map((uc: any) => ({
        id: uc.id,
        id_cliente: uc.id_cliente,
        nome_gestor_cliente: uc.nome_gestor_cliente,
        cargo_gestor: uc.cargo_gestor,
        email_gestor: uc.email_gestor,
        celular: uc.celular,
        ativo: uc.ativo,
        analista_rs_id: uc.analista_rs_id,
        cliente: undefined,
        gestor_rs: undefined
      }));

      setUsuariosCliente(prev => [...prev, ...createdManagers]);
      console.log(`✅ ${createdManagers.length} gestores criados com sucesso!`);
      
      return createdManagers;
    } catch (err: any) {
      console.error('❌ Erro ao criar gestores em lote:', err);
      alert(`Erro ao criar gestores: ${err.message}`);
      throw err;
    }
  };

  /**
   * Inativa um gestor (soft delete)
   */
  const inactivateGestor = async (id: number) => {
    try {
      console.log(`⏸️ Inativando gestor ${id}...`);
      
      const { data, error } = await supabase
        .from('usuarios_cliente')
        .update({ ativo: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const inactivatedGestor: UsuarioCliente = data as UsuarioCliente;
      setUsuariosCliente(prev => prev.map(g => g.id === id ? inactivatedGestor : g));
      console.log(`✅ Gestor ${id} inativado com sucesso!`);
      
      return inactivatedGestor;
    } catch (err: any) {
      console.error('❌ Erro ao inativar gestor:', err);
      throw err;
    }
  };

  return {
    usuariosCliente,
    setUsuariosCliente,
    loading,
    error,
    loadUsuariosCliente,
    addUsuarioCliente,
    updateUsuarioCliente,
    batchAddManagers,
    inactivateGestor
  };
};
