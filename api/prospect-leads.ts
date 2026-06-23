/**
 * api/prospect-leads.ts — Listagem e atualização de prospect_leads
 *   (Prospect Engine: "Minhas Empresas" + "Meus Prospects Salvos")
 *
 * Histórico:
 *  - v1.1 (23/06/2026 — Limpeza estrutural da aba "Meus Prospects Salvos"):
 *    Excluir por padrão da listagem origem='leads' os 2 estados que NÃO
 *    são "investigação ativa" — bug visual reportado por Messias após
 *    notar que leads importados via Excel apareciam tanto em "Meus
 *    Prospects Salvos" quanto em "Leads Importados" e "Meus Leads"
 *    simultaneamente (duplicação confusa).
 *
 *    Filtros adicionados (apenas quando NÃO há override explícito):
 *      • motor='importacao_lista' → leads importados via Sub-fase 3.D
 *        têm aba dedicada "Leads Importados" no BaseLeadsPage.
 *      • status IN ('no_crm', 'em_campanha') → leads já promovidos ao
 *        CRM aparecem em "Meus Leads" da Base de Leads — sumir da
 *        listagem do Prospect Engine evita poluição visual.
 *
 *    Override de auditoria preservado: passar `?motor=importacao_lista`
 *    ou `?status=no_crm` explicitamente desliga o filtro padrão
 *    correspondente — admin/desenvolvedor pode investigar histórico
 *    sem perda de capabilidade.
 *
 *    Validação dimensional (Production 23/06/2026):
 *      - 226 leads vão sumir da aba (225 importados + 1 gemini promovido)
 *      - 3104 leads continuam visíveis (investigação ativa legítima)
 *      - 132 dos 133 promovidos JÁ existem em email_leads (zero perda
 *        de informação — só duplicação visual eliminada)
 *
 *    Pareado com (mesma janela de entrega):
 *      • Nenhuma mudança no frontend ProspectSearchPage.tsx — backend
 *        absorve toda a regra (decisão arquitetural: filtros estruturais
 *        devem ficar no backend para consistência entre clientes).
 *
 *  - v1.0 — versão original (sem cabeçalho de versionamento).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ============================================================
    // GET — listar leads / usuários
    // ============================================================
    if (req.method === 'GET') {
        const {
            status, empresa, motor, origem, reservado_por,
            excluir_status, usuarios, kpis,
        } = req.query as Record<string, string>;

        // ── KPI Cards: Total Empresas + Importados Hoje RAISA ────────────
        if (kpis === 'true') {
            // Total de Empresas = leads com motor cv_% (excluindo pesquisas manuais)
            const { count: totalEmpresas, error: e1 } = await supabase
                .from('prospect_leads')
                .select('id', { count: 'exact', head: true })
                .like('motor', 'cv_%');

            if (e1) return res.status(500).json({ success: false, error: e1.message });

            // Importados Hoje RAISA = registros em pessoa_experiencias criados hoje
            const hoje = new Date();
            const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
            const fimDia    = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).toISOString();

            const { count: importadosHoje, error: e2 } = await supabase
                .from('pessoa_experiencias')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', inicioDia)
                .lt('created_at', fimDia);

            if (e2) return res.status(500).json({ success: false, error: e2.message });

            return res.status(200).json({
                success:          true,
                total_empresas:   totalEmpresas ?? 0,
                importados_hoje:  importadosHoje ?? 0,
            });
        }

        // Subquery de usuários para dropdown de redistribuição
        if (usuarios === 'true') {
            const { data, error } = await supabase
                .from('app_users')
                .select('id, nome_usuario, tipo_usuario')
                .in('tipo_usuario', ['Administrador', 'Gestão Comercial', 'SDR'])
                .order('nome_usuario');
            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true, usuarios: data });
        }

        let query = supabase
            .from('prospect_leads')
            .select(`
                id, nome_completo, cargo, email, email_status,
                empresa_nome, empresa_dominio, linkedin_url,
                departamentos, cidade, estado,
                motor, status, vertical, criado_em,
                reservado_por, reservado_em,
                exportado_por, exportado_em,
                buscado_por, fonte_id_gemini,
                reservado_por_user:app_users!prospect_leads_reservado_por_fkey(id, nome_usuario),
                buscado_por_user:app_users!prospect_leads_buscado_por_fkey(id, nome_usuario),
                exportado_por_user:app_users!prospect_leads_exportado_por_fkey(id, nome_usuario)
            `)
            .order('criado_em', { ascending: false })
            .limit(500);

        // Filtros de origem: 'empresas' = CV Extract; 'leads' = pesquisa manual
        if (origem === 'empresas') {
            query = query.like('motor', 'cv_%');
        } else if (origem === 'leads') {
            query = query.not('motor', 'like', 'cv_%');

            // 🆕 v1.1 (23/06/2026) — Limpeza estrutural da aba "Meus Prospects Salvos".
            //
            //   FILTRO A — Excluir leads importados via Excel/CSV (Sub-fase 3.D).
            //   Esses leads têm uma aba dedicada ("Leads Importados" no
            //   BaseLeadsPage), onde são revalidados pelo Gemini e auto-promovidos
            //   para email_leads. Aparecer também aqui causa confusão estrutural
            //   (lead "duplicado" em 3 lugares: Leads Importados + Meus Leads +
            //   Meus Prospects Salvos).
            //
            //   Override de auditoria: passar `?motor=importacao_lista`
            //   explicitamente desliga o filtro padrão (admin pode investigar).
            if (!motor) {
                query = query.neq('motor', 'importacao_lista');
            }

            //   FILTRO B — Excluir leads já promovidos ao CRM.
            //   Status 'no_crm' = promovido via botão "Campanhas" do ProspectSearchPage
            //   (action promover_para_campanha em crm-leads).
            //   Status 'em_campanha' = legado (comentário no código frontend menciona
            //   esse valor; preservado por compatibilidade caso ainda exista no banco).
            //   Em ambos os casos, o lead já está em email_leads e visível em
            //   "Meus Leads" da Base de Leads — manter aqui é poluição visual.
            //
            //   Override de auditoria: passar `?status=no_crm` ou `?status=em_campanha`
            //   explicitamente desliga o filtro padrão (admin pode auditar histórico
            //   de promoções).
            if (!status) {
                query = query.neq('status', 'no_crm').neq('status', 'em_campanha');
            }
        }

        if (status)          query = query.eq('status', status);
        if (empresa)         query = query.ilike('empresa_nome', `%${empresa}%`);
        if (motor)           query = query.eq('motor', motor);
        if (reservado_por)   query = query.eq('reservado_por', Number(reservado_por));
        if (excluir_status)  query = query.neq('status', excluir_status);

        const { data, error } = await query;
        if (error) return res.status(500).json({ success: false, error: error.message });

        // Normalizar joins para campos planos esperados pelo frontend
        const leads = (data || []).map((l: any) => ({
            ...l,
            reservado_por_nome:  l.reservado_por_user?.nome_usuario  ?? null,
            buscado_por_nome:    l.buscado_por_user?.nome_usuario     ?? null,
            exportado_por_nome:  l.exportado_por_user?.nome_usuario   ?? null,
        }));

        return res.status(200).json({ success: true, leads });
    }

    // ============================================================
    // PATCH — atualizar campos em lote (reserva, exportado, domínio, redistribuição)
    // ============================================================
    if (req.method === 'PATCH') {
        const body = req.body as Record<string, any>;
        const ids: number[] = body.ids ?? [];

        if (!ids.length) return res.status(400).json({ success: false, error: 'ids obrigatório' });

        // ── Marcar exportado em lote ──────────────────────────────────────
        if (body.marcar_exportado === true) {
            const { exportado_por } = body;
            if (!exportado_por) return res.status(400).json({ success: false, error: 'exportado_por obrigatório' });

            const { error } = await supabase
                .from('prospect_leads')
                .update({
                    exportado_por: exportado_por,
                    exportado_em:  new Date().toISOString(),
                    status:        'exportado',
                })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true, atualizados: ids.length });
        }

        // ── Setar vertical de negócio (Prospect Engine → botão "+ Vertical") ──
        // 🆕 31/05/2026: atribui a vertical (email_tipos_campanha.nome) ao(s) lead(s).
        // Obrigatória para promover o lead a Campanhas.
        if (body.setar_vertical === true) {
            const vertical = (body.vertical ?? '').toString().trim();
            if (!vertical) {
                return res.status(400).json({ success: false, error: 'vertical obrigatória' });
            }
            // Valida contra as verticais ativas (fonte canônica)
            const { data: tipos, error: errTipos } = await supabase
                .from('email_tipos_campanha')
                .select('nome')
                .eq('ativo', true);
            if (errTipos) return res.status(500).json({ success: false, error: errTipos.message });
            const validas = (tipos || []).map((t: any) => t.nome);
            if (!validas.includes(vertical)) {
                return res.status(400).json({ success: false, error: `Vertical inválida: ${vertical}` });
            }

            const { error } = await supabase
                .from('prospect_leads')
                .update({ vertical })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true, atualizados: ids.length, vertical });
        }

        // ── Reservar empresa (atribuir analista) ─────────────────────────
        if ('reservado_por' in body && !body.redistribuir) {
            const { error } = await supabase
                .from('prospect_leads')
                .update({
                    reservado_por: body.reservado_por,
                    reservado_em:  body.reservado_por ? new Date().toISOString() : null,
                })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true });
        }

        // ── Redistribuir empresa para outro analista ─────────────────────
        if (body.redistribuir === true) {
            const { error } = await supabase
                .from('prospect_leads')
                .update({
                    reservado_por: body.reservado_por,
                    reservado_em:  new Date().toISOString(),
                })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true });
        }

        // ── Atualizar domínio da empresa ─────────────────────────────────
        if (body.empresa_dominio !== undefined) {
            const { error } = await supabase
                .from('prospect_leads')
                .update({ empresa_dominio: body.empresa_dominio })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true });
        }

        // ── Atualizar status individualmente ─────────────────────────────
        if (body.status !== undefined) {
            const { error } = await supabase
                .from('prospect_leads')
                .update({ status: body.status })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'Nenhuma operação PATCH reconhecida' });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
}

