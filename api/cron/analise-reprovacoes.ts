/**
 * VERCEL CRON ENDPOINT: ANÁLISE MENSAL DE REPROVAÇÕES
 * Executado no dia 1 de cada mês às 02:00 AM
 * 
 * Analisa padrões de reprovação para aprendizado da IA
 * Identifica tendências, red flags recorrentes e oportunidades de melhoria
 */

import { executarAnaliseMensal } from '../../src/services/aprendizadoReprovacaoService';

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
    console.log('[CRON] Iniciando análise mensal de reprovações...');
    
    // Executar análise mensal
    const resultado = await executarAnaliseMensal();
    
    console.log('[CRON] Análise mensal concluída:', {
      periodo: resultado.periodo,
      totalCandidaturas: resultado.total_candidaturas,
      totalReprovacoes: resultado.total_reprovacoes,
      taxaReprovacao: resultado.taxa_reprovacao
    });
    
    // Gerar relatório resumido
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      periodo: resultado.periodo,
      estatisticas: {
        totalCandidaturas: resultado.total_candidaturas,
        totalReprovacoes: resultado.total_reprovacoes,
        taxaReprovacao: resultado.taxa_reprovacao,
        taxaAcuracia: resultado.taxa_acuracia
      },
      padroes: {
        tecnicos: resultado.padroes_tecnicos || [],
        comportamentais: resultado.padroes_comportamentais || [],
        culturais: resultado.padroes_culturais || []
      },
      questoes: {
        eficazes: resultado.questoes_eficazes || [],
        ineficazes: resultado.questoes_ineficazes || []
      },
      recomendacoes: resultado.recomendacoes_melhoria || []
    };
    
    // Log detalhado para monitoramento
    console.log('[CRON] Relatório mensal:', JSON.stringify(relatorio, null, 2));
    
    return res.status(200).json({ 
      success: true,
      message: 'Análise mensal de reprovações executada com sucesso',
      data: relatorio,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[CRON] Erro na análise mensal de reprovações:', error);
    
    // Notificar equipe técnica em caso de erro crítico
    // TODO: Integrar com sistema de alertas (email, Slack, etc.)
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * CONFIGURAÇÃO NO VERCEL:
 * 
 * No arquivo vercel.json, adicione:
 * 
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/analise-reprovacoes",
 *       "schedule": "0 2 1 * *"
 *     }
 *   ]
 * }
 * 
 * Schedule: "0 2 1 * *" = Todo dia 1 do mês às 02:00 AM
 * 
 * VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
 * - CRON_SECRET: Token de autenticação para cron jobs
 * - DATABASE_URL: URL de conexão com Supabase
 * - API_KEY: Chave da API do Google Gemini
 */
