/**
 * email-inbound.ts - Webhook para processar emails recebidos via Resend
 * 
 * 🆕 v58.4 (08/06/2026): Migração Gemini — 'gemini-2.0-flash-exp' (descontinuado, dava 404)
 *                       → 'gemini-2.5-flash' (estável, ativo)
 *                       Re-aplicação da entrega da sessão 05/06/2026 cujo commit foi perdido.
 * 
 * 🆕 v58.3: Removido status 'em_selecao' do statusVagaMap
 *        - 'agendamento' agora mapeia para 'em_andamento' (não mais 'em_selecao')
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
import { GoogleGenAI } from '@google/genai';

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

// 🆕 Inicializar Gemini AI diretamente no webhook
const geminiApiKey = process.env.API_KEY || '';
let ai: GoogleGenAI | null = null;

function getGeminiAI(): GoogleGenAI {
  if (!geminiApiKey) {
    throw new Error('API_KEY (Gemini) não configurada no ambiente');
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
  }
  return ai;
}

// Configuração
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const CONFIANCA_MINIMA = 70; // Abaixo disso vai para manual

/**
 * 🆕 Buscar email completo via API do Resend
 * O webhook não envia o corpo, então precisamos buscar via API
 * IMPORTANTE: Para emails RECEBIDOS, usar /emails/receiving/{id}
 */
async function buscarEmailCompleto(emailId: string): Promise<{ text: string; html: string; subject: string } | null> {
  if (!RESEND_API_KEY) {
    console.warn('⚠️ [Webhook] RESEND_API_KEY não configurada, não é possível buscar email completo');
    return null;
  }

  try {
    console.log(`🔍 [Webhook] Buscando email completo via API: ${emailId}`);
    
    // IMPORTANTE: Para emails RECEBIDOS (inbound), usar /emails/receiving/{id}
    const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Webhook] Erro ao buscar email: ${response.status} ${response.statusText} - ${errorText}`);
      return null;
    }

    const emailData = await response.json();
    
    console.log(`✅ [Webhook] Email completo recebido:`, {
      subject: emailData.subject,
      text_length: emailData.text?.length || 0,
      html_length: emailData.html?.length || 0,
      text_preview: emailData.text?.substring(0, 100) || '[vazio]'
    });

    return {
      text: emailData.text || '',
      html: emailData.html || '',
      subject: emailData.subject || ''
    };
  } catch (error: any) {
    console.error(`❌ [Webhook] Erro ao buscar email completo:`, error.message);
    return null;
  }
}

/**
 * 🆕 Classificar email diretamente com Gemini (sem chamar outra função)
 */
async function classificarEmailComGemini(emailData: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
}): Promise<ClassificacaoEmail> {
  try {
    const gemini = getGeminiAI();
    
    const prompt = `Você é um assistente de RH especializado em analisar emails de processos seletivos.

ANALISE CUIDADOSAMENTE o seguinte email:

DE: ${emailData.from}
PARA: ${emailData.to}
CC: ${emailData.cc || 'N/A'}
ASSUNTO: ${emailData.subject}
CORPO: ${emailData.body.substring(0, 2000) || '[CORPO VAZIO - analise apenas pelo assunto]'}

=== CONTEXTO ===
Este é um sistema de recrutamento. Emails podem ser:
- Comunicação INTERNA da equipe informando decisões de clientes (ex: "Cliente aprovou candidato X")
- Respostas diretas de clientes
- Envios de CV para clientes

=== REGRAS DE CLASSIFICAÇÃO (ANALISE O CONTEÚDO!) ===

REGRA 1 - APROVAÇÃO (tipo: "resposta_cliente", decisao: "aprovado"):
Se o ASSUNTO ou CORPO contém: "aprovado", "aprovada", "aprovamos", "aprovação", "aceito", "aceita", "selecionado", "selecionada", "seguir com", "vamos seguir", "prosseguir", "ok para entrevista", "pode agendar", "cliente aprovou", "foi aprovado"

REGRA 2 - REPROVAÇÃO (tipo: "resposta_cliente", decisao: "reprovado"):
Se contém: "reprovado", "reprovada", "recusado", "recusada", "não aprovado", "não foi aprovado", "não seguiremos", "não vamos seguir", "não vamos prosseguir", "não selecionado", "declinou", "desistiu", "não atende", "perfil não adequado", "cliente recusou"

REGRA 3 - AGENDAMENTO (tipo: "resposta_cliente", decisao: "agendamento"):
Se contém: "agendar", "agendado", "agendamento", "entrevista", "entrevistar", "marcar entrevista", "data da entrevista", "disponibilidade para entrevista"

REGRA 4 - ENVIO DE CV (tipo: "envio_cv"):
Se contém: "segue cv", "segue currículo", "encaminho cv", "envio cv", "apresento candidato", "apresentando candidato", "segue perfil"
E NÃO contém palavras de aprovação/reprovação/agendamento

REGRA 5 - DÚVIDA (tipo: "resposta_cliente", decisao: "duvida"):
Se há perguntas ou pedidos de mais informações sobre o candidato

REGRA 6 - OUTRO:
Use apenas se não se encaixar em nenhum dos casos acima

=== IMPORTANTE ===
- PRIORIZE a análise do CONTEÚDO (subject + body) sobre o remetente
- Emails internos comunicando decisões de clientes devem ser tratados como "resposta_cliente"
- Extraia SEMPRE o nome do candidato e código da vaga

=== EXTRAÇÃO DE DADOS ===
- Nome COMPLETO do candidato (procure no assunto e no corpo)
- Código da vaga (ex: VTI-210, VGA-001)
- Decisão (aprovado/reprovado/agendamento/duvida)

Responda APENAS em JSON válido (sem markdown, sem backticks):
{
  "tipo_email": "envio_cv" | "resposta_cliente" | "outro",
  "candidato_nome": "Nome Completo do Candidato" | null,
  "vaga_titulo": "Código ou título da vaga" | null,
  "cliente_nome": "Nome do cliente" | null,
  "decisao": "aprovado" | "reprovado" | "agendamento" | "duvida" | null,
  "confianca": 0-100,
  "justificativa": "Breve explicação da classificação"
}`;

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const text = response.text || '';
    console.log('🤖 [Gemini Direct] Resposta bruta:', text.substring(0, 500));

    // Extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Resposta não contém JSON válido');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      sucesso: true,
      tipo_email: parsed.tipo_email || 'outro',
      candidato_nome: parsed.candidato_nome,
      candidato_nome_alternativas: parsed.candidato_nome ? [parsed.candidato_nome.split(' ')[0]] : [],
      vaga_titulo: parsed.vaga_titulo,
      vaga_titulo_alternativas: parsed.vaga_titulo ? [parsed.vaga_titulo] : [],
      cliente_nome: parsed.cliente_nome,
      cliente_nome_alternativas: [],
      destinatario_email: emailData.from,
      confianca: parsed.confianca || 70,
      decisao: parsed.decisao
    };
  } catch (error: any) {
    console.error('❌ [Gemini Direct] Erro:', error.message);
    throw error;
  }
}

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
  decisao?: 'aprovado' | 'reprovado' | 'agendamento' | 'duvida' | null;
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
    
    // 🆕 LOG COMPLETO para debug - ver o que o Resend está enviando
    console.log(`📧 [Webhook] PAYLOAD COMPLETO:`, JSON.stringify({
      subject: emailData.subject,
      text_length: emailData.text?.length || 0,
      html_length: emailData.html?.length || 0,
      text_preview: emailData.text?.substring(0, 200) || '[VAZIO]',
      html_preview: emailData.html?.substring(0, 200) || '[VAZIO]',
      attachments: emailData.attachments?.length || 0
    }));

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
    // 5. BUSCAR EMAIL COMPLETO VIA API (CORPO!)
    // ============================================
    
    // O webhook do Resend NÃO envia o corpo do email!
    // Precisamos buscar via API usando o email_id
    let bodyText = emailData.text || stripHtml(emailData.html || '');
    let subjectCompleto = emailData.subject;
    
    if (!bodyText || bodyText.length < 10) {
      console.log('📧 [Webhook] Corpo vazio no webhook, buscando via API...');
      
      const emailCompleto = await buscarEmailCompleto(emailMessageId);
      
      if (emailCompleto) {
        bodyText = emailCompleto.text || stripHtml(emailCompleto.html || '');
        subjectCompleto = emailCompleto.subject || emailData.subject;
        
        // Atualizar o log com o corpo real
        if (logId && bodyText) {
          await supabaseAdmin
            .from('email_processamento_log')
            .update({
              email_body_preview: bodyText.substring(0, 500),
              email_subject: subjectCompleto
            })
            .eq('id', logId);
        }
      }
    }

    // ============================================
    // 6. CLASSIFICAR EMAIL COM GEMINI (DIRETO)
    // ============================================
    
    console.log(`🤖 [Webhook] Classificando email diretamente com Gemini...`);
    console.log(`📧 [Webhook] Subject: ${subjectCompleto}`);
    console.log(`📧 [Webhook] Body length: ${bodyText.length} chars`);
    console.log(`📧 [Webhook] Body preview: ${bodyText.substring(0, 200)}...`);
    
    let classificacao: ClassificacaoEmail;
    
    try {
      // Chamada DIRETA à API Gemini
      classificacao = await classificarEmailComGemini({
        from: emailData.from,
        to: emailData.to?.join(', ') || '',
        cc: emailData.cc?.join(', '),
        subject: subjectCompleto,
        body: bodyText
      });

      if (!classificacao.sucesso) {
        throw new Error(classificacao.erro || 'Erro na classificação');
      }
    } catch (geminiError: any) {
      console.error('❌ [Webhook] Erro ao chamar Gemini:', geminiError.message);
      
      // Fallback - classificar pelo subject
      console.log('⚠️ [Webhook] Usando classificação de fallback pelo subject');
      classificacao = classificarPorSubject(subjectCompleto, emailData.from, bodyText);
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
 * 🆕 Classificação de fallback quando Gemini não está disponível
 * Analisa o subject e body para identificar tipo de email
 */
function classificarPorSubject(subject: string, from: string, body: string): ClassificacaoEmail {
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const combinedText = `${subjectLower} ${bodyLower}`;
  const fromLower = from.toLowerCase();
  
  // Detectar se remetente é da TechForti
  const isFromTechforti = fromLower.includes('techforti');
  
  // Extrair código da vaga do subject (ex: VTI-210)
  const vagaMatch = subject.match(/VTI-\d+|vti-\d+|VGA-\d+|vga-\d+/i);
  const vagaTitulo = vagaMatch ? vagaMatch[0].toUpperCase() : undefined;
  
  // Extrair nome do candidato do subject
  // Padrão: "VTI-210 | Product Owner | NOME DO CANDIDATO | Projeto"
  // ou: "VTI-210 I Product Owner I NOME DO CANDIDATO I Projeto" (com I maiúsculo)
  const parts = subject.split(/\|/i).length > 1 
    ? subject.split(/\|/i).map(p => p.trim())
    : subject.split(' I ').map(p => p.trim()); // Fallback para separador " I "
  
  let candidatoNome: string | undefined;
  if (parts.length >= 3) {
    // O nome geralmente está na posição 2 ou 3
    candidatoNome = parts[2];
  }
  
  // Detectar tipo de email
  let tipoEmail: 'envio_cv' | 'resposta_cliente' | 'outro' = 'outro';
  let decisao: 'aprovado' | 'reprovado' | 'agendamento' | 'duvida' | undefined;
  let confianca = 50;
  
  // Palavras-chave
  const palavrasAprovacao = ['aprovado', 'aprovada', 'aprovamos', 'aceito', 'aceita', 'aprovação', 'selecionado', 'selecionada', 'seguir com', 'vamos seguir'];
  const palavrasReprovacao = ['reprovado', 'reprovada', 'não aprovado', 'nao aprovado', 'recusado', 'recusada', 'não selecionado', 'não seguiremos', 'não vamos seguir'];
  const palavrasAgendamento = ['agendar', 'agendado', 'agendamento', 'entrevista', 'entrevistar'];
  const palavrasEnvio = ['segue cv', 'segue currículo', 'encaminho cv', 'envio cv', 'apresento candidato', 'apresentando candidato'];
  
  // Verificar se é resposta (prefixo RE:/RES:)
  const isResposta = /^(re:|res:|fwd?:|enc:)/i.test(subjectLower.trim());
  
  if (palavrasAprovacao.some(p => combinedText.includes(p))) {
    tipoEmail = 'resposta_cliente';
    decisao = 'aprovado';
    confianca = 85;
  } else if (palavrasReprovacao.some(p => combinedText.includes(p))) {
    tipoEmail = 'resposta_cliente';
    decisao = 'reprovado';
    confianca = 85;
  } else if (palavrasAgendamento.some(p => combinedText.includes(p))) {
    tipoEmail = 'resposta_cliente';
    decisao = 'agendamento';
    confianca = 80;
  } else if (palavrasEnvio.some(p => combinedText.includes(p))) {
    tipoEmail = 'envio_cv';
    confianca = 75;
  } else if (isResposta) {
    // É uma resposta mesmo sem palavras-chave específicas
    tipoEmail = 'resposta_cliente';
    decisao = 'duvida';
    confianca = 70;
  } else if (!isFromTechforti && vagaTitulo && candidatoNome) {
    // 🆕 Se remetente NÃO é da TechForti e menciona vaga/candidato → resposta
    tipoEmail = 'resposta_cliente';
    decisao = 'duvida';
    confianca = 65;
  } else if (vagaTitulo && candidatoNome) {
    // Se tem código de vaga e nome, mas é da TechForti → envio
    tipoEmail = 'envio_cv';
    confianca = 60;
  }
  
  console.log(`📧 [Fallback] Classificação: tipo=${tipoEmail}, decisao=${decisao}, candidato=${candidatoNome}, vaga=${vagaTitulo}, confiança=${confianca}, fromTechforti=${isFromTechforti}`);
  
  return {
    sucesso: true,
    tipo_email: tipoEmail,
    candidato_nome: candidatoNome,
    candidato_nome_alternativas: candidatoNome ? [candidatoNome.split(' ')[0]] : [],
    vaga_titulo: vagaTitulo,
    vaga_titulo_alternativas: vagaTitulo ? [vagaTitulo] : [],
    cliente_nome: undefined,
    cliente_nome_alternativas: [],
    destinatario_email: from,
    confianca,
    decisao
  };
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
      analista_id,
      vagas!inner(id, titulo, cliente_id, status_posicao, clients(razao_social_cliente))
    `)
    .ilike('candidato_nome', `%${nome}%`)
    .in('status', ['aprovado', 'enviado_cliente', 'aguardando_cliente', 'entrevista_cliente', 'triagem', 'entrevista', 'em_andamento', 'aprovado_cliente', 'reprovado_cliente'])
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
      analista_id,
      vagas!inner(id, titulo, cliente_id, status_posicao, clients(razao_social_cliente))
    `)
    .in('pessoa_id', pessoaIds)
    .in('status', ['aprovado', 'enviado_cliente', 'aguardando_cliente', 'entrevista_cliente', 'triagem', 'entrevista', 'em_andamento', 'aprovado_cliente', 'reprovado_cliente'])
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
      analista_id,
      vagas!inner(id, titulo, cliente_id, status_posicao, clients(razao_social_cliente))
    `)
    .in('pessoa_id', pessoaIds)
    .in('status', ['aprovado', 'enviado_cliente', 'aguardando_cliente', 'entrevista_cliente', 'triagem', 'entrevista', 'em_andamento', 'aprovado_cliente', 'reprovado_cliente'])
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
  console.log(`📤 [Webhook] Candidatura ID: ${candidatura.id}, Analista ID: ${candidatura.analista_id}`);

  // Criar registro de envio
  const { data: envio, error } = await supabaseAdmin
    .from('candidatura_envios')
    .insert({
      candidatura_id: candidatura.id,
      vaga_id: candidatura.vaga_id,
      cliente_id: candidatura.vagas?.cliente_id,
      analista_id: candidatura.analista_id,
      enviado_por: candidatura.analista_id, // 🆕 ADICIONADO - mesmo que analista_id
      enviado_em: new Date().toISOString(),
      meio_envio: 'email',
      destinatario_email: classificacao.destinatario_email || 'nao_informado@email.com',
      destinatario_nome: classificacao.cliente_nome || 'Cliente',
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

  // 🆕 CORRIGIDO: Atualizar status E status_posicao da VAGA
  if (candidatura.vaga_id) {
    await supabaseAdmin
      .from('vagas')
      .update({
        status: 'em_andamento',           // 🆕 Atualiza status geral (Pipeline usa este!)
        status_posicao: 'enviado_cliente',
        atualizado_em: new Date().toISOString()
      })
      .eq('id', candidatura.vaga_id);
    
    console.log(`✅ [Webhook] Vaga ${candidatura.vaga_id} atualizada - status: em_andamento, status_posicao: enviado_cliente`);
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

  // 🆕 Usar a decisão que já veio da classificação (não precisa chamar Gemini novamente)
  const tipoResposta = classificacao.decisao || 'duvida';
  console.log(`🤖 [Webhook] Decisão detectada: ${tipoResposta}`);

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

  // Mapear tipo de resposta para status_posicao da VAGA
  const statusPosicaoMap: Record<string, string> = {
    'visualizado': 'aguardando_cliente',
    'em_analise': 'aguardando_cliente',
    'agendamento': 'entrevista_cliente',
    'aprovado': 'contratado',           // 🆕 Candidato aprovado = contratado (vaga preenchida)
    'reprovado': 'reprovado',
    'duvida': 'aguardando_cliente'
  };

  // 🆕 v58.3: Mapear tipo de resposta para status da VAGA (Pipeline usa este!)
  // NOTA: Removido status 'em_selecao' - agora usa 'em_andamento'
  const statusVagaMap: Record<string, string | null> = {
    'visualizado': null,              // Não muda
    'em_analise': null,               // Não muda
    'agendamento': 'em_andamento',    // 🆕 v58.3: Entrevista = Em Andamento (removido em_selecao)
    'aprovado': 'finalizada',         // 🆕 Vaga finalizada com sucesso!
    'reprovado': null,                // Não muda - outros candidatos podem concorrer
    'duvida': null                    // Não muda
  };

  const novoStatus = statusCandidaturaMap[tipoResposta] || 'aguardando_cliente';
  const novoStatusPosicao = statusPosicaoMap[tipoResposta] || 'aguardando_cliente';
  const novoStatusVaga = statusVagaMap[tipoResposta] || null;

  console.log(`📝 [Webhook] Atualizando candidatura ${candidatura.id} para status: ${novoStatus}`);
  console.log(`📝 [Webhook] Atualizando vaga ${candidatura.vaga_id} para status_posicao: ${novoStatusPosicao}`);
  if (novoStatusVaga) {
    console.log(`📝 [Webhook] Atualizando vaga ${candidatura.vaga_id} para status: ${novoStatusVaga}`);
  }

  // Atualizar status do envio (se existir)
  if (envioExistente) {
    await supabaseAdmin
      .from('candidatura_envios')
      .update({
        status: tipoResposta === 'visualizado' ? 'visualizado' : 'respondido',
        visualizado_em: new Date().toISOString(),
        respondido_em: new Date().toISOString()
      })
      .eq('id', envioExistente.id);
  }

  // Criar registro de aprovação/decisão
  let aprovacaoId = null;
  
  if (['aprovado', 'reprovado', 'agendamento'].includes(tipoResposta)) {
    const bodyText = emailData.text || stripHtml(emailData.html || '');
    
    // Calcular prazo de resposta em dias (diferença entre envio e agora)
    let prazoRespostaDias = 0;
    if (envioExistente) {
      const { data: envioData } = await supabaseAdmin
        .from('candidatura_envios')
        .select('enviado_em')
        .eq('id', envioExistente.id)
        .single();
      
      if (envioData?.enviado_em) {
        const dataEnvio = new Date(envioData.enviado_em);
        const agora = new Date();
        prazoRespostaDias = Math.ceil((agora.getTime() - dataEnvio.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    
    const { data: aprovacao, error } = await supabaseAdmin
      .from('candidatura_aprovacoes')
      .insert({
        candidatura_id: candidatura.id,
        candidatura_envio_id: envioExistente?.id,
        vaga_id: candidatura.vaga_id,
        cliente_id: candidatura.vagas?.cliente_id,
        analista_id: candidatura.analista_id,
        decisao: tipoResposta === 'agendamento' ? 'agendado' : tipoResposta,
        decidido_em: new Date().toISOString(),
        prazo_resposta_dias: prazoRespostaDias, // 🆕 ADICIONADO
        feedback_cliente: bodyText.substring(0, 1000),
        email_message_id: emailData.email_id,
        email_resposta_texto: bodyText.substring(0, 2000),
        origem: 'webhook_resend'
      })
      .select('id')
      .single();

    if (!error && aprovacao) {
      aprovacaoId = aprovacao.id;
      console.log(`✅ [Webhook] Aprovação registrada: ID ${aprovacaoId}, prazo: ${prazoRespostaDias} dias`);
    } else if (error) {
      console.error('❌ [Webhook] Erro ao registrar aprovação:', error);
    }
  }

  // ATUALIZAR STATUS DA CANDIDATURA
  const { error: candError } = await supabaseAdmin
    .from('candidaturas')
    .update({
      status: novoStatus,
      feedback_cliente: (emailData.text || '').substring(0, 500),
      atualizado_em: new Date().toISOString()
    })
    .eq('id', candidatura.id);

  if (candError) {
    console.error('❌ [Webhook] Erro ao atualizar candidatura:', candError);
  } else {
    console.log(`✅ [Webhook] Candidatura ${candidatura.id} atualizada para: ${novoStatus}`);
  }

  // ATUALIZAR STATUS_POSICAO DA VAGA (e status quando aprovado)
  if (candidatura.vaga_id) {
    // Preparar dados de atualização
    const vagaUpdateData: Record<string, any> = {
      status_posicao: novoStatusPosicao,
      atualizado_em: new Date().toISOString()
    };
    
    // 🆕 Se aprovado, também finalizar a vaga
    if (novoStatusVaga) {
      vagaUpdateData.status = novoStatusVaga;
      console.log(`🎉 [Webhook] Vaga será FINALIZADA! Candidato aprovado.`);
    }
    
    const { error: vagaError } = await supabaseAdmin
      .from('vagas')
      .update(vagaUpdateData)
      .eq('id', candidatura.vaga_id);

    if (vagaError) {
      console.error('❌ [Webhook] Erro ao atualizar vaga:', vagaError);
    } else {
      console.log(`✅ [Webhook] Vaga ${candidatura.vaga_id} atualizada - status_posicao: ${novoStatusPosicao}${novoStatusVaga ? `, status: ${novoStatusVaga}` : ''}`);
    }
  }

  // Finalizar log
  await finalizarLog(logId, 'sucesso', 'resposta_cliente_processada');

  return {
    success: true,
    tipo_resposta: tipoResposta,
    candidatura_status: novoStatus,
    vaga_status_posicao: novoStatusPosicao,
    vaga_status: novoStatusVaga,
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
