// ============================================
// COMPLIANCE MODULE
// ============================================

export type TemplateStatus = 'rascunho' | 'em_revisao' | 'aprovado' | 'rejeitado';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: TemplateStatus;
  context?: string;
  lastUpdated?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComplianceCampaign {
  id: string;
  name: string;
  targetFilter?: 'all_active' | 'quarantine' | 'risk_only';
  templateSequenceIds?: string[];
  intervalDays?: number;
  startDate?: string;
  status: 'active' | 'paused' | 'completed';
  // Campos snake_case
  target_filter?: 'all_active' | 'quarantine' | 'risk_only';
  interval_days?: number;
  start_date?: string;
  created_at?: string;
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
  origin: 'ai_feedback' | 'ai_quarantine' | 'ai_analysis' | 'manual';
  createdAt: string;
  // ✅ v3.2: Campos de justificativa de conclusão
  justificativaConclusao?: string | null;
  concluidoEm?: string | null;
}

// ============================================
// RECOMENDAÇÕES SUPABASE
// ============================================

export type RecommendationCategory = 
  | 'AÇÃO IMEDIATA' 
  | 'PREVENTIVO' 
  | 'DESENVOLVIMENTO' 
  | 'RECONHECIMENTO' 
  | 'SUPORTE' 
  | 'OBSERVAÇÃO'
  | 'FEEDBACK';

export interface SupabaseRecommendation {
  id: string;
  consultant_id: number;
  category: RecommendationCategory;
  description: string;
  priority: 'alta' | 'media' | 'baixa';
  status: 'pendente' | 'em_andamento' | 'concluido';
  created_at: string;
  updated_at?: string;
}