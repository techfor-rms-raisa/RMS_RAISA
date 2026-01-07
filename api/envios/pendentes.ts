/**
 * pendentes.ts - API para listar emails pendentes de classificação manual
 * 
 * Lista emails que a IA não conseguiu classificar automaticamente
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { status = 'pendente', limit = 50 } = req.query;

    console.log('📋 [API] Listando emails pendentes...', { status });

    // Buscar emails pendentes
    let query = supabaseAdmin
      .from('email_pendente_classificacao')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(parseInt(limit as string));

    if (status !== 'todos') {
      query = query.eq('status', status);
    }

    const { data: pendentes, error } = await query;

    if (error) throw error;

    // Contar por status
    const { data: contagem } = await supabaseAdmin
      .from('email_pendente_classificacao')
      .select('status')
      .eq('status', 'pendente');

    const totalPendentes = contagem?.length || 0;

    console.log(`✅ [API] ${pendentes?.length || 0} emails encontrados (${totalPendentes} pendentes)`);

    return res.status(200).json({
      success: true,
      data: pendentes || [],
      total_pendentes: totalPendentes
    });

  } catch (error: any) {
    console.error('❌ [API] Erro ao listar pendentes:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
