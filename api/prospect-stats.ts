/**
 * api/prospect-stats.ts
 *
 * Dashboard de Estatísticas do Prospect Engine
 * Retorna métricas agregadas por usuário: pesquisas, perfis, cargos,
 * emails encontrados, exportações e uso de créditos Hunter.io
 *
 * Períodos: diário / mensal / anual
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

export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });

    try {
        // ── 1. Totais por usuário (todos os períodos) ─────────────────────────
        const { data: porUsuario, error: e1 } = await supabase
            .from('prospect_leads')
            .select(`
                buscado_por,
                motor,
                email,
                enriquecido,
                senioridade,
                criado_em,
                app_users!prospect_leads_buscado_por_fkey ( nome_usuario )
            `)
            .order('criado_em', { ascending: false });

        if (e1) throw new Error(e1.message);

        const leads = porUsuario || [];

        // ── 2. Definir janelas de tempo ───────────────────────────────────────
        const agora   = new Date();
        const hoje    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        const mes     = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const ano     = new Date(agora.getFullYear(), 0, 1);

        const isHoje  = (d: string) => new Date(d) >= hoje;
        const isMes   = (d: string) => new Date(d) >= mes;
        const isAno   = (d: string) => new Date(d) >= ano;

        // ── 3. Agregar por usuário ────────────────────────────────────────────
        const usuariosMap = new Map<number, any>();

        leads.forEach((lead: any) => {
            const uid  = lead.buscado_por;
            if (!uid) return;

            if (!usuariosMap.has(uid)) {
                usuariosMap.set(uid, {
                    usuario_id:   uid,
                    nome_usuario: (lead.app_users as any)?.nome_usuario || `Usuário ${uid}`,
                    diario:   { pesquisas: 0, perfis: 0, emails: 0, creditos: 0 },
                    mensal:   { pesquisas: 0, perfis: 0, emails: 0, creditos: 0 },
                    anual:    { pesquisas: 0, perfis: 0, emails: 0, creditos: 0 },
                    total:    { pesquisas: 0, perfis: 0, emails: 0, creditos: 0 },
                    cargos:   {} as Record<string, number>,
                    motores:  {} as Record<string, number>,
                    empresas: new Set<string>(),
                });
            }

            const u = usuariosMap.get(uid);
            const dt = lead.criado_em;
            const temEmail = !!lead.email;
            const creditos = (lead.motor === 'hunter' || lead.motor === 'gemini+hunter' || lead.enriquecido) ? 1 : 0;

            // Contagem por período
            const periodos = [
                { key: 'total',  cond: true         },
                { key: 'anual',  cond: isAno(dt)    },
                { key: 'mensal', cond: isMes(dt)    },
                { key: 'diario', cond: isHoje(dt)   },
            ];

            periodos.forEach(({ key, cond }) => {
                if (!cond) return;
                u[key].perfis++;
                if (temEmail) u[key].emails++;
                u[key].creditos += creditos;
            });

            // Cargos mais prospectados (total)
            const cargo = lead.senioridade || 'Não informado';
            u.cargos[cargo] = (u.cargos[cargo] || 0) + 1;

            // Motor de busca usado
            const motor = lead.motor || 'gemini';
            u.motores[motor] = (u.motores[motor] || 0) + 1;
        });

        // ── 4. Calcular "pesquisas" — grupos por empresa/dia ─────────────────
        // Uma "pesquisa" = conjunto de leads da mesma empresa no mesmo dia
        const pesquisasMap = new Map<string, Set<string>>();
        leads.forEach((lead: any) => {
            const uid  = lead.buscado_por;
            if (!uid) return;
            const dia  = lead.criado_em?.substring(0, 10) || '';
            const emp  = lead.empresa_nome || lead.empresa_dominio || 'desconhecida';
            const key  = `${uid}|${dia}|${emp}`;
            if (!pesquisasMap.has(`${uid}`)) pesquisasMap.set(`${uid}`, new Set());
            pesquisasMap.get(`${uid}`)!.add(key);
        });

        // Adicionar contagem de pesquisas por período
        leads.forEach((lead: any) => {
            const uid = lead.buscado_por;
            if (!uid || !usuariosMap.has(uid)) return;
            const u   = usuariosMap.get(uid);
            const dt  = lead.criado_em;
            const emp = lead.empresa_nome || lead.empresa_dominio || '';
            if (!emp) return;

            // Registrar empresas únicas para contagem de pesquisas
            u.empresas.add(`${lead.criado_em?.substring(0, 10)}|${emp}`);
        });

        // ── 5. Formatar resultado ─────────────────────────────────────────────
        const usuariosArray = Array.from(usuariosMap.values()).map(u => {
            // Top 5 cargos
            const topCargos = Object.entries(u.cargos as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([cargo, count]) => ({ cargo, count }));

            // Distribuição de motores
            const distribuicaoMotores = Object.entries(u.motores as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .map(([motor, count]) => ({ motor, count }));

            // Pesquisas = empresas únicas (proxy de intenção de busca)
            const todasPesquisas = Array.from(u.empresas as Set<string>);
            const pesquisasHoje  = todasPesquisas.filter(p => {
                const dia = p.split('|')[0];
                return new Date(`${dia}T00:00:00`) >= hoje;
            }).length;
            const pesquisasMes   = todasPesquisas.filter(p => {
                const dia = p.split('|')[0];
                return new Date(`${dia}T00:00:00`) >= mes;
            }).length;
            const pesquisasAno   = todasPesquisas.filter(p => {
                const dia = p.split('|')[0];
                return new Date(`${dia}T00:00:00`) >= ano;
            }).length;

            u.diario.pesquisas  = pesquisasHoje;
            u.mensal.pesquisas  = pesquisasMes;
            u.anual.pesquisas   = pesquisasAno;
            u.total.pesquisas   = todasPesquisas.length;

            return {
                usuario_id:    u.usuario_id,
                nome_usuario:  u.nome_usuario,
                diario:        u.diario,
                mensal:        u.mensal,
                anual:         u.anual,
                total:         u.total,
                top_cargos:    topCargos,
                motores:       distribuicaoMotores,
            };
        }).sort((a, b) => b.total.perfis - a.total.perfis);

        // ── 6. Totais globais ─────────────────────────────────────────────────
        const globalTotal = {
            perfis:   leads.length,
            emails:   leads.filter((l: any) => l.email).length,
            creditos: leads.filter((l: any) => l.enriquecido || l.motor === 'hunter').length,
            usuarios: usuariosArray.length,
        };

        const globalDiario = {
            perfis:  leads.filter((l: any) => isHoje(l.criado_em)).length,
            emails:  leads.filter((l: any) => isHoje(l.criado_em) && l.email).length,
        };

        const globalMensal = {
            perfis:  leads.filter((l: any) => isMes(l.criado_em)).length,
            emails:  leads.filter((l: any) => isMes(l.criado_em) && l.email).length,
        };

        // Top cargos global
        const cargosGlobal: Record<string, number> = {};
        leads.forEach((l: any) => {
            const c = l.senioridade || 'Não informado';
            cargosGlobal[c] = (cargosGlobal[c] || 0) + 1;
        });
        const topCargosGlobal = Object.entries(cargosGlobal)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([cargo, count]) => ({ cargo, count }));

        // Motores global
        const motoresGlobal: Record<string, number> = {};
        leads.forEach((l: any) => {
            const m = l.motor || 'gemini';
            motoresGlobal[m] = (motoresGlobal[m] || 0) + 1;
        });
        const distribuicaoMotoresGlobal = Object.entries(motoresGlobal)
            .sort(([, a], [, b]) => b - a)
            .map(([motor, count]) => ({ motor, count }));

        console.log(`✅ [prospect-stats] ${leads.length} leads | ${usuariosArray.length} usuários`);

        return res.status(200).json({
            success:    true,
            global: {
                total:    globalTotal,
                diario:   globalDiario,
                mensal:   globalMensal,
                top_cargos: topCargosGlobal,
                motores:  distribuicaoMotoresGlobal,
            },
            por_usuario: usuariosArray,
            gerado_em:   new Date().toISOString(),
        });

    } catch (err: any) {
        console.error('❌ [prospect-stats] Erro:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}
