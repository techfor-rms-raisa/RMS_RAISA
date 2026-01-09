/**
 * pendentes.ts - API para listar emails pendentes de classificação
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    const { status } = req.query;

    let query = supabaseAdmin
      .from('email_pendente_classificacao')
      .select('*')
      .order('criado_em', { ascending: false });

    // Filtrar por status (default: pendente)
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    } else {
      query = query.eq('status', 'pendente');
    }

    const { data: pendentes, error } = await query;

    if (error) {
      console.error('Erro ao buscar pendentes:', error);
      return res.status(500).json({ error: error.message });
    }

    // Contar total de pendentes
    const { count } = await supabaseAdmin
      .from('email_pendente_classificacao')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente');

    return res.status(200).json({
      success: true,
      data: pendentes || [],
      total_pendentes: count || 0
    });

  } catch (error: any) {
    console.error('Erro na API pendentes:', error);
    return res.status(500).json({ 
      error: error.message || 'Erro interno do servidor'
    });
  }
}
