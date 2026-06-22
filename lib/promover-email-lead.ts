/**
 * lib/promover-email-lead.ts — Helper de promoção TRANSFERÊNCIA
 *   prospect_leads (motor='importacao_lista') → email_leads (CRM)
 *
 * Caminho: lib/promover-email-lead.ts
 * Versão: 1.3 (22/06/2026 — FIX erro_delete_prospect: troca DELETE por UPDATE status='no_crm')
 *
 * 🆕 v1.3 (22/06/2026 — FIX erro_delete_prospect em "Promover Lead manual"):
 *   Os DOIS `.delete()` em `prospect_leads` (caso (2b) duplicado e caso (5)
 *   pós-INSERT) foram trocados por `.update({ status: 'no_crm' })`.
 *
 *   Causa raiz (diagnosticada em 22/06/2026 via SQL direto em Production):
 *   o DELETE estava falhando em todos os casos, mesmo com a FK
 *   `email_leads_prospect_lead_id_fkey` declarada como `ON DELETE SET NULL`.
 *   A query de `information_schema` confirmou que existem outras FKs
 *   apontando para `prospect_leads.id` com `delete_rule='NO ACTION'`:
 *     - `prospect_leads_lead_anterior_id_fkey` (auto-referência)
 *     - `prospect_revalidacao_log_lead_id_novo_fkey`
 *   Sempre que o prospect a deletar é referenciado por algum desses,
 *   o DELETE é rejeitado pelo Postgres (erro 23503) e o helper devolve
 *   `motivo: 'erro_delete_prospect'`. A UI exibe "Falha ao promover".
 *
 *   Solução adotada (consistente com o restante do código):
 *   marcar o prospect com `status='no_crm'`, padrão já usado pelas actions
 *   `importar_prospects` (linhas 497-500 do api/crm-leads.ts) e
 *   `promover_para_campanha` (linhas 631-635) há meses. O valor 'no_crm'
 *   já está no CHECK constraint `prospect_leads_status_check` (migration
 *   30/05/2026) e o frontend do Prospect Engine já filtra por
 *   `status != 'no_crm'` — efeito visual idêntico ao DELETE, sem
 *   inconsistência de FK e preservando histórico/auditoria.
 *
 *   Mudança CIRÚRGICA — apenas o `.delete()` virou `.update()` nos 2
 *   pontos. Todo o resto (logs, mensagens, retorno do enum, motivos,
 *   exports) permanece IDÊNTICO à v1.2 para preservar:
 *     - Compatibilidade com PromoverLeadModal.tsx (que lê o enum)
 *     - Compatibilidade com qualquer outro caller atual (auto-promoção)
 *     - Contrato do tipo `MotivoPromocao` exportado
 *
 *   Como o motivo `'erro_delete_prospect'` continua existindo no enum,
 *   se algum dia o UPDATE falhar (caso raríssimo: lead deletado por
 *   outra sessão, race condition), o token de erro continua semanticamente
 *   correto ("falha ao remover prospect da fila"). Renomeação para
 *   `'erro_update_prospect'` foi avaliada e descartada por exigir mudança
 *   em pelo menos 1 outro arquivo (modal) e quebrar a regra cirúrgica.
 *
 * 🆕 v1.2 (19/06/2026 — FIX Bug ownership empresa):
 *   Ao criar uma nova empresa em `email_empresas` durante a promoção,
 *   herda `reservado_por` e `reservado_em` do prospect_lead.
 *
 *   Causa raiz: a coluna `email_empresas.reservado_por` foi adicionada
 *   pela migration 2026-05-28_crm_apto_campanha_ownership.sql cujo
 *   COMMENT oficial diz: "Herdado do prospect_leads no momento da
 *   promoção". Mas o INSERT do helper omitia o campo, deixando empresas
 *   recém-criadas com reservado_por=NULL.
 *
 *   Impacto no usuário: para Gestão Comercial (filtro RBAC "Suas"),
 *   essas empresas órfãs NÃO apareciam no dropdown do Editar Lead
 *   (form mostrava "Sem empresa" mesmo com empresa_id válido em
 *   email_leads). A coluna EMPRESA na listagem Meus Leads, em contraste,
 *   exibe o nome correto via JOIN sem filtro RBAC — mascarando o bug.
 *
 *   Sintoma confirmado no smoke SmokeMotor.xlsx (19/06/2026):
 *     - Vanessa.empresa_id=11 (Stone) → válido no banco
 *     - email_empresas.id=11 (Stone) → reservado_por=NULL  ❌
 *     - Dropdown da Gestão Comercial → Stone ausente
 *
 *   Mudança cirúrgica:
 *     - INSERT email_empresas agora inclui:
 *         reservado_por: prospect.reservado_por ?? null
 *         reservado_em:  new Date().toISOString() (quando reservado_por)
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
 *      NÃO duplica. Apenas marca prospect com status='no_crm'
 *      (lead já estava no CRM).
 *   2. LGPD: se o email já está em opt_out=true, NÃO promove
 *      e NÃO toca no prospect (mantém histórico). Marca o
 *      motivo para o caller decidir o que fazer.
 *   3. Atomicidade lógica: INSERT email_lead PRIMEIRO; só faz
 *      UPDATE prospect SE INSERT bem-sucedido. Se UPDATE falhar
 *      depois (caso raro), o lead em email_leads já é útil e
 *      pode ser sincronizado depois.
 *
 * Reusabilidade: também pode ser chamado por uma futura refatoração
 * da action `importar_prospects` em api/crm-leads.ts (que já faz
 * UPDATE status='no_crm' — agora 100% alinhado com este helper).
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
    // prospect (não tocamos — registro fica como "tentativa").
    if (existente.opt_out) {
      console.warn(`⚠️ [promover-email-lead] LGPD opt_out bloqueou promoção do prospect_id=${prospect.id} (email já em email_leads.id=${existente.id} com opt_out=true)`);
      return {
        promovido:     false,
        motivo:        'opt_out_lgpd',
        email_lead_id: existente.id,
      };
    }

    // (2b) Lead já existe sem opt-out: não duplicamos. Marca prospect
    // como 'no_crm' (base transitória limpa do ponto de vista do front,
    // que filtra status != 'no_crm'). O lead em email_leads continua
    // intacto, sem regressão dos dados eventualmente mais atualizados
    // que já estavam lá.
    // 🆕 v1.3 — antes era DELETE, virou UPDATE (FKs com NO ACTION quebravam o DELETE).
    const { error: errDel } = await supabase
      .from('prospect_leads')
      .update({ status: 'no_crm' })
      .eq('id', prospect.id);

    if (errDel) {
      console.error(`❌ [promover-email-lead] UPDATE prospect_id=${prospect.id} status='no_crm' (caso duplicado) falhou: ${errDel.message}`);
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
    // 🆕 v1.2 (19/06/2026): herda ownership do prospect — sem isso, empresas
    // ficam órfãs (reservado_por=NULL) e somem do dropdown da Gestão Comercial.
    const reservadoEm = prospect.reservado_por ? new Date().toISOString() : null;
    const { data: empNova, error: errEmp } = await supabase
      .from('email_empresas')
      .insert({
        nome:          prospect.empresa_nome || dominioNorm,
        dominio:       dominioNorm || null,
        setor:         prospect.empresa_setor ?? null,
        cidade:        prospect.cidade ?? null,
        uf:            prospect.estado ?? null,
        origem,        // 🆕 v1.1 — parametrizada (auto-promoção vs manual)
        reservado_por: prospect.reservado_por ?? null,  // 🆕 v1.2 — herda do prospect
        reservado_em:  reservadoEm,                     // 🆕 v1.2 — coerente com reservado_por
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

  // ── (5) Marca prospect como 'no_crm' (TRANSFERIR — base transitória) ─
  // 🆕 v1.3 — antes era DELETE, virou UPDATE. Padrão consistente com
  // api/crm-leads.ts actions importar_prospects e promover_para_campanha.
  // Sai do front do Prospect Engine (filtro status != 'no_crm'), preserva
  // histórico e auditoria, evita conflito com FKs NO ACTION.
  const { error: errDel } = await supabase
    .from('prospect_leads')
    .update({ status: 'no_crm' })
    .eq('id', prospect.id);

  if (errDel) {
    // Lead em email_leads já existe — não rollback. Logamos e seguimos.
    console.error(`❌ [promover-email-lead] UPDATE prospect_id=${prospect.id} status='no_crm' falhou APÓS INSERT em email_lead_id=${novoLead.id}: ${errDel.message}`);
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
