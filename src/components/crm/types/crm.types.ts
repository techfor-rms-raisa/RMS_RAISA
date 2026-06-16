/**
 * crm.types.ts — Tipos compartilhados do Módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/types/crm.types.ts
 * Versão: 1.7 (F8 — Aba Inválidos lead-centric + Lead com estados de invalidação — 16/06/2026)
 *
 * v1.7 (16/06/2026 — F8: Aba Inválidos lead-centric):
 *   Alinhamento dos tipos com a reformulação da aba "Inválidos" entregue
 *   junto com o webhook v1.15 (popular `motivo_invalidacao` em hard
 *   bounce) e crm-leads.ts v1.15 (rota `listar_invalidos` agora consulta
 *   `email_leads` em vez de `email_fila`).
 *
 *   Mudanças neste arquivo:
 *     • `Lead` ganha 6 campos opcionais (todos populados pelo backend,
 *       já existentes no schema do banco desde a Fase Recovery 3.A):
 *         - `bounced`           (boolean — true = hard bounce permanente)
 *         - `bounced_em`        (timestamp — quando o bounce ocorreu)
 *         - `bounced_motivo`    (texto raw do Resend, preservado)
 *         - `motivo_invalidacao` (classificação curta — "Email não existe",
 *                                 "Caixa lotada", "Domínio inválido", etc.)
 *         - `tentativas_recovery` (contador 0–3, usado pelo motor 3.A)
 *         - `recovery_em`       (último timestamp de tentativa de recovery)
 *       Esses campos já vinham no payload do `listar_leads` (que faz
 *       `select('*')`) — declará-los no TS apenas elimina os `(l as any)`
 *       que estavam aparecendo nos componentes.
 *
 *     • `InvalidoItem` REESCRITO para schema lead-centric:
 *         - chave primária passa a ser `lead_id` (não mais `fila_id`)
 *         - 1 linha por lead inválido (não mais 1 por falha de envio)
 *         - novo campo `motivo` derivado de `motivo_invalidacao`
 *           (com fallback para `bounced_motivo` quando NULL)
 *         - inclui `tentativas_recovery` e `recovery_em` para a coluna
 *           "Recovery" da nova UI (botão "Tentar Recovery" usa esses
 *           campos para mostrar progresso / esgotamento).
 *       Campos removidos: `fila_id`, `enviado_em`, `criado_em` (já não
 *       fazem sentido no modelo lead-centric — uma linha NÃO é mais
 *       evento de fila).
 *
 *     • `InvalidoStatus` reduzido para `'bounce'` apenas (já não há
 *       distinção entre bounce e erro técnico — o critério da aba é o
 *       estado consolidado do lead). Mantido como tipo para retrocompat
 *       caso futuras categorias surjam.
 *
 *   Sem alteração em outros tipos. Sem migração SQL — todas as colunas
 *   já existem em `email_leads` (confirmado no smoke test CHECKPOINT
 *   2026-06-13).
 *
 * v1.6 (14/06/2026 — Alinhamento TS↔DDL):
 *   Removido o campo `codigo: string` da interface `TipoCampanha`. A
 *   coluna `codigo` foi declarada no TS desde a v1.0 mas NUNCA existiu
 *   na DDL real de `email_tipos_campanha` em Production (introspect
 *   confirmou: id, nome, descricao, ativo, criado_por, criado_em).
 *   Inconsistência detectada durante a investigação dos bugs de
 *   dropdown de vertical (Bug 2 — campo nunca foi consumido pelo
 *   código de runtime, só atrapalhava SELECTs do tipo
 *   `select('id, codigo, nome, ativo, criado_em')` que retornavam
 *   ERROR 42703. Solução de menor impacto: remover do TS.
 *   Caminho alternativo (não escolhido): ALTER TABLE adicionando
 *   a coluna — descartado por não haver uso real.
 *
 * Histórico:
 *  - v1.0 (29/05/2026 — Fase 1B): fonte única de verdade dos tipos.
 *  - v1.1 (01/06/2026 — Fase E-1/E-2): adicionados campos que o
 *    backend já tinha desde as Fases B/5A mas o tipo estava defasado
 *    (`responsavel_id`, `assinatura_id`, `inicio_envio` em Campanha;
 *    `ativo`, `criado_em`, `atualizado_em` em Assinatura). Adicionado
 *    o campo `unidade` em Assinatura e Campanha (Fase E-1). Novos
 *    tipos: `Unidade` e `PessoaAssinatura` (consumido pelo modal).
 *  - v1.2 (04/06/2026 — Fase 8-Inbox): novos tipos para as abas
 *    "Respostas" (inbox unificado de respostas + opt-outs) e
 *    "Inválidos" (e-mails que falharam por bounce ou erro de envio):
 *    `RespostaInbox`, `RespostaInboxTipo` e `InvalidoItem`.
 *  - v1.3 (04/06/2026 — Fase 8-fix2): `CRMStats` ganhou dois campos
 *    agregados — `total_respostas` e `total_invalidos` — para alimentar
 *    os badges das abas Respostas/Inválidos no BaseLeadsPage sem
 *    precisar abrir cada aba.
 *  - v1.4 (05/06/2026 — Lead RBAC fix): `Lead` agora declara `vertical`
 *    e `apto_campanha` (já existem no schema do banco e no PATCH/POST
 *    do backend a partir de v1.7, mas o tipo TS estava defasado). Estes
 *    são os campos que a action `leads_disponiveis` da campanha checa
 *    para decidir quais leads aparecem no seletor de vínculo:
 *      - `apto_campanha = true`
 *      - `vertical = campanha.tipo`
 *      - `reservado_por = campanha.responsavel_id` (já tinha)
 *    Sem esses 3 campos preenchidos, o lead fica invisível para campanhas
 *    (foi o sintoma reportado pela Débora SDR em 05/06/2026).
 *    Como `LeadInput = Omit<Lead, ...>`, os 2 campos novos passam
 *    automaticamente a ser aceitos no payload de criar/editar.
 *  - v1.5 (13/06/2026 — Reorganização Prospect/Lead):
 *    `Lead` ganha o campo opcional `reservado_por_nome`, ANEXADO PELO
 *    BACKEND (crm-leads.ts v1.14, action `listar_leads`) via batch
 *    lookup em `app_users` a partir do `reservado_por`. Este campo NÃO
 *    existe no banco — é uma projeção computada para alimentar a
 *    coluna ANALISTA da nova tabela em `LeadsTab` v1.1 sem precisar
 *    de joins SQL ou requisições adicionais no frontend.
 *    Por estar no `Lead` (não em um tipo derivado), `LeadInput` o
 *    omite automaticamente — não vai pro payload de criar/editar.
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

  // ── v1.4 (05/06/2026) — Lead RBAC fix ──
  // Sem esses 3 campos preenchidos corretamente, o lead não aparece no
  // seletor de vínculo da campanha (action `leads_disponiveis`).
  vertical?: string | null;         // tipo de campanha (ex.: 'CRECI', 'Alocação')
  apto_campanha?: boolean;          // true = pode entrar em campanha

  // ── v1.5 (13/06/2026) — Reorganização Prospect/Lead ──
  // Projeção computada (NÃO está no banco). Anexada pelo backend
  // (crm-leads.ts v1.14) via batch lookup em app_users a partir
  // de `reservado_por`. Alimenta a coluna ANALISTA da nova tabela
  // em LeadsTab v1.1. NULL quando `reservado_por` é NULL ou quando
  // o usuário referenciado foi removido.
  reservado_por_nome?: string | null;

  // ── v1.7 (16/06/2026) — F8: estados de invalidação e Recovery ──
  // Todos estes campos JÁ EXISTEM em `email_leads` desde a Fase Recovery
  // 3.A. Eram acessados via `(lead as any).campo` em alguns componentes —
  // declará-los aqui torna o uso type-safe.
  //
  // Critério da aba "Inválidos" (crm-leads.ts v1.15 — listar_invalidos):
  //   bounced === true  OR  motivo_invalidacao IS NOT NULL
  //
  // Critério para exclusão da aba "Leads":
  //   mesmo critério acima (defesa em camadas — backend filtra na query).
  /** TRUE quando email do lead deu hard bounce permanente (Resend). */
  bounced?: boolean;
  /** Timestamp do PRIMEIRO bounce reportado (preservado entre retries). */
  bounced_em?: string | null;
  /** Mensagem RAW do Resend (ex.: "550 5.1.1 The email account..."). */
  bounced_motivo?: string | null;
  /**
   * Classificação curta padronizada do motivo da invalidação.
   * Populada pelo webhook v1.15 a partir do `bounced_motivo` raw.
   * Valores: "Email não existe", "Caixa lotada", "Domínio inválido",
   * "Email bloqueado", "Servidor indisponível", "Outro motivo".
   * Pode ser populada manualmente em outros caminhos (futuro).
   */
  motivo_invalidacao?: string | null;
  /** Contador de tentativas do motor Recovery (0–3). */
  tentativas_recovery?: number;
  /** Timestamp da última tentativa de recovery (sucesso ou falha). */
  recovery_em?: string | null;
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

  // 🆕 Fase B (08/06/2026): data planejada de encerramento da campanha.
  //   Formato: 'YYYY-MM-DD'. Quando atingida, o cron disparar-fila.ts v1.11
  //   marca a campanha como 'concluida' E cancela todos os pendentes em
  //   email_fila (Opção A do produto — encerramento limpo).
  //   Validação backend (crm-campanhas.ts v1.3): deve ser >= CURRENT_DATE
  //   ao criar/atualizar; para encerrar imediatamente, use mudar_status.
  //   null = sem encerramento previsto (comportamento default).
  data_encerramento?: string | null;

  // 🆕 Prioridade 1 (11/06/2026): BCC nas respostas da campanha.
  //   Lista de até 3 endereços que recebem cópia quando o LEAD RESPONDE
  //   (forward disparado por crm-webhook → encaminharRespostaAoGestor).
  //   NÃO é cópia no envio inicial — apenas no forward de respostas.
  //   Validação backend (crm-campanhas.ts v1.15): max 3 emails, formato
  //   válido, sem duplicar com email_remetente nem entre si.
  //   [] ou null = sem BCC (forward vai apenas para o responsável).
  bcc_emails?: string[] | null;

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
  /** 🆕 v1.3 — count de `email_respostas` (todas as respostas recebidas). */
  total_respostas: number;
  /** 🆕 v1.3 — count de `email_fila` WHERE status IN ('bounce','erro'). */
  total_invalidos: number;
}

// ════════════════════════════════════════════════════════════
// INBOX UNIFICADO — Aba "Respostas" (Fase 8 — 04/06/2026)
// ════════════════════════════════════════════════════════════

/**
 * Distingue a origem do item no inbox unificado.
 *  - 'resposta' : lead respondeu a um e-mail da campanha (email_respostas).
 *  - 'opt_out'  : lead saiu da base, seja manualmente, por hard bounce ou
 *                 por marcar como spam (email_optout). Tratado com URGÊNCIA
 *                 visual porque exige remoção imediata do mailing.
 */
export type RespostaInboxTipo = 'resposta' | 'opt_out';

export interface RespostaInbox {
  /** Origem do item — define ícone, cor e ação no card. */
  tipo: RespostaInboxTipo;
  /** ID na tabela de origem (email_respostas.id OU email_optout.id). */
  id: number;
  /** Timestamp do evento (recebido_em da resposta ou criado_em do opt-out). */
  data_evento: string;

  // ── Lead (pode ser null para opt-outs manuais sem lead correspondente) ──
  lead_id: number | null;
  lead_nome: string | null;
  lead_email: string;

  // ── Empresa ──
  empresa_id: number | null;
  empresa_nome: string | null;

  // ── Campanha de origem (pode ser null para opt-outs sem origem) ──
  campanha_id: number | null;
  campanha_nome: string | null;

  // ── Conteúdo: presente quando tipo='resposta' ──
  assunto: string | null;
  corpo_texto: string | null;          // preview/texto puro (200 chars)
  classificacao: string | null;        // 'pendente', 'interessado', etc.
  lido: boolean;

  // ── Conteúdo: presente quando tipo='opt_out' ──
  motivo_optout: string | null;        // ex: "Hard bounce", "Marcou como spam"
}

// ════════════════════════════════════════════════════════════
// INVÁLIDOS — Aba "Inválidos" (F8 — 16/06/2026, reescrita lead-centric)
// ════════════════════════════════════════════════════════════

/**
 * Item da aba Inválidos: LEADS que estão em estado terminal de email
 * inválido. Critério (aplicado no backend pela action `listar_invalidos`
 * em crm-leads.ts v1.15):
 *
 *   email_leads.bounced = true
 *      OR
 *   email_leads.motivo_invalidacao IS NOT NULL
 *
 * Mudança v1.7 vs v1.2 original:
 *   ANTES — 1 linha por falha de envio em `email_fila` (status IN
 *           'bounce','erro'). Mesmo lead aparecia N vezes se deu N bounces.
 *   AGORA — 1 linha por LEAD inválido. Estado consolidado. Lead aparece
 *           uma vez só, com todas as informações de invalidação e
 *           progresso de Recovery.
 *
 * Opt-out NÃO entra aqui — vai para a aba "Opt-Out" dedicada (decisão
 * permanente desde a Reorganização Prospect/Lead de 13/06/2026).
 */
export type InvalidoStatus = 'bounce';

export interface InvalidoItem {
  /** ID do lead em email_leads — chave primária da listagem. */
  lead_id: number;

  // ── Lead + Empresa ──
  lead_nome: string;
  lead_email: string;
  empresa_id: number | null;
  empresa_nome: string | null;

  /**
   * Status consolidado. Hoje sempre 'bounce' (lead com bounced=true OU
   * com motivo_invalidacao populado). Mantido como union type para
   * permitir futuras categorias (ex.: 'manual', 'compliance').
   */
  status: InvalidoStatus;

  /**
   * Motivo legível da invalidação (classificação curta padronizada):
   *   - "Email não existe"
   *   - "Caixa lotada"
   *   - "Domínio inválido"
   *   - "Email bloqueado"
   *   - "Servidor indisponível"
   *   - "Outro motivo"
   *   - "Falha permanente" (fallback para leads pré-v1.15 com bounced=true
   *     mas motivo_invalidacao=NULL — não fizemos backfill por decisão
   *     de produto 16/06/2026, preenchimento orgânico nos próximos bounces)
   */
  motivo: string;

  /**
   * Raw original do Resend, preservado em `email_leads.bounced_motivo`.
   * Mostrado em tooltip quando o usuário passa o mouse sobre o motivo
   * classificado. NULL para invalidações sem origem em bounce automático.
   */
  motivo_raw: string | null;

  /** Quando o lead foi marcado como inválido (presente em todos os casos). */
  bounced_em: string | null;

  // ── Recovery (Fase 3.A — Camada Gemini em Production desde 13/06/2026) ──
  /** Contador de tentativas de recovery (0 = nunca tentou; 3 = esgotado). */
  tentativas_recovery: number;
  /** Timestamp da última tentativa (sucesso ou falha) — ou null se nunca tentou. */
  recovery_em: string | null;
}

// ════════════════════════════════════════════════════════════
// PROPS COMUNS
// ════════════════════════════════════════════════════════════

export interface CurrentUserLite {
  id: number;
  nome_usuario: string;
  tipo_usuario: string;
}

// ════════════════════════════════════════════════════════════
// RESPONSÁVEL (lista de usuários elegíveis a serem responsáveis
//              por leads/campanhas — usado pelo Admin no LeadFormModal)
// v1.4 (05/06/2026)
// ════════════════════════════════════════════════════════════

export interface ResponsavelLite {
  id: number;
  nome_usuario: string;
  tipo_usuario: string;     // 'Gestão Comercial' | 'SDR'
  email_usuario?: string | null;
}
