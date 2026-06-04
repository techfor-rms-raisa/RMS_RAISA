/**
 * api/crm-analytics.ts — Endpoint do Dashboard de Acompanhamento
 *
 * Caminho: api/crm-analytics.ts
 * Versão: 2.0 (Fase 8-fix2 — 04/06/2026)
 *
 * v2.0 (04/06/2026 — Fase 8-fix2): conectado às fontes reais de envio.
 *   A v1.0 entregou o esqueleto com `engajamento` zerado e
 *   `aguardando_motor: true` hardcoded — o pretexto era que o motor de
 *   disparo (cron + Resend + webhooks) ainda não existia. A Fase 7-MVP
 *   (03/06/2026) e a Fase 8-Inbox + fixes de hoje fecharam toda a cadeia
 *   de eventos, e `email_fila` já é populada em tempo real pelos
 *   webhooks (delivered/opened/clicked/bounced → enviado_em / entregue_em
 *   / aberto_em / clicado_em / bounce_em). Mudanças nesta versão:
 *     1) Nova função `calcularEngajamento`: 4 counts paralelos em
 *        `email_fila` filtrando por campanhas que o ator vê (RBAC) e
 *        pelo período selecionado. Calcula `total_enviado`,
 *        `taxa_abertura`, `taxa_clique`, `taxa_bounce`. A flag
 *        `aguardando_motor` passa a significar "sem envios no período"
 *        (true ⇔ total_enviado === 0) — não "motor inexistente".
 *     2) Nova função `calcularTaxasPorCampanha`: agrega taxas por
 *        campanha em UMA query só (Node-side aggregation). Substitui o
 *        bloco hardcoded de `listarAtivas`.
 *     3) `listarAtivas` agora consulta o Map e devolve `taxa_abertura` /
 *        `taxa_clique` reais por campanha (e `aguardando_motor` por
 *        campanha = true só quando aquela campanha ainda não enviou
 *        nada).
 *
 * v1.0 (Fase 8 — 01/06/2026): primeira versão (esqueleto pronto, dados
 *   de envio zerados até o motor de disparo existir).
 *
 * RBAC (espelha Pre_Projeto v3.1 §5.3):
 *  - Administrador, Gestão de R&S → vê tudo
 *  - Gestão Comercial, Analista de R&S, SDR → vê só campanhas onde é
 *    responsável (email_campanhas.responsavel_id = self).
 *  - Quem ESQUECEU de identificar o ator (sem user_email) → resposta sem
 *    dados (não vaza nada). Não dá 403 para evitar quebrar quem chama
 *    deslogado por acidente.
 *
 * Action única: GET dashboard_stats
 *   - Params: user_email (obrigatório), periodo ('semana'|'mes'|'trimestre'|'total', default 'mes')
 *   - Retorna o objeto consolidado que a página consome.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

// ════════════════════════════════════════════════════════════════
// RBAC
// ════════════════════════════════════════════════════════════════

/** Perfis que veem TODAS as campanhas (sem filtro de responsável). */
const PERFIS_VEEM_TUDO = ['Administrador', 'Gestão de R&S'];

/** Perfis que veem só as próprias campanhas (filtradas por responsavel_id). */
const PERFIS_VEEM_PROPRIAS = ['Gestão Comercial', 'Analista de R&S', 'SDR'];

const PERFIS_AUTORIZADOS = [...PERFIS_VEEM_TUDO, ...PERFIS_VEEM_PROPRIAS];

// ════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Método não permitido' });

  const action = (req.query.action as string) || '';

  try {
    if (action === 'dashboard_stats') {
      const userEmail = (req.query.user_email as string) || '';
      const periodo = ((req.query.periodo as string) || 'mes') as 'semana' | 'mes' | 'trimestre' | 'total';

      // Resolver ator (RBAC)
      const ator = await resolverAtor(supabase, userEmail);
      if (!ator) {
        return res.status(200).json({ success: true, stats: dashboardVazio(periodo, false) });
      }
      if (!PERFIS_AUTORIZADOS.includes(ator.tipo_usuario)) {
        return res.status(200).json({ success: true, stats: dashboardVazio(periodo, false) });
      }

      const veTudo = PERFIS_VEEM_TUDO.includes(ator.tipo_usuario);
      const filtroResp: { responsavel_id?: number } = veTudo ? {} : { responsavel_id: ator.id };

      // Janela do período (afeta apenas métricas data-sensíveis)
      const inicio = inicioDoPeriodo(periodo);

      // ── Status das campanhas (Seção 1) ──
      const statusCampanhas = await contarStatus(supabase, filtroResp);

      // ── Engajamento (Seção 2) ──
      // 🆕 v2.0 — dados reais consolidados pelos webhooks do Resend
      //   (delivered / opened / clicked / bounced → colunas datetime em
      //   email_fila). A flag `aguardando_motor` agora reflete somente
      //   "sem envios no período selecionado", não "motor inexistente".
      const engajamento = await calcularEngajamento(supabase, filtroResp, inicio);

      // ── Distribuição (Seção 3) ──
      const distribuicao = await calcularDistribuicao(supabase, filtroResp);

      // ── Campanhas em andamento (Seção 4) ──
      const ativas = await listarAtivas(supabase, filtroResp);

      // ── Saúde da base (Seção 5) ──
      const saudeBase = await calcularSaudeBase(supabase);

      return res.status(200).json({
        success: true,
        stats: {
          ator: { id: ator.id, nome: ator.nome_usuario, tipo: ator.tipo_usuario, ve_tudo: veTudo },
          periodo,
          inicio_periodo: inicio,
          status_campanhas: statusCampanhas,
          engajamento,
          distribuicao,
          campanhas_ativas: ativas,
          saude_base: saudeBase,
        },
      });
    }

    return res.status(400).json({ success: false, error: `GET action desconhecida: ${action}` });
  } catch (err: any) {
    console.error('[crm-analytics] Erro:', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro interno' });
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

interface Ator {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string;
}

async function resolverAtor(supabase: any, email: string): Promise<Ator | null> {
  if (!email) return null;
  const { data } = await supabase
    .from('app_users')
    .select('id, nome_usuario, email_usuario, tipo_usuario')
    .eq('email_usuario', email)
    .maybeSingle();
  return (data as Ator) ?? null;
}

function inicioDoPeriodo(p: string): string {
  const agora = new Date();
  const d = new Date(agora);
  if (p === 'semana') d.setDate(d.getDate() - 7);
  else if (p === 'mes') d.setMonth(d.getMonth() - 1);
  else if (p === 'trimestre') d.setMonth(d.getMonth() - 3);
  else return '1970-01-01T00:00:00Z'; // total
  return d.toISOString();
}

/** Aplica filtro de responsável se o ator vê só as próprias. */
function aplicarFiltroResp(query: any, filtro: { responsavel_id?: number }) {
  return filtro.responsavel_id !== undefined ? query.eq('responsavel_id', filtro.responsavel_id) : query;
}

async function contarStatus(supabase: any, filtro: { responsavel_id?: number }) {
  const status = ['rascunho', 'agendada', 'ativa', 'pausada', 'concluida'] as const;
  const resultados = await Promise.all(
    status.map(async (s) => {
      const q = supabase.from('email_campanhas').select('id', { count: 'exact', head: true }).eq('status', s);
      const { count } = await aplicarFiltroResp(q, filtro);
      return [s, count || 0] as const;
    })
  );
  const map = Object.fromEntries(resultados) as Record<(typeof status)[number], number>;
  const total = (Object.values(map) as number[]).reduce((a, b) => a + b, 0);
  return { ...map, total };
}

async function calcularDistribuicao(supabase: any, filtro: { responsavel_id?: number }) {
  // Busca todas as campanhas (com filtro RBAC) para agregar no app — evita
  // 6 queries com group-by que o Supabase JS não suporta nativamente.
  const q = supabase
    .from('email_campanhas')
    .select('id, tipo, dominio_envio, responsavel_id, total_destinatarios');
  const { data } = await aplicarFiltroResp(q, filtro);
  const campanhas = (data || []) as any[];

  // Resolve nomes dos responsáveis em lote
  const respIds = [...new Set(campanhas.map((c) => c.responsavel_id).filter(Boolean))] as number[];
  const nomesResp = await resolverNomesUsuarios(supabase, respIds);

  // Agrega
  const agg = (chave: (c: any) => string | null, label: string) => {
    const m = new Map<string, { rotulo: string; campanhas: number; destinatarios: number }>();
    for (const c of campanhas) {
      const k = chave(c);
      if (!k) continue;
      const cur = m.get(k) || { rotulo: k, campanhas: 0, destinatarios: 0 };
      cur.campanhas += 1;
      cur.destinatarios += c.total_destinatarios || 0;
      m.set(k, cur);
    }
    return { _label: label, itens: Array.from(m.values()).sort((a, b) => b.campanhas - a.campanhas) };
  };

  return {
    por_responsavel: agg(
      (c) => (c.responsavel_id ? nomesResp.get(c.responsavel_id) || `#${c.responsavel_id}` : null),
      'Responsável'
    ),
    por_vertical: agg((c) => c.tipo || null, 'Vertical'),
    por_dominio: agg((c) => c.dominio_envio || null, 'Domínio'),
  };
}

async function resolverNomesUsuarios(supabase: any, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from('app_users')
    .select('id, nome_usuario, tipo_usuario')
    .in('id', ids);
  return new Map(((data || []) as any[]).map((u) => [u.id as number, `${u.nome_usuario} · ${u.tipo_usuario}`]));
}

async function listarAtivas(supabase: any, filtro: { responsavel_id?: number }) {
  const q = supabase
    .from('email_campanhas')
    .select('id, nome, tipo, dominio_envio, responsavel_id, total_destinatarios, inicio_envio, criado_em')
    .in('status', ['ativa', 'agendada', 'pausada'])
    .order('inicio_envio', { ascending: false, nullsFirst: false });
  const { data } = await aplicarFiltroResp(q, filtro);

  const campanhas = (data || []) as any[];
  const respIds = [...new Set(campanhas.map((c) => c.responsavel_id).filter(Boolean))] as number[];
  const nomesResp = await resolverNomesUsuarios(supabase, respIds);

  // 🆕 v2.0 — taxas reais por campanha (1 query agregada para todas).
  const ids = campanhas.slice(0, 20).map((c) => c.id);
  const taxasPorCampanha = await calcularTaxasPorCampanha(supabase, ids);

  const agora = Date.now();
  return campanhas.slice(0, 20).map((c) => {
    const inicio = c.inicio_envio ? new Date(c.inicio_envio).getTime() : null;
    const diasRodando = inicio ? Math.floor((agora - inicio) / (1000 * 60 * 60 * 24)) : null;

    const t = taxasPorCampanha.get(c.id) || { total_enviado: 0, total_aberto: 0, total_clicado: 0 };
    const taxaAbertura = t.total_enviado > 0 ? Number(((t.total_aberto / t.total_enviado) * 100).toFixed(2)) : null;
    const taxaClique = t.total_enviado > 0 ? Number(((t.total_clicado / t.total_enviado) * 100).toFixed(2)) : null;

    return {
      id: c.id,
      nome: c.nome,
      vertical: c.tipo,
      dominio: c.dominio_envio,
      total_destinatarios: c.total_destinatarios || 0,
      responsavel: c.responsavel_id ? nomesResp.get(c.responsavel_id) || `#${c.responsavel_id}` : '—',
      dias_rodando: diasRodando,
      // 🆕 v2.0 — taxas reais (ou null/true quando ainda sem envios)
      taxa_abertura: taxaAbertura,
      taxa_clique: taxaClique,
      aguardando_motor: t.total_enviado === 0,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// 🆕 v2.0 — ENGAJAMENTO REAL (a partir de email_fila)
// ════════════════════════════════════════════════════════════════
// O cron `disparar-fila.ts` e o webhook `crm-webhook.ts` (v1.7)
// alimentam `email_fila` com timestamps de cada etapa do ciclo de vida
// do e-mail: enviado_em, entregue_em, aberto_em, clicado_em, bounce_em.
// Aqui agregamos esses timestamps por campanha visível ao ator (RBAC),
// dentro do período selecionado, devolvendo as 4 métricas do dashboard.
//
// Trade-off: 4 counts paralelos por chamada. Para o volume atual (até
// poucos milhares de envios/mês) é instantâneo. Quando o volume crescer,
// migrar para uma VIEW SQL `vw_crm_engajamento_periodo` com índice em
// `(campanha_id, enviado_em)` resolve sem mudar contrato.

async function calcularEngajamento(
  supabase: any,
  filtro: { responsavel_id?: number },
  inicioPeriodo: string,
) {
  // 1) Lista IDs das campanhas que o ator vê (RBAC já é aplicado aqui).
  const qCamp = supabase.from('email_campanhas').select('id');
  const { data: campanhasIds } = await aplicarFiltroResp(qCamp, filtro);
  const ids = ((campanhasIds || []) as any[]).map((c) => c.id);

  if (ids.length === 0) {
    return {
      total_enviado: 0,
      taxa_abertura: 0,
      taxa_clique: 0,
      taxa_bounce: 0,
      aguardando_motor: true,
    };
  }

  // 2) Constrói uma query base e aplica filtro de período em CADA campo
  //    datetime relevante (enviado_em / aberto_em / clicado_em / bounce_em).
  //    Para `periodo='total'` o início é Unix epoch ('1970-01-01...'), o
  //    que efetivamente desliga o filtro temporal.
  const usaPeriodo = inicioPeriodo !== '1970-01-01T00:00:00Z';
  const filtrar = (campoData: string) => {
    let q = supabase
      .from('email_fila')
      .select('id', { count: 'exact', head: true })
      .in('campanha_id', ids)
      .not(campoData, 'is', null);
    if (usaPeriodo) q = q.gte(campoData, inicioPeriodo);
    return q;
  };

  const [enviadoR, abertoR, clicadoR, bounceR] = await Promise.all([
    filtrar('enviado_em'),
    filtrar('aberto_em'),
    filtrar('clicado_em'),
    filtrar('bounce_em'),
  ]);

  const tEnviado = enviadoR.count || 0;
  const tAberto = abertoR.count || 0;
  const tClicado = clicadoR.count || 0;
  const tBounce = bounceR.count || 0;

  const pct = (n: number) =>
    tEnviado > 0 ? Number(((n / tEnviado) * 100).toFixed(2)) : 0;

  return {
    total_enviado: tEnviado,
    taxa_abertura: pct(tAberto),
    taxa_clique: pct(tClicado),
    taxa_bounce: pct(tBounce),
    aguardando_motor: tEnviado === 0,
  };
}

/**
 * 🆕 v2.0 — taxas reais POR campanha (usada pela tabela "Campanhas em
 * andamento"). Faz UMA query trazendo os campos relevantes de email_fila
 * para todas as campanhas pedidas e agrega no Node — evita N×3 queries
 * quando há até 20 campanhas ativas.
 */
async function calcularTaxasPorCampanha(
  supabase: any,
  ids: number[],
): Promise<Map<number, { total_enviado: number; total_aberto: number; total_clicado: number }>> {
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from('email_fila')
    .select('campanha_id, enviado_em, aberto_em, clicado_em')
    .in('campanha_id', ids);

  const m = new Map<number, { total_enviado: number; total_aberto: number; total_clicado: number }>();
  for (const r of (data || []) as any[]) {
    const cur =
      m.get(r.campanha_id) ||
      { total_enviado: 0, total_aberto: 0, total_clicado: 0 };
    if (r.enviado_em) cur.total_enviado++;
    if (r.aberto_em) cur.total_aberto++;
    if (r.clicado_em) cur.total_clicado++;
    m.set(r.campanha_id, cur);
  }
  return m;
}

async function calcularSaudeBase(supabase: any) {
  const [
    { count: optouts },
    { count: aptos },
    { count: semVertical },
  ] = await Promise.all([
    supabase.from('email_optout').select('id', { count: 'exact', head: true }),
    supabase.from('email_leads').select('id', { count: 'exact', head: true }).eq('apto_campanha', true),
    supabase
      .from('email_leads')
      .select('id', { count: 'exact', head: true })
      .eq('apto_campanha', true)
      .is('vertical', null),
  ]);

  return {
    optouts: optouts || 0,
    leads_aptos: aptos || 0,
    leads_sem_vertical: semVertical || 0,
  };
}

function dashboardVazio(periodo: string, autorizado: boolean) {
  return {
    ator: null,
    periodo,
    inicio_periodo: '1970-01-01T00:00:00Z',
    status_campanhas: { rascunho: 0, agendada: 0, ativa: 0, pausada: 0, concluida: 0, total: 0 },
    engajamento: { total_enviado: 0, taxa_abertura: 0, taxa_clique: 0, taxa_bounce: 0, aguardando_motor: true },
    distribuicao: {
      por_responsavel: { _label: 'Responsável', itens: [] },
      por_vertical: { _label: 'Vertical', itens: [] },
      por_dominio: { _label: 'Domínio', itens: [] },
    },
    campanhas_ativas: [],
    saude_base: { optouts: 0, leads_aptos: 0, leads_sem_vertical: 0 },
    nao_autorizado: !autorizado,
  };
}
