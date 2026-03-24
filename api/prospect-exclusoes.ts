/**
 * api/prospect-exclusoes.ts
 *
 * CRUD da lista de exclusões de empresas do Prospect Engine.
 * Empresas na lista são ignoradas na extração CV e podem ser
 * removidas em lote da tabela prospect_leads.
 *
 * Métodos:
 * GET  → listar exclusões (com busca opcional)
 * POST { acao: 'adicionar' } → adiciona empresa + remove leads existentes
 * POST { acao: 'remover' }   → remove empresa da lista de exclusões
 *
 * Versão: 1.0
 * Data: 23/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── GET: listar exclusões ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { busca } = req.query as Record<string, string>;

    let query = supabase
      .from('prospect_exclusoes')
      .select(`
        id, empresa_nome, dominio, motivo, created_at,
        adicionado_por,
        app_users!prospect_exclusoes_adicionado_por_fkey ( nome_usuario )
      `)
      .order('empresa_nome', { ascending: true });

    if (busca) {
      query = query.ilike('empresa_nome', `%${busca}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    const exclusoes = (data || []).map((r: any) => ({
      ...r,
      adicionado_por_nome: r.app_users?.nome_usuario || null,
      app_users: undefined,
    }));

    return res.status(200).json({ success: true, exclusoes, total: exclusoes.length });
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { acao, empresa_nome, dominio, motivo, user_id, exclusao_id } = req.body;

    // ── ADICIONAR: insere na lista + remove leads existentes ─────────────────
    if (acao === 'adicionar') {
      if (!empresa_nome || !user_id) {
        return res.status(400).json({ error: 'empresa_nome e user_id são obrigatórios' });
      }

      // Verificar se já existe
      const { data: jaExiste } = await supabase
        .from('prospect_exclusoes')
        .select('id')
        .ilike('empresa_nome', empresa_nome.trim())
        .limit(1);

      if (!jaExiste || jaExiste.length === 0) {
        const { error: errInsert } = await supabase
          .from('prospect_exclusoes')
          .insert({
            empresa_nome: empresa_nome.trim(),
            dominio:      dominio?.trim() || null,
            motivo:       motivo || 'consultoria_ti',
            adicionado_por: user_id,
          });

        if (errInsert) {
          return res.status(500).json({ success: false, error: errInsert.message });
        }
      }

      // Remover todos os leads desta empresa da prospect_leads
      const { data: removidos, error: errDelete } = await supabase
        .from('prospect_leads')
        .delete()
        .ilike('empresa_nome', `%${empresa_nome.trim()}%`)
        .select('id');

      if (errDelete) {
        console.error('⚠️ [exclusoes] Erro ao remover leads:', errDelete.message);
      }

      const totalRemovidos = removidos?.length || 0;
      console.log(`✅ [exclusoes] "${empresa_nome}" adicionada. ${totalRemovidos} leads removidos.`);

      return res.status(200).json({
        success: true,
        leads_removidos: totalRemovidos,
        mensagem: `"${empresa_nome}" adicionada às exclusões. ${totalRemovidos} lead${totalRemovidos !== 1 ? 's' : ''} removido${totalRemovidos !== 1 ? 's' : ''}.`,
      });
    }

    // ── REMOVER: retira empresa da lista de exclusões ────────────────────────
    if (acao === 'remover') {
      if (!exclusao_id) {
        return res.status(400).json({ error: 'exclusao_id é obrigatório' });
      }

      const { error: errDelete } = await supabase
        .from('prospect_exclusoes')
        .delete()
        .eq('id', exclusao_id);

      if (errDelete) {
        return res.status(500).json({ success: false, error: errDelete.message });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'acao inválida. Use: adicionar | remover' });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
