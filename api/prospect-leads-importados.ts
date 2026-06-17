/**
 * api/prospect-leads-importados.ts — Listagem dos leads importados via "Importar Lista de Leads"
 *
 * Caminho: api/prospect-leads-importados.ts
 * Versão: 1.0 (Sub-fase 3.C — 17/06/2026)
 *
 * Endpoint dedicado da aba "Leads Importados" do BaseLeadsPage. Lê
 * `prospect_leads` filtrando exclusivamente os registros que vieram
 * pelo motor 'importacao_lista' (criados pelo handler prospect-revalidate
 * v1.1 quando a planilha é processada).
 *
 * RBAC contextual:
 *   - Admin/GR&S      → vê todos os leads importados (sem filtro reservado_por)
 *   - GC/SDR comum    → vê APENAS os reservados para o próprio user_id
 *   - Toggle "apenas_meus" pode forçar o filtro mesmo para admins
 *
 * Endpoints:
 *   GET /api/prospect-leads-importados
 *       ?user_id=2
 *       [&apenas_meus=true|false]            (default: true)
 *       [&status=atualizado|promovido|trocou_empresa|nao_localizado|dominio_invalido|pendente]
 *       [&ordenacao=recente|antigo|proxima_validacao]   (default: recente)
 *       [&busca={texto livre em nome/email/empresa}]
 *       [&page=1&per_page=30|50|100]                    (default: page=1 per_page=30)
 *
 * Resposta:
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
    console.error(`❌ [prospect-leads-importados/cota] ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Use GET.' });
  }

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
    console.error(`❌ [prospect-leads-importados] ${error.message}`);
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
