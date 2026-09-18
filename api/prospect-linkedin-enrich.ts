/**
 * api/prospect-linkedin-enrich.ts
 *
 * ENRIQUECIMENTO DE E-MAIL — Prospecção LinkedIn via Apollo (Sessão 1b)
 *
 * Recebe os decisores que o usuário SELECIONOU na aba "Prospecção em Lote"
 * e busca o e-mail de cada um no Apollo (people/match → 1 crédito/match),
 * reutilizando lib/apollo.ts (apolloPeopleMatch v2.0) para herdar:
 *   • feature flag APOLLO_ENABLED (kill switch);
 *   • cap diário por gestor (APOLLO_DAILY_CAP_PER_USER) — aplicado quando
 *     passamos user_id;
 *   • skip preventivo quando não há identificador forte.
 *
 * ⚠️ LIMITAÇÃO CONHECIDA (a resolver antes do rollout amplo):
 *   O cap de lib/apollo.ts apura consumo somando `prospect_revalidacao_log`.
 *   Este fluxo NÃO grava nesse log, então os créditos gastos AQUI não entram
 *   na contagem diária — o cap só bloqueia se o gestor já estourou o limite
 *   pela Revalidação. Como nesta fase o acesso é só Admin + Messias (id=2) e
 *   a conta é paga, é aceitável. Salvaguarda extra desta versão:
 *   MAX_ENRICH_POR_REQUEST limita o gasto por clique. Antes de abrir para
 *   todos, plugar um log/counter próprio (ou gravar em prospect_revalidacao_log
 *   com schema validado — Regra 15) para o cap ficar watertight aqui também.
 *
 * RBAC: espelha o gate de api/prospect-linkedin-lote.ts (Admin OU id=2).
 *
 * Versão: 1.0 (Sessão 1b)
 * Data:    20/08/2026
 * Autor:   Messias + Claude DEV
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { apolloPeopleMatch } from '../lib/apollo.js';

export const config = { maxDuration: 120 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Espelha prospect-linkedin-lote.ts. TODO(rollout): centralizar em lib se abrir p/ todos.
const USUARIOS_AUTORIZADOS = new Set<number>([2]); // Messias Vieira (id=2)

async function validarAcesso(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, tipo_usuario')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  if (data.tipo_usuario === 'Administrador') return true;
  return USUARIOS_AUTORIZADOS.has(data.id);
}

// Salvaguarda de custo por clique (o cap diário do lib/apollo é complementar).
const MAX_ENRICH_POR_REQUEST = 25;

interface PessoaEnrich {
  primeiro_nome?: string | null;
  ultimo_nome?:   string | null;
  nome_completo?: string | null;
  linkedin_url?:  string | null;
  empresa_dominio?: string | null;
  empresa_nome?:  string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Use POST.' });

  const { user_id, pessoas } = req.body as { user_id: number; pessoas: PessoaEnrich[] };

  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  if (!Array.isArray(pessoas) || pessoas.length === 0) {
    return res.status(400).json({ error: 'pessoas deve ser um array não vazio' });
  }

  const autorizado = await validarAcesso(user_id);
  if (!autorizado) {
    return res.status(403).json({ error: 'Acesso restrito (Administrador e Messias Vieira).' });
  }

  // Corta no limite por request; o excedente volta para o usuário reenviar depois.
  const lote = pessoas.slice(0, MAX_ENRICH_POR_REQUEST);
  const excedente = pessoas.length - lote.length;

  try {
    const enriquecidos: Array<{
      linkedin_url: string | null;
      email: string | null;
      email_status: string | null;
      apollo_id: string | null;
      encontrado: boolean;
      motivo?: string;
    }> = [];

    let creditos = 0;
    let capAtingido = false;

    for (const p of lote) {
      const r = await apolloPeopleMatch({
        primeiro_nome:   p.primeiro_nome,
        ultimo_nome:     p.ultimo_nome,
        nome_completo:   p.nome_completo,
        linkedin_url:    p.linkedin_url,
        empresa_dominio: p.empresa_dominio,
        empresa_nome:    p.empresa_nome,
        user_id,
      });

      if (r.encontrado && r.email) creditos++;
      if (r.motivo && r.motivo.toLowerCase().includes('cap diário')) capAtingido = true;

      enriquecidos.push({
        linkedin_url: p.linkedin_url ?? r.linkedin_url ?? null,
        email:        r.email ?? null,
        email_status: r.email_status ?? null,
        apollo_id:    r.apollo_id ?? null,
        encontrado:   !!(r.encontrado && r.email),
        motivo:       r.encontrado ? undefined : r.motivo,
      });
    }

    console.log(`✅ [linkedin-enrich] user=${user_id} | ${lote.length} tentativas | ${creditos} e-mails | cap=${capAtingido}`);

    return res.status(200).json({
      success:             true,
      enriquecidos,
      creditos_consumidos: creditos,
      cap_atingido:        capAtingido,
      nao_processados:     excedente, // > 0 quando o usuário selecionou mais que o limite por clique
      limite_por_clique:   MAX_ENRICH_POR_REQUEST,
    });

  } catch (error: any) {
    console.error('❌ [linkedin-enrich] Erro:', error?.message);
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
  }
}
