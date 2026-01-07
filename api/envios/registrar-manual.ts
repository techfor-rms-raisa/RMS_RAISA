/**
 * registrar-manual.ts - API para registrar envio manual de CV
 * 
 * Usado quando o analista envia CV fora do sistema e quer registrar
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
      vaga_id,
      cliente_id,
      analista_id,
      enviado_por,
      meio_envio = 'email',
      destinatario_email,
      destinatario_nome,
      cv_anexado_url,
      cv_versao = 'original',
      observacoes
    } = req.body;

    // Validação
    if (!candidatura_id || !vaga_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'candidatura_id e vaga_id são obrigatórios' 
      });
    }

    console.log('📤 [API] Registrando envio manual...', { candidatura_id, vaga_id });

    // Criar registro de envio
    const { data: envio, error: envioError } = await supabaseAdmin
      .from('candidatura_envios')
      .insert({
        candidatura_id,
        vaga_id,
        cliente_id,
        analista_id,
        enviado_por,
        enviado_em: new Date().toISOString(),
        meio_envio,
        destinatario_email,
        destinatario_nome,
        cv_anexado_url,
        cv_versao,
        observacoes,
        status: 'enviado',
        origem: 'manual',
        ativo: true
      })
      .select()
      .single();

    if (envioError) throw envioError;

    // Atualizar status da candidatura
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
      console.warn('⚠️ [API] Erro ao atualizar candidatura:', candError);
    }

    console.log(`✅ [API] Envio registrado: ID ${envio.id}`);

    return res.status(200).json({
      success: true,
      data: envio
    });

  } catch (error: any) {
    console.error('❌ [API] Erro ao registrar envio:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
