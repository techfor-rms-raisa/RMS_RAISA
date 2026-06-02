/**
 * copy.types.ts — Tipos do módulo Biblioteca de Copys
 *
 * Caminho: src/components/crm/types/copy.types.ts
 * Versão: 1.0 (Fase 4B — 30/05/2026)
 *
 * Espelham as tabelas:
 *   - email_tipos_campanha
 *   - email_copys
 *
 * Mantidos em arquivo separado de crm.types.ts para evitar acoplamento
 * forte com o módulo de Campanhas (Fase 1D). Importar via:
 *   import type { Copy, TipoCampanha } from '../../types/copy.types';
 */

// ════════════════════════════════════════════════════════════
// TIPOS DE CAMPANHA (Verticais de Negócio)
// ════════════════════════════════════════════════════════════

export interface TipoCampanha {
  id: number;
  nome: string;             // "Outsourcing", "Alocação SAP", etc
  descricao: string | null;
  ativo: boolean;
  criado_por: string;
  criado_em: string;
  atualizado_em?: string;
}

// ════════════════════════════════════════════════════════════
// COPY DE EMAIL
// ════════════════════════════════════════════════════════════

export interface Copy {
  id: number;
  nome: string;                    // "Outsourcing - Abertura (Step 1)"
  tipo_id: number;                 // FK para email_tipos_campanha
  ordem_sugerida: number | null;   // 1..5
  assunto: string;
  corpo_html: string;
  descricao: string | null;
  variaveis: string[];             // ["{{name}}"]
  ativo: boolean;
  criado_por: string;
  criado_por_id: number | null;
  criado_em: string;
  atualizado_em: string;
  atualizado_por: string | null;
  // Join (quando disponível)
  email_tipos_campanha?: Pick<TipoCampanha, 'id' | 'nome' | 'descricao'>;
}

// Payload para criar/atualizar copy
export interface CopyInput {
  id?: number;
  nome: string;
  tipo_id: number;
  ordem_sugerida: number | null;
  assunto: string;
  corpo_html: string;
  descricao: string | null;
}

// ════════════════════════════════════════════════════════════
// STATS / KPIs
// ════════════════════════════════════════════════════════════

export interface CopysStats {
  total_copys: number;
  total_tipos: number;
  distribuicao_por_tipo: Record<string, number>;
}

// ════════════════════════════════════════════════════════════
// RBAC HELPERS (UI-side — espelham regras do backend api/crm-copys.ts)
// ════════════════════════════════════════════════════════════

const TIPOS_QUE_CRIAM_COPYS = new Set(['Administrador', 'Gestão Comercial']);
const TIPOS_QUE_GERENCIAM_TIPOS = new Set(['Administrador']);

/** Pode criar copys novas? (Admin + Gestão Comercial) */
export function podeCriarCopy(tipoUsuario: string | undefined): boolean {
  return !!tipoUsuario && TIPOS_QUE_CRIAM_COPYS.has(tipoUsuario);
}

/** Pode criar/editar/excluir tipos de campanha? (apenas Admin) */
export function podeGerenciarTipos(tipoUsuario: string | undefined): boolean {
  return !!tipoUsuario && TIPOS_QUE_GERENCIAM_TIPOS.has(tipoUsuario);
}

/** Pode editar/excluir uma copy específica? (criador OU Admin) */
export function podeEditarCopy(
  tipoUsuario: string | undefined,
  usuarioId: number | undefined,
  copyCriadorId: number | null | undefined
): boolean {
  if (tipoUsuario === 'Administrador') return true;
  if (!usuarioId || !copyCriadorId) return false;
  return usuarioId === copyCriadorId;
}
