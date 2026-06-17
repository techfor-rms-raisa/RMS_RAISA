/**
 * api/revalidacao-leads-importados.ts — Listagem + Edição dos leads importados
 *
 * Caminho: api/revalidacao-leads-importados.ts
 * Versão: 1.2 (Sub-fase 3.D — 17/06/2026 — RENOMEADO de prospect-leads-importados.ts)
 *
 * 🆕 v1.2 (17/06/2026 — hotfix bundling colisão):
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
  // 🆕 v1.1 — agora também aceita PATCH
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET')   return handleListar(req, res);
  if (req.method === 'PATCH') return handleEditar(req, res);
  return res.status(405).json({ success: false, error: 'Use GET ou PATCH.' });
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
