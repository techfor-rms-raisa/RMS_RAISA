/**
 * VERCEL CRON ENDPOINT: ANÁLISE MENSAL
 * Executado no dia 1 de cada mês
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
    console.log('[API] Executando análise mensal via cron...');
    
    await cronJobsService.executarAnaliseMensal();
    
    return res.status(200).json({ 
      success: true,
      message: 'Análise mensal executada com sucesso',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[API] Erro no cron de análise mensal:', error);
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
