/**
 * api/cron/disparar-fila.ts — Motor de envio de e-mails (Fase 5B-cron)
 *
 * Caminho: api/cron/disparar-fila.ts
 * Versão: 1.0 (01/06/2026 — Fase 5B-cron)
 *
 * Roda a cada 15 minutos (vercel.json) e processa um lote de até 10
 * mensagens da `email_fila` (status='pendente' AND agendado_para <= NOW).
 * Insere um heartbeat em `cron_execucoes` em TODA execução — inclusive
 * em no-op — para o card de Acompanhamento responder "está vivo?".
 *
 * Premissas aprovadas (sessão 01/06/2026):
 *   1. Frequência: a cada 15 min — futura Fase 5D vai expor isso na UI
 *      (tick base do Vercel passa para 5 min + lógica de skip em tabela
 *      cron_config). Por enquanto, fixo no vercel.json.
 *   2. Lote: 10 mensagens / execução.
 *   3. Janela: respeitar campanha.horario_inicio/fim em fuso America/Sao_Paulo.
 *   4. Token: `Authorization: Bearer ${CRON_SECRET}` — Vercel Cron envia
 *      automaticamente quando a env var CRON_SECRET existe.
 *   5. Idempotência: lock atômico via UPDATE ... WHERE status='pendente'.
 *   6. Retry: erros 5xx/429 voltam para 'pendente' até 3 tentativas; erros
 *      4xx (exceto 429) viram 'erro' direto.
 *   7. Heartbeat sempre: até quando fila vazia ou tudo fora de janela.
 *
 * Dívida técnica registrada (TODO):
 *   • renderAssinatura é COPIADA de api/crm-campanhas.ts (v1.7).
 *     Quando consolidar, mover para api/_lib/render-assinatura.ts e
 *     importar em ambos. Mudança DRY que não cabe agora (Fase 5B).
 *   • Contadores agregados na email_campanhas (total_enviados, etc.) NÃO
 *     são atualizados aqui — o dashboard pode contar direto da email_fila.
 *     Se virar gargalo, criar UPDATE bulk no final da execução.
 *   • Não registra evento `email_enviado` em email_lead_historico — fica
 *     para a Fase 5C (webhooks), que faz isso para todo o ciclo.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = { maxDuration: 60 };

// ════════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════════

const TIPO_CRON = 'disparar_fila';
const LOTE_TAMANHO = 10;
const MAX_TENTATIVAS = 3;
const TIMEZONE_BR = 'America/Sao_Paulo';

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/** Hora atual em São Paulo no formato 'HH:MM' (zero-padded). */
function horaAtualSP(): string {
  // 'pt-BR' com locale + timeZone retorna no formato 24h com zero-padding
  return new Date().toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_BR,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Verifica se a hora atual (HH:MM) está dentro da janela [inicio, fim].
 * Comparação lexicográfica funciona porque o formato é HH:MM zero-padded.
 */
function dentroDaJanela(agora: string, inicio: string, fim: string): boolean {
  return agora >= inicio && agora <= fim;
}

/** Normaliza para HH:MM (descarta segundos se vierem da coluna TIME). */
function normalizarHora(h: string | null | undefined, fallback: string): string {
  if (!h) return fallback;
  return h.substring(0, 5);
}

/**
 * Classifica um erro retornado pelo Resend:
 *  - 'temporario' → vale retry (5xx, 429 rate limit)
 *  - 'definitivo' → não retentar (4xx exceto 429, validation_error)
 */
function classificarErroResend(err: any): 'temporario' | 'definitivo' {
  const code = err?.statusCode;
  const name = err?.name || '';
  if (code === 429) return 'temporario';
  if (typeof code === 'number' && code >= 500) return 'temporario';
  if (typeof code === 'number' && code >= 400 && code < 500) return 'definitivo';
  if (name === 'validation_error') return 'definitivo';
  // Sem código identificável: conservadoramente, temporário (vai retentar até max).
  return 'temporario';
}

/**
 * Renderiza a assinatura em HTML — padrão corporativo TechForTI.
 * ⚠️ DUPLICADO de api/crm-campanhas.ts (v1.7+). Quando consolidar, mover
 *   para api/_lib/render-assinatura.ts e importar nos dois lados.
 */
function renderAssinatura(a: any): string {
  const COR_NOME = '#A33022';
  const COR_LINK = '#1a73e8';
  const COR_TEXTO = '#333333';
  const COR_LGPD = '#666666';

  const telefones = [a.telefone_fixo, a.telefone_celular].filter(Boolean).join(' | ');
  const websitePrincipal = (a.websites || []).find(Boolean) || '';
  const politicaUrl = a.politica_privacidade_url || '';

  const linhaTel = telefones
    ? `<p style="margin:0;color:${COR_TEXTO}">Tel. ${telefones}</p>`
    : '';

  const linhaSite = websitePrincipal
    ? `<p style="margin:0"><a href="${websitePrincipal}" style="color:${COR_LINK};text-decoration:underline">${websitePrincipal}</a></p>`
    : '';

  const linkPolitica = politicaUrl
    ? `<a href="${politicaUrl}" style="color:${COR_LINK};text-decoration:underline">Política de Privacidade</a>`
    : 'Política de Privacidade';

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:${COR_TEXTO};line-height:1.5">
  <p style="margin:0;color:${COR_NOME};font-weight:bold;font-size:14px">${a.nome_completo}</p>
  ${a.cargo ? `<p style="margin:0;font-style:italic;color:#555">${a.cargo}</p>` : ''}
  <p style="margin:0"><a href="mailto:${a.email_assinatura}" style="color:${COR_LINK};text-decoration:underline">${a.email_assinatura}</a></p>
  ${linhaTel}
  ${linhaSite}
  <div style="margin-top:14px;font-size:11px;color:${COR_LGPD};line-height:1.5">
    <p style="margin:0">Estamos entrando em contato contigo para lhe apresentar uma oportunidade, que entendemos ser do seu interesse, nos termos da Lei Geral de Proteção de Dados (LGPD).</p>
    <p style="margin:0">Isso quer dizer que coletamos, tratamos e armazenamos dados pessoais com todo o cuidado e zelo. Leia atentamente a nossa ${linkPolitica} e, se tiver alguma dúvida, entre em contato com o nosso Encarregado de Dados (Data Protection Officer - DPO) no seguinte e-mail: <a href="mailto:dpo@techforti.com.br" style="color:${COR_LINK};text-decoration:underline">dpo@techforti.com.br</a>.</p>
    <p style="margin:0">Se não tiver mais interesse em receber nossas mensagens, que foi baseado no legítimo interesse da LGPD, responda este e-mail solicitando o descadastramento (opt out) SAIR.</p>
  </div>
</div>`.trim();
}

// ════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const inicioExecucao = Date.now();

  // ── 1) AUTENTICAÇÃO — Bearer token ───────────────────────────────
  // Vercel Cron envia `Authorization: Bearer ${CRON_SECRET}` automaticamente
  // quando a env CRON_SECRET está definida. Sem isso, qualquer um pode
  // disparar o cron via curl.
  const tokenEsperado = process.env.CRON_SECRET;
  if (!tokenEsperado) {
    return res.status(500).json({
      success: false,
      error: 'CRON_SECRET não configurada no ambiente Vercel.',
    });
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${tokenEsperado}`) {
    return res.status(401).json({ success: false, error: 'Não autorizado' });
  }

  // ── 2) CLIENTS ───────────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    // Heartbeat de falha mesmo sem Resend para auditoria
    await supabase.from('cron_execucoes').insert({
      tipo: TIPO_CRON,
      status: 'falha',
      duracao_ms: Date.now() - inicioExecucao,
      mensagem: 'RESEND_API_KEY ausente — execução abortada',
    });
    return res.status(500).json({
      success: false,
      error: 'RESEND_API_KEY não configurada no ambiente Vercel.',
    });
  }
  const resend = new Resend(resendApiKey);

  // Estado da execução
  let enviadosCount = 0;
  let errosCount = 0;
  let skipJanelaCount = 0;
  let skipPausadaCount = 0;
  const detalhes: any = {
    lote_solicitado: LOTE_TAMANHO,
    iniciado_em: new Date().toISOString(),
    hora_sp: horaAtualSP(),
    itens: [] as any[],
  };

  try {
    // ── 3) SELECIONAR LOTE — passo 1: pegar IDs ─────────────────────
    const agora = new Date();
    const { data: candidatos, error: errSelect } = await supabase
      .from('email_fila')
      .select('id')
      .eq('status', 'pendente')
      .lte('agendado_para', agora.toISOString())
      .order('agendado_para', { ascending: true })
      .limit(LOTE_TAMANHO);

    if (errSelect) {
      throw new Error(`Falha ao selecionar fila: ${errSelect.message}`);
    }

    if (!candidatos || candidatos.length === 0) {
      // Fila vazia — heartbeat e sair
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'sucesso',
        enviados: 0,
        erros: 0,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: 'Fila vazia (nada pendente para agora)',
        detalhes,
      });
      return res.status(200).json({
        success: true,
        processados: 0,
        mensagem: 'Fila vazia',
      });
    }

    const ids = candidatos.map((c: any) => c.id);

    // ── 3b) LOCK ATÔMICO — UPDATE com guarda de status ──────────────
    // Se outra execução simultânea já pegou esses IDs (race condition),
    // o `.eq('status', 'pendente')` evita dupla seleção.
    const { data: lote, error: errLock } = await supabase
      .from('email_fila')
      .update({ status: 'enviando' })
      .in('id', ids)
      .eq('status', 'pendente')
      .select(`
        id, campanha_id, step_id, lead_id,
        destinatario_email, destinatario_nome,
        dominio_usado, tentativas
      `);

    if (errLock) {
      throw new Error(`Falha ao bloquear lote: ${errLock.message}`);
    }
    if (!lote || lote.length === 0) {
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'sucesso',
        enviados: 0,
        erros: 0,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: 'Lote já processado por outra execução (race condition coberta)',
        detalhes,
      });
      return res.status(200).json({ success: true, processados: 0 });
    }

    detalhes.lote_bloqueado = lote.length;

    // ── 4) CARREGAR dados ricos (campanhas, steps, assinaturas) ─────
    const campanhaIds = Array.from(new Set(lote.map((l: any) => l.campanha_id)));
    const stepIds = Array.from(new Set(lote.map((l: any) => l.step_id)));

    const { data: campanhas } = await supabase
      .from('email_campanhas')
      .select('id, nome, email_remetente, nome_remetente, dominio_envio, horario_inicio, horario_fim, unidade, assinatura_id, status')
      .in('id', campanhaIds);
    const mapaCampanhas = new Map<number, any>();
    (campanhas || []).forEach((c: any) => mapaCampanhas.set(c.id, c));

    const { data: steps } = await supabase
      .from('email_campanha_steps')
      .select('id, assunto, corpo_html, corpo_texto')
      .in('id', stepIds);
    const mapaSteps = new Map<number, any>();
    (steps || []).forEach((s: any) => mapaSteps.set(s.id, s));

    const assinaturaIds = Array.from(new Set(
      (campanhas || [])
        .map((c: any) => c.assinatura_id)
        .filter((id: any): id is number => typeof id === 'number')
    ));
    const mapaAssinaturas = new Map<number, any>();
    if (assinaturaIds.length > 0) {
      const { data: assinaturas } = await supabase
        .from('email_assinaturas')
        .select('*')
        .in('id', assinaturaIds);
      (assinaturas || []).forEach((a: any) => mapaAssinaturas.set(a.id, a));
    }

    const horaSP = horaAtualSP();

    // ── 5) PROCESSAR cada linha do lote ─────────────────────────────
    for (const item of lote as any[]) {
      const campanha = mapaCampanhas.get(item.campanha_id);
      const step = mapaSteps.get(item.step_id);
      const assinatura = campanha?.assinatura_id
        ? mapaAssinaturas.get(campanha.assinatura_id)
        : null;

      // 5a) Validações estruturais — se step/campanha sumiu, marca erro
      if (!campanha || !step) {
        const motivo = !campanha ? 'Campanha não encontrada' : 'Step não encontrado';
        await supabase.from('email_fila')
          .update({ status: 'erro', erro_detalhes: motivo })
          .eq('id', item.id);
        errosCount++;
        detalhes.itens.push({ id: item.id, resultado: 'erro_estrutura', motivo });
        continue;
      }

      // 5b) Janela horária da campanha (fuso SP)
      const horaInicio = normalizarHora(campanha.horario_inicio, '08:00');
      const horaFim    = normalizarHora(campanha.horario_fim,    '18:00');
      if (!dentroDaJanela(horaSP, horaInicio, horaFim)) {
        // Volta para 'pendente' para o próximo ciclo dentro da janela
        await supabase.from('email_fila')
          .update({ status: 'pendente' })
          .eq('id', item.id);
        skipJanelaCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'skip_janela',
          janela: `${horaInicio}-${horaFim}`,
        });
        continue;
      }

      // 5c) Campanha ativa? (extra safety — se pausada/concluída, não envia)
      if (campanha.status !== 'ativa') {
        await supabase.from('email_fila')
          .update({ status: 'pendente' })
          .eq('id', item.id);
        skipPausadaCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'skip_campanha_nao_ativa',
          status_campanha: campanha.status,
        });
        continue;
      }

      // 5d) Renderizar e-mail
      const primeiroNome = (item.destinatario_nome || '').split(' ')[0] || 'time';
      const corpoMerged = (step.corpo_html || '')
        .replace(/\{\{name\}\}/gi, primeiroNome);
      const assinaturaHtml = assinatura ? renderAssinatura(assinatura) : '';
      const htmlFinal = `${corpoMerged}\n\n${assinaturaHtml}`;
      const textoFinal: string | undefined = step.corpo_texto
        ? step.corpo_texto.replace(/\{\{name\}\}/gi, primeiroNome)
        : undefined;

      const from = `${campanha.nome_remetente || 'TechFor TI'} <${campanha.email_remetente}>`;

      // 5e) Enviar via Resend
      try {
        const { data, error } = await resend.emails.send({
          from,
          to: [item.destinatario_email],
          subject: step.assunto || '(sem assunto)',
          html: htmlFinal,
          text: textoFinal,
          headers: {
            'X-Entity-Ref-ID': `rms-fila-${item.id}`,
          },
        });

        if (error) {
          const classe = classificarErroResend(error);
          const novasTentativas = (item.tentativas || 0) + 1;
          const erroMsg = ((error as any).message || JSON.stringify(error)).substring(0, 500);

          if (classe === 'definitivo' || novasTentativas >= MAX_TENTATIVAS) {
            await supabase.from('email_fila').update({
              status: 'erro',
              tentativas: novasTentativas,
              erro_detalhes: erroMsg,
            }).eq('id', item.id);
          } else {
            await supabase.from('email_fila').update({
              status: 'pendente',
              tentativas: novasTentativas,
              erro_detalhes: erroMsg,
            }).eq('id', item.id);
          }
          errosCount++;
          detalhes.itens.push({
            id: item.id,
            resultado: 'erro_resend',
            classe,
            tentativa: novasTentativas,
            msg: erroMsg.substring(0, 200),
          });
          continue;
        }

        // Sucesso
        await supabase.from('email_fila').update({
          status: 'enviado',
          enviado_em: new Date().toISOString(),
          resend_message_id: data?.id || null,
        }).eq('id', item.id);
        enviadosCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'enviado',
          resend_id: data?.id,
        });
      } catch (sendErr: any) {
        // Exceção inesperada (rede, timeout) — trata como temporário
        const novasTentativas = (item.tentativas || 0) + 1;
        const erroMsg = (sendErr?.message || String(sendErr)).substring(0, 500);
        if (novasTentativas >= MAX_TENTATIVAS) {
          await supabase.from('email_fila').update({
            status: 'erro',
            tentativas: novasTentativas,
            erro_detalhes: erroMsg,
          }).eq('id', item.id);
        } else {
          await supabase.from('email_fila').update({
            status: 'pendente',
            tentativas: novasTentativas,
            erro_detalhes: erroMsg,
          }).eq('id', item.id);
        }
        errosCount++;
        detalhes.itens.push({
          id: item.id,
          resultado: 'erro_inesperado',
          tentativa: novasTentativas,
          msg: erroMsg.substring(0, 200),
        });
      }
    }

    // ── 6) STATUS FINAL + HEARTBEAT ─────────────────────────────────
    detalhes.skip_janela = skipJanelaCount;
    detalhes.skip_pausada = skipPausadaCount;

    let statusFinal: 'sucesso' | 'parcial' | 'falha';
    if (errosCount === 0) {
      statusFinal = 'sucesso';
    } else if (enviadosCount > 0) {
      statusFinal = 'parcial';
    } else {
      statusFinal = 'falha';
    }

    const mensagemFinal =
      `${enviadosCount} enviados, ${errosCount} erros, ` +
      `${skipJanelaCount} fora de janela, ${skipPausadaCount} pausadas ` +
      `(lote ${lote.length})`;

    await supabase.from('cron_execucoes').insert({
      tipo: TIPO_CRON,
      status: statusFinal,
      enviados: enviadosCount,
      erros: errosCount,
      duracao_ms: Date.now() - inicioExecucao,
      mensagem: mensagemFinal,
      detalhes,
    });

    return res.status(200).json({
      success: true,
      processados: lote.length,
      enviados: enviadosCount,
      erros: errosCount,
      skip_janela: skipJanelaCount,
      skip_pausada: skipPausadaCount,
      duracao_ms: Date.now() - inicioExecucao,
    });

  } catch (err: any) {
    // Erro fatal não-tratado — heartbeat de falha + 500
    const errMsg = (err?.message || String(err)).substring(0, 500);
    try {
      await supabase.from('cron_execucoes').insert({
        tipo: TIPO_CRON,
        status: 'falha',
        enviados: enviadosCount,
        erros: errosCount,
        duracao_ms: Date.now() - inicioExecucao,
        mensagem: `Falha fatal: ${errMsg}`,
        detalhes: { ...detalhes, erro_fatal: errMsg },
      });
    } catch {
      // Se nem o heartbeat conseguiu, segue para o response — log da Vercel pega.
    }
    console.error('[cron/disparar-fila] Erro fatal:', err);
    return res.status(500).json({ success: false, error: errMsg });
  }
}
