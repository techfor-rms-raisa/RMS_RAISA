/**
 * api/prospect-save.ts
 *
 * Persiste decisores encontrados pelo Dual Engine na tabela prospect_leads
 * Recebe array de prospects + userId e faz upsert em lote
 *
 * Versão: 1.1
 * Data: 04/03/2026
 * v1.1: Log detalhado de erro Supabase + diagnóstico tabela inexistente
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Supabase com service_role (backend only — não expor ao frontend)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── TIPO INPUT ────────────────────────────────────────────
interface ProspectPayload {
    apollo_id?:       string | null;
    snovio_id?:       string | null;
    gemini_id?:       string | null;
    nome_completo:    string;
    primeiro_nome?:   string;
    ultimo_nome?:     string;
    cargo?:           string;
    email?:           string | null;
    email_status?:    string | null;
    linkedin_url?:    string | null;
    foto_url?:        string | null;
    empresa_nome?:    string;
    empresa_dominio?: string;
    empresa_setor?:   string | null;
    empresa_porte?:   number | null;
    empresa_linkedin?: string | null;
    empresa_website?: string | null;
    cidade?:          string | null;
    estado?:          string | null;
    pais?:            string | null;
    senioridade?:     string | null;
    departamentos?:   string[];
    fonte:            'apollo' | 'snovio' | 'ambos' | 'gemini' | 'hunter' | 'gemini+hunter';
    enriquecido?:     boolean;
}

// ─── HANDLER ───────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST.' });
    }

    const {
        prospects,
        user_id,
        filtros_busca = {}
    } = req.body as {
        prospects:     ProspectPayload[];
        user_id:       number;
        filtros_busca: Record<string, unknown>;
    };

    if (!user_id)                    return res.status(400).json({ error: 'user_id obrigatório' });
    if (!Array.isArray(prospects))   return res.status(400).json({ error: 'prospects deve ser array' });
    if (prospects.length === 0)      return res.status(400).json({ error: 'Nenhum prospect enviado' });
    if (prospects.length > 100)      return res.status(400).json({ error: 'Máximo de 100 prospects por vez' });

    try {
        // ── Montar registros para upsert ─────────────────────
        const rows = prospects.map(p => ({
            buscado_por:      user_id,
            motor:            p.fonte || 'gemini',
            fonte_id_apollo:  p.apollo_id  || null,
            fonte_id_snovio:  p.snovio_id  || null,
            fonte_id_gemini:  (p as any).gemini_id || null,
            nome_completo:    (p.nome_completo || '').trim(),
            primeiro_nome:    p.primeiro_nome  || null,
            ultimo_nome:      p.ultimo_nome    || null,
            cargo:            p.cargo          || null,
            email:            p.email          || null,
            email_status:     p.email_status   || null,
            linkedin_url:     p.linkedin_url   || null,
            foto_url:         p.foto_url       || null,
            empresa_nome:     p.empresa_nome   || null,
            empresa_dominio:  p.empresa_dominio|| null,
            empresa_setor:    p.empresa_setor  || null,
            empresa_porte:    (() => {
                const v = p.empresa_porte;
                if (!v) return null;
                if (typeof v === 'number') return v;
                // Snov.io retorna ranges como "1001-5000" → pegar o maior valor
                const nums = String(v).match(/\d+/g);
                return nums ? parseInt(nums[nums.length - 1]) : null;
            })(),
            empresa_linkedin: p.empresa_linkedin || null,
            empresa_website:  p.empresa_website  || null,
            cidade:           p.cidade         || null,
            estado:           p.estado         || null,
            pais:             p.pais           || null,
            senioridade:      p.senioridade    || null,
            departamentos:    p.departamentos  || [],
            filtros_busca:    filtros_busca,
            enriquecido:      p.enriquecido    ?? false,
            status:           'novo',
        }));

        // ── Insert em lote (sem upsert para preservar histórico) ─
        const { data, error } = await supabase
            .from('prospect_leads')
            .insert(rows)
            .select('id, nome_completo, empresa_nome');

        if (error) {
            console.error('❌ [prospect-save] Supabase error:', JSON.stringify({
                code:    error.code,
                message: error.message,
                details: error.details,
                hint:    error.hint,
            }));
            // Diagnóstico de erros comuns
            if (error.code === '42P01') {
                console.error('❌ TABELA prospect_leads NÃO EXISTE — execute o SQL de criação no Supabase');
            } else if (error.code === '23503') {
                console.error('❌ FK violation — buscado_por (user_id) não existe na tabela users');
            } else if (error.code === '42501') {
                console.error('❌ RLS bloqueando insert — execute: ALTER TABLE prospect_leads DISABLE ROW LEVEL SECURITY');
            }
            return res.status(500).json({ success: false, error: error.message, code: error.code });
        }

        console.log(`✅ [prospect-save] ${data?.length} prospects salvos por user_id=${user_id}`);

        return res.status(200).json({
            success: true,
            salvos:  data?.length ?? 0,
            ids:     (data || []).map(r => r.id),
        });

    } catch (err: any) {
        console.error('❌ [prospect-save] Erro:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
