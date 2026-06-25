/**
 * api/prospect-empresa-normalize.ts
 *
 * NORMALIZAÇÃO DE NOMES DE EMPRESA EM prospect_leads
 *
 * Endpoint admin para padronizar variações inconsistentes do mesmo nome
 * de empresa (case diferente, sufixos legais, espaços extras, etc).
 *
 * MODOS:
 *   GET                                              → { total: N }
 *   POST { user_id, offset, limite: 50 }             → processa 1 lote
 *
 * RBAC:
 *   POST exige user_id de tipo_usuario = 'Administrador' (validado server-side)
 *   GET é aberto (apenas count, sem dados sensíveis)
 *
 * COMPORTAMENTO:
 *   • Idempotente: rodar N vezes não bagunça (nome já normalizado não muda)
 *   • Cada par antigo→novo gera 1 linha em empresa_normalizacao_log
 *   • Escopo desta versão: APENAS prospect_leads.empresa_nome
 *     (NÃO toca email_empresas, email_leads, etc — decisão de produto)
 *
 * REGRAS DE NORMALIZAÇÃO:
 *   1. Trim + colapsa múltiplos espaços
 *   2. Remove pontuação final (. , ;)
 *   3. Remove sufixos legais (Ltda, SA, ME, EPP, EIRELI, Inc, Corp, Ltd, LLC, Cia)
 *   4. Title Case com proteção de siglas (NTT, SAP, IBM, etc) e preposições
 *      no meio (de, da, do, e, etc)
 *
 * Versão: 1.0
 * Data:    25/06/2026 (Fase 4)
 * Autor:   Messias + Claude DEV / Claude DBA
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 300 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── DICIONÁRIOS DE NORMALIZAÇÃO ────────────────────────────────────────────

/**
 * Sufixos legais removidos no FINAL do nome (case-insensitive).
 * Aplicados em loop até não haver mais matches (cobre "Empresa Ltda S.A.").
 */
const SUFIXOS_LEGAIS: RegExp[] = [
  /\s+ltda\.?$/i,
  /\s+s\.?\s*\/?\s*a\.?$/i,   // SA, S.A., S/A, S A
  /\s+m\.?\s*e\.?$/i,         // ME, M.E.
  /\s+epp\.?$/i,
  /\s+eireli\.?$/i,
  /\s+inc\.?$/i,
  /\s+corp\.?$/i,
  /\s+ltd\.?$/i,
  /\s+llc\.?$/i,
  /\s+cia\.?$/i,
];

/**
 * Siglas que devem ficar em UPPERCASE mesmo após Title Case.
 * Critério de inclusão: siglas conhecidas e relevantes ao mercado brasileiro
 * de TI/serviços. Lista pode crescer conforme novos casos forem identificados.
 */
const SIGLAS_UPPERCASE = new Set<string>([
  // TI / Software
  'NTT','SAP','IBM','HP','HPE','ABB','AWS','GCP','GE',
  'AI','IA','ML','BI','IOT','ERP','CRM','SAAS','PAAS','IAAS',
  'RPA','EDI','API','SDK','SQL','PHP','PMI','PMP','ITIL',
  // Negócios / Educação / Finanças
  'JBS','EY','PWC','BTG','BNDES','BB','KPMG','BCG','EMS',
  'USP','UFRJ','UFMG','UFSC','FGV','FIA','FIAP','PUC','UFPE',
  'USA','UK','BR','UE','EUA','ONU','OMS',
  // Genéricas comuns
  'TI','RH','TR','SP','RJ','MG','BA','PE','PR','RS','SC',
  'ABC','XYZ','IDC','SAC','ATM','ONG','BPO','OEM',
]);

/**
 * Palavras que ficam em lowercase no MEIO da frase (preposições/artigos).
 * Na primeira posição continuam capitalizadas.
 */
const PALAVRAS_LOWERCASE = new Set<string>([
  'de','da','do','das','dos','e','na','no','em',
  'a','o','as','os','para','por','com',
]);


// ─── FUNÇÕES DE NORMALIZAÇÃO ────────────────────────────────────────────────

function titleCasePalavra(palavra: string, indexNaFrase: number): string {
  if (!palavra) return palavra;

  const upper = palavra.toUpperCase();
  const lower = palavra.toLowerCase();

  // Sigla conhecida → uppercase
  if (SIGLAS_UPPERCASE.has(upper)) return upper;

  // Preposição/artigo no meio → lowercase
  if (indexNaFrase > 0 && PALAVRAS_LOWERCASE.has(lower)) return lower;

  // Title case padrão
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

/**
 * Normaliza um nome de empresa aplicando as regras determinísticas.
 * Idempotente: aplicar 2 vezes seguidas dá o mesmo resultado.
 * Retorna null se o input for nulo/vazio após limpeza.
 */
function normalizarNomeEmpresa(nomeOriginal: string | null | undefined): string | null {
  if (!nomeOriginal) return null;

  let nome = String(nomeOriginal).trim();
  if (!nome) return null;

  // 1. Colapsa múltiplos espaços
  nome = nome.replace(/\s{2,}/g, ' ');

  // 2. Remove pontuação final (. , ;)
  nome = nome.replace(/[.,;]+$/, '').trim();

  // 3. Remove sufixos legais em loop (cobre "Empresa Ltda S.A.")
  let alterou = true;
  while (alterou) {
    alterou = false;
    for (const regex of SUFIXOS_LEGAIS) {
      const novo = nome.replace(regex, '').trim();
      if (novo !== nome && novo.length > 0) {
        nome = novo;
        alterou = true;
      }
    }
  }

  if (!nome) return null;

  // 4. Title Case com proteções (hífens preservados)
  const palavras = nome.split(' ');
  const normalizadas = palavras.map((palavra, idx) => {
    if (!palavra) return palavra;

    if (palavra.includes('-')) {
      // Tech-For → preserva hífen, aplica title case em cada parte
      return palavra.split('-').map((p, i) => titleCasePalavra(p, idx + i)).join('-');
    }

    return titleCasePalavra(palavra, idx);
  });

  return normalizadas.filter(Boolean).join(' ').trim();
}


// ─── VALIDAÇÃO RBAC ──────────────────────────────────────────────────────────

async function validarAdministrador(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_users')
    .select('tipo_usuario')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.tipo_usuario === 'Administrador';
}


// ─── PROCESSAR UM NOME (atualizar + auditar) ─────────────────────────────────

async function aplicarNormalizacaoNome(
  nomeAntigo: string,
  nomeNovo: string,
  userId: number
): Promise<{ atualizados: number; erro?: string }> {
  // UPDATE em todos os leads com aquele nome exato
  const { data, error } = await supabase
    .from('prospect_leads')
    .update({ empresa_nome: nomeNovo })
    .eq('empresa_nome', nomeAntigo)
    .select('id');

  if (error) {
    return { atualizados: 0, erro: error.message };
  }

  const atualizados = data?.length || 0;

  // Audita o par antigo→novo
  if (atualizados > 0) {
    const { error: errLog } = await supabase
      .from('empresa_normalizacao_log')
      .insert({
        empresa_nome_antigo: nomeAntigo,
        empresa_nome_novo:   nomeNovo,
        registros_afetados:  atualizados,
        executado_por:       userId,
      });

    if (errLog) {
      console.warn(`[empresa-normalize] log falhou (não bloqueante): ${errLog.message}`);
    }
  }

  return { atualizados };
}


// ─── HANDLER ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── GET: total de nomes distintos ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase.rpc('count_empresa_nomes_distintos');
    if (error) {
      console.error('[empresa-normalize] erro ao contar:', error.message);
      return res.status(500).json({ error: error.message, total: 0 });
    }
    return res.status(200).json({ total: Number(data) || 0 });
  }

  // ── POST: processar lote ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { user_id, offset = 0, limite = 50 } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ error: 'user_id obrigatório' });
    }

    const isAdmin = await validarAdministrador(user_id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem normalizar empresas' });
    }

    // Validação dos parâmetros numéricos
    const offsetSeguro = Math.max(Number(offset) || 0, 0);
    const limiteSeguro = Math.min(Math.max(Number(limite) || 50, 1), 200);

    // 1) Pegar lote paginado de nomes distintos
    const { data: lote, error: errLote } = await supabase.rpc('empresa_nomes_paginados', {
      p_offset: offsetSeguro,
      p_limite: limiteSeguro,
    });

    if (errLote) {
      console.error('[empresa-normalize] erro ao listar lote:', errLote.message);
      return res.status(500).json({ error: errLote.message });
    }

    if (!lote || lote.length === 0) {
      return res.status(200).json({
        processados:       0,
        modificados:       0,
        leads_atualizados: 0,
        offset_proximo:    offsetSeguro,
        terminou:          true,
      });
    }

    // 2) Para cada nome, aplicar normalização (se mudou) e auditar
    let processados = 0;
    let modificados = 0;
    let leadsAtualizados = 0;
    const erros: string[] = [];

    for (const row of lote as Array<{ empresa_nome: string; total_leads: number }>) {
      processados++;
      const nomeAntigo = row.empresa_nome;
      const nomeNovo = normalizarNomeEmpresa(nomeAntigo);

      // Não muda → pula (idempotência)
      if (!nomeNovo || nomeNovo === nomeAntigo) continue;

      try {
        const { atualizados, erro } = await aplicarNormalizacaoNome(nomeAntigo, nomeNovo, user_id);
        if (erro) {
          erros.push(`"${nomeAntigo}": ${erro}`);
        } else if (atualizados > 0) {
          modificados++;
          leadsAtualizados += atualizados;
        }
      } catch (e: any) {
        erros.push(`"${nomeAntigo}": ${e?.message || 'erro desconhecido'}`);
      }
    }

    const offsetProximo = offsetSeguro + lote.length;

    // Verifica se há mais para processar
    const { data: totalRestante } = await supabase.rpc('count_empresa_nomes_distintos');
    const total = Number(totalRestante) || 0;
    const terminou = offsetProximo >= total;

    console.log(`✅ [empresa-normalize] lote: ${processados} verificados, ${modificados} modificados, ${leadsAtualizados} leads atualizados, terminou=${terminou}`);

    return res.status(200).json({
      processados,
      modificados,
      leads_atualizados: leadsAtualizados,
      offset_proximo:    offsetProximo,
      terminou,
      erros: erros.length > 0 ? erros : undefined,
    });
  }

  return res.status(405).json({ error: 'Use GET para count ou POST para processar' });
}
