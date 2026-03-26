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
            excluir_status, usuarios,
        } = req.query as Record<string, string>;

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
                motor, status, criado_em,
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

