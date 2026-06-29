/**
 * api/prospect-dominios-turnover.ts
 *
 * Endpoint REST para a aba "Domínios Turnover" do Prospect Engine v4.8.
 * Implementa as actions: listar, stats, refresh, marcar_trabalhado,
 * desmarcar_trabalhado, exportar_csv.
 *
 * ARQUITETURA:
 *   Frontend → fetch('/api/prospect-dominios-turnover?action=...')
 *           → este endpoint
 *           → chama RPCs em mv_dominios_turnover / prospect_dominios_trabalhados
 *
 * RBAC:
 *   Aceita leituras de qualquer usuário autenticado pelo Supabase service_role
 *   (não há "auth header" do usuário aqui — o frontend já gated por currentUser
 *   em ProspectSearchPage). Para WRITES (marcar/desmarcar/refresh), exige
 *   user_id no body e valida tipo_usuario in
 *   ['Administrador', 'Admin', 'Gestão Comercial', 'SDR'].
 *
 * GOVERNANÇA DE DESMARCAR:
 *   Só o próprio usuário que marcou OU Administrador podem desmarcar
 *   (regra de negócio: evitar que GC desmarcação de outro GC sem rastro).
 *
 * Versão: 1.0
 * Data:   29/06/2026
 * Autor:  Messias + Claude DEV / Claude DBA
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase client (server-side, service_role) ────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
);

// ─── Tipos de papel autorizados para usar a feature ─────────────────────────
const PERFIS_AUTORIZADOS = ['Administrador', 'Admin', 'Gestão Comercial', 'SDR'];
const PERFIS_PODEM_REFRESH = ['Administrador', 'Admin', 'Gestão Comercial', 'SDR'];

// ─── Util: valida user_id e retorna {ok, user?, error?} ─────────────────────
async function validarUsuario(
    user_id: number | string | undefined
): Promise<{ ok: true; user: { id: number; nome_usuario: string; tipo_usuario: string } }
        | { ok: false; status: number; error: string }> {
    if (!user_id) {
        return { ok: false, status: 400, error: 'user_id é obrigatório' };
    }
    const idNum = Number(user_id);
    if (!Number.isFinite(idNum)) {
        return { ok: false, status: 400, error: 'user_id inválido' };
    }

    const { data, error } = await supabase
        .from('app_users')
        .select('id, nome_usuario, tipo_usuario')
        .eq('id', idNum)
        .maybeSingle();

    if (error)     return { ok: false, status: 500, error: error.message };
    if (!data)     return { ok: false, status: 404, error: 'Usuário não encontrado' };

    if (!PERFIS_AUTORIZADOS.includes(data.tipo_usuario)) {
        return { ok: false, status: 403, error: `Perfil "${data.tipo_usuario}" sem acesso a Domínios Turnover` };
    }

    return { ok: true, user: data };
}

// ─── Util: escapa célula CSV (RFC 4180) ─────────────────────────────────────
function csvCell(v: any): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════════════
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
        const action = (req.query.action as string) || (req.body?.action as string);

        if (!action) {
            return res.status(400).json({
                success: false,
                error: 'Parâmetro "action" é obrigatório',
                actions_validas: [
                    'listar', 'stats', 'refresh',
                    'marcar_trabalhado', 'desmarcar_trabalhado',
                    'exportar_csv'
                ],
            });
        }

        // ════════════════════════════════════════════════════════════════════
        // ACTION: listar (paginada com filtros)
        // ════════════════════════════════════════════════════════════════════
        if (action === 'listar') {
            const busca                  = (req.query.busca as string) || '';
            const tier                   = (req.query.tier  as string) || '';
            const apenas_nao_trabalhados = req.query.apenas_nao_trabalhados === 'true';
            const page                   = Math.max(1, Number(req.query.page  || 1));
            const limit                  = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
            const offset                 = (page - 1) * limit;

            // RPC contagem (para paginação)
            const { data: total, error: errCount } = await supabase.rpc(
                'count_dominios_turnover',
                {
                    p_busca:                  busca || null,
                    p_tier:                   tier  || null,
                    p_apenas_nao_trabalhados: apenas_nao_trabalhados,
                }
            );
            if (errCount) {
                console.error('[dominios-turnover] erro count:', errCount);
                return res.status(500).json({ success: false, error: errCount.message });
            }

            // RPC listagem paginada
            const { data: linhas, error: errList } = await supabase.rpc(
                'listar_dominios_turnover',
                {
                    p_busca:                  busca || null,
                    p_tier:                   tier  || null,
                    p_apenas_nao_trabalhados: apenas_nao_trabalhados,
                    p_offset:                 offset,
                    p_limit:                  limit,
                }
            );
            if (errList) {
                console.error('[dominios-turnover] erro listar:', errList);
                return res.status(500).json({ success: false, error: errList.message });
            }

            return res.status(200).json({
                success:     true,
                total:       Number(total) || 0,
                page,
                limit,
                total_pages: Math.ceil((Number(total) || 0) / limit),
                dominios:    linhas || [],
            });
        }

        // ════════════════════════════════════════════════════════════════════
        // ACTION: stats (cards de topo)
        // ════════════════════════════════════════════════════════════════════
        if (action === 'stats') {
            const { data, error } = await supabase.rpc('stats_dominios_turnover');
            if (error) {
                console.error('[dominios-turnover] erro stats:', error);
                return res.status(500).json({ success: false, error: error.message });
            }
            return res.status(200).json({ success: true, stats: data });
        }

        // ════════════════════════════════════════════════════════════════════
        // ACTION: refresh (botão "Atualizar agora")
        // ════════════════════════════════════════════════════════════════════
        if (action === 'refresh') {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Use POST para refresh' });
            }
            const v = await validarUsuario(req.body?.user_id);
            if (!v.ok) return res.status(v.status).json({ success: false, error: v.error });
            if (!PERFIS_PODEM_REFRESH.includes(v.user.tipo_usuario)) {
                return res.status(403).json({ success: false, error: 'Sem permissão para atualizar' });
            }

            const inicio = Date.now();
            const { data, error } = await supabase.rpc('refresh_dominios_turnover');
            if (error) {
                console.error('[dominios-turnover] erro refresh:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

            const duracao_total_ms = Date.now() - inicio;
            console.log(`✅ [dominios-turnover] refresh por ${v.user.nome_usuario} em ${duracao_total_ms}ms`);

            return res.status(200).json({
                success:           true,
                resultado:         data,
                duracao_total_ms,
                executado_por:     v.user.nome_usuario,
            });
        }

        // ════════════════════════════════════════════════════════════════════
        // ACTION: marcar_trabalhado
        // ════════════════════════════════════════════════════════════════════
        if (action === 'marcar_trabalhado') {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Use POST' });
            }
            const v = await validarUsuario(req.body?.user_id);
            if (!v.ok) return res.status(v.status).json({ success: false, error: v.error });

            const empresa_dominio = (req.body?.empresa_dominio || '').toString().trim().toLowerCase();
            const observacao      = req.body?.observacao ? String(req.body.observacao).trim() : null;

            if (!empresa_dominio) {
                return res.status(400).json({ success: false, error: 'empresa_dominio é obrigatório' });
            }

            // Upsert: se já existe marcação, atualiza (permite reassumir)
            const { data, error } = await supabase
                .from('prospect_dominios_trabalhados')
                .upsert({
                    empresa_dominio,
                    marcado_por: v.user.id,
                    marcado_em:  new Date().toISOString(),
                    observacao,
                }, { onConflict: 'empresa_dominio' })
                .select('empresa_dominio, marcado_em')
                .maybeSingle();

            if (error) {
                console.error('[dominios-turnover] erro marcar:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

            return res.status(200).json({
                success:        true,
                empresa_dominio,
                marcado_por:    v.user.nome_usuario,
                marcado_em:     data?.marcado_em,
            });
        }

        // ════════════════════════════════════════════════════════════════════
        // ACTION: desmarcar_trabalhado
        // Regra: só o próprio user que marcou OU Administrador pode desmarcar.
        // ════════════════════════════════════════════════════════════════════
        if (action === 'desmarcar_trabalhado') {
            if (req.method !== 'POST') {
                return res.status(405).json({ success: false, error: 'Use POST' });
            }
            const v = await validarUsuario(req.body?.user_id);
            if (!v.ok) return res.status(v.status).json({ success: false, error: v.error });

            const empresa_dominio = (req.body?.empresa_dominio || '').toString().trim().toLowerCase();
            if (!empresa_dominio) {
                return res.status(400).json({ success: false, error: 'empresa_dominio é obrigatório' });
            }

            // Buscar quem marcou para validar autoria
            const { data: marcacao, error: errBusca } = await supabase
                .from('prospect_dominios_trabalhados')
                .select('marcado_por')
                .eq('empresa_dominio', empresa_dominio)
                .maybeSingle();

            if (errBusca) {
                return res.status(500).json({ success: false, error: errBusca.message });
            }
            if (!marcacao) {
                return res.status(404).json({ success: false, error: 'Domínio não está marcado' });
            }

            const ehAdmin   = v.user.tipo_usuario === 'Administrador';
            const ehAutor   = marcacao.marcado_por === v.user.id;
            if (!ehAdmin && !ehAutor) {
                return res.status(403).json({
                    success: false,
                    error:   'Apenas quem marcou (ou Administrador) pode desmarcar',
                });
            }

            const { error: errDel } = await supabase
                .from('prospect_dominios_trabalhados')
                .delete()
                .eq('empresa_dominio', empresa_dominio);

            if (errDel) {
                return res.status(500).json({ success: false, error: errDel.message });
            }

            console.log(`✅ [dominios-turnover] desmarcou "${empresa_dominio}" por ${v.user.nome_usuario}`);
            return res.status(200).json({ success: true, empresa_dominio });
        }

        // ════════════════════════════════════════════════════════════════════
        // ACTION: exportar_csv (respeita filtros, exporta TUDO sem paginar)
        // ════════════════════════════════════════════════════════════════════
        if (action === 'exportar_csv') {
            const busca                  = (req.query.busca as string) || '';
            const tier                   = (req.query.tier  as string) || '';
            const apenas_nao_trabalhados = req.query.apenas_nao_trabalhados === 'true';

            // Sem paginação — mas com cap de segurança para evitar payload absurdo
            const CAP_LINHAS_CSV = 5000;

            const { data: linhas, error } = await supabase.rpc(
                'listar_dominios_turnover',
                {
                    p_busca:                  busca || null,
                    p_tier:                   tier  || null,
                    p_apenas_nao_trabalhados: apenas_nao_trabalhados,
                    p_offset:                 0,
                    p_limit:                  CAP_LINHAS_CSV,
                }
            );
            if (error) {
                return res.status(500).json({ success: false, error: error.message });
            }

            const headers = [
                'posicao', 'empresa_dominio', 'tier', 'total_leads',
                'pessoas_distintas', 'pct_com_email', 'variantes_nome',
                'primeiro_lead', 'ultimo_lead', 'aliases',
                'trabalhado_por', 'trabalhado_em', 'trabalhado_observacao',
            ];

            const rows = (linhas || []).map((l: any, idx: number) => [
                idx + 1,
                l.empresa_dominio,
                l.tier,
                l.total_leads,
                l.pessoas_distintas,
                l.pct_com_email,
                l.variantes_nome,
                l.primeiro_lead,
                l.ultimo_lead,
                Array.isArray(l.aliases) && l.aliases.length ? l.aliases.join('; ') : '',
                l.trabalhado_por_nome || '',
                l.trabalhado_em       || '',
                l.trabalhado_observacao || '',
            ].map(csvCell).join(','));

            // BOM UTF-8 para Excel reconhecer acentos
            const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');

            const nomeArquivo = `dominios_turnover_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type',        'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
            return res.status(200).send(csv);
        }

        // ════════════════════════════════════════════════════════════════════
        // Action desconhecida
        // ════════════════════════════════════════════════════════════════════
        return res.status(400).json({
            success: false,
            error:   `Action "${action}" desconhecida`,
        });

    } catch (err: any) {
        console.error('❌ [dominios-turnover] erro inesperado:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
