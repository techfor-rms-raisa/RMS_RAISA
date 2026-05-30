/**
 * api/crm-copys.ts — Biblioteca de Copys de Email + Tipos de Campanha
 *
 * Fase 4A — 30/05/2026
 *
 * RBAC:
 *   - Criar copys:        Administrador + Gestão Comercial
 *   - Editar/Deletar:     Criador original OU Administrador
 *   - Ler (listar/detalhe): Todos os perfis
 *
 * Endpoints:
 *   GET    ?action=listar_tipos              — verticais ativas (todos podem ver)
 *   GET    ?action=listar_copys[&tipo_id&busca]  — biblioteca filtrada
 *   GET    ?action=detalhe_copy&id=X
 *   GET    ?action=stats                     — KPIs da biblioteca
 *   POST   action=criar_tipo                 — Admin only
 *   POST   action=criar_copy                 — Admin + Gestão Comercial
 *   PATCH  action=atualizar_tipo             — Admin only
 *   PATCH  action=atualizar_copy             — Criador ou Admin
 *   DELETE action=excluir_copy               — Criador ou Admin (soft-delete + verifica uso)
 *   DELETE action=excluir_tipo               — Admin only (verifica uso)
 *
 * Soft-delete: registros com ativo=false ficam ocultos nas listagens padrão.
 *
 * Caminho: api/crm-copys.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

// ============================================================================
// HELPERS — RBAC
// ============================================================================

const TIPOS_QUE_CRIAM_COPYS = new Set([
  'Administrador',
  'Gestão Comercial',
]);

const TIPOS_QUE_GERENCIAM_TIPOS = new Set([
  'Administrador',
]);

function podeCriarCopy(tipoUsuario: string | undefined): boolean {
  return !!tipoUsuario && TIPOS_QUE_CRIAM_COPYS.has(tipoUsuario);
}

function podeGerenciarTipos(tipoUsuario: string | undefined): boolean {
  return !!tipoUsuario && TIPOS_QUE_GERENCIAM_TIPOS.has(tipoUsuario);
}

/**
 * Verifica se o usuário pode editar/deletar uma copy específica.
 * Regra: criador original OU Administrador.
 */
function podeEditarCopy(
  tipoUsuario: string | undefined,
  usuarioId: number | undefined,
  copyCriadorId: number | null
): boolean {
  if (tipoUsuario === 'Administrador') return true;
  if (!usuarioId || !copyCriadorId) return false;
  return usuarioId === copyCriadorId;
}

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // ════════════════════════════════════════════════
    // GET — listagens e detalhes (todos podem ler)
    // ════════════════════════════════════════════════
    if (req.method === 'GET') {
      const action = String(req.query.action || '');

      // ──── LISTAR TIPOS DE CAMPANHA ────
      if (action === 'listar_tipos') {
        const { data, error } = await supabase
          .from('email_tipos_campanha')
          .select('id, nome, descricao, ativo, criado_por, criado_em')
          .eq('ativo', true)
          .order('nome', { ascending: true });
        if (error) throw error;
        return res.status(200).json({ success: true, tipos: data || [] });
      }

      // ──── LISTAR COPYS (com filtro por tipo e busca) ────
      if (action === 'listar_copys') {
        const { tipo_id, busca, incluir_inativos } = req.query as Record<string, string>;
        let query = supabase
          .from('email_copys')
          .select(`
            id, nome, tipo_id, ordem_sugerida, assunto, descricao,
            ativo, criado_por, criado_por_id, criado_em, atualizado_em,
            email_tipos_campanha:tipo_id (id, nome)
          `)
          .order('tipo_id', { ascending: true })
          .order('ordem_sugerida', { ascending: true, nullsFirst: false });

        if (incluir_inativos !== 'true') {
          query = query.eq('ativo', true);
        }
        if (tipo_id) {
          query = query.eq('tipo_id', Number(tipo_id));
        }
        if (busca) {
          query = query.or(`nome.ilike.%${busca}%,assunto.ilike.%${busca}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ success: true, copys: data || [] });
      }

      // ──── DETALHE DA COPY (inclui corpo completo) ────
      if (action === 'detalhe_copy') {
        const id = Number(req.query.id);
        if (!id) {
          return res.status(400).json({ success: false, error: 'id obrigatório' });
        }
        const { data, error } = await supabase
          .from('email_copys')
          .select(`
            *,
            email_tipos_campanha:tipo_id (id, nome, descricao)
          `)
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return res.status(404).json({ success: false, error: 'Copy não encontrada' });
        }
        return res.status(200).json({ success: true, copy: data });
      }

      // ──── STATS — KPIs da biblioteca ────
      if (action === 'stats') {
        const { count: totalCopys } = await supabase
          .from('email_copys')
          .select('id', { count: 'exact', head: true })
          .eq('ativo', true);

        const { count: totalTipos } = await supabase
          .from('email_tipos_campanha')
          .select('id', { count: 'exact', head: true })
          .eq('ativo', true);

        const { data: porTipo } = await supabase
          .from('email_copys')
          .select('tipo_id, email_tipos_campanha!inner(nome)')
          .eq('ativo', true);

        // Agrupa por tipo
        const distribuicao: Record<string, number> = {};
        (porTipo || []).forEach((c: any) => {
          const nome = c.email_tipos_campanha?.nome || 'Sem tipo';
          distribuicao[nome] = (distribuicao[nome] || 0) + 1;
        });

        return res.status(200).json({
          success: true,
          stats: {
            total_copys: totalCopys ?? 0,
            total_tipos: totalTipos ?? 0,
            distribuicao_por_tipo: distribuicao,
          },
        });
      }

      return res.status(400).json({ success: false, error: `Ação GET desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════
    // POST — criar
    // ════════════════════════════════════════════════
    if (req.method === 'POST') {
      const { action } = req.body as { action?: string };

      // ──── CRIAR TIPO DE CAMPANHA (Admin only) ────
      if (action === 'criar_tipo') {
        const { nome, descricao, criado_por, tipo_usuario } = req.body;
        if (!podeGerenciarTipos(tipo_usuario)) {
          return res.status(403).json({ success: false, error: 'Apenas Administrador pode criar tipos' });
        }
        if (!nome?.trim()) {
          return res.status(400).json({ success: false, error: 'nome obrigatório' });
        }
        const { data, error } = await supabase
          .from('email_tipos_campanha')
          .insert({
            nome: nome.trim(),
            descricao: descricao?.trim() || null,
            criado_por,
          })
          .select()
          .single();
        if (error) {
          if (error.code === '23505') { // unique violation
            return res.status(409).json({ success: false, error: 'Já existe um tipo com este nome' });
          }
          throw error;
        }
        return res.status(201).json({ success: true, tipo: data });
      }

      // ──── CRIAR COPY (Admin + Gestão Comercial) ────
      if (action === 'criar_copy') {
        const {
          nome, tipo_id, ordem_sugerida, assunto, corpo_html, descricao,
          criado_por, criado_por_id, tipo_usuario,
        } = req.body;

        if (!podeCriarCopy(tipo_usuario)) {
          return res.status(403).json({
            success: false,
            error: 'Apenas Administrador e Gestão Comercial podem criar copys',
          });
        }
        if (!nome?.trim() || !tipo_id || !assunto?.trim() || !corpo_html?.trim()) {
          return res.status(400).json({
            success: false,
            error: 'nome, tipo_id, assunto e corpo_html são obrigatórios',
          });
        }

        const { data, error } = await supabase
          .from('email_copys')
          .insert({
            nome: nome.trim(),
            tipo_id: Number(tipo_id),
            ordem_sugerida: ordem_sugerida ?? null,
            assunto: assunto.trim(),
            corpo_html,
            descricao: descricao?.trim() || null,
            criado_por,
            criado_por_id: criado_por_id ?? null,
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json({ success: true, copy: data });
      }

      return res.status(400).json({ success: false, error: `Ação POST desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════
    // PATCH — atualizar
    // ════════════════════════════════════════════════
    if (req.method === 'PATCH') {
      const { action } = req.body as { action?: string };

      // ──── ATUALIZAR TIPO (Admin only) ────
      if (action === 'atualizar_tipo') {
        const { id, nome, descricao, ativo, tipo_usuario } = req.body;
        if (!podeGerenciarTipos(tipo_usuario)) {
          return res.status(403).json({ success: false, error: 'Apenas Administrador pode editar tipos' });
        }
        if (!id) {
          return res.status(400).json({ success: false, error: 'id obrigatório' });
        }
        const updates: any = {};
        if (typeof nome === 'string') updates.nome = nome.trim();
        if (typeof descricao === 'string') updates.descricao = descricao.trim() || null;
        if (typeof ativo === 'boolean') updates.ativo = ativo;

        const { data, error } = await supabase
          .from('email_tipos_campanha')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ success: true, tipo: data });
      }

      // ──── ATUALIZAR COPY (criador ou Admin) ────
      if (action === 'atualizar_copy') {
        const {
          id, nome, tipo_id, ordem_sugerida, assunto, corpo_html, descricao,
          tipo_usuario, usuario_id, atualizado_por,
        } = req.body;

        if (!id) {
          return res.status(400).json({ success: false, error: 'id obrigatório' });
        }

        // Buscar copy para verificar ownership
        const { data: copyAtual, error: errBusca } = await supabase
          .from('email_copys')
          .select('id, criado_por_id, ativo')
          .eq('id', id)
          .maybeSingle();
        if (errBusca) throw errBusca;
        if (!copyAtual) {
          return res.status(404).json({ success: false, error: 'Copy não encontrada' });
        }

        if (!podeEditarCopy(tipo_usuario, usuario_id, copyAtual.criado_por_id)) {
          return res.status(403).json({
            success: false,
            error: 'Apenas o criador da copy ou Administrador podem editá-la',
          });
        }

        const updates: any = { atualizado_por };
        if (typeof nome === 'string')           updates.nome = nome.trim();
        if (typeof tipo_id === 'number')        updates.tipo_id = tipo_id;
        if (ordem_sugerida !== undefined)       updates.ordem_sugerida = ordem_sugerida;
        if (typeof assunto === 'string')        updates.assunto = assunto.trim();
        if (typeof corpo_html === 'string')     updates.corpo_html = corpo_html;
        if (typeof descricao === 'string')      updates.descricao = descricao.trim() || null;

        const { data, error } = await supabase
          .from('email_copys')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ success: true, copy: data });
      }

      return res.status(400).json({ success: false, error: `Ação PATCH desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════
    // DELETE — soft-delete com proteção
    // ════════════════════════════════════════════════
    if (req.method === 'DELETE') {
      const action = String(req.query.action || '');

      // ──── EXCLUIR COPY (soft) ────
      if (action === 'excluir_copy') {
        const id = Number(req.query.id);
        const usuario_id = req.query.usuario_id ? Number(req.query.usuario_id) : undefined;
        const tipo_usuario = String(req.query.tipo_usuario || '');

        if (!id) {
          return res.status(400).json({ success: false, error: 'id obrigatório' });
        }

        // 1. Buscar copy
        const { data: copy, error: errCopy } = await supabase
          .from('email_copys')
          .select('id, criado_por_id, nome')
          .eq('id', id)
          .maybeSingle();
        if (errCopy) throw errCopy;
        if (!copy) {
          return res.status(404).json({ success: false, error: 'Copy não encontrada' });
        }

        // 2. RBAC — criador ou Admin
        if (!podeEditarCopy(tipo_usuario, usuario_id, copy.criado_por_id)) {
          return res.status(403).json({
            success: false,
            error: 'Apenas o criador da copy ou Administrador podem excluí-la',
          });
        }

        // 3. PROTEÇÃO — verificar se está em uso em campanha ativa/agendada/pausada
        const { data: stepsEmUso, error: errSteps } = await supabase
          .from('email_campanha_steps')
          .select(`
            id,
            campanha_id,
            email_campanhas!inner (id, nome, status)
          `)
          .eq('copy_id', id);

        if (errSteps) throw errSteps;

        const campanhasBloqueantes = (stepsEmUso || []).filter((s: any) => {
          const status = s.email_campanhas?.status;
          return ['ativa', 'agendada', 'pausada'].includes(status);
        });

        if (campanhasBloqueantes.length > 0) {
          const nomes = [...new Set(campanhasBloqueantes.map((s: any) => s.email_campanhas?.nome))];
          return res.status(409).json({
            success: false,
            error: `Esta copy está em uso em ${campanhasBloqueantes.length} step(s) de campanha(s) ativa/agendada/pausada e não pode ser excluída`,
            campanhas: nomes,
          });
        }

        // 4. Soft-delete
        const { error: errUpdate } = await supabase
          .from('email_copys')
          .update({ ativo: false })
          .eq('id', id);
        if (errUpdate) throw errUpdate;

        console.log(`✅ [crm-copys] Copy "${copy.nome}" (id ${id}) soft-deletada por usuario_id=${usuario_id}`);
        return res.status(200).json({ success: true, mensagem: 'Copy desativada com sucesso' });
      }

      // ──── EXCLUIR TIPO (Admin only) ────
      if (action === 'excluir_tipo') {
        const id = Number(req.query.id);
        const tipo_usuario = String(req.query.tipo_usuario || '');

        if (!podeGerenciarTipos(tipo_usuario)) {
          return res.status(403).json({ success: false, error: 'Apenas Administrador pode excluir tipos' });
        }
        if (!id) {
          return res.status(400).json({ success: false, error: 'id obrigatório' });
        }

        // Verificar se há copys vinculadas
        const { count } = await supabase
          .from('email_copys')
          .select('id', { count: 'exact', head: true })
          .eq('tipo_id', id)
          .eq('ativo', true);

        if (count && count > 0) {
          return res.status(409).json({
            success: false,
            error: `Não é possível excluir este tipo: existem ${count} copy(s) ativa(s) vinculada(s)`,
          });
        }

        // Soft-delete do tipo
        const { error } = await supabase
          .from('email_tipos_campanha')
          .update({ ativo: false })
          .eq('id', id);
        if (error) throw error;

        return res.status(200).json({ success: true, mensagem: 'Tipo desativado com sucesso' });
      }

      return res.status(400).json({ success: false, error: `Ação DELETE desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (err: any) {
    console.error('❌ [crm-copys] Erro:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
