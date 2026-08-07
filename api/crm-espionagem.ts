/**
 * api/crm-espionagem.ts — Endpoint do módulo Espionagem Estratégica
 *
 * Caminho: api/crm-espionagem.ts
 * Versão: 1.1 (Sessão 3 — 07/08/2026)
 *
 * v1.1 (07/08/2026 — Sessão 3):
 *  - 🆕 POST action `descobrir_clientes`: descoberta automática da carteira
 *    de clientes do concorrente via Gemini Search Grounding (site institucional,
 *    páginas de cases/clientes/parceiros e notícias públicas).
 *    NÃO grava nada — retorna sugestões com flag `ja_cadastrado` para
 *    confirmação humana no frontend (human-in-the-loop). A gravação segue
 *    pela action `adicionar_clientes` com origem_descoberta='gemini'.
 *  - Padrões herdados de prospect-gemini-search.ts v2.3: extração robusta
 *    via candidates[0].content.parts (BUG 4), parser de JSON balanceado,
 *    fallback de queries manuais quando sem dados públicos, prompt estilo
 *    v1.6 (sem proibições excessivas — evita regressão num_parts:0).
 *
 * v1.0 (07/08/2026 — Sessão 2):
 *  - CRUD de concorrentes e suas carteiras de clientes (modo manual).
 *  - Execução do motor de cruzamento via RPC `espionagem_analisar_concorrente`
 *    (RETURNS jsonb — bypassa limite de 1.000 linhas do PostgREST).
 *  - Snapshot histórico em `espionagem_analises` + cálculo de delta
 *    ("novo na carteira" = cliente descoberto após a análise anterior).
 *
 * RBAC (decisão Q2 — 07/08/2026): Administrador + Gestão Comercial + SDR.
 *  Verificado no backend em TODAS as actions (não apenas na UI).
 *
 * Endpoints:
 *  GET   ?action=listar_concorrentes&ator_email=X
 *  GET   ?action=detalhe_concorrente&id=X&ator_email=X
 *  GET   ?action=listar_analises&concorrente_id=X&ator_email=X
 *  POST  action=criar_concorrente        { nome, website?, dominio?, ator_email }
 *  POST  action=adicionar_clientes       { concorrente_id, clientes: [{nome, dominios[], chave_busca?, origem_descoberta?}], ator_email }
 *  POST  action=executar_analise         { concorrente_id, ator_email }
 *  POST  action=descobrir_clientes       { concorrente_id, ator_email }            (🆕 v1.1)
 *  PATCH action=atualizar_concorrente    { id, campos..., ator_email }
 *  PATCH action=atualizar_cliente        { id, campos..., ator_email }
 *
 * Tabelas: espionagem_concorrentes, espionagem_concorrente_clientes,
 *          espionagem_analises (todas criadas em 2026-08-07_espionagem_schema.sql)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// ─── Lazy init Gemini (padrão prospect-gemini-search.ts) ────────────────
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) throw new Error('API_KEY não configurada.');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export const config = { maxDuration: 60 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ════════════════════════════════════════════════════════════════════════
// RBAC — decisão Q2 (07/08/2026): Admin + Gestão Comercial + SDR
// ════════════════════════════════════════════════════════════════════════
const PERFIS_AUTORIZADOS = ['Administrador', 'Gestão Comercial', 'SDR'];

// Whitelists de campos editáveis (padrão v1.4 do crm-leads — nunca aceitar
// objetos inteiros do frontend, que podem trazer JOINs embed)
const CAMPOS_CONCORRENTE = ['nome', 'website', 'dominio', 'status'];
const CAMPOS_CLIENTE = ['nome', 'dominios', 'chave_busca', 'ativo'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query.action as string) || (req.body?.action as string) || '';

  try {
    // ── Autorização (todas as actions) ─────────────────────────
    const atorEmail =
      (req.query.ator_email as string) || (req.body?.ator_email as string) || '';
    const ator = await resolverAtor(atorEmail);
    if (!ator) {
      return res.status(403).json({ success: false, error: 'Usuário não identificado (ator_email obrigatório)' });
    }
    if (!PERFIS_AUTORIZADOS.includes(ator.tipo_usuario)) {
      return res.status(403).json({
        success: false,
        error: `Perfil "${ator.tipo_usuario}" não tem acesso ao módulo Espionagem Estratégica.`,
      });
    }

    // ════════════════════════════════════════════════════════════
    // GET
    // ════════════════════════════════════════════════════════════
    if (req.method === 'GET') {
      // ── LISTAR CONCORRENTES (com resumo) ─────────────────────
      if (action === 'listar_concorrentes') {
        const { data: concorrentes, error } = await supabase
          .from('espionagem_concorrentes')
          .select('*')
          .neq('status', 'arquivado')
          .order('nome', { ascending: true });
        if (error) throw error;

        const ids = (concorrentes || []).map((c: any) => c.id);
        let clientesPorConc: Record<number, number> = {};
        let ultimaPorConc: Record<number, any> = {};

        if (ids.length > 0) {
          const { data: clientes, error: errCli } = await supabase
            .from('espionagem_concorrente_clientes')
            .select('concorrente_id')
            .in('concorrente_id', ids)
            .eq('ativo', true);
          if (errCli) throw errCli;
          for (const c of clientes || []) {
            clientesPorConc[c.concorrente_id] = (clientesPorConc[c.concorrente_id] || 0) + 1;
          }

          const { data: analises, error: errAn } = await supabase
            .from('espionagem_analises')
            .select('id, concorrente_id, executado_em, executado_por, total_prospectados, total_leads_crm, total_campanhas, total_abordagens, cobertura_pct')
            .in('concorrente_id', ids)
            .order('executado_em', { ascending: false });
          if (errAn) throw errAn;
          for (const a of analises || []) {
            if (!ultimaPorConc[a.concorrente_id]) ultimaPorConc[a.concorrente_id] = a;
          }
        }

        const enriquecidos = (concorrentes || []).map((c: any) => ({
          ...c,
          total_clientes: clientesPorConc[c.id] || 0,
          ultima_analise: ultimaPorConc[c.id] || null,
        }));

        return res.status(200).json({ success: true, concorrentes: enriquecidos });
      }

      // ── DETALHE CONCORRENTE ──────────────────────────────────
      if (action === 'detalhe_concorrente') {
        const { id } = req.query as Record<string, string>;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        const { data: concorrente, error } = await supabase
          .from('espionagem_concorrentes')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        if (!concorrente) return res.status(404).json({ success: false, error: 'Concorrente não encontrado' });

        const { data: clientes, error: errCli } = await supabase
          .from('espionagem_concorrente_clientes')
          .select('*')
          .eq('concorrente_id', id)
          .eq('ativo', true)
          .order('nome', { ascending: true });
        if (errCli) throw errCli;

        const { data: ultimaAnalise, error: errAn } = await supabase
          .from('espionagem_analises')
          .select('*')
          .eq('concorrente_id', id)
          .order('executado_em', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (errAn) throw errAn;

        return res.status(200).json({
          success: true,
          concorrente,
          clientes: clientes || [],
          ultima_analise: ultimaAnalise || null,
        });
      }

      // ── LISTAR ANÁLISES (histórico resumido) ─────────────────
      if (action === 'listar_analises') {
        const { concorrente_id } = req.query as Record<string, string>;
        if (!concorrente_id) {
          return res.status(400).json({ success: false, error: 'concorrente_id é obrigatório' });
        }

        const { data, error } = await supabase
          .from('espionagem_analises')
          .select('id, executado_em, executado_por, total_prospectados, total_leads_crm, total_campanhas, total_abordagens, cobertura_pct')
          .eq('concorrente_id', concorrente_id)
          .order('executado_em', { ascending: false })
          .limit(30);
        if (error) throw error;

        return res.status(200).json({ success: true, analises: data || [] });
      }

      return res.status(400).json({ success: false, error: `GET action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // POST
    // ════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      const body = req.body || {};

      // ── CRIAR CONCORRENTE ────────────────────────────────────
      if (action === 'criar_concorrente') {
        const nome = (body.nome || '').toString().trim();
        if (!nome) return res.status(400).json({ success: false, error: 'nome é obrigatório' });

        const { data, error } = await supabase
          .from('espionagem_concorrentes')
          .insert({
            nome,
            website: (body.website || '').toString().trim() || null,
            dominio: normalizarDominio(body.dominio),
            origem: 'manual',
            criado_por: ator.email_usuario,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return res.status(409).json({ success: false, error: `Concorrente "${nome}" já cadastrado` });
          }
          throw error;
        }
        return res.status(201).json({ success: true, concorrente: data });
      }

      // ── ADICIONAR CLIENTES (lote, com merge de domínios) ─────
      // Se o cliente já existe (mesmo nome, case-insensitive) no
      // concorrente: faz UNION dos domínios e reativa (ativo=true).
      if (action === 'adicionar_clientes') {
        const { concorrente_id, clientes } = body;
        if (!concorrente_id || !Array.isArray(clientes) || clientes.length === 0) {
          return res.status(400).json({ success: false, error: 'concorrente_id e clientes[] são obrigatórios' });
        }

        const { data: existentes, error: errEx } = await supabase
          .from('espionagem_concorrente_clientes')
          .select('id, nome, dominios, ativo')
          .eq('concorrente_id', concorrente_id);
        if (errEx) throw errEx;

        const porNome: Record<string, any> = {};
        for (const e of existentes || []) porNome[e.nome.toLowerCase().trim()] = e;

        const resultado = { inseridos: 0, mesclados: 0, ignorados: 0 };

        for (const c of clientes) {
          const nome = (c.nome || '').toString().trim();
          if (!nome) { resultado.ignorados++; continue; }

          const dominios = normalizarDominios(c.dominios);
          const existente = porNome[nome.toLowerCase()];

          if (existente) {
            const uniao = Array.from(new Set([...(existente.dominios || []), ...dominios]));
            const { error: errUp } = await supabase
              .from('espionagem_concorrente_clientes')
              .update({ dominios: uniao, ativo: true })
              .eq('id', existente.id);
            if (errUp) throw errUp;
            resultado.mesclados++;
          } else {
            const { error: errIn } = await supabase
              .from('espionagem_concorrente_clientes')
              .insert({
                concorrente_id,
                nome,
                dominios,
                chave_busca: (c.chave_busca || '').toString().trim() || null,
                origem_descoberta: c.origem_descoberta === 'gemini' ? 'gemini' : 'manual',
                criado_por: ator.email_usuario,
              });
            if (errIn) throw errIn;
            resultado.inseridos++;
          }
        }

        return res.status(200).json({ success: true, ...resultado });
      }

      // ── EXECUTAR ANÁLISE (RPC + snapshot + delta) ────────────
      if (action === 'executar_analise') {
        const { concorrente_id } = body;
        if (!concorrente_id) {
          return res.status(400).json({ success: false, error: 'concorrente_id é obrigatório' });
        }

        // 1. Motor de cruzamento (RPC jsonb)
        const { data: resultado, error: errRpc } = await supabase
          .rpc('espionagem_analisar_concorrente', { p_concorrente_id: concorrente_id });
        if (errRpc) throw errRpc;
        if (!resultado || !resultado.totais) {
          return res.status(500).json({ success: false, error: 'RPC retornou resultado vazio' });
        }

        // 2. Análise anterior (para o delta "novo na carteira")
        const { data: anterior, error: errAnt } = await supabase
          .from('espionagem_analises')
          .select('id, executado_em')
          .eq('concorrente_id', concorrente_id)
          .order('executado_em', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (errAnt) throw errAnt;

        // 3. Marca clientes novos: descobertos APÓS a análise anterior
        const corte = anterior?.executado_em || null;
        let novosNaCarteira = 0;
        const clientesComDelta = (resultado.clientes || []).map((c: any) => {
          const novo = !!(corte && c.descoberto_em && c.descoberto_em > corte);
          if (novo) novosNaCarteira++;
          return { ...c, novo_na_carteira: novo };
        });

        const resultadoFinal = {
          ...resultado,
          clientes: clientesComDelta,
          delta: {
            analise_anterior_em: corte,
            novos_na_carteira: novosNaCarteira,
          },
        };

        // 4. Snapshot histórico
        const t = resultado.totais;
        const { data: analise, error: errIns } = await supabase
          .from('espionagem_analises')
          .insert({
            concorrente_id,
            executado_por: ator.email_usuario,
            resultado: resultadoFinal,
            total_prospectados: t.prospectados || 0,
            total_leads_crm: t.leads_crm || 0,
            total_campanhas: t.campanhas || 0,
            total_abordagens: t.abordagens || 0,
            cobertura_pct: t.cobertura_pct || 0,
          })
          .select('id, executado_em')
          .single();
        if (errIns) throw errIns;

        return res.status(200).json({
          success: true,
          analise_id: analise.id,
          executado_em: analise.executado_em,
          resultado: resultadoFinal,
        });
      }

      // ── DESCOBRIR CLIENTES VIA GEMINI (🆕 v1.1 — Sessão 3) ───
      // Varre fontes públicas (site do concorrente, cases, notícias)
      // e retorna a carteira SUGERIDA. Nada é gravado aqui — o frontend
      // exibe checkboxes e grava via `adicionar_clientes`.
      if (action === 'descobrir_clientes') {
        const { concorrente_id } = body;
        if (!concorrente_id) {
          return res.status(400).json({ success: false, error: 'concorrente_id é obrigatório' });
        }

        const { data: concorrente, error: errConc } = await supabase
          .from('espionagem_concorrentes')
          .select('id, nome, website, dominio')
          .eq('id', concorrente_id)
          .maybeSingle();
        if (errConc) throw errConc;
        if (!concorrente) {
          return res.status(404).json({ success: false, error: 'Concorrente não encontrado' });
        }

        // Carteira já cadastrada — para marcar duplicados na sugestão
        const { data: existentes, error: errEx } = await supabase
          .from('espionagem_concorrente_clientes')
          .select('nome, dominios, ativo')
          .eq('concorrente_id', concorrente_id);
        if (errEx) throw errEx;

        const nomesExistentes = new Set(
          (existentes || []).map((e: any) => e.nome.toLowerCase().trim())
        );
        const dominiosExistentes = new Set(
          (existentes || []).flatMap((e: any) => (e.dominios || []).map((d: string) => d.toLowerCase()))
        );

        const descoberta = await descobrirClientesGemini(
          concorrente.nome,
          concorrente.website || concorrente.dominio || ''
        );

        if (descoberta.sem_resultados) {
          return res.status(200).json({
            success: true,
            sem_resultados: true,
            clientes_sugeridos: [],
            queries_manuais: descoberta.queries_manuais,
            mensagem:
              'O Gemini não encontrou dados públicos sobre a carteira deste concorrente. ' +
              'Use as queries manuais sugeridas ou cadastre os clientes na aba Manual.',
          });
        }

        // Marca duplicados (por nome OU por interseção de domínio)
        const sugeridos = descoberta.clientes.map(c => {
          const dominiosNorm = normalizarDominios(c.dominios);
          const jaCadastrado =
            nomesExistentes.has(c.nome.toLowerCase().trim()) ||
            dominiosNorm.some(d => dominiosExistentes.has(d));
          return {
            nome: c.nome,
            dominios: dominiosNorm,
            fonte: c.fonte || 'gemini',
            ja_cadastrado: jaCadastrado,
          };
        });

        return res.status(200).json({
          success: true,
          sem_resultados: false,
          clientes_sugeridos: sugeridos,
          total_descobertos: sugeridos.length,
          total_novos: sugeridos.filter(s => !s.ja_cadastrado).length,
        });
      }

      return res.status(400).json({ success: false, error: `POST action desconhecida: ${action}` });
    }

    // ════════════════════════════════════════════════════════════
    // PATCH
    // ════════════════════════════════════════════════════════════
    if (req.method === 'PATCH') {
      const body = req.body || {};

      // ── ATUALIZAR CONCORRENTE (whitelist) ────────────────────
      if (action === 'atualizar_concorrente') {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        const campos: Record<string, any> = {};
        for (const k of CAMPOS_CONCORRENTE) {
          if (body[k] !== undefined) campos[k] = body[k];
        }
        if (campos.dominio !== undefined) campos.dominio = normalizarDominio(campos.dominio);
        if (Object.keys(campos).length === 0) {
          return res.status(400).json({ success: false, error: 'Nenhum campo editável informado' });
        }
        campos.atualizado_em = new Date().toISOString();

        const { data, error } = await supabase
          .from('espionagem_concorrentes')
          .update(campos)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;

        return res.status(200).json({ success: true, concorrente: data });
      }

      // ── ATUALIZAR CLIENTE (whitelist; ativo=false = remoção lógica) ──
      if (action === 'atualizar_cliente') {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        const campos: Record<string, any> = {};
        for (const k of CAMPOS_CLIENTE) {
          if (body[k] !== undefined) campos[k] = body[k];
        }
        if (campos.dominios !== undefined) campos.dominios = normalizarDominios(campos.dominios);
        if (Object.keys(campos).length === 0) {
          return res.status(400).json({ success: false, error: 'Nenhum campo editável informado' });
        }

        const { data, error } = await supabase
          .from('espionagem_concorrente_clientes')
          .update(campos)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;

        return res.status(200).json({ success: true, cliente: data });
      }

      return res.status(400).json({ success: false, error: `PATCH action desconhecida: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err: any) {
    console.error('[crm-espionagem] Erro:', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro interno' });
  }
}

// ════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════

async function resolverAtor(email?: string) {
  if (!email) return null;
  const { data } = await supabase
    .from('app_users')
    .select('id, nome_usuario, email_usuario, tipo_usuario')
    .eq('email_usuario', email)
    .maybeSingle();
  return data ?? null;
}

/** Normaliza 1 domínio: minúsculas, sem protocolo/www/path. */
function normalizarDominio(d: unknown): string | null {
  if (!d) return null;
  let s = String(d).toLowerCase().trim();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0].trim();
  return s || null;
}

/** Normaliza lista de domínios: limpa, deduplica, remove vazios. */
function normalizarDominios(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const limpos = arr
    .map(normalizarDominio)
    .filter((d): d is string => !!d);
  return Array.from(new Set(limpos));
}

// ════════════════════════════════════════════════════════════════════════
// DESCOBERTA GEMINI (🆕 v1.1 — Sessão 3)
// Padrões de prospect-gemini-search.ts v2.3: gemini-2.5-flash + Search
// Grounding, thinkingBudget 4096, extração via candidates[0].content.parts,
// parser de JSON balanceado, prompt estilo v1.6 (sem proibições excessivas).
// ════════════════════════════════════════════════════════════════════════

interface ClienteDescoberto {
  nome: string;
  dominios: string[];
  fonte: string;
}

async function descobrirClientesGemini(
  nomeConcorrente: string,
  websiteConcorrente: string
): Promise<{
  clientes: ClienteDescoberto[];
  sem_resultados: boolean;
  queries_manuais: string[];
}> {
  const ai = getAI();

  const siteLimpo = (websiteConcorrente || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  const prompt = `
Você é um analista de inteligência competitiva B2B no Brasil. Use o Google Search para descobrir as EMPRESAS-CLIENTE da consultoria "${nomeConcorrente}"${siteLimpo ? ` (site: ${siteLimpo})` : ''}.

EXECUTE ATÉ 5 BUSCAS DISTINTAS (pare ao esgotar as fontes):

1. site:${siteLimpo || nomeConcorrente.toLowerCase().replace(/\s+/g, '')} clientes OR cases OR parceiros
2. "${nomeConcorrente}" clientes cases sucesso
3. "${nomeConcorrente}" projeto cliente case tecnologia
4. "${nomeConcorrente}" parceria contrato empresa
5. "${nomeConcorrente}" atende empresas alocação consultoria

REGRAS:
- Liste apenas EMPRESAS que são CLIENTES da consultoria (quem contrata os serviços dela)
- Não liste fornecedores, parceiros de tecnologia (ex.: Microsoft, AWS como vendors) nem a própria consultoria
- Para cada cliente, tente identificar o domínio corporativo brasileiro (ex.: empresa.com.br); se não souber, deixe null
- Informe a fonte onde encontrou (ex.: "site/cases", "site/clientes", "notícia")
- Retorne o que encontrar, mesmo que sejam poucas empresas
- Não invente empresas nem domínios

Responda SOMENTE JSON sem markdown:
{"clientes":[{"nome":"string","dominio":"string ou null","fonte":"string"}]}
`.trim();

  console.log(`🕵️ [Espionagem/Gemini] Descobrindo carteira de: ${nomeConcorrente} (${siteLimpo || 'sem site'})`);

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3,
      maxOutputTokens: 16000,
      thinkingConfig: { thinkingBudget: 4096 },
    } as any,
  });

  // Extração robusta (BUG 4 fix herdado): candidates → fallback result.text
  let rawText = '';
  try {
    const candidates = (result as any).candidates;
    if (candidates?.[0]?.content?.parts) {
      rawText = candidates[0].content.parts
        .filter((p: any) => p.text && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('');
    }
    if (!rawText && result.text) rawText = result.text;
  } catch {
    rawText = result.text || '';
  }

  console.log(`📦 [Espionagem/Gemini] Resposta raw (${rawText.length} chars)`);

  const queriesManuais = [
    `site:${siteLimpo || '<site-do-concorrente>'} clientes OR cases`,
    `"${nomeConcorrente}" clientes cases sucesso`,
    `"${nomeConcorrente}" projeto cliente empresa`,
  ];

  if (rawText.length === 0) {
    console.warn('⚠️ [Espionagem/Gemini] Resposta vazia — sem dados públicos');
    return { clientes: [], sem_resultados: true, queries_manuais: queriesManuais };
  }

  const cleanText = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const jsonStr = extrairPrimeiroJSON(cleanText);
  if (!jsonStr) {
    console.warn('⚠️ [Espionagem/Gemini] Nenhum JSON na resposta');
    return { clientes: [], sem_resultados: true, queries_manuais: queriesManuais };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('❌ [Espionagem/Gemini] Falha no parse:', e);
    return { clientes: [], sem_resultados: true, queries_manuais: queriesManuais };
  }

  const clientes: ClienteDescoberto[] = (Array.isArray(parsed?.clientes) ? parsed.clientes : [])
    .map((c: any) => ({
      nome: (c?.nome || '').toString().trim(),
      dominios: c?.dominio ? [String(c.dominio)] : [],
      fonte: (c?.fonte || 'gemini').toString().trim(),
    }))
    .filter((c: ClienteDescoberto) => c.nome.length >= 2);

  console.log(`✅ [Espionagem/Gemini] ${clientes.length} clientes descobertos`);
  return { clientes, sem_resultados: clientes.length === 0, queries_manuais: queriesManuais };
}

/**
 * Extrai o PRIMEIRO objeto JSON balanceado do texto (herdado do fix v2.3
 * do prospect-gemini-search.ts — evita "Unexpected non-whitespace character"
 * quando o Gemini retorna múltiplos blocos concatenados).
 */
function extrairPrimeiroJSON(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
