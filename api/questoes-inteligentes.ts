/**
 * API ENDPOINT: QUESTÕES INTELIGENTES
 * Gerencia geração e respostas de questões personalizadas por IA
 */

import { gerarQuestoesParaVaga, buscarQuestoesVaga, aprovarQuestoes, adicionarQuestaoCustomizada, registrarRespostasCandidato, avaliarEficaciaQuestoes, atualizarBancoQuestoes } from '../src/services/questoesInteligentesService';

export default async function handler(req: any, res: any) {
  const { method } = req;

  try {
    // POST /api/questoes-inteligentes/gerar
    if (method === 'POST' && req.url?.includes('/gerar')) {
      const { vagaId, analistaId } = req.body;

      if (!vagaId || !analistaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'vagaId e analistaId são obrigatórios'
        });
      }

      const resultado = await gerarQuestoesParaVaga(vagaId, analistaId);

      return res.status(200).json({
        success: true,
        data: resultado,
        message: 'Questões geradas com sucesso'
      });
    }

    // POST /api/questoes-inteligentes/responder
    if (method === 'POST' && req.url?.includes('/responder')) {
      const { candidaturaId, questaoId, resposta } = req.body;

      if (!candidaturaId || !questaoId || !resposta) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'candidaturaId, questaoId e resposta são obrigatórios'
        });
      }

      const resultado = await registrarRespostasCandidato(
        candidaturaId,
        [{
          questao_id: questaoId,
          questao_texto: '',
          resposta_texto: resposta,
          fonte: 'digitacao_manual' as const
        }]
      );

      return res.status(200).json({
        success: true,
        data: resultado,
        message: 'Resposta salva com sucesso'
      });
    }

    // GET /api/questoes-inteligentes/:vagaId
    if (method === 'GET') {
      const vagaId = req.query.vagaId || req.url?.split('/').pop();

      if (!vagaId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'vagaId é obrigatório'
        });
      }

      const questoes = await buscarQuestoesVaga(vagaId);

      return res.status(200).json({
        success: true,
        data: questoes,
        count: questoes.length
      });
    }

    // Método não permitido
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Método ${method} não suportado`
    });

  } catch (error: any) {
    console.error('[API] Erro em questoes-inteligentes:', error);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Erro ao processar requisição',
      timestamp: new Date().toISOString()
    });
  }
}
