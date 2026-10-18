/**
 * lib/prospect-vagas/vagas-persistencia.ts
 *
 * Camada de banco do módulo Vagas Publicadas (Supabase, service_role).
 *
 *   buscarVagas()      cache 24h → (raspa + upsert) → consulta filtrada →
 *                      cruzamento de território via RPC → log da busca
 *   salvarEmpresa()    "Salvar p/ prospectar": revalida território no servidor
 *                      (defesa em profundidade), espelha em email_empresas
 *                      (reservado_por = analista) e grava em
 *                      prospect_vagas_empresas_salvas
 *   listarSalvas()     empresas salvas do analista (Admin vê todas)
 *
 * Pré-requisito SQL: 2026-10-18_vagas_publicadas_02_schema.sql aplicado.
 *
 * Regras do projeto respeitadas:
 *   • Supabase JS trunca em 1000 linhas silenciosamente → .range() explícito
 *     e o cruzamento usa RPC RETURNS jsonb (1 roundtrip).
 *   • Bloqueio de território devolve `success:false` com dados estruturados
 *     (o endpoint responde HTTP 200 — padrão useCrmApi.parseResponse).
 *   • Nenhum dado pessoal gravado (LGPD).
 *
 * Versão: 1.0 — 18/10/2026
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  FiltrosBusca, MatchEmpresa, ResultadoBusca, SaudeFonte, StatusTerritorio, VagaComMatch, VagaNormalizada,
} from './vagas-types.js';
import { rasparTodasFontes, FONTES_DISPONIVEIS } from './vagas-orquestrador.js';
import { diasDesde, normalizarNomeEmpresa } from './vagas-normalizar.js';
import { resolverDominio } from '../resolve-dominio.js';

const CACHE_HORAS = 24;
const DIAS_ENVELHECENDO = 30;
const LIMITE_LINHAS = 1000;
const LOTE_UPSERT = 200;

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(
      (process.env.SUPABASE_URL || '').trim(),
      (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    );
  }
  return _sb;
}

export interface UsuarioAtual {
  id:           number;
  nome_usuario: string;
  tipo_usuario: string;
}

export const PERFIS_PERMITIDOS = ['Administrador', 'Gestão Comercial', 'SDR'];

export async function carregarUsuario(userId: number): Promise<UsuarioAtual | null> {
  const { data, error } = await sb()
    .from('app_users')
    .select('id, nome_usuario, tipo_usuario')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as UsuarioAtual;
}

const isAdmin = (u: UsuarioAtual) => u.tipo_usuario === 'Administrador';

// ─── CACHE ──────────────────────────────────────────────────────────────────

/** Já houve uma raspagem equivalente nas últimas 24h? (qualquer analista) */
async function cacheQuente(f: FiltrosBusca): Promise<{ hit: boolean; capturado_em: string | null; saude: SaudeFonte[] }> {
  const desde = new Date(Date.now() - CACHE_HORAS * 3_600_000).toISOString();
  const { data } = await sb()
    .from('prospect_vagas_busca_log')
    .select('criado_em, areas, fontes, keyword_extra, resultados_por_fonte')
    .gte('criado_em', desde)
    .eq('cache_hit', false)
    .order('criado_em', { ascending: false })
    .range(0, 49);

  const kw = (f.keyword_extra || '').toLowerCase();
  const fontesPedidas = f.fontes.length ? f.fontes : FONTES_DISPONIVEIS;

  for (const row of data || []) {
    // cache serve se a raspagem anterior COBRE as áreas/fontes pedidas (superset) e tem a mesma keyword extra
    const cobreAreas  = f.areas.every(a => (row.areas as string[]).includes(a));
    const cobreFontes = fontesPedidas.every(x => (row.fontes as string[]).includes(x));
    const mesmaKw     = (row.keyword_extra || '').toLowerCase() === kw;
    if (cobreAreas && cobreFontes && mesmaKw) {
      const saude = Object.entries(row.resultados_por_fonte || {}).map(([fonte, v]: [string, any]) => ({
        fonte: fonte as any, ok: !!v.ok, qtd: v.qtd ?? 0, ms: v.ms ?? 0, requests: v.requests ?? 0, erro: v.erro ?? undefined, degradada: !!v.degradada,
      }));
      return { hit: true, capturado_em: row.criado_em, saude };
    }
  }
  return { hit: false, capturado_em: null, saude: [] };
}

// ─── UPSERT ─────────────────────────────────────────────────────────────────

async function upsertVagas(vagas: VagaNormalizada[]): Promise<void> {
  const agora = new Date().toISOString();
  for (let i = 0; i < vagas.length; i += LOTE_UPSERT) {
    const lote = vagas.slice(i, i + LOTE_UPSERT).map(v => ({ ...v, ultima_captura_em: agora, ativa: true }));
    // capturado_em NÃO vai no payload → preservado na 1ª inserção (DEFAULT now())
    const { error } = await sb()
      .from('prospect_vagas')
      .upsert(lote, { onConflict: 'fonte,fonte_vaga_id', ignoreDuplicates: false });
    if (error) {
      console.error('❌ [vagas-persistencia] upsert lote falhou:', error.message);
      throw new Error(`Falha ao gravar vagas: ${error.message}`);
    }
  }
}

// ─── CONSULTA FILTRADA ──────────────────────────────────────────────────────

async function consultarVagas(f: FiltrosBusca, desdeISO: string): Promise<any[]> {
  let q = sb()
    .from('prospect_vagas')
    .select('*')
    .in('area', f.areas)
    .gte('ultima_captura_em', desdeISO)
    .eq('ativa', true);

  if (f.fontes.length)   q = q.in('fonte', f.fontes);
  if (f.keyword_extra)   q = q.ilike('titulo', `%${f.keyword_extra}%`);
  if (f.modalidade)      q = q.eq('modalidade', f.modalidade);
  if (f.uf)              q = q.or(`uf.eq.${f.uf},modalidade.eq.remoto`);   // UF escolhida + remotas
  if (f.periodo_dias) {
    const limite = new Date(Date.now() - f.periodo_dias * 86_400_000).toISOString().slice(0, 10);
    // mantém publicado_em NULL (Programathor não informa data)
    q = q.or(`publicado_em.gte.${limite},publicado_em.is.null`);
  }

  const { data, error } = await q
    .order('publicado_em', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(0, LIMITE_LINHAS - 1);
  if (error) throw new Error(`Consulta prospect_vagas: ${error.message}`);
  return data || [];
}

// ─── CRUZAMENTO DE TERRITÓRIO ───────────────────────────────────────────────

interface RpcItem {
  idx: number;
  empresa: { id: number; nome: string; dominio: string | null; reservado_por: number | null; reservado_por_nome: string | null; total_leads: number; score: number; match_por: 'dominio' | 'nome' } | null;
  donos_leads:     Array<{ user_id: number; nome_usuario: string; qtd: number }>;
  donos_prospects: Array<{ user_id: number; nome_usuario: string; qtd: number }>;
  salva: { id: number; salvo_por: number; salvo_por_nome: string; status: string } | null;
}

function decidirStatus(item: RpcItem | undefined, u: UsuarioAtual): MatchEmpresa {
  const base: MatchEmpresa = {
    status: 'nova', email_empresa_id: null, dono_user_id: null, dono_nome: null,
    detalhe: null, score: null, match_por: null, salva_id: null, pode_salvar: true,
  };
  if (!item) return base;

  const meu = (uid: number | null) => uid != null && uid === u.id;
  const fechar = (status: StatusTerritorio, dono: number | null, nome: string | null, detalhe: string | null): MatchEmpresa => ({
    ...base, status, dono_user_id: dono, dono_nome: nome, detalhe,
    pode_salvar: status === 'nova' || status === 'livre' || (status === 'outro' && isAdmin(u)),
  });

  // 1) já salva nesta tela
  if (item.salva) {
    const s = item.salva;
    const r = fechar(meu(s.salvo_por) ? 'voce' : 'outro', s.salvo_por, s.salvo_por_nome, `salva em Vagas Publicadas · ${s.status}`);
    return { ...r, match_por: 'salva', salva_id: s.id, pode_salvar: false, email_empresa_id: item.empresa?.id ?? null };
  }

  // 2) está em email_empresas
  if (item.empresa) {
    const e = item.empresa;
    const donoEmpresa = e.reservado_por;
    const donoLeads   = item.donos_leads[0] || null;
    const dono        = donoEmpresa ?? donoLeads?.user_id ?? null;
    const donoNome    = donoEmpresa ? e.reservado_por_nome : (donoLeads?.nome_usuario ?? null);
    const detalhe     = `${e.total_leads ?? 0} lead${(e.total_leads ?? 0) === 1 ? '' : 's'} na base` +
                        (e.match_por === 'nome' && e.score < 0.8 ? ` · match provável (${Math.round(e.score * 100)}%)` : '');
    const status: StatusTerritorio = dono == null ? 'livre' : (meu(dono) ? 'voce' : 'outro');
    const r = fechar(status, dono, donoNome, detalhe);
    return { ...r, email_empresa_id: e.id, score: e.score, match_por: e.match_por };
  }

  // 3) só em prospect_leads (interlocutores salvos pelo Prospect Engine)
  if (item.donos_prospects.length) {
    const d = item.donos_prospects[0];
    const r = fechar(meu(d.user_id) ? 'voce' : 'outro', d.user_id, d.nome_usuario, `${d.qtd} prospect${d.qtd === 1 ? '' : 's'} salvo${d.qtd === 1 ? '' : 's'}`);
    return { ...r, match_por: 'prospect' };
  }

  return base;
}

async function cruzarTerritorio(vagas: any[], u: UsuarioAtual): Promise<Map<string, MatchEmpresa>> {
  const mapa = new Map<string, MatchEmpresa>();
  const chaves: string[] = [];
  const itens: Array<{ idx: number; nome: string; dominio: string | null }> = [];

  for (const v of vagas) {
    if (v.confidencial || !v.empresa_nome_norm) continue;
    if (mapa.has(v.empresa_nome_norm)) continue;
    mapa.set(v.empresa_nome_norm, null as any);          // placeholder
    itens.push({ idx: chaves.length, nome: v.empresa_nome, dominio: v.empresa_dominio || null });
    chaves.push(v.empresa_nome_norm);
  }
  if (!itens.length) return mapa;

  const { data, error } = await sb().rpc('rpc_vagas_match_empresas', { p_itens: itens, p_threshold: 0.55 });
  if (error) {
    console.error('❌ [vagas-persistencia] rpc_vagas_match_empresas:', error.message);
    // fail-soft: sem cruzamento, tudo "nova" mas sinaliza no detalhe
    for (const k of chaves) mapa.set(k, { ...decidirStatus(undefined, u), detalhe: 'cruzamento indisponível' });
    return mapa;
  }
  const porIdx = new Map<number, RpcItem>();
  for (const it of (data as RpcItem[]) || []) porIdx.set(it.idx, it);
  chaves.forEach((k, idx) => mapa.set(k, decidirStatus(porIdx.get(idx), u)));
  return mapa;
}

// ─── LOG ────────────────────────────────────────────────────────────────────

async function registrarBusca(f: FiltrosBusca, u: UsuarioAtual, saude: SaudeFonte[], totalVagas: number, totalEmpresas: number, cacheHit: boolean, duracaoMs: number) {
  const resultados: Record<string, any> = {};
  for (const s of saude) resultados[s.fonte] = { ok: s.ok, qtd: s.qtd, ms: s.ms, requests: s.requests, erro: s.erro ?? null, degradada: !!s.degradada };
  const { error } = await sb().from('prospect_vagas_busca_log').insert({
    buscado_por: u.id,
    areas: f.areas,
    keyword_extra: f.keyword_extra,
    uf: f.uf,
    modalidade: f.modalidade,
    periodo_dias: f.periodo_dias,
    fontes: f.fontes.length ? f.fontes : FONTES_DISPONIVEIS,
    resultados_por_fonte: resultados,
    total_vagas: totalVagas,
    total_empresas: totalEmpresas,
    cache_hit: cacheHit,
    duracao_ms: duracaoMs,
  });
  if (error) console.warn('⚠️ [vagas-persistencia] log não gravado:', error.message);
}

// ─── API PÚBLICA DA LIB ─────────────────────────────────────────────────────

export async function buscarVagas(f: FiltrosBusca, u: UsuarioAtual): Promise<ResultadoBusca> {
  const t0 = Date.now();
  let saude: SaudeFonte[] = [];
  let cacheHit = false;
  let capturadoEm = new Date().toISOString();

  const cache = f.forcar ? { hit: false, capturado_em: null, saude: [] as SaudeFonte[] } : await cacheQuente(f);
  if (cache.hit) {
    cacheHit = true;
    saude = cache.saude;
    capturadoEm = cache.capturado_em!;
  } else {
    const r = await rasparTodasFontes(f);
    saude = r.saude;
    if (r.vagas.length) await upsertVagas(r.vagas);
  }

  const desde = new Date(Date.now() - CACHE_HORAS * 3_600_000).toISOString();
  const linhas = await consultarVagas(f, desde);
  const matches = await cruzarTerritorio(linhas, u);

  const empresas = new Set<string>();
  const vagas: VagaComMatch[] = linhas.map(v => {
    const dias = diasDesde(v.publicado_em);
    if (v.empresa_nome_norm) empresas.add(v.empresa_nome_norm);
    const match: MatchEmpresa = v.confidencial || !v.empresa_nome_norm
      ? { status: 'confidencial', email_empresa_id: null, dono_user_id: null, dono_nome: null, detalhe: null, score: null, match_por: null, salva_id: null, pode_salvar: false }
      : (matches.get(v.empresa_nome_norm) ?? decidirStatus(undefined, u));
    return { ...v, dias_publicada: dias, envelhecendo: dias != null && dias >= DIAS_ENVELHECENDO, match };
  });

  const duracao = Date.now() - t0;
  await registrarBusca(f, u, saude, vagas.length, empresas.size, cacheHit, duracao);

  return { vagas, total_vagas: vagas.length, total_empresas: empresas.size, saude, cache_hit: cacheHit, capturado_em: capturadoEm, duracao_ms: duracao };
}

// ─── SALVAR EMPRESA ─────────────────────────────────────────────────────────

export interface SalvarEmpresaInput {
  vaga_id:          number | null;
  empresa_nome:     string;
  empresa_dominio:  string | null;
  empresa_url:      string | null;
  observacao:       string | null;
  resolver_dominio: boolean;     // true → tenta lib/resolve-dominio (Gemini) quando sem domínio
}

export type SalvarEmpresaResultado =
  | { success: true;  salva_id: number; email_empresa_id: number; empresa_dominio: string | null; vinculou_existente: boolean }
  | { success: false; motivo: 'territorio' | 'ja_salva' | 'invalido' | 'erro'; mensagem: string; dono_nome?: string | null; dono_user_id?: number | null };

export async function salvarEmpresa(inp: SalvarEmpresaInput, u: UsuarioAtual): Promise<SalvarEmpresaResultado> {
  const nome = (inp.empresa_nome || '').trim();
  const norm = normalizarNomeEmpresa(nome);
  if (!norm) return { success: false, motivo: 'invalido', mensagem: 'Nome de empresa inválido.' };

  // 1) revalida território no servidor (nunca confiar só no badge da UI)
  const { data: rpc, error: errRpc } = await sb().rpc('rpc_vagas_match_empresas', {
    p_itens: [{ idx: 0, nome, dominio: inp.empresa_dominio || null }], p_threshold: 0.55,
  });
  if (errRpc) return { success: false, motivo: 'erro', mensagem: `Cruzamento falhou: ${errRpc.message}` };
  const item = ((rpc as RpcItem[]) || [])[0];
  const match = decidirStatus(item, u);

  if (match.match_por === 'salva') {
    return { success: false, motivo: 'ja_salva', mensagem: `${nome} já foi salva por ${match.dono_nome ?? 'outro analista'}.`, dono_nome: match.dono_nome, dono_user_id: match.dono_user_id };
  }
  if (!match.pode_salvar) {
    return { success: false, motivo: 'territorio', mensagem: `${nome} está no território de ${match.dono_nome ?? 'outro analista'}.`, dono_nome: match.dono_nome, dono_user_id: match.dono_user_id };
  }

  // 2) domínio: informado → resolver via Gemini (opcional) → null
  let dominio = (inp.empresa_dominio || '').toLowerCase().trim() || null;
  if (!dominio && inp.resolver_dominio) {
    dominio = await resolverDominio(nome);     // fail-soft: null se não achar
  }

  // 3) espelho em email_empresas
  let emailEmpresaId = match.email_empresa_id;
  let vinculouExistente = false;
  const agora = new Date().toISOString();

  if (emailEmpresaId) {
    // empresa já existe (livre ou do próprio analista): reserva se estiver sem dono
    vinculouExistente = true;
    if (match.status === 'livre') {
      const { error } = await sb().from('email_empresas')
        .update({ reservado_por: u.id, reservado_em: agora, atualizado_em: agora, ...(dominio ? { dominio } : {}) })
        .eq('id', emailEmpresaId)
        .is('reservado_por', null);                 // guarda contra corrida: só reserva se ainda livre
      if (error) return { success: false, motivo: 'erro', mensagem: `Reserva falhou: ${error.message}` };
    }
  } else {
    const { data, error } = await sb().from('email_empresas')
      .insert({
        nome, dominio, website: dominio ? `https://${dominio}` : null,
        linkedin_url: inp.empresa_url && /linkedin\.com/i.test(inp.empresa_url) ? inp.empresa_url : null,
        origem: 'vagas_publicadas',
        observacoes: inp.observacao || null,
        criado_por: u.nome_usuario,
        reservado_por: u.id, reservado_em: agora,
      })
      .select('id')
      .single();
    if (error) {
      // 23505 = unique violation (provável UNIQUE em dominio) → vincula a existente pelo domínio
      if (error.code === '23505' && dominio) {
        const { data: ex } = await sb().from('email_empresas').select('id, reservado_por').eq('dominio', dominio).maybeSingle();
        if (ex && (ex.reservado_por == null || ex.reservado_por === u.id || isAdmin(u))) {
          emailEmpresaId = ex.id; vinculouExistente = true;
          if (ex.reservado_por == null) {
            await sb().from('email_empresas').update({ reservado_por: u.id, reservado_em: agora }).eq('id', ex.id);
          }
        } else {
          return { success: false, motivo: 'territorio', mensagem: `Já existe empresa com o domínio ${dominio} reservada por outro analista.` };
        }
      } else {
        return { success: false, motivo: 'erro', mensagem: `Criar empresa falhou: ${error.message}` };
      }
    } else {
      emailEmpresaId = data.id;
    }
  }

  // 4) registro da tela
  const { data: salva, error: errSalva } = await sb().from('prospect_vagas_empresas_salvas')
    .insert({
      empresa_nome: nome, empresa_nome_norm: norm, empresa_dominio: dominio, empresa_url: inp.empresa_url || null,
      email_empresa_id: emailEmpresaId, vaga_origem_id: inp.vaga_id, salvo_por: u.id, observacao: inp.observacao || null,
    })
    .select('id')
    .single();
  if (errSalva) {
    if (errSalva.code === '23505') return { success: false, motivo: 'ja_salva', mensagem: `${nome} acabou de ser salva por outro analista.` };
    return { success: false, motivo: 'erro', mensagem: `Gravar empresa salva falhou: ${errSalva.message}` };
  }

  // 5) carimba o domínio nas vagas desta empresa (ajuda matches futuros por domínio)
  if (dominio) {
    await sb().from('prospect_vagas').update({ empresa_dominio: dominio }).eq('empresa_nome_norm', norm).is('empresa_dominio', null);
  }

  console.log(`✅ [vagas-persistencia] ${u.nome_usuario} salvou "${nome}" (email_empresas#${emailEmpresaId}, salva#${salva.id})`);
  return { success: true, salva_id: salva.id, email_empresa_id: emailEmpresaId!, empresa_dominio: dominio, vinculou_existente: vinculouExistente };
}

// ─── LISTAR SALVAS ──────────────────────────────────────────────────────────

export async function listarSalvas(u: UsuarioAtual): Promise<any[]> {
  let q = sb().from('prospect_vagas_empresas_salvas')
    .select(`
      id, empresa_nome, empresa_dominio, empresa_url, email_empresa_id, vaga_origem_id,
      salvo_por, salvo_em, observacao, status,
      salvo_por_user:app_users!prospect_vagas_empresas_salvas_salvo_por_fkey(id, nome_usuario),
      vaga:prospect_vagas!prospect_vagas_empresas_salvas_vaga_origem_id_fkey(titulo, fonte, vaga_url, publicado_em)
    `)
    .order('salvo_em', { ascending: false })
    .range(0, LIMITE_LINHAS - 1);
  if (!isAdmin(u)) q = q.eq('salvo_por', u.id);
  const { data, error } = await q;
  if (error) throw new Error(`Listar salvas: ${error.message}`);
  return (data || []).map((r: any) => ({ ...r, salvo_por_nome: r.salvo_por_user?.nome_usuario ?? null }));
}

export async function atualizarStatusSalva(id: number, status: 'salva' | 'prospectando' | 'descartada', u: UsuarioAtual): Promise<boolean> {
  let q = sb().from('prospect_vagas_empresas_salvas').update({ status }).eq('id', id);
  if (!isAdmin(u)) q = q.eq('salvo_por', u.id);
  const { data, error } = await q.select('id');
  return !error && (data?.length ?? 0) > 0;
}
