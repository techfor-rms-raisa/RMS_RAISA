/**
 * api/crm-analytics.ts — Endpoint do Dashboard de Acompanhamento
 *
 * Caminho: api/crm-analytics.ts
 * Versão: 2.4 (21/06/2026)
 *
 * v2.4 (21/06/2026 — Fix limite de 1000 do Supabase JS): refator cirúrgico
 *   de 2 trechos que sofriam do limite default de 1000 linhas por SELECT
 *   do cliente Supabase JS. Substituídos por agregação no Postgres via
 *   RPC functions — mesmo padrão do `calcularEngajamento` que já estava
 *   correto via `{count: 'exact', head: true}`.
 *
 *   Bug em Production (validado por SELECT direto em 21/06/2026):
 *     • CRECI 01 (id=3): 3.652 linhas em `email_fila`, 2.387 enviados no
 *       mês. O Painel Campanha mostrava 872 (subset das 1.000 primeiras
 *       linhas, das quais 872 tinham `enviado_em` populado).
 *     • Tabela "Campanhas em andamento" da Visão Geral: taxas calculadas
 *       sobre amostra truncada (impacto silencioso porque exibe % e não
 *       count absoluto).
 *
 *   Causa raiz:
 *     • action `metricas_por_step` puxava `email_fila` com `.select(...)`
 *       e agregava no Node — limite de 1000 truncava.
 *     • helper `calcularTaxasPorCampanha` idem.
 *     • helper `calcularEngajamento` usa `head: true` (só conta no
 *       Postgres, não trafega linhas) → intocado.
 *
 *   Fix (regra 14 — sem gambiarra de `.range(0, 49999)`):
 *     1) action `metricas_por_step`: chama `supabase.rpc(
 *        'crm_metricas_por_step', { p_campanha_id, p_inicio })`.
 *        Mapeia retorno via Map<step_id, métricas> e preenche os steps
 *        ordenados (mantém contrato JSON 100% idêntico).
 *     2) helper `calcularTaxasPorCampanha`: chama `supabase.rpc(
 *        'crm_taxas_por_campanha', { p_campanha_ids })`. Retorno
 *        Map<campanha_id, totais> idêntico ao anterior.
 *
 *   IMPORTANTE: BIGINT em RPC retorna como string em JSON. Wrapper
 *   `Number()` em cada campo numérico (volumes < 9 trilhões → sem
 *   precision loss).
 *
 *   PRÉ-REQUISITO: `sql/2026-06-21_analytics_rpc_functions.sql` aplicado
 *   ANTES do deploy deste arquivo (regra do projeto). Se as functions
 *   não existirem, o endpoint retornará 500 com mensagem clara.
 *
 *   Frontend NÃO muda — contrato JSON do backend é idêntico
 *   (AcompanhamentoPage v3.1 e PainelCampanhaTab v1.1 permanecem em
 *   Production sem alteração).
 *
 * v2.3 (21/06/2026): filtro de campanha específica no frame Engajamento
 *   + coluna OPT-OUT (Opção B) no metricas_por_step.
 *
 * v2.2 (21/06/2026): aba "Painel Campanha" + filtro de status no frame
 *   "Engajamento & Entregabilidade" da aba "Visão Geral".
 *
 * v2.1 (12/06/2026): substituição de TAXA CLIQUE por TAXA RESPOSTA.
 * v2.0 (04/06/2026 — Fase 8-fix2): conectado às fontes reais de envio.
 * v1.0 (Fase 8 — 01/06/2026): primeira versão.
 *
 * RBAC (espelha Pre_Projeto v3.1 §5.3):
 *  - Administrador, Gestão de R&S → vê tudo
 *  - Gestão Comercial, Analista de R&S, SDR → vê só campanhas onde é
 *    responsável (email_campanhas.responsavel_id = self).
 *
 * Actions:
 *   GET dashboard_stats
 *     Params: user_email (obrigatório), periodo, status_filtro_engajamento,
 *             campanha_id_engajamento
 *   GET listar_responsaveis
 *     Params: user_email (obrigatório)
 *   GET listar_campanhas_dropdown
 *     Params: user_email (obrigatório), responsavel_id, status_filtro
 *   GET metricas_por_step
 *     Params: user_email (obrigatório), campanha_id (obrigatório), periodo
 *     🆕 v2.4 — internamente usa RPC `crm_metricas_por_step`
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

// ════════════════════════════════════════════════════════════════
// RBAC
// ════════════════════════════════════════════════════════════════

const PERFIS_VEEM_TUDO = ['Administrador', 'Gestão de R&S'];
const PERFIS_VEEM_PROPRIAS = ['Gestão Comercial', 'Analista de R&S', 'SDR'];
const PERFIS_AUTORIZADOS = [...PERFIS_VEEM_TUDO, ...PERFIS_VEEM_PROPRIAS];
const PERFIS_RESPONSAVEIS_DROPDOWN = ['Gestão Comercial', 'SDR'];

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
    // ════════════════════════════════════════════════════════════
    // dashboard_stats — Aba "Visão Geral"
    // ════════════════════════════════════════════════════════════
    if (action === 'dashboard_stats') {
      const userEmail = (req.query.user_email as string) || '';
      const periodo = ((req.query.periodo as string) || 'mes') as 'semana' | 'mes' | 'trimestre' | 'total';
      const statusFiltroEngajamento = ((req.query.status_filtro_engajamento as string) || 'todas') as
        'todas' | 'ativas' | 'pausadas' | 'finalizadas';
      const campanhaIdEngajamentoRaw = req.query.campanha_id_engajamento;
      const campanhaIdEngajamento =
        campanhaIdEngajamentoRaw && Number.isFinite(Number(campanhaIdEngajamentoRaw))
          ? Number(campanhaIdEngajamentoRaw)
          : undefined;

      const ator = await resolverAtor(supabase, userEmail);
      if (!ator) {
        return res.status(200).json({ success: true, stats: dashboardVazio(periodo, false) });
      }
      if (!PERFIS_AUTORIZADOS.includes(ator.tipo_usuario)) {
        return res.status(200).json({ success: true, stats: dashboardVazio(periodo, false) });
      }

      const veTudo = PERFIS_VEEM_TUDO.includes(ator.tipo_usuario);
      const filtroResp: { responsavel_id?: number } = veTudo ? {} : { responsavel_id: ator.id };

      const inicio = inicioDoPeriodo(periodo);

      const statusCampanhas = await contarStatus(supabase, filtroResp);

      const statusFiltroArr = mapearStatusFiltro(statusFiltroEngajamento);
      const engajamento = await calcularEngajamento(
        supabase,
        filtroResp,
        inicio,
        statusFiltroArr,
        campanhaIdEngajamento,
      );

      const distribuicao = await calcularDistribuicao(supabase, filtroResp);
      const ativas = await listarAtivas(supabase, filtroResp);
      const saudeBase = await calcularSaudeBase(supabase);

      return res.status(200).json({
        success: true,
        stats: {
          ator: { id: ator.id, nome: ator.nome_usuario, tipo: ator.tipo_usuario, ve_tudo: veTudo },
          periodo,
          inicio_periodo: inicio,
          status_filtro_engajamento: statusFiltroEngajamento,
          campanha_id_engajamento: campanhaIdEngajamento ?? null,
          status_campanhas: statusCampanhas,
          engajamento,
          distribuicao,
          campanhas_ativas: ativas,
          saude_base: saudeBase,
        },
      });
    }

    // ════════════════════════════════════════════════════════════
    // listar_responsaveis
    // ════════════════════════════════════════════════════════════
    if (action === 'listar_responsaveis') {
      const userEmail = (req.query.user_email as string) || '';

      const ator = await resolverAtor(supabase, userEmail);
      if (!ator || !PERFIS_AUTORIZADOS.includes(ator.tipo_usuario)) {
        return res.status(200).json({
          success: true,
          responsaveis: [],
          travado_no_proprio: false,
        });
      }

      const veTudo = PERFIS_VEEM_TUDO.includes(ator.tipo_usuario);

      if (veTudo) {
        const { data, error } = await supabase
          .from('app_users')
          .select('id, nome_usuario, email_usuario, tipo_usuario')
          .in('tipo_usuario', PERFIS_RESPONSAVEIS_DROPDOWN)
          .eq('ativo_usuario', true)
          .order('nome_usuario', { ascending: true });

        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({
          success: true,
          responsaveis: data || [],
          travado_no_proprio: false,
        });
      }

      return res.status(200).json({
        success: true,
        responsaveis: [{
          id: ator.id,
          nome_usuario: ator.nome_usuario,
          email_usuario: ator.email_usuario,
          tipo_usuario: ator.tipo_usuario,
        }],
        travado_no_proprio: true,
      });
    }

    // ════════════════════════════════════════════════════════════
    // listar_campanhas_dropdown
    // ════════════════════════════════════════════════════════════
    if (action === 'listar_campanhas_dropdown') {
      const userEmail = (req.query.user_email as string) || '';
      const responsavelIdParam = req.query.responsavel_id
        ? Number(req.query.responsavel_id)
        : undefined;
      const statusFiltroParam = ((req.query.status_filtro as string) || 'todas') as
        'todas' | 'ativas' | 'pausadas' | 'finalizadas';

      const ator = await resolverAtor(supabase, userEmail);
      if (!ator || !PERFIS_AUTORIZADOS.includes(ator.tipo_usuario)) {
        return res.status(200).json({ success: true, campanhas: [] });
      }

      const veTudo = PERFIS_VEEM_TUDO.includes(ator.tipo_usuario);
      const responsavelEfetivo = veTudo ? responsavelIdParam : ator.id;

      let q = supabase
        .from('email_campanhas')
        .select('id, nome, status, tipo, responsavel_id, total_destinatarios, inicio_envio')
        .order('nome', { ascending: true });

      if (responsavelEfetivo !== undefined && Number.isFinite(responsavelEfetivo)) {
        q = q.eq('responsavel_id', responsavelEfetivo);
      }

      const statusValidos = mapearStatusFiltro(statusFiltroParam);
      if (statusValidos.length > 0) {
        q = q.in('status', statusValidos);
      }

      const { data, error } = await q;
      if (error) return res.status(500).json({ success: false, error: error.message });

      return res.status(200).json({ success: true, campanhas: data || [] });
    }

    // ════════════════════════════════════════════════════════════
    // metricas_por_step — Drill-down por step da campanha
    // 🆕 v2.4 — usa RPC `crm_metricas_por_step` (agregação no Postgres,
    //           sem limite de 1000 linhas do cliente Supabase JS).
    // ════════════════════════════════════════════════════════════
    if (action === 'metricas_por_step') {
      const userEmail = (req.query.user_email as string) || '';
      const campanhaIdRaw = req.query.campanha_id;
      const campanhaIdParam = campanhaIdRaw ? Number(campanhaIdRaw) : NaN;
      const periodo = ((req.query.periodo as string) || 'mes') as
        'semana' | 'mes' | 'trimestre' | 'total';

      if (!Number.isFinite(campanhaIdParam)) {
        return res.status(400).json({ success: false, error: 'campanha_id obrigatório' });
      }

      const ator = await resolverAtor(supabase, userEmail);
      if (!ator || !PERFIS_AUTORIZADOS.includes(ator.tipo_usuario)) {
        return res.status(403).json({ success: false, error: 'Sem permissão' });
      }

      const { data: campanha, error: errC } = await supabase
        .from('email_campanhas')
        .select('id, nome, responsavel_id, status')
        .eq('id', campanhaIdParam)
        .maybeSingle();

      if (errC) return res.status(500).json({ success: false, error: errC.message });
      if (!campanha) return res.status(404).json({ success: false, error: 'Campanha não encontrada' });

      const veTudo = PERFIS_VEEM_TUDO.includes(ator.tipo_usuario);
      if (!veTudo && campanha.responsavel_id !== ator.id) {
        return res.status(403).json({ success: false, error: 'Sem permissão para essa campanha' });
      }

      const { data: steps, error: errS } = await supabase
        .from('email_campanha_steps')
        .select('id, ordem, assunto')
        .eq('campanha_id', campanhaIdParam)
        .order('ordem', { ascending: true });

      if (errS) return res.status(500).json({ success: false, error: errS.message });

      if (!steps || steps.length === 0) {
        return res.status(200).json({
          success: true,
          campanha: { id: campanha.id, nome: campanha.nome, status: campanha.status },
          steps: [],
        });
      }

      // 🆕 v2.4 — Agregação no Postgres via RPC. Substitui o
      // pull-and-aggregate que sofria o limite de 1000 do cliente JS.
      //
      // Para "período total" o backend passa '1970-01-01' como p_inicio
      // — a comparação `enviado_em >= p_inicio` é verdadeira para
      // qualquer timestamp não-null (preserva semântica anterior).
      const inicio = inicioDoPeriodo(periodo);
      const { data: metricasData, error: errM } = await supabase.rpc(
        'crm_metricas_por_step',
        {
          p_campanha_id: campanhaIdParam,
          p_inicio: inicio,
        }
      );

      if (errM) {
        console.error('[crm-analytics] rpc crm_metricas_por_step:', errM);
        return res.status(500).json({
          success: false,
          error: `Erro na agregação por step: ${errM.message}. Verifique se a migration 2026-06-21_analytics_rpc_functions.sql foi aplicada.`,
        });
      }

      // BIGINT do Postgres vem como string em JSON — converter com Number().
      // Map<step_id, métricas> para lookup O(1) durante o map final.
      const metricasPorStepId = new Map<number, { enviados: number; abertos: number; respondidos: number; bounces: number; opt_outs: number }>();
      for (const m of (metricasData || []) as any[]) {
        metricasPorStepId.set(Number(m.step_id), {
          enviados: Number(m.enviados) || 0,
          abertos: Number(m.abertos) || 0,
          respondidos: Number(m.respondidos) || 0,
          bounces: Number(m.bounces) || 0,
          opt_outs: Number(m.opt_outs) || 0,
        });
      }

      // Contrato JSON 100% idêntico à v2.3 — apenas a fonte dos counts
      // mudou. Steps sem métricas (sem fila ainda) recebem zeros via
      // fallback do `||`.
      const resultado = (steps as any[]).map((s) => {
        const t = metricasPorStepId.get(s.id) || {
          enviados: 0, abertos: 0, respondidos: 0, bounces: 0, opt_outs: 0,
        };
        const pct = (n: number) =>
          t.enviados > 0 ? Number(((n / t.enviados) * 100).toFixed(2)) : 0;
        return {
          step_id: s.id,
          ordem: s.ordem,
          assunto: s.assunto,
          enviados: t.enviados,
          taxa_abertura: pct(t.abertos),
          taxa_resposta: pct(t.respondidos),
          taxa_bounce: pct(t.bounces),
          opt_outs: t.opt_outs,
        };
      });

      return res.status(200).json({
        success: true,
        campanha: { id: campanha.id, nome: campanha.nome, status: campanha.status },
        periodo,
        inicio_periodo: inicio,
        steps: resultado,
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
  else return '1970-01-01T00:00:00Z';
  return d.toISOString();
}

function mapearStatusFiltro(filtro: string): string[] {
  if (filtro === 'ativas') return ['ativa', 'agendada'];
  if (filtro === 'pausadas') return ['pausada'];
  if (filtro === 'finalizadas') return ['concluida'];
  return [];
}

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
  const q = supabase
    .from('email_campanhas')
    .select('id, tipo, dominio_envio, responsavel_id, total_destinatarios');
  const { data } = await aplicarFiltroResp(q, filtro);
  const campanhas = (data || []) as any[];

  const respIds = [...new Set(campanhas.map((c) => c.responsavel_id).filter(Boolean))] as number[];
  const nomesResp = await resolverNomesUsuarios(supabase, respIds);

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

  const ids = campanhas.slice(0, 20).map((c) => c.id);
  const taxasPorCampanha = await calcularTaxasPorCampanha(supabase, ids);

  const agora = Date.now();
  return campanhas.slice(0, 20).map((c) => {
    const inicio = c.inicio_envio ? new Date(c.inicio_envio).getTime() : null;
    const diasRodando = inicio ? Math.floor((agora - inicio) / (1000 * 60 * 60 * 24)) : null;

    const t = taxasPorCampanha.get(c.id) || { total_enviado: 0, total_aberto: 0, total_respondido: 0 };
    const taxaAbertura = t.total_enviado > 0 ? Number(((t.total_aberto / t.total_enviado) * 100).toFixed(2)) : null;
    const taxaResposta = t.total_enviado > 0 ? Number(((t.total_respondido / t.total_enviado) * 100).toFixed(2)) : null;

    return {
      id: c.id,
      nome: c.nome,
      vertical: c.tipo,
      dominio: c.dominio_envio,
      total_destinatarios: c.total_destinatarios || 0,
      responsavel: c.responsavel_id ? nomesResp.get(c.responsavel_id) || `#${c.responsavel_id}` : '—',
      dias_rodando: diasRodando,
      taxa_abertura: taxaAbertura,
      taxa_resposta: taxaResposta,
      aguardando_motor: t.total_enviado === 0,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// ENGAJAMENTO REAL (a partir de email_fila)
// ════════════════════════════════════════════════════════════════
//
// v2.2 — Aceita statusFiltro (array de status válidos).
// v2.3 — Aceita campanhaIdEspecifica (number) com re-verificação RBAC.
//
// Esta função NÃO sofre do limite de 1000 do cliente JS porque usa
// `{count: 'exact', head: true}` — devolve apenas o COUNT exato via
// header HTTP, sem trafegar linhas. Intocada na v2.4.

async function calcularEngajamento(
  supabase: any,
  filtro: { responsavel_id?: number },
  inicioPeriodo: string,
  statusFiltro?: string[],
  campanhaIdEspecifica?: number,
) {
  let ids: number[];

  if (campanhaIdEspecifica !== undefined && Number.isFinite(campanhaIdEspecifica)) {
    const qVerifica = supabase
      .from('email_campanhas')
      .select('id')
      .eq('id', campanhaIdEspecifica);
    const { data: verificacao } = await aplicarFiltroResp(qVerifica, filtro);
    if (!verificacao || (verificacao as any[]).length === 0) {
      return {
        total_enviado: 0,
        taxa_abertura: 0,
        taxa_resposta: 0,
        taxa_bounce: 0,
        aguardando_motor: true,
      };
    }
    ids = [campanhaIdEspecifica];
  } else {
    let qCamp = supabase.from('email_campanhas').select('id');
    if (statusFiltro && statusFiltro.length > 0) {
      qCamp = qCamp.in('status', statusFiltro);
    }
    const { data: campanhasIds } = await aplicarFiltroResp(qCamp, filtro);
    ids = ((campanhasIds || []) as any[]).map((c) => c.id);
  }

  if (ids.length === 0) {
    return {
      total_enviado: 0,
      taxa_abertura: 0,
      taxa_resposta: 0,
      taxa_bounce: 0,
      aguardando_motor: true,
    };
  }

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

  const [enviadoR, abertoR, respondidoR, bounceR] = await Promise.all([
    filtrar('enviado_em'),
    filtrar('aberto_em'),
    filtrar('respondido_em'),
    filtrar('bounce_em'),
  ]);

  const tEnviado = enviadoR.count || 0;
  const tAberto = abertoR.count || 0;
  const tRespondido = respondidoR.count || 0;
  const tBounce = bounceR.count || 0;

  const pct = (n: number) =>
    tEnviado > 0 ? Number(((n / tEnviado) * 100).toFixed(2)) : 0;

  return {
    total_enviado: tEnviado,
    taxa_abertura: pct(tAberto),
    taxa_resposta: pct(tRespondido),
    taxa_bounce: pct(tBounce),
    aguardando_motor: tEnviado === 0,
  };
}

/**
 * Taxas reais POR campanha (usada pela tabela "Campanhas em andamento").
 *
 * 🆕 v2.4 — usa RPC `crm_taxas_por_campanha` (agregação no Postgres,
 *           sem limite de 1000 linhas do cliente Supabase JS).
 *
 * v2.0 — versão original com SELECT + Node aggregation (sujeita ao
 *        limite, removida na v2.4).
 */
async function calcularTaxasPorCampanha(
  supabase: any,
  ids: number[],
): Promise<Map<number, { total_enviado: number; total_aberto: number; total_respondido: number }>> {
  if (ids.length === 0) return new Map();

  // 🆕 v2.4 — RPC ao invés de `.select() + Node aggregate`. Contrato do
  // Map retornado é 100% idêntico ao da v2.0.
  const { data, error } = await supabase.rpc('crm_taxas_por_campanha', {
    p_campanha_ids: ids,
  });

  if (error) {
    console.error('[crm-analytics] rpc crm_taxas_por_campanha:', error);
    // Fallback: retorna Map vazio (UI mostra "aguardando motor" para
    // todas as campanhas). Não é desejável mas evita 500 catastrófico
    // se a migration ainda não foi aplicada em algum ambiente.
    return new Map();
  }

  const m = new Map<number, { total_enviado: number; total_aberto: number; total_respondido: number }>();
  for (const r of (data || []) as any[]) {
    m.set(Number(r.campanha_id), {
      total_enviado: Number(r.total_enviado) || 0,
      total_aberto: Number(r.total_aberto) || 0,
      total_respondido: Number(r.total_respondido) || 0,
    });
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
    status_filtro_engajamento: 'todas',
    campanha_id_engajamento: null,
    status_campanhas: { rascunho: 0, agendada: 0, ativa: 0, pausada: 0, concluida: 0, total: 0 },
    engajamento: { total_enviado: 0, taxa_abertura: 0, taxa_resposta: 0, taxa_bounce: 0, aguardando_motor: true },
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
