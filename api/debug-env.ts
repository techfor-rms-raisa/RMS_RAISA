/**
 * api/debug-env.ts - Endpoint para verificar variáveis de ambiente
 * REMOVER APÓS DIAGNÓSTICO!
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Listar variáveis (sem mostrar valores completos por segurança)
  const envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_URL_preview: process.env.SUPABASE_URL?.substring(0, 30) + '...',
    
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    SUPABASE_SERVICE_ROLE_KEY_preview: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...',
    
    SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
    
    API_KEY: !!process.env.API_KEY,
    RESEND_WEBHOOK_SECRET: !!process.env.RESEND_WEBHOOK_SECRET,
    
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    
    // Listar todas as variáveis que começam com SUPABASE
    all_supabase_vars: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
  };

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: envCheck
  });
}
