/**
 * api/revalidacao-leads-importados.ts — Listagem + Edição + Promoção + Anti-dup
 *
 * Caminho: api/revalidacao-leads-importados.ts
 * Versão: 1.5 (Sub-fase 3.D refino — 18/06/2026 — Anti-duplicidade)
 *
 * 🆕 v1.5 (18/06/2026 — Sub-fase 3.D refino: Anti-duplicidade de importação):
 *   Adiciona action POST `?action=verificar_duplicidade` que classifica cada
 *   email de uma lista contra 3 fontes simultaneamente:
 *     - `email_leads.email`     → status 'em_email_leads'  (lead ativo no CRM)
 *     - `email_optout.email`    → status 'em_opt_out'      (LGPD)
 *     - `prospect_leads.email`  → status 'em_revalidacao'  (em revalidação)
 *   Prioridade na classificação (LGPD primeiro):
 *     opt_out > email_leads > prospect_leads > novo
 *
 *   Resposta: { success: true, resultados: [{ email, status }] }
 *
 *   Frontend usa essa info no modal "Importar Lista de Leads" pra mostrar
 *   badges e impedir submit de duplicatas. Backend complementar
 *   (prospect-revalidate v1.4) faz defesa em profundidade no INSERT
 *   preventivo, rejeitando duplicatas sem consumir cota.
 *
 *   Limite: 100 emails por chamada (suficiente p/ o limite de 50 da
 *   importação atual, com folga p/ planilhas que exibem duplicatas
 *   internas — todas verificadas em 1 round-trip).
 *
 *   POST /api/revalidacao-leads-importados?action=verificar_duplicidade
 *       Body: { emails: string[] }
 *       Sem RBAC fino — duplicidade é informação global (qualquer GC/SDR
 *       precisa saber se outro usuário já está com aquele lead).
 *
 * v1.4 (18/06/2026 — Sub-fase 3.D refino: Promover libera TTL ativo):
 *   `handlePromoverManualmente` agora aceita status `ttl_nao_atingido`
 *   (TTL ativo) além de `nao_localizado`. Motivação: leads em TTL
 *   ficavam travados sem ação prática na aba — só Editar (Validar fica
 *   disabled em Etapa 0). Liberar Promover dá ao GC/SDR a opção de
 *   assumir o risco e seguir adiante. Se der bounce, fluxo natural
 *   (crm-webhook v1.15.1) move automaticamente para a aba E-mails
 *   Inválidos. Demais status (atualizado, promovido, trocou_empresa,
 *   dominio_invalido, opt_out) continuam recusados com 409.
 *
 * v1.3 (18/06/2026 — Sub-fase 3.D refino: Promover Lead manual):
 *   Adiciona action POST `?action=promover_manualmente` para permitir
 *   ao usuário (GC/SDR/Admin) promover MANUALMENTE um lead importado
 *   da aba "Leads Importados" para o CRM (`email_leads`), mesmo
 *   quando o cascade automatizado o deixou como `nao_localizado`.
 *
 *   Caso de uso: providers externos (Hunter, Apollo, Gemini, Snov.io)
 *   falham para emails inferidos de empresas brasileiras de médio
 *   porte. O lead fica retido na aba indefinidamente. A promoção
 *   manual é a "escotilha de escape": usuário assume o risco de
 *   bounce, promove o lead, vincula a uma campanha via "Vincular em
 *   Lote", e o fluxo natural (crm-webhook v1.15.1) cuida do bounce
 *   movendo o lead para a aba "E-mails Inválidos" se for o caso.
 *
 *   Endpoint:
 *
 *   POST /api/revalidacao-leads-importados?action=promover_manualmente
 *       Body: { lead_id: number, user_id: number }
 *       Validações:
 *         - lead deve existir e ter motor='importacao_lista'
 *         - lead deve estar em status_atualizacao='nao_localizado'
 *           (defesa em profundidade — UI já filtra)
 *         - user_id deve ser o reservado_por do lead OU Administrador
 *         - chama helper `lib/promover-email-lead.ts` com origem='importacao_manual'
 *           (helper aplica LGPD opt_out + idempotência)
 *       Resposta: {
 *         success: true,
 *         promovido: boolean,
 *         motivo: 'ok' | 'sem_email' | 'opt_out_lgpd' | 'lead_ja_existia' | 'erro_*',
 *         email_lead_id?: number,
 *         empresa_id?: number,
 *       }
 *
 * v1.2 (17/06/2026 — hotfix bundling colisão):
 *   Arquivo renomeado de `api/prospect-leads-importados.ts` para
 *   `api/revalidacao-leads-importados.ts` porque o nome anterior colidia
 *   com o hook React `useLeadsImportados.ts` durante o bundling do Vercel
 *   (`ncc` resolvia o nome do hook frontend para dentro do bundle do
 *   endpoint serverless, executando código React em runtime Node.js).
 *
 *   Sintoma: TypeError "Cannot read properties of null (reading 'useState')"
 *   ao chamar GET /api/prospect-leads-importados, sourcemap apontando
 *   incorretamente para a linha 149 do endpoint mas executando o hook.
 *
 *   Fix: nome do arquivo distinto do hook elimina a colisão. Conteúdo
 *   funcional 100% idêntico ao v1.1 — apenas o nome do arquivo mudou.
 *
 * v1.1 (17/06/2026 — Sub-fase 3.D — adiciona PATCH para edição)
 *
 * Endpoint dedicado da aba "Leads Importados" do BaseLeadsPage. Lê
 * `prospect_leads` filtrando exclusivamente os registros que vieram
 * pelo motor 'importacao_lista' (criados pelo handler prospect-revalidate
 * v1.1 quando a planilha é processada).
 *
 * RBAC contextual:
 *   - Admin/GR&S      → vê/edita todos os leads importados
 *   - GC/SDR comum    → vê/edita APENAS os reservados para o próprio user_id
 *   - Toggle "apenas_meus" pode forçar o filtro mesmo para admins
 *
 * Endpoints:
 *
 *   GET /api/prospect-leads-importados
 *       ?user_id=2
 *       [&apenas_meus=true|false]            (default: true)
 *       [&status=atualizado|promovido|trocou_empresa|nao_localizado|dominio_invalido|pendente]
 *       [&ordenacao=recente|antigo|proxima_validacao]   (default: recente)
 *       [&busca={texto livre em nome/email/empresa}]
 *       [&page=1&per_page=30|50|100]                    (default: page=1 per_page=30)
 *
 *   🆕 v1.1 — PATCH /api/prospect-leads-importados
 *       Body: { lead_id, user_id, novos_dados: {...campos...} }
 *       Campos editáveis: nome_completo, primeiro_nome, ultimo_nome, cargo,
 *                         email, linkedin_url, empresa_nome, empresa_dominio,
 *                         vertical, tier_pipeline, cidade, estado, reservado_por
 *       Validações:
 *         - lead deve existir e ter motor='importacao_lista'
 *         - user_id deve ser o reservado_por do lead OU Administrador
 *         - vertical: regra CRECI bidirectional (CRECI nunca sai, nada vira CRECI)
 *         - reservado_por: só Administrador pode alterar
 *       Resposta: { success: true, lead: LeadAtualizado, campos_ignorados: string[] }
 *
 * Resposta GET:
 *   {
 *     success: true,
 *     leads: LeadImportado[],
 *     total: number,
 *     page: number,
 *     per_page: number,
 *     cota_consumida_hoje: number,
 *     cota_residual: number,
 *   }
 *
 * Observação: a contagem da cota é apurada via tabela `prospect_revalidacao_log`
 * pela mesma lógica do prospect-revalidate.ts (single source of truth).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// 🆕 v1.3 (18/06/2026 — Sub-fase 3.D refino: Promover Lead manual)
import { promoverParaEmailLeads } from '../lib/promover-email-lead.js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COTA_DIARIA_POR_GESTOR = 50;
const PER_PAGE_DEFAULT = 30;
const PER_PAGE_ALLOWED = new Set([30, 50, 100]);

type Ordenacao = 'recente' | 'antigo' | 'proxima_validacao';

// ──────────────────────────────────────────────────────────────────────
// COTA RESIDUAL — calculada via COUNT no log (mesma lógica do revalidate)
// ──────────────────────────────────────────────────────────────────────

async function contarValidacoesHoje(user_id: number): Promise<number> {
  const agora = new Date();
  const offsetBrtMs = 3 * 60 * 60 * 1000;
  const brt = new Date(agora.getTime() - offsetBrtMs);
  const inicioBrt = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0));
  const inicioUtc = new Date(inicioBrt.getTime() + offsetBrtMs);

  const { count, error } = await supabase
    .from('prospect_revalidacao_log')
    .select('id', { count: 'exact', head: true })
    .eq('revalidado_por', user_id)
    .gte('revalidado_em', inicioUtc.toISOString());

  if (error) {
    console.error(`❌ [revalidacao-leads-importados/cota] ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER (router GET/PATCH)
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 🆕 v1.3 — agora também aceita POST (action=promover_manualmente)
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET')   return handleListar(req, res);
  if (req.method === 'PATCH') return handleEditar(req, res);
  // 🆕 v1.3 — POST com action no query string
  if (req.method === 'POST') {
    const action = (req.query.action ?? '').toString();
    if (action === 'promover_manualmente') return handlePromoverManualmente(req, res);
    // 🆕 v1.5 — Anti-duplicidade
    if (action === 'verificar_duplicidade') return handleVerificarDuplicidade(req, res);
    return res.status(400).json({
      success: false,
      error: `action desconhecida: '${action}'. Use ?action=promover_manualmente OU ?action=verificar_duplicidade.`,
    });
  }
  return res.status(405).json({ success: false, error: 'Use GET, PATCH ou POST.' });
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER GET — Listagem (idêntico à v1.0)
// ──────────────────────────────────────────────────────────────────────

async function handleListar(req: VercelRequest, res: VercelResponse) {
  // ── Query params
  const q = req.query as Record<string, string | undefined>;

  const user_id = Number(q.user_id);
  if (!user_id || isNaN(user_id)) {
    return res.status(400).json({ success: false, error: 'user_id obrigatório' });
  }

  const apenasMeus = (q.apenas_meus ?? 'true').toLowerCase() !== 'false';
  const status     = (q.status ?? '').trim() || null;
  const busca      = (q.busca  ?? '').trim() || null;

  let ordenacao: Ordenacao = 'recente';
  if (q.ordenacao === 'antigo' || q.ordenacao === 'proxima_validacao') {
    ordenacao = q.ordenacao;
  }

  const page = Math.max(1, Number(q.page) || 1);
  let per_page = Number(q.per_page) || PER_PAGE_DEFAULT;
  if (!PER_PAGE_ALLOWED.has(per_page)) per_page = PER_PAGE_DEFAULT;

  // ── Monta a query base
  let query = supabase
    .from('prospect_leads')
    .select('*', { count: 'exact' })
    .eq('motor', 'importacao_lista');

  if (apenasMeus) {
    query = query.eq('reservado_por', user_id);
  }

  if (status) {
    if (status === 'pendente') {
      // Pendente = nunca foi revalidado (status_atualizacao NULL)
      query = query.is('status_atualizacao', null);
    } else {
      query = query.eq('status_atualizacao', status);
    }
  }

  if (busca) {
    // Busca em nome, email e empresa
    const padrao = `%${busca.replace(/%/g, '\\%')}%`;
    query = query.or(
      `nome_completo.ilike.${padrao},email.ilike.${padrao},empresa_nome.ilike.${padrao}`
    );
  }

  // Ordenação
  if (ordenacao === 'recente') {
    query = query.order('criado_em', { ascending: false }).order('id', { ascending: false });
  } else if (ordenacao === 'antigo') {
    query = query.order('criado_em', { ascending: true }).order('id', { ascending: true });
  } else {
    // proxima_validacao: NULL primeiro (nunca validados), depois cronologicamente
    query = query
      .order('proxima_validacao', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true });
  }

  // Paginação
  const offsetIni = (page - 1) * per_page;
  const offsetFim = offsetIni + per_page - 1;
  query = query.range(offsetIni, offsetFim);

  const { data, error, count } = await query;

  if (error) {
    console.error(`❌ [revalidacao-leads-importados/listar] ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }

  // ── Cota (compartilhada com prospect-revalidate)
  const cotaConsumida = await contarValidacoesHoje(user_id);
  const cotaResidual  = Math.max(0, COTA_DIARIA_POR_GESTOR - cotaConsumida);

  return res.status(200).json({
    success: true,
    leads:   data ?? [],
    total:   count ?? 0,
    page,
    per_page,
    cota_diaria:         COTA_DIARIA_POR_GESTOR,
    cota_consumida_hoje: cotaConsumida,
    cota_residual:       cotaResidual,
  });
}

// ──────────────────────────────────────────────────────────────────────
// 🆕 v1.1 HANDLER PATCH — Edição (Sub-fase 3.D)
// ──────────────────────────────────────────────────────────────────────

/**
 * Campos editáveis. Outros campos do `prospect_leads` (id, motor,
 * buscado_por, status, criado_em, atualizado_em, status_atualizacao,
 * validado_em, proxima_validacao, review_manual, lead_anterior_id,
 * permite_revalidacao_externa) NÃO podem ser alterados via PATCH —
 * são calculados/auditados pelo sistema.
 */
const CAMPOS_EDITAVEIS_GERAIS = [
  'nome_completo', 'primeiro_nome', 'ultimo_nome', 'cargo',
  'email', 'linkedin_url', 'empresa_nome', 'empresa_dominio',
  'vertical', 'tier_pipeline', 'cidade', 'estado',
] as const;

/** Campos editáveis apenas por Administrador. */
const CAMPOS_EDITAVEIS_ADMIN = ['reservado_por'] as const;

async function handleEditar(req: VercelRequest, res: VercelResponse) {
  try {
    const body = req.body ?? {};
    const lead_id     = Number(body.lead_id);
    const user_id     = Number(body.user_id);
    const novos_dados = body.novos_dados ?? {};

    // ── (1) Validações de payload ─────────────────────────
    if (!lead_id || isNaN(lead_id)) {
      return res.status(400).json({ success: false, error: 'lead_id obrigatório' });
    }
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({ success: false, error: 'user_id obrigatório' });
    }
    if (typeof novos_dados !== 'object' || Array.isArray(novos_dados) || novos_dados === null) {
      return res.status(400).json({ success: false, error: 'novos_dados deve ser objeto' });
    }
    const chavesEnviadas = Object.keys(novos_dados);
    if (chavesEnviadas.length === 0) {
      return res.status(400).json({ success: false, error: 'novos_dados vazio' });
    }

    // ── (2) Busca lead existente ──────────────────────────
    const { data: lead, error: errBusca } = await supabase
      .from('prospect_leads')
      .select('*')
      .eq('id', lead_id)
      .eq('motor', 'importacao_lista')
      .maybeSingle();

    if (errBusca) {
      console.error(`❌ [revalidacao-leads-importados/editar] busca: ${errBusca.message}`);
      return res.status(500).json({ success: false, error: errBusca.message });
    }
    if (!lead) {
      return res.status(404).json({
        success: false,
        error: `Lead importado id=${lead_id} não encontrado (motor='importacao_lista').`,
      });
    }

    // ── (3) RBAC: dono OU Administrador ───────────────────
    const { data: user } = await supabase
      .from('app_users')
      .select('id, nome_usuario, tipo_usuario')
      .eq('id', user_id)
      .maybeSingle();

    if (!user) {
      return res.status(403).json({ success: false, error: 'Usuário não encontrado.' });
    }
    const isAdmin = user.tipo_usuario === 'Administrador';
    const isDono  = lead.reservado_por === user_id;
    if (!isAdmin && !isDono) {
      return res.status(403).json({
        success: false,
        error: `Apenas o responsável (id=${lead.reservado_por}) ou um Administrador pode editar este lead.`,
      });
    }

    // ── (4) Filtra campos permitidos ──────────────────────
    const camposPermitidos = isAdmin
      ? new Set<string>([...CAMPOS_EDITAVEIS_GERAIS, ...CAMPOS_EDITAVEIS_ADMIN])
      : new Set<string>(CAMPOS_EDITAVEIS_GERAIS);

    const camposIgnorados: string[] = [];
    const update: Record<string, any> = {};
    for (const k of chavesEnviadas) {
      if (!camposPermitidos.has(k)) {
        camposIgnorados.push(k);
        continue;
      }
      const v = (novos_dados as any)[k];
      // Strings vazias viram null (a base aceita NULL nesses campos)
      if (typeof v === 'string' && v.trim() === '') {
        update[k] = null;
      } else if (typeof v === 'string') {
        update[k] = v.trim();
      } else {
        update[k] = v;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        success: false,
        error: `Nenhum campo editável enviado. Ignorados: ${camposIgnorados.join(', ') || '—'}.`,
      });
    }

    // ── (5) Regra CRECI bidirectional ─────────────────────
    if ('vertical' in update) {
      const verticalAtual = (lead.vertical ?? '').toString();
      const verticalNova  = (update.vertical ?? '').toString();
      const ehCreciAtual  = verticalAtual.toUpperCase() === 'CRECI';
      const ehCreciNovo   = verticalNova.toUpperCase()  === 'CRECI';
      if (ehCreciAtual && !ehCreciNovo) {
        return res.status(409).json({
          success: false,
          error: 'Lead CRECI não pode ter sua vertical alterada (regra LGPD/contratual).',
        });
      }
      if (!ehCreciAtual && ehCreciNovo) {
        return res.status(409).json({
          success: false,
          error: 'Lead não-CRECI não pode ser convertido em CRECI (regra LGPD/contratual).',
        });
      }
    }

    // ── (6) Email: normaliza lowercase + trim ─────────────
    if ('email' in update && typeof update.email === 'string') {
      update.email = update.email.toLowerCase().trim();
    }

    // ── (7) Bump atualizado_em ────────────────────────────
    update.atualizado_em = new Date().toISOString();

    // ── (8) UPDATE ────────────────────────────────────────
    const { data: leadAtualizado, error: errUpd } = await supabase
      .from('prospect_leads')
      .update(update)
      .eq('id', lead_id)
      .select('*')
      .single();

    if (errUpd) {
      console.error(`❌ [revalidacao-leads-importados/editar] UPDATE: ${errUpd.message}`);
      return res.status(500).json({ success: false, error: errUpd.message });
    }

    console.log(
      `✏️ [revalidacao-leads-importados/editar] lead_id=${lead_id} ` +
      `editado por user_id=${user_id} (${isAdmin ? 'Admin' : 'Dono'}). ` +
      `Campos: ${Object.keys(update).filter(k => k !== 'atualizado_em').join(', ')}.` +
      (camposIgnorados.length > 0 ? ` Ignorados: ${camposIgnorados.join(', ')}.` : '')
    );

    return res.status(200).json({
      success: true,
      lead:    leadAtualizado,
      campos_ignorados: camposIgnorados,
    });
  } catch (err: any) {
    console.error(`❌ [revalidacao-leads-importados/editar] exceção:`, err);
    return res.status(500).json({ success: false, error: err?.message || 'erro interno' });
  }
}

// ──────────────────────────────────────────────────────────────────────
// 🆕 v1.3 HANDLER POST — Promover Lead Manualmente (Sub-fase 3.D refino)
// ──────────────────────────────────────────────────────────────────────

/**
 * Promove um lead importado MANUALMENTE para `email_leads`, mesmo quando
 * o cascade automatizado deixou-o como `nao_localizado`. Caso de uso:
 * providers externos falharam para emails inferidos de empresas BR de
 * médio porte. Usuário assume o risco de bounce e promove para destravar
 * o fluxo.
 *
 * Fluxo:
 *   1. Valida payload (lead_id, user_id).
 *   2. Busca lead em prospect_leads (motor='importacao_lista').
 *   3. RBAC: dono (reservado_por) OU Administrador.
 *   4. Defesa em profundidade: status_atualizacao deve ser 'nao_localizado'.
 *      (UI já filtra, mas backend valida pra evitar bypass.)
 *   5. Resolve `criado_por` (nome_usuario do user_id).
 *   6. Chama helper `promoverParaEmailLeads` com origem='importacao_manual'.
 *      O helper aplica salvaguardas LGPD (opt_out) + idempotência (dedup
 *      por email).
 *   7. Retorna resultado completo para o frontend tratar UX.
 *
 * Resposta:
 *   {
 *     success: true,
 *     promovido: boolean,
 *     motivo: 'ok' | 'sem_email' | 'opt_out_lgpd' | 'lead_ja_existia' | 'erro_*',
 *     email_lead_id?: number,
 *     empresa_id?: number,
 *   }
 *
 * Observação importante sobre `motivo`:
 *   - 'ok'              → promoveu com sucesso; lead some da aba
 *   - 'lead_ja_existia' → lead já estava em email_leads; helper DELETA
 *                         do prospect_leads (lead some da aba também)
 *   - 'opt_out_lgpd'    → bloqueado por LGPD; lead permanece na aba
 *   - 'sem_email'       → email faltando no prospect; UI deve sugerir Editar
 *   - 'erro_*'          → falha técnica; lead permanece na aba
 */
async function handlePromoverManualmente(req: VercelRequest, res: VercelResponse) {
  try {
    const body = req.body ?? {};
    const lead_id = Number(body.lead_id);
    const user_id = Number(body.user_id);

    // ── (1) Validações de payload ─────────────────────────
    if (!lead_id || isNaN(lead_id)) {
      return res.status(400).json({ success: false, error: 'lead_id obrigatório' });
    }
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({ success: false, error: 'user_id obrigatório' });
    }

    // ── (2) Busca prospect existente ───────────────────────
    const { data: prospect, error: errBusca } = await supabase
      .from('prospect_leads')
      .select(`
        id, nome_completo, email, cargo, linkedin_url,
        empresa_nome, empresa_dominio, empresa_setor,
        cidade, estado, vertical, reservado_por,
        motor, status_atualizacao, permite_revalidacao_externa
      `)
      .eq('id', lead_id)
      .eq('motor', 'importacao_lista')
      .maybeSingle();

    if (errBusca) {
      console.error(`❌ [revalidacao-leads-importados/promover] busca: ${errBusca.message}`);
      return res.status(500).json({ success: false, error: errBusca.message });
    }
    if (!prospect) {
      return res.status(404).json({
        success: false,
        error: `Lead importado id=${lead_id} não encontrado (motor='importacao_lista').`,
      });
    }

    // ── (3) RBAC: dono OU Administrador ───────────────────
    const { data: user } = await supabase
      .from('app_users')
      .select('id, nome_usuario, tipo_usuario')
      .eq('id', user_id)
      .maybeSingle();

    if (!user) {
      return res.status(403).json({ success: false, error: 'Usuário não encontrado.' });
    }
    const isAdmin = user.tipo_usuario === 'Administrador';
    const isDono  = prospect.reservado_por === user_id;
    if (!isAdmin && !isDono) {
      return res.status(403).json({
        success: false,
        error: `Apenas o responsável (id=${prospect.reservado_por}) ou um Administrador pode promover este lead.`,
      });
    }

    // ── (4) Defesa em profundidade: status_atualizacao deve permitir promoção ──
    //   A UI só mostra o botão para 'nao_localizado' e 'ttl_nao_atingido'
    //   (v1.3 + v1.4), mas validamos no backend para evitar bypass via
    //   chamada direta ao endpoint.
    //   - 'nao_localizado'    → cascade falhou, usuário assume risco de bounce
    //   - 'ttl_nao_atingido'  → lead em TTL travado, usuário libera manualmente
    //   - demais (atualizado, promovido, trocou_empresa, dominio_invalido,
    //     opt_out) → não devem chegar aqui (UI esconde o botão)
    const STATUS_PROMOVIVEIS = new Set<string>(['nao_localizado', 'ttl_nao_atingido']);
    if (!STATUS_PROMOVIVEIS.has(String(prospect.status_atualizacao ?? ''))) {
      return res.status(409).json({
        success: false,
        error: `Promoção manual permitida apenas para leads com status 'nao_localizado' ou 'ttl_nao_atingido' (TTL ativo). ` +
               `Status atual: '${prospect.status_atualizacao ?? 'pendente'}'. ` +
               `Use o botão Validar para os demais casos.`,
      });
    }

    // ── (5) Resolve criado_por (nome_usuario) ─────────────
    const criadoPor = user.nome_usuario || `user_${user_id}`;

    // ── (6) Chama helper com origem manual ────────────────
    const resultado = await promoverParaEmailLeads({
      supabase,
      prospect: prospect as any,
      criado_por: criadoPor,
      origem: 'importacao_manual',
    });

    if (resultado.promovido) {
      console.log(
        `🚀 [revalidacao-leads-importados/promover] MANUAL lead_id=${lead_id} ` +
        `→ email_lead_id=${resultado.email_lead_id} por user_id=${user_id} ` +
        `(${isAdmin ? 'Admin' : 'Dono'})`
      );
    } else {
      console.warn(
        `⚠️ [revalidacao-leads-importados/promover] MANUAL lead_id=${lead_id} ` +
        `NÃO promovido (motivo=${resultado.motivo}) por user_id=${user_id}`
      );
    }

    return res.status(200).json({
      success: true,
      promovido:     resultado.promovido,
      motivo:        resultado.motivo,
      email_lead_id: resultado.email_lead_id,
      empresa_id:    resultado.empresa_id,
    });

  } catch (err: any) {
    console.error(`❌ [revalidacao-leads-importados/promover] exceção:`, err);
    return res.status(500).json({ success: false, error: err?.message || 'erro interno' });
  }
}

// ──────────────────────────────────────────────────────────────────────
// 🆕 v1.5 HANDLER POST — Verificar Duplicidade (Sub-fase 3.D refino)
// ──────────────────────────────────────────────────────────────────────

/** Status de duplicidade retornado por email. Ordem de precedência:
 *  opt_out > email_leads > revalidacao > novo. */
type StatusDuplicidade = 'novo' | 'em_email_leads' | 'em_opt_out' | 'em_revalidacao';

const LIMITE_EMAILS_POR_VERIFICACAO = 100;

/**
 * Verifica em 1 round-trip se cada email da lista já existe em alguma
 * das 3 fontes que bloqueiam importação:
 *
 *   - `email_optout.email`    → 'em_opt_out'      (LGPD — prioridade máxima)
 *   - `email_leads.email`     → 'em_email_leads'  (lead ativo no CRM)
 *   - `prospect_leads.email`  → 'em_revalidacao'  (em revalidação/prospecção)
 *
 * Quando o mesmo email aparece em mais de uma fonte, prevalece a
 * classificação mais restritiva (opt_out vence email_leads, que vence
 * prospect_leads).
 *
 * Sem RBAC — duplicidade é informação global. Um GC/SDR precisa saber
 * que outro já está trabalhando aquele lead (mesmo que não veja o
 * registro na própria aba "apenas meus").
 *
 * Resposta:
 *   {
 *     success: true,
 *     resultados: [{ email: string, status: StatusDuplicidade }]
 *   }
 *
 * Performance: 3 SELECTs paralelos com `IN (...)` cobrem até
 * LIMITE_EMAILS_POR_VERIFICACAO (100) emails em ~1 round-trip cada,
 * paralelos via Promise.all. Sets em memória pra lookup O(1).
 */
async function handleVerificarDuplicidade(req: VercelRequest, res: VercelResponse) {
  try {
    const body = req.body ?? {};
    const emailsBrutos = body.emails;

    // ── (1) Validações de payload ─────────────────────────
    if (!Array.isArray(emailsBrutos)) {
      return res.status(400).json({ success: false, error: 'emails deve ser um array' });
    }
    if (emailsBrutos.length === 0) {
      return res.status(200).json({ success: true, resultados: [] });
    }
    if (emailsBrutos.length > LIMITE_EMAILS_POR_VERIFICACAO) {
      return res.status(400).json({
        success: false,
        error: `Máximo de ${LIMITE_EMAILS_POR_VERIFICACAO} emails por verificação. Recebido: ${emailsBrutos.length}.`,
      });
    }

    // Normaliza (lowercase + trim) e remove vazios/strings inválidas.
    // Mantém Set p/ dedup interno, mas devolvemos resultado por email
    // ORIGINAL (não normalizado) para o caller poder associar.
    const mapaOriginalParaNorm = new Map<string, string>();
    for (const e of emailsBrutos) {
      if (typeof e !== 'string') continue;
      const norm = e.toLowerCase().trim();
      if (!norm) continue;
      mapaOriginalParaNorm.set(e, norm);
    }
    const emailsNorm = Array.from(new Set(mapaOriginalParaNorm.values()));

    if (emailsNorm.length === 0) {
      return res.status(200).json({ success: true, resultados: [] });
    }

    // ── (2) 3 SELECTs paralelos ───────────────────────────
    const [resEmailLeads, resOptout, resProspectLeads] = await Promise.all([
      supabase
        .from('email_leads')
        .select('email')
        .in('email', emailsNorm),
      supabase
        .from('email_optout')
        .select('email')
        .in('email', emailsNorm),
      supabase
        .from('prospect_leads')
        .select('email')
        .in('email', emailsNorm),
    ]);

    if (resEmailLeads.error) {
      console.error(`❌ [revalidacao-leads-importados/verificar_dup] email_leads: ${resEmailLeads.error.message}`);
      return res.status(500).json({ success: false, error: resEmailLeads.error.message });
    }
    if (resOptout.error) {
      console.error(`❌ [revalidacao-leads-importados/verificar_dup] email_optout: ${resOptout.error.message}`);
      return res.status(500).json({ success: false, error: resOptout.error.message });
    }
    if (resProspectLeads.error) {
      console.error(`❌ [revalidacao-leads-importados/verificar_dup] prospect_leads: ${resProspectLeads.error.message}`);
      return res.status(500).json({ success: false, error: resProspectLeads.error.message });
    }

    // Sets de lookup O(1)
    const setEmailLeads     = new Set<string>((resEmailLeads.data     ?? []).map(r => (r.email ?? '').toLowerCase().trim()));
    const setOptout         = new Set<string>((resOptout.data         ?? []).map(r => (r.email ?? '').toLowerCase().trim()));
    const setProspectLeads  = new Set<string>((resProspectLeads.data  ?? []).map(r => (r.email ?? '').toLowerCase().trim()));

    // ── (3) Classifica cada email (mantém ordem original do input) ──
    const resultados: Array<{ email: string; status: StatusDuplicidade }> = [];
    for (const original of emailsBrutos) {
      if (typeof original !== 'string') continue;
      const norm = original.toLowerCase().trim();
      if (!norm) continue;

      let status: StatusDuplicidade = 'novo';
      // Prioridade: LGPD > CRM > revalidação
      if (setOptout.has(norm))             status = 'em_opt_out';
      else if (setEmailLeads.has(norm))    status = 'em_email_leads';
      else if (setProspectLeads.has(norm)) status = 'em_revalidacao';

      resultados.push({ email: original, status });
    }

    const contagem = {
      novo:           resultados.filter(r => r.status === 'novo').length,
      em_email_leads: resultados.filter(r => r.status === 'em_email_leads').length,
      em_opt_out:     resultados.filter(r => r.status === 'em_opt_out').length,
      em_revalidacao: resultados.filter(r => r.status === 'em_revalidacao').length,
    };
    console.log(
      `🔍 [revalidacao-leads-importados/verificar_dup] ` +
      `recebidos=${emailsBrutos.length} novos=${contagem.novo} ` +
      `crm=${contagem.em_email_leads} optout=${contagem.em_opt_out} ` +
      `reval=${contagem.em_revalidacao}`
    );

    return res.status(200).json({
      success: true,
      resultados,
    });

  } catch (err: any) {
    console.error(`❌ [revalidacao-leads-importados/verificar_dup] exceção:`, err);
    return res.status(500).json({ success: false, error: err?.message || 'erro interno' });
  }
}
