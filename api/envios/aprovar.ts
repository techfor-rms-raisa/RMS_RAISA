/**
 * aprovar.ts - API para registrar aprovação/reprovação do cliente
 * 
 * Usado quando o analista recebe feedback do cliente
 * 
 * Data: 06/01/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
    const {
      candidatura_id,
      candidatura_envio_id,
      vaga_id,
      cliente_id,
      analista_id,
      decisao, // aprovado, reprovado, agendado, em_analise
      decidido_por,
      data_agendamento,
      local_entrevista,
      motivo_reprovacao,
      categoria_reprovacao,
      feedback_cliente,
      prazo_resposta_dias = 5
    } = req.body;

    // Validação
    if (!candidatura_id || !decisao) {
      return res.status(400).json({ 
        success: false, 
        error: 'candidatura_id e decisao são obrigatórios' 
      });
    }

    const decisoesValidas = ['aprovado', 'reprovado', 'agendado', 'em_analise', 'aguardando_resposta'];
    if (!decisoesValidas.includes(decisao)) {
      return res.status(400).json({ 
        success: false, 
        error: `Decisão inválida. Use: ${decisoesValidas.join(', ')}` 
      });
    }

    console.log('📋 [API] Registrando decisão...', { candidatura_id, decisao });

    // Buscar envio para calcular dias de resposta
    let diasParaResposta = 0;
    let respondidoNoPrazo = true;

    if (candidatura_envio_id) {
      const { data: envio } = await supabaseAdmin
        .from('candidatura_envios')
        .select('enviado_em')
        .eq('id', candidatura_envio_id)
        .single();

      if (envio) {
        diasParaResposta = Math.ceil(
          (new Date().getTime() - new Date(envio.enviado_em).getTime()) / (1000 * 60 * 60 * 24)
        );
        respondidoNoPrazo = diasParaResposta <= prazo_resposta_dias;
      }
    }

    // Criar registro de aprovação
    const { data: aprovacao, error: aprovError } = await supabaseAdmin
      .from('candidatura_aprovacoes')
      .insert({
        candidatura_id,
        candidatura_envio_id,
        vaga_id,
        cliente_id,
        analista_id,
        decisao,
        decidido_em: new Date().toISOString(),
        decidido_por,
        data_agendamento: data_agendamento || null,
        local_entrevista: local_entrevista || null,
        motivo_reprovacao: decisao === 'reprovado' ? motivo_reprovacao : null,
        categoria_reprovacao: decisao === 'reprovado' ? categoria_reprovacao : null,
        feedback_cliente,
        prazo_resposta_dias,
        respondido_no_prazo: respondidoNoPrazo,
        dias_para_resposta: diasParaResposta,
        origem: 'manual',
        ativo: true
      })
      .select()
      .single();

    if (aprovError) throw aprovError;

    // Mapear decisão para status da candidatura
    const statusMap: Record<string, string> = {
      'aprovado': 'aprovado_cliente',
      'reprovado': 'reprovado_cliente',
      'agendado': 'entrevista_cliente',
      'em_analise': 'aguardando_cliente',
      'aguardando_resposta': 'aguardando_cliente'
    };

    const novoStatus = statusMap[decisao] || 'aguardando_cliente';

    // Atualizar candidatura
    const { error: candError } = await supabaseAdmin
      .from('candidaturas')
      .update({
        status: novoStatus,
        feedback_cliente: feedback_cliente || null,
        data_feedback_cliente: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      })
      .eq('id', candidatura_id);

    if (candError) {
      console.warn('⚠️ [API] Erro ao atualizar candidatura:', candError);
    }

    // Atualizar envio (se existir)
    if (candidatura_envio_id) {
      await supabaseAdmin
        .from('candidatura_envios')
        .update({ status: 'em_analise' })
        .eq('id', candidatura_envio_id);
    }

    console.log(`✅ [API] Decisão registrada: ${decisao} (ID ${aprovacao.id})`);

    return res.status(200).json({
      success: true,
      data: aprovacao
    });

  } catch (error: any) {
    console.error('❌ [API] Erro ao registrar decisão:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
