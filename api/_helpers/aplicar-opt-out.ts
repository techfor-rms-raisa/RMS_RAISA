/**
 * aplicar-opt-out.ts — Helper compartilhado para cascata de opt-out
 *
 * Caminho: api/_helpers/aplicar-opt-out.ts
 * Versão: 1.0 (Bloco 1 do plano OPT-OUT 100% — 11/06/2026)
 *
 * ════════════════════════════════════════════════════════════════════════
 * PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════
 * Centraliza a CASCATA DE 4 PASSOS de opt-out, usada pelos 4 caminhos:
 *
 *   • Manual (botão na UI da Base de Leads)           → origem='manual'
 *   • Webhook complained (destinatário marcou spam)   → origem='spam_complaint'
 *   • POST RFC 8058 (one-click unsubscribe Gmail/Outlook) → origem='list_unsubscribe'
 *   • GET no link clicável do rodapé HTML             → origem='link_rodape'
 *
 * Antes do Bloco 1 a cascata estava DUPLICADA em 2 lugares:
 *   • crm-leads.ts action `desabilitar_lead` (Fase Manual — v1.11)
 *   • crm-webhook.ts blocos B+C (Webhook Complained — v1.12.1)
 *
 * O endpoint público /api/unsubscribe (Bloco 2) seria o 3º lugar com a mesma
 * cascata duplicada. Este helper elimina a duplicação e garante consistência
 * de auditoria LGPD entre todos os caminhos.
 *
 * ════════════════════════════════════════════════════════════════════════
 * CASCATA EM 4 PASSOS
 * ════════════════════════════════════════════════════════════════════════
 *   PASSO 1 — UPDATE email_leads SET opt_out=true, opt_out_em=NOW()
 *             (busca lead por id OU por email se id não fornecido)
 *
 *   PASSO 2 — UPSERT email_optout (onConflict:'email', ignoreDuplicates:true)
 *             {email, motivo, campanha_origem_id, criado_em}
 *
 *   PASSO 3 — UPDATE email_fila SET status='cancelado',
 *             motivo_cancelamento=<motivo padronizado por origem>
 *             WHERE destinatario_email = email_normalizado
 *               AND status = 'pendente'
 *             (cascading global — cancela em TODAS as campanhas ativas,
 *             pausadas e agendadas)
 *
 *   PASSO 4 — INSERT email_lead_historico
 *             {lead_id, tipo='opt_out_<origem>', descricao, dados, criado_por}
 *             (auditoria LGPD; só executado se lead_id foi resolvido)
 *
 * ════════════════════════════════════════════════════════════════════════
 * DECISÕES DE PRODUTO HONRADAS
 * ════════════════════════════════════════════════════════════════════════
 *   • P2.1 — Opt-out IRREVERSÍVEL (LGPD). Não há contraparte "reabilitar".
 *            Idempotência: se já em opt-out, retorna `ja_estava_optout=true`
 *            sem repetir nenhum dos 4 passos (no-op).
 *
 *   • P2.2 — Lead permanece visível na Base de Leads com badge vermelho
 *            (PASSO 1 marca lead.opt_out=true, badge é renderizado pela UI).
 *
 *   • P2.3 — Cascading GLOBAL via email_fila WHERE destinatario_email + status='pendente':
 *            cancela em TODAS as campanhas (ativas, pausadas, agendadas)
 *            de uma vez, sem filtro por campanha.
 *
 *   • P1.3 — Bounce ≠ Opt-out. Este helper NÃO trata bounces. O bloco A do
 *            webhook continua marcando lead.bounced=true diretamente (sem
 *            entrar em email_optout). Bounce e opt-out são fluxos distintos.
 *
 * ════════════════════════════════════════════════════════════════════════
 * IDEMPOTÊNCIA
 * ════════════════════════════════════════════════════════════════════════
 * O helper detecta se lead.opt_out já é true (PASSO 1.5 — leitura prévia).
 * Se já está em opt-out, retorna {ja_estava_optout:true, total_cancelados:0}
 * sem disparar UPSERT/UPDATE/INSERT. Isso permite que múltiplos cliques no
 * mesmo link de unsubscribe ou re-disparos do webhook não gerem registros
 * duplicados.
 *
 * IMPORTANTE: A idempotência é baseada no estado do LEAD. Se o lead não
 * existir mas o email já estiver em email_optout, o helper ainda re-executa
 * PASSOS 2/3 (a UPSERT é onConflict ignoreDuplicates, então é segura). Esse
 * cenário (email em optout sem lead correspondente) só acontece em
 * importações legadas ou se o lead foi deletado.
 *
 * ════════════════════════════════════════════════════════════════════════
 * MOTIVO_CANCELAMENTO PADRONIZADO (por origem)
 * ════════════════════════════════════════════════════════════════════════
 *   origem='manual'           → 'opt_out_manual'
 *   origem='spam_complaint'   → 'opt_out_spam'
 *   origem='list_unsubscribe' → 'opt_out_list_unsubscribe'
 *   origem='link_rodape'      → 'opt_out_link_rodape'
 *
 * Esses valores são gravados em email_fila.motivo_cancelamento e usados
 * pelo painel de auditoria (Bloco 4-bis pós-testes) para distinguir a
 * origem de cada cancelamento na fila.
 *
 * ════════════════════════════════════════════════════════════════════════
 * USO
 * ════════════════════════════════════════════════════════════════════════
 *   import { aplicarOptOut } from './_helpers/aplicar-opt-out';
 *
 *   const resultado = await aplicarOptOut({
 *     supabase,
 *     lead_id: 13,                          // opcional se email fornecido
 *     email: 'destinatario@example.com',    // obrigatório
 *     motivo: 'Pediu via email',            // opcional (string livre)
 *     origem: 'manual',                     // obrigatório
 *     criado_por: 'Messias Vieira',         // opcional (auditoria)
 *     campanha_origem_id: 5,                // opcional (preenche email_optout)
 *   });
 *
 *   if (!resultado.ok) {
 *     console.error('Falha no opt-out:', resultado.error);
 *   } else if (resultado.ja_estava_optout) {
 *     console.log('Lead já estava em opt-out');
 *   } else {
 *     console.log(`${resultado.total_cancelados} envios cancelados`);
 *   }
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ────────────────────────────────────────────────────────────────────────

/** Origens permitidas do opt-out. Cada uma mapeia para um motivo padronizado. */
export type OrigemOptOut =
  | 'manual'           // Botão na UI da Base de Leads (LeadFormModal v1.2)
  | 'spam_complaint'   // Webhook Resend event 'email.complained'
  | 'list_unsubscribe' // POST RFC 8058 one-click (Gmail/Outlook)
  | 'link_rodape';     // GET no link "SAIR" do rodapé HTML

/** Mapeamento de origem → motivo_cancelamento gravado em email_fila. */
const MAPA_MOTIVO_CANCELAMENTO: Record<OrigemOptOut, string> = {
  manual: 'opt_out_manual',
  spam_complaint: 'opt_out_spam',
  list_unsubscribe: 'opt_out_list_unsubscribe',
  link_rodape: 'opt_out_link_rodape',
};

/** Mapeamento de origem → tipo gravado em email_lead_historico. */
const MAPA_TIPO_HISTORICO: Record<OrigemOptOut, string> = {
  manual: 'opt_out_manual',
  spam_complaint: 'opt_out_spam',
  list_unsubscribe: 'opt_out_list_unsubscribe',
  link_rodape: 'opt_out_link_rodape',
};

export interface AplicarOptOutParams {
  supabase: SupabaseClient;
  /** Id do lead em email_leads. Opcional se `email` for fornecido. */
  lead_id?: number | null;
  /** E-mail do destinatário. SEMPRE obrigatório (chave da cascata). */
  email: string;
  /** Origem do opt-out (define o motivo gravado em fila + tipo do histórico). */
  origem: OrigemOptOut;
  /** Texto livre opcional descrevendo o motivo (vai para email_optout.motivo). */
  motivo?: string | null;
  /** Quem disparou (auditoria — vai para email_lead_historico.criado_por). */
  criado_por?: string | null;
  /** Campanha relacionada ao opt-out (preenche email_optout.campanha_origem_id). */
  campanha_origem_id?: number | null;
}

export interface AplicarOptOutResult {
  ok: boolean;
  /** Lead resolvido (pode ser null se nenhum lead com esse email existe). */
  lead_id: number | null;
  email: string;
  /** True se o lead já estava em opt-out (cascata não foi re-executada). */
  ja_estava_optout: boolean;
  /** Quantidade de itens em email_fila que mudaram de 'pendente' para 'cancelado'. */
  total_cancelados: number;
  /** Motivo gravado em email_fila.motivo_cancelamento. */
  motivo_cancelamento: string;
  /** Erro, se ok=false. */
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ────────────────────────────────────────────────────────────────────────

/**
 * Aplica a cascata de opt-out em 4 passos.
 *
 * Ver cabeçalho do arquivo para documentação completa dos passos, decisões
 * de produto honradas e exemplos de uso.
 */
export async function aplicarOptOut(
  params: AplicarOptOutParams,
): Promise<AplicarOptOutResult> {
  const {
    supabase,
    lead_id: leadIdInput,
    email,
    origem,
    motivo,
    criado_por,
    campanha_origem_id,
  } = params;

  // Normalização do email (chave da cascata — sempre lowercase + trim)
  const emailNorm = String(email || '').toLowerCase().trim();
  const motivoCancelamento = MAPA_MOTIVO_CANCELAMENTO[origem];
  const tipoHistorico = MAPA_TIPO_HISTORICO[origem];
  const motivoFinal = motivo?.trim() || motivoCancelamento;
  const agoraIso = new Date().toISOString();

  // ── Validação básica ──────────────────────────────────────────────────
  if (!emailNorm) {
    return {
      ok: false,
      lead_id: null,
      email: '',
      ja_estava_optout: false,
      total_cancelados: 0,
      motivo_cancelamento: motivoCancelamento,
      error: 'email é obrigatório e não pode ser vazio',
    };
  }
  if (!origem || !MAPA_MOTIVO_CANCELAMENTO[origem]) {
    return {
      ok: false,
      lead_id: null,
      email: emailNorm,
      ja_estava_optout: false,
      total_cancelados: 0,
      motivo_cancelamento: motivoCancelamento || 'opt_out_desconhecido',
      error: `origem inválida: ${origem}`,
    };
  }

  // ── Resolução do lead ────────────────────────────────────────────────
  // Se lead_id foi fornecido, usa direto. Senão busca por email.
  // Em ambos os casos, lê o estado atual de opt_out para checar idempotência.
  let leadResolvido: { id: number; opt_out: boolean | null } | null = null;

  if (leadIdInput) {
    const { data: lead, error: errLead } = await supabase
      .from('email_leads')
      .select('id, opt_out')
      .eq('id', leadIdInput)
      .maybeSingle();
    if (errLead) {
      return {
        ok: false,
        lead_id: null,
        email: emailNorm,
        ja_estava_optout: false,
        total_cancelados: 0,
        motivo_cancelamento: motivoCancelamento,
        error: `Falha ao buscar lead por id: ${errLead.message}`,
      };
    }
    leadResolvido = lead || null;
  } else {
    // Busca por email — pode retornar múltiplos leads com mesmo email; pega
    // o primeiro ativo (a cascata cancela fila por email, então cobre todos).
    const { data: leads, error: errLead } = await supabase
      .from('email_leads')
      .select('id, opt_out')
      .eq('email', emailNorm)
      .limit(1);
    if (errLead) {
      return {
        ok: false,
        lead_id: null,
        email: emailNorm,
        ja_estava_optout: false,
        total_cancelados: 0,
        motivo_cancelamento: motivoCancelamento,
        error: `Falha ao buscar lead por email: ${errLead.message}`,
      };
    }
    leadResolvido = leads?.[0] || null;
  }

  // ── Idempotência: lead já em opt-out → no-op ─────────────────────────
  if (leadResolvido?.opt_out === true) {
    return {
      ok: true,
      lead_id: leadResolvido.id,
      email: emailNorm,
      ja_estava_optout: true,
      total_cancelados: 0,
      motivo_cancelamento: motivoCancelamento,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // PASSO 1 — UPDATE email_leads (marca opt_out=true)
  // ════════════════════════════════════════════════════════════════════
  // Só executa se um lead foi resolvido. Se nenhum lead tem esse email
  // (cenário improvável mas possível em importações), pula PASSO 1 e
  // segue para PASSOS 2/3 (que operam pelo email, não pelo lead_id).
  if (leadResolvido) {
    const { error: errUpdLead } = await supabase
      .from('email_leads')
      .update({
        opt_out: true,
        opt_out_em: agoraIso,
        atualizado_em: agoraIso,
      })
      .eq('id', leadResolvido.id);

    if (errUpdLead) {
      return {
        ok: false,
        lead_id: leadResolvido.id,
        email: emailNorm,
        ja_estava_optout: false,
        total_cancelados: 0,
        motivo_cancelamento: motivoCancelamento,
        error: `Falha ao marcar opt_out no lead: ${errUpdLead.message}`,
      };
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // PASSO 2 — UPSERT email_optout (lista global LGPD)
  // ════════════════════════════════════════════════════════════════════
  // onConflict:'email' + ignoreDuplicates:true torna esta operação
  // idempotente — se o email já está em email_optout, não sobrescreve
  // (preserva o motivo original do primeiro opt-out).
  await supabase.from('email_optout').upsert(
    {
      email: emailNorm,
      motivo: motivoFinal,
      campanha_origem_id: campanha_origem_id ?? null,
      criado_em: agoraIso,
    },
    { onConflict: 'email', ignoreDuplicates: true },
  );

  // ════════════════════════════════════════════════════════════════════
  // PASSO 3 — UPDATE email_fila (cancela pendentes GLOBALMENTE)
  // ════════════════════════════════════════════════════════════════════
  // Filtro pelo destinatário (não pelo lead_id) — cobre TODAS as campanhas
  // em que esse email está pendente (decisão P2.3 — cascading global).
  // Inclui campanhas em status ativa, pausada e agendada (o filtro
  // status='pendente' do item da fila já garante que só envios não
  // realizados são afetados).
  const { data: cancelados, error: errCancel } = await supabase
    .from('email_fila')
    .update({
      status: 'cancelado',
      motivo_cancelamento: motivoCancelamento,
    })
    .eq('destinatario_email', emailNorm)
    .eq('status', 'pendente')
    .select('id');

  const totalCancelados = cancelados?.length || 0;
  if (errCancel) {
    // Log mas não interrompe: PASSOS 1 e 2 já executaram (opt-out já
    // efetivado). O cron do disparar-fila tem defesa em profundidade
    // (Fase C — verifica email_optout antes de cada envio), então a
    // falha aqui não desabilita a proteção. Apenas perdemos a auditoria
    // do motivo_cancelamento na fila.
    console.warn(
      `[aplicar-opt-out] ⚠️ Falha ao cancelar fila pendente de ${emailNorm}:`,
      errCancel.message,
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PASSO 4 — INSERT email_lead_historico (auditoria LGPD)
  // ════════════════════════════════════════════════════════════════════
  // Só registra se o lead foi resolvido. Sem lead, não há onde registrar
  // o histórico (a tabela é particionada por lead_id).
  if (leadResolvido) {
    await supabase.from('email_lead_historico').insert({
      lead_id: leadResolvido.id,
      tipo: tipoHistorico,
      descricao:
        `Opt-out (${origem}) aplicado` +
        (criado_por ? ` por ${criado_por}` : '') +
        `. Motivo: ${motivoFinal}. ` +
        `${totalCancelados} envio(s) pendente(s) cancelado(s).`,
      dados: {
        origem,
        motivo: motivoFinal,
        total_cancelados: totalCancelados,
        email: emailNorm,
        campanha_origem_id: campanha_origem_id ?? null,
      },
      criado_por: criado_por ?? `auto:${origem}`,
    });
  }

  console.log(
    `✅ [aplicar-opt-out/${origem}] ${emailNorm} ` +
      `(lead_id=${leadResolvido?.id ?? 'N/A'}) ` +
      `→ ${totalCancelados} pendente(s) cancelado(s).`,
  );

  return {
    ok: true,
    lead_id: leadResolvido?.id ?? null,
    email: emailNorm,
    ja_estava_optout: false,
    total_cancelados: totalCancelados,
    motivo_cancelamento: motivoCancelamento,
  };
}
