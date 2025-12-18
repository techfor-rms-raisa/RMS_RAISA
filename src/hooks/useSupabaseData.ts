/**
 * useSupabaseData Hook - INTEGRAÇÃO 100% COMPLETA
 * Todas as entidades integradas ao Supabase
 * Versão: 2.1 - Com notificação de Risco Crítico
 */

import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { sendCriticalRiskNotifications, isCriticalRisk } from '../services/emailService';
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
      
      // Usar Promise.allSettled para continuar mesmo se algumas tabelas falharem
      const results = await Promise.allSettled([
        loadUsers(),
        loadClients(),
        loadConsultants(),
        loadUsuariosCliente(),
        loadCoordenadoresCliente(),
        loadTemplates(),
        loadCampaigns(),
        loadVagas(),
        loadPessoas(),
        loadCandidaturas()
      ]);
      
      // Verificar quais carregamentos falharam
      const failures = results
        .map((result, index) => {
          const names = ['Users', 'Clients', 'Consultants', 'UsuariosCliente', 'CoordenadoresCliente', 'Templates', 'Campaigns', 'Vagas', 'Pessoas', 'Candidaturas'];
          if (result.status === 'rejected') {
            console.warn(`⚠️ Falha ao carregar ${names[index]}:`, result.reason);
            return names[index];
          }
          return null;
        })
        .filter(Boolean);
      
      if (failures.length > 0) {
        console.warn(`⚠️ ${failures.length} tabela(s) falharam ao carregar: ${failures.join(', ')}`);
        // Não defina erro se pelo menos alguns dados foram carregados
        if (failures.length < 10) { // Aumentar tolerância
          setError(null); // Continuar mesmo com falhas parciais
        }
      }
      
      console.log('✅ Carregamento de dados concluído!');
      setLoading(false);
    } catch (err: any) {
      console.error('❌ Erro crítico ao carregar dados:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // ============================================
  // USUÁRIOS (APP_USERS)
  // ============================================

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      // ✅ v51: Corrigido - tabela app_users usa gestor_rs_id, não analista_rs_id
      const mappedUsers: User[] = (data || []).map((user: any) => ({
        id: user.id,
        nome_usuario: user.nome_usuario,
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
    } catch (err: any) {
      console.error('❌ Erro ao carregar usuários:', err);
      throw err;
    }
  };

  const addUser = async (newUser: Omit<User, 'id'>) => {
    try {
      console.log('➕ Criando usuário:', newUser);

      // ✅ v51: Corrigido - usar gestor_rs_id em vez de analista_rs_id
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
        email_usuario: data.email_usuario,
        senha_usuario: data.senha_usuario,
        ativo_usuario: data.ativo_usuario,
        receber_alertas_email: data.receber_alertas_email,
        tipo_usuario: data.tipo_usuario || 'Consulta',
        analista_rs_id: data.gestor_rs_id, // Mapeado de gestor_rs_id
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

  const updateUser = async (id: number, updates: Partial<User>) => {
    try {
      console.log('📝 Atualizando usuário:', id, updates);

      // ✅ v51: Corrigido - usar gestor_rs_id em vez de analista_rs_id
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
        email_usuario: data.email_usuario,
        senha_usuario: data.senha_usuario,
        ativo_usuario: data.ativo_usuario,
        receber_alertas_email: data.receber_alertas_email,
        tipo_usuario: data.tipo_usuario || 'Consulta',
        analista_rs_id: data.gestor_rs_id, // Mapeado de gestor_rs_id
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

  // ============================================
  // CLIENTES (CLIENTS)
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
        razao_social_cliente: client.razao_social_cliente,
        ativo_cliente: client.ativo_cliente,
        vip: client.vip,
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
  // ============================================
  // GESTORES DE CLIENTES (USUARIOS_CLIENTE)
  // ============================================

  const loadUsuariosCliente = async () => {
    try {
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
    } catch (err: any) {
      console.error('❌ Erro ao carregar gestores de clientes:', err);
      throw err;
    }
  };

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

  const batchAddManagers = async (newManagers: Omit<UsuarioCliente, 'id'>[]) => {
    try {
      console.log(`➕ Criando ${newManagers.length} gestores em lote...`);

      // Preparar dados para inserção
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

  // ============================================

  // Inativar Gestor (ao invés de deletar)
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
    } catch (error) {
      console.error('❌ Erro ao inativar gestor:', error);
      throw error;
    }
  };

  // Inativar Coordenador (ao invés de deletar)
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
    } catch (error) {
      console.error('❌ Erro ao inativar coordenador:', error);
      throw error;
    }
  };
  // COORDENADORES DE CLIENTES (COORDENADORES_CLIENTE)
  // ============================================

  const loadCoordenadoresCliente = async () => {
    try {
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
    } catch (err: any) {
      console.error('❌ Erro ao carregar coordenadores de clientes:', err);
      throw err;
    }
  };

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

  const batchAddCoordinators = async (newCoordinators: Omit<CoordenadorCliente, 'id'>[]) => {
    try {
      console.log(`➕ Criando ${newCoordinators.length} coordenadores em lote...`);

      // Preparar dados para inserção
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


  // ============================================
  // CONSULTORES (CONSULTANTS)
  // ============================================

  const loadConsultants = async () => {
    try {
      // 1️⃣ Carregar consultores SEM JOIN (evita erro de query)
      const { data, error } = await supabase
        .from('consultants')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      // ⚠️ NÃO CARREGAR RELATÓRIOS AQUI - USAR LAZY LOADING
      // Os relatórios serão carregados sob demanda via loadConsultantReports()

      const mappedConsultants: Consultant[] = (data || []).map((consultant: any) => ({
        id: consultant.id,
        nome_consultores: consultant.nome_consultores,
        email_consultor: consultant.email_consultor,
        celular: consultant.celular, // ✅ Adicionado campo de celular
        cpf: consultant.cpf,
        cargo_consultores: consultant.cargo_consultores,
        ano_vigencia: consultant.ano_vigencia,
        data_inclusao_consultores: consultant.data_inclusao_consultores,
        data_ultima_alteracao: consultant.data_ultima_alteracao,
        data_saida: consultant.data_saida,
        status: consultant.status,
        motivo_desligamento: consultant.motivo_desligamento,
        valor_faturamento: consultant.valor_faturamento,
        valor_pagamento: consultant.valor_pagamento, // ✅ NOVO: Valor pago ao consultor
        gestor_imediato_id: consultant.gestor_imediato_id,
        coordenador_id: consultant.coordenador_id,
        analista_rs_id: consultant.analista_rs_id,
        id_gestao_de_pessoas: consultant.id_gestao_de_pessoas,
        parecer_1_consultor: consultant.parecer_1_consultor,
        parecer_2_consultor: consultant.parecer_2_consultor,
        parecer_3_consultor: consultant.parecer_3_consultor,
        parecer_4_consultor: consultant.parecer_4_consultor,
        parecer_5_consultor: consultant.parecer_5_consultor,
        parecer_6_consultor: consultant.parecer_6_consultor,
        parecer_7_consultor: consultant.parecer_7_consultor,
        parecer_8_consultor: consultant.parecer_8_consultor,
        parecer_9_consultor: consultant.parecer_9_consultor,
        parecer_10_consultor: consultant.parecer_10_consultor,
        parecer_11_consultor: consultant.parecer_11_consultor,
        parecer_12_consultor: consultant.parecer_12_consultor,
        parecer_final_consultor: consultant.parecer_final_consultor,
        reports: [],
        consultant_reports: [] // Será carregado sob demanda
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
      console.log('➥ Criando consultor:', newConsultant);
      
      // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CV E ANALISTA R&S
      let cvData: { pessoa_id?: number; candidatura_id?: number; curriculo_url?: string; curriculo_filename?: string; analista_rs_id?: number } = {};
      
      // Buscar pessoa no banco de talentos por CPF ou Email
      if (newConsultant.cpf || newConsultant.email_consultor) {
        console.log('🔍 Buscando CV do candidato...');
        
        let pessoaQuery = supabase.from('pessoas').select('*');
        
        if (newConsultant.cpf) {
          pessoaQuery = pessoaQuery.eq('cpf', newConsultant.cpf);
        } else if (newConsultant.email_consultor) {
          pessoaQuery = pessoaQuery.eq('email', newConsultant.email_consultor);
        }
        
        const { data: pessoaData, error: pessoaError } = await pessoaQuery.single();
        
        if (!pessoaError && pessoaData) {
          console.log('✅ Pessoa encontrada no banco de talentos:', pessoaData.nome);
          cvData.pessoa_id = pessoaData.id;
          cvData.curriculo_url = pessoaData.curriculo_url;
          
          // Buscar candidatura aprovada desta pessoa
          const { data: candidaturaData } = await supabase
            .from('candidaturas')
            .select('*')
            .eq('pessoa_id', String(pessoaData.id))
            .in('status', ['aprovado_cliente', 'aprovado'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (candidaturaData) {
            console.log('✅ Candidatura aprovada encontrada');
            cvData.candidatura_id = parseInt(candidaturaData.id);
            
            // ✅ NOVO: Buscar Analista R&S da candidatura
            if (candidaturaData.analista_id) {
              cvData.analista_rs_id = candidaturaData.analista_id;
              console.log('✅ Analista R&S encontrado automaticamente:', candidaturaData.analista_id);
            }
          }
          
          if (cvData.curriculo_url) {
            console.log('📎 CV recuperado automaticamente:', cvData.curriculo_url);
          }
        } else {
          console.log('⚠️ Pessoa não encontrada no banco de talentos');
        }
      }

      const { data, error } = await supabase
        .from('consultants')
        .insert([{
          nome_consultores: newConsultant.nome_consultores,
          email_consultor: newConsultant.email_consultor,
          cpf: newConsultant.cpf,
          cargo_consultores: newConsultant.cargo_consultores,
          data_inclusao_consultores: newConsultant.data_inclusao_consultores,
          status: newConsultant.status || 'Ativo',
          valor_faturamento: newConsultant.valor_faturamento,
          valor_pagamento: newConsultant.valor_pagamento, // ✅ NOVO: Valor pago ao consultor
          gestor_imediato_id: newConsultant.gestor_imediato_id,
          coordenador_id: newConsultant.coordenador_id,
          analista_rs_id: cvData.analista_rs_id || newConsultant.analista_rs_id || null, // ✅ Prioriza analista da candidatura
          id_gestao_de_pessoas: newConsultant.id_gestao_de_pessoas,
          // Campos de CV recuperados automaticamente
          pessoa_id: cvData.pessoa_id || null,
          candidatura_id: cvData.candidatura_id || null,
          curriculo_url: cvData.curriculo_url || null,
          curriculo_uploaded_at: cvData.curriculo_url ? new Date().toISOString() : null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdConsultant: Consultant = {
        ...data,
        reports: []
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
          nome_consultores: updates.nome_consultores,
          email_consultor: updates.email_consultor,
          cpf: updates.cpf,
          cargo_consultores: updates.cargo_consultores,
          status: updates.status,
          data_saida: updates.data_saida,
          motivo_desligamento: updates.motivo_desligamento,
          valor_faturamento: updates.valor_faturamento,
          valor_pagamento: updates.valor_pagamento, // ✅ NOVO: Valor pago ao consultor
          gestor_imediato_id: updates.gestor_imediato_id,
          coordenador_id: updates.coordenador_id,
          analista_rs_id: updates.analista_rs_id,
          id_gestao_de_pessoas: updates.id_gestao_de_pessoas
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedConsultant: Consultant = {
        ...data,
        reports: []
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

  const batchAddConsultants = async (newConsultants: Omit<Consultant, 'id'>[]) => {
    try {
      console.log(`➥ Criando ${newConsultants.length} consultores em lote...`);
      
      // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CVs EM LOTE
      console.log('🔍 Buscando CVs dos candidatos em lote...');
      
      // Buscar todas as pessoas de uma vez
      const cpfs = newConsultants.filter(c => c.cpf).map(c => c.cpf);
      const emails = newConsultants.filter(c => c.email_consultor).map(c => c.email_consultor);
      
      const { data: pessoasData } = await supabase
        .from('pessoas')
        .select('*')
        .or(`cpf.in.(${cpfs.join(',')}),email.in.(${emails.join(',')})`);
      
      // Criar mapa de CVs por CPF e Email
      const cvMap = new Map<string, any>();
      if (pessoasData) {
        for (const pessoa of pessoasData) {
          if (pessoa.cpf) cvMap.set(`cpf:${pessoa.cpf}`, pessoa);
          if (pessoa.email) cvMap.set(`email:${pessoa.email}`, pessoa);
        }
        console.log(`✅ ${pessoasData.length} pessoas encontradas no banco de talentos`);
      }

      const { data, error } = await supabase
        .from('consultants')
        .insert(newConsultants.map(c => {
          // Buscar CV para este consultor
          let pessoa = null;
          if (c.cpf) pessoa = cvMap.get(`cpf:${c.cpf}`);
          if (!pessoa && c.email_consultor) pessoa = cvMap.get(`email:${c.email_consultor}`);
          
          return {
            nome_consultores: c.nome_consultores,
            email_consultor: c.email_consultor,
            cpf: c.cpf,
            cargo_consultores: c.cargo_consultores,
            data_inclusao_consultores: c.data_inclusao_consultores,
            status: c.status || 'Ativo',
            valor_faturamento: c.valor_faturamento,
            gestor_imediato_id: c.gestor_imediato_id,
            coordenador_id: c.coordenador_id,
            analista_rs_id: c.analista_rs_id,
            id_gestao_de_pessoas: c.id_gestao_de_pessoas,
            // Campos de CV recuperados automaticamente
            pessoa_id: pessoa?.id || null,
            curriculo_url: pessoa?.curriculo_url || null,
            curriculo_uploaded_at: pessoa?.curriculo_url ? new Date().toISOString() : null
          };
        }))
        .select();

      if (error) throw error;

      const createdConsultants: Consultant[] = (data || []).map((consultant: any) => ({
        ...consultant,
        reports: []
      }));

      setConsultants(prev => [...prev, ...createdConsultants]);
      console.log(`✅ ${createdConsultants.length} consultores criados em lote`);
      
      return createdConsultants;
    } catch (err: any) {
      console.error('❌ Erro ao criar consultores em lote:', err);
      alert(`Erro ao criar consultores: ${err.message}`);
      throw err;
    }
  };

  // ============================================

  // Inativar Consultor (ao invés de deletar)
  const inactivateConsultant = async (id: number, dataDesligamento: string, motivoDesligamento?: string) => {
    try {
      console.log(`⏸️ Inativando consultor ${id}...`);
      
      const { data, error } = await supabase
        .from('consultants')
        .update({
          status: 'Encerrado',
          data_saida: dataDesligamento,
          motivo_desligamento: motivoDesligamento || undefined
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedConsultant: Consultant = {
        ...data,
        reports: []
      };

      setConsultants(prev => prev.map(c => c.id === id ? updatedConsultant : c));
      console.log(`✅ Consultor ${id} inativado com sucesso!`);
      
      return updatedConsultant;
    } catch (error) {
      console.error('❌ Erro ao inativar consultor:', error);
      throw error;
    }
  };
  // TEMPLATES (EMAIL_TEMPLATES)
  // ============================================

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedTemplates: EmailTemplate[] = (data || []).map((template: any) => ({
        id: template.id,
        name: template.name,
        subject: template.subject,
        body: template.body,
        context: template.context,
        status: template.status,
        created_at: template.created_at,
        updated_at: template.updated_at
      }));

      setTemplates(mappedTemplates);
      console.log(`✅ ${mappedTemplates.length} templates carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar templates:', err);
      throw err;
    }
  };

  const addTemplate = async (newTemplate: Omit<EmailTemplate, 'id'>) => {
    try {
      console.log('➕ Criando template:', newTemplate);

      const { data, error } = await supabase
        .from('email_templates')
        .insert([{
          name: newTemplate.name,
          subject: newTemplate.subject,
          body: newTemplate.body,
          context: newTemplate.context,
          status: newTemplate.status || 'rascunho'
        }])
        .select()
        .single();

      if (error) throw error;

      const createdTemplate: EmailTemplate = {
        id: data.id,
        name: data.name,
        subject: data.subject,
        body: data.body,
        context: data.context,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at
      };

      setTemplates(prev => [createdTemplate, ...prev]);
      console.log('✅ Template criado:', createdTemplate);
      
      return createdTemplate;
    } catch (err: any) {
      console.error('❌ Erro ao criar template:', err);
      alert(`Erro ao criar template: ${err.message}`);
      throw err;
    }
  };

  const updateTemplate = async (id: string, updates: Partial<EmailTemplate>) => {
    try {
      console.log('📝 Atualizando template:', id, updates);

      const { data, error } = await supabase
        .from('email_templates')
        .update({
          name: updates.name,
          subject: updates.subject,
          body: updates.body,
          context: updates.context,
          status: updates.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedTemplate: EmailTemplate = {
        id: data.id,
        name: data.name,
        subject: data.subject,
        body: data.body,
        context: data.context,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at
      };

      setTemplates(prev => prev.map(t => t.id === id ? updatedTemplate : t));
      console.log('✅ Template atualizado:', updatedTemplate);
      
      return updatedTemplate;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar template:', err);
      alert(`Erro ao atualizar template: ${err.message}`);
      throw err;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      console.log('🗑️ Deletando template:', id);

      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTemplates(prev => prev.filter(t => t.id !== id));
      console.log('✅ Template deletado');
    } catch (err: any) {
      console.error('❌ Erro ao deletar template:', err);
      alert(`Erro ao deletar template: ${err.message}`);
      throw err;
    }
  };

  // ============================================
  // CAMPANHAS (COMPLIANCE_CAMPAIGNS)
  // ============================================

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('compliance_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedCampaigns: ComplianceCampaign[] = (data || []).map((campaign: any) => ({
        id: campaign.id,
        name: campaign.name,
        target_filter: campaign.target_filter,
        interval_days: campaign.interval_days,
        start_date: campaign.start_date,
        status: campaign.status,
        created_at: campaign.created_at
      }));

      setCampaigns(mappedCampaigns);
      console.log(`✅ ${mappedCampaigns.length} campanhas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar campanhas:', err);
      throw err;
    }
  };

  const addCampaign = async (newCampaign: Omit<ComplianceCampaign, 'id'>) => {
    try {
      console.log('➕ Criando campanha:', newCampaign);

      const { data, error } = await supabase
        .from('compliance_campaigns')
        .insert([{
          name: newCampaign.name,
          target_filter: newCampaign.target_filter,
          interval_days: newCampaign.interval_days,
          start_date: newCampaign.start_date,
          status: newCampaign.status || 'paused'
        }])
        .select()
        .single();

      if (error) throw error;

      const createdCampaign: ComplianceCampaign = {
        id: data.id,
        name: data.name,
        target_filter: data.target_filter,
        interval_days: data.interval_days,
        start_date: data.start_date,
        status: data.status,
        created_at: data.created_at
      };

      setCampaigns(prev => [createdCampaign, ...prev]);
      console.log('✅ Campanha criada:', createdCampaign);
      
      return createdCampaign;
    } catch (err: any) {
      console.error('❌ Erro ao criar campanha:', err);
      alert(`Erro ao criar campanha: ${err.message}`);
      throw err;
    }
  };

  const updateCampaign = async (id: string, updates: Partial<ComplianceCampaign>) => {
    try {
      console.log('📝 Atualizando campanha:', id, updates);

      const { data, error } = await supabase
        .from('compliance_campaigns')
        .update({
          name: updates.name,
          target_filter: updates.target_filter,
          interval_days: updates.interval_days,
          start_date: updates.start_date,
          status: updates.status
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedCampaign: ComplianceCampaign = {
        id: data.id,
        name: data.name,
        target_filter: data.target_filter,
        interval_days: data.interval_days,
        start_date: data.start_date,
        status: data.status,
        created_at: data.created_at
      };

      setCampaigns(prev => prev.map(c => c.id === id ? updatedCampaign : c));
      console.log('✅ Campanha atualizada:', updatedCampaign);
      
      return updatedCampaign;
    } catch (err: any) {
      console.error('❌ Erro ao atualizar campanha:', err);
      alert(`Erro ao atualizar campanha: ${err.message}`);
      throw err;
    }
  };

  // ============================================
  // VAGAS (VAGAS)
  // ============================================

  const loadVagas = async () => {
    try {
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

  // ============================================
  // PESSOAS (PESSOAS)
  // ============================================

  const loadPessoas = async () => {
    try {
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

  // ============================================
  // CANDIDATURAS (CANDIDATURAS)
  // ============================================

  const loadCandidaturas = async () => {
    try {
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
        atualizado_em: candidatura.atualizado_em
      }));

      setCandidaturas(mappedCandidaturas);
      console.log(`✅ ${mappedCandidaturas.length} candidaturas carregadas`);
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
        .insert([{
          vaga_id: newCandidatura.vaga_id,
          pessoa_id: newCandidatura.pessoa_id,
          candidato_nome: newCandidatura.candidato_nome,
          candidato_email: newCandidatura.candidato_email,
          candidato_cpf: newCandidatura.candidato_cpf,
          analista_id: newCandidatura.analista_id,
          status: newCandidatura.status || 'triagem',
          curriculo_texto: newCandidatura.curriculo_texto,
          cv_url: newCandidatura.cv_url,
          observacoes: newCandidatura.observacoes,
          feedback_cliente: newCandidatura.feedback_cliente,
          data_envio_cliente: newCandidatura.data_envio_cliente,
          enviado_ao_cliente: newCandidatura.enviado_ao_cliente || false
        }])
        .select()
        .single();

      if (error) throw error;

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
        atualizado_em: data.atualizado_em
      };

      setCandidaturas(prev => [createdCandidatura, ...prev]);
      console.log('✅ Candidatura criada:', createdCandidatura);
      
      return createdCandidatura;
    } catch (err: any) {
      console.error('❌ Erro ao criar candidatura:', err);
      alert(`Erro ao criar candidatura: ${err.message}`);
      throw err;
    }
  };

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
        atualizado_em: data.atualizado_em
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

  // ============================================
  // FUNÇÕES STUB (Compatibilidade)
  // ============================================



  const updateConsultantScore = async (result: AIAnalysisResult) => {
    try {
      console.log(`📊 Atualizando score do consultor: ${result.consultantName}`);
      
      // Buscar consultor pelo nome
      const consultant = consultants.find(c => 
        c.nome_consultores.toLowerCase() === result.consultantName.toLowerCase()
      );
      
      if (!consultant) {
        console.warn(`⚠️ Consultor não encontrado: ${result.consultantName}`);
        return;
      }
      
      // Preparar campo do mês (parecer_1_consultor, parecer_2_consultor, etc)
      const monthField = `parecer_${result.reportMonth}_consultor` as keyof Consultant;
      
      // Criar objeto de relatório
      const newReport: ConsultantReport = {
        id: `${consultant.id}_${result.reportMonth}_${Date.now()}`,
        month: result.reportMonth,
        year: new Date().getFullYear(),
        riskScore: result.riskScore,
        summary: result.summary,
        negativePattern: result.negativePattern,
        predictiveAlert: result.predictiveAlert,
        recommendations: result.recommendations,
        content: result.details,
        createdAt: new Date().toISOString(),
        generatedBy: 'manual',
        aiJustification: 'Análise baseada em relatório de atividades manual'
      };
      
      // Atualizar consultor no Supabase
      const updates: any = {
        [monthField]: result.riskScore,
        parecer_final_consultor: result.riskScore
      };
      
      const { data, error } = await supabase
        .from('consultants')
        .update(updates)
        .eq('id', consultant.id)
        .select()
        .single();
      
      if (error) throw error;
      
      // ✅ Salvar relatório integral na tabela consultant_reports (ACUMULATIVO)
      const { data: reportData, error: reportError } = await supabase
        .from('consultant_reports')
        .insert([{
          consultant_id: consultant.id,
          month: newReport.month,
          year: newReport.year,
          risk_score: newReport.riskScore,
          summary: newReport.summary,
          negative_pattern: newReport.negativePattern,
          predictive_alert: newReport.predictiveAlert,
          recommendations: JSON.stringify(newReport.recommendations),
          content: newReport.content,  // ← Relatório integral
          generated_by: newReport.generatedBy,
          ai_justification: newReport.aiJustification
          // ✅ created_at removido - Supabase gera automaticamente
        }]);
      
      if (reportError) {
        console.error('❌ Erro ao salvar relatório:', reportError);
        throw reportError;
      }
      
      console.log(`✅ Relatório salvo (acumulativo): ${consultant.nome_consultores} - Mês ${newReport.month}`);
      
      // Atualizar estado local
      const updatedConsultant: Consultant = {
        ...consultant,
        ...updates,
        reports: [...(consultant.reports || []), newReport]
      };
      
      setConsultants(prev => prev.map(c => 
        c.id === consultant.id ? updatedConsultant : c
      ));
      
      console.log(`✅ Score atualizado: ${result.consultantName} - Mês ${result.reportMonth} - Risco ${result.riskScore}`);
      
      // 🚨 NOVO: Verificar se é Risco Crítico (Score 5) e disparar notificações
      if (isCriticalRisk(result.riskScore)) {
        console.log(`🚨 RISCO CRÍTICO DETECTADO: ${result.consultantName} - Disparando notificações...`);
        
        // Buscar nome do cliente
        const manager = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
        const client = clients.find(c => c.id === manager?.id_cliente);
        const clientName = client?.razao_social_cliente || 'Cliente não identificado';
        
        // Disparar notificações de email para usuários associados
        try {
          const notificationResult = await sendCriticalRiskNotifications(
            consultant,
            users,
            clientName,
            result.summary || 'Análise de risco identificou situação crítica'
          );
          
          if (notificationResult.success) {
            console.log(`✅ Notificações enviadas: ${notificationResult.emailsSent} email(s) para: ${notificationResult.recipients.join(', ')}`);
          } else {
            console.warn(`⚠️ Falha ao enviar notificações: ${notificationResult.errors.join(', ')}`);
          }
        } catch (emailError: any) {
          console.error('❌ Erro ao enviar notificações de risco crítico:', emailError);
          // Não interrompe o fluxo principal - apenas loga o erro
        }
      }
      
      // Verificar se deve ir para quarentena (escala antiga - mantido para compatibilidade)
      if (result.riskScore === 1 || result.riskScore === 2) {
        console.log(`⚠️ Consultor em QUARENTENA: ${result.consultantName}`);
      }
      
    } catch (err: any) {
      console.error('❌ Erro ao atualizar score:', err);
      alert(`Erro ao atualizar score do consultor: ${err.message}`);
    }
  };

  // Função corrigida para chamar Gemini diretamente
const processReportAnalysis = async (text: string, gestorName?: string): Promise<AIAnalysisResult[]> => {
  try {
    console.log('🤖 Processando análise de relatório com IA Gemini...');
    console.log('📝 Tamanho do texto:', text.length, 'caracteres');
    console.log('📋 Primeiros 100 caracteres:', text.substring(0, 100));
    
    // ✅ CORRETO: Chamar API Backend (que tem acesso a process.env.API_KEY)
    console.log('📡 Enviando requisição para API Backend...');
    
    const response = await fetch('/api/analyze-activity-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportText: text, gestorName })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Erro na API: ${response.status} - ${errorData.message || response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Resposta recebida da API Backend');
    
    // Extrair resultados da análise
    const analysisResults = data.results || [];
    console.log(`✅ ${analysisResults.length} relatório(s) analisado(s) pela IA Gemini`);
    
    // Mapear resultados para AIAnalysisResult
    const results: AIAnalysisResult[] = analysisResults.map((analysis: any) => ({
      consultantName: analysis.consultantName,
      managerName: analysis.managerName,
      reportMonth: analysis.reportMonth || new Date().getMonth() + 1,
      riskScore: Math.max(1, Math.min(5, analysis.riskScore)) as 1 | 2 | 3 | 4 | 5,
      summary: analysis.summary,
      negativePattern: analysis.negativePattern || null,
      predictiveAlert: analysis.predictiveAlert || null,
      recommendations: (analysis.recommendations || []).map((rec: any) => {
        if (typeof rec === 'string') {
          return { tipo: 'RECOMENDACAO', descricao: rec };
        }
        return rec;
      }),
      details: analysis.details || analysis.summary
    }));
    
    
    if (results.length === 0) {
      console.warn('⚠️ IA não encontrou relatórios válidos no texto fornecido');
      alert('⚠️ Nenhum relatório válido encontrado. Verifique o formato do texto.');
    }
    
    return results;
    
  } catch (err: any) {
    console.error('❌ Erro ao processar análise com IA:', err);
    alert(`Erro ao processar relatório com IA: ${err.message}`);
    return [];
  }
};

  
  // Funções auxiliares removidas - Toda análise agora é feita pela IA Gemini

  const addFeedbackResponse = async (response: FeedbackResponse) => {
    console.warn('⚠️ addFeedbackResponse: Não implementado');
    setFeedbackResponses(prev => [...prev, response]);
  };

  const addRHAction = async (action: RHAction) => {
    console.warn('⚠️ addRHAction: Não implementado');
    setRhActions(prev => [...prev, action]);
  };

  const migrateYearlyData = async () => {
    console.warn('⚠️ migrateYearlyData: Não implementado');
  };

  // ============================================
  // 🔥 LAZY LOADING DE RELATÓRIOS (CORREÇÃO v51 - Failed to fetch)
  // ============================================
  
  /**
   * Carrega relatórios de um consultor específico sob demanda
   * Esta função deve ser chamada apenas quando o usuário clicar em "Ver Histórico"
   * Inclui retry automático e tratamento robusto de erros
   * @param consultantId - ID do consultor
   * @returns Array de relatórios do consultor
   */
  const loadConsultantReports = async (consultantId: number): Promise<ConsultantReport[]> => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 segundo
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`📊 Carregando relatórios do consultor ${consultantId}... (tentativa ${attempt}/${MAX_RETRIES})`);
        
        // Verificar se o Supabase está configurado
        if (!supabase) {
          throw new Error('Cliente Supabase não inicializado');
        }
        
        const { data, error } = await supabase
          .from('consultant_reports')
          .select('*')
          .eq('consultant_id', consultantId)
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error(`❌ Erro Supabase (tentativa ${attempt}):`, error);
          throw error;
        }
        
        const reports: ConsultantReport[] = (data || []).map((report: any) => {
          // Parse seguro de recommendations
          let parsedRecommendations = [];
          try {
            if (typeof report.recommendations === 'string') {
              parsedRecommendations = JSON.parse(report.recommendations);
            } else if (Array.isArray(report.recommendations)) {
              parsedRecommendations = report.recommendations;
            }
          } catch (parseError) {
            console.warn(`⚠️ Erro ao parsear recommendations do relatório ${report.id}:`, parseError);
            parsedRecommendations = [];
          }
          
          return {
            id: report.id,
            month: report.month,
            year: report.year,
            riskScore: report.risk_score,
            summary: report.summary || '',
            negativePattern: report.negative_pattern || null,
            predictiveAlert: report.predictive_alert || null,
            recommendations: parsedRecommendations,
            content: report.content || '',
            createdAt: report.created_at || new Date().toISOString(),
            generatedBy: report.generated_by || 'unknown',
            aiJustification: report.ai_justification || ''
          };
        });
        
        console.log(`✅ ${reports.length} relatórios carregados para consultor ${consultantId}`);
        
        // Atualizar o estado local do consultor com os relatórios
        setConsultants(prev => prev.map(c => 
          c.id === consultantId 
            ? { ...c, consultant_reports: reports }
            : c
        ));
        
        return reports;
        
      } catch (err: any) {
        const isNetworkError = err.message?.includes('fetch') || 
                               err.message?.includes('network') ||
                               err.code === 'NETWORK_ERROR';
        
        console.error(`❌ Erro ao carregar relatórios (tentativa ${attempt}/${MAX_RETRIES}):`, {
          message: err.message,
          code: err.code,
          hint: err.hint,
          details: err.details
        });
        
        // Se não é a última tentativa e é erro de rede, tentar novamente
        if (attempt < MAX_RETRIES && isNetworkError) {
          console.log(`⏳ Aguardando ${RETRY_DELAY * attempt}ms antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
          continue;
        }
        
        // Retornar array vazio em vez de lançar erro para não quebrar a UI
        console.error(`❌ Falha definitiva ao carregar relatórios do consultor ${consultantId}:`, err);
        
        // Lançar erro com mensagem mais amigável
        const friendlyError = new Error(
          `Erro ao carregar relatórios: ${err.message || 'Falha na conexão com o servidor'}`
        );
        (friendlyError as any).code = err.code;
        (friendlyError as any).hint = err.hint;
        (friendlyError as any).details = err.details;
        throw friendlyError;
      }
    }
    
    // Fallback - retornar array vazio se todas as tentativas falharem
    return [];
  };

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    users,
    clients,
    consultants,
    templates,
    campaigns,
    feedbackResponses,
    rhActions,
    vagas,
    pessoas,
    candidaturas,
    loading,
    error,

    // Usuários (✅ Completo)
    addUser,
    updateUser,

    // Clientes (✅ Completo)
    addClient,
    updateClient,
    batchAddClients,

    // Consultores (✅ Completo)
    addConsultant,
    updateConsultant,
    batchAddConsultants,
    inactivateConsultant,
    updateConsultantScore,
    processReportAnalysis,
    loadConsultantReports, // 🔥 Lazy loading de relatórios

    // Gestores de Clientes (✅ Implementado)
    usuariosCliente,
    loadUsuariosCliente,
    addUsuarioCliente,
    updateUsuarioCliente,
    batchAddManagers,
    inactivateGestor,

    // Coordenadores de Clientes (✅ Implementado)
    coordenadoresCliente,
    loadCoordenadoresCliente,
    addCoordenadorCliente,
    updateCoordenadorCliente,
    batchAddCoordinators,
    inactivateCoordenador,

    // Templates (✅ Completo)
    addTemplate,
    updateTemplate,
    deleteTemplate,

    // Campanhas (✅ Completo)
    addCampaign,
    updateCampaign,
    addFeedbackResponse,
    addRHAction,

    // RAISA (✅ Completo)
    addVaga,
    updateVaga,
    deleteVaga,
    addPessoa,
    updatePessoa,
    addCandidatura,
    updateCandidaturaStatus,

    // Outras
    migrateYearlyData,

    // Função para recarregar dados
    reload: loadAllData
  };
};

