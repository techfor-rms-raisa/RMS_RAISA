/**
 * aprovar.ts - API para registrar aprovação/reprovação de candidatura
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
      candidatura_id,
      candidatura_envio_id,
      vaga_id,
      cliente_id,
      decisao,
      decidido_por,
      motivo_reprovacao,
      categoria_reprovacao,
      feedback_cliente,
      data_agendamento,
      local_entrevista
    } = req.body;

    // Validações
    if (!candidatura_id || !decisao) {
      return res.status(400).json({ 
        error: 'candidatura_id e decisao são obrigatórios' 
      });
    }

    // Buscar envio para calcular tempo de resposta
    let dias_para_resposta = null;
    let respondido_no_prazo = null;

    if (candidatura_envio_id) {
      const { data: envio } = await supabaseAdmin
        .from('candidatura_envios')
        .select('enviado_em')
        .eq('id', candidatura_envio_id)
        .single();

      if (envio?.enviado_em) {
        const dataEnvio = new Date(envio.enviado_em);
        const agora = new Date();
        dias_para_resposta = Math.floor((agora.getTime() - dataEnvio.getTime()) / (1000 * 60 * 60 * 24));
        respondido_no_prazo = dias_para_resposta <= 5; // Prazo padrão de 5 dias
      }
    }

    // Criar aprovação
    const { data: aprovacao, error: aprovacaoError } = await supabaseAdmin
      .from('candidatura_aprovacoes')
      .insert({
        candidatura_id,
        candidatura_envio_id,
        vaga_id,
        cliente_id,
        decisao,
        decidido_em: new Date().toISOString(),
        decidido_por,
        motivo_reprovacao,
        categoria_reprovacao,
        feedback_cliente,
        data_agendamento,
        local_entrevista,
        dias_para_resposta,
        respondido_no_prazo,
        origem: 'manual',
        ativo: true
      })
      .select()
      .single();

    if (aprovacaoError) {
      console.error('Erro ao criar aprovação:', aprovacaoError);
      return res.status(500).json({ error: aprovacaoError.message });
    }

    // Atualizar status da candidatura
    const statusMap: { [key: string]: string } = {
      'aprovado': 'aprovado_cliente',
      'reprovado': 'reprovado_cliente',
      'agendado': 'entrevista_cliente',
      'em_analise': 'enviado_cliente',
      'aguardando_resposta': 'enviado_cliente'
    };

    const novoStatus = statusMap[decisao] || 'enviado_cliente';

    await supabaseAdmin
      .from('candidaturas')
      .update({ 
        status: novoStatus,
        feedback_cliente: feedback_cliente || null,
        data_feedback_cliente: new Date().toISOString()
      })
      .eq('id', candidatura_id);

    // Atualizar status do envio
    if (candidatura_envio_id) {
      await supabaseAdmin
        .from('candidatura_envios')
        .update({ status: decisao })
        .eq('id', candidatura_envio_id);
    }

    return res.status(200).json({
      success: true,
      aprovacao,
      message: `Decisão '${decisao}' registrada com sucesso`
    });

  } catch (error: any) {
    console.error('Erro na API aprovar:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor'
    });
  }
}
