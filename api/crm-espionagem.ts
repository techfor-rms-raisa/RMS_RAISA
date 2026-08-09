/**
 * api/crm-espionagem.ts — Endpoint do módulo Espionagem Estratégica
 *
 * Caminho: api/crm-espionagem.ts
 * Versão: 2.1 (Sessão 6 — 09/08/2026)
 *
 * v2.1 (09/08/2026 — Sessão 6): VISÃO CLIENTE × CONCORRENTES (operação inversa)
 *  - 🔄 GET action `listar_empresas`: empresas canônicas com nº de
 *    concorrentes ativos (seletor da aba Visão Cliente). RPC
 *    `espionagem_listar_empresas` (RETURNS jsonb).
 *  - 🔄 GET action `analisar_empresa`: métricas canônicas de UMA empresa
 *    (mesmo motor v4: dominio_map + equi-joins + siglas \y) + mapa dos
 *    concorrentes que a possuem na carteira. RPC
 *    `espionagem_analisar_empresa`. 100% interno — sem Gemini.
 *  - Requer migração 2026-08-09_espionagem_visao_cliente.sql.
 *  - (UI) Edição/arquivamento de concorrente usa a action já existente
 *    `atualizar_concorrente` — nenhuma mudança de backend necessária.
 *
 * v2.0 (09/08/2026 — Sessão 5): EMPRESA CANÔNICA (caso CVC)
 *  - 🏛️ Causa raiz corrigida: a mesma empresa-cliente cadastrada em 2+
 *    concorrentes tinha dominios/chave_busca divergentes → números
 *    incongruentes entre concorrentes. Agora `espionagem_empresas` é a
 *    fonte única de verdade; o vínculo (espionagem_concorrente_clientes)
 *    referencia empresa_id.
 *  - `adicionar_clientes`: faz upsert na empresa canônica (merge/UNION de
 *    domínios) e cria/reativa apenas o VÍNCULO com o concorrente. Adota
 *    vínculos legados sem empresa_id quando encontrados.
 *  - `detalhe_concorrente` / `descobrir_clientes`: leem nome/dominios/
 *    chave_busca da empresa canônica (embed) e devolvem ACHATADO no mesmo
 *    shape de sempre — frontend intacto.
 *  - `atualizar_cliente`: `ativo` atualiza o vínculo; nome/dominios/
 *    chave_busca atualizam a EMPRESA CANÔNICA (propaga a todos os
 *    concorrentes que a compartilham).
 *  - Requer migração 2026-08-09_espionagem_empresa_canonica.sql (RPC v3).
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
 *  GET   ?action=listar_empresas&ator_email=X                              (🆕 v2.1)
 *  GET   ?action=analisar_empresa&empresa_id=X&ator_email=X                (🆕 v2.1)
 *  POST  action=criar_concorrente        { nome, website?, dominio?, ator_email }
 *  POST  action=adicionar_clientes       { concorrente_id, clientes: [{nome, dominios[], chave_busca?, origem_descoberta?}], ator_email }
 *  POST  action=executar_analise         { concorrente_id, ator_email }
 *  POST  action=descobrir_clientes       { concorrente_id, ator_email }
 *  PATCH action=atualizar_concorrente    { id, campos..., ator_email }
 *  PATCH action=atualizar_cliente        { id, campos..., ator_email }
 *
 * Tabelas: espionagem_concorrentes, espionagem_concorrente_clientes,
 *          espionagem_empresas (🆕 v2.0), espionagem_analises
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
// v2.0: campos do VÍNCULO vs campos da EMPRESA CANÔNICA
const CAMPOS_VINCULO_CLIENTE = ['ativo'];
const CAMPOS_EMPRESA_CLIENTE = ['nome', 'dominios', 'chave_busca'];

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
      // v2.0: nome/dominios/chave_busca vêm da EMPRESA CANÔNICA (embed),
      // achatados no mesmo shape que o frontend já consome.
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
          .select('id, concorrente_id, empresa_id, nome, dominios, chave_busca, origem_descoberta, descoberto_em, ativo, criado_por, espionagem_empresas(nome, dominios, chave_busca)')
          .eq('concorrente_id', id)
          .eq('ativo', true);
        if (errCli) throw errCli;

        const clientesFlat = (clientes || [])
          .map((c: any) => achatarCliente(c))
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'));

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
          clientes: clientesFlat,
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

      // ── LISTAR EMPRESAS CANÔNICAS (🆕 v2.1 — seletor Visão Cliente) ──
      if (action === 'listar_empresas') {
        const { data, error } = await supabase.rpc('espionagem_listar_empresas');
        if (error) throw error;
        return res.status(200).json({ success: true, empresas: data || [] });
      }

      // ── ANALISAR EMPRESA (🆕 v2.1 — motor inverso Cliente × Concorrentes) ──
      if (action === 'analisar_empresa') {
        const { empresa_id } = req.query as Record<string, string>;
        if (!empresa_id) {
          return res.status(400).json({ success: false, error: 'empresa_id é obrigatório' });
        }

        const { data: resultado, error: errRpc } = await supabase
          .rpc('espionagem_analisar_empresa', { p_empresa_id: Number(empresa_id) });
        if (errRpc) throw errRpc;
        if (!resultado || !resultado.empresa) {
          return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
        }

        return res.status(200).json({ success: true, resultado });
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

      // ── ADICIONAR CLIENTES (lote) — v2.0 Empresa Canônica ────
      // 1. Upsert na empresa canônica (merge/UNION de domínios entre
      //    TODOS os concorrentes que a compartilham).
      // 2. Cria/reativa apenas o VÍNCULO concorrente ↔ empresa.
      // 3. Adota vínculos legados (sem empresa_id) quando existirem.
      if (action === 'adicionar_clientes') {
        const { concorrente_id, clientes } = body;
        if (!concorrente_id || !Array.isArray(clientes) || clientes.length === 0) {
          return res.status(400).json({ success: false, error: 'concorrente_id e clientes[] são obrigatórios' });
        }

        const resultado = { inseridos: 0, mesclados: 0, ignorados: 0 };

        for (const c of clientes) {
          const nome = (c.nome || '').toString().trim();
          if (!nome) { resultado.ignorados++; continue; }

          const dominios = normalizarDominios(c.dominios);
          const chaveBusca = (c.chave_busca || '').toString().trim() || null;

          // 1. Empresa canônica (fonte única de verdade)
          const empresa = await upsertEmpresaCanonica(nome, dominios, chaveBusca, ator.email_usuario);

          // 2. Vínculo por (concorrente_id, empresa_id)
          const { data: vinculo, error: errV } = await supabase
            .from('espionagem_concorrente_clientes')
            .select('id, ativo')
            .eq('concorrente_id', concorrente_id)
            .eq('empresa_id', empresa.id)
            .maybeSingle();
          if (errV) throw errV;

          if (vinculo) {
            if (!vinculo.ativo) {
              const { error: errUp } = await supabase
                .from('espionagem_concorrente_clientes')
                .update({ ativo: true })
                .eq('id', vinculo.id);
              if (errUp) throw errUp;
            }
            resultado.mesclados++;
            continue;
          }

          // 3. Vínculo legado por nome (sem empresa_id) → adota
          const { data: legado, error: errL } = await supabase
            .from('espionagem_concorrente_clientes')
            .select('id')
            .eq('concorrente_id', concorrente_id)
            .is('empresa_id', null)
            .ilike('nome', escapeIlike(nome))
            .maybeSingle();
          if (errL) throw errL;

          if (legado) {
            const { error: errAd } = await supabase
              .from('espionagem_concorrente_clientes')
              .update({ empresa_id: empresa.id, ativo: true })
              .eq('id', legado.id);
            if (errAd) throw errAd;
            resultado.mesclados++;
          } else {
            const { error: errIn } = await supabase
              .from('espionagem_concorrente_clientes')
              .insert({
                concorrente_id,
                empresa_id: empresa.id,
                nome, // legado mantido preenchido (índice ux por nome + fallback RPC)
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

      // ── DESCOBRIR CLIENTES VIA GEMINI (v1.1 — Sessão 3) ──────
      // Varre fontes públicas (site do concorrente, cases, notícias)
      // e retorna a carteira SUGERIDA. Nada é gravado aqui — o frontend
      // exibe checkboxes e grava via `adicionar_clientes`.
      // v2.0: nomes/domínios da carteira existente lidos da empresa canônica.
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
          .select('nome, dominios, ativo, espionagem_empresas(nome, dominios)')
          .eq('concorrente_id', concorrente_id);
        if (errEx) throw errEx;

        const existentesFlat = (existentes || []).map((e: any) => {
          const emp = Array.isArray(e.espionagem_empresas)
            ? e.espionagem_empresas[0]
            : e.espionagem_empresas;
          return {
            nome: (emp?.nome ?? e.nome ?? '') as string,
            dominios: (emp?.dominios ?? e.dominios ?? []) as string[],
          };
        });

        const nomesExistentes = new Set(
          existentesFlat.map(e => e.nome.toLowerCase().trim())
        );
        const dominiosExistentes = new Set(
          existentesFlat.flatMap(e => (e.dominios || []).map((d: string) => d.toLowerCase()))
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

      // ── ATUALIZAR CLIENTE — v2.0 Empresa Canônica ────────────
      // `ativo` → VÍNCULO (remoção lógica só neste concorrente).
      // `nome`/`dominios`/`chave_busca` → EMPRESA CANÔNICA (propaga a
      // TODOS os concorrentes que compartilham a empresa).
      if (action === 'atualizar_cliente') {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório' });

        const camposVinculo: Record<string, any> = {};
        for (const k of CAMPOS_VINCULO_CLIENTE) {
          if (body[k] !== undefined) camposVinculo[k] = body[k];
        }
        const camposEmpresa: Record<string, any> = {};
        for (const k of CAMPOS_EMPRESA_CLIENTE) {
          if (body[k] !== undefined) camposEmpresa[k] = body[k];
        }
        if (camposEmpresa.dominios !== undefined) {
          camposEmpresa.dominios = normalizarDominios(camposEmpresa.dominios);
        }
        if (Object.keys(camposVinculo).length === 0 && Object.keys(camposEmpresa).length === 0) {
          return res.status(400).json({ success: false, error: 'Nenhum campo editável informado' });
        }

        // Resolve o vínculo
        const { data: vinculo, error: errV } = await supabase
          .from('espionagem_concorrente_clientes')
          .select('id, empresa_id, nome, dominios, chave_busca')
          .eq('id', id)
          .maybeSingle();
        if (errV) throw errV;
        if (!vinculo) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

        // Campos da empresa: garante empresa canônica (adota legado se preciso)
        if (Object.keys(camposEmpresa).length > 0) {
          let empresaId = vinculo.empresa_id;
          if (!empresaId) {
            const empresa = await upsertEmpresaCanonica(
              vinculo.nome,
              normalizarDominios(vinculo.dominios),
              (vinculo.chave_busca || '').toString().trim() || null,
              ator.email_usuario
            );
            empresaId = empresa.id;
            const { error: errAd } = await supabase
              .from('espionagem_concorrente_clientes')
              .update({ empresa_id: empresaId })
              .eq('id', vinculo.id);
            if (errAd) throw errAd;
          }
          camposEmpresa.atualizado_em = new Date().toISOString();
          const { error: errE } = await supabase
            .from('espionagem_empresas')
            .update(camposEmpresa)
            .eq('id', empresaId);
          if (errE) throw errE;
        }

        // Campos do vínculo
        if (Object.keys(camposVinculo).length > 0) {
          const { error: errU } = await supabase
            .from('espionagem_concorrente_clientes')
            .update(camposVinculo)
            .eq('id', vinculo.id);
          if (errU) throw errU;
        }

        // Retorna o cliente achatado (mesmo shape do detalhe)
        const { data: atualizado, error: errF } = await supabase
          .from('espionagem_concorrente_clientes')
          .select('id, concorrente_id, empresa_id, nome, dominios, chave_busca, origem_descoberta, descoberto_em, ativo, criado_por, espionagem_empresas(nome, dominios, chave_busca)')
          .eq('id', vinculo.id)
          .single();
        if (errF) throw errF;

        return res.status(200).json({ success: true, cliente: achatarCliente(atualizado) });
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

/** Escapa curingas do ILIKE (% e _) para igualdade case-insensitive. */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, ch => '\\' + ch);
}

/**
 * Achata o vínculo + embed da empresa canônica no shape que o frontend
 * já consome (ClienteCarteira): nome/dominios/chave_busca priorizam a
 * empresa canônica; fallback para os campos legados do vínculo.
 */
function achatarCliente(c: any) {
  const emp = Array.isArray(c.espionagem_empresas)
    ? c.espionagem_empresas[0]
    : c.espionagem_empresas;
  return {
    id: c.id,
    concorrente_id: c.concorrente_id,
    empresa_id: c.empresa_id ?? null,
    nome: emp?.nome ?? c.nome,
    dominios: emp?.dominios ?? c.dominios ?? [],
    chave_busca: emp?.chave_busca ?? c.chave_busca ?? null,
    origem_descoberta: c.origem_descoberta,
    descoberto_em: c.descoberto_em,
    ativo: c.ativo,
    criado_por: c.criado_por,
  };
}

/**
 * 🏛️ v2.0 — Upsert da EMPRESA CANÔNICA (fonte única de verdade).
 * - Busca por nome (case-insensitive, curingas escapados).
 * - Se existe: UNION dos domínios; preenche chave_busca apenas se vazia.
 * - Se não existe: insere. Corrida 23505 (índice único lower(nome))
 *   resolvida com re-fetch.
 */
async function upsertEmpresaCanonica(
  nome: string,
  dominios: string[],
  chaveBusca: string | null,
  atorEmail: string
): Promise<{ id: number; nome: string; dominios: string[]; chave_busca: string | null }> {
  const buscar = async () => {
    const { data, error } = await supabase
      .from('espionagem_empresas')
      .select('id, nome, dominios, chave_busca')
      .ilike('nome', escapeIlike(nome))
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const existente = await buscar();

  if (existente) {
    const atuais: string[] = existente.dominios || [];
    const uniao = Array.from(new Set([...atuais, ...dominios]));
    const campos: Record<string, any> = {};
    if (uniao.length !== atuais.length) campos.dominios = uniao;
    if (chaveBusca && !existente.chave_busca) campos.chave_busca = chaveBusca;

    if (Object.keys(campos).length > 0) {
      campos.atualizado_em = new Date().toISOString();
      const { error: errUp } = await supabase
        .from('espionagem_empresas')
        .update(campos)
        .eq('id', existente.id);
      if (errUp) throw errUp;
    }
    return {
      id: existente.id,
      nome: existente.nome,
      dominios: campos.dominios ?? atuais,
      chave_busca: campos.chave_busca ?? existente.chave_busca ?? null,
    };
  }

  const { data: nova, error: errIn } = await supabase
    .from('espionagem_empresas')
    .insert({ nome, dominios, chave_busca: chaveBusca, criado_por: atorEmail })
    .select('id, nome, dominios, chave_busca')
    .single();

  if (errIn) {
    if (errIn.code === '23505') {
      // Corrida: outro request criou a empresa entre o SELECT e o INSERT
      const criada = await buscar();
      if (criada) {
        return upsertEmpresaCanonica(nome, dominios, chaveBusca, atorEmail);
      }
    }
    throw errIn;
  }
  return nova!;
}

// ════════════════════════════════════════════════════════════════════════
// DESCOBERTA GEMINI (v1.1 — Sessão 3)
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
