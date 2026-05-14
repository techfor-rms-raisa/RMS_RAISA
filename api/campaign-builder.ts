/**
 * campaign-builder.ts — API do Campaign Builder
 * 
 * Caminho: api/campaign-builder.ts
 * 
 * CRUD completo para:
 * - Campanhas (criar, listar, editar, excluir, mudar status)
 * - Steps da sequência (1–5 por campanha)
 * - Vinculação de leads
 * - Assinaturas por usuário
 * - Preview de email com merge de variáveis + assinatura
 * 
 * v1.0 — 14/05/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Supabase client dentro do handler (cold start safe)
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action as string) || (req.body?.action as string) || '';

  try {
    // ════════════════════════════════════════════════════════════
    // GET
    // ════════════════════════════════════════════════════════════
    if (req.method === 'GET') {

      // ── Listar campanhas ────────────────────────────────────
      if (action === 'listar_campanhas') {
        const { status, tipo, busca, page = '1', limit = '20' } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabase
          .from('email_campanhas')
          .select('*', { count: 'exact' })
          .order('criado_em', { ascending: false })
          .range(offset, offset + parseInt(limit) - 1);

        if (status) query = query.eq('status', status);
        if (tipo) query = query.eq('tipo', tipo);
        if (busca) query = query.ilike('nome', `%${busca}%`);

        const { data, count, error } = await query;
        if (error) return res.status(500).json({ success: false, error: error.message });

        return res.status(200).json({ success: true, campanhas: data, total: count });
      }

      // ── Detalhe de uma campanha (com steps e contagem de leads) ─
      if (action === 'detalhe_campanha') {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        const { data: campanha, error: e1 } = await supabase
          .from('email_campanhas')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (e1) return res.status(500).json({ success: false, error: e1.message });
        if (!campanha) return res.status(404).json({ success: false, error: 'Campanha não encontrada' });

        const { data: steps, error: e2 } = await supabase
          .from('email_campanha_steps')
          .select('*')
          .eq('campanha_id', id)
          .order('ordem', { ascending: true });

        if (e2) return res.status(500).json({ success: false, error: e2.message });

        const { count: totalLeads, error: e3 } = await supabase
          .from('email_lead_campanhas')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', id);

        return res.status(200).json({
          success: true,
          campanha,
          steps: steps || [],
          total_leads: totalLeads || 0
        });
      }

      // ── Listar leads vinculados a uma campanha ──────────────
      if (action === 'listar_leads_campanha') {
        const campanha_id = req.query.campanha_id as string;
        if (!campanha_id) return res.status(400).json({ success: false, error: 'campanha_id obrigatório' });

        const { page = '1', limit = '50' } = req.query as Record<string, string>;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { data, count, error } = await supabase
          .from('email_lead_campanhas')
          .select(`
            id, status, step_atual, adicionado_em,
            email_leads!inner(id, nome, email, cargo, empresa_id, funil,
              email_empresas(nome))
          `, { count: 'exact' })
          .eq('campanha_id', campanha_id)
          .order('adicionado_em', { ascending: false })
          .range(offset, offset + parseInt(limit) - 1);

        if (error) return res.status(500).json({ success: false, error: error.message });

        return res.status(200).json({ success: true, leads: data, total: count });
      }

      // ── Leads disponíveis (não vinculados à campanha) ───────
      if (action === 'leads_disponiveis') {
        const campanha_id = req.query.campanha_id as string;
        const busca = req.query.busca as string;
        const funil = req.query.funil as string;
        const limit = req.query.limit as string || '50';

        // IDs já vinculados
        let idsVinculados: number[] = [];
        if (campanha_id) {
          const { data: vinculados } = await supabase
            .from('email_lead_campanhas')
            .select('lead_id')
            .eq('campanha_id', campanha_id);
          idsVinculados = (vinculados || []).map((v: any) => v.lead_id);
        }

        // Leads disponíveis (excluindo opt-out)
        let query = supabase
          .from('email_leads')
          .select(`id, nome, email, cargo, funil, email_empresas(nome)`)
          .not('funil', 'eq', 'perdido')
          .order('nome', { ascending: true })
          .limit(parseInt(limit));

        if (busca) {
          query = query.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%`);
        }
        if (funil) query = query.eq('funil', funil);
        if (idsVinculados.length > 0) {
          query = query.not('id', 'in', `(${idsVinculados.join(',')})`);
        }

        // Excluir opt-outs
        const { data: optouts } = await supabase
          .from('email_optout')
          .select('email');
        const emailsOptout = (optouts || []).map((o: any) => o.email);

        const { data, error } = await query;
        if (error) return res.status(500).json({ success: false, error: error.message });

        // Filtrar opt-outs no app (mais simples que SQL complexo)
        const filtered = (data || []).filter((l: any) => !emailsOptout.includes(l.email));

        return res.status(200).json({ success: true, leads: filtered });
      }

      // ── Assinatura do usuário logado ────────────────────────
      if (action === 'minha_assinatura') {
        const user_email = req.query.user_email as string;
        if (!user_email) return res.status(400).json({ success: false, error: 'user_email obrigatório' });

        const { data, error } = await supabase
          .from('email_assinaturas')
          .select('*')
          .eq('user_email', user_email)
          .maybeSingle();

        if (error) return res.status(500).json({ success: false, error: error.message });

        return res.status(200).json({ success: true, assinatura: data });
      }

      // ── Listar todas as assinaturas ─────────────────────────
      if (action === 'listar_assinaturas') {
        const { data, error } = await supabase
          .from('email_assinaturas')
          .select('*')
          .eq('ativo', true)
          .order('nome_completo', { ascending: true });

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, assinaturas: data });
      }

      // ── Preview de email (corpo + variáveis + assinatura) ───
      if (action === 'preview') {
        const campanha_id = req.query.campanha_id as string;
        const step_ordem = req.query.step_ordem as string || '1';
        const lead_id = req.query.lead_id as string;
        const user_email = req.query.user_email as string;

        if (!campanha_id) return res.status(400).json({ success: false, error: 'campanha_id obrigatório' });

        // Buscar step
        const { data: step } = await supabase
          .from('email_campanha_steps')
          .select('*')
          .eq('campanha_id', campanha_id)
          .eq('ordem', parseInt(step_ordem))
          .maybeSingle();

        if (!step) return res.status(404).json({ success: false, error: 'Step não encontrado' });

        // Buscar lead para merge (opcional — usa placeholder se não informado)
        let nomePreview = '{{name}}';
        if (lead_id) {
          const { data: lead } = await supabase
            .from('email_leads')
            .select('nome')
            .eq('id', lead_id)
            .maybeSingle();
          if (lead?.nome) {
            nomePreview = lead.nome.split(' ')[0]; // Apenas primeiro nome
          }
        }

        // Buscar assinatura
        let assinaturaHtml = '';
        if (user_email) {
          const { data: assinatura } = await supabase
            .from('email_assinaturas')
            .select('*')
            .eq('user_email', user_email)
            .maybeSingle();
          if (assinatura) {
            assinaturaHtml = renderAssinatura(assinatura);
          }
        }

        // Merge: substituir {{name}} no corpo
        const corpoMerged = (step.corpo_html || '').replace(/\{\{name\}\}/gi, nomePreview);

        const emailFinal = `${corpoMerged}\n\n${assinaturaHtml}`;

        return res.status(200).json({
          success: true,
          preview: {
            assunto: step.assunto.replace(/\{\{name\}\}/gi, nomePreview),
            corpo: emailFinal,
            corpo_sem_assinatura: corpoMerged,
            assinatura: assinaturaHtml
          }
        });
      }

      // ── Stats das campanhas (KPIs) ──────────────────────────
      if (action === 'stats') {
        const [
          { count: totalCampanhas },
          { count: ativas },
          { count: rascunhos },
          { count: concluidas }
        ] = await Promise.all([
          supabase.from('email_campanhas').select('id', { count: 'exact', head: true }),
          supabase.from('email_campanhas').select('id', { count: 'exact', head: true }).eq('status', 'ativa'),
          supabase.from('email_campanhas').select('id', { count: 'exact', head: true }).eq('status', 'rascunho'),
          supabase.from('email_campanhas').select('id', { count: 'exact', head: true }).eq('status', 'concluida')
        ]);

        return res.status(200).json({
          success: true,
          stats: {
            total: totalCampanhas || 0,
            ativas: ativas || 0,
            rascunhos: rascunhos || 0,
            concluidas: concluidas || 0
          }
        });
      }

      // ── Listar tipos de campanha existentes (para dropdown) ─
      if (action === 'listar_tipos') {
        const { data, error } = await supabase
          .from('email_campanhas')
          .select('tipo')
          .not('tipo', 'is', null);

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Tipos únicos + fixos padrão
        const tiposPadrao = ['Outsourcing', 'BPO', 'Service Center', 'Help-Desk', 'Corretores', 'Projetos'];
        const tiposExistentes = [...new Set((data || []).map((d: any) => d.tipo).filter(Boolean))];
        const todosOsTipos = [...new Set([...tiposPadrao, ...tiposExistentes])].sort();

        return res.status(200).json({ success: true, tipos: todosOsTipos });
      }

      return res.status(400).json({ success: false, error: `GET action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // POST
    // ════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = req.body || {};

      // ── Criar campanha ──────────────────────────────────────
      if (action === 'criar_campanha') {
        const { nome, tipo, dominio_envio, email_remetente, nome_remetente,
                horario_inicio, horario_fim, criado_por } = body;

        if (!nome || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome e criado_por obrigatórios' });
        }

        const { data, error } = await supabase
          .from('email_campanhas')
          .insert({
            nome,
            tipo: tipo || 'Outsourcing',
            status: 'rascunho',
            dominio_envio: dominio_envio || '',
            email_remetente: email_remetente || '',
            nome_remetente: nome_remetente || '',
            horario_inicio: horario_inicio || '08:00',
            horario_fim: horario_fim || '18:00',
            criado_por
          })
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(201).json({ success: true, campanha: data });
      }

      // ── Criar step ──────────────────────────────────────────
      if (action === 'criar_step') {
        const { campanha_id, ordem, assunto, corpo_html, corpo_texto, delay_dias, condicao } = body;

        if (!campanha_id || !assunto || !corpo_html) {
          return res.status(400).json({ success: false, error: 'campanha_id, assunto e corpo_html obrigatórios' });
        }

        // Verificar limite de 5 steps
        const { count } = await supabase
          .from('email_campanha_steps')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', campanha_id);

        if ((count || 0) >= 5) {
          return res.status(400).json({ success: false, error: 'Máximo de 5 steps por campanha' });
        }

        // Auto-calcular ordem se não informada
        let ordemFinal = ordem;
        if (!ordemFinal) {
          ordemFinal = (count || 0) + 1;
        }

        const { data, error } = await supabase
          .from('email_campanha_steps')
          .insert({
            campanha_id,
            ordem: ordemFinal,
            assunto,
            corpo_html,
            corpo_texto: corpo_texto || '',
            delay_dias: delay_dias || 3,
            condicao: condicao || 'sempre',
            ativo: true
          })
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(201).json({ success: true, step: data });
      }

      // ── Vincular leads em lote ──────────────────────────────
      if (action === 'vincular_leads') {
        const { campanha_id, lead_ids } = body;
        if (!campanha_id || !lead_ids?.length) {
          return res.status(400).json({ success: false, error: 'campanha_id e lead_ids obrigatórios' });
        }

        // Verificar opt-out
        const { data: optouts } = await supabase
          .from('email_optout')
          .select('email');
        const emailsOptout = new Set((optouts || []).map((o: any) => o.email));

        // Buscar emails dos leads
        const { data: leads } = await supabase
          .from('email_leads')
          .select('id, email')
          .in('id', lead_ids);

        // Filtrar opt-outs
        const leadsValidos = (leads || []).filter((l: any) => !emailsOptout.has(l.email));

        if (leadsValidos.length === 0) {
          return res.status(400).json({ success: false, error: 'Todos os leads selecionados estão em opt-out' });
        }

        // Inserir vínculos (ignorar duplicados via ON CONFLICT)
        const registros = leadsValidos.map((l: any) => ({
          lead_id: l.id,
          campanha_id: parseInt(campanha_id),
          status: 'ativa',
          step_atual: 1
        }));

        const { data, error } = await supabase
          .from('email_lead_campanhas')
          .upsert(registros, { onConflict: 'lead_id,campanha_id' })
          .select();

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Atualizar contador total_destinatarios
        const { count: totalDest } = await supabase
          .from('email_lead_campanhas')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', campanha_id);

        await supabase
          .from('email_campanhas')
          .update({ total_destinatarios: totalDest || 0, atualizado_em: new Date().toISOString() })
          .eq('id', campanha_id);

        return res.status(201).json({
          success: true,
          vinculados: data?.length || 0,
          optout_ignorados: lead_ids.length - leadsValidos.length
        });
      }

      // ── Salvar/Atualizar assinatura ─────────────────────────
      if (action === 'salvar_assinatura') {
        const { user_email, nome_completo, cargo, email_assinatura,
                telefone_fixo, telefone_celular, websites, politica_privacidade_url, optout_texto } = body;

        if (!user_email || !nome_completo || !email_assinatura) {
          return res.status(400).json({ success: false, error: 'user_email, nome_completo e email_assinatura obrigatórios' });
        }

        const { data, error } = await supabase
          .from('email_assinaturas')
          .upsert({
            user_email,
            nome_completo,
            cargo: cargo || '',
            email_assinatura,
            telefone_fixo: telefone_fixo || '',
            telefone_celular: telefone_celular || '',
            websites: websites || [],
            politica_privacidade_url: politica_privacidade_url || '',
            optout_texto: optout_texto || 'Caso não queira receber nossos comunicados, responda SAIR',
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'user_email' })
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, assinatura: data });
      }

      return res.status(400).json({ success: false, error: `POST action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // PATCH
    // ════════════════════════════════════════════════════════════
    if (req.method === 'PATCH') {
      const body = req.body || {};

      // ── Atualizar campanha ──────────────────────────────────
      if (action === 'atualizar_campanha') {
        const { id, ...campos } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        // Campos permitidos para update
        const permitidos = ['nome', 'tipo', 'dominio_envio', 'email_remetente',
          'nome_remetente', 'horario_inicio', 'horario_fim', 'inicio_envio', 'fim_envio'];
        const updateData: any = { atualizado_em: new Date().toISOString() };
        for (const key of permitidos) {
          if (campos[key] !== undefined) updateData[key] = campos[key];
        }

        const { data, error } = await supabase
          .from('email_campanhas')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, campanha: data });
      }

      // ── Atualizar step ──────────────────────────────────────
      if (action === 'atualizar_step') {
        const { id, ...campos } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        const permitidos = ['assunto', 'corpo_html', 'corpo_texto', 'delay_dias', 'condicao', 'ativo', 'ordem'];
        const updateData: any = {};
        for (const key of permitidos) {
          if (campos[key] !== undefined) updateData[key] = campos[key];
        }

        const { data, error } = await supabase
          .from('email_campanha_steps')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, step: data });
      }

      // ── Mudar status da campanha ────────────────────────────
      if (action === 'mudar_status') {
        const { id, status } = body;
        if (!id || !status) return res.status(400).json({ success: false, error: 'id e status obrigatórios' });

        const statusValidos = ['rascunho', 'agendada', 'ativa', 'pausada', 'concluida'];
        if (!statusValidos.includes(status)) {
          return res.status(400).json({ success: false, error: `Status inválido. Permitidos: ${statusValidos.join(', ')}` });
        }

        // Validações de transição
        const { data: campanha } = await supabase
          .from('email_campanhas')
          .select('status')
          .eq('id', id)
          .maybeSingle();

        if (!campanha) return res.status(404).json({ success: false, error: 'Campanha não encontrada' });

        // Validar: para ativar, precisa ter ao menos 1 step e 1 lead
        if (status === 'ativa' || status === 'agendada') {
          const { count: stepsCount } = await supabase
            .from('email_campanha_steps')
            .select('id', { count: 'exact', head: true })
            .eq('campanha_id', id)
            .eq('ativo', true);

          const { count: leadsCount } = await supabase
            .from('email_lead_campanhas')
            .select('id', { count: 'exact', head: true })
            .eq('campanha_id', id);

          if ((stepsCount || 0) === 0) {
            return res.status(400).json({ success: false, error: 'Campanha precisa ter ao menos 1 step para ser ativada' });
          }
          if ((leadsCount || 0) === 0) {
            return res.status(400).json({ success: false, error: 'Campanha precisa ter ao menos 1 lead vinculado para ser ativada' });
          }
        }

        const updateData: any = { status, atualizado_em: new Date().toISOString() };
        if (status === 'ativa' && !campanha.status) {
          updateData.inicio_envio = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from('email_campanhas')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, campanha: data });
      }

      return res.status(400).json({ success: false, error: `PATCH action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // DELETE
    // ════════════════════════════════════════════════════════════
    if (req.method === 'DELETE') {

      // ── Excluir campanha (só rascunho) ──────────────────────
      if (action === 'excluir_campanha') {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        // Verificar se é rascunho
        const { data: campanha } = await supabase
          .from('email_campanhas')
          .select('status')
          .eq('id', id)
          .maybeSingle();

        if (!campanha) return res.status(404).json({ success: false, error: 'Campanha não encontrada' });
        if (campanha.status !== 'rascunho') {
          return res.status(400).json({ success: false, error: 'Apenas campanhas em rascunho podem ser excluídas' });
        }

        // Excluir vínculos primeiro (FK cascade cuida dos steps)
        await supabase.from('email_lead_campanhas').delete().eq('campanha_id', id);

        const { error } = await supabase
          .from('email_campanhas')
          .delete()
          .eq('id', id);

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, message: 'Campanha excluída' });
      }

      // ── Excluir step ────────────────────────────────────────
      if (action === 'excluir_step') {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        // Buscar campanha_id para reordenar depois
        const { data: step } = await supabase
          .from('email_campanha_steps')
          .select('campanha_id, ordem')
          .eq('id', id)
          .maybeSingle();

        if (!step) return res.status(404).json({ success: false, error: 'Step não encontrado' });

        const { error } = await supabase
          .from('email_campanha_steps')
          .delete()
          .eq('id', id);

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Reordenar steps restantes
        const { data: remaining } = await supabase
          .from('email_campanha_steps')
          .select('id, ordem')
          .eq('campanha_id', step.campanha_id)
          .order('ordem', { ascending: true });

        if (remaining) {
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].ordem !== i + 1) {
              await supabase
                .from('email_campanha_steps')
                .update({ ordem: i + 1 })
                .eq('id', remaining[i].id);
            }
          }
        }

        return res.status(200).json({ success: true, message: 'Step excluído e reordenado' });
      }

      // ── Desvincular leads ───────────────────────────────────
      if (action === 'desvincular_leads') {
        const campanha_id = req.query.campanha_id as string;
        const lead_ids = req.query.lead_ids as string; // comma-separated
        if (!campanha_id || !lead_ids) {
          return res.status(400).json({ success: false, error: 'campanha_id e lead_ids obrigatórios' });
        }

        const ids = lead_ids.split(',').map(Number).filter(Boolean);

        const { error } = await supabase
          .from('email_lead_campanhas')
          .delete()
          .eq('campanha_id', campanha_id)
          .in('lead_id', ids);

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Atualizar contador
        const { count: totalDest } = await supabase
          .from('email_lead_campanhas')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', campanha_id);

        await supabase
          .from('email_campanhas')
          .update({ total_destinatarios: totalDest || 0, atualizado_em: new Date().toISOString() })
          .eq('id', campanha_id);

        return res.status(200).json({ success: true, desvinculados: ids.length });
      }

      return res.status(400).json({ success: false, error: `DELETE action desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err: any) {
    console.error('[campaign-builder] Erro:', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro interno' });
  }
}

// ════════════════════════════════════════════════════════════════
// HELPER: Renderizar assinatura em HTML
// ════════════════════════════════════════════════════════════════
function renderAssinatura(a: any): string {
  const telefones = [a.telefone_fixo, a.telefone_celular].filter(Boolean).join(' | ');
  const websitesHtml = (a.websites || [])
    .map((url: string) => `<a href="${url}" style="color:#1a73e8;text-decoration:none">${url.replace(/^https?:\/\//, '')}</a>`)
    .join('<br/>');

  return `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e0e0e0;font-family:Arial,sans-serif;font-size:13px;color:#333">
  <p style="margin:0 0 2px"><strong>${a.nome_completo}</strong></p>
  ${a.cargo ? `<p style="margin:0 0 4px"><em>${a.cargo}</em></p>` : ''}
  <p style="margin:0 0 2px">
    <a href="mailto:${a.email_assinatura}" style="color:#1a73e8;text-decoration:none">${a.email_assinatura}</a>
  </p>
  ${telefones ? `<p style="margin:0 0 2px">Tel. ${telefones}</p>` : ''}
  ${websitesHtml ? `<p style="margin:0 0 8px">${websitesHtml}</p>` : ''}
  ${a.politica_privacidade_url ? `<p style="margin:8px 0 4px;font-size:11px;color:#888">Veja nossa Política de Privacidade <a href="${a.politica_privacidade_url}" style="color:#888">${a.politica_privacidade_url}</a></p>` : ''}
  <p style="margin:4px 0 0;font-size:11px;color:#888">${a.optout_texto || 'Caso não queira receber nossos comunicados, responda SAIR'}</p>
</div>`.trim();
}
