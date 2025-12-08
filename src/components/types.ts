
export type RiskScore = 1 | 2 | 3 | 4 | 5;

export type UserRole = 'Administrador' | 'Gestão Comercial' | 'Gestão de Pessoas' | 'Analista de R&S' | 'Consulta' | 'Cliente';

export type View = 
  // RMS Views
  | 'dashboard' | 'quarantine' | 'recommendations' | 'users' | 'clients' 
  | 'consultants' | 'analytics' | 'import' | 'export' | 'templates' | 'campaigns' 
  | 'compliance_dashboard' | 'feedback_portal'
  // ATIVIDADES Views
  | 'atividades_inserir' | 'atividades_consultar' | 'atividades_exportar'
  // RAISA Views (NOVOS)
  | 'vagas' | 'candidaturas' | 'analise_risco' | 'pipeline' | 'talentos' | 'controle_envios' | 'entrevista_tecnica'
  // RAISA Dashboard Views
  | 'dashboard_funil' | 'dashboard_aprovacao' | 'dashboard_analistas' | 'dashboard_geral' | 'dashboard_clientes' | 'dashboard_tempo';

export type ConsultantStatus = 'Ativo' | 'Perdido' | 'Encerrado';

export type TerminationReason = 
  | 'Baixa Performance Técnica'
  | 'Problemas Comportamentais'
  | 'Excesso de Faltas e Atrasos'
  | 'Baixa Produtividade'
  | 'Não Cumprimento de Atividades'
  | 'Performance Técnica e Comportamental'
  | 'Abandono de Função'
  | 'Internalizado pelo Cliente'
  | 'Oportunidade Financeira'
  | 'Oportunidade de Carreira'
  | 'Outros';

export interface User {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  senha_usuario: string; 
  ativo_usuario: boolean;
  receber_alertas_email: boolean;
  tipo_usuario: UserRole;
  clientId?: number; 
  gestor_rs_id: number | null;
}

export interface UsuarioCliente {
  id: number;
  id_cliente: number;
  nome_gestor_cliente: string;
  cargo_gestor: string;
  ativo: boolean;
  gestor_rs_id: number | null;
}

export interface CoordenadorCliente {
  id: number;
  id_gestor_cliente: number;
  nome_coordenador_cliente: string;
  cargo_coordenador_cliente: string;
  ativo: boolean;
}

export interface Recommendation {
    tipo: 'AcaoImediata' | 'QuestaoSondagem' | 'RecomendacaoEstrategica';
    foco: 'Consultor' | 'Cliente' | 'ProcessoInterno';
    descricao: string;
}

export interface ConsultantReport {
    id: string;
    month: number;
    year: number;
    riskScore: RiskScore;
    summary: string;
    negativePattern?: string;
    predictiveAlert?: string;
    recommendations: Recommendation[];
    content: string;
    createdAt: string;
    
    // Fields for Auto-Generated Reports
    generatedBy?: 'manual' | 'ia_automatica';
    alertType?: 'queda_performance' | 'risco_sistemico' | 'falta_contato';
    aiJustification?: string;
}

export interface Consultant {
  id: number;
  ano_vigencia: number; 
  nome_consultores: string;
  email_consultor?: string; 
  cargo_consultores: string;
  data_inclusao_consultores: string;
  data_ultima_alteracao?: string; 
  data_saida?: string;
  status: ConsultantStatus; 
  motivo_desligamento?: TerminationReason;
  valor_faturamento?: number;
  gestor_imediato_id: number; 
  coordenador_id: number | null; 
  
  parecer_1_consultor: RiskScore | null;
  parecer_2_consultor: RiskScore | null;
  parecer_3_consultor: RiskScore | null;
  parecer_4_consultor: RiskScore | null;
  parecer_5_consultor: RiskScore | null;
  parecer_6_consultor: RiskScore | null;
  parecer_7_consultor: RiskScore | null;
  parecer_8_consultor: RiskScore | null;
  parecer_9_consultor: RiskScore | null;
  parecer_10_consultor: RiskScore | null;
  parecer_11_consultor: RiskScore | null;
  parecer_12_consultor: RiskScore | null;
  
  parecer_final_consultor: RiskScore | null;
  reports: ConsultantReport[]; 

  gestor_rs_id: number | null;
  id_gestao_de_pessoas: number | null;
  
  // Campos de vínculo com candidatos e CV
  pessoa_id?: number | null;
  candidatura_id?: number | null;
  curriculo_url?: string | null;
  curriculo_filename?: string | null;
  curriculo_uploaded_at?: string | null;
}

export interface Client {
  id: number;
  razao_social_cliente: string;
  ativo_cliente: boolean;
  id_gestao_comercial: number; 
  id_gestao_de_pessoas: number; 
  id_gestor_rs: number; 
}

export interface AIAnalysisResult {
    consultantName: string;
    managerName?: string;
    reportMonth: number;
    riskScore: RiskScore;
    summary: string;
    negativePattern: string;
    predictiveAlert: string;
    recommendations: Recommendation[];
    details: string;
}

// --- COMPLIANCE MODULE TYPES ---

export type TemplateStatus = 'rascunho' | 'em_revisao' | 'aprovado' | 'rejeitado';

export interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    body: string;
    status: TemplateStatus;
    context?: string;
    lastUpdated: string;
}

export interface ComplianceCampaign {
    id: string;
    name: string;
    targetFilter: 'all_active' | 'quarantine' | 'risk_only';
    templateSequenceIds: string[];
    intervalDays: number;
    startDate: string;
    status: 'active' | 'paused' | 'completed';
}

export interface FeedbackRequest {
    id: string;
    consultantId: number;
    campaignId?: string;
    token: string;
    status: 'pending' | 'answered';
    createdAt: string;
}

export interface FeedbackResponse {
    id: string;
    requestId: string;
    consultantId: number;
    score: number; // 0-10
    comment: string;
    answeredAt: string;
    
    // AI Analysis Data
    sentiment?: 'Positivo' | 'Neutro' | 'Negativo';
    riskLevel?: 'Baixo' | 'Médio' | 'Alto';
    keyPoints?: string[];
    suggestedAction?: string;
}

export interface RHAction {
    id: string;
    consultantId: number;
    description: string;
    status: 'pendente' | 'concluido';
    priority: 'alta' | 'media' | 'baixa';
    origin: 'ai_feedback' | 'ai_quarantine' | 'manual';
    createdAt: string;
}

// --- CONTINUOUS LEARNING & BEHAVIORAL MEMORY TYPES ---

export type FlagType = 'ATTENDANCE' | 'COMMUNICATION' | 'QUALITY' | 'ENGAGEMENT' | 'OTHER';

export interface BehavioralFlag {
    id: string;
    reportId?: string;
    consultantId: number;
    flagType: FlagType;
    description: string;
    flagDate: string;
}

export interface LearningFeedbackLoop {
    id: string;
    personId: number; 
    terminationReason: string;
    candidacyRisks: any;
    behavioralHistory: BehavioralFlag[]; 
    createdAt: string;
}

// --- RAISA (RECRUITMENT) MODULE TYPES ---

export interface Vaga {
    id: string;
    titulo: string;
    descricao: string;
    senioridade: 'Junior' | 'Pleno' | 'Senior' | 'Especialista';
    stack_tecnologica: string[];
    salario_min?: number;
    salario_max?: number;
    status: 'aberta' | 'pausada' | 'fechada';
    createdAt: string;
    requisitos_obrigatorios?: string[];
    requisitos_desejaveis?: string[];
    regime_contratacao?: string;
    modalidade?: string;
    beneficios?: string[];
}

export interface Pessoa {
    id: string;
    nome: string;
    email: string;
    telefone?: string;
    linkedin_url?: string;
    curriculo_url?: string; // or base64
    observacoes?: string;
    createdAt: string;
}

export interface Candidatura {
    id: string;
    vaga_id: string;
    pessoa_id: string;
    candidato_nome?: string; // Helper for mock
    candidato_email?: string; // Helper for mock
    status: 'triagem' | 'entrevista' | 'teste_tecnico' | 'aprovado' | 'reprovado' | 'enviado_cliente' | 'aguardando_cliente' | 'aprovado_cliente' | 'reprovado_cliente' | 'aprovado_interno' | 'reprovado_interno';
    curriculo_texto?: string; // Text extracted for AI
    observacoes?: string;
    createdAt: string;
    atualizado_em?: string;
}

export interface RiskFactor {
    risk_type: string;
    risk_level: 'low' | 'medium' | 'high';
    detected_pattern: string;
    evidence: string;
    ai_confidence: number;
}

// --- RAISA: CONTROLE DE ENVIOS ---

export interface CandidaturaEnvio {
    id: number;
    candidatura_id: string;
    vaga_id: string;
    analista_id: number;
    cliente_id: number;
    enviado_em: string;
    enviado_por: number;
    meio_envio: 'email' | 'portal_cliente' | 'whatsapp' | 'outro';
    destinatario_email: string;
    destinatario_nome: string;
    cv_anexado_url?: string;
    cv_versao: 'original' | 'padronizado';
    observacoes?: string;
    status: 'enviado' | 'visualizado' | 'em_analise';
    visualizado_em?: string;
    ativo: boolean;
}

export interface CandidaturaAprovacao {
    id: number;
    candidatura_id: string;
    candidatura_envio_id: number;
    vaga_id: string;
    cliente_id: number;
    analista_id: number;
    decisao: 'aprovado' | 'reprovado' | 'em_analise' | 'aguardando_resposta';
    decidido_em?: string;
    decidido_por?: string;
    motivo_reprovacao?: string;
    categoria_reprovacao?: 'tecnico' | 'comportamental' | 'salario' | 'disponibilidade' | 'outro';
    feedback_cliente?: string;
    prazo_resposta_dias: number;
    respondido_no_prazo?: boolean;
    dias_para_resposta?: number;
    registrado_em: string;
    ativo: boolean;
}

export interface VagaAnaliseIA {
    id: number;
    vaga_id: number;
    descricao_original: string;
    fonte: string;
    sugestoes: any;
    confidence_score: number;
    confidence_detalhado: any;
    requer_revisao_manual: boolean;
    aprovado: boolean;
}

// --- RAISA: ENTREVISTA TÉCNICA & AVALIAÇÃO ---

export interface PerguntaTecnica {
    id: string;
    vaga_id: string;
    pergunta_texto: string;
    categoria: 'tecnica' | 'comportamental' | 'experiencia';
    tecnologia_relacionada?: string;
    nivel_dificuldade: 'junior' | 'pleno' | 'senior';
    resposta_esperada: string;
    pontos_chave: { ponto: string; importancia: 'alta' | 'media' | 'baixa' }[];
    ordem: number;
}

export interface RespostaCandidato {
    id: string;
    pergunta_id: string;
    resposta_texto: string;
    impressao_analista?: 'excelente' | 'boa' | 'regular' | 'fraca';
    observacoes_analista?: string;
}

export interface ItemQualificacao {
    tecnologia: string;
    tempo_experiencia_meses: number;
    nivel: 'junior' | 'pleno' | 'senior';
}

export interface MatrizQualificacao {
    candidatura_id: string;
    qualificacoes: ItemQualificacao[];
}

export interface AvaliacaoIA {
    candidatura_id: string;
    score_geral: number;
    recomendacao: 'aprovado' | 'reprovado' | 'condicional';
    pontos_fortes: { aspecto: string; justificativa: string }[];
    gaps_identificados: { gap: string; severidade: string; impacto: string }[];
    requisitos_atendidos: { requisito: string; atendido: boolean; justificativa: string }[];
    justificativa: string;
    avaliado_em: string;
    decisao_final?: 'aprovado' | 'reprovado' | 'em_duvida';
}

// --- RAISA ADVANCED: PRIORIZAÇÃO E DISTRIBUIÇÃO INTELIGENTE DE VAGAS ---

/**
 * Perfil do Analista de R&S
 * Usado para calcular fit score na distribuição de vagas
 */
export interface Analista {
    id: number;
    nome: string;
    email: string;
    stack_experiencia: string[]; // Tecnologias que o analista tem experiência
    carga_trabalho_atual: number; // Número de vagas ativas atribuídas
    historico_aprovacao_cliente: { // Taxa de sucesso por cliente
        cliente_id: number;
        taxa_aprovacao: number; // 0-100
        vagas_fechadas: number;
    }[];
    taxa_aprovacao_geral: number; // 0-100
    tempo_medio_fechamento_dias: number; // Média de dias para fechar vagas
}

/**
 * Score de Priorização de Vaga
 * Resultado do cálculo de prioridade pela IA
 */
export interface VagaPriorizacaoScore {
    vaga_id: string;
    score_prioridade: number; // 0-100
    nivel_prioridade: 'Alta' | 'Média' | 'Baixa';
    sla_dias: number; // Prazo sugerido para fechamento
    justificativa: string; // Explicação da IA sobre o score
    fatores_considerados: {
        urgencia_prazo: number; // 0-100
        valor_faturamento: number; // 0-100
        cliente_vip: boolean;
        tempo_vaga_aberta: number; // dias
        complexidade_stack: number; // 0-100
    };
    calculado_em: string;
}

/**
 * Score de Adequação do Analista para uma Vaga
 * Resultado da recomendação de analista pela IA
 */
export interface AnalistaFitScore {
    vaga_id: string;
    analista_id: number;
    analista_nome: string;
    score_match: number; // 0-100
    nivel_adequacao: 'Excelente' | 'Bom' | 'Regular' | 'Baixo';
    justificativa_match: string; // Explicação da IA
    fatores_match: {
        fit_stack_tecnologica: number; // 0-100
        fit_cliente: number; // 0-100 (baseado em histórico)
        disponibilidade: number; // 0-100 (baseado em carga de trabalho)
        taxa_sucesso_historica: number; // 0-100
    };
    tempo_estimado_fechamento_dias: number;
    recomendacao: 'Altamente Recomendado' | 'Recomendado' | 'Adequado' | 'Não Recomendado';
    calculado_em: string;
}

/**
 * Dados de entrada para cálculo de prioridade de vaga
 */
export interface DadosVagaPrioridade {
    vaga_id: string;
    titulo_vaga: string;
    cliente_id: number;
    cliente_nome: string;
    cliente_vip: boolean;
    prazo_fechamento?: string; // Data limite
    faturamento_estimado?: number;
    stack_tecnologica: string[];
    senioridade: string;
    dias_vaga_aberta: number;
    media_dias_vagas_similares?: number; // Histórico
}

/**
 * Dados de entrada para recomendação de analista
 */
export interface DadosRecomendacaoAnalista {
    vaga: DadosVagaPrioridade;
    analistas_disponiveis: Analista[];
    prioridade_vaga: VagaPriorizacaoScore;
}
