/**
 * api/crm-config.ts — Endpoint de Configurações do CRM
 *
 * Caminho: api/crm-config.ts
 * Versão: 1.1 (13/06/2026)
 *
 * v1.1 (13/06/2026 — Fase 1 da reorganização Prospect/Lead):
 *
 *   RBAC contextual nas actions de Opt-Out (movido das Configurações
 *   para a Base de Leads, agora acessado também por GC/SDR):
 *
 *   • `listar_optout` — passou a aceitar (e EXIGIR) `ator_email` na query:
 *      - Admin/GR&S       → retorna TODOS os opt-outs (comportamento legado).
 *      - GC/SDR           → retorna APENAS opt-outs cujos e-mails
 *                           pertencem a leads com `reservado_por = ator.id`
 *                           (JOIN via lista de emails do ator).
 *      - Outros perfis    → HTTP 403.
 *      - ator_email ausente → HTTP 400.
 *
 *   • `adicionar_optout` — ampliada a lista de perfis autorizados:
 *      - Admin/GR&S       → adiciona qualquer e-mail (comportamento legado).
 *      - GC/SDR           → adiciona APENAS se o e-mail pertence a um
 *                           lead reservado a si (validação por ownership
 *                           antes do INSERT).
 *      - Outros perfis    → HTTP 403.
 *
 *   • `remover_optout` — INALTERADO. Continua restrito a Admin/GR&S
 *      (decisão LGPD: opt-out é irreversível no fluxo normal; remoção
 *      é um descadastro-de-erro que precisa de aprovação da gestão).
 *
 * v1.0 (01/06/2026):
 *   - Opt-out (CRUD da `email_optout`): listar / adicionar manualmente /
 *     remover (descadastrar erros). Restrito a Administrador + Gestão de R&S.
 *
 *  Tipos de Campanha não estão aqui — o CRUD já existe em api/crm-copys.ts
 *  (actions listar_tipos, criar_tipo, atualizar_tipo, excluir_tipo) e é
 *  consumido pelo hook useTiposCampanha existente.
 *
 *  As outras 2 sub-seções de Configurações (Domínios de Envio — Fase 5)
 *  dependem do motor de disparo e ficam como placeholder na tela —
 *  não há endpoint até a Fase 5.
 *
 *  Tabelas tocadas:
 *   - email_optout (read/insert/delete)
 *   - email_leads (read-only — JOIN para ownership)
 *   - app_users (read-only — resolver ator)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

// 🆕 v1.1 (13/06/2026) — RBAC contextual:
//   • PERFIS_GERENCIAM_TODOS: enxergam/agem sobre toda a base.
//   • PERFIS_GERENCIAM_PROPRIOS: enxergam/agem só sobre seus leads.
//   • PERFIS_PODEM_REMOVER: continuam restritos a Admin/GR&S (LGPD).
const PERFIS_GERENCIAM_TODOS = ['Administrador', 'Gestão de R&S'];
const PERFIS_GERENCIAM_PROPRIOS = ['Gestão Comercial', 'SDR'];
const PERFIS_PODEM_REMOVER = ['Administrador', 'Gestão de R&S'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action as string) || (req.body?.action as string) || '';

  try {
    // ════════════════════════════════════════════════════════════
    // GET
    // ════════════════════════════════════════════════════════════
    if (req.method === 'GET') {
      // ── Listar opt-outs (RBAC contextual — v1.1) ──
      //
      // 🆕 v1.1 (13/06/2026): exige `ator_email` e aplica filtro
      //    conforme perfil:
      //      • Admin/GR&S → tudo
      //      • GC/SDR     → apenas opt-outs de emails dos seus leads
      if (action === 'listar_optout') {
        const busca = (req.query.busca as string) || '';
        const ator_email = (req.query.ator_email as string) || '';

        if (!ator_email) {
          return res
            .status(400)
            .json({ success: false, error: 'ator_email é obrigatório' });
        }

        const ator = await resolverAtor(supabase, ator_email);
        if (!ator) {
          return res
            .status(403)
            .json({ success: false, error: 'Usuário não identificado' });
        }

        const tipo = ator.tipo_usuario;
        const podeVerTodos = PERFIS_GERENCIAM_TODOS.includes(tipo);
        const escopoProprio = PERFIS_GERENCIAM_PROPRIOS.includes(tipo);

        if (!podeVerTodos && !escopoProprio) {
          return res.status(403).json({
            success: false,
            error: `Perfil "${tipo}" não tem acesso à lista de opt-outs.`,
          });
        }

        // ── Caminho A: Admin/GR&S — lista global ────────────────
        if (podeVerTodos) {
          let q = supabase
            .from('email_optout')
            .select('*')
            .order('id', { ascending: false })
            .limit(500);

          if (busca) q = q.ilike('email', `%${busca}%`);

          const { data, error } = await q;
          if (error) return res.status(500).json({ success: false, error: error.message });
          return res.status(200).json({ success: true, optouts: data || [] });
        }

        // ── Caminho B: GC/SDR — escopo próprio ──────────────────
        //
        // Buscamos os e-mails dos leads do ator e filtramos a tabela
        // email_optout por essa lista. Trade-off conhecido: se o ator
        // tiver muitos milhares de leads, o `.in()` pode ficar lento.
        // Para os volumes operacionais reais (centenas a poucos
        // milhares de leads por GC/SDR), o custo é desprezível.
        const { data: meusLeads, error: errLeads } = await supabase
          .from('email_leads')
          .select('email')
          .eq('reservado_por', ator.id);

        if (errLeads) {
          return res.status(500).json({ success: false, error: errLeads.message });
        }

        const emailsDoAtor = (meusLeads || [])
          .map((l: any) => (l.email || '').toString().toLowerCase().trim())
          .filter(Boolean);

        if (emailsDoAtor.length === 0) {
          // Ator não tem nenhum lead → nenhum opt-out pertinente.
          return res.status(200).json({ success: true, optouts: [] });
        }

        let q = supabase
          .from('email_optout')
          .select('*')
          .in('email', emailsDoAtor)
          .order('id', { ascending: false })
          .limit(500);

        if (busca) q = q.ilike('email', `%${busca}%`);

        const { data, error } = await q;
        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, optouts: data || [] });
      }

      return res.status(400).json({ success: false, error: `GET action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // POST
    // ════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = req.body || {};

      // ── Adicionar opt-out manual (RBAC contextual — v1.1) ──
      //
      // 🆕 v1.1 (13/06/2026):
      //   • Admin/GR&S    → adiciona qualquer e-mail (comportamento legado).
      //   • GC/SDR        → adiciona APENAS se o e-mail pertence a um
      //                     lead com `reservado_por = ator.id`.
      //   • Outros perfis → HTTP 403.
      if (action === 'adicionar_optout') {
        const { email, motivo, ator_email } = body;

        const ator = await resolverAtor(supabase, ator_email);
        if (!ator) {
          return res.status(403).json({
            success: false,
            error: 'Usuário não identificado',
          });
        }

        const tipo = ator.tipo_usuario;
        const podeAdicionarTudo = PERFIS_GERENCIAM_TODOS.includes(tipo);
        const podeAdicionarProprio = PERFIS_GERENCIAM_PROPRIOS.includes(tipo);

        if (!podeAdicionarTudo && !podeAdicionarProprio) {
          return res.status(403).json({
            success: false,
            error: `Perfil "${tipo}" não pode adicionar opt-outs.`,
          });
        }

        const emailLimpo = (email || '').toString().trim().toLowerCase();
        if (!emailLimpo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
          return res.status(400).json({ success: false, error: 'E-mail inválido' });
        }

        // 🆕 v1.1 — Validação de ownership para GC/SDR
        // (Admin/GR&S pula essa verificação).
        if (!podeAdicionarTudo) {
          const { data: leadDoAtor, error: errOwn } = await supabase
            .from('email_leads')
            .select('id, reservado_por')
            .eq('email', emailLimpo)
            .eq('reservado_por', ator.id)
            .limit(1)
            .maybeSingle();

          if (errOwn) {
            return res.status(500).json({ success: false, error: errOwn.message });
          }
          if (!leadDoAtor) {
            return res.status(403).json({
              success: false,
              error:
                'Este e-mail não pertence a um lead reservado a você. ' +
                'Apenas Admin/Gestão de R&S podem adicionar opt-outs de e-mails ' +
                'externos à sua base. Se for um lead seu, verifique se está ' +
                'cadastrado em "Meus Leads" com o e-mail exato.',
            });
          }
        }

        // Insere de forma defensiva — algumas instalações podem não ter as
        // colunas opcionais (motivo/criado_por/criado_em). Tentamos com elas;
        // se falhar por coluna inexistente, refaz só com email.
        const payloadCompleto: any = {
          email: emailLimpo,
          motivo: (motivo || '').toString().trim() || 'Adicionado manualmente',
          criado_por: ator.email_usuario,
        };

        let { data, error } = await supabase
          .from('email_optout')
          .insert(payloadCompleto)
          .select()
          .single();

        if (error && error.code === '42703') {
          // coluna inexistente — refaz só com email
          const retry = await supabase
            .from('email_optout')
            .insert({ email: emailLimpo })
            .select()
            .single();
          data = retry.data as any;
          error = retry.error as any;
        }

        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'E-mail já está em opt-out' });
          }
          return res.status(500).json({ success: false, error: error.message });
        }
        return res.status(201).json({ success: true, optout: data });
      }

      return res.status(400).json({ success: false, error: `POST action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // DELETE
    // ════════════════════════════════════════════════════════════
    if (req.method === 'DELETE') {
      // ── Remover opt-out (Admin / Gestão de R&S apenas — LGPD) ──
      //
      // Mantido restrito (v1.1) — decisão de produto: opt-out é
      // irreversível no fluxo normal; remoção é descadastro-de-erro
      // que precisa de aprovação da gestão.
      if (action === 'remover_optout') {
        const id = req.query.id as string;
        const ator_email = req.query.ator_email as string;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        const ator = await resolverAtor(supabase, ator_email);
        if (!ator || !PERFIS_PODEM_REMOVER.includes(ator.tipo_usuario)) {
          return res.status(403).json({
            success: false,
            error: 'Somente Administrador ou Gestão de R&S podem remover opt-outs',
          });
        }

        const { error } = await supabase.from('email_optout').delete().eq('id', id);
        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, message: 'Opt-out removido' });
      }

      return res.status(400).json({ success: false, error: `DELETE action desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err: any) {
    console.error('[crm-config] Erro:', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro interno' });
  }
}

// ════════════════════════════════════════════════════════════════
// HELPER
// ════════════════════════════════════════════════════════════════

async function resolverAtor(supabase: any, email?: string) {
  if (!email) return null;
  const { data } = await supabase
    .from('app_users')
    .select('id, nome_usuario, email_usuario, tipo_usuario')
    .eq('email_usuario', email)
    .maybeSingle();
  return data ?? null;
}
