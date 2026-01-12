/**
 * registrar-manual.ts - API para registrar envio manual de CV
 * 
 * Data: 07/01/2026 - CORRIGIDO (lazy initialization)
 * Data: 12/01/2026 - CORRIGIDO: Agora atualiza status_posicao da VAGA para 'em_andamento'
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
      vaga_id,
      cliente_id,
      meio_envio,
      enviado_por,
      analista_id,
      destinatario_email,
      destinatario_nome,
      observacao
    } = req.body;

    // Validações
    if (!candidatura_id) {
      return res.status(400).json({ 
        success: false,
        error: 'candidatura_id é obrigatório' 
      });
    }

    // Buscar dados da candidatura se vaga_id não foi informado
    let vagaIdFinal = vaga_id;
    let clienteIdFinal = cliente_id;
    
    if (!vagaIdFinal || !clienteIdFinal) {
      const { data: candidatura } = await supabaseAdmin
        .from('candidaturas')
        .select('vaga_id, vagas(cliente_id)')
        .eq('id', candidatura_id)
        .single();
      
      if (candidatura) {
        vagaIdFinal = vagaIdFinal || candidatura.vaga_id;
        clienteIdFinal = clienteIdFinal || (candidatura.vagas as any)?.cliente_id;
      }
    }

    console.log(`📤 [registrar-manual] Registrando envio: candidatura=${candidatura_id}, vaga=${vagaIdFinal}`);

    // Criar registro de envio
    const { data: envio, error: envioError } = await supabaseAdmin
      .from('candidatura_envios')
      .insert({
        candidatura_id,
        vaga_id: vagaIdFinal,
        cliente_id: clienteIdFinal,
        analista_id: analista_id || enviado_por,
        meio_envio: meio_envio || 'email',
        enviado_por,
        enviado_em: new Date().toISOString(),
        destinatario_email,
        destinatario_nome,
        observacoes: observacao,
        status: 'enviado',
        origem: 'manual',
        ativo: true
      })
      .select()
      .single();

    if (envioError) {
      console.error('❌ [registrar-manual] Erro ao criar envio:', envioError);
      return res.status(500).json({ 
        success: false,
        error: envioError.message 
      });
    }

    // Atualizar status da CANDIDATURA
    const { error: candError } = await supabaseAdmin
      .from('candidaturas')
      .update({ 
        status: 'enviado_cliente',
        enviado_ao_cliente: true,
        data_envio_cliente: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      })
      .eq('id', candidatura_id);

    if (candError) {
      console.error('❌ [registrar-manual] Erro ao atualizar candidatura:', candError);
    } else {
      console.log(`✅ [registrar-manual] Candidatura ${candidatura_id} atualizada para: enviado_cliente`);
    }

    // 🆕 CORRIGIDO: Atualizar status_posicao E status da VAGA para 'em_andamento'
    if (vagaIdFinal) {
      const { error: vagaError } = await supabaseAdmin
        .from('vagas')
        .update({ 
          status: 'em_andamento',           // 🆕 Atualiza status geral (Pipeline usa este)
          status_posicao: 'em_andamento',   // Atualiza status_posicao também
          atualizado_em: new Date().toISOString()
        })
        .eq('id', vagaIdFinal);

      if (vagaError) {
        console.error('❌ [registrar-manual] Erro ao atualizar vaga:', vagaError);
      } else {
        console.log(`✅ [registrar-manual] Vaga ${vagaIdFinal} atualizada para status: em_andamento`);
      }
    }

    return res.status(200).json({
      success: true,
      data: envio,
      message: 'Envio registrado com sucesso'
    });

  } catch (error: any) {
    console.error('❌ [registrar-manual] Erro:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
}
