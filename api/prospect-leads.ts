/**
 * api/prospect-leads.ts
 *
 * Lista leads salvos na tabela prospect_leads
 * Suporta filtros: status, empresa_dominio, empresa_nome, motor, reservado_por
 * Método PATCH: atualizar reservado_por (analista responsável pela prospecção)
 *
 * Versão: 1.2
 * Data: 26/03/2026
 * v1.2: Filtro origem=leads (Gemini/Hunter/Extension) vs origem=empresas (CV Extract)
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

    // ── PATCH: reservar / redistribuir / liberar / atualizar campo ────────────
    if (req.method === 'PATCH') {
        const { ids, reservado_por, redistribuir, empresa_dominio } = req.body;

        if (!ids?.length) {
            return res.status(400).json({ error: 'ids é obrigatório' });
        }

        // Modo: atualizar empresa_dominio (resolução de domínio via IA)
        if (empresa_dominio !== undefined) {
            const { error } = await supabase
                .from('prospect_leads')
                .update({ empresa_dominio: empresa_dominio || null })
                .in('id', ids);
            if (error) return res.status(500).json({ success: false, error: error.message });
            console.log(`✅ [prospect-leads] ${ids.length} leads com domínio atualizado: ${empresa_dominio}`);
            return res.status(200).json({ success: true });
        }

        // Modo: reservar / redistribuir / liberar
        if (reservado_por === undefined) {
            return res.status(400).json({ error: 'reservado_por ou empresa_dominio são obrigatórios' });
        }

        const updatePayload: Record<string, any> = {
            reservado_por: reservado_por ?? null,
            reservado_em:  reservado_por ? new Date().toISOString() : null,
        };

        const { error } = await supabase
            .from('prospect_leads')
            .update(updatePayload)
            .in('id', ids);

        if (error) return res.status(500).json({ success: false, error: error.message });

        const acao = reservado_por === null
            ? `${ids.length} leads LIBERADOS`
            : redistribuir
                ? `${ids.length} leads REDISTRIBUÍDOS para user ${reservado_por}`
                : `${ids.length} leads RESERVADOS para user ${reservado_por}`;
        console.log(`✅ [prospect-leads] ${acao}`);
        return res.status(200).json({ success: true });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Use GET ou PATCH.' });
    }

    const { status, empresa, motor, reservado_por, usuarios, origem } = req.query as Record<string, string>;

    // ── GET ?usuarios=true — lista de usuários para dropdown de redistribuição ──
    if (usuarios === 'true') {
        const { data: users, error: usersError } = await supabase
            .from('app_users')
            .select('id, nome_usuario, tipo_usuario')
            .in('tipo_usuario', ['Administrador', 'Gestão Comercial', 'SDR'])
            .order('nome_usuario');
        if (usersError) return res.status(500).json({ success: false, error: usersError.message });
        return res.status(200).json({ success: true, usuarios: users || [] });
    }

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

        // origem=leads  → apenas Gemini/Hunter/Extension (leads pesquisados)
        // origem=empresas → apenas CV Extract (empresas para prospectar)
        const MOTORES_LEADS    = ['gemini', 'gemini+hunter', 'hunter', 'extension'];
        const MOTORES_EMPRESAS = ['cv_alocacao', 'cv_infra', 'cv_ia_ml', 'cv_sap'];

        if (origem === 'leads') {
            query = query.in('motor', MOTORES_LEADS);
        } else if (origem === 'empresas') {
            query = query.in('motor', MOTORES_EMPRESAS);
        }

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
