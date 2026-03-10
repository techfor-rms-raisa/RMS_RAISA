/**
 * api/prospect-leads.ts
 *
 * Lista leads salvos na tabela prospect_leads
 * Suporta filtros: status, empresa_dominio, empresa_nome
 *
 * Versão: 1.0
 * Data: 04/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Use GET.' });
    }

    const { status, empresa } = req.query as Record<string, string>;

    try {
        let query = supabase
            .from('prospect_leads')
            .select(`
                id, nome_completo, cargo, email, email_status,
                linkedin_url, empresa_nome, empresa_dominio,
                empresa_setor, empresa_porte, motor,
                senioridade, departamentos, status,
                criado_em, atualizado_em
            `)
            .order('criado_em', { ascending: false })
            .limit(500);

        if (status)  query = query.eq('status', status);
        if (empresa) query = query.or(
            `empresa_nome.ilike.%${empresa}%,empresa_dominio.ilike.%${empresa}%`
        );

        const { data, error } = await query;

        if (error) {
            console.error('❌ [prospect-leads] Supabase error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        console.log(`✅ [prospect-leads] ${data?.length} leads retornados`);
        return res.status(200).json({ success: true, leads: data || [], total: data?.length ?? 0 });

    } catch (err: any) {
        console.error('❌ [prospect-leads] Erro:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
