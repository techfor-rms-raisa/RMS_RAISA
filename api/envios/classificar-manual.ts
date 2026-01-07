/**
 * classificar-manual.ts - API para classificar manualmente email pendente
 * 
 * Data: 07/01/2026 - CORRIGIDO (lazy initialization)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Função para criar cliente Supabase (lazy initialization)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(`Missing Supabase environment variables. URL: ${!!supabaseUrl}, Key: ${!!supabaseKey}`);
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    const {
      email_pendente_id,
      tipo_email,
      candidatura_id,
      decisao,
      motivo_reprovacao,
      categoria_reprovacao,
      feedback_cliente,
      data_agendamento,
      observacao,
      classificado_por
    } = req.body;

    // Validações
    if (!email_pendente_id || !tipo_email) {
      return res.status(400).json({ 
        error: 'email_pendente_id e tipo_email são obrigatórios' 
      });
    }

    // Buscar email pendente
    const { data: emailPendente, error: pendError } = await supabaseAdmin
      .from('email_pendente_classificacao')
      .select('*')
      .eq('id', email_pendente_id)
      .single();

    if (pendError || !emailPendente) {
      return res.status(404).json({ error: 'Email pendente não encontrado' });
    }

    let resultado: any = { tipo_email };

    // Processar baseado no tipo
    if (tipo_email === 'envio_cv' && candidatura_id) {
      // Buscar dados da candidatura
      const { data: candidatura } = await supabaseAdmin
        .from('candidaturas')
        .select('*, vagas(id, titulo, cliente_id)')
        .eq('id', candidatura_id)
        .single();

      if (candidatura) {
        // Criar registro de envio
        const { data: envio, error: envioError } = await supabaseAdmin
          .from('candidatura_envios')
          .insert({
            candidatura_id,
            vaga_id: candidatura.vaga_id,
            cliente_id: candidatura.vagas?.cliente_id,
            email_message_id: emailPendente.email_message_id,
            email_subject: emailPendente.email_subject,
            email_from: emailPendente.email_from,
            email_to: emailPendente.email_to,
            meio_envio: 'email',
            enviado_em: emailPendente.email_received_at || new Date().toISOString(),
            status: 'enviado',
            origem: 'manual_classificacao',
            observacao,
            ativo: true
          })
          .select()
          .single();

        if (!envioError) {
          resultado.envio = envio;

          // Atualizar candidatura
          await supabaseAdmin
            .from('candidaturas')
            .update({ 
              status: 'enviado_cliente',
              enviado_ao_cliente: true,
              data_envio_cliente: new Date().toISOString()
            })
            .eq('id', candidatura_id);
        }
      }

    } else if (tipo_email === 'resposta_cliente' && candidatura_id && decisao) {
      // Buscar candidatura e envio
      const { data: candidatura } = await supabaseAdmin
        .from('candidaturas')
        .select('*, vagas(id, titulo, cliente_id)')
        .eq('id', candidatura_id)
        .single();

      if (candidatura) {
        // Criar aprovação
        const { data: aprovacao, error: aprovError } = await supabaseAdmin
          .from('candidatura_aprovacoes')
          .insert({
            candidatura_id,
            vaga_id: candidatura.vaga_id,
            cliente_id: candidatura.vagas?.cliente_id,
            decisao,
            decidido_em: new Date().toISOString(),
            decidido_por: classificado_por || 'Sistema',
            motivo_reprovacao,
            categoria_reprovacao,
            feedback_cliente,
            data_agendamento,
            email_message_id: emailPendente.email_message_id,
            email_resposta_texto: emailPendente.email_body,
            origem: 'manual_classificacao',
            ativo: true
          })
          .select()
          .single();

        if (!aprovError) {
          resultado.aprovacao = aprovacao;

          // Atualizar status da candidatura
          const statusMap: { [key: string]: string } = {
            'aprovado': 'aprovado_cliente',
            'reprovado': 'reprovado_cliente',
            'agendado': 'entrevista_cliente',
            'visualizado': 'enviado_cliente',
            'em_analise': 'enviado_cliente'
          };

          await supabaseAdmin
            .from('candidaturas')
            .update({ 
              status: statusMap[decisao] || 'enviado_cliente',
              feedback_cliente: feedback_cliente || null,
              data_feedback_cliente: new Date().toISOString()
            })
            .eq('id', candidatura_id);
        }
      }
    }

    // Atualizar email pendente
    await supabaseAdmin
      .from('email_pendente_classificacao')
      .update({
        status: tipo_email === 'ignorar' ? 'ignorado' : 'resolvido',
        tipo_email_manual: tipo_email,
        candidatura_id_manual: candidatura_id,
        decisao_manual: decisao,
        observacao_resolucao: observacao,
        resolvido_por: classificado_por,
        resolvido_em: new Date().toISOString()
      })
      .eq('id', email_pendente_id);

    // Atualizar log de processamento
    await supabaseAdmin
      .from('email_processamento_log')
      .update({
        status_processamento: 'classificado_manual',
        acao_executada: `classificacao_manual_${tipo_email}`
      })
      .eq('email_message_id', emailPendente.email_message_id);

    return res.status(200).json({
      success: true,
      resultado,
      message: 'Email classificado com sucesso'
    });

  } catch (error: any) {
    console.error('Erro na API classificar-manual:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor'
    });
  }
}
