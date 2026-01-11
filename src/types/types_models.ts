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
  // 🆕 v56.0: Campos de Exclusividade
  id_analista_rs?: number | null;
  periodo_exclusividade?: number;         // Default 60 dias
  data_inicio_exclusividade?: string;
  data_final_exclusividade?: string;
  qtd_renovacoes?: number;                // Default 0
  max_renovacoes?: number;                // Default 2
  // Campos calculados (da view)
  analista_nome?: string;
  status_exclusividade?: 'sem_exclusividade' | 'ativa' | 'expirando_breve' | 'expirando_urgente' | 'expirada';
  dias_restantes?: number;
  pode_renovar?: boolean;
}

// 🆕 v56.0: Tipo para Configuração de Exclusividade
export interface ConfigExclusividade {
  id?: number;
  nome_config: string;
  periodo_exclusividade_default: number;  // Default 60
  periodo_renovacao: number;              // Default 30
  max_renovacoes: number;                 // Default 2
  dias_aviso_vencimento: number;          // Default 15
  dias_aviso_urgente: number;             // Default 5
  permitir_auto_renovacao: boolean;
  ativa: boolean;
  atualizado_em?: string;
  atualizado_por?: number;
}

// 🆕 v56.0: Tipo para Log de Exclusividade
export interface LogExclusividade {
  id: number;
  pessoa_id: number;
  acao: 'atribuicao' | 'renovacao' | 'liberacao' | 'vencimento' | 'transferencia';
  analista_anterior_id?: number;
  analista_novo_id?: number;
  realizado_por: number;
  motivo?: string;
  data_exclusividade_anterior?: string;
  data_exclusividade_nova?: string;
  qtd_renovacoes_anterior?: number;
  qtd_renovacoes_nova?: number;
  criado_em: string;
  // Joins
  analista_anterior_nome?: string;
  analista_novo_nome?: string;
  realizado_por_nome?: string;
}

// 🆕 v56.0: Tipo para Notificação de Exclusividade
export interface NotificacaoExclusividade {
  id: number;
  pessoa_id: number;
  analista_id: number;
  tipo: 'aviso_15_dias' | 'aviso_5_dias' | 'vencimento' | 'renovacao_disponivel';
  titulo: string;
  mensagem: string;
  lida: boolean;
  lida_em?: string;
  acao_tomada?: 'renovado' | 'liberado' | 'ignorado';
  criado_em: string;
  // Joins
  pessoa_nome?: string;
}

// 🆕 v56.0: Papéis do Sistema
export type PapelUsuario = 'Admin' | 'Supervisor de R&S' | 'Analista de R&S' | 'Gestão de Pessoas' | 'Consulta';

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