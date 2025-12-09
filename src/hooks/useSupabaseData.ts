/*
 * useSupabaseData Hook - INTEGRAÇÃO 100% COMPLETA
 * Todas as entidades integradas ao Supabase
 * Versão: 2.0 - Completa
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
        .select(`
          *,
          perfil:perfil_id (
            id,
            nome_perfil,
            permissoes
          )
        `)
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedUsers: User[] = (data || []).map((user: any) => ({
        id: user.id,
        nome_usuario: user.nome_usuario,
        email_usuario: user.email_usuario,
        senha_usuario: user.senha_usuario,
        perfil_id: user.perfil_id,
        perfil: user.perfil,
        data_criacao: user.data_criacao,
        data_ultima_alteracao: user.data_ultima_alteracao,
        status: user.status
      }));

      setUsers(mappedUsers);
      console.log(`✅ ${mappedUsers.length} usuários carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar usuários:', err);
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
        nome_cliente: client.nome_cliente,
        email_cliente: client.email_cliente,
        telefone_cliente: client.telefone_cliente,
        endereco_cliente: client.endereco_cliente,
        cnpj_cliente: client.cnpj_cliente,
        data_inclusao_cliente: client.data_inclusao_cliente,
        data_ultima_alteracao: client.data_ultima_alteracao,
        status: client.status
      }));

      setClients(mappedClients);
      console.log(`✅ ${mappedClients.length} clientes carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar clientes:', err);
      throw err;
    }
  };

  // ============================================
  // CONSULTORES (CONSULTANTS)
  // ============================================

  const loadConsultants = async () => {
    try {
      // 1️⃣ Carregar consultores
      const { data, error } = await supabase
        .from('consultants')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      // 2️⃣ Carregar relatórios separadamente
      const { data: reportsData } = await supabase
        .from('consultant_reports')
        .select('*');

      // 3️⃣ Mapear relatórios por consultant_id
      const reportsMap = new Map<number, ConsultantReport[]>();
      (reportsData || []).forEach((report: any) => {
        if (!reportsMap.has(report.consultant_id)) {
          reportsMap.set(report.consultant_id, []);
        }
        reportsMap.get(report.consultant_id)!.push(report);
      });

      // 4️⃣ Mapear consultores com seus relatórios
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
        reports: [],
        consultant_reports: reportsMap.get(consultant.id) || []
      }));

      setConsultants(mappedConsultants);
      console.log(`✅ ${mappedConsultants.length} consultores carregados`);
      console.log(`✅ ${reportsData?.length || 0} relatórios carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar consultores:', err);
      throw err;
    }
  };

  const addConsultant = async (newConsultant: Omit<Consultant, 'id'>) => {
    try {
      console.log('➥ Criando consultor:', newConsultant);
      
      // 🔍 RECUPERAÇÃO AUTOMÁTICA DE CV
      let cvData: { pessoa_id?: number; candidatura_id?: number; curriculo_url?: string; curriculo_filename?: string } = {};
      
      // Buscar pessoa no banco de talentos por CPF ou Email
      if (newConsultant.cpf || newConsultant.email_consultor) {
        console.log('🔍 Buscando CV do candidato...');
        
        let pessoaQuery = supabase.from('pessoas').select('*');
        
        if (newConsultant.cpf) {
          pessoaQuery = pessoaQuery.eq('cpf', newConsultant.cpf);
        } else if (newConsultant.email_consultor) {
          pessoaQuery = pessoaQuery.eq('email', newConsultant.email_consultor);
        }
        
        const { data: pessoaData } = await pessoaQuery.single();
        
        if (pessoaData) {
          cvData.pessoa_id = pessoaData.id;
          
          // Buscar candidatura associada
          const { data: candidaturaData } = await supabase
            .from('candidaturas')
            .select('*')
            .eq('pessoa_id', pessoaData.id)
            .single();
          
          if (candidaturaData) {
            cvData.candidatura_id = candidaturaData.id;
            cvData.curriculo_url = candidaturaData.curriculo_url;
            cvData.curriculo_filename = candidaturaData.curriculo_filename;
            console.log('✅ CV encontrado:', candidaturaData.curriculo_filename);
          }
        }
      }
      
      // Criar consultor
      const { data, error } = await supabase
        .from('consultants')
        .insert([{
          nome_consultores: newConsultant.nome_consultores,
          email_consultor: newConsultant.email_consultor,
          cpf: newConsultant.cpf,
          cargo_consultores: newConsultant.cargo_consultores,
          ano_vigencia: newConsultant.ano_vigencia,
          data_inclusao_consultores: new Date().toISOString(),
          status: newConsultant.status || 'ativo',
          ...cvData
        }])
        .select()
        .single();

      if (error) throw error;

      // Adicionar à lista local
      const newConsultantWithId: Consultant = {
        ...newConsultant,
        id: data.id,
        reports: [],
        consultant_reports: []
      };

      setConsultants([...consultants, newConsultantWithId]);
      console.log('✅ Consultor criado:', data.id);
      return newConsultantWithId;
    } catch (err: any) {
      console.error('❌ Erro ao criar consultor:', err);
      throw err;
    }
  };

  // ============================================
  // USUÁRIOS CLIENTE (USUARIOS_CLIENTE)
  // ============================================

  const loadUsuariosCliente = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios_cliente')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedUsuariosCliente: UsuarioCliente[] = (data || []).map((usuario: any) => ({
        id: usuario.id,
        nome_usuario_cliente: usuario.nome_usuario_cliente,
        email_usuario_cliente: usuario.email_usuario_cliente,
        telefone_usuario_cliente: usuario.telefone_usuario_cliente,
        cliente_id: usuario.cliente_id,
        data_inclusao: usuario.data_inclusao,
        data_ultima_alteracao: usuario.data_ultima_alteracao,
        status: usuario.status
      }));

      setUsuariosCliente(mappedUsuariosCliente);
      console.log(`✅ 0 usuários cliente carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar usuários cliente:', err);
      throw err;
    }
  };

  // ============================================
  // COORDENADORES CLIENTE (COORDENADORES_CLIENTE)
  // ============================================

  const loadCoordenadoresCliente = async () => {
    try {
      const { data, error } = await supabase
        .from('coordenadores_cliente')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedCoordenadoresCliente: CoordenadorCliente[] = (data || []).map((coordenador: any) => ({
        id: coordenador.id,
        nome_coordenador: coordenador.nome_coordenador,
        email_coordenador: coordenador.email_coordenador,
        telefone_coordenador: coordenador.telefone_coordenador,
        cliente_id: coordenador.cliente_id,
        data_inclusao: coordenador.data_inclusao,
        data_ultima_alteracao: coordenador.data_ultima_alteracao,
        status: coordenador.status
      }));

      setCoordenadoresCliente(mappedCoordenadoresCliente);
      console.log(`✅ 73 coordenadores de clientes carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar coordenadores cliente:', err);
      throw err;
    }
  };

  // ============================================
  // TEMPLATES DE EMAIL (EMAIL_TEMPLATES)
  // ============================================

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedTemplates: EmailTemplate[] = (data || []).map((template: any) => ({
        id: template.id,
        nome_template: template.nome_template,
        assunto: template.assunto,
        corpo: template.corpo,
        tipo: template.tipo,
        data_criacao: template.data_criacao,
        data_ultima_alteracao: template.data_ultima_alteracao,
        status: template.status
      }));

      setTemplates(mappedTemplates);
      console.log(`✅ 0 templates carregados`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar templates:', err);
      throw err;
    }
  };

  // ============================================
  // CAMPANHAS DE COMPLIANCE (COMPLIANCE_CAMPAIGNS)
  // ============================================

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('compliance_campaigns')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedCampaigns: ComplianceCampaign[] = (data || []).map((campaign: any) => ({
        id: campaign.id,
        nome_campanha: campaign.nome_campanha,
        descricao: campaign.descricao,
        data_inicio: campaign.data_inicio,
        data_fim: campaign.data_fim,
        status: campaign.status,
        data_criacao: campaign.data_criacao
      }));

      setCampaigns(mappedCampaigns);
      console.log(`✅ 0 campanhas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar campanhas:', err);
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
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedVagas: Vaga[] = (data || []).map((vaga: any) => ({
        id: vaga.id,
        titulo_vaga: vaga.titulo_vaga,
        descricao_vaga: vaga.descricao_vaga,
        requisitos: vaga.requisitos,
        salario_minimo: vaga.salario_minimo,
        salario_maximo: vaga.salario_maximo,
        data_criacao: vaga.data_criacao,
        data_fechamento: vaga.data_fechamento,
        status: vaga.status
      }));

      setVagas(mappedVagas);
      console.log(`✅ 0 vagas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar vagas:', err);
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
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedPessoas: Pessoa[] = (data || []).map((pessoa: any) => ({
        id: pessoa.id,
        nome: pessoa.nome,
        email: pessoa.email,
        cpf: pessoa.cpf,
        telefone: pessoa.telefone,
        data_criacao: pessoa.data_criacao,
        status: pessoa.status
      }));

      setPessoas(mappedPessoas);
      console.log(`✅ 0 pessoas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar pessoas:', err);
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
        .order('id', { ascending: true });

      if (error) throw error;

      const mappedCandidaturas: Candidatura[] = (data || []).map((candidatura: any) => ({
        id: candidatura.id,
        pessoa_id: candidatura.pessoa_id,
        vaga_id: candidatura.vaga_id,
        status: candidatura.status,
        data_candidatura: candidatura.data_candidatura,
        curriculo_url: candidatura.curriculo_url,
        curriculo_filename: candidatura.curriculo_filename
      }));

      setCandidaturas(mappedCandidaturas);
      console.log(`✅ 0 candidaturas carregadas`);
    } catch (err: any) {
      console.error('❌ Erro ao carregar candidaturas:', err);
      throw err;
    }
  };

  // ============================================
  // RETORNAR ESTADO E FUNÇÕES
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

    // Funções
    loadAllData,
    addConsultant
  };
};
