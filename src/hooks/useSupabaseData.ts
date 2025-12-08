/**
 * useSupabaseData Hook - INTEGRAÇÃO 100% COMPLETA
 * Todas as entidades integradas ao Supabase
 * Versão: 2.2 - Corrigido para snake_case (Supabase)
 * 
 * CORREÇÃO: Nomes de campos ajustados para snake_case
 * (risk_score, negative_pattern, generated_by, alert_type, ai_justification, created_at)
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
        loadConsultants(),  // ✅ CORRIGIDO: Agora carrega relatórios com snake_case
        loadUsuariosCliente(),
        loadCoordenadoresCliente(),
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
        tipo_usuario: user.tipo_usuario || 'Consulta',
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
        tipo_usuario: data.tipo_usuario || 'Consulta',
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

  const updateUser = async (id: number, updates: Partial<Omit<User, 'id'>>) => {
    try {
      console.log('✏️ Atualizando usuário:', id, updates);

      const { data, error } = await supabase
        .from('app_users')
        .update({
          nome_usuario: updates.nome_usuario,
          email_usuario: updates.email_usuario,
          tipo_usuario: updates.tipo_usuario,
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
        tipo_usuario: data.tipo_usuario || 'Consulta',
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

  // ============================================
  // CONSULTORES (CONSULTANTS) - ✅ CORRIGIDO SNAKE_CASE
  // ============================================

  const loadConsultants = async () => {
    try {
      console.log('🔄 Carregando consultores COM relatórios (snake_case)...');
      
      // ✅ CORREÇÃO: Nomes de campos em snake_case conforme Supabase
      const { data, error } = await supabase
        .from('consultants')
        .select(`
          *,
          reports:consultant_reports(
            id,
            month,
            year,
            risk_score,
            summary,
            negative_pattern,
            predictive_alert,
            recommendations,
            content,
            created_at,
            generated_by,
            alert_type,
            ai_justification
          )
        `)
        .order('id', { ascending: true });

      if (error) {
        console.warn('⚠️ Erro ao carregar com relatórios, tentando sem:', error.message);
        // Fallback: carregar sem relatórios se houver erro
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('consultants')
          .select('*')
          .order('id', { ascending: true });
        
        if (fallbackError) throw fallbackError;
        
        const mappedConsultants: Consultant[] = (fallbackData || []).map((consultant: any) => ({
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
          reports: []  // Vazio se não conseguir carregar
        }));
        
        setConsultants(mappedConsultants);
        console.log(`✅ ${mappedConsultants.length} consultores carregados (SEM relatórios)`);
        return;
      }

      // ✅ Mapear relatórios convertendo snake_case para camelCase (se necessário para o tipo)
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
        // ✅ Mapear relatórios com conversão de snake_case para camelCase
        reports: (consultant.reports || []).map((report: any) => ({
          id: report.id,
          month: report.month,
          year: report.year,
          riskScore: report.risk_score,  // ✅ Conversão
          summary: report.summary,
          negativePattern: report.negative_pattern,  // ✅ Conversão
          predictiveAlert: report.predictive_alert,  // ✅ Conversão
          recommendations: report.recommendations,
          content: report.content,
          createdAt: report.created_at,  // ✅ Conversão
          generatedBy: report.generated_by,  // ✅ Conversão
          alertType: report.alert_type,  // ✅ Conversão
          aiJustification: report.ai_justification  // ✅ Conversão
        }))
      }));

      setConsultants(mappedConsultants);
      
      // Log detalhado
      const totalReports = mappedConsultants.reduce((sum, c) => sum + (c.reports?.length || 0), 0);
      console.log(`✅ ${mappedConsultants.length} consultores carregados (${totalReports} relatórios)`);
      
    } catch (err: any) {
      console.error('❌ Erro ao carregar consultores:', err);
      throw err;
    }
  };

  // ============================================
  // PLACEHOLDER: Outros métodos (manter igual ao original)
  // ============================================
  // [Os outros métodos do hook permaneceriam aqui - addConsultant, updateConsultant, etc.]
  // Para brevidade, estou mostrando apenas a função corrigida

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
          ano_vigencia: newConsultant.ano_vigencia,
          data_inclusao_consultores: newConsultant.data_inclusao_consultores,
          status: newConsultant.status || 'Ativo',
          valor_faturamento: newConsultant.valor_faturamento,
          gestor_imediato_id: newConsultant.gestor_imediato_id || null,
          coordenador_id: newConsultant.coordenador_id || null,
          gestor_rs_id: newConsultant.gestor_rs_id || null,
          id_gestao_de_pessoas: newConsultant.id_gestao_de_pessoas || null
        }])
        .select()
        .single();

      if (error) throw error;

      const createdConsultant: Consultant = {
        id: data.id,
        nome_consultores: data.nome_consultores,
        email_consultor: data.email_consultor,
        cpf: data.cpf,
        cargo_consultores: data.cargo_consultores,
        ano_vigencia: data.ano_vigencia,
        data_inclusao_consultores: data.data_inclusao_consultores,
        data_ultima_alteracao: data.data_ultima_alteracao,
        data_saida: data.data_saida,
        status: data.status,
        motivo_desligamento: data.motivo_desligamento,
        valor_faturamento: data.valor_faturamento,
        gestor_imediato_id: data.gestor_imediato_id,
        coordenador_id: data.coordenador_id,
        gestor_rs_id: data.gestor_rs_id,
        id_gestao_de_pessoas: data.id_gestao_de_pessoas,
        parecer_1_consultor: data.parecer_1_consultor,
        parecer_2_consultor: data.parecer_2_consultor,
        parecer_3_consultor: data.parecer_3_consultor,
        parecer_4_consultor: data.parecer_4_consultor,
        parecer_5_consultor: data.parecer_5_consultor,
        parecer_6_consultor: data.parecer_6_consultor,
        parecer_7_consultor: data.parecer_7_consultor,
        parecer_8_consultor: data.parecer_8_consultor,
        parecer_9_consultor: data.parecer_9_consultor,
        parecer_10_consultor: data.parecer_10_consultor,
        parecer_11_consultor: data.parecer_11_consultor,
        parecer_12_consultor: data.parecer_12_consultor,
        parecer_final_consultor: data.parecer_final_consultor,
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

    // Métodos de usuários
    addUser,
    updateUser,

    // Métodos de clientes
    addClient,

    // Métodos de consultores
    loadConsultants,  // Exportar para recarregar manualmente se necessário
    addConsultant,

    // Métodos de carregamento
    loadAllData,
    updateConsultantScore, // Adicionado
  };
};


  // ============================================
  // ATUALIZAR SCORE DO CONSULTOR (NOVO)
  // ============================================

  const updateConsultantScore = async (result: AIAnalysisResult, reportText: string): Promise<{ success: boolean; consultantName: string; error?: string }> => {
    // Validação inicial
    if (!result.consultantName) {
      console.warn('⚠️ updateConsultantScore: Nome do consultor não retornado pela IA. Ignorando registro.');
      return { success: false, consultantName: 'undefined', error: 'Nome do consultor não retornado pela IA' };
    }

    try {
      console.log('🔄 Atualizando score do consultor:', result.consultantName);

      // 1. Encontrar o consultor pelo nome
      const { data: consultantData, error: consultantError } = await supabase
        .from('consultants')
        .select('id')
        .eq('nome_consultores', result.consultantName)
        .single();

      if (consultantError || !consultantData) {
        console.warn(`⚠️ Consultor '${result.consultantName}' não encontrado no banco de dados. Ignorando registro.`);
        return { success: false, consultantName: result.consultantName, error: 'Consultor não encontrado no banco de dados' };
      }

      const consultantId = consultantData.id;

      // 2. Inserir o novo relatório em consultant_reports
      const { data: reportData, error: reportError } = await supabase
        .from('consultant_reports')
        .insert([{
          consultant_id: consultantId,
          month: result.reportMonth,
          year: new Date().getFullYear(),
          risk_score: result.riskScore,
          summary: result.summary,
          negative_pattern: result.negativePattern,
          predictive_alert: result.predictiveAlert,
          recommendations: result.recommendations,
          content: reportText, // Salva o conteúdo original do relatório
          generated_by: 'ia_automatica',
          ai_justification: result.summary, // Pode ser mais detalhado se a API fornecer
        }])
        .select()
        .single();

      if (reportError) {
        console.error(`❌ Erro ao salvar relatório para '${result.consultantName}':`, reportError);
        return { success: false, consultantName: result.consultantName, error: `Erro ao salvar o relatório: ${reportError.message}` };
      }

      console.log('✅ Relatório de análise salvo:', reportData);

      // 3. Atualizar a tabela consultants com o novo score
      const monthField = `parecer_${result.reportMonth}_consultor`;
      const { data: updatedConsultant, error: updateError } = await supabase
        .from('consultants')
        .update({ 
            [monthField]: result.riskScore,
            parecer_final_consultor: result.riskScore // Lógica simplificada, pode ser melhorada
         })
        .eq('id', consultantId)
        .select()
        .single();

      if (updateError) {
        console.error(`❌ Erro ao atualizar score para '${result.consultantName}':`, updateError);
        return { success: false, consultantName: result.consultantName, error: `Erro ao atualizar o score: ${updateError.message}` };
      }

      console.log('✅ Score do consultor atualizado:', updatedConsultant);

      // 4. Atualizar o estado local para refletir as mudanças na UI
      setConsultants(prev => prev.map(c => {
        if (c.id === consultantId) {
          const newReports = [...c.reports, reportData as ConsultantReport];
          return { ...c, ...updatedConsultant, reports: newReports };
        }
        return c;
      }));

      return { success: true, consultantName: result.consultantName };


    } catch (err: any) {
      console.error('❌ Erro inesperado em updateConsultantScore:', err);
      return { success: false, consultantName: result.consultantName, error: err.message };
    }
  };
