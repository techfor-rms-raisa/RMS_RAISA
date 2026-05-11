/**
 * api/creci-capture.ts
 *
 * Recebe corretores capturados pela CRECI Scraper Extension (Chrome)
 * e faz upsert no Supabase (corretores_creci).
 *
 * Actions:
 *   - upsertCorretores: bulk upsert de corretores (com/sem CRECI)
 *   - upsertCelularOnly: atualiza celular de um corretor existente ou insere novo
 *
 * A Anon Key fica segura no servidor — a Extension só envia a URL do app.
 *
 * Versão: 1.0
 * Data: 10/05/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = {
  maxDuration: 30,
};

// ─── NORMALIZAÇÃO ────────────────────────────────────────────────────────────

const ANALISTA_MAP: Record<string, string> = {
  'messias': 'Messias Vieira',
  'tatiana': 'Tatiana Silva',
  'henrique': 'Henrique Brito',
  'débora': 'Débora Souza',
  'debora': 'Débora Souza',
};

function normalizarCidade(cidade: string | null): string | null {
  if (!cidade) return null;
  const trimmed = cidade.trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, '');
  if (lower === 'saopaulo' || lower === 'sãopaulo') return 'São Paulo';
  const lowerSpaced = trimmed.toLowerCase().trim();
  if (lowerSpaced === 'sao paulo' || lowerSpaced === 'são paulo') return 'São Paulo';
  return trimmed;
}

function normalizarAnalista(analista: string | null): string | null {
  if (!analista) return null;
  const trimmed = analista.trim();
  const lower = trimmed.toLowerCase();
  return ANALISTA_MAP[lower] || trimmed;
}

function sanitize(val: any, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str.length === 0) return null;
  return str.slice(0, maxLen);
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface CorretorInput {
  nome?: string;
  creci?: string;
  situacao?: string;
  email?: string;
  email_creci?: string;
  email_pessoal?: string;
  celular?: string;
  telefone?: string;
  cidade?: string;
  uf?: string;
  tipo?: string;
  analista?: string;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — permitir requisições da Extension Chrome
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const { action } = req.body;

  try {
    if (action === 'upsertCorretores') {
      return await handleUpsertCorretores(req, res);
    } else if (action === 'upsertCelularOnly') {
      return await handleUpsertCelularOnly(req, res);
    } else {
      return res.status(400).json({ error: `Action desconhecida: ${action}` });
    }
  } catch (error: any) {
    console.error('❌ [creci-capture] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno',
    });
  }
}

// ─── UPSERT CORRETORES (BULK) ────────────────────────────────────────────────

async function handleUpsertCorretores(req: VercelRequest, res: VercelResponse) {
  const { corretores } = req.body as { corretores: CorretorInput[] };

  if (!Array.isArray(corretores) || corretores.length === 0) {
    return res.status(400).json({ error: 'Nenhum corretor recebido.' });
  }

  if (corretores.length > 500) {
    return res.status(400).json({ error: 'Máximo de 500 corretores por requisição.' });
  }

  console.log(`📥 [creci-capture] Recebendo ${corretores.length} corretores`);

  const agora = new Date().toISOString();

  // Sanitizar e normalizar
  const registros = corretores.map(c => ({
    nome:           sanitize(c.nome, 200),
    creci:          sanitize(c.creci, 20),
    situacao:       sanitize(c.situacao, 80),
    email_creci:    sanitize(c.email || c.email_creci, 200),
    email_pessoal:  sanitize(c.email_pessoal, 200),
    celular:        sanitize(c.celular || c.telefone, 30),
    cidade:         normalizarCidade(sanitize(c.cidade, 100)),
    uf:             sanitize(c.uf, 2),
    tipo:           sanitize(c.tipo, 10) || 'PF',
    analista:       normalizarAnalista(sanitize(c.analista, 100)),
    dados_extraido: null,
    fonte:          'creci_scraper',
    capturado_em:   agora,
    atualizado_em:  agora,
  })).filter(r => r.creci || r.nome);

  if (registros.length === 0) {
    return res.status(400).json({ error: 'Todos os registros estavam vazios após sanitização.' });
  }

  // Separar: com CRECI (upsert) e sem CRECI (insert)
  const comCreci = registros.filter(r => r.creci);
  const semCreci = registros.filter(r => !r.creci);
  let totalSalvos = 0;
  const erros: string[] = [];

  // Bloco 1: registros COM CRECI → upsert via on_conflict
  if (comCreci.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < comCreci.length; i += CHUNK) {
      const chunk = comCreci.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('corretores_creci')
        .upsert(chunk, { onConflict: 'creci', ignoreDuplicates: false });

      if (error) {
        console.error(`⚠️ [creci-capture] Erro upsert chunk:`, error.message);
        erros.push(error.message);
      } else {
        totalSalvos += chunk.length;
      }
    }
  }

  // Bloco 2: registros SEM CRECI → insert simples
  if (semCreci.length > 0) {
    const { error } = await supabase
      .from('corretores_creci')
      .insert(semCreci);

    if (error) {
      console.error(`⚠️ [creci-capture] Erro insert sem CRECI:`, error.message);
      erros.push(error.message);
    } else {
      totalSalvos += semCreci.length;
    }
  }

  console.log(`✅ [creci-capture] ${totalSalvos} salvos de ${registros.length}`);

  return res.status(200).json({
    success: true,
    salvos:  totalSalvos,
    total:   registros.length,
    erros:   erros.length,
    detalhes: erros,
  });
}

// ─── UPSERT CELULAR ONLY ────────────────────────────────────────────────────

async function handleUpsertCelularOnly(req: VercelRequest, res: VercelResponse) {
  const { corretor } = req.body as { corretor: CorretorInput };

  if (!corretor || !corretor.creci) {
    return res.status(400).json({ error: 'CRECI obrigatório.' });
  }

  const creci = sanitize(corretor.creci, 20);
  const celular = sanitize(corretor.celular || corretor.telefone, 30);
  const agora = new Date().toISOString();

  console.log(`📥 [creci-capture] Fix celular: ${creci} → ${celular}`);

  // 1. Tentar PATCH (atualizar celular de corretor existente)
  const { data: existing, error: patchError } = await supabase
    .from('corretores_creci')
    .update({ celular, atualizado_em: agora })
    .eq('creci', creci)
    .select('id');

  if (!patchError && existing && existing.length > 0) {
    console.log(`✅ [creci-capture] Celular atualizado para CRECI ${creci}`);
    return res.status(200).json({ success: true, acao: 'atualizado' });
  }

  // 2. Corretor não existe → INSERT completo
  const insertBody = {
    nome:           sanitize(corretor.nome, 200),
    creci,
    situacao:       sanitize(corretor.situacao, 80),
    email_creci:    sanitize(corretor.email || corretor.email_creci, 200),
    email_pessoal:  sanitize(corretor.email_pessoal, 200),
    celular,
    cidade:         normalizarCidade(sanitize(corretor.cidade, 100)),
    uf:             sanitize(corretor.uf, 2),
    tipo:           sanitize(corretor.tipo, 10) || 'PF',
    analista:       normalizarAnalista(sanitize(corretor.analista, 100)),
    dados_extraido: null,
    fonte:          'creci_scraper',
    capturado_em:   agora,
    atualizado_em:  agora,
  };

  const { error: insertError } = await supabase
    .from('corretores_creci')
    .insert(insertBody);

  if (insertError) {
    throw new Error(`Insert falhou: ${insertError.message}`);
  }

  console.log(`✅ [creci-capture] Corretor ${creci} inserido com celular`);
  return res.status(200).json({ success: true, acao: 'inserido' });
}
