/**
 * api/prospect-capture.ts
 * Endpoint receptor de leads capturados pela extensão Chrome "Prospect Engine"
 *
 * Fluxo:
 *   Chrome Extension (content.js) → background.js → POST /api/prospect-capture
 *   → salva no Supabase (motor='extension') → retorna resultados normalizados
 *   → background.js → chrome.tabs.sendMessage → content-rms.js → window.postMessage → React
 *
 * Versão: 1.0
 * Data: 17/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// ── Tipos ───────────────────────────────────────────────────────────────────

interface LeadExtensao {
  nome_completo:  string;
  primeiro_nome:  string;
  ultimo_nome:    string;
  cargo:          string;
  empresa_nome:   string;
  linkedin_url:   string;
  localizacao?:   string | null;
  fonte:          string;
  capturado_em:   string;
}

interface PayloadCaptura {
  leads:       LeadExtensao[];
  query:       string;
  pagina_url:  string;
  user_id:     string | null;
  capturado_em: string;
}

interface LeadNormalizado {
  id?:             number;
  nome_completo:   string;
  primeiro_nome:   string;
  ultimo_nome:     string;
  cargo:           string;
  empresa_nome:    string;
  linkedin_url:    string;
  localizacao:     string | null;
  email:           string | null;
  motor:           string;
  query_utilizada: string;
  buscado_por:     string | null;
  status:          string;
  criado_em?:      string;
}

// ── Handler principal ───────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — extensão Chrome faz requisição de origem diferente
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const body: PayloadCaptura = req.body;

    // ── Validação básica ──────────────────────────────────────────────────
    if (!body?.leads || !Array.isArray(body.leads) || body.leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Payload inválido: campo "leads" ausente ou vazio',
      });
    }

    console.log(`📥 [prospect-capture] Recebendo ${body.leads.length} leads da extensão`);
    console.log(`📥 [prospect-capture] Query: ${body.query}`);
    console.log(`📥 [prospect-capture] user_id: ${body.user_id}`);

    // ── Normalizar leads para o schema do Supabase ────────────────────────
    const leadsParaSalvar: LeadNormalizado[] = body.leads
      .filter(lead => lead.nome_completo && lead.nome_completo.length >= 4)
      .map(lead => {
        // Extrair cidade/estado da localização quando disponível
        let cidade: string | null  = null;
        let estado: string | null  = null;

        if (lead.localizacao) {
          const partes = lead.localizacao.split(',').map(p => p.trim());
          if (partes.length >= 2) {
            cidade = partes[0] || null;
            estado = partes[1] || null;
          } else {
            cidade = lead.localizacao || null;
          }
        }

        return {
          nome_completo:    lead.nome_completo,
          primeiro_nome:    lead.primeiro_nome || lead.nome_completo.split(' ')[0],
          ultimo_nome:      lead.ultimo_nome   || lead.nome_completo.split(' ').slice(1).join(' '),
          cargo:            lead.cargo         || '',
          empresa_nome:     lead.empresa_nome  || '',
          linkedin_url:     lead.linkedin_url,
          localizacao:      lead.localizacao   || null,
          cidade:           cidade,
          estado:           estado,
          pais:             lead.localizacao?.toLowerCase().includes('brasil') ? 'Brasil' : null,
          email:            null,
          motor:            'extension',
          query_utilizada:  body.query || '',
          buscado_por:      body.user_id || null,
          status:           'novo',
          enriquecido:      false,
          filtros_busca:    {
            fonte:       'prospect_extension',
            pagina_url:  body.pagina_url || null,
            capturado_em: body.capturado_em || new Date().toISOString(),
          },
        };
      });

    if (leadsParaSalvar.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum lead válido após validação (nome_completo obrigatório)',
      });
    }

    // ── Deduplicação: verificar linkedin_url já existentes ─────────────────
    const linkedinUrls = leadsParaSalvar
      .map(l => l.linkedin_url)
      .filter(Boolean);

    const { data: existentes } = await supabase
      .from('prospect_leads')
      .select('linkedin_url')
      .in('linkedin_url', linkedinUrls);

    const urlsExistentes = new Set((existentes || []).map(e => e.linkedin_url));

    const leadsNovos     = leadsParaSalvar.filter(l => !urlsExistentes.has(l.linkedin_url));
    const leadsDuplicados = leadsParaSalvar.filter(l => urlsExistentes.has(l.linkedin_url));

    console.log(`📥 [prospect-capture] Novos: ${leadsNovos.length} | Duplicados (ignorados): ${leadsDuplicados.length}`);

    // ── Inserir novos leads no Supabase ────────────────────────────────────
    let leadsInseridos: LeadNormalizado[] = [];

    if (leadsNovos.length > 0) {
      const { data: inseridos, error: erroInsert } = await supabase
        .from('prospect_leads')
        .insert(leadsNovos)
        .select();

      if (erroInsert) {
        console.error('❌ [prospect-capture] Erro ao inserir:', erroInsert);
        return res.status(500).json({
          success: false,
          error: `Erro ao salvar no banco: ${erroInsert.message}`,
          detalhes: erroInsert,
        });
      }

      leadsInseridos = inseridos || [];
      console.log(`✅ [prospect-capture] ${leadsInseridos.length} leads inseridos com sucesso`);
    }

    // ── Montar resultados para retornar ao background.js ──────────────────
    // Retorna TODOS (novos + duplicados) para exibição no React
    // Os duplicados já têm dados no banco — buscá-los para retornar completos
    let resultados: LeadNormalizado[] = [...leadsInseridos];

    if (leadsDuplicados.length > 0) {
      const { data: existentesCompletos } = await supabase
        .from('prospect_leads')
        .select('*')
        .in('linkedin_url', leadsDuplicados.map(l => l.linkedin_url));

      if (existentesCompletos) {
        resultados = [...resultados, ...existentesCompletos];
      }
    }

    // ── Resposta final ─────────────────────────────────────────────────────
    return res.status(200).json({
      success:      true,
      total:        body.leads.length,
      inseridos:    leadsInseridos.length,
      duplicados:   leadsDuplicados.length,
      resultados:   resultados,   // ← background.js usa este campo para enviar ao React
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro interno desconhecido';
    console.error('❌ [prospect-capture] Erro inesperado:', msg);
    return res.status(500).json({ success: false, error: msg });
  }
}
