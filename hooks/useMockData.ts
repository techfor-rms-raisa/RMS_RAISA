
import { useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport, AIAnalysisResult, EmailTemplate, ComplianceCampaign, FeedbackRequest, FeedbackResponse, RHAction, BehavioralFlag, LearningFeedbackLoop, Vaga, Pessoa, Candidatura, CandidaturaEnvio, CandidaturaAprovacao, PerguntaTecnica, RespostaCandidato, MatrizQualificacao, AvaliacaoIA } from '../src/components/types';
import { sendRiskAlertEmail } from '../services/emailService';
import { extractBehavioralFlags, generatePredictiveAlert, analyzeReport } from '../services/geminiService';
import { perguntasTecnicasService } from '../services/perguntasTecnicasService';

// --- INITIALIZATION ---
const INITIAL_USERS: User[] = [
  { 
      id: 1, 
      nome_usuario: 'Administrador', 
      email_usuario: 'admin@admin', 
      senha_usuario: 'admin', 
      ativo_usuario: true, 
      receber_alertas_email: true, 
      tipo_usuario: 'Administrador', 
      gestor_rs_id: null 
  }
];

// --- RAISA INITIAL MOCK DATA ---
const INITIAL_VAGAS: Vaga[] = [
    { id: 'v1', titulo: 'Desenvolvedor React Senior', descricao: 'Atuar em projetos internacionais...', senioridade: 'Senior', stack_tecnologica: ['React', 'TypeScript', 'Node.js'], status: 'aberta', createdAt: new Date().toISOString(), requisitos_obrigatorios: ['React 3+ anos', 'Inglês Fluente'], requisitos_desejaveis: ['AWS', 'Docker'] },
    { id: 'v2', titulo: 'Analista de Dados Pleno', descricao: 'Análise de grandes volumes de dados...', senioridade: 'Pleno', stack_tecnologica: ['Python', 'SQL', 'PowerBI'], status: 'aberta', createdAt: new Date().toISOString() }
];

const INITIAL_PESSOAS: Pessoa[] = [
    { id: 'p1', nome: 'João Silva', email: 'joao@email.com', telefone: '1199999999', linkedin_url: 'linkedin.com/in/joao', createdAt: new Date().toISOString() },
    { id: 'p2', nome: 'Maria Souza', email: 'maria@email.com', telefone: '1188888888', createdAt: new Date().toISOString() }
];

const INITIAL_CANDIDATURAS: Candidatura[] = [
    { id: 'c1', vaga_id: 'v1', pessoa_id: 'p1', candidato_nome: 'João Silva', candidato_email: 'joao@email.com', status: 'entrevista', createdAt: new Date().toISOString() },
    { id: 'c2', vaga_id: 'v2', pessoa_id: 'p2', candidato_nome: 'Maria Souza', candidato_email: 'maria@email.com', status: 'triagem', createdAt: new Date().toISOString() }
];

const INITIAL_ENVIOS: CandidaturaEnvio[] = [
    {
        id: 101,
        candidatura_id: 'c1',
        vaga_id: 'v1',
        analista_id: 1,
        cliente_id: 1,
        enviado_em: new Date(Date.now() - 86400000).toISOString(), 
        enviado_por: 1,
        meio_envio: 'email',
        destinatario_email: 'cliente@empresa.com',
        destinatario_nome: 'Roberto Gestor',
        cv_versao: 'padronizado',
        status: 'enviado',
        ativo: true
    }
];

export const useMockData = () => {
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [clients, setClients] = useState<Client[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [usuariosCliente, setUsuariosCliente] = useState<UsuarioCliente[]>([]);
  const [coordenadoresCliente, setCoordenadoresCliente] = useState<CoordenadorCliente[]>([]);

  // Compliance State
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<ComplianceCampaign[]>([]);
  const [feedbackRequests, setFeedbackRequests] = useState<FeedbackRequest[]>([]);
  const [feedbackResponses, setFeedbackResponses] = useState<FeedbackResponse[]>([]);
  const [rhActions, setRhActions] = useState<RHAction[]>([]);

  // Continuous Learning State
  const [behavioralFlags, setBehavioralFlags] = useState<BehavioralFlag[]>([]);
  const [learningLoop, setLearningLoop] = useState<LearningFeedbackLoop[]>([]);

  // RAISA State
  const [vagas, setVagas] = useState<Vaga[]>(INITIAL_VAGAS);
  const [pessoas, setPessoas] = useState<Pessoa[]>(INITIAL_PESSOAS);
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>(INITIAL_CANDIDATURAS);
  const [envios, setEnvios] = useState<CandidaturaEnvio[]>(INITIAL_ENVIOS);
  const [aprovacoes, setAprovacoes] = useState<CandidaturaAprovacao[]>([]);
  
  // Interview & Assessment State
  const [perguntasTecnicas, setPerguntasTecnicas] = useState<PerguntaTecnica[]>([]);
  const [respostasCandidatos, setRespostasCandidatos] = useState<RespostaCandidato[]>([]);
  const [matrizesQualificacao, setMatrizesQualificacao] = useState<MatrizQualificacao[]>([]);
  const [avaliacoesIA, setAvaliacoesIA] = useState<AvaliacaoIA[]>([]);

  // --- SIMULATED "DAILY CRON JOB" ---
  useEffect(() => {
      const runAutoQuarantine = () => {
          const now = new Date();
          const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).getTime();
          setConsultants(prev => prev.map(c => {
             if (c.status !== 'Ativo') return c;
             const lastReport = c.reports.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
             const lastDate = lastReport ? new Date(lastReport.createdAt).getTime() : new Date(c.data_inclusao_consultores).getTime();
             if (lastDate < thirtyDaysAgo) return c; 
             return c;
          }));
      };
      runAutoQuarantine();
  }, []);

  // --- CRUD OPERATIONS ---
  const addUser = (user: Omit<User, 'id'>) => setUsers(prev => [...prev, { ...user, id: Date.now() }]);
  const updateUser = (updatedUser: User) => setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  const addClient = (client: Omit<Client, 'id'>) => setClients(prev => [...prev, { ...client, id: Date.now() }]);
  const updateClient = (updatedClient: Client) => setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
  
  const batchAddClients = (newClients: Omit<Client, 'id'>[]) => {
      const timestamp = Date.now();
      const clientsWithIds = newClients.map((c, index) => ({ ...c, id: timestamp + index }));
      setClients(prev => [...prev, ...clientsWithIds]);
  };

  const addConsultant = (consultant: any) => {
    const newConsultant: Consultant = { ...consultant, id: Date.now(), reports: [], parecer_final_consultor: null, valor_faturamento: consultant.valor_faturamento || null };
    setConsultants(prev => [...prev, newConsultant]);
  };

  const batchAddConsultants = (newConsultants: any[]) => {
      const timestamp = Date.now();
      const consultantsWithIds = newConsultants.map((c, index) => ({ ...c, id: timestamp + index, reports: [], parecer_final_consultor: null }));
      setConsultants(prev => [...prev, ...consultantsWithIds]);
  };

  const updateConsultant = (updatedConsultant: Consultant) => setConsultants(prev => prev.map(c => c.id === updatedConsultant.id ? updatedConsultant : c));
  const addUsuarioCliente = (uc: Omit<UsuarioCliente, 'id'>) => setUsuariosCliente(prev => [...prev, { ...uc, id: Date.now() }]);
  const updateUsuarioCliente = (updatedUC: UsuarioCliente) => setUsuariosCliente(prev => prev.map(uc => uc.id === updatedUC.id ? updatedUC : uc));
  const batchAddManagers = (newManagers: Omit<UsuarioCliente, 'id'>[]) => setUsuariosCliente(prev => [...prev, ...newManagers.map((m, i) => ({ ...m, id: Date.now() + i }))]);
  const addCoordenadorCliente = (cc: Omit<CoordenadorCliente, 'id'>) => setCoordenadoresCliente(prev => [...prev, { ...cc, id: Date.now() }]);
  const updateCoordenadorCliente = (updatedCC: CoordenadorCliente) => setCoordenadoresCliente(prev => prev.map(cc => cc.id === updatedCC.id ? updatedCC : cc));
  const batchAddCoordinators = (newCoordinators: Omit<CoordenadorCliente, 'id'>[]) => setCoordenadoresCliente(prev => [...prev, ...newCoordinators.map((c, i) => ({ ...c, id: Date.now() + i }))]);

  // --- RAISA OPERATIONS ---
  const addVaga = (v: Omit<Vaga, 'id' | 'createdAt'>) => setVagas(prev => [...prev, { ...v, id: `v-${Date.now()}`, createdAt: new Date().toISOString() }]);
  const updateVaga = (v: Vaga) => setVagas(prev => prev.map(old => old.id === v.id ? v : old));
  const deleteVaga = (id: string) => setVagas(prev => prev.filter(v => v.id !== id));
  const addPessoa = (p: Omit<Pessoa, 'id' | 'createdAt'>) => setPessoas(prev => [...prev, { ...p, id: `p-${Date.now()}`, createdAt: new Date().toISOString() }]);
  const updatePessoa = (p: Pessoa) => setPessoas(prev => prev.map(old => old.id === p.id ? p : old));
  const addCandidatura = (c: Omit<Candidatura, 'id' | 'createdAt'>) => setCandidaturas(prev => [...prev, { ...c, id: `c-${Date.now()}`, createdAt: new Date().toISOString() }]);
  const updateCandidaturaStatus = (id: string, status: Candidatura['status']) => setCandidaturas(prev => prev.map(c => c.id === id ? { ...c, status } : c));

  const registrarEnvio = (data: Omit<CandidaturaEnvio, 'id' | 'enviado_em' | 'status' | 'ativo'>) => {
    const novoEnvio: CandidaturaEnvio = { ...data, id: Date.now(), enviado_em: new Date().toISOString(), status: 'enviado', ativo: true };
    setEnvios(prev => [novoEnvio, ...prev]);
    updateCandidaturaStatus(data.candidatura_id, 'enviado_cliente');
    return novoEnvio;
  };

  const registrarAprovacao = (data: Omit<CandidaturaAprovacao, 'id' | 'registrado_em' | 'ativo' | 'dias_para_resposta' | 'respondido_no_prazo'>) => {
    const novaAprovacao: CandidaturaAprovacao = { ...data, id: Date.now(), registrado_em: new Date().toISOString(), ativo: true, dias_para_resposta: 0, respondido_no_prazo: true };
    setAprovacoes(prev => [novaAprovacao, ...prev]);
    let novoStatus: Candidatura['status'] = 'aguardando_cliente';
    if (data.decisao === 'aprovado') novoStatus = 'aprovado_cliente';
    if (data.decisao === 'reprovado') novoStatus = 'reprovado_cliente';
    updateCandidaturaStatus(data.candidatura_id, novoStatus);
    return novaAprovacao;
  };

  // --- RAISA: INTERVIEW OPERATIONS ---
  const getQuestionsForVaga = (vagaId: string) => perguntasTecnicas.filter(p => p.vaga_id === vagaId);
  
  const generateAndSaveQuestions = async (vaga: Vaga) => {
      const questions = await perguntasTecnicasService.gerarPerguntas(vaga);
      const savedQuestions = questions.map((q, i) => ({ ...q, id: `q-${Date.now()}-${i}` }));
      setPerguntasTecnicas(prev => [...prev, ...savedQuestions]);
      return savedQuestions;
  };

  const saveCandidateAnswers = (newAnswers: RespostaCandidato[]) => {
      setRespostasCandidatos(prev => [...prev, ...newAnswers]);
  };

  const saveQualificationMatrix = (candidaturaId: string, items: any[]) => {
      const newMatrix: MatrizQualificacao = { candidature_id: candidaturaId, qualificacoes: items } as any;
      setMatrizesQualificacao(prev => {
          const filtered = prev.filter(m => m.candidatura_id !== candidaturaId);
          return [...filtered, newMatrix];
      });
  };

  const runAIAssessment = async (candidaturaId: string) => {
      const candidatura = candidaturas.find(c => c.id === candidaturaId);
      const vaga = vagas.find(v => v.id === candidatura?.vaga_id);
      const matriz = matrizesQualificacao.find(m => m.candidatura_id === candidaturaId);
      const answers = respostasCandidatos.filter(r => {
          const question = perguntasTecnicas.find(q => q.id === r.pergunta_id);
          return question && question.vaga_id === vaga?.id; // Simplified link for mock
      }).map(r => {
          const q = perguntasTecnicas.find(q => q.id === r.pergunta_id);
          return { ...r, pergunta_texto: q?.pergunta_texto || '', resposta_esperada: q?.resposta_esperada || '' };
      });

      if (vaga && candidatura && matriz) {
          const result = await perguntasTecnicasService.avaliarCandidato(vaga, candidatura.candidato_nome || 'Candidato', matriz, answers);
          const avaliacao: AvaliacaoIA = {
              ...result,
              candidatura_id: candidaturaId,
              avaliado_em: new Date().toISOString()
          };
          setAvaliacoesIA(prev => [...prev.filter(a => a.candidatura_id !== candidaturaId), avaliacao]);
          return avaliacao;
      }
      throw new Error("Dados incompletos para avaliação");
  };

  const saveFinalDecision = (candidaturaId: string, decisao: 'aprovado' | 'reprovado', justificativa: string) => {
      setAvaliacoesIA(prev => prev.map(a => a.candidatura_id === candidaturaId ? { ...a, decisao_final: decisao } : a));
      updateCandidaturaStatus(candidaturaId, decisao === 'aprovado' ? 'aprovado_interno' : 'reprovado_interno');
  };

  // --- ORCHESTRATOR & HELPERS ---
  const processReportAnalysis = async (reportText: string) => { const results = await analyzeReport(reportText); return results; };
  const updateConsultantScore = (result: AIAnalysisResult) => {};
  const migrateYearlyData = () => {};
  const addTemplate = (t: EmailTemplate) => setTemplates(prev => [...prev, t]);
  const updateTemplate = (t: EmailTemplate) => setTemplates(prev => prev.map(old => old.id === t.id ? t : old));
  const deleteTemplate = (id: string) => setTemplates(prev => prev.filter(t => t.id !== id));
  const addCampaign = (c: ComplianceCampaign) => setCampaigns(prev => [...prev, c]);
  const updateCampaign = (c: ComplianceCampaign) => setCampaigns(prev => prev.map(old => old.id === c.id ? c : old));
  const addFeedbackResponse = (r: FeedbackResponse) => setFeedbackResponses(prev => [...prev, r]);
  const addRHAction = (a: RHAction) => setRhActions(prev => [...prev, a]);
  const updateRHAction = (a: RHAction) => setRhActions(prev => prev.map(old => old.id === a.id ? a : old));

  return {
    users, clients, consultants, usuariosCliente, coordenadoresCliente,
    templates, campaigns, feedbackResponses, rhActions,
    behavioralFlags, learningLoop,
    vagas, pessoas, candidaturas, envios, aprovacoes, 
    perguntasTecnicas, respostasCandidatos, matrizesQualificacao, avaliacoesIA, // Interview exports
    addUser, updateUser, addClient, updateClient, batchAddClients, addConsultant, updateConsultant, batchAddConsultants, addUsuarioCliente, updateUsuarioCliente, batchAddManagers, addCoordenadorCliente, updateCoordenadorCliente, batchAddCoordinators, updateConsultantScore, processReportAnalysis, migrateYearlyData, addTemplate, updateTemplate, deleteTemplate, addCampaign, updateCampaign, addFeedbackResponse, addRHAction, updateRHAction,
    addVaga, updateVaga, deleteVaga, addPessoa, updatePessoa, addCandidatura, updateCandidaturaStatus, registrarEnvio, registrarAprovacao,
    getQuestionsForVaga, generateAndSaveQuestions, saveCandidateAnswers, saveQualificationMatrix, runAIAssessment, saveFinalDecision
  };
};
