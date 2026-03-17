/**
 * api/talent-finder-stats.ts
 *
 * Retorna todos os logs do Talent Finder para o dashboard.
 * O frontend filtra por período (hoje/semana/mês/total).
 *
 * Versão: 1.0
 * Data: 17/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });

    try {
        const { data, error } = await supabase
            .from('talent_finder_logs')
            .select('*')
            .order('criado_em', { ascending: false })
            .limit(500);

        if (error) throw new Error(error.message);

        console.log(`✅ [talent-finder-stats] ${data?.length} logs retornados`);

        return res.status(200).json({
            success:   true,
            logs:      data || [],
            total:     data?.length ?? 0,
            gerado_em: new Date().toISOString(),
        });

    } catch (err: any) {
        console.error('❌ [talent-finder-stats] Erro:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}
