/**
 * VERCEL CRON ENDPOINT: REPRIORIZAÇÃO DINÂMICA
 * Executado a cada 4 horas
 */

import { cronJobsService } from '../../src/services/cronJobsService';

export default async function handler(req: any, res: any) {
  // Verificar autenticação do cron
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || 'default-secret-change-me';
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid CRON_SECRET' 
    });
  }
  
  try {
    console.log('[API] Executando repriorização dinâmica via cron...');
    
    await cronJobsService.executarRepriorizacaoDinamica();
    
    return res.status(200).json({ 
      success: true,
      message: 'Repriorização dinâmica executada com sucesso',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[API] Erro no cron de repriorização:', error);
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
