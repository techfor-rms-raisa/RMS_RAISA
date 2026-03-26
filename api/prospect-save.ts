/**
 * api/prospect-save.ts
 *
 * Persiste decisores encontrados pelo Dual Engine na tabela prospect_leads
 * Recebe array de prospects + userId e faz upsert em lote
 *
 * Versão: 1.2
 * Data: 26/03/2026
 * v1.1: Log detalhado de erro Supabase + diagnóstico tabela inexistente
 * v1.2: Aceita e persiste reservado_por — leads salvos via Gemini aparecem em Meus Prospects
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Supabase com service_role (backend only — não expor ao frontend)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);


// ─── SANITIZAÇÃO DE DADOS ──────────────────────────────────
// Valores que indicam cargo/status sendo usado como empresa — descartar
const EMPRESA_INVALIDA = new Set([
    'tempo integral', 'autônomo', 'autonomo', 'freelancer',
    'cto', 'coo', 'cfo', 'ceo', 'cio', 'ciso',
    'gerente de ti', 'gerente de projetos', 'gerente de projetos senior',
    'coordenador de ti', 'coordenadora de ti',
    'diretor geral', 'diretor de ti', 'analista de ti',
    'analista de infraestrutura sap business one',
]);

/**
 * Normaliza nome de empresa para Title Case, preservando siglas conhecidas.
 * Retorna null se o valor for inválido (cargo/status no lugar de empresa).
 */
function sanitizarEmpresa(nome: string | null | undefined): string | null {
    if (!nome) return null;
    const trimmed = nome.trim();
    if (!trimmed) return null;

    // Descartar valores que são claramente cargos ou status
    if (EMPRESA_INVALIDA.has(trimmed.toLowerCase())) return null;

    // Descartar strings muito longas (provavelmente lixo do LinkedIn)
    if (trimmed.length > 100) return null;

    // Converter para Title Case
    const titleCase = trimmed
        .toLowerCase()
        .replace(/(?:^|\s|[-\/&(])(\S)/g, (match) => match.toUpperCase());

    return titleCase;
}

/**
 * Normaliza nome de pessoa para Title Case.
 */
function sanitizarNome(nome: string | null | undefined): string {
    if (!nome) return '';
    const trimmed = nome.trim();
    if (!trimmed) return '';
    return trimmed
        .toLowerCase()
        .replace(/(?:^|\s)(\S)/g, (match) => match.toUpperCase());
}

/**
 * Normaliza cargo: trim + Title Case básico.
 */
function sanitizarCargo(cargo: string | null | undefined): string | null {
    if (!cargo) return null;
    const trimmed = cargo.trim();
    if (!trimmed || trimmed.length > 150) return null;
    return trimmed;
}

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
        reservado_por = null,
        filtros_busca = {}
    } = req.body as {
        prospects:      ProspectPayload[];
        user_id:        number;
        reservado_por?: number | null;
        filtros_busca:  Record<string, unknown>;
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
            nome_completo:    sanitizarNome(p.nome_completo),
            primeiro_nome:    p.primeiro_nome  || null,
            ultimo_nome:      p.ultimo_nome    || null,
            cargo:            sanitizarCargo(p.cargo),
            email:            p.email          || null,
            email_status:     p.email_status   || null,
            linkedin_url:     p.linkedin_url   || null,
            foto_url:         p.foto_url       || null,
            empresa_nome:     sanitizarEmpresa(p.empresa_nome),
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
            reservado_por:    reservado_por ?? null,
            reservado_em:     reservado_por ? new Date().toISOString() : null,
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
