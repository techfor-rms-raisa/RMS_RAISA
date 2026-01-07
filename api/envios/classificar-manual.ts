/**
 * classificar-manual.ts - API para classificar email manualmente
 * 
 * Usado quando a IA não conseguiu classificar e o analista faz manualmente
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
      pendente_id,
      tipo_email, // envio_cv, resposta_cliente, outro, ignorar
      candidatura_id,
      decisao, // visualizado, em_analise, agendamento, aprovado, reprovado (apenas para resposta)
      motivo_reprovacao,
      categoria_reprovacao,
      feedback_cliente,
      data_agendamento,
      observacao_resolucao,
      resolvido_por
    } = req.body;

    // Validação
    if (!pendente_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'pendente_id é obrigatório' 
      });
    }

    if (!tipo_email) {
      return res.status(400).json({ 
        success: false, 
        error: 'tipo_email é obrigatório' 
      });
    }

    console.log('📋 [API] Classificando email manualmente...', { pendente_id, tipo_email });

    // Buscar email pendente
    const { data: pendente, error: pendenteError } = await supabaseAdmin
      .from('email_pendente_classificacao')
      .select('*')
      .eq('id', pendente_id)
      .single();

    if (pendenteError || !pendente) {
      return res.status(404).json({ 
        success: false, 
        error: 'Email pendente não encontrado' 
      });
    }

    // Se for "ignorar", apenas atualizar status
    if (tipo_email === 'ignorar') {
      await supabaseAdmin
        .from('email_pendente_classificacao')
        .update({
          status: 'ignorado',
          tipo_email_manual: 'ignorar',
          observacao_resolucao,
          resolvido_por,
          resolvido_em: new Date().toISOString()
        })
        .eq('id', pendente_id);

      console.log(`✅ [API] Email ignorado: ${pendente_id}`);

      return res.status(200).json({
        success: true,
        action: 'ignored'
      });
    }

    // Validar candidatura para outros tipos
    if (tipo_email !== 'outro' && !candidatura_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'candidatura_id é obrigatório para este tipo de email' 
      });
    }

    // Buscar dados da candidatura
    let candidatura = null;
    if (candidatura_id) {
      const { data } = await supabaseAdmin
        .from('candidaturas')
        .select(`
          id, 
          candidato_nome,
          vaga_id,
          vagas(cliente_id)
        `)
        .eq('id', candidatura_id)
        .single();
      
      candidatura = data;
    }

    let resultado: any = { action: 'unknown' };

    // Processar conforme tipo
    if (tipo_email === 'envio_cv' && candidatura) {
      // Criar registro de envio
      const { data: envio } = await supabaseAdmin
        .from('candidatura_envios')
        .insert({
          candidatura_id: candidatura.id,
          vaga_id: candidatura.vaga_id,
          cliente_id: candidatura.vagas?.cliente_id,
          enviado_em: pendente.email_received_at || new Date().toISOString(),
          meio_envio: 'email',
          destinatario_email: pendente.email_to,
          email_message_id: pendente.email_message_id,
          email_subject: pendente.email_subject,
          email_from: pendente.email_from,
          email_to: pendente.email_to,
          status: 'enviado',
          origem: 'manual_classificacao',
          observacoes: `Classificado manualmente. ${observacao_resolucao || ''}`
        })
        .select('id')
        .single();

      // Atualizar candidatura
      await supabaseAdmin
        .from('candidaturas')
        .update({
          status: 'enviado_cliente',
          enviado_ao_cliente: true,
          data_envio_cliente: pendente.email_received_at || new Date().toISOString(),
          atualizado_em: new Date().toISOString()
        })
        .eq('id', candidatura.id);

      resultado = { action: 'criou_envio', envio_id: envio?.id };

    } else if (tipo_email === 'resposta_cliente' && candidatura && decisao) {
      // Buscar envio relacionado
      const { data: envioExistente } = await supabaseAdmin
        .from('candidatura_envios')
        .select('id, enviado_em')
        .eq('candidatura_id', candidatura.id)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Calcular dias para resposta
      let diasParaResposta = 0;
      if (envioExistente?.enviado_em) {
        diasParaResposta = Math.ceil(
          (new Date().getTime() - new Date(envioExistente.enviado_em).getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      // Mapear decisão para status
      const statusMap: Record<string, string> = {
        'visualizado': 'aguardando_cliente',
        'em_analise': 'aguardando_cliente',
        'agendamento': 'entrevista_cliente',
        'aprovado': 'aprovado_cliente',
        'reprovado': 'reprovado_cliente'
      };

      // Criar aprovação se for decisão final
      let aprovacaoId = null;
      if (['aprovado', 'reprovado', 'agendamento'].includes(decisao)) {
        const { data: aprovacao } = await supabaseAdmin
          .from('candidatura_aprovacoes')
          .insert({
            candidatura_id: candidatura.id,
            candidatura_envio_id: envioExistente?.id,
            vaga_id: candidatura.vaga_id,
            cliente_id: candidatura.vagas?.cliente_id,
            decisao: decisao === 'agendamento' ? 'agendado' : decisao,
            decidido_em: new Date().toISOString(),
            decidido_por: resolvido_por,
            data_agendamento: data_agendamento || null,
            motivo_reprovacao,
            categoria_reprovacao,
            feedback_cliente,
            email_message_id: pendente.email_message_id,
            dias_para_resposta: diasParaResposta,
            origem: 'manual_classificacao'
          })
          .select('id')
          .single();

        aprovacaoId = aprovacao?.id;
      }

      // Atualizar envio
      if (envioExistente) {
        await supabaseAdmin
          .from('candidatura_envios')
          .update({
            status: decisao === 'visualizado' ? 'visualizado' : 'em_analise',
            visualizado_em: new Date().toISOString()
          })
          .eq('id', envioExistente.id);
      }

      // Atualizar candidatura
      await supabaseAdmin
        .from('candidaturas')
        .update({
          status: statusMap[decisao] || 'aguardando_cliente',
          feedback_cliente,
          data_feedback_cliente: new Date().toISOString(),
          atualizado_em: new Date().toISOString()
        })
        .eq('id', candidatura.id);

      resultado = { 
        action: `atualizou_status_${decisao}`, 
        aprovacao_id: aprovacaoId 
      };
    }

    // Atualizar email pendente como resolvido
    await supabaseAdmin
      .from('email_pendente_classificacao')
      .update({
        status: 'resolvido',
        tipo_email_manual: tipo_email,
        candidatura_id_manual: candidatura_id,
        decisao_manual: decisao,
        observacao_resolucao,
        resolvido_por,
        resolvido_em: new Date().toISOString()
      })
      .eq('id', pendente_id);

    // Atualizar log original
    if (pendente.email_message_id) {
      await supabaseAdmin
        .from('email_processamento_log')
        .update({
          status_processamento: 'sucesso',
          acao_executada: `manual_${resultado.action}`,
          candidatura_id_detectada: candidatura_id
        })
        .eq('email_message_id', pendente.email_message_id);
    }

    console.log(`✅ [API] Email classificado: ${resultado.action}`);

    return res.status(200).json({
      success: true,
      ...resultado
    });

  } catch (error: any) {
    console.error('❌ [API] Erro ao classificar email:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
