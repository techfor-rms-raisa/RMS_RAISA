// ============================================================
// API DE UPLOAD DE ÁUDIO PARA SUPABASE
// Endpoint: /api/upload-audio
// ============================================================
// ESTRATÉGIA: Gera Signed URL para upload direto do frontend
// Isso evita passar o arquivo pelo servidor Vercel
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase com SERVICE_ROLE (bypassa RLS)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { action, filename, vagaId, candidaturaId, contentType } = req.body;

    // Ação: Gerar Signed URL para upload
    if (action === 'getSignedUrl') {
      const timestamp = Date.now();
      const ext = filename?.split('.').pop() || 'mp3';
      const storagePath = `entrevistas/${vagaId || 'geral'}/${candidaturaId || 'temp'}/${timestamp}.${ext}`;

      console.log(`🔑 Gerando signed URL para: ${storagePath}`);

      // Criar signed URL válida por 10 minutos
      const { data, error } = await supabaseAdmin.storage
        .from('entrevistas-audio')
        .createSignedUploadUrl(storagePath);

      if (error) {
        console.error('❌ Erro ao criar signed URL:', error);
        return res.status(500).json({
          success: false,
          error: `Erro ao gerar URL de upload: ${error.message}`
        });
      }

      // Gerar URL pública para depois
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('entrevistas-audio')
        .getPublicUrl(storagePath);

      console.log(`✅ Signed URL gerada para: ${storagePath}`);

      return res.status(200).json({
        success: true,
        signedUrl: data.signedUrl,
        token: data.token,
        path: storagePath,
        publicUrl: publicUrlData.publicUrl
      });
    }

    // Ação: Confirmar upload e retornar URL pública
    if (action === 'confirmUpload') {
      const { path } = req.body;
      
      if (!path) {
        return res.status(400).json({ success: false, error: 'path é obrigatório' });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('entrevistas-audio')
        .getPublicUrl(path);

      return res.status(200).json({
        success: true,
        publicUrl: publicUrlData.publicUrl
      });
    }

    return res.status(400).json({ 
      success: false, 
      error: 'Ação não especificada. Use action: getSignedUrl ou confirmUpload' 
    });

  } catch (error: any) {
    console.error('❌ [Upload API] Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido'
    });
  }
}

