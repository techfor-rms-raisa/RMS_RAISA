/**
 * VERCEL CRON ENDPOINT: REPRIORIZAÇÃO DINÂMICA
 * Executado a cada 4 horas
 *
 * v2.0 — 15/03/2026
 * cronJobsService movido para api/services/ para compatibilidade com Vercel serverless.
 * Versão anterior importava de src/services/ (frontend) — incompatível com Node.js runtime.
 * TODO: reimplementar com api/services/cronJobsService.ts quando necessário.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = {
    maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verificar autenticação do cron
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || 'default-secret-change-me';

    if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid CRON_SECRET'
        });
    }

    try {
        console.log('[CRON] Repriorização dinâmica iniciada...');

        // Buscar vagas em andamento que precisam de análise
        const { data: vagas, error } = await supabase
            .from('vagas')
            .select(`
                id,
                titulo,
                criado_em,
                vaga_priorizacao (
                    score_prioridade,
                    nivel_prioridade,
                    sla_dias,
                    atualizado_em
                )
            `)
            .in('status_workflow', ['priorizada_e_distribuida', 'em_andamento'])
            .eq('status', 'aberta');

        if (error) {
            console.error('[CRON] Erro ao buscar vagas:', error.message);
            return res.status(500).json({ error: error.message });
        }

        const total = vagas?.length || 0;
        console.log(`[CRON] ${total} vagas em andamento encontradas`);

        // Por ora: registrar execução sem chamar Gemini (evitar timeout)
        // A análise completa via Gemini será reimplementada em api/services/
        return res.status(200).json({
            success:   true,
            message:   `Cron executado — ${total} vagas em andamento (análise IA pendente de migração)`,
            vagas:     total,
            timestamp: new Date().toISOString(),
        });

    } catch (error: any) {
        console.error('[CRON] Erro:', error);
        return res.status(500).json({
            error:     'Internal Server Error',
            message:   error.message,
            timestamp: new Date().toISOString()
        });
    }
}
