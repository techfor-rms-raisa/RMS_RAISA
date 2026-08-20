/**
 * api/prospect-apollo-teste.ts — ENDPOINT DE TESTE (descartável) v0.2
 *
 * Pergunta que responde: a busca de PESSOAS via API do Apollo funciona no
 * plano de vocês? E o filtro Brasil pega?
 *
 * Você passa o DOMÍNIO CORPORATIVO (ex.: kaizengaming.com — não o .bet.br).
 * Tenta:
 *   A) mixed_people/api_search + domínio + títulos (SEM Brasil)
 *   B) mixed_people/api_search + domínio + títulos + Brazil
 *   C) mixed_people/search     + domínio + títulos + Brazil   (só se A e B = 0)
 *
 * Leitura:
 *   • A > 0            → a API de search FUNCIONA. Se B = 0, é só o filtro Brasil.
 *   • A = B = C = 0    → search não retorna nada no plano (dashboard-only) →
 *                        Apollo via API é beco sem saída.
 *
 * NÃO enriquece, NÃO salva, NÃO mexe na aba.
 * Versão: 0.2 (teste) · Data: 20/08/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const USUARIOS_AUTORIZADOS = new Set<number>([2]);
async function validarAcesso(userId: number): Promise<boolean> {
  const { data } = await supabase.from('app_users').select('id, tipo_usuario').eq('id', userId).maybeSingle();
  if (!data) return false;
  if (['Administrador', 'Admin'].includes(data.tipo_usuario || '')) return true;
  return USUARIOS_AUTORIZADOS.has(data.id);
}

const TITULOS_POR_AREA: Record<string, string[]> = {
  compras_suprimentos: ['procurement', 'purchasing', 'sourcing', 'buyer', 'supply chain'],
  ti_tecnologia:       ['information technology', 'technology', 'infrastructure', 'systems', 'IT'],
  governanca:          ['governance', 'compliance', 'risk', 'audit'],
};
const BR_LOCATIONS = ['Brazil', 'São Paulo, Brazil', 'Rio de Janeiro, Brazil'];

async function apolloPost(path: string, params: URLSearchParams, apiKey: string) {
  const res = await fetch(`${APOLLO_BASE_URL}/${path}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', accept: 'application/json', 'x-api-key': apiKey },
  });
  const txt = await res.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* keep txt */ }
  return { ok: res.ok, status: res.status, json, txt };
}

function montarParams(dominio: string, titulos: string[], comBrasil: boolean, perPage: number) {
  const p = new URLSearchParams();
  p.append('q_organization_domains_list[]', dominio);
  for (const t of titulos.slice(0, 25)) p.append('person_titles[]', t);
  if (comBrasil) for (const loc of BR_LOCATIONS) p.append('person_locations[]', loc);
  p.append('per_page', String(perPage));
  p.append('page', '1');
  return p;
}

function resumoPessoas(json: any) {
  const pessoas = [...(json?.people || []), ...(json?.contacts || [])];
  return {
    total: json?.pagination?.total_entries ?? null,
    retornadas: pessoas.length,
    amostra: pessoas.slice(0, 15).map((p: any) => ({
      nome: p.name, cargo: p.title, cidade: p.city, estado: p.state, pais: p.country, linkedin: p.linkedin_url,
    })),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const { user_id, dominio, areas = ['compras_suprimentos', 'ti_tecnologia', 'governanca'], per_page = 25 } = req.body || {};

  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  if (!dominio) return res.status(400).json({ error: 'dominio corporativo obrigatório (ex.: kaizengaming.com)' });

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APOLLO_API_KEY ausente no Vercel' });
  if (!(await validarAcesso(user_id))) return res.status(403).json({ error: 'Acesso restrito (Admin/Messias).' });

  const titulos: string[] = [];
  for (const a of areas) { const ts = TITULOS_POR_AREA[a]; if (ts) titulos.push(...ts); }

  try {
    const tentativas: any[] = [];

    const rA = await apolloPost('mixed_people/api_search', montarParams(dominio, titulos, false, per_page), apiKey);
    tentativas.push({ endpoint: 'api_search', filtro: 'sem_brasil', http: rA.status, ...(rA.ok ? resumoPessoas(rA.json) : { erro: rA.txt?.slice(0, 200) }) });

    const rB = await apolloPost('mixed_people/api_search', montarParams(dominio, titulos, true, per_page), apiKey);
    tentativas.push({ endpoint: 'api_search', filtro: 'brasil', http: rB.status, ...(rB.ok ? resumoPessoas(rB.json) : { erro: rB.txt?.slice(0, 200) }) });

    const aVazio = !(rA.ok && resumoPessoas(rA.json).retornadas > 0);
    const bVazio = !(rB.ok && resumoPessoas(rB.json).retornadas > 0);
    if (aVazio && bVazio) {
      const rC = await apolloPost('mixed_people/search', montarParams(dominio, titulos, true, per_page), apiKey);
      tentativas.push({ endpoint: 'search', filtro: 'brasil', http: rC.status, ...(rC.ok ? resumoPessoas(rC.json) : { erro: rC.txt?.slice(0, 200) }) });
    }

    const orgParams = new URLSearchParams();
    orgParams.append('q_organization_domains_list[]', dominio);
    orgParams.append('per_page', '3');
    const rOrg = await apolloPost('mixed_companies/search', orgParams, apiKey);
    const orgs = (rOrg.json?.organizations || rOrg.json?.accounts || []).map((o: any) => ({ id: o.id, nome: o.name, dominio: o.primary_domain }));

    const melhor = tentativas.find(t => (t.retornadas || 0) > 0) || null;

    return res.status(200).json({
      dominio,
      titulos_usados: titulos,
      veredito: melhor
        ? `✅ API retornou pessoas via '${melhor.endpoint}' (filtro ${melhor.filtro})`
        : '❌ API não retornou pessoas em nenhuma tentativa — provável search dashboard-only no plano',
      tentativas,
      organizacao_por_dominio: { encontrada: orgs.length > 0, candidatos: orgs },
      creditos_consumidos: 0,
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
  }
}
