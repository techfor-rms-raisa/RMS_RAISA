/**
 * API ENDPOINT: PREDIÇÃO DE RISCOS
 * Gerencia predição de risco de reprovação de candidatos
 */

import { preverRiscoCandidato, gerarAlertasProativos, sugerirPreparacaoCandidato, calcularTaxaSucessoPredicoes } from '../src/services/predicaoRiscosService';

export default async function handler(req: any, res: any) {
  const { method } = req;

  try {
    // POST /api/predicao-riscos/prever
    if (method === 'POST' && req.url?.includes('/prever')) {
      const { candidaturaId, analistaId } = req.body;

      if (!candidaturaId || !analistaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'candidaturaId e analistaId são obrigatórios'
        });
      }

      const predicao = await preverRiscoCandidato(
        candidaturaId
      );

      return res.status(200).json({
        success: true,
        data: predicao,
        message: 'Predição de risco calculada com sucesso'
      });
    }

    // POST /api/predicao-riscos/gerar-alertas
    // Gera alertas proativos para candidaturas em risco
    if (method === 'POST' && req.url?.includes('/gerar-alertas')) {
      const { vagaId } = req.body;

      const alertas = await gerarAlertasProativos();

      return res.status(200).json({
        success: true,
        data: alertas,
        count: alertas.length,
        message: `${alertas.length} alertas gerados`
      });
    }

    // GET /api/predicao-riscos/:candidaturaId
    // TODO: Implementar buscarPredicaoPorCandidatura
    /* if (method === 'GET' && req.query.candidaturaId) {
      const { candidaturaId } = req.query;

      if (!candidaturaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'candidaturaId é obrigatório'
        });
      }

      const predicao = await buscarPredicaoPorCandidatura(candidaturaId);

      if (!predicao) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Predição não encontrada'
        });
      }

      return res.status(200).json({
        success: true,
        data: predicao
      });
    } */

    // GET /api/predicao-riscos/dashboard/:vagaId
    // TODO: Implementar obterDashboardRiscos
    /* if (method === 'GET' && req.url?.includes('/dashboard')) {
      const vagaId = req.query.vagaId || req.url?.split('/').pop();

      if (!vagaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'vagaId é obrigatório'
        });
      }

      const dashboard = await obterDashboardRiscos(vagaId);

      return res.status(200).json({
        success: true,
        data: dashboard
      });
    } */

    // Método não permitido
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Método ${method} não suportado`
    });

  } catch (error: any) {
    console.error('[API] Erro em predicao-riscos:', error);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Erro ao processar requisição',
      timestamp: new Date().toISOString()
    });
  }
}
