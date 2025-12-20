// ============================================
// USUÁRIOS DO SISTEMA
// ============================================

export type UserRole = 
  | 'Administrador' 
  | 'Gestão Comercial' 
  | 'Gestão de Pessoas' 
  | 'Analista de R&S' 
  | 'Consulta' 
  | 'Cliente';

export interface User {
  id: number;
  nome_usuario: string;
  nome?: string; // Alias para compatibilidade
  email_usuario: string;
  senha_usuario: string; 
  ativo_usuario: boolean;
  receber_alertas_email: boolean;
  tipo_usuario: UserRole;
  clientId?: number; 
  analista_rs_id: number | null;
  perfil_id?: number | null;
  perfil?: any | null;
}

// ============================================
// CLIENTES
// ============================================

export interface Client {
  id: number;
  razao_social_cliente: string;
  ativo_cliente: boolean;
  id_gestao_comercial: number; 
  id_gestao_de_pessoas: number; 
  id_gestor_rs: number;
  vip?: boolean;
}

// Alias para compatibilidade
export type Cliente = Client;

// ============================================
// GESTORES DE CLIENTE
// ============================================

export interface UsuarioCliente {
  id: number;
  id_cliente: number;
  nome_gestor_cliente: string;
  cargo_gestor: string;
  email_gestor?: string;
  celular?: string; // Formato: DDD-99999-9999
  ativo: boolean;
  analista_rs_id: number | null;
  cliente?: any;
  gestor_rs_id?: number | null;
  gestor_rs?: any;
}

// ============================================
// COORDENADORES DE CLIENTE
// ============================================

export interface CoordenadorCliente {
  id: number;
  id_gestor_cliente: number;
  nome_coordenador_cliente: string;
  cargo_coordenador_cliente: string;
  email_coordenador?: string;
  celular?: string; // Formato: DDD-99999-9999
  ativo: boolean;
  gestor?: any;
}

// ============================================
// CONSULTORES
// ============================================

export interface Recommendation {
  tipo: 'AcaoImediata' | 'QuestaoSondagem' | 'RecomendacaoEstrategica';
  foco: 'Consultor' | 'Cliente' | 'ProcessoInterno';
  descricao: string;
}

export interface ConsultantReport {
  id: string;
  month: number;
  year: number;
  riskScore: import('./models').RiskScore;
  summary: string;
  negativePattern?: string;
  predictiveAlert?: string;
  recommendations: Recommendation[];
  content: string;
  createdAt: string;
  created_at?: string;
  data_relatorio?: string;
  // Auto-Generated Reports
  generatedBy?: 'manual' | 'ia_automatica';
  alertType?: 'queda_performance' | 'risco_sistemico' | 'falta_contato';
  aiJustification?: string;
}

export interface Consultant {
  id: number;
  ano_vigencia: number; 
  nome_consultores: string;
  email_consultor?: string;
  celular?: string; // Formato: DDD-99999-9999
  cpf?: string;
  cargo_consultores: string;
  data_inclusao_consultores: string;
  data_ultima_alteracao?: string; 
  data_saida?: string;
  status: import('./models').ConsultantStatus; 
  motivo_desligamento?: import('./models').TerminationReason;
  valor_faturamento?: number;
  valor_pagamento?: number;
  gestor_imediato_id: number; 
  coordenador_id: number | null; 
  
  parecer_1_consultor: import('./models').RiskScore | null;
  parecer_2_consultor: import('./models').RiskScore | null;
  parecer_3_consultor: import('./models').RiskScore | null;
  parecer_4_consultor: import('./models').RiskScore | null;
  parecer_5_consultor: import('./models').RiskScore | null;
  parecer_6_consultor: import('./models').RiskScore | null;
  parecer_7_consultor: import('./models').RiskScore | null;
  parecer_8_consultor: import('./models').RiskScore | null;
  parecer_9_consultor: import('./models').RiskScore | null;
  parecer_10_consultor: import('./models').RiskScore | null;
  parecer_11_consultor: import('./models').RiskScore | null;
  parecer_12_consultor: import('./models').RiskScore | null;
  
  parecer_final_consultor: import('./models').RiskScore | null;
  reports: ConsultantReport[];
  consultant_reports?: ConsultantReport[];
  recommendations?: Recommendation[];

  analista_rs_id: number | null;
  id_gestao_de_pessoas: number | null;
  
  // Vínculos com candidatos
  pessoa_id?: number | null;
  candidatura_id?: number | null;
  curriculo_url?: string | null;
  curriculo_filename?: string | null;
  curriculo_uploaded_at?: string | null;
}