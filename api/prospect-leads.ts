/**
 * api/prospect-leads.ts — Listagem e atualização de prospect_leads
 *   (Prospect Engine: "Minhas Empresas" + "Meus Prospects Salvos")
 *
 * Histórico:
 *  - v1.1 (23/06/2026 — Limpeza estrutural da aba "Meus Prospects Salvos"):
 *    Excluir por padrão da listagem origem='leads' os 2 estados que NÃO
 *    são "investigação ativa" — bug visual reportado por Messias após
 *    notar que leads importados via Excel apareciam tanto em "Meus
 *    Prospects Salvos" quanto em "Leads Importados" e "Meus Leads"
 *    simultaneamente (duplicação confusa).
 *
 *    Filtros adicionados (apenas quando NÃO há override explícito):
 *      • motor='importacao_lista' → leads importados via Sub-fase 3.D
 *        têm aba dedicada "Leads Importados" no BaseLeadsPage.
 *      • status IN ('no_crm', 'em_campanha') → leads já promovidos ao
 *        CRM aparecem em "Meus Leads" da Base de Leads — sumir da
 *        listagem do Prospect Engine evita poluição visual.
 *
 *    Override de auditoria preservado: passar `?motor=importacao_lista`
 *    ou `?status=no_crm` explicitamente desliga o filtro padrão
 *    correspondente — admin/desenvolvedor pode investigar histórico
 *    sem perda de capabilidade.
 *
 *    Validação dimensional (Production 23/06/2026):
 *      - 226 leads vão sumir da aba (225 importados + 1 gemini promovido)
 *      - 3104 leads continuam visíveis (investigação ativa legítima)
 *      - 132 dos 133 promovidos JÁ existem em email_leads (zero perda
 *        de informação — só duplicação visual eliminada)
 *
 *    Pareado com (mesma janela de entrega):
 *      • Nenhuma mudança no frontend ProspectSearchPage.tsx — backend
 *        absorve toda a regra (decisão arquitetural: filtros estruturais
 *        devem ficar no backend para consistência entre clientes).
 *
 *  - v1.2 (03/08/2026 — CRUD do prospect na aba "Meus Prospects Salvos"):
 *    Três novas operações PATCH, pareadas com ProspectSearchPage v4.9:
 *
 *      • editar_prospect — corrige nome_completo, cargo, empresa_nome e
 *        email de UM prospect. Motivação: prospects capturados pela
 *        Extension/Gemini chegam com lacunas e o analista precisa arrumar
 *        o cadastro ANTES de promover para email_leads; sem isso o erro
 *        se propaga para o CRM e para o disparo de campanha.
 *
 *      • excluir_logico — marca status='descartado'. NÃO apaga a linha.
 *        Decisão de produto 03/08/2026: o histórico continua auditável e
 *        o registro reaparece no filtro "Ver descartados" do frontend.
 *        (DELETE físico também seria perigoso: email_leads.prospect_lead_id
 *        é ON DELETE SET NULL — perderíamos a rastreabilidade do lead no
 *        CRM — e prospect_revalidacao_log é ON DELETE CASCADE, apagando o
 *        histórico de revalidação junto.)
 *
 *      • restaurar — devolve o prospect descartado para status='novo'.
 *
 *    Regras de integridade aplicadas no backend (nunca só no front):
 *      1. status='no_crm' bloqueia edição e descarte (409). O registro já
 *         existe em email_leads; editar aqui criaria divergência silenciosa
 *         entre prospect_leads e o CRM.
 *      2. Duplicidade de email: prospect_leads NÃO tem UNIQUE em email
 *         (confirmado por introspecção em 03/08/2026), então a checagem é
 *         aplicativa — contra prospect_leads (não descartados) e contra
 *         email_leads. Email repetido quebra a regra "1 lead = 1 campanha
 *         por vez" e gera dois disparos para a mesma pessoa.
 *      3. Troca de email invalida a verificação anterior: email_status,
 *         validado_em, proxima_validacao e status_atualizacao são zerados.
 *         Manter 'valido' de um endereço que não existe mais produziria
 *         bounce e queimaria reputação do domínio de envio.
 *      4. empresa_dominio só é derivado do email quando estava vazio e o
 *         domínio não é de provedor gratuito. Nunca sobrescreve domínio
 *         existente — ele é a chave dos Domínios Turnover.
 *
 *    Auditoria: grava atualizado_em e atualizado_por (coluna adicionada
 *    pela migration 2026-08-03_prospect_leads_atualizado_por.sql).
 *
 *  - v1.0 — versão original (sem cabeçalho de versionamento).
 */

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
            excluir_status, usuarios, kpis,
        } = req.query as Record<string, string>;

        // ── KPI Cards: Total Empresas + Importados Hoje RAISA ────────────
        if (kpis === 'true') {
            // Total de Empresas = leads com motor cv_% (excluindo pesquisas manuais)
            const { count: totalEmpresas, error: e1 } = await supabase
                .from('prospect_leads')
                .select('id', { count: 'exact', head: true })
                .like('motor', 'cv_%');

            if (e1) return res.status(500).json({ success: false, error: e1.message });

            // Importados Hoje RAISA = registros em pessoa_experiencias criados hoje
            const hoje = new Date();
            const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
            const fimDia    = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).toISOString();

            const { count: importadosHoje, error: e2 } = await supabase
                .from('pessoa_experiencias')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', inicioDia)
                .lt('created_at', fimDia);

            if (e2) return res.status(500).json({ success: false, error: e2.message });

            return res.status(200).json({
                success:          true,
                total_empresas:   totalEmpresas ?? 0,
                importados_hoje:  importadosHoje ?? 0,
            });
        }

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
                motor, status, vertical, criado_em,
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

            // 🆕 v1.1 (23/06/2026) — Limpeza estrutural da aba "Meus Prospects Salvos".
            //
            //   FILTRO A — Excluir leads importados via Excel/CSV (Sub-fase 3.D).
            //   Esses leads têm uma aba dedicada ("Leads Importados" no
            //   BaseLeadsPage), onde são revalidados pelo Gemini e auto-promovidos
            //   para email_leads. Aparecer também aqui causa confusão estrutural
            //   (lead "duplicado" em 3 lugares: Leads Importados + Meus Leads +
            //   Meus Prospects Salvos).
            //
            //   Override de auditoria: passar `?motor=importacao_lista`
            //   explicitamente desliga o filtro padrão (admin pode investigar).
            if (!motor) {
                query = query.neq('motor', 'importacao_lista');
            }

            //   FILTRO B — Excluir leads já promovidos ao CRM.
            //   Status 'no_crm' = promovido via botão "Campanhas" do ProspectSearchPage
            //   (action promover_para_campanha em crm-leads).
            //   Status 'em_campanha' = legado (comentário no código frontend menciona
            //   esse valor; preservado por compatibilidade caso ainda exista no banco).
            //   Em ambos os casos, o lead já está em email_leads e visível em
            //   "Meus Leads" da Base de Leads — manter aqui é poluição visual.
            //
            //   Override de auditoria: passar `?status=no_crm` ou `?status=em_campanha`
            //   explicitamente desliga o filtro padrão (admin pode auditar histórico
            //   de promoções).
            if (!status) {
                query = query.neq('status', 'no_crm').neq('status', 'em_campanha');
            }
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

        // ── Setar vertical de negócio (Prospect Engine → botão "+ Vertical") ──
        // 🆕 31/05/2026: atribui a vertical (email_tipos_campanha.nome) ao(s) lead(s).
        // Obrigatória para promover o lead a Campanhas.
        if (body.setar_vertical === true) {
            const vertical = (body.vertical ?? '').toString().trim();
            if (!vertical) {
                return res.status(400).json({ success: false, error: 'vertical obrigatória' });
            }
            // Valida contra as verticais ativas (fonte canônica)
            const { data: tipos, error: errTipos } = await supabase
                .from('email_tipos_campanha')
                .select('nome')
                .eq('ativo', true);
            if (errTipos) return res.status(500).json({ success: false, error: errTipos.message });
            const validas = (tipos || []).map((t: any) => t.nome);
            if (!validas.includes(vertical)) {
                return res.status(400).json({ success: false, error: `Vertical inválida: ${vertical}` });
            }

            const { error } = await supabase
                .from('prospect_leads')
                .update({ vertical })
                .in('id', ids);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true, atualizados: ids.length, vertical });
        }

        // ══════════════════════════════════════════════════════════════
        // 🆕 v1.2 — EDITAR DADOS CADASTRAIS DO PROSPECT (edição individual)
        // ══════════════════════════════════════════════════════════════
        if (body.editar_prospect === true) {
            if (ids.length !== 1) {
                return res.status(400).json({ success: false, error: 'Edição individual: informe exatamente 1 id' });
            }
            const leadId = Number(ids[0]);

            const nome    = (body.nome_completo ?? '').toString().trim();
            const cargo   = (body.cargo        ?? '').toString().trim();
            const empresa = (body.empresa_nome ?? '').toString().trim();
            const email   = (body.email        ?? '').toString().trim().toLowerCase();

            // nome_completo é NOT NULL no schema — barrar antes de chegar no banco
            if (!nome) return res.status(400).json({ success: false, error: 'Nome completo é obrigatório' });
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
                return res.status(400).json({ success: false, error: `Email inválido: ${email}` });
            }

            // Estado atual: necessário para travar lead promovido e para
            // decidir se a verificação de email precisa ser invalidada.
            const { data: atual, error: errAtual } = await supabase
                .from('prospect_leads')
                .select('id, email, email_status, empresa_dominio, status')
                .eq('id', leadId)
                .maybeSingle();

            if (errAtual) return res.status(500).json({ success: false, error: errAtual.message });
            if (!atual)   return res.status(404).json({ success: false, error: 'Prospect não encontrado' });

            if (atual.status === 'no_crm') {
                return res.status(409).json({
                    success: false,
                    error: 'Este prospect já foi promovido ao CRM. Edite os dados pela Base de Leads para não divergir de email_leads.',
                });
            }

            const emailAtual = (atual.email ?? '').toString().toLowerCase();
            const emailMudou = email !== emailAtual;

            // ── Duplicidade de email (checagem aplicativa — não há UNIQUE) ──
            if (email && emailMudou) {
                const { data: dupProspect, error: errDupP } = await supabase
                    .from('prospect_leads')
                    .select('id, nome_completo')
                    .ilike('email', email)
                    .neq('id', leadId)
                    .neq('status', 'descartado')
                    .limit(1);
                if (errDupP) return res.status(500).json({ success: false, error: errDupP.message });
                if (dupProspect && dupProspect.length) {
                    return res.status(409).json({
                        success: false,
                        error: `Este email já está no prospect #${dupProspect[0].id} (${dupProspect[0].nome_completo}).`,
                    });
                }

                const { data: dupCrm, error: errDupC } = await supabase
                    .from('email_leads')
                    .select('id')
                    .ilike('email', email)
                    .limit(1);
                if (errDupC) return res.status(500).json({ success: false, error: errDupC.message });
                if (dupCrm && dupCrm.length) {
                    return res.status(409).json({
                        success: false,
                        error: `Este email já existe na Base de Leads do CRM (lead #${dupCrm[0].id}).`,
                    });
                }
            }

            const update: Record<string, any> = {
                nome_completo: nome,
                cargo:         cargo   || null,
                empresa_nome:  empresa || null,
                email:         email   || null,
                atualizado_em: new Date().toISOString(),
            };
            if (body.atualizado_por) update.atualizado_por = Number(body.atualizado_por);

            if (emailMudou) {
                // A verificação anterior não vale para o novo endereço.
                // Zerar devolve o lead à cascata de revalidação (TTL).
                update.email_status       = null;
                update.validado_em        = null;
                update.proxima_validacao  = null;
                update.status_atualizacao = null;

                // Domínio corporativo aproveitado SÓ quando ainda não havia um.
                if (email && !atual.empresa_dominio) {
                    const dominio = email.split('@')[1];
                    const GRATUITOS = [
                        'gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
                        'yahoo.com', 'yahoo.com.br', 'live.com', 'icloud.com', 'me.com',
                        'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com',
                        'msn.com', 'protonmail.com', 'proton.me', 'aol.com', 'zipmail.com.br',
                    ];
                    if (dominio && !GRATUITOS.includes(dominio)) update.empresa_dominio = dominio;
                }
            }

            const { data: atualizado, error: errUpd } = await supabase
                .from('prospect_leads')
                .update(update)
                .eq('id', leadId)
                .select('id, nome_completo, cargo, empresa_nome, empresa_dominio, email, email_status, status, atualizado_em')
                .maybeSingle();

            if (errUpd) return res.status(500).json({ success: false, error: errUpd.message });

            return res.status(200).json({
                success:         true,
                lead:            atualizado,
                email_revalidar: emailMudou,
            });
        }

        // ══════════════════════════════════════════════════════════════
        // 🆕 v1.2 — EXCLUSÃO LÓGICA / RESTAURAÇÃO
        // Nada é apagado: status='descartado' tira da listagem padrão e
        // preserva a auditoria. 'restaurar' devolve para status='novo'.
        // ══════════════════════════════════════════════════════════════
        if (body.excluir_logico === true || body.restaurar === true) {
            const novoStatus = body.restaurar === true ? 'novo' : 'descartado';

            if (novoStatus === 'descartado') {
                // Trava: prospect já promovido ao CRM não pode ser descartado
                // por aqui — o lead vive em email_leads e o descarte precisa
                // acontecer lá (opt-out / inativação), não no Prospect Engine.
                const { data: promovidos, error: errProm } = await supabase
                    .from('prospect_leads')
                    .select('id')
                    .in('id', ids)
                    .eq('status', 'no_crm');
                if (errProm) return res.status(500).json({ success: false, error: errProm.message });
                if (promovidos && promovidos.length) {
                    return res.status(409).json({
                        success: false,
                        error: `Prospect(s) já promovido(s) ao CRM: #${promovidos.map((p: any) => p.id).join(', #')}. Trate pela Base de Leads.`,
                    });
                }
            }

            const update: Record<string, any> = {
                status:        novoStatus,
                atualizado_em: new Date().toISOString(),
            };
            if (body.atualizado_por) update.atualizado_por = Number(body.atualizado_por);

            const { error: errStat } = await supabase
                .from('prospect_leads')
                .update(update)
                .in('id', ids);

            if (errStat) return res.status(500).json({ success: false, error: errStat.message });
            return res.status(200).json({ success: true, atualizados: ids.length, status: novoStatus });
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

