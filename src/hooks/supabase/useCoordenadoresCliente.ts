/**
 * useCoordenadoresCliente Hook - Gerenciamento de Coordenadores de Clientes
 * Módulo separado do useSupabaseData para melhor organização
 */

import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { CoordenadorCliente } from '@/types';

export const useCoordenadoresCliente = () => {
  const [coordenadoresCliente, setCoordenadoresCliente] = useState<CoordenadorCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega todos os coordenadores de clientes
   */
  const loadCoordenadoresCliente = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coordenadores_cliente')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedCoordenadores: CoordenadorCliente[] = (data || []).map((cc: any) => ({
        id: cc.id,
        id_gestor_cliente: cc.id_gestor_cliente,
        nome_coordenador_cliente: cc.nome_coordenador_cliente,
        cargo_coordenador_cliente: cc.cargo_coordenador_cliente,
        email_coordenador: cc.email_coordenador,
        celular: cc.celular,
        ativo: cc.ativo,
        gestor: undefined
      }));

      setCoordenadoresCliente(mappedCoordenadores);
      console.log(`✅ ${mappedCoordenadores.length} coordenadores de clientes carregados`);
      return mappedCoordenadores;
    } catch (err: any) {
      console.error('❌ Erro ao carregar coordenadores de clientes:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Adiciona um novo coordenador de cliente
   */
  const addCoordenadorCliente = async (newCoordenador: Omit<CoordenadorCliente, 'id'>) => {
    try {
      console.log('➕ Criando coordenador de cliente:', newCoordenador);

      const { data, error } = await supabase
        .from('coordenadores_cliente')
        .insert([{
          id_gestor_cliente: newCoordenador.id_gestor_cliente,
          nome_coordenador_cliente: newCoordenador.nome_coordenador_cliente,
          cargo_coordenador_cliente: newCoordenador.cargo_coordenador_cliente || 'Coordenador',
          email_coordenador: newCoordenador.email_coordenador || null,
          celular: newCoordenador.celular || null,
          ativo: newCoordenador.ativo ?? true
        }])
        .select()
        .single();

      if (error) throw error;

      const createdCoordenador: CoordenadorCliente = {
        id: data.id,
        id_gestor_cliente: data.id_gestor_cliente,
        nome_coordenador_cliente: data.nome_coordenador_cliente,
        cargo_coordenador_cliente: data.cargo_coordenador_cliente,
        email_coordenador: data.email_coordenador,
        celular: data.celular,
        ativo: data.ativo,
        gestor: undefined
      };

      setCoordenadoresCliente(prev => [...prev, createdCoordenador]);
      console.log('✅ Coordenador de cliente criado:', createdCoordenador);
      
      return createdCoordenador;
    } catch (err: any) {
      console.error('❌ Erro ao criar coordenador de cliente:', err);
      alert(`Erro ao criar coordenador: ${err.message}`);
      throw err;
    }
  };

  /**
   * Atualiza um coordenador de cliente existente
   */
  const updateCoordenadorCliente = async (updates: CoordenadorCliente) => {
    try {
      console.log('📝 Atualizando coordenador de cliente:', updates.id, updates);

      const { data, error } = await supabase
        .from('coordenadores_cliente')
        .update({
          nome_coordenador_cliente: updates.nome_coordenador_cliente,
          cargo_coordenador_cliente: updates.cargo_coordenador_cliente,
          email_coordenador: updates.email_coordenador,
          celular: updates.celular,
          ativo: updates.ativo
        })
        .eq('id', updates.id)
        .select()
        .single();

      if (error) throw error;

      const updatedCoordenador: CoordenadorCliente = {
        id: data.id,
        id_gestor_cliente: data.id_gestor_cliente,
        nome_coordenador_cliente: data.nome_coordenador_cliente,
        cargo_coordenador_cliente: data.cargo_coordenador_cliente,
        email_coordenador: data.email_coordenador,
        celular: data.celular,
        ativo: data.ativo,
        gestor: undefined
      };

      setCoordenadoresCliente(prev => prev.map(c => c.id === updates.id ? updatedCoordenador : c));
      console.log('✅ Coordenador de cliente atualizado:', updatedCoordenador);
      
      return updatedCoordenador;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar coordenador de cliente:', err);
      alert(`Erro ao atualizar coordenador: ${err.message}`);
      throw err;
    }
  };

  /**
   * Adiciona múltiplos coordenadores em lote
   */
  const batchAddCoordinators = async (newCoordinators: Omit<CoordenadorCliente, 'id'>[]) => {
    try {
      console.log(`➕ Criando ${newCoordinators.length} coordenadores em lote...`);

      const insertData = newCoordinators.map(c => ({
        id_gestor_cliente: c.id_gestor_cliente,
        nome_coordenador_cliente: c.nome_coordenador_cliente,
        cargo_coordenador_cliente: c.cargo_coordenador_cliente || 'Coordenador',
        email_coordenador: c.email_coordenador || null,
        celular: c.celular || null,
        ativo: c.ativo ?? true
      }));

      const { data, error } = await supabase
        .from('coordenadores_cliente')
        .insert(insertData)
        .select();

      if (error) throw error;

      const createdCoordinators: CoordenadorCliente[] = (data || []).map((cc: any) => ({
        id: cc.id,
        id_gestor_cliente: cc.id_gestor_cliente,
        nome_coordenador_cliente: cc.nome_coordenador_cliente,
        cargo_coordenador_cliente: cc.cargo_coordenador_cliente,
        email_coordenador: cc.email_coordenador,
        celular: cc.celular,
        ativo: cc.ativo,
        gestor: undefined
      }));

      setCoordenadoresCliente(prev => [...prev, ...createdCoordinators]);
      console.log(`✅ ${createdCoordinators.length} coordenadores criados com sucesso!`);
      
      return createdCoordinators;
    } catch (err: any) {
      console.error('❌ Erro ao criar coordenadores em lote:', err);
      alert(`Erro ao criar coordenadores: ${err.message}`);
      throw err;
    }
  };

  /**
   * Inativa um coordenador (soft delete)
   */
  const inactivateCoordenador = async (id: number) => {
    try {
      console.log(`⏸️ Inativando coordenador ${id}...`);
      
      const { data, error } = await supabase
        .from('coordenadores_cliente')
        .update({ ativo: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const inactivatedCoordenador: CoordenadorCliente = data as CoordenadorCliente;
      setCoordenadoresCliente(prev => prev.map(c => c.id === id ? inactivatedCoordenador : c));
      console.log(`✅ Coordenador ${id} inativado com sucesso!`);
      
      return inactivatedCoordenador;
    } catch (err: any) {
      console.error('❌ Erro ao inativar coordenador:', err);
      throw err;
    }
  };

  return {
    coordenadoresCliente,
    setCoordenadoresCliente,
    loading,
    error,
    loadCoordenadoresCliente,
    addCoordenadorCliente,
    updateCoordenadorCliente,
    batchAddCoordinators,
    inactivateCoordenador
  };
};
