/**
 * api/crm-leads.ts — CRUD Empresas + Leads (CRM de Campanhas)
 *
 * Histórico:
 *  - v1.0 (13/05/2026): criado como api/campaign-leads.ts
 *  - v1.1 (30/05/2026): adicionada action 'promover_para_campanha' +
 *    UPDATE de prospect_leads.status='no_crm' em importar_prospects
 *  - v1.2 (30/05/2026 - Fase 1E): renomeado para api/crm-leads.ts
 *    (nome semanticamente correto — CRUD do CRM, não de campanhas).
 *
 * Endpoints:
 * GET  ?action=listar_empresas[&busca=X&setor=X&page=1&limit=20]
 * GET  ?action=detalhe_empresa&id=X
 * GET  ?action=listar_leads[&empresa_id=X&funil=X&busca=X&page=1&limit=30]
 * GET  ?action=detalhe_lead&id=X  (inclui timeline + campanhas)
 * GET  ?action=buscar_global&q=X  (busca por nome empresa/domínio/email lead)
 * GET  ?action=stats                (contadores gerais)
 * POST action=criar_empresa
 * POST action=criar_lead
 * POST action=importar_prospects    (importa de prospect_leads → email_leads/email_empresas)
 * POST action=promover_para_campanha (1 prospect → email_leads; marca status='no_crm')
 * PATCH action=atualizar_empresa
 * PATCH action=atualizar_lead
 * PATCH action=mudar_funil          (muda status funil + registra histórico)
 *
 * Caminho: api/crm-leads.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 🔧 31/05/2026 (Fase 4C-fix): action sempre da query (useCrmApi); fallback body p/ compat.
    const action = (req.query.action ?? req.body?.action) as string;

    if (!action) {
      return res.status(400).json({ success: false, error: 'Parâmetro "action" é obrigatório' });
    }

    // ════════════════════════════════════════════
    // GET ACTIONS
    // ════════════════════════════════════════════
    if (req.method === 'GET') {

      // ── LISTAR EMPRESAS ──────────────────────────
      if (action === 'listar_empresas') {
        const { busca, setor, porte, page = '1', limit = '20' } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabase
          .from('email_empresas')
          .select('*', { count: 'exact' })
          .order('nome', { ascending: true })
          .range(offset, offset + parseInt(limit) - 1);

        if (busca) {
          // Busca por nome OU domínio
          query = query.or(`nome.ilike.%${busca}%,dominio.ilike.%${busca}%`);
        }
        if (setor) query = query.eq('setor', setor);
        if (porte) query = query.eq('porte', porte);

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({
          success: true,
          empresas: data || [],
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit)),
        });
      }

      // ── DETALHE EMPRESA ──────────────────────────
      if (action === 'detalhe_empresa') {
        const { id } = req.query as Record<string, string>;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        const { data: empresa, error: errEmpresa } = await supabase
          .from('email_empresas')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (errEmpresa) throw errEmpresa;
        if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

        // Buscar leads desta empresa
        const { data: leads, error: errLeads } = await supabase
          .from('email_leads')
          .select('*')
          .eq('empresa_id', id)
          .order('nome', { ascending: true });

        if (errLeads) throw errLeads;

        // Buscar campanhas que atingiram leads desta empresa
        const leadIds = (leads || []).map(l => l.id);
        let campanhas: any[] = [];

        if (leadIds.length > 0) {
          const { data: vinculosCampanha } = await supabase
            .from('email_lead_campanhas')
            .select('campanha_id, lead_id, status, step_atual, email_campanhas(id, nome, status, tipo, total_enviados, total_abertos, taxa_abertura)')
            .in('lead_id', leadIds);

          campanhas = vinculosCampanha || [];
        }

        return res.status(200).json({
          success: true,
          empresa,
          leads: leads || [],
          campanhas,
          total_leads: leads?.length || 0,
        });
      }

      // ── LISTAR LEADS ─────────────────────────────
      if (action === 'listar_leads') {
        const { empresa_id, funil, busca, tags, page = '1', limit = '30' } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabase
          .from('email_leads')
          .select('*, email_empresas(id, nome, dominio, setor)', { count: 'exact' })
          .order('criado_em', { ascending: false })
          .range(offset, offset + parseInt(limit) - 1);

        if (empresa_id) query = query.eq('empresa_id', empresa_id);
        if (funil) query = query.eq('funil_status', funil);
        if (busca) {
          query = query.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%,cargo.ilike.%${busca}%`);
        }
        if (tags) {
          const tagsArray = tags.split(',').map(t => t.trim());
          query = query.overlaps('tags', tagsArray);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({
          success: true,
          leads: data || [],
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil((count || 0) / parseInt(limit)),
        });
      }

      // ── DETALHE LEAD (com timeline + campanhas) ──
      if (action === 'detalhe_lead') {
        const { id } = req.query as Record<string, string>;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // Lead + empresa
        const { data: lead, error: errLead } = await supabase
          .from('email_leads')
          .select('*, email_empresas(id, nome, dominio, setor, porte, cidade, uf)')
          .eq('id', id)
          .maybeSingle();

        if (errLead) throw errLead;
        if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

        // Timeline (últimos 100 eventos)
        const { data: historico } = await supabase
          .from('email_lead_historico')
          .select('*, email_campanhas(nome)')
          .eq('lead_id', id)
          .order('criado_em', { ascending: false })
          .limit(100);

        // Campanhas vinculadas
        const { data: campanhas } = await supabase
          .from('email_lead_campanhas')
          .select('*, email_campanhas(id, nome, status, tipo, criado_em)')
          .eq('lead_id', id)
          .order('adicionado_em', { ascending: false });

        // Respostas
        const { data: respostas } = await supabase
          .from('email_respostas')
          .select('*, email_campanhas(nome)')
          .eq('lead_id', id)
          .order('recebido_em', { ascending: false })
          .limit(20);

        // Emails enviados
        const { data: emailsEnviados } = await supabase
          .from('email_fila')
          .select('*, email_campanhas(nome), email_campanha_steps(ordem, assunto)')
          .eq('lead_id', id)
          .order('agendado_para', { ascending: false })
          .limit(50);

        return res.status(200).json({
          success: true,
          lead,
          historico: historico || [],
          campanhas: campanhas || [],
          respostas: respostas || [],
          emails_enviados: emailsEnviados || [],
        });
      }

      // ── BUSCA GLOBAL ─────────────────────────────
      if (action === 'buscar_global') {
        const { q } = req.query as Record<string, string>;
        if (!q || q.length < 2) {
          return res.status(400).json({ success: false, error: 'Busca precisa de ao menos 2 caracteres' });
        }

        // Buscar empresas por nome ou domínio
        const { data: empresas } = await supabase
          .from('email_empresas')
          .select('id, nome, dominio, setor, total_leads')
          .or(`nome.ilike.%${q}%,dominio.ilike.%${q}%`)
          .order('nome')
          .limit(10);

        // Buscar leads por nome, email ou cargo
        const { data: leads } = await supabase
          .from('email_leads')
          .select('id, nome, email, cargo, funil_status, email_empresas(id, nome)')
          .or(`nome.ilike.%${q}%,email.ilike.%${q}%`)
          .order('nome')
          .limit(10);

        return res.status(200).json({
          success: true,
          empresas: empresas || [],
          leads: leads || [],
          total: (empresas?.length || 0) + (leads?.length || 0),
        });
      }

      // ── STATS (contadores gerais) ────────────────
      if (action === 'stats') {
        const { count: totalEmpresas } = await supabase
          .from('email_empresas').select('id', { count: 'exact', head: true });

        const { count: totalLeads } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'lead');

        const { count: totalProspects } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'prospect');

        const { count: totalClientes } = await supabase
          .from('email_leads').select('id', { count: 'exact', head: true })
          .eq('funil_status', 'cliente');

        const { count: totalOptOut } = await supabase
          .from('email_optout').select('id', { count: 'exact', head: true });

        const { count: totalCampanhas } = await supabase
          .from('email_campanhas').select('id', { count: 'exact', head: true });

        return res.status(200).json({
          success: true,
          stats: {
            total_empresas: totalEmpresas || 0,
            total_leads: totalLeads || 0,
            total_prospects: totalProspects || 0,
            total_clientes: totalClientes || 0,
            total_optout: totalOptOut || 0,
            total_campanhas: totalCampanhas || 0,
          }
        });
      }

      return res.status(400).json({ success: false, error: `Ação GET desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════
    // POST ACTIONS
    // ════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = req.body;

      // ── CRIAR EMPRESA ────────────────────────────
      if (action === 'criar_empresa') {
        const { nome, dominio, cnpj, setor, porte, cidade, uf, website, linkedin_url,
                telefone_comercial, observacoes, origem, criado_por } = body;

        if (!nome || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome e criado_por são obrigatórios' });
        }

        // Verificar duplicata por domínio
        if (dominio) {
          const { data: existente } = await supabase
            .from('email_empresas')
            .select('id, nome')
            .eq('dominio', dominio.toLowerCase().trim())
            .maybeSingle();

          if (existente) {
            return res.status(409).json({
              success: false,
              error: `Empresa com domínio "${dominio}" já existe: ${existente.nome} (ID: ${existente.id})`,
              empresa_existente: existente,
            });
          }
        }

        const { data, error } = await supabase
          .from('email_empresas')
          .insert({
            nome: nome.trim(),
            dominio: dominio?.toLowerCase().trim() || null,
            cnpj: cnpj?.trim() || null,
            setor: setor || null,
            porte: porte || null,
            cidade: cidade?.trim() || null,
            uf: uf?.trim() || null,
            website: website?.trim() || null,
            linkedin_url: linkedin_url?.trim() || null,
            telefone_comercial: telefone_comercial?.trim() || null,
            observacoes: observacoes || null,
            origem: origem || 'manual',
            criado_por,
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Empresa criada: ${nome} (ID: ${data.id})`);
        return res.status(201).json({ success: true, empresa: data });
      }

      // ── CRIAR LEAD ───────────────────────────────
      if (action === 'criar_lead') {
        const { empresa_id, nome, email, cargo, telefone, linkedin_url,
                tags, notas, origem, criado_por, prospect_lead_id } = body;

        if (!nome || !email || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome, email e criado_por são obrigatórios' });
        }

        // Verificar duplicata por email
        const { data: existente } = await supabase
          .from('email_leads')
          .select('id, nome, email')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();

        if (existente) {
          return res.status(409).json({
            success: false,
            error: `Lead com email "${email}" já existe: ${existente.nome} (ID: ${existente.id})`,
            lead_existente: existente,
          });
        }

        // Verificar se email está no opt-out global
        const { data: optout } = await supabase
          .from('email_optout')
          .select('id')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();

        const { data, error } = await supabase
          .from('email_leads')
          .insert({
            empresa_id: empresa_id || null,
            prospect_lead_id: prospect_lead_id || null,
            nome: nome.trim(),
            email: email.toLowerCase().trim(),
            cargo: cargo?.trim() || null,
            telefone: telefone?.trim() || null,
            linkedin_url: linkedin_url?.trim() || null,
            tags: tags || null,
            notas: notas || null,
            origem: origem || 'manual',
            criado_por,
            opt_out: !!optout,
            opt_out_em: optout ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (error) throw error;

        // Atualizar counter cache da empresa
        if (empresa_id) {
          await atualizarCountersEmpresa(empresa_id);
        }

        // Registrar no histórico
        await supabase.from('email_lead_historico').insert({
          lead_id: data.id,
          tipo: 'lead_criado',
          descricao: `Lead criado via ${origem || 'manual'}`,
          criado_por,
        });

        console.log(`✅ [crm-leads] Lead criado: ${nome} <${email}> (ID: ${data.id})${optout ? ' ⚠️ OPT-OUT' : ''}`);
        return res.status(201).json({ success: true, lead: data, opt_out_warning: !!optout });
      }

      // ── IMPORTAR DE PROSPECT_LEADS ───────────────
      if (action === 'importar_prospects') {
        const { prospect_ids, criado_por } = body;

        if (!prospect_ids?.length || !criado_por) {
          return res.status(400).json({ success: false, error: 'prospect_ids[] e criado_por são obrigatórios' });
        }

        // Buscar prospects selecionados
        const { data: prospects, error: errProspects } = await supabase
          .from('prospect_leads')
          .select('*')
          .in('id', prospect_ids);

        if (errProspects) throw errProspects;
        if (!prospects?.length) {
          return res.status(404).json({ success: false, error: 'Nenhum prospect encontrado' });
        }

        const resultados = { importados: 0, duplicados: 0, sem_email: 0, empresas_criadas: 0, erros: [] as string[] };

        for (const p of prospects) {
          // Pular se não tem email
          if (!p.email) {
            resultados.sem_email++;
            continue;
          }

          // Verificar se lead já existe
          const { data: leadExistente } = await supabase
            .from('email_leads')
            .select('id')
            .eq('email', p.email.toLowerCase().trim())
            .maybeSingle();

          if (leadExistente) {
            resultados.duplicados++;
            continue;
          }

          // Criar ou encontrar empresa pelo domínio
          let empresaId: number | null = null;
          if (p.empresa_dominio || p.empresa_nome) {
            empresaId = await findOrCreateEmpresa({
              nome: p.empresa_nome || p.empresa_dominio || 'Sem nome',
              dominio: p.empresa_dominio || null,
              setor: p.empresa_setor || null,
              cidade: p.cidade || null,
              uf: p.estado || null,
              website: p.empresa_website || null,
              linkedin_url: p.empresa_linkedin || null,
              criado_por,
            }, resultados);
          }

          // Criar lead
          const { error: errInsert } = await supabase
            .from('email_leads')
            .insert({
              empresa_id: empresaId,
              prospect_lead_id: p.id,
              nome: p.nome_completo?.trim() || 'Sem nome',
              email: p.email.toLowerCase().trim(),
              cargo: p.cargo || null,
              linkedin_url: p.linkedin_url || null,
              origem: 'prospect_engine',
              criado_por,
            });

          if (errInsert) {
            resultados.erros.push(`${p.nome_completo}: ${errInsert.message}`);
          } else {
            resultados.importados++;
            // 🆕 30/05/2026 — Marcar prospect como 'no_crm' para sumir do Prospect Engine
            await supabase
              .from('prospect_leads')
              .update({ status: 'no_crm' })
              .eq('id', p.id);
          }
        }

        // Atualizar counters de todas as empresas afetadas
        const { data: empresasAfetadas } = await supabase
          .from('email_empresas')
          .select('id');

        for (const emp of empresasAfetadas || []) {
          await atualizarCountersEmpresa(emp.id);
        }

        console.log(`✅ [crm-leads] Importação: ${resultados.importados} importados, ${resultados.duplicados} duplicados, ${resultados.sem_email} sem email, ${resultados.empresas_criadas} empresas criadas`);
        return res.status(200).json({ success: true, resultados });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 🆕 PROMOVER 1 PROSPECT → CRM (30/05/2026)
      // ─────────────────────────────────────────────────────────────────────
      // Action chamada pelo botão "Campanhas" da aba "Meus Leads Salvos" do
      // ProspectSearchPage. Promove um único prospect_lead para email_leads
      // (CRM) e marca o prospect com status='no_crm' para sumir da lista.
      //
      // Diferenças de 'importar_prospects':
      //  - Recebe 1 prospect_id (não lista)
      //  - Resposta tem o lead criado completo (para uso imediato no frontend)
      //  - Trata caso "já existe no CRM" como sucesso (sincroniza status)
      // ─────────────────────────────────────────────────────────────────────
      if (action === 'promover_para_campanha') {
        const { prospect_id, criado_por } = body;

        if (!prospect_id || !criado_por) {
          return res.status(400).json({
            success: false,
            error: 'prospect_id e criado_por são obrigatórios',
          });
        }

        // 1. Buscar o prospect
        const { data: prospect, error: errProspect } = await supabase
          .from('prospect_leads')
          .select('*')
          .eq('id', prospect_id)
          .maybeSingle();

        if (errProspect) throw errProspect;
        if (!prospect) {
          return res.status(404).json({ success: false, error: 'Prospect não encontrado' });
        }

        // 2. Validar email (sem email não pode virar lead de campanha)
        if (!prospect.email) {
          return res.status(400).json({
            success: false,
            error: 'Prospect sem email — resolva o email antes de promover',
          });
        }

        // 2b. 🆕 31/05/2026 — Validar vertical (obrigatória para campanhas)
        if (!prospect.vertical || !String(prospect.vertical).trim()) {
          return res.status(400).json({
            success: false,
            error: 'Setar uma Vertical de Negócios para este Lead',
          });
        }

        const emailNormalizado = prospect.email.toLowerCase().trim();

        // 3. Se já existe em email_leads, apenas sincronizar status no prospect
        const { data: leadExistente } = await supabase
          .from('email_leads')
          .select('id, nome')
          .eq('email', emailNormalizado)
          .maybeSingle();

        if (leadExistente) {
          await supabase
            .from('prospect_leads')
            .update({ status: 'no_crm' })
            .eq('id', prospect_id);

          console.log(`ℹ️ [crm-leads] Lead "${prospect.nome_completo}" já estava no CRM (ID ${leadExistente.id}) — Prospect marcado como 'no_crm'`);
          return res.status(200).json({
            success: true,
            lead: leadExistente,
            ja_existia: true,
            mensagem: 'Lead já estava no CRM. Prospect Engine atualizado.',
          });
        }

        // 4. Criar ou encontrar empresa pelo domínio
        let empresaId: number | null = null;
        const empresasResult = { empresas_criadas: 0 };
        if (prospect.empresa_dominio || prospect.empresa_nome) {
          empresaId = await findOrCreateEmpresa({
            nome: prospect.empresa_nome || prospect.empresa_dominio || 'Sem nome',
            dominio: prospect.empresa_dominio || null,
            setor: prospect.empresa_setor || null,
            cidade: prospect.cidade || null,
            uf: prospect.estado || null,
            website: prospect.empresa_website || null,
            linkedin_url: prospect.empresa_linkedin || null,
            criado_por,
          }, empresasResult);
        }

        // 5. Criar email_lead no CRM
        const { data: novoLead, error: errInsertLead } = await supabase
          .from('email_leads')
          .insert({
            empresa_id: empresaId,
            prospect_lead_id: prospect.id,
            nome: prospect.nome_completo?.trim() || 'Sem nome',
            email: emailNormalizado,
            cargo: prospect.cargo || null,
            linkedin_url: prospect.linkedin_url || null,
            vertical: String(prospect.vertical).trim(),
            origem: 'prospect_engine',
            criado_por,
          })
          .select()
          .single();

        if (errInsertLead) {
          return res.status(500).json({
            success: false,
            error: `Erro ao criar lead no CRM: ${errInsertLead.message}`,
          });
        }

        // 6. Marcar prospect como 'no_crm'
        const { error: errUpdate } = await supabase
          .from('prospect_leads')
          .update({ status: 'no_crm' })
          .eq('id', prospect_id);

        if (errUpdate) {
          console.error(`⚠️ [crm-leads] Lead criado mas falhou ao atualizar prospect ${prospect_id}: ${errUpdate.message}`);
          // Não bloqueia — o lead já está no CRM, apenas o prospect ficará visível ainda
        }

        // 7. Atualizar counter cache da empresa
        if (empresaId) {
          await atualizarCountersEmpresa(empresaId);
        }

        // 8. Registrar no histórico do lead
        await supabase.from('email_lead_historico').insert({
          lead_id: novoLead.id,
          tipo: 'lead_criado',
          descricao: `Lead promovido do Prospect Engine (prospect ID ${prospect.id})`,
          criado_por,
        });

        console.log(`✅ [crm-leads] Lead promovido: ${prospect.nome_completo} <${emailNormalizado}> → CRM ID ${novoLead.id}`);
        return res.status(201).json({
          success: true,
          lead: novoLead,
          empresa_id: empresaId,
          empresa_criada: empresasResult.empresas_criadas > 0,
        });
      }

      return res.status(400).json({ success: false, error: `Ação POST desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════
    // PATCH ACTIONS
    // ════════════════════════════════════════════
    if (req.method === 'PATCH') {
      const body = req.body;

      // ── ATUALIZAR EMPRESA ────────────────────────
      if (action === 'atualizar_empresa') {
        const { id, ...campos } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // Remover campos que não devem ser atualizados
        delete campos.action;
        delete campos.criado_em;
        delete campos.criado_por;
        campos.atualizado_em = new Date().toISOString();

        if (campos.dominio) campos.dominio = campos.dominio.toLowerCase().trim();

        const { data, error } = await supabase
          .from('email_empresas')
          .update(campos)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Empresa atualizada: ID ${id}`);
        return res.status(200).json({ success: true, empresa: data });
      }

      // ── ATUALIZAR LEAD ───────────────────────────
      if (action === 'atualizar_lead') {
        const { id, ...campos } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        delete campos.action;
        delete campos.criado_em;
        delete campos.criado_por;
        campos.atualizado_em = new Date().toISOString();

        if (campos.email) campos.email = campos.email.toLowerCase().trim();

        const { data, error } = await supabase
          .from('email_leads')
          .update(campos)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Lead atualizado: ID ${id}`);
        return res.status(200).json({ success: true, lead: data });
      }

      // ── MUDAR FUNIL ──────────────────────────────
      if (action === 'mudar_funil') {
        const { id, novo_status, motivo_perda, criado_por } = body;
        if (!id || !novo_status || !criado_por) {
          return res.status(400).json({ success: false, error: 'id, novo_status e criado_por são obrigatórios' });
        }

        const statusValidos = ['lead', 'prospect', 'cliente', 'inativo', 'perdido'];
        if (!statusValidos.includes(novo_status)) {
          return res.status(400).json({ success: false, error: `Status inválido. Use: ${statusValidos.join(', ')}` });
        }

        // Buscar status atual
        const { data: leadAtual } = await supabase
          .from('email_leads')
          .select('funil_status, empresa_id')
          .eq('id', id)
          .single();

        if (!leadAtual) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

        const statusAnterior = leadAtual.funil_status;

        // Atualizar funil
        const updateData: any = {
          funil_status: novo_status,
          funil_atualizado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        };
        if (novo_status === 'perdido' && motivo_perda) {
          updateData.motivo_perda = motivo_perda;
        }

        const { data, error } = await supabase
          .from('email_leads')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        // Registrar mudança no histórico
        await supabase.from('email_lead_historico').insert({
          lead_id: id,
          tipo: 'funil_mudou',
          descricao: `Funil alterado: ${statusAnterior} → ${novo_status}${motivo_perda ? ` (${motivo_perda})` : ''}`,
          dados: { de: statusAnterior, para: novo_status, motivo: motivo_perda || null },
          criado_por,
        });

        // Atualizar counters da empresa
        if (leadAtual.empresa_id) {
          await atualizarCountersEmpresa(leadAtual.empresa_id);
        }

        console.log(`✅ [crm-leads] Funil: Lead ${id} — ${statusAnterior} → ${novo_status}`);
        return res.status(200).json({ success: true, lead: data, transicao: { de: statusAnterior, para: novo_status } });
      }

      return res.status(400).json({ success: false, error: `Ação PATCH desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (err: any) {
    console.error('❌ [crm-leads] Erro:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

/**
 * Encontra empresa pelo domínio ou cria nova
 */
async function findOrCreateEmpresa(
  dados: { nome: string; dominio: string | null; setor: string | null; cidade: string | null; uf: string | null; website: string | null; linkedin_url: string | null; criado_por: string },
  resultados: { empresas_criadas: number }
): Promise<number | null> {
  // Tentar encontrar por domínio
  if (dados.dominio) {
    const { data: existente } = await supabase
      .from('email_empresas')
      .select('id')
      .eq('dominio', dados.dominio.toLowerCase().trim())
      .maybeSingle();

    if (existente) return existente.id;
  }

  // Tentar encontrar por nome (case insensitive)
  const { data: porNome } = await supabase
    .from('email_empresas')
    .select('id')
    .ilike('nome', dados.nome.trim())
    .maybeSingle();

  if (porNome) return porNome.id;

  // Criar nova empresa
  const { data: nova, error } = await supabase
    .from('email_empresas')
    .insert({
      nome: dados.nome.trim(),
      dominio: dados.dominio?.toLowerCase().trim() || null,
      setor: dados.setor || null,
      cidade: dados.cidade || null,
      uf: dados.uf || null,
      website: dados.website || null,
      linkedin_url: dados.linkedin_url || null,
      origem: 'prospect_engine',
      criado_por: dados.criado_por,
    })
    .select('id')
    .single();

  if (error) {
    // Se deu duplicata de domínio (race condition), buscar novamente
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('email_empresas')
        .select('id')
        .eq('dominio', dados.dominio?.toLowerCase().trim() || '')
        .maybeSingle();
      return retry?.id || null;
    }
    console.error(`⚠️ [crm-leads] Erro ao criar empresa ${dados.nome}:`, error.message);
    return null;
  }

  resultados.empresas_criadas++;
  return nova.id;
}

/**
 * Atualiza os counters cache de leads/prospects/clientes na empresa
 */
async function atualizarCountersEmpresa(empresaId: number): Promise<void> {
  const { count: leads } = await supabase
    .from('email_leads').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('funil_status', 'lead');

  const { count: prospects } = await supabase
    .from('email_leads').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('funil_status', 'prospect');

  const { count: clientes } = await supabase
    .from('email_leads').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('funil_status', 'cliente');

  await supabase
    .from('email_empresas')
    .update({
      total_leads: leads || 0,
      total_prospects: prospects || 0,
      total_clientes: clientes || 0,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', empresaId);
}
