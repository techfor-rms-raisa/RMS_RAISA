/**
 * api/prospect-email-finder.ts — Wrapper HTTP
 *
 * v1.1 (18/06/2026 — Refator lib/)
 *
 *   Lógica de cascade extraída para lib/email-finder.ts permitindo uso
 *   in-process pelo orquestrador prospect-revalidate.ts. Elimina HTTP
 *   401 em Preview por Vercel Deployment Protection bloqueando chamadas
 *   cross-function entre endpoints.
 *
 *   🎁 GANHO ARQUITETURAL (vs. v1.0):
 *
 *     v1.0 tinha buscarEmailApollo() local que chamava Apollo SEM as
 *     proteções do wrapper v2.0 (sem flag, sem cap diário, sem skip).
 *     Isso furava silenciosamente o cap de 30 créditos/dia/gestor
 *     quando o cascade chegava na Etapa 3 (resgate).
 *
 *     v1.1 reutiliza apolloPeopleMatch de lib/apollo.ts v2.0 → cap
 *     diário agora é WATERTIGHT em TODA a cascade.
 *
 *   Este endpoint continua existindo para backwards compatibility +
 *   smoke individual via HTTP.
 *
 *   Comportamento HTTP IDÊNTICO ao v1.0, com 1 campo OPCIONAL novo:
 *     Input  (body):     { primeiro_nome, ultimo_nome?, domain,
 *                          empresa_nome?, fonte_original?,
 *                          user_id? }  ← 🆕 v1.1 (opcional, p/ cap Apollo)
 *     Output (200):      { success, email, email_status, motor }
 *     Output (400):      { error: 'primeiro_nome e domain são obrigatórios' }
 *     Output (405):      { error: 'Use POST.' }
 *     Output (500):      { success: false, error: '...' }
 *
 *   Payloads SEM user_id continuam funcionando (backwards-compat). Apenas
 *   perdem a proteção de cap por gestor.
 *
 * v1.0 (04/03/2026)
 *   Cascade Snov.io → Apollo → Snov.io (fallback).
 *
 * Caminho: api/prospect-email-finder.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buscarEmailPorNome } from '../lib/email-finder.js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const {
    primeiro_nome,
    ultimo_nome,
    domain,
    empresa_nome,
    fonte_original,
    user_id,           // 🆕 v1.1 — opcional, propagado para cap Apollo v2.0
  } = req.body;

  if (!primeiro_nome || !domain) {
    return res.status(400).json({ error: 'primeiro_nome e domain são obrigatórios' });
  }

  try {
    const result = await buscarEmailPorNome({
      primeiro_nome,
      ultimo_nome,
      domain,
      empresa_nome,
      fonte_original,
      user_id,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('❌ [prospect-email-finder]:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
  }
}
