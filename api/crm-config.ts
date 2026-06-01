/**
 * api/crm-config.ts — Endpoint de Configurações do CRM
 *
 * Caminho: api/crm-config.ts
 * Versão: 1.0 (01/06/2026)
 *
 * Escopo desta primeira versão:
 *  - Opt-out (CRUD da `email_optout`): listar / adicionar manualmente /
 *    remover (descadastrar erros). Restrito a Administrador + Gestão de R&S.
 *
 *  Tipos de Campanha não estão aqui — o CRUD já existe em api/crm-copys.ts
 *  (actions listar_tipos, criar_tipo, atualizar_tipo, excluir_tipo) e é
 *  consumido pelo hook useTiposCampanha existente.
 *
 *  As outras 3 sub-seções de Configurações (Domínios de Envio, E-mails
 *  Inválidos, Correspondência) dependem do motor de disparo e ficam como
 *  placeholders na tela — não há endpoint até as Fases 5/6/7.
 *
 * RBAC: apenas Administrador e Gestão de R&S podem gerenciar opt-outs.
 *  O `ator_email` é resolvido em `app_users` e o `tipo_usuario` validado.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const PERFIS_GERENCIAM_CONFIG = ['Administrador', 'Gestão de R&S'];

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
      // ── Listar opt-outs (qualquer perfil autorizado pode ler) ──
      if (action === 'listar_optout') {
        const busca = (req.query.busca as string) || '';
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

      return res.status(400).json({ success: false, error: `GET action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // POST
    // ════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = req.body || {};

      // ── Adicionar opt-out manual (Admin / Gestão de R&S) ──
      if (action === 'adicionar_optout') {
        const { email, motivo, ator_email } = body;

        const ator = await resolverAtor(supabase, ator_email);
        if (!ator || !PERFIS_GERENCIAM_CONFIG.includes(ator.tipo_usuario)) {
          return res.status(403).json({
            success: false,
            error: 'Somente Administrador ou Gestão de R&S podem gerenciar opt-outs',
          });
        }

        const emailLimpo = (email || '').toString().trim().toLowerCase();
        if (!emailLimpo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
          return res.status(400).json({ success: false, error: 'E-mail inválido' });
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
      // ── Remover opt-out (Admin / Gestão de R&S) ──
      if (action === 'remover_optout') {
        const id = req.query.id as string;
        const ator_email = req.query.ator_email as string;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        const ator = await resolverAtor(supabase, ator_email);
        if (!ator || !PERFIS_GERENCIAM_CONFIG.includes(ator.tipo_usuario)) {
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
