/**
 * api/campaign-email-recovery.ts
 *
 * EMAIL RECOVERY PIPELINE — v1.0
 * Fase 2 (F3 + F6) — Endpoint orquestrador do Recovery
 * Data: 12/06/2026
 *
 * Decisões de produto alinhadas (12/06/2026):
 *  D1 — Escopo Completo (8 frentes)
 *  D2 — Trigger Híbrido (auto se padrão conhecido, manual se desconhecido)
 *  D3 — Limiar de confiança: padrão "estável" = confianca >= 3
 *  D4 — Re-enfileiramento: recomeça do step 1 (e-mail novo = destinatário novo)
 *  D5 — Fluxo manual testa todos os 30+ padrões
 *  D6 — F7 + aba "Leads Inválidos" (unificada)
 *  D7 — Aba Inválidos: F7 + bounce + MX (motivo_invalidacao registra a origem)
 *  D8 — RBAC: Admin + Gestão Comercial + SDR (validação na UI)
 *  D9 — Máximo 3 tentativas totais por lead, depois "definitivamente irrecuperável"
 *  D10 — Edição manual: campo livre + clique "Validar e Reativar" (MX + Snov.io opcional)
 *
 * ACTIONS:
 *  POST  ?action=recover_lead       → F3+F6 orquestração completa
 *    body: { lead_id, criado_por }
 *
 *  POST  ?action=manual_revalidate  → D10 — analista editou o e-mail e quer reativar
 *    body: { lead_id, novo_email, criado_por, validar_snovio? }
 *
 *  GET   ?action=lead_status        → consulta status de Recovery (UI usa para botão)
 *    query: lead_id
 *
 * FLUXO recover_lead (resumo):
 *  1. Carrega lead; valida tentativas_recovery < 3
 *  2. Valida MX do domínio atual → se falha, marca motivo='mx', incrementa, retorna
 *  3. Consulta email_padroes_empresa pelo domínio:
 *     - HIT  (confianca >= 3) → modo AUTO: gera 1 candidato com gerarPorPadrao
 *     - MISS                  → modo MANUAL: gera 30+ candidatos com gerarVariacoes
 *  4. Verifica via Snov.io Email Verifier (early-exit no primeiro válido)
 *  5. Sucesso → UPDATE email_leads + aprenderPadrao() + re-enfileira em campanhas
 *  6. Falha   → incrementa tentativas_recovery; se chegou em 3, motivo='no_match'
 *
 * RE-ENFILEIRAMENTO INLINE (F6):
 *  - NÃO usa vincularLeadACampanha do crm-leads (esse helper BLOQUEIA lead já
 *    vinculado a campanha em andamento). No Recovery o lead CONTINUA vinculado
 *    em email_lead_campanhas (só a email_fila pendente foi cancelada via P1.2).
 *  - Re-cria entradas em email_fila para TODAS as campanhas em status
 *    ativa/pausada onde o lead estava vinculado. Reset step_atual=1.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { extrairDominio, validarMX } from './_utils/mx-validator.js';
import {
  gerarVariacoes,
  gerarPorPadrao,
  detectarTemplate,
} from './_utils/email-patterns.js';
import {
  verificarLoteAteValido,
  verificarEmail,
} from './_utils/snovio-verifier.js';

export const config = { maxDuration: 60 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TIPOS
// ============================================================================

type MotivoInvalidacao =
  | 'bounce'
  | 'mx'
  | 'f7_pre_campanha'
  | 'no_match'
  | 'edicao_manual';

type Extensao = '.com' | '.com.br';

interface ResultadoEnfileiramento {
  campanhas_re_enfileiradas: number;
  envios_agendados: number;
  erros: string[];
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Separa nome completo em nome (primeira palavra) + sobrenome (resto).
 * "Luis Cavanha" → { nome: 'Luis', sobrenome: 'Cavanha' }
 * "Maria Eduarda Silva" → { nome: 'Maria', sobrenome: 'Eduarda Silva' }
 * "JoaoSemSobrenome" → null (sem espaço → não consegue separar)
 */
function splitNome(nomeCompleto: string): { nome: string; sobrenome: string } | null {
  if (!nomeCompleto) return null;
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return null;
  return {
    nome: partes[0],
    sobrenome: partes.slice(1).join(' '),
  };
}

/**
 * Extrai a base do domínio (sem TLD) para chave de email_padroes_empresa.
 * Espelha exatamente extrairBaseDominio() de email-patterns.ts.
 */
function baseDoDominio(d: string): string {
  return (d || '').toLowerCase().trim().replace(/\.(com\.br|com|net|org|io|app|tech)$/i, '');
}

/**
 * Registra evento no histórico do lead (mesma tabela usada por crm-leads).
 */
async function registrarHistorico(
  leadId: number,
  tipo: string,
  descricao: string,
  criadoPor: string
): Promise<void> {
  await supabase.from('email_lead_historico').insert({
    lead_id: leadId,
    tipo,
    descricao,
    criado_por: criadoPor,
  });
}

/**
 * Aprende padrão da empresa: incrementa confianca se já existe, senão insere.
 * Chamado após cada validação positiva (auto-aprendizado F4 — D3).
 */
async function aprenderPadrao(
  dominio: string,
  template: string,
  extensao: Extensao
): Promise<void> {
  const baseDom = baseDoDominio(dominio);
  if (!baseDom) return;

  const { data: existente } = await supabase
    .from('email_padroes_empresa')
    .select('id, confianca')
    .eq('dominio', baseDom)
    .eq('template', template)
    .eq('extensao', extensao)
    .maybeSingle();

  if (existente) {
    await supabase
      .from('email_padroes_empresa')
      .update({ confianca: existente.confianca + 1 })
      .eq('id', existente.id);
  } else {
    await supabase
      .from('email_padroes_empresa')
      .insert({ dominio: baseDom, template, extensao, confianca: 1 });
  }
}

/**
 * Re-enfileira lead em TODAS as campanhas ativas/pausadas onde ele estava
 * vinculado, com novo e-mail e recomeçando do step 1 (D4).
 *
 * NÃO insere em email_lead_campanhas (o vínculo já existe desde antes do bounce).
 * Apenas:
 *   1. Reseta step_atual=1 nos vínculos existentes
 *   2. Cria entradas novas em email_fila para todos os steps ativos
 *
 * NÃO usa vincularLeadACampanha (esse helper BLOQUEIA lead já vinculado).
 * Lógica espelha o passo 9 daquele helper (cálculo de datas + INSERT em fila).
 */
async function reEnfileirarEmCampanhasAtivas(
  leadId: number,
  novoEmail: string,
  nomeLead: string
): Promise<ResultadoEnfileiramento> {
  const out: ResultadoEnfileiramento = {
    campanhas_re_enfileiradas: 0,
    envios_agendados: 0,
    erros: [],
  };

  // 1. Listar vínculos do lead em campanhas em status ativa OU pausada
  const { data: vinculos, error: errVinc } = await supabase
    .from('email_lead_campanhas')
    .select(
      'id, campanha_id, email_campanhas!inner(id, nome, status, inicio_envio, dominio_envio)'
    )
    .eq('lead_id', leadId)
    .in('email_campanhas.status', ['ativa', 'pausada']);

  if (errVinc) {
    out.erros.push(`Falha ao listar vínculos: ${errVinc.message}`);
    return out;
  }
  if (!vinculos || vinculos.length === 0) {
    return out; // lead não está em campanha ativa — nada a fazer
  }

  const emailNorm = novoEmail.toLowerCase().trim();

  for (const v of vinculos as any[]) {
    const camp = v.email_campanhas;
    if (!camp || !camp.inicio_envio) continue; // não iniciada ainda

    // 2. Reset step_atual=1 (D4)
    const { error: errReset } = await supabase
      .from('email_lead_campanhas')
      .update({ step_atual: 1 })
      .eq('id', v.id);

    if (errReset) {
      out.erros.push(`Campanha "${camp.nome}" (ID ${camp.id}): falha no reset step — ${errReset.message}`);
      continue;
    }

    // 3. Buscar steps ativos da campanha, ordenados
    const { data: steps, error: errSteps } = await supabase
      .from('email_campanha_steps')
      .select('id, ordem, delay_dias')
      .eq('campanha_id', camp.id)
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (errSteps) {
      out.erros.push(`Campanha "${camp.nome}": falha ao ler steps — ${errSteps.message}`);
      continue;
    }
    if (!steps || steps.length === 0) {
      out.erros.push(`Campanha "${camp.nome}": sem steps ativos`);
      continue;
    }

    // 4. Calcular agendamento de cada step (espelha vincularLeadACampanha)
    const agora = new Date();
    const stepDates = new Map<number, string>();
    let cumDays = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (i === 0) {
        // Step 1: dispara imediatamente (delay_dias do step 1 é ignorado por padrão)
        stepDates.set(s.id, agora.toISOString());
      } else {
        cumDays += Number(s.delay_dias) || 0;
        const dt = new Date(agora);
        dt.setDate(dt.getDate() + cumDays);
        stepDates.set(s.id, dt.toISOString());
      }
    }

    // 5. INSERT em email_fila com o NOVO e-mail recuperado
    const filaRows = steps.map((s: any) => ({
      campanha_id: camp.id,
      step_id: s.id,
      lead_id: leadId,
      destinatario_email: emailNorm,
      destinatario_nome: nomeLead || null,
      dominio_usado: camp.dominio_envio || null,
      status: 'pendente',
      agendado_para: stepDates.get(s.id),
    }));

    const { data: ins, error: errFila } = await supabase
      .from('email_fila')
      .insert(filaRows)
      .select('id');

    if (errFila) {
      out.erros.push(`Campanha "${camp.nome}": falha ao enfileirar — ${errFila.message}`);
      continue;
    }

    out.campanhas_re_enfileiradas++;
    out.envios_agendados += ins?.length || 0;
  }

  return out;
}

/**
 * UPDATE atômico de email_leads após sucesso do Recovery.
 * Limpa todas as flags de invalidação e marca recovery_em.
 */
async function aplicarSucessoNoLead(
  leadId: number,
  novoEmail: string,
  novasTentativas: number,
  criadoPor: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('email_leads')
    .update({
      email: novoEmail,
      bounced: false,
      bounced_em: null,
      bounced_motivo: null,
      motivo_invalidacao: null,
      recovery_em: new Date().toISOString(),
      tentativas_recovery: novasTentativas,
      apto_campanha: true,
      apto_campanha_em: new Date().toISOString(),
      apto_campanha_por: criadoPor,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', leadId);

  return error ? { error: error.message } : {};
}

/**
 * UPDATE atômico de email_leads após FALHA do Recovery (sem alterar email).
 */
async function aplicarFalhaNoLead(
  leadId: number,
  novasTentativas: number,
  motivo: MotivoInvalidacao
): Promise<void> {
  await supabase
    .from('email_leads')
    .update({
      tentativas_recovery: novasTentativas,
      motivo_invalidacao: motivo,
      apto_campanha: false,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', leadId);
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const action = (req.query.action ?? req.body?.action) as string;
    if (!action) {
      return res
        .status(400)
        .json({ success: false, error: 'Parâmetro "action" é obrigatório' });
    }

    if (req.method === 'POST' && action === 'recover_lead') {
      return await handleRecoverLead(req, res);
    }

    if (req.method === 'POST' && action === 'manual_revalidate') {
      return await handleManualRevalidate(req, res);
    }

    if (req.method === 'GET' && action === 'lead_status') {
      return await handleLeadStatus(req, res);
    }

    return res
      .status(400)
      .json({ success: false, error: `Action "${action}" não suportada` });
  } catch (err: any) {
    console.error('❌ [campaign-email-recovery] Erro geral:', err);
    return res
      .status(500)
      .json({ success: false, error: err?.message || 'Erro desconhecido' });
  }
}

// ============================================================================
// ACTION: recover_lead — F3+F6 orquestração completa
// ============================================================================

async function handleRecoverLead(req: VercelRequest, res: VercelResponse) {
  const { lead_id, criado_por } = req.body || {};
  if (!lead_id) {
    return res.status(400).json({ success: false, error: 'lead_id obrigatório' });
  }
  if (!criado_por) {
    return res.status(400).json({ success: false, error: 'criado_por obrigatório' });
  }

  // 1. Carregar lead
  const { data: lead, error: errLead } = await supabase
    .from('email_leads')
    .select(
      'id, nome, email, vertical, bounced, apto_campanha, tentativas_recovery, motivo_invalidacao'
    )
    .eq('id', lead_id)
    .maybeSingle();

  if (errLead) {
    return res.status(500).json({ success: false, error: `DB: ${errLead.message}` });
  }
  if (!lead) {
    return res.status(404).json({ success: false, error: 'Lead não encontrado' });
  }

  // 2. Validar pré-condições
  if (lead.tentativas_recovery >= 3) {
    return res.status(200).json({
      success: false,
      status: 'limit_reached',
      tentativas_recovery: lead.tentativas_recovery,
      error: 'Lead atingiu 3 tentativas — definitivamente irrecuperável.',
    });
  }

  if (!lead.bounced && !lead.motivo_invalidacao) {
    return res.status(400).json({
      success: false,
      status: 'lead_not_invalid',
      error:
        'Lead não está em estado de Recovery (não há bounce nem invalidação).',
    });
  }

  // 3. Separar nome/sobrenome
  const splitted = splitNome(lead.nome);
  if (!splitted) {
    return res.status(400).json({
      success: false,
      status: 'nome_invalido',
      error: `Não foi possível separar nome/sobrenome de "${lead.nome}". Use edição manual.`,
    });
  }
  const { nome, sobrenome } = splitted;

  // 4. Extrair domínio do e-mail atual
  const dominioCompleto = extrairDominio(lead.email);
  if (!dominioCompleto) {
    const novasT = lead.tentativas_recovery + 1;
    await aplicarFalhaNoLead(lead.id, novasT, 'mx');
    return res.status(200).json({
      success: false,
      status: 'invalid_email_format',
      error: 'E-mail atual tem formato inválido.',
      tentativas_consumidas: novasT,
    });
  }

  // 5. Validar MX
  const mxResult = await validarMX(dominioCompleto);
  if (!mxResult.valido) {
    const novasT = lead.tentativas_recovery + 1;
    await aplicarFalhaNoLead(lead.id, novasT, 'mx');
    await registrarHistorico(
      lead.id,
      'recovery_falhou_mx',
      `Recovery falhou — MX do domínio ${dominioCompleto} inválido (${mxResult.erro})`,
      criado_por
    );

    return res.status(200).json({
      success: false,
      status: 'invalid_mx',
      dominio: dominioCompleto,
      mx_erro: mxResult.erro,
      tentativas_consumidas: novasT,
    });
  }

  // 6. Consultar padrão estável da empresa (D3 — confianca >= 3)
  const baseDom = baseDoDominio(dominioCompleto);
  const { data: padraoEstavel } = await supabase
    .from('email_padroes_empresa')
    .select('template, extensao, confianca')
    .eq('dominio', baseDom)
    .gte('confianca', 3)
    .order('confianca', { ascending: false })
    .limit(1)
    .maybeSingle();

  let modo: 'auto' | 'manual' = padraoEstavel ? 'auto' : 'manual';

  // 7. Gerar candidatos (auto = 1 candidato; manual = 30+ candidatos)
  let candidatos: { email: string; template: string; extensao: Extensao }[] = [];

  if (modo === 'auto' && padraoEstavel) {
    const um = gerarPorPadrao(
      { nome, sobrenome, dominio: dominioCompleto },
      padraoEstavel.template,
      padraoEstavel.extensao as Extensao
    );
    if (um) {
      candidatos = [{ email: um.email, template: um.template, extensao: um.extensao }];
    }
  }

  // Fallback: se auto não conseguiu gerar (template ausente, etc.), cai para manual
  if (candidatos.length === 0) {
    modo = 'manual';
    const variantes = gerarVariacoes({ nome, sobrenome, dominio: dominioCompleto });
    candidatos = variantes.map(v => ({
      email: v.email,
      template: v.template,
      extensao: v.extensao,
    }));
  }

  if (candidatos.length === 0) {
    const novasT = lead.tentativas_recovery + 1;
    await aplicarFalhaNoLead(lead.id, novasT, 'no_match');
    return res.status(200).json({
      success: false,
      status: 'no_candidates',
      error: 'Não foi possível gerar candidatos (verifique nome/sobrenome).',
      tentativas_consumidas: novasT,
    });
  }

  // 8. Verificar via Snov.io (early-exit no primeiro válido)
  const { encontrado, todos, creditos_totais } = await verificarLoteAteValido(
    candidatos.map(c => c.email),
    { concorrencia: 3 }
  );

  // 9. Sem match: incrementa tentativas, marca motivo
  if (!encontrado) {
    const novasT = lead.tentativas_recovery + 1;
    await aplicarFalhaNoLead(lead.id, novasT, 'no_match');

    const limiteAtingido = novasT >= 3;
    await registrarHistorico(
      lead.id,
      limiteAtingido ? 'recovery_limite_atingido' : 'recovery_falhou_no_match',
      `Recovery (${modo}) — testou ${todos.length}/${candidatos.length} padrões, ${creditos_totais} créditos. ${limiteAtingido ? 'LIMITE 3 ATINGIDO.' : ''}`,
      criado_por
    );

    return res.status(200).json({
      success: false,
      status: limiteAtingido ? 'limit_reached' : 'no_match',
      modo,
      candidatos_testados: todos.length,
      candidatos_totais: candidatos.length,
      creditos_consumidos: creditos_totais,
      tentativas_consumidas: novasT,
    });
  }

  // 10. SUCESSO — UPDATE lead + aprender padrão + re-enfileirar
  const candidatoVencedor = candidatos.find(c => c.email === encontrado.email)!;
  const novasT = lead.tentativas_recovery + 1;

  const updResult = await aplicarSucessoNoLead(lead.id, encontrado.email, novasT, criado_por);
  if (updResult.error) {
    return res.status(500).json({
      success: false,
      error: `Recovery encontrou "${encontrado.email}" mas falhou ao atualizar lead: ${updResult.error}`,
    });
  }

  await aprenderPadrao(dominioCompleto, candidatoVencedor.template, candidatoVencedor.extensao);

  const enfileiramento = await reEnfileirarEmCampanhasAtivas(
    lead.id,
    encontrado.email,
    lead.nome
  );

  await registrarHistorico(
    lead.id,
    'recovery_sucesso',
    `Recovery (${modo}) — e-mail recuperado: ${lead.email} → ${encontrado.email}. Padrão "${candidatoVencedor.template}${candidatoVencedor.extensao}". ${creditos_totais} créditos. ${enfileiramento.campanhas_re_enfileiradas} campanha(s) reativada(s), ${enfileiramento.envios_agendados} envio(s) agendado(s).`,
    criado_por
  );

  return res.status(200).json({
    success: true,
    status: 'recovered',
    modo,
    email_anterior: lead.email,
    email_recuperado: encontrado.email,
    template_detectado: candidatoVencedor.template,
    extensao: candidatoVencedor.extensao,
    candidatos_testados: todos.length,
    creditos_consumidos: creditos_totais,
    tentativas_consumidas: novasT,
    campanhas_re_enfileiradas: enfileiramento.campanhas_re_enfileiradas,
    envios_agendados: enfileiramento.envios_agendados,
    erros_enfileiramento: enfileiramento.erros,
  });
}

// ============================================================================
// ACTION: manual_revalidate — D10 (Validar e Reativar após edição manual)
// ============================================================================

async function handleManualRevalidate(req: VercelRequest, res: VercelResponse) {
  const { lead_id, novo_email, criado_por, validar_snovio } = req.body || {};
  if (!lead_id) return res.status(400).json({ success: false, error: 'lead_id obrigatório' });
  if (!novo_email) return res.status(400).json({ success: false, error: 'novo_email obrigatório' });
  if (!criado_por) return res.status(400).json({ success: false, error: 'criado_por obrigatório' });

  const emailNovo = String(novo_email).toLowerCase().trim();

  // 1. Carregar lead
  const { data: lead, error: errLead } = await supabase
    .from('email_leads')
    .select('id, nome, email, tentativas_recovery, motivo_invalidacao, bounced')
    .eq('id', lead_id)
    .maybeSingle();

  if (errLead) return res.status(500).json({ success: false, error: `DB: ${errLead.message}` });
  if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

  if (lead.tentativas_recovery >= 3) {
    return res.status(200).json({
      success: false,
      status: 'limit_reached',
      error: 'Lead atingiu 3 tentativas — definitivamente irrecuperável.',
    });
  }

  // 2. Validar formato
  if (!emailNovo.includes('@') || emailNovo.length > 254 || emailNovo.length < 5) {
    return res.status(400).json({ success: false, error: 'Formato de e-mail inválido.' });
  }

  // 3. Validar MX (obrigatório)
  const dominio = extrairDominio(emailNovo);
  if (!dominio) {
    return res
      .status(400)
      .json({ success: false, error: 'Não foi possível extrair domínio do e-mail.' });
  }

  const mxResult = await validarMX(dominio);
  if (!mxResult.valido) {
    // Edição manual com MX inválido: NÃO consome tentativa (não chegou a usar Snov.io)
    return res.status(200).json({
      success: false,
      status: 'invalid_mx',
      dominio,
      mx_erro: mxResult.erro,
      error: `Domínio ${dominio} sem MX records válidos (${mxResult.erro}). Lead não foi reativado.`,
    });
  }

  // 4. (Opcional) Validar via Snov.io
  let snovioResult: any = null;
  if (validar_snovio === true) {
    snovioResult = await verificarEmail(emailNovo);
    if (!snovioResult.valido) {
      // Snov.io rejeitou: consome 1 crédito mas NÃO consome tentativa de recovery
      // (decisão pragmática — manter contador focado em buscas auto/manual de padrão)
      return res.status(200).json({
        success: false,
        status: 'snovio_rejected',
        snovio_status: snovioResult.status,
        snovio_erro: snovioResult.erro,
        creditos_consumidos: snovioResult.creditos,
        error: `Snov.io rejeitou o e-mail (status: ${snovioResult.status}). Lead não foi reativado.`,
      });
    }
  }

  // 5. SUCESSO — atualizar lead + aprender padrão (se detectável) + re-enfileirar
  const novasT = lead.tentativas_recovery + 1;
  const updResult = await aplicarSucessoNoLead(lead.id, emailNovo, novasT, criado_por);
  if (updResult.error) {
    return res
      .status(500)
      .json({ success: false, error: `Falha ao atualizar lead: ${updResult.error}` });
  }

  // 5a. Aprender padrão se for detectável (nome composto pode quebrar a detecção)
  let templateDetectado: string | null = null;
  const splitted = splitNome(lead.nome);
  if (splitted) {
    const tpl = detectarTemplate(emailNovo, splitted.nome, splitted.sobrenome);
    if (tpl) {
      await aprenderPadrao(dominio, tpl.template, tpl.extensao);
      templateDetectado = `${tpl.template}${tpl.extensao}`;
    }
  }

  // 5b. Re-enfileirar
  const enfileiramento = await reEnfileirarEmCampanhasAtivas(
    lead.id,
    emailNovo,
    lead.nome
  );

  // 5c. Histórico
  await registrarHistorico(
    lead.id,
    'edicao_manual_validada',
    `Edição manual validada — ${lead.email} → ${emailNovo}. MX OK. ${validar_snovio ? `Snov.io: ${snovioResult?.status}` : 'Snov.io não usado'}. ${templateDetectado ? `Padrão aprendido: ${templateDetectado}.` : ''} ${enfileiramento.campanhas_re_enfileiradas} campanha(s) reativada(s).`,
    criado_por
  );

  return res.status(200).json({
    success: true,
    status: 'revalidated',
    email_anterior: lead.email,
    email_novo: emailNovo,
    mx_valido: true,
    snovio_validado: validar_snovio === true,
    snovio_status: snovioResult?.status || null,
    template_aprendido: templateDetectado,
    creditos_consumidos: snovioResult?.creditos || 0,
    tentativas_consumidas: novasT,
    campanhas_re_enfileiradas: enfileiramento.campanhas_re_enfileiradas,
    envios_agendados: enfileiramento.envios_agendados,
    erros_enfileiramento: enfileiramento.erros,
  });
}

// ============================================================================
// ACTION: lead_status — GET informações de Recovery (UI usa para botão)
// ============================================================================

async function handleLeadStatus(req: VercelRequest, res: VercelResponse) {
  const leadId = parseInt((req.query.lead_id as string) || '0', 10);
  if (!leadId) return res.status(400).json({ success: false, error: 'lead_id obrigatório' });

  const { data: lead, error } = await supabase
    .from('email_leads')
    .select(
      'id, email, nome, bounced, bounced_em, bounced_motivo, apto_campanha, tentativas_recovery, motivo_invalidacao, recovery_em'
    )
    .eq('id', leadId)
    .maybeSingle();

  if (error) return res.status(500).json({ success: false, error: `DB: ${error.message}` });
  if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

  const podeTentar =
    lead.tentativas_recovery < 3 && (lead.bounced || lead.motivo_invalidacao);
  const tentativasRestantes = Math.max(0, 3 - lead.tentativas_recovery);

  // Detectar modo sugerido (informativo para UI)
  let modoSugerido: 'auto' | 'manual' | null = null;
  if (podeTentar) {
    const dom = extrairDominio(lead.email);
    if (dom) {
      const { data: padrao } = await supabase
        .from('email_padroes_empresa')
        .select('confianca')
        .eq('dominio', baseDoDominio(dom))
        .gte('confianca', 3)
        .limit(1)
        .maybeSingle();
      modoSugerido = padrao ? 'auto' : 'manual';
    }
  }

  return res.status(200).json({
    success: true,
    lead,
    pode_tentar_recovery: podeTentar,
    tentativas_restantes: tentativasRestantes,
    modo_sugerido: modoSugerido,
  });
}
