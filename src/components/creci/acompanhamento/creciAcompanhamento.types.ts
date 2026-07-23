/**
 * creciAcompanhamento.types.ts — Módulo CRECI / Aba Acompanhamento
 *
 * Tipos, constantes de domínio e formatadores compartilhados pelos
 * componentes da carteira de acompanhamento de corretores.
 *
 * Caminho: src/components/creci/acompanhamento/creciAcompanhamento.types.ts
 *
 * Os literais aqui espelham exatamente os CHECK constraints do banco
 * (sql/2026-07-23_creci_acompanhamento.sql) e as whitelists de
 * api/creci-acompanhamento.ts. Qualquer valor novo precisa ser adicionado
 * nos três lugares — banco, endpoint e aqui.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 *  - v1.1 (23/07/2026): novo formatador `formatDataOuHora`. Colunas `date`
 *      ('YYYY-MM-DD') passadas por formatDataHora exibiam o dia anterior às
 *      21:00 — o construtor Date lê a string como meia-noite UTC e o
 *      navegador converte para BRT. Detectado na linha do tempo, onde
 *      "Aceite do contrato" de 22/07 aparecia como 21/07 21:00. Alteração
 *      aditiva: nenhuma função existente foi modificada.
 */

// ─── PERFIS (valores reais de app_users.tipo_usuario) ────────────────────────
//
// Atenção: o perfil de administrador se chama 'Administrador', não 'Admin'.
// Estes valores são apenas para decidir o que MOSTRAR na tela. A permissão
// real é aplicada no servidor, em api/creci-acompanhamento.ts.

export const PERFIS_LEITURA = ['Administrador', 'SDR', 'Gestão Comercial'] as const;
export const PERFIS_ESCRITA = ['Administrador', 'SDR'] as const;

export interface CurrentUser {
  id: number;
  nome_usuario: string;
  tipo_usuario: string;
}

export function podeLerCarteira(user?: CurrentUser): boolean {
  return !!user && (PERFIS_LEITURA as readonly string[]).includes(user.tipo_usuario);
}

export function podeEscreverCarteira(user?: CurrentUser): boolean {
  return !!user && (PERFIS_ESCRITA as readonly string[]).includes(user.tipo_usuario);
}

// ─── DOMÍNIO ─────────────────────────────────────────────────────────────────

export type SituacaoFiltro = 'todos' | 'interesse' | 'fechado';

export type StatusContrato = 'pendente' | 'andamento' | 'paralisado' | 'finalizado';

export type StatusContratoFiltro = 'todos' | 'sem_contrato' | StatusContrato;

export type ModeloRemuneracao = 'exito' | 'fixo' | 'misto';

export type TipoAtividade =
  | 'conversa'
  | 'whatsapp'
  | 'reuniao'
  | 'proposta'
  | 'acordo'
  | 'documentacao'
  | 'nota';

// ─── ENTIDADES ───────────────────────────────────────────────────────────────

/** Linha da carteira — retorno da RPC listar_carteira_creci. */
export interface CarteiraItem {
  corretor_id: number;
  nome: string;
  creci: string;
  email: string | null;
  celular: string | null;
  cidade: string | null;
  uf: string | null;
  analista: string | null;
  data_contato: string | null;
  interesse: string | null;
  negocio_fechado: string | null;
  data_envio_adv: string | null;
  data_whatsapp_clicado: string | null;
  contrato_id: number | null;
  numero_contrato: string | null;
  status_contrato: StatusContrato | null;
  valor_contrato: number | null;
  data_aceite: string | null;
  total_atividades: number;
  ultima_atividade_em: string | null;
  fup_pendente_em: string | null;
  fup_vencido: boolean;
  lead_id: number | null;
  total_registros: number;
}

export interface Contrato {
  id: number;
  corretor_id: number;
  numero_contrato: string | null;
  data_aceite: string | null;
  valor_contrato: number | null;
  status_contrato: StatusContrato;
  modelo_remuneracao: ModeloRemuneracao | null;
  percentual_exito: number | null;
  proxima_revisao: string | null;
  observacoes: string | null;
  criado_por_id: number | null;
  criado_por_nome: string;
  criado_em: string;
  atualizado_por_id: number | null;
  atualizado_por_nome: string | null;
  atualizado_em: string;
}

export interface Atividade {
  id: number;
  corretor_id: number;
  contrato_id: number | null;
  tipo: TipoAtividade;
  data_atividade: string;
  descricao: string;
  fup_em: string | null;
  fup_concluido_em: string | null;
  fup_concluido_por_id: number | null;
  fup_concluido_por_nome: string | null;
  executado_por_id: number | null;
  executado_por_nome: string;
  origem: 'manual' | 'automatico';
  criado_em: string;
  atualizado_em: string;
}

/** Mensagem da thread de e-mails — montada pelo endpoint (somente leitura). */
export interface MensagemEmail {
  id: string;
  direcao: 'inbound' | 'outbound';
  data: string | null;
  assunto: string;
  corpo_texto: string | null;
  corpo_html: string | null;
  de_email: string | null;
  de_nome: string | null;
  campanha_id: number | null;
  campanha_nome: string | null;
  step_ordem: number | null;
  status: string | null;
  entregue_em: string | null;
  aberto_em: string | null;
  clicado_em: string | null;
  respondido_em: string | null;
  classificacao: string | null;
}

export interface KpisCarteira {
  total_carteira: number;
  interessados: number;
  negocios_fechados: number;
  contratos_em_andamento: number;
  valor_em_andamento: number;
  fups_vencidos: number;
  corretores_com_fup_vencido: number;
}

export interface FiltrosCarteira {
  busca: string;
  situacao: SituacaoFiltro;
  status_contrato: StatusContratoFiltro;
  responsavel: string;
}

export const FILTROS_INICIAIS: FiltrosCarteira = {
  busca: '',
  situacao: 'todos',
  status_contrato: 'todos',
  responsavel: '',
};

// ─── RÓTULOS E CORES ─────────────────────────────────────────────────────────

export const LABEL_STATUS_CONTRATO: Record<StatusContrato, string> = {
  pendente: 'Pendente',
  andamento: 'Em andamento',
  paralisado: 'Paralisado',
  finalizado: 'Finalizado',
};

export const CORES_STATUS_CONTRATO: Record<StatusContrato, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  andamento: 'bg-indigo-100 text-indigo-800',
  paralisado: 'bg-orange-100 text-orange-800',
  finalizado: 'bg-emerald-100 text-emerald-800',
};

export const LABEL_MODELO_REMUNERACAO: Record<ModeloRemuneracao, string> = {
  exito: 'Êxito (% sobre recuperado)',
  fixo: 'Fixo',
  misto: 'Misto',
};

export const LABEL_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  conversa: 'Conversa / Ligação',
  whatsapp: 'WhatsApp',
  reuniao: 'Reunião',
  proposta: 'Proposta',
  acordo: 'Acordo',
  documentacao: 'Documentação',
  nota: 'Nota interna',
};

export const ICONE_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  conversa: 'fa-solid fa-phone',
  whatsapp: 'fa-brands fa-whatsapp',
  reuniao: 'fa-solid fa-video',
  proposta: 'fa-solid fa-file-lines',
  acordo: 'fa-solid fa-handshake',
  documentacao: 'fa-solid fa-folder-open',
  nota: 'fa-solid fa-note-sticky',
};

/** Cor da borda esquerda do card de atividade, por tipo. */
export const COR_BORDA_TIPO: Record<TipoAtividade, string> = {
  conversa: 'border-sky-400',
  whatsapp: 'border-emerald-400',
  reuniao: 'border-indigo-400',
  proposta: 'border-violet-400',
  acordo: 'border-emerald-500',
  documentacao: 'border-amber-400',
  nota: 'border-gray-300',
};

// ─── FORMATADORES ────────────────────────────────────────────────────────────

export function formatBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Data (sem hora) em pt-BR. Aceita 'YYYY-MM-DD' e ISO completo. */
export function formatData(valor: string | null | undefined): string {
  if (!valor) return '—';
  // Datas puras ('2026-07-20') são tratadas como UTC pelo construtor Date e
  // voltariam um dia atrás no fuso do Brasil. Formatamos manualmente.
  const soData = /^\d{4}-\d{2}-\d{2}$/.exec(valor);
  if (soData) {
    const [a, m, d] = valor.split('-');
    return `${d}/${m}/${a}`;
  }
  const dt = new Date(valor);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR');
}

export function formatDataHora(valor: string | null | undefined): string {
  if (!valor) return '—';
  const dt = new Date(valor);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formata respeitando a granularidade da origem.
 *
 * Colunas `date` do Postgres chegam como 'YYYY-MM-DD' e NÃO têm hora. Passá-las
 * por formatDataHora produz o dia anterior às 21:00, porque o construtor Date
 * interpreta a string como meia-noite UTC e o navegador converte para BRT.
 * Use esta função sempre que a origem puder ser `date` OU `timestamptz` —
 * caso da linha do tempo, que mistura marcos do funil (date) com atividades
 * e e-mails (timestamptz).
 */
export function formatDataOuHora(valor: string | null | undefined): string {
  if (!valor) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatData(valor);
  return formatDataHora(valor);
}

/** Converte ISO para o formato aceito por <input type="datetime-local">. */
export function paraInputDateTime(valor: string | null | undefined): string {
  const dt = valor ? new Date(valor) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Data local de hoje em 'YYYY-MM-DD' — base para comparar FUP vencido na UI. */
export function hojeISO(): string {
  const dt = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function fupVencido(fupEm: string | null | undefined): boolean {
  if (!fupEm) return false;
  return fupEm <= hojeISO();
}
