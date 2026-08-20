/**
 * api/prospect-linkedin-lote.ts
 *
 * PROSPECÇÃO LINKEDIN VIA APOLLO — ORQUESTRADOR EM LOTE (Sessão 1a: BUSCA)
 *
 * Recebe uma lista de empresas (nome + domínio opcional, já parseada do .xlsx
 * no frontend com SheetJS), resolve o domínio quando ausente, busca os
 * decisores no Apollo (mixed_people/api_search → 0 créditos), deduplica contra
 * prospect_leads e devolve a lista para o usuário CURAR.
 *
 * O QUE ESTE ENDPOINT NÃO FAZ (por design):
 *   • NÃO enriquece e-mail (people/match, 1 crédito/pessoa) — isso é a
 *     Sessão 1b, plugando lib/apollo.ts (apolloPeopleMatch v2.0 + cap
 *     APOLLO_DAILY_CAP_PER_USER) e só nos selecionados pelo usuário.
 *   • NÃO salva em prospect_leads — a gravação é ação explícita do usuário
 *     via api/prospect-save.ts (motor='apollo'), igual ao fluxo Nova Busca.
 *
 * RBAC (fase de validação — 20/08/2026):
 *   Acesso APENAS para tipo_usuario='Administrador' OU o usuário Messias Vieira
 *   (id=2). O trio Gestão Comercial (Tatiana/Marcos/Roseni) tem o MESMO
 *   tipo_usuario 'Gestão Comercial' que o Messias, então a trava é pelo ID —
 *   NÃO pelo tipo — para não abrir acesso ao trio (regra permanente #4:
 *   GC não recebe módulo LinkedIn). Rollout amplo só depois de validação intensa.
 *
 * Versão: 1.0.1 (Sessão 1a) — import type-only de DecisorApollo (verbatimModuleSyntax)
 * Data:    20/08/2026
 * Autor:   Messias + Claude DEV
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolverDominio } from '../lib/resolve-dominio.js';
import { buscarDecisoresApollo, type DecisorApollo } from '../lib/apollo-search.js';

// Resolução de domínio via Gemini + N buscas Apollo: operação potencialmente longa.
export const config = { maxDuration: 300 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── RBAC ────────────────────────────────────────────────────────────────────
// Whitelist de ids autorizados ALÉM de Administrador. Nesta fase: só Messias (2).
// No rollout futuro, esta lista/lógica será ampliada (ou trocada por uma flag).
const USUARIOS_AUTORIZADOS = new Set<number>([2]); // Messias Vieira (id=2)

async function validarAcesso(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, tipo_usuario')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return false;
  if (data.tipo_usuario === 'Administrador') return true;   // qualquer Admin
  return USUARIOS_AUTORIZADOS.has(data.id);                 // ou id na whitelist
}

// ─── Limites do lote ─────────────────────────────────────────────────────────
// Cada empresa pode exigir 1 chamada Gemini (resolver domínio) + 1 chamada Apollo.
// Mantemos o lote pequeno para caber no maxDuration; o frontend pagina a planilha
// inteira chamando este endpoint em fatias (mesmo padrão de prospect-empresa-normalize).
const MAX_EMPRESAS_LOTE = 20;

// Dedupe: .in() do Supabase não deve receber listas gigantes de uma vez.
const CHUNK_DEDUPE = 200;

interface EmpresaInput {
  nome:     string;
  dominio?: string | null;
}

interface DiagnosticoEmpresa {
  nome:            string;
  dominio:         string | null;
  encontrados:     number;   // decisores retornados pelo Apollo
  novos:           number;   // após remover os que já estão em prospect_leads
  status:          'ok' | 'sem_dominio' | 'sem_resultado' | 'erro';
  detalhe?:        string;
}

// Deduplica um conjunto de linkedin_urls contra prospect_leads.
// Retorna o Set de urls que JÁ existem na base.
async function urlsJaNaBase(urls: string[]): Promise<Set<string>> {
  const existentes = new Set<string>();
  const limpos = urls.filter(Boolean);

  for (let i = 0; i < limpos.length; i += CHUNK_DEDUPE) {
    const fatia = limpos.slice(i, i + CHUNK_DEDUPE);
    const { data, error } = await supabase
      .from('prospect_leads')
      .select('linkedin_url')
      .in('linkedin_url', fatia);

    if (error) {
      console.error('⚠️ [linkedin-lote] Erro no dedupe (não bloqueante):', error.message);
      continue; // na dúvida, não marca como duplicado — usuário decide na curadoria
    }
    for (const row of (data || [])) {
      if (row.linkedin_url) existentes.add(row.linkedin_url);
    }
  }
  return existentes;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Use POST.' });

  const {
    user_id,
    empresas,
    departamentos = [],
    senioridades  = [],
    filtrar_brasil = true,   // default: focar decisores no Brasil
    max_resultados = 25,
  } = req.body as {
    user_id:         number;
    empresas:        EmpresaInput[];
    departamentos?:  string[];
    senioridades?:   string[];
    filtrar_brasil?: boolean;
    max_resultados?: number;
  };

  // ── Validações de entrada ──
  if (!user_id) {
    return res.status(400).json({ error: 'user_id obrigatório' });
  }
  if (!Array.isArray(empresas) || empresas.length === 0) {
    return res.status(400).json({ error: 'empresas deve ser um array não vazio' });
  }
  if (empresas.length > MAX_EMPRESAS_LOTE) {
    return res.status(400).json({
      error: `Máximo de ${MAX_EMPRESAS_LOTE} empresas por lote. Pagine a planilha no frontend.`,
    });
  }

  // ── RBAC ──
  const autorizado = await validarAcesso(user_id);
  if (!autorizado) {
    return res.status(403).json({
      error: 'Acesso restrito. Esta funcionalidade está disponível apenas para Administrador e Messias Vieira nesta fase.',
    });
  }

  try {
    const diagnostico: DiagnosticoEmpresa[] = [];
    const todosDecisores: DecisorApollo[] = [];

    // ── 1) Resolver domínios ausentes (concorrência leve, lotes de 4) ──
    const comDominio: Array<{ nome: string; dominio: string | null }> = [];
    for (let i = 0; i < empresas.length; i += 4) {
      const fatia = empresas.slice(i, i + 4);
      const resolvidos = await Promise.all(fatia.map(async (e) => {
        const nome = (e.nome || '').trim();
        const dominioInformado = (e.dominio || '').trim();
        if (dominioInformado) return { nome, dominio: dominioInformado.toLowerCase() };
        if (!nome)            return { nome, dominio: null };
        const dominio = await resolverDominio(nome);
        return { nome, dominio: dominio ? dominio.toLowerCase() : null };
      }));
      comDominio.push(...resolvidos);
    }

    // ── 2) Buscar decisores no Apollo, empresa por empresa ──
    for (const emp of comDominio) {
      if (!emp.dominio) {
        diagnostico.push({
          nome: emp.nome, dominio: null, encontrados: 0, novos: 0,
          status: 'sem_dominio',
          detalhe: 'Domínio não informado e não resolvido pelo Gemini — revisar manualmente.',
        });
        continue;
      }

      try {
        const { decisores } = await buscarDecisoresApollo({
          domain:         emp.dominio,
          departamentos,
          senioridades,
          filtrar_brasil,
          max_resultados,
        });

        // Carimba a empresa de origem (o nome da planilha) para exibição/curadoria
        for (const d of decisores) {
          if (!d.empresa_nome) d.empresa_nome = emp.nome;
          (d as any).empresa_dominio = emp.dominio;
        }

        todosDecisores.push(...decisores);
        diagnostico.push({
          nome: emp.nome, dominio: emp.dominio,
          encontrados: decisores.length, novos: 0, // novos preenchido após dedupe
          status: decisores.length > 0 ? 'ok' : 'sem_resultado',
        });
      } catch (err: any) {
        diagnostico.push({
          nome: emp.nome, dominio: emp.dominio, encontrados: 0, novos: 0,
          status: 'erro', detalhe: err?.message || 'erro na busca Apollo',
        });
      }
    }

    // ── 3) Dedupe intra-lote (mesmo decisor em 2 empresas) por linkedin_url ──
    const vistos = new Set<string>();
    const semDupInterna = todosDecisores.filter((d) => {
      const key = d.linkedin_url || `${d.nome_completo}|${d.empresa_nome}`;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });

    // ── 4) Dedupe contra prospect_leads (o que já está na base) ──
    const urls = semDupInterna.map((d) => d.linkedin_url).filter(Boolean) as string[];
    const jaExistentes = await urlsJaNaBase(urls);

    const novos: DecisorApollo[] = [];
    const jaNaBase: DecisorApollo[] = [];
    for (const d of semDupInterna) {
      if (d.linkedin_url && jaExistentes.has(d.linkedin_url)) jaNaBase.push(d);
      else novos.push(d);
    }

    // Preenche "novos" por empresa no diagnóstico
    const novosPorEmpresa = new Map<string, number>();
    for (const d of novos) {
      const chave = (d as any).empresa_dominio || d.empresa_nome;
      novosPorEmpresa.set(chave, (novosPorEmpresa.get(chave) || 0) + 1);
    }
    for (const linha of diagnostico) {
      const chave = linha.dominio || linha.nome;
      linha.novos = novosPorEmpresa.get(chave) || 0;
    }

    console.log(
      `✅ [linkedin-lote] user=${user_id} | ${comDominio.length} empresas | ` +
      `${todosDecisores.length} brutos | ${novos.length} novos | ${jaNaBase.length} já na base`
    );

    return res.status(200).json({
      success:              true,
      total_empresas:       comDominio.length,
      total_encontrados:    todosDecisores.length,
      total_novos:          novos.length,
      total_ja_na_base:     jaNaBase.length,
      resultados:           novos,        // para curadoria
      ja_na_base:           jaNaBase,     // exibidos separadamente (cinza)
      diagnostico,                        // status por empresa (valida filtro BR)
      creditos_consumidos:  0,            // busca é grátis
      motor:                'apollo',
    });

  } catch (error: any) {
    console.error('❌ [linkedin-lote] Erro:', error?.message);
    return res.status(500).json({ success: false, error: error?.message || 'Erro interno' });
  }
}
