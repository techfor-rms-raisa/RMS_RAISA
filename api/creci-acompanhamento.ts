/**
 * api/creci-acompanhamento.ts
 *
 * Backend da aba "Acompanhamento de Corretores" do módulo CRECI.
 *
 * Cobre o pós-venda do corretor: a partir do momento em que o SDR marca
 * INTERESSE = Sim ou NEGÓCIO = Fechado, o corretor entra numa carteira de
 * acompanhamento com ficha de contrato, registro de conversas/acordos,
 * follow-ups e o histórico de e-mails já existente no CRM.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RBAC (decisão de produto — Messias, 23/07/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Este form NÃO usa o RBAC por dono aplicado em email_leads. A carteira é
 * deliberadamente transparente:
 *
 *   LEITURA  → 'Administrador', 'SDR', 'Gestão Comercial'
 *              Todos veem a carteira inteira, sem filtro por responsável.
 *              Gestão Comercial precisa enxergar o pipeline de negócios
 *              fechados sem ser dona dos corretores.
 *
 *   ESCRITA  → 'Administrador', 'SDR'
 *              Quem gerencia o corretor é o SDR. Escrita liberada em
 *              QUALQUER corretor da carteira, independentemente de quem
 *              esteja em corretores_creci.analista.
 *
 * Os valores acima são os literais reais de app_users.tipo_usuario, obtidos
 * por introspecção em 23/07/2026. Atenção: o perfil de administrador se chama
 * 'Administrador' — não 'Admin'. Comparar com 'Admin' zeraria a permissão de
 * escrita para todos os usuários.
 *
 * O tipo_usuario NUNCA é lido do corpo da requisição — é sempre buscado em
 * app_users a partir do user_id. Cliente não declara o próprio perfil.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTORIA DOS REGISTROS (decisão de produto — Messias, 23/07/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * O registro guarda quem DE FATO executou a ação (executado_por_id/nome), e
 * não o responsável da carteira (corretores_creci.analista). São conceitos
 * distintos: o responsável pode ser repassado a outro usuário; a autoria de
 * uma atividade é fato histórico imutável. O nome é gravado como snapshot
 * para que a timeline continue legível se o usuário for renomeado ou
 * desativado — mesmo padrão de email_lead_historico.criado_por.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ACTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * GET  ?action=kpis                  → KPIs da carteira
 * GET  ?action=listar_carteira       → lista mestre (RPC listar_carteira_creci)
 * GET  ?action=responsaveis          → dropdown de filtro
 * GET  ?action=obter_ficha           → corretor + contrato vigente + lead do CRM
 * GET  ?action=listar_atividades     → timeline de atividades do corretor
 * GET  ?action=listar_emails         → histórico de e-mails (SOMENTE LEITURA)
 * POST  action=salvar_contrato       → cria ou atualiza a ficha de contrato
 * POST  action=criar_atividade       → registra conversa/acordo/nota
 * POST  action=atualizar_atividade   → edita atividade existente
 * POST  action=concluir_fup          → marca follow-up como concluído
 *
 * Não existe action de exclusão: histórico de acompanhamento é permanente.
 * Correções são feitas por edição, preservando o rastro de autoria.
 *
 * PRÉ-REQUISITOS (aplicar ANTES do deploy, em Preview e Production):
 *   sql/2026-07-23_creci_acompanhamento.sql
 *   sql/2026-07-23_creci_acompanhamento_rpcs.sql
 *
 * Versão: 1.0
 * Data: 23/07/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = {
  maxDuration: 30,
};

// ─── RBAC ────────────────────────────────────────────────────────────────────

/** Perfis que podem ABRIR a aba e ler a carteira inteira. */
const PERFIS_LEITURA = ['Administrador', 'SDR', 'Gestão Comercial'];

/** Perfis que podem registrar atividade e editar a ficha de contrato. */
const PERFIS_ESCRITA = ['Administrador', 'SDR'];

interface UsuarioAutenticado {
  id: number;
  nome_usuario: string;
  tipo_usuario: string;
}

interface ResultadoAuth {
  ok: boolean;
  status?: number;
  error?: string;
  user?: UsuarioAutenticado;
}

/**
 * Resolve o usuário a partir do user_id e valida o perfil contra a whitelist
 * exigida pela operação. O perfil vem SEMPRE do banco.
 */
async function autenticar(
  userIdRaw: unknown,
  perfisPermitidos: string[]
): Promise<ResultadoAuth> {
  const userId = Number(userIdRaw);

  if (!userIdRaw || Number.isNaN(userId)) {
    return { ok: false, status: 400, error: 'user_id é obrigatório.' };
  }

  const { data: user, error } = await supabase
    .from('app_users')
    .select('id, nome_usuario, tipo_usuario, ativo_usuario')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: `Falha ao validar usuário: ${error.message}` };
  }
  if (!user) {
    return { ok: false, status: 401, error: 'Usuário não encontrado.' };
  }
  if (user.ativo_usuario === false) {
    return { ok: false, status: 403, error: 'Usuário inativo.' };
  }
  if (!perfisPermitidos.includes(String(user.tipo_usuario))) {
    return {
      ok: false,
      status: 403,
      error: `Perfil "${user.tipo_usuario}" não tem permissão para esta operação.`,
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      nome_usuario: user.nome_usuario,
      tipo_usuario: String(user.tipo_usuario),
    },
  };
}

// ─── HELPERS DE DOMÍNIO ──────────────────────────────────────────────────────

const STATUS_CONTRATO = ['pendente', 'andamento', 'paralisado', 'finalizado'];
const MODELOS_REMUNERACAO = ['exito', 'fixo', 'misto'];
const TIPOS_ATIVIDADE = [
  'conversa', 'whatsapp', 'reuniao', 'proposta',
  'acordo', 'documentacao', 'nota',
];

/**
 * Garante que o corretor existe E pertence à carteira de acompanhamento.
 * Escrever atividade ou contrato em corretor fora da carteira criaria dado
 * órfão — invisível na aba e impossível de auditar.
 */
async function validarCorretorNaCarteira(
  corretorId: number
): Promise<{ ok: boolean; status?: number; error?: string; corretor?: any }> {
  const { data: corretor, error } = await supabase
    .from('corretores_creci')
    .select('id, nome, creci, interesse, negocio_fechado, analista, email_creci, email_pessoal')
    .eq('id', corretorId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!corretor) return { ok: false, status: 404, error: 'Corretor não encontrado.' };

  const naCarteira = corretor.interesse === 'yes' || corretor.negocio_fechado !== null;
  if (!naCarteira) {
    return {
      ok: false,
      status: 422,
      error:
        'Corretor fora da carteira de acompanhamento. ' +
        'Marque INTERESSE = Sim ou NEGÓCIO = Fechado na Lista CRECI antes de registrar acompanhamento.',
    };
  }

  return { ok: true, corretor };
}

/** Normaliza o e-mail de contato do corretor: email_creci tem prioridade. */
function emailDoCorretor(corretor: any): string | null {
  const bruto = corretor?.email_creci || corretor?.email_pessoal;
  if (!bruto || !String(bruto).trim()) return null;
  return String(bruto).toLowerCase().trim();
}

/** Converte string vazia em null e apara espaços. */
function texto(v: unknown, maxLen = 5000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s.slice(0, maxLen);
}

/** Converte para número ou null. Rejeita NaN. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// HANDLER
// ═════════════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ success: false, error: 'Método não suportado. Use GET ou POST.' });
  } catch (err: any) {
    console.error('❌ [creci-acompanhamento] Erro não tratado:', err?.message);
    return res.status(500).json({ success: false, error: err?.message || 'Erro interno.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { action, user_id } = req.query as Record<string, string>;

  const auth = await autenticar(user_id, PERFIS_LEITURA);
  if (!auth.ok) return res.status(auth.status!).json({ success: false, error: auth.error });

  const podeEscrever = PERFIS_ESCRITA.includes(auth.user!.tipo_usuario);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  if (action === 'kpis') {
    const { data, error } = await supabase.rpc('kpis_carteira_creci');
    if (error) return res.status(500).json({ success: false, error: error.message });

    const kpis = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({ success: true, kpis, pode_escrever: podeEscrever });
  }

  // ── LISTAR CARTEIRA ────────────────────────────────────────────────────────
  if (action === 'listar_carteira') {
    const {
      busca = '',
      situacao = 'todos',
      status_contrato = 'todos',
      responsavel = '',
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const limitNum = Math.max(1, Math.min(parseInt(limit) || 50, 200));
    const pageNum = Math.max(1, parseInt(page) || 1);

    const { data, error } = await supabase.rpc('listar_carteira_creci', {
      p_busca: busca || null,
      p_situacao: situacao || 'todos',
      p_status_contrato: status_contrato || 'todos',
      p_responsavel: responsavel || null,
      p_limit: limitNum,
      p_offset: (pageNum - 1) * limitNum,
    });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const linhas = data || [];
    // total_registros é idêntico em todas as linhas (COUNT(*) OVER ()).
    const total = linhas.length > 0 ? Number(linhas[0].total_registros) : 0;

    return res.status(200).json({
      success: true,
      corretores: linhas,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum),
      pode_escrever: podeEscrever,
    });
  }

  // ── RESPONSÁVEIS (dropdown de filtro) ──────────────────────────────────────
  if (action === 'responsaveis') {
    const { data, error } = await supabase.rpc('responsaveis_carteira_creci');
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, responsaveis: data || [] });
  }

  // ── OBTER FICHA ────────────────────────────────────────────────────────────
  if (action === 'obter_ficha') {
    const corretorId = Number(req.query.corretor_id);
    if (!corretorId) {
      return res.status(400).json({ success: false, error: 'corretor_id é obrigatório.' });
    }

    const check = await validarCorretorNaCarteira(corretorId);
    if (!check.ok) return res.status(check.status!).json({ success: false, error: check.error });

    // Dados completos do corretor
    const { data: corretor, error: errCorretor } = await supabase
      .from('corretores_creci')
      .select('*')
      .eq('id', corretorId)
      .single();
    if (errCorretor) return res.status(500).json({ success: false, error: errCorretor.message });

    // Contrato vigente: o não finalizado tem prioridade; senão, o mais recente.
    const { data: contratos, error: errContrato } = await supabase
      .from('creci_contratos')
      .select('*')
      .eq('corretor_id', corretorId)
      .order('criado_em', { ascending: false });
    if (errContrato) return res.status(500).json({ success: false, error: errContrato.message });

    const lista = contratos || [];
    const contratoVigente =
      lista.find((c: any) => c.status_contrato !== 'finalizado') || lista[0] || null;

    // Lead correspondente no CRM (casamento por e-mail)
    const email = emailDoCorretor(corretor);
    let lead: any = null;
    if (email) {
      const { data: leadRow } = await supabase
        .from('email_leads')
        .select('id, nome, email, vertical, funil_status, criado_em')
        .eq('email', email)
        .maybeSingle();
      lead = leadRow || null;
    }

    return res.status(200).json({
      success: true,
      corretor,
      contrato: contratoVigente,
      contratos_historico: lista,
      lead,
      pode_escrever: podeEscrever,
    });
  }

  // ── LISTAR ATIVIDADES ──────────────────────────────────────────────────────
  if (action === 'listar_atividades') {
    const corretorId = Number(req.query.corretor_id);
    if (!corretorId) {
      return res.status(400).json({ success: false, error: 'corretor_id é obrigatório.' });
    }

    const { data, error } = await supabase
      .from('creci_atividades')
      .select('*')
      .eq('corretor_id', corretorId)
      .order('data_atividade', { ascending: false })
      .limit(500);

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.status(200).json({
      success: true,
      atividades: data || [],
      pode_escrever: podeEscrever,
    });
  }

  // ── LISTAR E-MAILS (somente leitura) ───────────────────────────────────────
  //
  // Reconstrói a thread do corretor a partir das tabelas do CRM:
  //   • email_fila            → e-mails ENVIADOS pelas campanhas
  //   • email_respostas       → e-mails RECEBIDOS do lead (webhook Resend)
  //   • email_campanha_steps  → assunto e ordem do step (fila não guarda assunto)
  //   • email_campanhas       → nome da campanha
  //
  // Não chama /api/crm-leads?action=listar_msgs_thread de propósito. Dois
  // motivos: (1) fetch entre funções serverless do mesmo deployment é
  // antipattern no Vercel — o Deployment Protection devolve HTTP 401 com
  // página de login em Preview; (2) aquela action aplica RBAC de dono da
  // CAMPANHA, o que bloquearia a Gestão Comercial, contrariando a regra
  // desta aba.
  //
  // Lookups em batch (.in) em vez de N+1. O volume é o de um único lead —
  // dezenas de linhas no máximo.
  if (action === 'listar_emails') {
    const corretorId = Number(req.query.corretor_id);
    if (!corretorId) {
      return res.status(400).json({ success: false, error: 'corretor_id é obrigatório.' });
    }

    const check = await validarCorretorNaCarteira(corretorId);
    if (!check.ok) return res.status(check.status!).json({ success: false, error: check.error });

    const email = emailDoCorretor(check.corretor);
    if (!email) {
      return res.status(200).json({
        success: true,
        lead_id: null,
        mensagens: [],
        aviso: 'Corretor sem e-mail cadastrado — não há histórico no CRM.',
      });
    }

    const { data: lead } = await supabase
      .from('email_leads')
      .select('id, nome, email')
      .eq('email', email)
      .maybeSingle();

    if (!lead) {
      return res.status(200).json({
        success: true,
        lead_id: null,
        mensagens: [],
        aviso: 'Corretor ainda não foi promovido ao CRM — sem histórico de e-mails.',
      });
    }

    // Enviados
    const { data: fila, error: errFila } = await supabase
      .from('email_fila')
      .select('id, campanha_id, step_id, status, agendado_para, enviado_em, entregue_em, aberto_em, clicado_em, respondido_em, destinatario_email')
      .eq('lead_id', lead.id)
      .order('agendado_para', { ascending: false })
      .limit(200);
    if (errFila) return res.status(500).json({ success: false, error: errFila.message });

    // Recebidos
    const { data: respostas, error: errResp } = await supabase
      .from('email_respostas')
      .select('id, campanha_id, fila_id, de_email, de_nome, assunto, corpo_texto, corpo_html, classificacao, lido, recebido_em')
      .eq('lead_id', lead.id)
      .order('recebido_em', { ascending: false })
      .limit(200);
    if (errResp) return res.status(500).json({ success: false, error: errResp.message });

    // Lookups em batch
    const stepIds = [...new Set((fila || []).map((f: any) => f.step_id).filter(Boolean))];
    const campanhaIds = [
      ...new Set([
        ...(fila || []).map((f: any) => f.campanha_id),
        ...(respostas || []).map((r: any) => r.campanha_id),
      ].filter(Boolean)),
    ];

    const mapaSteps = new Map<number, any>();
    if (stepIds.length > 0) {
      const { data: steps } = await supabase
        .from('email_campanha_steps')
        .select('id, ordem, assunto')
        .in('id', stepIds);
      (steps || []).forEach((s: any) => mapaSteps.set(s.id, s));
    }

    const mapaCampanhas = new Map<number, string>();
    if (campanhaIds.length > 0) {
      const { data: camps } = await supabase
        .from('email_campanhas')
        .select('id, nome')
        .in('id', campanhaIds);
      (camps || []).forEach((c: any) => mapaCampanhas.set(c.id, c.nome));
    }

    const enviados = (fila || []).map((f: any) => {
      const step = f.step_id ? mapaSteps.get(f.step_id) : null;
      return {
        id: `env_${f.id}`,
        direcao: 'outbound' as const,
        data: f.enviado_em || f.agendado_para,
        assunto: step?.assunto || '(assunto não disponível)',
        corpo_texto: null,
        corpo_html: null,
        de_email: null,
        de_nome: null,
        campanha_id: f.campanha_id,
        campanha_nome: f.campanha_id ? mapaCampanhas.get(f.campanha_id) || null : null,
        step_ordem: step?.ordem ?? null,
        status: f.status,
        entregue_em: f.entregue_em,
        aberto_em: f.aberto_em,
        clicado_em: f.clicado_em,
        respondido_em: f.respondido_em,
        classificacao: null,
      };
    });

    const recebidos = (respostas || []).map((r: any) => ({
      id: `rep_${r.id}`,
      direcao: 'inbound' as const,
      data: r.recebido_em,
      assunto: r.assunto || '(sem assunto)',
      corpo_texto: r.corpo_texto,
      corpo_html: r.corpo_html,
      de_email: r.de_email,
      de_nome: r.de_nome,
      campanha_id: r.campanha_id,
      campanha_nome: r.campanha_id ? mapaCampanhas.get(r.campanha_id) || null : null,
      step_ordem: null,
      status: null,
      entregue_em: null,
      aberto_em: null,
      clicado_em: null,
      respondido_em: null,
      classificacao: r.classificacao,
    }));

    const mensagens = [...enviados, ...recebidos].sort((a, b) => {
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    return res.status(200).json({
      success: true,
      lead_id: lead.id,
      lead_email: lead.email,
      mensagens,
      total_enviados: enviados.length,
      total_recebidos: recebidos.length,
    });
  }

  return res.status(400).json({ success: false, error: `Action GET desconhecida: ${action}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — todas as actions exigem perfil de ESCRITA
// ─────────────────────────────────────────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, any>;
  const { action, user_id } = body;

  const auth = await autenticar(user_id, PERFIS_ESCRITA);
  if (!auth.ok) return res.status(auth.status!).json({ success: false, error: auth.error });

  const executor = auth.user!;

  // ── SALVAR CONTRATO (cria ou atualiza) ─────────────────────────────────────
  if (action === 'salvar_contrato') {
    const {
      contrato_id,
      corretor_id,
      numero_contrato,
      data_aceite,
      valor_contrato,
      status_contrato,
      modelo_remuneracao,
      percentual_exito,
      proxima_revisao,
      observacoes,
    } = body;

    const corretorId = Number(corretor_id);
    if (!corretorId) {
      return res.status(400).json({ success: false, error: 'corretor_id é obrigatório.' });
    }

    const check = await validarCorretorNaCarteira(corretorId);
    if (!check.ok) return res.status(check.status!).json({ success: false, error: check.error });

    const status = texto(status_contrato) || 'pendente';
    if (!STATUS_CONTRATO.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status_contrato inválido. Use: ${STATUS_CONTRATO.join(', ')}.`,
      });
    }

    const modelo = texto(modelo_remuneracao);
    if (modelo && !MODELOS_REMUNERACAO.includes(modelo)) {
      return res.status(400).json({
        success: false,
        error: `modelo_remuneracao inválido. Use: ${MODELOS_REMUNERACAO.join(', ')}.`,
      });
    }

    const valor = numero(valor_contrato);
    if (valor !== null && valor < 0) {
      return res.status(400).json({ success: false, error: 'valor_contrato não pode ser negativo.' });
    }

    const percentual = numero(percentual_exito);
    if (percentual !== null && (percentual < 0 || percentual > 100)) {
      return res.status(400).json({ success: false, error: 'percentual_exito deve estar entre 0 e 100.' });
    }

    const aceite = texto(data_aceite);
    if (status === 'finalizado' && !aceite) {
      return res.status(400).json({
        success: false,
        error: 'Contrato finalizado exige data de aceite preenchida.',
      });
    }

    const campos = {
      numero_contrato: texto(numero_contrato, 60),
      data_aceite: aceite,
      valor_contrato: valor,
      status_contrato: status,
      modelo_remuneracao: modelo,
      percentual_exito: percentual,
      proxima_revisao: texto(proxima_revisao),
      observacoes: texto(observacoes, 8000),
      atualizado_por_id: executor.id,
      atualizado_por_nome: executor.nome_usuario,
    };

    // UPDATE
    if (contrato_id) {
      const { data, error } = await supabase
        .from('creci_contratos')
        .update(campos)
        .eq('id', Number(contrato_id))
        .eq('corretor_id', corretorId) // impede edição cruzada por id forjado
        .select()
        .maybeSingle();

      if (error) return res.status(500).json({ success: false, error: traduzirErroSql(error) });
      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Contrato não encontrado para este corretor.',
        });
      }

      console.log(`✏️ [creci-acompanhamento] Contrato ${data.id} atualizado por ${executor.nome_usuario}`);
      return res.status(200).json({ success: true, contrato: data, criado: false });
    }

    // INSERT
    const { data, error } = await supabase
      .from('creci_contratos')
      .insert({
        corretor_id: corretorId,
        ...campos,
        criado_por_id: executor.id,
        criado_por_nome: executor.nome_usuario,
      })
      .select()
      .single();

    if (error) return res.status(traduzirStatusSql(error)).json({ success: false, error: traduzirErroSql(error) });

    console.log(`✅ [creci-acompanhamento] Contrato criado (corretor ${corretorId}) por ${executor.nome_usuario}`);
    return res.status(201).json({ success: true, contrato: data, criado: true });
  }

  // ── CRIAR ATIVIDADE ────────────────────────────────────────────────────────
  if (action === 'criar_atividade') {
    const { corretor_id, contrato_id, tipo, data_atividade, descricao, fup_em } = body;

    const corretorId = Number(corretor_id);
    if (!corretorId) {
      return res.status(400).json({ success: false, error: 'corretor_id é obrigatório.' });
    }

    const check = await validarCorretorNaCarteira(corretorId);
    if (!check.ok) return res.status(check.status!).json({ success: false, error: check.error });

    const tipoNorm = texto(tipo, 30);
    if (!tipoNorm || !TIPOS_ATIVIDADE.includes(tipoNorm)) {
      return res.status(400).json({
        success: false,
        error: `tipo inválido. Use: ${TIPOS_ATIVIDADE.join(', ')}.`,
      });
    }

    const desc = texto(descricao, 8000);
    if (!desc) {
      return res.status(400).json({ success: false, error: 'descricao é obrigatória.' });
    }

    const { data, error } = await supabase
      .from('creci_atividades')
      .insert({
        corretor_id: corretorId,
        contrato_id: contrato_id ? Number(contrato_id) : null,
        tipo: tipoNorm,
        data_atividade: texto(data_atividade) || new Date().toISOString(),
        descricao: desc,
        fup_em: texto(fup_em),
        executado_por_id: executor.id,
        executado_por_nome: executor.nome_usuario,
        origem: 'manual',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: traduzirErroSql(error) });

    console.log(`✅ [creci-acompanhamento] Atividade ${data.id} (${tipoNorm}) registrada por ${executor.nome_usuario} no corretor ${corretorId}`);
    return res.status(201).json({ success: true, atividade: data });
  }

  // ── ATUALIZAR ATIVIDADE ────────────────────────────────────────────────────
  //
  // A autoria original (executado_por_*) NÃO é reescrita — quem executou a
  // ação continua sendo quem executou, mesmo que outra pessoa corrija o texto.
  if (action === 'atualizar_atividade') {
    const { atividade_id, tipo, data_atividade, descricao, fup_em, contrato_id } = body;

    const atividadeId = Number(atividade_id);
    if (!atividadeId) {
      return res.status(400).json({ success: false, error: 'atividade_id é obrigatório.' });
    }

    const patch: Record<string, any> = {};

    if (tipo !== undefined) {
      const tipoNorm = texto(tipo, 30);
      if (!tipoNorm || !TIPOS_ATIVIDADE.includes(tipoNorm)) {
        return res.status(400).json({
          success: false,
          error: `tipo inválido. Use: ${TIPOS_ATIVIDADE.join(', ')}.`,
        });
      }
      patch.tipo = tipoNorm;
    }

    if (descricao !== undefined) {
      const desc = texto(descricao, 8000);
      if (!desc) return res.status(400).json({ success: false, error: 'descricao não pode ficar vazia.' });
      patch.descricao = desc;
    }

    if (data_atividade !== undefined) patch.data_atividade = texto(data_atividade);
    if (fup_em !== undefined) patch.fup_em = texto(fup_em);
    if (contrato_id !== undefined) patch.contrato_id = contrato_id ? Number(contrato_id) : null;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar.' });
    }

    const { data, error } = await supabase
      .from('creci_atividades')
      .update(patch)
      .eq('id', atividadeId)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: traduzirErroSql(error) });
    if (!data) return res.status(404).json({ success: false, error: 'Atividade não encontrada.' });

    console.log(`✏️ [creci-acompanhamento] Atividade ${atividadeId} editada por ${executor.nome_usuario}`);
    return res.status(200).json({ success: true, atividade: data });
  }

  // ── CONCLUIR FUP ───────────────────────────────────────────────────────────
  if (action === 'concluir_fup') {
    const atividadeId = Number(body.atividade_id);
    if (!atividadeId) {
      return res.status(400).json({ success: false, error: 'atividade_id é obrigatório.' });
    }

    const { data: atual, error: errBusca } = await supabase
      .from('creci_atividades')
      .select('id, fup_em, fup_concluido_em')
      .eq('id', atividadeId)
      .maybeSingle();

    if (errBusca) return res.status(500).json({ success: false, error: errBusca.message });
    if (!atual) return res.status(404).json({ success: false, error: 'Atividade não encontrada.' });
    if (!atual.fup_em) {
      return res.status(422).json({
        success: false,
        error: 'Esta atividade não tem follow-up agendado.',
      });
    }
    if (atual.fup_concluido_em) {
      // Idempotente: concluir duas vezes não é erro nem sobrescreve a autoria.
      return res.status(200).json({ success: true, atividade: atual, ja_concluido: true });
    }

    const { data, error } = await supabase
      .from('creci_atividades')
      .update({
        fup_concluido_em: new Date().toISOString(),
        fup_concluido_por_id: executor.id,
        fup_concluido_por_nome: executor.nome_usuario,
      })
      .eq('id', atividadeId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: traduzirErroSql(error) });

    console.log(`✅ [creci-acompanhamento] FUP da atividade ${atividadeId} concluído por ${executor.nome_usuario}`);
    return res.status(200).json({ success: true, atividade: data, ja_concluido: false });
  }

  return res.status(400).json({ success: false, error: `Action POST desconhecida: ${action}` });
}

// ─── TRADUÇÃO DE ERROS DO POSTGRES ───────────────────────────────────────────
//
// Mensagens cruas de constraint não ajudam o SDR. Traduz os casos previstos
// para linguagem de negócio, mantendo o original no log do servidor.

function traduzirErroSql(error: any): string {
  const msg = String(error?.message || '');
  console.error('[creci-acompanhamento] SQL:', msg);

  if (msg.includes('creci_contratos_um_aberto_por_corretor_uniq')) {
    return 'Este corretor já tem um contrato em aberto. Finalize o contrato atual antes de criar outro.';
  }
  if (msg.includes('creci_contratos_numero_uniq')) {
    return 'Já existe um contrato com este número.';
  }
  if (msg.includes('creci_contratos_finalizado_chk')) {
    return 'Contrato finalizado exige data de aceite preenchida.';
  }
  if (msg.includes('creci_atividades_fup_coerente_chk')) {
    return 'Não é possível concluir um follow-up que não foi agendado.';
  }
  if (msg.includes('violates foreign key')) {
    return 'Referência inválida (corretor ou contrato inexistente).';
  }
  return msg || 'Erro ao gravar no banco.';
}

function traduzirStatusSql(error: any): number {
  const msg = String(error?.message || '');
  if (msg.includes('duplicate key') || msg.includes('_uniq')) return 409;
  return 500;
}
