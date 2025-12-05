/**
 * API ENDPOINT: RECOMENDAÇÃO DO ANALISTA
 * Gerencia análise de candidatos e recomendações de IA
 */

import { recomendarDecisaoCandidato, registrarEnvioCVAoCliente, registrarDivergenciaAnalista, registrarFeedbackCliente, buscarRecomendacaoIA, analisarAcuraciaRecomendacoes, buscarDivergencias } from '../src/services/recomendacaoAnalistaService';

export default async function handler(req: any, res: any) {
  const { method } = req;

  try {
    // POST /api/recomendacao-analista/analisar
    if (method === 'POST' && req.url?.includes('/analisar')) {
      const { candidaturaId, analistaId, parecerAnalista } = req.body;

      if (!candidaturaId || !analistaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'candidaturaId e analistaId são obrigatórios'
        });
      }

      const recomendacao = await recomendarDecisaoCandidato(
        candidaturaId
      );

      return res.status(200).json({
        success: true,
        data: recomendacao,
        message: 'Análise concluída com sucesso'
      });
    }

    // POST /api/recomendacao-analista/feedback
    if (method === 'POST' && req.url?.includes('/feedback')) {
      const { recomendacaoId, decisaoAnalista, justificativa } = req.body;

      if (!recomendacaoId || !decisaoAnalista) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'recomendacaoId e decisaoAnalista são obrigatórios'
        });
      }

      const resultado = await registrarDivergenciaAnalista(
        recomendacaoId,
        justificativa || ''
      );

      return res.status(200).json({
        success: true,
        data: resultado,
        message: 'Feedback registrado com sucesso'
      });
    }

    // POST /api/recomendacao-analista/enviar-cv
    // Detecta automaticamente se analista seguiu recomendação
    if (method === 'POST' && req.url?.includes('/enviar-cv')) {
      const { candidaturaId, analistaId } = req.body;

      if (!candidaturaId || !analistaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'candidaturaId e analistaId são obrigatórios'
        });
      }

      // Detectar divergência automaticamente
      // TODO: Implementar detectarDivergenciaAutomatica
      // const resultado = await detectarDivergenciaAutomatica(candidaturaId, analistaId);
      const resultado = { divergencia: false }; // Placeholder

      return res.status(200).json({
        success: true,
        data: resultado,
        message: resultado.divergencia 
          ? 'CV enviado - Divergência detectada (IA recomendou rejeitar)'
          : 'CV enviado - Alinhado com recomendação da IA'
      });
    }

    // GET /api/recomendacao-analista/:candidaturaId
    if (method === 'GET') {
      const candidaturaId = req.query.candidaturaId || req.url?.split('/').pop();

      if (!candidaturaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'candidaturaId é obrigatório'
        });
      }

      const recomendacao = await buscarRecomendacaoIA(candidaturaId);

      if (!recomendacao) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Recomendação não encontrada'
        });
      }

      return res.status(200).json({
        success: true,
        data: recomendacao
      });
    }

    // Método não permitido
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Método ${method} não suportado`
    });

  } catch (error: any) {
    console.error('[API] Erro em recomendacao-analista:', error);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Erro ao processar requisição',
      timestamp: new Date().toISOString()
    });
  }
}
