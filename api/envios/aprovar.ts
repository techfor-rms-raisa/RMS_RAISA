/**
 * aprovar.ts - API para registrar aprovação/reprovação de candidatura
 * 
 * Data: 07/01/2026 - CORRIGIDO (lazy initialization)
 * Data: 12/01/2026 - CORRIGIDO: Agora atualiza status_posicao da VAGA conforme decisão
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
      analista_id,
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
        success: false,
        error: 'candidatura_id e decisao são obrigatórios' 
      });
    }

    // Buscar vaga_id e cliente_id se não foram informados
    let vagaIdFinal = vaga_id;
    let clienteIdFinal = cliente_id;
    let analistaIdFinal = analista_id;

    if (!vagaIdFinal || !clienteIdFinal) {
      const { data: candidatura } = await supabaseAdmin
        .from('candidaturas')
        .select('vaga_id, analista_id, vagas(cliente_id)')
        .eq('id', candidatura_id)
        .single();
      
      if (candidatura) {
        vagaIdFinal = vagaIdFinal || candidatura.vaga_id;
        analistaIdFinal = analistaIdFinal || candidatura.analista_id;
        clienteIdFinal = clienteIdFinal || (candidatura.vagas as any)?.cliente_id;
      }
    }

    console.log(`📋 [aprovar] Registrando decisão: candidatura=${candidatura_id}, decisao=${decisao}, vaga=${vagaIdFinal}`);

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
        vaga_id: vagaIdFinal,
        cliente_id: clienteIdFinal,
        analista_id: analistaIdFinal,
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
        prazo_resposta_dias: dias_para_resposta,
        origem: 'manual',
        ativo: true
      })
      .select()
      .single();

    if (aprovacaoError) {
      console.error('❌ [aprovar] Erro ao criar aprovação:', aprovacaoError);
      return res.status(500).json({ 
        success: false,
        error: aprovacaoError.message 
      });
    }

    // Mapear decisão para status da CANDIDATURA
    const statusCandidaturaMap: { [key: string]: string } = {
      'aprovado': 'aprovado_cliente',
      'reprovado': 'reprovado_cliente',
      'agendado': 'entrevista_cliente',
      'em_analise': 'enviado_cliente',
      'aguardando_resposta': 'enviado_cliente'
    };

    const novoStatusCandidatura = statusCandidaturaMap[decisao] || 'enviado_cliente';

    // 🆕 Mapear decisão para status_posicao da VAGA
    const statusVagaMap: { [key: string]: string } = {
      'aprovado': 'contratado',
      'reprovado': 'em_andamento',        // Reprovado mas pode ter outros candidatos
      'agendado': 'entrevista_cliente',
      'em_analise': 'aguardando_cliente',
      'aguardando_resposta': 'aguardando_cliente'
    };

    // 🆕 CORRIGIDO: Mapear decisão para status geral da VAGA (Pipeline usa este campo!)
    const statusGeralVagaMap: { [key: string]: string | null } = {
      'aprovado': 'finalizada',            // Vaga preenchida!
      'reprovado': null,                   // Não muda - outros podem concorrer
      'agendado': 'em_selecao',            // 🆕 CORRIGIDO: Entrevista = Em Seleção no Pipeline
      'em_analise': null,                  // Não muda
      'aguardando_resposta': null          // Não muda
    };

    const novoStatusPosicaoVaga = statusVagaMap[decisao] || 'aguardando_cliente';
    const novoStatusGeralVaga = statusGeralVagaMap[decisao] || null;

    // Atualizar status da CANDIDATURA
    const { error: candError } = await supabaseAdmin
      .from('candidaturas')
      .update({ 
        status: novoStatusCandidatura,
        feedback_cliente: feedback_cliente || null,
        data_feedback_cliente: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      })
      .eq('id', candidatura_id);

    if (candError) {
      console.error('❌ [aprovar] Erro ao atualizar candidatura:', candError);
    } else {
      console.log(`✅ [aprovar] Candidatura ${candidatura_id} atualizada para: ${novoStatusCandidatura}`);
    }

    // Atualizar status do ENVIO
    if (candidatura_envio_id) {
      await supabaseAdmin
        .from('candidatura_envios')
        .update({ 
          status: decisao === 'aprovado' || decisao === 'reprovado' ? 'respondido' : decisao,
          respondido_em: new Date().toISOString()
        })
        .eq('id', candidatura_envio_id);
    }

    // 🆕 CORRIGIDO: Atualizar status_posicao da VAGA
    if (vagaIdFinal) {
      const vagaUpdateData: Record<string, any> = {
        status_posicao: novoStatusPosicaoVaga,
        atualizado_em: new Date().toISOString()
      };

      // Se aprovado, também finalizar a vaga
      if (novoStatusGeralVaga) {
        vagaUpdateData.status = novoStatusGeralVaga;
        console.log(`🎉 [aprovar] Vaga será FINALIZADA! Candidato aprovado.`);
      }

      const { error: vagaError } = await supabaseAdmin
        .from('vagas')
        .update(vagaUpdateData)
        .eq('id', vagaIdFinal);

      if (vagaError) {
        console.error('❌ [aprovar] Erro ao atualizar vaga:', vagaError);
      } else {
        console.log(`✅ [aprovar] Vaga ${vagaIdFinal} atualizada - status_posicao: ${novoStatusPosicaoVaga}${novoStatusGeralVaga ? `, status: ${novoStatusGeralVaga}` : ''}`);
      }
    }

    return res.status(200).json({
      success: true,
      data: aprovacao,
      candidatura_status: novoStatusCandidatura,
      vaga_status_posicao: novoStatusPosicaoVaga,
      vaga_status: novoStatusGeralVaga,
      message: `Decisão '${decisao}' registrada com sucesso`
    });

  } catch (error: any) {
    console.error('❌ [aprovar] Erro:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
}
