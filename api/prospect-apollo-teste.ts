/**
 * api/prospect-apollo-teste.ts — ENDPOINT DE TESTE (descartável)
 *
 * Objetivo: provar, com o dado na mão, que o fluxo CERTO funciona:
 *   1) resolve a ORGANIZAÇÃO no Apollo pelo NOME  → organization_id
 *      (endpoint mixed_companies/search — NÃO por domínio .bet.br)
 *   2) busca PESSOAS por organization_ids + person_titles (EM INGLÊS) +
 *      person_locations=Brazil  (endpoint mixed_people/api_search — 0 créditos)
 *
 * NÃO enriquece e-mail. NÃO salva. NÃO mexe na aba. Só devolve JSON para
 * validarmos que voltam os decisores brasileiros (Marcelo Festa & cia).
 *
 * Uso (no Console do Preview, logado):
 *   fetch('/api/prospect-apollo-teste', {method:'POST',
 *     headers:{'Content-Type':'application/json'},
 *     body: JSON.stringify({ user_id: 2, empresa_nome: 'Kaizen Gaming' })})
 *     .then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)));
 *
 * Versão: 0.1 (teste) · Data: 20/08/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const USUARIOS_AUTORIZADOS = new Set<number>([2]); // Messias
async function validarAcesso(userId: number): Promise<boolean> {
  const { data } = await supabase.from('app_users').select('id, tipo_usuario').eq('id', userId).maybeSingle();
  if (!data) return false;
  if (['Administrador', 'Admin'].includes(data.tipo_usuario || '')) return true;
  return USUARIOS_AUTORIZADOS.has(data.id);
}

// Títulos EM INGLÊS (Apollo indexa em inglês) — as 3 áreas-alvo
const TITULOS_POR_AREA: Record<string, string[]> = {
  compras_suprimentos: ['procurement', 'purchasing', 'sourcing', 'buyer', 'supply chain', 'supplier'],
  ti_tecnologia:       ['information technology', 'technology', 'infrastructure', 'systems', 'software', 'cloud', 'security', 'data', 'IT'],
  governanca:          ['governance', 'compliance', 'risk', 'audit', 'internal control'],
};

const BR_LOCATIONS = ['Brazil', 'São Paulo, Brazil', 'Rio de Janeiro, Brazil'];

async function apolloPost(path: string, params: URLSearchParams, apiKey: string) {
  const res = await fetch(`${APOLLO_BASE_URL}/${path}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', accept: 'application/json', 'x-api-key': apiKey },
  });
  const txt = await res.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* deixa txt */ }
  return { ok: res.ok, status: res.status, json, txt };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const {
    user_id,
    empresa_nome,
    areas = ['compras_suprimentos', 'ti_tecnologia', 'governanca'],
    apenas_brasil = true,
    max_resultados = 25,
  } = req.body || {};

  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  if (!empresa_nome) return res.status(400).json({ error: 'empresa_nome obrigatório' });

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APOLLO_API_KEY ausente no Vercel' });

  if (!(await validarAcesso(user_id))) return res.status(403).json({ error: 'Acesso restrito (Admin/Messias).' });

  try {
    // ── PASSO 1: resolver a ORGANIZAÇÃO pelo nome ──────────────────────────
    const p1 = new URLSearchParams();
    p1.append('q_organization_name', empresa_nome);
    p1.append('per_page', '5');
    p1.append('page', '1');
    const orgResp = await apolloPost('mixed_companies/search', p1, apiKey);

    if (!orgResp.ok) {
      return res.status(200).json({
        success: false, passo: 'organizacao',
        erro: `Apollo HTTP ${orgResp.status}`, detalhe: orgResp.txt?.slice(0, 300),
      });
    }

    const orgs = orgResp.json?.organizations || orgResp.json?.accounts || [];
    if (orgs.length === 0) {
      return res.status(200).json({ success: false, passo: 'organizacao', erro: 'Nenhuma organização encontrada para o nome', candidatos: [] });
    }

    // melhor match: nome exato (case-insensitive) senão o 1º
    const alvo = orgs.find((o: any) => (o.name || '').toLowerCase() === String(empresa_nome).toLowerCase()) || orgs[0];
    const organizationId = alvo.id;

    // ── PASSO 2: buscar PESSOAS por organization_id + títulos EN + Brazil ──
    const titulos: string[] = [];
    for (const a of areas) { const ts = TITULOS_POR_AREA[a]; if (ts) titulos.push(...ts); }

    const p2 = new URLSearchParams();
    p2.append('organization_ids[]', organizationId);
    for (const t of titulos.slice(0, 25)) p2.append('person_titles[]', t);
    if (apenas_brasil) for (const loc of BR_LOCATIONS) p2.append('person_locations[]', loc);
    p2.append('per_page', String(max_resultados));
    p2.append('page', '1');

    const peopleResp = await apolloPost('mixed_people/api_search', p2, apiKey);
    if (!peopleResp.ok) {
      return res.status(200).json({
        success: false, passo: 'pessoas',
        organizacao: { id: organizationId, nome: alvo.name, dominio: alvo.primary_domain },
        erro: `Apollo HTTP ${peopleResp.status}`, detalhe: peopleResp.txt?.slice(0, 300),
      });
    }

    const pessoas = [...(peopleResp.json?.people || []), ...(peopleResp.json?.contacts || [])];
    const pagination = peopleResp.json?.pagination || {};

    const amostra = pessoas.slice(0, max_resultados).map((p: any) => ({
      nome: p.name, cargo: p.title,
      cidade: p.city, estado: p.state, pais: p.country,
      linkedin: p.linkedin_url,
      departamentos: p.departments, senioridade: p.seniority,
    }));

    return res.status(200).json({
      success: true,
      organizacao: { id: organizationId, nome: alvo.name, dominio: alvo.primary_domain, pais_sede: alvo.country },
      candidatos_organizacao: orgs.map((o: any) => ({ id: o.id, nome: o.name, dominio: o.primary_domain })),
      total_pessoas_retornadas: pessoas.length,
      total_disponivel_apollo: pagination.total_entries ?? null,
      titulos_usados: titulos,
      filtro_brasil: apenas_brasil,
      amostra,
      creditos_consumidos: 0,
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
  }
}
