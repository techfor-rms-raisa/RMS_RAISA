/**
 * api/prospect-leads.ts
 *
 * Lista leads salvos na tabela prospect_leads
 * Suporta filtros: status, empresa_dominio, empresa_nome, motor, reservado_por
 * Método PATCH: atualizar reservado_por (analista responsável pela prospecção)
 *
 * Versão: 1.1
 * Data: 24/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // ── PATCH: reservar empresa para analista ──────────────────────────────
    if (req.method === 'PATCH') {
        const { ids, reservado_por } = req.body;
        if (!ids?.length || !reservado_por) {
            return res.status(400).json({ error: 'ids e reservado_por são obrigatórios' });
        }
        const { error } = await supabase
            .from('prospect_leads')
            .update({ reservado_por, reservado_em: new Date().toISOString() })
            .in('id', ids);
        if (error) return res.status(500).json({ success: false, error: error.message });
        console.log(`✅ [prospect-leads] ${ids.length} leads reservados para user ${reservado_por}`);
        return res.status(200).json({ success: true });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Use GET ou PATCH.' });
    }

    const { status, empresa, motor, reservado_por } = req.query as Record<string, string>;

    try {
        let query = supabase
            .from('prospect_leads')
            .select(`
                id, nome_completo, cargo, email, email_status,
                linkedin_url, empresa_nome, empresa_dominio,
                empresa_setor, empresa_porte, motor,
                senioridade, departamentos, status,
                criado_em, atualizado_em,
                buscado_por,
                pessoa_id,
                candidato_nome,
                exportado_por,
                exportado_em,
                reservado_por,
                reservado_em,
                app_users!prospect_leads_buscado_por_fkey (
                    nome_usuario
                ),
                reservado_user:app_users!prospect_leads_reservado_por_fkey (
                    nome_usuario
                )
            `)
            .order('criado_em', { ascending: false })
            .limit(500);

        if (status)        query = query.eq('status', status);
        if (motor)         query = query.eq('motor', motor);
        if (reservado_por) query = query.eq('reservado_por', reservado_por);
        if (empresa)       query = query.or(
            `empresa_nome.ilike.%${empresa}%,empresa_dominio.ilike.%${empresa}%`
        );

        const { data, error } = await query;

        if (error) {
            console.error('❌ [prospect-leads] Supabase error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        console.log(`✅ [prospect-leads] ${data?.length} leads retornados`);

        const leads = (data || []).map((row: any) => ({
            ...row,
            gravado_por_nome:    row.app_users?.nome_usuario || null,
            reservado_por_nome:  row.reservado_user?.nome_usuario || null,
            exportado_por_nome:  null,
            app_users:           undefined,
            reservado_user:      undefined,
        }));

        return res.status(200).json({ success: true, leads, total: leads.length });

    } catch (err: any) {
        console.error('❌ [prospect-leads] Erro:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
