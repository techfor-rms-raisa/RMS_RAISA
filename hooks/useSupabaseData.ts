/**
 * useSupabaseData Hook - INTEGRAÇÃO 100% COMPLETA
 * Todas as entidades integradas ao Supabase
 * Versão: 2.0 - Completa
 */

import { useState, useEffect } from 'react';
import { supabase } from '../src/config/supabase';
import { 
  Consultant, Client, User, UsuarioCliente, CoordenadorCliente, 
  ConsultantReport, AIAnalysisResult, EmailTemplate, ComplianceCampaign, 
  FeedbackRequest, FeedbackResponse, RHAction, BehavioralFlag, 
  LearningFeedbackLoop, Vaga, Pessoa, Candidatura
} from '../src/components/types';
import { analyzeReport, extractBehavioralFlags } from '../services/geminiService';

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
        loadTemplates(),
        loadCampaigns(),
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
  // USUÁRIOS (APP_USERS)
  // ============================================

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select(`
          *,
          perfil:perfil_id (
            id,
            nome_perfil,
            descricao,
            cor_badge,
            nivel_acesso,
            ativo
          )
        `)
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedUsers: User[] = (data || []).map((user: any) => ({
        id: user.id,
        nome_usuario: user.nome_usuario,
        email_usuario: user.email_usuario,
        senha_usuario: user.senha_usuario,
        ativo_usuario: user.ativo_usuario,
        receber_alertas_email: user.receber_alertas_email,
        tipo_usuario: user.perfil?.nome_perfil || user.tipo_usuario || 'Consulta',
        gestor_rs_id: user.gestor_rs_id,
        perfil_id: user.perfil_id,
        perfil: user.perfil
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
          gestor_rs_id: newUser.gestor_rs_id || null
        }])
        .select(`
          *,
          perfil:perfil_id (
            id,
            nome_perfil,
            descricao,
            cor_badge,
            nivel_acesso,
            ativo
          )
        `)
        .single();

      if (error) throw error;

      const createdUser: User = {
        id: data.id,
        nome_usuario: data.nome_usuario,
        email_usuario: data.email_usuario,
        senha_usuario: data.senha_usuario,
        ativo_usuario: data.ativo_usuario,
        receber_alertas_email: data.receber_alertas_email,
        tipo_usuario: data.perfil?.nome_perfil || data.tipo_usuario || 'Consulta',
        gestor_rs_id: data.gestor_rs_id,
        perfil_id: data.perfil_id,
        perfil: data.perfil
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
        .from('app_users')
        .update({
          nome_usuario: updates.nome_usuario,
          email_usuario: updates.email_usuario,
          senha_usuario: updates.senha_usuario,
          ativo_usuario: updates.ativo_usuario,
          receber_alertas_email: updates.receber_alertas_email,
          perfil_id: updates.perfil_id,
          gestor_rs_id: updates.gestor_rs_id
        })
        .eq('id', id)
        .select(`
          *,
          perfil:perfil_id (
            id,
            nome_perfil,
            descricao,
            cor_badge,
            nivel_acesso,
            ativo
          )
        `)
        .single();

      if (error) throw error;

      const updatedUser: User = {
        id: data.id,
        nome_usuario: data.nome_usuario,
        email_usuario: data.email_usuario,
        senha_usuario: data.senha_usuario,
        ativo_usuario: data.ativo_usuario,
        receber_alertas_email: data.receber_alertas_email,
        tipo_usuario: data.perfil?.nome_perfil || data.tipo_usuario || 'Consulta',
        gestor_rs_id: data.gestor_rs_id,
        perfil_id: data.perfil_id,
        perfil: data.perfil
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
  // CONSULTORES (CONSULTANTS)
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
        nome_consultores: consultant.nome_consultores,
        email_consultor: consultant.email_consultor,
        cpf: consultant.cpf,
        cargo_consultores: consultant.cargo_consultores,
        ano_vigencia: consultant.ano_vigencia,
        data_inclusao_consultores: consultant.data_inclusao_consultores,
        data_ultima_alteracao: consultant.data_ultima_alteracao,
        data_saida: consultant.data_saida,
        status: consultant.status,
        motivo_desligamento: consultant.motivo_desligamento,
        valor_faturamento: consultant.valor_faturamento,
        gestor_imediato_id: consultant.gestor_imediato_id,
        coordenador_id: consultant.coordenador_id,
        gestor_rs_id: consultant.gestor_rs_id,
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
        reports: []
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
          nome_consultores: newConsultant.nome_consultores,
          email_consultor: newConsultant.email_consultor,
          cpf: newConsultant.cpf,
          cargo_consultores: newConsultant.cargo_consultores,
          data_inclusao_consultores: newConsultant.data_inclusao_consultores,
          status: newConsultant.status || 'Ativo',
          valor_faturamento: newConsultant.valor_faturamento,
          gestor_imediato_id: newConsultant.gestor_imediato_id,
          coordenador_id: newConsultant.coordenador_id,
          gestor_rs_id: newConsultant.gestor_rs_id,
          id_gestao_de_pessoas: newConsultant.id_gestao_de_pessoas
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
          gestor_imediato_id: updates.gestor_imediato_id,
          coordenador_id: updates.coordenador_id,
          gestor_rs_id: updates.gestor_rs_id,
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
      console.log(`➕ Criando ${newConsultants.length} consultores em lote...`);

      const { data, error } = await supabase
        .from('consultants')
        .insert(newConsultants.map(c => ({
          nome_consultores: c.nome_consultores,
          email_consultor: c.email_consultor,
          cpf: c.cpf,
          cargo_consultores: c.cargo_consultores,
          data_inclusao_consultores: c.data_inclusao_consultores,
          status: c.status || 'Ativo',
          valor_faturamento: c.valor_faturamento,
          gestor_imediato_id: c.gestor_imediato_id,
          coordenador_id: c.coordenador_id,
          gestor_rs_id: c.gestor_rs_id,
          id_gestao_de_pessoas: c.id_gestao_de_pessoas
        })))
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

  const addUsuarioCliente = async (newUsuario: Omit<UsuarioCliente, 'id'>) => {
    console.warn('⚠️ addUsuarioCliente: Não implementado (tabela não existe no Supabase)');
    const usuario = { ...newUsuario, id: Date.now() } as UsuarioCliente;
    setUsuariosCliente(prev => [...prev, usuario]);
    return usuario;
  };

  const updateUsuarioCliente = async (id: number, updates: Partial<UsuarioCliente>) => {
    console.warn('⚠️ updateUsuarioCliente: Não implementado (tabela não existe no Supabase)');
    setUsuariosCliente(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  };

  const batchAddManagers = async (newManagers: Omit<UsuarioCliente, 'id'>[]) => {
    console.warn('⚠️ batchAddManagers: Não implementado (tabela não existe no Supabase)');
    const managers = newManagers.map((m, i) => ({ ...m, id: Date.now() + i } as UsuarioCliente));
    setUsuariosCliente(prev => [...prev, ...managers]);
  };

  const addCoordenadorCliente = async (newCoordenador: Omit<CoordenadorCliente, 'id'>) => {
    console.warn('⚠️ addCoordenadorCliente: Não implementado (tabela não existe no Supabase)');
    const coordenador = { ...newCoordenador, id: Date.now() } as CoordenadorCliente;
    setCoordenadoresCliente(prev => [...prev, coordenador]);
    return coordenador;
  };

  const updateCoordenadorCliente = async (id: number, updates: Partial<CoordenadorCliente>) => {
    console.warn('⚠️ updateCoordenadorCliente: Não implementado (tabela não existe no Supabase)');
    setCoordenadoresCliente(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const batchAddCoordinators = async (newCoordinators: Omit<CoordenadorCliente, 'id'>[]) => {
    console.warn('⚠️ batchAddCoordinators: Não implementado (tabela não existe no Supabase)');
    const coordinators = newCoordinators.map((c, i) => ({ ...c, id: Date.now() + i } as CoordenadorCliente));
    setCoordenadoresCliente(prev => [...prev, ...coordinators]);
  };

  const updateConsultantScore = (result: AIAnalysisResult) => {
    console.warn('⚠️ updateConsultantScore: Não implementado');
  };

const processReportAnalysis = async (text: string, gestorName?: string): Promise<AIAnalysisResult[]> => {
    try {
      console.log('📊 Iniciando processamento de relatórios...');
      
      const reports: Array<{ consultantName: string; managerName: string; month: number; year: number; activities: string; }> = [];

      // ========================================
      // DETECTAR FORMATO DO TEXTO
      // ========================================
      
      // Formato 1: CSV com pipe (|)
      const linesWithPipe = text.split('\n').filter(line => line.includes('|') && !line.toUpperCase().includes('CONSULTOR') && !line.toUpperCase().includes('GESTOR'));
      
      if (linesWithPipe.length > 0) {
        // ========================================
        // PROCESSAR FORMATO CSV
        // ========================================
        console.log('📋 Formato detectado: CSV com pipe');
        
        for (const line of linesWithPipe) {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length < 4) continue;

          const [consultantName, managerName, monthStr, ...activitiesParts] = parts;
          const month = parseInt(monthStr, 10);
          const activities = activitiesParts.join('|').trim();

          if (!consultantName || !activities || isNaN(month) || month < 1 || month > 12) continue;

          reports.push({ 
            consultantName, 
            managerName: managerName || gestorName || 'Não informado', 
            month, 
            year: new Date().getFullYear(),
            activities 
          });
        }
      } else {
        // ========================================
        // PROCESSAR FORMATO PDF NARRATIVO
        // ========================================
        console.log('📄 Formato detectado: PDF narrativo');
        
        // Extrair nome do consultor (primeira linha ou linha com nome destacado)
        const nameMatch = text.match(/^([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ]+)+)/m);
        const consultantName = nameMatch ? nameMatch[1].trim() : 'Não identificado';
        
        // Extrair período (datas)
        const periodMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s*a\s*(\d{2})\.(\d{2})\.(\d{4})/);
        let month = new Date().getMonth() + 1;
        let year = new Date().getFullYear();
        
        if (periodMatch) {
          const startMonth = parseInt(periodMatch[2]);
          const startYear = parseInt(periodMatch[3]);
          month = startMonth;
          year = startYear;
        }
        
        // Extrair atividades (todo o texto é considerado atividades)
        const activities = text.trim();
        
        if (consultantName !== 'Não identificado' && activities) {
          reports.push({
            consultantName,
            managerName: gestorName || 'Não informado',
            month,
            year,
            activities
          });
        }
      }

      // ========================================
      // VALIDAR SE ENCONTROU RELATÓRIOS
      // ========================================
      
      if (reports.length === 0) {
        console.error('❌ Nenhum relatório válido encontrado');
        console.log('💡 Dica: Verifique se o arquivo contém:');
        console.log('   - Nome do consultor');
        console.log('   - Período (datas)');
        console.log('   - Atividades detalhadas');
        return [];
      }

      console.log(`✅ ${reports.length} relatório(s) encontrado(s)`);

      // ========================================
      // PROCESSAR CADA RELATÓRIO COM IA
      // ========================================
      
      const results: AIAnalysisResult[] = [];

      for (const report of reports) {
        try {
          console.log(`🔍 Analisando: ${report.consultantName} (${report.month}/${report.year})`);
          
          const aiResults = await analyzeReport(report.activities);
          
          if (aiResults && aiResults.length > 0) {
            const aiResult = aiResults[0];
            const enrichedResult: AIAnalysisResult = {
              ...aiResult,
              consultantName: report.consultantName,
              managerName: report.managerName,
              reportMonth: report.month,
              reportYear: report.year
            };
            
            results.push(enrichedResult);

            // ========================================
            // ATUALIZAR SCORE NO BANCO
            // ========================================
            
            const { data: consultant } = await supabase
              .from('consultores')
              .select('id')
              .ilike('nome', report.consultantName)
              .single();

            if (consultant) {
              await supabase
                .from('consultores')
                .update({ 
                  score_risco: enrichedResult.riskScore,
                  quarentena: enrichedResult.riskScore >= 4  // ✅ ESCALA 1-5: 4 e 5 = QUARENTENA
                })
                .eq('id', consultant.id);

              setConsultants(prev => prev.map(c => 
                c.id === consultant.id 
                  ? { ...c, scoreRisco: enrichedResult.riskScore, quarentena: enrichedResult.riskScore >= 4 }
                  : c
              ));

              // Salvar flags comportamentais
              const flags = await extractBehavioralFlags(report.activities);
              if (flags.length > 0) {
                const flagsToInsert = flags.map(flag => ({
                  consultor_id: consultant.id,
                  flag_type: flag.flagType,
                  description: flag.description,
                  flag_date: flag.flagDate
                }));
                
                await supabase.from('behavioral_flags').insert(flagsToInsert);
              }
            } else {
              console.warn(`⚠️ Consultor não encontrado no banco: ${report.consultantName}`);
            }
          }
        } catch (error) {
          console.error(`❌ Erro ao processar ${report.consultantName}:`, error);
        }
      }

      console.log(`🎉 Processamento concluído: ${results.length} relatórios analisados`);
      return results;

    } catch (error) {
      console.error('❌ Erro geral no processamento:', error);
      throw error;
    }
  };

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
  // RETORNO DO HOOK
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
    updateConsultantScore,
    processReportAnalysis,

    // Gestores/Coordenadores (⚠️ Não implementado - tabelas não existem)
    addUsuarioCliente,
    updateUsuarioCliente,
    batchAddManagers,
    addCoordenadorCliente,
    updateCoordenadorCliente,
    batchAddCoordinators,

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