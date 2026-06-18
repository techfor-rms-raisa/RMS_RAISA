/**
 * api/prospect-validate-emails.ts — Wrapper HTTP
 *
 * v1.1 (18/06/2026 — Refator lib/)
 *
 *   Lógica de cascade extraída para lib/validate-emails.ts permitindo
 *   uso in-process pelo orquestrador prospect-revalidate.ts. Elimina o
 *   sintoma de HTTP 401 em Preview por Vercel Deployment Protection
 *   bloqueando chamadas cross-function entre endpoints.
 *
 *   Este endpoint continua existindo para:
 *     - Backwards compatibility (consumidores externos que ainda chamam
 *       via HTTP — ex: smoke tests, integrações futuras)
 *     - Diagnóstico individual via HTTP
 *
 *   Comportamento HTTP IDÊNTICO ao v1.0 — zero breaking change:
 *     Input  (body):     { email, nome?, dominio? }
 *     Output (200):      { email, score, fonte }
 *     Output (400):      { error: 'email é obrigatório' }
 *     Output (405):      { error: 'Method not allowed' }
 *     Output (500):      { error: '...' }
 *
 * v1.0 (18/03/2026)
 *   Cascade local → Hunter → Snov.io.
 *
 * Caminho: api/prospect-validate-emails.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validarEmailCascade } from '../lib/validate-emails.js';

export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin',      '*');
  res.setHeader('Access-Control-Allow-Methods',     'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, nome, dominio } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email é obrigatório' });
    }

    const result = await validarEmailCascade({ email, nome, dominio });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('❌ [prospect-validate-emails]:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro interno' });
  }
}
