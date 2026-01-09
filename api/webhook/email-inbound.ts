/**
 * email-inbound.ts - Webhook para processar emails recebidos via Resend
 * 
 * FLUXO:
 * 1. Resend recebe email em raisa@techfortirms.online
 * 2. Resend dispara webhook para esta API
 * 3. API valida signature, processa com Gemini, atualiza banco
 * 
 * Data: 06/01/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Supabase com Service Role (backend seguro)
// Função para criar cliente Supabase (lazy initialization)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables. URL: " + !!supabaseUrl + ", Key: " + !!supabaseKey);
  }
  return createClient(supabaseUrl, supabaseKey);
}

// Configuração
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';
const GEMINI_API_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}/api/gemini-analyze`
  : 'http://localhost:3000/api/gemini-analyze';
const CONFIANCA_MINIMA = 70; // Abaixo disso vai para manual

// ============================================
// TIPOS
// ============================================

interface ResendInboundPayload {
  type: 'email.received';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      content_type: string;
      size: number;
    }>;
    headers?: Record<string, string>;
  };
}

interface ClassificacaoEmail {
  sucesso: boolean;
  tipo_email: 'envio_cv' | 'resposta_cliente' | 'outro';
  candidato_nome?: string;
  candidato_nome_alternativas?: string[];
  vaga_titulo?: string;
  vaga_titulo_alternativas?: string[];
  cliente_nome?: string;
  cliente_nome_alternativas?: string[];
  destinatario_email?: string;
  confianca: number;
  erro?: string;
}

interface ClassificacaoResposta {
  sucesso: boolean;
  tipo_resposta: 'visualizado' | 'em_analise' | 'agendamento' | 'aprovado' | 'reprovado' | 'duvida' | 'outro';
  feedback_cliente?: string;
  agendamento?: {
    data_sugerida?: string;
    hora_sugerida?: string;
    formato?: string;
  };
  reprovacao?: {
    motivo?: string;
    categoria?: string;
  };
  confianca: number;
  erro?: string;
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const supabaseAdmin = getSupabaseAdmin();
  
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Log de entrada
  console.log('📧 [Webhook] Email recebido');

  let logId: number | null = null;
  let emailMessageId: string = '';

  try {
    // ============================================
    // 1. VALIDAR SIGNATURE DO RESEND
    // ============================================
    
    const svixId = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn('⚠️ [Webhook] Headers de assinatura ausentes');
      // Em desenvolvimento, permitir sem signature
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Missing signature headers' });
      }
    } else if (RESEND_WEBHOOK_SECRET) {
      const isValid = verifySignature(
        JSON.stringify(req.body),
        svixId,
        svixTimestamp,
        svixSignature,
        RESEND_WEBHOOK_SECRET
      );

      if (!isValid) {
        console.error('❌ [Webhook] Signature inválida');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      console.log('✅ [Webhook] Signature válida');
    }

    // ============================================
    // 2. PARSEAR PAYLOAD
    // ============================================
    
    const payload = req.body as ResendInboundPayload;
    
    if (payload.type !== 'email.received') {
      console.log(`ℹ️ [Webhook] Ignorando evento: ${payload.type}`);
      return res.status(200).json({ status: 'ignored', reason: 'not_email_received' });
    }

    const emailData = payload.data;
    emailMessageId = emailData.email_id;
    
    console.log(`📧 [Webhook] Processando email: ${emailMessageId}`);
    console.log(`   From: ${emailData.from}`);
    console.log(`   Subject: ${emailData.subject}`);

    // ============================================
    // 3. VERIFICAR DUPLICAÇÃO
    // ============================================
    
    const { data: existingLog } = await supabaseAdmin
      .from('email_processamento_log')
      .select('id')
      .eq('email_message_id', emailMessageId)
      .maybeSingle();

    if (existingLog) {
      console.log(`⚠️ [Webhook] Email já processado: ${emailMessageId}`);
      return res.status(200).json({ status: 'duplicate', email_id: emailMessageId });
    }

    // ============================================
    // 4. CRIAR LOG INICIAL
    // ============================================
    
    const { data: log, error: logError } = await supabaseAdmin
      .from('email_processamento_log')
      .insert({
        email_message_id: emailMessageId,
        email_from: emailData.from,
        email_to: emailData.to?.join(', '),
        email_cc: emailData.cc?.join(', '),
        email_subject: emailData.subject,
        email_body_preview: (emailData.text || emailData.html || '').substring(0, 500),
        email_received_at: payload.created_at,
        status_processamento: 'processando',
        ip_origem: (req.headers['x-forwarded-for'] as string) || 'unknown',
        webhook_headers: {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp
        }
      })
      .select('id')
      .single();

    if (logError) {
      console.error('❌ [Webhook] Erro ao criar log:', logError);
    } else {
      logId = log?.id;
    }

    // ============================================
    // 5. CLASSIFICAR EMAIL COM GEMINI
    // ============================================
    
    const bodyText = emailData.text || stripHtml(emailData.html || '');
    
    const classificacaoResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'classificar_email_candidatura',
        payload: {
          from: emailData.from,
          to: emailData.to?.join(', '),
          cc: emailData.cc?.join(', '),
          subject: emailData.subject,
          body: bodyText
        }
      })
    });

    const classificacaoResult = await classificacaoResponse.json();
    const classificacao: ClassificacaoEmail = classificacaoResult.data;

    if (!classificacao.sucesso) {
      throw new Error(classificacao.erro || 'Erro na classificação');
    }

    console.log(`🤖 [Webhook] Classificação: ${classificacao.tipo_email} (${classificacao.confianca}%)`);

    // Atualizar log com classificação
    if (logId) {
      await supabaseAdmin
        .from('email_processamento_log')
        .update({
          tipo_email_detectado: classificacao.tipo_email,
          confianca_ia: classificacao.confianca,
          classificacao_ia: classificacao
        })
        .eq('id', logId);
    }

    // ============================================
    // 6. VERIFICAR CONFIANÇA
    // ============================================
    
    if (classificacao.confianca < CONFIANCA_MINIMA) {
      console.log(`⚠️ [Webhook] Confiança baixa (${classificacao.confianca}%), enviando para manual`);
      await enviarParaManual(
        emailData, 
        classificacao, 
        'baixa_confianca',
        logId
      );
      return res.status(200).json({ 
        status: 'pending_manual', 
        reason: 'low_confidence',
        confidence: classificacao.confianca 
      });
    }

    // ============================================
    // 7. BUSCAR CANDIDATURA NO BANCO
    // ============================================
    
    const candidatura = await buscarCandidatura(classificacao);

    if (!candidatura) {
      console.log(`⚠️ [Webhook] Candidatura não encontrada, enviando para manual`);
      await enviarParaManual(
        emailData, 
        classificacao, 
        'candidatura_nao_encontrada',
        logId
      );
      return res.status(200).json({ 
        status: 'pending_manual', 
        reason: 'candidatura_not_found' 
      });
    }

    console.log(`✅ [Webhook] Candidatura encontrada: ID ${candidatura.id}`);

    // Atualizar log
    if (logId) {
      await supabaseAdmin
        .from('email_processamento_log')
        .update({ candidatura_id_detectada: candidatura.id })
        .eq('id', logId);
    }

    // ============================================
    // 8. PROCESSAR CONFORME TIPO DE EMAIL
    // ============================================
    
    let resultado;

    if (classificacao.tipo_email === 'envio_cv') {
      resultado = await processarEnvioCV(
        emailData, 
        candidatura, 
        classificacao,
        logId
      );
    } else if (classificacao.tipo_email === 'resposta_cliente') {
      resultado = await processarRespostaCliente(
        emailData, 
        candidatura, 
        classificacao,
        logId
      );
    } else {
      console.log(`ℹ️ [Webhook] Tipo de email não processável: ${classificacao.tipo_email}`);
      await finalizarLog(logId, 'ignorado', 'tipo_nao_processavel');
      return res.status(200).json({ status: 'ignored', reason: 'tipo_nao_processavel' });
    }

    // ============================================
    // 9. FINALIZAR
    // ============================================
    
    const tempoTotal = Date.now() - startTime;
    
    await finalizarLog(logId, 'sucesso', resultado.acao, {
      candidatura_envio_id: resultado.envio_id,
      candidatura_aprovacao_id: resultado.aprovacao_id,
      tempo_processamento_ms: tempoTotal
    });

    console.log(`✅ [Webhook] Processamento concluído em ${tempoTotal}ms`);

    return res.status(200).json({ 
      status: 'success', 
      action: resultado.acao,
      candidatura_id: candidatura.id,
      tempo_ms: tempoTotal
    });

  } catch (error: any) {
    console.error('❌ [Webhook] Erro:', error);
    
    // Atualizar log com erro
    if (logId) {
      await supabaseAdmin
        .from('email_processamento_log')
        .update({
          status_processamento: 'erro',
          erro_mensagem: error.message,
          erro_stack: error.stack,
          tempo_processamento_ms: Date.now() - startTime
        })
        .eq('id', logId);
    }

    // Retornar 200 para o Resend não reenviar
    return res.status(200).json({ 
      status: 'error', 
      error: error.message,
      email_id: emailMessageId 
    });
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Verifica assinatura do webhook Resend
 */
function verifySignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): boolean {
  try {
    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
    const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
    const signature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');
    
    const expectedSignatures = svixSignature.split(' ').map(s => s.split(',')[1]);
    return expectedSignatures.some(expected => expected === signature);
  } catch (error) {
    console.error('Erro ao verificar signature:', error);
    return false;
  }
}

/**
 * Remove tags HTML
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca candidatura no banco usando dados da classificação
 * 🆕 v2.0: Inclui busca por nomes anonimizados (nome_anoni_parcial, nome_anoni_total)
 */
async function buscarCandidatura(classificacao: ClassificacaoEmail) {
  const supabaseAdmin = getSupabaseAdmin();
  
  // ============================================
  // 1. BUSCA PRINCIPAL POR NOME E VAGA
  // ============================================
  
  if (classificacao.candidato_nome && classificacao.vaga_titulo) {
    // Buscar por nome completo
    let candidaturas = await buscarPorNome(classificacao.candidato_nome);
    
    // Se não encontrou, tentar por nomes anonimizados
    if (candidaturas.length === 0) {
      console.log(`🔍 [Webhook] Buscando por nome anonimizado: ${classificacao.candidato_nome}`);
      candidaturas = await buscarPorNomeAnonimizado(classificacao.candidato_nome);
    }

    if (candidaturas.length > 0) {
      // Filtrar por vaga
      const vagaTitulo = classificacao.vaga_titulo.toLowerCase();
      const alternativas = classificacao.vaga_titulo_alternativas?.map(a => a.toLowerCase()) || [];
      
      const match = candidaturas.find((c: any) => {
        const titulo = c.vagas?.titulo?.toLowerCase() || '';
        return titulo.includes(vagaTitulo) || 
               vagaTitulo.includes(titulo) ||
               alternativas.some(alt => titulo.includes(alt));
      });

      if (match) return match;
    }
  }

  // ============================================
  // 2. BUSCA POR ALTERNATIVAS DE NOME
  // ============================================
  
  const alternativasNome = classificacao.candidato_nome_alternativas || [];
  for (const nome of alternativasNome) {
    // Tentar nome completo
    let candidaturas = await buscarPorNome(nome);
    
    // Se não encontrou, tentar anonimizado
    if (candidaturas.length === 0) {
      candidaturas = await buscarPorNomeAnonimizado(nome);
    }

    if (candidaturas.length === 1) {
      return candidaturas[0];
    }
  }

  return null;
}

/**
 * 🆕 Busca candidatura por nome completo
 * Busca em candidaturas.candidato_nome E também em pessoas.nome
 */
async function buscarPorNome(nome: string) {
  const supabaseAdmin = getSupabaseAdmin();
  
  // 1. Buscar diretamente em candidaturas.candidato_nome
  const { data: candidaturas } = await supabaseAdmin
    .from('candidaturas')
    .select(`
      id, 
      candidato_nome, 
      status,
      vaga_id,
      pessoa_id,
      vagas!inner(id, titulo, cliente_id, status_posicao, clients(razao_social_cliente))
    `)
    .ilike('candidato_nome', `%${nome}%`)
    .in('status', ['aprovado', 'enviado_cliente', 'aguardando_cliente', 'entrevista_cliente', 'triagem', 'entrevista'])
    .limit(10);

  if (candidaturas && candidaturas.length > 0) {
    return candidaturas;
  }

  // 2. Se não encontrou, buscar em pessoas.nome e retornar candidaturas vinculadas
  console.log(`🔍 [Webhook] Buscando por pessoas.nome: ${nome}`);
  
  const { data: pessoas } = await supabaseAdmin
    .from('pessoas')
    .select('id, nome')
    .ilike('nome', `%${nome}%`)
    .limit(10);

  if (!pessoas || pessoas.length === 0) {
    return [];
  }

  const pessoaIds = pessoas.map((p: any) => p.id);
  
  const { data: candidaturasPessoa } = await supabaseAdmin
    .from('candidaturas')
    .select(`
      id, 
      candidato_nome, 
      status,
      vaga_id,
      pessoa_id,
      vagas!inner(id, titulo, cliente_id, status_posicao, clients(razao_social_cliente))
    `)
    .in('pessoa_id', pessoaIds)
    .in('status', ['aprovado', 'enviado_cliente', 'aguardando_cliente', 'entrevista_cliente', 'triagem', 'entrevista'])
    .limit(10);

  return candidaturasPessoa || [];
}

/**
 * 🆕 Busca candidatura por nome anonimizado (parcial ou total)
 * Busca na tabela pessoas pelos campos: nome, nome_anoni_parcial, nome_anoni_total
 * Depois relaciona com candidaturas via pessoa_id
 */
async function buscarPorNomeAnonimizado(nomeOuAnoni: string) {
  const supabaseAdmin = getSupabaseAdmin();
  
  // Buscar pessoas por TODOS os campos de nome (incluindo anonimizados)
  const { data: pessoas } = await supabaseAdmin
    .from('pessoas')
    .select('id, nome, nome_anoni_parcial, nome_anoni_total')
    .or(`nome.ilike.%${nomeOuAnoni}%,nome_anoni_parcial.ilike.%${nomeOuAnoni}%,nome_anoni_total.ilike.%${nomeOuAnoni}%`)
    .limit(10);

  if (!pessoas || pessoas.length === 0) {
    return [];
  }

  console.log(`✅ [Webhook] Encontradas ${pessoas.length} pessoas com nome/nome_anoni similar`);
  
  // Log para debug
  pessoas.forEach((p: any) => {
    console.log(`   - ID ${p.id}: nome="${p.nome}", parcial="${p.nome_anoni_parcial}", total="${p.nome_anoni_total}"`);
  });

  // Buscar candidaturas dessas pessoas
  const pessoaIds = pessoas.map((p: any) => p.id);
  
  const { data: candidaturas } = await supabaseAdmin
    .from('candidaturas')
    .select(`
      id, 
      candidato_nome, 
      status,
      vaga_id,
      pessoa_id,
      vagas!inner(id, titulo, cliente_id, status_posicao, clients(razao_social_cliente))
    `)
    .in('pessoa_id', pessoaIds)
    .in('status', ['aprovado', 'enviado_cliente', 'aguardando_cliente', 'entrevista_cliente', 'triagem', 'entrevista'])
    .limit(10);

  return candidaturas || [];
}

/**
 * Processa email de envio de CV
 * 🆕 v2.0: Também atualiza status_posicao da vaga
 */
async function processarEnvioCV(
  emailData: any, 
  candidatura: any, 
  classificacao: ClassificacaoEmail,
  logId: number | null
) {
  const supabaseAdmin = getSupabaseAdmin();
  console.log('📤 [Webhook] Processando envio de CV...');

  // Criar registro de envio
  const { data: envio, error } = await supabaseAdmin
    .from('candidatura_envios')
    .insert({
      candidatura_id: candidatura.id,
      vaga_id: candidatura.vaga_id,
      cliente_id: candidatura.vagas?.cliente_id,
      enviado_em: new Date().toISOString(),
      meio_envio: 'email',
      destinatario_email: classificacao.destinatario_email,
      destinatario_nome: classificacao.cliente_nome,
      email_message_id: emailData.email_id,
      email_subject: emailData.subject,
      email_from: emailData.from,
      email_to: emailData.to?.join(', '),
      status: 'enviado',
      origem: 'webhook_resend'
    })
    .select('id')
    .single();

  if (error) {
    console.error('❌ [Webhook] Erro ao criar envio:', error);
    throw error;
  }

  // Atualizar status da candidatura
  await supabaseAdmin
    .from('candidaturas')
    .update({
      status: 'enviado_cliente',
      enviado_ao_cliente: true,
      data_envio_cliente: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    })
    .eq('id', candidatura.id);

  // 🆕 Atualizar status_posicao da VAGA
  if (candidatura.vaga_id) {
    await supabaseAdmin
      .from('vagas')
      .update({
        status_posicao: 'enviado_cliente',
        atualizado_em: new Date().toISOString()
      })
      .eq('id', candidatura.vaga_id);
    
    console.log(`✅ [Webhook] status_posicao da vaga ${candidatura.vaga_id} atualizado para: enviado_cliente`);
  }

  console.log(`✅ [Webhook] Envio registrado: ID ${envio?.id}`);

  return { acao: 'criou_envio', envio_id: envio?.id };
}

/**
 * Processa resposta do cliente
 * 🆕 v2.0: Também atualiza status_posicao da vaga
 */
async function processarRespostaCliente(
  emailData: any, 
  candidatura: any, 
  classificacao: ClassificacaoEmail,
  logId: number | null
) {
  const supabaseAdmin = getSupabaseAdmin();
  console.log('📬 [Webhook] Processando resposta do cliente...');

  // Classificar a resposta com mais detalhes
  const bodyText = emailData.text || stripHtml(emailData.html || '');
  
  const respostaResponse = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'classificar_resposta_cliente',
      payload: {
        from: emailData.from,
        to: emailData.to?.join(', '),
        cc: emailData.cc?.join(', '),
        subject: emailData.subject,
        body: bodyText,
        candidato_nome: classificacao.candidato_nome,
        vaga_titulo: classificacao.vaga_titulo,
        cliente_nome: classificacao.cliente_nome
      }
    })
  });

  const respostaResult = await respostaResponse.json();
  const resposta: ClassificacaoResposta = respostaResult.data;

  if (!resposta.sucesso) {
    throw new Error(resposta.erro || 'Erro ao classificar resposta');
  }

  console.log(`🤖 [Webhook] Tipo de resposta: ${resposta.tipo_resposta}`);

  // Buscar envio relacionado
  const { data: envioExistente } = await supabaseAdmin
    .from('candidatura_envios')
    .select('id')
    .eq('candidatura_id', candidatura.id)
    .order('enviado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Mapear tipo de resposta para status da candidatura
  const statusCandidaturaMap: Record<string, string> = {
    'visualizado': 'visualizado',
    'em_analise': 'em_analise',
    'agendamento': 'entrevista_cliente',
    'aprovado': 'aprovado_cliente',
    'reprovado': 'reprovado_cliente',
    'duvida': 'aguardando_cliente'
  };

  // 🆕 Mapear tipo de resposta para status_posicao da VAGA
  const statusPosicaoMap: Record<string, string> = {
    'visualizado': 'aguardando_cliente',
    'em_analise': 'aguardando_cliente',
    'agendamento': 'entrevista_cliente',
    'aprovado': 'aprovado_cliente',
    'reprovado': 'reprovado',
    'duvida': 'aguardando_cliente'
  };

  const novoStatus = statusCandidaturaMap[resposta.tipo_resposta] || 'aguardando_cliente';
  const novoStatusPosicao = statusPosicaoMap[resposta.tipo_resposta] || 'aguardando_cliente';

  // Atualizar status do envio (se existir)
  if (envioExistente) {
    await supabaseAdmin
      .from('candidatura_envios')
      .update({
        status: resposta.tipo_resposta === 'visualizado' ? 'visualizado' : 'em_analise',
        visualizado_em: new Date().toISOString()
      })
      .eq('id', envioExistente.id);
  }

  // Criar registro de aprovação/decisão
  let aprovacaoId = null;
  
  if (['aprovado', 'reprovado', 'agendamento'].includes(resposta.tipo_resposta)) {
    const { data: aprovacao, error } = await supabaseAdmin
      .from('candidatura_aprovacoes')
      .insert({
        candidatura_id: candidatura.id,
        candidatura_envio_id: envioExistente?.id,
        vaga_id: candidatura.vaga_id,
        cliente_id: candidatura.vagas?.cliente_id,
        decisao: resposta.tipo_resposta === 'agendamento' ? 'agendado' : resposta.tipo_resposta,
        decidido_em: new Date().toISOString(),
        data_agendamento: resposta.agendamento?.data_sugerida 
          ? `${resposta.agendamento.data_sugerida}T${resposta.agendamento.hora_sugerida || '00:00'}:00`
          : null,
        motivo_reprovacao: resposta.reprovacao?.motivo,
        categoria_reprovacao: resposta.reprovacao?.categoria,
        feedback_cliente: resposta.feedback_cliente,
        email_message_id: emailData.email_id,
        email_resposta_texto: bodyText.substring(0, 2000),
        origem: 'webhook_resend'
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ [Webhook] Erro ao criar aprovação:', error);
    } else {
      aprovacaoId = aprovacao?.id;
    }
  }

  // Atualizar status da candidatura
  await supabaseAdmin
    .from('candidaturas')
    .update({
      status: novoStatus,
      feedback_cliente: resposta.feedback_cliente,
      data_feedback_cliente: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    })
    .eq('id', candidatura.id);

  // 🆕 Atualizar status_posicao da VAGA
  if (candidatura.vaga_id) {
    await supabaseAdmin
      .from('vagas')
      .update({
        status_posicao: novoStatusPosicao,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', candidatura.vaga_id);
    
    console.log(`✅ [Webhook] status_posicao da vaga ${candidatura.vaga_id} atualizado para: ${novoStatusPosicao}`);
  }

  console.log(`✅ [Webhook] Status candidatura atualizado para: ${novoStatus}`);

  return { 
    acao: `atualizou_status_${resposta.tipo_resposta}`, 
    envio_id: envioExistente?.id,
    aprovacao_id: aprovacaoId
  };
}

/**
 * Envia email para classificação manual
 */
async function enviarParaManual(
  emailData: any,
  classificacao: ClassificacaoEmail,
  motivo: string,
  logId: number | null
) {
  const supabaseAdmin = getSupabaseAdmin();
  const bodyText = emailData.text || stripHtml(emailData.html || '');

  // Buscar candidaturas possíveis
  let candidaturasPossiveis: any[] = [];
  
  if (classificacao.candidato_nome) {
    const { data } = await supabaseAdmin
      .from('candidaturas')
      .select('id, candidato_nome, status, vagas(titulo)')
      .ilike('candidato_nome', `%${classificacao.candidato_nome}%`)
      .limit(5);
    
    candidaturasPossiveis = data || [];
  }

  // Criar registro pendente
  const { error } = await supabaseAdmin
    .from('email_pendente_classificacao')
    .insert({
      email_message_id: emailData.email_id,
      email_from: emailData.from,
      email_to: emailData.to?.join(', '),
      email_cc: emailData.cc?.join(', '),
      email_subject: emailData.subject,
      email_body: bodyText.substring(0, 10000),
      email_received_at: new Date().toISOString(),
      classificacao_ia_tentativa: classificacao,
      motivo_pendencia: motivo,
      confianca_ia: classificacao.confianca,
      candidaturas_possiveis: candidaturasPossiveis.map(c => ({
        id: c.id,
        nome: c.candidato_nome,
        vaga: c.vagas?.titulo
      })),
      status: 'pendente'
    });

  if (error) {
    console.error('❌ [Webhook] Erro ao criar pendência:', error);
  }

  // Atualizar log
  if (logId) {
    await supabaseAdmin
      .from('email_processamento_log')
      .update({
        status_processamento: 'pendente_manual',
        acao_executada: 'enviou_para_manual'
      })
      .eq('id', logId);
  }

  console.log(`📋 [Webhook] Email enviado para classificação manual: ${motivo}`);
}

/**
 * Finaliza log de processamento
 */
async function finalizarLog(
  logId: number | null, 
  status: string, 
  acao: string,
  extras?: Record<string, any>
) {
  if (!logId) return;

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from('email_processamento_log')
    .update({
      status_processamento: status,
      acao_executada: acao,
      ...extras
    })
    .eq('id', logId);
}
