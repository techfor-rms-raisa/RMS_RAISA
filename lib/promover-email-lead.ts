/**
 * lib/promover-email-lead.ts — Helper de promoção TRANSFERÊNCIA
 *   prospect_leads (motor='importacao_lista') → email_leads (CRM)
 *
 * Caminho: lib/promover-email-lead.ts
 * Versão: 1.1 (Sub-fase 3.D refino — 18/06/2026 — origem parametrizável)
 *
 * 🆕 v1.1 (18/06/2026 — Sub-fase 3.D refino: Promover Lead manual):
 *   Parametriza o campo `origem` (default mantém compatibilidade total
 *   com chamadas existentes da auto-promoção). Permite que callers
 *   distingam entre cenários de promoção:
 *     - `revalidacao_importacao_lista` (default) — auto-promoção do
 *       cascade quando `status_atualizacao='atualizado'` e
 *       `review_manual=false`.
 *     - `importacao_manual` — promoção via botão "Promover Lead" da
 *       aba Leads Importados (usuário decide promover apesar de
 *       `nao_localizado`, assumindo o risco de bounce).
 *   A origem é aplicada tanto no `email_leads.origem` quanto no
 *   `email_empresas.origem` (quando empresa é criada na promoção).
 *
 * v1.0 (Sub-fase 3.D — 17/06/2026): primeira versão.
 *
 * Encapsula a regra de promoção do lead da base transitória
 * (prospect_leads) para o CRM (email_leads), aplicando as
 * salvaguardas:
 *
 *   1. Idempotência: se já existe email_lead com mesmo email,
 *      NÃO duplica. Apenas DELETE do prospect (lead já estava no CRM).
 *   2. LGPD: se o email já está em opt_out=true, NÃO promove
 *      e NÃO deleta o prospect (mantém histórico). Marca o
 *      motivo para o caller decidir o que fazer.
 *   3. Atomicidade lógica: INSERT email_lead PRIMEIRO; só faz
 *      DELETE prospect SE INSERT bem-sucedido. Se DELETE falhar
 *      depois (caso raro), o lead em email_leads já é útil e
 *      pode ser sincronizado depois.
 *
 * Reusabilidade: também pode ser chamado por uma futura refatoração
 * da action `importar_prospects` em api/crm-leads.ts (que hoje faz
 * UPDATE status='no_crm' em vez de DELETE). Não está sendo refatorada
 * agora para manter escopo cirúrgico desta sub-fase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export interface ProspectLeadParaPromover {
  id:               number;
  nome_completo:    string;
  email:            string | null;
  cargo:            string | null;
  linkedin_url:     string | null;
  empresa_nome:     string | null;
  empresa_dominio:  string | null;
  empresa_setor:    string | null;
  cidade:           string | null;
  estado:           string | null;
  vertical:         string | null;
  reservado_por:    number | null;
}

export type MotivoPromocao =
  | 'ok'
  | 'sem_email'
  | 'opt_out_lgpd'
  | 'lead_ja_existia'
  | 'erro_insert_lead'
  | 'erro_delete_prospect';

export interface ResultadoPromocao {
  promovido:       boolean;
  motivo:          MotivoPromocao;
  email_lead_id?:  number;
  empresa_id?:     number;
}

// ════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════════

/**
 * Promove (TRANSFERE) um prospect_lead para email_leads. Retorna o
 * resultado da operação, incluindo motivo de não-promoção quando
 * aplicável.
 *
 * IMPORTANTE: assume que a checagem do critério de promoção
 * (status_atualizacao='atualizado' E review_manual=false) já foi
 * feita pelo caller. Este helper só executa, não decide.
 *
 * @param params.supabase   Cliente do Supabase (com service role)
 * @param params.prospect   Registro completo do prospect_leads
 * @param params.criado_por Nome de exibição do criador (string,
 *                          padrão app_users.nome_usuario)
 * @param params.origem     🆕 v1.1 — Origem a registrar em
 *                          email_leads.origem e email_empresas.origem.
 *                          Default: 'revalidacao_importacao_lista' (auto-promoção).
 *                          Use 'importacao_manual' para promoção via botão manual.
 */
export async function promoverParaEmailLeads(params: {
  supabase:   SupabaseClient;
  prospect:   ProspectLeadParaPromover;
  criado_por: string;
  origem?:    string;
}): Promise<ResultadoPromocao> {
  const { supabase, prospect, criado_por } = params;
  // 🆕 v1.1 — origem parametrizada (default mantém compatibilidade com v1.0)
  const origem = params.origem || 'revalidacao_importacao_lista';

  // ── (1) Email obrigatório ───────────────────────────────
  if (!prospect.email) {
    return { promovido: false, motivo: 'sem_email' };
  }
  const emailNorm = prospect.email.toLowerCase().trim();

  // ── (2) Lead já existe em email_leads? ──────────────────
  const { data: existente } = await supabase
    .from('email_leads')
    .select('id, opt_out')
    .eq('email', emailNorm)
    .maybeSingle();

  if (existente) {
    // (2a) Opt-out: LGPD impede promoção e mantém histórico no
    // prospect (não deletamos — registro fica como "tentativa").
    if (existente.opt_out) {
      console.warn(`⚠️ [promover-email-lead] LGPD opt_out bloqueou promoção do prospect_id=${prospect.id} (email já em email_leads.id=${existente.id} com opt_out=true)`);
      return {
        promovido:     false,
        motivo:        'opt_out_lgpd',
        email_lead_id: existente.id,
      };
    }

    // (2b) Lead já existe sem opt-out: não duplicamos. DELETE
    // do prospect (base transitória limpa). O lead em email_leads
    // continua intacto, sem regressão dos dados eventualmente mais
    // atualizados que já estavam lá.
    const { error: errDel } = await supabase
      .from('prospect_leads')
      .delete()
      .eq('id', prospect.id);

    if (errDel) {
      console.error(`❌ [promover-email-lead] DELETE prospect_id=${prospect.id} (caso duplicado) falhou: ${errDel.message}`);
      return { promovido: false, motivo: 'erro_delete_prospect', email_lead_id: existente.id };
    }
    return { promovido: false, motivo: 'lead_ja_existia', email_lead_id: existente.id };
  }

  // ── (3) Resolve empresa — find or create em email_empresas ─
  let empresa_id: number | undefined;
  const dominioNorm = (prospect.empresa_dominio || '').toLowerCase().trim();

  if (dominioNorm) {
    const { data: empExistente } = await supabase
      .from('email_empresas')
      .select('id')
      .eq('dominio', dominioNorm)
      .maybeSingle();
    if (empExistente) empresa_id = empExistente.id;
  }

  if (!empresa_id && (prospect.empresa_nome || dominioNorm)) {
    const { data: empNova, error: errEmp } = await supabase
      .from('email_empresas')
      .insert({
        nome:         prospect.empresa_nome || dominioNorm,
        dominio:      dominioNorm || null,
        setor:        prospect.empresa_setor ?? null,
        cidade:       prospect.cidade ?? null,
        uf:           prospect.estado ?? null,
        origem,       // 🆕 v1.1 — parametrizada (auto-promoção vs manual)
        criado_por,
      })
      .select('id')
      .single();
    if (!errEmp && empNova) {
      empresa_id = empNova.id;
    } else if (errEmp) {
      console.warn(`⚠️ [promover-email-lead] Falha ao criar empresa para prospect_id=${prospect.id}: ${errEmp.message} — segue sem empresa_id`);
    }
  }

  // ── (4) INSERT email_lead ───────────────────────────────
  const { data: novoLead, error: errIns } = await supabase
    .from('email_leads')
    .insert({
      empresa_id:       empresa_id ?? null,
      prospect_lead_id: prospect.id,
      nome:             prospect.nome_completo?.trim() || 'Sem nome',
      email:            emailNorm,
      cargo:            prospect.cargo ?? null,
      linkedin_url:     prospect.linkedin_url ?? null,
      origem,           // 🆕 v1.1 — parametrizada (auto-promoção vs manual)
      vertical:         prospect.vertical ?? null,
      apto_campanha:    true,
      reservado_por:    prospect.reservado_por ?? null,
      funil_status:     'lead',
      criado_por,
    })
    .select('id')
    .single();

  if (errIns || !novoLead) {
    console.error(`❌ [promover-email-lead] INSERT email_lead falhou para prospect_id=${prospect.id}: ${errIns?.message}`);
    return { promovido: false, motivo: 'erro_insert_lead' };
  }

  // ── (5) DELETE prospect_lead (TRANSFERIR — base transitória) ─
  const { error: errDel } = await supabase
    .from('prospect_leads')
    .delete()
    .eq('id', prospect.id);

  if (errDel) {
    // Lead em email_leads já existe — não rollback. Logamos e seguimos.
    console.error(`❌ [promover-email-lead] DELETE prospect_id=${prospect.id} falhou APÓS INSERT em email_lead_id=${novoLead.id}: ${errDel.message}`);
    return {
      promovido:     true,    // do ponto de vista do CRM, foi promovido
      motivo:        'erro_delete_prospect',
      email_lead_id: novoLead.id,
      empresa_id,
    };
  }

  console.log(`🚀 [promover-email-lead] prospect_id=${prospect.id} → email_lead_id=${novoLead.id} (empresa_id=${empresa_id ?? 'null'}, origem=${origem})`);
  return {
    promovido:     true,
    motivo:        'ok',
    email_lead_id: novoLead.id,
    empresa_id,
  };
}
