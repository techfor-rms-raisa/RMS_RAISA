/**
 * api/crm-cotas.ts — Gestão de cotas diárias de revalidação (RBAC Admin)
 *
 * Caminho: api/crm-cotas.ts
 * Versão:  1.0 (23/06/2026 — Parametrização da cota Messias)
 *
 * ════════════════════════════════════════════════════════════════════
 * RESPONSABILIDADE
 * ════════════════════════════════════════════════════════════════════
 * Endpoint dedicado para a aba "Cotas" no menu CRM & Campanhas. Permite
 * ao Administrador visualizar e editar a coluna `cota_revalidacao_diaria`
 * em `app_users` para cada GC/SDR/Admin ativo.
 *
 * Decisões de produto Messias 23/06/2026:
 *   Q2 → RBAC: SÓ Administrador vê e edita esta aba (mais restrito).
 *   D1 → Range 0–500 (CHECK constraint no banco já barra fora de range).
 *   D2 → Default novo usuário: 50 (definido na migration ALTER TABLE).
 *
 * Por que endpoint próprio (NÃO action em crm-config.ts):
 *   - Coesão clara: este endpoint só gerencia cotas; crm-config.ts cresceu
 *     bastante e adicionar mais actions infla acoplamento.
 *   - Naming convention v1.6 (Vercel bundler collision): prefixo `crm-`
 *     evita colisão de bundle com hooks frontend `useCotas` que tem
 *     prefixo `use-`.
 *
 * ════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/crm-cotas?action=listar_cotas&user_id={admin_id}
 *   RBAC: app_users[admin_id].tipo === 'Administrador'
 *   Retorna a lista de usuários ativos com tipo GC/SDR/Admin + cota atual,
 *   ordenados por tipo (Admin → GC → SDR) e nome.
 *   Resposta:
 *     {
 *       success: true,
 *       cotas: [
 *         { id: 1, nome_usuario: "Paulo Malvezzi", tipo: "Administrador", cota_revalidacao_diaria: 50 },
 *         { id: 2, nome_usuario: "Messias Vieira",  tipo: "Gestão Comercial", cota_revalidacao_diaria: 50 },
 *         ...
 *       ],
 *       cota_min: 0,
 *       cota_max: 500,
 *       cota_default: 50
 *     }
 *
 * POST /api/crm-cotas?action=atualizar_cota
 *   Body: { admin_user_id: number, target_user_id: number, cota_diaria: number }
 *   RBAC: app_users[admin_user_id].tipo === 'Administrador'
 *   Validações:
 *     - cota_diaria deve ser número inteiro entre 0 e 500
 *     - target_user_id deve existir e ter tipo em { Administrador, Gestão Comercial, SDR }
 *   Resposta de sucesso:
 *     { success: true, target_user_id, nome_usuario, cota_diaria }
 *
 * ════════════════════════════════════════════════════════════════════
 * SEGURANÇA (⚠️ Claude Riscos)
 * ════════════════════════════════════════════════════════════════════
 * - RBAC duro server-side (não confia no frontend): SELECT na tabela
 *   app_users com o admin_user_id ANTES de qualquer mutação.
 * - Validação de range no backend (mesmo com CHECK no banco) para retornar
 *   mensagem clara em vez de erro 23514 cru do Postgres.
 * - Limita o universo de target_user a tipos operacionais conhecidos
 *   (não permite editar cota de "Operador Email", "Consultor", etc).
 * - Não cria, nem deleta usuários — só editar cota. Princípio do menor
 *   privilégio para este endpoint.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { COTA_MIN, COTA_MAX, COTA_DIARIA_DEFAULT } from '../lib/cota-diaria.js';

export const config = { maxDuration: 10 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tipos de usuário que podem ter cota gerenciada nesta aba.
// Sincronizado com o naming usado em outras partes do sistema (mesmas
// strings dos badges em ManageUsers, RBAC de useLeads, etc).
const TIPOS_COM_COTA = ['Administrador', 'Gestão Comercial', 'SDR'] as const;
type TipoComCota = typeof TIPOS_COM_COTA[number];

// ════════════════════════════════════════════════════════════════════
// HELPER — RBAC Admin (lock server-side)
// ════════════════════════════════════════════════════════════════════

/**
 * Valida que o user_id passado é Administrador. Retorna { ok: true } ou
 * { ok: false, status, mensagem } para o handler enviar diretamente.
 */
type GuardOk   = { ok: true;  nome: string };
type GuardFail = { ok: false; status: number; mensagem: string };
type GuardResult = GuardOk | GuardFail;

async function exigirAdmin(user_id: number): Promise<GuardResult> {
  if (!user_id || isNaN(user_id)) {
    return { ok: false, status: 400, mensagem: 'user_id (admin) obrigatório.' };
  }
  const { data, error } = await supabase
    .from('app_users')
    .select('id, nome_usuario, tipo, ativo')
    .eq('id', user_id)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, mensagem: `Erro ao validar admin: ${error.message}` };
  }
  if (!data) {
    return { ok: false, status: 403, mensagem: 'Usuário não encontrado.' };
  }
  if (!data.ativo) {
    return { ok: false, status: 403, mensagem: 'Usuário inativo não pode acessar esta aba.' };
  }
  if (data.tipo !== 'Administrador') {
    return { ok: false, status: 403, mensagem: 'Acesso restrito: apenas Administrador pode gerenciar cotas.' };
  }
  return { ok: true, nome: data.nome_usuario };
}

// ════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = String(req.query.action ?? '').trim();

  // ── GET listar_cotas ──────────────────────────────────────────────
  if (req.method === 'GET' && action === 'listar_cotas') {
    return handleListarCotas(req, res);
  }

  // ── POST atualizar_cota ───────────────────────────────────────────
  if (req.method === 'POST' && action === 'atualizar_cota') {
    return handleAtualizarCota(req, res);
  }

  return res.status(400).json({
    success: false,
    error:   `Action desconhecida ou método incorreto. Use GET ?action=listar_cotas OU POST ?action=atualizar_cota.`,
  });
}

// ════════════════════════════════════════════════════════════════════
// GET listar_cotas
// ════════════════════════════════════════════════════════════════════

async function handleListarCotas(req: VercelRequest, res: VercelResponse) {
  const adminId = Number(req.query.user_id);
  const guard = await exigirAdmin(adminId);
  if (!guard.ok) {
    return res.status(guard.status).json({ success: false, error: guard.mensagem });
  }

  const { data, error } = await supabase
    .from('app_users')
    .select('id, nome_usuario, tipo, ativo, cota_revalidacao_diaria')
    .in('tipo', [...TIPOS_COM_COTA])
    .eq('ativo', true)
    .order('tipo',         { ascending: true })
    .order('nome_usuario', { ascending: true });

  if (error) {
    console.error(`❌ [crm-cotas/listar] ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success:      true,
    cotas:        data ?? [],
    cota_min:     COTA_MIN,
    cota_max:     COTA_MAX,
    cota_default: COTA_DIARIA_DEFAULT,
  });
}

// ════════════════════════════════════════════════════════════════════
// POST atualizar_cota
// ════════════════════════════════════════════════════════════════════

async function handleAtualizarCota(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const adminId  = Number(body.admin_user_id);
  const targetId = Number(body.target_user_id);
  const cota     = body.cota_diaria;

  // RBAC primeiro
  const guard = await exigirAdmin(adminId);
  if (!guard.ok) {
    return res.status(guard.status).json({ success: false, error: guard.mensagem });
  }

  // Validações
  if (!targetId || isNaN(targetId)) {
    return res.status(400).json({ success: false, error: 'target_user_id obrigatório.' });
  }
  if (typeof cota !== 'number' || !Number.isInteger(cota)) {
    return res.status(400).json({ success: false, error: 'cota_diaria deve ser um inteiro.' });
  }
  if (cota < COTA_MIN || cota > COTA_MAX) {
    return res.status(400).json({
      success: false,
      error:   `cota_diaria fora do range permitido (${COTA_MIN} a ${COTA_MAX}).`,
    });
  }

  // Confirma que target é GC/SDR/Admin antes de mutar (defesa em profundidade
  // contra alguém tentando alterar cota de "Operador Email" etc).
  const { data: target, error: errBusca } = await supabase
    .from('app_users')
    .select('id, nome_usuario, tipo, ativo')
    .eq('id', targetId)
    .maybeSingle();

  if (errBusca) {
    return res.status(500).json({ success: false, error: errBusca.message });
  }
  if (!target) {
    return res.status(404).json({ success: false, error: 'Usuário alvo não encontrado.' });
  }
  if (!(TIPOS_COM_COTA as readonly string[]).includes(target.tipo)) {
    return res.status(400).json({
      success: false,
      error:   `Usuário do tipo '${target.tipo}' não tem cota gerenciável (apenas ${TIPOS_COM_COTA.join(', ')}).`,
    });
  }

  // UPDATE
  const { error: errUpd } = await supabase
    .from('app_users')
    .update({ cota_revalidacao_diaria: cota })
    .eq('id', targetId);

  if (errUpd) {
    console.error(`❌ [crm-cotas/atualizar] target=${targetId} cota=${cota}: ${errUpd.message}`);
    // CHECK constraint 23514 vira mensagem amigável (proteção defensiva
    // caso a validação acima seja burlada via curl direto).
    if (errUpd.message.includes('app_users_cota_revalidacao_diaria_range_chk')) {
      return res.status(400).json({
        success: false,
        error:   `Cota fora do range permitido pelo banco (${COTA_MIN}–${COTA_MAX}).`,
      });
    }
    return res.status(500).json({ success: false, error: errUpd.message });
  }

  console.log(`✏️ [crm-cotas/atualizar] admin="${guard.nome}" alterou cota de target_id=${targetId} (${target.nome_usuario}) para ${cota}/dia`);

  return res.status(200).json({
    success:        true,
    target_user_id: targetId,
    nome_usuario:   target.nome_usuario,
    tipo:           target.tipo,
    cota_diaria:    cota,
  });
}
