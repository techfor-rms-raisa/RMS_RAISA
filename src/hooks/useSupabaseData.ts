/**
 * useSupabaseData Hook - VERSÃO CORRIGIDA
 * Foco em robustez, tratamento de erros e logs aprimorados.
 * Versão: 2.1 - Corrigida
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { 
  Consultant, Client, User, UsuarioCliente, CoordenadorCliente, 
  ConsultantReport, AIAnalysisResult, EmailTemplate, ComplianceCampaign, 
  FeedbackRequest, FeedbackResponse, RHAction, BehavioralFlag, 
  LearningFeedbackLoop, Vaga, Pessoa, Candidatura
} from '../components/types';

// Função auxiliar para converter arrays do Supabase de forma segura
const parseArray = (dbArray: any): string[] => {
  if (Array.isArray(dbArray)) return dbArray;
  if (typeof dbArray === 'string' && dbArray.startsWith('{') && dbArray.endsWith('}')) {
    return dbArray.slice(1, -1).split(',').map(item => item.replace(/"/g, '').trim()).filter(Boolean);
  }
  if (typeof dbArray === 'string') { // Fallback para strings simples
    return dbArray.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
};

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
  // FUNÇÕES DE CARREGAMENTO
  // ============================================

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('app_users').select('*').order('id', { ascending: true });
      if (error) throw error;
      const mappedUsers: User[] = (data || []).map((user: any) => ({
        id: user.id,
        nome_usuario: user.nome_usuario,
        email_usuario: user.email_usuario,
        senha_usuario: user.senha_usuario,
        ativo_usuario: user.ativo_usuario,
        receber_alertas_email: user.receber_alertas_email,
        tipo_usuario: user.tipo_usuario || 'Consulta',
        analista_rs_id: user.analista_rs_id,
        perfil_id: user.perfil_id,
        perfil: null
      }));
      setUsers(mappedUsers);
      console.log(`✅ ${mappedUsers.length} usuários carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar usuários:', err);
      throw err;
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('clients').select('*').order('id', { ascending: true });
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
  }, []);

  const loadConsultants = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('consultores').select('*').order('id', { ascending: true });
      if (error) throw error;
      setConsultants(data || []);
      console.log(`✅ ${data?.length || 0} consultores carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar consultores:', err);
      throw err;
    }
  }, []);

  const loadVagas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('vagas').select('*').order('id', { ascending: true });
      if (error) throw error;
      const mappedVagas = (data || []).map(vaga => ({ ...vaga, stack_tecnologica: parseArray(vaga.stack_tecnologica) }));
      setVagas(mappedVagas);
      console.log(`✅ ${mappedVagas.length} vagas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar vagas:', err);
      throw err;
    }
  }, []);

  // ... (outras funções de load omitidas para brevidade)

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Carregando TODOS os dados do Supabase...');
      
      const results = await Promise.allSettled([
        loadUsers(),
        loadClients(),
        loadConsultants(),
        loadVagas(),
        // ... (outras chamadas)
      ]);
      
      const failures = results
        .map((result, index) => {
          const names = ['Users', 'Clients', 'Consultants', 'Vagas'];
          if (result.status === 'rejected') {
            console.warn(`⚠️ Falha ao carregar ${names[index]}:`, result.reason);
            return names[index];
          }
          return null;
        })
        .filter(Boolean);
      
      if (failures.length > 0) {
        setError(`Falha ao carregar: ${failures.join(', ')}`);
      }
      
      console.log('✅ Carregamento de dados concluído!');
    } catch (err: any) {
      console.error('❌ Erro crítico ao carregar dados:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadUsers, loadClients, loadConsultants, loadVagas]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ============================================
  // FUNÇÕES DE ESCRITA (ADD, UPDATE, DELETE)
  // ============================================

  const addVaga = async (newVaga: Omit<Vaga, 'id'>) => {
    try {
      const vagaToInsert = {
        ...newVaga,
        stack_tecnologica: Array.isArray(newVaga.stack_tecnologica) ? `{${newVaga.stack_tecnologica.join(',')}}` : '{}',
      };
      const { data, error } = await supabase.from('vagas').insert([vagaToInsert]).select().single();
      if (error) throw error;
      const createdVaga = { ...data, stack_tecnologica: parseArray(data.stack_tecnologica) };
      setVagas(prev => [...prev, createdVaga]);
      return createdVaga;
    } catch (err: any) {
      console.error('❌ Erro ao criar vaga:', err);
      alert(`Erro ao criar vaga: ${err.message}`);
      throw err;
    }
  };

  // ... (outras funções de escrita omitidas)

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    users,
    clients,
    consultants,
    vagas,
    loading,
    error,

    // Funções de Escrita
    addVaga,
    // ... (outras)

    // Controle
    reload: loadAllData
  };
};
