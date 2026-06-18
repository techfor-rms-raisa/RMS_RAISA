/**
 * api/prospect-revalidate.ts — Orquestrador da Revalidação de Leads Importados
 *
 * v1.4 (18/06/2026 — Sub-fase 3.D refino: Anti-duplicidade no INSERT preventivo)
 *   Quando o body chega com `lead.criar_se_nao_existir === true` E sem
 *   `lead.lead_id`, ANTES de fazer o INSERT em `prospect_leads`, agora
 *   verificamos o email contra 3 fontes em paralelo (Promise.all):
 *     - `email_optout.email`    → opt-out LGPD (prioridade máxima)
 *     - `email_leads.email`     → lead ativo no CRM
 *     - `prospect_leads.email`  → em revalidação/prospecção
 *
 *   Se encontra duplicidade, retorna IMEDIATAMENTE um `ResultadoLead`
 *   com `status_atualizacao` = `'duplicado_em_opt_out'` /
 *   `'duplicado_em_email_leads'` / `'duplicado_em_revalidacao'`,
 *   SEM:
 *     - inserir em `prospect_leads`
 *     - inserir em `prospect_revalidacao_log`  (cota NÃO é consumida)
 *     - rodar cascade (sem créditos Hunter/Apollo/Snov.io/Gemini)
 *
 *   Frontend (ImportarListaLeadsModal v1.1) já bloqueia duplicatas na
 *   pré-visualização via endpoint `verificar_duplicidade`. Esta camada
 *   no `prospect-revalidate` é DEFESA EM PROFUNDIDADE: cobre race
 *   condition (vários usuários importando simultaneamente) e payload
 *   malformado de cliente direto.
 *
 *   Sem alteração de schema. Adiciona 3 novos valores ao type
 *   StatusAtualizacao (que precisam refletir no frontend
 *   `useLeadsImportados.ts` v1.4).
 *
 * v1.3 (18/06/2026 — Sub-fase 3.D refino: Resgate via Snov.io)
 *   Quando o cascade chega em `nao_localizado` por:
 *     - Hunter retornou 'invalid' (email inferido não existe na mailbox);
 *     - Apollo + Gemini não confirmaram emprego (pessoa não localizada
 *       na empresa declarada no CRM);
 *     - MAS o lead tem `empresa_dominio` válido,
 *   a ETAPA 3 agora DISPARA como TENTATIVA DE RESGATE: o endpoint
 *   `prospect-email-finder` tenta achar email do mesmo nome no mesmo
 *   domínio via Snov.io (fallback Apollo). Se retorna email com status
 *   'verified' ou 'probable' (fonte 'snovio' ou 'apollo'), a decisão é
 *   REVERTIDA para 'atualizado' — assumindo que a pessoa continua na
 *   empresa declarada, só o email inferido estava errado.
 *
 *   Motivação: revalidações de leads importados manualmente frequentemente
 *   trazem emails inferidos (`nome.sobrenome@empresa`) que Hunter classifica
 *   como invalid. Sem o resgate, esses leads viravam `nao_localizado`
 *   silenciosamente mesmo quando a empresa existe e Snov.io conseguiria
 *   achar o email correto.
 *
 *   Sem alteração de schema/migration. Reaproveita endpoint
 *   `/api/prospect-email-finder` já em Production.
 *
 * v1.2 (17/06/2026 — Sub-fase 3.D: Auto-promoção + Edição)
 *   Após `persistir()` da Etapa 4, se o resultado atende ao critério
 *   de promoção automática, TRANSFERE o registro de `prospect_leads`
 *   (base transitória) para `email_leads` (CRM). O critério é:
 *     - status_atualizacao === 'atualizado'
 *     - review_manual === false
 *     - lead_id presente (registro existe em prospect_leads)
 *   Promoção é "transferência": INSERT email_lead + DELETE prospect_lead
 *   atômicos no helper `lib/promover-email-lead.ts`. Salvaguardas LGPD
 *   (opt_out) e idempotência (dedup por email) ficam dentro do helper.
 *
 *   O `ResultadoLead` ganha 2 novos campos opcionais:
 *     - promovido_para_email_leads: boolean
 *     - email_lead_id:              number  (quando promovido=true ou já existia)
 *
 *   Caso de falha de promoção (sem_email, opt_out_lgpd, lead_ja_existia,
 *   erro_*): o lead em prospect_leads pode permanecer (opt_out) ou ter
 *   sido removido (lead_ja_existia). O caller decide pela UI se mostrar
 *   warning ou silenciar.
 *
 * v1.1 (17/06/2026 — Sub-fase 3.C: suporte a "Importar Lista de Leads")
 *   Quando o body chega com `lead.criar_se_nao_existir === true` E sem
 *   `lead.lead_id`, o handler INSERE o registro em `prospect_leads` ANTES
 *   de rodar a cascata, com:
 *     - motor = 'importacao_lista' (novo valor — exige migration
 *       2026-06-17_prospect_leads_motor_importacao.sql aplicada)
 *     - reservado_por = lead.reservado_por (do CSV/Excel) ou user_id (fallback)
 *     - vertical = lead.vertical (vem da planilha)
 *     - status = 'novo', permite_revalidacao_externa = true
 *   O `lead_id` resultante é injetado em `leadInput` para que ETAPA 4 faça
 *   UPDATE no mesmo registro com o resultado da cascata (validado_em,
 *   proxima_validacao, status_atualizacao, etc.).
 *   Backwards-compatible: leads SEM a flag continuam tratados como
 *   "lead externo, só registra log" (comportamento v1.0).
 *
 * v1.0 (17/06/2026)
 *
 * Implementa a cascata especificada em RAISA-Revalidacao-Especificacao-Tecnica.docx v1.0,
 * Seções 2, 3 e 4. Backend único — UI (Painel de Revalidação), Cron e endpoint
 * /prospect-purge ficam para sessões futuras (Seção 8.3).
 *
 * ───────────────────────────────────────────────────────────────────────
 * CASCATA (com short-circuit econômico):
 *   ETAPA 0  — Triagem gratuita (MX, TTL, domínio pessoal, opt-out LGPD)
 *   ETAPA 1  — Validar email atual via prospect-validate-emails
 *   ETAPA 2  — Apollo People Match (lib/apollo.ts, agnóstico à env var)
 *   ETAPA 2-B — Fallback Gemini Search Grounding (lib/gemini-confirma-emprego.ts)
 *   ETAPA 3  — Re-busca email via prospect-email-finder (condicional)
 *   ETAPA 4  — UPDATE prospect_leads + INSERT prospect_revalidacao_log
 *
 * MODOS:
 *   - individual : 1 lead síncrono, retorna resumo + detalhe completo
 *   - lote       : até 50 leads sequencial, retorna resumo agregado
 *
 * COTA:
 *   - 50 leads/gestor/dia (apurada em runtime via COUNT em log — sem drift)
 *   - Reset 00:00 horário de Brasília (UTC-3)
 *
 * Caminho: api/prospect-revalidate.ts
 * ───────────────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import dns from 'node:dns/promises';

import { apolloPeopleMatch, type ApolloMatchResult } from '../lib/apollo.js';
import { geminiConfirmaEmprego, type GeminiConfirmaResult } from '../lib/gemini-confirma-emprego.js';
import { compararEmpresas } from '../lib/comparadores.js';
// 🆕 v1.2 (Sub-fase 3.D — 17/06/2026) — Helper de promoção transferência
import { promoverParaEmailLeads } from '../lib/promover-email-lead.js';

export const config = { maxDuration: 60 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ──────────────────────────────────────────────────────────────────────
// CONSTANTES OPERACIONAIS
// ──────────────────────────────────────────────────────────────────────

const PUBLIC_BASE_URL          = process.env.PUBLIC_BASE_URL || '';
const COTA_DIARIA_POR_GESTOR   = 50;
const DELAY_ANTI_RATE_LIMIT_MS = 300;

/**
 * Domínios pessoais (replicado de prospect-resolve-domain.ts) — usado na
 * Etapa 0 para pular a validação de email corporativo e ir direto ao
 * Apollo/Gemini para confirmar emprego.
 */
const DOMINIOS_PESSOAIS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
  'live.com', 'msn.com', 'icloud.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
]);

/** TTL em dias por tier de pipeline (Seção 6.2 da spec). */
const TTL_POR_TIER_DIAS: Record<string, number> = {
  ativo:     30,
  nurturing: 60,
  cold:      180,
};

// ──────────────────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────────────────

interface LeadInput {
  lead_id?:         number;
  nome_completo:    string;
  primeiro_nome?:   string;
  ultimo_nome?:     string;
  empresa_nome?:    string;
  empresa_dominio?: string;
  email?:           string;
  linkedin_url?:    string;
  cargo?:           string;
  ultimo_contato_em?: string;
  status_pipeline?: 'ativo' | 'nurturing' | 'cold';
  tier_pipeline?:   'ativo' | 'nurturing' | 'cold';

  // 🆕 v1.1 (17/06/2026 — Sub-fase 3.C "Importar Lista de Leads"):
  //   Quando estes campos vêm no body, o handler cria o registro em
  //   prospect_leads ANTES de rodar a cascata.
  criar_se_nao_existir?: boolean;
  reservado_por?:        number;
  vertical?:             string;
}

interface ResultadoEtapa0 {
  decisao: 'continuar' | 'encerrar' | 'pular_etapa_1';
  motivo:  string;
}

interface ResultadoEtapa1 {
  score: 'verified' | 'probable' | 'risky' | 'invalid' | 'skipped';
  fonte: 'local' | 'hunter' | 'snovio' | 'none';
}

interface ResultadoEtapa2Consolidado {
  encontrado:      boolean;
  fonte:           'apollo' | 'gemini' | 'apollo+gemini' | 'none';
  confianca?:      'alta' | 'media' | 'baixa';
  empresa_nome?:   string;
  empresa_dominio?: string;
  cargo?:          string;
  linkedin_url?:   string;
  email?:          string;
  email_status?:   string;
  payload_apollo?: any;
  payload_gemini?: any;
}

interface ResultadoEtapa3 {
  novoEmail:   string | null;
  emailStatus: string | null;
  fonte:       'snovio' | 'apollo' | 'inferido' | 'none';
}

interface CustoLead {
  hunter: number;
  apollo: number;
  snovio: number;
  gemini: number;
}

type StatusAtualizacao =
  | 'atualizado' | 'promovido' | 'trocou_empresa'
  | 'nao_localizado' | 'opt_out'
  | 'dominio_invalido' | 'ttl_nao_atingido'
  // 🆕 v1.4 (18/06/2026 — Anti-duplicidade no INSERT preventivo)
  | 'duplicado_em_email_leads'
  | 'duplicado_em_opt_out'
  | 'duplicado_em_revalidacao';

interface ResultadoLead {
  lead_id?:           number | null;
  lead_id_novo?:      number | null;
  status_atualizacao: StatusAtualizacao;
  review_manual:      boolean;
  creditos:           CustoLead;
  duracao_ms:         number;
  // 🆕 v1.2 (Sub-fase 3.D — 17/06/2026) — Auto-promoção transferência
  /**
   * `true` se o lead foi promovido com sucesso para `email_leads`
   * (INSERT + DELETE atômico). Quando `true`, `email_lead_id` traz o
   * ID do novo registro no CRM.
   *
   * `false` (ou ausente) quando o critério não foi atendido, quando
   * o helper retornou motivo não-OK (sem_email, opt_out_lgpd,
   * lead_ja_existia, erro_*), ou quando o lead não tinha registro
   * em prospect_leads para promover.
   */
  promovido_para_email_leads?: boolean;
  /** Motivo retornado pelo helper quando não promoveu (debug/UI). */
  motivo_promocao?:            string;
  /** ID do registro em email_leads (quando promovido OU quando já existia). */
  email_lead_id?:              number;
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS GERAIS
// ──────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function dominioDoEmail(email?: string | null): string | null {
  if (!email) return null;
  const m = email.toLowerCase().match(/@([^@\s]+)$/);
  return m ? m[1] : null;
}

function extrairPrimeiroEUltimo(nomeCompleto: string): { primeiro: string; ultimo: string } {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  const filtrado = partes.filter(p => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(p.toLowerCase()));
  return {
    primeiro: filtrado[0] || '',
    ultimo:   filtrado.length > 1 ? filtrado[filtrado.length - 1] : '',
  };
}

async function dominioTemMx(dominio: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(dominio);
    return records.length > 0;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// ETAPA 0 — Triagem gratuita
// ──────────────────────────────────────────────────────────────────────

async function etapa0_triagem(lead: LeadInput, leadDb: any | null): Promise<ResultadoEtapa0> {
  // (a) Opt-out LGPD → encerra silenciosamente
  if (leadDb && leadDb.permite_revalidacao_externa === false) {
    return { decisao: 'encerrar', motivo: 'opt_out' };
  }

  // (b) TTL não atingido → bloqueia revalidação prematura
  if (leadDb && leadDb.proxima_validacao) {
    const proxima = new Date(leadDb.proxima_validacao);
    if (!isNaN(proxima.getTime()) && proxima.getTime() > Date.now()) {
      return { decisao: 'encerrar', motivo: 'ttl_nao_atingido' };
    }
  }

  // (c) Domínio do email é pessoal → pula Etapa 1 (não dá pra confirmar
  //     emprego por gmail/hotmail), vai direto pra Etapa 2
  const dominioEmail = dominioDoEmail(lead.email);
  if (dominioEmail && DOMINIOS_PESSOAIS.has(dominioEmail)) {
    return { decisao: 'pular_etapa_1', motivo: 'dominio_pessoal' };
  }

  // (d) Domínio empresa tem MX? Se não, encerra (a menos que tenha LinkedIn)
  const dominioEmpresa = lead.empresa_dominio || dominioEmail;
  if (dominioEmpresa && !DOMINIOS_PESSOAIS.has(dominioEmpresa)) {
    const temMx = await dominioTemMx(dominioEmpresa);
    if (!temMx) {
      if (lead.linkedin_url) {
        return { decisao: 'pular_etapa_1', motivo: 'mx_invalido_mas_tem_linkedin' };
      }
      return { decisao: 'encerrar', motivo: 'dominio_invalido' };
    }
  }

  return { decisao: 'continuar', motivo: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────
// ETAPA 1 — Validar email via prospect-validate-emails
// ──────────────────────────────────────────────────────────────────────

async function etapa1_validarEmail(
  lead: LeadInput
): Promise<{ resultado: ResultadoEtapa1; creditos: { hunter: number; snovio: number } }> {

  if (!lead.email) {
    return {
      resultado: { score: 'skipped', fonte: 'none' },
      creditos:  { hunter: 0, snovio: 0 },
    };
  }

  if (!PUBLIC_BASE_URL) {
    console.warn('⚠️ [revalidate/etapa1] PUBLIC_BASE_URL ausente — pulando validação');
    return {
      resultado: { score: 'risky', fonte: 'none' },
      creditos:  { hunter: 0, snovio: 0 },
    };
  }

  try {
    const res = await fetch(`${PUBLIC_BASE_URL}/api/prospect-validate-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:   lead.email,
        nome:    lead.nome_completo,
        dominio: lead.empresa_dominio,
      }),
    });
    if (!res.ok) {
      console.warn(`⚠️ [revalidate/etapa1] HTTP ${res.status} para ${lead.email}`);
      return {
        resultado: { score: 'risky', fonte: 'none' },
        creditos:  { hunter: 0, snovio: 0 },
      };
    }
    const data = await res.json();
    const fonte: ResultadoEtapa1['fonte'] = (data.fonte || 'none') as any;
    const score: ResultadoEtapa1['score'] = (data.score || 'risky') as any;

    return {
      resultado: { score, fonte },
      creditos:  {
        hunter: fonte === 'hunter' ? 1 : 0,
        snovio: fonte === 'snovio' ? 1 : 0,
      },
    };
  } catch (err: any) {
    console.error(`❌ [revalidate/etapa1] ${err?.message}`);
    return {
      resultado: { score: 'risky', fonte: 'none' },
      creditos:  { hunter: 0, snovio: 0 },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// ETAPA 2 + 2-B — Apollo People Match + fallback Gemini
// ──────────────────────────────────────────────────────────────────────

async function etapa2_identidade(
  lead: LeadInput
): Promise<{ resultado: ResultadoEtapa2Consolidado; creditos: { apollo: number; gemini: number } }> {

  const { primeiro: pNome, ultimo: uNome } = extrairPrimeiroEUltimo(lead.nome_completo);

  // ─── ETAPA 2: Apollo ───
  const apollo: ApolloMatchResult = await apolloPeopleMatch({
    primeiro_nome:    lead.primeiro_nome || pNome,
    ultimo_nome:      lead.ultimo_nome   || uNome,
    nome_completo:    lead.nome_completo,
    linkedin_url:     lead.linkedin_url,
    empresa_dominio:  lead.empresa_dominio,
    empresa_nome:     lead.empresa_nome,
  });

  const creditoApollo = apollo.encontrado ? 1 : 0;

  if (apollo.encontrado) {
    return {
      resultado: {
        encontrado:      true,
        fonte:           'apollo',
        confianca:       'alta',
        empresa_nome:    apollo.empresa_nome,
        empresa_dominio: apollo.empresa_dominio,
        cargo:           apollo.cargo,
        linkedin_url:    apollo.linkedin_url,
        email:           apollo.email,
        email_status:    apollo.email_status,
        payload_apollo:  apollo.payload_raw,
      },
      creditos: { apollo: creditoApollo, gemini: 0 },
    };
  }

  // ─── ETAPA 2-B: Fallback Gemini ───
  // Pré-requisito: precisa de empresa_nome para o Gemini perguntar "ainda trabalha em X?"
  if (!lead.empresa_nome) {
    return {
      resultado: {
        encontrado:     false,
        fonte:          'none',
        payload_apollo: apollo.payload_raw,
      },
      creditos: { apollo: creditoApollo, gemini: 0 },
    };
  }

  const gemini: GeminiConfirmaResult = await geminiConfirmaEmprego({
    nome_completo:   lead.nome_completo,
    empresa_antiga:  lead.empresa_nome,
    empresa_dominio: lead.empresa_dominio,
    linkedin_url:    lead.linkedin_url,
    cargo_anterior:  lead.cargo,
  });

  if (gemini.encontrado) {
    return {
      resultado: {
        encontrado:    true,
        fonte:         'gemini',
        confianca:     gemini.confianca,
        empresa_nome:  gemini.empresa_nome,
        cargo:         gemini.cargo,
        linkedin_url:  gemini.linkedin_url,
        payload_apollo: apollo.payload_raw,
        payload_gemini: gemini.payload_raw,
      },
      creditos: { apollo: creditoApollo, gemini: 1 },
    };
  }

  // Apollo vazio + Gemini sem confirmação → nao_localizado
  return {
    resultado: {
      encontrado:     false,
      fonte:          'none',
      payload_apollo: apollo.payload_raw,
      payload_gemini: gemini.payload_raw,
    },
    creditos: { apollo: creditoApollo, gemini: 1 },
  };
}

// ──────────────────────────────────────────────────────────────────────
// MATRIZ DE DECISÃO (Seção 3.3.3 da spec)
// ──────────────────────────────────────────────────────────────────────

type Decisao = 'atualizado' | 'promovido' | 'trocou_empresa' | 'nao_localizado';

function aplicarMatrizDecisao(
  lead: LeadInput,
  etapa2: ResultadoEtapa2Consolidado
): { decisao: Decisao; review_manual: boolean } {

  if (!etapa2.encontrado) {
    return { decisao: 'nao_localizado', review_manual: false };
  }

  const cmp = compararEmpresas(
    { nome: lead.empresa_nome,    dominio: lead.empresa_dominio  },
    { nome: etapa2.empresa_nome,  dominio: etapa2.empresa_dominio }
  );

  // Compara cargo (case-insensitive, trim) — só conta se ambos não vazios
  const cargoAnterior = (lead.cargo  || '').toLowerCase().trim();
  const cargoNovo     = (etapa2.cargo || '').toLowerCase().trim();
  const cargoMudou    = !!cargoAnterior && !!cargoNovo && cargoAnterior !== cargoNovo;

  // Regra Seção 3.4.2: confiança média do Gemini → marca review_manual=true
  const reviewManualGemini   = etapa2.confianca === 'media';
  // Regra adicional: cmp por similaridade_nome (sem domínios) e iguais → também review (margem)
  const reviewManualSimilar  = cmp.metodo === 'similaridade_nome' && cmp.iguais;
  const reviewManual = reviewManualGemini || reviewManualSimilar;

  if (cmp.iguais) {
    return {
      decisao:       cargoMudou ? 'promovido' : 'atualizado',
      review_manual: reviewManual,
    };
  }

  return { decisao: 'trocou_empresa', review_manual: reviewManual };
}

// ──────────────────────────────────────────────────────────────────────
// ETAPA 3 — Re-busca de email (condicional, Seção 3.5)
// ──────────────────────────────────────────────────────────────────────

async function etapa3_reBuscarEmail(
  lead: LeadInput,
  etapa2: ResultadoEtapa2Consolidado,
  decisao: Decisao
): Promise<{ resultado: ResultadoEtapa3; creditos: { snovio: number; apollo: number } }> {

  if (!PUBLIC_BASE_URL) {
    return {
      resultado: { novoEmail: null, emailStatus: null, fonte: 'none' },
      creditos:  { snovio: 0, apollo: 0 },
    };
  }

  // Decide domínio e empresa de busca conforme cenário
  const dominioBusca =
    decisao === 'trocou_empresa' ? etapa2.empresa_dominio : lead.empresa_dominio;
  const empresaBusca =
    decisao === 'trocou_empresa' ? etapa2.empresa_nome    : lead.empresa_nome;

  if (!dominioBusca) {
    return {
      resultado: { novoEmail: null, emailStatus: null, fonte: 'none' },
      creditos:  { snovio: 0, apollo: 0 },
    };
  }

  const { primeiro: pNome, ultimo: uNome } = extrairPrimeiroEUltimo(lead.nome_completo);

  try {
    const res = await fetch(`${PUBLIC_BASE_URL}/api/prospect-email-finder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primeiro_nome:  lead.primeiro_nome || pNome,
        ultimo_nome:    lead.ultimo_nome   || uNome,
        domain:         dominioBusca,
        empresa_nome:   empresaBusca,
        fonte_original: 'apollo',
      }),
    });
    if (!res.ok) {
      console.warn(`⚠️ [revalidate/etapa3] HTTP ${res.status}`);
      return {
        resultado: { novoEmail: null, emailStatus: null, fonte: 'none' },
        creditos:  { snovio: 0, apollo: 0 },
      };
    }
    const data = await res.json();
    if (data?.success && data.email) {
      const motor = data.motor as string | undefined;
      const fonte: ResultadoEtapa3['fonte'] =
        motor === 'snovio' ? 'snovio' :
        motor === 'apollo' ? 'apollo' :
        'none';
      return {
        resultado: { novoEmail: data.email, emailStatus: data.email_status || 'unknown', fonte },
        creditos:  {
          snovio: fonte === 'snovio' ? 1 : 0,
          apollo: fonte === 'apollo' ? 1 : 0,
        },
      };
    }
    return {
      resultado: { novoEmail: null, emailStatus: null, fonte: 'none' },
      creditos:  { snovio: 0, apollo: 0 },
    };
  } catch (err: any) {
    console.error(`❌ [revalidate/etapa3] ${err?.message}`);
    return {
      resultado: { novoEmail: null, emailStatus: null, fonte: 'none' },
      creditos:  { snovio: 0, apollo: 0 },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// ETAPA 4 — Persistência (UPDATE/INSERT) + log
// ──────────────────────────────────────────────────────────────────────

async function persistir(
  leadInput: LeadInput,
  leadDb:    any | null,
  user_id:   number,
  ctx: {
    etapa0: ResultadoEtapa0;
    etapa1: ResultadoEtapa1;
    etapa2: ResultadoEtapa2Consolidado;
    etapa3?: ResultadoEtapa3;
    decisao: StatusAtualizacao;
    review_manual: boolean;
    creditos: CustoLead;
    duracao_ms: number;
  }
): Promise<ResultadoLead> {

  // Tier para próxima_validacao
  const tier: 'ativo' | 'nurturing' | 'cold' =
    leadInput.tier_pipeline ||
    leadInput.status_pipeline ||
    ((leadDb?.tier_pipeline as any) || 'cold');
  const ttlDias = TTL_POR_TIER_DIAS[tier];
  const proximaValidacao = new Date(Date.now() + ttlDias * 24 * 60 * 60 * 1000).toISOString();

  // Snapshot ANTES (preferência: banco > input)
  const snapshotAntes = {
    empresa_anterior:      leadDb?.empresa_nome    ?? leadInput.empresa_nome    ?? null,
    cargo_anterior:        leadDb?.cargo           ?? leadInput.cargo           ?? null,
    email_anterior:        leadDb?.email           ?? leadInput.email           ?? null,
    email_status_anterior: leadDb?.email_status    ?? null,
    linkedin_anterior:     leadDb?.linkedin_url    ?? leadInput.linkedin_url    ?? null,
    dominio_anterior:      leadDb?.empresa_dominio ?? leadInput.empresa_dominio ?? null,
  };

  // Valores DEPOIS (etapa2 + etapa3)
  const empresaNovo  = ctx.etapa2.empresa_nome    ?? snapshotAntes.empresa_anterior;
  const cargoNovo    = ctx.etapa2.cargo           ?? snapshotAntes.cargo_anterior;
  const linkedinNovo = ctx.etapa2.linkedin_url    ?? snapshotAntes.linkedin_anterior;
  const dominioNovo  = ctx.etapa2.empresa_dominio ?? snapshotAntes.dominio_anterior;
  const emailNovo    = ctx.etapa3?.novoEmail      ?? leadInput.email           ?? snapshotAntes.email_anterior;
  const emailStatusNovo = ctx.etapa3?.emailStatus ?? snapshotAntes.email_status_anterior;

  let leadIdNovo: number | null = null;

  // ─── PERSISTÊNCIA ─────────────────────────────────────────────
  if (leadDb && ctx.decisao === 'trocou_empresa') {
    // Caso "trocou empresa" (Seção 3.6.1):
    //   1. Cria registro NOVO em prospect_leads com os dados atualizados
    //   2. Marca o registro ANTIGO como desligado (status_atualizacao='trocou_empresa')
    const insertNovo: any = {
      buscado_por:      user_id,
      motor:            ctx.etapa2.fonte === 'gemini' ? 'gemini' : 'apollo',
      nome_completo:    leadInput.nome_completo,
      primeiro_nome:    leadInput.primeiro_nome ?? null,
      ultimo_nome:      leadInput.ultimo_nome ?? null,
      cargo:            cargoNovo,
      email:            emailNovo,
      email_status:     emailStatusNovo,
      linkedin_url:     linkedinNovo,
      empresa_nome:     empresaNovo,
      empresa_dominio:  dominioNovo,
      lead_anterior_id: leadDb.id,
      status:           'novo',
      validado_em:      new Date().toISOString(),
      proxima_validacao: proximaValidacao,
      status_atualizacao: 'trocou_empresa',
      review_manual:    ctx.review_manual,
      tier_pipeline:    tier,
      permite_revalidacao_externa: true,
    };
    const { data: inserido, error: errIns } = await supabase
      .from('prospect_leads')
      .insert(insertNovo)
      .select('id')
      .single();
    if (errIns) {
      console.error(`❌ [revalidate/persistir] INSERT novo: ${errIns.message}`);
    } else {
      leadIdNovo = inserido?.id ?? null;
    }

    // Marca o lead antigo (status_atualizacao=trocou_empresa, sem mexer nos dados)
    const { error: errUpdAnt } = await supabase
      .from('prospect_leads')
      .update({
        validado_em:        new Date().toISOString(),
        proxima_validacao:  proximaValidacao,
        status_atualizacao: 'trocou_empresa',
        review_manual:      ctx.review_manual,
        atualizado_em:      new Date().toISOString(),
      })
      .eq('id', leadDb.id);
    if (errUpdAnt) {
      console.error(`❌ [revalidate/persistir] UPDATE antigo: ${errUpdAnt.message}`);
    }

  } else if (leadDb) {
    // Casos comuns: UPDATE no registro existente
    const updateFields: any = {
      validado_em:        new Date().toISOString(),
      proxima_validacao:  proximaValidacao,
      status_atualizacao: ctx.decisao,
      review_manual:      ctx.review_manual,
      atualizado_em:      new Date().toISOString(),
      tier_pipeline:      tier,
    };

    if (ctx.decisao === 'atualizado' || ctx.decisao === 'promovido') {
      // Atualiza dados confirmados pela revalidação (somente quando vieram não-nulos)
      if (cargoNovo)       updateFields.cargo           = cargoNovo;
      if (linkedinNovo)    updateFields.linkedin_url    = linkedinNovo;
      if (emailNovo)       updateFields.email           = emailNovo;
      if (emailStatusNovo) updateFields.email_status    = emailStatusNovo;
      if (empresaNovo)     updateFields.empresa_nome    = empresaNovo;
      if (dominioNovo)     updateFields.empresa_dominio = dominioNovo;
    }

    const { error: errUpd } = await supabase
      .from('prospect_leads')
      .update(updateFields)
      .eq('id', leadDb.id);
    if (errUpd) {
      console.error(`❌ [revalidate/persistir] UPDATE: ${errUpd.message}`);
    }
  }
  // Se leadDb=null (lead externo sem ID no banco), só registramos o log de auditoria.

  // ─── INSERT no log de auditoria ─────────────────────────────
  const { error: errLog } = await supabase
    .from('prospect_revalidacao_log')
    .insert({
      lead_id:               leadDb?.id ?? null,
      lead_id_novo:          leadIdNovo,
      revalidado_por:        user_id,

      empresa_anterior:      snapshotAntes.empresa_anterior,
      cargo_anterior:        snapshotAntes.cargo_anterior,
      email_anterior:        snapshotAntes.email_anterior,
      email_status_anterior: snapshotAntes.email_status_anterior,
      linkedin_anterior:     snapshotAntes.linkedin_anterior,
      dominio_anterior:      snapshotAntes.dominio_anterior,

      empresa_novo:          empresaNovo,
      cargo_novo:            cargoNovo,
      email_novo:            emailNovo,
      email_status_novo:     emailStatusNovo,
      linkedin_novo:         linkedinNovo,
      dominio_novo:          dominioNovo,

      etapa_0_resultado:     ctx.etapa0.decisao,
      etapa_0_motivo:        ctx.etapa0.motivo,
      etapa_1_score:         ctx.etapa1.score,
      etapa_1_fonte:         ctx.etapa1.fonte,
      etapa_2_fonte:         ctx.etapa2.fonte,
      etapa_2_confianca:     ctx.etapa2.confianca ?? null,
      etapa_3_fonte:         ctx.etapa3?.fonte ?? 'none',

      decisao:               ctx.decisao,
      review_manual:         ctx.review_manual,

      creditos_hunter:       ctx.creditos.hunter,
      creditos_apollo:       ctx.creditos.apollo,
      creditos_snovio:       ctx.creditos.snovio,
      creditos_gemini:       ctx.creditos.gemini,

      duracao_ms:            ctx.duracao_ms,
      payload_apollo:        ctx.etapa2.payload_apollo ?? null,
      payload_gemini:        ctx.etapa2.payload_gemini ?? null,
    });
  if (errLog) {
    console.error(`❌ [revalidate/persistir] INSERT log: ${errLog.message}`);
  }

  return {
    lead_id:            leadDb?.id ?? null,
    lead_id_novo:       leadIdNovo,
    status_atualizacao: ctx.decisao,
    review_manual:      ctx.review_manual,
    creditos:           ctx.creditos,
    duracao_ms:         ctx.duracao_ms,
  };
}

// ──────────────────────────────────────────────────────────────────────
// PROCESSAR 1 LEAD (cascata completa)
// ──────────────────────────────────────────────────────────────────────

async function processarLead(leadInput: LeadInput, user_id: number): Promise<ResultadoLead> {
  const inicioMs = Date.now();
  const creditos: CustoLead = { hunter: 0, apollo: 0, snovio: 0, gemini: 0 };

  // Busca lead no banco quando lead_id presente
  let leadDb: any | null = null;
  if (leadInput.lead_id) {
    const { data } = await supabase
      .from('prospect_leads')
      .select('*')
      .eq('id', leadInput.lead_id)
      .maybeSingle();
    leadDb = data;
  }

  // 🆕 v1.1 (17/06/2026 — Sub-fase 3.C "Importar Lista de Leads"):
  //   Se chegou SEM lead_id mas COM a flag de criação E temos info mínima,
  //   INSERIMOS o lead em prospect_leads e usamos o ID resultante para o
  //   resto do fluxo. ETAPA 4 fará UPDATE em cima desse mesmo ID com o
  //   resultado da cascata (validado_em, proxima_validacao, etc.).
  //   Requer migration 2026-06-17_prospect_leads_motor_importacao.sql
  //   aplicada (adiciona 'importacao_lista' ao CHECK constraint de `motor`).
  if (!leadDb && !leadInput.lead_id && leadInput.criar_se_nao_existir === true) {

    // 🆕 v1.4 (18/06/2026) — ANTI-DUPLICIDADE NO INSERT PREVENTIVO
    //   Defesa em profundidade: frontend (ImportarListaLeadsModal v1.1) já
    //   bloqueia duplicatas na pré-visualização via /verificar_duplicidade,
    //   mas aqui validamos novamente para cobrir:
    //     - race condition (2 GCs importando o mesmo email simultaneamente)
    //     - payload manipulado (chamada direta ao endpoint)
    //
    //   Prioridade: opt_out > email_leads > prospect_leads.
    //   Se duplicado, retorna curto-circuito SEM:
    //     - inserir em prospect_leads
    //     - inserir em prospect_revalidacao_log (cota NÃO é consumida)
    //     - rodar cascade (sem créditos externos)
    if (leadInput.email) {
      const emailNorm = leadInput.email.toLowerCase().trim();
      try {
        const [resOptout, resEmailLeads, resProspect] = await Promise.all([
          supabase.from('email_optout').select('email').eq('email', emailNorm).limit(1).maybeSingle(),
          supabase.from('email_leads').select('id').eq('email', emailNorm).limit(1).maybeSingle(),
          supabase.from('prospect_leads').select('id').eq('email', emailNorm).limit(1).maybeSingle(),
        ]);

        let statusDup: StatusAtualizacao | null = null;
        let motivoLog = '';
        if (resOptout.data) {
          statusDup = 'duplicado_em_opt_out';
          motivoLog = 'email já em email_optout (LGPD)';
        } else if (resEmailLeads.data) {
          statusDup = 'duplicado_em_email_leads';
          motivoLog = `email já em email_leads (id=${resEmailLeads.data.id})`;
        } else if (resProspect.data) {
          statusDup = 'duplicado_em_revalidacao';
          motivoLog = `email já em prospect_leads (id=${resProspect.data.id})`;
        }

        if (statusDup) {
          console.log(
            `🚫 [revalidate/anti-dup] lead "${leadInput.nome_completo}" ` +
            `<${emailNorm}> bloqueado: ${motivoLog}. Sem INSERT/log/cota.`
          );
          return {
            lead_id:            null,
            lead_id_novo:       null,
            status_atualizacao: statusDup,
            review_manual:      false,
            creditos,
            duracao_ms:         Date.now() - inicioMs,
          };
        }
      } catch (err: any) {
        // Falha de rede/Supabase: NÃO bloqueia o fluxo — segue pro INSERT
        // (defesa em profundidade tem o backend da listagem como fallback).
        console.warn(`⚠️ [revalidate/anti-dup] verificação falhou (segue ao INSERT): ${err?.message}`);
      }
    }

    const { primeiro: pNome, ultimo: uNome } = extrairPrimeiroEUltimo(leadInput.nome_completo);
    const insertNovo: any = {
      buscado_por:     user_id,
      reservado_por:   leadInput.reservado_por ?? user_id,
      motor:           'importacao_lista',
      nome_completo:   leadInput.nome_completo,
      primeiro_nome:   leadInput.primeiro_nome ?? pNome ?? null,
      ultimo_nome:     leadInput.ultimo_nome   ?? uNome ?? null,
      email:           leadInput.email         ?? null,
      cargo:           leadInput.cargo         ?? null,
      linkedin_url:    leadInput.linkedin_url  ?? null,
      empresa_nome:    leadInput.empresa_nome  ?? null,
      empresa_dominio: leadInput.empresa_dominio ?? null,
      vertical:        leadInput.vertical      ?? null,
      status:          'novo',
      tier_pipeline:   leadInput.tier_pipeline ?? 'cold',
      permite_revalidacao_externa: true,
    };
    const { data: inserido, error: errIns } = await supabase
      .from('prospect_leads')
      .insert(insertNovo)
      .select('*')
      .single();
    if (errIns) {
      console.error(`❌ [revalidate/insert-novo-importacao] ${errIns.message}`);
      // Continua sem leadDb — fallback para o caminho "lead externo, só log"
    } else if (inserido) {
      console.log(`✅ [revalidate/insert-novo-importacao] lead_id=${inserido.id} reservado_por=${insertNovo.reservado_por}`);
      leadDb = inserido;
      leadInput.lead_id = inserido.id;
    }
  }

  // ── ETAPA 0
  const etapa0 = await etapa0_triagem(leadInput, leadDb);
  if (etapa0.decisao === 'encerrar') {
    const decisao: StatusAtualizacao =
      etapa0.motivo === 'opt_out'           ? 'opt_out' :
      etapa0.motivo === 'ttl_nao_atingido' ? 'ttl_nao_atingido' :
      etapa0.motivo === 'dominio_invalido' ? 'dominio_invalido' :
      'nao_localizado';
    return await persistir(leadInput, leadDb, user_id, {
      etapa0,
      etapa1: { score: 'skipped', fonte: 'none' },
      etapa2: { encontrado: false, fonte: 'none' },
      decisao,
      review_manual: false,
      creditos,
      duracao_ms: Date.now() - inicioMs,
    });
  }

  // ── ETAPA 1
  let etapa1: ResultadoEtapa1 = { score: 'skipped', fonte: 'none' };
  if (etapa0.decisao !== 'pular_etapa_1') {
    const r1 = await etapa1_validarEmail(leadInput);
    etapa1 = r1.resultado;
    creditos.hunter += r1.creditos.hunter;
    creditos.snovio += r1.creditos.snovio;
  }

  // ── ETAPA 2 + 2-B
  const r2 = await etapa2_identidade(leadInput);
  const etapa2 = r2.resultado;
  creditos.apollo += r2.creditos.apollo;
  creditos.gemini += r2.creditos.gemini;

  // ── DECISÃO
  const { decisao: decisaoBase, review_manual } = aplicarMatrizDecisao(leadInput, etapa2);

  // ── ETAPA 3 (condicional)
  let etapa3: ResultadoEtapa3 | undefined;
  if (
    decisaoBase === 'trocou_empresa' ||
    (etapa1.score === 'invalid' && decisaoBase === 'atualizado') ||
    // 🆕 v1.3 (18/06/2026) — RESGATE via Snov.io: cascade chegou em
    //   'nao_localizado' porque Hunter invalidou email inferido E
    //   Gemini não confirmou. Se temos `empresa_dominio` válido, vale
    //   tentar Snov.io/Apollo achar o email do mesmo nome no mesmo
    //   domínio (assume que a pessoa CONTINUA na empresa, só o email
    //   inferido estava errado).
    (decisaoBase === 'nao_localizado' &&
     etapa1.score === 'invalid' &&
     !!leadInput.empresa_dominio)
  ) {
    const r3 = await etapa3_reBuscarEmail(leadInput, etapa2, decisaoBase);
    etapa3 = r3.resultado;
    creditos.snovio += r3.creditos.snovio;
    creditos.apollo += r3.creditos.apollo;
  }

  // 🆕 v1.3 (18/06/2026) — REVERSÃO DE DECISÃO por resgate:
  //   Quando partimos de 'nao_localizado' e Snov.io/Apollo (Etapa 3)
  //   trouxe email com status 'verified' ou 'probable', promovemos a
  //   decisão para 'atualizado'. Persistir vai gravar o novo email no
  //   prospect_leads e a Etapa 5 (auto-promoção) avalia transferência
  //   para email_leads.
  let decisaoFinal: Decisao = decisaoBase;
  if (
    decisaoBase === 'nao_localizado' &&
    etapa3?.novoEmail &&
    (etapa3.emailStatus === 'verified' || etapa3.emailStatus === 'probable') &&
    (etapa3.fonte === 'snovio' || etapa3.fonte === 'apollo')
  ) {
    decisaoFinal = 'atualizado';
    console.log(
      `✨ [revalidate/resgate] lead_id=${leadDb?.id ?? '(externo)'} ` +
      `resgatado via ${etapa3.fonte} | email=${etapa3.novoEmail} ` +
      `status=${etapa3.emailStatus}`
    );
  }

  // ── ETAPA 4
  const resultado = await persistir(leadInput, leadDb, user_id, {
    etapa0,
    etapa1,
    etapa2,
    etapa3,
    decisao: decisaoFinal,
    review_manual,
    creditos,
    duracao_ms: Date.now() - inicioMs,
  });

  // ── ETAPA 5 (🆕 v1.2 Sub-fase 3.D — 17/06/2026) — Auto-promoção transferência
  //   prospect_leads (transitória) → email_leads (CRM).
  //   Critério: status_atualizacao='atualizado' E review_manual=false E
  //             lead presente em prospect_leads (lead_id resolvido).
  //   Comportamento: helper faz INSERT email_lead + DELETE prospect_lead
  //   atomicamente, com salvaguardas LGPD (opt_out) e idempotência (dedup
  //   por email). Se NÃO promove (qualquer motivo), o lead permanece em
  //   prospect_leads para revisão manual via Editar/Validar.
  if (
    resultado.status_atualizacao === 'atualizado' &&
    !resultado.review_manual &&
    leadDb?.id
  ) {
    try {
      // Busca o prospect com os dados PÓS-persistir (Etapa 4 acabou de
      // atualizar empresa_dominio/email/etc com o resultado da cascata).
      const { data: prospectAtual } = await supabase
        .from('prospect_leads')
        .select(`
          id, nome_completo, email, cargo, linkedin_url,
          empresa_nome, empresa_dominio, empresa_setor,
          cidade, estado, vertical, reservado_por
        `)
        .eq('id', leadDb.id)
        .maybeSingle();

      if (prospectAtual) {
        // Resolve nome do usuário (criadoPor convencional do CRM).
        const { data: user } = await supabase
          .from('app_users')
          .select('nome_usuario')
          .eq('id', user_id)
          .maybeSingle();
        const criadoPor = user?.nome_usuario || `user_${user_id}`;

        const r = await promoverParaEmailLeads({
          supabase,
          prospect: prospectAtual as any,
          criado_por: criadoPor,
        });

        resultado.promovido_para_email_leads = r.promovido;
        resultado.motivo_promocao            = r.motivo;
        if (r.email_lead_id) resultado.email_lead_id = r.email_lead_id;

        if (r.promovido) {
          console.log(`🚀 [revalidate/promocao] prospect_id=${leadDb.id} → email_lead_id=${r.email_lead_id}`);
        } else {
          console.log(`⚠️ [revalidate/promocao] prospect_id=${leadDb.id} NÃO promovido: ${r.motivo}`);
        }
      }
    } catch (err: any) {
      // Promoção é best-effort — falha não invalida a revalidação.
      console.error(`❌ [revalidate/promocao] Exceção no helper para prospect_id=${leadDb.id}: ${err?.message}`);
      resultado.promovido_para_email_leads = false;
      resultado.motivo_promocao            = 'excecao_runtime';
    }
  }

  return resultado;
}

// ──────────────────────────────────────────────────────────────────────
// COTA RESIDUAL (Seção 4.6) — apurada via COUNT no log
// ──────────────────────────────────────────────────────────────────────

/**
 * Conta validações feitas pelo gestor desde 00:00 BRT.
 * Calculado em JS porque PostgREST não suporta date_trunc com timezone diretamente
 * em SELECT count com filtro composto.
 */
async function contarValidacoesHoje(user_id: number): Promise<number> {
  const agora = new Date();
  // Converte para BRT (UTC-3), calcula início do dia, volta para UTC
  const offsetBrtMs = 3 * 60 * 60 * 1000;
  const brt = new Date(agora.getTime() - offsetBrtMs);
  const inicioBrt = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0));
  const inicioUtc = new Date(inicioBrt.getTime() + offsetBrtMs);

  const { count, error } = await supabase
    .from('prospect_revalidacao_log')
    .select('id', { count: 'exact', head: true })
    .eq('revalidado_por', user_id)
    .gte('revalidado_em', inicioUtc.toISOString());

  if (error) {
    console.error(`❌ [revalidate/cota] ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

// ──────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST.' });
  }

  const inicio = Date.now();
  const body = req.body || {};

  const modo: 'individual' | 'lote' = body.modo === 'individual' ? 'individual' : 'lote';
  const user_id: number = body.user_id;
  const leads: LeadInput[] = Array.isArray(body.leads)
    ? body.leads
    : (body.lead ? [body.lead] : []);

  // ── Validações de entrada
  if (!user_id) {
    return res.status(400).json({ success: false, error: 'user_id obrigatório' });
  }
  if (leads.length === 0) {
    return res.status(400).json({ success: false, error: '"leads" (array) ou "lead" (objeto) obrigatório' });
  }
  if (modo === 'lote' && leads.length > 50) {
    return res.status(400).json({ success: false, error: 'Máximo de 50 leads por lote' });
  }
  // Identificação mínima por lead
  for (const l of leads) {
    if (!l.nome_completo) {
      return res.status(400).json({ success: false, error: 'Lead sem "nome_completo"' });
    }
    if (!l.email && !l.linkedin_url && !l.empresa_nome) {
      return res.status(400).json({
        success: false,
        error:   `Lead "${l.nome_completo}" sem identificadores secundários (email, linkedin_url ou empresa_nome)`,
      });
    }
  }

  // ── COTA RESIDUAL (Seção 4.6)
  const cotaConsumida = await contarValidacoesHoje(user_id);
  const cotaResidual  = COTA_DIARIA_POR_GESTOR - cotaConsumida;
  if (cotaResidual <= 0) {
    return res.status(400).json({
      success: false,
      error:   'cota_esgotada',
      mensagem: `Você já validou ${cotaConsumida} leads hoje. Cota esgotada. Tente novamente amanhã às 00:00 BRT.`,
      cota_diaria:    COTA_DIARIA_POR_GESTOR,
      cota_consumida: cotaConsumida,
      cota_residual:  0,
    });
  }
  if (leads.length > cotaResidual) {
    return res.status(400).json({
      success: false,
      error:   'cota_excedida',
      mensagem: `Você já validou ${cotaConsumida} leads hoje. Esta importação tem ${leads.length} leads. Reduza para ${cotaResidual} ou tente amanhã às 00:00 BRT.`,
      cota_diaria:    COTA_DIARIA_POR_GESTOR,
      cota_consumida: cotaConsumida,
      cota_residual:  cotaResidual,
      leads_recebidos: leads.length,
    });
  }

  // ── PROCESSAMENTO SEQUENCIAL (NÃO paralelizar — respeitar rate limits)
  const resumo: Record<StatusAtualizacao, number> = {
    atualizado: 0, promovido: 0, trocou_empresa: 0,
    nao_localizado: 0, opt_out: 0, dominio_invalido: 0, ttl_nao_atingido: 0,
    // 🆕 v1.4 — anti-duplicidade (não consomem cota)
    duplicado_em_email_leads: 0,
    duplicado_em_opt_out:     0,
    duplicado_em_revalidacao: 0,
  };
  const creditosTotais: CustoLead = { hunter: 0, apollo: 0, snovio: 0, gemini: 0 };
  const idsProcessados: number[] = [];
  const detalhes: ResultadoLead[] = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      const r = await processarLead(lead, user_id);
      resumo[r.status_atualizacao]++;
      creditosTotais.hunter += r.creditos.hunter;
      creditosTotais.apollo += r.creditos.apollo;
      creditosTotais.snovio += r.creditos.snovio;
      creditosTotais.gemini += r.creditos.gemini;
      if (r.lead_id)      idsProcessados.push(r.lead_id);
      if (r.lead_id_novo) idsProcessados.push(r.lead_id_novo);
      detalhes.push(r);

      // Delay anti rate-limit apenas quando houve chamada externa (Seção 4.7 da spec)
      const teveChamadaExterna =
        r.creditos.hunter + r.creditos.apollo + r.creditos.snovio + r.creditos.gemini > 0;
      if (teveChamadaExterna && i < leads.length - 1) {
        await delay(DELAY_ANTI_RATE_LIMIT_MS);
      }
    } catch (err: any) {
      console.error(`❌ [revalidate] Lead "${lead.nome_completo}": ${err?.message}`);
      // Não interrompe o lote (Seção 4.7)
    }
  }

  const duracaoMs = Date.now() - inicio;

  console.log(
    `✅ [revalidate] user=${user_id} total=${leads.length} ` +
    `ok=${resumo.atualizado} promovido=${resumo.promovido} trocou=${resumo.trocou_empresa} ` +
    `perdido=${resumo.nao_localizado} optout=${resumo.opt_out} ` +
    `dom_inv=${resumo.dominio_invalido} ttl=${resumo.ttl_nao_atingido} ` +
    // 🆕 v1.4 — contadores de duplicidade (não consomem cota)
    `dup_crm=${resumo.duplicado_em_email_leads} ` +
    `dup_optout=${resumo.duplicado_em_opt_out} ` +
    `dup_reval=${resumo.duplicado_em_revalidacao} ` +
    `creditos=H${creditosTotais.hunter}/A${creditosTotais.apollo}/S${creditosTotais.snovio}/G${creditosTotais.gemini} ` +
    `dur=${duracaoMs}ms`
  );

  return res.status(200).json({
    success:             true,
    user_id,
    cota_consumida_hoje: cotaConsumida + leads.length,
    cota_residual:       Math.max(0, cotaResidual - leads.length),
    resumo,
    creditos_gastos:     creditosTotais,
    ids_processados:     idsProcessados,
    detalhes:            modo === 'individual' ? detalhes : undefined,
    duracao_ms:          duracaoMs,
  });
}
