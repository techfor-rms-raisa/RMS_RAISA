/**
 * api/crm-leads.ts — CRUD Empresas + Leads (CRM de Campanhas)
 *
 * Histórico:
 *  - v1.9 (10/06/2026 — Vinculação em Lote): adiciona 2 actions para a
 *    nova aba "Vincular em Lote" do form Empresas & Leads
 *    (BaseLeadsPage.tsx v1.5):
 *
 *      • GET `listar_leads_para_vinculo_em_lote` — lista leads aptos,
 *        não opt-out, não-perdidos e NÃO vinculados a campanhas em
 *        andamento. RBAC: filtra por reservado_por (se não-admin).
 *        🛡️ REGRA CRECI BIDIRECIONAL: exclui automaticamente leads
 *        com vertical='CRECI' (lead CRECI nunca muda de vertical).
 *
 *      • POST `vincular_em_lote_a_campanha` — vincula N leads a uma
 *        campanha em uma única operação:
 *          1. Valida vertical_destino ≠ 'CRECI' (defesa em profundidade)
 *          2. Valida campanha.tipo === vertical_destino
 *          3. Para cada lead:
 *             a. Bloqueia se lead.vertical === 'CRECI' (não muda)
 *             b. Se lead.vertical ≠ vertical_destino → UPDATE vertical
 *                + registra histórico 'vertical_alterada'
 *             c. Chama helper `vincularLeadACampanha` (Fase A v1.8) com
 *                as 7 validações + enfileiramento condicional em email_fila
 *        Resultado estruturado: { sucessos, falhas[], verticais_alteradas }.
 *        Loop não-transacional — falha individual não bloqueia os demais.
 *
 *  - v1.8 (09/06/2026 — Fase A): atalho "promover + vincular a campanha"
 *    em uma única operação. Duas mudanças principais:
 *
 *      • Action `promover_para_campanha` agora aceita `campanha_id`
 *        OPCIONAL no body. Quando informado, o lead criado (ou o lead
 *        pré-existente, em caso de "ja_existia") é vinculado à campanha
 *        e — se a campanha já tem inicio_envio (status ativa/pausada) —
 *        é enfileirado em `email_fila` com a MESMA lógica de delays
 *        acumulados usada na ativação inicial (crm-campanhas.ts v1.6
 *        Fase 5A). Para status='agendada' (inicio_envio NULL) o vínculo
 *        é criado mas o enfileiramento fica a cargo da futura ativação.
 *        Validações em camadas (defesa em profundidade):
 *          (a) campanha existe e status IN ('ativa','pausada','agendada');
 *          (b) data_encerramento IS NULL OR >= hoje (Fase B v1.10);
 *          (c) campanha.tipo === lead.vertical (Fase B trava);
 *          (d) campanha.responsavel_id === lead.reservado_por (Fase B);
 *          (e) lead não está em outra campanha ativa/pausada/agendada
 *              (regra de duplicação - decisão produto 09/06/2026);
 *          (f) email não está em opt-out global.
 *        Helper `vincularLeadACampanha` extraído ao final do arquivo
 *        para reuso entre o caminho "lead novo" e "lead já existia"
 *        (no segundo caso, apenas vincula sem criar email_lead).
 *
 *      • BUG FIX preexistente: o INSERT em email_leads do
 *        promover_para_campanha NÃO populava `reservado_por`, o que
 *        deixava o lead inelegível para qualquer campanha (a Fase B
 *        trava exige reservado_por === campanha.responsavel_id). Sem
 *        esse fix, a action `listar_campanhas_disponiveis_para_lead`
 *        sempre retornaria vazio para leads vindos do Prospect Engine.
 *        Correção: herda `prospect.reservado_por` (campo já populado
 *        em prospect_leads desde o salvamento da pesquisa). Também
 *        populamos `apto_campanha=true` + `apto_campanha_em/por` para
 *        ficar consistente com a action `criar_lead` (v1.7) — o lead
 *        promovido nasce apto a campanhas.
 *
 *    Frontend complementar: ProspectSearchPage.tsx passa a abrir o
 *    SelecionarCampanhaModal.tsx antes de chamar esta action; o modal
 *    consulta `crm-campanhas?action=listar_campanhas_disponiveis_para_lead`
 *    e devolve `campanha_id` (ou null para "só CRM").
 *
 *  - v1.0 (13/05/2026): criado como api/campaign-leads.ts
 *  - v1.1 (30/05/2026): adicionada action 'promover_para_campanha' +
 *    UPDATE de prospect_leads.status='no_crm' em importar_prospects
 *  - v1.2 (30/05/2026 - Fase 1E): renomeado para api/crm-leads.ts
 *    (nome semanticamente correto — CRUD do CRM, não de campanhas).
 *  - v1.3 (04/06/2026 - Fase 8-Inbox): novas actions GET para alimentar
 *    as abas "Respostas" e "Inválidos" do Form Empresas & Leads:
 *      • listar_respostas — UNION em camada Node de email_respostas +
 *        email_optout, com lookups de lead/empresa/campanha em batch
 *        (1 query por tabela, evita N+1).
 *      • listar_invalidos — email_fila WHERE status IN ('bounce','erro'),
 *        com joins para lead+empresa+campanha.
 *  - v1.4 (04/06/2026 - Fase 8-fix): correção do bug
 *    "Could not find the 'email_empresas' column of 'email_leads'"
 *    nas actions PATCH `atualizar_lead` e `atualizar_empresa`. Causa:
 *    o frontend trazia o JOIN embed (ex.: `email_empresas`) no objeto
 *    e enviava de volta no PATCH; o PostgREST tentava `UPDATE` na
 *    coluna fantasma e falhava. Solução: whitelist explícita das
 *    colunas editáveis (defesa em profundidade) — qualquer campo fora
 *    da whitelist é silenciosamente ignorado, protegendo também
 *    contra futuras adições de JOINs e contra mutação de campos
 *    calculados (contadores, timestamps de webhook).
 *  - v1.5 (04/06/2026 - Fase 8-fix2): action `stats` agora também
 *    devolve `total_respostas` (rows em `email_respostas`) e
 *    `total_invalidos` (rows em `email_fila` com status bounce/erro).
 *    Motivação: os badges das abas "Respostas" e "Inválidos" no
 *    BaseLeadsPage ficavam zerados até o usuário clicar (porque os
 *    respectivos hooks só carregavam sob demanda). Com `stats`
 *    devolvendo os totais agregados no mount, o badge fica sempre
 *    correto sem custo extra de requisições.
 *  - v1.6 (05/06/2026 - HOTFIX Production): adicionada action
 *    `promover_corretor_para_campanha` que estava ausente apesar de
 *    documentada no CHECKPOINT_2026-06-02. Sintoma em Production:
 *    erro 400 "Ação POST desconhecida: promover_corretor_para_campanha"
 *    quando a SDR clica em "+ Campanha" no módulo CRECI. Causa
 *    provável: regressão em algum merge entre 02/06 e 04/06.
 *    Implementação espelha `promover_para_campanha` adaptada à
 *    realidade de PF (corretor não tem empresa): empresa_id=null,
 *    vertical='CRECI', origem='creci', cargo='Corretor de Imóveis'.
 *    Email priorizado: email_creci > email_pessoal (falha se ambos
 *    vazios). Marca data_envio_adv no corretor (igual ao Prospect
 *    Engine marca status='no_crm'). Idempotente: se já existe lead
 *    com o mesmo email, apenas sincroniza data_envio_adv e retorna
 *    ja_existia=true.
 *  - v1.7 (05/06/2026 - Lead RBAC fix): novas funcionalidades para o
 *    LeadFormModal v1.1 — leads criados via "Novo Lead" agora entram
 *    com vertical/apto/reservado_por corretamente populados:
 *      • Nova action GET `listar_responsaveis_lead`: retorna usuários
 *        com tipo_usuario IN ('Gestão Comercial','SDR'). Usado pelo
 *        Admin no LeadFormModal para escolher para quem o lead será
 *        reservado.
 *      • Action `criar_lead`: passou a aceitar `vertical`,
 *        `apto_campanha` e `reservado_por` no body; valida que
 *        `vertical` (NOT NULL após esse fix), `apto_campanha`
 *        (boolean, default true) e `reservado_por` (FK app_users)
 *        sejam consistentes. Grava no INSERT em email_leads.
 *      • Whitelist `COLUNAS_EDITAVEIS_LEAD` (v1.4): adicionados
 *        `vertical`, `apto_campanha`, `reservado_por` à lista de
 *        colunas editáveis via PATCH `atualizar_lead`. Sem isso, o
 *        Admin não conseguiria corrigir a vertical de um lead já
 *        existente.
 *    Combinação dos 3 garante que a action `leads_disponiveis` da
 *    campanha encontre o lead no seletor de vínculo (era o sintoma
 *    reportado pela Débora SDR em 05/06/2026 com 3 leads de teste
 *    invisíveis em campanha).
 *
 * Endpoints:
 * GET  ?action=listar_empresas[&busca=X&setor=X&page=1&limit=20]
 * GET  ?action=detalhe_empresa&id=X
 * GET  ?action=listar_leads[&empresa_id=X&funil=X&busca=X&page=1&limit=30]
 * GET  ?action=detalhe_lead&id=X  (inclui timeline + campanhas)
 * GET  ?action=buscar_global&q=X  (busca por nome empresa/domínio/email lead)
 * GET  ?action=stats                (contadores gerais)
 * GET  ?action=listar_respostas[&busca=X&page=1&limit=30]   (🆕 v1.3 — Fase 8)
 * GET  ?action=listar_invalidos[&busca=X&page=1&limit=30]   (🆕 v1.3 — Fase 8)
 * GET  ?action=listar_responsaveis_lead                     (🆕 v1.7 — Lead RBAC fix; retorna GC + SDR)
 * POST action=criar_empresa
 * POST action=criar_lead                                    (🔧 v1.7 — aceita vertical, apto_campanha, reservado_por)
 * POST action=importar_prospects    (importa de prospect_leads → email_leads/email_empresas)
 * POST action=promover_para_campanha (1 prospect → email_leads; marca status='no_crm')
 * POST action=promover_corretor_para_campanha (🆕 v1.6 — 1 corretor CRECI → email_leads; marca data_envio_adv)
 * PATCH action=atualizar_empresa    (🔧 v1.4 — whitelist de campos)
 * PATCH action=atualizar_lead       (🔧 v1.4 — whitelist de campos)
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

// ════════════════════════════════════════════════════════════════════════
// 🆕 v1.4 — WHITELIST DE CAMPOS EDITÁVEIS
// ════════════════════════════════════════════════════════════════════════
// O frontend traz objetos com JOIN embed (ex.: email_leads.email_empresas,
// vindo do `.select('*, email_empresas(...)')`) que NÃO são colunas reais
// da tabela. Sem essa whitelist, ao salvar a edição o PostgREST devolve:
//   "Could not find the 'email_empresas' column of 'email_leads'"
//
// A whitelist também serve como defesa em profundidade contra mutação
// indevida de:
//   - contadores incrementados pelo webhook (total_emails_recebidos, etc.)
//   - timestamps automáticos (criado_em, opt_out_em, ultimo_email_*)
//   - flags calculadas (apto_campanha, score_engajamento)
//   - funil_status (deve ser atualizado pela action `mudar_funil` com
//     registro de histórico, não diretamente)
//
// Para incluir novo campo editável: ADICIONAR aqui + no LeadFormModal
// (ou EmpresaFormModal) na UI. Para campos somente leitura: deixar fora.

const COLUNAS_EDITAVEIS_LEAD = [
  'empresa_id',
  'nome',
  'email',
  'cargo',
  'telefone',
  'linkedin_url',
  'opt_out',
  'tags',
  'notas',
  'reservado_por',
  'origem',
  'prospect_lead_id',
  // 🆕 v1.7 (05/06/2026 — Lead RBAC fix)
  'vertical',
  'apto_campanha',
] as const;

const COLUNAS_EDITAVEIS_EMPRESA = [
  'nome',
  'dominio',
  'cnpj',
  'setor',
  'porte',
  'cidade',
  'uf',
  'website',
  'linkedin_url',
  'telefone_comercial',
  'observacoes',
  'origem',
] as const;

/**
 * Pega do `body` apenas os campos presentes na `whitelist`, ignorando
 * qualquer outro. Preserva valores `null` (necessário para limpar campos
 * — ex.: empresa_id = null).
 */
function pickEditable<T extends readonly string[]>(
  body: Record<string, any>,
  whitelist: T,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of whitelist) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

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

        // 🆕 v1.5 — agregados das abas "Respostas" e "Inválidos"
        // (Fase 8-fix2: badges sempre populados, sem precisar abrir a aba).
        const { count: totalRespostas } = await supabase
          .from('email_respostas').select('id', { count: 'exact', head: true });

        const { count: totalInvalidos } = await supabase
          .from('email_fila').select('id', { count: 'exact', head: true })
          .in('status', ['bounce', 'erro']);

        return res.status(200).json({
          success: true,
          stats: {
            total_empresas: totalEmpresas || 0,
            total_leads: totalLeads || 0,
            total_prospects: totalProspects || 0,
            total_clientes: totalClientes || 0,
            total_optout: totalOptOut || 0,
            total_campanhas: totalCampanhas || 0,
            // 🆕 v1.5
            total_respostas: totalRespostas || 0,
            total_invalidos: totalInvalidos || 0,
          }
        });
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.3 — INBOX DE RESPOSTAS (Aba "Respostas" do Form Empresas)
      // ════════════════════════════════════════════════════════════
      // UNION em camada Node de email_respostas + email_optout, ordenado
      // por data DESC. Lookup de lead/empresa/campanha em batch (1 query
      // por tabela), evitando N+1. Filtro de busca aplica em pós-merge
      // sobre nome do lead, e-mail e assunto.
      //
      // Parâmetros aceitos:
      //   - busca: string (nome, email, assunto) — opcional, ilike
      //   - page, limit: paginação clássica (default 1 / 30)
      //
      // Resposta: { success, itens: RespostaInbox[], total, page, limit }
      if (action === 'listar_respostas') {
        const { busca = '', page = '1', limit = '30' } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);

        // Trazemos um teto generoso (500 mais recentes) de cada fonte e
        // paginamos no Node após o merge. Para volumes maiores, migramos
        // para uma VIEW SQL `vw_crm_inbox_respostas` com paginação real.
        const TETO_POR_FONTE = 500;

        // ── Respostas ──
        const { data: respostas, error: errR } = await supabase
          .from('email_respostas')
          .select('id, lead_id, campanha_id, de_email, de_nome, assunto, corpo_texto, classificacao, lido, recebido_em')
          .order('recebido_em', { ascending: false })
          .limit(TETO_POR_FONTE);
        if (errR) throw errR;

        // ── Opt-outs ──
        const { data: optouts, error: errO } = await supabase
          .from('email_optout')
          .select('id, email, motivo, campanha_origem_id, criado_em')
          .order('criado_em', { ascending: false })
          .limit(TETO_POR_FONTE);
        if (errO) throw errO;

        // ── Lookups em batch ──
        const leadIds = Array.from(new Set([
          ...((respostas || []).map(r => r.lead_id).filter(Boolean) as number[]),
        ]));
        const optoutEmails = Array.from(new Set(
          (optouts || []).map(o => (o.email || '').toLowerCase().trim()).filter(Boolean)
        ));
        const campanhaIds = Array.from(new Set([
          ...((respostas || []).map(r => r.campanha_id).filter(Boolean) as number[]),
          ...((optouts || []).map(o => o.campanha_origem_id).filter(Boolean) as number[]),
        ]));

        // Lead lookup (por id E por email — opt-out muitas vezes só tem email)
        const leadsPorId: Record<number, any> = {};
        const leadsPorEmail: Record<string, any> = {};
        if (leadIds.length > 0 || optoutEmails.length > 0) {
          let q = supabase.from('email_leads').select('id, nome, email, empresa_id');
          if (leadIds.length > 0 && optoutEmails.length > 0) {
            // OR composto: id IN (...) OR email IN (...)
            const idsCSV = leadIds.join(',');
            const emailsCSV = optoutEmails.map(e => `"${e}"`).join(',');
            q = q.or(`id.in.(${idsCSV}),email.in.(${emailsCSV})`);
          } else if (leadIds.length > 0) {
            q = q.in('id', leadIds);
          } else {
            q = q.in('email', optoutEmails);
          }
          const { data: leadsData, error: errL } = await q;
          if (errL) throw errL;
          for (const lead of leadsData || []) {
            leadsPorId[lead.id] = lead;
            if (lead.email) leadsPorEmail[lead.email.toLowerCase()] = lead;
          }
        }

        // Empresa lookup
        const empresaIds = Array.from(new Set(
          Object.values(leadsPorId).map((l: any) => l.empresa_id).filter(Boolean)
        )) as number[];
        const empresasPorId: Record<number, any> = {};
        if (empresaIds.length > 0) {
          const { data: emps, error: errE } = await supabase
            .from('email_empresas')
            .select('id, nome')
            .in('id', empresaIds);
          if (errE) throw errE;
          for (const e of emps || []) empresasPorId[e.id] = e;
        }

        // Campanha lookup
        const campanhasPorId: Record<number, any> = {};
        if (campanhaIds.length > 0) {
          const { data: camps, error: errC } = await supabase
            .from('email_campanhas')
            .select('id, nome')
            .in('id', campanhaIds);
          if (errC) throw errC;
          for (const c of camps || []) campanhasPorId[c.id] = c;
        }

        // ── Montar itens unificados ──
        type ItemInbox = {
          tipo: 'resposta' | 'opt_out';
          id: number;
          data_evento: string;
          lead_id: number | null;
          lead_nome: string | null;
          lead_email: string;
          empresa_id: number | null;
          empresa_nome: string | null;
          campanha_id: number | null;
          campanha_nome: string | null;
          assunto: string | null;
          corpo_texto: string | null;
          classificacao: string | null;
          lido: boolean;
          motivo_optout: string | null;
        };

        const itens: ItemInbox[] = [];

        for (const r of respostas || []) {
          const lead = r.lead_id != null ? leadsPorId[r.lead_id] : null;
          const empresa = lead?.empresa_id ? empresasPorId[lead.empresa_id] : null;
          const camp = r.campanha_id ? campanhasPorId[r.campanha_id] : null;
          itens.push({
            tipo: 'resposta',
            id: r.id,
            data_evento: r.recebido_em,
            lead_id: r.lead_id,
            lead_nome: lead?.nome ?? r.de_nome ?? null,
            lead_email: r.de_email,
            empresa_id: lead?.empresa_id ?? null,
            empresa_nome: empresa?.nome ?? null,
            campanha_id: r.campanha_id,
            campanha_nome: camp?.nome ?? null,
            assunto: r.assunto,
            // Preview do corpo (200 chars) — corpo completo fica em email_respostas
            corpo_texto: r.corpo_texto ? r.corpo_texto.substring(0, 400) : null,
            classificacao: r.classificacao || 'pendente',
            lido: !!r.lido,
            motivo_optout: null,
          });
        }

        for (const o of optouts || []) {
          const emailKey = (o.email || '').toLowerCase().trim();
          const lead = emailKey ? leadsPorEmail[emailKey] : null;
          const empresa = lead?.empresa_id ? empresasPorId[lead.empresa_id] : null;
          const camp = o.campanha_origem_id ? campanhasPorId[o.campanha_origem_id] : null;
          itens.push({
            tipo: 'opt_out',
            id: o.id,
            data_evento: o.criado_em,
            lead_id: lead?.id ?? null,
            lead_nome: lead?.nome ?? null,
            lead_email: o.email,
            empresa_id: lead?.empresa_id ?? null,
            empresa_nome: empresa?.nome ?? null,
            campanha_id: o.campanha_origem_id,
            campanha_nome: camp?.nome ?? null,
            assunto: null,
            corpo_texto: null,
            classificacao: null,
            lido: true,
            motivo_optout: o.motivo || 'Opt-out',
          });
        }

        // Ordenar por data desc
        itens.sort((a, b) => (b.data_evento || '').localeCompare(a.data_evento || ''));

        // Filtro de busca (pós-merge)
        let itensFiltrados = itens;
        if (busca && busca.trim().length > 0) {
          const q = busca.toLowerCase().trim();
          itensFiltrados = itens.filter(it =>
            (it.lead_nome || '').toLowerCase().includes(q) ||
            (it.lead_email || '').toLowerCase().includes(q) ||
            (it.empresa_nome || '').toLowerCase().includes(q) ||
            (it.assunto || '').toLowerCase().includes(q)
          );
        }

        const total = itensFiltrados.length;
        const offset = (pageNum - 1) * limitNum;
        const pageItems = itensFiltrados.slice(offset, offset + limitNum);

        return res.status(200).json({
          success: true,
          itens: pageItems,
          total,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil(total / limitNum),
        });
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 v1.3 — INVÁLIDOS (Aba "Inválidos" do Form Empresas)
      // ════════════════════════════════════════════════════════════
      // E-mails que falharam tecnicamente: email_fila WHERE status IN
      // ('bounce','erro'). Joins via embed para puxar lead/empresa/campanha
      // em uma única query, com fallback em camada Node para o caso de
      // FK quebrada (lead deletado, por exemplo).
      //
      // Parâmetros aceitos:
      //   - busca: string (nome, email, empresa, motivo) — opcional
      //   - page, limit: paginação clássica
      //
      // Resposta: { success, itens: InvalidoItem[], total, page, limit }
      if (action === 'listar_invalidos') {
        const { busca = '', page = '1', limit = '30' } = req.query as Record<string, string>;
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 200));
        const pageNum = Math.max(1, parseInt(page) || 1);
        const offset = (pageNum - 1) * limitNum;

        // Conta total (com filtro de busca aplicado depois para simplicidade)
        // — para volumes muito grandes podemos migrar para count_estimate.
        let query = supabase
          .from('email_fila')
          .select(
            'id, lead_id, campanha_id, destinatario_email, destinatario_nome, status, erro_detalhes, bounce_em, enviado_em, criado_em, ' +
            'email_leads(id, nome, empresa_id, email_empresas(id, nome)), ' +
            'email_campanhas(id, nome)',
            { count: 'exact' }
          )
          .in('status', ['bounce', 'erro'])
          .order('bounce_em', { ascending: false, nullsFirst: false })
          .order('criado_em', { ascending: false })
          .range(offset, offset + limitNum - 1);

        if (busca && busca.trim().length > 0) {
          const q = busca.trim();
          query = query.or(
            `destinatario_email.ilike.%${q}%,destinatario_nome.ilike.%${q}%,erro_detalhes.ilike.%${q}%`
          );
        }

        const { data: fila, error: errF, count } = await query;
        if (errF) throw errF;

        const itens = (fila || []).map((f: any) => {
          const lead = f.email_leads;
          const empresa = lead?.email_empresas;
          const camp = f.email_campanhas;
          return {
            fila_id: f.id,
            lead_id: f.lead_id,
            lead_nome: lead?.nome ?? f.destinatario_nome ?? null,
            empresa_id: lead?.empresa_id ?? null,
            empresa_nome: empresa?.nome ?? null,
            destinatario_email: f.destinatario_email,
            campanha_id: f.campanha_id,
            campanha_nome: camp?.nome ?? null,
            status: f.status as 'bounce' | 'erro',
            motivo: f.erro_detalhes ?? (f.status === 'bounce' ? 'Bounce (sem detalhe)' : 'Erro de envio'),
            bounce_em: f.bounce_em,
            enviado_em: f.enviado_em,
            criado_em: f.criado_em,
          };
        });

        return res.status(200).json({
          success: true,
          itens,
          total: count || 0,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil((count || 0) / limitNum),
        });
      }

      // ── LISTAR RESPONSÁVEIS ELEGÍVEIS (GC + SDR) ──────────────────────────────
      // 🆕 v1.7 (05/06/2026) — Usado pelo LeadFormModal quando o usuário logado
      // é Administrador: ele precisa escolher para quem o lead será reservado
      // (não pode reservar para si mesmo, pois Admin não atua operacionalmente).
      // GC/SDR não chamam essa action — eles são travados automaticamente em
      // si mesmos no lado do frontend.
      if (action === 'listar_responsaveis_lead') {
        const { data, error } = await supabase
          .from('app_users')
          .select('id, nome_usuario, tipo_usuario, email_usuario')
          .in('tipo_usuario', ['Gestão Comercial', 'SDR'])
          .order('tipo_usuario', { ascending: true })
          .order('nome_usuario', { ascending: true });

        if (error) {
          console.error('[crm-leads] listar_responsaveis_lead erro:', error.message);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
          success: true,
          responsaveis: data || [],
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 v1.9 (10/06/2026 — Vinculação em Lote) — Lista leads aptos
      // a vinculação em lote a uma campanha existente.
      //
      // Critérios:
      //  • apto_campanha = true
      //  • opt_out IS NULL OR false
      //  • funil_status != 'perdido'
      //  • vertical != 'CRECI' (🛡️ REGRA PERMANENTE: lead CRECI nunca muda)
      //  • NÃO vinculado a campanha em status ativa/pausada/agendada
      //  • reservado_por = responsavel_id (se informado — RBAC para não-admin)
      //
      // RBAC: Admin não passa responsavel_id (vê tudo); não-admin passa
      //       o próprio user.id (vê apenas leads sob sua responsabilidade).
      // ─────────────────────────────────────────────────────────
      if (action === 'listar_leads_para_vinculo_em_lote') {
        const responsavelIdQ = req.query.responsavel_id as string | undefined;
        const busca = (req.query.busca as string) || '';
        const limit = parseInt((req.query.limit as string) || '200');

        // Coletar IDs já vinculados a campanhas em status ativa/pausada/agendada
        // (decisão de produto 09/06/2026 — bloqueia duplicação simultânea).
        const { data: vinculosAtivos } = await supabase
          .from('email_lead_campanhas')
          .select('lead_id, email_campanhas!inner(status)')
          .in('email_campanhas.status', ['ativa', 'pausada', 'agendada']);

        const idsVinculados = Array.from(
          new Set((vinculosAtivos || []).map((v: any) => v.lead_id))
        );

        // Query principal — apto_campanha + filtros
        let query = supabase
          .from('email_leads')
          .select(`
            id, nome, email, cargo, vertical, reservado_por, funil_status,
            apto_campanha, opt_out, telefone, linkedin_url,
            email_empresas(id, nome)
          `)
          .eq('apto_campanha', true)
          .or('opt_out.is.null,opt_out.eq.false')
          .not('funil_status', 'eq', 'perdido')
          .not('vertical', 'eq', 'CRECI') // 🛡️ REGRA PERMANENTE CRECI
          .order('nome', { ascending: true })
          .limit(limit);

        if (responsavelIdQ) {
          query = query.eq('reservado_por', parseInt(responsavelIdQ));
        }
        if (busca) {
          query = query.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%,cargo.ilike.%${busca}%`);
        }
        if (idsVinculados.length > 0) {
          query = query.not('id', 'in', `(${idsVinculados.join(',')})`);
        }

        const { data: leads, error: errLeads } = await query;
        if (errLeads) return res.status(500).json({ success: false, error: errLeads.message });

        // Filtrar opt-outs globais (defesa em profundidade)
        const { data: optouts } = await supabase
          .from('email_optout')
          .select('email');
        const emailsOptout = new Set((optouts || []).map((o: any) => (o.email || '').toLowerCase().trim()));

        const filtered = (leads || []).filter(
          (l: any) => !emailsOptout.has((l.email || '').toLowerCase().trim())
        );

        return res.status(200).json({
          success: true,
          leads: filtered,
          total: filtered.length,
          ids_vinculados_bloqueados: idsVinculados.length,
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
                tags, notas, origem, criado_por, prospect_lead_id,
                // 🆕 v1.7 — Lead RBAC fix
                vertical, apto_campanha, reservado_por } = body;

        if (!nome || !email || !criado_por) {
          return res.status(400).json({ success: false, error: 'nome, email e criado_por são obrigatórios' });
        }

        // 🆕 v1.7 — vertical e reservado_por agora são obrigatórios (sem eles
        // o lead vira invisível para a action `leads_disponiveis` de campanha)
        if (!vertical || !String(vertical).trim()) {
          return res.status(400).json({
            success: false,
            error: 'vertical é obrigatória — sem ela o lead não fica elegível para campanhas',
          });
        }
        if (!reservado_por || typeof reservado_por !== 'number') {
          return res.status(400).json({
            success: false,
            error: 'reservado_por é obrigatório (id do responsável GC/SDR pelo lead)',
          });
        }

        // 🆕 v1.7 — Validar que reservado_por aponta para um usuário GC/SDR ativo
        const { data: respUser } = await supabase
          .from('app_users')
          .select('id, tipo_usuario')
          .eq('id', reservado_por)
          .maybeSingle();
        if (!respUser) {
          return res.status(400).json({
            success: false,
            error: `Usuário responsável (id=${reservado_por}) não encontrado em app_users`,
          });
        }
        if (!['Gestão Comercial', 'SDR', 'Administrador'].includes(respUser.tipo_usuario)) {
          // Permite Admin (caso ele crie um lead reservado a si mesmo em algum
          // cenário excepcional), mas bloqueia outros perfis não operacionais.
          return res.status(400).json({
            success: false,
            error: `Tipo de usuário inválido para responsabilizar por lead: ${respUser.tipo_usuario}`,
          });
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

        // 🆕 v1.7 — apto_campanha respeita o que veio do form (default true).
        // Se vier opt-out global, força apto_campanha=false como guarda-extra
        // (não faz sentido aptar p/ campanha um endereço que opt-out).
        const aptoFinal =
          (apto_campanha === undefined ? true : !!apto_campanha) && !optout;

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
            // 🆕 v1.7 — Lead RBAC fix
            vertical: String(vertical).trim(),
            apto_campanha: aptoFinal,
            apto_campanha_em: aptoFinal ? new Date().toISOString() : null,
            apto_campanha_por: aptoFinal ? criado_por : null,
            reservado_por,
            reservado_em: new Date().toISOString(),
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
        // 🆕 v1.8 (Fase A) — campanha_id opcional: quando informado,
        // o lead promovido é vinculado à campanha em sequência (mesmo
        // request, defesa em profundidade com rollback lógico em caso
        // de erro). Quando null/omitido, comportamento legado: lead
        // vai apenas para o CRM como "apto" (aguarda futura vinculação
        // pelo wizard de campanha).
        const { prospect_id, criado_por, campanha_id } = body;

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

          // 🆕 v1.8 (Fase A) — se foi pedido para vincular a campanha,
          // executar a vinculação MESMO no lead pré-existente. A função
          // helper aplica todas as validações (status, vertical, dono,
          // duplicação, opt-out) + enfileiramento se necessário.
          let vinculoCampanha: any = null;
          if (campanha_id) {
            // Buscar dados completos do lead existente para validação
            // (vertical e reservado_por podem ter sido editados desde
            // a criação — não confiar nos dados do prospect).
            const { data: leadCompleto } = await supabase
              .from('email_leads')
              .select('id, nome, email, vertical, reservado_por')
              .eq('id', leadExistente.id)
              .maybeSingle();

            if (!leadCompleto) {
              return res.status(500).json({
                success: false,
                error: 'Lead existente desapareceu entre buscas (erro de consistência)',
              });
            }

            const resultadoVinculo = await vincularLeadACampanha(
              supabase,
              leadCompleto,
              Number(campanha_id),
              criado_por
            );
            if (!resultadoVinculo.success) {
              // Importante: prospect já foi marcado como 'no_crm' acima.
              // Devolvemos erro 400 indicando que a vinculação falhou mas
              // o lead permanece no CRM. O frontend deve mostrar o erro
              // e atualizar a lista (lead saiu da aba "Meus Leads Salvos").
              return res.status(400).json({
                success: false,
                ja_existia: true,
                lead: leadExistente,
                error: resultadoVinculo.error,
              });
            }
            vinculoCampanha = resultadoVinculo.vinculo;
          }

          return res.status(200).json({
            success: true,
            lead: leadExistente,
            ja_existia: true,
            campanha: vinculoCampanha,
            mensagem: vinculoCampanha
              ? `Lead já estava no CRM e foi vinculado à campanha "${vinculoCampanha.campanha_nome}".`
              : 'Lead já estava no CRM. Prospect Engine atualizado.',
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
        //
        // 🐛 v1.8 (09/06/2026 — Fase A) — BUG FIX preexistente:
        //   Antes desta versão, este INSERT não populava `reservado_por`,
        //   o que tornava o lead INELEGÍVEL para qualquer campanha (a
        //   Fase B em crm-campanhas.ts trava `lead.reservado_por ===
        //   campanha.responsavel_id`). Bug histórico que só apareceu
        //   quando a action `listar_campanhas_disponiveis_para_lead`
        //   (v1.11) tentou filtrar campanhas elegíveis e sempre
        //   retornou vazio para leads vindos do Prospect Engine.
        //   Correção: herdar `prospect.reservado_por` (campo já
        //   populado em prospect_leads desde a pesquisa). Adicionamos
        //   também `apto_campanha=true` + auditoria para consistência
        //   com `criar_lead` (v1.7) — lead promovido nasce apto.
        const agoraIso = new Date().toISOString();
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
            // 🆕 v1.8 — Lead RBAC fix (bug preexistente):
            reservado_por: prospect.reservado_por || null,
            reservado_em: prospect.reservado_por ? agoraIso : null,
            apto_campanha: true,
            apto_campanha_em: agoraIso,
            apto_campanha_por: criado_por,
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

        // 🆕 v1.8 (Fase A) — vincular a campanha SE solicitado.
        // O helper aplica validações completas e enfileira em email_fila
        // quando a campanha já tem inicio_envio (status ativa/pausada).
        // Falha aqui NÃO desfaz o lead criado — o lead permanece no CRM
        // e o erro indica que apenas a vinculação falhou (operação parcial
        // consistente: lead apto a futuras vinculações).
        let vinculoCampanha: any = null;
        if (campanha_id) {
          const resultadoVinculo = await vincularLeadACampanha(
            supabase,
            novoLead,
            Number(campanha_id),
            criado_por
          );
          if (!resultadoVinculo.success) {
            // Devolve 207 (Multi-Status) — sucesso parcial. O frontend
            // deve mostrar o lead como criado + alerta da falha de vínculo.
            return res.status(207).json({
              success: true,
              lead: novoLead,
              empresa_id: empresaId,
              empresa_criada: empresasResult.empresas_criadas > 0,
              campanha: null,
              vinculo_falhou: true,
              error: resultadoVinculo.error,
            });
          }
          vinculoCampanha = resultadoVinculo.vinculo;
        }

        return res.status(201).json({
          success: true,
          lead: novoLead,
          empresa_id: empresaId,
          empresa_criada: empresasResult.empresas_criadas > 0,
          campanha: vinculoCampanha,
          mensagem: vinculoCampanha
            ? `Lead promovido e vinculado à campanha "${vinculoCampanha.campanha_nome}".`
            : 'Lead promovido para o CRM.',
        });
      }

      // ── PROMOVER CORRETOR CRECI PARA CAMPANHA ─────────────────────────────────
      // 🆕 v1.6 (05/06/2026) — Promove 1 corretor da tabela `corretores_creci`
      // para o CRM. Cria registro em `email_leads` com vertical='CRECI' e
      // empresa_id=null (corretor é PF, sem empresa). Marca `data_envio_adv`
      // no corretor para que a UI do CreciPage reflita a promoção.
      // Idempotente: se já existir lead com o mesmo email, apenas sincroniza
      // data_envio_adv e retorna ja_existia=true.
      if (action === 'promover_corretor_para_campanha') {
        const { corretor_id, criado_por } = body;

        if (!corretor_id || !criado_por) {
          return res.status(400).json({
            success: false,
            error: 'corretor_id e criado_por são obrigatórios',
          });
        }

        // 1. Buscar o corretor
        const { data: corretor, error: errCorretor } = await supabase
          .from('corretores_creci')
          .select('*')
          .eq('id', corretor_id)
          .maybeSingle();

        if (errCorretor) throw errCorretor;
        if (!corretor) {
          return res.status(404).json({ success: false, error: 'Corretor não encontrado' });
        }

        // 2. Determinar email — prioridade: email_creci > email_pessoal
        const emailRaw = corretor.email_creci || corretor.email_pessoal;
        if (!emailRaw || !String(emailRaw).trim()) {
          return res.status(400).json({
            success: false,
            error: 'Corretor sem email (email_creci e email_pessoal vazios) — não pode ser promovido para campanha',
          });
        }
        const emailNormalizado = String(emailRaw).toLowerCase().trim();

        // 3. Se já existe lead com o mesmo email, apenas sincronizar data_envio_adv
        const { data: leadExistente } = await supabase
          .from('email_leads')
          .select('id, nome')
          .eq('email', emailNormalizado)
          .maybeSingle();

        if (leadExistente) {
          await supabase
            .from('corretores_creci')
            .update({ data_envio_adv: new Date().toISOString() })
            .eq('id', corretor_id);

          console.log(`ℹ️ [crm-leads] Corretor "${corretor.nome}" já estava no CRM (lead ID ${leadExistente.id}) — data_envio_adv sincronizado`);
          return res.status(200).json({
            success: true,
            lead: leadExistente,
            ja_existia: true,
            mensagem: 'Corretor já estava no CRM. data_envio_adv sincronizado.',
          });
        }

        // 4. Verificar opt-out global
        const { data: optout } = await supabase
          .from('email_optout')
          .select('id')
          .eq('email', emailNormalizado)
          .maybeSingle();

        // 5. Criar email_lead (corretor PF — sem empresa)
        const { data: novoLead, error: errInsertLead } = await supabase
          .from('email_leads')
          .insert({
            empresa_id: null,                                  // corretor é PF
            prospect_lead_id: null,                            // não vem do Prospect Engine
            nome: String(corretor.nome || '').trim() || 'Sem nome',
            email: emailNormalizado,
            cargo: 'Corretor de Imóveis',
            telefone: corretor.celular || null,
            vertical: 'CRECI',
            origem: 'creci',
            criado_por,
            opt_out: !!optout,
            opt_out_em: optout ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (errInsertLead) {
          return res.status(500).json({
            success: false,
            error: `Erro ao criar lead no CRM: ${errInsertLead.message}`,
          });
        }

        // 6. Marcar data_envio_adv no corretor (timestamp da promoção)
        const { error: errUpdate } = await supabase
          .from('corretores_creci')
          .update({ data_envio_adv: new Date().toISOString() })
          .eq('id', corretor_id);

        if (errUpdate) {
          console.error(`⚠️ [crm-leads] Lead criado mas falhou ao atualizar data_envio_adv do corretor ${corretor_id}: ${errUpdate.message}`);
          // Não bloqueia — o lead já está no CRM
        }

        // 7. Registrar no histórico do lead
        await supabase.from('email_lead_historico').insert({
          lead_id: novoLead.id,
          tipo: 'lead_criado',
          descricao: `Corretor CRECI promovido para CRM (corretor ID ${corretor.id}, CRECI: ${corretor.creci || 's/CRECI'})`,
          criado_por,
        });

        console.log(`✅ [crm-leads] Corretor promovido: ${corretor.nome} <${emailNormalizado}> → CRM ID ${novoLead.id}`);
        return res.status(201).json({
          success: true,
          lead: novoLead,
          ja_existia: false,
          mensagem: 'Corretor enviado ao CRM com sucesso.',
        });
      }

      // ─────────────────────────────────────────────────────────
      // 🆕 v1.9 (10/06/2026 — Vinculação em Lote) — vincula N leads
      // a uma campanha em uma única operação, com alteração opcional
      // de vertical em lote.
      //
      // 🛡️ REGRA PERMANENTE — Vertical CRECI é BIDIRECIONALMENTE
      // BLINDADA: (1) lead CRECI nunca muda; (2) nenhum lead vira
      // CRECI. Defesa em profundidade (frontend já filtra).
      //
      // Body:
      //   lead_ids: number[]         (obrigatório, ≥ 1)
      //   campanha_id: number        (obrigatório)
      //   vertical_destino: string   (obrigatório, ≠ 'CRECI')
      //   criado_por: string         (obrigatório, email do usuário)
      //
      // Processo (não-transacional):
      //   Para cada lead:
      //     1. Bloqueia se lead.vertical === 'CRECI'
      //     2. Se lead.vertical ≠ vertical_destino → UPDATE vertical
      //        + histórico 'vertical_alterada'
      //     3. Chama vincularLeadACampanha (Fase A v1.8) — 7 validações
      //        + enfileiramento condicional em email_fila
      //     4. Coleta sucesso ou falha estruturada
      //
      // Retorno:
      //   { success, campanha_nome, total, sucessos,
      //     verticais_alteradas, falhas: [{lead_id, lead_nome, error}] }
      // ─────────────────────────────────────────────────────────
      if (action === 'vincular_em_lote_a_campanha') {
        const { lead_ids, campanha_id, vertical_destino, criado_por } = body;

        // ── Validações de entrada ──────────────────────────────
        if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
          return res.status(400).json({ success: false, error: 'lead_ids[] obrigatório (≥ 1 lead)' });
        }
        if (!campanha_id) {
          return res.status(400).json({ success: false, error: 'campanha_id obrigatório' });
        }
        if (!vertical_destino || !String(vertical_destino).trim()) {
          return res.status(400).json({ success: false, error: 'vertical_destino obrigatória' });
        }
        if (!criado_por) {
          return res.status(400).json({ success: false, error: 'criado_por obrigatório' });
        }

        // 🛡️ REGRA CRECI BIDIRECIONAL — entrada bloqueada
        if (vertical_destino === 'CRECI') {
          return res.status(400).json({
            success: false,
            error: 'Vertical CRECI não pode ser destino em vinculação em lote — base CRECI é exclusiva de corretores (PF) e não recebe leads de outras verticais.',
          });
        }

        // ── Buscar campanha (validações da camada de vinculação ainda rodam por lead) ──
        const { data: campanha, error: errCamp } = await supabase
          .from('email_campanhas')
          .select('id, nome, tipo, status, inicio_envio, data_encerramento')
          .eq('id', campanha_id)
          .maybeSingle();

        if (errCamp) throw errCamp;
        if (!campanha) {
          return res.status(404).json({ success: false, error: `Campanha ID ${campanha_id} não encontrada` });
        }
        if (campanha.tipo !== vertical_destino) {
          return res.status(400).json({
            success: false,
            error: `Inconsistência: vertical_destino="${vertical_destino}" ≠ campanha.tipo="${campanha.tipo}". Recarregue a lista de campanhas.`,
          });
        }
        if (!['ativa', 'pausada', 'agendada'].includes(campanha.status)) {
          return res.status(400).json({
            success: false,
            error: `Campanha "${campanha.nome}" está em status "${campanha.status}" — só aceita novos leads em ativa/pausada/agendada.`,
          });
        }

        // ── Buscar leads selecionados ──────────────────────────
        const { data: leads, error: errLeads } = await supabase
          .from('email_leads')
          .select('id, nome, email, vertical, reservado_por, apto_campanha, opt_out, funil_status')
          .in('id', lead_ids);

        if (errLeads) throw errLeads;
        if (!leads || leads.length === 0) {
          return res.status(404).json({ success: false, error: 'Nenhum lead encontrado para os IDs informados' });
        }

        // ── Loop de processamento ──────────────────────────────
        const resultados = {
          total: leads.length,
          sucessos: 0,
          verticais_alteradas: 0,
          falhas: [] as Array<{ lead_id: number; lead_nome: string; error: string }>,
        };

        for (const lead of leads) {
          // 🛡️ REGRA CRECI BIDIRECIONAL — saída bloqueada
          if (lead.vertical === 'CRECI') {
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: 'Lead CRECI não pode ter sua vertical alterada (regra permanente).',
            });
            continue;
          }

          // Validação adicional — lead apto e não-opt-out
          if (!lead.apto_campanha) {
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: 'Lead não está marcado como apto a campanhas (apto_campanha=false).',
            });
            continue;
          }

          let verticalAtualizada = lead.vertical;

          // ── Alteração de vertical (se necessário) ────────────
          if (lead.vertical !== vertical_destino) {
            const { error: errUpdate } = await supabase
              .from('email_leads')
              .update({
                vertical: vertical_destino,
                atualizado_em: new Date().toISOString(),
              })
              .eq('id', lead.id);

            if (errUpdate) {
              resultados.falhas.push({
                lead_id: lead.id,
                lead_nome: lead.nome,
                error: `Falha ao atualizar vertical: ${errUpdate.message}`,
              });
              continue;
            }

            verticalAtualizada = vertical_destino;
            resultados.verticais_alteradas++;

            // Histórico de mudança de vertical
            await supabase.from('email_lead_historico').insert({
              lead_id: lead.id,
              tipo: 'vertical_alterada',
              descricao: `Vertical alterada de "${lead.vertical || '—'}" para "${vertical_destino}" (vinculação em lote à campanha "${campanha.nome}")`,
              criado_por,
            });
          }

          // ── Vinculação à campanha (helper reaproveitado) ─────
          const resultadoVinculo = await vincularLeadACampanha(
            supabase,
            {
              id: lead.id,
              nome: lead.nome,
              email: lead.email,
              vertical: verticalAtualizada,
              reservado_por: lead.reservado_por,
            },
            campanha_id,
            criado_por
          );

          if (resultadoVinculo.success) {
            resultados.sucessos++;
          } else {
            resultados.falhas.push({
              lead_id: lead.id,
              lead_nome: lead.nome,
              error: resultadoVinculo.error || 'Erro desconhecido ao vincular',
            });
          }
        }

        console.log(
          `✅ [crm-leads/vincular_em_lote] ${resultados.sucessos}/${resultados.total} leads vinculados à campanha "${campanha.nome}" ` +
          `(${resultados.verticais_alteradas} verticais alteradas, ${resultados.falhas.length} falhas)`
        );

        return res.status(200).json({
          success: true,
          campanha_id: campanha.id,
          campanha_nome: campanha.nome,
          campanha_status: campanha.status,
          ...resultados,
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
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // 🆕 v1.4 — Whitelist de colunas editáveis (vide cabeçalho).
        //   Substitui o padrão antigo de `{ id, ...campos }` + deletes,
        //   que deixava passar JOINs embed e campos calculados.
        const campos = pickEditable(body, COLUNAS_EDITAVEIS_EMPRESA);
        campos.atualizado_em = new Date().toISOString();

        if (campos.dominio) campos.dominio = String(campos.dominio).toLowerCase().trim();

        const { data, error } = await supabase
          .from('email_empresas')
          .update(campos)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Empresa atualizada: ID ${id} (${Object.keys(campos).length - 1} campos)`);
        return res.status(200).json({ success: true, empresa: data });
      }

      // ── ATUALIZAR LEAD ───────────────────────────
      if (action === 'atualizar_lead') {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        // 🆕 v1.4 — Whitelist de colunas editáveis (vide cabeçalho).
        //   Resolve o bug "Could not find the 'email_empresas' column of
        //   'email_leads'" — o frontend enviava o JOIN embed no PATCH e o
        //   PostgREST falhava tentando UPDATE numa coluna fantasma.
        const campos = pickEditable(body, COLUNAS_EDITAVEIS_LEAD);
        campos.atualizado_em = new Date().toISOString();

        if (campos.email) campos.email = String(campos.email).toLowerCase().trim();

        const { data, error } = await supabase
          .from('email_leads')
          .update(campos)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ [crm-leads] Lead atualizado: ID ${id} (${Object.keys(campos).length - 1} campos)`);
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

// ════════════════════════════════════════════════════════════════
// 🆕 v1.8 (09/06/2026 — Fase A) — Helper: vincular lead a campanha
// ════════════════════════════════════════════════════════════════
//
// Encapsula toda a lógica de:
//  • Validações de elegibilidade da campanha (status, data, vertical, dono)
//  • Validações do lead (opt-out, duplicação simultânea)
//  • Insert em email_lead_campanhas
//  • Enfileiramento em email_fila (se campanha já tem inicio_envio)
//  • Atualização de total_destinatarios da campanha
//  • Registro de histórico
//
// Retorna `{ success: true, vinculo }` ou `{ success: false, error }`.
// Não lança exceções — todos os erros são retornados estruturados.
//
// Reutilizado por `promover_para_campanha` em dois caminhos:
//  (1) lead recém-criado (novoLead);
//  (2) lead pré-existente em email_leads (caso ja_existia=true).
//
// IMPORTANTE: a lógica de cálculo de `agendado_para` (step 1 = AGORA,
// step N = AGORA + delays acumulados) é IDÊNTICA à da ativação inicial
// em crm-campanhas.ts > mudar_status > 'ativa' (Fase 5A v1.6). Manter
// alinhamento se uma das duas mudar.
interface LeadParaVincular {
  id: number;
  nome: string;
  email: string;
  vertical: string;
  reservado_por: number;
}

interface ResultadoVinculo {
  success: boolean;
  error?: string;
  vinculo?: {
    campanha_id: number;
    campanha_nome: string;
    campanha_status: string;
    enfileirados: number;
  };
}

async function vincularLeadACampanha(
  supabase: any,
  lead: LeadParaVincular,
  campanhaId: number,
  criadoPor: string
): Promise<ResultadoVinculo> {
  // 1. Buscar campanha
  const { data: camp, error: errCamp } = await supabase
    .from('email_campanhas')
    .select('id, nome, status, tipo, responsavel_id, inicio_envio, data_encerramento, dominio_envio, unidade')
    .eq('id', campanhaId)
    .maybeSingle();

  if (errCamp) return { success: false, error: `Falha ao buscar campanha: ${errCamp.message}` };
  if (!camp) return { success: false, error: `Campanha ID ${campanhaId} não encontrada` };

  // 2. Validar status
  if (!['ativa', 'pausada', 'agendada'].includes(camp.status)) {
    return {
      success: false,
      error: `Campanha "${camp.nome}" está em status "${camp.status}" — só aceita novos leads em status ativa/pausada/agendada.`,
    };
  }

  // 3. Validar data_encerramento
  if (camp.data_encerramento) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (camp.data_encerramento < hoje) {
      return {
        success: false,
        error: `Campanha "${camp.nome}" já encerrou em ${camp.data_encerramento} — não aceita novos leads.`,
      };
    }
  }

  // 4. Validar match de vertical (Fase B trava)
  if (camp.tipo !== lead.vertical) {
    return {
      success: false,
      error: `Lead tem vertical "${lead.vertical}" e a campanha é da vertical "${camp.tipo}". Verticais incompatíveis.`,
    };
  }

  // 5. Validar match de responsável (Fase B trava)
  if (camp.responsavel_id !== lead.reservado_por) {
    return {
      success: false,
      error: 'Lead está reservado a outro usuário — não pode entrar em campanha sob responsabilidade diferente.',
    };
  }

  // 6. Defesa em profundidade — duplicação simultânea
  //    (decisão de produto 09/06/2026: bloquear lead em múltiplas
  //    campanhas ativa/pausada/agendada para evitar spam ao contato).
  const { data: vinculosExistentes } = await supabase
    .from('email_lead_campanhas')
    .select('campanha_id, email_campanhas!inner(status, nome)')
    .eq('lead_id', lead.id);

  const conflitos = (vinculosExistentes || []).filter(
    (v: any) => ['ativa', 'pausada', 'agendada'].includes(v.email_campanhas?.status)
  );
  if (conflitos.length > 0) {
    const nomes = conflitos.map((v: any) => `"${v.email_campanhas?.nome}"`).join(', ');
    return {
      success: false,
      error: `Lead já vinculado a campanha em andamento: ${nomes}. Aguarde conclusão ou desvincule antes.`,
    };
  }

  // 7. Verificar opt-out global (defesa em profundidade)
  const { data: optout } = await supabase
    .from('email_optout')
    .select('email')
    .eq('email', lead.email.toLowerCase().trim())
    .maybeSingle();
  if (optout) {
    return {
      success: false,
      error: 'Email está em opt-out global — não pode entrar em campanha.',
    };
  }

  // 8. Inserir vínculo
  const { error: errVinc } = await supabase
    .from('email_lead_campanhas')
    .insert({
      lead_id: lead.id,
      campanha_id: camp.id,
      status: 'ativa',
      step_atual: 1,
    });

  if (errVinc) {
    return {
      success: false,
      error: `Falha ao vincular lead à campanha: ${errVinc.message}`,
    };
  }

  // 9. Enfileirar em email_fila SE campanha já está rodando
  //    (inicio_envio populado = status ativa ou pausada após primeira
  //    ativação). Status='agendada' tem inicio_envio NULL — o
  //    enfileiramento ocorre depois, na ativação inicial em
  //    crm-campanhas.ts > mudar_status. Não precisamos fazer aqui.
  let enfileirados = 0;
  if (camp.inicio_envio) {
    const { data: steps, error: errSteps } = await supabase
      .from('email_campanha_steps')
      .select('id, ordem, delay_dias')
      .eq('campanha_id', camp.id)
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (errSteps) {
      // O vínculo foi feito — o lead aparece na campanha mas sem fila.
      // Manter consistência: retornar erro estruturado.
      return {
        success: false,
        error: `Vínculo criado mas falha ao ler steps para enfileirar: ${errSteps.message}`,
      };
    }

    if (steps && steps.length > 0) {
      const agora = new Date();
      const stepDates = new Map<number, string>();
      let cumDays = 0;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (i === 0) {
          // Primeiro step: envia no início (delay_dias do step 1 é ignorado).
          stepDates.set(s.id, agora.toISOString());
        } else {
          cumDays += Number(s.delay_dias) || 0;
          const dt = new Date(agora);
          dt.setDate(dt.getDate() + cumDays);
          stepDates.set(s.id, dt.toISOString());
        }
      }

      const filaRows = steps.map((s: any) => ({
        campanha_id: camp.id,
        step_id: s.id,
        lead_id: lead.id,
        destinatario_email: lead.email.toLowerCase().trim(),
        destinatario_nome: lead.nome || null,
        dominio_usado: camp.dominio_envio || null,
        status: 'pendente',
        agendado_para: stepDates.get(s.id),
      }));

      const { data: ins, error: errFila } = await supabase
        .from('email_fila')
        .insert(filaRows)
        .select('id');

      if (errFila) {
        return {
          success: false,
          error: `Vínculo criado mas falha ao enfileirar: ${errFila.message}`,
        };
      }
      enfileirados = ins?.length || 0;
    }
  }

  // 10. Atualizar total_destinatarios da campanha
  const { count: totalDest } = await supabase
    .from('email_lead_campanhas')
    .select('id', { count: 'exact', head: true })
    .eq('campanha_id', camp.id);

  await supabase
    .from('email_campanhas')
    .update({
      total_destinatarios: totalDest || 0,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', camp.id);

  // 11. Registrar no histórico do lead
  await supabase.from('email_lead_historico').insert({
    lead_id: lead.id,
    tipo: 'campanha_vinculada',
    descricao: `Vinculado à campanha "${camp.nome}" (ID ${camp.id})${enfileirados > 0 ? ` — ${enfileirados} envio(s) agendado(s)` : ''}`,
    criado_por: criadoPor,
  });

  console.log(`✅ [crm-leads/vincularLeadACampanha] Lead ${lead.id} (${lead.email}) → campanha ${camp.id} (${camp.nome}) [status=${camp.status}, enfileirados=${enfileirados}]`);

  return {
    success: true,
    vinculo: {
      campanha_id: camp.id,
      campanha_nome: camp.nome,
      campanha_status: camp.status,
      enfileirados,
    },
  };
}
