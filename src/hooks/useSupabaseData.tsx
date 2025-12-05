/**
 * useSupabaseData Hook - VERSÃO CORRIGIDA
 * Adaptado para funcionar com o schema simplificado do Supabase
 * Tabelas: users, clients, consultants, vagas, pessoas, candidaturas
 */

import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { 
  Consultant, Client, User, UsuarioCliente, CoordenadorCliente, 
  ConsultantReport, AIAnalysisResult, EmailTemplate, ComplianceCampaign, 
  FeedbackRequest, FeedbackResponse, RHAction, BehavioralFlag, 
  LearningFeedbackLoop, Vaga, Pessoa, Candidatura
} from '../components/types';

export const useSupabaseData = () => {
  // ============================================
  // ESTADO
  // ============================================
  
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [usuariosCliente, setUsuariosCliente] = useState<UsuarioCliente[]>([]);
  const [coordenadoresCliente, setCoordenadoresCliente] = useState<CoordenadorCliente[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<ComplianceCampaign[]>([]);
  const [feedbackResponses, setFeedbackResponses] = useState<FeedbackResponse[]>([]);
  const [rhActions, setRhActions] = useState<RHAction[]>([]);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARREGAR DADOS INICIAIS
  // ============================================

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Carregando TODOS os dados do Supabase...');
      
      await Promise.all([
        loadUsers(),
        loadClients(),
        loadConsultants(),
        loadVagas(),
        loadPessoas(),
        loadCandidaturas()
      ]);
      
      console.log('✅ TODOS os dados carregados com sucesso!');
      setLoading(false);
    } catch (err: any) {
      console.error('❌ Erro ao carregar dados:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // ============================================
  // USUÁRIOS (USERS) - CORRIGIDO
  // ============================================

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')  // ✅ Tabela correta
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      // Mapear campos do banco para interface User
      const mappedUsers: User[] = (data || []).map((user: any) => ({
        id: user.id,
        nome_usuario: user.nome,  // ✅ Mapear nome → nome_usuario
        email_usuario: user.email,  // ✅ Mapear email → email_usuario
        senha_usuario: user.senha,  // ✅ Mapear senha → senha_usuario
        ativo_usuario: user.ativo,  // ✅ Mapear ativo → ativo_usuario
        receber_alertas_email: user.receber_alertas ?? true,
        tipo_usuario: user.tipo || 'Consulta',
        gestor_rs_id: user.gestor_rs_id || null,
        perfil_id: null,
        perfil: null
      }));

      setUsers(mappedUsers);
      console.log(`✅ ${mappedUsers.length} usuários carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar usuários:', err);
      throw err;
    }
  };

  const addUser = async (newUser: Omit<User, 'id'>) => {
    try {
      console.log('➕ Criando usuário:', newUser);

      const { data, error} = await supabase
        .from('users')  // ✅ Tabela correta
        .insert([{
          nome: newUser.nome_usuario,  // ✅ Mapear nome_usuario → nome
          email: newUser.email_usuario,  // ✅ Mapear email_usuario → email
          senha: newUser.senha_usuario,  // ✅ Mapear senha_usuario → senha
          ativo: newUser.ativo_usuario ?? true,
          receber_alertas: newUser.receber_alertas_email ?? true,
          tipo: newUser.tipo_usuario || 'Consulta',
          gestor_rs_id: newUser.gestor_rs_id || null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdUser: User = {
        id: data.id,
        nome_usuario: data.nome,
        email_usuario: data.email,
        senha_usuario: data.senha,
        ativo_usuario: data.ativo,
        receber_alertas_email: data.receber_alertas,
        tipo_usuario: data.tipo,
        gestor_rs_id: data.gestor_rs_id,
        perfil_id: null,
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

  const updateUser = async (id: number, updates: Partial<User>) => {
    try {
      console.log('📝 Atualizando usuário:', id, updates);

      const { data, error } = await supabase
        .from('users')  // ✅ Tabela correta
        .update({
          nome: updates.nome_usuario,
          email: updates.email_usuario,
          senha: updates.senha_usuario,
          ativo: updates.ativo_usuario,
          receber_alertas: updates.receber_alertas_email,
          tipo: updates.tipo_usuario,
          gestor_rs_id: updates.gestor_rs_id
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedUser: User = {
        id: data.id,
        nome_usuario: data.nome,
        email_usuario: data.email,
        senha_usuario: data.senha,
        ativo_usuario: data.ativo,
        receber_alertas_email: data.receber_alertas,
        tipo_usuario: data.tipo,
        gestor_rs_id: data.gestor_rs_id,
        perfil_id: null,
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

  // ============================================
  // CLIENTES (CLIENTS) - CORRIGIDO
  // ============================================

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedClients: Client[] = (data || []).map((client: any) => ({
        id: client.id,
        razao_social_cliente: client.razao_social,  // ✅ Mapear
        ativo_cliente: client.ativo,  // ✅ Mapear
        vip: false,
        id_gestao_comercial: client.id_gestao_comercial,
        id_gestao_de_pessoas: client.id_gestao_de_pessoas,
        id_gestor_rs: client.id_gestor_rs
      }));

      setClients(mappedClients);
      console.log(`✅ ${mappedClients.length} clientes carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar clientes:', err);
      throw err;
    }
  };

  const addClient = async (newClient: Omit<Client, 'id'>) => {
    try {
      console.log('➕ Criando cliente:', newClient);

      const { data, error } = await supabase
        .from('clients')
        .insert([{
          razao_social: newClient.razao_social_cliente,  // ✅ Mapear
          ativo: newClient.ativo_cliente ?? true,  // ✅ Mapear
          id_gestao_comercial: newClient.id_gestao_comercial || null,
          id_gestao_de_pessoas: newClient.id_gestao_de_pessoas || null,
          id_gestor_rs: newClient.id_gestor_rs || null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdClient: Client = {
        id: data.id,
        razao_social_cliente: data.razao_social,
        ativo_cliente: data.ativo,
        vip: false,
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

  const updateClient = async (id: number, updates: Partial<Client>) => {
    try {
      console.log('📝 Atualizando cliente:', id, updates);

      const { data, error } = await supabase
        .from('clients')
        .update({
          razao_social: updates.razao_social_cliente,
          ativo: updates.ativo_cliente,
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
        razao_social_cliente: data.razao_social,
        ativo_cliente: data.ativo,
        vip: false,
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

  // ============================================
  // CONSULTORES (CONSULTANTS) - CORRIGIDO
  // ============================================

  const loadConsultants = async () => {
    try {
      const { data, error } = await supabase
        .from('consultants')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedConsultants: Consultant[] = (data || []).map((consultant: any) => ({
        id: consultant.id,
        nome_consultor: consultant.nome,  // ✅ Mapear
        email_consultor: consultant.email,  // ✅ Mapear
        ativo_consultor: consultant.ativo,  // ✅ Mapear
        id_gestor_rs: consultant.id_gestor_rs
      }));

      setConsultants(mappedConsultants);
      console.log(`✅ ${mappedConsultants.length} consultores carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar consultores:', err);
      throw err;
    }
  };

  const addConsultant = async (newConsultant: Omit<Consultant, 'id'>) => {
    try {
      console.log('➕ Criando consultor:', newConsultant);

      const { data, error } = await supabase
        .from('consultants')
        .insert([{
          nome: newConsultant.nome_consultor,  // ✅ Mapear
          email: newConsultant.email_consultor,  // ✅ Mapear
          ativo: newConsultant.ativo_consultor ?? true,  // ✅ Mapear
          id_gestor_rs: newConsultant.id_gestor_rs || null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdConsultant: Consultant = {
        id: data.id,
        nome_consultor: data.nome,
        email_consultor: data.email,
        ativo_consultor: data.ativo,
        id_gestor_rs: data.id_gestor_rs
      };

      setConsultants(prev => [...prev, createdConsultant]);
      console.log('✅ Consultor criado:', createdConsultant);
      
      return createdConsultant;
    } catch (err: any) {
      console.error('❌ Erro ao criar consultor:', err);
      alert(`Erro ao criar consultor: ${err.message}`);
      throw err;
    }
  };

  const updateConsultant = async (id: number, updates: Partial<Consultant>) => {
    try {
      console.log('📝 Atualizando consultor:', id, updates);

      const { data, error } = await supabase
        .from('consultants')
        .update({
          nome: updates.nome_consultor,
          email: updates.email_consultor,
          ativo: updates.ativo_consultor,
          id_gestor_rs: updates.id_gestor_rs
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedConsultant: Consultant = {
        id: data.id,
        nome_consultor: data.nome,
        email_consultor: data.email,
        ativo_consultor: data.ativo,
        id_gestor_rs: data.id_gestor_rs
      };

      setConsultants(prev => prev.map(c => c.id === id ? updatedConsultant : c));
      console.log('✅ Consultor atualizado:', updatedConsultant);
      
      return updatedConsultant;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar consultor:', err);
      alert(`Erro ao atualizar consultor: ${err.message}`);
      throw err;
    }
  };

  // ============================================
  // VAGAS (RAISA)
  // ============================================

  const loadVagas = async () => {
    try {
      const { data, error } = await supabase
        .from('vagas')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      setVagas(data || []);
      console.log(`✅ ${(data || []).length} vagas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar vagas:', err);
      throw err;
    }
  };

  const addVaga = async (newVaga: Omit<Vaga, 'id'>) => {
    try {
      console.log('➕ Criando vaga:', newVaga);

      const { data, error } = await supabase
        .from('vagas')
        .insert([newVaga])
        .select()
        .single();

      if (error) throw error;

      setVagas(prev => [data, ...prev]);
      console.log('✅ Vaga criada:', data);
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao criar vaga:', err);
      alert(`Erro ao criar vaga: ${err.message}`);
      throw err;
    }
  };

  const updateVaga = async (id: number, updates: Partial<Vaga>) => {
    try {
      console.log('📝 Atualizando vaga:', id, updates);

      const { data, error } = await supabase
        .from('vagas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setVagas(prev => prev.map(v => v.id === id ? data : v));
      console.log('✅ Vaga atualizada:', data);
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar vaga:', err);
      alert(`Erro ao atualizar vaga: ${err.message}`);
      throw err;
    }
  };

  // ============================================
  // PESSOAS (CANDIDATOS - RAISA)
  // ============================================

  const loadPessoas = async () => {
    try {
      const { data, error } = await supabase
        .from('pessoas')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      setPessoas(data || []);
      console.log(`✅ ${(data || []).length} pessoas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar pessoas:', err);
      throw err;
    }
  };

  const addPessoa = async (newPessoa: Omit<Pessoa, 'id'>) => {
    try {
      console.log('➕ Criando pessoa:', newPessoa);

      const { data, error } = await supabase
        .from('pessoas')
        .insert([newPessoa])
        .select()
        .single();

      if (error) throw error;

      setPessoas(prev => [data, ...prev]);
      console.log('✅ Pessoa criada:', data);
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao criar pessoa:', err);
      alert(`Erro ao criar pessoa: ${err.message}`);
      throw err;
    }
  };

  const updatePessoa = async (id: number, updates: Partial<Pessoa>) => {
    try {
      console.log('📝 Atualizando pessoa:', id, updates);

      const { data, error } = await supabase
        .from('pessoas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setPessoas(prev => prev.map(p => p.id === id ? data : p));
      console.log('✅ Pessoa atualizada:', data);
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar pessoa:', err);
      alert(`Erro ao atualizar pessoa: ${err.message}`);
      throw err;
    }
  };

  // ============================================
  // CANDIDATURAS (RAISA)
  // ============================================

  const loadCandidaturas = async () => {
    try {
      const { data, error } = await supabase
        .from('candidaturas')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      setCandidaturas(data || []);
      console.log(`✅ ${(data || []).length} candidaturas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar candidaturas:', err);
      throw err;
    }
  };

  const addCandidatura = async (newCandidatura: Omit<Candidatura, 'id'>) => {
    try {
      console.log('➕ Criando candidatura:', newCandidatura);

      const { data, error } = await supabase
        .from('candidaturas')
        .insert([newCandidatura])
        .select()
        .single();

      if (error) throw error;

      setCandidaturas(prev => [data, ...prev]);
      console.log('✅ Candidatura criada:', data);
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao criar candidatura:', err);
      alert(`Erro ao criar candidatura: ${err.message}`);
      throw err;
    }
  };

  const updateCandidatura = async (id: number, updates: Partial<Candidatura>) => {
    try {
      console.log('📝 Atualizando candidatura:', id, updates);

      const { data, error } = await supabase
        .from('candidaturas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setCandidaturas(prev => prev.map(c => c.id === id ? data : c));
      console.log('✅ Candidatura atualizada:', data);
      
      return data;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar candidatura:', err);
      alert(`Erro ao atualizar candidatura: ${err.message}`);
      throw err;
    }
  };

  // ============================================
  // RETORNAR HOOK
  // ============================================

  return {
    // Estado
    users,
    clients,
    consultants,
    usuariosCliente,
    coordenadoresCliente,
    templates,
    campaigns,
    feedbackResponses,
    rhActions,
    vagas,
    pessoas,
    candidaturas,
    loading,
    error,

    // Métodos - Usuários
    addUser,
    updateUser,
    deleteUser: async (id: number) => {
      setUsers(prev => prev.filter(u => u.id !== id));
    },

    // Métodos - Clientes
    addClient,
    updateClient,
    deleteClient: async (id: number) => {
      setClients(prev => prev.filter(c => c.id !== id));
    },

    // Métodos - Consultores
    addConsultant,
    updateConsultant,
    deleteConsultant: async (id: number) => {
      setConsultants(prev => prev.filter(c => c.id !== id));
    },

    // Métodos - RAISA
    addVaga,
    updateVaga,
    deleteVaga: async (id: number) => {
      setVagas(prev => prev.filter(v => v.id !== id));
    },
    addPessoa,
    updatePessoa,
    deletePessoa: async (id: number) => {
      setPessoas(prev => prev.filter(p => p.id !== id));
    },
    addCandidatura,
    updateCandidatura,
    deleteCandidatura: async (id: number) => {
      setCandidaturas(prev => prev.filter(c => c.id !== id));
    },

    // Métodos - Outros (placeholders)
    addUsuarioCliente: async () => {},
    updateUsuarioCliente: async () => {},
    deleteUsuarioCliente: async () => {},
    addCoordenadorCliente: async () => {},
    updateCoordenadorCliente: async () => {},
    deleteCoordenadorCliente: async () => {},
    addTemplate: async () => {},
    updateTemplate: async () => {},
    deleteTemplate: async () => {},
    addCampaign: async () => {},
    updateCampaign: async () => {},
    deleteCampaign: async () => {},
    addFeedbackResponse: async () => {},
    updateFeedbackResponse: async () => {},
    deleteFeedbackResponse: async () => {},
    addRHAction: async () => {},
    updateRHAction: async () => {},
    deleteRHAction: async () => {},

    // Reload
    loadAllData
  };
};
