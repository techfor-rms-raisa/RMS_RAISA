/**
 * api/crm-analytics.ts — Endpoint do Dashboard de Acompanhamento
 *
 * Caminho: api/crm-analytics.ts
 * Versão: 2.2 (21/06/2026)
 *
 * v2.2 (21/06/2026): aba "Painel Campanha" + filtro de status no frame
 *   "Engajamento & Entregabilidade" da aba "Visão Geral". Mudanças cirúrgicas:
 *
 *     1) `dashboard_stats` (ALTERADA): aceita param opcional novo
 *        `status_filtro_engajamento` ('todas' | 'ativas' | 'pausadas' |
 *        'finalizadas', default 'todas'). Filtra os IDs de campanhas usados
 *        pelo `calcularEngajamento` (frame de KPIs). NÃO afeta
 *        status_campanhas, distribuição, campanhas em andamento, nem
 *        saúde da base — escopo limitado ao frame Engajamento, conforme
 *        decisão de produto.
 *
 *     2) `listar_responsaveis` (NOVA): popula o Filtro 1 do Painel Campanha.
 *        RBAC espelha o padrão de `listar_responsaveis_elegiveis` em
 *        crm-campanhas.ts, mas adaptado ao escopo do Acompanhamento (que
 *        inclui Analista de R&S/SDR como observadores das próprias):
 *          • Administrador / Gestão de R&S → lista todos GC+SDR ativos +
 *            flag travado_no_proprio=false.
 *          • Gestão Comercial / Analista de R&S / SDR → retorna SOMENTE
 *            o próprio user + travado_no_proprio=true (UI desabilita o
 *            dropdown e exibe o nome dele).
 *
 *     3) `listar_campanhas_dropdown` (NOVA): popula o Filtro 3 cascateado
 *        em F1 (responsável) + F2 (status). Aceita params:
 *          • responsavel_id (number, opcional — se omitido e ator vê tudo,
 *            retorna todas; se ator vê próprias, força = self.id)
 *          • status_filtro: 'todas' | 'ativas' | 'pausadas' | 'finalizadas'
 *            (default 'todas')
 *        Mapeamento (helper `mapearStatusFiltro`):
 *          - 'ativas'      → status IN ('ativa', 'agendada')  (em andamento)
 *          - 'pausadas'    → status = 'pausada'
 *          - 'finalizadas' → status = 'concluida'
 *          - 'todas'       → sem filtro (inclui rascunho)
 *
 *     4) `metricas_por_step` (NOVA): para uma campanha_id, retorna a
 *        performance agregada por step (ordem 1, 2, 3...). RBAC: rejeita
 *        com 403 se ator NÃO vê tudo e campanha.responsavel_id !== self.id.
 *        Query: 1 SELECT em email_campanha_steps + 1 SELECT em email_fila
 *        agregado no Node (mesmo padrão de `calcularTaxasPorCampanha`).
 *        O filtro de período é aplicado POR EVENTO (igual ao
 *        `calcularEngajamento`): cada timestamp é contado se >= inicio.
 *        Retorna array ordenado por step.ordem com:
 *          { step_id, ordem, assunto, enviados, taxa_abertura,
 *            taxa_resposta, taxa_bounce }
 *
 *   Banco: NENHUMA migração. Todas as colunas já existem (email_fila tem
 *   step_id, enviado_em, aberto_em, respondido_em, bounce_em desde a Fase
 *   5B; email_campanha_steps tem id, ordem, assunto desde a Fase 5B).
 *
 *   Pré-requisito: `crm-webhook.ts` v1.14+ em Production (popula
 *   `respondido_em`) — já atendido desde 12/06/2026 (P3).
 *
 * v2.1 (12/06/2026): substituição de TAXA CLIQUE por TAXA RESPOSTA no
 *   dashboard. Decisão de produto (12/06/2026) — em campanha de prospecção
 *   B2B, "clique" tem baixa relevância (templates não dependem de CTA);
 *   "resposta" é a métrica que efetivamente mede conversão para conversa.
 *   Adicionalmente, "abertura > 0 mas clique = 0" causava confusão UX
 *   ("se abriram, deveriam ter clicado").
 *
 *   Mudanças cirúrgicas:
 *     1) `calcularEngajamento`: adicionado `filtrar('respondido_em')` ao
 *        Promise.all (agora 5 counts paralelos); substituído `taxa_clique`
 *        por `taxa_resposta` no objeto de retorno.
 *     2) `calcularTaxasPorCampanha`: SELECT agora traz `respondido_em` em
 *        vez de `clicado_em`; agregação interna substitui `total_clicado`
 *        por `total_respondido`.
 *     3) `listarAtivas`: campo por-campanha `taxa_clique` → `taxa_resposta`.
 *     4) `dashboardVazio`: idem no payload de fallback.
 *
 *   Banco: NENHUMA mudança. `email_fila.clicado_em` continua sendo populado
 *   pelo webhook v1.13.2+ (case 'clicked'). A métrica simplesmente não é
 *   mais exibida no dashboard — pode ser retomada no futuro se templates
 *   passarem a ter CTA forte.
 *
 *   Pré-requisito: `crm-webhook.ts` v1.14 em Production (popula
 *   `respondido_em`) + backfill SQL retroativo (popular respondido_em a
 *   partir de email_respostas.recebido_em). Ambos concluídos em 12/06/2026.
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
 * Actions:
 *   GET dashboard_stats
 *     Params: user_email (obrigatório), periodo ('semana'|'mes'|'trimestre'|'total', default 'mes')
 *             status_filtro_engajamento ('todas'|'ativas'|'pausadas'|'finalizadas', default 'todas')  🆕 v2.2
 *   GET listar_responsaveis                                                                            🆕 v2.2
 *     Params: user_email (obrigatório)
 *   GET listar_campanhas_dropdown                                                                      🆕 v2.2
 *     Params: user_email (obrigatório), responsavel_id (opcional), status_filtro (opcional, default 'todas')
 *   GET metricas_por_step                                                                              🆕 v2.2
 *     Params: user_email (obrigatório), campanha_id (obrigatório), periodo (default 'mes')
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

/** Perfis que aparecem no dropdown do Filtro 1 (Responsável) quando ator vê tudo. */
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
      // 🆕 v2.2 — novo param opcional; afeta APENAS o frame engajamento
      const statusFiltroEngajamento = ((req.query.status_filtro_engajamento as string) || 'todas') as
        'todas' | 'ativas' | 'pausadas' | 'finalizadas';

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
      // 🆕 v2.2 — agora aceita filtro de status para restringir o conjunto
      //   de campanhas usadas no cálculo dos KPIs. Default 'todas' preserva
      //   o comportamento da v2.1 (sem filtro).
      const statusFiltroArr = mapearStatusFiltro(statusFiltroEngajamento);
      const engajamento = await calcularEngajamento(supabase, filtroResp, inicio, statusFiltroArr);

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
          status_filtro_engajamento: statusFiltroEngajamento, // 🆕 v2.2 (echo para UI)
          status_campanhas: statusCampanhas,
          engajamento,
          distribuicao,
          campanhas_ativas: ativas,
          saude_base: saudeBase,
        },
      });
    }

    // ════════════════════════════════════════════════════════════
    // 🆕 v2.2 — listar_responsaveis — Filtro 1 do Painel Campanha
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
        // Admin / Gestão de R&S: lista todos GC+SDR ativos
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

      // GC / Analista R&S / SDR: travado no próprio (vê só as próprias campanhas)
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
    // 🆕 v2.2 — listar_campanhas_dropdown — Filtro 3 cascateado em F1+F2
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

      // RBAC: se ator NÃO vê tudo, força responsavel_id = self.id
      // (ignora param para evitar bypass via query string)
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
    // 🆕 v2.2 — metricas_por_step — Drill-down por step da campanha
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

      // Buscar campanha (verificar RBAC + obter nome)
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

      // Buscar steps (ordenados)
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

      // Buscar email_fila completa da campanha (sem filtro de período no SQL —
      // filtro é aplicado por evento no Node, mesmo padrão do calcularEngajamento).
      const { data: filaData, error: errF } = await supabase
        .from('email_fila')
        .select('step_id, enviado_em, aberto_em, respondido_em, bounce_em')
        .eq('campanha_id', campanhaIdParam);

      if (errF) return res.status(500).json({ success: false, error: errF.message });

      // Filtro de período por evento (mesma convenção do calcularEngajamento)
      const inicio = inicioDoPeriodo(periodo);
      const usaPeriodo = inicio !== '1970-01-01T00:00:00Z';
      const dentroDoPeriodo = (ts: string | null): boolean => {
        if (!ts) return false;
        if (!usaPeriodo) return true;
        return ts >= inicio;
      };

      // Agregar por step_id
      const agg = new Map<number, { enviados: number; abertos: number; respondidos: number; bounces: number }>();
      for (const r of (filaData || []) as any[]) {
        if (!r.step_id) continue;
        const cur = agg.get(r.step_id) || { enviados: 0, abertos: 0, respondidos: 0, bounces: 0 };
        if (dentroDoPeriodo(r.enviado_em)) cur.enviados++;
        if (dentroDoPeriodo(r.aberto_em)) cur.abertos++;
        if (dentroDoPeriodo(r.respondido_em)) cur.respondidos++;
        if (dentroDoPeriodo(r.bounce_em)) cur.bounces++;
        agg.set(r.step_id, cur);
      }

      const resultado = (steps as any[]).map((s) => {
        const t = agg.get(s.id) || { enviados: 0, abertos: 0, respondidos: 0, bounces: 0 };
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
  else return '1970-01-01T00:00:00Z'; // total
  return d.toISOString();
}

/**
 * 🆕 v2.2 — Mapeia o filtro de status do UI (Painel Campanha + Frame
 * Engajamento) para os valores reais do schema `email_campanhas.status`.
 *
 * Convenção: array vazio significa "sem filtro" (todos os 5 status).
 *   'todas'       → []  (todos: rascunho/agendada/ativa/pausada/concluida)
 *   'ativas'      → ['ativa', 'agendada']  (em andamento)
 *   'pausadas'    → ['pausada']
 *   'finalizadas' → ['concluida']
 *
 * Qualquer valor desconhecido cai em 'todas' (fail-open seguro — afeta
 * apenas visualização, sem risco de vazamento de dados).
 */
function mapearStatusFiltro(filtro: string): string[] {
  if (filtro === 'ativas') return ['ativa', 'agendada'];
  if (filtro === 'pausadas') return ['pausada'];
  if (filtro === 'finalizadas') return ['concluida'];
  return []; // 'todas' (default) = sem filtro
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

    const t = taxasPorCampanha.get(c.id) || { total_enviado: 0, total_aberto: 0, total_respondido: 0 };
    const taxaAbertura = t.total_enviado > 0 ? Number(((t.total_aberto / t.total_enviado) * 100).toFixed(2)) : null;
    // 🆕 v2.1 — substituído `taxa_clique` por `taxa_resposta` (mais relevante para prospecção B2B).
    const taxaResposta = t.total_enviado > 0 ? Number(((t.total_respondido / t.total_enviado) * 100).toFixed(2)) : null;

    return {
      id: c.id,
      nome: c.nome,
      vertical: c.tipo,
      dominio: c.dominio_envio,
      total_destinatarios: c.total_destinatarios || 0,
      responsavel: c.responsavel_id ? nomesResp.get(c.responsavel_id) || `#${c.responsavel_id}` : '—',
      dias_rodando: diasRodando,
      // 🆕 v2.1 — taxas reais (taxa_clique substituída por taxa_resposta)
      taxa_abertura: taxaAbertura,
      taxa_resposta: taxaResposta,
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
//
// 🆕 v2.2 — Aceita param opcional `statusFiltro` (array de status válidos)
//   para restringir o conjunto de campanhas usado no cálculo. Vazio = sem
//   filtro (preserva comportamento da v2.1).

async function calcularEngajamento(
  supabase: any,
  filtro: { responsavel_id?: number },
  inicioPeriodo: string,
  statusFiltro?: string[],
) {
  // 1) Lista IDs das campanhas que o ator vê (RBAC já é aplicado aqui).
  //    🆕 v2.2 — restringe por status se filtro fornecido.
  let qCamp = supabase.from('email_campanhas').select('id');
  if (statusFiltro && statusFiltro.length > 0) {
    qCamp = qCamp.in('status', statusFiltro);
  }
  const { data: campanhasIds } = await aplicarFiltroResp(qCamp, filtro);
  const ids = ((campanhasIds || []) as any[]).map((c) => c.id);

  if (ids.length === 0) {
    return {
      total_enviado: 0,
      taxa_abertura: 0,
      taxa_resposta: 0,
      taxa_bounce: 0,
      aguardando_motor: true,
    };
  }

  // 2) Constrói uma query base e aplica filtro de período em CADA campo
  //    datetime relevante (enviado_em / aberto_em / respondido_em / bounce_em).
  //    🆕 v2.1: `respondido_em` substitui `clicado_em` no quadrante engajamento.
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
 * 🆕 v2.0 — taxas reais POR campanha (usada pela tabela "Campanhas em
 * andamento"). Faz UMA query trazendo os campos relevantes de email_fila
 * para todas as campanhas pedidas e agrega no Node — evita N×3 queries
 * quando há até 20 campanhas ativas.
 */
async function calcularTaxasPorCampanha(
  supabase: any,
  ids: number[],
): Promise<Map<number, { total_enviado: number; total_aberto: number; total_respondido: number }>> {
  if (ids.length === 0) return new Map();

  // 🆕 v2.1 — `respondido_em` substitui `clicado_em` no SELECT.
  const { data } = await supabase
    .from('email_fila')
    .select('campanha_id, enviado_em, aberto_em, respondido_em')
    .in('campanha_id', ids);

  const m = new Map<number, { total_enviado: number; total_aberto: number; total_respondido: number }>();
  for (const r of (data || []) as any[]) {
    const cur =
      m.get(r.campanha_id) ||
      { total_enviado: 0, total_aberto: 0, total_respondido: 0 };
    if (r.enviado_em) cur.total_enviado++;
    if (r.aberto_em) cur.total_aberto++;
    if (r.respondido_em) cur.total_respondido++;
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
    status_filtro_engajamento: 'todas', // 🆕 v2.2
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
