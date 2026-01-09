// ============================================
// TIPOS BASE DO SISTEMA
// ============================================

export type RiskScore = 1 | 2 | 3 | 4 | 5;

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

export type View = 
  // RMS Views
  | 'dashboard' | 'quarantine' | 'recommendations' | 'users' | 'clients' 
  | 'consultants' | 'analytics' | 'import' | 'export' | 'templates' | 'campaigns' 
  | 'compliance_dashboard' | 'feedback_portal'
  // ATIVIDADES Views
  | 'atividades_inserir' | 'atividades_consultar' | 'atividades_exportar'
  // RAISA Views
  | 'vagas' | 'candidaturas' | 'analise_risco' | 'pipeline' | 'talentos' 
  | 'controle_envios' | 'entrevista_tecnica'
  // RAISA Importação e Distribuição
  | 'linkedin_import' | 'distribuicao_ia' | 'configuracao_priorizacao'
  // RAISA Dashboard Views
  | 'dashboard_funil' | 'dashboard_aprovacao' | 'dashboard_analistas' 
  | 'dashboard_geral' | 'dashboard_clientes' | 'dashboard_tempo'
  | 'dashboard_ml' | 'dashboard_performance_ia' | 'dashboard_raisa_metrics'
  // Movimentações e Posição
  | 'movimentacoes' | 'posicao_comercial' | 'profiles';

// ============================================
// VAGAS (RAISA)
// ============================================

// Tipo para status comercial da vaga
export type VagaStatus = 'aberta' | 'pausada' | 'fechada' | 'em_andamento' | 'aprovada' | 'perdida' | 'cancelada';

// 🆕 Tipo para posição no funil de recrutamento
export type VagaStatusPosicao = 
  | 'triagem'
  | 'entrevista'
  | 'enviado_cliente'
  | 'aguardando_cliente'
  | 'entrevista_cliente'
  | 'aprovado_cliente'
  | 'contratado'
  | 'reprovado';

export interface Vaga {
  id: string;
  titulo: string;
  descricao: string;
  senioridade: 'Junior' | 'Pleno' | 'Senior' | 'Especialista';
  stack_tecnologica: string[];
  salario_min?: number;
  salario_max?: number;
  status: VagaStatus;
  status_posicao?: VagaStatusPosicao; // 🆕 Posição no funil
  createdAt?: string;
  requisitos_obrigatorios?: string[];
  requisitos_desejaveis?: string[];
  regime_contratacao?: string;
  modalidade?: string;
  beneficios?: string[];
  // Campos Supabase
  analista_id?: number | null;
  cliente_id?: number | null;
  cliente_nome?: string; // 🆕 Nome do cliente (join)
  urgente?: boolean;
  prazo_fechamento?: string;
  faturamento_mensal?: number;
  criado_em?: string;
  atualizado_em?: string;
}

// ============================================
// PESSOAS/CANDIDATOS (RAISA)
// ============================================

export interface Pessoa {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  linkedin_url?: string;
  curriculo_url?: string;
  observacoes?: string;
  createdAt?: string;
  cpf?: string;
  created_at?: string;
  // 🆕 Campos de anonimização para envio a clientes
  nome_anoni_total?: string;    // Ex: J.S.X. (primeira letra de cada nome)
  nome_anoni_parcial?: string;  // Ex: José S.X. (primeiro nome + iniciais)
  // Campos extras do Banco de Talentos
  titulo_profissional?: string;
  senioridade?: string;
  disponibilidade?: string;
  modalidade_preferida?: string;
  pretensao_salarial?: number;
  cidade?: string;
  estado?: string;
  cv_processado?: boolean;
  cv_processado_em?: string;
  resumo_profissional?: string;
  cv_texto_original?: string;
  cv_arquivo_url?: string;
  // 🆕 Campo de origem (linkedin, importacao_cv, manual)
  origem?: string;
}

// ============================================
// CANDIDATURAS (RAISA)
// ============================================

export interface Candidatura {
  id: string;
  vaga_id: string;
  pessoa_id: string;
  candidato_nome?: string;
  candidato_email?: string;
  status: 'triagem' | 'entrevista' | 'teste_tecnico' | 'aprovado' | 'reprovado' 
    | 'enviado_cliente' | 'aguardando_cliente' | 'aprovado_cliente' 
    | 'reprovado_cliente' | 'aprovado_interno' | 'reprovado_interno';
  curriculo_texto?: string;
  observacoes?: string;
  createdAt?: string;
  atualizado_em?: string;
  // Campos Supabase
  candidato_cpf?: string;
  analista_id?: number | null;
  cv_url?: string;
  feedback_cliente?: string;
  data_envio_cliente?: string;
  enviado_ao_cliente?: boolean;
  criado_em?: string;
}

// ============================================
// ANÁLISE DE RISCO (RAISA)
// ============================================

export interface RiskFactor {
  risk_type: string;
  risk_level: 'low' | 'medium' | 'high';
  detected_pattern: string;
  evidence: string;
  ai_confidence: number;
}

// ============================================
// CONTROLE DE ENVIOS (RAISA)
// ============================================

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

// ============================================
// ANÁLISE DE VAGA IA (RAISA)
// ============================================

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