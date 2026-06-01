/**
 * api/crm-campanhas.ts — API de Campanhas de Email
 *
 * Histórico:
 *  - v1.0 (14/05/2026): criado como api/campaign-builder.ts
 *  - v1.1 (30/05/2026 - Fase 1E): renomeado para api/crm-campanhas.ts
 *  - v1.2 (30/05/2026 - Fase 4A): criar_step aceita copy_id opcional
 *    (vínculo opcional a uma copy da biblioteca; snapshot do conteúdo
 *    é sempre preservado — edição posterior da copy não afeta steps).
 *  - v1.7 (01/06/2026 - Fase E-1): Múltiplas assinaturas por pessoa
 *    (uma por unidade do grupo).
 *      • O grupo TechFor TI passa a operar 3 unidades comerciais
 *        (TechFor TI, TechCob BPO, TechBoat). Cada vendedor pode ter
 *        uma assinatura por unidade — o link comercial muda por
 *        unidade, mantendo a identidade de marca em cada campanha.
 *      • email_assinaturas: chave única agora é (user_email, unidade);
 *        upsert usa onConflict composto.
 *      • email_campanhas: ganhou coluna `unidade`. Toda campanha
 *        pertence a UMA unidade; a assinatura é a do responsável NA
 *        UNIDADE da campanha.
 *      • Trava de segurança da Fase B estendida: além do e-mail bater
 *        responsável↔assinatura, a UNIDADE da assinatura tem que
 *        bater com a unidade da campanha.
 *      • resolverAssinaturaIdPorEmail ganhou parâmetro `unidade`.
 *      • Backwards compatibility: requisições antigas (sem `unidade`)
 *        recebem default 'TechFor TI'. Todas as assinaturas e
 *        campanhas existentes herdam 'TechFor TI' via DEFAULT na
 *        migração `sql/2026-06-01_crm_assinatura_unidade.sql`.
 *      • Ações alteradas: minha_assinatura, render_assinatura, preview,
 *        criar_campanha, atualizar_campanha, mudar_status,
 *        salvar_assinatura, listar_usuarios_assinatura.
 *  - v1.6 (01/06/2026 - Fase 5A): Enfileiramento da email_fila ao ativar.
 *      • mudar_status → 'ativa' (primeira ativação): popula email_fila com
 *        1 linha por (lead × step). agendado_para[ordem=1] = inicio_envio;
 *        steps seguintes acumulam delay_dias do próprio step. Defesa em
 *        profundidade: opt-outs e leads inaptos filtrados aqui também.
 *      • Bug fix: condição que setava inicio_envio era !campanha.status
 *        (sempre falso — status é string). Corrigida para !inicio_envio
 *        (só seta na PRIMEIRA ativação; pausada→ativa preserva a data).
 *      • Idempotência: re-ativar (pausada→ativa) NÃO re-enfileira; os
 *        registros pendentes da primeira ativação ficam preservados.
 *  - v1.5 (01/06/2026 - Fase D refinamento):
 *      • renderAssinatura: novo padrão corporativo — nome em vermelho
 *        institucional TechForTI (#A33022), cargo em itálico, sem linha
 *        divisória, parágrafo LGPD completo com link de Política de
 *        Privacidade e e-mail do DPO (dpo@techforti.com.br). Campo
 *        `optout_texto` deixa de aparecer no rodapé (texto agora vem
 *        padronizado no parágrafo LGPD).
 *      • NOVO DELETE excluir_assinatura: só Administrador; bloqueia se a
 *        assinatura estiver em campanha ativa/agendada/pausada (preserva a
 *        trava de segurança da Fase B). Hard delete (FK ON DELETE SET NULL
 *        já cobre campanhas em rascunho/concluída).
 *  - v1.4 (01/06/2026 - Fase D): Aba Assinaturas (gestão pelo Admin).
 *      • NOVO GET listar_usuarios_assinatura: usuários elegíveis (Admin/GC/SDR)
 *        + a assinatura vinculada de cada um (join por e-mail). Alimenta a aba
 *        Assinaturas e o seletor de pessoa do modal.
 *      • salvar_assinatura: RBAC — só Administrador pode criar/editar
 *        (fecha a pendência deixada na Fase B). Aceita `ativo` e o `user_email`
 *        da pessoa-alvo (não mais "o meu"). Exige `ator_email` (quem chama).
 *  - v1.3 (01/06/2026 - Fase B): Responsável + Assinatura travada no responsável.
 *      • criar_campanha: RBAC (só Administrador e Gestão Comercial criam; SDR
 *        bloqueado). GC trava o responsável nele mesmo; Admin escolhe o
 *        responsável (Gestão Comercial ou SDR). A assinatura é SEMPRE a do
 *        responsável (resolvida no backend; nunca vem do cliente).
 *      • atualizar_campanha: aceita responsavel_id; deriva a assinatura_id.
 *      • leads_disponiveis: filtra por reservado_por = responsável + vertical
 *        = tipo da campanha + apto_campanha.
 *      • vincular_leads: valida que cada lead é do responsável, da mesma
 *        vertical e apto a campanha.
 *      • mudar_status (ativa/agendada): trava de segurança — exige responsável
 *        e assinatura, e valida que a assinatura PERTENCE ao responsável
 *        (email_assinaturas.user_email == app_users.email_usuario).
 *      • OBS: RBAC do CRUD de assinaturas (só Admin) fica para a Fase D,
 *        junto com a aba Assinaturas, para não quebrar o modal do wizard.
 *
 * CRUD completo para:
 * - Campanhas (criar, listar, editar, excluir, mudar status)
 * - Steps da sequência (1–5 por campanha) — com copy_id opcional
 * - Vinculação de leads
 * - Assinaturas por usuário
 * - Preview de email com merge de variáveis + assinatura
 *
 * Caminho: api/crm-campanhas.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

// ════════════════════════════════════════════════════════════════
// RBAC — Fase B (01/06/2026)
// ════════════════════════════════════════════════════════════════

/** Perfis que podem CRIAR campanhas. */
const PERFIS_CRIAM_CAMPANHA = ['Administrador', 'Gestão Comercial'];

/** Perfis que podem ser RESPONSÁVEIS por uma campanha (recebem a atribuição). */
const PERFIS_RESPONSAVEL = ['Gestão Comercial', 'SDR'];

/** Perfis elegíveis a ter assinatura (aparecem na aba Assinaturas e no seletor). */
const PERFIS_COM_ASSINATURA = ['Administrador', 'Gestão Comercial', 'SDR'];

// ════════════════════════════════════════════════════════════════
// UNIDADES DO GRUPO — Fase E-1 (01/06/2026)
// ════════════════════════════════════════════════════════════════
//
// Cada campanha pertence a uma unidade de negócio do grupo, e a
// assinatura usada herda essa unidade. Assim a mesma pessoa pode
// prospectar para múltiplas unidades com identidades comerciais
// distintas (link/marca diferentes por unidade).
//
// ⚠️ Adicionar nova unidade: atualizar a lista aqui E em
//    src/components/crm/types/crm.constants.ts (UNIDADES_GRUPO).
//    A coluna `unidade` é TEXT livre no banco — não exige migração.

const UNIDADES_GRUPO = ['TechFor TI', 'TechCob BPO', 'TechBoat'] as const;
type Unidade = typeof UNIDADES_GRUPO[number];
const UNIDADE_PADRAO: Unidade = 'TechFor TI';

/**
 * Valida o valor de `unidade` recebido do cliente.
 * - vazio/undefined → retorna a UNIDADE_PADRAO (backwards compat)
 * - valor válido    → retorna a unidade
 * - valor inválido  → erro estruturado para o handler responder 400
 */
function validarUnidade(u: string | undefined | null):
  { ok: true; unidade: Unidade } | { ok: false; erro: string } {
  if (!u) return { ok: true, unidade: UNIDADE_PADRAO };
  if (!(UNIDADES_GRUPO as readonly string[]).includes(u)) {
    return {
      ok: false,
      erro: `Unidade inválida: "${u}". Permitidas: ${UNIDADES_GRUPO.join(', ')}.`,
    };
  }
  return { ok: true, unidade: u as Unidade };
}

interface AppUserLite {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string;
}

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
            email_leads!inner(id, nome, email, cargo, empresa_id, funil:funil_status,
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

        // 🆕 Fase B (01/06/2026) — leads elegíveis = do responsável da campanha
        // E da mesma vertical (email_leads.vertical == email_campanhas.tipo).
        let responsavelCampanha: number | null = null;
        let verticalCampanha: string | null = null;
        if (campanha_id) {
          const { data: camp } = await supabase
            .from('email_campanhas')
            .select('responsavel_id, tipo')
            .eq('id', campanha_id)
            .maybeSingle();
          responsavelCampanha = camp?.responsavel_id ?? null;
          verticalCampanha = camp?.tipo ?? null;
        }

        // Sem responsável definido ainda → não há leads elegíveis
        if (campanha_id && !responsavelCampanha) {
          return res.status(200).json({
            success: true,
            leads: [],
            aviso: 'Defina o responsável da campanha para listar os leads elegíveis.'
          });
        }

        // 🔧 31/05/2026 (Fase 4C-fix): coluna real é funil_status (não funil);
        // filtro principal apto_campanha=true (migração 2026-05-28); opt_out via boolean.
        // Leads disponíveis = aptos a campanha, não opt-out, funil_status != 'perdido'.
        let query = supabase
          .from('email_leads')
          .select(`id, nome, email, cargo, funil:funil_status, email_empresas(nome)`)
          .eq('apto_campanha', true)
          .or('opt_out.is.null,opt_out.eq.false')
          .not('funil_status', 'eq', 'perdido')
          .order('nome', { ascending: true })
          .limit(parseInt(limit));

        // 🆕 Fase B — trava por responsável + vertical
        if (responsavelCampanha) query = query.eq('reservado_por', responsavelCampanha);
        if (verticalCampanha) query = query.eq('vertical', verticalCampanha);

        if (busca) {
          query = query.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%`);
        }
        if (funil) query = query.eq('funil_status', funil);
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
        const unidadeQuery = req.query.unidade as string | undefined;
        if (!user_email) return res.status(400).json({ success: false, error: 'user_email obrigatório' });

        // 🆕 Fase E-1 — agora há N assinaturas por user_email (uma por unidade).
        // Default 'TechFor TI' preserva o comportamento histórico para chamadas
        // legadas que não enviam `unidade`.
        const valU = validarUnidade(unidadeQuery);
        if (!valU.ok) return res.status(400).json({ success: false, error: valU.erro });

        const { data, error } = await supabase
          .from('email_assinaturas')
          .select('*')
          .eq('user_email', user_email)
          .eq('unidade', valU.unidade)
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

      // ── Usuários elegíveis + assinatura vinculada (Fase D, atualizado E-1) ──
      // 🔄 Fase E-1: agora retorna o produto cartesiano (pessoa × unidade do grupo).
      // Cada linha representa um par (usuário, unidade) — com `assinatura: {...}`
      // se já cadastrada para essa combinação, ou `assinatura: null` se ainda não.
      // Esta forma alimenta diretamente a tabela da aba Assinaturas, onde cada
      // linha vira uma combinação distinta com seu próprio "Criar" ou "Editar".
      if (action === 'listar_usuarios_assinatura') {
        const { data: usuarios, error: eU } = await supabase
          .from('app_users')
          .select('id, nome_usuario, email_usuario, tipo_usuario')
          .in('tipo_usuario', PERFIS_COM_ASSINATURA)
          .eq('ativo_usuario', true)
          .order('nome_usuario', { ascending: true });

        if (eU) return res.status(500).json({ success: false, error: eU.message });

        const { data: assinaturas, error: eA } = await supabase
          .from('email_assinaturas')
          .select('*');

        if (eA) return res.status(500).json({ success: false, error: eA.message });

        // Map de assinaturas por (email::unidade) — chave composta da v1.7
        const porChave = new Map<string, any>();
        (assinaturas || []).forEach((a: any) => {
          porChave.set(`${a.user_email}::${a.unidade}`, a);
        });

        const lista: any[] = [];
        for (const u of (usuarios || []) as any[]) {
          for (const unidade of UNIDADES_GRUPO) {
            lista.push({
              id: u.id,
              nome_usuario: u.nome_usuario,
              email_usuario: u.email_usuario,
              tipo_usuario: u.tipo_usuario,
              unidade,
              assinatura: porChave.get(`${u.email_usuario}::${unidade}`) || null,
            });
          }
        }

        return res.status(200).json({ success: true, usuarios: lista });
      }

      // ── Render HTML de uma assinatura (preview fiel) — Fase D ─
      // Reusa o MESMO renderAssinatura do envio (fonte única da verdade).
      // 🔄 Fase E-1: quando a busca é por user_email (não por id), exige
      // `unidade` (default 'TechFor TI' se ausente) pois há agora N
      // assinaturas por user_email.
      if (action === 'render_assinatura') {
        const id = req.query.id as string;
        const user_email = req.query.user_email as string;
        const unidadeQuery = req.query.unidade as string | undefined;
        if (!id && !user_email) {
          return res.status(400).json({ success: false, error: 'id ou user_email obrigatório' });
        }

        let q = supabase.from('email_assinaturas').select('*');
        if (id) {
          q = q.eq('id', id);
        } else {
          const valU = validarUnidade(unidadeQuery);
          if (!valU.ok) return res.status(400).json({ success: false, error: valU.erro });
          q = q.eq('user_email', user_email).eq('unidade', valU.unidade);
        }
        const { data: assinatura, error } = await q.maybeSingle();

        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!assinatura) return res.status(404).json({ success: false, error: 'Assinatura não encontrada' });

        return res.status(200).json({ success: true, html: renderAssinatura(assinatura) });
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

        // 🆕 Fase B — a assinatura do preview é a do RESPONSÁVEL da campanha
        // (via assinatura_id). Mantém compatibilidade: se a campanha ainda não
        // tem assinatura_id, cai no comportamento legado (por user_email).
        // 🔄 Fase E-1 — fallback por user_email agora exige a UNIDADE da
        // campanha (default 'TechFor TI' para campanhas pré-migração).
        let assinaturaHtml = '';
        const { data: campPrev } = await supabase
          .from('email_campanhas')
          .select('assinatura_id, unidade')
          .eq('id', campanha_id)
          .maybeSingle();

        if (campPrev?.assinatura_id) {
          const { data: assinatura } = await supabase
            .from('email_assinaturas')
            .select('*')
            .eq('id', campPrev.assinatura_id)
            .maybeSingle();
          if (assinatura) assinaturaHtml = renderAssinatura(assinatura);
        } else if (user_email) {
          const { data: assinatura } = await supabase
            .from('email_assinaturas')
            .select('*')
            .eq('user_email', user_email)
            .eq('unidade', campPrev?.unidade || UNIDADE_PADRAO)
            .maybeSingle();
          if (assinatura) assinaturaHtml = renderAssinatura(assinatura);
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
                horario_inicio, horario_fim, criado_por, unidade,
                responsavel_id: responsavelIdBody } = body;

        if (!nome || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome e criado_por obrigatórios' });
        }

        // 🆕 Fase E-1 — valida a unidade do grupo. Default 'TechFor TI' quando
        // ausente preserva compatibilidade com clientes pré-migração.
        const valU = validarUnidade(unidade);
        if (!valU.ok) return res.status(400).json({ success: false, error: valU.erro });

        // 🆕 Fase B (01/06/2026) — RBAC + atribuição de responsável/assinatura
        const ator = await resolverUsuarioPorEmail(supabase, criado_por);
        if (!ator) {
          return res.status(403).json({ success: false, error: 'Criador não encontrado em app_users' });
        }
        if (!PERFIS_CRIAM_CAMPANHA.includes(ator.tipo_usuario)) {
          return res.status(403).json({
            success: false,
            error: 'Seu perfil não pode criar campanhas (somente Administrador ou Gestão Comercial)'
          });
        }

        // Define o responsável conforme o perfil de quem cria:
        //  - Gestão Comercial: travado nele mesmo (ignora responsavel_id enviado).
        //  - Administrador: escolhe um responsável (GC ou SDR). Opcional na criação,
        //    obrigatório na ativação.
        let responsavelUser: AppUserLite | null = null;
        if (ator.tipo_usuario === 'Gestão Comercial') {
          responsavelUser = ator;
        } else if (ator.tipo_usuario === 'Administrador' && responsavelIdBody) {
          responsavelUser = await resolverUsuarioPorId(supabase, Number(responsavelIdBody));
          if (!responsavelUser) {
            return res.status(400).json({ success: false, error: 'Responsável informado não existe' });
          }
          if (!PERFIS_RESPONSAVEL.includes(responsavelUser.tipo_usuario)) {
            return res.status(400).json({ success: false, error: 'Responsável deve ser Gestão Comercial ou SDR' });
          }
        }

        const responsavelId = responsavelUser?.id ?? null;
        // 🔄 Fase E-1 — assinatura resolvida por (e-mail do responsável, unidade
        // da campanha). Pode retornar null se a pessoa ainda não tem assinatura
        // cadastrada para essa unidade — o `mudar_status` bloqueia a ativação
        // nesse caso, mas a criação em rascunho continua permitida.
        const assinaturaId = responsavelUser
          ? await resolverAssinaturaIdPorEmail(supabase, responsavelUser.email_usuario, valU.unidade)
          : null;

        const { data, error } = await supabase
          .from('email_campanhas')
          .insert({
            nome,
            tipo: tipo || 'Outsourcing',
            unidade: valU.unidade,
            status: 'rascunho',
            dominio_envio: dominio_envio || '',
            email_remetente: email_remetente || '',
            nome_remetente: nome_remetente || '',
            horario_inicio: horario_inicio || '08:00',
            horario_fim: horario_fim || '18:00',
            criado_por,
            responsavel_id: responsavelId,
            assinatura_id: assinaturaId,
          })
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(201).json({ success: true, campanha: data });
      }

      // ── Criar step ──────────────────────────────────────────
      if (action === 'criar_step') {
        const { campanha_id, ordem, assunto, corpo_html, corpo_texto, delay_dias, condicao, copy_id } = body;

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

        // 🆕 30/05/2026 — Fase 4A: aceita copy_id opcional (snapshot do assunto/corpo
        // é sempre preservado, mesmo quando vinculado a uma copy da biblioteca).
        // Edição futura da copy NÃO afeta este step (decisão: snapshot).
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
            ativo: true,
            copy_id: copy_id ?? null,
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

        // 🆕 Fase B — só vincula leads do responsável + mesma vertical + apto
        const { data: camp } = await supabase
          .from('email_campanhas')
          .select('responsavel_id, tipo')
          .eq('id', campanha_id)
          .maybeSingle();
        if (!camp) return res.status(404).json({ success: false, error: 'Campanha não encontrada' });
        if (!camp.responsavel_id) {
          return res.status(400).json({ success: false, error: 'Defina o responsável da campanha antes de vincular leads' });
        }

        // Verificar opt-out
        const { data: optouts } = await supabase
          .from('email_optout')
          .select('email');
        const emailsOptout = new Set((optouts || []).map((o: any) => o.email));

        // Buscar leads com dados para validação
        const { data: leads } = await supabase
          .from('email_leads')
          .select('id, email, reservado_por, vertical, apto_campanha')
          .in('id', lead_ids);

        // Filtrar: não opt-out, apto, do responsável e da mesma vertical
        const leadsValidos = (leads || []).filter((l: any) =>
          !emailsOptout.has(l.email) &&
          l.apto_campanha === true &&
          l.reservado_por === camp.responsavel_id &&
          l.vertical === camp.tipo
        );

        if (leadsValidos.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Nenhum lead elegível: precisa ser do responsável, da mesma vertical e apto a campanha (e não em opt-out)'
          });
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
          inelegiveis_ignorados: lead_ids.length - leadsValidos.length
        });
      }

      // ── Salvar/Atualizar assinatura ─────────────────────────
      // 🆕 Fase D (01/06/2026): RBAC — só Administrador cria/edita assinaturas.
      // `ator_email` identifica quem está chamando; `user_email` é a pessoa-alvo
      // da assinatura (pode ser outra pessoa, não só "o meu").
      if (action === 'salvar_assinatura') {
        const { ator_email, user_email, unidade, nome_completo, cargo, email_assinatura,
                telefone_fixo, telefone_celular, websites, politica_privacidade_url,
                optout_texto, ativo } = body;

        if (!user_email || !nome_completo || !email_assinatura) {
          return res.status(400).json({ success: false, error: 'user_email, nome_completo e email_assinatura obrigatórios' });
        }

        // 🆕 Fase E-1 — valida a unidade do grupo. Default 'TechFor TI' quando
        // ausente preserva compatibilidade com clientes pré-migração.
        const valU = validarUnidade(unidade);
        if (!valU.ok) return res.status(400).json({ success: false, error: valU.erro });

        // RBAC: apenas Administrador
        const ator = await resolverUsuarioPorEmail(supabase, ator_email);
        if (!ator || ator.tipo_usuario !== 'Administrador') {
          return res.status(403).json({ success: false, error: 'Somente o Administrador pode criar ou editar assinaturas' });
        }

        const { data, error } = await supabase
          .from('email_assinaturas')
          .upsert({
            user_email,
            unidade: valU.unidade,
            nome_completo,
            cargo: cargo || '',
            email_assinatura,
            telefone_fixo: telefone_fixo || '',
            telefone_celular: telefone_celular || '',
            websites: websites || [],
            politica_privacidade_url: politica_privacidade_url || '',
            optout_texto: optout_texto || 'Caso não queira receber nossos comunicados, responda SAIR',
            ativo: ativo === undefined ? true : ativo,
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'user_email,unidade' })
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

        // Campos permitidos para update via loop genérico.
        // NOTA: `unidade` NÃO entra aqui — é tratada separadamente abaixo
        // (validação + recálculo de assinatura).
        const permitidos = ['nome', 'tipo', 'dominio_envio', 'email_remetente',
          'nome_remetente', 'horario_inicio', 'horario_fim', 'inicio_envio', 'fim_envio'];
        const updateData: any = { atualizado_em: new Date().toISOString() };
        for (const key of permitidos) {
          if (campos[key] !== undefined) updateData[key] = campos[key];
        }

        // 🆕 Fase E-1 — validar a unidade (se enviada). Aplicada ao updateData
        // antes do recálculo de assinatura para que esse use o valor novo.
        if (campos.unidade !== undefined) {
          const valU = validarUnidade(campos.unidade);
          if (!valU.ok) return res.status(400).json({ success: false, error: valU.erro });
          updateData.unidade = valU.unidade;
        }

        // 🆕 Fase B + 🔄 Fase E-1 — responsável e/ou unidade mudaram → recalcular
        // assinatura. A assinatura_id NUNCA vem do cliente: é sempre derivada
        // de (responsável, unidade). Por isso o recálculo dispara se QUALQUER um
        // dos dois for alterado nesta requisição.
        const mudouResp = campos.responsavel_id !== undefined;
        const mudouUnidade = campos.unidade !== undefined;

        if (mudouResp || mudouUnidade) {
          // Buscar estado atual para preencher o lado que não veio na requisição
          const { data: campAtual } = await supabase
            .from('email_campanhas')
            .select('responsavel_id, unidade')
            .eq('id', id)
            .maybeSingle();
          if (!campAtual) {
            return res.status(404).json({ success: false, error: 'Campanha não encontrada' });
          }

          // Responsável final = o enviado (se enviado) ou o atual
          const respIdFinal = mudouResp ? campos.responsavel_id : campAtual.responsavel_id;

          if (respIdFinal === null) {
            // Removeu o responsável: limpa também a assinatura
            updateData.responsavel_id = null;
            updateData.assinatura_id = null;
          } else if (respIdFinal !== undefined && respIdFinal !== null) {
            const respUser = await resolverUsuarioPorId(supabase, Number(respIdFinal));
            if (!respUser) {
              return res.status(400).json({ success: false, error: 'Responsável informado não existe' });
            }
            if (!PERFIS_RESPONSAVEL.includes(respUser.tipo_usuario)) {
              return res.status(400).json({ success: false, error: 'Responsável deve ser Gestão Comercial ou SDR' });
            }
            if (mudouResp) updateData.responsavel_id = respUser.id;

            // Unidade final = a enviada (já validada acima) ou a atual ou o default
            const unidadeFinal = (updateData.unidade as string) || campAtual.unidade || UNIDADE_PADRAO;
            updateData.assinatura_id = await resolverAssinaturaIdPorEmail(
              supabase,
              respUser.email_usuario,
              unidadeFinal
            );
          }
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
          .select('status, responsavel_id, assinatura_id, inicio_envio, dominio_envio, unidade')
          .eq('id', id)
          .maybeSingle();

        if (!campanha) return res.status(404).json({ success: false, error: 'Campanha não encontrada' });

        // Validar: para ativar/agendar, precisa ter ao menos 1 step e 1 lead
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

          // 🆕 Fase B + 🔄 Fase E-1 — TRAVA DE SEGURANÇA: a assinatura tem que
          // pertencer ao responsável E ser da MESMA unidade da campanha.
          if (!campanha.responsavel_id) {
            return res.status(400).json({ success: false, error: 'Defina o responsável antes de ativar/agendar a campanha' });
          }
          if (!campanha.assinatura_id) {
            return res.status(400).json({ success: false, error: `O responsável não tem assinatura cadastrada para a unidade "${campanha.unidade || UNIDADE_PADRAO}". Peça ao Administrador para criar.` });
          }
          const { data: respUser } = await supabase
            .from('app_users').select('email_usuario').eq('id', campanha.responsavel_id).maybeSingle();
          const { data: ass } = await supabase
            .from('email_assinaturas').select('user_email, unidade').eq('id', campanha.assinatura_id).maybeSingle();
          if (
            !respUser ||
            !ass ||
            respUser.email_usuario !== ass.user_email ||
            ass.unidade !== (campanha.unidade || UNIDADE_PADRAO)
          ) {
            return res.status(400).json({
              success: false,
              error: 'A assinatura não pertence ao responsável na unidade da campanha — operação bloqueada.'
            });
          }
        }

        const updateData: any = { status, atualizado_em: new Date().toISOString() };

        // 🆕 Fase 5A (01/06/2026) — ENFILEIRAMENTO na PRIMEIRA ativação.
        //
        // Condição: indo para 'ativa' E inicio_envio ainda não foi definido.
        // (Bug fix da v1.5: a condição era !campanha.status, sempre falsa, então
        // inicio_envio nunca era setado e a fila nunca era populada.)
        //
        // Semântica do agendamento:
        //   Step 1 (primeiro da sequência) → agendado_para = AGORA (delay_dias do step 1 é ignorado)
        //   Step N (N > 1) → agendado_para[N] = agendado_para[N-1] + delay_dias do step N
        //
        // Idempotência: pausada→ativa NÃO re-enfileira (inicio_envio já existe).
        // Resume será tratado pelo cron (Fase 5B) — basta ler pendentes.
        let enfileiramento: { enfileirados: number; opt_outs_ignorados: number; inaptos_ignorados: number } | null = null;
        if (status === 'ativa' && !campanha.inicio_envio) {
          const agora = new Date();

          // 1) Steps ativos ordenados
          const { data: steps, error: errSteps } = await supabase
            .from('email_campanha_steps')
            .select('id, ordem, delay_dias')
            .eq('campanha_id', id)
            .eq('ativo', true)
            .order('ordem', { ascending: true });

          if (errSteps) return res.status(500).json({ success: false, error: `Falha ao ler steps: ${errSteps.message}` });
          if (!steps || steps.length === 0) {
            return res.status(400).json({ success: false, error: 'Sem steps ativos para enfileirar' });
          }

          // 2) Leads vinculados com dados completos
          const { data: vinculos, error: errVinc } = await supabase
            .from('email_lead_campanhas')
            .select('lead_id, email_leads!inner(id, email, nome, apto_campanha)')
            .eq('campanha_id', id)
            .eq('status', 'ativa');

          if (errVinc) return res.status(500).json({ success: false, error: `Falha ao ler leads vinculados: ${errVinc.message}` });
          if (!vinculos || vinculos.length === 0) {
            return res.status(400).json({ success: false, error: 'Sem leads vinculados para enfileirar' });
          }

          // 3) Opt-outs (defesa em profundidade — vincular_leads já filtra, mas o
          //    lead pode ter entrado em opt-out depois de vinculado)
          const { data: optouts } = await supabase
            .from('email_optout')
            .select('email');
          const setOptout = new Set(
            (optouts || []).map((o: any) => (o.email || '').toLowerCase().trim())
          );

          let inaptos = 0;
          let optOutFiltrados = 0;
          const leadsValidos: any[] = [];
          for (const v of vinculos as any[]) {
            const lead = v.email_leads;
            if (!lead || !lead.email) { inaptos++; continue; }
            if (!lead.apto_campanha) { inaptos++; continue; }
            if (setOptout.has(lead.email.toLowerCase().trim())) { optOutFiltrados++; continue; }
            leadsValidos.push(lead);
          }

          if (leadsValidos.length === 0) {
            return res.status(400).json({
              success: false,
              error: `Todos os leads foram filtrados na ativação (inaptos: ${inaptos}, opt-out: ${optOutFiltrados}). Reveja a base.`,
            });
          }

          // 4) agendado_para por step (cumulativo a partir de AGORA)
          const stepDates = new Map<number, string>();
          let cumDays = 0;
          for (let i = 0; i < steps.length; i++) {
            const s: any = steps[i];
            if (i === 0) {
              // primeiro step: envia no início
              stepDates.set(s.id, agora.toISOString());
            } else {
              cumDays += Number(s.delay_dias) || 0;
              const dt = new Date(agora);
              dt.setDate(dt.getDate() + cumDays);
              stepDates.set(s.id, dt.toISOString());
            }
          }

          // 5) Montar rows
          const filaRows: any[] = [];
          for (const lead of leadsValidos) {
            for (const s of steps as any[]) {
              filaRows.push({
                campanha_id: parseInt(id, 10),
                step_id: s.id,
                lead_id: lead.id,
                destinatario_email: lead.email,
                destinatario_nome: lead.nome || null,
                dominio_usado: campanha.dominio_envio || null,
                status: 'pendente',
                agendado_para: stepDates.get(s.id),
              });
            }
          }

          // 6) Bulk insert em lotes (limite seguro de 500/req, dentro dos 60s do Vercel)
          const TAM_LOTE = 500;
          let totalInseridos = 0;
          for (let i = 0; i < filaRows.length; i += TAM_LOTE) {
            const lote = filaRows.slice(i, i + TAM_LOTE);
            const { data: ins, error: errIns } = await supabase
              .from('email_fila')
              .insert(lote)
              .select('id');
            if (errIns) {
              return res.status(500).json({
                success: false,
                error: `Falha ao enfileirar (lote ${Math.floor(i / TAM_LOTE) + 1}): ${errIns.message}. ${totalInseridos} itens já inseridos antes deste lote permanecem no banco.`,
              });
            }
            totalInseridos += ins?.length || 0;
          }

          enfileiramento = {
            enfileirados: totalInseridos,
            opt_outs_ignorados: optOutFiltrados,
            inaptos_ignorados: inaptos,
          };
          updateData.inicio_envio = agora.toISOString();
        }

        const { data, error } = await supabase
          .from('email_campanhas')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, campanha: data, fila: enfileiramento });
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
          .eq('campanha_id', campanha_id);

        return res.status(200).json({ success: true, desvinculados: ids.length });
      }

      // ── Excluir assinatura (Admin) — Fase D v1.5 ────────────
      // Bloqueia se a assinatura estiver em campanha ativa/agendada/pausada
      // (preserva a trava de segurança da Fase B). Campanhas em rascunho ou
      // concluída usam ON DELETE SET NULL (definido na migração da Fase A).
      if (action === 'excluir_assinatura') {
        const id = req.query.id as string;
        const ator_email = req.query.ator_email as string;
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        // RBAC: só Administrador
        const ator = await resolverUsuarioPorEmail(supabase, ator_email);
        if (!ator || ator.tipo_usuario !== 'Administrador') {
          return res.status(403).json({ success: false, error: 'Somente o Administrador pode excluir assinaturas' });
        }

        // Bloquear se a assinatura estiver em campanha em uso
        const { count: emUso } = await supabase
          .from('email_campanhas')
          .select('id', { count: 'exact', head: true })
          .eq('assinatura_id', id)
          .in('status', ['ativa', 'agendada', 'pausada']);

        if ((emUso || 0) > 0) {
          return res.status(400).json({
            success: false,
            error: `Não é possível excluir: assinatura está em uso por ${emUso} campanha(s) em andamento (ativa/agendada/pausada).`
          });
        }

        const { error } = await supabase
          .from('email_assinaturas')
          .delete()
          .eq('id', id);

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, message: 'Assinatura excluída' });
      }

      return res.status(400).json({ success: false, error: `DELETE action desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err: any) {
    console.error('[crm-campanhas] Erro:', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro interno' });
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS — resolução de usuário e assinatura (Fase B — 01/06/2026)
// ════════════════════════════════════════════════════════════════

/** Resolve um app_user pelo e-mail de login (email_usuario). */
async function resolverUsuarioPorEmail(supabase: any, email?: string): Promise<AppUserLite | null> {
  if (!email) return null;
  const { data } = await supabase
    .from('app_users')
    .select('id, nome_usuario, email_usuario, tipo_usuario')
    .eq('email_usuario', email)
    .maybeSingle();
  return (data as AppUserLite) ?? null;
}

/** Resolve um app_user pelo id. */
async function resolverUsuarioPorId(supabase: any, id?: number | null): Promise<AppUserLite | null> {
  if (!id) return null;
  const { data } = await supabase
    .from('app_users')
    .select('id, nome_usuario, email_usuario, tipo_usuario')
    .eq('id', id)
    .maybeSingle();
  return (data as AppUserLite) ?? null;
}

/** Resolve o id da assinatura ATIVA de uma pessoa, pelo e-mail dela
 *  e pela unidade do grupo. Combinação única (user_email, unidade)
 *  desde a Fase E-1 (01/06/2026). Quando `unidade` é omitida, usa a
 *  UNIDADE_PADRAO ('TechFor TI'). */
async function resolverAssinaturaIdPorEmail(
  supabase: any,
  email?: string,
  unidade?: string
): Promise<number | null> {
  if (!email) return null;
  const unidadeFinal = unidade || UNIDADE_PADRAO;
  const { data } = await supabase
    .from('email_assinaturas')
    .select('id')
    .eq('user_email', email)
    .eq('unidade', unidadeFinal)
    .eq('ativo', true)
    .maybeSingle();
  return data?.id ?? null;
}

// ════════════════════════════════════════════════════════════════
// HELPER: Renderizar assinatura em HTML — Padrão corporativo (v1.5)
// ════════════════════════════════════════════════════════════════
// Layout:
//   Nome (negrito, vermelho institucional #A33022)
//   Cargo (itálico, cinza)
//   E-mail (link azul)
//   Tel. <fixo> | <celular>
//   Website (URL completa, link azul)
//   ──
//   Parágrafo LGPD completo (Política de Privacidade + DPO + opt-out)
//
// Observações:
//  - SEM linha divisória no topo (border-top removido).
//  - O campo `optout_texto` da tabela NÃO é mais renderizado: o texto de
//    opt-out passou a fazer parte do parágrafo LGPD padronizado.
//  - DPO institucional fixo: dpo@techforti.com.br.
function renderAssinatura(a: any): string {
  const COR_NOME = '#A33022';   // vermelho institucional TechForTI (oficial)
  const COR_LINK = '#1a73e8';
  const COR_TEXTO = '#333333';
  const COR_LGPD = '#666666';

  const telefones = [a.telefone_fixo, a.telefone_celular].filter(Boolean).join(' | ');
  const websitePrincipal = (a.websites || []).find(Boolean) || '';
  const politicaUrl = a.politica_privacidade_url || '';

  const linhaTel = telefones
    ? `<p style="margin:0;color:${COR_TEXTO}">Tel. ${telefones}</p>`
    : '';

  const linhaSite = websitePrincipal
    ? `<p style="margin:0"><a href="${websitePrincipal}" style="color:${COR_LINK};text-decoration:underline">${websitePrincipal}</a></p>`
    : '';

  const linkPolitica = politicaUrl
    ? `<a href="${politicaUrl}" style="color:${COR_LINK};text-decoration:underline">Política de Privacidade</a>`
    : 'Política de Privacidade';

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:${COR_TEXTO};line-height:1.5">
  <p style="margin:0;color:${COR_NOME};font-weight:bold;font-size:14px">${a.nome_completo}</p>
  ${a.cargo ? `<p style="margin:0;font-style:italic;color:#555">${a.cargo}</p>` : ''}
  <p style="margin:0"><a href="mailto:${a.email_assinatura}" style="color:${COR_LINK};text-decoration:underline">${a.email_assinatura}</a></p>
  ${linhaTel}
  ${linhaSite}
  <div style="margin-top:14px;font-size:11px;color:${COR_LGPD};line-height:1.5">
    <p style="margin:0">Estamos entrando em contato contigo para lhe apresentar uma oportunidade, que entendemos ser do seu interesse, nos termos da Lei Geral de Proteção de Dados (LGPD).</p>
    <p style="margin:0">Isso quer dizer que coletamos, tratamos e armazenamos dados pessoais com todo o cuidado e zelo. Leia atentamente a nossa ${linkPolitica} e, se tiver alguma dúvida, entre em contato com o nosso Encarregado de Dados (Data Protection Officer - DPO) no seguinte e-mail: <a href="mailto:dpo@techforti.com.br" style="color:${COR_LINK};text-decoration:underline">dpo@techforti.com.br</a>.</p>
    <p style="margin:0">Se não tiver mais interesse em receber nossas mensagens, que foi baseado no legítimo interesse da LGPD, responda este e-mail solicitando o descadastramento (opt out) SAIR.</p>
  </div>
</div>`.trim();
}
