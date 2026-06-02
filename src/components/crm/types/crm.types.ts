/**
 * crm.types.ts — Tipos compartilhados do Módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/types/crm.types.ts
 * Versão: 1.1 (Fase E-1/E-2 — 01/06/2026)
 *
 * Histórico:
 *  - v1.0 (29/05/2026 — Fase 1B): fonte única de verdade dos tipos.
 *  - v1.1 (01/06/2026 — Fase E-1/E-2): adicionados campos que o
 *    backend já tinha desde as Fases B/5A mas o tipo estava defasado
 *    (`responsavel_id`, `assinatura_id`, `inicio_envio` em Campanha;
 *    `ativo`, `criado_em`, `atualizado_em` em Assinatura). Adicionado
 *    o campo `unidade` em Assinatura e Campanha (Fase E-1). Novos
 *    tipos: `Unidade` e `PessoaAssinatura` (consumido pelo modal).
 *
 * Convenção:
 *   - Tipos de domínio (Empresa, Lead, Campanha, etc.) representam
 *     o registro completo retornado pela API.
 *   - Tipos com sufixo Input (EmpresaInput, LeadInput) representam
 *     o payload de criação/edição (sem id, sem campos calculados).
 *   - Tipos com sufixo Resumo representam projeções leves usadas
 *     em listagens (ex.: LeadResumo dentro de uma campanha).
 */

// ════════════════════════════════════════════════════════════
// EMPRESA
// ════════════════════════════════════════════════════════════

export interface Empresa {
  id: number;
  nome: string;
  dominio: string | null;
  cnpj: string | null;
  setor: string | null;
  porte: string | null;
  cidade: string | null;
  uf: string | null;
  website: string | null;
  linkedin_url: string | null;
  telefone_comercial: string | null;
  observacoes: string | null;
  origem: string | null;
  total_leads: number;
  total_prospects: number;
  total_clientes: number;
  criado_em: string;
}

export type EmpresaInput = Omit<
  Empresa,
  'id' | 'total_leads' | 'total_prospects' | 'total_clientes' | 'criado_em'
>;

export interface EmpresaResumo {
  id: number;
  nome: string;
  dominio: string | null;
  setor: string | null;
}

// ════════════════════════════════════════════════════════════
// LEAD
// ════════════════════════════════════════════════════════════

/**
 * Status possíveis do funil. String aberta no banco, mas mapeada
 * para essas constantes no FunilBadge e nos filtros.
 */
export type FunilStatus = 'lead' | 'prospect' | 'cliente' | 'inativo' | 'perdido';

export interface Lead {
  id: number;
  empresa_id: number | null;
  nome: string;
  email: string;
  cargo: string | null;
  telefone: string | null;
  linkedin_url: string | null;
  funil_status: string;            // será FunilStatus na prática; mantido string p/ compat
  funil_atualizado_em: string;
  score_engajamento: number;
  opt_out: boolean;
  total_emails_recebidos: number;
  total_emails_abertos: number;
  total_emails_clicados: number;
  total_respostas: number;
  tags: string[] | null;
  notas: string | null;
  origem: string | null;
  criado_em: string;

  // Joins
  email_empresas?: EmpresaResumo | null;

  // ── Novos campos (Fase 2) — opcionais até a migração ──
  tipos_campanha_ids?: number[];
  ultima_campanha_em?: string | null;
  reservado_por?: number | null;   // owner (Analista/SDR/Comercial)
}

export type LeadInput = Omit<
  Lead,
  | 'id'
  | 'funil_atualizado_em'
  | 'score_engajamento'
  | 'total_emails_recebidos'
  | 'total_emails_abertos'
  | 'total_emails_clicados'
  | 'total_respostas'
  | 'criado_em'
  | 'email_empresas'
  | 'ultima_campanha_em'
>;

// ════════════════════════════════════════════════════════════
// HISTÓRICO DO LEAD (timeline)
// ════════════════════════════════════════════════════════════

export type HistoricoTipo =
  | 'lead_criado'
  | 'email_enviado'
  | 'email_aberto'
  | 'email_clicado'
  | 'email_respondido'
  | 'bounce'
  | 'opt_out'
  | 'funil_mudou'
  | 'nota_manual'
  | 'campanha_adicionado';

export interface HistoricoItem {
  id: number;
  tipo: string;                    // será HistoricoTipo na prática
  descricao: string;
  dados: unknown;
  assunto_email: string | null;
  criado_por: string | null;
  criado_em: string;
  email_campanhas?: { nome: string } | null;
}

// ════════════════════════════════════════════════════════════
// CAMPANHA
// ════════════════════════════════════════════════════════════

export type CampanhaStatus = 'rascunho' | 'ativa' | 'pausada' | 'concluida' | 'arquivada';

/**
 * Delays permitidos para reaproveitamento do lead em uma nova
 * campanha do mesmo tipo (Decisão B v3.1).
 */
export type DelayDias = 30 | 60 | 90 | 120;

export interface Campanha {
  id: number;
  nome: string;
  tipo: string;                    // texto livre legado; será substituído por tipo_campanha_id
  status: string;
  // 🆕 Fase E-1 (01/06/2026): unidade comercial do grupo (TechFor TI / TechCob BPO / TechBoat)
  unidade: string;
  dominio_envio: string;
  email_remetente: string;
  nome_remetente: string;
  horario_inicio: string;
  horario_fim: string;
  total_destinatarios: number;
  total_enviados: number;
  total_abertos: number;
  total_clicados: number;
  total_respondidos: number;
  total_bounces: number;
  taxa_abertura: number;
  taxa_cliques: number;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;

  // 🆕 Fase B (01/06/2026): responsável + assinatura (deriva do responsável)
  responsavel_id?: number | null;
  assinatura_id?: number | null;

  // 🆕 Fase 5A (01/06/2026): timestamps de envio
  inicio_envio?: string | null;
  fim_envio?: string | null;

  // ── Novos campos (Fase 3) — opcionais até a migração ──
  tipo_campanha_id?: number | null;
  delay_minimo_dias?: DelayDias;
  data_inicio_envios?: string | null;
  data_fim_envios?: string | null;
  cargos_alvo?: string[];
}

// ════════════════════════════════════════════════════════════
// STEP da campanha
// ════════════════════════════════════════════════════════════

export interface Step {
  id?: number;
  campanha_id?: number;
  ordem: number;
  assunto: string;
  corpo_html: string;
  corpo_texto: string;
  delay_dias: number;
  condicao: string;
  ativo: boolean;
  // ── Novo (Fase 4): FK para email_copys ──
  copy_id?: number | null;
}

// ════════════════════════════════════════════════════════════
// LEAD x CAMPANHA (vínculo)
// ════════════════════════════════════════════════════════════

export interface LeadCampanha {
  id: number;
  status: string;
  step_atual: number;
  adicionado_em: string;
  email_leads: {
    id: number;
    nome: string;
    email: string;
    cargo: string;
    empresa_id: number;
    funil: string;
    email_empresas: { nome: string } | null;
  };
}

export interface LeadDisponivel {
  id: number;
  nome: string;
  email: string;
  cargo: string;
  funil: string;
  email_empresas: { nome: string } | null;
}

// ════════════════════════════════════════════════════════════
// ASSINATURA
// ════════════════════════════════════════════════════════════

/**
 * Identificador semântico de uma assinatura na v1.7+ do backend.
 * Uma pessoa pode ter N assinaturas — uma por unidade do grupo.
 * Esta string é a UNIDADE_PADRAO em /types/crm.constants.ts.
 */
export type Unidade = string;

export interface Assinatura {
  id?: number;
  user_email: string;
  // 🆕 Fase E-1 (01/06/2026): unidade comercial do grupo
  unidade: Unidade;
  nome_completo: string;
  cargo: string;
  email_assinatura: string;
  telefone_fixo: string;
  telefone_celular: string;
  websites: string[];
  politica_privacidade_url: string;
  optout_texto: string;
  // 🆕 Fase D (01/06/2026): controle de soft-disable + audit
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

/**
 * Projeção leve de pessoa que pode receber assinatura — usada como
 * dropdown do AssinaturaModal e na lista da AssinaturasPage.
 */
export interface PessoaAssinatura {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string;
}

// ════════════════════════════════════════════════════════════
// TIPO DE CAMPANHA (Fase 2 — Decisão C)
// ════════════════════════════════════════════════════════════

export interface TipoCampanha {
  id: number;
  codigo: string;                  // 'ALOCACAO', 'BPO', 'SECURITY', etc.
  nome: string;
  descricao: string | null;
  cor_badge: string | null;        // hex
  ativo: boolean;
  criado_em: string;
}

// ════════════════════════════════════════════════════════════
// COPY (Fase 4 — Decisão E)
// ════════════════════════════════════════════════════════════

export interface Copy {
  id: number;
  nome: string;
  tipo_campanha_id: number | null;
  assunto: string;
  corpo_html: string;
  corpo_texto: string | null;
  variaveis: string[];
  tags: string[];
  ativo: boolean;
  criado_por: number;
  total_usos: number;
  ultima_taxa_abertura: number | null;
  criado_em: string;
  atualizado_em: string;
}

// ════════════════════════════════════════════════════════════
// DOMÍNIO DE ENVIO (Fase 5)
// ════════════════════════════════════════════════════════════

export interface Dominio {
  id: number;
  dominio: string;
  nome_amigavel: string | null;
  ativo: boolean;
  prioridade: number;
  limite_diario: number;
  total_enviado_hoje: number;
  ultima_zeragem: string;
  resend_status: string;
  criado_em: string;
}

// ════════════════════════════════════════════════════════════
// CORRESPONDÊNCIA (Fase 7 — Decisão D)
// ════════════════════════════════════════════════════════════

export type EscopoCorrespondencia = 'dominio' | 'campanha' | 'analista' | 'global';

export interface Correspondencia {
  id: number;
  escopo: EscopoCorrespondencia;
  escopo_ref: string | null;
  emails_destino: string[];
  descricao: string | null;
  ativo: boolean;
  criado_por: number;
  criado_em: string;
}

// ════════════════════════════════════════════════════════════
// STATS (KPIs do módulo)
// ════════════════════════════════════════════════════════════

export interface CRMStats {
  total_empresas: number;
  total_leads: number;
  total_prospects: number;
  total_clientes: number;
  total_optout: number;
  total_campanhas: number;
}

// ════════════════════════════════════════════════════════════
// PROPS COMUNS
// ════════════════════════════════════════════════════════════

export interface CurrentUserLite {
  id: number;
  nome_usuario: string;
  tipo_usuario: string;
}
