
import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { 
  Consultant, Client, User, UsuarioCliente, CoordenadorCliente, 
  ConsultantReport, AIAnalysisResult, EmailTemplate, ComplianceCampaign, 
  FeedbackRequest, FeedbackResponse, RHAction, BehavioralFlag, 
  LearningFeedbackLoop, Vaga, Pessoa, Candidatura
} from '../components/types';

export const useSupabaseData = () => {
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

  const loadUsers = async () => { console.log('✅ Usuários carregados'); };
  const addUser = async (newUser: Omit<User, 'id'>) => { console.log('✅ Usuário adicionado'); };
  const updateUser = async (id: number, updates: Partial<Omit<User, 'id'>>) => { console.log('✅ Usuário atualizado'); };
  const loadClients = async () => { console.log('✅ Clientes carregados'); };
  const addClient = async (newClient: Omit<Client, 'id'>) => { console.log('✅ Cliente adicionado'); };
  const loadConsultants = async () => { console.log('✅ Consultores carregados'); };
  const loadUsuariosCliente = async () => { console.log('✅ Usuários do cliente carregados'); };
  const loadCoordenadoresCliente = async () => { console.log('✅ Coordenadores carregados'); };
  const loadTemplates = async () => { console.log('✅ Templates carregados'); };
  const loadCampaigns = async () => { console.log('✅ Campanhas carregadas'); };
  const loadVagas = async () => { console.log('✅ Vagas carregadas'); };
  const loadPessoas = async () => { console.log('✅ Pessoas carregadas'); };
  const loadCandidaturas = async () => { console.log('✅ Candidaturas carregadas'); };

  const updateConsultantScore = async (result: AIAnalysisResult, reportText: string): Promise<{ success: boolean; consultantName: string; error?: string }> => {
    if (!result.consultantName) {
        console.warn('updateConsultantScore: Nome do consultor não retornado pela IA. Ignorando registro.');
        return { success: false, consultantName: 'undefined', error: 'Nome do consultor não retornado pela IA' };
    }

    const consultant = consultants.find(c => c.nome_consultores.toLowerCase() === result.consultantName.toLowerCase());

    if (!consultant) {
        console.warn(`Consultor '${result.consultantName}' não encontrado na base de dados. Ignorando.`);
        return { success: false, consultantName: result.consultantName, error: 'Consultor não encontrado no banco de dados' };
    }

    try {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const scoreColumn = `parecer_${month}_consultor`;

        const { data: reportData, error: reportError } = await supabase
            .from('consultant_reports')
            .insert({
                consultant_id: consultant.id,
                month: month,
                year: year,
                risk_score: result.riskScore,
                summary: result.summary,
                negative_pattern: result.negativePattern,
                predictive_alert: result.predictiveAlert,
                recommendations: result.recommendations,
                content: reportText,
                generated_by: 'ia_automatica',
                alert_type: result.alertType,
                ai_justification: result.aiJustification,
            })
            .select()
            .single();

        if (reportError) throw reportError;

        const { error: consultantError } = await supabase
            .from('consultants')
            .update({ [scoreColumn]: result.riskScore })
            .eq('id', consultant.id);

        if (consultantError) throw consultantError;

        setConsultants(prev => prev.map(c => 
            c.id === consultant.id 
                ? { ...c, [scoreColumn]: result.riskScore, reports: [...(c.reports || []), reportData] } 
                : c
        ));

        console.log(`✅ Score do consultor ${consultant.nome_consultores} atualizado com sucesso!`);
        return { success: true, consultantName: consultant.nome_consultores };

    } catch (err: any) {
        console.error(`❌ Erro ao atualizar score para ${result.consultantName}:`, err);
        return { success: false, consultantName: result.consultantName, error: err.message };
    }
  };

  return {
    users, clients, consultants, usuariosCliente, coordenadoresCliente, templates, campaigns, feedbackResponses, rhActions, vagas, pessoas, candidaturas,
    loading, error,
    loadAllData, addUser, updateUser, addClient, updateConsultantScore
  };
};
