/**
 * registrar-manual.ts - API para registrar envio manual de CV
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
      vaga_id,
      cliente_id,
      meio_envio,
      enviado_por,
      destinatario_email,
      destinatario_nome,
      observacao
    } = req.body;

    // Validações
    if (!candidatura_id) {
      return res.status(400).json({ 
        error: 'candidatura_id é obrigatório' 
      });
    }

    // Criar registro de envio
    const { data: envio, error: envioError } = await supabaseAdmin
      .from('candidatura_envios')
      .insert({
        candidatura_id,
        vaga_id,
        cliente_id,
        meio_envio: meio_envio || 'email',
        enviado_por,
        enviado_em: new Date().toISOString(),
        destinatario_email,
        destinatario_nome,
        observacao,
        status: 'enviado',
        origem: 'manual',
        ativo: true
      })
      .select()
      .single();

    if (envioError) {
      console.error('Erro ao criar envio:', envioError);
      return res.status(500).json({ error: envioError.message });
    }

    // Atualizar candidatura
    await supabaseAdmin
      .from('candidaturas')
      .update({ 
        status: 'enviado_cliente',
        enviado_ao_cliente: true,
        data_envio_cliente: new Date().toISOString()
      })
      .eq('id', candidatura_id);

    return res.status(200).json({
      success: true,
      envio,
      message: 'Envio registrado com sucesso'
    });

  } catch (error: any) {
    console.error('Erro na API registrar-manual:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor'
    });
  }
}
